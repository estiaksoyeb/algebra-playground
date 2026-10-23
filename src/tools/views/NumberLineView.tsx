import { useCallback, useMemo, useRef } from 'react';
import { NumberLineState, ticks, displayNum } from '../../tools/numberline';
import { Rational } from '../../math/rational';

interface Props {
  state: NumberLineState;
  onChange: (value: Rational) => void;
  readOnly?: boolean;
  /** ids for aria + tests */
  idPrefix?: string;
}

/**
 * Interactive number line. Pointer drag/tap and keyboard (arrows/Home/End) both feed
 * the same onChange, which updates the model. All drawing derives from model state.
 */
export function NumberLineView({ state, onChange, readOnly, idPrefix = 'nl' }: Props) {
  const W = 340;
  const H = 140;
  const padL = 26;
  const padR = 26;
  const y = 84;
  const svgRef = useRef<SVGSVGElement>(null);

  const toX = useCallback(
    (v: Rational) => {
      const span = state.max.sub(state.min);
      const spanNum = span.toNumber();
      const frac = spanNum === 0 ? 0 : v.sub(state.min).toNumber() / spanNum;
      return padL + frac * (W - padL - padR);
    },
    [state.min, state.max],
  );

  const fromX = useCallback(
    (px: number) => {
      const usable = W - padL - padR;
      const frac = Math.max(0, Math.min(1, (px - padL) / usable));
      const span = state.max.sub(state.min);
      const raw = state.min.add(span.mul(Rational.of(frac)));
      // snap to step
      const step = state.step.toNumber();
      const snapped = Math.round(raw.toNumber() / step) * step;
      const clamped = Math.max(state.min.toNumber(), Math.min(state.max.toNumber(), snapped));
      return Rational.of(clamped);
    },
    [state.step, state.min, state.max],
  );

  const pointerToValue = useCallback(
    (clientX: number) => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const scale = W / rect.width;
      return fromX((clientX - rect.left) * scale);
    },
    [fromX],
  );

  const drag = useRef(false);
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (readOnly) return;
    drag.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const v = pointerToValue(e.clientX);
    if (v) onChange(v);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drag.current || readOnly) return;
    const v = pointerToValue(e.clientX);
    if (v) onChange(v);
  };
  const onPointerUp = () => {
    drag.current = false;
  };

  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (readOnly) return;
    const step = state.step;
    let next: Rational | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = state.value.add(step);
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = state.value.sub(step);
    if (e.key === 'Home') next = state.min;
    if (e.key === 'End') next = state.max;
    if (next) {
      e.preventDefault();
      if (next.cmp(state.min) >= 0 && next.cmp(state.max) <= 0) onChange(next);
    }
  };

  const tickValues = useMemo(() => ticks(state), [state]);
  const markerX = toX(state.value);
  const markX = state.mark ? toX(state.mark) : null;
  const startX = state.addend.isZero() ? null : toX(state.value.sub(state.addend));

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      role="slider"
      aria-label={`Number line position. Current value ${displayNum(state.value)}. Use arrow keys to move.`}
      aria-valuemin={state.min.toNumber()}
      aria-valuemax={state.max.toNumber()}
      aria-valuenow={state.value.toNumber()}
      aria-valuetext={displayNum(state.value)}
      tabIndex={readOnly ? -1 : 0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      data-testid={`${idPrefix}-svg`}
      style={{ touchAction: 'none', cursor: readOnly ? 'default' : 'pointer' }}
    >
      <line x1={padL - 10} y1={y} x2={W - padR + 10} y2={y} stroke="var(--ink)" strokeWidth={2} strokeLinecap="round" />
      <path d={`M${W - padR + 10} ${y} l-7 -5 v10 z`} fill="var(--ink)" />
      <path d={`M${padL - 10} ${y} l7 -5 v10 z`} fill="var(--ink)" />
      {tickValues.map((t, i) => {
        const x = toX(t);
        const label = t.toString();
        return (
          <g key={i}>
            <line x1={x} y1={y - 5} x2={x} y2={y + 5} stroke="var(--line-strong)" strokeWidth={1.5} />
            <text x={x} y={y + 22} textAnchor="middle" className="axis-label" style={{ fontSize: 11 }}>
              {label}
            </text>
          </g>
        );
      })}
      {/* jump arc */}
      {startX !== null && (
        <g data-testid={`${idPrefix}-jump`}>
          <path
            d={`M${startX} ${y - 6} C ${startX} ${y - 52}, ${markerX} ${y - 52}, ${markerX} ${y - 6}`}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2.5}
            strokeDasharray="6 4"
            strokeLinecap="round"
          />
          <text x={(startX + markerX) / 2} y={y - 46} textAnchor="middle" className="axis-label" fill="var(--accent)" style={{ fontWeight: 700, fontSize: 13 }}>
            {state.addend.isNegative() ? '−' : '+'}
            {displayNum(state.addend.abs())}
          </text>
        </g>
      )}
      {markX !== null && (
        <g data-testid={`${idPrefix}-mark`}>
          <line x1={markX} y1={y - 24} x2={markX} y2={y + 8} stroke="var(--ink-muted)" strokeWidth={2} strokeDasharray="3 3" />
          <text x={markX} y={y - 30} textAnchor="middle" className="axis-label" style={{ fontSize: 11 }}>
            {displayNum(state.mark!)}
          </text>
        </g>
      )}
      {/* marker */}
      <g transform={`translate(${markerX}, ${y})`} data-testid={`${idPrefix}-marker`}>
        <circle r={11} fill="var(--brand)" stroke="var(--bg-elevated)" strokeWidth={2.5} />
        <circle r={4} fill="var(--bg-elevated)" />
      </g>
      <g transform={`translate(${markerX}, ${y - 46})`}>
        <rect x={-26} y={-15} width={52} height={24} rx={8} fill="var(--ink)" data-testid={`${idPrefix}-bubble`} />
        <text x={0} y={2} textAnchor="middle" fill="var(--bg)" style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13 }}>
          {displayNum(state.value)}
        </text>
      </g>
    </svg>
  );
}
