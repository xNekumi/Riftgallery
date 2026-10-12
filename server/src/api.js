import crypto from 'node:crypto';
import express from 'express';
import { db, getMeta } from './db.js';
import {
  clearLoginFailures,
  createSession,
  destroySession,
  hashPassword,
  loginBlocked,
  publicUser,
  recordLoginFailure,
  requireAdmin,
  requireUser,
  verifyPassword,
} from './auth.js';
import { cardExists, getCardsPayload, runSync, syncState } from './sync.js';

export const LANGUAGES = ['EN', 'DE', 'FR', 'IT', 'ES', 'PT', 'ZH', 'JA', 'KO'];
const FINISHES = ['normal', 'foil'];
const WANT_FINISHES = ['any', 'normal', 'foil'];
const MAX_QTY = 9999;

export const api = express.Router();

class BadRequest extends Error {}
const bad = (msg) => {
  throw new BadRequest(msg);
};

function str(v, name, { min = 0, max = 200 } = {}) {
  if (typeof v !== 'string') bad(`${name} must be text`);
  const s = v.trim();
  if (s.length < min || s.length > max) bad(`${name} must be ${min}-${max} characters`);
  return s;
}

function int(v, name, { min = 0, max = MAX_QTY } = {}) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) bad(`${name} must be a whole number between ${min} and ${max}`);
  return n;
}

function oneOf(v, name, list) {
  if (!list.includes(v)) bad(`${name} must be one of ${list.join(', ')}`);
  return v;
}

function validUsername(v) {
  const u = str(v, 'Username', { min: 3, max: 32 });
  if (!/^[A-Za-z0-9_.-]+$/.test(u)) bad('Username may only contain letters, numbers, _ . and -');
  return u;
}

const validPassword = (v) => str(v, 'Password', { min: 8, max: 200 });

// ---------------------------------------------------------------- auth

api.get('/auth/status', (req, res) => {
  const users = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  res.json({ needsSetup: users === 0, user: req.user ? publicUser(req.user) : null });
});

api.post('/auth/register', async (req, res) => {
  const username = validUsername(req.body.username);
  const password = validPassword(req.body.password);
  const firstUser = db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0;
  let invite = null;
  if (!firstUser) {
    if (!req.body.inviteCode) bad('An invite code is required');
    const code = str(req.body.inviteCode, 'Invite code', { max: 100 });
    invite = db.prepare('SELECT * FROM invites WHERE code = ? AND used_by IS NULL').get(code);
    if (!invite) bad('This invite code is invalid or has already been used');
  }
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) bad('That username is taken');
  const hash = await hashPassword(password);
  const user = db.transaction(() => {
    // Re-check inside the transaction so two simultaneous sign-ups cannot both become admin or share an invite.
    const isFirst = db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0;
    if (!isFirst && !invite) bad('An invite code is required');
    const info = db
      .prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)')
      .run(username, hash, isFirst ? 1 : 0);
    if (invite) {
      const used = db
        .prepare("UPDATE invites SET used_by = ?, used_at = datetime('now') WHERE code = ? AND used_by IS NULL")
        .run(info.lastInsertRowid, invite.code);
      if (!used.changes) bad('This invite code has already been used');
    }
    return db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  })();
  createSession(req, res, user.id);
  res.json({ user: publicUser(user) });
});

api.post('/auth/login', async (req, res) => {
  const username = str(req.body.username ?? '', 'Username', { max: 64 });
  const password = str(req.body.password ?? '', 'Password', { max: 200 });
  const key = `${req.ip}|${username.toLowerCase()}`;
  if (loginBlocked(key)) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    recordLoginFailure(key);
    return res.status(401).json({ error: 'Wrong username or password' });
  }
  clearLoginFailures(key);
  createSession(req, res, user.id);
  res.json({ user: publicUser(user) });
});

