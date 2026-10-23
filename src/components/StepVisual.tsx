import { useMemo, useState } from 'react';
import { LessonStep } from '../content/types';
import { ToolId } from '../tools/types';
import { ToolStateMap, stateFromRaw } from '../tools/toolState';
import { ToolWorkspaceEmbedded } from '../tools/ToolWorkspaceEmbedded';

const CALLOUT_HEADING = { tip: 'Tip', why: 'Why this works', 'watch-out': 'Watch out' } as const;

export function StepVisual({ visual }: { visual: NonNullable<LessonStep['visual']> }) {
  const tool = visual.tool as ToolId;
  const initial = useMemo(() => stateFromRaw(tool, visual.initialState ?? {}) as ToolStateMap[ToolId], [tool, visual.initialState]);
  return (
    <div className="step-visual">
      <ToolWorkspaceEmbedded tool={tool} initial={initial} />
    </div>
  );
}

export function CalmCallout({ callout }: { callout: NonNullable<LessonStep['callout']> }) {
  return (
    <div className={`callout callout-${callout.kind}`} role="note">
      <div>
        <strong>{CALLOUT_HEADING[callout.kind]}</strong>
        {callout.text}
      </div>
    </div>
  );
}

/** Optional "explore freely" switch: opens the same tool in the playground. */
export function OpenInPlayground({ tool }: { tool: ToolId }) {
  return (
    <p className="small muted mb-0">
      Want to experiment? <a href={`#/playground/${tool}`}>Open this tool in the playground</a>.
    </p>
  );
}

export function useReveal() {
  const [open, setOpen] = useState(false);
  return { open, toggle: () => setOpen((o) => !o) };
}
