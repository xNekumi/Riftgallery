import { useMemo, useState } from 'react';
import type { Card, Want, WantFinish } from '../types';
import { api } from '../api';
import { useData } from '../store';
import { matchCardQuery, thumbUrl } from '../lib/cards';
import { PRIORITIES, wantTitle, wantsToText } from '../lib/wants';
import { CardModal } from '../components/CardModal';
import { Stepper } from '../components/ui';

export function Wants() {
  const { wants, setWants, cardById, cardsByKey, ownedByKey, owned, cards, toast } = useData();
  const [query, setQuery] = useState('');
  const [openCard, setOpenCard] = useState<Card | null>(null);
  const suggestions = useMemo(() => matchCardQuery(cards, query, 8), [cards, query]);

  const run = async (p: Promise<{ items: Want[] }>) => {
    try {
      setWants((await p).items);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const add = (card: Card) => {
    run(api.post('/wants', { items: [{ nameKey: card.key, qty: 1 }] }));
    setQuery('');
  };
  const update = (w: Want, patch: Partial<Want>) => run(api.patch(`/wants/${w.id}`, patch));
  const remove = (w: Want) => run(api.del(`/wants/${w.id}`));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(wantsToText(wants, cardById, cardsByKey));
      toast('Want list copied - paste it to your trade partner');
    } catch {
      toast('Copy failed - your browser blocked clipboard access');
    }
  };

  const total = wants.reduce((s, w) => s + w.qty, 0);

  return (
    <div className="page">
      <div className="row gap wrap title-row">
        <h1>Want list</h1>
        <span className="muted">
          {wants.length} entries · {total} cards
        </span>
        <button className="btn ghost small" onClick={copy} disabled={!wants.length}>
          Copy as text
        </button>
      </div>

      <div className="picker">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Add a card: type a name or number…"
          onKeyDown={(e) => e.key === 'Enter' && suggestions[0] && add(suggestions[0])}
          aria-label="Add card to want list"
        />
        {suggestions.length > 0 && (
          <ul className="suggestions">
            {suggestions.map((c) => (
              <li key={c.id}>
                <button onClick={() => add(c)}>
                  <img src={thumbUrl(c)} alt="" />
                  <span>
                    {c.baseName} <small className="muted">{c.code}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {wants.length === 0 ? (
        <p className="empty">
          Your want list is empty. Add cards here, from a card's detail view, or with “Add missing cards” when checking a deck.
        </p>
      ) : (
        <div className="want-list">
          {wants.map((w) => {
            const card = (w.cardId && cardById.get(w.cardId)) || cardsByKey.get(w.nameKey)?.[0];
            const have = w.cardId ? (owned.get(w.cardId)?.total ?? 0) : (ownedByKey.get(w.nameKey) ?? 0);
            return (
              <div key={w.id} className={`want-row prio-${w.priority}`}>
                {card && (
                  <button className="mini-thumb" onClick={() => setOpenCard(card)} aria-label="Show card">
                    <img src={thumbUrl(card)} alt="" loading="lazy" />
                  </button>
                )}
                <div className="want-main">
                  <b>{wantTitle(w, cardById, cardsByKey)}</b>
                  <span className="muted small">
                    {w.cardId && card ? card.code : 'any version'} · you own {have}
                  </span>
                  <input
                    className="note"
                    defaultValue={w.note}
                    placeholder="Note"
                    maxLength={500}
                    onBlur={(e) => e.target.value !== w.note && update(w, { note: e.target.value })}
                  />
                </div>
                <div className="want-controls">
                  <Stepper value={w.qty} min={1} onChange={(qty) => update(w, { qty })} label="Copies wanted" />
                  <select value={w.finish} onChange={(e) => update(w, { finish: e.target.value as WantFinish })} aria-label="Finish">
                    <option value="any">any finish</option>
                    <option value="normal">normal</option>
                    <option value="foil">foil</option>
                  </select>
                  <select value={w.priority} onChange={(e) => update(w, { priority: Number(e.target.value) })} aria-label="Priority">
                    {Object.entries(PRIORITIES).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <button className="btn ghost small" onClick={() => remove(w)} title="Remove from want list">
                    ✓ Got it / remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {openCard && <CardModal card={openCard} onClose={() => setOpenCard(null)} onNavigate={setOpenCard} />}
    </div>
  );
}
