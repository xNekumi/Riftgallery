import type { Card, Deck, Want } from '../types';
import type { Owned } from '../store';
import { rarityRank, searchText } from './cards';

export type Ownership = 'all' | 'owned' | 'missing' | 'foil' | 'missingFoil' | 'extras' | 'wanted' | 'inDeck';

export const OWNERSHIP_OPTIONS: { id: Ownership; label: string }[] = [
  { id: 'all', label: 'All cards' },
  { id: 'owned', label: 'Owned' },
  { id: 'missing', label: 'Missing' },
  { id: 'foil', label: 'Owned as foil' },
  { id: 'missingFoil', label: 'Missing foil' },
  { id: 'extras', label: 'Tradeable (more than 3 copies)' },
  { id: 'wanted', label: 'On my want list' },
  { id: 'inDeck', label: 'Used in a saved deck' },
];

export type SortKey = 'number' | 'name' | 'energy' | 'might' | 'rarity' | 'owned';

export const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: 'number', label: 'Set & number' },
  { id: 'name', label: 'Name' },
  { id: 'energy', label: 'Energy cost' },
  { id: 'might', label: 'Might' },
  { id: 'rarity', label: 'Rarity' },
  { id: 'owned', label: 'Copies owned' },
];

export interface Filters {
  q: string;
  sets: string[];
  domains: string[];
  domainMode: 'any' | 'all';
  types: string[];
  supertypes: string[];
  rarities: string[];
  variants: string[];
  keywords: string[];
  tags: string[];
  energy: number[];
  might: number[];
  power: number[];
  artist: string;
  ownership: Ownership;
  sort: SortKey;
  desc: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  q: '',
  sets: [],
  domains: [],
  domainMode: 'any',
  types: [],
  supertypes: [],
  rarities: [],
  variants: [],
  keywords: [],
  tags: [],
  energy: [],
  might: [],
  power: [],
  artist: '',
  ownership: 'all',
  sort: 'number',
  desc: false,
};

/** Number of active filters, for the badge on the filter button (search and sorting excluded). */
export function activeFilterCount(f: Filters): number {
  const lists = [f.sets, f.domains, f.types, f.supertypes, f.rarities, f.variants, f.keywords, f.tags, f.energy, f.might, f.power];
  return lists.filter((l) => l.length).length + (f.artist ? 1 : 0) + (f.ownership !== 'all' ? 1 : 0);
}

export interface FilterContext {
  owned: Map<string, Owned>;
  ownedByKey: Map<string, number>;
  wantedIds: Set<string>;
  wantedKeys: Set<string>;
  deckKeys: Set<string>;
}

export function buildFilterContext(owned: Map<string, Owned>, ownedByKey: Map<string, number>, wants: Want[], decks: Deck[]): FilterContext {
  const wantedIds = new Set<string>();
  const wantedKeys = new Set<string>();
  for (const w of wants) {
    if (w.cardId) wantedIds.add(w.cardId);
    else wantedKeys.add(w.nameKey);
  }
  const deckKeys = new Set(decks.flatMap((d) => d.entries.map((e) => e.nameKey)));
  return { owned, ownedByKey, wantedIds, wantedKeys, deckKeys };
}

const searchCache = new WeakMap<Card, string>();
function textOf(card: Card) {
  let t = searchCache.get(card);
  if (t === undefined) searchCache.set(card, (t = searchText(card)));
  return t;
}

/** Splits a search into terms; "quoted phrases" stay together. */
export function searchTerms(q: string): string[] {
  const terms: string[] = [];
  for (const m of q.toLowerCase().matchAll(/"([^"]+)"|(\S+)/g)) terms.push((m[1] ?? m[2]).trim());
  return terms.filter(Boolean);
}

export function applyFilters(cards: Card[], f: Filters, ctx: FilterContext): Card[] {
  const terms = searchTerms(f.q);
  const artist = f.artist.trim().toLowerCase();
  const out = cards.filter((c) => {
    if (f.sets.length && !f.sets.includes(c.set)) return false;
    if (f.domains.length) {
      const hit = f.domainMode === 'all' ? f.domains.every((d) => c.domains.includes(d)) : f.domains.some((d) => c.domains.includes(d));
      if (!hit) return false;
    }
    if (f.types.length && !f.types.includes(c.type)) return false;
    if (f.supertypes.length && !(c.supertype && f.supertypes.includes(c.supertype))) return false;
    if (f.rarities.length && !f.rarities.includes(c.rarity)) return false;
    if (f.variants.length && !f.variants.includes(c.variant)) return false;
    if (f.keywords.length && !f.keywords.every((k) => c.keywords.includes(k))) return false;
    if (f.tags.length && !f.tags.some((t) => c.tags.includes(t))) return false;
    if (f.energy.length && (c.energy === null || !f.energy.includes(Math.min(c.energy, 8)))) return false;
    if (f.might.length && (c.might === null || !f.might.includes(Math.min(c.might, 8)))) return false;
    if (f.power.length && (c.power === null || !f.power.includes(c.power))) return false;
    if (artist && !c.artist.toLowerCase().includes(artist)) return false;
    if (f.ownership !== 'all') {
      const o = ctx.owned.get(c.id);
      switch (f.ownership) {
        case 'owned':
          if (!o?.total) return false;
          break;
        case 'missing':
          if (o?.total) return false;
          break;
        case 'foil':
          if (!o?.foil) return false;
          break;
        case 'missingFoil':
          if (o?.foil || !c.finishes.includes('foil')) return false;
          break;
        case 'extras':
          if ((ctx.ownedByKey.get(c.key) ?? 0) <= 3 || !o?.total) return false;
          break;
        case 'wanted':
          if (!ctx.wantedIds.has(c.id) && !ctx.wantedKeys.has(c.key)) return false;
          break;
        case 'inDeck':
          if (!ctx.deckKeys.has(c.key)) return false;
          break;
      }
    }
    if (terms.length) {
      const t = textOf(c);
      if (!terms.every((term) => t.includes(term))) return false;
    }
    return true;
  });

  const dir = f.desc ? -1 : 1;
  const num = (v: number | null) => (v === null ? 999 : v);
  const cmp: Record<SortKey, (a: Card, b: Card) => number> = {
    number: (a, b) => a.order - b.order,
    name: (a, b) => a.name.localeCompare(b.name),
    energy: (a, b) => num(a.energy) - num(b.energy),
    might: (a, b) => num(a.might) - num(b.might),
    rarity: (a, b) => rarityRank(a.rarity) - rarityRank(b.rarity),
    owned: (a, b) => (ctx.owned.get(a.id)?.total ?? 0) - (ctx.owned.get(b.id)?.total ?? 0),
  };
  const primary = cmp[f.sort];
  return out.sort((a, b) => dir * primary(a, b) || a.order - b.order);
}
