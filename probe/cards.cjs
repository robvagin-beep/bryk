/* BRYK — layer-card gate. Run before every hand-off, alongside panel + app.
 *
 *   ./serve.sh &   then   node probe/cards.cjs
 *
 * Covers the contract the left-column restructure introduced (2026-07-18):
 *   · exactly ONE card open at all times, through every path that mutates the stack
 *   · program extras (a Word layer's text field, a Logo layer's size) live in the OPEN
 *     card and survive every rebuild, removal and scene load
 *
 * Why this needs its own gate: renderLayers() clears its host with innerHTML='', and the
 * extras are real DOM nodes MOVED into a card rather than markup regenerated per frame.
 * If the parking step ever regresses, the text field and every listener on it are gone —
 * silently, with the panel still looking fine. That is not visible in a screenshot.
 *
 * Contract, not inventory: nothing here counts layers or programs. It asserts invariants
 * that must hold whatever the design becomes.
 */
'use strict';
const path = require('path');
const PW = process.env.BRYK_PLAYWRIGHT ||
  path.join(__dirname, '..', '..', 'synthex-engine', 'node_modules', 'playwright');
const { chromium } = require(PW);
const TARGET = process.argv[2] || 'http://localhost:8931/index.html?fix=1';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });

  await page.goto(TARGET, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__bryk, null, { timeout: 8000 });
  await page.waitForTimeout(2500);

  const rows = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const B = window.__bryk, out = [];
    const put = (n, c, e) => out.push([n, !!c, e == null ? '' : String(e)]);
    const openCount = () => B.layers().filter(L => L.open).length;
    const hosted = id => { const el = document.getElementById(id); return !!(el && el.closest('.lrow')); };
    const parked = id => { const el = document.getElementById(id); return !!(el && el.closest('#progExtras')); };
    const alive  = id => !!document.getElementById(id);

    put('boot leaves exactly one card open', openCount() === 1, openCount() + ' open');

    const W = B.addLayer('word'); await sleep(200);
    put('a new layer opens, and only it', W.open && openCount() === 1);
    put('the program extras are hosted by the open card', hosted('fText') && hosted('fFont'));
    const el = document.getElementById('fText');
    el.value = 'PROBE'; el.dispatchEvent(new Event('input'));
    put('the moved field still drives state', B.state.formation.text === 'PROBE', B.state.formation.text);

    const G = B.addLayer('grid'); await sleep(200);
    put('opening another card closes the previous one', !W.open && G.open && openCount() === 1);
    put('displaced extras park rather than die', parked('fText') && alive('fText'));

    const names = [...document.querySelectorAll('.lrow .lname')];
    const wi = B.layers().findIndex(L => L.id === W.id);
    names[wi].click(); await sleep(200);
    put('returning to a card re-hosts its extras', hosted('fText'));
    names[wi].click(); await sleep(150);
    put('re-clicking the open card does not close it', B.layers().find(L => L.id === W.id).open,
        'idempotent focus — a dblclick rename depends on this');

    B.removeLayer(W.id); await sleep(200);
    put('removing the hosting layer does not destroy the extras', alive('fText') && parked('fText'));
    put('a vacancy is refilled, one card still open', openCount() === 1, openCount() + ' open');

    const D = B.addLayer('ring'); await sleep(150);
    B.duplicateLayer(D.id); await sleep(200);
    put('duplicating an open card yields one open, not two', openCount() === 1, openCount() + ' open');

    const keep = (B.layers().find(L => L.open) || {}).id;
    const victim = B.layers().find(L => !L.open);
    if (victim) { B.removeLayer(victim.id); await sleep(200);
      put('removing a CLOSED layer leaves the open one alone', (B.layers().find(L => L.open) || {}).id === keep); }

    B.addLayer('word'); await sleep(150);
    const t = document.getElementById('fText'); t.value = 'BRYK'; t.dispatchEvent(new Event('input'));
    const snap = B.scene.capture();
    B.addLayer('tunnel'); await sleep(150);
    B.scene.apply(snap); await sleep(600);
    put('a scene load leaves exactly one card open', openCount() === 1, openCount() + ' open');
    put('extras survive a scene load', alive('fText'));
    put('formation text survives a scene load', B.state.formation.text === 'BRYK', B.state.formation.text);

    return out;
  });

  await browser.close();
  rows.unshift(['console clean', errors.length === 0, errors.slice(0, 3).join(' | ')]);
  const bad = rows.filter(r => !r[1]);
  for (const [n, ok, extra] of rows) console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + n.padEnd(52) + extra);
  console.log(bad.length ? '\nCARDS FAIL — ' + bad.length + '/' + rows.length
                         : '\nCARDS OK — ' + rows.length + '/' + rows.length);
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error('probe crashed:', e.message); process.exit(1); });
