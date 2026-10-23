import { useMemo, useState } from 'react';
import { CURRICULUM, LESSON_ORDER, WORLD_BY_ID, lessonsInWorld, prerequisitesMet } from '../content/curriculum';
import { Lesson } from '../content/types';
import { Page } from './Shell';
import { useAppSession } from './useAppSession';

function LessonRow({ lesson, state, locked, current }: { lesson: Lesson; state: 'done' | 'todo' | 'current'; locked: boolean; current: boolean }) {
  return (
    <li>
      <a
        className="lesson-card"
        href={`#/learn/${lesson.id}`}
        data-locked={locked || undefined}
        data-testid={`lesson-${lesson.id}`}
      >
        <span className="lesson-status" data-state={state === 'done' ? 'done' : current ? 'current' : undefined} aria-hidden="true">
          {state === 'done' ? '✓' : current ? '▶' : lesson.order}
        </span>
        <span className="lesson-card-body">
          <span className="lesson-card-title">{lesson.title}</span>
          <span className="lesson-card-meta">
            {lesson.estimatedMinutes} min · {lesson.steps.length} steps · {lesson.exercises.length} exercises
            {locked ? ' · finish the earlier lesson first (you can still open it)' : ''}
          </span>
        </span>
        <span className="sr-only">{state === 'done' ? 'Completed' : locked ? 'Not ready yet' : ''}</span>
      </a>
    </li>
  );
}

export function LearnMapPage() {
  const session = useAppSession();
  const data = session.state.data;
  const completed = useMemo(
    () => new Set(Object.values(data.lessonStates).filter((l) => l.completed).map((l) => l.lessonId)),
    [data.lessonStates],
  );
  const started = useMemo(
    () => new Set(Object.keys(data.lessonStates)),
    [data.lessonStates],
  );
  const next = LESSON_ORDER.find((id) => !completed.has(id));
  const worlds = [...CURRICULUM.worlds].sort((a, b) => a.number - b.number);
  // Default to the world of the next lesson. The default follows the data until the learner
  // opens/closes a world explicitly, so a cold load (or an import) opens the right world.
  const [chosenWorld, setOpenWorld] = useState<string | null>(null);
  const openWorld = chosenWorld ?? (next ? CURRICULUM.lessons.find((l) => l.id === next)?.world : undefined) ?? worlds[0].id;

  return (
    <Page title="Learn">
      <header style={{ marginBottom: 'var(--sp-4)' }}>
        <h1>Your learning path</h1>
        <p className="muted">
          Seven worlds, from counting to graphs. Each lesson is short: read, try the visual, practise, then prove it with a quick check.
        </p>
        <div className="progress-legend small muted">
          <span aria-hidden="true">✓</span> completed · <span aria-hidden="true">▶</span> next up · numbers are lesson order
        </div>
      </header>
      {worlds.map((world) => {
        const lessons = lessonsInWorld(world.id);
        const done = lessons.filter((l) => completed.has(l.id)).length;
        const isOpen = openWorld === world.id;
        return (
          <section key={world.id} className="world" aria-labelledby={`world-${world.id}`} data-testid={`world-${world.id}`}>
            <div className="world-header">
              <div className="world-badge" style={{ ['--world-color' as string]: `var(${world.colorVar})` }} aria-hidden="true">
                {world.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 id={`world-${world.id}`} style={{ fontSize: 'var(--fs-lg)', marginBottom: 2 }}>
                  World {world.number}: {world.title}
                </h2>
                <p className="small muted mb-0">{world.tagline}</p>
                <div className="row" style={{ marginTop: 6, gap: 10 }}>
                  <div className="progress-track" style={{ flex: '1 1 120px' }} aria-hidden="true">
                    <div style={{ width: `${(done / lessons.length) * 100}%` }} />
                  </div>
                  <span className="small muted">
                    {done}/{lessons.length}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    aria-expanded={isOpen}
                    aria-controls={`world-list-${world.id}`}
                    onClick={() => setOpenWorld(isOpen ? '' : world.id)}
                  >
                    {isOpen ? 'Hide lessons' : 'Show lessons'}
                  </button>
                </div>
              </div>
            </div>
            {isOpen ? (
              <ul className="lesson-list" id={`world-list-${world.id}`} style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {lessons.map((lesson) => {
                  const isDone = completed.has(lesson.id);
                  const isCurrent = next === lesson.id;
                  const locked = !prerequisitesMet(lesson.id, completed) && !isDone && !started.has(lesson.id);
                  return <LessonRow key={lesson.id} lesson={lesson} state={isDone ? 'done' : 'todo'} locked={locked} current={isCurrent} />;
                })}
              </ul>
            ) : (
              <p className="small muted mb-0">
                {done === lessons.length ? 'All lessons complete.' : `${lessons.length - done} lesson${lessons.length - done === 1 ? '' : 's'} to go.`}{' '}
                {WORLD_BY_ID[world.id]?.description}
              </p>
            )}
          </section>
        );
      })}
    </Page>
  );
}
