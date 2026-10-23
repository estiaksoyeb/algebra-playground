/**
 * Build-time service worker generation.
 *
 * `public/sw.js` is a template: this plugin replaces `__PRECACHE_MANIFEST__`,
 * `__SHELL_URL__` and `__CACHE_VERSION__` with the real hashed asset list after Vite
 * has finished bundling, so the cache always matches the deployed build and
 * BASE_PATH (GitHub Pages subpath) is respected. Version changes on every deploy,
 * which lets the SW delete old caches on activation.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

interface BundleEntry {
  type: 'chunk' | 'asset';
  fileName: string;
  isEntry?: boolean;
}

export function serviceWorkerPlugin(): Plugin {
  let base = '/';
  return {
    name: 'algebra-playground-sw',
    apply: 'build',
    configResolved() {
      // The precache list must contain exactly the URLs the deployed app requests, so it
      // is derived from BASE_PATH (the same value that sets Vite's `base`) rather than
      // from `config.base`, which Vite resolves to an absolute filesystem path.
      const raw = process.env.BASE_PATH ?? '/';
      base = `/${raw.replace(/^\/+|\/+$/g, '')}/`.replace(/\/{2,}/g, '/');
    },
    generateBundle(_options, bundle) {
      const entries = Object.values(bundle as unknown as Record<string, BundleEntry>);
      const urls = new Set<string>([base, `${base}index.html`, `${base}manifest.webmanifest`, `${base}icons/icon.svg`, `${base}icons/icon-192.png`, `${base}icons/icon-512.png`, `${base}icons/maskable-512.png`]);
      for (const e of entries) {
        if (e.fileName === 'sw.js') continue;
        urls.add(base + e.fileName.replace(/^\/+/, ''));
      }
      const sorted = [...urls].sort();
      const version = createHash('sha256').update(sorted.join('\n')).digest('hex').slice(0, 12);
      const template = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');
      const sw = template
        .replace('__PRECACHE_MANIFEST__', JSON.stringify(sorted))
        .replace('__SHELL_URL__', JSON.stringify(`${base}index.html`))
        .replace('__CACHE_VERSION__', version);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: sw });
      // A copy of the version lets tests and support check which build is cached.
      this.emitFile({ type: 'asset', fileName: 'sw-version.txt', source: `${version}\n` });
    },
  };
}
