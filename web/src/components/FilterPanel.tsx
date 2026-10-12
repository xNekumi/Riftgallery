import { useMemo, useState } from 'react';
import type { Card, CardSet } from '../types';
import { DOMAINS, RARITIES, SUPERTYPES, TYPES, VARIANTS } from '../lib/cards';
import { DEFAULT_FILTERS, OWNERSHIP_OPTIONS, type Filters } from '../lib/filters';
import { ChipGroup } from './ui';

const COSTS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const costLabel = (n: number) => (n === 8 ? '8+' : String(n));

interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
  cards: Card[];
  sets: CardSet[];
  onClose: () => void;
  resultCount: number;
}

export function FilterPanel({ filters: f, onChange, cards, sets, onClose, resultCount }: Props) {
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...f, [k]: v });
  const [tagInput, setTagInput] = useState('');

  const { keywords, tags, artists } = useMemo(() => {
    const kw = new Set<string>();
    const tg = new Set<string>();
    const ar = new Set<string>();
    for (const c of cards) {
      c.keywords.forEach((k) => kw.add(k));
      c.tags.forEach((t) => tg.add(t));
      if (c.artist) ar.add(c.artist);
    }
    const sort = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b));
    return { keywords: sort(kw), tags: sort(tg), artists: sort(ar) };
  }, [cards]);

  const addTag = (t: string) => {
    const match = tags.find((x) => x.toLowerCase() === t.trim().toLowerCase());
    if (match && !f.tags.includes(match)) set('tags', [...f.tags, match]);
    setTagInput('');
  };

  return (
    <aside className="filter-panel" aria-label="Filters">
      <div className="filter-head">
        <h2>Filters</h2>
        <button className="btn ghost small" onClick={() => onChange({ ...DEFAULT_FILTERS, q: f.q, sort: f.sort, desc: f.desc })}>
          Reset
        </button>
        <button className="btn small" onClick={onClose}>
          Show {resultCount}
        </button>
      </div>

      <section>
        <h3>Collection</h3>
        <select value={f.ownership} onChange={(e) => set('ownership', e.target.value as Filters['ownership'])}>
          {OWNERSHIP_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </section>

      <section>
        <h3>Set</h3>
        <ChipGroup
          options={sets.map((s) => s.id)}
          selected={f.sets}
          onChange={(v) => set('sets', v)}
          render={(id) => (
            <span title={sets.find((s) => s.id === id)?.name}>
              {id} <small>{sets.find((s) => s.id === id)?.name}</small>
            </span>
          )}
        />
      </section>

      <section>
        <h3>
          Domain
          <span className="seg">
            <button className={f.domainMode === 'any' ? 'on' : ''} onClick={() => set('domainMode', 'any')}>
              any
            </button>
            <button className={f.domainMode === 'all' ? 'on' : ''} onClick={() => set('domainMode', 'all')}>
              all
            </button>
          </span>
        </h3>
        <ChipGroup options={DOMAINS} selected={f.domains} onChange={(v) => set('domains', v)} className={(d) => `domain-chip domain-${d.toLowerCase()}`} />
      </section>

      <section>
        <h3>Type</h3>
        <ChipGroup options={TYPES} selected={f.types} onChange={(v) => set('types', v)} />
      </section>

      <section>
        <h3>Supertype</h3>
        <ChipGroup options={SUPERTYPES} selected={f.supertypes} onChange={(v) => set('supertypes', v)} />
      </section>

      <section>
        <h3>Rarity</h3>
        <ChipGroup options={RARITIES} selected={f.rarities} onChange={(v) => set('rarities', v)} className={(r) => `rarity-${r.toLowerCase()}`} />
      </section>

      <section>
        <h3>Version</h3>
        <ChipGroup
          options={VARIANTS.map((v) => v.id)}
          selected={f.variants as Card['variant'][]}
          onChange={(v) => set('variants', v)}
          render={(id) => VARIANTS.find((v) => v.id === id)?.label}
        />
      </section>

      <section>
        <h3>Energy</h3>
        <ChipGroup options={COSTS} selected={f.energy} onChange={(v) => set('energy', v)} render={costLabel} />
      </section>

      <section>
        <h3>Might</h3>
        <ChipGroup options={COSTS} selected={f.might} onChange={(v) => set('might', v)} render={costLabel} />
      </section>

      <section>
        <h3>Power</h3>
        <ChipGroup options={[1, 2, 3, 4]} selected={f.power} onChange={(v) => set('power', v)} />
      </section>

      <section>
        <h3>Keywords (all of)</h3>
        <ChipGroup options={keywords} selected={f.keywords} onChange={(v) => set('keywords', v)} />
      </section>

      <section>
        <h3>Champion / Region / Tag (any of)</h3>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            addTag(tagInput);
          }}
        >
          <input
            list="tag-list"
            value={tagInput}
            placeholder="e.g. Jinx, Piltover, Yordle"
            onChange={(e) => {
              setTagInput(e.target.value);
              if (tags.includes(e.target.value)) addTag(e.target.value);
            }}
          />
          <datalist id="tag-list">
            {tags.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </form>
        {f.tags.length > 0 && <ChipGroup options={f.tags} selected={f.tags} onChange={(v) => set('tags', v)} render={(t) => `${t} ×`} />}
      </section>

      <section>
        <h3>Artist</h3>
        <input list="artist-list" value={f.artist} placeholder="Any artist" onChange={(e) => set('artist', e.target.value)} />
        <datalist id="artist-list">
          {artists.map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
      </section>
    </aside>
  );
}
