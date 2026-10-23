# Decision: mastery checks are unanswered-without-help, and offer no hints

**Status:** accepted (session 2026-10-23)

## Context

A lesson ends with a mastery check (two questions). The engine decides completion in
`masteryProgress` (`src/ui/lessonProgress.ts`): a check question counts only if the learner
answered it correctly **and** never recorded a hint on it (`checkPassedBy`). One helped
attempt disqualifies that question permanently, even if a later attempt is unaided.

The UI used to offer a hint button on check questions anyway. That created a dead end: a
learner who took a hint could never clear that question, so the lesson could never be
completed. The copy on screen also claimed checks "come without hints", which was untrue.

## Decision

**Checks offer no hint control at all** (`ExerciseCard`'s `noHints` prop, passed by
`LessonPage`). The engine rule stays as defence in depth, for data written by older builds.

## Why not the alternatives

- **Allow a retry to erase the helped attempt.** This makes "prove it unaided" meaningless —
  the learner can look at the hint, then re-answer and pass. It would also require
  rewriting `checkPassedBy` and its tests, and weaken the only evidence the app has.
- **Keep the hint button and the permanent disqualification.** Honest but a trap, and it
  contradicts the on-screen promise.

## Consequences

- A learner stuck on a check leaves with "Try the check later" and practises more. That is
  the intended loop: practice hints are free, checks are not.
- `ExerciseCard` must not invent help that was not taken. It previously did:
  `const usedHelp = freeHints ? hintsShown : Math.max(hintsShown, 1)` recorded
  `hintsUsed: 1` on **every** check answer, which made every mastery check unprovable and
  therefore made *every lesson impossible to complete*. Help is now simply the number of
  hints actually shown.
- When adding a new question type, call the shared `submit` path so `hintsUsed` is derived
  in one place.

## Tests that lock this in

- `src/ui/screens.test.tsx` — "offers no hint on a mastery check".
- `e2e/lesson.spec.ts` — "a mastery check offers no hints and cannot be finished with help",
  and the full completion flow (which fails loudly if checks can never be cleared).
