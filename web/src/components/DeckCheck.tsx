import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Card, DeckEntry, Want } from '../types';
import { api } from '../api';
import { useData } from '../store';
import { thumbUrl } from '../lib/cards';
import { SECTION_LABELS, SECTION_ORDER, checkDeck, type ParsedLine } from '../lib/decklist';
import { CardModal } from './CardModal';

interface Props {
  entries: DeckEntry[];
  unresolved?: ParsedLine[];
  excludeDeckId?: number;
}

export function DeckCheck({ entries, unresolved = [], excludeDeckId }: Props) {
  const { ownedByKey, decks, cardsByKey, setWants, toast } = useData();
  const [includeSideboard, setIncludeSideboard] = useState(true);
  const [reserveOthers, setReserveOthers] = useState(true);
  const [openCard, setOpenCard] = useState<Card | null>(null);

  const rows = useMemo(
    () => checkDeck(entries, ownedByKey, decks, { excludeDeckId, includeSideboard }),
    [entries, ownedByKey, decks, excludeDeckId, includeSideboard],
  );
  const sectionOf = useMemo(() => {
    const m = new Map<string, DeckEntry['section']>();
    for (const e of entries) if (!m.has(e.nameKey)) m.set(e.nameKey, e.section);
    return m;
  }, [entries]);

  const missingOf = (r: (typeof rows)[number]) => (reserveOthers ? r.missingFree : r.missing);
  const totalNeed = rows.reduce((s, r) => s + r.need, 0);
  const totalMissing = rows.reduce((s, r) => s + missingOf(r), 0);
  const blockedByDecks = rows.reduce((s, r) => s + (r.missingFree - r.missing), 0);

  const addMissingToWants = async () => {
    const items = rows
      .filter((r) => missingOf(r) > 0)
      .map((r) => ({ nameKey: r.nameKey, qty: missingOf(r), priority: 2, note: '' }));
    if (!items.length) return;
    try {
      const res = await api.post<{ items: Want[] }>('/wants', { items, mode: 'max' });
      setWants(res.items);
      toast(`${items.length} card(s) added to your want list`);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const sorted = [...rows].sort(
    (a, b) =>
      SECTION_ORDER.indexOf(sectionOf.get(a.nameKey)!) - SECTION_ORDER.indexOf(sectionOf.get(b.nameKey)!) ||
      a.name.localeCompare(b.name),
  );

  return (
    <div className="deck-check">
      <div className={`check-summary ${totalMissing ? 'bad' : 'good'}`}>
        {totalMissing === 0 ? (
          <b>✔ You have every card for this deck{reserveOthers && rows.some((r) => r.reserved) ? ' (without taking any from your other decks)' : ''}.</b>
        ) : (
          <b>
            ✘ {totalMissing} of {totalNeed} cards missing
          </b>
        )}
        {reserveOthers && blockedByDecks > 0 && (
          <span className="muted">
            {' '}
            · {blockedByDecks} of those are owned but already in other decks
          </span>
        )}
      </div>

      <div className="row gap wrap options">
        <label>
          <input type="checkbox" checked={reserveOthers} onChange={(e) => setReserveOthers(e.target.checked)} /> Cards in my other
          decks are not available
        </label>
        <label>
          <input type="checkbox" checked={includeSideboard} onChange={(e) => setIncludeSideboard(e.target.checked)} /> Include
          sideboard
        </label>
        <button className="btn" onClick={addMissingToWants} disabled={!totalMissing}>
          ♥ Add missing cards to want list
        </button>
      </div>

      {unresolved.length > 0 && (
        <div className="warn">
          <b>Could not recognise {unresolved.length} line(s):</b>
          <ul>
            {unresolved.map((u) => (
              <li key={u.line}>
                Line {u.line}: <code>{u.raw}</code>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="table-wrap">
        <table className="check-table">
          <thead>
            <tr>
              <th />
              <th>Card</th>
              <th>Section</th>
              <th title="Copies the deck needs">Need</th>
              <th title="Copies you own in any version">Own</th>
              <th title="Copies used by your other saved decks">In other decks</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const card = cardsByKey.get(r.nameKey)?.[0];
              const missing = missingOf(r);
              return (
                <tr key={r.nameKey} className={missing ? 'row-missing' : 'row-ok'}>
                  <td>
                    {card && (
                      <button className="mini-thumb" onClick={() => setOpenCard(card)} aria-label={`Show ${r.name}`}>
                        <img src={thumbUrl(card)} alt="" loading="lazy" />
                      </button>
                    )}
                  </td>
                  <td>{r.name}</td>
                  <td className="muted">{SECTION_LABELS[sectionOf.get(r.nameKey)!]}</td>
                  <td>{r.need}</td>
                  <td>{r.owned}</td>
                  <td>
                    {r.reservedIn.length === 0
                      ? '–'
                      : r.reservedIn.map((x) => (
                          <span key={x.deck.id} className="deck-ref">
                            <Link to={`/decks/${x.deck.id}`}>{x.deck.name}</Link> ×{x.qty}
                          </span>
                        ))}
                  </td>
                  <td>{missing ? <span className="status bad">missing {missing}</span> : <span className="status good">✔</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {openCard && <CardModal card={openCard} onClose={() => setOpenCard(null)} onNavigate={setOpenCard} />}
    </div>
  );
}
