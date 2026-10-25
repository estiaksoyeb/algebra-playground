import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { applyBackup, backupToJson, createBackup, parseBackupJson } from '../storage/backup';
import { Page } from './Shell';
import { ThemePref, applyTheme, storedTheme, useAppSession } from './useAppSession';
import { navigate } from './router';
import { DATA_CHANGED_EVENT } from './events';
import { LanguageSelect } from '../components/LanguageSelect';
import { formatDateTime } from '../i18n';

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const session = useAppSession();
  const { data, storageAvailable, saveError } = session.state;
  const [theme, setTheme] = useState<ThemePref>(storedTheme());
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [pendingImport, setPendingImport] = useState<{ json: string; summary: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const prefTheme = data.profile?.preferences?.theme;

  useEffect(() => {
    if (typeof prefTheme === 'string' && (prefTheme === 'system' || prefTheme === 'light' || prefTheme === 'dark') && prefTheme !== theme) {
      setTheme(prefTheme);
      applyTheme(prefTheme);
      try {
        localStorage.setItem('algebra-playground:theme', prefTheme);
      } catch {
        /* ignore */
      }
    }
    // only sync once the profile loads
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefTheme]);

  const changeTheme = async (pref: ThemePref) => {
    setTheme(pref);
    applyTheme(pref);
    try {
      localStorage.setItem('algebra-playground:theme', pref);
    } catch {
      /* storage disabled: theme still applies for this visit */
    }
    await session.setPreference('theme', pref);
  };

  const exportBackup = async () => {
    setBusy('export');
    setNotice(null);
    try {
      const repos = await session.getRepos();
      if (!repos) throw new Error(t('settings.storageNothingToExport'));
      const backup = await createBackup(repos);
      const json = backupToJson(backup);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `algebra-playground-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice({
        kind: 'ok',
        text: t('settings.exported', { attempts: backup.data.attempts.length, lessons: backup.data.lessonStates.length }),
      });
      await session.addHistory('import', t('settings.exportedHistory', { attempts: backup.data.attempts.length }));
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : t('settings.exportFailed') });
    } finally {
      setBusy(null);
    }
  };

  const onFile = async (file: File) => {
    setNotice(null);
    if (file.size > 8 * 1024 * 1024) {
      setNotice({ kind: 'error', text: t('settings.fileTooLarge') });
      return;
    }
    const text = await file.text();
    const check = parseBackupJson(text);
    if (!check.ok) {
      setNotice({ kind: 'error', text: t('settings.importCancelled', { errors: check.errors.join(' ') }) });
      return;
    }
    const b = check.backup!;
    const summary =
      t('settings.backupSummary', {
        lessons: b.data.lessonStates.length,
        attempts: b.data.attempts.length,
        mastery: b.data.mastery.length,
        experiments: b.data.experiments.length,
      }) + (b.exportedAt ? t('settings.backupSummaryExported', { exported: formatDateTime(b.exportedAt, i18n.language) }) : '');
    setPendingImport({ json: text, summary });
    if (check.warnings.length) setNotice({ kind: 'info', text: check.warnings.join(' ') });
  };

  const runImport = async (mode: 'merge' | 'replace') => {
    if (!pendingImport) return;
    setBusy(mode);
    setNotice(null);
    try {
      const check = parseBackupJson(pendingImport.json);
      if (!check.ok || !check.backup) throw new Error(check.ok ? t('settings.unreadableBackup') : check.errors.join(' '));
      const repos = await session.getRepos();
      if (!repos) throw new Error(t('settings.storageNothingImported'));
      const result = await applyBackup(repos, check.backup, mode);
      // Only refresh from storage once the transaction has actually committed.
      await session.reloadAfterImport();
      // One sentence, assembled from parts so Bengali can order them naturally while the
      // English wording keeps the exact phrasing the existing tests and screenshots expect.
      const notes = [
        mode === 'merge' && result.applied.attempts + result.applied.history > 0
          ? t('settings.addedMerge', { attempts: result.applied.attempts, history: result.applied.history })
          : '',
        result.applied.skipped > 0 ? t('settings.alreadyHere', { count: result.applied.skipped }) : '',
        ...result.warnings,
      ].filter(Boolean);
      setNotice({
        kind: 'ok',
        text:
          t('settings.imported', {
            mode,
            lessons: result.imported.lessonStates,
            attempts: result.imported.attempts,
            mastery: result.imported.mastery,
          }) + (notes.length ? ` · ${notes.join(' ')}` : ''),
      });
      setPendingImport(null);
      window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
    } catch (err) {
      // Nothing was written: the merge is one transaction and the UI state was never
      // touched, so the screen still shows exactly what is stored.
      setNotice({
        kind: 'error',
        text: t('settings.nothingImported', {
          error: err instanceof Error ? err.message : t('settings.unknownError'),
        }),
      });
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const doReset = async () => {
    setBusy('reset');
    await session.resetAll();
    setBusy(null);
    setConfirmReset(false);
    setNotice({
      kind: session.state.saveStatus === 'error' ? 'error' : 'ok',
      text: session.state.saveStatus === 'error' ? t('settings.resetFailed') : t('settings.resetDone'),
    });
  };

  return (
    <Page title={t('settings.title')}>
      <h1>{t('settings.title')}</h1>
      <p className="muted">{t('settings.subtitle')}</p>

      {!storageAvailable && (
        <div className="feedback feedback-error" role="alert" style={{ marginBottom: 'var(--sp-3)' }}>
          <strong>{t('settings.storageUnavailableTitle')}</strong>{' '}
          {saveError ?? t('settings.storageBlockedBody')} {t('settings.storageNotSaved')}
        </div>
      )}

      {notice && (
        <div className={`feedback ${notice.kind === 'ok' ? 'feedback-success' : notice.kind === 'error' ? 'feedback-error' : 'feedback-info'}`} role="status" style={{ marginBottom: 'var(--sp-3)' }} data-testid="settings-notice">
          {notice.text}
        </div>
      )}

      <div className="tile-grid">
        <section className="card">
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>{t('settings.language')}</h2>
          <LanguageSelect />
        </section>

        <section className="card">
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>{t('settings.theme')}</h2>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="field-label">{t('settings.theme')}</legend>
            {(['system', 'light', 'dark'] as ThemePref[]).map((option) => (
              <label key={option} className="choice" style={{ marginBottom: 8 }}>
                <input type="radio" name="theme" value={option} checked={theme === option} onChange={() => void changeTheme(option)} style={{ width: 20, height: 20 }} />
                <span style={{ textTransform: 'capitalize' }}>{t(`settings.themeOption.${option}`)}</span>
              </label>
            ))}
          </fieldset>
        </section>

        <section className="card">
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>{t('settings.backup')}</h2>
          <p className="small muted">{t('settings.backupBody')}</p>
          <button type="button" className="btn btn-block" onClick={() => void exportBackup()} disabled={busy !== null} data-testid="export-button">
            {busy === 'export' ? t('settings.preparing') : t('settings.exportBackup')}
          </button>
          <label className="field-label mt-4" htmlFor="import-file">
            {t('settings.importBackup')}
          </label>
          <input
            id="import-file"
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="input"
            style={{ paddingTop: 8 }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
            data-testid="import-file"
          />
          {pendingImport && (
            <div className="stack-sm mt-3" data-testid="import-choice">
              <div className="feedback feedback-info" role="status">
                {t('settings.validBackup', { summary: pendingImport.summary })}
              </div>
              <button type="button" className="btn btn-secondary btn-block" onClick={() => void runImport('merge')} disabled={busy !== null}>
                {t('settings.merge')}
              </button>
              <button type="button" className="btn btn-danger btn-block" onClick={() => void runImport('replace')} disabled={busy !== null}>
                {t('settings.replace')}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPendingImport(null)} disabled={busy !== null}>
                {t('tool.cancel')}
              </button>
            </div>
          )}
        </section>
      </div>

      <section className="card mt-3">
        <h2 style={{ fontSize: 'var(--fs-lg)' }}>{t('settings.data')}</h2>
        <div className="stat-grid" style={{ marginBottom: 'var(--sp-3)' }}>
          <div className="stat">
            <div className="stat-value">{Object.keys(data.lessonStates).length}</div>
            <div className="stat-label">{t('settings.lessonsStarted')}</div>
          </div>
          <div className="stat">
            <div className="stat-value">{data.attempts.length}</div>
            <div className="stat-label">{t('settings.attempts')}</div>
          </div>
          <div className="stat">
            <div className="stat-value">{data.experiments.length}</div>
            <div className="stat-label">{t('settings.experiments')}</div>
          </div>
          <div className="stat">
            <div className="stat-value">{Object.keys(data.reviews).length}</div>
            <div className="stat-label">{t('settings.reviewSchedules')}</div>
          </div>
        </div>
        {!confirmReset ? (
          <button type="button" className="btn btn-secondary" onClick={() => setConfirmReset(true)} data-testid="reset-button">
            {t('settings.erasePrompt')}
          </button>
        ) : (
          <div className="feedback feedback-error stack-sm" role="alertdialog" aria-labelledby="reset-title">
            <strong id="reset-title">{t('settings.eraseTitle')}</strong>
            <span>{t('settings.eraseBody')}</span>
            <div className="btn-row">
              <button type="button" className="btn btn-danger" onClick={() => void doReset()} disabled={busy !== null} data-testid="reset-confirm">
                {busy === 'reset' ? t('settings.erasing') : t('settings.eraseConfirm')}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmReset(false)} disabled={busy !== null}>
                {t('settings.keepData')}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="card mt-3">
        <h2 style={{ fontSize: 'var(--fs-lg)' }}>{t('settings.about')}</h2>
        <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
          <li>{t('settings.aboutOffline')}</li>
          <li>{t('settings.aboutNoTracking')}</li>
          <li>
            <a href="#/help">{t('settings.aboutLink')}</a>
          </li>
        </ul>
      </section>

      <p className="small muted mt-4">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            navigate('/');
          }}
        >
          {t('settings.backHome')}
        </button>
      </p>
    </Page>
  );
}
