import { useCallback, useMemo, useRef, useState } from 'react';
import { SessionApi, useSession } from './useSession';
import { initHistory } from '../tools/types';
import { ToolId } from '../tools/types';
import { ToolStateMap, stateFromRaw } from '../tools/toolState';
let cache: ReturnType<typeof useSession> | null = null;

/**
 * App-wide session singleton.
 *
 * The session is loaded once for the whole app and shared by every screen, so
 * navigating between Learn, Progress and the Playground never reloads or loses data.
 * React forbids sharing one hook instance, so every screen calls `useSession()` and
 * `useAppSession()` returns a stable facade around the shared instance: state reads
 * come from that instance's latest render, and calls (`saveExperiment`,
 * `progressLesson`, …) are forwarded to it.
 */
export function useAppSession(): ReturnType<typeof useSession> {
  const live = useSession();
  // Adopt the instance that has settled (loaded, or failed to load), never one still
  // loading while a settled candidate exists: a loading copy shows the empty shell and
  // may never run its own load, so saving through it would report "storage unavailable".
  //
  // Adoption is keyed on *this* render's instance only. Scanning siblings would need a
  // registry of live instances, and one kept "ready" instance would then be chosen forever
  // even after a newer one loaded fresher data (cold-load resume broke when tried).
  if (!cache || live.state.status !== 'loading' || cache.state.status === 'unavailable') cache = live;
  const chosen = cache as SessionApi;
  const target = chosen;
  // `state` must come from *this* render's hook while `chosen` is this very instance:
  // the cached instance only renders inside the component that owns it, so its own
  // `state` is the freshest one. Using the cached object's state here would pin a copy
  // of the data forever if this screen rendered while that instance was mid-load.
  const state = chosen === live ? live.state : chosen.state as SessionApi['state'];
  // Keyed on the instance itself, not on `state`: this render's `chosen` may differ
  // from the one captured when the memo last ran, and two instances that happen to
  // hold equal data must still forward calls to the one this screen actually shows.
  // Otherwise a stale facade could delete data that the visible instance never sees.
  return useMemo<SessionApi>(() => {
    const chosen = target;
    return {
      state,
      progressLesson: (...a) => chosen.progressLesson(...a),
      recordAttempt: (...a) => chosen.recordAttempt(...a),
      passMasteryCheck: (...a) => chosen.passMasteryCheck(...a),
      recordReviewResult: (...a) => chosen.recordReviewResult(...a),
      saveExperiment: (...a) => chosen.saveExperiment(...a),
      getExperiment: (...a) => chosen.getExperiment(...a),
      getRepos: () => chosen.getRepos(),
      deleteExperiment: (...a) => chosen.deleteExperiment(...a),
      addHistory: (...a) => chosen.addHistory(...a),
      setPreference: (...a) => chosen.setPreference(...a),
      refresh: () => chosen.refresh(),
      reloadAfterImport: () => chosen.reloadAfterImport(),
      clearSaveError: () => chosen.clearSaveError(),
      resetAll: () => chosen.resetAll(),
    } satisfies SessionApi;
  }, [target, state]);
}

/** Drop the cached session so the next render loads again (tests, and after a full wipe). */
export function __resetSessionForTests(): void {
  cache = null;
}

// ---------- Theme ----------

export type ThemePref = 'system' | 'light' | 'dark';

export function resolveTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref === 'light' || pref === 'dark') return pref;
  if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

/** Reads the small localStorage mirror (instant, before IndexedDB loads). */
export function storedTheme(): ThemePref {
  try {
    const v = localStorage.getItem('algebra-playground:theme');
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* storage disabled */
  }
  return 'system';
}

export function applyTheme(pref: ThemePref): void {
  const resolved = resolveTheme(pref);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#141a22' : '#f7f6f2');
}

// ---------- Per-tool state with undo/redo ----------

/**
 * History for one tool. `start` is the state the workspace opened with; continuous
 * changes can be coalesced by committing the same "step" repeatedly — every commit here
 * is one step, so sliders should call `replace`, which updates the present without
 * adding history.
 *
 * History is reset only when `startKey` changes: it names the thing being edited
 * ("experiment:<id>", or "new:<tool>"). Comparing whole state snapshots instead would
 * throw the learner's work away whenever the same experiment arrived from storage in
 * two steps during load.
 */
export function useToolHistory<T extends object>(start: T, resetTo: T = start, startKey = '') {
  // `start` is a live state; never JSON-round-trip it (that would turn `Rational`
  // instances into plain objects).
  const [history, setHistory] = useState(() => initHistory(start));
  const startRef = useRef(start);
  startRef.current = start;
  const baselineRef = useRef<T>(resetTo);
  baselineRef.current = resetTo;

  // Reset during render (not in an effect) so the first paint after opening a
  // different experiment never shows the previous one. `resetTo` is derived from the
  // live state and legitimately changes while the learner edits, so a change there
  // alone must never throw their work away.
  const openedKeyRef = useRef<string>(startKey);
  if (openedKeyRef.current !== startKey) {
    openedKeyRef.current = startKey;
    setHistory(initHistory(startRef.current));
  }

  const commit = useCallback((next: T) => {
    setHistory((h) => {
      if (JSON.stringify(h.present) === JSON.stringify(next)) return h;
      return { past: [...h.past.slice(-49), h.present], present: next, future: [] };
    });
  }, []);

  const replace = useCallback((next: T) => {
    setHistory((h) => ({ ...h, present: next }));
  }, []);

  const undo = useCallback(() => {
    setHistory((h) => (h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future].slice(0, 50) } : h));
  }, []);

  const redo = useCallback(() => {
    setHistory((h) => {
      if (!h.future.length) return h;
      const [next, ...rest] = h.future;
      return { past: [...h.past, h.present].slice(-50), present: next, future: rest };
    });
  }, []);

  const reset = useCallback(() => {
    setHistory((h) => ({ past: [...h.past.slice(-49), h.present], present: baselineRef.current, future: [] }));
  }, []);

  return { history, commit, replace, undo, redo, reset, setHistory, canUndo: history.past.length > 0, canRedo: history.future.length > 0 };
}

// ---------- Experiments ----------

export interface OpenedExperiment {
  id: string;
  name: string;
  tool: string;
  state: unknown;
}

const EXP_KEY = 'algebra-playground-open-experiment';

export function useOpenExperiment(): [OpenedExperiment | null, (e: OpenedExperiment | null) => void] {
  const [exp, setExp] = useState<OpenedExperiment | null>(() => {
    try {
      const raw = sessionStorage.getItem(EXP_KEY);
      return raw ? (JSON.parse(raw) as OpenedExperiment) : null;
    } catch {
      return null;
    }
  });
  const set = useCallback((e: OpenedExperiment | null) => {
    setExp(e);
    try {
      if (e) sessionStorage.setItem(EXP_KEY, JSON.stringify(e));
      else sessionStorage.removeItem(EXP_KEY);
    } catch {
      /* private mode */
    }
  }, []);
  return [exp, set];
}

/** Starting state for a tool, from an optional saved experiment payload. */
export function startStateFor(tool: ToolId, raw: unknown): ToolStateMap[ToolId] {
  return stateFromRaw(tool, raw);
}
