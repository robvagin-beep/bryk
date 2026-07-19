/* BRYK — audio panel gate. Run before every hand-off.
 *
 *   node probe/panel.cjs            (serve.sh must be up, or pass a URL)
 *   node probe/panel.cjs http://localhost:8931/audio-panel.html?fix=1
 *
 * Playwright is not vendored here; it is borrowed from synthex-engine/node_modules,
 * which is the only place in Projects/ that has it. If that ever moves, set
 * BRYK_PLAYWRIGHT to a directory containing playwright.
 *
 * Covers, in order:
 *   1 console       — zero page errors (favicon 404 filtered)
 *   2 panel-canon   — no bare range · every scrub has its number + aria · tabular-nums
 *                     · zero hex outside :root · no transition:all
 *   3 geometry      — column width · control heights agree · no sideways scroll
 *   4 contrast      — text ≥4.5:1, UI accents ≥3:1, measured via canvas readback
 *                     (computed colours are oklch(); string-parsing them yields garbage)
 *   5 WCAG 1.4.12   — user spacing override clips nothing
 *   6 clock         — detector locks · trim leans WITHOUT dropping detection ·
 *                     base ≠ effective · phase shift leaves tempo alone · AUTO clears trim
 *   7 chrome        — H / corner button hides the panel and the way back survives
 */
'use strict';
const path = require('path');
const PW = process.env.BRYK_PLAYWRIGHT ||
  path.join(__dirname, '..', '..', 'synthex-engine', 'node_modules', 'playwright');
const { chromium } = require(PW);

const URL = process.argv[2] || 'http://localhost:8931/audio-panel.html?fix=1';
const LOCK_MS = 13000;                       // autocorrelation needs ~12 s of fixture

