import { Page } from './Shell';
import { TOOL_META, TOOL_LIST } from '../tools/registry';

export function HelpPage() {
  return (
    <Page title="Help">
      <h1>Help &amp; how it works</h1>
      <p className="muted">Everything here runs on your device. This page explains the buttons you will see and the ideas behind the app.</p>

      <div className="tile-grid">
        <section className="card">
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>A lesson, step by step</h2>
          <ol className="small" style={{ paddingLeft: 20, margin: 0 }}>
            <li>
              <strong>Learn.</strong> Read short steps. Where there is a picture, move it yourself — tap, drag or use the buttons. The equation above the picture always matches what you see.
            </li>
            <li>
              <strong>Practise.</strong> Type or choose an answer. “Hint” gives a small nudge first; asking again gives a method and then a worked example.
            </li>
            <li>
              <strong>Check.</strong> A few questions without hints. They decide whether the concept is mastered. A slow or wrong answer brings the concept back for review instead of moving on silently.
            </li>
          </ol>
        </section>
        <section className="card">
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>Mastery and review</h2>
          <p className="small">
            A concept is <em>practising</em> while you still use hints, <em>almost mastered</em> once you solve several different kinds of exercise alone, and <em>mastered</em> after a no-hint check.
            Mastered ideas come back for review after 1, 3, 7, 16, 35 and then 75 days. A miss moves it to <em>needs review</em>.
          </p>
        </section>
        <section className="card">
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>Typing maths</h2>
          <p className="small">
            Use <code>2x</code>, <code>3(x + 1)</code>, <code>x^2</code>, <code>-4</code> and fractions like <code>3/4</code>. Use a single letter for the unknown. The app reads your answer with a safe parser — it never runs code, so a strange answer can only produce a “could not read this” message.
          </p>
        </section>
        <section className="card">
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>Your data</h2>
          <p className="small">
            Progress is saved automatically in this browser (the “Saved” badge in the header). If it says “Not saved”, storage is blocked — export a backup and check your browser settings.
            Export/import lives in <a href="#/settings">Settings</a>. Backups are plain JSON files you can keep or move to another device. Importing is validated first, then applied as merge or replace — never halfway.
          </p>
        </section>
        <section className="card">
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>Offline &amp; installing</h2>
          <p className="small">
            After the first visit the whole app is cached, so it keeps working without a connection. On Android, open the browser menu and choose “Install app” or “Add to Home screen” for a full-screen experience.
          </p>
        </section>
        <section className="card">
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>Accessibility</h2>
          <p className="small">
            Touch targets are at least 44 px, every picture has a text description, signs in the tile tool are written as + and − rather than colour alone, and the system’s reduced-motion and dark-mode settings are respected.
          </p>
        </section>
      </div>

      <section className="card mt-4">
        <h2 style={{ fontSize: 'var(--fs-lg)' }}>The playground tools</h2>
        <ul className="small" style={{ paddingLeft: 20, margin: 0 }}>
          {TOOL_LIST.map((t) => (
            <li key={t.id} style={{ marginBottom: 6 }}>
              <a href={`#/playground/${t.id}`}>{TOOL_META[t.id].name}</a> — {t.description}
            </li>
          ))}
        </ul>
      </section>

      <div className="btn-row mt-4 small">
        <a href="#/">Back home</a>
        <a href="#/learn">Learning path</a>
        <a href="#/settings">Settings</a>
      </div>
    </Page>
  );
}
