/* BRYK — app gate. Run before every hand-off.
 *
 *   ./serve.sh &   then   node probe/app.cjs
 *
 * Playwright is borrowed from synthex-engine/node_modules (the only copy in
 * Projects/). Override with BRYK_PLAYWRIGHT if that moves.
 *
 * Covers: console · panel canon · geometry · contrast · WCAG 1.4.12 · engine wiring ·
 * layer blending · formation · palette · post pass · matrix drive+restore · FPS budget.
 *
 * Model note (2026-07-18): the app moved from a fixed `MODES` array to the EQJ layer
 * stack (`layers[]` of program instances + the `PROGRAMS` bank). This probe was written
 * against MODES and went stale at that rewrite — `B.modes`/`B.setMode`/`B.soloMode` no
 * longer exist. Ported here. The stale expectation was the failure, not the engine.
 */
'use strict';
/* Preset ids changed when the shelf was rebuilt from the ported banks (2026-07-18):
     axis→flow · ring→pulsing-circle · tunnel→radial · scatter→float · pattern→pat-<name>
   and `logo` folded into `word`. Names here follow the shelf; they are not magic. */

const path = require('path');
const PW = process.env.BRYK_PLAYWRIGHT ||
  path.join(__dirname, '..', '..', 'synthex-engine', 'node_modules', 'playwright');
const { chromium } = require(PW);
const URL = process.argv[2] || 'http://localhost:8931/index.html?fix=1';

