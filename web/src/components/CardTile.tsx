import { memo, useState } from 'react';
import type { Card, Finish } from '../types';
import type { CollectionChange, Owned } from '../store';
import { thumbUrl } from '../lib/cards';

interface Props {
  card: Card;
  owned: Owned | undefined;
  /** Versions shown behind this tile (1 when versions are not grouped). */
  versionCount: number;
  /** How many of those versions you own at least one copy of. */
  ownedVersionCount: number;
  wanted: boolean;
  inDecks: boolean;
  language: string;
  onOpen: (card: Card) => void;
  onChange: (changes: CollectionChange[]) => void;
}

function initialFinish(card: Card, owned: Owned | undefined): Finish {
  if (owned?.normal && card.finishes.includes('normal')) return 'normal';
  if (owned?.foil) return 'foil';
  return card.finishes[0];
}

/** Picks which language entry a "−" click removes: the default language first, else any language that has copies. */
function languageToDecrement(owned: Owned | undefined, finish: Finish, language: string): string | null {
  if (!owned) return null;
  if (owned.detail.get(`${finish}|${language}`)) return language;
  for (const [k, qty] of owned.detail) {
    const [f, lang] = k.split('|');
    if (f === finish && qty > 0) return lang;
  }
  return null;
}

export const CardTile = memo(function CardTile({
  card,
  owned,
  versionCount,
  ownedVersionCount,
  wanted,
  inDecks,
  language,
  onOpen,
  onChange,
}: Props) {
  const [finish, setFinish] = useState<Finish>(() => initialFinish(card, owned));
  const count = owned?.[finish] ?? 0;
  const canToggle = card.finishes.length > 1;
  const isFoil = finish === 'foil';
  const isGroup = versionCount > 1;
  // A grouped tile only greys out when you own none of the card's versions.
  const missing = isGroup ? ownedVersionCount === 0 && !count : !count;

  const add = (delta: number) => {
    const lang = delta > 0 ? language : languageToDecrement(owned, finish, language);
    if (!lang) return;
    onChange([{ cardId: card.id, finish, language: lang, delta }]);
  };

  return (
    <div className={`tile ${missing ? 'missing' : ''} ${isFoil ? 'is-foil' : ''}`}>
      <button className="tile-img" onClick={() => onOpen(card)} aria-label={`Show ${card.name}`}>
        <img src={thumbUrl(card)} alt={card.name} loading="lazy" decoding="async" />
        {isFoil && <span className="holo" aria-hidden="true" />}
      </button>
      <div className="tile-badges">
        {wanted && (
          <span className="badge want" title="On your want list">
            ♥
          </span>
        )}
        {inDecks && (
          <span className="badge deck" title="Used in a saved deck">
            ▤
          </span>
        )}
        {isGroup ? (
          <span
            className={`badge versions ${ownedVersionCount ? 'has' : ''}`}
            title={`${ownedVersionCount} of ${versionCount} versions owned – click the card to see all`}
          >
            {ownedVersionCount}/{versionCount} versions
          </span>
        ) : (
          card.variant !== 'base' && <span className="badge variant">{card.variantLabel}</span>
        )}
      </div>
      <div className="tile-bar">
        <button
          type="button"
          className={`finish-toggle ${isFoil ? 'foil' : ''}`}
          onClick={() => canToggle && setFinish(isFoil ? 'normal' : 'foil')}
          disabled={!canToggle}
          title={canToggle ? 'Switch between normal and foil' : 'Only exists as foil'}
        >
          {isFoil ? '✦ Foil' : 'Normal'}
          {canToggle && (owned?.[isFoil ? 'normal' : 'foil'] ?? 0) > 0 && (
            <sup title={`You also own ${isFoil ? 'normal' : 'foil'} copies`}>{owned![isFoil ? 'normal' : 'foil']}</sup>
          )}
        </button>
        <span className="tile-code">{card.code.split('/')[0]}</span>
        <div className="tile-qty">
          <button type="button" onClick={() => add(-1)} disabled={!count} aria-label="Remove one">
            −
          </button>
          <span className={count ? 'n has' : 'n'}>{count}</span>
          <button type="button" onClick={() => add(1)} aria-label="Add one">
            +
          </button>
        </div>
      </div>
    </div>
  );
});
