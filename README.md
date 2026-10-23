# Algebra Playground

A visual-first, offline-capable algebra course for absolute beginners. Every idea is shown twice — as a
picture you can move and as symbols that update with it — and progress is kept only on your device.

- **Visual and symbolic views come from one model.** Each of the eight tools has a single pure state
  object; the SVG and the equation are both derived from it, so they can never disagree.
- **No backend, no accounts, no tracking, no AI, no API keys.** It is a static site.
- **Works offline** after the first visit (service worker precaches the app shell and every asset).
- **Real maths, not string matching.** Exact rational arithmetic, a safe parser (no `eval`), and
  polynomial comparison decide whether an answer is right.
- **Honest tutoring.** Hints escalate; a short no-hint mastery check proves an idea has stuck, and a
  hint on that check is recorded as help.

## Try it

```bash
npm install
npm run dev          # http://localhost:5173
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server (service worker disabled, hot reload) |
| `npm run build` | Typecheck and build to `dist/` (also generates `sw.js` + `sw-version.txt`) |
| `npm run preview` | Serve the production build on <http://localhost:4173> |
| `npm test` | Unit and component tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright; builds and serves `dist/` itself) |
| `npm run verify` | Typecheck, unit tests and a production build |

## Deploying to GitHub Pages

Everything is static and hash-routed (`#/learn`, `#/playground/graph?exp=…`), so no server rewrites or
404 fallbacks are needed.

1. Push the repository to GitHub.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push to `main`. `.github/workflows/deploy.yml` typechecks, runs the unit tests, runs Playwright
   against the production build served under the repository subpath, builds, and publishes `dist/`.

The workflow passes `BASE_PATH=/<repository-name>/`. `vite.config.ts` uses that value for asset URLs,
the manifest, icons and the service-worker scope. If you rename the repository (or host at
`https://<user>.github.io`), update both `BASE_PATH` and `E2E_BASE_PATH` in the workflow.

To build for a subpath by hand:

```bash
BASE_PATH=/algebra-playground/ npm run build
npx vite preview --port 4173   # preview at http://localhost:4173/algebra-playground/
E2E_BASE_PATH=/algebra-playground/ npx playwright test
```

## Your data

- Progress lives in IndexedDB (database `algebra-playground`, schema v3 with migrations). Only the
  theme choice is mirrored in `localStorage` so the first paint is not the wrong colour.
- **Settings → Export backup** downloads a single JSON file. **Import** checks the file, shows what it
  contains, and only then applies it — either *merge* (newest record wins) or *replace*. Malformed,
  foreign or newer-format files are refused with a reason and change nothing.
- **Settings → Erase all progress** asks for confirmation first.

## Project layout

```
src/math/       exact rationals, safe expression parser, polynomials, equations (no DOM)
src/storage/    IndexedDB schema + migrations, repositories, validated backup import/export
src/content/    7 worlds, 36 lessons, concepts, per-lesson mastery checks, validator
src/engine/     grading and misconception diagnosis, mastery, spaced review, tutor
src/tools/      one state model per tool, SVG views, panels, playground workspace
src/ui/         hash router, session, screens, lesson runner
src/components/ KaTeX rendering, exercise card, layout pieces
src/styles/     design system (tokens, components, dark theme, reduced motion)
e2e/            Playwright specs (navigation, lessons, playground, backup, offline, responsive)
build/          Vite plugin that emits the versioned service worker
```

See [`PROGRESS.md`](./PROGRESS.md) for current status, test counts, known limitations and next steps.

## Developer documentation

- [`docs/architecture.md`](./docs/architecture.md) — layers, dependency rule, the model-as-source-of-truth invariant.
- [`docs/storage-and-backup.md`](./docs/storage-and-backup.md) — IndexedDB schema, migrations, backup format and import rules.
- [`docs/testing.md`](./docs/testing.md) — the three test layers, what covers what, and the traps that waste time.
- [`docs/maintenance.md`](./docs/maintenance.md) — runbook: adding lessons/tools, deploying, invariants, debugging recipes.
- [`docs/decisions/session-facade.md`](./docs/decisions/session-facade.md) — why the shared session is a facade, and the bug it prevents.
- [`docs/decisions/mastery-checks.md`](./docs/decisions/mastery-checks.md) — why mastery checks offer no hints, and the bug that made every lesson uncompletable.

## Accessibility & devices

Mobile first: 44px touch targets, bottom navigation under 960px, visible focus, labelled controls,
`aria-live` feedback, reduced-motion support. The responsive tests check for horizontal overflow and
small tap targets at 360, 390, 414, 768, 1280 and 1440px wide.

## License

Learning content and code are provided for personal and educational use.
