import { useTranslation } from 'react-i18next';
import { AreaDerived } from '../../tools/expressions';

/**
 * Area model: rows × cols rectangle split into cells, each showing its algebraic area.
 * Cell widths are proportional to the number of parts, not to numeric area (so a
 * negative constant still gets a visible rectangle and a clear sign).
 */
export function AreaView({ derived }: { derived: AreaDerived }) {
  const { t } = useTranslation();
  if (!derived.ok) {
    return (
      <div className="feedback feedback-error" role="alert">
        {derived.error}
      </div>
    );
  }
  const { rows, cols, cells } = derived;
  const cellW = 96;
  const cellH = 52;
  const headerW = 76;
  const headerH = 26;
  const W = headerW + cols.length * cellW;
  const H = headerH + rows.length * cellH + 34;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('tool.area.modelAria', { total: derived.total.text })} data-testid="area-svg" style={{ maxWidth: 460 }}>
      {rows.map((r, ri) =>
        cols.map((c, ci) => {
          const cell = cells.find((x) => x.row === r && x.col === c);
          return (
            <g key={`${ri}-${ci}`} transform={`translate(${headerW + ci * cellW}, ${headerH + ri * cellH})`}>
              <rect width={cellW} height={cellH} fill={ri % 2 === ci % 2 ? 'var(--brand-soft)' : 'var(--bg-sunken)'} stroke="var(--line-strong)" />
              <text x={cellW / 2} y={cellH / 2 + 6} textAnchor="middle" style={{ fontFamily: 'var(--font-math)', fontSize: 20, fontStyle: 'italic' }}>
                {cell?.product ?? ''}
              </text>
            </g>
          );
        }),
      )}
      {rows.map((r, ri) => (
        <text key={`r${ri}`} x={headerW - 8} y={headerH + ri * cellH + cellH / 2 + 6} textAnchor="end" style={{ fontFamily: 'var(--font-math)', fontStyle: 'italic', fontSize: 18 }}>
          {r}
        </text>
      ))}
      {cols.map((c, ci) => (
        <text key={`c${ci}`} x={headerW + ci * cellW + cellW / 2} y={headerH - 8} textAnchor="middle" style={{ fontFamily: 'var(--font-math)', fontStyle: 'italic', fontSize: 18 }}>
          {c}
        </text>
      ))}
      <text x={W / 2} y={H - 8} textAnchor="middle" style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13 }}>
        {t('tool.area.totalArea')} = {derived.total.text}
      </text>
    </svg>
  );
}
