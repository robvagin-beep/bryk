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
/* Preset ids changed when the shelf was rebuilt from the ported banks (2026-07-18):
     axis→flow · ring→pulsing-circle · tunnel→radial · scatter→float · pattern→pat-<name>
   and `logo` folded into `word`. Names here follow the shelf; they are not magic. */

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
    /* The card stopped unfolding inline on 2026-07-19: a layer is a ROW (name · opacity ·
       blend) and its settings are one section under the stack, so the stack no longer
       jumps when you open one. The extras therefore land in #focusBody, not inside .lrow.
       What this gate is FOR is unchanged and is the reason it exists at all — the node is
       MOVED, never re-rendered, so every listener on the text field survives. Only the
       address changed. */
    const hosted = id => { const el = document.getElementById(id); return !!(el && el.closest('#focusBody')); };
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

    const D = B.addLayer('radial'); await sleep(150);
    B.duplicateLayer(D.id); await sleep(200);
    put('duplicating an open card yields one open, not two', openCount() === 1, openCount() + ' open');

    const keep = (B.layers().find(L => L.open) || {}).id;
    const victim = B.layers().find(L => !L.open);
    if (victim) { B.removeLayer(victim.id); await sleep(200);
      put('removing a CLOSED layer leaves the open one alone', (B.layers().find(L => L.open) || {}).id === keep); }

    B.addLayer('word'); await sleep(150);
    const t = document.getElementById('fText'); t.value = 'BRYK'; t.dispatchEvent(new Event('input'));
    const snap = B.scene.capture();
    B.addLayer('helix'); await sleep(150);
    B.scene.apply(snap); await sleep(600);
    put('a scene load leaves exactly one card open', openCount() === 1, openCount() + ' open');
    put('extras survive a scene load', alive('fText'));
    put('formation text survives a scene load', B.state.formation.text === 'BRYK', B.state.formation.text);

    /* ── per-layer marks: the whole point of moving them off the pool ────────── */
    B.layers().slice().forEach(L => B.removeLayer(L.id));
    const A = B.addLayer('grid'), C = B.addLayer('pulsing-circle');
    A.opacity = 1; C.opacity = 1;   /* share is retired: the layers no longer share bodies */
    A.shapes = { tri:1, wedge:0, circle:0, asset:0 };
    C.shapes = { tri:0, wedge:0, circle:1, asset:0 };
    B.rebuildTex(); await sleep(700);
    /* Ownership is not a question any more: a body belongs to the layer that created it,
       so the marks it wears come straight off that layer. `B.owner()` existed only to
       arbitrate the shared pool and went with it. */
    const tex = B.textures(), per = { A:{}, C:{} };
    for (const [key, L] of [['A', A], ['C', C]])
      for (const bd of L.bodies) { const t = tex[bd.tex]; if (!t) continue;
        per[key][t.mark] = (per[key][t.mark] || 0) + 1; }
    put('a layer wears only the marks IT asked for',
        Object.keys(per.A).length === 1 && per.A.tri > 20 &&
        Object.keys(per.C).length === 1 && per.C.circle > 20,
        'A ' + JSON.stringify(per.A) + '  C ' + JSON.stringify(per.C));
    put('the texture bank is a UNION, it does not grow with the stack', tex.length < 60,
        tex.length + ' textures for 2 layers');

    /* an old scene has no per-layer marks — every layer must inherit the global mix */
    B.scene.apply({ v:1, shapes:{ tri:0, wedge:2, circle:0 }, assetW:0,
                    layers:[{prog:'grid'},{prog:'pulsing-circle'}] });
    await sleep(500);
    put('a pre-2026-07-18 scene migrates its global mix onto every layer',
        B.layers().length === 2 && B.layers().every(L => (L.shapes.wedge||0) === 2 && (L.shapes.tri||0) === 0),
        JSON.stringify(B.layers().map(L => L.shapes)));

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
