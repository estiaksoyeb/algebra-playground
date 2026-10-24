import { TilesState, addTiles, arrayTotal, tilesExpression, tilesModel } from '../tiles';
import { TilesView } from '../views/TilesView';
import { Stepper, ToolControls, ToolHeader } from './shared';
import { MathView as Math } from '../../components/MathComp';

const num = { round: (n: number) => globalThis.Math.round(n), abs: (n: number) => globalThis.Math.abs(n), max: (a: number, b: number) => globalThis.Math.max(a, b), min: (a: number, b: number) => globalThis.Math.min(a, b) };

export interface TilesPanelProps {
  /** Heading level for the panel title: 2 when embedded under a lesson h1. */
  level?: 1 | 2;
  /** True when embedded in a lesson step: the taught layout is locked, so no layout switcher. */
  embedded?: boolean;
  state: TilesState;
  onChange: (s: TilesState) => void;
  onProblem?: (message: string) => void;
}

const LAYOUTS: { id: TilesState['layout']; label: string }[] = [
  { id: 'tiles', label: 'Algebra tiles' },
  { id: 'array', label: 'Array' },
  { id: 'groups', label: 'Equal groups' },
  { id: 'fraction', label: 'Fraction bar' },
];

/**
 * The heading must match the picture on screen. A lesson on multiplication or fractions
 * has no x-tiles at all, so it must not be titled "Algebra tiles".
 */
export const LAYOUT_COPY: Record<TilesState['layout'], { title: string; description: string }> = {
  tiles: { title: 'Algebra tiles', description: 'Long tiles represent x. Small unit squares represent 1.' },
  array: { title: 'Multiplication array', description: 'Rows and columns of unit squares show multiplication as a rectangle.' },
  groups: { title: 'Equal groups', description: 'Items shared equally into groups show how division works.' },
  fraction: { title: 'Fraction bar', description: 'Equal parts of a whole bar show fractions visually.' },
};

