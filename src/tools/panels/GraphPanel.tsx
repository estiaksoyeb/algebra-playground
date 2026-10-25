import { useState } from 'react';
import { GraphState, graphModel, quadraticRoots, quadraticVertex, setPoint, systemSolution, tableOfValues } from '../graph';
import { GraphView } from '../views/GraphView';
import { Stepper, ToolControls, ToolHeader } from './shared';
import { MathView as Math } from '../../components/MathComp';
import { Rational } from '../../math/rational';
import { useTranslation } from 'react-i18next';

const num = { round: (n: number) => globalThis.Math.round(n), abs: (n: number) => globalThis.Math.abs(n), max: (a: number, b: number) => globalThis.Math.max(a, b), min: (a: number, b: number) => globalThis.Math.min(a, b) };

export interface GraphPanelProps {
  /** Heading level for the panel title: 2 when embedded under a lesson h1. */
  level?: 1 | 2;
  state: GraphState;
  onChange: (s: GraphState) => void;
  /** True inside a lesson step: the state-description card is left out. */
  embedded?: boolean;
}

const MODES: GraphState['mode'][] = ['explore', 'line', 'quadratic', 'system'];

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : Rational.of(n).toString());

/** Graph explorer. Sliders change the parameters; the line, equation and table derive from them. */
export function GraphPanel({ state, onChange, level, embedded }: GraphPanelProps) {
  const { t, i18n } = useTranslation();
  const sym = graphModel.symbolic(state);
  const desc = graphModel.describe(state, i18n.language);
  const [tableOpen, setTableOpen] = useState(state.showTable);
  const roots = state.mode === 'quadratic' ? quadraticRoots(state) : [];
  const vertex = state.mode === 'quadratic' ? quadraticVertex(state) : null;
  const sol = state.mode === 'system' ? systemSolution(state) : null;
  const table = tableOpen ? tableOfValues(state) : null;

  const set = (patch: Partial<GraphState>) => onChange({ ...state, ...patch });

  return (
    <div className="stack">
      <ToolHeader level={level} title={t('tool.graph.title')} description={t('tool.graph.help')} />
      {/* The lesson step teaches one kind of graph; switching mode would leave the step behind. */}
      {!embedded && (
        <div className="tool-tabs" role="tablist" aria-label={t('tool.graph.modeLabel')}>
          {MODES.map((mode) => (
            <button key={mode} type="button" role="tab" aria-selected={state.mode === mode} onClick={() => set({ mode })} data-testid={`graph-mode-${mode}`}>
              {t(`tool.graph.mode.${mode}`)}
            </button>
          ))}
        </div>
      )}
      <div className="equation-strip" aria-live="polite">
        <div className="stack-sm" style={{ gap: 0, minWidth: 0, flex: 1 }}>
          <span className="equation-strip-label">{t('tool.equation')}</span>
          <div className="math-display" style={{ padding: 0 }}>
            <Math tex={sym.latex} label={sym.text} />
          </div>
        </div>
      </div>
      <div className="tool-canvas">
        <GraphView state={state} onChange={(g) => onChange({ ...g, showTable: tableOpen })} interactive />
      </div>
      <ToolControls>
        {state.mode === 'explore' && (
          <>
            <p className="small muted mb-0">{t('tool.graph.dragHint')}</p>
            <Stepper label="x" value={state.point.x} min={-state.range} max={state.range} step={0.5} onChange={(v) => onChange(setPoint(state, { ...state.point, x: v }))} format={fmt} />
            <Stepper label="y" value={state.point.y} min={-state.range} max={state.range} step={0.5} onChange={(v) => onChange(setPoint(state, { ...state.point, y: v }))} format={fmt} />
          </>
        )}
        {(state.mode === 'line' || state.mode === 'system') && (
          <>
            <Stepper label={t('tool.graph.slope')} value={state.m} min={-5} max={5} step={0.5} onChange={(v) => set({ m: v })} format={fmt} />
            <Stepper label={t('tool.graph.intercept')} value={state.b} min={-state.range} max={state.range} onChange={(v) => set({ b: v })} format={fmt} />
            <label className="row" style={{ minHeight: 'var(--tap)' }}>
              <input type="checkbox" checked={state.showSlope} onChange={(e) => set({ showSlope: e.target.checked })} style={{ width: 22, height: 22 }} />
              <span className="small">{t('tool.graph.showRiseRun')}</span>
            </label>
          </>
        )}
        {state.mode === 'system' && (
          <>
            <Stepper label={t('tool.graph.secondSlope')} value={state.m2} min={-5} max={5} step={0.5} onChange={(v) => set({ m2: v })} format={fmt} />
            <Stepper label={t('tool.graph.secondIntercept')} value={state.b2} min={-state.range} max={state.range} onChange={(v) => set({ b2: v })} format={fmt} />
            <div className={`feedback ${sol ? 'feedback-success' : 'feedback-hint'}`} role="status" data-testid="system-solution">
              {sol
                ? t('tool.graph.meetAt', { x: fmt(sol.x), y: fmt(sol.y) })
                : t('tool.graph.parallelLines')}
            </div>
          </>
        )}
        {state.mode === 'quadratic' && (
          <>
            <Stepper label={t('tool.graph.coeffA')} value={state.a} min={-3} max={3} step={0.5} onChange={(v) => set({ a: v })} format={fmt} />
            <Stepper label={t('tool.graph.coeffB')} value={state.b} min={-6} max={6} onChange={(v) => set({ b: v })} format={fmt} />
            <Stepper label={t('tool.graph.coeffC')} value={state.m} min={-8} max={8} onChange={(v) => set({ m: v })} format={fmt} />
            <div className="feedback feedback-info" role="status" data-testid="quadratic-info">
              {vertex
                ? `${t('tool.graph.turningPoint', {
                    x: fmt(num.round(vertex.x * 1000) / 1000),
                    y: fmt(num.round(vertex.y * 1000) / 1000),
                  })} `
                : ''}
              {roots.length
                ? t('tool.graph.crossesAt', {
                    roots: roots.map((r) => fmt(num.round(r * 1000) / 1000)).join(', '),
                  })
                : t('tool.graph.noRealRoots')}
            </div>
          </>
        )}
        <div className="row">
          <Stepper label={t('tool.graph.zoom')} value={state.range} min={2} max={20} step={1} onChange={(v) => set({ range: num.round(v) })} />
        </div>
        <div className="btn-row">
          <button type="button" className={`btn btn-sm ${tableOpen ? 'btn-secondary' : 'btn-ghost'}`} aria-pressed={tableOpen} onClick={() => setTableOpen((t) => !t)} data-testid="toggle-table">
            {tableOpen ? t('tool.hideTable') : t('tool.showTable')}
          </button>
          {state.mode === 'quadratic' ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange({ ...state, a: 1, b: 0, m: -4 })}>
              {t('tool.graph.exampleParabola')}
            </button>
          ) : state.mode === 'explore' ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(setPoint(state, { x: -3, y: 4 }))}>
              {t('tool.graph.examplePoint')}
            </button>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange({ ...state, m: 2, b: 1 })}>
              {t('tool.graph.exampleSlope')}
            </button>
          )}
        </div>
        {table && (
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 'var(--fs-sm)' }} data-testid="graph-table">
            <caption className="xsmall muted" style={{ textAlign: 'left', paddingBottom: 4 }}>
              {t('tool.graph.tableCaption')}
            </caption>
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--line)' }}>
                  x
                </th>
                {table.map((r) => (
                  <th key={r.x} scope="col" style={{ padding: '4px 8px', borderBottom: '1px solid var(--line)', fontWeight: 500 }}>
                    {r.x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" style={{ textAlign: 'left', padding: '4px 8px' }}>
                  y
                </th>
                {table.map((r) => (
                  <td key={r.x} style={{ padding: '4px 8px', fontWeight: 600 }}>
                    {fmt(r.y)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        )}
      </ToolControls>
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
