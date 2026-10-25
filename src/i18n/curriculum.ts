/**
 * Curriculum localisation overlay.
 *
 * `content/concepts.ts` and `content/lessons/world*.ts` stay the single source of truth
 * for everything that must never vary by language: ids, `math`, `answer`, `choices`,
 * `variety`, `difficulty`, `visual.initialState`, prerequisites, mastery criteria.
 *
 * Only human prose is overlaid, and only when a Bengali translation exists for that key.
 * Anything missing falls back to the English source field by field, so a half-translated
 * lesson still works and never shows a raw key.
 */
import type { SupportedLocale } from './index';
import { bnCurriculum, type LessonProse, type ConceptProse } from './locales/bn/curriculum';
import { t } from './index';

type WorldId = 'numbers' | 'negatives' | 'variables' | 'equality' | 'expressions' | 'graphs' | 'further';

export interface WorldProse {
  title: string;
  tagline: string;
  description?: string;
}

interface Overlay {
  worlds: Partial<Record<WorldId, WorldProse>>;
  concepts: Record<string, ConceptProse>;
  lessons: Record<string, LessonProse>;
}

const OVERLAYS: Record<Exclude<SupportedLocale, 'en'>, Overlay> = {
  bn: bnCurriculum as Overlay,
};

const EMPTY: Overlay = { worlds: {}, concepts: {}, lessons: {} };

function overlayFor(locale: string): Overlay {
  return locale === 'bn' ? OVERLAYS.bn : EMPTY;
}

/** World prose: overlay first, then the English catalogue, then the content file. */
export function worldProse(world: { id: WorldId; title: string; tagline: string; description: string }, locale: string): WorldProse & { description: string } {
  const custom = overlayFor(locale).worlds[world.id];
  if (custom) return { title: custom.title, tagline: custom.tagline, description: custom.description ?? world.description };
  // English (and any world without a bespoke translation) reads from the catalogue so
  // renaming a world is a one-file change.
  if (locale === 'en') {
    return {
      title: t(`world.${world.id}.title`, { defaultValue: world.title }),
      tagline: t(`world.${world.id}.tagline`, { defaultValue: world.tagline }),
      description: world.description,
    };
  }
  return { title: world.title, tagline: world.tagline, description: world.description };
}

export function conceptProse(concept: { id: string; name: string; shortName: string; description: string }, locale: string): ConceptProse & { shortName: string } {
  const custom = overlayFor(locale).concepts[concept.id];
  return { name: custom?.name ?? concept.name, shortName: custom?.shortName ?? concept.shortName, description: custom?.description ?? concept.description };
}

export interface LessonLike {
  id: string;
  title: string;
  summary: string;
  objectives: string[];
  steps: { title: string; body: string; callout?: { kind: string; text: string } }[];
  exercises: { id: string; prompt: string; solution: string; hints: string[] }[];
  misconceptions: { id: string; description: string; feedback: string }[];
}

/**
 * Return a copy of `lesson` with its prose replaced. Exercise text is matched by id, so a
 * translation can never be attached to the wrong question. Math, answers, choices and
 * visuals are copied through untouched.
 */
export function localizeLesson<T extends LessonLike>(lesson: T, locale: string): T {
  const prose = overlayFor(locale).lessons[lesson.id];
  if (!prose) return lesson;
  const proseFor = (ex: { id: string; prompt: string; solution: string; hints: string[]; choices?: string[] }) => {
    const e = prose.exercises?.[ex.id];
    if (!e) return ex;
    // Display labels are attached only for options that really exist, so a stale or
    // mistyped key can never label an option — or reserve one that is not there.
    const choiceLabels = e.choiceLabels
      ? Object.fromEntries(
          Object.entries(e.choiceLabels).filter(([choice]) => ex.choices?.includes(choice)),
        )
      : undefined;
    return {
      ...ex,
      prompt: e.prompt ?? ex.prompt,
      solution: e.solution ?? ex.solution,
      hints: ex.hints.map((h, i) => e.hints?.[i] ?? h),
      // Display only: the grader keeps comparing the canonical `choices` strings.
      ...(choiceLabels && Object.keys(choiceLabels).length > 0 ? { choiceLabels } : {}),
    };
  };
  const localize = lesson as T & { masteryCheck?: LessonLike['exercises'] };
  return {
    ...lesson,
    title: prose.title ?? lesson.title,
    summary: prose.summary ?? lesson.summary,
    objectives: lesson.objectives.map((o, i) => prose.objectives?.[i] ?? o),
    steps: lesson.steps.map((step, i) => {
      const s = prose.steps?.[i];
      if (!s) return step;
      return {
        ...step,
        title: s.title ?? step.title,
        // `examples` names the tool's own controls in prose the content file cannot know
        // about (Bengali button labels). It is appended to the body, with a space so an
        // English body that already ends in punctuation still reads correctly.
        body: s.examples ? `${s.body ?? step.body} ${s.examples}` : (s.body ?? step.body),
        callout: step.callout ? { ...step.callout, text: s.callout ?? step.callout.text } : step.callout,
      };
    }),
    exercises: lesson.exercises.map(proseFor),
    // The no-hint mastery check is the same kind of authored prose, and it is read on the
    // same page, so it is overlaid by exercise id too.
    ...(localize.masteryCheck ? { masteryCheck: localize.masteryCheck.map(proseFor) } : {}),
    misconceptions: lesson.misconceptions.map((m) => {
      const t = prose.misconceptions?.[m.id];
      if (!t) return m;
      return { ...m, description: t.description ?? m.description, feedback: t.feedback ?? m.feedback };
    }),
  };
}

/** Which lessons actually have a translation (used by Settings/progress copy). */
export function translatedLessonIds(locale: string): string[] {
  return Object.keys(overlayFor(locale).lessons);
}

export type { LessonProse, ConceptProse };
