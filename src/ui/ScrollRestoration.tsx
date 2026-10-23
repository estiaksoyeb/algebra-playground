import { useEffect, useLayoutEffect, useRef } from 'react';
import { useRoute } from './router';

/**
 * Saves the scroll position before navigating away and restores it (or scrolls to top
 * for a new page) after the route changes. Uses the hash route as the key so going
 * "back" in a long lesson returns to where the learner was.
 */
export function ScrollRestoration() {
  const route = useRoute();
  const previous = useRef<string | null>(null);

  useEffect(() => {
    const save = () => {
      try {
        window.history.replaceState({ ...(window.history.state ?? {}), scrollY: window.scrollY }, '');
      } catch {
        /* ignore */
      }
    };
    // Every hash change records the outgoing position for the route being left.
    window.addEventListener('hashchange', save);
    window.addEventListener('pagehide', save);
    return () => {
      window.removeEventListener('hashchange', save);
      window.removeEventListener('pagehide', save);
    };
  }, []);

  useLayoutEffect(() => {
    const key = route.hash;
    if (previous.current === null) {
      previous.current = key;
      return;
    }
    if (previous.current === key) return;
    const isNewPage = key.split('?')[0] !== previous.current.split('?')[0];
    previous.current = key;
    const saved = (window.history.state as { scrollY?: number } | null)?.scrollY;
    if (isNewPage || typeof saved !== 'number') {
      window.scrollTo(0, 0);
    } else {
      window.scrollTo(0, saved);
    }
  }, [route.hash]);

  return null;
}