api.post('/auth/logout', (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- cards (public data)

api.get('/cards', (req, res) => {
  const payload = getCardsPayload();
  const etag = `"cards-${payload.version}"`;
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'no-cache');
  if (req.get('If-None-Match') === etag) return res.status(304).end();
  res.json(payload);
});

// Everything below needs a logged in user.
api.use(requireUser);

api.get('/me', (req, res) => res.json({ user: publicUser(req.user), languages: LANGUAGES }));

api.patch('/me', (req, res) => {
  if (req.body.defaultLanguage !== undefined) {
    const lang = oneOf(req.body.defaultLanguage, 'Language', LANGUAGES);
    db.prepare('UPDATE users SET default_language = ? WHERE id = ?').run(lang, req.user.id);
  }
  res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
});

api.post('/me/password', async (req, res) => {
  const current = str(req.body.currentPassword ?? '', 'Current password', { max: 200 });
  const next = validPassword(req.body.newPassword);
  if (!(await verifyPassword(current, req.user.password_hash))) bad('Current password is wrong');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(next), req.user.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- collection

const collectionRows = (userId) =>
  db
    .prepare('SELECT card_id AS cardId, finish, language, qty FROM collection WHERE user_id = ?')
    .all(userId);

api.get('/collection', (req, res) => res.json({ items: collectionRows(req.user.id) }));

function applyCollectionChange(userId, { cardId, finish, language, qty, delta }) {
  if (typeof cardId !== 'string' || !cardExists(cardId)) bad('Unknown card');
  oneOf(finish, 'Finish', FINISHES);
  oneOf(language, 'Language', LANGUAGES);
  const current =
    db
      .prepare('SELECT qty FROM collection WHERE user_id = ? AND card_id = ? AND finish = ? AND language = ?')
      .get(userId, cardId, finish, language)?.qty ?? 0;
  const next =
    delta !== undefined
      ? Math.min(MAX_QTY, Math.max(0, current + int(delta, 'Change', { min: -MAX_QTY, max: MAX_QTY })))
      : int(qty, 'Quantity');
  if (next === 0) {
    db.prepare('DELETE FROM collection WHERE user_id = ? AND card_id = ? AND finish = ? AND language = ?').run(
      userId,
      cardId,
      finish,
      language,
    );
  } else {
    db.prepare(
      `INSERT INTO collection (user_id, card_id, finish, language, qty) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, card_id, finish, language) DO UPDATE SET qty = excluded.qty, updated_at = datetime('now')`,
    ).run(userId, cardId, finish, language, next);
  }
  return { cardId, finish, language, qty: next };
}

/** Body: { changes: [{ cardId, finish, language, qty } | { cardId, finish, language, delta }] } */
api.post('/collection', (req, res) => {
  const changes = req.body.changes;
  if (!Array.isArray(changes) || changes.length === 0 || changes.length > 5000) bad('No changes given');
  const results = db.transaction(() => changes.map((c) => applyCollectionChange(req.user.id, c ?? {})))();
  res.json({ items: results });
});

// ---------------------------------------------------------------- wants

const wantRows = (userId) =>
  db
    .prepare(
      `SELECT id, name_key AS nameKey, card_id AS cardId, finish, qty, priority, note, created_at AS createdAt
       FROM wants WHERE user_id = ? ORDER BY priority, created_at`,
    )
    .all(userId);

function readWant(body, existing = {}) {
  const w = { ...existing };
  if (body.nameKey !== undefined || !existing.nameKey) w.nameKey = str(body.nameKey ?? '', 'Card', { min: 1 });
  if (body.cardId !== undefined) {
    w.cardId = body.cardId === null ? null : str(body.cardId, 'Card id');
    if (w.cardId && !cardExists(w.cardId)) bad('Unknown card');
  }
  if (body.finish !== undefined) w.finish = oneOf(body.finish, 'Finish', WANT_FINISHES);
  if (body.qty !== undefined) w.qty = int(body.qty, 'Quantity', { min: 1 });
  if (body.priority !== undefined) w.priority = int(body.priority, 'Priority', { min: 1, max: 3 });
  if (body.note !== undefined) w.note = str(body.note, 'Note', { max: 500 });
  return w;
}

api.get('/wants', (req, res) => res.json({ items: wantRows(req.user.id) }));

/**
 * Body: { items: [{ nameKey, cardId?, finish?, qty, priority?, note? }], mode?: 'add' | 'max' }
 * Entries for the same card (and same exact printing/finish) are merged instead of duplicated:
 * 'add' sums quantities, 'max' keeps the larger one (used when adding missing cards from a deck).
 */
api.post('/wants', (req, res) => {
  const items = req.body.items;
  const mode = req.body.mode === 'max' ? 'max' : 'add';
  if (!Array.isArray(items) || items.length === 0 || items.length > 500) bad('No cards given');
  db.transaction(() => {
    for (const raw of items) {
      const w = readWant(raw ?? {}, { cardId: null, finish: 'any', qty: 1, priority: 2, note: '' });
      const existing = db
        .prepare('SELECT * FROM wants WHERE user_id = ? AND name_key = ? AND card_id IS ? AND finish = ?')
        .get(req.user.id, w.nameKey, w.cardId, w.finish);
      if (existing) {
        const qty = Math.min(MAX_QTY, mode === 'max' ? Math.max(existing.qty, w.qty) : existing.qty + w.qty);
        db.prepare('UPDATE wants SET qty = ?, priority = MIN(priority, ?), note = ? WHERE id = ?').run(
          qty,
          w.priority,
          w.note || existing.note,
          existing.id,
        );
      } else {
        db.prepare(
          'INSERT INTO wants (user_id, name_key, card_id, finish, qty, priority, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ).run(req.user.id, w.nameKey, w.cardId, w.finish, w.qty, w.priority, w.note);
      }
    }
  })();
  res.json({ items: wantRows(req.user.id) });
});

api.patch('/wants/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM wants WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const w = readWant(req.body, {
    nameKey: row.name_key,
    cardId: row.card_id,
    finish: row.finish,
    qty: row.qty,
    priority: row.priority,
    note: row.note,
  });
  db.prepare('UPDATE wants SET name_key = ?, card_id = ?, finish = ?, qty = ?, priority = ?, note = ? WHERE id = ?').run(
    w.nameKey,
    w.cardId,
    w.finish,
    w.qty,
    w.priority,
    w.note,
    row.id,
  );
  res.json({ items: wantRows(req.user.id) });
});

api.delete('/wants/:id', (req, res) => {
  db.prepare('DELETE FROM wants WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ items: wantRows(req.user.id) });
});

// ---------------------------------------------------------------- decks

const SECTIONS = ['legend', 'champion', 'main', 'battlefields', 'runes', 'sideboard', 'other'];

function readEntries(entries) {
  if (!Array.isArray(entries) || entries.length > 300) bad('Deck entries are invalid');
  return entries.map((e) => ({
    nameKey: str(e?.nameKey ?? '', 'Card', { min: 1 }),
    name: str(e?.name ?? '', 'Card name', { max: 200 }),
    qty: int(e?.qty, 'Quantity', { min: 1, max: 99 }),
    section: oneOf(e?.section ?? 'main', 'Section', SECTIONS),
  }));
}

const deckOut = (d) => ({
  id: d.id,
  name: d.name,
  notes: d.notes,
  listText: d.list_text,
  entries: JSON.parse(d.entries),
  createdAt: d.created_at,
  updatedAt: d.updated_at,
});

const deckRows = (userId) =>
  db.prepare('SELECT * FROM decks WHERE user_id = ? ORDER BY name COLLATE NOCASE').all(userId).map(deckOut);

api.get('/decks', (req, res) => res.json({ items: deckRows(req.user.id) }));

api.post('/decks', (req, res) => {
  const name = str(req.body.name ?? '', 'Deck name', { min: 1, max: 100 });
  const notes = str(req.body.notes ?? '', 'Notes', { max: 2000 });
  const listText = str(req.body.listText ?? '', 'Deck list', { max: 20000 });
  const entries = readEntries(req.body.entries);
  const info = db
    .prepare('INSERT INTO decks (user_id, name, notes, list_text, entries) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, name, notes, listText, JSON.stringify(entries));
  res.json({ deck: deckOut(db.prepare('SELECT * FROM decks WHERE id = ?').get(info.lastInsertRowid)) });
});

api.put('/decks/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM decks WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const name = str(req.body.name ?? row.name, 'Deck name', { min: 1, max: 100 });
  const notes = str(req.body.notes ?? row.notes, 'Notes', { max: 2000 });
  const listText = str(req.body.listText ?? row.list_text, 'Deck list', { max: 20000 });
  const entries = req.body.entries !== undefined ? readEntries(req.body.entries) : JSON.parse(row.entries);
  db.prepare(
    "UPDATE decks SET name = ?, notes = ?, list_text = ?, entries = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(name, notes, listText, JSON.stringify(entries), row.id);
  res.json({ deck: deckOut(db.prepare('SELECT * FROM decks WHERE id = ?').get(row.id)) });
});

api.delete('/decks/:id', (req, res) => {
  db.prepare('DELETE FROM decks WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- backup

api.get('/me/export', (req, res) => {
  const data = {
    app: 'riftgallery',
    version: 1,
    exportedAt: new Date().toISOString(),
    user: req.user.username,
    collection: collectionRows(req.user.id),
    wants: wantRows(req.user.id).map(({ id, createdAt, ...w }) => w),
    decks: deckRows(req.user.id).map(({ id, createdAt, updatedAt, ...d }) => d),
  };
  res.setHeader('Content-Disposition', `attachment; filename="riftgallery-${req.user.username}.json"`);
  res.json(data);
});

/** Restores a backup made with /me/export. mode 'replace' wipes the user's data first. */
api.post('/me/import', (req, res) => {
  const data = req.body.data;
  const mode = req.body.mode === 'replace' ? 'replace' : 'merge';
  if (!data || data.app !== 'riftgallery') bad('This is not a RiftGallery backup file');
  const uid = req.user.id;
  const stats = { collection: 0, skipped: 0, wants: 0, decks: 0 };
  db.transaction(() => {
    if (mode === 'replace') {
      for (const t of ['collection', 'wants', 'decks']) db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(uid);
    }
    const alias = db.prepare('SELECT card_id FROM card_aliases WHERE alias_id = ?');
    for (const c of data.collection ?? []) {
      const cardId = alias.get(c.cardId)?.card_id ?? c.cardId;
      if (!cardExists(cardId) || !FINISHES.includes(c.finish) || !LANGUAGES.includes(c.language)) {
        stats.skipped++;
        continue;
      }
      applyCollectionChange(uid, { cardId, finish: c.finish, language: c.language, delta: int(c.qty, 'Quantity') });
      stats.collection++;
    }
    for (const w of data.wants ?? []) {
      const v = readWant(w, { cardId: null, finish: 'any', qty: 1, priority: 2, note: '' });
      if (v.cardId && !cardExists(v.cardId)) v.cardId = null;
      db.prepare(
        'INSERT INTO wants (user_id, name_key, card_id, finish, qty, priority, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(uid, v.nameKey, v.cardId, v.finish, v.qty, v.priority, v.note);
      stats.wants++;
    }
    for (const d of data.decks ?? []) {
      db.prepare('INSERT INTO decks (user_id, name, notes, list_text, entries) VALUES (?, ?, ?, ?, ?)').run(
        uid,
        str(d.name ?? 'Imported deck', 'Deck name', { min: 1, max: 100 }),
        str(d.notes ?? '', 'Notes', { max: 2000 }),
        str(d.listText ?? '', 'Deck list', { max: 20000 }),
        JSON.stringify(readEntries(d.entries ?? [])),
      );
      stats.decks++;
    }
  })();
  res.json({ ok: true, stats });
});

// ---------------------------------------------------------------- admin

api.get('/admin/overview', requireAdmin, (req, res) => {
  const users = db
    .prepare(
      `SELECT u.id, u.username, u.is_admin AS isAdmin, u.created_at AS createdAt,
        (SELECT COALESCE(SUM(qty), 0) FROM collection c WHERE c.user_id = u.id) AS cards
       FROM users u ORDER BY u.created_at`,
    )
    .all();
  const invites = db
    .prepare(
      `SELECT i.code, i.note, i.created_at AS createdAt, i.used_at AS usedAt, u.username AS usedBy
       FROM invites i LEFT JOIN users u ON u.id = i.used_by ORDER BY i.created_at DESC`,
    )
    .all();
  res.json({ users, invites, sync: { ...syncState, lastSync: getMeta('last_sync') } });
});

api.post('/admin/invites', requireAdmin, (req, res) => {
  const note = str(req.body.note ?? '', 'Note', { max: 100 });
  const code = crypto.randomBytes(6).toString('base64url');
  db.prepare('INSERT INTO invites (code, note, created_by) VALUES (?, ?, ?)').run(code, note, req.user.id);
  res.json({ code });
});

api.delete('/admin/invites/:code', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM invites WHERE code = ? AND used_by IS NULL').run(req.params.code);
  res.json({ ok: true });
});

api.delete('/admin/users/:id', requireAdmin, (req, res) => {
  if (Number(req.params.id) === req.user.id) bad('You cannot delete your own account');
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/** Sets a temporary password for a user who forgot theirs and logs them out everywhere. */
api.post('/admin/users/:id/reset-password', requireAdmin, async (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  const temp = crypto.randomBytes(9).toString('base64url');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(temp), user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  res.json({ password: temp });
});

api.post('/admin/sync', requireAdmin, (req, res) => {
  if (syncState.running) return res.json({ started: false, sync: syncState });
  runSync({ reason: `manual by ${req.user.username}` });
  res.json({ started: true });
});

// ---------------------------------------------------------------- errors

api.use((err, req, res, next) => {
  if (err instanceof BadRequest) return res.status(400).json({ error: err.message });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});
