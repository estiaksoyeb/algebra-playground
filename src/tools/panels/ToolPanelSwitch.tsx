import { HistoryState, ToolId } from '../types';
import { ToolStateMap } from '../toolState';
import { NumberLinePanel } from './NumberLinePanel';
import { BalancePanel } from './BalancePanel';
import { TilesPanel } from './TilesPanel';
import { MysteryPanel } from './MysteryPanel';
import { EvaluatorPanel } from './EvaluatorPanel';
import { AreaPanel } from './AreaPanel';
import { GraphPanel } from './GraphPanel';

interface Props<T extends ToolId> {
  tool: T;
  state: ToolStateMap[T];
  onChange: (s: ToolStateMap[T]) => void;
  onProblem?: (message: string) => void;
  /** 2 when the tool is embedded under a lesson page heading. */
  level?: 1 | 2;
  /**
   * True when the tool is inside a lesson step. Panels use it to drop repeated state
   * prose, developer notes and controls that belong to another topic (e.g. x in a
   * numbers lesson).
   */
  embedded?: boolean;
}

/** Renders the right panel for a tool. The panel receives and returns the same state. */
export function ToolPanelSwitch({ tool, state, onChange, onProblem, level, embedded }: Props<ToolId>) {
  switch (tool) {
    case 'numberline':
      return <NumberLinePanel level={level} embedded={embedded} state={state as ToolStateMap['numberline']} onChange={onChange as (s: ToolStateMap['numberline']) => void} onProblem={onProblem} />;
    case 'mystery':
      return <MysteryPanel level={level} embedded={embedded} state={state as ToolStateMap['mystery']} onChange={onChange as (s: ToolStateMap['mystery']) => void} onProblem={onProblem} />;
    case 'balance': {
      const panelProps = {
        history: { past: [], present: state as ToolStateMap['balance'], future: [] } as HistoryState<ToolStateMap['balance']>,
        onChange: (h: HistoryState<ToolStateMap['balance']>) => onChange(h.present),
        onProblem,
      };
      return <BalancePanel level={level} embedded={embedded} {...panelProps} />;
    }
    case 'tiles':
      return <TilesPanel level={level} embedded={embedded} state={state as ToolStateMap['tiles']} onChange={onChange as (s: ToolStateMap['tiles']) => void} onProblem={onProblem} />;
    case 'evaluator':
      return <EvaluatorPanel level={level} embedded={embedded} state={state as ToolStateMap['evaluator']} onChange={onChange as (s: ToolStateMap['evaluator']) => void} mode="evaluate" />;
    case 'simplify':
      return (
        <EvaluatorPanel
          level={level}
          embedded={embedded}
          state={{ expression: (state as ToolStateMap['simplify']).expression, x: 0 }}
          onChange={(s) => onChange({ expression: s.expression })}
          mode="simplify"
        />
      );
    case 'area':
      return <AreaPanel level={level} embedded={embedded} state={state as ToolStateMap['area']} onChange={onChange as (s: ToolStateMap['area']) => void} />;
    case 'graph':
      return <GraphPanel level={level} embedded={embedded} state={state as ToolStateMap['graph']} onChange={onChange as (s: ToolStateMap['graph']) => void} />;
  }
}
