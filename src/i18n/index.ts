/**
 * Offline-first i18n foundation.
 *
 * Every string ships in the bundle (no network, no lazy loading), so switching language
 * works with the app fully offline. Only English and Bengali are supported.
 *
 * ---------------------------------------------------------------- math is never translated
 * Numbers stay ASCII 0-9 and variables stay Latin x, y, a, b — in prose, in KaTeX, in tool
 * output. `assertNoBengaliNumerals` enforces that at build/test time for curriculum data,
 * and `normalizeMathInput` cleans up what a Bengali phone keyboard types into an answer box.
 */
import i18n, { type TOptions } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './locales/en';
import { bn } from './locales/bn';

export type SupportedLocale = 'en' | 'bn';

export const SUPPORTED_LOCALES: { code: SupportedLocale; label: string; nativeLabel: string }[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'bn', label: 'Bengali', nativeLabel: 'বাংলা' },
];

/** localStorage key; kept stable so a language choice survives every app update. */
export const LANGUAGE_STORAGE_KEY = 'algebra-playground:lang';

export const DEFAULT_LOCALE: SupportedLocale = 'en';

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return value === 'en' || value === 'bn';
}

/**
 * The saved language, or English. Never throws: a browser with storage disabled (private
 * mode, blocked cookies) must not be able to stop the app from booting.
 */
export function storedLanguage(): SupportedLocale {
  try {
    const saved = globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY);
    return isSupportedLocale(saved) ? saved : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

function persistLanguage(lng: string): void {
  const locale = isSupportedLocale(lng) ? lng : DEFAULT_LOCALE;
  try {
    globalThis.localStorage?.setItem(LANGUAGE_STORAGE_KEY, locale);
  } catch {
    // Storage unavailable: the language still applies for this session.
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
  }
}

/** React-free language switch (used by the header toggle and Settings). */
export async function changeLanguage(locale: SupportedLocale): Promise<void> {
  await i18n.changeLanguage(locale);
  persistLanguage(locale);
}

/** Test/server bootstrap: start from a known language without touching storage. */
export function bootstrapLanguage(locale: SupportedLocale = storedLanguage()): void {
  if (i18n.language !== locale) void i18n.changeLanguage(locale);
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
}

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: { en: { translation: en }, bn: { translation: bn } },
    lng: storedLanguage(),
    fallbackLng: 'en',
    supportedLngs: ['en', 'bn'],
    // A missing Bengali key shows the English string rather than a raw key path.
    returnNull: false,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
}

// Keep <html lang> and storage in step with every change, whichever code path did it.
i18n.on('languageChanged', persistLanguage);

/** Translate outside React (engine code, plain helpers). */
export function t(key: string, options?: TOptions): string {
  return i18n.t(key, options);
}

/**
 * Locale tag for `Intl`/`Date` formatting.
 *
 * Bengali is pinned to the Bangla *script with the Latin numbering system* (`bn-BD-u-nu-latn`)
 * so a date or time never prints ২৫/১০/২০২৬: dates may be localised, digits may not.
 * Anything unrecognised falls back to English.
 */
export function numberLocale(locale: string): string {
  return locale === 'bn' ? 'bn-BD-u-nu-latn' : 'en';
}

/**
 * Belt and braces for browsers whose ICU data ignores `-u-nu-latn`: any Bengali digit that
 * slips into a formatted date is mapped back to ASCII. Displayed maths is never touched.
 */
function asciiDigits(text: string): string {
  const BN = '০১২৩৪৫৬৭৮৯';
  let out = '';
  for (const ch of text) {
    const at = BN.indexOf(ch);
    out += at === -1 ? ch : String(at);
  }
  return out;
}

/** `Date` formatted for the active language, always with ASCII digits. */
export function formatDateTime(date: Date | string, locale: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return Number.isNaN(d.getTime()) ? '' : asciiDigits(d.toLocaleString(numberLocale(locale)));
}

/** `Date` (no time) formatted for the active language, always with ASCII digits. */
export function formatDate(date: Date | string, locale: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return Number.isNaN(d.getTime()) ? '' : asciiDigits(d.toLocaleDateString(numberLocale(locale)));
}

export { i18n };