const results = [];
const ok = (n, pass, extra) => results.push({ n, pass: !!pass, extra: extra == null ? '' : String(extra) });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__brykAudio, null, { timeout: 5000 });

  ok('console clean', errors.length === 0, errors.slice(0, 3).join(' | '));

  const statics = await page.evaluate(() => {
    const r = [];
    const put = (n, c, e) => r.push([n, !!c, e == null ? '' : String(e)]);

    // ── panel-canon ──────────────────────────────────────────────────────────
    put('no bare input[type=range] in panel', document.querySelectorAll('#panel input[type=range]').length === 0);
    const scrubs = [...document.querySelectorAll('.scrub')];
    put('every scrub carries a number', scrubs.length > 0 && scrubs.every(s => s.querySelector('.sval')), scrubs.length + ' scrubs');
    put('every scrub has role + aria range', scrubs.every(s =>
      s.getAttribute('role') === 'slider' && s.hasAttribute('aria-valuemin') &&
      s.hasAttribute('aria-valuemax') && s.hasAttribute('aria-label')));
    put('numbers are tabular', scrubs.every(s =>
      getComputedStyle(s.querySelector('.sval')).fontVariantNumeric.includes('tabular-nums')));

    const css = [...document.styleSheets].flatMap(sh => { try { return [...sh.cssRules].map(x => x.cssText); } catch (_) { return []; } });
    const stray = css.filter(t => !t.startsWith(':root')).filter(t => /#[0-9a-fA-F]{3,8}\b/.test(t));
    put('zero hex outside :root', stray.length === 0, stray.slice(0, 2).join(' | '));
    put('no transition:all', !css.some(t => /transition:\s*all/.test(t)));

    // ── geometry ─────────────────────────────────────────────────────────────
    const h = el => Math.round(el.getBoundingClientRect().height);
    const body = document.getElementById('body');
    put('panel is 276px', Math.round(document.getElementById('panel').getBoundingClientRect().width) === 276);
    put('no sideways scroll', body.scrollWidth <= body.clientWidth + 1);
    const hs = [h(document.querySelector('.scrub')), h(document.querySelector('.tinSelect')),
                h(document.querySelector('.nudge .nb')), h(document.querySelector('.phbar'))];
    put('scrub = select = nudge = phase bar', hs.every(v => v === hs[0]), hs.join('/'));
    put('primary buttons ≥30px', [...document.querySelectorAll('.seg .btn, #arm, #uiBtn')].every(b => h(b) >= 30));

    // ── contrast, via canvas readback (oklch cannot be string-parsed) ─────────
    const cv = document.createElement('canvas'); cv.width = cv.height = 1;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    const rgb = col => { cx.fillStyle = '#000'; cx.fillRect(0,0,1,1); cx.fillStyle = col; cx.fillRect(0,0,1,1);
      const d = cx.getImageData(0,0,1,1).data; return [d[0], d[1], d[2]]; };
    const lum = c => { const [R,G,B] = c.map(v => { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); });
      return 0.2126*R + 0.7152*G + 0.0722*B; };
    const ratio = (f, b) => { const [x, y] = [lum(rgb(f)), lum(rgb(b))].sort((p,q)=>q-p); return +((x+0.05)/(y+0.05)).toFixed(2); };
    const bg = getComputedStyle(document.getElementById('panel')).backgroundColor;
    for (const [name, sel] of [['row label','.row > label'],['number','.sval'],['legend','legend'],
                               ['note','.note'],['meter label','#meters .ml']]) {
      const v = ratio(getComputedStyle(document.querySelector(sel)).color, bg);
      put('contrast ' + name + ' ≥4.5', v >= 4.5, v + ':1');
    }
    for (const t of ['--accent-live','--accent-beat','--accent-warn']) {
      const v = ratio(getComputedStyle(document.documentElement).getPropertyValue(t).trim(), bg);
      put('contrast ' + t + ' ≥3', v >= 3, v + ':1');
    }

    // ── WCAG 1.4.12 spacing stress ───────────────────────────────────────────
    const s = document.createElement('style');
    s.textContent = '*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}';
    document.head.appendChild(s);
    const clipped = [...document.querySelectorAll('#panel .row > label, #panel .btn, #panel legend, #panel .note, #meters .ml')]
      .filter(el => el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2)
      .map(el => el.tagName.toLowerCase() + ' "' + el.textContent.trim().slice(0, 20) + '"');
    const fits = body.scrollWidth <= body.clientWidth + 1;
    s.remove();
    put('WCAG 1.4.12 no clipped text', clipped.length === 0, clipped.slice(0, 4).join(' | '));
    put('WCAG 1.4.12 no sideways scroll', fits);

    // ── rendering is alive ───────────────────────────────────────────────────
    const c = document.getElementById('spec'), g = c.getContext('2d');
    const px = g.getImageData(0, 0, c.width, c.height).data;
    let lit = 0; for (let i = 3; i < px.length; i += 4) if (px[i] > 8) lit++;
    put('spectrum painted', lit > 200, lit + ' px');
    const bars = [...document.querySelectorAll('#meters .mt i')];
    put('10 meters, transform-driven', bars.length === 10 && bars.every(b => b.style.transform.startsWith('scaleX')));
    put('boot does not arm (no permission prompt)', window.__brykAudio.armed() === false);

    return r;
  });
  for (const [n, p, e] of statics) ok(n, p, e);

  // ── clock behaviour — the whole point of the trim work ─────────────────────
  await page.waitForTimeout(LOCK_MS);
  const clock = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const A = window.__brykAudio, C = A.core();
    const r = [];
    const put = (n, c, e) => r.push([n, !!c, e == null ? '' : String(e)]);

    const detected = C.features.beat.bpm, srcAtLock = C.features.beat.source;
    put('detector locks onto the fixture', Math.abs(detected - 124) < 2, detected.toFixed(1));
    put('source reads auto at lock', srcAtLock === 'auto', srcAtLock);

    A.scrubs.trim.set(3); C.setTrim(3); await sleep(500);
    put('trim raises effective tempo by +3', Math.abs(C.features.beat.bpm - (detected + 3)) < 1.0,
        C.features.beat.bpm.toFixed(1));
    put('trim does NOT freeze detection', C.features.beat.source === 'auto', C.features.beat.source);
    put('base scrub tracks the detected tempo, not the trimmed one',
        Math.abs(C.features.beat.bpm - A.scrubs.bpm.get() - 3) < 0.5,
        'base ' + A.scrubs.bpm.get().toFixed(1) + ' vs eff ' + C.features.beat.bpm.toFixed(1));

    const b0 = C.features.beat.bpm, p0 = C.features.beat.phase;
    C.shift(0.25);
    await new Promise(r2 => requestAnimationFrame(() => requestAnimationFrame(r2)));
    const dPh = (C.features.beat.phase - p0 + 1) % 1;
    put('phase shift moves the downbeat', dPh > 0.15 && dPh < 0.45, dPh.toFixed(3));
    put('phase shift leaves tempo alone', Math.abs(C.features.beat.bpm - b0) < 0.5);
    C.shift(-0.9);
    await new Promise(r2 => requestAnimationFrame(() => requestAnimationFrame(r2)));
    put('phase stays in [0,1) after a negative shift',
        C.features.beat.phase >= 0 && C.features.beat.phase < 1, C.features.beat.phase.toFixed(3));

    document.getElementById('auto').click(); await sleep(300);
    put('AUTO clears trim in core and UI', C.getTrim() === 0 && A.scrubs.trim.get() === 0);

    // chrome
    const btn = document.getElementById('uiBtn');
    btn.click();
    put('chrome hides', document.body.classList.contains('noui') &&
        getComputedStyle(document.getElementById('panel')).display === 'none');
    put('the way back survives', getComputedStyle(btn).display !== 'none');
    btn.click();
    put('chrome returns', !document.body.classList.contains('noui'));
    return r;
  });
  for (const [n, p, e] of clock) ok(n, p, e);


  await browser.close();

  const failed = results.filter(r => !r.pass);
  for (const r of results) {
    console.log('  ' + (r.pass ? 'ok  ' : 'FAIL') + '  ' + r.n.padEnd(52) + r.extra);
  }
  console.log(failed.length ? '\nPANEL FAIL — ' + failed.length + '/' + results.length
                            : '\nPANEL OK — ' + results.length + '/' + results.length);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('probe crashed:', e.message); process.exit(1); });
