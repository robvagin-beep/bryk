const path=require('path');
const {chromium}=require(path.join('/Users/robertvagin/Claude/Projects/synthex-engine','node_modules','playwright'));
(async()=>{
  const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1440,height:900}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8931/index.html?fix=1',{waitUntil:'load'});
  await p.waitForFunction(()=>!!window.__bryk,null,{timeout:8000});
  await p.waitForTimeout(2500);
  const r=await p.evaluate(async()=>{
    const s=ms=>new Promise(r=>setTimeout(r,ms)); const B=window.__bryk; const out=[];
    const put=(n,c,e)=>out.push([n,!!c,e==null?'':String(e)]);
    const bank=B.programs(), ids=Object.keys(bank);

    put('the shelf carries the ported banks, not nine near-copies', ids.length>=30, ids.length+' presets');
    /* The old pattern accepted `z:0`. Pattern-matching was the wrong contract anyway: what
       must hold is that a preset cites one of OUR files, because the whole point of the
       field is to make «I wrote something similar» impossible to pass off as a port. */
    const SOURCES = ['image-shuffler', 'particle-dance', 'Motion Primer', 'mvj-inject',
                     'Synthex Engine', 'bryk'];
    const badSrc = ids.filter(k => {
      const src = (bank[k].source || '').trim();
      return !SOURCES.some(f => src.includes(f)) || !/:[0-9A-Za-z]/.test(src);
    });
    put('every preset cites one of our own files', badSrc.length === 0,
        badSrc.length ? badSrc.map(k => k + '=' + bank[k].source).join(' | ')
                      : ids.length + ' presets, all sourced');
    put('every preset declares which keys it shows',
        ids.every(k=>Array.isArray(bank[k].keys)&&bank[k].keys.length));

    /* ── no dead sliders, on ANY preset ──────────────────────────────────────────
       This used to name waterfall and list four keys it must not show. Both halves aged
       out: waterfall was folded into the axis engine on 2026-07-19, so it now READS angle,
       bend, bend freq and tilt — the four the standalone ignored — and the gate went red
       on the build where the defect was cured.
       The defect was never «waterfall lists angle». It was «a card shows a slider the
       engine does not read», and that can grow back on any of the thirty-odd presets, from
       either side: a key added to the list, or a key dropped from the target. So ask the
       general question instead — move each declared key and require the preset's own
       output to move. Two sample times, because `speed` and `stagger` are phase, not
       position, and are motionless in a single frozen frame. */
    /* Two kinds of key are invisible to a frozen target sample and neither is a defect:
       · TRANSPORT — since 2026-07-19 phase ACCUMULATES on `L.clock` (`+= dt·rate`) instead
         of being read as `t·rate`, which is what stopped the flies (A5.2). The rate
         therefore never appears inside target(i,N,t,…); it appears in how fast t arrives.
         Sampling two fixed times cannot see it, so it gets its own live check below.
       · DEPENDENT — a modifier of a term its preset seeds at zero. `bendFreq` is the
         frequency of a bend the flow seed does not bend; it is live the moment bend is,
         and the gate proves that by turning bend on rather than by excusing the key. */
    const TRANSPORT = new Set(['speed', 'sceneSpeed']);
    const DEPENDS = { bendFreq: { bend: 0.6 } };
    const DEAD_OK = {
      /* honest no-ops, each with its reason. Anything not listed here must move. */
      'waterfall.angle': 'the fall is vertical by construction; the key is seeded at 90 and kept so the family shares one param list',
      /* not a no-op — it moves the wrong quantity for this instrument. `fit` retunes body
         CALIBRE to the mask cell spacing so letters read; positions are untouched by
         design, and 0 means «leave my size alone». Covered live below. */
      'word.fit': 'changes body size, not target position', 'mark.fit': 'changes body size, not target position'
    };
    const dead = [];
    for (const id of ids) {
      const P = bank[id], keys = P.keys || [];
      const ctx = { variant:0, seed:7, vx:2.84, vy:1.78, rnd:k=>((k*0.618)%1) };
      /* A behaviour has no target to sample — its keys are read by `step`, which is the
         whole point of the six of them being forces rather than layouts (A2.1). Asking
         them the layout question returned «nothing moved» for every force they own, which
         is the gate describing its own blind spot and calling it a defect. Integrate them
         instead: same synthetic crowd, same number of steps, two values of the key. */
      const sample = P.group === 'behaviour'
        ? raw => {
            /* SEED with the preset's own init before integrating. Four of these keys —
               pack spread, orbit spread, magnet float time — are read when a body is
               placed, not while it moves, so a sweep that only stepped reported them
               dead. A behaviour is its seeding AND its integration; the gate that judges
               it has to run both (that pair is what the six-distinct-init check exists to
               protect in the first place). */
            const N = 24, bs = [], pr = B.behaviourParams({ params: raw });
            const rr = (x => () => (x = (x*1664525+1013904223)>>>0) / 4294967296)(7);
            for (let i=0;i<N;i++){ const b={mx:0,my:0,mvx:0,mvy:0,x:0,y:0,z:0};
              B.seedBody(b, i, N, rr, P, raw); bs.push(b); }
            const c = { flock: bs, com: { x: 300, y: 180 } };
            for (let n=0;n<40;n++) for (const b of bs) P.step(b, 1/60, n/60, pr, c);
            return bs.map(b => b.mx.toFixed(3)+','+b.my.toFixed(3)).join(' ');
          }
        /* Two crowd SIZES, both prime, and two unrelated times. Twelve bodies was an
           aliasing trap and it caught this gate twice: the spiral winds at
           `u·TAU·(2+twist·4)`, so at u = k/12 a twist of 1 and a twist of −2 both land
           every sample on a multiple of π where the sign flip is invisible; and `lanes`
           enters as `sin(u·TAU·lanes)`, so 7 and 20 are the same curve sampled at k/13
           because 20 ≡ 7 (mod 13). Both times a live control was reported dead. One prime
           only moves the collision; two coprime crowd sizes have no shared harmonic to
           fall into. */
        : pr => { let s=''; for (const [t,n] of [[0.7,13],[2.3,17]])
            for (let i=0;i<13;i++){ const q=P.target(i,n,t,pr,ctx);
              s += [q.x,q.y,q.z,q.scale,q.alpha,q.skip?1:0].map(v=>(+v||0).toFixed(4)).join(','); }
            return s; };
      const decl = Object.fromEntries((P.params||[]).map(d=>[d.key,d]));
      for (const k of keys) {
        const d = decl[k]; if (!d) { dead.push(id+'.'+k+' (declared in keys, absent from params)'); continue; }
        if (TRANSPORT.has(k)) continue;
        const base = { ...P.seed }; for (const q in decl) if (base[q]==null) base[q]=decl[q].def;
        Object.assign(base, DEPENDS[k] || {});
        const a = sample(base);
        /* move it somewhere legal and clearly different, from whichever end has room */
        const cur = base[k]==null ? d.def : base[k];
        const to = (cur - d.min) > (d.max - cur) ? d.min + (cur-d.min)*0.25 : cur + (d.max-cur)*0.75;
        const b = sample({ ...base, [k]: to });
        if (a === b && !DEAD_OK[id+'.'+k]) dead.push(id+'.'+k+' ('+cur+'→'+(+to.toFixed(3))+')');
      }
    }
    put('every key a card shows actually moves the picture', dead.length===0,
        dead.slice(0,6).join(' | ') || ids.length+' presets swept');

    /* ── THE SHARED BLOCK — the half the sweep above cannot see ──────────────────
       `keys` is only the preset's own params. A card is built from `paramsOf`, which is
       `w` + `count` + the whole LOOK block + the PHYS block + the globals — about forty
       controls that appear on EVERY card and were swept on none. That omission is not
       academic: all three dead-slider defects this file documents (`size`, `count`, `face`
       global twins, «the drive reached nothing») happened in exactly that block, and a
       fourth could be introduced today and every gate would stay green.
       It cannot be asked the same way — these are not pure functions of a target, they
       reach the renderer through look, physics and the camera. So ask the renderer: move
       the value and require the PICTURE to change. Anything that fails here is either a
       control wired to nothing or one whose effect is invisible, and both are worth a look. */
    const shared = B.paramsOf(B.layers()[0]).filter(p => !((bank[B.layers()[0].prog].keys)||[]).includes(p.key));
    const numb = [];
    {
      const L = B.onlyProg('pat-cloud'); L.matrix.length = 0; L.opacity = 1;
      Object.assign(L.phys, { swirl:0, flock:0, attract:0, gravity:0, collide:0.4, follow:6, vary:0 });
      Object.assign(L.look, { size:44, varSize:0.5, scale:1, spacing:1, links:0.3, streak:0.5,
                              radius:10, tint:0.5, wave:0.1, angles:0 });
      B.setCount(260); B.state.cam.spin = 0; await s(1500);
      /* what the eye gets, plus where the bodies are: a look change moves pixels, a force
         change moves bodies, and either counts as «it does something» */
      const feel = () => B.silhouette() + '|' +
        B.bodiesOf(L).slice(0, 60).map(b => b.x.toFixed(2) + ',' + b.y.toFixed(2)).join(' ');
      for (const p of shared) {
        if (p.key === 'count') continue;          /* re-deals the crowd; covered by its own gate */
        const was = p.get();
        const to = (was - p.min) > (p.max - was) ? p.min + (was - p.min) * 0.2
                                                 : was + (p.max - was) * 0.8;
        await s(120); const before = feel();
        p.set(to); await s(260); const after = feel();
        p.set(was); await s(60);
        if (before === after) numb.push(p.key + ' (' + (+was.toFixed(3)) + '→' + (+to.toFixed(3)) + ')');
      }
    }
    put('every shared control moves the picture too', numb.length === 0,
        numb.slice(0, 8).join(' | ') || (shared.length - 1) + ' shared controls swept');

    /* the transport half, asked of the running app: the rate must move the picture over
       TIME, and 0 must actually mean still. Both directions matter — a rate that cannot
       stop is the same defect as one that cannot go. */
    const T = B.onlyProg('flow'); await s(400);
    /* How far the crowd travelled, not whether it is byte-identical. `follow` is a spring
       and a spring settles asymptotically: at damping 0.93 the bodies are still creeping
       thousandths of a world unit toward their targets two seconds in, so «unchanged»
       is a test no live field can ever pass. What the transport claims is a RATIO — at
       rate 0 the picture must be near-still next to the same picture at rate 1.2. */
    const travel = prev => { let d = 0, now = [];
      for (const b of T.bodies.slice(0, 40)) now.push(b.x, b.y);
      if (prev) for (let i = 0; i < now.length; i++) d += Math.abs(now[i] - prev[i]);
      return { d, now }; };
    /* Silence the forces first. The standby carries swirl and flock, and a body drifting
       on lava at transport 0 is the field doing exactly what it was told — the first
       version of this check read that as «rate 0 does not stop» and would have sent
       someone hunting a bug in the clock. Hold the bodies on their targets and the only
       thing left that can move them is the transport. */
    Object.assign(T.phys, { swirl:0, flock:0, attract:0, gravity:0, collide:0, follow:14, vary:0 });
    /* And clear the rack. The boot scene is Rob's standby, which carries seven mapping
       rows; a driven parameter is restored to its base at the foot of every frame, so a
       probe that writes the parameter by hand is overwritten before the next frame paints
       and reads it back as «the rate did nothing». Same trap that made the camera look
       deleted (app.cjs, the view check). */
    T.matrix.length = 0;
    Object.assign(T.phys, { swirl:0, flock:0, attract:0, gravity:0, collide:0, follow:14, vary:0 });
    /* every rate the preset owns, not only the one called `speed`: `spin` turns the whole
       layout and is transport under another name */
    T.params.sceneSpeed = 0; T.params.speed = 0; if (T.params.spin != null) T.params.spin = 0;
    /* the field is still coasting toward its target when the rate is cut; let it arrive */
    await s(1600); const p0 = travel(null).now; await s(700); const stillD = travel(p0).d;
    T.params.speed = 1.2;
    await s(300); const p1 = travel(null).now; await s(700); const runD = travel(p1).d;
    put('transport at zero holds still, and above zero it travels',
        runD > stillD * 20 && runD > 1,
        'travel at 0 → ' + stillD.toFixed(3) + ' · at 1.2 → ' + runD.toFixed(3) +
        ' (×' + (stillD > 1e-9 ? (runD / stillD).toFixed(0) : '∞') + ')');

    /* the one key excused above, asked the question it actually answers */
    const Wl = B.onlyProg('word'); await s(500);
    const calibre = () => B.contactRadius(Wl);
    Wl.params.fit = 1; await s(400); const fitOn = calibre();
    Wl.params.fit = 0; await s(400); const fitOff = calibre();
    put('fit retunes the calibre it claims to', Math.abs(fitOn-fitOff) > 1e-6,
        'fit 1 → ' + fitOn.toFixed(3) + ' · fit 0 → ' + fitOff.toFixed(3));

    // seeds actually land
    const Z=B.addLayer('zigzag'); await s(200);
    put('a preset seeds its own start values', Z.params.bend===0.6 && Z.params.bendFreq===3,
        'bend '+Z.params.bend+' freq '+Z.params.bendFreq);

    // every layout produces finite bounded points
    /* Judge the PRESET, not the leftovers: solo it, let the pool actually settle, and
       measure the target the preset asks for rather than where bodies happen to be while
       still travelling there. */
    B.setCount(120);
    const bad=[];
    for(const id of ids){
      const L=B.onlyProg(id); await s(60);
      const N=B.pool().length, ctx={variant:L.variant,seed:L.seed,vx:2.84,vy:1.78,rnd:k=>((k*0.618)%1)};
      /* Each bank carries its own bound and it is not the same number.
         · particles: particle-dance's own assertCore contract is |p| <= 5
         · axis / layouts: they RECYCLE through the frame, so a body legitimately sits
           outside it mid-cycle; 12 is the frame plus a full recycle margin
         · a body the preset marks `skip` is not drawn, so its coordinate is meaningless —
           carousel parks its far cards at |x| 45 and skips them, by design (shuffler:311) */
      /* |p| <= 5 is particle-dance's contract on its OWN output, before BRYK scales the
         bank onto the live viewport (ctx.vx/1.5 * spread). Applying it to the scaled world
         position measured the wrong quantity: raising the default spread so presets reach
         the edges — which is what Rob asked for — pushed legal points past a limit that
         was never about world units. Both banks are judged in world units here, and the
         raw contract belongs in a unit test on patternPoint, not in a viewport probe. */
      const lim = 12;
      let mx=0, fin=true, drawn=0;
      for(let i=0;i<N;i++){
        const q=bank[id].target(i,N,1.7,L.params,ctx);
        if(![q.x,q.y,q.z].every(Number.isFinite)){ fin=false; break; }
        if(q.skip) continue;
        drawn++;
        mx=Math.max(mx,Math.abs(q.x),Math.abs(q.y),Math.abs(q.z));
      }
      if(!fin||mx>lim||drawn===0)
        bad.push(id+(fin?(drawn?(' |p|='+mx.toFixed(1)+'>'+lim):' draws nothing'):' NaN'));
    }
    put('every preset yields finite bounded points', bad.length===0, bad.join(' | ')||ids.length+' checked');

    // animation is reachable from the rack
    const anyL=B.layers()[0];
    const keys=B.paramsOf(anyL).map(x=>x.key);
    put('physics is addressable from the rack',
        ['phys.follow','phys.collide','phys.swirl','phys.gravity','cam.spin','count']
          .every(k=>keys.includes(k)),
        keys.filter(k=>k.startsWith('phys.')).length+' phys targets');

    /* ── which column holds what ──────────────────────────────────────────────
       This pair used to demand `gPhys` and `gSpace` on the RIGHT. Rob overturned both
       decisions on 2026-07-19 and the gate was never told: the forces stopped being a
       fieldset at all (they are rows inside the focused layer's card — a force is a rule
       for THIS layer's bodies, so it belongs with them), and the view came back to the
       left because he could not find it under two sections about signal coming in
       («ты удалил панель ракурсов камеры»). A gate that outlives the decision it encoded
       measures nothing but its own age.
       What survives the redesign, and is what actually mattered: the left column is where
       the picture is built, the right is where the music drives it, and NO parameter is
       offered by hand in both places at once — two controls over one quantity is the
       Count contradiction that killed a whole afternoon (A4.3). */
    const leftIds=[...document.querySelectorAll('#panel fieldset')].map(f=>f.id);
    const rightIds=[...document.querySelectorAll('#rightcol fieldset')].map(f=>f.id);
    put('the picture is built on the left', leftIds.includes('gLayers')&&leftIds.includes('gFocus')&&
        leftIds.includes('gSpace'), leftIds.join(','));
    put('the music drives from the right', rightIds.includes('gAudio')&&rightIds.includes('gRack')&&
        rightIds.includes('gScenes')&&!rightIds.includes('gSpace'), rightIds.join(','));
    const slots=[...document.querySelectorAll('#panel [data-mnt],#rightcol [data-mnt]')]
      .map(n=>n.getAttribute('data-mnt'));
    const dupes=slots.filter((k,i)=>slots.indexOf(k)!==i);
    put('no quantity is offered by hand in two places', dupes.length===0, dupes.join(',')||slots.length+' slots, all unique');
    /* ── Motion Primer behaviours are presets, not slider positions ─────────── */
    const beh = ids.filter(k => bank[k].group === 'behaviour');
    put('the six Motion Primer behaviours are on the shelf', beh.length === 6, beh.join(','));
    /* `typeof === 'function'` passes six references to ONE function, which is precisely
       the shape of the defect this gate exists to catch (a table of numbers pretending to
       be six behaviours). Identity, not existence. */
    const inits = new Set(beh.map(k => bank[k].init)), steps = new Set(beh.map(k => bank[k].step));
    put('each behaviour brings its OWN seeding and its OWN integration',
        inits.size === beh.length && steps.size === beh.length &&
        beh.every(k => typeof bank[k].init === 'function' && typeof bank[k].step === 'function'),
        inits.size + ' distinct init, ' + steps.size + ' distinct step, of ' + beh.length);
    put('each behaviour shows only its own controls',
        bank.pack.keys.length < bank.swarm.keys.length &&
        bank.scatter.keys.length < bank.magnet.keys.length,
        'pack ' + bank.pack.keys.length + ' · swarm ' + bank.swarm.keys.length +
        ' · scatter ' + bank.scatter.keys.length + ' · magnet ' + bank.magnet.keys.length);

    /* the seeding must actually put bodies somewhere different per behaviour — that is the
       half of the character the invented number table could not carry */
    const spread = {};
    for (const id of ['fall', 'orbit', 'pack', 'scatter']) {
      /* the layer's OWN bodies. B.pool() is the union across the stack now, so measuring
         it here compared every behaviour against the same mixture and made all four look
         identical — the probe would have reported «one preset in six coats» about a build
         where they differ. */
      const L = B.onlyProg(id); await s(700);
      const pl = L.bodies, ys = pl.map(b => b.y), xs = pl.map(b => b.x);
      spread[id] = { h: +(Math.max(...ys) - Math.min(...ys)).toFixed(2),
                     w: +(Math.max(...xs) - Math.min(...xs)).toFixed(2) };
    }
    /* not `new Set` over two-decimal strings: 1.61 and 1.62 counted as different layouts.
       Require a real separation between every pair. */
    const vals = Object.entries(spread);
    let minGap = Infinity;
    for (let a = 0; a < vals.length; a++) for (let b2 = a + 1; b2 < vals.length; b2++)
      minGap = Math.min(minGap, Math.hypot(vals[a][1].w - vals[b2][1].w, vals[a][1].h - vals[b2][1].h));
    put('the six seed differently, they are not one preset in six coats', minGap > 0.25,
        'closest pair differs by ' + minGap.toFixed(2) + '  ·  ' +
        vals.map(([k, v]) => k + ' ' + v.w + '×' + v.h).join('  '));

    /* MANNER_PRESET orderings, the two that were inverted */
    /* the table the HAND turns, not the ported reference set. The gate used to read
       MANNER_PRESET and go green while the UI applied a different, inverted table. */
    const M = B.mannerForces(), SRC = B.mannerPresets();
    put('the applied manner table keeps the source orderings',
        M.Free.flock > M.Flock.flock && M.Flow.swirl > M.Vortex.swirl &&
        M.Disperse.collide > M.Flock.collide && M.Cluster.flock > M.Free.flock,
        'flock Free ' + M.Free.flock + ' > Flock ' + M.Flock.flock +
        ' · swirl Flow ' + M.Flow.swirl + ' > Vortex ' + M.Vortex.swirl);
    put('and it is derived from the source, not typed alongside it',
        Object.keys(M).length === Object.keys(SRC).length &&
        Object.keys(SRC).every(k => M[k]), Object.keys(M).join(','));

    /* ── a new layer is born SOUNDING, on every preset ──────────────────────────
       `seedRows` puts a beat on the preset's own drive target. That target is named in
       `params`, but a card only shows `keys`, and once the pattern keys became derived the
       two stopped agreeing: five of the seventeen were born with a row driving a key their
       formula does not read — silent, and invisible in the picker, so unfixable in place.
       Ask it of every preset on the shelf, because the next divergence will not be in the
       same five. */
    const mute = [];
    for (const id of ids) {
      const L = B.addLayer(id);
      const shown = new Set(B.paramsOf(L).map(x => x.key));
      for (const row of L.matrix) if (!shown.has(row.path)) mute.push(id + ' → ' + row.path);
      B.removeLayer(L.id, true);
    }
    await s(200);
    put('every seeded row drives something the card can reach', mute.length === 0,
        mute.slice(0, 6).join(' | ') || ids.length + ' presets born sounding');

    /* ── the mapping picker is CURATED, not a dump of everything addressable ────
       Rob: «вариации бессмысленные». Two halves to hold: what is offered must be worth
       hearing, and what the engine can reach must not silently shrink to what the menu
       shows — the rack, scenes and macros all address parameters the picker never lists
       (that is the difference between a vocabulary and a menu). */
    const Lm = B.onlyProg('pat-cloud'); await s(300);
    const opts = B.mapOptions(Lm).filter(([k]) => !k.startsWith('--')).map(([k]) => k);
    const all = B.paramsOf(Lm);
    const barred = all.filter(p => p.mod === 'no').map(p => p.key);
    put('nothing barred as a bad target is offered as one',
        barred.every(k => !opts.includes(k)), barred.join(',') || 'none barred');
    /* the four the audit named by hand, each for a different reason: a register, an
       integer stamp count, a toggle, and a rebuild of the texture bank */
    put('the four the audit named are gone from the picker',
        ['angles','smear','stroke','tint'].every(k => !opts.includes(k)),
        ['angles','smear','stroke','tint'].filter(k => opts.includes(k)).join(',') || 'all four gone');
    put('the core targets are all still reachable',
        ['w','size','scale','spacing','phys.swirl','phys.attract','links','streak',
         'cam.persp','cam.zoom','satDrift','echo.amount','echo.hue'].every(k => opts.includes(k)),
        ['w','size','scale','spacing','phys.swirl','phys.attract','links','streak',
         'cam.persp','cam.zoom','satDrift','echo.amount','echo.hue'].filter(k => !opts.includes(k)).join(',') || 'all present');
    put('a barred parameter is still driveable by a scene or a macro',
        barred.every(k => all.some(p => p.key === k)),
        'the vocabulary is ' + all.length + ' wide, the menu offers ' + opts.length);
    /* one owner per concept: the twins are what made a drive reach nothing */
    const vocab = all.map(p => p.key), twins = vocab.filter((k,i) => vocab.indexOf(k) !== i);
    put('no parameter is declared twice', twins.length === 0, twins.join(',') || vocab.length + ' unique');
    /* a rebuild target must arrive gated, not following an envelope */
    const gated = all.filter(p => p.mod === 'gate').map(p => p.key);
    put('rebuild targets are marked so the row can gate them', gated.includes('count'), gated.join(','));

    /* ── the polyhedron bank: eight shapes, eight silhouettes ─────────────── */
    const F = B.onlyProg('pat-form'); B.setCount(240);
    /* Silence the forces before measuring a SHAPE. The standby carries swirl and flock, so
       the span of a form depended on where the lava happened to be pushing when the clock
       ran out: the same eight polyhedra measured 0.46 apart on one run and 0.10 on the
       next, and the gate flickered red on a build nobody had touched. A flaky gate is
       worse than no gate — it teaches you to re-run instead of to look. */
    F.matrix.length = 0;
    await s(300);
    /* Measure the FORM, not the flight toward it. Three fixes in a row treated the
       flicker as noise to be suppressed — silence the forces, then silence the dance —
       and it kept coming back (0.46 · 0.33 · 0.14 · 0.02 on a build nobody touched),
       because the quantity was wrong, not the conditions. `follow` is a spring, so a body
       is somewhere between the shape it left and the shape it was asked for, and where it
       has got to depends on which shape came before and how long the clock happened to
       run. There is nothing to wait for that makes that deterministic.
       The claim — eight polyhedra, eight silhouettes — is about where the preset SENDS
       the bodies. That is `target`, it is exact, and it needs no settling at all. */
    /* PIN THE SEED. Every layer is born with a random one, so the cloud sampled onto the
       polyhedron differed on every run and so did any number measured from it. That was
       the rest of the flicker, and no amount of settling would have removed it. */
    F.seed = 20260719; B.setCount(240); await s(500);
    const sigs = [];
    const N = F.bodies.length, ctxF = { variant:0, seed:F.seed, vx:2.84, vy:1.78,
                                        rnd:k=>((k*0.618)%1), clock:{ dance:0 } };
    for (let k = 0; k < 8; k++) {
      const pr = { ...F.params, formShape:k, dance:0, sceneSpeed:0 };
      const xs=[], ys=[], zs=[], rs=[];
      for (let i = 0; i < N; i++) { const q = bank['pat-form'].target(i, N, 0, pr, ctxF);
        if (![q.x,q.y,q.z].every(Number.isFinite)) { xs.length = 0; break; }
        xs.push(q.x); ys.push(q.y); zs.push(q.z); rs.push(Math.hypot(q.x,q.y,q.z)); }
      if (!xs.length) { sigs.push(null); continue; }
      const sp = a => Math.max(...a) - Math.min(...a);
      const mean = rs.reduce((a,b)=>a+b,0)/rs.length;
      const sd = Math.sqrt(rs.reduce((a,b)=>a+(b-mean)*(b-mean),0)/rs.length);
      /* A bounding box is a weak signature: a cube and an octahedron of the same reach
         fill the same box, and the gate would have called two different solids the same
         shape (or, run to run, the same solid two different shapes). How the points are
         distributed WITHIN the box is what makes a silhouette — so the radius mean and
         spread go into the fingerprint alongside the three spans. */
      sigs.push([sp(xs), sp(ys), sp(zs), mean, sd]);
    }
    let gap = Infinity;
    for (let a = 0; a < sigs.length; a++) for (let b2 = a + 1; b2 < sigs.length; b2++)
      if (sigs[a] && sigs[b2]) gap = Math.min(gap,
        Math.hypot(...sigs[a].map((v,i)=>v - sigs[b2][i])));
    put('all eight polyhedra are reachable and distinct',
        sigs.every(Boolean) && gap > 0.15,
        'closest pair differs by ' + (gap===Infinity?'n/a':gap.toFixed(3)));
    put('shapes only appear on the preset that reads them',
        !bank['pat-cloud'].keys.includes('formShape') && bank['pat-form'].keys.includes('formShape'));

    return out;
  });
  let bad=0; for(const [n,ok,e] of r){ if(!ok)bad++; console.log((ok?'  ok  ':'  FAIL')+'  '+n.padEnd(52)+e); }
  /* page errors were printed and then NOT counted, so a gate could pass while the console
     was full of exceptions */
  if(errs.length){ bad++; console.log('  FAIL  page errors'.padEnd(58)+errs.slice(0,3).join(' | ')); }
  console.log(bad?`\nSHELF FAIL — ${bad}/${r.length+1}`:`\nSHELF OK — ${r.length}/${r.length}`);
  await b.close(); process.exit(bad?1:0);
})();
