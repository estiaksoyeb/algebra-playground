import { useEffect, useRef, useState } from 'react';
import { applyBackup, backupToJson, createBackup, parseBackupJson } from '../storage/backup';
import { Page } from './Shell';
import { ThemePref, applyTheme, storedTheme, useAppSession } from './useAppSession';
import { navigate } from './router';
import { DATA_CHANGED_EVENT } from './events';

export function SettingsPage() {
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
      if (!repos) throw new Error('Storage is unavailable, so there is nothing to export.');
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
      setNotice({ kind: 'ok', text: `Backup downloaded (${backup.data.attempts.length} attempts, ${backup.data.lessonStates.length} lessons).` });
      await session.addHistory('import', `Exported a backup with ${backup.data.attempts.length} attempts.`);
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Export failed.' });
    } finally {
      setBusy(null);
    }
  };

  const onFile = async (file: File) => {
    setNotice(null);
    if (file.size > 8 * 1024 * 1024) {
      setNotice({ kind: 'error', text: 'That file is larger than 8 MB — it does not look like an Algebra Playground backup.' });
      return;
    }
    const text = await file.text();
    const check = parseBackupJson(text);
    if (!check.ok) {
      setNotice({ kind: 'error', text: `Import cancelled. ${check.errors.join(' ')}` });
      return;
    }
    const b = check.backup!;
    const summary = `${b.data.lessonStates.length} lessons, ${b.data.attempts.length} attempts, ${b.data.mastery.length} mastery records, ${b.data.experiments.length} experiments${
      b.exportedAt ? ` (exported ${new Date(b.exportedAt).toLocaleString()})` : ''
    }`;
    setPendingImport({ json: text, summary });
    if (check.warnings.length) setNotice({ kind: 'info', text: check.warnings.join(' ') });
  };

  const runImport = async (mode: 'merge' | 'replace') => {
    if (!pendingImport) return;
    setBusy(mode);
    setNotice(null);
    try {
      const check = parseBackupJson(pendingImport.json);
      if (!check.ok || !check.backup) throw new Error(check.ok ? 'Unreadable backup.' : check.errors.join(' '));
      const repos = await session.getRepos();
      if (!repos) throw new Error('Storage is unavailable; nothing was imported.');
      const result = await applyBackup(repos, check.backup, mode);
      await session.reloadAfterImport();
      setNotice({
        kind: 'ok',
        text: `Imported (${mode}): ${result.imported.lessonStates} lessons, ${result.imported.attempts} attempts, ${result.imported.mastery} mastery records. ${result.warnings.join(' ')}`.trim(),
      });
      setPendingImport(null);
      window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
    } catch (err) {
      setNotice({ kind: 'error', text: `Nothing was imported. ${err instanceof Error ? err.message : 'Unknown error.'}` });
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
      text: session.state.saveStatus === 'error' ? 'Reset failed — your data was not erased.' : 'All learning data on this device has been erased.',
    });
  };

  return (
    <Page title="Settings">
      <h1>Settings</h1>
      <p className="muted">Your data lives only on this device. Nothing is sent anywhere.</p>

      {!storageAvailable && (
        <div className="feedback feedback-error" role="alert" style={{ marginBottom: 'var(--sp-3)' }}>
          <strong>Storage is unavailable.</strong> {saveError ?? 'Your browser blocked local storage (private mode, or full disk).'} Progress will not be saved. Export a backup if possible before closing.
        </div>
      )}

      {notice && (
        <div className={`feedback ${notice.kind === 'ok' ? 'feedback-success' : notice.kind === 'error' ? 'feedback-error' : 'feedback-info'}`} role="status" style={{ marginBottom: 'var(--sp-3)' }} data-testid="settings-notice">
          {notice.text}
        </div>
      )}

      <div className="tile-grid">
        <section className="card">
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>Appearance</h2>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="field-label">Theme</legend>
            {(['system', 'light', 'dark'] as ThemePref[]).map((t) => (
              <label key={t} className="choice" style={{ marginBottom: 8 }}>
                <input type="radio" name="theme" value={t} checked={theme === t} onChange={() => void changeTheme(t)} style={{ width: 20, height: 20 }} />
                <span style={{ textTransform: 'capitalize' }}>{t}</span>
              </label>
            ))}
          </fieldset>
        </section>

        <section className="card">
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>Backup</h2>
          <p className="small muted">
            Export a single JSON file with lessons, attempts, mastery, reviews and experiments. Keep it somewhere safe — clearing browser data removes everything else.
          </p>
          <button type="button" className="btn btn-block" onClick={() => void exportBackup()} disabled={busy !== null} data-testid="export-button">
            {busy === 'export' ? 'Preparing…' : 'Export backup'}
          </button>
          <label className="field-label mt-4" htmlFor="import-file">
            Import a backup
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
                Valid backup: {pendingImport.summary}. Choose how to import — nothing changes until you pick.
              </div>
              <button type="button" className="btn btn-secondary btn-block" onClick={() => void runImport('merge')} disabled={busy !== null}>
                Merge with my progress (newest wins)
              </button>
              <button type="button" className="btn btn-danger btn-block" onClick={() => void runImport('replace')} disabled={busy !== null}>
                Replace everything on this device
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPendingImport(null)} disabled={busy !== null}>
                Cancel
              </button>
            </div>
          )}
        </section>
      </div>

      <section className="card mt-3">
        <h2 style={{ fontSize: 'var(--fs-lg)' }}>Your data</h2>
        <div className="stat-grid" style={{ marginBottom: 'var(--sp-3)' }}>
          <div className="stat">
            <div className="stat-value">{Object.keys(data.lessonStates).length}</div>
            <div className="stat-label">lessons started</div>
          </div>
          <div className="stat">
            <div className="stat-value">{data.attempts.length}</div>
            <div className="stat-label">attempts</div>
          </div>
          <div className="stat">
            <div className="stat-value">{data.experiments.length}</div>
            <div className="stat-label">experiments</div>
          </div>
          <div className="stat">
            <div className="stat-value">{Object.keys(data.reviews).length}</div>
            <div className="stat-label">review schedules</div>
          </div>
        </div>
        {!confirmReset ? (
          <button type="button" className="btn btn-secondary" onClick={() => setConfirmReset(true)} data-testid="reset-button">
            Erase all progress…
          </button>
        ) : (
          <div className="feedback feedback-error stack-sm" role="alertdialog" aria-labelledby="reset-title">
            <strong id="reset-title">Erase everything?</strong>
            <span>This deletes all lessons, attempts, mastery, reviews and saved experiments on this device. It cannot be undone. Export a backup first if you might want the data back.</span>
            <div className="btn-row">
              <button type="button" className="btn btn-danger" onClick={() => void doReset()} disabled={busy !== null} data-testid="reset-confirm">
                {busy === 'reset' ? 'Erasing…' : 'Yes, erase everything'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmReset(false)} disabled={busy !== null}>
                Keep my data
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="card mt-3">
        <h2 style={{ fontSize: 'var(--fs-lg)' }}>About</h2>
        <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
          <li>Works offline after the first visit. Install it from your browser menu (“Add to Home screen”).</li>
          <li>No accounts, no analytics, no network requests for learning content.</li>
          <li>
            <a href="#/help">How the app works, and how to use it</a>
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
          Back home
        </button>
      </p>
    </Page>
  );
}