const R = [];
const ok = (n, pass, extra) => R.push({ n, pass: !!pass, extra: extra == null ? '' : String(extra) });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__bryk, null, { timeout: 8000 });
  await page.waitForTimeout(2500);
  ok('console clean at boot', errors.length === 0, errors.slice(0, 3).join(' | '));
  const bootErrs = errors.length;

  // ── static: canon, geometry, contrast, spacing stress ──────────────────────
  for (const [n, p, e] of await page.evaluate(() => {
    const r = []; const put = (n, c, e) => r.push([n, !!c, e == null ? '' : String(e)]);
    const scrubs = [...document.querySelectorAll('.scrub')];
    put('no bare input[type=range] in either column',
        document.querySelectorAll('#panel input[type=range], #rightcol .row input[type=range]').length === 0);
    put('every scrub carries a number', scrubs.length > 10 && scrubs.every(s => s.querySelector('.sval')), scrubs.length + ' scrubs');
    put('every scrub has role + aria range', scrubs.every(s =>
      s.getAttribute('role') === 'slider' && s.hasAttribute('aria-valuemin') && s.hasAttribute('aria-label')));
    put('numbers are tabular', scrubs.every(s => getComputedStyle(s.querySelector('.sval')).fontVariantNumeric.includes('tabular-nums')));
    const css = [...document.styleSheets].flatMap(sh => { try { return [...sh.cssRules].map(x => x.cssText); } catch (_) { return []; } });
    const stray = css.filter(t => !t.startsWith(':root')).filter(t => /#[0-9a-fA-F]{3,8}\b/.test(t));
    put('zero hex outside :root', stray.length === 0, stray.slice(0, 2).join(' | '));
    put('no transition:all', !css.some(t => /transition:\s*all/.test(t)));

    const h = el => Math.round(el.getBoundingClientRect().height);
    put('both columns 276px',
      Math.round(document.getElementById('panel').getBoundingClientRect().width) === 276 &&
      Math.round(document.getElementById('rightcol').getBoundingClientRect().width) === 276);
    for (const id of ['panel', 'rightcol']) {
      const b = document.querySelector('#' + id + ' .pbody');
      put(id + ' has no sideways scroll', b.scrollWidth <= b.clientWidth + 1);
    }
    /* Measure VISIBLE controls only. The program extras (font picker, text field) are
       parked in a hidden div whenever their card is closed, and a hidden element reports
       height 0 — that is the parking bay doing its job, not a layout defect. */
    const vis = sel => [...document.querySelectorAll(sel)].find(e => e.getBoundingClientRect().height > 0);
    const hs = [h(vis('.scrub')), h(vis('.tinSelect')), h(vis('.nudge .nb')), h(vis('.phbar'))];
    put('control heights agree', hs.every(v => v === hs[0]), hs.join('/'));

    const cv = document.createElement('canvas'); cv.width = cv.height = 1;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    const rgb = c => { cx.fillStyle = '#000'; cx.fillRect(0,0,1,1); cx.fillStyle = c; cx.fillRect(0,0,1,1);
      const d = cx.getImageData(0,0,1,1).data; return [d[0], d[1], d[2]]; };
    const lum = c => { const [R2,G,B] = c.map(v => { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); });
      return 0.2126*R2 + 0.7152*G + 0.0722*B; };
    const ratio = (f, b) => { const [x, y] = [lum(rgb(f)), lum(rgb(b))].sort((p,q)=>q-p); return +((x+0.05)/(y+0.05)).toFixed(2); };
    const bg = getComputedStyle(document.getElementById('panel')).backgroundColor;
    for (const [nm, sel] of [['row label','.row > label'],['number','.sval'],['legend','legend'],['note','.note']]) {
      const v = ratio(getComputedStyle(document.querySelector(sel)).color, bg);
      put('contrast ' + nm + ' ≥4.5', v >= 4.5, v + ':1');
    }
    for (const t of ['--accent-live','--accent-beat','--accent-warn']) {
      const v = ratio(getComputedStyle(document.documentElement).getPropertyValue(t).trim(), bg);
      put('contrast ' + t + ' ≥3', v >= 3, v + ':1');
    }

    const s = document.createElement('style');
    s.textContent = '*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}';
    document.head.appendChild(s);
    /* Ellipsis truncation WITH a title is an honest pattern (the full string is one
       hover away), so it does not count as loss of content. Anything clipped with no
       way to read it does. */
    const clipped = [...document.querySelectorAll('.row > label, .btn, legend, .note, #meters .ml')]
      .filter(el => el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2)
      .filter(el => !el.title)
      .map(el => el.tagName.toLowerCase() + ' "' + el.textContent.trim().slice(0, 18) + '"');
    s.remove();
    put('WCAG 1.4.12 no unrecoverable clipped text', clipped.length === 0, clipped.slice(0, 4).join(' | '));
    return r;
  })) ok(n, p, e);

  // ── engine behaviour ───────────────────────────────────────────────────────
  for (const [n, p, e] of await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const B = window.__bryk, r = [];
    const put = (n, c, e) => r.push([n, !!c, e == null ? '' : String(e)]);
    /* Layer-model helpers. `onlyProg` is the engine's own solo path; `setW` goes through
       setLayerW so the panel re-renders exactly as it does under the hand. */
    const solo = p => B.onlyProg(p);
    const layerOf = p => B.layers().find(L => L.prog === p);
    const setW = (p, w) => { let i = B.layers().findIndex(L => L.prog === p);
      if (i < 0) { B.addLayer(p); i = B.layers().findIndex(L => L.prog === p); }
      B.setLayerW(i, w); };

    /* count moved onto the layer when the shared pool was split, so the stage total is
       the sum over the stack rather than one number */
    put('every layer holds exactly its own count',
        B.layers().every(L => L.bodies.length === Math.round(L.count)),
        B.layers().map(L => L.bodies.length + '/' + L.count).join(' '));
    put('no NaN in the pool', B.pool().every(b => [b.x,b.y,b.z].every(Number.isFinite)));
    put('ramp is 256 wide', B.ramp().length === 256);
    /* Don't count programs — that number is a design choice and will keep moving. Check
       the two things that must hold: every pattern in the bank is reachable, and every
       one of them produces finite, bounded, non-degenerate points (particle-dance's own
       assertCore contract: non-finite or |p|>5 is a failure there too).
       Under the layer model the old fixed patA/patB slots are gone BY DESIGN — a pattern
       is reached by adding a layer, not by occupying one of two reserved seats. So the
       slot check becomes a reachability check. */
    /* Reachability, restated for the shelf. The particle bank used to hide behind one
       card's dropdown; it is now one preset per pattern, so «reachable» means «has its own
       button», which is Rob's rule that any preset choice IS a new layer. */
    const bank = B.programs();
    /* Фокус-версия (A8.2) вынесла ядро в собственную категорию `core`, чтобы оно не
       читалось как один из семнадцати. Достижимость от этого не изменилась — изменилась
       полка, — поэтому паттерном считается и то, что лежит в `core`. */
    const patIds = Object.keys(bank).filter(k => bank[k].group === 'particles' || bank[k].group === 'core');
    /* was `patIds.length === B.patterns().length` where patIds is derived FROM the bank —
       the assertion compared a number with itself. Check the names actually line up. */
    const bankNames = new Set(B.patterns().map(([id]) => id));
    const shelfNames = new Set(patIds.map(k => k.replace(/^pat-/, '')));
    put('every pattern in the bank has its own preset',
        bankNames.size === shelfNames.size && [...bankNames].every(n => shelfNames.has(n)),
        [...bankNames].filter(n => !shelfNames.has(n)).join(',') ||
        shelfNames.size + ' patterns, one preset each');
    put('a formation preset is present', !!bank.word);
    put('boot does not arm', B.armed() === false);

    const cv = document.getElementById('cv'), g = cv.getContext('2d');
    const px = g.getImageData(0, 0, cv.width, cv.height).data;
    let lit = 0; for (let i = 3; i < px.length; i += 4) if (px[i] > 8) lit++;
    /* The bar was 5000, calibrated when boot opened on a demo that filled the frame with
       lanes. Boot is Rob's standby now — a deliberately sparse field waiting for music —
       and it lights ~4700 px, so the old number was measuring DENSITY while claiming to
       measure life. What this check is for is a dead render: a blank stage lights 0, a
       single stray body a few hundred. 1500 catches both and lets the standby be calm. */
    put('stage is painting', lit > 1500, lit + ' lit px');

    /* Gate the VALUE the engine sees, inside the frame, not the riser on the panel.
       The riser is painted by applyMatrix whether or not the value reaches anything, and
       the companion assertion (`state == panel between frames`) becomes MORE true as the
       modulation dies — a gate that rewards the defect it is meant to catch.
       Sampling inside rAF is the only place the driven value is observable: restoreMatrix
       hands the base back before the frame ends. */
    {
      const L0 = B.layers()[0];
      L0.matrix.length = 0;
      L0.matrix.push({ feat:'beat.sine', path:'size', mode:'up', depth:0.6, curve:'lin' });
      const base = L0.look.size;
      B.watchDriven(true);
      await sleep(1500);
      B.watchDriven(false);
      const log = B.driven()[L0.id + '::size'] || [];
      const span = log.length ? Math.max(...log) - Math.min(...log) : 0;
      const p = B.paramsOf(L0).find(x => x.key === 'size');
      const range = p ? (p.max - p.min) : 1;
      put('the drive reaches the ENGINE, not just the riser', span > range * 0.6 * 0.4,
          'size swung ' + span.toFixed(1) + ' of an expected ' + (range * 0.6).toFixed(1) +
          ' over ' + log.length + ' frames');
      put('and the base is handed back between frames', Math.abs(L0.look.size - base) < 0.001,
          'base ' + base + ' now ' + L0.look.size);
      L0.matrix.length = 0;
    }

    // presence is a blend, not a stack
    solo('pulsing-circle'); await sleep(900);
    const a = { ...B.pool()[5] };
    setW('word', 1); await sleep(900);
    const b = B.pool()[5];
    put('a second layer at equal weight moves the blend',
        Math.hypot(b.x - a.x, b.y - a.y) > 0.05, Math.hypot(b.x - a.x, b.y - a.y).toFixed(3));

    // formation lands
    /* The contract is simple and it is currently BROKEN: a body must end up at the point
       the program assigned to IT. Measured 2026-07-18 with mappings cleared, jitter 0 and
       a real solo: median 0.514 from the assigned point, bodies spanning 5.67 × 3.00
       against a mask of 3.15 × 0.85. Ruled out: the mask itself (renders BRYK correctly),
       the program target (returns the exact mask point for the body asked about), and the
       forces (collide/swirl off changes little). The transport is what does not converge.
       Threshold is the mask's own point spacing × 3 — three cells of slack is generous and
       still nowhere near what the build does. This gate stays red until the word reads. */
    const WL = solo('word'); await sleep(2600);
    /* the word layer's own bodies: B.pool() is the whole stage now */
    /* the set the engine actually placed them on. Rebuilding it here with the probe's own
       arguments compared the crowd against a different word: the formation is fitted to
       the layer's own viewport now, and the probe had no way to know that reach. */
    const pts = B.formationPoints(), pool = WL.bodies, NB = pool.length;
    const errs = pool.map((b, i) => {
      const q = pts[Math.min(pts.length - 1, Math.floor(i * pts.length / NB))];
      return Math.hypot(q[0] - b.x, q[1] - b.y);
    }).sort((a, b) => a - b);
    const medErr = errs[Math.floor(NB / 2)];
    const xs = pool.map(b => b.x), ys = pool.map(b => b.y);
    const span = [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
    const mx = pts.map(q => q[0]), my = pts.map(q => q[1]);
    const maskSpan = [Math.max(...mx) - Math.min(...mx), Math.max(...my) - Math.min(...my)];
    const cell = Math.sqrt(maskSpan[0] * maskSpan[1] / Math.max(1, pts.length));
    put('a body reaches the point it was assigned', medErr < cell * 3,
        'median ' + medErr.toFixed(3) + ' vs 3 cells ' + (cell * 3).toFixed(3));
    put('the crowd does not overflow the word', span[0] < maskSpan[0] * 1.25,
        'bodies ' + span.map(v => v.toFixed(2)).join('×') + ' vs mask ' + maskSpan.map(v => v.toFixed(2)).join('×'));
    put('the mask supplies a point for every body', pts.length >= NB * 0.9,
        pts.length + ' points / ' + NB + ' bodies');

    // post pass
    B.state.post.chroma = 0.5; await sleep(300);
    put('post engages above 0', getComputedStyle(document.getElementById('glcv')).display !== 'none');
    B.state.post.chroma = 0; await sleep(200);
    put('post fully off at 0', getComputedStyle(document.getElementById('glcv')).display === 'none');

    // palette: Rob asked for 8+
    const before = B.state.stops.length;
    for (let i = 0; i < 8; i++) document.getElementById('addStop').click();
    put('palette holds 8+ colours', B.state.stops.length >= 8, before + ' → ' + B.state.stops.length);

    // ── the whole pattern bank, one by one ───────────────────────────────────
    {
      /* the whole particle bank, one preset at a time — the same assertCore contract
         particle-dance holds itself to: finite, bounded, non-degenerate */
      B.setCount(200);
      const bad = [];
      for (const id of patIds) {
        const L = B.onlyProg(id); await sleep(220);
        const pl = B.pool();
        const finite = pl.every(b => [b.x,b.y,b.z].every(Number.isFinite));
        const alive = Math.max(...pl.map(b => Math.hypot(b.x,b.y))) > 0.05;
        if (!finite || !alive) bad.push(id + (finite?'':' NaN') + (alive?'':' collapsed'));
      }
      put('every pattern is finite and non-degenerate', bad.length === 0,
          patIds.length + ' patterns' + (bad.length ? ' — ' + bad.join(' | ') : ''));
    }

    // ── Motion Primer behaviours / manners drive the force block ─────────────
    /* Gate the RELATION, not the magnitude. The presets were re-scaled from Motion
       Primer's px world onto our ±3 one — the file says so itself: «the separation/flow
       figures are mapped, not copied — the RELATIONS between the manners are what carries
       the character». The old thresholds (>1) were left over from the px era and failed
       on correct code: fall now sets gravity 0.55, orbit swirl 0.55, Disperse collide
       exactly 1.00. Any re-tune moves those numbers again; it must not move the ordering. */
    B.quant('off');
    /* Call the engine's own entry point. The behaviour and manner selects are built per
       focused layer now, so there is no stable DOM id to drive — and driving one only ever
       proved the markup existed. `state.phys` is the focused layer's force set. */
    const pick = async (fn, v) => { fn(v); await sleep(400); return { ...B.state.phys }; };
    const fall = await pick(B.applyBehaviour, 'fall'), orbit = await pick(B.applyBehaviour, 'orbit'),
          pack = await pick(B.applyBehaviour, 'pack');
    put('fall is the only behaviour that falls',
        fall.gravity > 0 && orbit.gravity === 0 && pack.gravity === 0,
        'fall ' + fall.gravity + ' / orbit ' + orbit.gravity + ' / pack ' + pack.gravity);
    put('gravity dominates fall, swirl dominates orbit',
        fall.gravity > fall.swirl && orbit.swirl > orbit.gravity && orbit.swirl > fall.swirl,
        'fall g' + fall.gravity + ' s' + fall.swirl + ' | orbit g' + orbit.gravity + ' s' + orbit.swirl);
    const disp = await pick(B.applyManner, 'Disperse'), clus = await pick(B.applyManner, 'Cluster'),
          flow = await pick(B.applyManner, 'Flow');
    put('Disperse separates hardest and refuses to cohere',
        disp.collide > clus.collide && disp.collide > flow.collide && disp.flock === 0,
        'collide ' + disp.collide + ' vs ' + clus.collide + '/' + flow.collide);
    put('Cluster coheres, Flow flows',
        clus.flock > disp.flock && flow.swirl > clus.swirl,
        'cluster flock ' + clus.flock + ' | flow swirl ' + flow.swirl);
    /* the rail must show what the engine just did — the forces section is rebuilt on
       every apply, so read the row that carries `collide` out of the live DOM */
    const collideRow = [...document.querySelectorAll('#focusBody .row')]
      .find(r => r.querySelector('label') &&
                 r.querySelector('label').textContent === 'avoid each other');
    /* the row is named for what it does now, not for the force it holds — «collide»
       became «avoid each other» when the forces section was rewritten in Rob's words */
    put('the rail follows a behaviour change',
        !!collideRow && Math.abs(parseFloat(collideRow.querySelector('.sval').textContent) -
                                 B.state.phys.collide) < 0.02,
        collideRow ? collideRow.querySelector('.sval').textContent + ' vs ' + B.state.phys.collide : 'no row');

    // ── quantise: a fired action must wait for the musical grid ──────────────
    B.quant('phrase');
    B.move('magnet'); await sleep(150);
    put('a quantised move waits for the grid', B.pending() === 1 && !B.moving(),
        'pending ' + B.pending());
    B.quant('off');
    while (B.pending()) await sleep(120);                 // let the queued one land+finish
    while (B.moving()) await sleep(200);

    // ── a move drives a MODULATED parameter and hands it back ────────────────
    const persp0 = B.state.cam.persp;
    B.move('magnet');
    let peak = 0, peakAttract = 0;
    for (let i = 0; i < 55; i++) { peak = Math.max(peak, B.state.cam.persp);
      peakAttract = Math.max(peakAttract, B.state.phys.attract); await sleep(70); }
    put('move drives a modulated param (not clobbered by the drive)', peak > persp0 + 0.1,
        persp0.toFixed(2) + ' → ' + peak.toFixed(2));
    put('move ramps its forces', peakAttract > 1, 'peak attract ' + peakAttract.toFixed(2));
    while (B.moving()) await sleep(200);
    put('move restores what it borrowed', Math.abs(B.state.cam.persp - persp0) < 0.03 &&
        B.state.phys.attract === 0);

    /* ── scenes round-trip ─────────────────────────────────────────────────────
       This asserted `state.size`, `state.shapes.tri` and `SCRUBS.size` — a dead global,
       a dead global and a scrub with no slot in the markup. It was green for months while
       proving that three things nobody reads survive a save. What a scene has to carry is
       what the ENGINE reads: the layer's own look, count, opacity, forces and rows. */
    setW('radial', 0.66);                       /* creates the layer if it is not up */
    const preL = layerOf('radial');
    preL.look.size = 77; preL.shapes.tri = 2.5; preL.phys.swirl = 0.31;
    const snap = B.scene.capture();
    preL.look.size = 12; preL.shapes.tri = 0; preL.phys.swirl = 0; setW('radial', 0);
    B.scene.apply(snap); await sleep(600);
    /* applyScene rebuilds the stack, so the layer must be re-found by program, never held
       across the apply */
    const tun = layerOf('radial');
    put('scene restores the layer look, forces and opacity',
        !!tun && tun.look.size === 77 && tun.shapes.tri === 2.5 &&
        Math.abs(tun.phys.swirl - 0.31) < 0.001 && Math.abs(tun.opacity - 0.66) < 0.001,
        tun ? ('size ' + tun.look.size + ' · swirl ' + tun.phys.swirl + ' · op ' + tun.opacity) : 'no layer');
    put('a loaded scene survives the next drive frame',
        layerOf('radial').look.size === 77, 'size ' + layerOf('radial').look.size);
    /* a v1 scene carried ONE global force set and no per-layer look; it must land on every
       layer as defaults rather than as undefined — `lerp(1,size,undefined)` is NaN, and a
       NaN calibre is an invisible body */
    B.scene.apply({ v: 1, layers: [{ prog: 'grid', count: 100 }], phys: { swirl: 0.2 } });
    await sleep(700);
    const old = layerOf('grid');
    put('an old scene gets defaults, not undefined',
        !!old && Number.isFinite(old.phys.follow) && Number.isFinite(old.look.varSize) &&
        Number.isFinite(old.look.varTilt) && B.state.stops.length >= 2,
        old ? ('varSize ' + old.look.varSize + ' · varTilt ' + old.look.varTilt) : 'no layer');

    // ── mod rack ─────────────────────────────────────────────────────────────
    const rows0 = B.matrix().length;
    document.getElementById('addRow').click();
    put('rack adds a row', B.matrix().length === rows0 + 1 &&
        document.querySelectorAll('#rack .mcard').length === rows0 + 1);
    document.querySelector('#rack .mtgl.x').click();
    put('rack removes a row', B.matrix().length === rows0);

    // ── camera stays honest with no device ──────────────────────────────────
    put('camera off by default, no cam faces in the bank',
        B.cam().on === false && !B.textures().some(t => t.face === 'cam'));
    put('camera layer hidden while off',
        getComputedStyle(document.getElementById('camcv')).display === 'none');

    // chrome
    document.getElementById('uiBtn').click();
    put('chrome hides both columns', document.body.classList.contains('noui') &&
        getComputedStyle(document.getElementById('panel')).display === 'none');
    put('the way back survives', getComputedStyle(document.getElementById('uiBtn')).display !== 'none');
    document.getElementById('uiBtn').click();
    return r;
  })) ok(n, p, e);

  // ── FPS budget: the frame cost must not depend on the body count ───────────
  const perf = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const B = window.__bryk; const rows = [];
    B.onlyProg('radial'); await sleep(600);
    for (const [n, face, post] of [[300,0,0],[1000,0,0],[300,0.8,0],[1000,0.8,0],[500,0.8,0.5]]) {
      B.setCount(n); B.setFace(face); B.state.post.chroma = post;
      await sleep(1600);
      rows.push({ n, face, post, fps: B.fps() });
    }
    B.setCount(160); B.setFace(0); B.state.post.chroma = 0; B.onlyProg('grid');
    return rows;
  });
  /* FPS is INFORMATIONAL and never gates — same rule Synthex Engine settled on.
     Headless Chromium renders canvas through SwiftShader with no vsync, so the numbers
     are neither the real machine's nor comparable to it: this scene reads 110fps at 300
     billboards and 31fps at 300 turned here, while the same build holds a steady 60 in a
     headed window. Judge frame rate in a real window, on the machine that runs the set.
     What IS gated is the shape of the curve: cost must not explode with body count. */
  console.log('  --  fps (headless SwiftShader — informational, judge headed)');
  for (const row of perf) {
    console.log('      ' + String(row.n).padStart(5) + ' bodies' +
      (row.face ? ' turned' : '       ') + (row.post ? ' + chroma' : '         ') +
      '  ' + row.fps + ' fps');
  }
  /* Gate the STRUCTURAL invariant, not the timing: however many bodies are on stage,
     the number that take the expensive quad path is capped. That is deterministic and
     measurable in headless; an fps ratio here is just SwiftShader noise (an earlier
     version of this gate flapped at 0.56 vs a 0.6 threshold for exactly that reason). */
  const budget = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const B = window.__bryk, rows = [];
    const L = B.onlyProg('radial'); B.setFace(0.8);
    /* BODIES BIG ENOUGH THAT THE BUDGET IS WHAT STOPS THEM. At the default calibre the
       LOD threshold culls almost everything before the cap is reached — measured 3 / 15 /
       39 quads against a cap of 80 — so the gate was watching a bound that never bound
       anything, and deleting the whole budget pre-pass would not have shown. Sixty pixels
       a body puts every one of them past the LOD, and then the only thing standing between
       1200 bodies and 1200 quads is the budget itself. */
    Object.assign(L.look, { size: 60, varSize: 0.1, wave: 0 });
    Object.assign(L.cam, { persp: 0.6, zoom: 1 });
    for (const n of [200, 600, 1200]) {
      B.setCount(n); await sleep(900);
      let peak = 0;
      for (let i = 0; i < 30; i++) { peak = Math.max(peak, B.quads());
        await new Promise(r => requestAnimationFrame(r)); }
      rows.push({ n, peak, cap: B.quadBudget });
    }
    B.setCount(160); B.setFace(0); B.onlyProg('grid');
    return rows;
  });
  for (const r of budget) {
    ok('quad budget holds at ' + r.n + ' bodies', r.peak <= r.cap, r.peak + ' quads (cap ' + r.cap + ')');
  }
  /* «+2» was written when this measured 0 → 0 → 0: setFace() wrote a global the renderer
     had stopped reading, so no body ever took the quad path and the budget gate passed by
     drawing nothing. With the drive reconnected it reads 40 → 46 → 49, which is the real
     shape of the invariant: quad cost must not SCALE with population. Six times the bodies
     for a quarter more quads is the LOD doing its job; a linear rise would be the bug. */
  /* What the code actually guarantees is the CAP: however many bodies are on stage, at
     most QUAD_BUDGET of them take the expensive path. The previous version also demanded
     the curve go flat between 600 and 1200, which only holds once the cap is reached —
     and where that happens depends on calibre, so raising the default body size (fewer,
     bigger bodies) moved the saturation point and turned a true statement about the
     engine into a false one about one configuration. The bound is the invariant. */
  /* and the cap has to be REACHED, or the line above is measuring the LOD again */
  ok('the budget is what bounds it, not the LOD',
     budget[budget.length - 1].peak >= budget[budget.length - 1].cap * 0.75,
     budget.map(r => r.n + ':' + r.peak).join(' → ') + ' against a cap of ' + budget[0].cap);
  ok('quad cost is bounded however many bodies',
     budget.every(r => r.peak <= r.cap),
     budget.map(r => r.n + ':' + r.peak).join(' → ') + ' (cap ' + budget[0].cap + ')');

  /* ── A3.1 · a layer's behaviour belongs to a layer ────────────────────────────
     Rob, live: «слои не работают, всё полупрозрачное». Half of that was compositing
     (fixed 2026-07-18) and half was this: forces lived in ONE global object, so giving
     one card gravity dropped every body on screen. The contract now is:
       · a force set on layer A moves A's bodies and NOT B's
       · the single exception is contact — bodies of different layers make room for
         each other through the shared grid (§A3.1 «межслойно только avoid/collide»)
     Both halves are gated, because a gate that only proves the first would stay green
     if contacts were quietly dropped. Verified to FAIL on the pre-refactor build. */
  const iso = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const B = window.__bryk;
    B.layers().slice().forEach(L => B.removeLayer(L.id));
    const A = B.addLayer('grid'), C = B.addLayer('grid');
    /* both quiet: no forces, no drift, so anything that moves has a named cause */
    for (const L of [A, C]) { Object.assign(L.phys, { on: 1, follow: 0, damp: 0.9, collide: 0,
      swirl: 0, gravity: 0, attract: 0, flock: 0 }); L.opacity = 1; }
    B.setCount(120); await sleep(700);
    const snap = L => B.bodiesOf(L).map(b => ({ x: b.x, y: b.y }));
    const drift = (L, was) => { const now = snap(L);
      return Math.max(...now.map((p, i) => Math.hypot(p.x - was[i].x, p.y - was[i].y))); };

    /* 1 · gravity on A only, at the TOP of the slider's own range. This used 1.6 — three
       times what the control can now reach — and measured the speed ceiling rather than
       the force. A calibration contract is worth more than a physics one: whatever the
       slider can be dragged to must leave the scene on screen. */
    const a0 = snap(A), c0 = snap(C);
    A.phys.gravity = B.paramsOf(A).find(p => p.key === 'phys.gravity').max;
    await sleep(900);
    const movedA = drift(A, a0), movedC = drift(C, c0);
    A.phys.gravity = 0;

    /* 2 · contact still crosses the stack: park both layers' bodies on the same spot
       and turn collide up — they must push apart even though they are different layers */
    B.bodiesOf(A).forEach(b => { b.x = 0.02; b.y = 0; b.vx = b.vy = b.vz = 0; });
    B.bodiesOf(C).forEach(b => { b.x = -0.02; b.y = 0; b.vx = b.vy = b.vz = 0; });
    const gap0 = 0.04;
    for (const L of [A, C]) { L.phys.collide = 2; L.phys.radius = 0.3; }
    await sleep(900);
    const mean = L => { const b = B.bodiesOf(L); return b.reduce((s, p) => s + p.x, 0) / b.length; };
    const gap1 = Math.abs(mean(A) - mean(C));
    /* per-frame displacement × 60 = the u/s the ceiling is stated in */
    /* SAMPLED WHILE IT IS MOVING. Reading the velocities after the settle measured the
       parked state — peak 0.01 against a cap of 6, seven hundred times of slack, and
       deleting the clamp entirely would not have shown. The clamp exists for the frames
       right after a shove, so that is when to look: drop the damping, kick every body, and
       watch the peak across the next second. */
    let vmax = 0;
    for (const L of [A, C]) { L.phys.damp = 0.995; L.phys.gravity = 0.15; L.phys.follow = 0; }
    for (const L of [A, C]) for (const b of B.bodiesOf(L)) { b.vx += 4; b.vy -= 3; }
    for (let i = 0; i < 40; i++) { await sleep(25);
      for (const L of [A, C]) for (const b of B.bodiesOf(L))
        vmax = Math.max(vmax, Math.hypot(b.vx, b.vy, b.vz) * 60); }
    return { movedA, movedC, gap0, gap1, vmax };
  });
  /* Both bounds matter. The first version of this gate asserted only «> 0» and «grew»,
     and went green while printing a drift of 22 and a gap of 573 in a world that is 3.2
     units wide — it proved motion existed, not that the motion was motion rather than an
     explosion. Rob read the same numbers off the screen as «дёргается». An upper bound is
     what makes this gate able to fail. */
  ok('gravity at full slider stays on screen', iso.movedA > 0.05 && iso.movedA < 3.2,
     'drift ' + iso.movedA.toFixed(3) + ' in 0.9s (world is 3.2 wide)');
  ok("...and leaves the other layer's bodies alone", iso.movedC < 0.01,
     'stranger drift ' + iso.movedC.toFixed(4));
  ok('contact separates without launching', iso.gap1 > iso.gap0 * 1.5 && iso.gap1 < 3.2,
     'gap ' + iso.gap0.toFixed(3) + ' → ' + iso.gap1.toFixed(3));
  /* A little headroom over 6, because the first sample after a shove lands before the
     clamp has run. And a FLOOR, so the gate cannot pass by measuring a parked field: if
     nothing ever exceeded a third of the cap, the kick did not happen and the number
     proves nothing. */
  ok('nothing exceeds terminal speed', iso.vmax <= 7 && iso.vmax > 2,
     'peak ' + iso.vmax.toFixed(2) + ' u/s while shoved (cap 6)');

  /* ── the four words · scale · spacing · density · size ────────────────────────
     Rob named this vocabulary himself (2026-07-19). Each knob has to do its OWN job and
     nothing else, or we are back to `size` secretly meaning lane pitch. */
  const vocab = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const B = window.__bryk;
    B.layers().slice().forEach(L => B.removeLayer(L.id));
    const L = B.addLayer('flow');
    Object.assign(L.phys, { on: 1, follow: 14, damp: 0.9, collide: 0, swirl: 0,
      gravity: 0, attract: 0, flock: 0 });
    L.count = 240; L.opacity = 1;
    const settle = async () => { B.setCount(240); await sleep(1100); };
    /* half-extent of the settled field, in world units */
    const extent = () => { const b = B.bodiesOf(L);
      return { x: Math.max(...b.map(p => Math.abs(p.x))), y: Math.max(...b.map(p => Math.abs(p.y))) }; };
    /* mean distance to the nearest neighbour — the honest measure of «air» */
    const pitch = () => { const b = B.bodiesOf(L).slice(0, 90); let s = 0;
      for (const p of b) { let m = Infinity;
        for (const q of b) if (q !== p) m = Math.min(m, Math.hypot(q.x - p.x, q.y - p.y));
        s += m; }
      return s / b.length; };

    L.look.scale = 1; L.look.spacing = 1; L.params.spread = 1; L.params.axes = 6;
    await settle();
    const base = extent(), basePitch = pitch();

    /* 1 · fill: at spread 1 the outer lanes must reach the frame edge — measured ON THE
       CANVAS, in pixels. The first version of this check compared the field against the
       engine's own idea of where the edge is, so it read 107% while the picture only
       covered 46% of the screen: the constant it trusted was itself the bug. Asking the
       projector where a body actually lands is the only version of this test that can
       fail when the world-to-screen maths is wrong. */
    /* COVERAGE, not span. An axis recycles: bodies are supposed to live past the edge so
       the seam is never seen, so «max distance from centre» says nothing about whether
       the picture fills the screen — it only says the tail is long. Slice the canvas into
       eight horizontal bands and ask how many of them actually contain a body. At the old
       constant the field covered the middle four and left the top and bottom empty; that
       is the failure Rob was looking at, and this is the number that shows it. */
    const cs = B.canvasSize(), BANDS = 8;
    const seen = new Set();
    let span = 0;
    for (const p of B.bodiesOf(L)) {
      const s = B.project({ x: p.x, y: p.y, z: p.z });
      span = Math.max(span, Math.abs(s.y - cs.h / 2) / (cs.h / 2));
      if (s.x < 0 || s.x > cs.w || s.y < 0 || s.y > cs.h) continue;
      seen.add(Math.min(BANDS - 1, Math.floor(s.y / cs.h * BANDS)));
    }
    /* two different failures, two different numbers:
         span     — does the field REACH the edge (46% was the bug; over 100% is bleed,
                    which a recycling axis is supposed to have)
         coverage — is it a field at all, or one hairline through the middle */
    const reachRatio = span, bandRatio = seen.size / BANDS;

    /* 2 · scale moves the whole composition, and only that */
    L.look.scale = 0.5; await sleep(1100);
    const small = extent();
    L.look.scale = 1; await sleep(1100);

    /* 3 · spacing opens the air without changing the crowd */
    const n0 = B.bodiesOf(L).length;
    L.look.spacing = 2; await sleep(1200);
    const wide = pitch(), n1 = B.bodiesOf(L).length;
    L.look.spacing = 1; await sleep(600);

    /* 4 · size range is a hierarchy with a stable centre: turning it up must spread the
       calibres apart WITHOUT the whole field growing or shrinking (geometric mean 1) */
    const mult = r => B.bodiesOf(L).map(b => B.sizeMult(b.pd.size, r));
    const stat = a => { const lo = Math.min(...a), hi = Math.max(...a);
      const gm = Math.exp(a.reduce((s, v) => s + Math.log(v), 0) / a.length);
      return { ratio: hi / lo, gm }; };
    const flat = stat(mult(0)), spread = stat(mult(1));

    return { reachRatio, bandRatio, shrink: small.y / base.y, basePitch, wide, n0, n1,
             flatRatio: flat.ratio, spreadRatio: spread.ratio, spreadGm: spread.gm };
  });
  ok('axis reaches the frame edge', vocab.reachRatio > 0.95,
     'field spans ' + (vocab.reachRatio * 100).toFixed(0) + '% of the half-frame (46% was the bug)');
  ok('...as a field, not a hairline', vocab.bandRatio >= 0.75,
     (vocab.bandRatio * 8) + '/8 bands of the canvas carry bodies');
  ok('scale resizes the whole composition', Math.abs(vocab.shrink - 0.5) < 0.12,
     'scale 0.5 → extent ×' + vocab.shrink.toFixed(2));
  ok('spacing opens the air, not the crowd', vocab.wide > vocab.basePitch * 1.4 && vocab.n1 === vocab.n0,
     'pitch ' + vocab.basePitch.toFixed(3) + ' → ' + vocab.wide.toFixed(3) + ' at the same ' + vocab.n1 + ' bodies');
  ok('size range builds a hierarchy around a stable centre',
     vocab.flatRatio < 1.001 && vocab.spreadRatio > 3 && Math.abs(vocab.spreadGm - 1) < 0.15,
     'range 0 → ×' + vocab.flatRatio.toFixed(2) + ' · range 1 → ×' + vocab.spreadRatio.toFixed(1) +
     ' (mean ' + vocab.spreadGm.toFixed(2) + ')');

  /* ── fill / frame ─────────────────────────────────────────────────────────────
     The switch shipped in the card, wired to a `mode` param, passed as a second argument
     to a function declared with one — so JS dropped it and the control did nothing. The
     two modes are complements: whatever is ink in FILL is empty in FRAME. Testing that
     they merely DIFFER would pass on any bug that returns two different lists, so the
     test is the complement itself — sample the same points in both modes and require
     them to be disjoint, and require both to be non-empty. */
  const ff = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const B = window.__bryk;
    B.state.formation.text = 'BRYK';
    const key = p => p[0].toFixed(3) + ',' + p[1].toFixed(3);
    const fill = B.formation(300, false).map(key);
    const frame = B.formation(300, true).map(key);
    const shared = new Set(fill).size ? frame.filter(k => new Set(fill).has(k)).length : -1;
    await sleep(50);
    return { nFill: fill.length, nFrame: frame.length, shared };
  });
  ok('fill and frame are complements, not the same list',
     ff.nFill > 20 && ff.nFrame > 20 && ff.shared === 0,
     'fill ' + ff.nFill + ' pts · frame ' + ff.nFrame + ' pts · overlapping ' + ff.shared);

  /* ── driving a RATE must not jump the phase ───────────────────────────────────
     Rob, 2026-07-19: «появляются и сразу дёргаются как мухи». Every animated preset read
     its phase as `t · rate` with `t` the seconds since load, so modulating the rate threw
     the phase sideways by Δrate·t — an error that GROWS the longer the app is open. The
     test moves `dance` the way the mod rack does and measures how far bodies travel in
     the frame after the change, against how far they travel in a quiet frame. A rate
     change may accelerate them; it must not teleport them. */
  const smooth = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const B = window.__bryk;
    B.layers().slice().forEach(L => B.removeLayer(L.id));
    const L = B.addLayer('pat-burst');
    Object.assign(L.phys, { on: 1, follow: 6, damp: 0.9, collide: 0, swirl: 0,
      gravity: 0, attract: 0, flock: 0 });
    B.setCount(200);
    /* let the clock run up: the old bug is invisible at t≈0 and vicious at t≈60 */
    await sleep(9000);
    const pos = () => B.bodiesOf(L).map(b => ({ x: b.x, y: b.y }));
    const step = (a, b2) => { let m = 0;
      for (let i = 0; i < a.length; i++) m = Math.max(m, Math.hypot(b2[i].x - a[i].x, b2[i].y - a[i].y));
      return m; };
    const a0 = pos(); await new Promise(r => requestAnimationFrame(r));
    const quiet = step(a0, pos());
    const a1 = pos();
    L.params.dance = (L.params.dance || 0.72) + 0.25;   /* what a rack row does every frame */
    await new Promise(r => requestAnimationFrame(r));
    const jolt = step(a1, pos());
    return { quiet, jolt, ratio: jolt / Math.max(1e-6, quiet) };
  });
  ok('driving a rate accelerates, never teleports', smooth.ratio < 6,
     'quiet frame ' + smooth.quiet.toFixed(4) + ' → after a rate change ' +
     smooth.jolt.toFixed(4) + ' (×' + smooth.ratio.toFixed(1) + ')');

  /* ── a layer arrives and leaves, it does not blink ────────────────────────────
     Rob chose fade + shrink over a plain crossfade, so both have to be true: the layer
     must ramp rather than appear, and it must still be on the stack while it leaves. */
  const life = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const B = window.__bryk;
    B.layers().slice().forEach(L => B.removeLayer(L.id));
    const L = B.addLayer('pat-cloud');
    const k0 = L.life.k;
    await sleep(120); const kEarly = L.life.k;
    await sleep(1200); const kFull = L.life.k;
    B.removeSlow(L.id);                       /* the ✕ button's path */
    await sleep(200);
    const stillThere = B.layers().some(x => x.id === L.id), kGoing = L.life.k;
    await sleep(900);
    const gone = !B.layers().some(x => x.id === L.id);
    return { k0, kEarly, kFull, stillThere, kGoing, gone };
  });
  ok('a layer ramps in rather than blinking',
     life.k0 < 0.05 && life.kEarly > 0.05 && life.kEarly < 0.95 && life.kFull > 0.99,
     'k ' + life.k0.toFixed(2) + ' → ' + life.kEarly.toFixed(2) + ' → ' + life.kFull.toFixed(2));
  ok('a layer leaves over time, then is gone',
     life.stillThere && life.kGoing < 0.8 && life.kGoing > 0 && life.gone,
     'still on the stack at k ' + life.kGoing.toFixed(2) + ', removed after');

  /* ── the two new looks have to be real and have to be affordable ──────────────
     Angle snap is a rounding, so it is provable exactly: every body's angle must land on
     a multiple of TAU/n. The web is a per-PAIR cost, which is the one thing that can
     quietly turn a 60fps tool into a slideshow mid-set, so it is measured, not assumed. */
  const looks = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const B = window.__bryk, TAU = Math.PI * 2;
    B.layers().slice().forEach(L => B.removeLayer(L.id));
    const L = B.addLayer('pat-cloud'); L.opacity = 1;
    L.look.angles = 4; L.look.links = 0.9; L.look.linkDist = 0.5;
    B.setCount(600); await sleep(3500);
    let fps = 0; for (let i = 0; i < 5; i++) { await sleep(400); fps = Math.max(fps, B.fps()); }
    /* the rounding, read off the same expression the renderer uses */
    const q = TAU / 4;
    const offGrid = B.bodiesOf(L).slice(0, 200).map(b => {
      const own = (b.pd.roll) * L.look.varTilt;
      const r = Math.round(own / q) * q;
      return Math.abs(r / q - Math.round(r / q));
    }).filter(d => d > 1e-9).length;
    /* The longest link ACTUALLY PAINTED, at the most the sliders allow.
       This used to re-implement the neighbour search here — walk every pair, filter by
       reach, project, take the max — which is a second copy of a rule that lives in
       paintLinks, and the moment the two disagreed the copy grew a `continue` that
       skipped anything over 0.18 of the frame before measuring. That silenced the gate
       instead of the defect: with long pairs discarded before the max, «nothing exceeds
       a fifth of the frame» could not fail however far the engine drew.
       Now the renderer reports the longest stroke it put on the glass and the gate reads
       it. One implementation, and the number is about pixels a human would see. */
    L.look.linkMax = 5; L.look.linkDist = 0.45; await sleep(600);
    B.linkReset(); await sleep(500);            /* several frames at the worst setting */
    const rep = B.linkReport();
    /* The cap is computed HERE, from the stage size, not read back from the engine. Asking
       the renderer for its own bound and then comparing the renderer to it can only ever
       pass — and worse, the renderer skips a link before recording it, so `longest < cap`
       is a theorem, not a measurement. A wrong constant (say W*2) would sail through.
       A fifth of the stage width is the spec; the engine has to agree with the spec. */
    const cs = B.canvasSize();
    return { fps, offGrid, n: B.bodiesOf(L).length, longest: rep.longest,
             cap: cs.w * 0.2, engineCap: rep.cap };
  });
  ok('angle snap lands every body on the grid', looks.offGrid === 0,
     looks.offGrid + ' of 200 off a quarter-turn');
  ok('the web stays affordable at 600 bodies', looks.fps >= 45,
     looks.fps + ' fps with link 0.9 · reach 0.5');
  /* The web turned the frame into a mat of orange once, and twice over: no cap on how
     many neighbours a body links to, and a reach test done in the PLANE while the camera
     rotates depth into the screen — so two bodies touching in x/y but four units apart in
     z drew as a line across the whole canvas. Both are bounded now, and this asserts the
     visible consequence rather than the two causes: at the most the sliders allow, no
     link may cross more than a fifth of the frame. */
  ok('no link crosses the frame', looks.longest <= looks.cap,
     'longest ' + Math.round(looks.longest) + 'px, cap ' + Math.round(looks.cap));
  /* and the bound the engine enforces is the bound the spec asks for — the check above
     cannot see a cap that is simply set too high */
  ok('the engine enforces the frame-fifth it was asked for',
     Math.abs(looks.engineCap - looks.cap) < 1,
     'engine ' + Math.round(looks.engineCap) + 'px vs spec ' + Math.round(looks.cap) + 'px');

  /* ── a formation is LEGIBLE, at any crowd ─────────────────────────────────────
     Rob: «даже при большом количестве каких-то штук я всё равно 100% не добиваюсь».
     The word was drawn with the layer's calibre while its cell spacing came from the
     crowd, so at 300 bodies each one was several cells wide, every counter filled in and
     the word read as a blob — and adding bodies made it worse. The claim is that the ink
     stays INSIDE the letters: bodies may not cover the holes. Measured as the share of the
     word's bounding box that is lit — solid letters with no counters run past 60%. */
  const legible = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const B = window.__bryk, cv = document.getElementById('cv'), g = cv.getContext('2d');
    const out = {};
    for (const n of [300, 900]) {
      const L = B.onlyProg('word'); L.matrix.length = 0; B.setCount(n);
      Object.assign(L.phys, { swirl:0, flock:0, attract:0, collide:0.3, gravity:0, follow:9, vary:0 });
      await sleep(2400);
      const pts = B.formationPoints();
      const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
      const p0 = B.project({ x: Math.min(...xs), y: Math.max(...ys), z: 0 });
      const p1 = B.project({ x: Math.max(...xs), y: Math.min(...ys), z: 0 });
      const x0 = Math.max(0, Math.round(Math.min(p0.x, p1.x))), y0 = Math.max(0, Math.round(Math.min(p0.y, p1.y)));
      const w = Math.min(cv.width - x0, Math.abs(Math.round(p1.x - p0.x))) || 1;
      const h = Math.min(cv.height - y0, Math.abs(Math.round(p1.y - p0.y))) || 1;
      const d = g.getImageData(x0, y0, w, h).data;
      let lit = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 24) lit++;
      out[n] = lit / (w * h);
    }
    return out;
  });
  ok('the word keeps its counters at any crowd',
     legible[300] < 0.6 && legible[900] < 0.6 && legible[300] > 0.05,
     'ink fill of the word box: 300 → ' + (legible[300] * 100).toFixed(0) +
     '% · 900 → ' + (legible[900] * 100).toFixed(0) + '%');

  /* ── layer opacity actually fades ─────────────────────────────────────────────
     Rob: «доработай карточкам прозрачность нормально чтоб работала». It did not: the frame
     loop set the layer's alpha and every body then overwrote it with its own, so the
     fader was dead across its whole travel and the layer only vanished at exactly 0. The
     claim is that the fade is MONOTONIC and roughly proportional — a fader that only works
     at its ends is not a fader. */
  const fade = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const B = window.__bryk, cv = document.getElementById('cv'), g = cv.getContext('2d');
    const L = B.onlyProg('pat-cloud'); L.matrix.length = 0; B.setCount(300);
    Object.assign(L.look, { size: 50, links: 0, streak: 0 });
    /* freeze the field: a moving picture makes every reading a different picture */
    Object.assign(L.phys, { swirl:0, flock:0, attract:0, gravity:0, collide:0, follow:14, vary:0 });
    L.params.dance = 0; L.params.sceneSpeed = 0; B.state.cam.spin = 0;
    await sleep(2200);
    const meanA = () => { const d = g.getImageData(0, 0, cv.width, cv.height).data; let s = 0;
      for (let i = 3; i < d.length; i += 4) s += d[i]; return s / (d.length / 4); };
    const out = {};
    for (const o of [1, 0.75, 0.5, 0.25, 0]) { L.opacity = o; await sleep(380); out[o] = meanA(); }
    /* and the fader may not extend past 1: above it, globalAlpha clamps and the travel is
       dead — the cards in Rob's screenshot read 1.22 and 1.58 */
    const row = document.querySelector('.lrow .lop .scrub');
    const extendable = row && +row.getAttribute('aria-valuemax') > 1;
    return { out, extendable };
  });
  const lv = [1, 0.75, 0.5, 0.25, 0].map(o => fade.out[o]);
  ok('layer opacity fades the whole way, not just at zero',
     lv[0] > lv[1] && lv[1] > lv[2] && lv[2] > lv[3] && lv[3] > lv[4] &&
     lv[3] < lv[0] * 0.45 && lv[4] === 0,
     lv.map(v => v.toFixed(1)).join(' → '));
  ok('opacity cannot be dragged past all of it', !fade.extendable,
     fade.extendable ? 'aria-valuemax is above 1' : 'clamped at 1');

  /* ── the mesh warp (R10.3) ────────────────────────────────────────────────────
     Three things have to hold together or the control is a lie in one of three ways:
     it must reach the mesh path on its own (the path used to open on `face` only, so the
     wave did nothing at heading 0), it must actually change the SILHOUETTE (displacing
     along the surface normal alone is nearly invisible to a near-frontal camera — the
     first version returned a circle with a dent), and it must not cost the set its frame. */
  const wave = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const B = window.__bryk;
    const L = B.onlyProg('grid'); B.setCount(60); L.matrix.length = 0; L.opacity = 1;
    Object.assign(L.phys, { swirl:0, flock:0, attract:0, gravity:0, collide:0, follow:9, vary:0 });
    Object.assign(L.look, { size:96, varSize:0, varTilt:0, angles:0, face:0,
                            wave:0, waveFreq:2, waveRate:0, scale:0.7 });
    B.state.cam.persp = 0.35; B.state.cam.spin = 0; B.state.cam.zoom = 1.4;
    await sleep(1600);
    /* the same bodies, the same phase, one knob apart */
    /* The «does it deform» pair has to differ in the FOLD and in nothing else. The first
       version measured wave-off with `face:0` — the billboard path — against wave-on on
       the mesh path, so switching rasterizer moved the lit-pixel count on its own and a
       wave with its amplitude wired to zero would have passed. Both sides run through the
       mesh now; the only difference is the displacement. */
    L.clock.wave = 1.1; L.look.face = 1; await sleep(700);
    const meshOnlyQ = B.quads(), flat = B.silhouette();
    L.look.wave = 0.34; L.clock.wave = 1.1; await sleep(700);
    const warp = B.silhouette();
    /* the reach question, asked separately: the fold must open the mesh path BY ITSELF */
    L.look.face = 0; L.look.wave = 0; await sleep(600); const flatQ = B.quads();
    L.look.wave = 0.34; await sleep(600); const warpQ = B.quads();
    /* Cost is asked as a RATIO against the mesh path, not as an absolute frame rate.
       These bodies are 96px at zoom 1.4, so every one of them takes the quad path with a
       large bounding box — and that path is expensive by itself, budgeted for exactly
       that reason (QUAD_BUDGET). Reading the absolute number here would have failed the
       wave for the cost of the perspective port, on a software renderer, which tells
       nobody anything. What the wave owes an answer for is what IT adds. */
    L.look.wave = 0; L.look.face = 1; await sleep(900);
    let meshFps = 0; for (let i = 0; i < 4; i++) { await sleep(350); meshFps = Math.max(meshFps, B.fps()); }
    L.look.wave = 0.34; L.look.face = 0; await sleep(900);
    let warpFps = 0; for (let i = 0; i < 4; i++) { await sleep(350); warpFps = Math.max(warpFps, B.fps()); }
    return { flatQ, warpQ, flat, warp, meshFps, warpFps };
  });
  ok('the wave reaches the mesh path with heading at zero',
     wave.flatQ === 0 && wave.warpQ > 0, wave.flatQ + ' quads flat → ' + wave.warpQ + ' warped');
  /* pixels, because «it deforms» is a claim about what the eye gets */
  ok('the wave changes the silhouette, not just the shading',
     Math.abs(wave.warp - wave.flat) / Math.max(1, wave.flat) > 0.02,
     'lit pixels ' + wave.flat + ' → ' + wave.warp);
  /* Both sides now push the SAME number of mesh cells — 80 flat quads at 4×4 against 20
     folded ones at 8×8 — so what is left is the warp arithmetic per node and the larger
     bounding box a fold creates, which is where the remaining third goes. Measured
     31 → 20 on a software renderer; the bound is 0.6 and the absolute number is only
     meaningful headed. */
  ok('folding costs little on top of the mesh it already needed',
     wave.warpFps >= wave.meshFps * 0.6,
     'same 60 bodies: ' + wave.meshFps + ' fps turned → ' + wave.warpFps + ' fps folded' +
     ' (headless software renderer; judge the absolute number headed)');

  /* ── the info dock answers with words, never with the number it is standing on ──
     Found by hovering, not by a gate: a control with no DESC entry fell through to the
     element's own text, and a scrub's own text is its VALUE. The dock printed «0.50» and
     looked like it was working. That is worse than an empty dock — nothing on screen says
     the description is missing. Every control in both columns is hovered here and the
     answer must not be a number. */
  const dock = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const foot = document.getElementById('footText');
    const bad = [];
    const scrubs = [...document.querySelectorAll('#panel .scrub, #rightcol .scrub')];
    for (const s of scrubs) {
      s.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await sleep(12);
      const t = (foot.textContent || '').trim();
      /* a bare number, a number with a unit, or the literal fallback = no description */
      if (!t || t === 'Info' || /^[-+]?[0-9]*\.?[0-9]+\s*\w{0,3}$/.test(t))
        bad.push((s.getAttribute('aria-label') || '?') + ' → "' + t + '"');
    }
    return { bad, n: scrubs.length };
  });
  ok('every control tells the dock what it does, not what it reads',
     dock.bad.length === 0, dock.bad.slice(0, 4).join(' | ') || dock.n + ' controls hovered');


  /* ── the kaleidoscope ─────────────────────────────────────────────────────────
     «Looks symmetrical» is not a claim a gate can hold, so it is measured: with N wedges
     the frame must repeat every TWO steps (neighbouring wedges are mirrored, so the same
     orientation returns on the second), and with the effect off the frame must be
     untouched — an effect that costs something at zero is an effect nobody can turn off. */
  const kal = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const B = window.__bryk, cv = document.getElementById('cv'), g = cv.getContext('2d');
    const TAU = Math.PI * 2;
    /* read a ring of samples at one radius, in the canvas's own device pixels */
    /* a PATCH, not a pixel. Single-pixel probes on a field of hard-edged shapes disagree
       across a mirror by one rounded coordinate, and the gate reported real symmetry as
       broken; the mean over a small patch answers the question actually being asked,
       which is whether the same picture is there. */
    const ring = (n, ang0) => { const out = [], R = Math.min(cv.width, cv.height) * 0.22;
      for (let i = 0; i < n; i++) { const a = ang0 + i / n * TAU;
        const x = Math.round(cv.width / 2 + Math.cos(a) * R) - 3, y = Math.round(cv.height / 2 + Math.sin(a) * R) - 3;
        const d = g.getImageData(x, y, 7, 7).data;
        let r = 0, gr = 0, b2 = 0; for (let k = 0; k < d.length; k += 4) { r += d[k]; gr += d[k+1]; b2 += d[k+2]; }
        const px = d.length / 4;
        out.push([r / px, gr / px, b2 / px]); }
      return out; };
    /* «the same picture», not «the same bytes». A mirror puts a hard edge on the other
       side of a rounded coordinate, so two patches showing the same shape differ by a few
       units; two patches showing different shapes differ by tens. The threshold is between
       those, and it is the difference between measuring the effect and measuring the
       sampler. */
    const ringAt = (radFrac, a) => { const R = Math.min(cv.width, cv.height) * radFrac;
      const x = Math.round(cv.width / 2 + Math.cos(a) * R) - 3, y = Math.round(cv.height / 2 + Math.sin(a) * R) - 3;
      const d = g.getImageData(x, y, 7, 7).data;
      let r = 0, gr = 0, b2 = 0; for (let k = 0; k < d.length; k += 4) { r += d[k]; gr += d[k+1]; b2 += d[k+2]; }
      const px = d.length / 4; return [r / px, gr / px, b2 / px]; };
    const alike = (a, b3) => Math.abs(a[0]-b3[0]) + Math.abs(a[1]-b3[1]) + Math.abs(a[2]-b3[2]) < 48;
    /* a field dense enough to have something to mirror at the sampling radius */
    const L = B.onlyProg('pat-cloud'); L.matrix.length = 0; L.opacity = 1;
    Object.assign(L.look, { size:54, varSize:0.3, scale:1.1, wave:0, links:0, streak:0 });
    Object.assign(L.phys, { swirl:0, flock:0, attract:0, gravity:0, collide:0, follow:9, vary:0 });
    /* SET THE MOTION, do not inherit it. The opacity block above deliberately freezes the
       field to measure a still picture, and `onlyProg` hands back the same layer — so this
       check read «the scene froze» and blamed the kaleidoscope for the previous gate's
       setup. Every block that needs the scene alive has to say so itself. */
    L.params.dance = 0.8; L.params.sceneSpeed = 0.6;
    B.setCount(420); B.state.cam.spin = 0; B.state.echo.amount = 0;
    B.state.kaleido.sectors = 0; B.state.kaleido.rate = 0; B.state.kaleido.roll = 0;
    await sleep(1800);
    const offA = ring(24, 0.3);
    await sleep(120);
    const offB = ring(24, 0.3);
    /* 🔴 Метрика мерила ГУСТОТУ, а не зеркало (2026-07-20).
       `ringAt` усредняет пятно 7×7. На плотном поле любые два пятна усредняются в
       один и тот же суп, и «похожи» становится верно ВЕЗДЕ: доля совпадений
       уезжала к 100%, а гейт объявлял зеркало там, где его нет. Раньше это гуляло
       0–83% (я списывал на флейк), а стоило поднять количество тел до 520 — стало
       красным всегда. Порог трогать было бессмысленно: сама величина не про то.

       Зеркало — это утверждение СРАВНИТЕЛЬНОЕ: пара, симметричная относительно шва,
       похожа СИЛЬНЕЕ, чем пара, взятая наугад на том же радиусе. Поэтому рядом с
       каждой зеркальной парой берётся контрольная, несимметричная, и сравниваются
       ДОЛИ. Плотность влияет на обе одинаково и из ответа уходит. */
    const step0 = TAU / 6;
    let offSame = 0, offLit = 0, ctlSame = 0, ctlLit = 0;
    /* Выборки, а не запас. На 24 парах стандартное отклонение доли около 0.11, то
       есть две доли расходятся на ±0.3 просто от случая — любой запас внутри этого
       коридора превращает гейт в монетку. Ослаблять порог было бы способом
       перестать замечать; правильный ход — набрать доказательств: 8 радиусов ×
       10 углов дают 80 пар и вдвое более узкий коридор. */
    for (const rad of [0.10, 0.14, 0.18, 0.22, 0.26, 0.30, 0.34, 0.38])
      for (let k = 1; k <= 10; k++) { const off = (k / 11) * (step0 / 2);
        const a = ringAt(rad, off), b3 = ringAt(rad, step0 - off);
        if (!(a[0]+a[1]+a[2] < 24 && b3[0]+b3[1]+b3[2] < 24)) {
          offLit++; if (alike(a, b3)) offSame++; }
        /* Контроль обязан отличаться от зеркальной пары ТОЛЬКО зеркальностью.
           Первая версия брала точку в 82° — а зеркальные пары стоят в 8..52° друг
           от друга, и близкие углы похожи сами по себе, без всякого зеркала.
           Сравнение выходило нечестным в свою пользу. Теперь контрольная пара
           разнесена на ТУ ЖЕ угловую базу, просто в стороне от шва. */
        const gap = Math.abs((step0 - off) - off);
        const c1 = ringAt(rad, off + step0 * 2.4), c2 = ringAt(rad, off + step0 * 2.4 + gap);
        if (!(c1[0]+c1[1]+c1[2] < 24 && c2[0]+c2[1]+c2[2] < 24)) {
          ctlLit++; if (alike(c1, c2)) ctlSame++; } }
    const ctlRate = ctlLit ? ctlSame / ctlLit : 0;
    const moved = offA.some((v, i) => !alike(v, offB[i]));
    let offFps = 0; for (let i = 0; i < 4; i++) { await sleep(320); offFps = Math.max(offFps, B.fps()); }
    const N = 6; B.state.kaleido.sectors = N; await sleep(900);
    /* The same picture read at θ and at θ + 2 sector-steps — neighbouring wedges are
       mirrored, so the same orientation returns on the second one.
       Only LIT samples are compared and one mismatch is allowed: a mirror lands a hard
       edge on the other side of a rounded coordinate, and demanding all of them equal
       measured the sampler's precision rather than the effect's symmetry. */
    const step = TAU / N;
    /* ADJACENT sectors, mirrored. The first version compared sectors TWO apart — both
       unmirrored copies — so it proved the wedges tile and never touched the mirror
       itself, and a build that reflected about the wrong axis (fetching the diametrically
       opposite part of the frame at every odd wedge) went green twice.
       Neighbours are mirror images, so sampling at +θ from one wedge's bisector must match
       sampling at −θ from the next one's. */
    /* The seam between wedge 0 and wedge 1 sits at roll + step/2, and wedge 1 is wedge 0
       reflected in it. So a sample at +off from wedge 0's bisector must equal the sample
       at −off from wedge 1's. `roll` is now the ONE angle the engine turns (there is no
       hidden accumulator any more), so the probe can put it at a known place and know
       where the seam is. */
    B.state.kaleido.roll = 0; B.state.kaleido.rate = 0; await sleep(400);
    /* several radii, not one: at a single radius most samples land on empty stage and the
       comparison runs out of lit pairs to judge */
    const s1 = [], s2 = [];
    for (const rad of [0.12, 0.18, 0.24, 0.30])
      for (let k = 1; k <= 6; k++) { const off = (k / 7) * (step / 2);
        s1.push(ringAt(rad, off)); s2.push(ringAt(rad, step - off)); }
    const dark = v => v[0] + v[1] + v[2] < 24;
    let same = 0, lit = 0;
    for (let i = 0; i < s1.length; i++) { if (dark(s1[i]) && dark(s2[i])) continue;
      lit++; if (alike(s1[i], s2[i])) same++; }
    let onFps = 0; for (let i = 0; i < 4; i++) { await sleep(320); onFps = Math.max(onFps, B.fps()); }
    return { offMoved: moved, same, lit, offFps, onFps, offLit, offSame, ctlRate,
             offSym: offLit ? offSame/offLit : 1 };
  });
  /* «Off» has to mean «no mirror», and the way to ask that is to look for the mirror.
     The old check compared two ring reads 120ms apart and passed if they DIFFERED, which
     says the scene is animating and nothing at all about the effect — a build that stamped
     a full-frame copy at sectors 0 would have sailed through. Now it asks the same
     question the six-wedge check asks, and requires the answer to be NO. */
  /* Вопрос теперь сравнительный: зеркальные пары не должны совпадать ЗАМЕТНО чаще,
     чем контрольные. Абсолютный порог 50% меряло густоту поля, а не эффект. */
  ok('with the kaleidoscope off there is no mirror',
     kal.offLit >= 24 && kal.offSym <= kal.ctlRate + 0.22,
     kal.offLit < 8
       ? ('слишком мало освещённых пар (' + kal.offLit + ' из 80) — измерять нечего')
       : 'зеркальные ' + Math.round(kal.offSym * 100) + '% против контрольных ' +
         Math.round(kal.ctlRate * 100) + '% (' + kal.offSame + '/' + kal.offLit + ' пар)');
  ok('neighbouring wedges are mirror images of each other',
     kal.lit >= 4 && kal.same >= kal.lit - 1,
     kal.same + ' of ' + kal.lit + ' lit samples match across the seam');
  /* N sectors is N full-frame fills, so the honest question is what it costs against the
     scene it mirrors — not an absolute frame rate on a software renderer. The wedges are
     read from a 60% copy for exactly this reason; ornament made of repeated copies is the
     one place resolution does not read. */
  ok('the mirror costs less than the scene it repeats',
     kal.onFps >= kal.offFps * 0.5,
     kal.offFps + ' fps plain → ' + kal.onFps + ' fps with 6 wedges' +
     ' (headless software renderer; judge the absolute number headed)');

  /* ── the view is reachable by hand AND by the beat ────────────────────────────
     Rob, 2026-07-19: «ты удалил панель ракурсов камеры, даже когда присваиваю в мэппинге
     его нет». The panel had only moved out of sight, and the drive was working the whole
     time — a driven parameter is restored to its base at the foot of every frame, so the
     slider reads 0 while the scene turns, which is indistinguishable from broken. The
     symptom is what gets gated: with the base at zero and a rack row on `cam.spin`, the
     scene must turn; with no row, it must not. */
  const view = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const B = window.__bryk;
    const onLeft = !!document.querySelector('#panel [data-mnt="spin"]');
    const offered = B.paramsOf().map(x => x.key).filter(k => k.startsWith('cam.'));
    B.state.cam.spin = 0; await sleep(600);
    const a = B.state.cam.yaw; await sleep(1500);
    const idle = Math.abs(B.state.cam.yaw - a);
    B.layers()[0].matrix.push(
      { feat: 'env.bassSlow', path: 'cam.spin', mode: 'up', depth: 0.6, curve: 'lin' });
    const c = B.state.cam.yaw; await sleep(2000);
    const driven = Math.abs(B.state.cam.yaw - c);
    return { onLeft, offered, idle, driven };
  });
  ok('the view lives in the left rail', view.onLeft);
  ok('every view axis is offered to the rack', view.offered.length >= 5, view.offered.join(' '));
  ok('a rack row on auto spin turns the scene', view.idle < 0.01 && view.driven > 0.1,
     'idle ' + view.idle.toFixed(3) + ' → driven ' + view.driven.toFixed(3) + ' rad');

  /* ── ВЕКТОРНЫЕ ИСКАЖЕНИЯ · СПЯТ В ДВИЖКЕ (Роб снял панель 2026-07-20) ─────────
     Панели нет, математика есть. Гейт остаётся именно поэтому: он говорит, что
     способность цела и её можно вернуть, а не что оператор ею пользуется. Без
     этой оговорки зелёная строка «каждое поле гнёт картинку» читалась бы как
     «в интерфейсе работает искажение», чего сейчас нет.
     Перенос математики из Synthex. Гейт спрашивает три вещи, и каждая ловит свой
     способ соврать: поле обязано ГНУТЬ КАРТИНКУ (а не просто добавить карточку),
     стек обязан складываться (а не применять только первый слот), и — главное —
     искажение НЕ ДОЛЖНО трогать физику: оно гнёт то, что рисуется, а координаты
     тела остаются неискажёнными. Иначе поле кормит само себя через пружину. */
  const distR = await page.evaluate(async () => {
    const r = []; const put = (n, c, e) => r.push([n, !!c, e == null ? '' : String(e)]);
    const s = ms => new Promise(f => setTimeout(f, ms));
    const B2 = window.__bryk;
    B2.layers().slice().forEach(x => B2.removeLayer(x.id));
    const L = B2.addLayer('pat-burst'); L.matrix.length = 0;
    B2.bases().clear(); B2.state.cam.spin = 0; B2.state.motion.chaos = 0;
    await s(900);

    const lit0 = B2.silhouette();
    const dead = [];
    /* У `lens` (и только у него) `scale` — это РАДИУС действия, а не частота поля:
       за его пределом смещение равно нулю по построению. На 1.6 он честно не
       доставал до большинства тел, и гейт объявлял мёртвым живое поле. */
    for (const id of ['warp','turbulence','liquid','twirl','pinch','ripple','wave','lens','bend']) {
      const scale = id === 'lens' ? 3.4 : 1.6;
      L.distort = [{ id, on:1, amount:0.8, scale, speed:1, center:{x:0,y:0}, seed:11, angle:30 }];
      await s(600);
      if (Math.abs(B2.silhouette() - lit0) < 1500) dead.push(id);
    }
    put('каждое поле гнёт картинку, ни одного мёртвого', dead.length === 0,
        dead.length ? ('не двигают: ' + dead.join(', ')) : '9 полей');

    /* Физика неприкосновенна: тела стоят там же, искажена только отрисовка.
       Сцену для этого надо ОСТАНОВИТЬ — она дышит сама, и два снимка через
       секунду разойдутся без всякого искажения. Первая версия мерила именно это
       и обвиняла искажение в чужом движении. */
    L.distort = [];
    L.params.dance = 0; L.phys.follow = 14; L.phys.swirl = 0;
    L.phys.gravity = 0; L.phys.flock = 0; L.phys.collide = 0;
    await s(1600);
    const pos0 = L.bodies.slice(0, 120).map(b => [b.x, b.y]);
    L.distort = [{ id:'liquid', on:1, amount:0.9, scale:0.95, speed:0 }];
    await s(900);
    const pos1 = L.bodies.slice(0, 120).map(b => [b.x, b.y]);
    let drift = 0;
    for (let i = 0; i < Math.min(pos0.length, pos1.length); i++)
      drift = Math.max(drift, Math.abs(pos0[i][0]-pos1[i][0]) + Math.abs(pos0[i][1]-pos1[i][1]));
    put('искажение не трогает физику — гнётся отрисовка, не тела',
        drift < 0.05, 'худший снос тела ' + drift.toFixed(4));

    /* стек складывается, а не применяет только первый слот */
    L.distort = [{ id:'liquid', on:1, amount:0.5, scale:0.95, speed:1 }];
    await s(700); const one = B2.silhouette();
    L.distort = [{ id:'liquid', on:1, amount:0.5, scale:0.95, speed:1 },
                 { id:'twirl',  on:1, amount:0.4, scale:0.95, speed:1, center:{x:0,y:0} }];
    await s(700); const two = B2.silhouette();
    put('второй слот стека складывается с первым', Math.abs(two - one) > 1500,
        one + ' → ' + two);
    L.distort = [];
    return r;
  });
  for (const [n, p, e] of distR) ok(n, p, e);

  /* ── ЗАВИСИМАЯ РУЧКА БУДИТ ХОЗЯИНА (Роб, видео 1:06) ─────────────────────────
     «Вот это вот fold, fold, fold — непонятно, что оно даёт. Я не прошу переназвать,
     я прошу дать по-другому, чтобы было заметно и ощутимо.»
     `fold · count` и `fold · travel` модифицируют складку, а сама складка по
     умолчанию ноль — ручка молчала, пока где-то выше не поднимут другую. Гейт
     тычет в ЗАВИСИМУЮ ручку так, как это делает рука (через поле карточки), и
     требует, чтобы после этого изменилась КАРТИНКА, а не только число. */
  const needsR = await page.evaluate(async () => {
    const r = []; const put = (n, c, e) => r.push([n, !!c, e == null ? '' : String(e)]);
    const s = ms => new Promise(f => setTimeout(f, ms));
    const B2 = window.__bryk;
    B2.layers().slice().forEach(x => B2.removeLayer(x.id));
    const LL = B2.addLayer('pat-burst'); LL.matrix.length = 0; await s(600);
    const ps = B2.paramsOf(LL);
    const master = ps.find(p => p.key === 'wave');
    master.set(0); await s(400);
    const lit0 = B2.silhouette();
    let row = null;
    for (const q of document.querySelectorAll('#focusBody .row')) {
      const lb = q.querySelector('label');
      if (lb && /fold · count/i.test(lb.textContent)) { row = q; break; } }
    put('зависимая ручка вообще есть на карточке', !!row);
    if (row) {
      const sc = row.querySelector('.scrub'), ed = row.querySelector('.sedit');
      sc.focus(); sc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      ed.value = '4'; ed.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await s(700);
      put('...и, тронутая, будит то, что модифицирует', master.get() > 0.01,
          'fold · amount 0 → ' + master.get().toFixed(3));
      put('...так что двигается КАРТИНКА, а не только число',
          Math.abs(B2.silhouette() - lit0) > 2000,
          lit0 + ' → ' + B2.silhouette() + ' светящихся пикселей');
    }
    return r;
  });
  for (const [n, p, e] of needsR) ok(n, p, e);

  /* ── НАВЁЛСЯ — ВИДНО, ЧТО РУЧКА ДЕЛАЕТ (Роб, видео 8:05) ──────────────────────
     «Возможно ли, чтобы ты наводишь — и появляется вертикальная чёрточка, которая
     показывает motion, что именно эта штука делает.»
     Гейт держит обе половины утверждения, потому что порознь они ничего не стоят:
     ведомая ручка обязана ДЫШАТЬ под курсором, а спокойная — СТОЯТЬ. Риска,
     дрожащая у всех подряд, врёт ровно так же, как не появляющаяся ни у кого.
     Первая версия читала p.get() и стояла всегда: у ведомого параметра поле между
     кадрами держит базу, а не то, что видно на экране. */
  const hoverR = await page.evaluate(async () => {
    const r = []; const put = (n, c, e) => r.push([n, !!c, e == null ? '' : String(e)]);
    const s = ms => new Promise(f => setTimeout(f, ms));
    /* Условия ставим сами: к этому месту прогон успевает очистить матрицы, и «риска
       не дышит» означало бы «её нечему двигать», а не дефект. Свежий слой со своим
       посевом — то состояние, в котором оператор и наводится на ручку. */
    const B2 = window.__bryk;
    B2.layers().slice().forEach(x => B2.removeLayer(x.id));
    const LL = B2.addLayer('pat-burst'); await s(700);
    LL.matrix.length = 0;
    LL.matrix.push({ feat:'env.bassFast', path:'size', mode:'up', depth:0.5, curve:'lin' });
    await s(600);
    const pick = re => { for (const row of document.querySelectorAll('#focusBody .row')) {
        const lb = row.querySelector('label'); if (lb && re.test(lb.textContent)) return row; }
      return null; };
    const moves = async re => { const row = pick(re); if (!row) return null;
      const live = row.querySelector('.slive'); if (!live) return null;
      row.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
      await s(100); const pos = [];
      for (let i = 0; i < 18; i++) { pos.push(live.style.left); await s(70); }
      row.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }));
      return new Set(pos).size; };
    const driven = await moves(/size · one body/i);
    const still  = await moves(/spacing/i);
    put('наведение оживляет риску у ведомой ручки', driven !== null && driven > 3,
        driven + ' разных позиций');
    put('...и у спокойной она стоит, а не дрожит', still !== null && still <= 2,
        still + ' позиций');
    return r;
  });
  for (const [n, p, e] of hoverR) ok(n, p, e);

  /* ── 🔴 ТАБЛИЦА СТИЛЕЙ ПАРСИТСЯ ЦЕЛИКОМ ──────────────────────────────────────
     Удаляя правило, я срезал его до первого перевода строки — а оно занимало две.
     Осиротевший хвост с закрывающей скобкой обрушил разбор ВСЕГО, что ниже,
     включая `#corner`, и кнопка HIDE UI уехала в левый верхний угол. Ни одной
     ошибки в консоли: браузер молча пропускает битый CSS.
     Поэтому гейт спрашивает не «есть ли ошибки», а «доехал ли парсер до конца»:
     проверяет якорные правила из головы, середины и ХВОСТА таблицы. Если хвост
     снова отвалится, это будет видно здесь, а не на проекторе. */
  const cssR = await page.evaluate(() => {
    const r = []; const put = (n, c, e) => r.push([n, !!c, e == null ? '' : String(e)]);
    const rules = [...document.styleSheets[0].cssRules].map(x => x.cssText);
    const has = sel => rules.some(t => t.startsWith(sel));
    put('таблица стилей разобрана до конца — хвост на месте',
        has('#corner') && has('#uiBtn') && has('#foot'),
        rules.length + ' правил · corner:' + has('#corner') + ' uiBtn:' + has('#uiBtn'));
    /* и якоря из головы и середины, чтобы «до конца» значило именно это */
    put('...и голова с серединой тоже', has(':root') && has('.mpad') && has('.navItem'));
    return r;
  });
  for (const [n, p, e] of cssR) ok(n, p, e);

  /* ── КНОПКА HIDE UI (Роб, 2026-07-20) ────────────────────────────────────────
     «Мелкая, всегда статичная, привязанная к правому нижнему углу; в режиме hide
     UI еле видна, процентов на 10-15, при ховере полностью, и чтобы можно было
     классно вернуть обратно.» Гейт держит все четыре требования: угол, размер,
     прозрачность в скрытом режиме и возврат интерфейса кликом. */
  const uiR = await page.evaluate(async () => {
    const r = []; const put = (n, c, e) => r.push([n, !!c, e == null ? '' : String(e)]);
    const s = ms => new Promise(f => setTimeout(f, ms));
    const b = document.getElementById('uiBtn');
    put('кнопка есть', !!b); if (!b) return r;
    const box = () => b.getBoundingClientRect();
    const corner = () => { const q = box();
      return (innerWidth - q.right) < 30 && (innerHeight - q.bottom) < 30; };
    put('стоит в правом нижнем углу', corner());
    put('мелкая', box().height <= 30, Math.round(box().width) + '×' + Math.round(box().height));
    b.click(); await s(400);
    const op = +getComputedStyle(b).opacity;
    put('интерфейс спрятался', getComputedStyle(document.getElementById('panel')).display === 'none');
    put('в скрытом режиме еле видна (10-15%)', op >= 0.08 && op <= 0.2, 'opacity ' + op);
    put('...и НЕ уехала из угла', corner());
    b.click(); await s(400);
    put('клик вернул интерфейс',
        getComputedStyle(document.getElementById('panel')).display !== 'none' &&
        +getComputedStyle(b).opacity === 1);
    return r;
  });
  for (const [n, p, e] of uiR) ok(n, p, e);

  /* ── AUTO TILT · маятник, а не кувырок (Роб, 2026-07-20) ─────────────────────
     «Добавь ещё значение в space, как auto spin, так же auto tilt.»
     Поворот копится свободно — полный оборот у сцены естественен. Наклон живёт в
     ±1 и означает, с какой стороны мы на сцену смотрим: копи его так же, и сцена
     будет раз за разом уходить через макушку. Гейт держит оба требования сразу —
     наклон обязан ХОДИТЬ и обязан НЕ ВЫЛЕЗАТЬ за предел. */
  const swayR = await page.evaluate(async () => {
    const r = []; const put = (n, c, e) => r.push([n, !!c, e == null ? '' : String(e)]);
    const s = ms => new Promise(f => setTimeout(f, ms));
    const B2 = window.__bryk;
    const L = B2.layers()[0] || B2.addLayer('pat-burst'); await s(400);
    L.matrix.length = 0; B2.bases().clear();
    L.cam.spin = 0; L.cam.tilt = 0.9; L.cam.sway = 0.4; L.cam.swayDir = 1;
    const seen = [];
    for (let i = 0; i < 34; i++) { seen.push(L.cam.tilt); await s(90); }
    const lo = Math.min(...seen), hi = Math.max(...seen);
    put('auto tilt водит наклон', hi - lo > 0.15,
        lo.toFixed(2) + ' … ' + hi.toFixed(2));
    put('...и разворачивается у предела, а не кувыркается',
        lo >= -1.0001 && hi <= 1.0001, 'край ' + lo.toFixed(3) + '/' + hi.toFixed(3));
    put('...ход реально меняет знак', seen.some((v, i) =>
        i > 1 && (v - seen[i-1]) * (seen[i-1] - seen[i-2]) < 0));
    put('ряд Auto tilt есть в Space', !!document.querySelector('[data-mnt="sway"] .scrub'));
    L.cam.sway = 0; L.cam.tilt = 0;

    /* и диапазон наклона тел — там, где его найдут (Роб: «вывести более явно») */
    const labels = [...document.querySelectorAll('#focusBody .row label')].map(x => x.textContent);
    const idx = labels.findIndex(t => /tilt range/i.test(t));
    put('«tilt range» стоит среди ОСНОВНЫХ ручек, не в свёрнутом',
        idx >= 0 && idx < 6, idx < 0 ? 'не найден' : ('позиция ' + idx + ' из ' + labels.length));
    return r;
  });
  for (const [n, p, e] of swayR) ok(n, p, e);

  /* ── Motion Pad (A8.3 · Н3) ───────────────────────────────────────────────────
     Пад ломался ДВАЖДЫ и одинаково: кто-то ужимал его по высоте, бокс переставал
     быть квадратом, квадратный канвас растягивался — и точка-хендл превращалась
     в эллипс, а сетка и кривая уезжали. Оба раза ловил глаз Роба, не гейт, потому
     что гейта не было. Спрашиваем ГЕОМЕТРИЮ, а не CSS: `aspect-ratio:1` в стилях
     перебивается снаружи чем угодно, а вот прямоугольный бокс не соврёт. */
  const padR = await page.evaluate(async () => {
    const r = []; const put = (n, c, e) => r.push([n, !!c, e == null ? '' : String(e)]);
    const B = window.__bryk, s = ms => new Promise(f => setTimeout(f, ms));
    const el = document.getElementById('mpad'), cv = document.getElementById('mpadc');
    put('Motion Pad на панели есть', !!el && !!cv);
    if (!el || !cv) return r;

    const box = el.getBoundingClientRect();
    put('🔒 пад — КВАДРАТ (иначе хендл станет эллипсом)',
        Math.abs(box.width - box.height) < 0.5, box.width.toFixed(1) + '×' + box.height.toFixed(1));
    put('🔒 и буфер канваса тоже квадратный', cv.width === cv.height, cv.width + '×' + cv.height);
    put('пад берётся с клавиатуры', el.tabIndex >= 0 && !!el.getAttribute('aria-label'));

    /* 🔴 ОДНА КЛЕТКА НА ВЕСЬ БОКС (Роб: «квадратик внутри квадрата», 3:33).
       Систем координат было две (сетка по боксу, кривая по вкладышу), я свёл их —
       но на вкладыше в 17px, и край поля нарисовался вторым прямоугольником внутри
       первого, а хендл доезжал до угла ПОЛЯ, а не пада. Теперь клетка одна и идёт
       от края до края: угол пада = угол графика = угол, названный подписью.
       Гейт тычет РУКОЙ в четыре подписи и в центр. Промах здесь означает, что
       вкладыш вернулся — то есть вернулся квадрат в квадрате. */
    /* Пад надо СНАЧАЛА показать. Проверки выше жмут focus() на строках карточки, а
       focus прокручивает панель — и прямоугольник, прочитанный вслепую, указывает
       туда, где пада уже нет. Промах был не в координатах пада, а в том, что гейт
       мерил его вне экрана. */
    el.scrollIntoView({ block: 'center' }); await s(250);
    const r0 = el.getBoundingClientRect(), M = 1;
    const hit = (dx, dy) => { const ev = o => new PointerEvent(o, { clientX: r0.left + dx,
        clientY: r0.top + dy, bubbles: true, pointerId: 1 });
      el.dispatchEvent(ev('pointerdown')); el.dispatchEvent(ev('pointerup'));
      return { x: B.state.motion.x, y: B.state.motion.y }; };
    const corners = [['slow', M, r0.height - M, 0, 0], ['fast', r0.width - M, r0.height - M, 1, 0],
                     ['soft', M, M, 0, 1], ['raw', r0.width - M, M, 1, 1],
                     ['centre', r0.width / 2, r0.height / 2, 0.5, 0.5]];
    let worst = 0, worstName = '';
    for (const [nm, dx, dy, ex, ey] of corners) { const m = hit(dx, dy);
      const e = Math.max(Math.abs(m.x - ex), Math.abs(m.y - ey));
      if (e > worst) { worst = e; worstName = nm; } }
    put('тычок в подпись даёт ровно тот угол, который она называет',
        worst < 0.02, worst ? ('худший промах ' + worst.toFixed(3) + ' на ' + worstName) : 'точно');
    B.state.motion.x = 0.5; B.state.motion.y = 0.5; await s(150);

    /* Нейтраль. Центр пада во флоте даёт 1.15; отвалится нормировка — и сцена,
       которую Роб тюнил руками, поедет на 15% в первом же кадре. */
    put('центр пада = темп ×1.00, сцена не разгоняется сама',
        Math.abs(B.motionResolve(0.5, 0.5).speed / B.motionNeutral - 1) < 1e-9);
    put('кривая выходит из 0 и приходит в 1 при любом характере',
        [[0,0],[1,1],[0.3,0.7],[0.9,0.2]].every(([x,y]) => { const e = B.motionResolve(x,y).ease;
          return Math.abs(e(0)) < 1e-9 && Math.abs(e(1) - 1) < 1e-9; }));
    /* характер обязан РАЗЛИЧАТЬСЯ по Y, иначе пад одномерный и Y — украшение */
    const half = (x,y) => B.motionResolve(x,y).ease(0.5);
    put('Y действительно меняет характер, а не только подпись',
        Math.abs(half(0.1,0.9) - half(0.1,0.1)) > 0.02 || Math.abs(half(0.9,0.9) - half(0.9,0.1)) > 0.02,
        'soft ' + half(0.1,0.9).toFixed(3) + ' vs slow ' + half(0.1,0.1).toFixed(3));

    /* ЗНАЧЕНИЕ, а не индикатор: спрашиваем клок слоя. Пад, который красиво возит
       точку и не трогает сцену, прошёл бы любую проверку на «точка сдвинулась». */
    /* Свой слой, а не `layers()[0]`: клок заводится только для ВИДИМОГО слоя с
       ненулевой прозрачностью, а к этому месту прогон успевает намьютить и
       спрятать что угодно. Мерили `undefined − undefined` и получали NaN — гейт,
       который «не смог измерить», выглядел как гейт, который «измерил и всё плохо». */
    B.layers().slice().forEach(x => B.removeLayer(x.id));
    const L = B.addLayer('pat-burst'); L.opacity = 1; L.muted = false;
    await s(400);
    if (L) {
      const rate = async (x, y) => { B.state.motion.x = x; B.state.motion.y = y; await s(200);
        const t0 = performance.now(), c0 = L.clock.dance; await s(700);
        return (L.clock.dance - c0) / ((performance.now() - t0) / 1000); };
      const mid = await rate(0.5, 0.5), fast = await rate(0.95, 0.05), slow = await rate(0.05, 0.05);
      B.state.motion.x = 0.5; B.state.motion.y = 0.5; await s(200);
      put('X пада реально гонит клок слоя, а не только точку',
          fast > mid * 1.2 && slow < mid * 0.85,
          'slow ×' + (slow/mid).toFixed(2) + ' · mid ×1 · fast ×' + (fast/mid).toFixed(2));
    }

    /* ── ОДИН инструмент (A12) ──────────────────────────────────────────────────
       Здесь стоял гейт на связку макро×пад: energy везёт X, chaos везёт Y. Связка
       снята вместе с макро, и правильно — она была концептуально дефектна в трёх
       местах сразу (Y не независимая ось, хаос отнимал темп у energy, а «раскрутить
       хаос» уводило приходы слоёв в linear, то есть в самую МЕХАНИЧНУЮ кривую набора).
       Проверяем то, что осталось: инструмент один, и его ручки ортогональны. */
    const before = { x: B.state.motion.x, y: B.state.motion.y };
    B.state.motion.chaos = 0.8; await s(300);
    put('хаос не трогает оси пада — он третья ручка, а не связка',
        Math.abs(B.state.motion.x - before.x) < 1e-9 &&
        Math.abs(B.state.motion.y - before.y) < 1e-9);
    /* и наоборот: темп не должен незаметно менять сцепление тел с целью */
    const chaosNow = B.state.motion.chaos;
    B.state.motion.x = 0.95; await s(300);
    put('и темп не трогает хаос', Math.abs(B.state.motion.chaos - chaosNow) < 1e-9);
    B.state.motion.chaos = 0; B.state.motion.x = 0.5; B.state.motion.y = 0.5; await s(200);
    put('макро-аппарат снят целиком, ничего не осталось висеть',
        typeof B.applyMacro === 'undefined' && !B.state.macro &&
        !document.getElementById('gMacro'));

    /* Двусторонняя связь — канон пада: ползунок, который ведёт точку в одну сторону
       и не идёт за ней обратно, разъезжается с падом на первом же перетаскивании. */
    const sc = B.scrubs.mSpeed;
    put('Speed-ряд смонтирован', !!sc);
    if (sc) {
      B.state.motion.x = 0.9; B.state.motion.y = 0.1; await s(300);
      const shown = sc.get(), real = B.motionSpeed();
      put('тянешь пад — число идёт следом', Math.abs(shown - real) < 0.03,
          'на ряду ' + shown + ', в движке ' + real.toFixed(2));
      B.state.motion.x = 0.5; B.state.motion.y = 0.5; await s(200);
    }
    return r;
  });
  for (const [n, p, e] of padR) ok(n, p, e);

  /* the engine section runs for minutes after the boot snapshot; an exception thrown in
     it used to be printed by nobody and counted by nobody */
  ok('console clean through the whole run', errors.length === bootErrs,
     errors.slice(bootErrs, bootErrs + 3).join(' | '));
  await browser.close();
  const bad = R.filter(x => !x.pass);
  for (const x of R) console.log('  ' + (x.pass ? 'ok  ' : 'FAIL') + '  ' + x.n.padEnd(50) + x.extra);
  console.log(bad.length ? '\nAPP FAIL — ' + bad.length + '/' + R.length : '\nAPP OK — ' + R.length + '/' + R.length);
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error('probe crashed:', e.message); process.exit(1); });
