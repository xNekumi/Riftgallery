import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Deck } from '../types';
import { api } from '../api';
import { useData } from '../store';
import { thumbUrl } from '../lib/cards';
import { checkDeck, parseDeckList } from '../lib/decklist';
import { DeckCheck } from '../components/DeckCheck';

const PLACEHOLDER = `Paste a deck list, e.g. the "Text List" export from Piltover Archive:

Legend:
1 Jinx, Loose Cannon
Champion:
1 Jinx, Rebel
MainDeck:
3 Falling Star
...
Runes:
6 Fury Rune
Sideboard:
...`;

export function Decks() {
  const { decks, cards, setDecks, toast, ownedByKey, cardsByKey } = useData();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const parsed = useMemo(() => (text.trim() ? parseDeckList(text, cards) : null), [text, cards]);

  const save = async () => {
    if (!parsed) return;
    try {
      const res = await api.post<{ deck: Deck }>('/decks', {
        name: name.trim() || 'New deck',
        listText: text,
        entries: parsed.entries,
      });
      setDecks([...decks, res.deck].sort((a, b) => a.name.localeCompare(b.name)));
      toast('Deck saved');
      navigate(`/decks/${res.deck.id}`);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <div className="page">
      <h1>Decks</h1>
      <p className="muted">
        Saved decks reserve their cards: when you check another list, cards that are already in a saved deck are shown as
        unavailable.
      </p>

      {decks.length > 0 && (
        <div className="deck-list">
          {decks.map((d) => {
            const rows = checkDeck(d.entries, ownedByKey, decks, { excludeDeckId: d.id });
            const missing = rows.reduce((s, r) => s + r.missing, 0);
            const legend = d.entries.find((e) => e.section === 'legend') ?? d.entries[0];
            const card = legend ? cardsByKey.get(legend.nameKey)?.[0] : undefined;
            const size = d.entries.reduce((s, e) => s + e.qty, 0);
            return (
              <Link key={d.id} to={`/decks/${d.id}`} className="deck-card">
                {card && <img src={thumbUrl(card)} alt="" loading="lazy" />}
                <div>
                  <b>{d.name}</b>
                  <span className="muted">{size} cards</span>
                  {missing ? <span className="status bad">{missing} missing</span> : <span className="status good">complete</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <section className="panel">
        <h2>Check a deck list</h2>
        <textarea
          className="decklist-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={12}
          spellCheck={false}
        />
        {parsed && (
          <>
            <div className="row gap wrap">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Deck name" maxLength={100} />
              <button className="btn" onClick={save} disabled={!parsed.entries.length}>
                Save as my deck
              </button>
              <span className="muted small">Save it once you've built it, so its cards count as in use.</span>
            </div>
            <DeckCheck entries={parsed.entries} unresolved={parsed.unresolved} />
          </>
        )}
      </section>
    </div>
  );
}

export function DeckView() {
  const { id } = useParams();
  const { decks, cards, setDecks, toast } = useData();
  const navigate = useNavigate();
  const deck = decks.find((d) => d.id === Number(id));
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(deck?.name ?? '');
  const [notes, setNotes] = useState(deck?.notes ?? '');
  const [text, setText] = useState(deck?.listText ?? '');
  const parsed = useMemo(() => parseDeckList(text, cards), [text, cards]);

  if (!deck) {
    return (
      <div className="page">
        <p>Deck not found.</p>
        <Link to="/decks">Back to decks</Link>
      </div>
    );
  }

  const save = async () => {
    try {
      const res = await api.put<{ deck: Deck }>(`/decks/${deck.id}`, {
        name: name.trim() || deck.name,
        notes,
        listText: text,
        entries: parsed.entries,
      });
      setDecks(decks.map((d) => (d.id === deck.id ? res.deck : d)));
      setEditing(false);
      toast('Deck updated');
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete "${deck.name}"? Its cards will no longer be reserved.`)) return;
    try {
      await api.del(`/decks/${deck.id}`);
      setDecks(decks.filter((d) => d.id !== deck.id));
      navigate('/decks');
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const copyList = async () => {
    try {
      await navigator.clipboard.writeText(deck.listText);
      toast('Deck list copied');
    } catch {
      toast('Copy failed - your browser blocked clipboard access');
    }
  };

  return (
    <div className="page">
      <Link to="/decks" className="back">
        ‹ All decks
      </Link>
      {!editing ? (
        <>
          <div className="row gap wrap title-row">
            <h1>{deck.name}</h1>
            <button className="btn ghost small" onClick={() => setEditing(true)}>
              Edit
            </button>
            <button className="btn ghost small" onClick={copyList}>
              Copy list
            </button>
            <button className="btn ghost small danger" onClick={remove}>
              Delete
            </button>
          </div>
          {deck.notes && <p className="notes">{deck.notes}</p>}
          <DeckCheck entries={deck.entries} excludeDeckId={deck.id} />
        </>
      ) : (
        <section className="panel">
          <h2>Edit deck</h2>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Deck name" maxLength={100} />
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" rows={2} maxLength={2000} />
          <textarea className="decklist-input" value={text} onChange={(e) => setText(e.target.value)} rows={14} spellCheck={false} />
          {parsed.unresolved.length > 0 && (
            <p className="warn">
              {parsed.unresolved.length} line(s) not recognised: {parsed.unresolved.map((u) => u.raw).join(', ')}
            </p>
          )}
          <div className="row gap">
            <button className="btn" onClick={save} disabled={!parsed.entries.length}>
              Save
            </button>
            <button className="btn ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
