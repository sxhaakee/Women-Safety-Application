/**
 * Snatch Detector
 *
 * Detects phone snatch pattern:
 *   [jerk > 40 g/s] → [free-fall: mag < 0.35g for ≥120ms] OR impact > 3g within 600ms
 * Then classifies:
 *   drop   : stationary after impact → confidence 0.15 (log only)
 *   snatch : continued motion OR rapid orientation change → confidence 0.55
 *
 * Never alone triggers a countdown (0.55 < fusionSoftThreshold 0.60).
 */

import type { Sample, DetectorResult, GravityState } from './primitives';
import { removeGravity, magnitude3, clamp } from './primitives';
import type { DetectorConfig } from '../config/detectorConfig';
import { DEFAULT_DETECTOR_CONFIG } from '../config/detectorConfig';

type SnatchPhase = 'watching' | 'post_jerk' | 'post_impact';

export interface SnatchDetectorState {
  gravityState: GravityState;
  phase: SnatchPhase;
  jerkAt: number;
  freeFallStart: number | null;
  impactAt: number | null;
  postImpactSamples: Array<{ hpMag: number; gyroMag: number }>;
  prevMag: number;
  prevT: number;
}

export function createSnatchDetectorState(): SnatchDetectorState {
  return {
    gravityState: { gx: 0, gy: 0, gz: 0 },
    phase: 'watching',
    jerkAt: 0,
    freeFallStart: null,
    impactAt: null,
    postImpactSamples: [],
    prevMag: 1.0, // ~1g at rest
    prevT: 0,
  };
}

export function feedSnatch(
  sample: Sample,
  state: SnatchDetectorState,
  config: DetectorConfig = DEFAULT_DETECTOR_CONFIG,
): DetectorResult | null {
  const { hpx, hpy, hpz, state: newGravity } = removeGravity(
    { x: sample.ax, y: sample.ay, z: sample.az },
    state.gravityState,
  );
  state.gravityState = newGravity;

  const rawMag = magnitude3(sample.ax, sample.ay, sample.az);
  const hpMag = magnitude3(hpx, hpy, hpz);
  const gyroMag = magnitude3(sample.gx ?? 0, sample.gy ?? 0, sample.gz ?? 0);
  const dt = state.prevT > 0 ? (sample.t - state.prevT) / 1000 : 0.02; // seconds
  const jerk = dt > 0 ? Math.abs(rawMag - state.prevMag) / dt : 0;

  state.prevMag = rawMag;
  state.prevT = sample.t;

  if (state.phase === 'watching') {
    if (jerk > config.snatchJerkThreshold) {
      state.phase = 'post_jerk';
      state.jerkAt = sample.t;
      state.freeFallStart = null;
      state.impactAt = null;
      state.postImpactSamples = [];
    }
  } else if (state.phase === 'post_jerk') {
    const elapsed = sample.t - state.jerkAt;

    // Check for free-fall
    if (rawMag < config.snatchFreeFallThreshold) {
      if (state.freeFallStart === null) state.freeFallStart = sample.t;
    } else {
      if (
        state.freeFallStart !== null &&
        sample.t - state.freeFallStart < config.snatchFreeFallMinMs
      ) {
        // Brief free-fall ended too soon — reset
        state.freeFallStart = null;
      }
    }

    // Check for impact
    if (rawMag > config.snatchImpactThreshold) {
      state.phase = 'post_impact';
      state.impactAt = sample.t;
      state.postImpactSamples = [];
    }

    // Timeout: if no impact within window, reset
    if (elapsed > config.snatchImpactWindowMs) {
      state.phase = 'watching';
    }
  } else if (state.phase === 'post_impact') {
    state.postImpactSamples.push({ hpMag, gyroMag });

    // Collect 1500ms of post-impact data to classify drop vs snatch
    const postElapsed = sample.t - (state.impactAt ?? sample.t);
    if (postElapsed < 1500) return null;

    // Classify
    const avgHpMag =
      state.postImpactSamples.reduce((s, x) => s + x.hpMag, 0) /
      state.postImpactSamples.length;
    const maxGyroMag = state.postImpactSamples.reduce(
      (m, x) => Math.max(m, x.gyroMag),
      0,
    );

    state.phase = 'watching';

    const isDrop = avgHpMag < 0.05; // stationary after impact
    const isSnatch = !isDrop || maxGyroMag > 6;

    if (isDrop && !isSnatch) {
      return {
        kind: 'snatch',
        confidence: 0.15,
        at: state.impactAt ?? sample.t,
        features: { avgHpMag, maxGyroMag, classification: 0 /* drop */ },
      };
    }

    if (isSnatch) {
      return {
        kind: 'snatch',
        confidence: 0.55,
        at: state.impactAt ?? sample.t,
        features: { avgHpMag, maxGyroMag, classification: 1 /* snatch */ },
      };
    }
  }

  return null;
}
