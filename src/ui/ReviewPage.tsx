import { useMemo, useState } from 'react';
import { Lesson } from '../content/types';
import { LESSON_BY_ID, lessonForConcept } from '../content/curriculum';
import { ExerciseCard } from '../components/ExerciseCard';
import { dueReviews, isDue } from '../engine/review';
import { navigate } from './router';
import { Page } from './Shell';
import { useAppSession } from './useAppSession';
import { EmptyState } from '../components/Sheet';
import { IconBook } from '../components/icons';

interface ReviewItem {
  conceptId: string;
  lessonId: string;
  exercises: Lesson['exercises'];
  dueAt?: string;
}

/** Review session: due concepts first, then "needs review" concepts, then recent lessons. */
export function ReviewPage() {
  const session = useAppSession();
  const { data } = session.state;
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<{ correct: number; total: number }>({ correct: 0, total: 0 });

  const items = useMemo<ReviewItem[]>(() => {
    const now = new Date();
    const due = dueReviews(Object.values(data.reviews), now);
    const needs = Object.values(data.mastery).filter((m) => m.state === 'needs-review').map((m) => m.conceptId);
    const dueIds = new Set(due.map((r) => r.conceptId));
    const order = [...due.map((r) => r.conceptId), ...needs.filter((c) => !dueIds.has(c))];
    const built: ReviewItem[] = [];
    for (const conceptId of order) {
      const lesson = lessonForConcept(conceptId);
      if (!lesson) continue;
      const reviewExercises = (lesson.reviewExercises ?? []).filter((e) => e.conceptId === conceptId);
      const fallback = lesson.exercises.filter((e) => e.conceptId === conceptId).slice(0, 1);
      const exercises = (reviewExercises.length ? reviewExercises : fallback).slice(0, 1);
      if (exercises.length === 0) continue;
      const rec = data.reviews[conceptId];
      built.push({ conceptId, lessonId: lesson.id, exercises, dueAt: rec && isDue(rec, now) ? rec.dueAt : undefined });
    }
    return built;
  }, [data.reviews, data.mastery]);

  const item = items[index];

  if (items.length === 0) {
    return (
      <Page title="Review">
        <h1>Review</h1>
        <EmptyState level={1} icon={<IconBook />} title="Nothing to review yet">
          <p>Finish a lesson and its key ideas will come back here. Reviews get further apart each time you get them right: 1, 3, 7, 16, 35, then 75 days.</p>
          <a className="btn" href="#/learn">
            Go to the learning path
          </a>
        </EmptyState>
      </Page>
    );
  }

  const done = index >= items.length;

  return (
    <Page title="Review">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <a href="#/progress">Progress</a>
        <span aria-hidden="true">/</span>
        <span>Review</span>
      </nav>
      <h1>Review</h1>
      <p className="muted">
        {done ? 'Review complete.' : `Question ${index + 1} of ${items.length}`} · {results.correct}/{results.total} correct so far
      </p>
      {!done && item && (
        <div className="stack">
          <div className="row-between">
            <span className={`pill ${item.dueAt ? 'pill-warning' : 'pill-brand'}`}>{item.dueAt ? 'Due now' : 'Needs strengthening'}</span>
            <a className="small" href={`#/learn/${item.lessonId}`}>
              Revisit lesson
            </a>
          </div>
          {item.exercises.map((ex) => (
            <ExerciseCard
              key={`${item.conceptId}-${ex.id}`}
              exercise={ex}
              lesson={LESSON_BY_ID[item.lessonId]}
              attemptsOnExercise={data.attempts.filter((a) => a.exerciseId === ex.id).length}
              hintsShown={0}
              conceptAttempts={data.attempts.filter((a) => a.conceptId === item.conceptId)}
              mastery={data.mastery[item.conceptId]}
              submitLabel="Check"
              onSubmit={async (input) => {
                // The score only moves once the result is stored; a failed write leaves the
                // card editable and the tally unchanged.
                const saved = await session.recordReviewResult(item.conceptId, { correct: input.correct, assisted: input.hintsUsed > 0 });
                if (saved) setResults((r) => ({ correct: r.correct + (input.correct ? 1 : 0), total: r.total + 1 }));
                return saved;
              }}
              onHint={() => undefined}
            />
          ))}
          <div className="lesson-footer">
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/progress')}>
              Stop for now
            </button>
            <button type="button" className="btn btn-primary-next" onClick={() => setIndex((i) => i + 1)} data-testid="review-next">
              {index + 1 < items.length ? 'Next question' : 'Finish review'}
            </button>
          </div>
        </div>
      )}
      {done && (
        <section className="card stack">
          <h2>Review finished</h2>
          <p>
            You answered {results.correct} of {results.total} correctly. Concepts you got right move to a longer interval; ones you missed return soon.
          </p>
          <div className="btn-row">
            <a className="btn" href="#/progress">
              Back to progress
            </a>
            <a className="btn btn-secondary" href="#/learn">
              Keep learning
            </a>
          </div>
        </section>
      )}
    </Page>
  );
}
