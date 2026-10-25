import { useMemo, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { LessonStep } from '../content/types';
import { ToolId } from '../tools/types';
import { ToolStateMap, stateFromRaw } from '../tools/toolState';
import { ToolWorkspaceEmbedded } from '../tools/ToolWorkspaceEmbedded';

const CALLOUT_KEYS = { tip: 'callout.tip', why: 'callout.why', 'watch-out': 'callout.watchOut' } as const;

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
  const { t } = useTranslation();
  return (
    <div className={`callout callout-${callout.kind}`} role="note">
      <div>
        <strong>{t(CALLOUT_KEYS[callout.kind])}</strong>
        {callout.text}
      </div>
    </div>
  );
}

/** Optional "explore freely" switch: opens the same tool in the playground. */
export function OpenInPlayground({ tool }: { tool: ToolId }) {
  return (
    <p className="small muted mb-0">
      <Trans i18nKey="callout.openInPlayground" components={{ a: <a href={`#/playground/${tool}`} /> }} />
    </p>
  );
}

export function useReveal() {
  const [open, setOpen] = useState(false);
  return { open, toggle: () => setOpen((o) => !o) };
}
