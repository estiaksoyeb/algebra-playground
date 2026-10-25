import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

const num = { round: (n: number) => globalThis.Math.round(n), abs: (n: number) => globalThis.Math.abs(n), max: (a: number, b: number) => globalThis.Math.max(a, b), min: (a: number, b: number) => globalThis.Math.min(a, b) };

export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  format = (v) => String(v),
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  format?: (v: number) => string;
}) {
  const { t } = useTranslation();
  const clamp = (v: number) => {
    let n = num.round(v * 1000) / 1000;
    if (min !== undefined) n = num.max(min, n);
    if (max !== undefined) n = num.min(max, n);
    return n;
  };
  return (
    // The label wraps instead of pushing the −/value/+ control off the edge of a phone.
    <div className="row stepper-row">
      <span className="field-label">{label}</span>
      <div className="stepper">
        <button type="button" onClick={() => onChange(clamp(value - step))} aria-label={t('tool.decrease', { label })}>
          −
        </button>
        <output aria-live="polite">{format(value)}</output>
        <button type="button" onClick={() => onChange(clamp(value + step))} aria-label={t('tool.increase', { label })}>
          +
        </button>
      </div>
    </div>
  );
}

export function ToolHeader({ title, description, children, level = 1 }: { title: string; description: string; children?: ReactNode; /** 2 when the tool is embedded in a lesson page that already owns the h1 */ level?: 1 | 2 }) {
  const Heading = (level === 1 ? 'h1' : 'h2') as 'h1' | 'h2';
  return (
    <header className="stack-sm" style={{ marginBottom: 'var(--sp-3)' }}>
      <div>
        <Heading style={{ fontSize: level === 1 ? 'var(--fs-xl)' : 'var(--fs-lg)', marginBottom: 2 }}>{title}</Heading>
        <p className="small muted" style={{ margin: 0 }}>
          {description}
        </p>
      </div>
      {children}
    </header>
  );
}

export function EquationStrip({ latex, label, children }: { latex: ReactNode; label?: string; children?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="equation-strip" aria-live="polite">
      <div className="stack-sm" style={{ gap: 0, minWidth: 0, flex: 1 }}>
        <span className="equation-strip-label">{label ?? t('tool.equation')}</span>
        <div className="math-display" style={{ padding: 0 }}>
          {latex}
        </div>
      </div>
      {children}
    </div>
  );
}

export function ToolControls({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <section className="card stack" aria-label={t('tool.controls')}>
      {children}
    </section>
  );
}

export function DescriptionList({ title, lines }: { title: string; lines: string[] }) {
  const { t } = useTranslation();
  return (
    <section className="card" aria-label={t('tool.explanation')}>
      <h3 style={{ fontSize: 'var(--fs-md)', marginBottom: 'var(--sp-2)' }}>{title}</h3>
      <ul style={{ margin: 0, paddingLeft: 18 }} className="small">
        {lines.map((l, i) => (
          <li key={i} style={{ marginBottom: 4 }}>
            {l}
          </li>
        ))}
      </ul>
    </section>
  );
}
