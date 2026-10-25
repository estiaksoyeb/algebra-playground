import { useTranslation } from 'react-i18next';
import { SUPPORTED_LOCALES, changeLanguage, type SupportedLocale } from '../i18n';

/**
 * Compact E N / বাংলা toggle.
 *
 * The label of the language you would switch *to* is shown in that language's own script,
 * which is the one thing a learner can read even when the rest of the UI is not in their
 * language yet. Maths is untouched by this control.
 */
export function LanguageToggle({ className = '' }: { className?: string }) {
  const { i18n, t } = useTranslation();
  const current: SupportedLocale = i18n.language === 'bn' ? 'bn' : 'en';
  const other = SUPPORTED_LOCALES.find((l) => l.code !== current) ?? SUPPORTED_LOCALES[0];
  const otherShort = other.code === 'bn' ? 'বাংলা' : 'EN';

  return (
    <button
      type="button"
      className={`lang-toggle ${className}`.trim()}
      onClick={() => void changeLanguage(other.code)}
      aria-label={t('header.languageToggle', { language: other.label })}
      title={t('header.languageToggle', { language: other.label })}
      data-testid="language-toggle"
      data-lang={current}
    >
      <span aria-hidden="true">{otherShort}</span>
    </button>
  );
}
