/**
 * Bengali curriculum completeness for all seven worlds (36 lessons).
 *
 * These tests are deliberately driven by the content files, not by the translation
 * files: they walk every lesson the app can show and demand that the prose a learner
 * actually reads has a Bengali version. A new lesson or exercise therefore fails here
 * until it is translated, which is the point.
 *
 * One thing is treated as data and left in English on purpose: `choice` options live in
 * `choices`, which grading compares verbatim. Word-based options get a display-only
 * Bengali label instead, checked separately below.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CURRICULUM, localizedLesson } from '../content/curriculum';
import type { Exercise } from '../content/types';
import { bnCurriculum } from './locales/bn/curriculum';
import type { LessonProse } from './locales/bn/types';
import { localizeLesson } from './curriculum';
import { hasBengaliNumerals } from './normalizeMathInput';

const BENGALI = /[\u0980-\u09FF]/;
const WORLD_PREFIXES = ['w1-', 'w2-', 'w3-', 'w4-', 'w5-', 'w6-', 'w7-'];

const authored = CURRICULUM.lessons.filter((l) => WORLD_PREFIXES.some((p) => l.id.startsWith(p)));

/** One learner-facing string: where it lives, the English source, the Bengali render. */
interface ProsePair {
  where: string;
  en: string;
  bn: string;
}

/**
 * True when a string is a bare calculation: ASCII digits, Latin variables and the
 * arithmetic signs, plus the Bengali full stop. `7 × 8 = 7 × (4 + 4) = 56।` is maths,
 * not untranslated English, so it is allowed to have no Bengali word in it.
 */
