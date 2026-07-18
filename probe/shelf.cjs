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

    // the dead-slider bug, in the exact place the audit found it
    const W=B.addLayer('waterfall'); await s(200);
    const shown=B.paramsOf(W).map(x=>x.key);
    put('waterfall shows only the keys it reads',
        !shown.includes('bend')&&!shown.includes('bendFreq')&&!shown.includes('angle')&&!shown.includes('tilt3d'),
        shown.join(','));

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

    // the left column no longer builds animation
    const leftIds=[...document.querySelectorAll('#panel fieldset')].map(f=>f.id);
    put('the left column is only figure-building', !leftIds.includes('gPhys')&&!leftIds.includes('gSpace'),
        leftIds.join(','));
    const rightIds=[...document.querySelectorAll('#rightcol fieldset')].map(f=>f.id);
    put('forces and space are on the right', rightIds.includes('gPhys')&&rightIds.includes('gSpace'),
        rightIds.join(','));
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

    /* ── the polyhedron bank: eight shapes, eight silhouettes ─────────────── */
    const F = B.onlyProg('pat-form'); B.setCount(240);
    const spans = [];
    for (let k = 0; k < 8; k++) {
      /* the pool was just rebuilt by setCount and the previous preset was still pulling —
         measure the FORM, not the transit toward it */
      F.params.formShape = k; await s(1100);
      const pl = F.bodies, xs = pl.map(q => q.x), ys = pl.map(q => q.y);
      if (!pl.every(q => [q.x,q.y,q.z].every(Number.isFinite))) { spans.push('NaN'); continue; }
      spans.push((Math.max(...xs)-Math.min(...xs)).toFixed(2)+'x'+(Math.max(...ys)-Math.min(...ys)).toFixed(2));
    }
    const nums = spans.map(t => t === 'NaN' ? null : t.split('x').map(Number));
    let gap = Infinity;
    for (let a = 0; a < nums.length; a++) for (let b2 = a + 1; b2 < nums.length; b2++)
      if (nums[a] && nums[b2]) gap = Math.min(gap, Math.hypot(nums[a][0]-nums[b2][0], nums[a][1]-nums[b2][1]));
    put('all eight polyhedra are reachable and distinct',
        !spans.includes('NaN') && gap > 0.15,
        'closest pair differs by ' + (gap===Infinity?'n/a':gap.toFixed(2)));
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
