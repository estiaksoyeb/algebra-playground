import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GraphState, graphModel, lineSegments, parabolaPoints, setPoint, tableOfValues, systemSolution } from '../../tools/graph';

interface Props {
  state: GraphState;
  onChange?: (g: GraphState) => void;
  interactive?: boolean;
}

/** Coordinate plane. Points/lines/parabolas are derived from model parameters. */
export function GraphView({ state, onChange, interactive }: Props) {
  const { i18n } = useTranslation();
  const bn = i18n.language === 'bn';
  const W = 340;
  const H = 340;
  const pad = 20;
  const R = state.range;
  const px = (x: number) => pad + ((x + R) / (2 * R)) * (W - 2 * pad);
  const py = (y: number) => H - pad - ((y + R) / (2 * R)) * (H - 2 * pad);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);
  const [active, setActive] = useState<{ x: number; y: number } | null>(null);

  // keep point inside model during drag
  useEffect(() => {
    if (dragging && active && onChange) onChange(setPoint(state, active));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const fromClient = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return state.point;
    const rect = svg.getBoundingClientRect();
    const scale = W / rect.width;
    const sx = (clientX - rect.left) * scale;
    const sy = (clientY - rect.top) * scale;
    const x = ((sx - pad) / (W - 2 * pad)) * 2 * R - R;
    const y = R - ((sy - pad) / (H - 2 * pad)) * 2 * R;
    const round2 = (v: number) => Math.round(v * 2) / 2;
    return { x: round2(Math.max(-R, Math.min(R, x))), y: round2(Math.max(-R, Math.min(R, y))) };
  };

  const grids: JSX.Element[] = [];
  for (let i = -R; i <= R; i++) {
    grids.push(<line key={`vx${i}`} x1={px(i)} y1={pad} x2={px(i)} y2={H - pad} />);
    grids.push(<line key={`hy${i}`} x1={pad} y1={py(i)} x2={W - pad} y2={py(i)} />);
  }

  const labels: JSX.Element[] = [];
  const labelStep = R <= 6 ? 1 : R <= 12 ? 2 : 5;
  for (let i = -R; i <= R; i++) {
    if (i === 0 || i % labelStep !== 0) continue;
    labels.push(
      <text key={`lx${i}`} x={px(i)} y={py(0) + 14} textAnchor="middle" className="axis-label" style={{ fontSize: 10 }}>
        {i}
      </text>,
      <text key={`ly${i}`} x={px(0) - 7} y={py(i) + 3} textAnchor="end" className="axis-label" style={{ fontSize: 10 }}>
        {i}
      </text>,
    );
  }

  const showPoint = state.mode === 'explore';
  const isLine = state.mode === 'line' || state.mode === 'system';
  const segs = isLine ? lineSegments(state) : [];
  const parab = state.mode === 'quadratic' ? parabolaPoints(state) : [];
  const parabPath = parab.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p.x)},${py(p.y)}`).join(' ');
  const showTable = state.showTable && (state.mode === 'line' || state.mode === 'system' || state.mode === 'quadratic');
  const table = showTable ? (state.mode === 'quadratic' ? quadraticTable(state) : tableOfValues(state)) : null;
  const sol = state.mode === 'system' ? systemSolution(state) : null;
  const equationLabel = state.mode === 'system' ? `y = ${fmtNum(state.m2)}x + ${fmtNum(state.b2)}` : `y = ${fmtNum(state.m)}x + ${fmtNum(state.b)}`;

  return (
    <div className="stack-sm">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={bn ? `স্থানাঙ্ক তল, -${R} থেকে ${R} পর্যন্ত। ${describe(state, sol, true)}` : `Coordinate plane from -${R} to ${R}. ${describe(state, sol, false)}`}
        data-testid="graph-svg"
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => {
          if (!interactive || !showPoint) return;
          setDragging(true);
          (e.target as Element).setPointerCapture?.(e.pointerId);
          setActive(fromClient(e.clientX, e.clientY));
        }}
        onPointerMove={(e) => {
          if (!dragging || !interactive) return;
          setActive(fromClient(e.clientX, e.clientY));
        }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
      >
        <g className="graph-grid">{grids}</g>
        <line className="graph-axis" x1={pad} y1={py(0)} x2={W - pad} y2={py(0)} />
        <line className="graph-axis" x1={px(0)} y1={pad} x2={px(0)} y2={H - pad} />
        <text x={W - pad + 2} y={py(0) - 6} className="axis-label" style={{ fontSize: 11 }}>x</text>
        <text x={px(0) + 6} y={pad + 2} className="axis-label" style={{ fontSize: 11 }}>y</text>
        {labels}
        {segs.map((s, i) => (
          <line
            key={i}
            x1={px(s.x1)}
            y1={py(s.y1)}
            x2={px(s.x2)}
            y2={py(s.y2)}
            stroke={i === 0 ? 'var(--brand)' : 'var(--accent)'}
            strokeWidth={2.5}
          />
        ))}
        {state.mode === 'quadratic' && <path d={parabPath} fill="none" stroke="var(--brand)" strokeWidth={2.5} />}
        {sol && <circle cx={px(sol.x)} cy={py(sol.y)} r={5} fill="var(--success)" stroke="#fff" strokeWidth={2} />}
        {state.mode === 'explore' && (
          <g data-testid="graph-point">
            <line x1={px(state.point.x)} y1={py(state.point.y)} x2={px(state.point.x)} y2={py(0)} stroke="var(--ink-muted)" strokeDasharray="3 3" />
            <line x1={px(state.point.x)} y1={py(state.point.y)} x2={px(0)} y2={py(state.point.y)} stroke="var(--ink-muted)" strokeDasharray="3 3" />
            <circle cx={px(state.point.x)} cy={py(state.point.y)} r={9} fill="var(--accent)" stroke="var(--bg-elevated)" strokeWidth={2.5} />
          </g>
        )}
        {state.showSlope && state.mode === 'line' && (
          <g>
            <line x1={px(0)} y1={py(state.b)} x2={px(1)} y2={py(state.b)} stroke="var(--success)" strokeWidth={3} />
            <line x1={px(1)} y1={py(state.b)} x2={px(1)} y2={py(state.b + state.m)} stroke="var(--danger)" strokeWidth={3} />
            <circle cx={px(0)} cy={py(state.b)} r={4} fill="var(--success)" />
          </g>
        )}
      </svg>
      {table && (
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 'var(--fs-sm)' }} data-testid="table-values">
          <caption className="xsmall muted" style={{ textAlign: 'left', paddingBottom: 4 }}>
            Table of values for {equationLabel}
          </caption>
          <thead>
            <tr>
              <th scope="col" style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--line)' }}>x</th>
              {table.map((r) => (
                <td key={r.x} style={{ padding: '4px 8px', borderBottom: '1px solid var(--line)' }}>{r.x}</td>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" style={{ textAlign: 'left', padding: '4px 8px' }}>y</th>
              {table.map((r) => (
                <td key={r.x} style={{ padding: '4px 8px', fontWeight: 600 }}>{r.y}</td>
              ))}
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

function describe(s: GraphState, sol: { x: number; y: number } | null, bn: boolean): string {
  if (s.mode === 'explore') return bn ? `বিন্দু (${s.point.x}, ${s.point.y})-তে আছে।` : `Point at (${s.point.x}, ${s.point.y}).`;
  if (s.mode === 'quadratic') return bn ? `পরাবৃত্ত: ${graphModel.symbolic(s).text}।` : `Parabola: ${graphModel.symbolic(s).text}.`;
  if (s.mode === 'system')
    return sol
      ? bn
        ? `দুইটা রেখা (${sol.x}, ${sol.y})-তে ছেদ করে।`
        : `Two lines crossing at (${sol.x}, ${sol.y}).`
      : bn
        ? 'দুইটা সমান্তরাল রেখা, কোথাও ছেদ করে না।'
        : 'Two parallel lines with no intersection.';
  return bn ? `রেখা y = ${s.m}x + ${s.b}।` : `Line y = ${s.m}x + ${s.b}.`;
}

function quadraticTable(g: GraphState): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let x = -3; x <= 3; x++) out.push({ x, y: Math.round((g.a * x * x + g.b * x + g.m) * 100) / 100 });
  return out;
}

function fmtNum(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return (Math.round(n * 1000) / 1000).toString();
}
