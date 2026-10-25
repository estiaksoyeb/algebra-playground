import { useTranslation } from 'react-i18next';
import { BalanceState, solutionOf } from '../../tools/balance';

const UNIT = 14;
const X_UNIT = 34;

interface Props {
  state: BalanceState;
  /** highlight a suggested operation target */
  highlight?: 'left' | 'right' | null;
}

/**
 * Balance scale. Each side's weight is drawn from the same pile data that produces
 * the equation; if either side has more objects than fit, a count label is shown
 * instead (the equation still shows the true amount).
 */
export function BalanceView({ state }: Props) {
  const { i18n } = useTranslation();
  const bn = i18n.language === 'bn';
  const W = 340;
  const H = 230;
  const pivotX = W / 2;
  const pivotY = 78;
  const leftWeight = state.left.x * X_UNIT * 0.55 + Math.abs(state.left.units) * UNIT * 0.35;
  const rightWeight = state.right.x * X_UNIT * 0.55 + Math.abs(state.right.units) * UNIT * 0.35;
  const tilt = Math.max(-1, Math.min(1, (rightWeight - leftWeight) / 80)) * 9; // degrees
  const sol = solutionOf(state);
  const balanced = sol !== null;
  const label = bn
    ? `তারাজু। বাম পাশে ${state.left.x}টা x ব্লক আর ${state.left.units}টা একক। ডান পাশে ${state.right.x}টা x ব্লক আর ${state.right.units}টা একক। ${balanced ? 'তারাজু এখন সমান হতে পারে।' : 'তারাজু এখনও সমান হয়নি।'}`
    : `Balance scale. Left side ${state.left.x} x blocks and ${state.left.units} units. Right side ${state.right.x} x blocks and ${state.right.units} units. ${balanced ? 'The scale can balance.' : 'The scale cannot balance.'}`;
  const panLabels = bn ? { left: 'বাম', right: 'ডান', impossible: 'এই সমীকরণ কখনো সত্যি হয় না' } : { left: 'left', right: 'right', impossible: 'This equation is never true' };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label}
      data-testid="balance-svg"
    >
      {/* stand */}
      <path d={`M${pivotX} ${pivotY} v${H - pivotY - 28}`} stroke="var(--ink-soft)" strokeWidth={6} strokeLinecap="round" />
      <path d={`M${pivotX - 34} ${H - 26} h68`} stroke="var(--ink-soft)" strokeWidth={6} strokeLinecap="round" />
      <circle cx={pivotX} cy={pivotY} r={7} fill="var(--ink)" />

      {/* beam */}
      <g transform={`rotate(${tilt} ${pivotX} ${pivotY})`}>
        <line x1={pivotX - 120} y1={pivotY} x2={pivotX + 120} y2={pivotY} stroke="var(--ink)" strokeWidth={5} strokeLinecap="round" />
        {/* pans */}
        <Pan x={pivotX - 120} y={pivotY} side={state.left} />
        <Pan x={pivotX + 120} y={pivotY} side={state.right} />
      </g>
      <g>
        <text x={80} y={H - 8} textAnchor="middle" className="axis-label" style={{ fontSize: 11 }}>
          {panLabels.left}
        </text>
        <text x={W - 80} y={H - 8} textAnchor="middle" className="axis-label" style={{ fontSize: 11 }}>
          {panLabels.right}
        </text>
      </g>
      {!balanced && (
        <text x={pivotX} y={24} textAnchor="middle" className="axis-label" fill="var(--danger)" style={{ fontSize: 12, fontWeight: 600 }}>
          {panLabels.impossible}
        </text>
      )}
    </svg>
  );

  function Pan({ x, y, side }: { x: number; y: number; side: BalanceState['left'] }) {
    const items: JSX.Element[] = [];
    const maxUnits = 8;
    const units = Math.abs(side.units);
    const unitSign = side.units < 0 ? -1 : 1;
    const showUnits = Math.min(units, maxUnits);
    for (let i = 0; i < showUnits; i++) {
      items.push(
        <g key={`u${i}`} transform={`translate(${x - 42 + (i % 4) * 21}, ${y + 34 + Math.floor(i / 4) * 18})`} data-testid={`balance-unit-${unitSign > 0 ? 'pos' : 'neg'}`}>
          <rect width={17} height={15} rx={3} fill={unitSign > 0 ? 'var(--tile-u-pos)' : 'var(--tile-u-neg)'} stroke="rgba(0,0,0,0.2)" />
          <text x={8.5} y={11} textAnchor="middle" style={{ fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 9 }} fill={unitSign > 0 ? '#3a3000' : '#efe9d2'}>
            {unitSign > 0 ? '+' : '−'}
          </text>
        </g>,
      );
    }
    for (let i = 0; i < side.x; i++) {
      items.push(
        <g key={`x${i}`} transform={`translate(${x - 42 + (i % 3) * 29}, ${y + 6 + Math.floor(i / 3) * 14})`} data-testid="balance-x">
          <rect width={26} height={12} rx={3} fill="var(--tile-x-pos)" />
          <text x={13} y={10} textAnchor="middle" style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 8 }} fill="#fff">
            x
          </text>
        </g>,
      );
    }
    return (
      <g data-testid="balance-pan">
        <line x1={x} y1={y} x2={x} y2={y + 14} stroke="var(--ink-soft)" strokeWidth={2} />
        <path d={`M${x - 52} ${y + 18} h104 l-10 26 h-84 z`} fill="var(--bg-sunken)" stroke="var(--ink-soft)" strokeWidth={2} strokeLinejoin="round" />
        {items}
        {(units > maxUnits || side.x > 6) && (
          <text x={x} y={y + 66} textAnchor="middle" className="axis-label" style={{ fontSize: 11, fontWeight: 600 }}>
            {side.x ? `${side.x}× x, ` : ''}
            {side.units} units
          </text>
        )}
      </g>
    );
  }
}
