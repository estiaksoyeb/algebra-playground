import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { TilesState, arrayTotal } from '../../tools/tiles';

interface Props {
  state: TilesState;
  onAddX?: (d: number) => void;
  onAddUnit?: (d: number) => void;
  interactive?: boolean;
}

const X_W = 62;
const X_H = 16;
const U = 16;

/**
 * Algebra tiles / counters / fraction bar. Signs are shown with explicit + and −
 * glyphs as well as colour, so the meaning does not depend on colour perception.
 * Tapping a tile selects it: +x / −x / +1 / −1 buttons add tiles to the model.
 */
export function TilesView({ state, onAddX, onAddUnit, interactive }: Props) {
  const { i18n } = useTranslation();
  if (state.layout === 'array') return <ArrayView rows={state.rows} cols={state.cols} locale={i18n.language} />;
  if (state.layout === 'groups') return <GroupsView groups={state.groups} total={state.unitCount} locale={i18n.language} />;
  if (state.layout === 'fraction') return <FractionView pieces={state.pieces} shaded={state.shaded} locale={i18n.language} />;
  return <TilesLayout state={state} onAddX={onAddX} onAddUnit={onAddUnit} interactive={interactive} />;
}

function TilesLayout({ state, onAddX, onAddUnit, interactive }: Props) {
  const { t, i18n } = useTranslation();
  const wrapRef = useRef<HTMLDivElement>(null);
  const posX = Math.max(0, state.xCount);
  const negX = Math.max(0, -state.xCount);
  const posU = Math.max(0, state.unitCount);
  const negU = Math.max(0, -state.unitCount);
  const W = 320;
  const rowGap = interactive ? 34 : 30;
  const xRows = Math.ceil(posX / 4) + Math.ceil(negX / 4);
  const uRows = Math.ceil(posU / 10) + Math.ceil(negU / 10);
  const H = Math.max(120, 30 + xRows * rowGap + uRows * (U + 8) + 30);

  return (
    <div className="stack-sm" ref={wrapRef}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={describeTiles(state, i18n.language)} data-testid="tiles-svg">
        {renderXRow(posX, 0, 'pos')}
        {renderXRow(negX, Math.ceil(posX / 4), 'neg')}
        {renderUnits(posU, 'pos', Math.ceil(posX / 4) + Math.ceil(negX / 4))}
        {renderUnits(negU, 'neg', Math.ceil(posX / 4) + Math.ceil(negX / 4) + Math.ceil(posU / 10))}
        {posX + negX + posU + negU === 0 && (
          <text x={W / 2} y={H / 2} textAnchor="middle" className="axis-label" style={{ fontSize: 13 }}>
            {t('tiles.addHint')}
          </text>
        )}
      </svg>
      {interactive && (
        <div className="btn-row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onAddX?.(1)} aria-label={t('tiles.addPosX')} data-testid="add-pos-x">
            +x
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onAddX?.(-1)} aria-label={t('tiles.addNegX')} data-testid="add-neg-x">
            −x
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onAddUnit?.(1)} aria-label={t('tiles.addPosUnit')} data-testid="add-pos-u">
            +1
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onAddUnit?.(-1)} aria-label={t('tiles.addNegUnit')} data-testid="add-neg-u">
            −1
          </button>
        </div>
      )}
    </div>
  );

  function renderXRow(count: number, rowIndex: number, sign: 'pos' | 'neg') {
    if (count === 0) return null;
    const perRow = 4;
    const rows = Math.ceil(count / perRow);
    const out = [];
    for (let r = 0; r < rows; r++) {
      const n = Math.min(perRow, count - r * perRow);
      for (let i = 0; i < n; i++) {
        const x = 20 + i * (X_W + 10);
        const y = 20 + (rowIndex + r) * rowGap;
        out.push(
          <g key={`x-${sign}-${r}-${i}`} data-testid={`tile-x-${sign}`} className={sign === 'pos' ? 'tile-x-pos' : 'tile-x-neg'}>
            <rect x={x} y={y} width={X_W} height={X_H} rx={4} fill={sign === 'pos' ? 'var(--tile-x-pos)' : 'var(--tile-x-neg)'} opacity={0.95} />
            <line x1={x + 4} y1={y + X_H / 2} x2={x + X_W - 4} y2={y + X_H / 2} stroke="rgba(255,255,255,0.35)" strokeWidth={1} />
            <text x={x + 6} y={y + 12} fill="#fff" style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 11 }}>
              {sign === 'pos' ? '+x' : '−x'}
            </text>
          </g>,
        );
      }
    }
    return out;
  }

  function renderUnits(count: number, sign: 'pos' | 'neg', rowIndex: number) {
    if (count === 0) return null;
    const perRow = 10;
    const out = [];
    for (let i = 0; i < count; i++) {
      const r = Math.floor(i / perRow);
      const c = i % perRow;
      const x = 20 + c * (U + 6);
      const y = 20 + xRows * rowGap + r * (U + 8) + (sign === 'neg' ? Math.ceil(Math.max(0, posU)) / 10 * 0 + 0 : 0);
      void rowIndex;
      out.push(
        <g key={`u-${sign}-${i}`} data-testid={`tile-u-${sign}`}>
          <rect x={x} y={y} width={U} height={U} rx={3} fill={sign === 'pos' ? 'var(--tile-u-pos)' : 'var(--tile-u-neg)'} stroke={sign === 'pos' ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.25)'} />
          <text x={x + U / 2} y={y + 12} textAnchor="middle" fill={sign === 'pos' ? '#3a3000' : '#efe9d2'} style={{ fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 10 }}>
            {sign === 'pos' ? '+' : '−'}
          </text>
        </g>,
      );
    }
    return out;
  }
}

