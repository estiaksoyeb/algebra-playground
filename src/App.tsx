import { Component, ErrorInfo, ReactNode, useEffect, useMemo } from 'react';
import { AppHeader, BottomNav, Page } from './ui/Shell';
import { HomePage, ProgressPage } from './ui/HomePage';
import { LearnMapPage } from './ui/LearnPage';
import { LessonPage } from './ui/LessonPage';
import { PlaygroundPage } from './ui/PlaygroundPage';
import { SettingsPage } from './ui/SettingsPage';
import { HelpPage } from './ui/HelpPage';
import { ReviewPage } from './ui/ReviewPage';
import { useRoute } from './ui/router';
import { ScrollRestoration } from './ui/ScrollRestoration';
import { applyTheme, storedTheme, useAppSession } from './ui/useAppSession';
import { isToolId } from './tools/registry';
import { ToolWorkspace } from './tools/ToolWorkspace';
import { EmptyState } from './components/Sheet';
import { IconBook } from './components/icons';

export function App() {
  const route = useRoute();
  const session = useAppSession();
  const { saveStatus, saveError, data } = session.state;

  useEffect(() => {
    const pref = data.profile?.preferences?.theme;
    const theme = pref === 'light' || pref === 'dark' || pref === 'system' ? pref : storedTheme();
    applyTheme(theme);
  }, [data.profile?.preferences?.theme]);

  const page = useMemo(() => {
    const [first, second] = route.parts;
    if (!first) return <HomePage />;
    if (first === 'learn') return second ? <LessonPage lessonId={second} /> : <LearnMapPage />;
    if (first === 'playground') {
      if (!second) return <PlaygroundPage />;
      if (isToolId(second)) return <ToolWorkspace key={second} tool={second} experimentId={route.query.get('exp') ?? undefined} />;
      return <NotFound what="tool" />;
    }
    if (first === 'progress') return second === 'review' ? <ReviewPage /> : <ProgressPage />;
    if (first === 'settings') return <SettingsPage />;
    if (first === 'help') return <HelpPage />;
    return <NotFound what="page" />;
  }, [route]);

  return (
    <ErrorBoundary key={route.path}>
      <div className="app-shell">
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <AppHeader saveStatus={saveStatus} saveError={saveError} />
        <main className="app-main" id="main" tabIndex={-1}>
          {page}
        </main>
        <BottomNav />
        <ScrollRestoration />
      </div>
    </ErrorBoundary>
  );
}

/**
 * Last-resort boundary: a bug in one screen must never lock the learner out of their
 * data. Offers a reload, and a link home without losing anything (nothing is in memory
 * that is not already saved).
 */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    // Deterministic, local-only diagnostics; nothing is sent anywhere.
    console.error('Algebra Playground screen error:', error.message, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="app-shell">
        <main className="app-main">
          <div className="page">
            <Page title="Something went wrong">
              <div className="card stack" role="alert">
                <h1>This screen hit a problem</h1>
                <p>Your saved progress is safe. Reloading usually fixes it; if not, you can still continue from another screen.</p>
                <p className="small muted">Details: {this.state.error.message}</p>
                <div className="btn-row">
                  <button type="button" className="btn" onClick={() => window.location.reload()}>
                    Reload
                  </button>
                  <a className="btn btn-secondary" href="#/" onClick={() => this.setState({ error: null })}>
                    Go home
                  </a>
                </div>
              </div>
            </Page>
          </div>
        </main>
      </div>
    );
  }
}

function NotFound({ what }: { what: string }) {
  return (
    <Page title="Not found">
      <EmptyState level={1} icon={<IconBook />} title={`That ${what} does not exist`}>
        <p>The link may be out of date.</p>
        <a className="btn" href="#/">
          Go home
        </a>
      </EmptyState>
    </Page>
  );
}
