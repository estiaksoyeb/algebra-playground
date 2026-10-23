/**
 * Shared types for interactive mathematical models and playground tools.
 *
 * A tool keeps ONE mathematical state object. Both the SVG view and the symbolic
 * representation are derived from that state; operations validate and return a new
 * state or an error. This is what keeps visuals and symbols synchronized.
 */

export type ToolId =
  | 'numberline'
  | 'mystery'
  | 'balance'
  | 'tiles'
  | 'evaluator'
  | 'simplify'
  | 'area'
  | 'graph';

export interface ToolMeta {
  id: ToolId;
  name: string;
  short: string;
  description: string;
  /** concept ids related, for "learn this" links */
  relatedConcepts: string[];
  /** lesson ids suggested */
  relatedLessons: string[];
}

export interface ToolOperationResult<S> {
  ok: boolean;
  state?: S;
  error?: string;
  explanation?: string;
}

export interface HistoryState<S> {
  past: S[];
  present: S;
  future: S[];
}

export function initHistory<S>(present: S): HistoryState<S> {
  return { past: [], present, future: [] };
}

export function commitHistory<S>(h: HistoryState<S>, next: S, limit = 50): HistoryState<S> {
  return { past: [...h.past.slice(-(limit - 1)), h.present], present: next, future: [] };
}

export function undoHistory<S>(h: HistoryState<S>): HistoryState<S> {
  if (h.past.length === 0) return h;
  const prev = h.past[h.past.length - 1];
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future].slice(0, 50) };
}

export function redoHistory<S>(h: HistoryState<S>): HistoryState<S> {
  if (h.future.length === 0) return h;
  const [next, ...rest] = h.future;
  return { past: [...h.past, h.present].slice(-50), present: next, future: rest };
}
