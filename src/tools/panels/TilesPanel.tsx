import { TilesState, addTiles, arrayTotal, tilesExpression, tilesModel } from '../tiles';
import { TilesView } from '../views/TilesView';
import { Stepper, ToolControls, ToolHeader } from './shared';
import { MathView as Math } from '../../components/MathComp';
import { useTranslation } from 'react-i18next';

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

const LAYOUTS: TilesState['layout'][] = ['tiles', 'array', 'groups', 'fraction'];

/**
 * The heading must match the picture on screen. A lesson on multiplication or fractions
 * has no x-tiles at all, so it must not be titled "Algebra tiles" — hence one title and
 * description per layout, supplied by the catalogue.
 */
export function layoutCopy(layout: TilesState['layout'], translate: (key: string) => string): { title: string; description: string } {
  return {
    title: translate(`tool.tiles.layout.${layout}.title`),
    description: translate(`tool.tiles.layout.${layout}.description`),
  };
}

/** Four interpretations of one counter/tile state: expression, array, groups, fraction. */
export function TilesPanel({ state, onChange, onProblem, level, embedded }: TilesPanelProps) {
  const { t, i18n } = useTranslation();
  const sym = tilesModel.symbolic(state);
  const desc = tilesModel.describe(state, i18n.language);
  const copy = layoutCopy(state.layout, t);

  const bump = (dx: number, du: number) => {
    const r = addTiles(state, dx, du);
    if (r.ok && r.state) onChange(r.state);
    else onProblem?.(r.error ?? t('tool.tiles.notAllowed'));
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
        <div className="tool-tabs" role="tablist" aria-label={t('tool.tiles.layoutLabel')}>
          {LAYOUTS.map((layout) => (
            <button
              key={layout}
              type="button"
              role="tab"
              aria-selected={state.layout === layout}
              onClick={() => switchLayout(layout)}
            >
              {t(`tool.tiles.layout.${layout}.tab`)}
            </button>
          ))}
        </div>
      )}
      <div className="equation-strip" aria-live="polite" data-testid="tiles-equation">
        <div className="stack-sm" style={{ gap: 0, minWidth: 0, flex: 1 }}>
          <span className="equation-strip-label">{state.layout === 'tiles' ? t('tool.expression') : t('tool.value')}</span>
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
                {t('tool.tiles.longTiles')}
              </span>
              <div className="stepper">
                <button type="button" onClick={() => bump(-1, 0)} aria-label={t('tool.tiles.removeX')} data-testid="remove-x">
                  −
                </button>
                <output aria-live="polite">{state.xCount}</output>
                <button type="button" onClick={() => bump(1, 0)} aria-label={t('tool.tiles.addX')} data-testid="add-x">
                  +
                </button>
              </div>
            </div>
            <div className="row-between">
              <span className="field-label" style={{ margin: 0 }}>
                {t('tool.tiles.unitTiles')}
              </span>
              <div className="stepper">
                <button type="button" onClick={() => bump(0, -1)} aria-label={t('tool.tiles.removeUnit')} data-testid="remove-unit">
                  −
                </button>
                <output aria-live="polite">{state.unitCount}</output>
                <button type="button" onClick={() => bump(0, 1)} aria-label={t('tool.tiles.addUnit')} data-testid="add-unit">
                  +
                </button>
              </div>
            </div>
            <div className="btn-row">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange({ ...state, xCount: 2, unitCount: 3 })} data-testid="tiles-example">
                {t('tool.tiles.example')}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange({ ...state, xCount: 0, unitCount: 0 })}>
                {t('tool.tiles.clear')}
              </button>
            </div>
            <div className="feedback feedback-info" role="status">
              {state.xCount + state.unitCount === 0
                ? t('tool.tiles.emptyHint')
                : t('tool.tiles.summary', { x: num.abs(state.xCount), units: num.abs(state.unitCount), expression: e.text })}
            </div>
          </>
        )}
        {state.layout === 'array' && (
          <>
            <Stepper label={t('tool.tiles.rows')} value={state.rows} min={1} max={10} onChange={(v) => onChange({ ...state, rows: v, unitCount: v * state.cols })} />
            <Stepper label={t('tool.tiles.columns')} value={state.cols} min={1} max={10} onChange={(v) => onChange({ ...state, cols: v, unitCount: state.rows * v })} />
            <p className="small muted mb-0">
              {t('tool.tiles.arrayLine', { rows: state.rows, cols: state.cols, total: arrayTotal(state) })}
            </p>
          </>
        )}
        {state.layout === 'groups' && (
          <>
            <Stepper label={t('tool.tiles.counters')} value={state.unitCount} min={0} max={100} onChange={(v) => onChange({ ...state, unitCount: v })} />
            <Stepper label={t('tool.tiles.groups')} value={state.groups} min={1} max={12} onChange={(v) => onChange({ ...state, groups: v })} />
            <p className="small muted mb-0">
              {state.unitCount % state.groups === 0
                ? t('tool.tiles.groupsLine', { groups: state.groups, count: state.unitCount, each: state.unitCount / state.groups })
                : t('tool.tiles.groupsRemainder', { groups: state.groups, count: state.unitCount })}
            </p>
          </>
        )}
        {state.layout === 'fraction' && (
          <>
            <Stepper label={t('tool.tiles.equalParts')} value={state.pieces} min={1} max={16} onChange={(v) => onChange({ ...state, pieces: v, shaded: num.min(state.shaded, v) })} />
            <Stepper label={t('tool.tiles.shadedParts')} value={state.shaded} min={0} max={state.pieces} onChange={(v) => onChange({ ...state, shaded: v })} />
          </>
        )}
      </ToolControls>
      {/* Lesson steps carry their own explanation; this card only repeats the state. */}
      {!embedded && <section className="card" aria-label={t('tool.explanation')}>
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
