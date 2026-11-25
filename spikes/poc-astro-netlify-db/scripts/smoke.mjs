// SPIKE smoke: needs `astro dev --port 4399` running + migrated DB. Uses pre-installed Chromium (no `playwright install`).
import { chromium } from 'playwright';
const base = process.env.BASE ?? 'http://localhost:4399';
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(base + '/');
await page.waitForFunction(() => document.body.dataset.chart === 'ready', null, { timeout: 15000 });
const pixels = await page.evaluate(() => {
  const c = document.getElementById('c');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) n++;
  return n;
});
console.log(JSON.stringify({ banner: await page.textContent('p'), chartPainted: pixels > 0, nonTransparentPixels: pixels, pageErrors: errors }));
await browser.close();
if (!(pixels > 0) || errors.length) process.exit(1);
