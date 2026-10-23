# Decision: the shared session facade

Status: **accepted**
Files: `src/ui/useAppSession.ts`, `src/ui/useSession.ts`

## The problem

`useSession()` is a hook with its own reducer state. React gives every component that
calls a hook its **own** state, so if each screen called `useSession()` directly:

- navigating between Learn and Playground would reload storage each time, and
- one screen could write while another displayed stale data.

So `useAppSession()` returns a facade around a single, module-level "adopted"
instance. Data reads come from that instance; method calls are forwarded to it.

## The bug this design has already hit twice

A facade is an ordinary object created during render. If it is recreated (or memoised
against the wrong dependency) it can end up holding the **previous** session instance.

That produced a real, user-visible defect: deleting a saved experiment emptied
IndexedDB (the delete reached instance A) while the row stayed on screen (the list
rendered from instance B). The store looked "undeletable". The bug survived unit tests
because the reducer was correct — only the *wiring between components* was wrong.

Two contributing mistakes, both fixed:

1. **Memoised against `state`.** Two instances with equal data compare equal, so the
   memo was not recreated when the instance changed. The facade now depends on the
   instance itself (`[target, state]`) and captures this render's `target`.
2. **A leaf component owning its own facade.** `DeleteExperimentButton` called
   `useAppSession()` per row. Each call is its own facade, so a row could forward a
   delete to a different instance than the one the list displayed.

## Rules

- **One hook call per screen.** Components that need to *act* on the session receive
  callbacks as props from a component that already has the session. Do not call
  `useAppSession()` inside list-item or leaf components.
- **Adoption is "loaded wins".** A `ready` instance always replaces the cached one; an
  `unavailable` cached instance (storage failed) is also replaceable. A merely
  "mounted" StrictMode copy must never win — it may never finish loading.
- **`state` comes from this render when `chosen === live`.** The cached instance only
  re-renders inside the component that mounted it; this render's hook is fresher.
- Tests reset the module state with `__resetSessionForTests()`.

## How this is tested

`src/ui/sessionLifecycle.test.tsx` renders the real components and asserts that a
confirmed delete removes **both** the row and the stored record, that data saved before
a screen mounts is visible to that screen, and that a saved experiment opens by id.
