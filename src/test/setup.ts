import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import 'katex/dist/katex.min.css';

// jsdom does not implement these APIs used by the app shell / visual tools.
if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// jsdom throws "Not implemented" for scrolling; the app only needs it not to fail.
window.scrollTo = () => {};

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (typeof Element !== 'undefined' && !Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
