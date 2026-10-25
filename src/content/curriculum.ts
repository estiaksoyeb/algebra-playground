import { Concept, CONTENT_VERSION, Curriculum, Lesson, World } from './types';
import { CONCEPTS, WORLDS } from './concepts';
import { WORLD1_LESSONS } from './lessons/world1';
import { WORLD2_LESSONS } from './lessons/world2';
import { WORLD3_LESSONS } from './lessons/world3';
import { WORLD4_LESSONS } from './lessons/world4';
import { WORLD5_LESSONS } from './lessons/world5';
import { WORLD6_LESSONS } from './lessons/world6';
import { WORLD7_LESSONS } from './lessons/world7';
import { withMasteryChecks } from './masteryChecks';

/** Teaching exercises stay in the world files; the short unassisted check is merged in here. */
const WORLD_LESSONS: Lesson[] = [
  ...WORLD1_LESSONS,
  ...WORLD2_LESSONS,
  ...WORLD3_LESSONS,
  ...WORLD4_LESSONS,
  ...WORLD5_LESSONS,
  ...WORLD6_LESSONS,
  ...WORLD7_LESSONS,
];

const ALL_LESSONS: Lesson[] = WORLD_LESSONS.map(withMasteryChecks);

export const CURRICULUM: Curriculum = {
  contentVersion: CONTENT_VERSION,
  worlds: WORLDS,
  lessons: ALL_LESSONS,
  concepts: CONCEPTS,
};

export const LESSON_BY_ID: Record<string, Lesson> = Object.fromEntries(ALL_LESSONS.map((l) => [l.id, l]));
export const CONCEPT_BY_ID = Object.fromEntries(CONCEPTS.map((c) => [c.id, c]));
export const WORLD_BY_ID = Object.fromEntries(WORLDS.map((w) => [w.id, w]));

/** Global teaching order (worlds in order, then lesson order). */
export const LESSON_ORDER: string[] = [...WORLDS]
  .sort((a, b) => a.number - b.number)
  .flatMap((w) => ALL_LESSONS.filter((l) => l.world === w.id).sort((a, b) => a.order - b.order))
  .map((l) => l.id);

export function lessonsInWorld(worldId: World['id']): Lesson[] {
  return ALL_LESSONS.filter((l) => l.world === worldId).sort((a, b) => a.order - b.order);
}

export function lessonForConcept(conceptId: string): Lesson | undefined {
  return ALL_LESSONS.find((l) => l.conceptIds.includes(conceptId));
}

export function getAllExercises(): { lesson: Lesson; exercise: Lesson['exercises'][number] }[] {
  return ALL_LESSONS.flatMap((lesson) => lesson.exercises.map((exercise) => ({ lesson, exercise })));
}

export function findExercise(exerciseId: string): { lesson: Lesson; exercise: Lesson['exercises'][number] } | undefined {
  return getAllExercises().find(({ exercise }) => exercise.id === exerciseId);
}

export function prerequisitesMet(lessonId: string, completedLessonIds: Set<string>): boolean {
  const lesson = LESSON_BY_ID[lessonId];
  if (!lesson) return false;
  return lesson.prerequisites.every((p) => completedLessonIds.has(p));
}

export function nextLessonInOrder(lessonId: string): Lesson | undefined {
  const i = LESSON_ORDER.indexOf(lessonId);
  return i >= 0 && i < LESSON_ORDER.length - 1 ? LESSON_BY_ID[LESSON_ORDER[i + 1]] : undefined;
}

export interface CurriculumIssue {
  lessonId?: string;
  severity: 'error' | 'warning';
  message: string;
}

/**
 * Structural validation of curriculum data (run in tests and at dev startup).
 * Guarantees every lesson is real content with checkable exercises.
 */
