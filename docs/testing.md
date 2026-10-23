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
- **Do not animate a sticky bar's visibility.** If a `position: sticky` element gains its
  `visibility` or `animation` mid-scroll it becomes a *new* sticky element, and the browser
  places it at its static position until the next scroll — which puts it on top of the text
  it should float over. That bug shipped once in the lesson footer. Change visibility via
  state, or keep the bar permanently fixed on phones.
- **A fixed bar needs reserved space.** Content under a `position: fixed` bar is unreachable
  unless the scroll area has bottom padding at least as tall as the bar (see `.app-main:has(.lesson-shell)`).
- **A sticky bar can only dock if the page can scroll it there.** `position: sticky` does not
  push past its container's end, so a bar in a short card stops short of the bottom edge and
  floats over the content. On phones the lesson bar is therefore `position: fixed`, not sticky.
- **Audit z-index before trusting a sticky bar's backdrop.** In-card sticky elements (the
  number-line `.equation-strip`, z-index 10) paint in order *after* a later sibling, so the
  bar needed a higher stacking level (20) to stay opaque over them. `lessonLayout.spec.ts`
  checks this with `elementFromPoint`.
- **Two fixed bottom surfaces need one owner.** A nav and an action bar cannot both occupy the
  bottom edge; practice/check hide the nav on phones rather than offset the bar by its height,
  which never lines up with the safe-area insets.
- **Never hand-patch `dist/`.** It is minified output: variable renaming makes careful
  string surgery silently wrong, and a regex can corrupt the bundle while `node --check`
  still passes. Build from source and add a temporary `console.log` there if you must.
- **Reading DOM straight after a click** can race React. Use `expect(...).toHaveText`
  (which retries) rather than reading `innerText` immediately.
- **Locator ambiguity on touch.** A locator like `getByRole('button', { name: 'Delete X' })`
  can match more than one node while a list is re-rendering. Scope locators to a row or
  section rather than searching the whole page.
- **`localhost` is not one address.** Days were lost to this: `vite preview` without `--host`
  binds whatever `localhost` resolves to. This machine's `/etc/hosts` maps it to `127.0.0.1`,
  GitHub's `ubuntu-latest` maps it to `::1` first, so the server listened on IPv6 only while
  Playwright probed the IPv4 literal `127.0.0.1`. The result was `ECONNREFUSED` for the entire
  timeout and a message that blames `config.webServer`, even though the server was running and
  healthy. The config now passes `--host 127.0.0.1` so both ends agree. A **local pass proves
  nothing about this class of bug** — the resolver config is the variable under test, so verify
  it on the runner or make the address explicit. When a `webServer` times out but the process is
  alive (no "exited early" error), suspect the bind address before the build.
- **`E2E_SKIP_BUILD=1` is only valid against a matching build.** It tells Playwright to serve an
  existing `dist/` without building. Reusing a subpath build at `/` (or the reverse) 404s every
  asset, so the app never mounts and *every* test fails only after its `expect` timeout — minutes
  of silence that looks like a hang. `playwright.config.ts` now checks an asset path against
  `E2E_BASE_PATH` while loading the config and fails in ~3s with the mismatched paths named.
  Keep that guard: it converts the single most time-wasting failure mode into an instant error.
- **Don't pipe a slow suite into `tail`** while diagnosing. Playwright prints only when tests
  finish, so a log with no live output makes a slow failure indistinguishable from a hang. Watch
  it directly, or use `--reporter=line`.

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
| Lesson action bar never covers content, labels fit | `e2e/lessonLayout.spec.ts` |
| Navigation & hash routes | `e2e/navigation.spec.ts` |

## Honesty rule

Only report a suite as passing if you ran it in this state of the code. If a change was
made after the last run, the result is stale — say so.
