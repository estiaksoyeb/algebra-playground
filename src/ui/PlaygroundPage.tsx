import { useMemo, useState } from 'react';
import { useAppSession } from './useAppSession';
import { Page } from './Shell';
import { openExperiment } from './experiments';
import { ToolId } from '../tools/types';
import { TOOL_META, TOOL_LIST } from '../tools/registry';
import { stateFromRaw } from '../tools/toolState';

/** Short labels for the tool icons, keyed by tool id. */
function ToolGlyph({ id }: { id: ToolId }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  switch (id) {
    case 'numberline':
      return (
        <svg {...common}>
          <path d="M2 12h20" />
          <path d="M6 8v8M12 8v8M18 8v8" />
        </svg>
      );
    case 'balance':
      return (
        <svg {...common}>
          <path d="M12 3v16M8 20h8" />
          <path d="M4 8h16M12 3 4 8l3 5 4-5 4 5 3-5z" />
        </svg>
      );
    case 'tiles':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="14" height="6" rx="2" />
          <rect x="3" y="14" width="6" height="6" rx="1" />
          <rect x="11" y="14" width="6" height="6" rx="1" />
        </svg>
      );
    case 'graph':
      return (
        <svg {...common}>
          <path d="M3 3v18h18" />
          <path d="M6 17 18 6" />
        </svg>
      );
    case 'mystery':
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <path d="M9.5 9a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1 1-1.1 1.8v.5M12 17h.01" />
        </svg>
      );
    case 'area':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 12h18M12 3v18" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M5 6h14M5 12h9M5 18h5" />
        </svg>
      );
  }
}

export function PlaygroundPage() {
  const session = useAppSession();
  const experiments = session.state.data.experiments;
  const byTool = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of experiments) map.set(e.tool, (map.get(e.tool) ?? 0) + 1);
    return map;
  }, [experiments]);

  return (
    <Page title="Playground">
      <h1>Playground</h1>
      <p className="muted">
        Eight visual tools that do real maths. Change anything — the picture and the symbols always agree — and save a setup to come back to it.
      </p>
      <div className="playground-list">
        {TOOL_LIST.map((t) => (
          <a key={t.id} className="tool-card" href={`#/playground/${t.id}`} data-testid={`tool-card-${t.id}`}>
            <span className="tool-card-icon">
              <ToolGlyph id={t.id} />
            </span>
            <span>
              <h3>{t.name}</h3>
              <span className="small muted" style={{ display: 'block' }}>
                {t.description}
              </span>
              {byTool.get(t.id) ? (
                <span className="pill pill-brand mt-2">{byTool.get(t.id)} saved</span>
              ) : null}
            </span>
          </a>
        ))}
      </div>

      <section className="card mt-4" aria-labelledby="saved-experiments">
        <h2 id="saved-experiments" style={{ fontSize: 'var(--fs-lg)' }}>
          Saved experiments
        </h2>
        {experiments.length === 0 ? (
          <p className="small muted mb-0">Nothing saved yet. Open a tool and press “Save experiment”.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }} className="stack-sm">
            {experiments.map((e) => (
              <li key={e.id} className="row-between" style={{ gap: 'var(--sp-2)' }}>
                <span style={{ minWidth: 0 }}>
                  <strong className="small" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.name}
                  </strong>
                  <span className="xsmall muted">
                    {TOOL_META[e.tool as ToolId]?.name ?? e.tool} · {new Date(e.updatedAt).toLocaleDateString()}
                  </span>
                </span>
                <span className="btn-row" style={{ flexWrap: 'nowrap' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      if (e.tool in TOOL_META) openExperiment(e.tool, e.id);
                    }}
                  >
                    Open
                  </button>
                  <DeleteExperimentButton id={e.id} name={e.name} onDelete={session.deleteExperiment} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Page>
  );
}

/**
 * Two-step delete for one saved experiment.
 *
 * `onDelete` is passed down from `PlaygroundPage` instead of calling
 * `useAppSession()` here. Each `useAppSession()` call builds its own facade, and a
 * facade holds the session instance it was memoised against; a row that owned its own
 * facade could, after the list re-rendered, forward the delete to a *different*
 * instance than the one the list displays. The row would then disappear from storage
 * while staying on screen. One hook in the page, one handler for every row.
 */
function DeleteExperimentButton({
  id,
  name,
  onDelete,
}: {
  id: string;
  name: string;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(true)} aria-label={`Delete ${name}`}>
        Delete
      </button>
    );
  }
  return (
    <span className="btn-row" style={{ flexWrap: 'nowrap', gap: 4 }}>
      <button
        type="button"
        className="btn btn-danger btn-sm"
        onClick={async () => {
          const ok = await onDelete(id);
          setConfirming(false);
          if (!ok) alert('The experiment could not be deleted. Storage may be unavailable.');
        }}
      >
        Confirm
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)}>
        Cancel
      </button>
    </span>
  );
}

export { stateFromRaw };
