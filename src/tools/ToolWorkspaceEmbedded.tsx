import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ToolId } from './types';
import { ToolStateMap, describeFor, stateFromRaw } from './toolState';
import { ToolPanelSwitch } from './panels/ToolPanelSwitch';
import { useToolHistory } from '../ui/useAppSession';

/**
 * Inline tool used inside lesson steps. It is fully interactive but keeps its own
 * local undo history and never saves. Deliberately quiet: no raw state string, no
 * "open in the playground" hand-off inside a teaching step, no repeated state prose
 * from the panel — the lesson text and its callout already carry the explanation.
 */
export function ToolWorkspaceEmbedded({ tool, initial }: { tool: ToolId; initial: ToolStateMap[ToolId] }) {
  const { t } = useTranslation();
  const start = useMemo(() => initial, [initial]);
  const { history, commit, undo, redo, reset, canUndo, canRedo } = useToolHistory(start);
  const state = history.present;
  // Kept for screen readers only: the visible summary competed with the lesson text.
  const label = describeFor(tool, state as never);

  return (
    <div className="embedded-tool">
      <ToolPanelSwitch tool={tool} level={2} embedded state={state as never} onChange={(s) => commit(s as never)} />
      <div className="embedded-tool-bar">
        <span className="sr-only" data-testid="embedded-tool-summary">
          {label}
        </span>
        <div className="btn-row">
          <button type="button" className="btn btn-ghost btn-sm" onClick={undo} disabled={!canUndo} aria-label={t('tool.undo')}>
            ↶ {t('tool.undo')}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={redo} disabled={!canRedo} aria-label={t('tool.redo')}>
            ↷ {t('tool.redo')}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={reset} aria-label={t('tool.reset')}>
            {t('tool.resetShort')}
          </button>
        </div>
      </div>
    </div>
  );
}

export { stateFromRaw };
