# Storage and backup

## Database

Name `algebra-playground`, schema version **v3** (`src/storage/db.ts`).

| Store | Key | Holds |
| --- | --- | --- |
| `profile` | `'app'` | preferences (theme, reduced motion, sound), streak dates |
| `lessonStates` | `lessonId` | current step, answers, hint counts, completion |
| `attempts` | auto | every graded answer: exercise, concept, correct, `hintsUsed` |
| `mastery` | `conceptId` | accumulated evidence state |
| `experiments` | `id` | saved playground setups (`tool` + raw state) |
| `history` | auto | activity log entries |
| `review` | `conceptId` | spaced-repetition state |
| `reviewLog` | auto | review outcomes |
| `meta` | `'meta'` | schema bookkeeping |

Migrations are **additive only**. Each upgrade creates stores/indexes it needs and
leaves existing records untouched; a defensive repair pass re-creates anything missing.
A blocked upgrade surfaces as a typed error instead of a hang.

`localStorage` holds exactly one small value: the theme, so the first paint does not
flash. Never put learner data there.

## Repository invariants

- Writes resolve only after the transaction **completes** (not when the request
  succeeds), so a later read cannot miss a write.
- Batch operations (`replaceAll`, `appendAll`) issue every request synchronously inside
  the transaction. `await` between requests lets the transaction auto-commit and the
  rest silently fails.
- Storage failures are returned to the caller, never swallowed; the UI shows an honest
  "could not save" state.

## Saved experiments

Experiments store the **raw** tool state: plain JSON produced by `toRaw(state)` with
`Rational` values serialized as `{ n, d }` strings. Live `Rational` instances are never
persisted — a class instance does not survive `structuredClone` with its prototype, and
silently reloading one as a plain object breaks arithmetic.

Loading goes through `stateFromRaw(tool, raw)`, which fills defaults, clamps values and
rejects malformed data. That is also what makes imported lesson `initialState` safe.

## Export / import format

```jsonc
{
  "format": "algebra-playground-backup",
  "formatVersion": 1,
  "exportedAt": "2026-01-01T00:00:00.000Z",
  "app": { "schemaVersion": 3, "contentVersion": "..." },
  "data": {
    "profile": {}, "lessonStates": [], "attempts": [], "mastery": [],
    "experiments": [], "history": [], "reviews": [], "reviewLogs": []
  }
}
```

Import rules:

- A file with an unknown `format` or a **newer** `formatVersion`/`schemaVersion` is
  refused with a clear message (never partially applied).
- Every record is sanitised and capped before writing; unknown fields are dropped.
- **Merge** keeps the newest record per key; **replace** clears and writes in one
  transaction, so a failure leaves the previous data intact.
- Errors are reported to the learner verbatim; a failed import never claims success.

## Mandatory persistence scenarios (tested)

1. Fresh initialisation creates v3.
2. Reopening the app (restart) sees earlier writes.
3. A quota/blocked failure is surfaced, not hidden.
4. v1 → v3 migration preserves data.
5. JSON export → import round-trips.
6. Malformed JSON is rejected.
7. Foreign/newer format is rejected.
8. Merge keeps the newest per key.
9. Replace clears what is not in the file.
