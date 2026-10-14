import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Card, Finish, Want, WantFinish } from '../types';
import { api } from '../api';
import { ownedOf, useData } from '../store';
import { LANGUAGE_NAMES, cardLabel, fullUrl, thumbUrl } from '../lib/cards';
import { PRIORITIES, wantsForCard } from '../lib/wants';
import { CardText } from './CardText';
import { DomainDots, Modal, Stepper } from './ui';

interface Props {
  card: Card;
  onClose: () => void;
  onNavigate?: (card: Card) => void;
  prev?: Card;
  next?: Card;
}

export function CardModal({ card, onClose, onNavigate, prev, next }: Props) {
  const { owned, changeCollection, user, cardsByKey, decks, wants, setWants, toast, ownedByKey } = useData();
  const o = ownedOf(owned, card.id);
  const [showFoil, setShowFoil] = useState(card.finishes[0] === 'foil');
  const [extraLangs, setExtraLangs] = useState<string[]>([]);

  useEffect(() => {
    setShowFoil(card.finishes[0] === 'foil');
    setExtraLangs([]);
  }, [card]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft' && prev) onNavigate?.(prev);
      if (e.key === 'ArrowRight' && next) onNavigate?.(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next, onNavigate]);

  const languagesFor = (finish: Finish) => {
    const langs = new Set<string>([user.defaultLanguage, ...extraLangs]);
    for (const k of o.detail.keys()) if (k.startsWith(`${finish}|`)) langs.add(k.split('|')[1]);
    return [...langs];
  };

  const setQty = (finish: Finish, language: string, qty: number) =>
    changeCollection([{ cardId: card.id, finish, language, qty }]);

  const printings = cardsByKey.get(card.key) ?? [];
  const decksUsing = decks
    .map((d) => ({ deck: d, qty: d.entries.filter((e) => e.nameKey === card.key).reduce((s, e) => s + e.qty, 0) }))
    .filter((d) => d.qty > 0);
  const myWants = wantsForCard(card, wants);

  return (
    <Modal onClose={onClose} wide label={card.name}>
      <div className="card-modal">
        <div className="card-modal-image">
          <div className={`big-card ${card.landscape ? 'landscape' : ''} ${showFoil ? 'is-foil' : ''}`}>
            <img src={fullUrl(card)} alt={card.name} />
            {showFoil && <span className="holo" aria-hidden="true" />}
          </div>
          <div className="row center gap">
            {prev && (
              <button className="btn ghost" onClick={() => onNavigate?.(prev)} aria-label="Previous card">
                ‹ Prev
              </button>
            )}
            {card.finishes.length > 1 && (
              <button className="btn ghost" onClick={() => setShowFoil(!showFoil)}>
                {showFoil ? 'Show normal' : 'Show foil ✦'}
              </button>
            )}
            {next && (
              <button className="btn ghost" onClick={() => onNavigate?.(next)} aria-label="Next card">
                Next ›
              </button>
            )}
          </div>
        </div>

        <div className="card-modal-info">
          <h2>{cardLabel(card)}</h2>
          <div className="meta-line">
            <span className="code">{card.code}</span>
            <span>{card.setLabel}</span>
            <span className={`rarity rarity-${card.rarity.toLowerCase()}`}>{card.rarity}</span>
          </div>
          <div className="meta-line">
            <DomainDots domains={card.domains} />
            <span>{card.domains.join(' / ')}</span>
            <span>
              {card.supertype ? `${card.supertype} ` : ''}
              {card.type}
            </span>
          </div>
          <div className="stats">
            {card.energy !== null && (
              <span>
                <b>{card.energy}</b> Energy
              </span>
            )}
            {card.power !== null && card.power > 0 && (
              <span>
                <b>{card.power}</b> Power
              </span>
            )}
            {card.might !== null && card.type === 'Unit' && (
              <span>
                <b>{card.might}</b> Might
              </span>
            )}
          </div>
          <CardText text={card.text} />
          {card.flavour && <p className="flavour">{card.flavour}</p>}
          {card.tags.length > 0 && (
            <div className="tags">
              {card.tags.map((t) => (
                <span key={t} className="tag">
                  {t}
                </span>
              ))}
            </div>
          )}
          {card.artist && <p className="muted small">Illustrated by {card.artist}</p>}

          {printings.length > 1 && (
            <section className="panel">
              <h3>
                Versions <span className="muted">· click to switch</span>
              </h3>
              <div className="printings">
                {printings.map((p) => (
                  <button
                    key={p.id}
                    className={`printing ${p.id === card.id ? 'current' : ''} ${ownedOf(owned, p.id).total ? '' : 'missing'}`}
                    onClick={() => onNavigate?.(p)}
                    title={`${cardLabel(p)} · ${p.code}`}
                  >
                    <img src={thumbUrl(p)} alt={p.name} loading="lazy" />
                    <span>{p.code.split('/')[0]}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="panel">
            <h3>
              In my collection <span className="muted">· {ownedByKey.get(card.key) ?? 0} of this card across all versions</span>
            </h3>
            {card.finishes.map((finish) => (
              <div key={finish} className="finish-block">
                <div className="finish-name">{finish === 'foil' ? '✦ Foil' : 'Normal'}</div>
                <div className="lang-rows">
                  {languagesFor(finish).map((lang) => (
                    <div key={lang} className="lang-row">
                      <span className="lang" title={LANGUAGE_NAMES[lang]}>
                        {lang}
                      </span>
                      <Stepper
                        value={o.detail.get(`${finish}|${lang}`) ?? 0}
                        onChange={(v) => setQty(finish, lang, v)}
                        label={`${finish} ${lang}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <label className="add-lang">
              Add language:{' '}
              <select
                value=""
                onChange={(e) => e.target.value && setExtraLangs([...extraLangs, e.target.value])}
              >
                <option value="">choose…</option>
                {Object.entries(LANGUAGE_NAMES).map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <WantEditor card={card} existing={myWants} onSaved={(w) => setWants(w)} onError={toast} />

          {decksUsing.length > 0 && (
            <section className="panel">
              <h3>Used in decks</h3>
              <ul className="plain">
                {decksUsing.map(({ deck, qty }) => (
                  <li key={deck.id}>
                    <Link to={`/decks/${deck.id}`} onClick={onClose}>
                      {deck.name}
                    </Link>{' '}
                    <span className="muted">×{qty}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

        </div>
      </div>
    </Modal>
  );
}

function WantEditor({
  card,
  existing,
  onSaved,
  onError,
}: {
  card: Card;
  existing: Want[];
  onSaved: (w: Want[]) => void;
  onError: (m: string) => void;
}) {
  const [exact, setExact] = useState(false);
  const [finish, setFinish] = useState<WantFinish>('any');
  const [qty, setQty] = useState(1);
  const [priority, setPriority] = useState(2);
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);

  const save = async () => {
    try {
      const res = await api.post<{ items: Want[] }>('/wants', {
        items: [{ nameKey: card.key, cardId: exact ? card.id : null, finish, qty, priority, note }],
      });
      onSaved(res.items);
      setOpen(false);
      setNote('');
    } catch (e) {
      onError((e as Error).message);
    }
  };

  const remove = async (id: number) => {
    try {
      onSaved((await api.del<{ items: Want[] }>(`/wants/${id}`)).items);
    } catch (e) {
      onError((e as Error).message);
    }
  };

  return (
    <section className="panel">
      <h3>Want list</h3>
      {existing.length > 0 && (
        <ul className="plain">
          {existing.map((w) => (
            <li key={w.id} className="row gap">
              <span>
                ♥ {w.qty}× {w.cardId ? 'this version' : 'any version'}
                {w.finish !== 'any' ? `, ${w.finish}` : ''} · {PRIORITIES[w.priority]} priority
                {w.note ? ` · ${w.note}` : ''}
              </span>
              <button className="btn ghost small" onClick={() => remove(w.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {!open ? (
        <button className="btn" onClick={() => setOpen(true)}>
          ♥ Add to want list
        </button>
      ) : (
        <div className="want-form">
          <label>
            <input type="checkbox" checked={exact} onChange={(e) => setExact(e.target.checked)} /> Only this exact version (
            {card.code.split('/')[0]})
          </label>
          <div className="row gap wrap">
            <label>
              Copies <Stepper value={qty} onChange={setQty} min={1} />
            </label>
            <label>
              Finish{' '}
              <select value={finish} onChange={(e) => setFinish(e.target.value as WantFinish)}>
                <option value="any">any</option>
                <option value="normal">normal</option>
                <option value="foil">foil</option>
              </select>
            </label>
            <label>
              Priority{' '}
              <select value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
                {Object.entries(PRIORITIES).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          <div className="row gap">
            <button className="btn" onClick={save}>
              Save
            </button>
            <button className="btn ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
