import { useTranslation } from 'react-i18next';
import { SUPPORTED_LOCALES, changeLanguage, type SupportedLocale } from '../i18n';

/**
 * Full language picker for Settings: every supported language is shown by its own native
 * name, which is what a learner recognises. Number and variable notation is unaffected.
 */
export function LanguageSelect() {
  const { i18n, t } = useTranslation();
  const current: SupportedLocale = i18n.language === 'bn' ? 'bn' : 'en';
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="field-label">{t('settings.language')}</legend>
      {SUPPORTED_LOCALES.map((locale) => (
        <label key={locale.code} className="choice" style={{ marginBottom: 8 }} lang={locale.code}>
          <input
            type="radio"
            name="language"
            value={locale.code}
            checked={current === locale.code}
            onChange={() => void changeLanguage(locale.code)}
            style={{ width: 20, height: 20 }}
          />
          <span>{locale.nativeLabel}</span>
        </label>
      ))}
      <p className="small muted">{t('settings.languageHelp')}</p>
    </fieldset>
  );
}
