import { useEffect, useMemo, useRef, useState } from 'react';
import type { Card, Finish, Want } from '../types';
import { api } from '../api';
import { useData } from '../store';
import { LANGUAGE_NAMES, cardLabel, matchCardQuery, thumbUrl } from '../lib/cards';
import { wantsForCard } from '../lib/wants';
import { Stepper } from '../components/ui';

interface Pull {
  uid: number;
  cardId: string;
  finish: Finish;
  booster: number;
}

interface Session {
  setId: string;
  boosters: number;
  language: string;
  current: number;
  pulls: Pull[];
  allSets: boolean;
}

const STORAGE_KEY = 'rg.booster.session';

function loadSession(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

export function Booster() {
  const [session, setSessionState] = useState<Session | null>(loadSession);
  const [reviewing, setReviewing] = useState(false);

  const setSession = (s: Session | null) => {
    setSessionState(s);
    try {
      if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable: the session just isn't kept across reloads */
    }
  };

  if (!session) return <BoosterSetup onStart={setSession} />;
  if (reviewing) return <BoosterReview session={session} onBack={() => setReviewing(false)} onDone={() => setSession(null)} />;
  return <BoosterSession session={session} setSession={setSession} onFinish={() => setReviewing(true)} />;
}

function BoosterSetup({ onStart }: { onStart: (s: Session) => void }) {
  const { sets, user } = useData();
  const mainSets = sets.filter((s) => s.cardCount >= 100);
  const [setId, setSetId] = useState(mainSets[mainSets.length - 1]?.id ?? sets[0]?.id);
  const [boosters, setBoosters] = useState(1);
  const [language, setLanguage] = useState(user.defaultLanguage);

  return (
    <div className="page narrow">
      <h1>Open boosters</h1>
      <p className="muted">
        Type the collector number or name of each card you pull and press Enter. Cards are only added to your collection when
        you finish, so you can fix mistakes along the way.
      </p>
      <section className="panel form">
        <label>
          Set
          <select value={setId} onChange={(e) => setSetId(e.target.value)}>
            {[...sets].reverse().map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.id})
              </option>
            ))}
          </select>
        </label>
        <label>
          Number of boosters
          <div className="row gap wrap">
            <Stepper value={boosters} onChange={setBoosters} min={1} max={500} />
            {[1, 6, 12, 24].map((n) => (
              <button key={n} className={`chip ${boosters === n ? 'on' : ''}`} onClick={() => setBoosters(n)} type="button">
                {n === 24 ? 'Display (24)' : n}
              </button>
            ))}
          </div>
        </label>
        <label>
          Card language
          <select value={language} onChange={(e) => setLanguage(e.target.value)}>
            {Object.entries(LANGUAGE_NAMES).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="btn big"
          onClick={() => onStart({ setId, boosters, language, current: 0, pulls: [], allSets: false })}
        >
          Start opening
        </button>
      </section>
    </div>
  );
}

