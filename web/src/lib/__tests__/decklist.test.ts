import { describe, expect, it } from 'vitest';
import type { Card, Deck } from '../../types';
import { checkDeck, parseDeckList, parseLine } from '../decklist';
import { matchCardQuery, nameKey, versionKey } from '../cards';
import fixture from './fixture-cards.json';

const cards = fixture as Card[];

describe('nameKey', () => {
  it('ignores punctuation style, variant labels and apostrophes', () => {
    expect(nameKey('Jinx - Loose Cannon')).toBe('jinx loose cannon');
    expect(nameKey('Jinx, Loose Cannon')).toBe('jinx loose cannon');
    expect(nameKey('Jinx - Loose Cannon (Signature)')).toBe('jinx loose cannon');
    expect(nameKey("Kai'Sa, Survivor")).toBe('kaisa survivor');
  });
});

describe('parseLine', () => {
  it('reads common quantity formats', () => {
    expect(parseLine('3 Falling Star')).toEqual({ qty: 3, name: 'Falling Star', code: null });
    expect(parseLine('3x Falling Star')).toEqual({ qty: 3, name: 'Falling Star', code: null });
    expect(parseLine('Falling Star x2')).toEqual({ qty: 2, name: 'Falling Star', code: null });
    expect(parseLine('Falling Star')).toEqual({ qty: 1, name: 'Falling Star', code: null });
  });

  it('pulls out printed card codes', () => {
    expect(parseLine('1 Jinx, Loose Cannon (OGN-251)')).toEqual({ qty: 1, name: 'Jinx, Loose Cannon', code: 'OGN-251' });
    expect(parseLine('2 OGN-030a/298')).toEqual({ qty: 2, name: '', code: 'OGN-030A' });
  });
});

describe('parseDeckList', () => {
  const list = `Legend:
1 Jinx, Loose Cannon
Champion:
1 Jinx, Rebel
MainDeck:
2 Jinx, Rebel
3 Falling Star
3 Kai'Sa - Survivor
Battlefields:
1 Sandswept Tomb
Runes:
6 Fury Rune
6 Chaos Rune
Sideboard:
1 Falling Star
1 Totally Made Up Card`;

  it('assigns sections and resolves names across punctuation styles', () => {
    const { entries, unresolved } = parseDeckList(list, cards);
    const find = (key: string, section: string) => entries.find((e) => e.nameKey === key && e.section === section);
    expect(find('jinx loose cannon', 'legend')?.qty).toBe(1);
    expect(find('jinx rebel', 'champion')?.qty).toBe(1);
    expect(find('jinx rebel', 'main')?.qty).toBe(2);
    expect(find('kaisa survivor', 'main')?.qty).toBe(3);
    expect(find('fury rune', 'runes')?.qty).toBe(6);
    expect(find('falling star', 'sideboard')?.qty).toBe(1);
    expect(unresolved.map((u) => u.raw)).toEqual(['1 Totally Made Up Card']);
  });

  it('accepts headers with counts and inline legends', () => {
    const { entries } = parseDeckList('Legend: Jinx - Loose Cannon\nMain Deck (40)\n3 Falling Star', cards);
    expect(entries).toEqual([
      { nameKey: 'jinx loose cannon', name: 'Jinx - Loose Cannon', qty: 1, section: 'legend' },
      { nameKey: 'falling star', name: 'Falling Star', qty: 3, section: 'main' },
    ]);
  });

  it('checks ownership and cards reserved by other decks', () => {
    const { entries } = parseDeckList('3 Falling Star\n2 Jinx, Rebel', cards);
    const owned = new Map([
      ['falling star', 4],
      ['jinx rebel', 1],
    ]);
    const other: Deck = {
      id: 7,
      name: 'Other deck',
      notes: '',
      listText: '',
      entries: [{ nameKey: 'falling star', name: 'Falling Star', qty: 3, section: 'main' }],
      createdAt: '',
      updatedAt: '',
    };
    const rows = checkDeck(entries, owned, [other]);
    const star = rows.find((r) => r.nameKey === 'falling star')!;
    expect(star).toMatchObject({ need: 3, owned: 4, reserved: 3, available: 1, missing: 0, missingFree: 2 });
    const jinx = rows.find((r) => r.nameKey === 'jinx rebel')!;
    expect(jinx).toMatchObject({ need: 2, owned: 1, missing: 1, missingFree: 1 });
    // The deck itself never reserves its own cards.
    expect(checkDeck(other.entries, owned, [other], { excludeDeckId: 7 })[0].missingFree).toBe(0);
  });
});

describe('matchCardQuery', () => {
  const ogn = cards.filter((c) => c.set === 'OGN');
  it('finds cards by collector number, base printing first', () => {
    const hits = matchCardQuery(ogn, '202');
    expect(hits[0].code).toBe('OGN-202/298');
    expect(hits[1].code).toBe('OGN-202a/298');
    expect(matchCardQuery(ogn, '202a')[0].code).toBe('OGN-202a/298');
    expect(matchCardQuery(ogn, 'OGN-202')[0].code).toBe('OGN-202/298');
  });

  it('finds cards by name', () => {
    expect(matchCardQuery(ogn, 'loose can')[0].baseName).toBe('Jinx - Loose Cannon');
  });
});

describe('versionKey', () => {
  const byCode = (code: string) => cards.find((c) => c.code === code)!;
  it('groups alt art, overnumbered and signature versions within a set', () => {
    expect(versionKey(byCode('OGN-202a/298'))).toBe(versionKey(byCode('OGN-202/298')));
    expect(versionKey(byCode('OGN-301/298'))).toBe(versionKey(byCode('OGN-251/298')));
    expect(versionKey(byCode('OGN-301*/298'))).toBe(versionKey(byCode('OGN-251/298')));
  });
  it('keeps reprints in other sets and different cards apart', () => {
    expect(versionKey(byCode('VEN-168/166'))).not.toBe(versionKey(byCode('OGN-030/298')));
    expect(versionKey(byCode('OGN-251/298'))).not.toBe(versionKey(byCode('OGN-202/298')));
  });
});
