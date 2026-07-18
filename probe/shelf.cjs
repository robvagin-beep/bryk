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
    put('every preset names a real source file:line',
        ids.every(k=>/[a-zA-Z-]+:[0-9A-Za-z.+-]/.test(bank[k].source||'')),
        ids.filter(k=>!/[a-zA-Z-]+:[0-9A-Za-z.+-]/.test(bank[k].source||'')).join(',')||'all sourced');
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
    put('each behaviour brings its own seeding and its own integration',
        beh.every(k => typeof bank[k].init === 'function' && typeof bank[k].step === 'function'),
        beh.filter(k => !bank[k].step).join(',') || 'all six');
    put('each behaviour shows only its own controls',
        bank.pack.keys.length < bank.swarm.keys.length &&
        bank.scatter.keys.length < bank.magnet.keys.length,
        'pack ' + bank.pack.keys.length + ' · swarm ' + bank.swarm.keys.length +
        ' · scatter ' + bank.scatter.keys.length + ' · magnet ' + bank.magnet.keys.length);

    /* the seeding must actually put bodies somewhere different per behaviour — that is the
       half of the character the invented number table could not carry */
    const spread = {};
    for (const id of ['fall', 'orbit', 'pack', 'scatter']) {
      B.onlyProg(id); await s(700);
      const pl = B.pool(), ys = pl.map(b => b.y), xs = pl.map(b => b.x);
      spread[id] = { h: +(Math.max(...ys) - Math.min(...ys)).toFixed(2),
                     w: +(Math.max(...xs) - Math.min(...xs)).toFixed(2) };
    }
    put('the six seed differently, they are not one preset in six coats',
        new Set(Object.values(spread).map(v => v.h + 'x' + v.w)).size >= 3,
        Object.entries(spread).map(([k, v]) => k + ' ' + v.w + '×' + v.h).join('  '));

    /* MANNER_PRESET orderings, the two that were inverted */
    const M = B.manners();
    put('manner orderings match the source',
        M.Free.cohesion > M.Flock.cohesion && M.Flow.flow > M.Vortex.flow,
        'cohesion Free ' + M.Free.cohesion + ' > Flock ' + M.Flock.cohesion +
        ' · flow Flow ' + M.Flow.flow + ' > Vortex ' + M.Vortex.flow);

    /* ── the polyhedron bank: eight shapes, eight silhouettes ─────────────── */
    const F = B.onlyProg('pat-form'); B.setCount(240);
    const spans = [];
    for (let k = 0; k < 8; k++) {
      /* the pool was just rebuilt by setCount and the previous preset was still pulling —
         measure the FORM, not the transit toward it */
      F.params.formShape = k; await s(1100);
      const pl = B.pool(), xs = pl.map(q => q.x), ys = pl.map(q => q.y);
      if (!pl.every(q => [q.x,q.y,q.z].every(Number.isFinite))) { spans.push('NaN'); continue; }
      spans.push((Math.max(...xs)-Math.min(...xs)).toFixed(2)+'x'+(Math.max(...ys)-Math.min(...ys)).toFixed(2));
    }
    put('all eight polyhedra are reachable and distinct',
        !spans.includes('NaN') && new Set(spans).size >= 6,
        new Set(spans).size + '/8 distinct silhouettes');
    put('shapes only appear on the preset that reads them',
        !bank['pat-cloud'].keys.includes('formShape') && bank['pat-form'].keys.includes('formShape'));

    return out;
  });
  let bad=0; for(const [n,ok,e] of r){ if(!ok)bad++; console.log((ok?'  ok  ':'  FAIL')+'  '+n.padEnd(52)+e); }
  console.log(errs.length?('\nPAGE ERRORS: '+errs.slice(0,3).join(' | ')):'\nno page errors');
  console.log(bad?`\nSHELF FAIL — ${bad}/${r.length}`:`\nSHELF OK — ${r.length}/${r.length}`);
  await b.close(); process.exit(bad?1:0);
})();
