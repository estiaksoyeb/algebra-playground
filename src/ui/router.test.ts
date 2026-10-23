import { describe, it, expect, beforeEach } from 'vitest';
import { navigate, routeHref, useRoute } from './router';
import { renderHook, act } from '@testing-library/react';

describe('routeHref', () => {
  it('returns plain hash paths', () => {
    expect(routeHref('/learn')).toBe('#/learn');
  });

  it('appends query params', () => {
    expect(routeHref('/playground/graph', { exp: 'abc 123' })).toBe('#/playground/graph?exp=abc+123');
  });
});

describe('navigate', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/some/path?keep=1');
    window.location.hash = '';
  });

  it('sets the hash without a leading double #', () => {
    navigate('#/learn');
    expect(window.location.hash).toBe('#/learn');
  });

  it('accepts paths with or without the leading #', () => {
    navigate('/playground/graph');
    expect(window.location.hash).toBe('#/playground/graph');
  });

  it('joins query parameters', () => {
    navigate('/playground/graph', { query: { exp: 'x1' } });
    expect(window.location.hash).toBe('#/playground/graph?exp=x1');
  });

  it('replace keeps the path and query and notifies listeners', () => {
    let calls = 0;
    const handler = () => {
      calls++;
    };
    window.addEventListener('hashchange', handler);
    navigate('/settings', { replace: true });
    window.removeEventListener('hashchange', handler);
    expect(calls).toBe(1);
    expect(window.location.pathname).toBe('/some/path');
    expect(window.location.search).toBe('?keep=1');
    expect(window.location.hash).toBe('#/settings');
  });
});

describe('useRoute', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('parses path parts and query params', () => {
    window.location.hash = '#/playground/graph?exp=abc';
    const { result } = renderHook(() => useRoute());
    expect(result.current.path).toBe('/playground/graph');
    expect(result.current.parts).toEqual(['playground', 'graph']);
    expect(result.current.query.get('exp')).toBe('abc');
  });

  it('treats a bare hash as home', () => {
    window.location.hash = '';
    const { result } = renderHook(() => useRoute());
    expect(result.current.path).toBe('/');
    expect(result.current.parts).toEqual([]);
  });

  it('decodes percent-encoded path segments', () => {
    window.location.hash = '#/learn/lesson%201';
    const { result } = renderHook(() => useRoute());
    expect(result.current.parts).toEqual(['learn', 'lesson 1']);
  });

  it('reads the hash set after mount and follows navigation', async () => {
    window.location.hash = '#/learn';
    const { result } = renderHook(() => useRoute());
    expect(result.current.path).toBe('/learn');
    act(() => {
      window.location.hash = '/settings';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current.path).toBe('/settings');
    act(() => {
      navigate('/learn', { query: { x: '1' } });
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current.path).toBe('/learn');
    expect(result.current.query.get('x')).toBe('1');
  });

  it('replace navigation updates the route immediately', () => {
    window.location.hash = '#/learn';
    const { result } = renderHook(() => useRoute());
    expect(result.current.path).toBe('/learn');
    act(() => {
      navigate('/settings', { replace: true });
    });
    expect(result.current.path).toBe('/settings');
  });

  it('navigating to the same hash does not add history or re-render', () => {
    window.location.hash = '#/learn';
    const { result } = renderHook(() => useRoute());
    const before = window.history.length;
    act(() => {
      navigate('/learn');
    });
    expect(window.history.length).toBe(before);
    expect(result.current.path).toBe('/learn');
  });

  it('ignores empty query values gracefully', () => {
    window.location.hash = '#/help?';
    const { result } = renderHook(() => useRoute());
    expect(result.current.path).toBe('/help');
    expect([...result.current.query.keys()]).toEqual([]);
  });
});
