import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRiotId, parseGalleryHtml, riotToRaw } from '../src/riot.js';
import { transformCard } from '../src/cards.js';

const riotCard = (over = {}) => ({
  id: 'rad-038-167',
  collectorNumber: 38,
  name: 'Ahri',
  subtitle: 'Confident',
  set: { value: { id: 'RAD', label: 'Radiance' } },
  cardType: { type: [{ label: 'Unit' }], superType: [{ label: 'Champion' }] },
  rarity: { value: { label: 'Epic' } },
  domain: { values: [{ label: 'Calm' }] },
  cardImage: { url: 'https://example.com/ahri.png', accessibilityText: 'Riftbound Unit: Ahri, Confident.' },
  orientation: 'portrait',
  illustrator: { values: [{ label: 'Suzaki' }] },
  text: { richText: { body: '<p>[Disarm] Give -1 :rb_might:.</p>' } },
  energy: { value: { id: 4 } },
  might: { value: { id: 4 } },
  power: { value: { id: 1 } },
  tags: { tags: ['Ahri', 'Ionia'] },
  ...over,
});

test('Riot gallery cards become normal card records', () => {
  const c = transformCard(riotToRaw(riotCard()));
  assert.equal(c.id, 'riot-rad-038-167');
  assert.equal(c.name, 'Ahri, Confident');
  assert.equal(c.code, 'RAD-038/167');
  assert.equal(c.set, 'RAD');
  assert.equal(c.rarity, 'Epic');
  assert.deepEqual([c.energy, c.might, c.power], [4, 4, 1]);
  assert.equal(c.supertype, 'Champion');
  assert.deepEqual(c.keywords, ['Disarm']);
  assert.equal(c.variant, 'base');
});

test('variants are read from the card id', () => {
  const alt = transformCard(riotToRaw(riotCard({ id: 'rad-038a-167', rarity: { value: { label: 'Showcase' } } })));
  assert.equal(alt.variant, 'alt');
  const over = transformCard(riotToRaw(riotCard({ id: 'rad-175-167', collectorNumber: 175 })));
  assert.equal(over.variant, 'overnumbered');
  const sig = transformCard(riotToRaw(riotCard({ id: 'ven-190-star-166', collectorNumber: 190, set: { value: { id: 'VEN', label: 'Vendetta' } } })));
  assert.equal(sig.variant, 'signature');
  assert.equal(sig.code, 'VEN-190*/166');
  const sp = transformCard(riotToRaw(riotCard({ id: 'rad-sp1-005', collectorNumber: 1 })));
  assert.equal(sp.variant, 'special');
  assert.equal(sp.key, 'ahri confident');
});

test('missing types fall back to the image description, legends get the champion name', () => {
  const noType = riotToRaw(riotCard({ cardType: { type: [] }, cardImage: { url: 'x', accessibilityText: 'Riftbound Gear: Boar.' } }));
  assert.equal(noType.classification.type, 'Gear');
  const legend = riotToRaw(
    riotCard({ name: "Agony's Embrace", subtitle: undefined, cardType: { type: [{ label: 'Legend' }] }, tags: { tags: ['Evelynn'] } }),
  );
  assert.equal(legend.name, "Evelynn - Agony's Embrace");
});

test('normalizeRiotId and page parsing', () => {
  assert.equal(normalizeRiotId('VEN-190-star-166'), 'ven-190*-166');
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { page: { blades: [{}, { cards: { items: [riotCard()] } }] } } },
  })}</script>`;
  assert.equal(parseGalleryHtml(html).length, 1);
});
