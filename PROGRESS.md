# ALGEBRA PLAYGROUND — PROGRESS

_Last updated: session 7 — Remediation Batch 5 (adaptive difficulty & curriculum quality).
**Green, all re-run on the current source**: 206 unit tests (12 files), 96/96 executed E2E
(mobile + desktop, 2 viewport-conditional skips), clean typecheck and production build.
This session found and fixed **six** confirmed grading/tutor/curriculum defects (see §9), and
decided — with evidence — **not** to wire adaptive question selection yet (see §9, "Adaptive
selection"). Sessions 1 and 2 were committed as `05ca664`; session 7's work is uncommitted.
Earlier counts in this file that are not marked "session 7" are historical._

## 1. Project objective & non-negotiable requirements

Visual-first, mobile-first (Android) adaptive algebra app for absolute beginners. Static, serverless,
offline-first PWA deployable to GitHub Pages under a repository subpath. No backend, no AI, no API keys,
no telemetry. Requirements the build is held to:

- **Mobile first, complete on desktop.** ≤ 390 px wide: no horizontal overflow, touch targets ≥ 44 px,
  bottom navigation on mobile, keyboard/screen-reader usable.
- **Visual and symbolic views synchronized** from one model per tool; every operation validated;
  undo / redo / reset.
- **IndexedDB** as primary storage with versioned migrations; localStorage only for tiny preferences;
  JSON export/import with validation and merge **or** replace, honest reporting of failures.
- **Static build** (Vite + React + TS), hash routing (works on GitHub Pages without rewrites),
  `BASE_PATH` for project pages.
- **PWA**: manifest, service worker precaching all core assets, works offline after first load,
  cache version bumps on deploy.
- **Safety**: no `eval` / `new Function` for math input, no unsafe HTML, imports sanitized.
- **Automated tests** for math, persistence (9 mandatory scenarios), and UI/E2E. Never claim a pass
  that was not run.
- **This file stays current**: checkboxes `[x]` done / `[~]` partial / `[ ]` not started, architecture,
  commands, test status, and the next three tasks.

## 2. Implementation status

### Foundations
- [x] Scaffold: Vite 5 + React 18 + TS, `tsconfig.app` / `tsconfig.node`, Vitest (jsdom,
  fake-indexeddb), Playwright installed.
- [x] Math engine (`src/math`) — 27 tests.
- [x] Persistence (`src/storage`) — 25 tests, v4 schema with 1→4 migrations, idempotent + atomic imports.
- [x] Curriculum (`src/content`) — 7 worlds, **36 lessons**, 35 concepts, structural validator.
- [x] Engines (`src/engine`) — grading/diagnosis, variants, mastery, review schedule, tutor.
- [x] Mastery checks for **every** lesson (`src/content/masteryChecks.ts`, 2 distinct-variety
  questions each), graded by tests.

### Product surface
- [x] Design system CSS (`src/styles/design-system.css`) + app shell: header with save indicator,
  desktop side nav, mobile bottom nav, skip link, focus management, scroll restoration, error boundary.
- [x] Hash router with query support (`src/ui/router.ts`).
- [x] Session layer (`src/ui/useAppSession.ts`, `useSession.ts`) — load, autosave status, attempt
  recording, mastery, review, experiments, preferences, export/import, reset, streak.
- [x] Screens: Home, Learn map, Lesson player, Playground, Progress, Review, Settings, Help.
- [x] Lesson flow: teach → practice → mastery check → completion, with resume, free hints, tutor
  feedback, misconception diagnosis, refresher links, next-step recommendation.
- [x] Eight visual tools with one state object each and derived SVG + symbolic views:
  number line, mystery boxes, balance, algebra tiles, evaluate/simplify, area model, graph.
- [x] Playground workspace: undo/redo/reset, save/update/save-as-new experiment, reopen via
  `#/playground/:tool?exp=:id`, delete with confirmation, related lessons.
- [x] PWA: `manifest.webmanifest`, generated icons, `build/sw-plugin.ts` emits versioned `sw.js` and
  `sw-version.txt` with a hashed precache manifest.
- [x] Unit tests for UI logic: router, lesson progress/mastery, tool-state sanitisation,
  mastery-check content (**166 tests in 10 files**).

### Remaining
- [x] Playwright config + E2E specs (lesson completion survives reload, playground save/reopen,
  export/import round trip, offline reload with SW, no overflow at 390 px).
- [x] Component/integration tests (React Testing Library): lesson player, settings import errors,
  honest save-failure state.
- [x] E2E verified on the current source: **38/38 mobile, 38/38 desktop**.
- [x] Production build verified under `BASE_PATH=/algebra-playground/`: **76/76 E2E** (asset URLs,
  icons, SW scope and precache all under the subpath).
- [x] GitHub Pages workflow (`deploy.yml`) + README deploy instructions.
- [x] Developer documentation in `docs/` (architecture, storage, testing, maintenance, two decision
  records).
- [x] PROGRESS.md current.

### Fixed in session 6 — a reload could lose the lesson position, and a failed save still advanced

The independent audit confirmed two defects in lesson persistence. Scope for this batch was limited
to those two; nothing else was touched (see §7 for the work this deliberately left open).

1. **A reload could come back to the wrong step.** Root causes, all three present:
   - `LessonPage` initialised its phase from the record *at mount*, i.e. before IndexedDB resolved,
     then a save effect wrote whatever it rendered. On a cold load that was the default step 1.
   - The save effect's only guard was `status === 'loading'`, and it compared the phase to the
     record with `untouched`/`currentStep` heuristics, so a render between "loading" and "data
     arrived" enqueued a write of the default position. Reproduced at unit level: a delayed load
     produced 17 writes, alternating `0,2,0,2,…`, and the database ended on `0`.
   - Only `currentStep` (a teaching-step index) was persisted. Practice and the mastery check had no
     stored position at all, so they always reopened on a teaching step. `answers` and `hintCounts`
     were written to the record but never read back.
   - A failed load was also indistinguishable from "no saved progress": the reducer set
     `status: 'unavailable'`, and the player rendered a normal Step 1 anyway.
2. **A progress write that failed still advanced the lesson.** `go()` set the phase synchronously and
   then fired `progressLesson(...)` without awaiting it; `progressLesson` dispatched the new record
   *before* `runSave`, so the in-memory state (and every other screen) claimed the new position even
   when IndexedDB refused it. `finish()` ignored both results and moved to the completion panel, and
   `recordAttempt` never reverted an optimistically-added attempt. Reproduced in real Chromium:
   after faulting `lessonStates.put`, the UI showed "Step 2 of 3 · Explore" while the database held
   no record at all.

**Implementation.**
- Lifecycle (load → apply → ready → saves permitted): the player renders a loading panel until the
  session is ready and holds `position === null`, so no default position can be rendered or saved.
  `position` (a `LessonPosition` in `lessonResume.ts`) is set exactly once per lesson instance, from
  the settled data; there is no effect that writes on mount and no timeout. A `loadError` field
  distinguishes a failed read (alert panel, no controls, no retry loop into a write) from "no saved
  progress" (Step 1, nothing stored until the learner moves). A lesson remount is keyed by lesson id,
  so a pending read for one lesson can never be applied to another.
- Resume data: the record gained optional `phase` (`teach|practice|check|done`) and `index`, so the
  exact screen comes back, plus `checkPractice` (rehearsal memory). Absent fields resume exactly as
  before, so old records and old backups need no migration; schema stays v4. `backup.ts` now carries
  the two new fields through export/import (unknown phases are dropped, not guessed).
- Saves are commit-then-apply: `progressLesson` issues `repos.commitLesson(...)` (progress row,
  completion history, review schedule, mastery introduction in **one** transaction, requested with
  `durability: 'strict'`) and only dispatches the new state after it resolves. A rejected write
  returns `false` and changes nothing in memory. `recordAttempt` uses `repos.commitAttempt` (attempt
  + mastery together) and `recordReviewResult` uses `repos.commitReview`.
- Advancement is await-then-show: `go()` awaits the save and moves the screen only on success, shows
  a `save-error` alert with a **Try again** button on failure, and disables every advance/answer
  control while a write is in flight (so a double click cannot skip a step or double-record an
  answer). "Try again" replays the failed move (or the failed finish) exactly once.
- Regression tests use a real IndexedDB (fake-indexeddb) and a narrow fault seam at the real
  transaction boundary: `IdbRepos.testHooks.beforeCommit(kind)` runs from the last request's
  `onsuccess` and aborts the commit, reproducing "the call succeeded, nothing was written".

### Fixed in session 5 — backup merge duplicated records and could apply half an import

The independent audit confirmed two defects. Both are fixed; nothing else was changed in this batch.

1. **Repeated merge imported duplicate attempts, history and review logs.** Append-only stores were
   re-appended on every import and had no identity that survived JSON. Fix: every attempt, history
   entry and review log carries a `uid` (minted at creation, schema v4, unique index, old rows
   backfilled in the upgrade). A merge import skips rows whose uid is already stored, so importing a
   backup twice is a no-op (apart from the deliberate import-audit event). Older backups without uids
   get a deterministic content-derived uid, so the same old file also dedupes when imported twice,
   while byte-identical rows *inside* one file keep separate identities.
2. **A failed merge could leave keyed records committed.** The merge did `putX` calls and then a
   separate `appendAll`, each its own transaction. Fix: `Repos.mergeAll(plan)` writes profile,
   lesson states, mastery, experiments, reviews, attempts, history, review logs **and** the audit row
   in one transaction, issuing every request synchronously after the uid lookups complete. A failure
   aborts everything, `applyBackup` rejects, and Settings reports "Nothing was imported" without
   refreshing (the in-memory state was never mutated).

While doing this, two latent bugs in the shared transaction plumbing were fixed: `done()`'s handlers
could be silently replaced (a failed transaction then hung forever instead of rejecting), and
`repairSchema` never created a missing index on an already-existing store. The migration was also
verified in real Chromium (an in-line-key store must use `cursor.update`, not `put(value, key)`,
which throws `DataError`).

### Fixed in session 4 — lessons could never be completed; offline reloads never worked

Reported from a phone: the "Position" block sat *above* the Back/Next step bar, the bar had a
see-through background with no edge, and in practice "Next exercise" / "Skip for now" wrapped onto
two lines while "Your answer" was hidden underneath. Causes and fixes:

- The footer was sticky at `bottom: nav-height` with a 92%-opaque blur, so it floated in the
  middle of the screen over the card's text.
- An attempt to hide it while reading (animating `visibility`) made it *more* broken: a sticky
  element that starts animating mid-scroll is re-placed at its static position by the browser,
  so it locked onto the text. Lesson: never animate a sticky bar's visibility
  (recorded in `docs/testing.md`).
- Final behaviour: on phones it is a single opaque, edge-to-edge bar docked directly on the bottom
  nav with a top seam and no radius; the scroll area reserves its height so the last line of the
  card is always reachable. Desktop keeps the calm in-card footer with a divider. Practice puts
  "Skip for now" on its own full-width row, so "Next exercise" never wraps.
- Regression coverage: `e2e/lessonLayout.spec.ts` (asserts no readable text is covered, the bar is
  opaque and outranks in-card sticky content, the practice bar docks flush at the bottom edge with
  the nav stepping aside, the teaching bar sits flush on the nav, the answer input is reachable, and
  every label is one line).

Second round on the same bar, reported from a phone:

- **A content block painted over the bar.** The number-line `.equation-strip` is itself
  `position: sticky` with `z-index: 10`; the bar was only `5`, so the "POSITION" block drew on top.
  The bar is now `z-index: 20` (under the nav's 40). Covered by `lessonLayout.spec.ts` via
  `elementFromPoint`.
- **The two bars sat at different heights.** The practice bar was sticky *inside* the card, so it
  could only dock if the page could scroll it to the bottom of the viewport — it usually could not
  (page already at max scroll), leaving it floating over the input. On phones the lesson bar is now
  always `position: fixed`, flushing to the bottom edge in practice/check (nav hidden) and onto the
  nav while teaching. Same surface, no gap, no overlap.



**1. Every mastery check counted as "helped", so no lesson could be finished.**
`ExerciseCard` computed `usedHelp = freeHints ? hintsShown : Math.max(hintsShown, 1)`, so a check
answered with **zero** hints was still stored with `hintsUsed: 1`. `checkPassedBy` treats any hint as
disqualifying, so completion was impossible for every lesson, on every device. Fix: `usedHelp` is the
number of hints actually shown. Checks now also offer **no hint button at all** (`noHints`), which
removes the dead end where a hinted check could never be cleared; the engine rule stays as defence in
depth for older data. Rationale and alternatives: `docs/decisions/mastery-checks.md`. Covered by
`src/ui/screens.test.tsx` and two `e2e/lesson.spec.ts` tests, plus the full completion flow.

**2. Offline reloads showed the boot screen forever.**
`sw.js` precached with `new Request(url)`, which stores entries as `no-cors`/`omit`; real page
requests are `cors`/`same-origin`, and `cache.match()` compares both. The cache *looked* complete
(69 entries) while every offline request missed it, so JS/CSS were fetched from the network or failed.
Fix: precache with string URLs (`cache.addAll(PRECACHE)`) and, as a second line of defence, match
assets by URL path. Recorded in `docs/testing.md` under "Traps that cost real time".

### Fixed in session 3 — saved experiments could not be deleted from the list

Symptom: confirming "Delete" on a saved experiment emptied IndexedDB but the row stayed on
screen. Cause: `DeleteExperimentButton` called `useAppSession()` per row, so each row owned a
separate facade; the delete was forwarded to a different session instance than the one the
list rendered. Fix: the page passes its own `deleteExperiment` down as a prop (one hook call
per screen), and the facade memo is keyed on the session instance (`[target, state]`).
Regression coverage: `src/ui/sessionLifecycle.test.tsx`. Rationale:
`docs/decisions/session-facade.md`.

Also fixed in the same area: `getExperiment` now waits for storage to finish loading instead
of reporting a saved experiment as missing on a fresh page (this broke reload and shared
`?exp=` links); `useToolHistory` resets on an explicit `experiment:<id>` key rather than a
serialized snapshot, so a two-step load no longer wipes the learner's work; evaluator results
are hidden unless the draft matches the model.

## 3. Completed features — evidence

### Math engine — `npx vitest run src/math` → 27 passed
- `rational.ts` exact bigint rationals (JSON-safe: `from()`/`toJSON()` as `{n, d}` strings).
- `expression.ts` recursive-descent parser with implicit multiplication, unicode operators (`× · ÷ −`),
  `sqrt`/`abs`, single-letter variables, length/exponent caps, descriptive errors. A lone `x` typed
  between two numbers (`5 x 4`) is read as multiplication; `2x`, `x²`, `x + 1` still mean the variable.
- `evaluate.ts` exact evaluation with `exact` flag; LaTeX and plain rendering.
- `polynomial.ts` canonical multivariate polynomials; equivalence is canonical equality (sound;
  returns `unsupported` rather than guessing).
- `equation.ts` parse/check by substitution, validated transforms (refuses multiply/divide by
  possibly-zero), `solveLinear` with steps.
- No `eval`/`Function` anywhere in `src/` (grep-verified).

### Persistence — `npx vitest run src/storage` → 25 passed
- `db.ts` DB `algebra-playground` v4: profile, lessonStates, attempts, mastery, experiments, history,
  review, reviewLog, meta; additive migrations, defensive repair, typed errors, blocked handling.
  v4 adds a **unique `uid` index** on attempts/history/reviewLog and backfills `uid` on existing rows
  (`cursor.update` inside the versionchange transaction, so every historical row keeps its primary
  key and only gains a field).
- `repositories.ts` typed repos: repairs every missing index on existing stores, writes await
  transaction completion (`done()` uses `addEventListener`, so a later `onerror` assignment can never
  discard the rejection). `replaceAll` clears+writes in one transaction. **`mergeAll(plan)`** is the
  merge import: one read-write transaction over all eight stores, `uid` membership lookups for every
  append row, then the writes — issued only after *all* lookups finish, so the transaction cannot go
  inactive. Any failure aborts the whole transaction.
- `backup.ts` format `algebra-playground-backup` v1: per-field sanitisation and caps, rejects foreign
  and newer files; merge keeps newest-wins for keyed records; append-only stores are deduplicated by
  `uid`; the import-audit history row is part of the same transaction. Backups without uids get a
  deterministic **legacy uid** derived from every field of the record plus its occurrence number in
  the file (identical re-imports dedupe; identical rows within one file stay distinct).
- Tests cover: fresh init, reopen (restart), quota error surfaced, v1→v4 migration keeps data,
  JSON round-trip, malformed/foreign rejection, sanitisation, merge newest-wins, replace clears, plus
  `backupIntegrity.test.ts` (13 tests): repeated merge, overlapping/distinct merge, same-answer
  attempts stay distinct, export→import→export→import, legacy backups, duplicate uids in one file,
  stable statistics, injected transaction failure leaves every store unchanged, recovery, replace.

### Curriculum — `npx vitest run src/content` → 13 passed
- `types.ts`, `concepts.ts`, `lessons/world1..7.ts` (36 lessons: 7/6/3/5/4/5/6), `curriculum.ts`
  registry, `validateCurriculum`, prerequisite ordering helpers.
- Every authored answer grades correct; choice answers appear among choices; ids unique;
  prerequisites appear earlier in the path.
- `masteryChecks.ts`: 36 sets × 2 questions, two distinct varieties per set, no hints, ids `…-k1/k2`;
  tests grade every check answer and assert coverage of every lesson.

### Engines — `npx vitest run src/engine` → 27 passed
- `grading.ts` exact grading (numeric / expression / equation / choice, coordinate forms),
  misconception diagnosis (sign-error, combined-unlike-terms, partial-distribution,
  inverse-operation-error, same-side-error, unparseable, coordinate-order, off-by-one…).
- `variants.ts` deterministic seeded variants. `mastery.ts` evidence → state with documented
  thresholds. `review.ts` transparent interval schedule [1,3,7,16,35,75] × ease.
- `tutor.ts` escalating hints (`requestHint(ctx, freeHintsShown)` skips hints already shown inline),
  worked examples, switch-model on repeated misconception, prerequisite fallback, difficulty
  adjustment, `recommendNext`, follow-up questions.

### UI logic — `npx vitest run src/ui src/tools/toolState.test.ts` → passed
- `router.ts`: `#`-only routing, query params, `navigate` notifies synchronously (replace and repeat
  navigation safe), no duplicate history entries.
- `lessonProgress.ts`: practice vs check exercises, independence (newest attempt, `hintsUsed === 0`),
  variety gate capped by exercise count, check passes only when every check question was answered
  correctly **without any hint** (a hint recorded on that question disqualifies it even if a later
  attempt had `hintsUsed = 0`), `pickCheckQuestions` (≤ 3, distinct varieties first),
  `nextActionAfterLesson` (remedy when mistakes ≥ successes, practice when spacing needed, next, done).
- `toolState.ts`: defaults for all 8 tools, sanitisation of arbitrary JSON (lesson `initialState` and
  imported experiments), Rational JSON round-trip, clamping, malformed piles rejected, `symbolicFor`
  never throws on junk.

## 4. Partially implemented / known limitations

- Balance tool supports add/subtract only — visual piles cannot honestly show multiply/divide.
- `equationsEquivalent` compares polynomial differences only; non-polynomial → `unsupported`.
- `solveLinear` is linear, one variable. Inequalities are graded as expressions (`x < 4`), not solved
  symbolically beyond equality-style forms.
- Expression equivalence falls back to exact text comparison when polynomial comparison is unsupported
  (conservative: may reject a valid alternate form rather than accept a wrong one).
- `Rational.pow` guards huge exponents via the parser (|exp| ≤ 24 after review).
- Lesson `masteryCheck` data lives in `masteryChecks.ts` (kept apart from teaching exercises); the
  curriculum test attaches it via `withMasteryChecks`. If the runtime ever needs checks in
  `CURRICULUM`, merge them in `curriculum.ts` and delete that helper.
- `prompt`-only check questions without `math` still render fine; KaTeX is a separate 258 kB chunk.
- Mastery checks offer no hints by design (see `docs/decisions/mastery-checks.md`): a learner who
  is stuck leaves the check with "Try the check later" and practises instead.
- Backup identity: rows written before v4, or inside a backup exported before uids existed, get a
  content-derived legacy uid. Two *separate* legacy backups that contain byte-identical records (same
  answer, same millisecond, same attempt number) are indistinguishable and will be merged as one.
  Current-version exports are unaffected: they carry a real uid per record.
- A merge import opens one transaction across all eight stores; a concurrent lesson save that lands
  in the middle of a large import waits for it (milliseconds in practice) instead of interleaving.
- Lesson advancement and completion are atomic (`commitLesson`), and so are attempt+mastery and
  review+log+mastery+history. *Sequences* of operations are not: "finish lesson" then "grant mastery"
  are two transactions, so a failure between them leaves the lesson complete with mastery ungranted.
  The UI says so, and "Try again" re-grants from the stored attempts — but a learner who ignores the
  message and navigates away keeps the ungranted state until they finish another lesson on the concept.
  The cross-tab render loop (§7) is the other place where two writers are not coordinated.
- `durability: 'strict'` is requested for lesson writes. It is a hint: a browser may ignore it, and it
  protects against OS/browser crashes, not against a power cut after the browser reported success.
- A failed *load* currently offers "Reload" only; there is no in-place retry button.
- The exact browser-level reload defect (position shown ≠ position stored) is timing-dependent: it
  reproduced once against the pre-fix build and not on a repeat run. The deterministic proof is the
  unit/widget suite, which fails 13/23 on the pre-fix source (see §8).

## 5. Architecture

```
index.html                 boot shell + meta + manifest link (relative URLs for BASE_PATH)
build/sw-plugin.ts         emits versioned sw.js + sw-version.txt from precache manifest
public/                    manifest.webmanifest, sw.js template, icons
src/math/                  exact rationals, parser, evaluator, polynomials, equations (pure)
src/storage/               IndexedDB schema, migrations, repositories, backup import/export (no React)
src/content/               worlds, concepts, lessons/*, masteryChecks.ts, registry + validator
src/engine/                grading, diagnosis, variants, mastery, review, tutor (pure)
src/tools/                 one state model per tool + SVG views + panels + workspace + toolState adapters
src/components/            MathView (KaTeX), ExerciseCard, Sheet/EmptyState, StepVisual, icons
src/ui/                    App shell, router, session hooks, screens, lessonProgress, experiments hand-off
src/styles/                design system (tokens, layout, components, dark theme, reduced motion)
src/test/setup.ts          jsdom shims + fake-indexeddb
src/App.tsx, src/main.tsx  route switch, theme, error boundary; mount + SW registration (prod only)
```

Rules kept: one pure state object per tool; SVG and symbolic view both derive from it; operations
return a new state or an error; UI depends on math/storage/engine but never the reverse.

## 6. Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | dev server (no service worker) |
| `npm run build` | typecheck + production build into `dist/` (emits `sw.js`) |
| `npm run preview` | serve the built app on :4173 |
| `npm test` (`npx vitest run`) | unit + component tests |
| `npx tsc -b` | typecheck everything |
| `BASE_PATH=/algebra-playground/ npm run build` | project-pages build |
| `npm run test:e2e` | Playwright on both projects (expects a fresh port 4179) |

## 7. Next three tasks

Batches 1 and 2 are committed (`05ca664`). Batch 5 (session 7) is implemented and verified but
**uncommitted**; review, then commit.

1. **Investigate the cross-tab lesson render loop** (reported by the audit, not yet reproduced): two
   tabs on the same lesson appear to keep re-rendering each other. Measure first, then decide whether
   a `BroadcastChannel`/`storage`-event merge is needed. *Deferred by the user; still open.*
2. **Equation-step narration:** give each teaching step that is currently only visual an audible
   restatement (the `MathView` `label` pattern exists). *Deferred by the user; still open.* This
   includes the separate "`solveLinear` worked-step narration" defect, which remains **unfixed**.
3. **Decide adaptive question selection's policy** (session 7 measured that the helpers exist but are
   never called, and that the content has no variation templates at all). The missing decision is
   *which flow may vary a question* — see §9. Also still open: the mastery-review policy (unchanged)
   and partial mastery-grant recovery after a completed lesson.

## 8. Test status (session 7, current source)

Every row below was **run this session on the current source**.

| Layer | Command | Result |
| --- | --- | --- |
| Curriculum/tutor quality (new) | `npx vitest run src/engine/curriculumQuality.test.ts` | **16 passed** (exit 0); **10 of 16 failed** on the pre-fix source |
| Engine + content | `npx vitest run src/engine src/content` | **55 passed / 3 files** (exit 0) |
| Unit + component | `npx vitest run` | **206 passed / 12 files** (exit 0) |
| Types | `npx tsc -b` | clean (exit 0) |
| Production build | `npx vite build` | exit 0 |
| E2E (both projects) | `E2E_SKIP_BUILD=1 npx playwright test` | **96 passed, 2 skipped** (exit 0) |

The 2 skips are the same viewport-conditional pair in `e2e/navigation.spec.ts` (mobile-only /
desktop-only), not failures. E2E runs against a production build served by `vite preview` on 4179;
kill a stale preview first (`lsof -t -i:4179 | xargs -r kill`), otherwise `reuseExistingServer`
serves an old bundle.

**Historical, not re-run this session:** session 6 lesson persistence (`lessonPersistence.test.tsx`
24 passed, UI+storage 105 passed), session 5 storage tests (25 passed), and the subpath E2E build
(last full run: session 4).

## 9. Session 7 — adaptive difficulty and curriculum/tutor quality

### Adaptive selection: measured, not assumed

- `variantOf`, `generateArithmetic`, `seededRand`/`seededInt` (`src/engine/variants.ts`) and
  `nextDifficulty`, `independentStreak` (`src/engine/tutor.ts`) exist and are unit-tested.
- **No production module calls any of them.** Only their own file and test files reference them.
- `variantOf` only varies exercises whose `math` contains a `{{placeholder}}`. A scripted check over
  the whole curriculum found **153 exercises, 0 with a placeholder, 0 changed by `variantOf`** — the
  function is a no-op on every question the app can show today.
- `reviewExercises` is declared in the type but **no lesson supplies one**, so the review page's
  "re-generate by variant" comment describes a path that never runs.
- What *does* adapt today: hints (escalating, then a worked example), remediation (switch model,
  prerequisite lesson), mastery state, and the spaced-review interval. Question *selection* does not.

### Decision

Adaptive question selection is **not** wired up this session, and no data/backup change was made.
Reason: the only safe hook needs a policy the product has not chosen — must a *graded practice* set
change (which affects which varieties count as mastery evidence, hence lesson completion), or may
only an explicitly optional "more practice" sitting vary? Both are defensible, and choosing one
silently would change what "complete" means for every existing learner. Combined with the fact that
the content has no variation templates, wiring `variantOf` today would inject invented questions into
authored lessons for no teaching gain. Recorded as next task 3.

### Defects found and fixed (each reproduced first)

1. **Equation misconceptions were never diagnosed in the app.** The rules need the unknown's value;
   production never passed it, so every wrong equation answer was "not-solution" while lessons declare
   specific diagnoses. The value is now read from the authored answer.
2. **An inverse-operation slip went unlabelled.** `x + 4 = 10` answered `x = 14` (added instead of
   subtracted) is now `inverse-operation-error`, derived from the equation's own operator.
3. **Order-of-operations slips were reported as "check your arithmetic".** `2 + 3 × 4 = 20` and
   `20 − 10 ÷ 2 = 5` are now `order-left-to-right`; `2³` read as `2 × 3` is `exponent-as-multiply`.
   Bracketed questions and coincidental matches stay generic.
4. **"Off by one — re-count carefully" fired on non-counting questions** (including balance and
   sign questions), sending beginners to look for the wrong thing. Now only for plain whole-number
   sums/differences.
5. **The tutor never showed a diagnosed misconception's advice on the first mistake**, and a
   `same-side-error` follow-up ("what did you change on the left side?") was asked under plain
   arithmetic. Advice is now shown with the grader's sentence, follow-ups consider the question.
6. **A second attempt on the same question still produced the generic "Not yet…"** message; it now
   escalates as documented. The worked example also no longer puts the finished solution on line two.
7. **Two content defects:** `w4-l1-e3` asked "What must I do…?" while only accepting the bare number
   (reworded to ask how much to add), and `w2-l4-e2`'s solution ended on the completed fraction `3/9`
   rather than the blank's value 3.

### Regression tests added

`src/engine/curriculumQuality.test.ts` (16 tests): equation diagnosis with and without context;
precedence and exponent slips plus the "stay generic" cases; off-by-one only when counting; every
numeric exercise rejects a wrong answer; every exercise accepts its own stored answer; a wrong answer
is never reported correct; two-attempt escalation and the 3-mistake rule; first-mistake advice;
generic diagnoses not dressed up as repeats; worked-example ordering; substitute-back tip only with a
variable; balance follow-ups only on equations; hints are non-empty and not duplicated; the two
content fixes. Faults were injected by restoring the pre-fix files, not by mocking.

### Left untouched (deliberately)

Cross-tab/multi-tab consistency; `solveLinear` worked-step narration and equation-step narration
generally; mastery-review policy; partial mastery-grant recovery after a completed lesson;
accessibility/mobile; offline/PWA; GitHub Pages config.
