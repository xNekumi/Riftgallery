import { Fragment, type ReactNode } from 'react';

const TOKEN = /(:rb_[a-z0-9_]+:|\[[^\]]+\])/g;

function renderToken(tok: string, key: number): ReactNode {
  if (tok.startsWith('[')) {
    const word = tok.slice(1, -1);
    if (word === '>' || word === '>>') return <span key={key} className="ico arrow">{'➤'}</span>;
    return (
      <b key={key} className="kw">
        {word}
      </b>
    );
  }
  const name = tok.slice(4, -1);
  const energy = name.match(/^energy_(\d+)$/);
  if (energy) return <span key={key} className="ico energy">{energy[1]}</span>;
  if (name === 'might') return <span key={key} className="ico might" title="Might">{'⚔'}</span>;
  if (name === 'exhaust') return <span key={key} className="ico exhaust" title="Exhaust">{'↻'}</span>;
  const rune = name.match(/^rune_(\w+)$/);
  if (rune) {
    return (
      <span key={key} className={`ico rune rune-${rune[1]}`} title={`${rune[1]} rune`}>
        {'◆'}
      </span>
    );
  }
  return <Fragment key={key}>{tok}</Fragment>;
}

/** Card rules text with icons for energy, might, runes and highlighted [Keywords]. */
export function CardText({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="card-text">
      {text.split('\n').map((line, i) => (
        <p key={i}>{line.split(TOKEN).map((part, j) => (j % 2 ? renderToken(part, j) : part))}</p>
      ))}
    </div>
  );
}
