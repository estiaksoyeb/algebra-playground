# Maintaining this project

Practical notes for whoever (or whatever) works on this next. Read
[`testing.md`](./testing.md) before touching tests and
[`architecture.md`](./architecture.md) before touching structure.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173 — no service worker
npm test             # vitest (unit + component)
npx tsc -b           # typecheck
npm run build        # typecheck + production build into dist/
```

End-to-end (needs `npx playwright install chromium` once):

```bash
npx playwright test --project=mobile
npx playwright test                      # both mobile and desktop
E2E_BASE_PATH=/algebra-playground/ npx playwright test   # subpath build
```

The Playwright config builds and serves `dist/` itself on port 4179.

## How to add a lesson

1. Add the lesson to `src/content/lessons/worldN.ts`.
2. Add its mastery check to `src/content/masteryChecks.ts` (2 questions, two distinct
   varieties, ids `<lessonId>-k1` / `-k2`).
3. Run `npm test`. The curriculum test grades every authored answer and asserts every
   lesson has a check, so a typo in an answer fails there rather than in production.

## How to add a visual tool

1. Add the state type and defaults to `src/tools/toolState.ts` **and** its sanitiser in
   `stateFromRaw` (arbitrary JSON must never throw).
2. Add the tool to `TOOL_META` in `src/tools/registry.ts` (`TOOL_LIST` is derived from it).
3. Write one state object, then derive both an SVG view and a symbolic view from it.
   Never store a rendered string in state.
4. Add a case to `toolState.test.ts` covering malformed input.
5. The playlist/e2e test `playground.spec.ts` opens **every** tool and checks both the
   symbol panel and no overflow — it will pick up the new tool automatically.

## Deploying

GitHub Pages via `.github/workflows/deploy.yml`: it builds with
`BASE_PATH=/<repo-name>/` and publishes `dist/`. For a project page the subpath must
match the repository name; for a user/org page use `/`.

Verify a subpath build locally before pushing:

```bash
BASE_PATH=/algebra-playground/ npm run build
npx vite preview --port 4179   # open http://127.0.0.1:4179/algebra-playground/
```

Check asset URLs resolve, the app loads, icons appear, and the SW registers with scope
`/algebra-playground/`.

## Invariants worth protecting

- **No `eval` / `new Function`** anywhere in `src/`. Parsing is a hand-written
  recursive-descent parser that only ever produces data.
- **No unsafe HTML.** The only formatting path is KaTeX via `MathView`; do not
  introduce `dangerouslySetInnerHTML`.
- **No network at runtime.** If something needs a request, the offline promise is
  broken. Grep for `fetch(` / `XMLHttpRequest` before merging.
- **Persisted data is plain JSON.** Convert typed values (e.g. `Rational`) at the
  storage boundary with `toRaw` / `stateFromRaw`.
- **Touch targets ≥ 44 px**, no horizontal scroll at 390 px. `responsive.spec.ts`
  enforces both.

## Debugging recipes

**"My change isn't showing up."** You are probably looking at a cached service worker.
Use a fresh browser context, or DevTools → Application → Service Workers → Unregister,
then hard reload. `dist/` is built output; rebuild after every source edit.

**"It works in the test but not in the app."** Check whether the component creates its
own session facade (see [`decisions/session-facade.md`](./decisions/session-facade.md)).
Wiring bugs are usually about *which instance* a component talks to.

**"Storage says success but the UI is stale."** The merge went to a different instance
than the one being rendered. Same root cause; pass callbacks down as props.

## Keeping PROGRESS.md honest

`PROGRESS.md` at the repo root is the status of record: checkboxes (`[x]` done,
`[~]` partial, `[ ]` not started), the current test counts, known limitations, and the
next three tasks. Update it at the end of any milestone, and never record a test count
from a run that predates your last change.