/** Four interpretations of one counter/tile state: expression, array, groups, fraction. */
export function TilesPanel({ state, onChange, onProblem, level, embedded }: TilesPanelProps) {
  const sym = tilesModel.symbolic(state);
  const desc = tilesModel.describe(state);
  const copy = LAYOUT_COPY[state.layout];

  const bump = (dx: number, du: number) => {
    const r = addTiles(state, dx, du);
    if (r.ok && r.state) onChange(r.state);
    else onProblem?.(r.error ?? 'That is not allowed.');
  };

  // Switch layout, seeding counters the chosen picture needs so it never starts blank.
  const switchLayout = (layout: TilesState['layout']) => {
    const patch: Partial<TilesState> = { layout };
    if (layout === 'array' && state.unitCount === 0 && state.xCount === 0) Object.assign(patch, { rows: 3, cols: 4, unitCount: 12 });
    if (layout === 'groups' && state.unitCount === 0) patch.unitCount = 12;
    onChange({ ...state, ...patch });
  };

  const e = tilesExpression(state);

  return (
    <div className="stack">
      <ToolHeader level={level} title={copy.title} description={copy.description} />
      {/* In a lesson the layout is the one being taught; switching away would contradict the step. */}
      {!embedded && (
        <div className="tool-tabs" role="tablist" aria-label="Tile layout">
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              type="button"
              role="tab"
              aria-selected={state.layout === l.id}
              onClick={() => switchLayout(l.id)}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}
      <div className="equation-strip" aria-live="polite" data-testid="tiles-equation">
        <div className="stack-sm" style={{ gap: 0, minWidth: 0, flex: 1 }}>
          <span className="equation-strip-label">{state.layout === 'tiles' ? 'Expression' : 'Value'}</span>
          <div className="math-display" style={{ padding: 0 }}>
            <Math tex={sym.latex} label={sym.text} />
          </div>
        </div>
      </div>
      <div className="tool-canvas">
        <TilesView
          state={state}
          interactive={state.layout === 'tiles'}
          onAddX={(d) => bump(d, 0)}
          onAddUnit={(d) => bump(0, d)}
        />
      </div>
      <ToolControls>
        {state.layout === 'tiles' && (
          <>
            <div className="row-between">
              <span className="field-label" style={{ margin: 0 }}>
                Long tiles (x)
              </span>
              <div className="stepper">
                <button type="button" onClick={() => bump(-1, 0)} aria-label="Remove one x tile" data-testid="remove-x">
                  −
                </button>
                <output aria-live="polite">{state.xCount}</output>
                <button type="button" onClick={() => bump(1, 0)} aria-label="Add one x tile" data-testid="add-x">
                  +
                </button>
              </div>
            </div>
            <div className="row-between">
              <span className="field-label" style={{ margin: 0 }}>
                Unit tiles (1)
              </span>
              <div className="stepper">
                <button type="button" onClick={() => bump(0, -1)} aria-label="Remove one unit tile" data-testid="remove-unit">
                  −
                </button>
                <output aria-live="polite">{state.unitCount}</output>
                <button type="button" onClick={() => bump(0, 1)} aria-label="Add one unit tile" data-testid="add-unit">
                  +
                </button>
              </div>
            </div>
            <div className="btn-row">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange({ ...state, xCount: 2, unitCount: 3 })} data-testid="tiles-example">
                Example: 2x + 3
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange({ ...state, xCount: 0, unitCount: 0 })}>
                Clear all tiles
              </button>
            </div>
            <div className="feedback feedback-info" role="status">
              {state.xCount + state.unitCount === 0
                ? 'No tiles yet. Tap +x or +1 to build an expression.'
                : `${num.abs(state.xCount)} long tile(s) and ${num.abs(state.unitCount)} unit tile(s) show ${e.text}. Long tiles and unit squares are different sizes, so they stay as separate terms.`}
            </div>
          </>
        )}
        {state.layout === 'array' && (
          <>
            <Stepper label="Rows" value={state.rows} min={1} max={10} onChange={(v) => onChange({ ...state, rows: v, unitCount: v * state.cols })} />
            <Stepper label="Columns" value={state.cols} min={1} max={10} onChange={(v) => onChange({ ...state, cols: v, unitCount: state.rows * v })} />
            <p className="small muted mb-0">
              {state.rows} rows × {state.cols} columns = {arrayTotal(state)} counters. Swap rows and columns: the total stays the same.
            </p>
          </>
        )}
        {state.layout === 'groups' && (
          <>
            <Stepper label="Counters" value={state.unitCount} min={0} max={100} onChange={(v) => onChange({ ...state, unitCount: v })} />
            <Stepper label="Groups" value={state.groups} min={1} max={12} onChange={(v) => onChange({ ...state, groups: v })} />
            <p className="small muted mb-0">
              {state.groups} equal groups share {state.unitCount} counters
              {state.unitCount % state.groups === 0
                ? ` — each group has ${state.unitCount / state.groups}.`
                : ` — ${state.unitCount} is not a multiple of ${state.groups}, so some counters are left over.`}
            </p>
          </>
        )}
        {state.layout === 'fraction' && (
          <>
            <Stepper label="Equal parts" value={state.pieces} min={1} max={16} onChange={(v) => onChange({ ...state, pieces: v, shaded: num.min(state.shaded, v) })} />
            <Stepper label="Shaded parts" value={state.shaded} min={0} max={state.pieces} onChange={(v) => onChange({ ...state, shaded: v })} />
          </>
        )}
      </ToolControls>
      {/* Lesson steps carry their own explanation; this card only repeats the state. */}
      {!embedded && <section className="card" aria-label="Explanation">
        <h3 style={{ fontSize: 'var(--fs-md)', marginBottom: 'var(--sp-2)' }}>{desc.title}</h3>
        <ul style={{ margin: 0, paddingLeft: 18 }} className="small">
          {desc.lines.map((l, i) => (
            <li key={i} style={{ marginBottom: 4 }}>
              {l}
            </li>
          ))}
        </ul>
      </section>}
    </div>
  );
}
