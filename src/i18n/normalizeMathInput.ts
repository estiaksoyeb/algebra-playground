/**
 * Keyboard safety net for student input.
 *
 * A phone switched to Bengali types Bengali digits (০-৯) and sometimes the Bengali Arabic
 * separator. A learner who knows the answer must not be marked wrong because of the
 * keyboard, so every typed answer is normalised to the ASCII maths characters the grader
 * and the parser understand. This only ever touches *input*; displayed maths always uses
 * ASCII numerals.
 */

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const BN_TO_ASCII: Record<string, string> = Object.fromEntries([...BN_DIGITS].map((ch, i) => [ch, String(i)]));

/** Bengali full stop and other punctuation that show up when typing in Bengali mode. */
const PUNCTUATION: Record<string, string> = {
  '٫': '.', // Arabic decimal separator
  '٬': ',', // Arabic thousands separator
  '।': '.', // Bengali danda — never valid in an answer, but harmless to drop
  '’': "'",
  '‘': "'",
};

export function normalizeMathInput(input: string): string {
  if (!input) return input;
  let out = '';
  for (const ch of input) {
    if (BN_TO_ASCII[ch] !== undefined) out += BN_TO_ASCII[ch];
    else if (PUNCTUATION[ch] !== undefined) out += PUNCTUATION[ch];
    else out += ch;
  }
  return out;
}

/** True when the text contains any Bengali numeral (used by tests and the content guard). */
export function hasBengaliNumerals(text: string): boolean {
  return /[\u09E6-\u09EF]/.test(text);
}
