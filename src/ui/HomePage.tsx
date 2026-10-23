import { useMemo } from 'react';
import { LESSON_BY_ID, LESSON_ORDER } from '../content/curriculum';
import { recommendNext } from '../engine/tutor';
import { daysUntilDue, dueReviews } from '../engine/review';
import { masteryLabel } from '../engine/mastery';
import { openExperiment } from './experiments';
import { Page } from './Shell';
import { summarizeProgress } from './useSession';
import { useAppSession } from './useAppSession';
import { IconFlask } from '../components/icons';

export function HomePage() {
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
  const mastered = Object.values(data.mastery).filter((m) => m.state === 'established').length;

  if (status === 'loading') {
    return (
      <Page title="Home">
        <div className="loading-screen" role="status">
          <div className="spinner" aria-hidden="true" />
          <p>Loading your progress…</p>
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

  return (
    <Page title="Home">
      <section className="hero">
        <span className="pill pill-brand">Start here · no account needed</span>
        <h1 style={{ marginTop: 'var(--sp-3)' }}>
          {summary.completed.size === 0 ? 'Learn algebra by moving things, not memorising rules.' : 'Welcome back.'}
        </h1>
        <p>
          Every idea is shown twice: as a picture you can touch and as symbols that update with it. Progress is stored on this device and works offline.
        </p>
        <div className="hero-actions">
          <a className="btn" href={recHref} data-testid="primary-cta">
            {recommendation.title}
          </a>
          {resumeLesson && (
            <a className="btn btn-secondary" href={`#/learn/${resumeLesson}`}>
              Continue: {titleOf(resumeLesson)}
            </a>
          )}
          <a className="btn btn-ghost" href="#/learn">
            Browse all lessons
          </a>
        </div>
      </section>

      <section className="stat-grid" style={{ marginBottom: 'var(--sp-4)' }} aria-label="Your progress at a glance">
        <div className="stat">
          <div className="stat-value">{summary.completed.size}</div>
          <div className="stat-label">of {LESSON_ORDER.length} lessons done</div>
        </div>
        <div className="stat">
          <div className="stat-value">{mastered}</div>
          <div className="stat-label">concepts mastered</div>
        </div>
        <div className="stat">
          <div className="stat-value">{summary.streakDays}</div>
          <div className="stat-label">day streak</div>
        </div>
        <div className="stat">
          <div className="stat-value">{due.length}</div>
          <div className="stat-label">reviews due</div>
        </div>
      </section>

      <div className="tile-grid">
        <section className="card">
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>Today’s suggestion</h2>
          <p className="muted">{recommendation.detail}</p>
          <a className="btn btn-block" href={recHref}>
            {recommendation.title}
          </a>
          {due.length > 0 && (
            <p className="small muted mt-2 mb-0">
              First review: {due[0].conceptId.replace(/-/g, ' ')} (due {daysUntilDue(due[0]) <= 0 ? 'now' : `in ${daysUntilDue(due[0])} days`}).
            </p>
          )}
        </section>
        <section className="card">
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>Try a visual tool</h2>
          <p className="muted">Playground tools turn equations into things you can move.</p>
          <div className="tool-card-icon" style={{ marginBottom: 'var(--sp-2)' }}>
            <IconFlask />
          </div>
          <a className="btn btn-secondary btn-block" href="#/playground">
            Open the playground
          </a>
        </section>
      </div>

      <section className="card mt-3">
        <h2 style={{ fontSize: 'var(--fs-lg)' }}>How this works</h2>
        <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
          <li>Read a short explanation, then move the visual model yourself.</li>
          <li>Practise with hints that get more specific instead of just giving the answer.</li>
          <li>A short no-hint check decides whether a concept is mastered — and it is re-checked later.</li>
          <li>Everything stays on this device. Export a backup from Settings any time.</li>
        </ul>
      </section>
    </Page>
  );
}

function titleOf(lessonId: string): string {
  return LESSON_BY_ID[lessonId]?.title ?? lessonId;
}

export function ProgressPage() {
  const session = useAppSession();
  const { data, status } = session.state;
  const summary = useMemo(() => summarizeProgress(data, LESSON_ORDER), [data]);
  const due = useMemo(() => dueReviews(Object.values(data.reviews)), [data.reviews]);
  if (status === 'loading') {
    return (
      <Page title="Progress">
        <div className="loading-screen" role="status">
          <div className="spinner" aria-hidden="true" />
          <p>Loading your progress…</p>
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
    <Page title="Progress">
      <h1>Your progress</h1>
      <p className="muted">
        Mastery comes from independent, varied practice and a short check — not from time spent. {answered} attempt{answered === 1 ? '' : 's'} recorded on this device.
      </p>
      <section className="stat-grid" style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="stat">
          <div className="stat-value">{summary.completed.size}</div>
          <div className="stat-label">lessons completed</div>
        </div>
        <div className="stat">
          <div className="stat-value">{concepts.filter((c) => c.state === 'established').length}</div>
          <div className="stat-label">concepts mastered</div>
        </div>
        <div className="stat">
          <div className="stat-value">{answered ? Math.round((correct / answered) * 100) : 0}%</div>
          <div className="stat-label">answer accuracy ({independentCorrect} independent)</div>
        </div>
        <div className="stat">
          <div className="stat-value">{due.length}</div>
          <div className="stat-label">reviews due</div>
        </div>
      </section>

      <div className="tile-grid">
        <section className="card">
          <div className="row-between" style={{ marginBottom: 'var(--sp-2)' }}>
            <h2 style={{ fontSize: 'var(--fs-lg)', margin: 0 }}>Review</h2>
            <a className="btn btn-sm" href="#/progress/review">
              {due.length ? `Start review (${due.length})` : 'Open review'}
            </a>
          </div>
          {due.length === 0 ? (
            <p className="small muted mb-0">Nothing due right now. Finish a lesson and its concepts come back for review at spaced intervals (1, 3, 7, 16, 35, 75 days).</p>
          ) : (
            <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
              {due.slice(0, 6).map((r) => (
                <li key={r.conceptId}>{r.conceptId.replace(/-/g, ' ')} — overdue by {Math.max(0, -daysUntilDue(r))} day(s)</li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>Concepts</h2>
          {concepts.length === 0 ? (
            <p className="small muted mb-0">No concepts started yet. Complete a lesson to begin.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }} data-testid="mastery-list">
              {concepts.map((c) => (
                <li key={c.conceptId} className="mastery-row">
                  <div className="mastery-name" style={{ flex: 1 }}>
                    <strong>{c.conceptId.replace(/-/g, ' ')}</strong>
                    <span className="xsmall muted">{masteryLabel(c.state)}</span>
                  </div>
                  <div
                    className="mastery-bar"
                    role="meter"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={c.score}
                    aria-label={`${c.conceptId} mastery score`}
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
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>Recent activity</h2>
          {recent.length === 0 ? (
            <p className="small muted mb-0">Nothing yet.</p>
          ) : (
            <ul className="history-list">
              {recent.map((h, i) => (
                <li key={i}>
                  <span className="history-dot" aria-hidden="true" />
                  <span style={{ flex: 1 }}>
                    {h.detail}
                    <span className="xsmall muted" style={{ display: 'block' }}>
                      {new Date(h.at).toLocaleString()}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>Saved experiments</h2>
          {data.experiments.length === 0 ? (
            <p className="small muted mb-0">Save a playground setup to find it here.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }} className="stack-sm">
              {data.experiments.slice(0, 6).map((e) => (
                <li key={e.id} className="row-between">
                  <span className="small">{e.name}</span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => openExperiment(e.tool, e.id)}>
                    Open
                  </button>
                </li>
              ))}
            </ul>
          )}
          <a className="btn btn-secondary btn-sm mt-3" href="#/playground">
            All tools
          </a>
        </section>
      </div>
    </Page>
  );
}
