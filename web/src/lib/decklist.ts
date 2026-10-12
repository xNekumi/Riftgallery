import type { Card, Deck, DeckEntry, DeckSection } from '../types';
import { nameKey } from './cards';

const SECTION_HEADERS: [RegExp, DeckSection][] = [
  [/^legends?$/, 'legend'],
  [/^(chosen )?champions?$/, 'champion'],
  [/^(main ?deck|main|deck)$/, 'main'],
  [/^battle ?fields?$/, 'battlefields'],
  [/^runes?( deck)?$/, 'runes'],
  [/^(side ?board|side ?deck|sideboard cards)$/, 'sideboard'],
  [/^(bench|planning ?zone|maybe ?board|considering)$/, 'other'],
];

export interface ParsedLine {
  line: number;
  raw: string;
  qty: number;
  name: string;
  code: string | null;
  section: DeckSection;
}

export interface ParseResult {
  entries: DeckEntry[];
  unresolved: ParsedLine[];
}

function sectionOf(line: string): DeckSection | null {
  const h = line
    .replace(/^[#/*\-\s]+/, '')
    .replace(/[:\s]*(\(\d+\)|\d+)?\s*:?\s*$/, '')
    .trim()
    .toLowerCase();
  for (const [re, section] of SECTION_HEADERS) if (re.test(h)) return section;
  return null;
}

/** Splits one deck list line into quantity, name and an optional printed code like "OGN-251". */
export function parseLine(raw: string): { qty: number; name: string; code: string | null } | null {
  let s = raw.trim().replace(/^[-*•]\s*/, '');
  if (!s) return null;
  let qty = 1;
  let m = s.match(/^(\d+)\s*[xX×]?\s+(.+)$/);
  if (m) {
    qty = Number(m[1]);
    s = m[2];
  } else if ((m = s.match(/^(.+?)\s+[xX×]\s*(\d+)$/) || s.match(/^(.+?)\s+(\d+)\s*[xX×]$/))) {
    qty = Number(m[2]);
    s = m[1];
  }
  let code: string | null = null;
  const codeRe = /[\s([]*\b([A-Za-z]{2,4}-[A-Za-z]*\d+[a-z*]?)(?:\/\d+)?[\])]*\s*$/;
  const cm = s.match(codeRe);
  if (cm) {
    code = cm[1].toUpperCase();
    s = s.slice(0, cm.index).trim();
  }
  s = s.replace(/\s*\[[^\]]*\]\s*$/, '').trim();
  if (!s && !code) return null;
  if (!Number.isFinite(qty) || qty < 1) return null;
  return { qty: Math.min(qty, 99), name: s, code };
}

function codeKey(code: string) {
  // "OGN-030A/298" -> "ogn-030a", "OGN-30" -> "ogn-30" (number compared numerically below)
  const [set, rest = ''] = code.toLowerCase().split('/')[0].split('-');
  const m = rest.match(/^([a-z]*)(\d+)([a-z*]*)$/);
  return m ? `${set}|${m[1]}|${Number(m[2])}|${m[3]}` : `${set}|${rest}`;
}

export function buildResolver(cards: Card[]) {
  const byKey = new Map<string, Card>();
  const byCode = new Map<string, Card>();
  for (const c of cards) {
    if (!byKey.has(c.key) || c.variant === 'base') byKey.set(c.key, c);
    const k = codeKey(c.code);
    if (!byCode.has(k)) byCode.set(k, c);
  }
  const keys = [...byKey.keys()];
  return (name: string, code: string | null): Card | null => {
    if (code) {
      const hit = byCode.get(codeKey(code));
      if (hit) return hit;
    }
    if (!name) return null;
    const k = nameKey(name);
    const direct = byKey.get(k);
    if (direct) return direct;
    // "Loose Cannon" for "Jinx - Loose Cannon": accept a unique match on the subtitle.
    const partial = keys.filter((key) => key.endsWith(` ${k}`) || key.startsWith(`${k} `));
    return partial.length === 1 ? byKey.get(partial[0])! : null;
  };
}

/** Parses a pasted deck list (Piltover Archive text export, TCG Arena or a plain "3 Card Name" list). */
export function parseDeckList(text: string, cards: Card[]): ParseResult {
  const resolve = buildResolver(cards);
  let section: DeckSection = 'main';
  const merged = new Map<string, DeckEntry>();
  const unresolved: ParsedLine[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    let line = raw.trim();
    if (!line || /^\/\//.test(line)) return;
    if (!/^\d/.test(line)) {
      // "Legend: Jinx, Loose Cannon" puts the header and the card on one line.
      const inline = line.match(/^([A-Za-z ]+):\s*(.+)$/);
      const header = inline ? sectionOf(inline[1]) : sectionOf(line);
      if (header) {
        section = header;
        if (!inline || /^\(?\d+\)?$/.test(inline[2].trim())) return;
        line = inline[2];
      }
    }
    const parsed = parseLine(line);
    if (!parsed) return;
    const card = resolve(parsed.name, parsed.code);
    if (!card) {
      unresolved.push({ line: i + 1, raw: line, section, ...parsed });
      return;
    }
    const k = `${section}|${card.key}`;
    const existing = merged.get(k);
    if (existing) existing.qty += parsed.qty;
    else merged.set(k, { nameKey: card.key, name: card.baseName, qty: parsed.qty, section });
  });
  return { entries: [...merged.values()], unresolved };
}

export const SECTION_LABELS: Record<DeckSection, string> = {
  legend: 'Legend',
  champion: 'Chosen Champion',
  main: 'Main Deck',
  battlefields: 'Battlefields',
  runes: 'Runes',
  sideboard: 'Sideboard',
  other: 'Other',
};

export const SECTION_ORDER: DeckSection[] = ['legend', 'champion', 'main', 'battlefields', 'runes', 'sideboard', 'other'];

export interface DeckCheckRow {
  nameKey: string;
  name: string;
  need: number;
  owned: number;
  /** Copies already locked into other saved decks. */
  reserved: number;
  reservedIn: { deck: Deck; qty: number }[];
  /** Copies owned and not used by another deck. */
  available: number;
  /** Copies you do not own at all. */
  missing: number;
  /** Copies you'd still need if other decks keep theirs. */
  missingFree: number;
}

/** Total copies needed per card, summed over all sections. */
export function needsByKey(entries: DeckEntry[], includeSideboard = true): Map<string, { name: string; qty: number }> {
  const out = new Map<string, { name: string; qty: number }>();
  for (const e of entries) {
    if (!includeSideboard && (e.section === 'sideboard' || e.section === 'other')) continue;
    const cur = out.get(e.nameKey);
    if (cur) cur.qty += e.qty;
    else out.set(e.nameKey, { name: e.name, qty: e.qty });
  }
  return out;
}

export function checkDeck(
  entries: DeckEntry[],
  ownedByKey: Map<string, number>,
  decks: Deck[],
  opts: { excludeDeckId?: number; includeSideboard?: boolean } = {},
): DeckCheckRow[] {
  const includeSideboard = opts.includeSideboard ?? true;
  const needs = needsByKey(entries, includeSideboard);
  const otherDecks = decks
    .filter((d) => d.id !== opts.excludeDeckId)
    .map((d) => ({ deck: d, needs: needsByKey(d.entries, includeSideboard) }));
  const rows: DeckCheckRow[] = [];
  for (const [key, { name, qty }] of needs) {
    const owned = ownedByKey.get(key) ?? 0;
    const reservedIn = otherDecks
      .filter((d) => d.needs.has(key))
      .map((d) => ({ deck: d.deck, qty: d.needs.get(key)!.qty }));
    const reserved = reservedIn.reduce((s, r) => s + r.qty, 0);
    const available = Math.max(0, owned - reserved);
    rows.push({
      nameKey: key,
      name,
      need: qty,
      owned,
      reserved,
      reservedIn,
      available,
      missing: Math.max(0, qty - owned),
      missingFree: Math.max(0, qty - available),
    });
  }
  return rows;
}
