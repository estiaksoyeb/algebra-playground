import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CURRICULUM, LESSON_ORDER, localizedConceptName, localizedLesson, localizedWorld, WORLD_BY_ID } from '../content/curriculum';
import { recommendNext } from '../engine/tutor';
import { daysUntilDue, dueReviews } from '../engine/review';
import { openExperiment } from './experiments';
import { Page } from './Shell';
import { summarizeProgress } from './useSession';
import { useAppSession } from './useAppSession';
import { IconFlask } from '../components/icons';
import { localizedMasteryLabel } from './LessonPage';
import { formatDateTime } from '../i18n';

export function HomePage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const session = useAppSession();
  const { data, status } = session.state;
  const summary = useMemo(() => summarizeProgress(data, LESSON_ORDER), [data]);
  const due = useMemo(() => dueReviews(Object.values(data.reviews)), [data.reviews]);
  const recommendation = useMemo(
    () =>
      recommendNext({
        dueReviews: due,
        conceptsNeedingReview: Object.values(data.mastery)
          .filter((m) => m.state === 'needs-review')
          .map((m) => m.state),
        nextIncompleteLessonId: summary.nextIncomplete,
        lastLessonId: summary.lastStarted,
        provisionalConcepts: Object.values(data.mastery)
          .filter((m) => m.state === 'provisional')
          .map((m) => m.conceptId),
        hasAnyProgress: Object.keys(data.lessonStates).length > 0,
      }),
    [data, due, summary],
  );
  const resumeLesson = summary.lastStarted && !summary.completed.has(summary.lastStarted) ? summary.lastStarted : null;
  const showResume = resumeLesson && (!recommendation.lessonId || recommendation.lessonId !== resumeLesson);
  const mastered = Object.values(data.mastery).filter((m) => m.state === 'established').length;
  const activeLesson = summary.nextIncomplete ? CURRICULUM.lessons.find((l) => l.id === summary.nextIncomplete) : null;
  const activeWorld = activeLesson && WORLD_BY_ID[activeLesson.world] ? localizedWorld(WORLD_BY_ID[activeLesson.world], lang) : null;
  const activeWorldLessons = activeLesson ? CURRICULUM.lessons.filter((l) => l.world === activeLesson.world) : [];
  const completedInActiveWorld = activeWorldLessons.filter((l) => summary.completed.has(l.id)).length;

  if (status === 'loading') {
    return (
      <Page title={t('nav.home')}>
        <div className="loading-screen" role="status">
          <div className="spinner" aria-hidden="true" />
          <p>{t('home.loading')}</p>
        </div>
      </Page>
    );
  }

  const recHref =
    recommendation.kind === 'review'
      ? '#/progress/review'
      : recommendation.kind === 'mastery-check' || recommendation.kind === 'continue-lesson'
        ? `#/learn/${recommendation.lessonId ?? summary.nextIncomplete}`
        : '#/playground';

  const firstDue = due[0];
  const days = firstDue ? daysUntilDue(firstDue) : 0;

  return (
    <Page title={t('nav.home')}>
      <section className="hero">
        <span className="pill pill-brand">{t('home.heroPill')}</span>
        <h1 style={{ marginTop: 'var(--sp-3)' }}>
          {summary.completed.size === 0 ? t('home.heroFresh') : t('home.heroBack')}
        </h1>
        <p>{t('home.heroBody')}</p>
        <div className="hero-actions">
          <a className="btn" href={recHref} data-testid="primary-cta">
            {recommendation.title}
          </a>
          {showResume && (
            <a className="btn btn-secondary" href={`#/learn/${resumeLesson}`}>
              {t('home.continueLesson', { title: titleOf(resumeLesson, lang) })}
            </a>
          )}
          <a className="btn btn-ghost" href="#/learn">
            {t('home.browseAll')}
          </a>
        </div>
      </section>

      <section className="stat-grid" style={{ marginBottom: 'var(--sp-4)' }} aria-label={t('home.statsLabel')}>
        <div className="stat">
          <div className="stat-value">{summary.completed.size}</div>
          <div className="stat-label">{t('home.lessonsDone', { total: LESSON_ORDER.length })}</div>
        </div>
        <div className="stat">
          <div className="stat-value">{mastered}</div>
          <div className="stat-label">{t('home.conceptsMastered')}</div>
        </div>
        <div className="stat">
          <div className="stat-value">{summary.streakDays}</div>
          <div className="stat-label">{t('home.dayStreak')}</div>
        </div>
        <div className="stat">
          <div className="stat-value">{due.length}</div>
          <div className="stat-label">{t('home.reviewsDue')}</div>
        </div>
      </section>

      <div className="tile-grid">
        <section className="card">
          <div className="row-between mb-2" style={{ gap: 'var(--sp-2)' }}>
            <h2 style={{ fontSize: 'var(--fs-lg)', margin: 0 }}>{t('home.suggestion')}</h2>
            {activeWorld && activeWorldLessons.length > 0 && (
              <span className="pill pill-brand small">
                {t('home.currentFocus', {
                  world: activeWorld.title,
                  done: completedInActiveWorld,
                  total: activeWorldLessons.length,
                })}
              </span>
            )}
          </div>
          <p className="muted">{recommendation.detail}</p>
          <a className="btn btn-block" href={recHref}>
            {recommendation.title}
          </a>
          {firstDue && (
            <p className="small muted mt-2 mb-0">
              {days <= 0
                ? t('home.firstReviewNow', { concept: localizedConceptName(firstDue.conceptId, lang) })
                : t('home.firstReviewLater', { concept: localizedConceptName(firstDue.conceptId, lang), count: days })}
            </p>
          )}
        </section>
        <section className="card">
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>{t('home.tryTool')}</h2>
          <p className="muted">{t('home.tryToolBody')}</p>
          <div className="tool-card-icon" style={{ marginBottom: 'var(--sp-2)' }}>
            <IconFlask />
          </div>
          <a className="btn btn-secondary btn-block" href="#/playground">
            {t('home.openPlayground')}
          </a>
        </section>
      </div>

      <section className="card mt-3">
        <h2 style={{ fontSize: 'var(--fs-lg)' }}>{t('home.howHeading')}</h2>
        <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
          <li>{t('home.howBullet1')}</li>
          <li>{t('home.howBullet2')}</li>
          <li>{t('home.howBullet3')}</li>
          <li>{t('home.howBullet4')}</li>
        </ul>
      </section>
    </Page>
  );
}