export function validateCurriculum(c: Curriculum = CURRICULUM): CurriculumIssue[] {
  const issues: CurriculumIssue[] = [];
  const lessonIds = new Set<string>();
  const exerciseIds = new Set<string>();
  const conceptIds = new Set(c.concepts.map((x) => x.id));
  const worldIds = new Set(c.worlds.map((w) => w.id));

  for (const lesson of c.lessons) {
    const id = lesson.id;
    if (lessonIds.has(id)) issues.push({ lessonId: id, severity: 'error', message: 'Duplicate lesson id' });
    lessonIds.add(id);
    if (!worldIds.has(lesson.world)) issues.push({ lessonId: id, severity: 'error', message: `Unknown world ${lesson.world}` });
    if (lesson.objectives.length === 0) issues.push({ lessonId: id, severity: 'error', message: 'No objectives' });
    if (lesson.steps.length < 2) issues.push({ lessonId: id, severity: 'error', message: 'Too few teaching steps' });
    if (lesson.exercises.length < 3) issues.push({ lessonId: id, severity: 'error', message: 'Fewer than 3 exercises' });
    if (lesson.conceptIds.length === 0) issues.push({ lessonId: id, severity: 'error', message: 'No concepts' });
    if (lesson.misconceptions.length === 0) issues.push({ lessonId: id, severity: 'warning', message: 'No misconceptions documented' });
    if (!lesson.mastery || lesson.mastery.minIndependent < 1) issues.push({ lessonId: id, severity: 'error', message: 'Missing mastery criteria' });
    for (const cid of lesson.conceptIds) {
      if (!conceptIds.has(cid)) issues.push({ lessonId: id, severity: 'error', message: `Unknown concept ${cid}` });
    }
    for (const p of lesson.prerequisites) {
      if (!lessonIds.has(p) && !c.lessons.some((l) => l.id === p)) issues.push({ lessonId: id, severity: 'error', message: `Unknown prerequisite ${p}` });
    }
    for (const step of lesson.steps) {
      if (!step.title || !step.body) issues.push({ lessonId: id, severity: 'error', message: 'Step missing title/body' });
    }
    const varieties = new Set(lesson.exercises.map((e) => e.variety));
    if (varieties.size < Math.min(lesson.mastery.minVariety, lesson.exercises.length)) {
      issues.push({ lessonId: id, severity: 'warning', message: `Only ${varieties.size} exercise varieties` });
    }
    for (const ex of lesson.exercises) {
      if (exerciseIds.has(ex.id)) issues.push({ lessonId: id, severity: 'error', message: `Duplicate exercise id ${ex.id}` });
      exerciseIds.add(ex.id);
      if (!lesson.conceptIds.includes(ex.conceptId)) {
        issues.push({ lessonId: id, severity: 'warning', message: `Exercise ${ex.id} concept not declared by lesson` });
      }
      if (ex.hints.length === 0) issues.push({ lessonId: id, severity: 'warning', message: `Exercise ${ex.id} has no hints` });
      if (!ex.solution) issues.push({ lessonId: id, severity: 'error', message: `Exercise ${ex.id} has no solution text` });
      if (ex.kind === 'choice') {
        if (!ex.choices || ex.choices.length < 2) issues.push({ lessonId: id, severity: 'error', message: `Exercise ${ex.id} choice list too short` });
        else if (!ex.choices.includes(String(ex.answer))) issues.push({ lessonId: id, severity: 'error', message: `Exercise ${ex.id} answer not among choices` });
      }
      const answer = Array.isArray(ex.answer) ? ex.answer[0] : ex.answer;
      if (!answer) issues.push({ lessonId: id, severity: 'error', message: `Exercise ${ex.id} empty answer` });
    }
  }

  for (const concept of c.concepts) {
    for (const p of concept.prerequisites) {
      if (!conceptIds.has(p)) issues.push({ severity: 'error', message: `Concept ${concept.id} has unknown prerequisite ${p}` });
    }
    if (!c.lessons.some((l) => l.conceptIds.includes(concept.id))) {
      issues.push({ severity: 'warning', message: `Concept ${concept.id} is not taught by any lesson` });
    }
  }

  for (const lesson of c.lessons) {
    if (lesson.remediation && !c.lessons.some((l) => l.id === lesson.remediation)) {
      issues.push({ lessonId: lesson.id, severity: 'error', message: `Unknown remediation lesson ${lesson.remediation}` });
    }
  }

  return issues;
}

/* ------------------------------------------------------------------ localisation
 * The exports above are the English source of truth and stay untouched. Screens that
 * render prose call the helpers below instead, which overlay a translation (if one
 * exists) and fall back to English field by field. Ids, maths, answers, choices and
 * visual states are never translated, so grading and tool behaviour cannot drift with
 * the UI language.
 */
import { localizeLesson, worldProse, conceptProse } from '../i18n/curriculum';

export function localizedLesson(lessonId: string, locale: string): Lesson | undefined {
  const lesson = LESSON_BY_ID[lessonId];
  return lesson ? localizeLesson(lesson, locale) : undefined;
}

export function localizedLessonsInWorld(worldId: World['id'], locale: string): Lesson[] {
  return lessonsInWorld(worldId).map((l) => localizeLesson(l, locale));
}

export function localizedWorld(world: World, locale: string): World {
  const prose = worldProse(world, locale);
  return { ...world, title: prose.title, tagline: prose.tagline, description: prose.description };
}

/**
 * A concept's display name, for screens that only hold its id (lesson completion, review
 * lists). Falls back to the English concept, then to a humanised id, so it never shows a
 * raw key.
 */
export function localizedConceptName(conceptId: string, locale: string, fallbackLesson?: { conceptIds: string[] }): string {
  const concept = CONCEPT_BY_ID[conceptId];
  if (concept) return localizedConcept(concept, locale).name;
  if (fallbackLesson) {
    // The lesson's own order is the best guide to which concept a missing id meant.
    const index = fallbackLesson.conceptIds.indexOf(conceptId);
    if (index >= 0) return conceptId.replace(/-/g, ' ');
  }
  return conceptId.replace(/-/g, ' ');
}

export function localizedConcept(concept: Concept, locale: string): Concept {
  const prose = conceptProse(concept, locale);
  return { ...concept, name: prose.name, shortName: prose.shortName, description: prose.description };
}

/** All lessons, translated (used by the progress map and review lists). */
export function localizedCurriculum(locale: string): Curriculum {
  return {
    ...CURRICULUM,
    worlds: CURRICULUM.worlds.map((w) => localizedWorld(w, locale)),
    lessons: CURRICULUM.lessons.map((l) => localizeLesson(l, locale)),
    concepts: CURRICULUM.concepts.map((c) => localizedConcept(c, locale)),
  };
}