function describeTiles(s: TilesState, locale?: string): string {
  const parts: string[] = [];
  const suffix = (n: number, base: string) => (Math.abs(n) === 1 ? base : `${base}s`);
  const neg = (n: number) => (n < 0 ? 'negative ' : '');
  const xCount = Math.abs(s.xCount);
  const uCount = Math.abs(s.unitCount);
  if (locale === 'bn') {
    if (xCount !== 0) parts.push(`${xCount}টা ${s.xCount < 0 ? 'ঋণাত্মক ' : ''}x টাইল`);
    if (uCount !== 0) parts.push(`${uCount}টা ${s.unitCount < 0 ? 'ঋণাত্মক ' : ''}একক টাইল`);
    return parts.length ? `বীজগণিতের টাইল: ${parts.join(' আর ')}` : 'বীজগণিতের টাইলের জায়গা খালি';
  }
  if (xCount !== 0) parts.push(`${xCount} ${neg(s.xCount)}${suffix(s.xCount, 'x tile')}`);
  if (uCount !== 0) parts.push(`${uCount} ${neg(s.unitCount)}${suffix(s.unitCount, 'unit tile')}`);
  return parts.length ? `Algebra tiles: ${parts.join(' and ')}` : 'Empty algebra tile area';
}

function ArrayView({ rows, cols, locale }: { rows: number; cols: number; locale?: string }) {
  const cell = 18;
  const W = Math.max(120, cols * (cell + 4) + 24);
  const H = rows * (cell + 4) + 24;
  const out = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push(<circle key={`${r}-${c}`} cx={14 + c * (cell + 4) + cell / 2} cy={14 + r * (cell + 4) + cell / 2} r={cell / 2} fill="var(--tile-x-pos)" opacity={0.85} />);
    }
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={locale === 'bn' ? `${rows} সারি আর ${cols} কলামের অ্যারে, ${rows * cols}টা কাউন্টার` : `Array with ${rows} rows and ${cols} columns, ${rows * cols} counters`} data-testid="array-svg">
      {out}
      <text x={W / 2} y={H - 2} textAnchor="middle" className="axis-label" style={{ fontSize: 11 }}>
        {rows} × {cols} = {arrayTotal({ rows, cols } as TilesState)}
      </text>
    </svg>
  );
}

function GroupsView({ groups, total, locale }: { groups: number; total: number; locale?: string }) {
  const per = Math.floor(total / groups);
  const W = 320;
  const H = 140;
  const boxW = Math.min(84, (W - 20) / groups - 6);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={locale === 'bn' ? `${total}টা কাউন্টার ${groups}টা দলে ভাগ, প্রতি দলে ${per}টা` : `${total} counters shared into ${groups} groups of ${per}`} data-testid="groups-svg">
      {Array.from({ length: groups }).map((_, g) => {
        const x = 10 + g * (boxW + 6);
        return (
          <g key={g}>
            <rect x={x} y={20} width={boxW} height={90} rx={8} fill="var(--brand-soft)" stroke="var(--line-strong)" />
            {Array.from({ length: per }).map((_, i) => (
              <circle
                key={i}
                cx={x + 10 + (i % Math.max(1, Math.floor((boxW - 16) / 14))) * 14}
                cy={34 + Math.floor(i / Math.max(1, Math.floor((boxW - 16) / 14))) * 14}
                r={5.5}
                fill="var(--tile-x-pos)"
              />
            ))}
          </g>
        );
      })}
      <text x={W / 2} y={H - 8} textAnchor="middle" className="axis-label" style={{ fontSize: 11 }}>
        {total} ÷ {groups} = {total % groups === 0 ? per : `${total}/${groups}`}
      </text>
    </svg>
  );
}

function FractionView({ pieces, shaded, locale }: { pieces: number; shaded: number; locale?: string }) {
  const W = 320;
  const H = 110;
  const barW = W - 40;
  const segW = barW / pieces;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={locale === 'bn' ? `ভগ্নাংশের বার, ${pieces}টা সমান ভাগের মধ্যে ${shaded}টা রঙ করা` : `Fraction bar with ${pieces} equal parts, ${shaded} shaded`} data-testid="fraction-svg">
      {Array.from({ length: pieces }).map((_, i) => (
        <rect
          key={i}
          x={20 + i * segW}
          y={30}
          width={segW}
          height={48}
          fill={i < shaded ? 'var(--tile-x-pos)' : 'var(--bg-sunken)'}
          stroke="var(--ink-soft)"
          strokeWidth={1.2}
        />
      ))}
      <text x={W / 2} y={98} textAnchor="middle" className="axis-label" style={{ fontSize: 12 }}>
        {shaded} of {pieces} equal parts
      </text>
    </svg>
  );
}
