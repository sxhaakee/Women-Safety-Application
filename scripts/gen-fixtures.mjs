/**
 * Synthetic sensor fixture generator.
 * Run: node scripts/gen-fixtures.mjs
 * Output: fixtures/sensors/*.json  (all marked "synthetic": true)
 *
 * Uses a seeded LCG PRNG — no Math.random() in source paths.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '..', 'fixtures', 'sensors');
mkdirSync(OUT, { recursive: true });

// ── Seeded LCG PRNG (no Math.random) ─────────────────────────────────────────
function makePrng(seed) {
  let s = seed >>> 0;
  return {
    next() {
      s = (Math.imul(1664525, s) + 1013904223) >>> 0;
      return s / 0xFFFFFFFF;
    },
    randn() { // Box-Muller (deterministic)
      const u1 = this.next() + 1e-10;
      const u2 = this.next();
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    }
  };
}

function makeSample(t, ax, ay, az, gx=0, gy=0, gz=0) {
  return { t, ax, ay, az, gx, gy, gz };
}

function writeFixture(name, samples, meta = {}) {
  const obj = { synthetic: true, label: name, ...meta, samples };
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(obj, null, 2));
  console.log(`  ✅ ${name}.json (${samples.length} samples)`);
}

// ── 1. Walking (120s, ~1.2 Hz step cadence, mostly vertical) ──────────────────
function genWalking(seed) {
  const rng = makePrng(seed);
  const samples = [];
  let t = 0;
  for (let i = 0; i < 6000; i++, t += 20) {
    const phase = (t / 1000) * 1.2 * 2 * Math.PI;
    samples.push(makeSample(t,
      0.15 * rng.randn() * 0.1,
      0.8 + 0.3 * Math.sin(phase) + 0.05 * rng.randn(),
      0.1 + 0.15 * Math.cos(phase * 2) + 0.05 * rng.randn(),
      0.05 * rng.randn(), 0.1 * Math.sin(phase) + 0.02 * rng.randn(), 0.05 * rng.randn()
    ));
  }
  return samples;
}

// ── 2. 3-Shake (deliberate left-right shake, 3 peaks at 2.5g) ─────────────────
function genShake3x(seed, peakG = 2.5) {
  const rng = makePrng(seed);
  const samples = [];
  let t = 0;
  // 500ms quiet
  for (let i = 0; i < 25; i++, t += 20) {
    samples.push(makeSample(t, 0.05*rng.randn(), 0+0.03*rng.randn(), 1+0.02*rng.randn()));
  }
  // 3 alternating peaks 200ms apart
  for (let shake = 0; shake < 3; shake++) {
    const sign = shake % 2 === 0 ? 1 : -1;
    for (let i = 0; i < 10; i++, t += 20) {
      const env = Math.sin(Math.PI * i / 9);
      samples.push(makeSample(t,
        sign * peakG * env + 0.05*rng.randn(),
        0.1*rng.randn(), 1+0.1*rng.randn(),
        0.2*rng.randn(), 0.2*rng.randn(), 0.2*rng.randn()
      ));
    }
  }
  // 500ms quiet
  for (let i = 0; i < 25; i++, t += 20) {
    samples.push(makeSample(t, 0.05*rng.randn(), 0+0.03*rng.randn(), 1+0.02*rng.randn()));
  }
  return samples;
}

// ── 3. Struggle simulation (chaotic high-energy motion) ───────────────────────
function genStruggle(seed) {
  const rng = makePrng(seed);
  const samples = [];
  let t = 0;
  for (let i = 0; i < 3000; i++, t += 20) {
    const chaos = Math.sin(2*Math.PI*8*t/1000) * 1.2 + Math.sin(2*Math.PI*11*t/1000) * 0.8;
    samples.push(makeSample(t,
      chaos * 0.7 + rng.randn() * 0.3,
      chaos * 0.5 + rng.randn() * 0.3,
      1 + chaos * 0.4 + rng.randn() * 0.2,
      chaos * 1.5 + rng.randn(), chaos * 1.2 + rng.randn(), chaos * 0.8 + rng.randn()
    ));
  }
  return samples;
}

// ── 4. Drop on floor (jerk → freefall → impact → still) ──────────────────────
function genDrop(seed) {
  const rng = makePrng(seed);
  const samples = [];
  let t = 0;
  // Still
  for (let i = 0; i < 25; i++, t += 20) samples.push(makeSample(t, 0.02*rng.randn(), 0.02*rng.randn(), 1+0.02*rng.randn()));
  // Jerk
  for (let i = 0; i < 5; i++, t += 20) samples.push(makeSample(t, 2+rng.randn()*0.3, 1+rng.randn()*0.3, 3+rng.randn()*0.3));
  // Freefall (~200ms)
  for (let i = 0; i < 10; i++, t += 20) samples.push(makeSample(t, 0.02*rng.randn(), 0.02*rng.randn(), 0.05*rng.randn()));
  // Impact
  for (let i = 0; i < 3; i++, t += 20) samples.push(makeSample(t, 1.5*rng.randn(), 2*rng.randn(), 4+rng.randn()*0.5));
  // Still (post-impact)
  for (let i = 0; i < 75; i++, t += 20) samples.push(makeSample(t, 0.01*rng.randn(), 0.01*rng.randn(), 0.98+0.01*rng.randn()));
  return samples;
}

console.log('Generating SYNTHETIC sensor fixtures...');
writeFixture('walking', genWalking(42), { description: 'Normal walking ~1.2Hz cadence, 120s', expected_triggers: 0 });
writeFixture('shake_3x_medium', genShake3x(123, 2.5), { description: '3 deliberate shakes at 2.5g peak', expected_triggers: 1 });
writeFixture('shake_3x_high_intensity', genShake3x(456, 3.2), { description: '3 deliberate shakes at 3.2g peak', expected_triggers: 1 });
writeFixture('shake_3x_low_intensity', genShake3x(789, 1.6), { description: '3 shakes at 1.6g — above high threshold only', expected_triggers: 1, sensitivity_note: 'triggers at high sensitivity, not medium' });
writeFixture('struggle_sim', genStruggle(111), { description: 'Simulated struggle: chaotic multi-axis motion', expected_struggle: true });
writeFixture('drop_on_floor', genDrop(222), { description: 'Phone dropped: jerk+freefall+impact+stationary', expected_snatch_class: 'drop', expected_triggers: 0 });
console.log('\nAll SYNTHETIC. Owner must record REAL fixtures for production benchmarks.');
console.log('See docs/BENCHMARKS.md for reporting format.');
