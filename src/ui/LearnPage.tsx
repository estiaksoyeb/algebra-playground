import { useMemo, useState } from 'react';
import { CURRICULUM, LESSON_ORDER, WORLD_BY_ID, lessonsInWorld, prerequisitesMet } from '../content/curriculum';
import { Lesson } from '../content/types';
import { WorldIcon } from '../components/icons';
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
            <span className="lesson-meta-item">{lesson.estimatedMinutes} min</span>
            <span className="lesson-meta-item">{lesson.steps.length} steps</span>
            <span className="lesson-meta-item">{lesson.exercises.length} exercises</span>
          </span>
          {locked && (
            <span className="lesson-card-note">Finish the earlier lesson first — you can still open it.</span>
          )}
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
  // Start with the world of the next lesson open, so a cold load (or an import) shows the right
  // place. Every later toggle only touches the world that was clicked: expansion state is a set
  // of stable world ids, so several worlds can stay open at once.
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const suggested = (next ? CURRICULUM.lessons.find((l) => l.id === next)?.world : undefined) ?? worlds[0].id;
    return new Set([suggested]);
  });
  const toggleWorld = (id: string) =>
    setExpanded((prev) => {
      const updated = new Set(prev);
      if (updated.has(id)) updated.delete(id);
      else updated.add(id);
      return updated;
    });

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
        const isOpen = expanded.has(world.id);
        return (
          <section
            key={world.id}
            className="world"
            aria-labelledby={`world-${world.id}`}
            data-testid={`world-${world.id}`}
            data-expanded={isOpen || undefined}
            style={{ ['--world-color' as string]: `var(${world.colorVar})` }}
          >
            <div className="world-header">
              <div className="world-badge" data-testid={`world-icon-${world.id}`} aria-hidden="true">
                <WorldIcon icon={world.icon} width={24} height={24} />
              </div>
              <div className="world-heading">
                <h2 id={`world-${world.id}`} className="world-title">
                  <span className="world-number">World {world.number}</span>
                  <span className="world-name">{world.title}</span>
                </h2>
                <p className="world-tagline">{world.tagline}</p>
              </div>
              <div className="world-controls">
                <span className="world-count">
                  {done}/{lessons.length}
                  <span className="sr-only"> lessons complete</span>
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm world-toggle"
                  aria-expanded={isOpen}
                  aria-controls={`world-list-${world.id}`}
                  onClick={() => toggleWorld(world.id)}
                >
                  {isOpen ? 'Hide lessons' : 'Show lessons'}
                </button>
              </div>
            </div>
            <div className="world-progress" aria-hidden="true">
              <div className="progress-track">
                <div style={{ width: `${(done / lessons.length) * 100}%` }} />
              </div>
            </div>
            {isOpen ? (
              <ul className="lesson-list" id={`world-list-${world.id}`}>
                {lessons.map((lesson) => {
                  const isDone = completed.has(lesson.id);
                  const isCurrent = next === lesson.id;
                  const locked = !prerequisitesMet(lesson.id, completed) && !isDone && !started.has(lesson.id);
                  return <LessonRow key={lesson.id} lesson={lesson} state={isDone ? 'done' : 'todo'} locked={locked} current={isCurrent} />;
                })}
              </ul>
            ) : (
              <p className="world-summary">
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
