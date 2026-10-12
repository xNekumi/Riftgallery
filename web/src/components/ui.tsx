import { useEffect, type ReactNode } from 'react';

export function Modal({
  onClose,
  children,
  wide,
  label,
}: {
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  label: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={label}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        {children}
      </div>
    </div>
  );
}

export function ChipGroup<T extends string | number>({
  options,
  selected,
  onChange,
  render,
  className,
}: {
  options: readonly T[];
  selected: T[];
  onChange: (next: T[]) => void;
  render?: (o: T) => ReactNode;
  className?: (o: T) => string;
}) {
  return (
    <div className="chips">
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <button
            key={String(o)}
            type="button"
            className={`chip ${on ? 'on' : ''} ${className?.(o) ?? ''}`}
            aria-pressed={on}
            onClick={() => onChange(on ? selected.filter((s) => s !== o) : [...selected, o])}
          >
            {render ? render(o) : String(o)}
          </button>
        );
      })}
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label?: string;
}) {
  return (
    <div className="stepper" aria-label={label}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Less">
        −
      </button>
      <span className="stepper-value">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="More">
        +
      </button>
    </div>
  );
}

export function DomainDots({ domains }: { domains: string[] }) {
  return (
    <span className="domain-dots">
      {domains.map((d) => (
        <span key={d} className={`dot domain-${d.toLowerCase()}`} title={d} />
      ))}
    </span>
  );
}
