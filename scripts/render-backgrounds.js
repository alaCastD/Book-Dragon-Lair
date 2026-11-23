// Renders the background tiles in assets/backgrounds/src/*.svg to PNGs at
// 1x, 2x and 3x (React Native picks the right one for the screen).
// Run with: node scripts/render-backgrounds.js   (needs Playwright installed)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const dir = path.join(__dirname, '..', 'assets', 'backgrounds');
(async () => {
  const browser = await chromium.launch();
  for (const file of fs.readdirSync(path.join(dir, 'src')).filter((f) => f.endsWith('.svg'))) {
    const svg = fs.readFileSync(path.join(dir, 'src', file), 'utf8');
    const [, w, h] = /width="(\d+)" height="(\d+)"/.exec(svg);
    for (const scale of [1, 2, 3]) {
      const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: scale });
      await page.setContent(`<style>html,body{margin:0}</style>${svg}`);
      const name = file.replace('.svg', scale === 1 ? '.png' : `@${scale}x.png`);
      await page.screenshot({ path: path.join(dir, name), clip: { x: 0, y: 0, width: +w, height: +h } });
      await page.close();
    }
  }
  await browser.close();
  console.log('Rendered', fs.readdirSync(dir).filter((f) => f.endsWith('.png')).join(', '));
})();
