# Testing

Three layers. Each catches a different class of bug; do not skip a layer because the
layer above is green.

| Layer | Command | Runs in | Catches |
| --- | --- | --- | --- |
| Types | `npx tsc -b` | Node | wiring errors, bad props, stale imports |
| Unit + component | `npx vitest run` | jsdom + fake-indexeddb | math, storage, engines, component wiring |
| End-to-end | `npx playwright test` | real Chromium | routing, reloads, service worker, layout |

## Unit and component tests

`src/**/*.test.{ts,tsx}`, config in `vite.config.ts` (`test` block).
`src/test/setup.ts` installs `fake-indexeddb` and jsdom shims.

Anything that touches the shared session must call `__resetSessionForTests()` in
`beforeEach` and clear storage — the facade caches an instance at module level, so
without the reset one test's data leaks into the next.

Prefer testing **components** for wiring bugs. A reducer can be perfectly correct while
the app still fails because a component called a hook in the wrong place; that class of
bug only appears when the real tree is rendered.

## End-to-end tests

`playwright.config.ts` defines a `mobile` project (Pixel 5, 390×844, touch) and a
`desktop` project. Tests run against `vite preview` on port **4179**, not the dev server,
so the service worker and production build are exercised.

- Use the `freshPage` fixture (`e2e/fixtures.ts`) — it gives every test a new browser
  context, so IndexedDB and the service worker start clean.
- Set `E2E_BASE_PATH=/algebra-playground/` to run against a subpath build.
- Screenshots and `error-context.md` land in `test-results/` when a test fails; read the
  accessibility snapshot there before guessing.

### Traps that cost real time

- **Stale service workers.** Rebuilding `dist/` changes asset hashes. An ad-hoc browser
  that already registered the old worker can keep serving the old bundle, so your "fix"
  appears not to work. Always use a fresh context, or unregister workers.
- **A cache that lists entries is not a cache that serves them.** `Cache.addAll()` stores
  each string URL with `mode: 'cors'` and `credentials: 'same-origin'`, but
  `new Request(url)` stores it as `no-cors` with `credentials: 'omit'`. `cache.match()`
  compares both, so a cache full of `no-cors` entries misses every real page request. This
  shipped once: the offline test asserted the cache was *populated* and passed, while a
  reload with the network off showed the boot screen forever. Assert the **offline reload
  works**, not just that the cache has URLs in it.
- **Same-origin online vs offline.** `cache.match()` behaves identically in both, but a
  miss is invisible while online because the network fills the gap. Offline-only bugs
  therefore need the context actually set offline (`whileOffline` in `e2e/fixtures.ts`).
- **One visible nav only.** On mobile the desktop rail exists in the DOM but is hidden by
  CSS. Use a `:visible` qualifier when asserting navigation is present.
- **Never hand-patch `dist/`.** It is minified output: variable renaming makes careful
  string surgery silently wrong, and a regex can corrupt the bundle while `node --check`
  still passes. Build from source and add a temporary `console.log` there if you must.
- **Reading DOM straight after a click** can race React. Use `expect(...).toHaveText`
  (which retries) rather than reading `innerText` immediately.
- **Locator ambiguity on touch.** A locator like `getByRole('button', { name: 'Delete X' })`
  can match more than one node while a list is re-rendering. Scope locators to a row or
  section rather than searching the whole page.

## What each mandatory flow is covered by

| Requirement | Where |
| --- | --- |
| Math correctness | `src/math/*.test.ts` |
| Persistence ×9 | `src/storage/*.test.ts` |
| Curriculum integrity | `src/content/*.test.ts` |
| Grading, hints, mastery | `src/engine/*.test.ts` |
| Tool state sanitising | `src/tools/toolState.test.ts` |
| Session facade / delete / reopen | `src/ui/sessionLifecycle.test.tsx` |
| Lessons, settings, import errors | `src/ui/screens.test.tsx` |
| Lesson completion survives reload | `e2e/lesson.spec.ts` |
| Playground save/reopen/delete | `e2e/playground.spec.ts` |
| Export → import | `e2e/backup.spec.ts` |
| Offline after first load | `e2e/offline.spec.ts` |
| No overflow at 390 px, touch targets | `e2e/responsive.spec.ts` |
| Navigation & hash routes | `e2e/navigation.spec.ts` |

## Honesty rule

Only report a suite as passing if you ran it in this state of the code. If a change was
made after the last run, the result is stale — say so.
