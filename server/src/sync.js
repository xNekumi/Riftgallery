import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { config } from './config.js';
import { db, getMeta, setMeta } from './db.js';
import { compareCards, dedupe, finishesFor, shortHash, sortSets, transformCard } from './cards.js';
import { fetchRiotCards } from './riot.js';

const fullDir = path.join(config.imageDir, 'full');
const thumbDir = path.join(config.imageDir, 'thumb');
fs.mkdirSync(fullDir, { recursive: true });
fs.mkdirSync(thumbDir, { recursive: true });

export const syncState = {
  running: false,
  phase: 'idle',
  imagesDone: 0,
  imagesTotal: 0,
  lastError: null,
};

let cardsCache = null;

async function getJson(url, attempt = 1) {
  const res = await fetch(url, { headers: { 'User-Agent': config.userAgent, Accept: 'application/json' } });
  if (!res.ok) {
    if (attempt < 4 && (res.status >= 500 || res.status === 429)) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      return getJson(url, attempt + 1);
    }
    throw new Error(`${url} -> HTTP ${res.status}`);
  }
  return res.json();
}

async function fetchAll(endpoint) {
  const items = [];
  for (let page = 1; ; page++) {
    const data = await getJson(`${config.apiBase}${endpoint}?size=100&page=${page}`);
    items.push(...data.items);
    if (page >= (data.pages || 1)) break;
  }
  return items;
}

/** Card list sent to the browser, cached in memory until the next sync. */
export function getCardsPayload() {
  if (cardsCache) return cardsCache;
  const sets = db
    .prepare('SELECT data FROM sets')
    .all()
    .map((r) => JSON.parse(r.data));
  const rows = db.prepare('SELECT id, data, image_version FROM cards WHERE active = 1').all();
  const setOrder = new Map(sortSets(sets).map((s, i) => [s.set_id, i]));
  const cards = rows.map((r) => {
    const card = JSON.parse(r.data);
    // Recomputed here so a changed foil rule applies without waiting for the next sync.
    return { ...card, finishes: finishesFor(card.rarity, card.variant), img: r.image_version || null };
  });
  cards.sort((a, b) => compareCards(a, b, setOrder));
  cards.forEach((c, i) => (c.order = i));
  const setsOut = sortSets(sets).map((s) => ({
    id: s.set_id,
    name: s.name,
    releasedOn: s.published_on || null,
    cardCount: cards.filter((c) => c.set === s.set_id).length,
  }));
  const version = getMeta('cards_version') || '0';
  cardsCache = { version, syncedAt: getMeta('last_sync'), sets: setsOut, cards };
  return cardsCache;
}

/**
 * Moves copies stored in a finish a card does not exist in (e.g. "normal" for a foil-only Rare)
 * to the finish it does exist in, so no copies get hidden when the foil rule changes.
 */
export function normalizeFinishes() {
  const rows = db.prepare('SELECT id, data FROM cards').all();
  const move = db.prepare(`
    INSERT INTO collection (user_id, card_id, finish, language, qty, updated_at)
      SELECT user_id, card_id, ?, language, qty, updated_at FROM collection WHERE card_id = ? AND finish = ?
    ON CONFLICT(user_id, card_id, finish, language) DO UPDATE SET qty = qty + excluded.qty
  `);
  const drop = db.prepare('DELETE FROM collection WHERE card_id = ? AND finish = ?');
  const fixWants = db.prepare("UPDATE wants SET finish = 'any' WHERE card_id = ? AND finish = ?");
  let moved = 0;
  db.transaction(() => {
    for (const r of rows) {
      const card = JSON.parse(r.data);
      const finishes = finishesFor(card.rarity, card.variant);
      for (const wrong of ['normal', 'foil'].filter((f) => !finishes.includes(f))) {
        moved += move.run(finishes[0], r.id, wrong).changes;
        drop.run(r.id, wrong);
        fixWants.run(r.id, wrong);
      }
    }
  })();
  if (moved) console.log(`[sync] moved ${moved} collection entries to the card's only finish`);
}

