import type { Card } from '../types';

export const DOMAINS = ['Fury', 'Calm', 'Mind', 'Body', 'Chaos', 'Order', 'Colorless'];
export const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Showcase', 'Promo'];
export const TYPES = ['Legend', 'Unit', 'Spell', 'Gear', 'Battlefield', 'Rune'];
export const SUPERTYPES = ['Champion', 'Signature', 'Token', 'Basic'];
export const VARIANTS: { id: Card['variant']; label: string }[] = [
  { id: 'base', label: 'Standard' },
  { id: 'alt', label: 'Alternate Art' },
  { id: 'overnumbered', label: 'Overnumbered' },
  { id: 'signature', label: 'Signature' },
  { id: 'special', label: 'Special (Metal, Starter …)' },
];

export const LANGUAGE_NAMES: Record<string, string> = {
  EN: 'English',
  DE: 'German',
  FR: 'French',
  IT: 'Italian',
  ES: 'Spanish',
  PT: 'Portuguese',
  ZH: 'Chinese',
  JA: 'Japanese',
  KO: 'Korean',
};

/** Same normalisation as the server: identity of a card across printings and punctuation styles. */
export function nameKey(name: string): string {
  return name
    .replace(/\s*\([^)]*\)\s*$/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Groups a card with its alternate versions in the same set: OGN-202, OGN-202a and OGN-202b share
 * "OGN|202", as do an overnumbered card and its signature version (OGN-301 / OGN-301*).
 */
export function versionKey(card: Card): string {
  const num = card.code.split('/')[0].split('-').slice(1).join('-');
  return `${card.set}|${num.replace(/[a-z*]+$/, '')}`;
}

export function thumbUrl(card: Card): string {
  return card.img ? `/images/thumb/${card.id}.webp?v=${card.img}` : card.remoteImage;
}

export function fullUrl(card: Card): string {
  return card.img ? `/images/full/${card.id}.webp?v=${card.img}` : card.remoteImage;
}

/** Lower-cased text a free-text search runs against. */
export function searchText(card: Card): string {
  return [
    card.name,
    card.code,
    card.text.replace(/:rb_energy_(\d+):/g, '$1 energy').replace(/:rb_(\w+?):/g, ' $1 '),
    card.keywords.join(' '),
    card.tags.join(' '),
    card.type,
    card.supertype ?? '',
    card.artist,
    card.variantLabel,
    card.flavour,
  ]
    .join(' \n ')
    .toLowerCase();
}

const RARITY_RANK = Object.fromEntries(RARITIES.map((r, i) => [r, i]));
export const rarityRank = (r: string) => RARITY_RANK[r] ?? 99;

export function cardLabel(card: Card): string {
  return card.variantLabel ? `${card.baseName} (${card.variantLabel})` : card.baseName;
}

/**
 * Matches what someone types in the booster screen: collector number ("30", "030a", "OGN-030"),
 * or part of the name.
 */
export function matchCardQuery(cards: Card[], query: string, limit = 8): Card[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const numMatch = q.match(/^(?:[a-z]{2,3}-)?([a-z]*)(\d+)([a-z*]?)$/);
  const scored: { card: Card; score: number }[] = [];
  for (const card of cards) {
    let score = 0;
    if (numMatch) {
      const [, prefix, num, suffix] = numMatch;
      const code = card.code.toLowerCase().split('/')[0].split('-')[1] ?? '';
      const m = code.match(/^([a-z]*)(\d+)([a-z*]*)$/);
      if (m && m[1] === prefix && Number(m[2]) === Number(num)) {
        score = m[3] === suffix ? 100 : suffix ? 0 : 80 - m[3].length;
      }
    }
    if (!score) {
      const name = card.name.toLowerCase();
      const words = q.split(/\s+/);
      if (name.startsWith(q)) score = 60;
      else if (words.every((w) => name.includes(w))) score = 40;
    }
    if (score > 0) scored.push({ card, score: score - (card.variant === 'base' ? 0 : 1) });
  }
  scored.sort((a, b) => b.score - a.score || a.card.order - b.card.order);
  return scored.slice(0, limit).map((s) => s.card);
}
