import { Component, ErrorInfo, ReactNode, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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
import { t } from './i18n';
import { isToolId } from './tools/registry';
import { ToolWorkspace } from './tools/ToolWorkspace';
import { EmptyState } from './components/Sheet';
import { IconBook } from './components/icons';

export function App() {
  const route = useRoute();
  const { t } = useTranslation();
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
      return <NotFound kind="tool" />;
    }
    if (first === 'progress') return second === 'review' ? <ReviewPage /> : <ProgressPage />;
    if (first === 'settings') return <SettingsPage />;
    if (first === 'help') return <HelpPage />;
    return <NotFound kind="page" />;
  }, [route]);

  return (
    <ErrorBoundary key={route.path}>
      <div className="app-shell">
        <a className="skip-link" href="#main">
          {t('app.skipToContent')}
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
            <Page title={t('app.errorTitle')}>
              <div className="card stack" role="alert">
                <h1>{t('app.errorTitle')}</h1>
                <p>{t('app.errorBody')}</p>
                <p className="small muted">{t('app.errorDetails', { message: this.state.error.message })}</p>
                <div className="btn-row">
                  <button type="button" className="btn" onClick={() => window.location.reload()}>
                    {t('app.reload')}
                  </button>
                  <a className="btn btn-secondary" href="#/" onClick={() => this.setState({ error: null })}>
                    {t('app.goHome')}
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

function NotFound({ kind }: { kind: 'tool' | 'page' }) {
  const { t } = useTranslation();
  return (
    <Page title={t('app.notFoundTitle')}>
      <EmptyState
        level={1}
        icon={<IconBook />}
        title={kind === 'tool' ? t('app.notFoundTool') : t('app.notFoundPage')}
      >
        <p>{t('app.notFoundBody')}</p>
        <a className="btn" href="#/">
          {t('app.backToPlayground')}
        </a>
      </EmptyState>
    </Page>
  );
}
