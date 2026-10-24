import { useState } from 'react';
import { GraphState, graphModel, quadraticRoots, quadraticVertex, setPoint, systemSolution, tableOfValues } from '../graph';
import { GraphView } from '../views/GraphView';
import { Stepper, ToolControls, ToolHeader } from './shared';
import { MathView as Math } from '../../components/MathComp';
import { Rational } from '../../math/rational';

const num = { round: (n: number) => globalThis.Math.round(n), abs: (n: number) => globalThis.Math.abs(n), max: (a: number, b: number) => globalThis.Math.max(a, b), min: (a: number, b: number) => globalThis.Math.min(a, b) };

export interface GraphPanelProps {
  /** Heading level for the panel title: 2 when embedded under a lesson h1. */
  level?: 1 | 2;
  state: GraphState;
  onChange: (s: GraphState) => void;
  /** True inside a lesson step: the state-description card is left out. */
  embedded?: boolean;
}

const MODES: { id: GraphState['mode']; label: string }[] = [
  { id: 'explore', label: 'Points' },
  { id: 'line', label: 'Line' },
  { id: 'quadratic', label: 'Parabola' },
  { id: 'system', label: 'System' },
];

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : Rational.of(n).toString());

/** Graph explorer. Sliders change the parameters; the line, equation and table derive from them. */
export function GraphPanel({ state, onChange, level, embedded }: GraphPanelProps) {
  const sym = graphModel.symbolic(state);
  const desc = graphModel.describe(state);
  const [tableOpen, setTableOpen] = useState(state.showTable);
  const roots = state.mode === 'quadratic' ? quadraticRoots(state) : [];
  const vertex = state.mode === 'quadratic' ? quadraticVertex(state) : null;
  const sol = state.mode === 'system' ? systemSolution(state) : null;
  const table = tableOpen ? tableOfValues(state) : null;

  const set = (patch: Partial<GraphState>) => onChange({ ...state, ...patch });

  return (
    <div className="stack">
      <ToolHeader level={level} title="Graph explorer" description="Plot points, straight lines, parabolas and pairs of lines. Sliders change the rule; the picture, table and equation update together." />
      {/* The lesson step teaches one kind of graph; switching mode would leave the step behind. */}
      {!embedded && (
        <div className="tool-tabs" role="tablist" aria-label="Graph mode">
          {MODES.map((m) => (
            <button key={m.id} type="button" role="tab" aria-selected={state.mode === m.id} onClick={() => set({ mode: m.id })} data-testid={`graph-mode-${m.id}`}>
              {m.label}
            </button>
          ))}
        </div>
      )}
      <div className="equation-strip" aria-live="polite">
        <div className="stack-sm" style={{ gap: 0, minWidth: 0, flex: 1 }}>
          <span className="equation-strip-label">Equation</span>
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
            <p className="small muted mb-0">Drag the point on the plane, or use the steppers. x is horizontal; y is vertical.</p>
            <Stepper label="x" value={state.point.x} min={-state.range} max={state.range} step={0.5} onChange={(v) => onChange(setPoint(state, { ...state.point, x: v }))} format={fmt} />
            <Stepper label="y" value={state.point.y} min={-state.range} max={state.range} step={0.5} onChange={(v) => onChange(setPoint(state, { ...state.point, y: v }))} format={fmt} />
          </>
        )}
        {(state.mode === 'line' || state.mode === 'system') && (
          <>
            <Stepper label="Slope m" value={state.m} min={-5} max={5} step={0.5} onChange={(v) => set({ m: v })} format={fmt} />
            <Stepper label="y-intercept b" value={state.b} min={-state.range} max={state.range} onChange={(v) => set({ b: v })} format={fmt} />
            <label className="row" style={{ minHeight: 'var(--tap)' }}>
              <input type="checkbox" checked={state.showSlope} onChange={(e) => set({ showSlope: e.target.checked })} style={{ width: 22, height: 22 }} />
              <span className="small">Show rise and run (m = rise ÷ run)</span>
            </label>
          </>
        )}
        {state.mode === 'system' && (
          <>
            <Stepper label="Second slope m₂" value={state.m2} min={-5} max={5} step={0.5} onChange={(v) => set({ m2: v })} format={fmt} />
            <Stepper label="Second intercept b₂" value={state.b2} min={-state.range} max={state.range} onChange={(v) => set({ b2: v })} format={fmt} />
            <div className={`feedback ${sol ? 'feedback-success' : 'feedback-hint'}`} role="status" data-testid="system-solution">
              {sol ? `The lines meet at (${fmt(sol.x)}, ${fmt(sol.y)}) — that pair solves both equations.` : 'The slopes are equal, so the lines are parallel and never meet.'}
            </div>
          </>
        )}
        {state.mode === 'quadratic' && (
          <>
            <Stepper label="a (x² coefficient)" value={state.a} min={-3} max={3} step={0.5} onChange={(v) => set({ a: v })} format={fmt} />
            <Stepper label="b (x coefficient)" value={state.b} min={-6} max={6} onChange={(v) => set({ b: v })} format={fmt} />
            <Stepper label="c (constant)" value={state.m} min={-8} max={8} onChange={(v) => set({ m: v })} format={fmt} />
            <div className="feedback feedback-info" role="status" data-testid="quadratic-info">
              {vertex ? `Turning point (${fmt(num.round(vertex.x * 1000) / 1000)}, ${fmt(num.round(vertex.y * 1000) / 1000)}). ` : ''}
              {roots.length
                ? `It crosses the x-axis at x = ${roots.map((r) => fmt(num.round(r * 1000) / 1000)).join(' and ')} — the solutions of y = 0.`
                : 'It does not cross the x-axis, so y = 0 has no real solutions here.'}
            </div>
          </>
        )}
        <div className="row">
          <Stepper label="Zoom (range ±)" value={state.range} min={2} max={20} step={1} onChange={(v) => set({ range: num.round(v) })} />
        </div>
        <div className="btn-row">
          <button type="button" className={`btn btn-sm ${tableOpen ? 'btn-secondary' : 'btn-ghost'}`} aria-pressed={tableOpen} onClick={() => setTableOpen((t) => !t)} data-testid="toggle-table">
            {tableOpen ? 'Hide table' : 'Show table of values'}
          </button>
          {state.mode === 'quadratic' ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange({ ...state, a: 1, b: 0, m: -4 })}>
              Example: y = x² − 4
            </button>
          ) : state.mode === 'explore' ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(setPoint(state, { x: -3, y: 4 }))}>
              Point (−3, 4)
            </button>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange({ ...state, m: 2, b: 1 })}>
              Example: slope 2
            </button>
          )}
        </div>
        {table && (
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 'var(--fs-sm)' }} data-testid="graph-table">
            <caption className="xsmall muted" style={{ textAlign: 'left', paddingBottom: 4 }}>
              Table of values for x and y
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
