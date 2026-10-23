# Architecture

Algebra Playground is a **static, serverless PWA**. There is no backend, no network
calls, no AI, no telemetry. Everything a learner does lives in IndexedDB on their
device; the app itself is a set of JS/CSS assets served from GitHub Pages.

```
index.html                  boot shell, meta, manifest link (relative URLs for BASE_PATH)
build/sw-plugin.ts          emits versioned sw.js + sw-version.txt from a precache manifest
public/                     manifest.webmanifest, sw.js template, icons
src/math/                   exact rationals, expression parser, evaluator, polynomials, equations
src/storage/                IndexedDB schema, migrations, repositories, backup import/export
src/content/                worlds, concepts, lessons/*, masteryChecks.ts, registry + validator
src/engine/                 grading, misconception diagnosis, variants, mastery, review, tutor
src/tools/                  one state model per visual tool + SVG views + panels + workspace
src/components/             MathView (KaTeX), ExerciseCard, Sheet/EmptyState, StepVisual, icons
src/ui/                     app shell, hash router, session hooks, screens
src/styles/                 design system (tokens, layout, components, dark theme, reduced motion)
src/App.tsx, src/main.tsx   route switch, theme, error boundary; mount + SW registration (prod only)
```

## Dependency direction

```
ui ──► tools ──► math
 │        │
 │        └───► content (lesson ↔ tool links)
 └────► engine ──► math
 └────► storage           (no React imports anywhere below ui/)
```

The rule is one-way: `ui` may import anything below it; nothing below `ui` may import
React or touch the DOM. That keeps the math, storage, content and engine layers
testable in plain Node/jsdom without rendering.

## The model is the source of truth

Every visual tool owns **one plain state object** (see `src/tools/toolState.ts`). Both
the picture (SVG) and the symbols (LaTeX) are *derived* from that object — never stored
alongside it, never edited independently. This is why the picture and the symbols can
never disagree, and it is the invariant to preserve when adding a tool.

Operations on a tool state are pure functions that either return a new state or an
error. Nothing mutates in place; the workspace keeps a `{ past, present, future }`
history so undo/redo is just moving between snapshots.

## Session layer

`useAppSession()` is a **single shared session** for the whole app, implemented as a
facade over one `useSession()` instance (`src/ui/useSession.ts`).

- Data loads once per instance and stays in memory; screens read `session.state`.
- Callbacks (`saveExperiment`, `deleteExperiment`, …) are forwarded to the adopted
  instance, not re-created per render.
- Because React cannot share one hook state across components, the facade exists to make
  navigation between screens cheap and consistent.

See [`decisions/session-facade.md`](./decisions/session-facade.md) for the bug this
design fixes and the rules that keep it fixed.

## Routing

Hash routing (`src/ui/router.ts`): `#/learn/:lessonId`, `#/playground/:tool?exp=:id`, and
so on. Hash routes need no server rewrites, which is what makes GitHub Pages project
subpaths work without configuration.

## Storage

IndexedDB database `algebra-playground`, schema **v3**, with additive migrations.
`localStorage` holds only the theme preference. Backup/restore is a versioned JSON
document validated field by field before anything is written.

See [`storage-and-backup.md`](./storage-and-backup.md).

## Offline / PWA

`build/sw-plugin.ts` generates `sw.js` at build time with a precache manifest keyed by a
hash of the emitted assets. Navigation requests are network-first with a cached
`index.html` fallback. Bumping asset contents changes the hash, which invalidates the
old cache on the next visit.
