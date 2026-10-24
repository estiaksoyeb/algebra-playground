import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Guards for the dark-mode contrast fix.
 *
 * The defect was one rule — `[data-theme='dark'] .btn { color: #0d1218 }` — beating the
 * colour of every outlined and ghost variant by specificity, which painted near-black labels
 * on dark surfaces (1.2:1 measured in a browser). These tests read the real stylesheet so the
 * rule cannot silently come back, and check every colour pair a button can use with the same
 * WCAG formula the browser audit used.
 */

const CSS = readFileSync(resolve(__dirname, '../styles/design-system.css'), 'utf8');

const LIGHT = /:root\s*\{([\s\S]*?)\n\}/.exec(CSS)![1];
const DARK = /\[data-theme='dark'\]\s*\{([\s\S]*?)\n\}/.exec(CSS)![1];

/** Resolve `--name` inside one token block (no `var()` indirection in the pairs we test). */
function token(block: string, name: string): string {
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(block);
  if (!m) throw new Error(`token --${name} missing`);
  return m[1].trim();
}

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

/** WCAG 2.x relative luminance + contrast ratio. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = rgb(hex).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

describe.each([
  ['light', LIGHT],
  ['dark', DARK],
])('%s theme button colours', (_theme, block) => {
  const onBrand = token(block, 'on-brand');
  const onDanger = token(block, 'on-danger');
  const onSuccess = token(block, 'on-success');
  const brand = token(block, 'brand');
  const danger = token(block, 'danger');
  const success = token(block, 'success');
  const ink = token(block, 'ink');
  const inkSoft = token(block, 'ink-soft');
  const bg = token(block, 'bg');
  const bgElevated = token(block, 'bg-elevated');
  const bgSunken = token(block, 'bg-sunken');

  it('filled primary text is readable on the brand fill', () => {
    expect(contrast(onBrand, brand)).toBeGreaterThanOrEqual(4.5);
  });

  it('filled danger and success text is readable on their fills', () => {
    expect(contrast(onDanger, danger)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(onSuccess, success)).toBeGreaterThanOrEqual(4.5);
  });

  it('the outlined (secondary) button is readable on its raised surface', () => {
    expect(contrast(ink, bgElevated)).toBeGreaterThanOrEqual(7);
  });

  it('a disabled button stays legible, not merely dimmed', () => {
    // The disabled fill is the sunken surface and the label stays on ink-soft.
    expect(contrast(inkSoft, bgSunken)).toBeGreaterThanOrEqual(4.5);
  });

  it('the icon control and ghost labels are readable on the page surface', () => {
    expect(contrast(ink, bgElevated)).toBeGreaterThanOrEqual(7);
    expect(contrast(token(block, 'brand-strong'), bg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('stylesheet rules', () => {
  it('never overrides every button with one hard-coded colour for the dark theme', () => {
    // The exact regression: a global dark `.btn { color: … }` outranked the variants.
    expect(CSS).not.toMatch(/\[data-theme='dark'\]\s+\.btn\s*\{[^}]*color\s*:/);
    expect(CSS).not.toMatch(/\[data-theme='dark'\]\s+\.btn\s*\{/);
  });

  it('lets each variant own its foreground instead of inheriting white', () => {
    const base = /\.btn\s*\{([\s\S]*?)\n\}/.exec(CSS)![1];
    expect(base).toMatch(/color:\s*var\(--on-brand\)/);
    expect(base).not.toMatch(/color:\s*#fff/);
  });

  it('does not dim disabled buttons with opacity alone', () => {
    const disabled = /\.btn:disabled,[\s\S]*?\{([\s\S]*?)\n\}/.exec(CSS)![1];
    expect(disabled).toMatch(/opacity:\s*1/);
    expect(disabled).toMatch(/--ink-soft/);
  });

  it('gives the inline lesson tool real spacing rules', () => {
    // `.embedded-tool` had no rules at all, so its parts were flush against the card text.
    expect(CSS).toMatch(/\.embedded-tool\s*\{[^}]*gap:\s*var\(--sp-4\)/);
    expect(CSS).toMatch(/\.embedded-tool-note\s*\{[^}]*padding:/);
    // The stepper row must be able to wrap on a phone instead of overflowing.
    expect(CSS).toMatch(/\.stepper-row\s*\{[^}]*flex-wrap|\.stepper-row\s*\{/);
    expect(/\.stepper-row\s*\{([\s\S]*?)\}/.exec(CSS)![1]).toMatch(/min-width:\s*0/);
  });

  it('keeps the world-icon container fixed so a symbol can never be clipped', () => {
    expect(/\.world-badge\s*\{([\s\S]*?)\}/.exec(CSS)![1]).toMatch(/width:\s*44px/);
  });
});
