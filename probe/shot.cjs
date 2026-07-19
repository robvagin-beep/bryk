/* BRYK — снять кадр. `node probe/shot.cjs <имя> [селектор]`
 * Кадр панели или всего экрана в shots/. Приёмка глазом — обязательная часть
 * сдачи (правила ULTRA-делегата), а гейт видит только числа. */
'use strict';
const path = require('path');
const PW = process.env.BRYK_PLAYWRIGHT ||
  path.join(__dirname, '..', '..', 'synthex-engine', 'node_modules', 'playwright');
const { chromium } = require(PW);

const name = process.argv[2] || 'shot';
const sel = process.argv[3] || null;
const URL = process.env.BRYK_URL || 'http://localhost:8931/index.html?fix=1';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__bryk, null, { timeout: 8000 });
  await page.waitForTimeout(2600);
  const out = path.join(__dirname, '..', 'shots', name + '.png');
  if (sel) await page.locator(sel).screenshot({ path: out });
  else await page.screenshot({ path: out });
  console.log('shot → shots/' + name + '.png');
  await browser.close();
})().catch(e => { console.error('shot failed:', e.message); process.exit(1); });
