import { useMemo } from 'react';
import { ToolId } from './types';
import { ToolStateMap, describeFor, stateFromRaw } from './toolState';
import { ToolPanelSwitch } from './panels/ToolPanelSwitch';
import { useToolHistory } from '../ui/useAppSession';

/**
 * Inline tool used inside lesson steps. It is fully interactive but keeps its own
 * local undo history and never saves; the lesson's "open in playground" link offers
 * the full workspace (saving experiments, related lessons).
 */
export function ToolWorkspaceEmbedded({ tool, initial }: { tool: ToolId; initial: ToolStateMap[ToolId] }) {
  const start = useMemo(() => initial, [initial]);
  const { history, commit, undo, redo, reset, canUndo, canRedo } = useToolHistory(start);
  const state = history.present;
  const label = describeFor(tool, state as never);

  return (
    <div className="embedded-tool">
      <ToolPanelSwitch tool={tool} level={2} state={state as never} onChange={(s) => commit(s as never)} />
      <div className="row-between embedded-tool-bar">
        <span className="small muted">{label}</span>
        <div className="btn-row">
          <button type="button" className="btn btn-ghost btn-sm" onClick={undo} disabled={!canUndo} aria-label="Undo">
            ↶ Undo
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={redo} disabled={!canRedo} aria-label="Redo">
            ↷ Redo
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={reset} aria-label="Reset tool">
            Reset
          </button>
        </div>
      </div>
      <p className="small muted embedded-tool-note">
        Try it here. <a href={`#/playground/${tool}`}>Open in the playground</a> to save your experiment.
      </p>
    </div>
  );
}

export { stateFromRaw };
