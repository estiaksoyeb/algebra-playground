/**
 * Hash router. GitHub Pages friendly: no server rewrites needed, works under a
 * repository subpath because only the fragment is used.
 *
 * Routes:
 *   #/                     home
 *   #/learn                curriculum map
 *   #/learn/:lessonId      lesson player
 *   #/playground           tool list
 *   #/playground/:tool     tool workspace (?exp=id to open a saved experiment)
 *   #/playground/:tool?exp=:id
 *   #/progress             progress screen
 *   #/progress/review      review session
 *   #/settings             settings, backup, reset
 *   #/help                 help & how it works
 */
import { useSyncExternalStore, useMemo, useState, useEffect } from 'react';

export interface Route {
  path: string;
  parts: string[];
  query: URLSearchParams;
  hash: string;
}

function parse(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/';
  const [pathPart, queryPart] = raw.split('?');
  const path = pathPart || '/';
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  return { path, parts, query: new URLSearchParams(queryPart ?? ''), hash: raw };
}

// First snapshot must match the server/hydration snapshot (''), so it is filled on subscribe.
let current = '';

function subscribe(cb: () => void): () => void {
  current = window.location.hash;
  const handler = () => {
    current = window.location.hash;
    cb();
  };
  window.addEventListener('hashchange', handler);
  return () => window.removeEventListener('hashchange', handler);
}

function getSnapshot(): string {
  if (typeof window !== 'undefined') {
    const h = window.location.hash;
    if (h !== current) current = h;
  }
  return current;
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getSnapshot, () => '');
  return useMemo(() => parse(hash), [hash]);
}

/** Route plus the window scroll offset written by <ScrollRestoration>. */
export function useLocation(): { route: Route; scrollY: number } {
  const route = useRoute();
  const [scrollY, setScrollY] = useState<number>(() => (typeof window !== 'undefined' ? window.history.state?.scrollY ?? 0 : 0));
  useEffect(() => {
    setScrollY(typeof window !== 'undefined' ? window.history.state?.scrollY ?? 0 : 0);
  }, [route.hash]);
  return useMemo(() => ({ route, scrollY }), [route, scrollY]);
}

export function navigate(to: string, opts: { replace?: boolean; query?: Record<string, string> } = {}): void {
  const base = to.startsWith('#') ? to.slice(1) : to;
  const qs = opts.query ? new URLSearchParams(opts.query).toString() : '';
  const target = `#${base}${qs ? `${base.includes('?') ? '&' : '?'}${qs}` : ''}`;
  if (window.location.hash === target && !opts.replace) return;
  if (opts.replace) {
    const url = `${window.location.pathname}${window.location.search}${target}`;
    window.history.replaceState(null, '', url);
  } else {
    if (window.location.hash === target) return;
    window.location.hash = target.slice(1);
  }
  // replaceState does not fire hashchange, and a second navigation in the same
  // tick can race the async event: notify synchronously so the UI never lags.
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function routeHref(path: string, query?: Record<string, string>): string {
  const qs = query ? new URLSearchParams(query).toString() : '';
  return `#${path}${qs ? `?${qs}` : ''}`;
}
