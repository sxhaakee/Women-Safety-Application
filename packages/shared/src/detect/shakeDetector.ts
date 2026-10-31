/**
 * Shake Detector
 *
 * Detects 3+ deliberate shakes within 1500 ms with alternating axis sign.
 * Confidence: always 0.9 (explicit gesture).
 * Refractory: 4000 ms after trigger.
 * Threshold per sensitivity: low=2.4g, medium=1.9g, high=1.5g
 */

import type { Sample, DetectorResult, Sensitivity, GravityState } from './primitives';
import { removeGravity, magnitude3, clamp } from './primitives';
import type { DetectorConfig } from '../config/detectorConfig';
import { DEFAULT_DETECTOR_CONFIG } from '../config/detectorConfig';

export interface Peak {
  t: number;
  mag: number;
  dominantAxisSign: number; // +1 or -1
}

export interface ShakeDetectorState {
  gravityState: GravityState;
  peaks: Peak[];
  lastTriggerAt: number;
  lastSampleT: number;
  lastPeakT: number;         // time of last confirmed peak (for inter-peak gap)
  prevMag: number;
  prevHpMag: number;
  prevHpx: number;           // hp components of previous sample (for sign at peak)
  prevHpy: number;
  prevHpz: number;
}

export function createShakeDetectorState(): ShakeDetectorState {
  return {
    gravityState: { gx: 0, gy: 0, gz: 0 },
    peaks: [],
    lastTriggerAt: -99999,   // ensures first trigger always passes refractory check
    lastSampleT: 0,
    lastPeakT: -99999,
    prevMag: 0,
    prevHpMag: 0,
    prevHpx: 0,
    prevHpy: 0,
    prevHpz: 0,
  };
}

/**
 * Feed one accelerometer sample and return a DetectorResult if triggered,
 * or null otherwise. Mutates state in place.
 */
export function feedShake(
  sample: Sample,
  state: ShakeDetectorState,
  sensitivity: Sensitivity = 'medium',
  config: DetectorConfig = DEFAULT_DETECTOR_CONFIG,
): DetectorResult | null {
  const threshold = config.shakeThreshold[sensitivity];

  // Gravity removal
  const { hpx, hpy, hpz, state: newGravity } = removeGravity(
    { x: sample.ax, y: sample.ay, z: sample.az },
    state.gravityState,
  );
  state.gravityState = newGravity;

  const hpMag = magnitude3(hpx, hpy, hpz);

  // Peak detection: local max — prev frame was above threshold, current is descending
  // AND enough time since last detected peak (inter-peak gap)
  const isPeak =
    state.prevHpMag > threshold &&
    hpMag < state.prevHpMag &&
    sample.t - state.lastPeakT >= config.shakeMinPeakGapMs;

  if (isPeak) {
    // Use PREVIOUS frame's hp components to determine dominant axis sign
    // (current frame is already descending / valley)
    const absX = Math.abs(state.prevHpx);
    const absY = Math.abs(state.prevHpy);
    const absZ = Math.abs(state.prevHpz);
    let dominantVal = state.prevHpx;
    if (absY > absX && absY >= absZ) dominantVal = state.prevHpy;
    else if (absZ > absX && absZ > absY) dominantVal = state.prevHpz;
    const dominantAxisSign = dominantVal >= 0 ? 1 : -1;

    state.peaks.push({ t: sample.t, mag: state.prevHpMag, dominantAxisSign });
    state.lastPeakT = sample.t;
  }

  state.prevHpMag = hpMag;
  state.prevHpx = hpx;
  state.prevHpy = hpy;
  state.prevHpz = hpz;
  state.lastSampleT = sample.t;

  // Prune old peaks outside the detection window
  const windowStart = sample.t - config.shakeWindowMs;
  state.peaks = state.peaks.filter(p => p.t >= windowStart);

  // Check for ≥3 peaks with alternating sign (rejects single bumps)
  if (state.peaks.length >= config.shakeMinPeaks) {
    const recentPeaks = state.peaks.slice(-config.shakeMinPeaks);

    // Check alternating sign
    let alternating = true;
    for (let i = 1; i < recentPeaks.length; i++) {
      if (recentPeaks[i]!.dominantAxisSign === recentPeaks[i - 1]!.dominantAxisSign) {
        alternating = false;
        break;
      }
    }

    if (alternating) {
      const now = sample.t;
      if (now - state.lastTriggerAt >= config.shakeRefractoryMs) {
        // TRIGGER
        state.lastTriggerAt = now;
        state.peaks = []; // clear so we don't double-trigger

        const avgMag = recentPeaks.reduce((s, p) => s + p.mag, 0) / recentPeaks.length;

        return {
          kind: 'shake',
          confidence: 0.9,
          at: now,
          features: {
            peakCount: recentPeaks.length,
            avgPeakMag: avgMag,
            windowMs: config.shakeWindowMs,
            thresholdUsed: threshold,
          },
        };
      }
    }
  }

  return null;
}

/**
 * Derive a user-calibrated threshold from deliberate shake samples.
 * Returns a threshold clamped to [1.3, 2.8] g.
 */
export function calibrateShakeThreshold(
  peakMagnitudes: number[],
): number {
  if (peakMagnitudes.length === 0) return 1.9; // default medium

  const mean = peakMagnitudes.reduce((s, v) => s + v, 0) / peakMagnitudes.length;
  const variance =
    peakMagnitudes.reduce((s, v) => s + (v - mean) ** 2, 0) / peakMagnitudes.length;
  const stdDev = Math.sqrt(variance);

  // T = mean - 2σ, clamped to [1.3, 2.8]
  return clamp(mean - 2 * stdDev, 1.3, 2.8);
}
