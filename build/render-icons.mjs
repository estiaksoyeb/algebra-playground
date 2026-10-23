/**
 * Renders the PWA icons from `public/icons/icon.svg`, the single source of truth.
 *
 * Why this exists: the icons used to be hand-drawn PNGs that drifted away from the SVG.
 * The shipped `icon-512.png` had its crossbar fused into the apex, which closed the letter's
 * counter -- the launcher icon read as a solid triangle instead of an "A". Rendering from one
 * vector means the icon in the manifest, the favicon and the splash screen cannot disagree.
 *
 * Usage: `npm run icons` (after editing the SVG).
 *
 * Rasterising without adding a dependency is awkward on Linux: rsvg-convert, inkscape and
 * ImageMagick are often absent. Playwright's bundled Chromium is already required by the E2E
 * suite, so it is reused here. Run `npx playwright install chromium` first on a new machine.
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = path.join(root, 'public', 'icons');
const svgPath = path.join(iconsDir, 'icon.svg');

/**
 * The maskable variant must keep its glyph inside the central 80% safe zone, because the
 * platform crops maskable icons to its own shape (circle, squircle, rounded square). The
 * artwork is placed at 80% of the canvas on a full-bleed background so any crop still shows
 * the whole letter.
 */
const MASKABLE_CONTENT_RATIO = 0.8;

async function main() {
  const svg = await fs.readFile(svgPath, 'utf8');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();

    /**
     * Screenshots the SVG inside a `size`x`size` transparent viewport.
     * `contentRatio` shrinks the artwork about a full-bleed background, which is what a
     * maskable icon needs. For ratio 1 the SVG's own rounded rect supplies the shape and the
     * corners stay transparent.
     */
    const render = async (size, file, contentRatio) => {
      const inner = Math.round(size * contentRatio);
      const inset = Math.round((size - inner) / 2);
      await page.setViewportSize({ width: size, height: size });
      await page.setContent(
        `<!doctype html><html><head><style>
           html,body{margin:0;padding:0;background:transparent;}
           /* Maskable: fill the whole tile with the artwork's own background colour so the
              platform crop never reveals a transparent border. */
           .bleed{position:fixed;inset:0;background:#2f5d8a;}
           .box{position:fixed;left:${inset}px;top:${inset}px;width:${inner}px;height:${inner}px;}
           .box svg{display:block;width:100%;height:100%;}
         </style></head><body>
           ${contentRatio < 1 ? '<div class="bleed"></div>' : ''}
           <div class="box">${svg}</div>
         </body></html>`,
      );
      await page.screenshot({ path: file, omitBackground: true });
    };

    // `any` icons: the SVG's own rounded square is the icon shape, corners transparent.
    await render(192, path.join(iconsDir, 'icon-192.png'), 1);
    await render(512, path.join(iconsDir, 'icon-512.png'), 1);
    // Maskable: same artwork, inset into the safe zone on a full-bleed background.
    await render(512, path.join(iconsDir, 'maskable-512.png'), MASKABLE_CONTENT_RATIO);

    console.log('Rendered icon-192.png, icon-512.png and maskable-512.png from icon.svg');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