function titleOf(lessonId: string, lang: string): string {
  // The English source carries the id; only the title is swapped per language.
  return localizedLesson(lessonId, lang)?.title ?? lessonId;
}

export function ProgressPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const session = useAppSession();
  const { data, status } = session.state;
  const summary = useMemo(() => summarizeProgress(data, LESSON_ORDER), [data]);
  const due = useMemo(() => dueReviews(Object.values(data.reviews)), [data.reviews]);
  if (status === 'loading') {
    return (
      <Page title={t('progress.title')}>
        <div className="loading-screen" role="status">
          <div className="spinner" aria-hidden="true" />
          <p>{t('progress.loading')}</p>
        </div>
      </Page>
    );
  }
  const concepts = Object.values(data.mastery).sort((a, b) => b.score - a.score);
  const recent = [...data.history].reverse().slice(0, 12);
  const answered = data.attempts.length;
  const correct = data.attempts.filter((a) => a.correct).length;
  const independentCorrect = data.attempts.filter((a) => a.correct && a.hintsUsed === 0).length;

  return (
    <Page title={t('progress.title')}>
      <h1>{t('progress.heading')}</h1>
      <p className="muted">{t('progress.intro', { count: answered })}</p>
      <section className="stat-grid" style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="stat">
          <div className="stat-value">{summary.completed.size}</div>
          <div className="stat-label">{t('progress.lessonsCompleted')}</div>
        </div>
        <div className="stat">
          <div className="stat-value">{concepts.filter((c) => c.state === 'established').length}</div>
          <div className="stat-label">{t('home.conceptsMastered')}</div>
        </div>
        <div className="stat">
          <div className="stat-value">{answered ? Math.round((correct / answered) * 100) : 0}%</div>
          <div className="stat-label">{t('progress.accuracy', { count: independentCorrect })}</div>
        </div>
        <div className="stat">
          <div className="stat-value">{due.length}</div>
          <div className="stat-label">{t('home.reviewsDue')}</div>
        </div>
      </section>

      <div className="tile-grid">
        <section className="card">
          <div className="row-between" style={{ marginBottom: 'var(--sp-2)' }}>
            <h2 style={{ fontSize: 'var(--fs-lg)', margin: 0 }}>{t('progress.reviewHeading')}</h2>
            <a className="btn btn-sm" href="#/progress/review">
              {due.length ? t('progress.startReview', { count: due.length }) : t('progress.openReview')}
            </a>
          </div>
          {due.length === 0 ? (
            <p className="small muted mb-0">{t('progress.nothingDue')}</p>
          ) : (
            <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
              {due.slice(0, 6).map((r) => (
                <li key={r.conceptId}>
                  {t('progress.overdue', {
                    concept: localizedConceptName(r.conceptId, lang),
                    count: Math.max(0, -daysUntilDue(r)),
                  })}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>{t('progress.conceptsHeading')}</h2>
          {concepts.length === 0 ? (
            <p className="small muted mb-0">{t('progress.noConcepts')}</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }} data-testid="mastery-list">
              {concepts.map((c) => (
                <li key={c.conceptId} className="mastery-row">
                  <div className="mastery-name" style={{ flex: 1 }}>
                    <strong>{localizedConceptName(c.conceptId, lang)}</strong>
                    <span className="xsmall muted">{localizedMasteryLabel(c.state, t)}</span>
                  </div>
                  <div
                    className="mastery-bar"
                    role="meter"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={c.score}
                    aria-label={t('progress.masteryScore', { concept: localizedConceptName(c.conceptId, lang) })}
                    style={{ ['--mastery-color' as string]: c.state === 'established' ? 'var(--success)' : c.state === 'needs-review' ? 'var(--warning)' : 'var(--brand)' }}
                  >
                    <div style={{ width: `${c.score}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="tile-grid mt-3">
        <section className="card">
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>{t('progress.recentHeading')}</h2>
          {recent.length === 0 ? (
            <p className="small muted mb-0">{t('progress.nothingYet')}</p>
          ) : (
            <ul className="history-list">
              {recent.map((h, i) => (
                <li key={i}>
                  <span className="history-dot" aria-hidden="true" />
                  <span style={{ flex: 1 }}>
                    {h.detail}
                    <span className="xsmall muted" style={{ display: 'block' }}>
                      {formatDateTime(h.at, lang)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>{t('progress.experimentsHeading')}</h2>
          {data.experiments.length === 0 ? (
            <p className="small muted mb-0">{t('progress.noExperiments')}</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }} className="stack-sm">
              {data.experiments.slice(0, 6).map((e) => (
                <li key={e.id} className="row-between">
                  <span className="small">{e.name}</span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => openExperiment(e.tool, e.id)}>
                    {t('progress.open')}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <a className="btn btn-secondary btn-sm mt-3" href="#/playground">
            {t('progress.allTools')}
          </a>
        </section>
      </div>
    </Page>
  );
}
