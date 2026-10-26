/**
 * Keyboard help for answers that are written as a fraction ("3/4", "x=3/2").
 *
 * A numeric answer box asks the phone for the decimal keypad, which on most phones has no
 * "/" key at all. A learner told to "write your answer as a/b" then cannot type the answer
 * the question asked for. The answer box therefore offers the fraction key whenever the
 * answer contains a fraction, so the "/" never has to be found on a keyboard.
 */
import { Exercise } from '../content/types';

/** Kinds whose answer is typed into the input box (as opposed to choosing an option). */
const TYPED_KINDS = new Set(['numeric', 'value-of-variable', 'equation', 'expression', 'coordinate', 'sign']);

/**
 * True when the answer itself contains a fraction. The stored answers are the authority: if
 * the accepted answer is "3/4" (or "x=3/2"), the learner must be able to type a "/".
 */
export function wantsFractionInput(ex: Exercise): boolean {
  if (!TYPED_KINDS.has(ex.kind)) return false;
  const accepted = Array.isArray(ex.answer) ? ex.answer : [ex.answer];
  return accepted.some((a) => String(a).includes('/'));
}

/**
 * The value after tapping the fraction key, given the box contents and where the cursor is.
 * Returns null when the key should do nothing: only a single fraction is ever an answer, so a
 * second slash can never grade.
 */
export function insertFractionSlash(value: string, selectionStart: number | null, selectionEnd: number | null): string | null {
  if (value.includes('/')) return null;
  const start = selectionStart ?? value.length;
  const end = selectionEnd ?? start;
  const next = value.slice(0, start) + '/' + value.slice(end);
  // Keep the box to something a fraction grader can read: numbers, an optional sign or "x=",
  // a decimal point, and at most one slash (checked above).
  return /^-?[\d.]*\/[\d.]*$/i.test(next.replace(/^[a-z]\s*=\s*/i, '')) ? next : null;
}

/** A short readout of what has been typed, so a screen reader hears "3 over 4" rather than "3 slash 4". */
export function readFraction(value: string): string | null {
  const text = value.trim();
  const match = /^(?:[a-z]\s*=\s*)?(-?[\d.]+)\s*\/\s*([\d.]+)$/i.exec(text);
  if (!match) return null;
  const prefix = text.slice(0, text.search(/-?[\d.]+\s*\//));
  return `${prefix}${match[1]} over ${match[2]}`;
}
