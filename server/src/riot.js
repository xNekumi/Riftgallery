// Reads card data from Riot's official Riftbound card gallery. Used for sets Riftcodex does not have yet
// (e.g. a set shown before its release). Riot ships the whole gallery as JSON inside the page.
import { config } from './config.js';
import { decodeEntities, parseRiftboundId } from './cards.js';

const TYPES = ['Battlefield', 'Gear', 'Legend', 'Rune', 'Spell', 'Unit'];

function findCardList(node) {
  if (Array.isArray(node)) {
    if (node.length && node[0] && typeof node[0] === 'object' && 'collectorNumber' in node[0]) return node;
    for (const item of node) {
      const found = findCardList(item);
      if (found) return found;
    }
  } else if (node && typeof node === 'object') {
    for (const value of Object.values(node)) {
      const found = findCardList(value);
      if (found) return found;
    }
  }
  return null;
}

/** Extracts Riot's card objects from the gallery page HTML. */
export function parseGalleryHtml(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('Riot card gallery: page data not found');
  const cards = findCardList(JSON.parse(m[1]));
  if (!cards?.length) throw new Error('Riot card gallery: no cards in page data');
  return cards;
}

const label = (field) => field?.value?.label ?? null;
const num = (field) => {
  const v = field?.value?.id;
  return Number.isFinite(Number(v)) ? Number(v) : null;
};
const stripTags = (html) => decodeEntities(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ''));

/** "ven-190-star-166" -> "ven-190*-166", the format Riftcodex uses for signature versions. */
export function normalizeRiotId(id) {
  return id.toLowerCase().replace(/-star(?=-|$)/, '*');
}

function riotVariant(rid, collectorNumber) {
  const { prefix, suffix, total } = parseRiftboundId(rid);
  if (suffix === '*') return { signature: true };
  if (suffix) return { alternate_art: true };
  if (prefix === 'sp') return { label: 'Showcase' };
  if (!prefix && total && collectorNumber > Number(total)) return { overnumbered: true };
  return {};
}

/** Converts one Riot gallery card into the record shape Riftcodex uses, so the rest of the app needs no changes. */
export function riotToRaw(c) {
  const rid = normalizeRiotId(c.id);
  const variant = riotVariant(rid, c.collectorNumber);
  const accessibility = c.cardImage?.accessibilityText ?? '';
  // Some cards shown before release have no type yet; the image description starts with "Riftbound Unit: …".
  const type =
    c.cardType?.type?.[0]?.label ?? TYPES.find((t) => accessibility.startsWith(`Riftbound ${t}`)) ?? 'Unknown';
  const tags = c.tags?.tags ?? [];
  let name = c.subtitle ? `${c.name}, ${c.subtitle}` : c.name;
  // Riftcodex names legends "Champion - Title"; deck lists use that form too.
  if (type === 'Legend' && tags[0] && !name.includes(tags[0])) name = `${tags[0]} - ${name}`;
  if (variant.label) name = `${name} (${variant.label})`;
  const rich = [c.text?.richText?.body, c.effect?.richText?.body].filter(Boolean).join('');
  return {
    id: `riot-${rid}`,
    name,
    riftbound_id: rid,
    tcgplayer_id: null,
    collector_number: c.collectorNumber,
    attributes: { energy: num(c.energy), might: num(c.might), power: num(c.power) },
    classification: {
      type,
      supertype: c.cardType?.superType?.[0]?.label ?? null,
      rarity: label(c.rarity) ?? '',
      domain: (c.domain?.values ?? []).map((d) => d.label),
    },
    text: { rich, plain: stripTags(rich), flavour: null },
    set: { set_id: c.set?.value?.id, label: c.set?.value?.label },
    media: {
      image_url: c.cardImage?.url ?? '',
      artist: (c.illustrator?.values ?? []).map((a) => a.label).join(', '),
      accessibility_text: accessibility,
    },
    tags,
    orientation: c.orientation ?? 'portrait',
    metadata: {
      clean_name: name,
      alternate_art: !!variant.alternate_art,
      overnumbered: !!variant.overnumbered,
      signature: !!variant.signature,
    },
  };
}

export async function fetchRiotCards() {
  const res = await fetch(config.riotGalleryUrl, { headers: { 'User-Agent': config.userAgent } });
  if (!res.ok) throw new Error(`Riot card gallery -> HTTP ${res.status}`);
  return parseGalleryHtml(await res.text())
    .filter((c) => c?.id && c.set?.value?.id && c.cardImage?.url)
    .map(riotToRaw);
}
