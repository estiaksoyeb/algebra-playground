import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lesson } from '../content/types';
import { LESSON_BY_ID, lessonForConcept, localizedLesson } from '../content/curriculum';
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
  const { t, i18n } = useTranslation();
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
  // Review questions come straight from the English content; show their Bengali prose when
  // it exists, but keep the exercise object (and its answer) that grading uses.
  const reviewLesson = item ? localizedLesson(item.lessonId, i18n.language) : undefined;
  const proseFor = (ex: Lesson['exercises'][number]) =>
    reviewLesson
      ? ([...reviewLesson.exercises, ...(reviewLesson.reviewExercises ?? []), ...(reviewLesson.masteryCheck ?? [])].find(
          (candidate) => candidate.id === ex.id,
        ) ?? ex)
      : ex;

  if (items.length === 0) {
    return (
      <Page title={t('review.title')}>
        <h1>{t('review.title')}</h1>
        <EmptyState level={1} icon={<IconBook />} title={t('review.emptyTitle')}>
          <p>{t('review.emptyBody')}</p>
          <a className="btn" href="#/learn">
            {t('review.goToPath')}
          </a>
        </EmptyState>
      </Page>
    );
  }

  const done = index >= items.length;

  return (
    <Page title={t('review.title')}>
      <nav className="breadcrumb" aria-label={t('lesson.breadcrumb')}>
        <a href="#/progress">{t('progress.title')}</a>
        <span aria-hidden="true">/</span>
        <span>{t('review.title')}</span>
      </nav>
      <h1>{t('review.title')}</h1>
      <p className="muted">
        {done ? t('review.complete') : t('lesson.questionOf', { current: index + 1, total: items.length })} ·{' '}
        {t('review.tally', { correct: results.correct, total: results.total })}
      </p>
      {!done && item && (
        <div className="stack">
          <div className="row-between">
            <span className={`pill ${item.dueAt ? 'pill-warning' : 'pill-brand'}`}>
              {item.dueAt ? t('review.dueNow') : t('review.needsStrengthening')}
            </span>
            <a className="small" href={`#/learn/${item.lessonId}`}>
              {t('review.revisit')}
            </a>
          </div>
          {item.exercises.map((ex) => (
            <ExerciseCard
              key={`${item.conceptId}-${ex.id}`}
              exercise={proseFor(ex)}
              lesson={reviewLesson ?? LESSON_BY_ID[item.lessonId]}
              attemptsOnExercise={data.attempts.filter((a) => a.exerciseId === ex.id).length}
              hintsShown={0}
              conceptAttempts={data.attempts.filter((a) => a.conceptId === item.conceptId)}
              mastery={data.mastery[item.conceptId]}
              submitLabel={t('tool.check')}
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
              {t('review.stopForNow')}
            </button>
            <button type="button" className="btn btn-primary-next" onClick={() => setIndex((i) => i + 1)} data-testid="review-next">
              {index + 1 < items.length ? t('exercise.nextQuestion') : t('review.finish')}
            </button>
          </div>
        </div>
      )}
      {done && (
        <section className="card stack">
          <h2>{t('review.finished')}</h2>
          <p>{t('review.finishedBody', { correct: results.correct, total: results.total })}</p>
          <div className="btn-row">
            <a className="btn" href="#/progress">
              {t('review.backToProgress')}
            </a>
            <a className="btn btn-secondary" href="#/learn">
              {t('review.keepLearning')}
            </a>
          </div>
        </section>
      )}
    </Page>
  );
}
