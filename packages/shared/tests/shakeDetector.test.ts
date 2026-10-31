import { describe, it, expect } from 'vitest';
import {
  feedShake, createShakeDetectorState, calibrateShakeThreshold
} from '../src/detect/shakeDetector';
import type { Sample } from '../src/detect/primitives';

function makeSamples(count: number, base: Partial<Sample> = {}): Sample[] {
  return Array.from({ length: count }, (_, i) => ({
    t: i * 20, ax: 0, ay: 0, az: 1, ...base,
  }));
}

/**
 * Simulate N shakes: alternating +/- on Y axis.
 * Preamble: 50 frames of rest (az=1g) to fully init gravity estimate (α=0.8^50 ≈ 0).
 * Each shake: 1 peak frame + 1 sub-threshold frame (local max detection).
 */
function shakeSequence(nShakes: number, peakG = 2.5, startT = 0): Sample[] {
  const samples: Sample[] = [];
  let t = startT;
  // 50 frames of rest to fully prime gravity filter (GRAVITY_ALPHA=0.8, 50 frames → 99.99% converged)
  for (let i = 0; i < 50; i++, t += 20) {
    samples.push({ t, ax: 0, ay: 0, az: 1 });
  }
  for (let i = 0; i < nShakes; i++) {
    const sign = i % 2 === 0 ? 1 : -1;
    // Rise: below threshold frame
    samples.push({ t, ax: 0, ay: sign * 0.5, az: 0 });
    t += 20;
    // Peak: above threshold (2 frames so prevHpMag is set above threshold when valley arrives)
    samples.push({ t, ax: 0, ay: sign * peakG, az: 0 });
    t += 20;
    samples.push({ t, ax: 0, ay: sign * peakG * 0.95, az: 0 });
    t += 70; // total inter-peak gap = 90ms >= shakeMinPeakGapMs
    // Valley: below threshold (triggers local max detection on prev sample)
    samples.push({ t, ax: 0, ay: sign * 0.1, az: 0 });
    t += 100;
  }
  return samples;
}

describe('ShakeDetector', () => {
  it('3 shakes in 1500ms triggers result', () => {
    const state = createShakeDetectorState();
    const samples = shakeSequence(3, 2.5);
    let result = null;
    for (const s of samples) {
      const r = feedShake(s, state, 'medium');
      if (r) result = r;
    }
    expect(result).not.toBeNull();
    expect(result?.kind).toBe('shake');
    expect(result?.confidence).toBe(0.9);
  });

  it('2 shakes → no trigger', () => {
    const state = createShakeDetectorState();
    const samples = shakeSequence(2, 2.5);
    let result = null;
    for (const s of samples) {
      const r = feedShake(s, state, 'medium');
      if (r) result = r;
    }
    expect(result).toBeNull();
  });

  it('3 shakes below threshold → no trigger at medium sensitivity', () => {
    const state = createShakeDetectorState();
    const samples = shakeSequence(3, 0.5); // below 1.9g threshold
    let result = null;
    for (const s of samples) {
      const r = feedShake(s, state, 'medium');
      if (r) result = r;
    }
    expect(result).toBeNull();
  });

  it('refractory: second trigger within 4s is suppressed', () => {
    const state = createShakeDetectorState();
    // First sequence triggers at ~t=800ms
    const s1 = shakeSequence(3, 2.5, 0);
    // Second sequence starts at t=1500ms (well within 4000ms refractory)
    const s2 = shakeSequence(3, 2.5, 1500);
    const all = [...s1, ...s2];
    let count = 0;
    for (const s of all) {
      if (feedShake(s, state, 'medium')) count++;
    }
    expect(count).toBeLessThanOrEqual(1);
  });

  it('high sensitivity triggers at lower acceleration', () => {
    const state = createShakeDetectorState();
    // peakG=2.0: above high threshold (1.5) but below medium (1.9) after gravity removal
    const samples = shakeSequence(3, 2.0);
    let result = null;
    for (const s of samples) {
      const r = feedShake(s, state, 'high');
      if (r) result = r;
    }
    expect(result).not.toBeNull();
  });

  it('calibrateShakeThreshold returns value in [1.3, 2.8]', () => {
    const peaks = [3.0, 2.8, 3.2, 2.9, 3.1];
    const t = calibrateShakeThreshold(peaks);
    expect(t).toBeGreaterThanOrEqual(1.3);
    expect(t).toBeLessThanOrEqual(2.8);
  });

  it('calibrateShakeThreshold with empty → returns 1.9 default', () => {
    expect(calibrateShakeThreshold([])).toBe(1.9);
  });
});
