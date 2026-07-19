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

    /* ── renaming happens in the row, not in a browser modal ─────────────────── */
    const rowOf = id => [...document.querySelectorAll('.lrow')][B.layers().findIndex(L => L.id === id)];
    const nmBtn = rowOf(W.id).querySelector('.lname');
    nmBtn.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const inp = rowOf(W.id).querySelector('.lrename');
    put('a double-click opens an inline field, not a system prompt', !!inp);
    if (inp) {
      inp.value = 'RENAMED';
      /* the stage listens for 1-8 / B / H / F / W: a name typed into the row must not
         call a scene or black out the room */
      const before = B.layers().length;
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: '5', bubbles: true }));
      put('typing a name does not reach the stage keys',
          B.layers().length === before && !document.body.classList.contains('noui'));
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await sleep(150);
      const L2 = B.layers().find(L => L.id === W.id);
      put('the new name survives the rebuild it triggers', L2 && L2.label === 'RENAMED', L2 && L2.label);
      put('and the rack badge says the same thing',
          (document.getElementById('rackLayer').textContent || '').includes('RENAMED'),
          document.getElementById('rackLayer').textContent);
      /* Escape must put the old name back, untouched */
      rowOf(W.id).querySelector('.lname').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      const inp2 = rowOf(W.id).querySelector('.lrename');
      inp2.value = 'THROWN AWAY';
      inp2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await sleep(150);
      put('Escape cancels instead of committing',
          B.layers().find(L => L.id === W.id).label === 'RENAMED');
    }

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

    /* ── the seam: a hand edit on a DRIVEN path must not be undone next frame ───
       The rack stores the base of every path it drives and restores it at the foot of
       each frame. A card scrub that only wrote the parameter was therefore overruled a
       sixtieth of a second later — and only on paths that happened to be mapped, so the
       same slider worked or did not depending on the rack, with nothing on screen to say
       which. The hand rebases: it moves the point the modulation swings around. */
    B.layers().slice().forEach(L => B.removeLayer(L.id));
    const S = B.addLayer('pat-cloud'); await sleep(250);
    S.matrix.length = 0;
    S.matrix.push({ feat:'env.bassSlow', path:'spacing', mode:'up', depth:0.4, curve:'lin' });
    await sleep(400);
    /* the REAL control, typed into the way a hand types into it — the keyboard path of
       mkScrub, not a re-implementation of what the card does. A gate that calls the
       engine directly would pass on a card whose scrub was never wired at all. */
    let row = null;
    for (const r of document.querySelectorAll('#focusBody .row')) {
      const lb = r.querySelector('label');
      if (lb && /spacing/.test(lb.textContent)) { row = r; break; }
    }
    put('the driven parameter is on the card at all', !!row);
    if (row) {
      const scrub = row.querySelector('.scrub'), edit = row.querySelector('.sedit');
      scrub.focus();
      scrub.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      edit.value = '1.9';
      edit.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await sleep(600);
      const base = B.bases().get(S.id + '::spacing');
      put('a hand edit on a driven path survives the frame loop',
          base != null && Math.abs(base - 1.9) < 0.02, 'base is ' + base);
      /* And the modulation still swings — around the NEW base, not the old one.
         Sampling `S.look.spacing` cannot answer this: the value is restored to its base at
         the foot of every frame, so anything reading it between frames sees the base and
         concludes the drive is dead. That reading is exactly what made the camera look
         deleted (app.cjs, the view check). `watchDriven` records the value while it is
         driven, which is the only moment it exists. */
      B.watchDriven(true); await sleep(900); B.watchDriven(false);
      const log = (B.driven()[S.id + '::spacing'] || B.driven()['spacing'] || []);
      const lo = Math.min(...log), hi = Math.max(...log);
      put('and the rack still modulates around it', log.length > 5 && hi - lo > 1e-4,
          log.length + ' driven samples, swing ' + (log.length ? (hi - lo).toFixed(4) : '—') +
          ', around base ' + base);
    }

    /* ── MACRO: three knobs that each move a handful of things ─────────────────
       The bar is «at least five parameters», because a macro that moves one is a slider
       with a grander name. It is also the one control allowed to overrule a card by hand,
       so what it must NOT do is keep overruling: it writes while it is moved and then
       stops, or every card slider it covers becomes mysteriously dead. */
    B.layers().slice().forEach(L => B.removeLayer(L.id));
    const M1 = B.addLayer('pat-cloud'); await sleep(300);
    /* no rack rows for this one: a seeded row restores its base at the foot of every
       frame, so «did the macro write» and «did the drive put it back» would be the same
       measurement. The seam between hand and rack has its own check above. */
    M1.matrix.length = 0; B.bases().clear();
    /* the auto spin advances `cam.yaw` on its own between the two reads, and every macro
       was being credited with it — all three counts were one higher than the map declares */
    B.state.cam.spin = 0;
    const snapAll = () => { const o = {}; for (const p of B.paramsOf(M1)) o[p.key] = p.get(); return o; };
    for (const macro of ['energy', 'density', 'chaos']) {
      const lo = (B.applyMacro(macro, 0.05, true), await sleep(250), snapAll());
      const hi = (B.applyMacro(macro, 0.95, true), await sleep(250), snapAll());
      const moved = Object.keys(lo).filter(k => Math.abs((lo[k] || 0) - (hi[k] || 0)) > 1e-6);
      put(macro + ' moves at least five things', moved.length >= 5,
          moved.length + ': ' + moved.join(' '));
    }
    /* ── a macro nobody moved changes nothing ────────────────────────────────
       The absolute version destroyed the boot standby on FIRST TOUCH: committing a fader
       at its parked position — which is what typing a number does, no drag required —
       re-dealt the crowd, quadrupled `follow`, pulled `swirl` down out of the range Rob
       had deliberately set it above, and took 47% of the lit pixels off the screen. There
       is no undo, and the scene it wrecked is the one the app opens into. */
    B.scene.apply(B.scene.capture());   /* a known picture to touch */
    await sleep(600);
    const L0 = B.layers()[0];
    L0.phys.swirl = 0.85;               /* above the working maximum, exactly as he tuned it */
    const shot = () => ({ count: L0.count, follow: +L0.phys.follow.toFixed(4),
                          swirl: +L0.phys.swirl.toFixed(4), size: +L0.look.size.toFixed(3) });
    const untouched = shot();
    for (const mk of ['energy', 'density', 'chaos']) B.applyMacro(mk, B.state.macro[mk], true);
    await sleep(500);
    const touched = shot();
    put('a macro committed where it sits changes nothing',
        JSON.stringify(untouched) === JSON.stringify(touched),
        JSON.stringify(untouched) + ' → ' + JSON.stringify(touched));
    /* and a value the hand put outside the working range is not confiscated */
    B.applyMacro('chaos', B.state.macro.chaos + 0.1, true); await sleep(400);
    put('a hand-set value above the working range survives a macro move',
        L0.phys.swirl > 0.6, 'swirl ' + L0.phys.swirl.toFixed(3));

    /* it writes when moved, and then it is quiet */
    B.applyMacro('energy', 0.5, true); await sleep(200);
    const held = B.paramsOf(M1).find(p => p.key === 'size');
    held.set(77); await sleep(600);
    put('a macro does not keep re-asserting itself over the hand',
        Math.abs(held.get() - 77) < 1e-6, 'size held at ' + held.get());
    /* the pose travels with the scene, the picture is not re-derived from it */
    B.state.macro.energy = 0.23; B.state.macro.chaos = 0.81;
    const msnap = B.scene.capture();
    B.state.macro.energy = 0.5; B.state.macro.chaos = 0.5;
    B.scene.apply(msnap); await sleep(600);
    put('a scene recalls where the macro faders sat',
        Math.abs(B.state.macro.energy - 0.23) < 1e-6 && Math.abs(B.state.macro.chaos - 0.81) < 1e-6,
        'energy ' + B.state.macro.energy + ' · chaos ' + B.state.macro.chaos);
    put('a scene from before the macros existed loads at neutral',
        (B.scene.apply({ v:1, layers:[{prog:'grid'}] }), await sleep(400),
         B.state.macro.energy === 0.5), 'energy ' + B.state.macro.energy);

    /* ── LEAD: all layers stay alive, one is read as the front ──────────────────
       A3.2. Not mute and not opacity: nothing is removed, the rest sit back. The
       crossfade is eased, so the check is that it MOVES and then ARRIVES — a step change
       would read as a cut, and an emphasis that never arrives is a fader that drifts. */
    B.layers().slice().forEach(L => B.removeLayer(L.id, true));
    B.addLayer('grid'); B.addLayer('pat-cloud'); await sleep(800);
    const em = () => B.layers().map(L => +B.leadEmphasis(L).toFixed(3));
    put('with no lead every layer is at full weight', em().every(v => v === 1), em().join(' '));
    B.setLead(B.layers()[0].id);
    await sleep(120); const mid = em();
    await sleep(1300); const done = em();
    put('a lead change eases rather than cuts',
        mid[1] < 1 && mid[1] > 0.6 && done[1] < 0.6,
        'the other layer: ' + mid[1] + ' after 120ms → ' + done[1] + ' settled');
    put('the lead itself keeps its full weight', done[0] === 1, 'lead ' + done[0]);
    B.setLead(B.layers()[0].id); await sleep(1300);
    put('pressing the lead again releases the stack', em().every(v => v === 1), em().join(' '));

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
