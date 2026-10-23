# ALGEBRA PLAYGROUND — PROGRESS

_Last updated: session 4 — full verification **green**: 153 unit tests, 38/38 E2E on mobile, 38/38
on desktop, and 76/76 against a `BASE_PATH=/algebra-playground/` build. Two serious bugs were found
and fixed during this pass: **no lesson could ever be completed** (every mastery check was recorded
as helped) and **offline reloads were broken** (precached assets could never be matched). All counts
below were observed on the current source._

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
- [x] Persistence (`src/storage`) — 12 tests, v3 schema with 1→3 migrations.
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
  mastery-check content (**153 tests in 9 files**).

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

### Fixed in session 4 — lessons could never be completed; offline reloads never worked

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

### Persistence — `npx vitest run src/storage` → 12 passed
- `db.ts` DB `algebra-playground` v3: profile, lessonStates, attempts, mastery, experiments, history,
  review, reviewLog, meta; additive migrations, defensive repair, typed errors, blocked handling.
- `repositories.ts` typed repos; writes await transaction completion; `replaceAll`/`appendAll` queue
  requests synchronously.
- `backup.ts` format `algebra-playground-backup` v1: per-field sanitisation and caps, rejects foreign
  and newer files, merge (newest wins) or replace in a single transaction.
- Tests cover: fresh init, reopen (restart), quota error surfaced, v1→v3 migration keeps data,
  JSON round-trip, malformed/foreign rejection, sanitisation, merge newest-wins, replace clears.

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
- Mastery checks offer no hints by design (see `docs/decisions/mastery-checks.md`): a learner who is
  stuck leaves the check with "Try the check later" and practises instead.

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

1. **Commit the initial tree.** The repository has no commits yet; everything is untracked. Make the
   first commit so future changes are reviewable and the Pages workflow has a baseline.
2. **Content review pass:** read worlds 1–7 as a beginner would, checking that each lesson's first
   step needs no prior knowledge and that the tutor's hints never give away the answer outright.
3. **Deploy and smoke-test on GitHub Pages:** push, let `deploy.yml` publish under the repository
   subpath, then install the PWA on a real Android phone, finish a lesson offline, and confirm the
   progress survives a reload.

## 8. Test status (session 4, current source)

| Layer | Command | Result |
| --- | --- | --- |
| Types | `npx tsc -b` | clean |
| Unit + component | `npx vitest run` | **153 passed / 9 files** |
| E2E mobile (Pixel 5) | `npx playwright test --project=mobile` | **38 passed** |
| E2E desktop | `npx playwright test --project=desktop` | **38 passed** |
| E2E subpath build | `BASE_PATH=/algebra-playground/ E2E_BASE_PATH=/algebra-playground/ npx playwright test` | **76 passed** |

E2E runs against a production build served by `vite preview` on port 4179. Kill a stale preview first
(`kill $(lsof -t -i:4179)`), otherwise `reuseExistingServer` can serve an old bundle.
