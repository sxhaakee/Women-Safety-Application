/**
 * Struggle Detector (passive)
 *
 * Detects sustained chaotic motion indicative of a physical struggle.
 * Uses windowed RMS of acceleration + gyro + zero-crossing rate.
 * Guards against false triggers from walking/running via step cadence check.
 * Max confidence: 0.8 (passive signal — never alone causes a trigger).
 *
 * Window: 2s, hop: 250ms
 */

import type { Sample, DetectorResult, GravityState } from './primitives';
import { removeGravity, magnitude3, rms, zeroCrossingRate, sigmoid, clamp } from './primitives';
import type { DetectorConfig } from '../config/detectorConfig';
import { DEFAULT_DETECTOR_CONFIG } from '../config/detectorConfig';

export interface StruggleDetectorState {
  gravityState: GravityState;
  windowSamples: Array<{ hpMag: number; gyroMag: number; hpX: number }>;
  consecutivePositiveHops: number;
  lastHopAt: number;
}

export function createStruggleDetectorState(): StruggleDetectorState {
  return {
    gravityState: { gx: 0, gy: 0, gz: 0 },
    windowSamples: [],
    consecutivePositiveHops: 0,
    lastHopAt: 0,
  };
}

const WINDOW_MS = 2000;
const HOP_MS = 250;

/**
 * Feed one sample. Returns result when struggle is detected, or null.
 */
export function feedStruggle(
  sample: Sample,
  state: StruggleDetectorState,
  config: DetectorConfig = DEFAULT_DETECTOR_CONFIG,
): DetectorResult | null {
  // Gravity removal
  const { hpx, hpy, hpz, state: newGravity } = removeGravity(
    { x: sample.ax, y: sample.ay, z: sample.az },
    state.gravityState,
  );
  state.gravityState = newGravity;

  const hpMag = magnitude3(hpx, hpy, hpz);
  const gyroMag = magnitude3(sample.gx ?? 0, sample.gy ?? 0, sample.gz ?? 0);

  state.windowSamples.push({ hpMag, gyroMag, hpX: hpx });

  // Prune samples outside window
  const windowStart = sample.t - WINDOW_MS;
  state.windowSamples = state.windowSamples.filter((_, i) => {
    // We don't store timestamps per sample for efficiency; use index-based trimming
    // Keep only the last 2000ms worth: at 50Hz = 100 samples
    return true; // handled by count below
  });
  // Keep last 100 samples (2s at 50Hz)
  if (state.windowSamples.length > 100) {
    state.windowSamples = state.windowSamples.slice(-100);
  }

  // Only evaluate at hop boundary
  if (sample.t - state.lastHopAt < HOP_MS) return null;
  state.lastHopAt = sample.t;

  const hpMags = state.windowSamples.map(s => s.hpMag);
  const gyroMags = state.windowSamples.map(s => s.gyroMag);
  const hpXs = state.windowSamples.map(s => s.hpX);

  const rmsA = rms(hpMags);
  const rmsG = rms(gyroMags);
  const zcr = zeroCrossingRate(hpXs);

  // Walking/running guard: compute dominant frequency via zero-crossing rate
  // ZCR of dominant axis maps roughly to half the frequency: f ≈ zcr * sampleRate / 2
  // Step cadence 1.4–3.2 Hz → ZCR on dominant axis 0.056–0.128 (at 50Hz: 2.8–6.4 crossings/s)
  const sampleRateHz = 50;
  const dominantFreqHz = zcr * sampleRateHz / 2;
  const isWalkingPattern = dominantFreqHz >= 1.4 && dominantFreqHz <= 3.2;
  if (isWalkingPattern) {
    state.consecutivePositiveHops = 0;
    return null;
  }

  // Struggle score
  const score = sigmoid(
    2.2 * (rmsA - config.struggleRmsThreshold) +
    0.6 * (rmsG - config.struggleGyroThreshold) +
    1.5 * (zcr - config.struggleZcrThreshold),
  );

  if (score > 0.7) {
    state.consecutivePositiveHops++;
  } else {
    state.consecutivePositiveHops = 0;
  }

  if (state.consecutivePositiveHops >= config.struggleMinHops) {
    state.consecutivePositiveHops = 0; // reset after trigger
    const confidence = clamp(score, 0, 0.8);
    return {
      kind: 'struggle',
      confidence,
      at: sample.t,
      features: { rmsA, rmsG, zcr, score, dominantFreqHz },
    };
  }

  return null;
}