function isPureMaths(text: string): boolean {
  return /^[0-9xyzabn+\-−–×÷·=()/.,:?'%²³\s।]*$/.test(text) && /[0-9]/.test(text);
}

/**
 * Options that are maths (`'2x + 6'`, `'(3, 2)'`, `'x: 1, 2, 3 → y: 4, 5, 6'`) need no
 * translation, and word-based ones do. A maths option never contains an English word, so
 * any run of three or more letters that is not a variable/handle marks prose: "Yes, if
 * x = 1" is prose, while "x = 3" and single-letter table cells are not.
 */
function isWordOption(option: string): boolean {
  // Two-letter maths tokens (`ab`, `xy`) are not words; three letters or more are, unless
  // they are a known function name that appears in an expression.
  const FUNCTIONS = new Set(['sin', 'cos', 'tan', 'log', 'deg']);
  return [...option.matchAll(/[A-Za-z]{3,}/g)]
    .map((m) => m[0].toLowerCase())
    .some((word) => !FUNCTIONS.has(word));
}

describe('Bengali lesson prose, all seven worlds', () => {
  it('covers every authored world (the test would silently pass on a typo otherwise)', () => {
    const perWorld = WORLD_PREFIXES.map((p) => authored.filter((l) => l.id.startsWith(p)).length);
    expect(perWorld).toEqual([7, 6, 3, 5, 4, 5, 6]);
    expect(authored).toHaveLength(36);
    // No lesson can sit outside the seven worlds and escape the checks below.
    expect(authored.length).toBe(CURRICULUM.lessons.length);
  });

  it('translates every lesson title, summary, objective, step, hint and solution', () => {
    const failures: string[] = [];
    for (const source of authored) {
      const lesson = localizedLesson(source.id, 'bn')!;
      for (const { where, en, bn } of lessonProse(source, lesson)) {
        if (!bn.trim()) failures.push(`${where}: empty`);
        else if (bn === en) failures.push(`${where}: identical to English: ${bn}`);
        // Worked steps that are pure arithmetic carry no Bengali word on purpose:
        // "43 − 18 = 43 − 20 + 2 = 25" must stay exactly that. Everything else has to
        // read as Bengali prose, so a forgotten translation cannot hide as English.
        else if (!BENGALI.test(bn) && !isPureMaths(bn)) failures.push(`${where}: no Bengali script: ${bn}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('translates misconceptions as well', () => {
    const failures: string[] = [];
    for (const source of authored) {
      const lesson = localizedLesson(source.id, 'bn')!;
      for (const [i, m] of lesson.misconceptions.entries()) {
        const en = source.misconceptions[i];
        for (const field of ['description', 'feedback'] as const) {
          if (!BENGALI.test(m[field])) failures.push(`${source.id}/${m.id}.${field} is not Bengali: ${m[field]}`);
          if (m[field] === en[field]) failures.push(`${source.id}/${m.id}.${field} is still English: ${m[field]}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('never puts a Bengali numeral in prose, maths, answers or choices', () => {
    const failures: string[] = [];
    for (const source of authored) {
      const lesson = localizedLesson(source.id, 'bn')!;
      const texts = [
        lesson.title,
        lesson.summary,
        ...lesson.objectives,
        ...lesson.steps.flatMap((s) => [s.title, s.body, s.math ?? '', s.callout?.text ?? '']),
        ...[...lesson.exercises, ...(lesson.reviewExercises ?? []), ...(lesson.masteryCheck ?? [])].flatMap((e) => [
          e.prompt,
          e.solution,
          ...e.hints,
          e.math ?? '',
          String(e.answer),
          ...(e.choices ?? []),
          ...Object.values(e.choiceLabels ?? {}),
        ]),
        ...lesson.misconceptions.flatMap((m) => [m.description, m.feedback]),
      ];
      for (const text of texts) {
        if (hasBengaliNumerals(text)) failures.push(`${source.id}: ${text}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('leaves ids, maths, answers, choices and visuals exactly as authored', () => {
    const failures: string[] = [];
    for (const source of authored) {
      const lesson = localizedLesson(source.id, 'bn')!;
      if (lesson.id !== source.id) failures.push(`${source.id}: id changed`);
      if (lesson.exercises.length !== source.exercises.length) failures.push(`${source.id}: exercise count changed`);
      const sets: [string, Exercise[], Exercise[]][] = [
        ['exercises', source.exercises, lesson.exercises],
        ['masteryCheck', source.masteryCheck ?? [], lesson.masteryCheck ?? []],
      ];
      for (const [label, sourceSet, localizedSet] of sets) {
        if (localizedSet.length !== sourceSet.length) failures.push(`${source.id}: ${label} length changed`);
        for (const [i, ex] of localizedSet.entries()) {
          const en = sourceSet[i];
          if (!en) continue;
          const at = `${source.id}/${label}/${ex.id}`;
          if (ex.id !== en.id) failures.push(`${at}: id ${ex.id} != ${en.id}`);
          if (ex.math !== en.math) failures.push(`${at}: math changed`);
          if (JSON.stringify(ex.answer) !== JSON.stringify(en.answer)) failures.push(`${at}: answer changed`);
          if (JSON.stringify(ex.choices) !== JSON.stringify(en.choices)) failures.push(`${at}: choices changed`);
          if (ex.kind !== en.kind) failures.push(`${at}: kind changed`);
          if (JSON.stringify(ex.conceptId) !== JSON.stringify(en.conceptId)) failures.push(`${at}: conceptId changed`);
        }
      }
      for (const [i, step] of lesson.steps.entries()) {
        if (step.math !== source.steps[i].math) failures.push(`${source.id}: step ${i} math changed`);
        if (JSON.stringify(step.visual) !== JSON.stringify(source.steps[i].visual)) {
          failures.push(`${source.id}: step ${i} visual changed`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('labels every word-based choice option in Bengali without touching the canonical option', () => {
    const failures: string[] = [];
    let labelled = 0;
    for (const source of authored) {
      const lesson = localizedLesson(source.id, 'bn')!;
      for (const [i, ex] of lesson.exercises.entries()) {
        if (ex.kind !== 'choice' || !ex.choices) continue;
        const en = source.exercises[i];
        for (const choice of ex.choices) {
          const label = ex.choiceLabels?.[choice];
          if (!isWordOption(choice)) {
            // Pure maths must stay pure maths: no label, no words added.
            if (label) failures.push(`${source.id}/${ex.id}: maths option "${choice}" was labelled`);
            continue;
          }
          labelled += 1;
          if (!label) failures.push(`${source.id}/${ex.id}: word option "${choice}" has no Bengali label`);
          else if (!BENGALI.test(label)) failures.push(`${source.id}/${ex.id}: label is not Bengali: ${label}`);
          // `choiceLabels` is display data; the option the grader sees is untouched.
          if (!en.choices?.includes(choice)) failures.push(`${source.id}/${ex.id}: label key "${choice}" is not an option`);
        }
      }
    }
    expect(failures).toEqual([]);
    // Word options across the whole curriculum; keep the count honest so a label silently
    // dropping out of one of the four exercises is caught.
    expect(labelled).toBe(16);
  });

  it('falls back to English for a lesson with no translation, and mixes field by field', () => {
    // Every production lesson is translated now, so neither branch can be proved by a real
    // world. Both are proved on a synthetic lesson shaped exactly like a real one.
    const base = CURRICULUM.lessons.find((l) => l.id === 'w7-l6-quadratic-graphs')!;
    const prose = bnCurriculum.lessons[base.id];

    // 1. No overlay at all: the source object comes back untouched, field for field.
    const noProse = { ...base, id: 'zz-no-translation' };
    expect(localizeLesson(noProse, 'bn')).toBe(noProse);

    // 2. A title-only overlay: the title is Bengali, every other field stays English.
    //    (A half-translated lesson must still read, never show a raw key or an empty box.)
    const partialProse = { ...prose, summary: undefined, objectives: undefined, steps: undefined, exercises: undefined, misconceptions: undefined };
    const partial = { ...base, id: 'zz-title-only' };
    const overlayKey = Object.keys(bnCurriculum.lessons).length;
    // Temporarily register the synthetic prose, then remove it so no other test sees it.
    (bnCurriculum.lessons as Record<string, LessonProse>)['zz-title-only'] = partialProse;
    try {
      const localized = localizeLesson(partial, 'bn');
      expect(localized.title).toBe(prose.title);
      expect(localized.title).toMatch(BENGALI);
      expect(localized.summary).toBe(base.summary);
      expect(localized.objectives).toEqual(base.objectives);
      expect(localized.steps.map((s) => s.title)).toEqual(base.steps.map((s) => s.title));
      expect(localized.steps.map((s) => s.callout?.text)).toEqual(base.steps.map((s) => s.callout?.text));
      expect(localized.exercises.map((e) => e.prompt)).toEqual(base.exercises.map((e) => e.prompt));
      expect(localized.misconceptions).toEqual(base.misconceptions);
    } finally {
      delete (bnCurriculum.lessons as Record<string, LessonProse>)['zz-title-only'];
    }
    expect(Object.keys(bnCurriculum.lessons).length).toBe(overlayKey);
  });

  it('never names a tool control the Bengali tool does not have', () => {
    // Some claims are simply false for every embedded tool, so they are banned everywhere:
    //  - no tool has a slider; values change with − / + steppers.
    //  - "drag" is only true of the number line and the graph's point mode, so prose that
    //    uses the word must name where it applies in the same sentence.
    //  - the balance tool never warns about a one-sided change, so no tip may promise one.
    const textOf = (lesson: LessonProse) => [
      lesson.title ?? '',
      lesson.summary ?? '',
      ...(lesson.objectives ?? []),
      ...(lesson.steps ?? []).flatMap((s) => [s.title ?? '', s.body ?? '', s.examples ?? '', s.callout ?? '']),
      ...Object.values(lesson.exercises ?? {}).flatMap((e) => [e.prompt ?? '', e.solution ?? '', ...(e.hints ?? [])]),
      ...Object.values(lesson.misconceptions ?? {}).flatMap((m) => [m.description ?? '', m.feedback ?? '']),
    ];
    const banned: { pattern: RegExp; why: string }[] = [
      { pattern: /স্লাইডার/, why: 'no tool has a slider; values change with − / + steppers' },
      { pattern: /সতর্ক/, why: 'the balance tool never warns about a one-sided change' },
      { pattern: /ট্যাপ করে/, why: 'tiles are read-only; tiles are added with the − / + steppers' },
    ];
    const failures: string[] = [];
    for (const [id, lesson] of Object.entries(bnCurriculum.lessons)) {
      for (const text of textOf(lesson)) {
        for (const { pattern, why } of banned) {
          if (pattern.test(text)) failures.push(`${id}: “${pattern.source}” (${why}): ${text}`);
        }
        // A drag is fine, but only where there really is something to drag.
        if (/টেনে সরান/.test(text) && !/সংখ্যারেখা|সংখ্যারেখায়|গ্রিডে/.test(text)) {
          failures.push(`${id}: “drag” outside the number line or grid: ${text}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('never uses a Bengali numeral anywhere under locales/bn', () => {
    // Guards the files the runtime catalogue is built from, including strings that a
    // future merge might drop from the exported object by accident.
    const files = bengaliSourceFiles();
    expect(files.length).toBeGreaterThanOrEqual(8);
    const failures = files.flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => hasBengaliNumerals(line))
        .map(({ line, n }) => `${path.relative(process.cwd(), file)}:${n}: ${line.trim()}`),
    );
    expect(failures).toEqual([]);
  });

  it('uses only Bengali, ASCII and the agreed maths/punctuation characters', () => {
    // A translation is drafted prose, so a stray foreign character is a real failure mode:
    // Hangul or Cyrillic from a copy-paste, a reference to "solución", an accented é in an
    // otherwise Bengali sentence. Such a character is invisible to a reader skimming
    // Bengali, but it shows up as a wrong glyph or a broken word on screen, so it fails
    // here with the file, line and code point that caused it.
    //
    // The allowlist is exactly: the Bengali block (plus ZWJ/ZWNJ), printable ASCII, and
    // the punctuation/maths symbols the app already uses in both languages.
    const failures: string[] = [];
    for (const file of bengaliSourceFiles()) {
      const relative = path.relative(process.cwd(), file);
      for (const { line, n } of readFileSync(file, 'utf8')
        .split('\n')
        .map((line, n) => ({ line, n }))) {
        for (const [column, char] of [...line].entries()) {
          if (isAllowedChar(char)) continue;
          const name = charName(char);
          failures.push(
            `${relative}:${n}:${column + 1}: U+${char.codePointAt(0)!.toString(16).toUpperCase()} ${name} — ${line.trim()}`,
          );
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

/** Every Bengali source file: the flat UI catalogue plus the curriculum overlay folder. */
function bengaliSourceFiles(): string[] {
  const dir = path.resolve(__dirname, 'locales/bn');
  const nested = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.(ts|tsx)$/.test(e.name))
    // A Dirent is itself the path segment of its entry, relative to the scan root.
    .map((e) => path.join(dir, path.relative(dir, e.parentPath), e.name));
  return [...nested, path.resolve(__dirname, 'locales/bn.ts')].sort();
}

/**
 * Characters allowed in a Bengali source file:
 *  - the Bengali block, plus ZWJ/ZWNJ (protected from a future Indic shaping need);
 *  - tab, line breaks and printable ASCII;
 *  - the Unicode punctuation and maths symbols the app already uses in both languages.
 * Each extra symbol is listed with what it is for, so the next addition is a deliberate
 * choice rather than an accidental widening of the rule.
 */
const ALLOWED_EXTRA = new Set([
  '—', '–', '−', '×', '÷', // dashes and the four arithmetic operators
  '±', '≤', '≥', '≠', '≈', '√', '∞', 'π', 'Δ', // comparison and maths signs
  '→', '←', '↔', '↶', '↷', '↑', '↓', // arrows: undo/redo, number-line steps, rise and run
  '•', '…', '‘', '’', '“', '”', '′', '″', // punctuation
  '²', '³', '⁴', '⁵', '⁰', '¹', 'ⁿ', '₀', '₁', '₂', '₃', '₄', // powers, exponents and subscripts
  '·', // multiplication dot (x · x) and the app's "·" separator
  '°', // degrees
  '।', // the Bengali full stop (the danda is shared with Devanagari)
  '✓', '✗', // "the answer checks out" and "it does not"
]);

function isAllowedChar(char: string): boolean {
  const code = char.codePointAt(0)!;
  if (code === 0x09 || code === 0x0a || code === 0x0d) return true;
  if (code >= 0x20 && code <= 0x7e) return true;
  if (code >= 0x0980 && code <= 0x09ff) return true; // Bengali block (includes ৳ and ০-৯)
  if (code >= 0x200c && code <= 0x200d) return true; // ZWNJ / ZWJ
  return ALLOWED_EXTRA.has(char);
}

/** A readable name for the offending character, so a failure needs no code-point lookup. */
function charName(char: string): string {
  const code = char.codePointAt(0)!;
  const script =
    code >= 0x0590 && code <= 0x05ff ? 'Hebrew'
    : code >= 0x0370 && code <= 0x03ff ? 'Greek'
    : code >= 0x0400 && code <= 0x04ff ? 'Cyrillic'
    : code >= 0x0600 && code <= 0x06ff ? 'Arabic'
    : code >= 0x0e00 && code <= 0x0e7f ? 'Thai'
    : code >= 0x0e80 && code <= 0x0eff ? 'Lao'
    : code >= 0x1000 && code <= 0x109f ? 'Myanmar'
    : code >= 0x1100 && code <= 0x11ff ? 'Hangul'
    : code >= 0x3040 && code <= 0x30ff ? 'Japanese kana'
    : code >= 0x4e00 && code <= 0x9fff ? 'CJK'
    : code >= 0xac00 && code <= 0xd7af ? 'Hangul'
    : code >= 0x1f300 && code <= 0x1faff ? 'emoji'
    : code >= 0x80 && code <= 0x24f ? 'accented Latin'
    : code > 0x7e ? 'unlisted symbol' : 'control character';
  return `${script} ${JSON.stringify(char)}`;
}

/** Every prose string a learner reads in one lesson, paired with its English source. */
function lessonProse(
  source: (typeof CURRICULUM.lessons)[number],
  lesson: NonNullable<ReturnType<typeof localizedLesson>>,
): ProsePair[] {
  const out: ProsePair[] = [];
  const add = (where: string, en: string, bn: string | undefined) =>
    out.push({ where, en, bn: bn ?? '' });

  add(`${source.id}.title`, source.title, lesson.title);
  add(`${source.id}.summary`, source.summary, lesson.summary);
  source.objectives.forEach((o, i) => add(`${source.id}.objectives[${i}]`, o, lesson.objectives[i]));

  source.steps.forEach((s, i) => {
    add(`${source.id}.steps[${i}].title`, s.title, lesson.steps[i].title);
    add(`${source.id}.steps[${i}].body`, s.body, lesson.steps[i].body);
    if (s.callout) add(`${source.id}.steps[${i}].callout`, s.callout.text, lesson.steps[i].callout?.text);
  });

  const exerciseSets: [string, Exercise[], Exercise[]][] = [
    ['exercises', source.exercises, lesson.exercises],
    ['reviewExercises', source.reviewExercises ?? [], lesson.reviewExercises ?? []],
    ['masteryCheck', source.masteryCheck ?? [], lesson.masteryCheck ?? []],
  ];
  for (const [label, sourceSet, localizedSet] of exerciseSets) {
    sourceSet.forEach((ex, i) => {
      const localized = localizedSet[i];
      add(`${source.id}.${label}[${ex.id}].prompt`, ex.prompt, localized.prompt);
      add(`${source.id}.${label}[${ex.id}].solution`, ex.solution, localized.solution);
      ex.hints.forEach((h, hI) => add(`${source.id}.${label}[${ex.id}].hints[${hI}]`, h, localized.hints[hI]));
    });
  }
  return out;
}