export function cardExists(id) {
  return !!db.prepare('SELECT 1 FROM cards WHERE id = ?').get(id);
}

async function downloadImage(card) {
  const res = await fetch(card.remoteImage, { headers: { 'User-Agent': config.userAgent } });
  if (!res.ok) throw new Error(`image ${card.id} -> HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await sharp(buf).resize({ width: card.landscape ? 1039 : 744, withoutEnlargement: true }).webp({ quality: 82 }).toFile(
    path.join(fullDir, `${card.id}.webp`),
  );
  // Thumbnails are always portrait so the gallery grid stays uniform; battlefields are turned sideways.
  let thumb = sharp(buf);
  if (card.landscape) thumb = thumb.rotate(90);
  await thumb.resize({ width: 372 }).webp({ quality: 76 }).toFile(path.join(thumbDir, `${card.id}.webp`));
}

async function syncImages() {
  const rows = db.prepare('SELECT id, data, image_url, image_version FROM cards WHERE active = 1').all();
  const todo = rows
    .filter((r) => {
      const wanted = shortHash(r.image_url);
      return r.image_version !== wanted || !fs.existsSync(path.join(thumbDir, `${r.id}.webp`));
    })
    .slice(0, config.imageLimit);
  syncState.phase = 'images';
  syncState.imagesDone = 0;
  syncState.imagesTotal = todo.length;
  const setVersion = db.prepare('UPDATE cards SET image_version = ? WHERE id = ?');
  let failures = 0;
  const queue = [...todo];
  const worker = async () => {
    while (queue.length) {
      const row = queue.shift();
      const card = JSON.parse(row.data);
      try {
        await downloadImage(card);
        setVersion.run(shortHash(row.image_url), row.id);
      } catch (err) {
        failures++;
        console.warn(`[sync] ${err.message}`);
      }
      syncState.imagesDone++;
    }
  };
  await Promise.all(Array.from({ length: config.imageConcurrency }, worker));
  cardsCache = null;
  return failures;
}

export async function runSync({ reason = 'manual' } = {}) {
  if (syncState.running) return false;
  syncState.running = true;
  syncState.lastError = null;
  const started = Date.now();
  console.log(`[sync] starting (${reason})`);
  try {
    syncState.phase = 'cards';
    const [rawSets, codexCards, riotCards] = await Promise.all([
      fetchAll('/sets'),
      fetchAll('/cards'),
      config.riotGalleryUrl
        ? fetchRiotCards().catch((err) => {
            console.warn(`[sync] Riot card gallery unavailable: ${err.message}`);
            return null;
          })
        : Promise.resolve([]),
    ]);
    if (!codexCards.length) throw new Error('API returned no cards');

    // Sets Riftcodex does not have yet come from Riot's gallery. Once a set is taken from Riot it stays
    // with Riot, so card ids (and everyone's collection entries) do not change when Riftcodex catches up.
    const codexSetIds = new Set([...rawSets.map((s) => s.set_id), ...codexCards.map((c) => c.set?.set_id)]);
    const riotSetIds = new Set(JSON.parse(getMeta('riot_sets') || '[]'));
    for (const c of riotCards ?? []) if (!codexSetIds.has(c.set.set_id)) riotSetIds.add(c.set.set_id);
    const rawCards = [
      ...codexCards.filter((c) => !riotSetIds.has(c.set?.set_id)),
      ...(riotCards ?? []).filter((c) => riotSetIds.has(c.set.set_id)),
    ];
    const riotSets = [...riotSetIds].map((id) => {
      const cards = (riotCards ?? []).filter((c) => c.set.set_id === id);
      const known = db.prepare('SELECT data FROM sets WHERE set_id = ?').get(id);
      const prev = known ? JSON.parse(known.data) : {};
      return {
        set_id: id,
        name: cards[0]?.set.label ?? prev.name ?? id,
        card_count: cards.length || prev.card_count || 0,
        // Riot's gallery has no release date; the first time we saw the set keeps it sorted as the newest.
        published_on: prev.published_on ?? new Date().toISOString(),
        source: 'riot',
      };
    });
    const { keep, aliases } = dedupe(rawCards);

    db.transaction(() => {
      const upsertSet = db.prepare(
        'INSERT INTO sets (set_id, data) VALUES (?, ?) ON CONFLICT(set_id) DO UPDATE SET data = excluded.data',
      );
      for (const s of rawSets) if (!riotSetIds.has(s.set_id)) upsertSet.run(s.set_id, JSON.stringify(s));
      for (const s of riotSets) upsertSet.run(s.set_id, JSON.stringify(s));
      setMeta('riot_sets', JSON.stringify([...riotSetIds]));

      // If Riot could not be reached, keep its cards as they are instead of hiding them.
      db.prepare(riotCards ? 'UPDATE cards SET active = 0' : "UPDATE cards SET active = 0 WHERE id NOT LIKE 'riot-%'").run();
      const upsertCard = db.prepare(`
        INSERT INTO cards (id, data, image_url, active, updated_at) VALUES (?, ?, ?, 1, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET data = excluded.data, image_url = excluded.image_url, active = 1,
          updated_at = excluded.updated_at
      `);
      for (const raw of keep) {
        const card = transformCard(raw);
        upsertCard.run(card.id, JSON.stringify(card), card.remoteImage);
      }

      // Move anything users stored on a duplicate record over to the record we kept.
      const addAlias = db.prepare(
        'INSERT INTO card_aliases (alias_id, card_id) VALUES (?, ?) ON CONFLICT(alias_id) DO UPDATE SET card_id = excluded.card_id',
      );
      const moveCollection = db.prepare(`
        INSERT INTO collection (user_id, card_id, finish, language, qty, updated_at)
          SELECT user_id, ?, finish, language, qty, updated_at FROM collection WHERE card_id = ?
        ON CONFLICT(user_id, card_id, finish, language) DO UPDATE SET qty = qty + excluded.qty
      `);
      const dropCollection = db.prepare('DELETE FROM collection WHERE card_id = ?');
      const moveWants = db.prepare('UPDATE wants SET card_id = ? WHERE card_id = ?');
      for (const [aliasId, cardId] of aliases) {
        addAlias.run(aliasId, cardId);
        moveCollection.run(cardId, aliasId);
        dropCollection.run(aliasId);
        moveWants.run(cardId, aliasId);
      }
      setMeta('cards_version', String(Date.now()));
      setMeta('last_sync', new Date().toISOString());
    })();
    cardsCache = null;
    normalizeFinishes();
    console.log(
      `[sync] ${keep.length} cards stored (${aliases.size} duplicates merged` +
        `${riotSetIds.size ? `, from Riot's gallery: ${[...riotSetIds].join(', ')}` : ''})`,
    );

    const failures = await syncImages();
    if (failures) syncState.lastError = `${failures} image(s) failed to download; they will be retried next sync.`;
    setMeta('cards_version', String(Date.now()));
    cardsCache = null;
    console.log(`[sync] done in ${Math.round((Date.now() - started) / 1000)}s`);
    return true;
  } catch (err) {
    syncState.lastError = err.message;
    console.error('[sync] failed:', err);
    return false;
  } finally {
    syncState.running = false;
    syncState.phase = 'idle';
  }
}

export function startSyncSchedule() {
  normalizeFinishes();
  const hasCards = db.prepare('SELECT COUNT(*) AS n FROM cards').get().n > 0;
  const last = getMeta('last_sync');
  const intervalMs = config.syncIntervalHours * 3600 * 1000;
  const due = !hasCards || !last || (intervalMs > 0 && Date.now() - Date.parse(last) > intervalMs);
  if (due) runSync({ reason: hasCards ? 'scheduled' : 'initial' });
  if (intervalMs > 0) {
    setInterval(() => runSync({ reason: 'scheduled' }), intervalMs).unref();
  }
}
