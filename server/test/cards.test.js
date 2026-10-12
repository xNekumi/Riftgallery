import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareCards,
  dedupe,
  displayCode,
  extractKeywords,
  finishesFor,
  nameKey,
  richToText,
  transformCard,
} from '../src/cards.js';

const raw = (over = {}) => ({
  id: 'x1',
  name: 'Jinx - Rebel',
  riftbound_id: 'ogn-202-298',
  classification: { type: 'Unit', supertype: 'Champion', rarity: 'Epic', domain: ['Fury', 'Chaos'] },
  attributes: { energy: 5, might: 5, power: 1 },
  text: { rich: '<p>[Assault 2] (+2 :rb_might: while attacking.)<br />When I attack, deal 2.</p>', plain: '[Assault 2] ...' },
  set: { set_id: 'OGN', label: 'Origins' },
  media: { image_url: 'https://example.com/a.png', artist: 'Someone' },
  tags: ['Jinx'],
  orientation: 'portrait',
  metadata: { clean_name: 'Jinx Rebel', alternate_art: false, overnumbered: false, signature: false },
  ...over,
});

test('display codes keep alt-art letters and pad numbers', () => {
  assert.equal(displayCode('ogn-030a-298', 'OGN'), 'OGN-030a/298');
  assert.equal(displayCode('ogn-301*-298', 'OGN'), 'OGN-301*/298');
  assert.equal(displayCode('ven-r02', 'VEN'), 'VEN-R02');
});

test('rich text becomes lines with icon tokens kept', () => {
  assert.equal(richToText('<p>A &gt; B<br />C</p><ul><li>one</li></ul>'), 'A > B\nC\n• one');
});

test('keywords drop numbers and non-keywords', () => {
  assert.deepEqual(extractKeywords('[Assault 2] [Action] [&gt;] [Add] [Deflect]'), ['Action', 'Assault', 'Deflect']);
});

test('finishes: C/U/R in normal and foil, Epic and special versions foil only', () => {
  assert.deepEqual(finishesFor('Common', 'base'), ['normal', 'foil']);
  assert.deepEqual(finishesFor('Rare', 'base'), ['normal', 'foil']);
  assert.deepEqual(finishesFor('Epic', 'base'), ['foil']);
  assert.deepEqual(finishesFor('Rare', 'overnumbered'), ['foil']);
});

test('transformCard', () => {
  const c = transformCard(raw());
  assert.equal(c.key, nameKey('Jinx, Rebel'));
  assert.equal(c.code, 'OGN-202/298');
  assert.deepEqual(c.keywords, ['Assault']);
  assert.equal(c.text, '[Assault 2] (+2 :rb_might: while attacking.)\nWhen I attack, deal 2.');
  const alt = transformCard(raw({ name: 'Jinx - Rebel (Alternate Art)', metadata: { alternate_art: true } }));
  assert.equal(alt.variant, 'alt');
  assert.equal(alt.baseName, 'Jinx - Rebel');
});

test('dedupe keeps the record with a clean name', () => {
  const a = raw({ id: 'old', metadata: { clean_name: null } });
  const b = raw({ id: 'new' });
  const { keep, aliases } = dedupe([a, b]);
  assert.deepEqual(keep.map((c) => c.id), ['new']);
  assert.equal(aliases.get('old'), 'new');
});

test('binder order: number, then alt art, then signature', () => {
  const order = new Map([['OGN', 0]]);
  const cards = [
    transformCard(raw({ id: 'sig', riftbound_id: 'ogn-202*-298', metadata: { signature: true } })),
    transformCard(raw({ id: 'alt', riftbound_id: 'ogn-202a-298', metadata: { alternate_art: true } })),
    transformCard(raw({ id: 'b', riftbound_id: 'ogn-202-298' })),
    transformCard(raw({ id: 'a', riftbound_id: 'ogn-030-298' })),
  ];
  cards.sort((x, y) => compareCards(x, y, order));
  assert.deepEqual(cards.map((c) => c.id), ['a', 'b', 'alt', 'sig']);
});
