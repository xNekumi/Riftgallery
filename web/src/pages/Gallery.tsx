import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Card } from '../types';
import { useData } from '../store';
import { CardTile } from '../components/CardTile';
import { CardModal } from '../components/CardModal';
import { FilterPanel } from '../components/FilterPanel';
import { DEFAULT_FILTERS, SORT_OPTIONS, activeFilterCount, applyFilters, buildFilterContext, type Filters } from '../lib/filters';

const STORAGE_KEY = 'rg.gallery.filters';
const SIZE_KEY = 'rg.gallery.size';

function loadFilters(): Filters {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return saved ? { ...DEFAULT_FILTERS, ...saved } : DEFAULT_FILTERS;
  } catch {
    return DEFAULT_FILTERS;
  }
}

export function Gallery() {
  const { cards, sets, owned, ownedByKey, wants, decks, user, changeCollection } = useData();
  const [filters, setFilters] = useState<Filters>(loadFilters);
  const [panelOpen, setPanelOpen] = useState(false);
  const [openCard, setOpenCard] = useState<Card | null>(null);
  const [size, setSize] = useState(() => {
    try {
      return localStorage.getItem(SIZE_KEY) || 'm';
    } catch {
      return 'm';
    }
  });
  const [search, setSearch] = useState(filters.q);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
      localStorage.setItem(SIZE_KEY, size);
    } catch {
      /* storage unavailable */
    }
  }, [filters, size]);

  // Debounce typing so filtering 1,300+ cards doesn't run on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.q === search ? f : { ...f, q: search })), 150);
    return () => clearTimeout(t);
  }, [search]);

  const ctx = useMemo(() => buildFilterContext(owned, ownedByKey, wants, decks), [owned, ownedByKey, wants, decks]);
  const results = useMemo(() => applyFilters(cards, filters, ctx), [cards, filters, ctx]);

  const groups = useMemo(() => {
    if (filters.sort !== 'number') return [{ id: '', name: '', cards: results }];
    const bySet = new Map<string, Card[]>();
    for (const c of results) {
      if (!bySet.has(c.set)) bySet.set(c.set, []);
      bySet.get(c.set)!.push(c);
    }
    const order = filters.desc ? [...sets].reverse() : sets;
    return order.filter((s) => bySet.has(s.id)).map((s) => ({ id: s.id, name: s.name, cards: bySet.get(s.id)! }));
  }, [results, filters.sort, filters.desc, sets]);

  const setStats = useMemo(() => {
    const m = new Map<string, { owned: number; total: number }>();
    for (const c of cards) {
      const s = m.get(c.set) ?? { owned: 0, total: 0 };
      s.total++;
      if (owned.get(c.id)?.total) s.owned++;
      m.set(c.set, s);
    }
    return m;
  }, [cards, owned]);

  const ownedPrintings = results.filter((c) => owned.get(c.id)?.total).length;
  const totalCopies = useMemo(() => [...owned.values()].reduce((s, o) => s + o.total, 0), [owned]);

  const index = openCard ? results.findIndex((c) => c.id === openCard.id) : -1;
  const closeModal = useCallback(() => setOpenCard(null), []);
  const nFilters = activeFilterCount(filters);

  return (
    <div className="gallery-page">
      <div className="toolbar">
        <input
          type="search"
          className="search"
          placeholder="Search name, rules text, keyword, champion…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search cards"
        />
        <button className={`btn ${nFilters ? '' : 'ghost'}`} onClick={() => setPanelOpen(true)}>
          Filters{nFilters ? ` (${nFilters})` : ''}
        </button>
        <select
          value={filters.sort}
          onChange={(e) => setFilters({ ...filters, sort: e.target.value as Filters['sort'] })}
          aria-label="Sort by"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          className="btn ghost icon"
          onClick={() => setFilters({ ...filters, desc: !filters.desc })}
          title={filters.desc ? 'Descending' : 'Ascending'}
          aria-label="Toggle sort direction"
        >
          {filters.desc ? '↓' : '↑'}
        </button>
        <div className="seg" role="group" aria-label="Card size">
          {['s', 'm', 'l'].map((s) => (
            <button key={s} className={size === s ? 'on' : ''} onClick={() => setSize(s)}>
              {s.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="summary">
        <span>
          <b>{results.length}</b> cards shown · <b>{ownedPrintings}</b> owned
        </span>
        <span className="muted">{totalCopies} copies in your collection</span>
        {(nFilters > 0 || filters.q) && (
          <button
            className="link"
            onClick={() => {
              setSearch('');
              setFilters({ ...DEFAULT_FILTERS, sort: filters.sort, desc: filters.desc });
            }}
          >
            Clear search & filters
          </button>
        )}
      </div>

      {results.length === 0 && <p className="empty">No cards match these filters.</p>}

      {groups.map((g) => (
        <section key={g.id || 'all'} className="set-group">
          {g.id && (
            <header className="set-header">
              <h2>
                {g.name} <span className="muted">({g.id})</span>
              </h2>
              <SetProgress {...(setStats.get(g.id) ?? { owned: 0, total: 0 })} />
            </header>
          )}
          <div className={`grid size-${size}`}>
            {g.cards.map((c) => (
              <CardTile
                key={c.id}
                card={c}
                owned={owned.get(c.id)}
                wanted={ctx.wantedIds.has(c.id) || ctx.wantedKeys.has(c.key)}
                inDecks={ctx.deckKeys.has(c.key)}
                language={user.defaultLanguage}
                onOpen={setOpenCard}
                onChange={changeCollection}
              />
            ))}
          </div>
        </section>
      ))}

      {panelOpen && (
        <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setPanelOpen(false)}>
          <FilterPanel
            filters={filters}
            onChange={setFilters}
            cards={cards}
            sets={sets}
            onClose={() => setPanelOpen(false)}
            resultCount={results.length}
          />
        </div>
      )}

      {openCard && (
        <CardModal
          card={openCard}
          onClose={closeModal}
          onNavigate={setOpenCard}
          prev={index > 0 ? results[index - 1] : undefined}
          next={index >= 0 && index < results.length - 1 ? results[index + 1] : undefined}
        />
      )}
    </div>
  );
}

function SetProgress({ owned, total }: { owned: number; total: number }) {
  const pct = total ? Math.round((owned / total) * 100) : 0;
  return (
    <div className="progress" title={`${owned} of ${total} versions owned`}>
      <div className="progress-bar">
        <div style={{ width: `${pct}%` }} />
      </div>
      <span>
        {owned}/{total} · {pct}%
      </span>
    </div>
  );
}
