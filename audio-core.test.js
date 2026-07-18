/* BRYK — audio-core fixture BPM test. Zero-dep (node built-ins only).
   Loads audio-core.js DIRECTLY (the bryk snapshot is the one owner of this file —
   the EQJ original extracted the block out of audio-diag.html, that coupling is gone).
   Acceptance: detected BPM within ±2 of 90 / 124 / 174.
     node audio-core.test.js
*/
const fs = require('fs');
const path = require('path');

const CORE = path.join(__dirname, 'audio-core.js');
const src = fs.readFileSync(CORE, 'utf8');

// audio-core.js is an IIFE ending in (window ?? globalThis). Feed it a fresh sandbox
// as `window` so its exports land there instead of polluting node globals.
const sandbox = {};
try { new Function('window', src)(sandbox); }
catch (e) { console.error('FAIL — audio-core.js threw on load:', e.message); process.exit(1); }

const { makeAudioCore, makeFixture, AC_BANDS } = sandbox;
if (typeof makeAudioCore !== 'function' || typeof makeFixture !== 'function') {
  console.error('FAIL — audio-core did not export makeAudioCore / makeFixture'); process.exit(1);
}

const FPS = 60, DUR = 12, TOL = 2;                 // 12 s per run, ±2 BPM
const CASES = [90, 124, 174];

function run(bpm) {
  const core = makeAudioCore({ sampleRate: 48000, fftSize: 2048 });
  const fix  = makeFixture(bpm, { fftSize: 2048 });
  const dt = 1 / FPS;
  let t = 0;
  for (let i = 0; i < DUR * FPS; i++) {
    core.process(fix.frame(t), null, dt, t);
    t += dt;
  }
  return { bpm: core.features.beat.bpm, conf: core.features.beat.conf };
}

let pass = true;
console.log('BRYK — beat-tracker fixture test');
console.log('  target   detected   conf    Δ      result');
for (const target of CASES) {
  const r = run(target);
  const d = Math.abs(r.bpm - target);
  const ok = d <= TOL;
  if (!ok) pass = false;
  console.log(
    '  ' + String(target).padEnd(8) +
    r.bpm.toFixed(1).padEnd(11) +
    r.conf.toFixed(2).padEnd(8) +
    ('±' + d.toFixed(1)).padEnd(7) +
    (ok ? 'OK' : 'FAIL')
  );
}

// Contract check — the panel reads these by name; a rename upstream must fail loudly here.
const core = makeAudioCore({ sampleRate: 48000, fftSize: 2048 });
core.process(makeFixture(124, { fftSize: 2048 }).frame(0), null, 1 / 60, 0);
const f = core.features;
const need = [
  ['rms', typeof f.rms === 'number'],
  ['flux', typeof f.flux === 'number'],
  ['onset', typeof f.onset === 'number'],
  ['bands×6', AC_BANDS.length === 6 && AC_BANDS.every(b => typeof f.bands[b[0]] === 'number')],
  ['env×7', ['bassFast','bassSlow','midFast','midSlow','highFast','highSlow','rmsSlow'].every(k => typeof f.env[k] === 'number')],
  ['beat.phase', typeof f.beat.phase === 'number'],
  ['beat.onBeat/onBar/onPhrase', ['onBeat','onBar','onPhrase'].every(k => typeof f.beat[k] === 'boolean')],
  ['binCount', typeof core.binCount === 'number' && core.binCount > 0],
];
console.log('\n  feature contract');
for (const [name, ok] of need) {
  if (!ok) pass = false;
  console.log('  ' + name.padEnd(28) + (ok ? 'OK' : 'FAIL'));
}

/* ── BRYK additions: live trim + phase shift must be NON-destructive ──────────
   The whole point: you can lean on the tempo mid-set without the detector dropping
   out and without the clock restarting. */
function settle(core, fix, sec){
  const dt = 1/FPS; let t = 0;
  for (let i = 0; i < sec*FPS; i++) { core.process(fix.frame(t), null, dt, t); t += dt; }
  return t;
}
console.log('\n  live trim / phase shift');
{
  const c = makeAudioCore({ sampleRate:48000, fftSize:2048 });
  const fx = makeFixture(124, { fftSize:2048 });
  let t = settle(c, fx, 12);
  const detected = c.features.beat.bpm;
  const srcBefore = c.features.beat.source;

  c.setTrim(+4);
  c.process(fx.frame(t), null, 1/FPS, t); t += 1/FPS;
  const trimmed = c.features.beat.bpm;
  const srcAfter = c.features.beat.source;

  const checks = [
    ['trim raises effective bpm by +4', Math.abs(trimmed - (detected + 4)) < 0.01],
    ['detection stays on auto (not frozen to manual)', srcBefore === 'auto' && srcAfter === 'auto'],
  ];

  // phase must keep tracking while trimmed — run on and confirm it still wraps
  let beats = 0; const n0 = c.features.beat.beatN;
  for (let i = 0; i < 4*FPS; i++) { c.process(fx.frame(t), null, 1/FPS, t); t += 1/FPS; }
  beats = c.features.beat.beatN - n0;
  checks.push(['clock keeps running under trim', beats > 0]);

  // shift moves phase, leaves tempo alone
  const bpmBefore = c.features.beat.bpm, phBefore = c.features.beat.phase;
  c.shift(0.25);
  c.process(fx.frame(t), null, 1/FPS, t); t += 1/FPS;
  const dPhase = (c.features.beat.phase - phBefore + 1) % 1;
  checks.push(['shift moves phase ~0.25 of a beat', dPhase > 0.2 && dPhase < 0.32]);
  checks.push(['shift leaves tempo untouched', Math.abs(c.features.beat.bpm - bpmBefore) < 0.01]);

  // shift must wrap, never go negative
  c.shift(-0.9); c.process(fx.frame(t), null, 1/FPS, t); t += 1/FPS;
  checks.push(['phase stays in [0,1) after a negative shift',
    c.features.beat.phase >= 0 && c.features.beat.phase < 1]);

  // auto() clears the trim
  c.auto(); c.process(fx.frame(t), null, 1/FPS, t);
  checks.push(['auto() clears trim', c.getTrim() === 0]);

  // trim is clamped
  c.setTrim(999);
  checks.push(['trim clamps to ±30', c.getTrim() === 30]);

  for (const [name, ok] of checks) {
    if (!ok) pass = false;
    console.log('  ' + name.padEnd(46) + (ok ? 'OK' : 'FAIL'));
  }
}

console.log(pass ? '\nPASS' : '\nFAIL');
process.exit(pass ? 0 : 1);
