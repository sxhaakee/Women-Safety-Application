/**
 * Loud-Sound (Scream) Detector
 *
 * On-device only — NO cloud, NO speech recognition.
 * Uses audio metering (dBFS) only.
 *
 * Triggers when metering exceeds (baseline + 22 dB) OR -12 dBFS
 * sustained for 600ms–4000ms.
 *
 * Confidence: 0.5 alone (requires fusion corroboration for action).
 *
 * HONEST LIMITATION: Background audio monitoring on iOS is restricted
 * and requires explicit user consent + foreground service on Android.
 * This detector only runs while app is foreground or a foreground service
 * is active. Document this — do NOT claim silent background monitoring.
 */

import { clamp } from './primitives';
import type { DetectorResult } from './primitives';
import type { DetectorConfig } from '../config/detectorConfig';
import { DEFAULT_DETECTOR_CONFIG } from '../config/detectorConfig';

export interface ScreamDetectorState {
  /** Exponential moving average of dBFS metering (baseline) */
  baselineDbFs: number | null;
  /** Timestamp when the current loud event started, or null */
  loudStartAt: number | null;
  /** Whether baseline has been initialized */
  initialized: boolean;
}

const EMA_TAU_SAMPLES = 200; // at 10 Hz → 20 seconds
const EMA_ALPHA = 1 / EMA_TAU_SAMPLES;

export function createScreamDetectorState(): ScreamDetectorState {
  return {
    baselineDbFs: null,
    loudStartAt: null,
    initialized: false,
  };
}

/**
 * Feed one metering sample (in dBFS, negative values).
 * @param dbFs  Current metering level in dBFS (e.g. -24.0)
 * @param t     Timestamp in ms
 */
export function feedScream(
  dbFs: number,
  t: number,
  state: ScreamDetectorState,
  config: DetectorConfig = DEFAULT_DETECTOR_CONFIG,
): DetectorResult | null {
  // Initialize baseline on first sample
  if (state.baselineDbFs === null) {
    state.baselineDbFs = clamp(dbFs, -60, -25);
    state.initialized = true;
    return null;
  }

  // EMA update of baseline
  state.baselineDbFs = clamp(
    EMA_ALPHA * dbFs + (1 - EMA_ALPHA) * state.baselineDbFs,
    -60,
    -25,
  );

  const triggerLevel = Math.max(
    state.baselineDbFs + config.screamDbAboveBaseline,
    -12,
  );

  const isLoud = dbFs > triggerLevel;

  if (isLoud) {
    if (state.loudStartAt === null) {
      state.loudStartAt = t;
    }
    const duration = t - state.loudStartAt;

    if (
      duration >= config.screamMinDurationMs &&
      duration <= config.screamMaxDurationMs
    ) {
      // TRIGGER — reset so we don't re-trigger in the same event
      state.loudStartAt = null;
      return {
        kind: 'scream',
        confidence: 0.5,
        at: t,
        features: {
          dbFs,
          baseline: state.baselineDbFs,
          triggerLevel,
          durationMs: duration,
        },
      };
    }

    if (duration > config.screamMaxDurationMs) {
      // Too long — not a scream (sustained noise), reset
      state.loudStartAt = null;
    }
  } else {
    state.loudStartAt = null;
  }

  return null;
}
