import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyTheme, storedTheme } from './ui/useAppSession';
import './styles/design-system.css';

// Apply the stored theme before the first paint to avoid a flash.
applyTheme(storedTheme());

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element missing');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register the offline cache only in production builds; dev keeps hot reload honest.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL;
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {
      // Offline support is a bonus; the app remains fully usable online.
    });
  });
}
