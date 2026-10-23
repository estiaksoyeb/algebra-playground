import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ToolId } from './types';
import { TOOL_META } from './registry';
import { ToolStateMap, describeFor, stateFromRaw, toRaw } from './toolState';
import { ToolPanelSwitch } from './panels/ToolPanelSwitch';
import { useToolHistory } from '../ui/useAppSession';
import { useAppSession } from '../ui/useAppSession';
import { takePendingExperiment } from '../ui/experiments';
import { ExperimentRecord } from '../storage/repositories';
import { LESSON_BY_ID } from '../content/curriculum';
import { navigate } from '../ui/router';
import { Page } from '../ui/Shell';

interface Props {
  tool: ToolId;
  experimentId?: string;
}

/**
 * Full playground workspace for one tool: undo/redo/reset, saved experiments and
 * links back to related lessons. One tool state drives everything on screen.
 */
export function ToolWorkspace({ tool, experimentId }: Props) {
  const session = useAppSession();
  const meta = TOOL_META[tool];
  const experiments = useMemo(() => session.state.data.experiments.filter((e) => e.tool === tool), [session.state.data.experiments, tool]);
  const [opened, setOpened] = useState<ExperimentRecord | null>(null);
  const [opening, setOpening] = useState(Boolean(experimentId));
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);

  // Opening is keyed by experiment id: a result that arrives after the URL moved to a
  // different experiment is ignored. A plain "cancelled" boolean is unsafe here, because
  // React StrictMode runs an effect's cleanup for a render it then keeps.
  const openingFor = useRef<string | null>(experimentId ?? null);
  openingFor.current = experimentId ?? null;

  useEffect(() => {
    if (!experimentId) {
      setOpened(null);
      setOpening(false);
      return;
    }
    const handoff = takePendingExperiment(experimentId);
    const handed = handoff ? session.state.data.experiments.find((e) => e.id === experimentId) : undefined;
    if (handed) {
      setOpened(handed);
      setSaveName(handed.name);
      setOpening(false);
      return;
    }
    setOpening(true);
    session
      .getExperiment(experimentId)
      .then((e) => {
        if (openingFor.current !== experimentId) return;
        if (!e) {
          setNotice({ kind: 'error', text: 'That saved experiment no longer exists. Starting fresh.' });
          setOpened(null);
        } else if (e.tool !== tool) {
          setNotice({ kind: 'error', text: `That experiment belongs to the ${TOOL_META[e.tool as ToolId]?.name ?? e.tool} tool. Starting fresh.` });
          setOpened(null);
        } else {
          setOpened(e);
          setSaveName(e.name);
        }
        setOpening(false);
      })
      .catch(() => {
        if (openingFor.current !== experimentId) return;
        setNotice({ kind: 'error', text: 'Could not open the saved experiment — storage was unavailable.' });
        setOpened(null);
        setOpening(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experimentId, tool]);

  const initial = useMemo<ToolStateMap[ToolId]>(() => stateFromRaw(tool, opened?.state), [tool, opened]);
  const fresh = useMemo(() => stateFromRaw(tool, undefined), [tool]);
  // History belongs to one opened experiment. Keying it by experiment id (not by a
  // serialized snapshot) means the wait for storage, or a re-render at the same state,
  // can never be mistaken for "the learner opened something else" and wipe their work.
  const { history, commit, undo, redo, reset, canUndo, canRedo } = useToolHistory(initial, fresh, opened?.id ?? `new:${tool}`);
  const state = history.present;

  const saveExperiment = session.saveExperiment;
  const save = useCallback(async () => {
    setSaving(true);
    const name = saveName.trim() || `${meta.name} ${new Date().toLocaleString()}`;
    const rec = await saveExperiment({ id: opened?.id, name, tool, state: toRaw(state) });
    setSaving(false);
    if (!rec) {
      setNotice({ kind: 'error', text: 'The experiment was not saved. Storage is unavailable — see Settings.' });
      return;
    }
    setOpened(rec);
    setSaveName(rec.name);
    setNotice({ kind: 'ok', text: `Saved “${rec.name}”.` });
    if (!opened) navigate(`/playground/${tool}`, { replace: true, query: { exp: rec.id } });
  }, [saveName, opened, saveExperiment, tool, state, meta.name]);

  const relatedLessons = meta.relatedLessons.map((id) => LESSON_BY_ID[id]).filter(Boolean);

  if (opening) {
    return (
      <div className="loading-screen" role="status">
        <div className="spinner" aria-hidden="true" />
        <p>Opening your saved experiment…</p>
      </div>
    );
  }

  return (
    <Page title={meta.name}>
      <div className="tool-layout">
        <div className="stack" style={{ minWidth: 0 }}>
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <a href="#/playground">Playground</a>
            <span aria-hidden="true">/</span>
            <span>{meta.name}</span>
          </nav>
          <div className="tool-tabs" role="tablist" aria-label="Tools">
            {Object.values(TOOL_META).map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={t.id === tool}
                onClick={() => {
                  if (t.id !== tool) navigate(`/playground/${t.id}`);
                }}
              >
                {t.short}
              </button>
            ))}
          </div>
          {/* The panel's own ToolHeader renders the single page-level h1. */}
          <ToolPanelSwitch tool={tool} state={state as never} onChange={(s) => commit(s as never)} onProblem={(m) => setNotice({ kind: 'error', text: m })} />
        </div>

        <aside className="stack" aria-label="Workspace actions">
          <section className="card">
            <div className="btn-row">
              <button type="button" className="btn btn-secondary btn-sm" onClick={undo} disabled={!canUndo} data-testid="undo" aria-keyshortcuts="Control+Z">
                ↶ Undo
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={redo}
                disabled={!canRedo}
                data-testid="redo"
                aria-keyshortcuts="Control+Shift+Z"
              >
                ↷ Redo
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={reset} data-testid="reset-tool">
                Reset
              </button>
            </div>
            <p className="xsmall muted mt-2 mb-0" data-testid="current-summary">
              {describeFor(tool, state as never)}
            </p>
          </section>

          <section className="card" aria-labelledby="save-experiment">
            <h2 id="save-experiment" style={{ fontSize: 'var(--fs-md)' }}>
              {opened ? 'Saved experiment' : 'Save this setup'}
            </h2>
            <label className="field-label" htmlFor="experiment-name">
              Name
            </label>
            <input
              id="experiment-name"
              className="input"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value.slice(0, 80))}
              placeholder={`${meta.name} on this device`}
              maxLength={80}
              data-testid="experiment-name"
            />
            <button type="button" className="btn btn-block mt-3" onClick={() => void save()} disabled={saving} data-testid="save-experiment">
              {saving ? 'Saving…' : opened ? 'Update saved experiment' : 'Save experiment'}
            </button>
            {opened && (
              <button
                type="button"
                className="btn btn-secondary btn-block mt-2"
                onClick={() => {
                  setOpened(null);
                  setSaveName('');
                  navigate(`/playground/${tool}`, { replace: true });
                }}
                data-testid="save-as-new"
              >
                Save as a new experiment
              </button>
            )}
            {notice && (
              <div
                className={`feedback mt-3 ${notice.kind === 'ok' ? 'feedback-success' : notice.kind === 'error' ? 'feedback-error' : 'feedback-info'}`}
                role="status"
                data-testid="workspace-notice"
              >
                {notice.text}
              </div>
            )}
          </section>

          <section className="card" aria-labelledby="tool-experiments">
            <h2 id="tool-experiments" style={{ fontSize: 'var(--fs-md)' }}>
              This tool’s experiments
            </h2>
            {experiments.length === 0 ? (
              <p className="small muted mb-0">None yet.</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }} className="stack-sm">
                {experiments.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      className={`lesson-card ${opened?.id === e.id ? 'is-open' : ''}`}
                      onClick={() => navigate(`/playground/${tool}`, { query: { exp: e.id } })}
                      aria-current={opened?.id === e.id ? 'true' : undefined}
                      data-testid={`open-experiment-${e.id}`}
                    >
                      <span className="lesson-card-body">
                        <span className="lesson-card-title">{e.name}</span>
                        <span className="lesson-card-meta">{new Date(e.updatedAt).toLocaleString()}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card" aria-labelledby="related-lessons">
            <h2 id="related-lessons" style={{ fontSize: 'var(--fs-md)' }}>
              Learn the idea
            </h2>
            {relatedLessons.length === 0 ? (
              <p className="small muted mb-0">No linked lessons.</p>
            ) : (
              <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
                {relatedLessons.map((l) => (
                  <li key={l.id} style={{ marginBottom: 6 }}>
                    <a href={`#/learn/${l.id}`}>{l.title}</a>
                  </li>
                ))}
              </ul>
            )}
            <p className="small muted mt-3 mb-0">{meta.description}</p>
          </section>
        </aside>
      </div>
    </Page>
  );
}
