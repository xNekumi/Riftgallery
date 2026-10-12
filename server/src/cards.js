// Pure helpers that turn raw Riftcodex API records into the compact card objects the web app uses.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Rich API HTML -> plain text with line breaks, keeping :rb_*: icon tokens for the client to render. */
export function richToText(rich) {
  if (!rich) return '';
  const text = rich
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|li|ul)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(text)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}

/** Icon tokens replaced by words, so "deal 3 :rb_might:" is findable as "might". */
export function tokensToWords(text) {
  return text
    .replace(/:rb_energy_(\d+):/g, '$1 energy')
    .replace(/:rb_rune_rainbow:/g, 'any rune')
    .replace(/:rb_rune_(\w+?):/g, '$1 rune')
    .replace(/:rb_(\w+?):/g, '$1');
}

/** Name without a trailing "(Alternate Art)" style variant label. */
export function baseName(name) {
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/**
 * Identity of a card across all its printings. The API mixes "Jinx - Rebel" and "Jinx, Rebel",
 * so punctuation, case and accents are ignored.
 */
export function nameKey(name) {
  return baseName(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const NOT_KEYWORDS = new Set(['>', '>>', 'add', 'no text', 'text']);

export function extractKeywords(plain) {
  const found = new Set();
  for (const m of decodeEntities(plain || '').matchAll(/\[([^\]]+)\]/g)) {
    const word = m[1].replace(/\s+\d+$/, '').trim();
    if (!word || NOT_KEYWORDS.has(word.toLowerCase()) || /^\d+$/.test(word)) continue;
    found.add(word[0].toUpperCase() + word.slice(1));
  }
  return [...found].sort();
}

/** Splits "ogn-030a-298" into its sortable parts. */
export function parseRiftboundId(rid) {
  const parts = rid.toLowerCase().split('-');
  const setCode = parts[0];
  const code = parts[1] ?? '';
  const total = parts[2] ?? '';
  const m = code.match(/^([a-z]*)(\d+)([a-z*]*)$/);
  if (!m) return { setCode, prefix: code, num: 0, suffix: '', total };
  return { setCode, prefix: m[1], num: Number(m[2]), suffix: m[3], total };
}

export function displayCode(rid, setId) {
  const { prefix, num, suffix, total } = parseRiftboundId(rid);
  const width = prefix ? 2 : 3;
  const n = `${prefix.toUpperCase()}${String(num).padStart(width, '0')}${suffix}`;
  return `${setId}-${n}${total ? `/${total}` : ''}`;
}

const PREFIX_RANK = { '': 0, sp: 1, r: 2, t: 3 };
const VARIANT_RANK = { base: 0, alt: 1, overnumbered: 2, signature: 3, special: 4 };

function suffixRank(suffix) {
  if (!suffix) return 0;
  if (suffix === '*') return 100;
  return suffix.charCodeAt(0) - 96;
}

export function variantOf(raw) {
  const md = raw.metadata || {};
  const label = raw.name.match(/\(([^)]*)\)\s*$/)?.[1] ?? '';
  if (md.signature) return { variant: 'signature', variantLabel: 'Signature' };
  if (md.overnumbered) return { variant: 'overnumbered', variantLabel: 'Overnumbered' };
  if (md.alternate_art) return { variant: 'alt', variantLabel: 'Alternate Art' };
  if (label) return { variant: 'special', variantLabel: label };
  return { variant: 'base', variantLabel: '' };
}

/** Which finishes a printing exists in. Commons, Uncommons and Rares come in normal and foil. */
export function finishesFor(rarity, variant) {
  if (variant === 'alt' || variant === 'overnumbered' || variant === 'signature') return ['foil'];
  if (rarity === 'Epic' || rarity === 'Showcase') return ['foil'];
  return ['normal', 'foil'];
}

export function shortHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function transformCard(raw) {
  const cls = raw.classification || {};
  const attrs = raw.attributes || {};
  const setId = raw.set?.set_id || raw.riftbound_id.split('-')[0].toUpperCase();
  const { variant, variantLabel } = variantOf(raw);
  const text = richToText(raw.text?.rich) || decodeEntities(raw.text?.plain || '');
  return {
    id: raw.id,
    rid: raw.riftbound_id,
    name: raw.name,
    baseName: baseName(raw.name),
    key: nameKey(raw.name),
    code: displayCode(raw.riftbound_id, setId),
    set: setId,
    setLabel: raw.set?.label || setId,
    type: cls.type || '',
    supertype: cls.supertype || null,
    rarity: cls.rarity || '',
    domains: cls.domain || [],
    energy: attrs.energy ?? null,
    might: attrs.might ?? null,
    power: attrs.power ?? null,
    text,
    flavour: raw.text?.flavour || '',
    keywords: extractKeywords(raw.text?.plain),
    tags: raw.tags || [],
    artist: raw.media?.artist || '',
    variant,
    variantLabel,
    finishes: finishesFor(cls.rarity, variant),
    landscape: raw.orientation === 'landscape',
    remoteImage: raw.media?.image_url || '',
    tcgplayerId: raw.tcgplayer_id || null,
  };
}

/**
 * The API contains some records twice (same printing, an older copy without clean_name).
 * Returns the records to keep plus a map of dropped id -> kept id.
 */
export function dedupe(rawCards) {
  const groups = new Map();
  for (const c of rawCards) {
    const k = `${c.riftbound_id}|${c.name}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  }
  const keep = [];
  const aliases = new Map();
  for (const group of groups.values()) {
    group.sort((a, b) => {
      const ac = a.metadata?.clean_name ? 1 : 0;
      const bc = b.metadata?.clean_name ? 1 : 0;
      if (ac !== bc) return bc - ac;
      return String(b.metadata?.updated_on || '').localeCompare(String(a.metadata?.updated_on || ''));
    });
    keep.push(group[0]);
    for (const dup of group.slice(1)) aliases.set(dup.id, group[0].id);
  }
  return { keep, aliases };
}

/** Orders sets by release date, larger sets first on the same date (main set before promos). */
export function sortSets(sets) {
  return [...sets].sort(
    (a, b) =>
      String(a.published_on || '').localeCompare(String(b.published_on || '')) ||
      (b.card_count || 0) - (a.card_count || 0) ||
      a.set_id.localeCompare(b.set_id),
  );
}

/** Binder order: set, then collector number, base printing before its alt arts / variants. */
export function compareCards(a, b, setOrder) {
  const sa = setOrder.get(a.set) ?? 999;
  const sb = setOrder.get(b.set) ?? 999;
  if (sa !== sb) return sa - sb;
  const pa = parseRiftboundId(a.rid);
  const pb = parseRiftboundId(b.rid);
  return (
    (PREFIX_RANK[pa.prefix] ?? 9) - (PREFIX_RANK[pb.prefix] ?? 9) ||
    pa.num - pb.num ||
    suffixRank(pa.suffix) - suffixRank(pb.suffix) ||
    VARIANT_RANK[a.variant] - VARIANT_RANK[b.variant] ||
    a.name.localeCompare(b.name)
  );
}
