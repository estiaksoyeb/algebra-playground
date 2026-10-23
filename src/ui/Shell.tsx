import { ReactNode, useEffect, useRef } from 'react';
import { useLocation, useRoute } from './router';
import { SaveStatus } from './useSession';
import { IconBook, IconChart, IconFlask, IconHome } from '../components/icons';

const NAV = [
  { path: '/', label: 'Home', icon: IconHome },
  { path: '/learn', label: 'Learn', icon: IconBook },
  { path: '/playground', label: 'Playground', icon: IconFlask },
  { path: '/progress', label: 'Progress', icon: IconChart },
];

function isActive(routePath: string, itemPath: string): boolean {
  if (itemPath === '/') return routePath === '/' || routePath === '';
  return routePath === itemPath || routePath.startsWith(`${itemPath}/`);
}

export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="30" height="30" rx="9" fill="var(--brand)" />
      <path d="M9 22 L15.5 10 L22 22" stroke="var(--bg-elevated)" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.4 18.4 h8.2" stroke="var(--bg-elevated)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function SaveIndicator({ status, error, onRetry }: { status: SaveStatus; error?: string; onRetry?: () => void }) {
  const label =
    status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : status === 'error' ? 'Not saved' : 'Ready';
  return (
    <span className="save-indicator" data-status={status} role="status" aria-live="polite" title={error ?? 'Progress is stored on this device'}>
      <span className="dot" aria-hidden="true" />
      <span>{label}</span>
      {status === 'error' && onRetry && (
        // Retrying saves is a real action: keep the full 44px target even in the header.
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>
          Retry
        </button>
      )}
    </span>
  );
}

export function AppHeader({ saveStatus, saveError }: { saveStatus: SaveStatus; saveError?: string }) {
  const { route } = useLocation();
  return (
    <header className="app-header">
      <a className="brand" href="#/" aria-label="Algebra Playground home">
        <BrandMark />
        <span>Algebra Playground</span>
      </a>
      <nav className="desktop-nav" aria-label="Main">
        {NAV.map((item) => (
          <a key={item.path} href={`#${item.path}`} aria-current={isActive(route.path, item.path) ? 'page' : undefined}>
            {item.label}
          </a>
        ))}
      </nav>
      <div className="header-actions">
        <SaveIndicator status={saveStatus} error={saveError} />
        <a className="btn btn-icon" href="#/settings" aria-label="Settings" title="Settings">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3.2" />
            <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
          </svg>
        </a>
      </div>
    </header>
  );
}

export function BottomNav() {
  const { route } = useLocation();
  return (
    <nav className="bottom-nav" aria-label="Main">
      {NAV.map((item) => {
        const Icon = item.icon;
        const active = isActive(route.path, item.path);
        return (
          <a key={item.path} href={`#${item.path}`} aria-current={active ? 'page' : undefined}>
            <Icon />
            <span>{item.label}</span>
          </a>
        );
      })}
    </nav>
  );
}

export function Page({ children, title }: { children: ReactNode; title?: string }) {
  const route = useRoute();
  useEffect(() => {
    document.title = title ? `${title} · Algebra Playground` : 'Algebra Playground';
  }, [title]);
  // Each route change moves keyboard/screen-reader focus to the page heading.
  const mainRef = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const h = mainRef.current?.querySelector<HTMLElement>('h1');
    if (h) {
      h.tabIndex = -1;
      h.focus({ preventScroll: true });
    }
  }, [route.hash]);
  return (
    <div className="page" ref={mainRef}>
      {children}
    </div>
  );
}
