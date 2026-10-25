# Curriculum Editorial & Localization Guide

This guide documents the file locations, architectural rules, and recommended workflow for performing human-in-the-loop editorial and tone passes (English & Bengali) across Worlds 1 through 7.

---

## 1. World & File Mapping

| World | Title / Topic | Lessons | English Source | Bengali Translation (`bn`) | Mastery Checks |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **World 1** | Numbers & Operations | 7 | `src/content/lessons/world1.ts` | `src/i18n/locales/bn/world1.ts` | `src/content/masteryChecks.ts` (`w1-l1` to `w1-l7`) |
| **World 2** | Negative Numbers & Fractions | 6 | `src/content/lessons/world2.ts` | `src/i18n/locales/bn/world2.ts` | `src/content/masteryChecks.ts` (`w2-l1` to `w2-l6`) |
| **World 3** | Variables & Expressions | 3 | `src/content/lessons/world3.ts` | `src/i18n/locales/bn/world3.ts` | `src/content/masteryChecks.ts` (`w3-l1` to `w3-l3`) |
| **World 4** | Equations & Balance | 5 | `src/content/lessons/world4.ts` | `src/i18n/locales/bn/world4.ts` | `src/content/masteryChecks.ts` (`w4-l1` to `w4-l5`) |
| **World 5** | Distributive Property & Area | 4 | `src/content/lessons/world5.ts` | `src/i18n/locales/bn/world5.ts` | `src/content/masteryChecks.ts` (`w5-l1` to `w5-l4`) |
| **World 6** | Linear Graphs & Functions | 5 | `src/content/lessons/world6.ts` | `src/i18n/locales/bn/world6.ts` | `src/content/masteryChecks.ts` (`w6-l1` to `w6-l5`) |
| **World 7** | Exponents, Systems & Quadratics | 6 | `src/content/lessons/world7.ts` | `src/i18n/locales/bn/world7.ts` | `src/content/masteryChecks.ts` (`w7-l1` to `w7-l6`) |

**Core Curriculum Wiring & Types:**
- Central Registry: `src/content/curriculum.ts`
- Curriculum Schema Types: `src/content/types.ts`
- Bengali Overlay Registry: `src/i18n/locales/bn/curriculum.ts`
- Bengali Translation Schema: `src/i18n/locales/bn/types.ts`

---

## 2. Immutable Architecture & Grading Safety

When editing English or Bengali prose, **NEVER** modify these fields:
1. **IDs**: `lesson.id`, `exercise.id`, `misconception.id`, and `conceptId`.
2. **Mathematical Expressions**: `math` strings (LaTeX or mathematical text) must stay identical.
3. **Grading Answers**: `answer` values (numbers, canonical strings, fractions) must stay identical.
4. **Tool Visual States**: `visual.tool` and `visual.initialState` must stay identical.
5. **Multiple-Choice Choices**: `choices` arrays must stay untouched. If a choice is word-based prose, provide display-only Bengali translations via `choiceLabels: { 'Canonical English': 'বাংলা লেবেল' }` without altering the canonical choice string.

---

## 3. Localization & Character Rules (Bengali)

1. **Strict Math & Numeral Rule**:
   - All numbers must be ASCII numerals: `0, 1, 2, 3, 4, 5, 6, 7, 8, 9`.
   - **NEVER** use Bengali numerals (`০, ১, ২, ৩, ৪, ৫, ৬, ৭, ৮, ৯`).
   - Algebraic variables (`x`, `y`, `a`, `b`, `n`) and math operators (`+`, `−`, `×`, `÷`, `=`, `<`, `>`) remain in standard international notation.
2. **Banned Words & Control Invariants**:
   - Do **NOT** use `স্লাইডার` (no tool has a slider; tools use steppers/buttons).
   - Do **NOT** use `ট্যাপ করে` for tiles (the tiles board is read-only; steppers add tiles).
   - Do **NOT** claim the balance tool warns about one-sided changes (`সতর্ক`).
   - Only use `টেনে সরান` (drag) when explicitly mentioning `সংখ্যারেখা`, `সংখ্যারেখায়`, or `গ্রিডে`.
3. **Allowed Characters**:
   - Bengali script block (including danda `।` for full stops).
   - Printable ASCII.
   - Approved math and typography symbols: `—`, `–`, `−`, `×`, `÷`, `±`, `≤`, `≥`, `≠`, `≈`, `√`, `∞`, `π`, `Δ`, `→`, `←`, `↔`, `•`, `…`, `‘`, `’`, `“`, `”`, `²`, `³`, `⁴`, `✓`, `✗`.

---

## 4. Tone & Style Guidelines

### Moving from Robotic Textbook to Engaging Human Mentor
- **Exercise Prompts**:
  - *Avoid:* "Compute.", "Solve for x.", "Evaluate.", "Add the fractions."
  - *Prefer:* "What do you get when you combine...", "Let's isolate x by undoing the addition:", "Apply the order of operations to step through this expression:"
- **Pedagogical Steps**:
  - Frame concepts around intuitive mental models and real-world intuition (e.g. balance scales, walking along a number line, turning arrays to see commutativity).
- **Scaffolded Hints**:
  - Avoid repeating the question or stating bare mechanics. Provide concrete mental strategies, bridge numbers (e.g., reaching 10 first), or memory aids.
- **Bengali Tone**:
  - Use natural, modern spoken Bengali (**চলতি ভাষা**), warm and conversational, like an encouraging personal tutor rather than an archaic or overly formal textbook.

---

## 5. Verification Commands

Always run verification commands individually (never chained with `&&`):

```bash
# 1. TypeScript compilation check
npx tsc -b

# 2. Bengali prose completeness & rule compliance
npx vitest run src/i18n/curriculumProse.test.ts

# 3. Curriculum structure & grading quality
npx vitest run src/content/curriculum.test.ts src/engine/curriculumQuality.test.ts

# 4. Full unit test suite (360 tests)
npx vitest run
```

---

## 6. Recommended World-by-World Workflow

1. **Pick the World** (e.g., World 2).
2. **Polish English First**:
   - Refine `src/content/lessons/world<N>.ts` and corresponding checks in `src/content/masteryChecks.ts`.
   - Run `npx tsc -b` and `npx vitest run src/content/curriculum.test.ts`.
   - Present an overview to the user for review.
3. **Polish Bengali Second**:
   - Update `src/i18n/locales/bn/world<N>.ts` to match the enhanced mentor tone in চলতি ভাষা.
   - Run `npx vitest run src/i18n/curriculumProse.test.ts`.
4. **Commit Separately**:
   - Stage and commit the world's files with a clear message.