function BoosterSession({
  session,
  setSession,
  onFinish,
}: {
  session: Session;
  setSession: (s: Session | null) => void;
  onFinish: () => void;
}) {
  const { cards, cardById, owned, wants, sets } = useData();
  const [query, setQuery] = useState('');
  const [foil, setFoil] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const pool = useMemo(
    () => (session.allSets ? cards : cards.filter((c) => c.set === session.setId)),
    [cards, session.setId, session.allSets],
  );

  // "f 123" or "*123" marks the card as foil while typing.
  const foilPrefix = /^(f\s+|\*)/i.test(query);
  const cleanQuery = query.replace(/^(f\s+|\*)/i, '');
  const suggestions = useMemo(() => matchCardQuery(pool, cleanQuery, 6), [pool, cleanQuery]);

  useEffect(() => setHighlight(0), [cleanQuery]);

  const seenBefore = (cardId: string, uid: number) =>
    !!owned.get(cardId)?.total || session.pulls.some((p) => p.cardId === cardId && p.uid < uid);

  const add = (card: Card) => {
    const wantsFoil = foil || foilPrefix;
    const finish: Finish = card.finishes.includes(wantsFoil ? 'foil' : 'normal') ? (wantsFoil ? 'foil' : 'normal') : card.finishes[0];
    const uid = Date.now() + Math.random();
    setSession({ ...session, pulls: [...session.pulls, { uid, cardId: card.id, finish, booster: session.current }] });
    setQuery('');
    setFoil(false);
    inputRef.current?.focus();
  };

  const updatePull = (uid: number, patch: Partial<Pull> | null) =>
    setSession({
      ...session,
      pulls: patch === null ? session.pulls.filter((p) => p.uid !== uid) : session.pulls.map((p) => (p.uid === uid ? { ...p, ...patch } : p)),
    });

  const go = (delta: number) => {
    const current = Math.max(0, Math.min(session.boosters - 1, session.current + delta));
    setSession({ ...session, current });
    inputRef.current?.focus();
  };

  const currentPulls = session.pulls.filter((p) => p.booster === session.current);
  const newCount = session.pulls.filter((p) => !seenBefore(p.cardId, p.uid)).length;
  const wantedHits = session.pulls.filter((p) => {
    const c = cardById.get(p.cardId);
    return c && wantsForCard(c, wants).length > 0;
  }).length;
  const isLast = session.current === session.boosters - 1;
  const setName = sets.find((s) => s.id === session.setId)?.name ?? session.setId;

  return (
    <div className="page booster">
      <div className="booster-head">
        <div>
          <h1>
            {setName} <span className="muted">· Booster {session.current + 1} of {session.boosters}</span>
          </h1>
          <div className="progress-bar">
            <div style={{ width: `${((session.current + 1) / session.boosters) * 100}%` }} />
          </div>
        </div>
        <div className="booster-stats">
          <span>
            <b>{session.pulls.length}</b> cards
          </span>
          <span>
            <b>{newCount}</b> new
          </span>
          <span>
            <b>{wantedHits}</b> from want list
          </span>
        </div>
      </div>

      <div className="booster-input">
        <div className="picker">
          <input
            ref={inputRef}
            autoFocus
            type="search"
            inputMode="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Number or name, e.g. 42 or Jinx (prefix f for foil)"
            aria-label="Card number or name"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && suggestions[highlight]) {
                e.preventDefault();
                add(suggestions[highlight]);
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHighlight((h) => Math.min(suggestions.length - 1, h + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlight((h) => Math.max(0, h - 1));
              }
            }}
          />
          {suggestions.length > 0 && (
            <ul className="suggestions">
              {suggestions.map((c, i) => (
                <li key={c.id}>
                  <button className={i === highlight ? 'hl' : ''} onClick={() => add(c)}>
                    <img src={thumbUrl(c)} alt="" />
                    <span>
                      {cardLabel(c)} <small className="muted">{c.code}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button className={`btn foil-btn ${foil || foilPrefix ? 'on' : ''}`} onClick={() => setFoil(!foil)} type="button">
          ✦ Foil
        </button>
      </div>
      <label className="small muted">
        <input type="checkbox" checked={session.allSets} onChange={(e) => setSession({ ...session, allSets: e.target.checked })} /> Search
        all sets (tokens, promos)
      </label>

      <div className="pulls">
        {currentPulls.length === 0 && <p className="empty">No cards entered for this booster yet.</p>}
        {currentPulls.map((p) => {
          const c = cardById.get(p.cardId);
          if (!c) return null;
          const isNew = !seenBefore(p.cardId, p.uid);
          const wanted = wantsForCard(c, wants).length > 0;
          return (
            <div key={p.uid} className={`pull ${p.finish === 'foil' ? 'is-foil' : ''}`}>
              <div className="pull-img">
                <img src={thumbUrl(c)} alt={c.name} />
                {p.finish === 'foil' && <span className="holo" aria-hidden="true" />}
                <div className="tile-badges">
                  {isNew && <span className="badge new">NEW</span>}
                  {wanted && <span className="badge want">♥</span>}
                </div>
              </div>
              <div className="pull-bar">
                <button
                  className={`finish-toggle ${p.finish === 'foil' ? 'foil' : ''}`}
                  disabled={c.finishes.length < 2}
                  onClick={() => updatePull(p.uid, { finish: p.finish === 'foil' ? 'normal' : 'foil' })}
                >
                  {p.finish === 'foil' ? '✦ Foil' : 'Normal'}
                </button>
                <button className="x" onClick={() => updatePull(p.uid, null)} aria-label="Remove">
                  ×
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="booster-nav">
        <button className="btn ghost" onClick={() => go(-1)} disabled={session.current === 0}>
          ‹ Previous booster
        </button>
        {!isLast ? (
          <button className="btn" onClick={() => go(1)}>
            Next booster ›
          </button>
        ) : (
          <button className="btn" onClick={onFinish} disabled={!session.pulls.length}>
            Finish & review
          </button>
        )}
      </div>
      <div className="row gap wrap booster-footer">
        {!isLast && (
          <button className="btn ghost small" onClick={onFinish} disabled={!session.pulls.length}>
            Finish early & review
          </button>
        )}
        <button
          className="btn ghost small danger"
          onClick={() => confirm('Discard this opening session? Nothing has been added to your collection yet.') && setSession(null)}
        >
          Discard session
        </button>
      </div>
    </div>
  );
}

function BoosterReview({ session, onBack, onDone }: { session: Session; onBack: () => void; onDone: () => void }) {
  const { cardById, owned, wants, changeCollection, setWants, toast } = useData();
  const [saving, setSaving] = useState(false);
  const [updateWants, setUpdateWants] = useState(true);

  const grouped = useMemo(() => {
    const m = new Map<string, { card: Card; finish: Finish; qty: number }>();
    for (const p of session.pulls) {
      const card = cardById.get(p.cardId);
      if (!card) continue;
      const k = `${p.cardId}|${p.finish}`;
      const g = m.get(k);
      if (g) g.qty++;
      else m.set(k, { card, finish: p.finish, qty: 1 });
    }
    return [...m.values()].sort((a, b) => a.card.order - b.card.order);
  }, [session.pulls, cardById]);

  // How many copies of each want the pulls cover.
  const wantHits = useMemo(() => {
    const hits = new Map<number, { want: Want; covered: number }>();
    for (const g of grouped) {
      for (const w of wantsForCard(g.card, wants)) {
        if (w.finish !== 'any' && w.finish !== g.finish) continue;
        const h = hits.get(w.id) ?? { want: w, covered: 0 };
        h.covered = Math.min(w.qty, h.covered + g.qty);
        hits.set(w.id, h);
      }
    }
    return [...hits.values()];
  }, [grouped, wants]);

  const finish = async () => {
    setSaving(true);
    try {
      const ok = await changeCollection(
        grouped.map((g) => ({ cardId: g.card.id, finish: g.finish, language: session.language, delta: g.qty })),
      );
      if (!ok) {
        setSaving(false);
        return;
      }
      if (updateWants && wantHits.length) {
        let latest: Want[] | null = null;
        for (const { want, covered } of wantHits) {
          const res =
            covered >= want.qty
              ? await api.del<{ items: Want[] }>(`/wants/${want.id}`)
              : await api.patch<{ items: Want[] }>(`/wants/${want.id}`, { qty: want.qty - covered });
          latest = res.items;
        }
        if (latest) setWants(latest);
      }
      toast(`${session.pulls.length} cards added to your collection`);
      onDone();
    } catch (e) {
      toast((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <h1>Review your pulls</h1>
      <p>
        <b>{session.pulls.length}</b> cards from {session.current + 1} booster(s), language {session.language}.
      </p>
      <div className="table-wrap">
        <table className="check-table">
          <thead>
            <tr>
              <th />
              <th>Card</th>
              <th>Finish</th>
              <th>Qty</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {grouped.map((g) => (
              <tr key={`${g.card.id}|${g.finish}`}>
                <td>
                  <span className="mini-thumb">
                    <img src={thumbUrl(g.card)} alt="" loading="lazy" />
                  </span>
                </td>
                <td>
                  {cardLabel(g.card)} <small className="muted">{g.card.code}</small>
                </td>
                <td>{g.finish === 'foil' ? '✦ Foil' : 'Normal'}</td>
                <td>{g.qty}</td>
                <td>
                  {!owned.get(g.card.id)?.total && <span className="badge new">NEW</span>}{' '}
                  {wantsForCard(g.card, wants).length > 0 && <span className="badge want">♥ wanted</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {wantHits.length > 0 && (
        <label className="panel block">
          <input type="checkbox" checked={updateWants} onChange={(e) => setUpdateWants(e.target.checked)} /> Update my want list:{' '}
          {wantHits.length} entr{wantHits.length === 1 ? 'y is' : 'ies are'} (partly) covered by these pulls
        </label>
      )}
      <div className="row gap">
        <button className="btn ghost" onClick={onBack} disabled={saving}>
          ‹ Back
        </button>
        <button className="btn big" onClick={finish} disabled={saving}>
          {saving ? 'Saving…' : `Add ${session.pulls.length} cards to my collection`}
        </button>
      </div>
    </div>
  );
}
