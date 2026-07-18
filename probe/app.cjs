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
  ok('console clean', errors.length === 0, errors.slice(0, 3).join(' | '));

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

    put('pool matches count', B.pool().length === Math.round(B.state.count), B.pool().length);
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
    const patIds = Object.keys(bank).filter(k => bank[k].group === 'particles');
    put('every pattern in the bank has its own preset', patIds.length === B.patterns().length,
        patIds.length + '/' + B.patterns().length + ' patterns on the shelf');
    put('a formation preset is present', !!bank.word);
    put('boot does not arm', B.armed() === false);

    const cv = document.getElementById('cv'), g = cv.getContext('2d');
    const px = g.getImageData(0, 0, cv.width, cv.height).data;
    let lit = 0; for (let i = 3; i < px.length; i += 4) if (px[i] > 8) lit++;
    put('stage is painting', lit > 5000, lit + ' lit px');

    // matrix drives, and the base survives (mutate-and-restore)
    const seen = new Set();
    for (let i = 0; i < 30; i++) {
      const l = B.scrubs.size.el.querySelector('.slive');
      if (l && l.style.display !== 'none') seen.add(l.style.left);
      await new Promise(res => requestAnimationFrame(res));
    }
    put('matrix drives the size riser', seen.size > 3, seen.size + ' positions');
    /* Read the base from the scrub, not a hardcoded constant — the default is a tuning
       value and will move. What must hold is that the panel's value and the state agree
       between frames, i.e. the drive restored what it borrowed. */
    put('base survives the drive (state == panel between frames)',
        Math.abs(B.state.size - B.scrubs.size.get()) < 0.001,
        'state ' + B.state.size + ' / scrub ' + B.scrubs.size.get());

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
    solo('word'); await sleep(2600);
    const pts = B.formation(), pool = B.pool(), NB = pool.length;
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
    const bs = document.getElementById('behSel');
    const pick = async (el, v) => { el.value = v; el.dispatchEvent(new Event('change')); await sleep(500);
      return { ...B.state.phys }; };
    const fall = await pick(bs, 'fall'), orbit = await pick(bs, 'orbit'), pack = await pick(bs, 'pack');
    put('fall is the only behaviour that falls',
        fall.gravity > 0 && orbit.gravity === 0 && pack.gravity === 0,
        'fall ' + fall.gravity + ' / orbit ' + orbit.gravity + ' / pack ' + pack.gravity);
    put('gravity dominates fall, swirl dominates orbit',
        fall.gravity > fall.swirl && orbit.swirl > orbit.gravity && orbit.swirl > fall.swirl,
        'fall g' + fall.gravity + ' s' + fall.swirl + ' | orbit g' + orbit.gravity + ' s' + orbit.swirl);
    const ms2 = document.getElementById('mannerSel');
    const disp = await pick(ms2, 'Disperse'), clus = await pick(ms2, 'Cluster'), flow = await pick(ms2, 'Flow');
    put('Disperse separates hardest and refuses to cohere',
        disp.collide > clus.collide && disp.collide > flow.collide && disp.flock === 0,
        'collide ' + disp.collide + ' vs ' + clus.collide + '/' + flow.collide);
    put('Cluster coheres, Flow flows',
        clus.flock > disp.flock && flow.swirl > clus.swirl,
        'cluster flock ' + clus.flock + ' | flow swirl ' + flow.swirl);
    put('panel follows a behaviour change',
        Math.abs(B.scrubs.collide.get() - B.state.phys.collide) < 0.001);

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

    // ── scenes round-trip, and a loaded scene is NOT reverted by the drive ───
    B.state.size = 77; B.state.shapes.tri = 2.5; setW('radial', 0.66);
    const snap = B.scene.capture();
    B.state.size = 12; B.state.shapes.tri = 0; setW('radial', 0);
    B.scene.apply(snap); await sleep(600);
    /* The name says "weights", so verify the weight — applyScene rebuilds the stack, so
       the layer must be re-found by program, never held across the apply. */
    const tun = layerOf('radial');
    put('scene restores scalars, weights and panel', B.state.size === 77 &&
        B.state.shapes.tri === 2.5 && Math.abs(B.scrubs.size.get() - 77) < 0.001 &&
        !!tun && Math.abs(tun.w - 0.66) < 0.001,
        'radial w ' + (tun ? tun.w : 'no layer'));
    B.scene.apply({ v: 0, size: 40 }); await sleep(700);
    put('a loaded scene survives the next drive frame', B.state.size === 40, 'size ' + B.state.size);
    put('an old scene gets defaults, not undefined',
        Number.isFinite(B.state.phys.follow) && B.state.stops.length >= 2);

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
    B.onlyProg('radial'); B.setFace(0.8);
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
  ok('quad count stops growing with body count',
     budget[2].peak <= budget[0].peak + 2,
     budget.map(r => r.n + ':' + r.peak).join(' → '));

  await browser.close();
  const bad = R.filter(x => !x.pass);
  for (const x of R) console.log('  ' + (x.pass ? 'ok  ' : 'FAIL') + '  ' + x.n.padEnd(50) + x.extra);
  console.log(bad.length ? '\nAPP FAIL — ' + bad.length + '/' + R.length : '\nAPP OK — ' + R.length + '/' + R.length);
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error('probe crashed:', e.message); process.exit(1); });
