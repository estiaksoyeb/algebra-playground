import { useTranslation, Trans } from 'react-i18next';
import { Page } from './Shell';
import { TOOL_LIST, toolText } from '../tools/registry';

export function HelpPage() {
  const { t } = useTranslation();
  return (
    <Page title={t('help.title')}>
      <h1>{t('help.heading')}</h1>
      <p className="muted">{t('help.intro')}</p>

      <div className="tile-grid">
        <section className="card">
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>{t('help.lessonHeading')}</h2>
          <ol className="small" style={{ paddingLeft: 20, margin: 0 }}>
            <li>{t('help.lessonLearn')}</li>
            <li>{t('help.lessonPractise')}</li>
            <li>{t('help.lessonCheck')}</li>
          </ol>
        </section>
        <section className="card">
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>{t('help.masteryHeading')}</h2>
          <p className="small">
            <Trans i18nKey="help.masteryBody" components={{ em: <em /> }} />
          </p>
        </section>
        <section className="card">
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>{t('help.typingHeading')}</h2>
          <p className="small">
            <Trans i18nKey="help.typingBody" components={{ code: <code /> }} />
          </p>
        </section>
        <section className="card">
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>{t('help.dataHeading')}</h2>
          <p className="small">
            <Trans i18nKey="help.dataBody" components={{ a: <a href="#/settings" /> }} />
          </p>
        </section>
        <section className="card">
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>{t('help.offlineHeading')}</h2>
          <p className="small">{t('help.offlineBody')}</p>
        </section>
        <section className="card">
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>{t('help.a11yHeading')}</h2>
          <p className="small">{t('help.a11yBody')}</p>
        </section>
      </div>

      <section className="card mt-4">
        <h2 style={{ fontSize: 'var(--fs-lg)' }}>{t('help.toolsHeading')}</h2>
        <ul className="small" style={{ paddingLeft: 20, margin: 0 }}>
          {TOOL_LIST.map((tool) => (
            <li key={tool.id} style={{ marginBottom: 6 }}>
              <a href={`#/playground/${tool.id}`}>{toolText(tool.id, 'name')}</a> — {toolText(tool.id, 'description')}
            </li>
          ))}
        </ul>
      </section>

      <div className="btn-row mt-4 small">
        <a href="#/">{t('app.backToPlayground')}</a>
        <a href="#/learn">{t('nav.learn')}</a>
        <a href="#/settings">{t('nav.settings')}</a>
      </div>
    </Page>
  );
}
