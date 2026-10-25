import { useTranslation } from 'react-i18next';
import { MysteryState, mysteryTotal } from '../../tools/mystery';

export function MysteryView({ state }: { state: MysteryState }) {
  const { i18n } = useTranslation();
  const bn = i18n.language === 'bn';
  const W = 320;
  const H = 150;
  const total = mysteryTotal(state);
  const matched = state.target !== undefined && total === state.target;
  const boxW = 58;
  const gap = 10;
  const items = [];
  for (let i = 0; i < state.copies; i++) {
    const x = 16 + i * (boxW + gap);
    items.push(
      <g key={`box${i}`} transform={`translate(${x}, 30)`} data-testid="mystery-box">
        <rect width={boxW} height={boxW} rx={10} fill="var(--brand-soft)" stroke="var(--brand)" strokeWidth={2} strokeDasharray={matched ? undefined : '6 4'} />
        <text x={boxW / 2} y={boxW / 2 + 8} textAnchor="middle" style={{ fontFamily: 'var(--font-math)', fontStyle: 'italic', fontSize: 26, fontWeight: 700 }} fill="var(--brand-strong)">
          x
        </text>
        {state.reveal ? (
          <text x={boxW / 2} y={boxW + 16} textAnchor="middle" className="axis-label" style={{ fontSize: 11 }}>
            {bn ? `আছে ${state.value}` : `holds ${state.value}`}
          </text>
        ) : (
          <text x={boxW / 2} y={boxW + 16} textAnchor="middle" className="axis-label" style={{ fontSize: 11 }}>
            ?
          </text>
        )}
      </g>,
    );
  }
  const extraX = 16 + state.copies * (boxW + gap);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={
        bn
          ? `${state.copies}টা অজানা বাক্স ${state.reveal ? `প্রতিটাতে ${state.value}` : '(মান অজানা)'}, সঙ্গে ${state.extra}, মোট ${total}${state.target !== undefined ? `, লক্ষ্য ${state.target}` : ''}`
          : `${state.copies} mystery box${state.copies > 1 ? 'es' : ''} ${state.reveal ? `each holding ${state.value}` : 'with an unknown value'}, plus ${state.extra}, total ${total}${state.target !== undefined ? `, target ${state.target}` : ''}`
      }
      data-testid="mystery-svg"
    >
      {items}
      {state.extra !== 0 &&
        Array.from({ length: Math.min(Math.abs(state.extra), 10) }).map((_, i) => {
          const sign = state.extra > 0 ? 1 : -1;
          const px = extraX + (i % 5) * 20;
          const py = 42 + Math.floor(i / 5) * 22;
          return (
            <g key={`u${i}`} transform={`translate(${px}, ${py})`} data-testid="mystery-unit">
              <rect width={16} height={16} rx={3} fill={sign > 0 ? 'var(--tile-u-pos)' : 'var(--tile-u-neg)'} stroke="rgba(0,0,0,0.18)" />
              <text x={8} y={12} textAnchor="middle" style={{ fontWeight: 800, fontSize: 10 }} fill={sign > 0 ? '#3a3000' : '#efe9d2'}>
                {sign > 0 ? '+' : '−'}
              </text>
            </g>
          );
        })}
      {Math.abs(state.extra) > 10 && (
        <text x={extraX} y={100} className="axis-label" style={{ fontSize: 11 }}>
          {state.extra > 0 ? '+' : '−'}
          {Math.abs(state.extra)} units
        </text>
      )}
      <line x1={16} y1={H - 44} x2={W - 16} y2={H - 44} stroke="var(--line-strong)" />
      <text x={W / 2} y={H - 22} textAnchor="middle" style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 14 }} fill={matched ? 'var(--success)' : 'var(--ink)'} data-testid="mystery-total">
        total = {total}
        {state.target !== undefined ? `  (target ${state.target})` : ''}
        {matched ? '  ✓' : ''}
      </text>
    </svg>
  );
}
