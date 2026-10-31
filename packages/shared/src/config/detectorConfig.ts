/**
 * Detector configuration constants.
 * All thresholds are here — never hardcoded in detector code.
 */

export interface DetectorConfig {
  /** Shake: accelerometer peak threshold per sensitivity level (g) */
  shakeThreshold: { low: number; medium: number; high: number };
  /** Shake: minimum inter-peak gap (ms) */
  shakeMinPeakGapMs: number;
  /** Shake: required peaks within window */
  shakeMinPeaks: number;
  /** Shake: detection window (ms) */
  shakeWindowMs: number;
  /** Shake: refractory period after trigger (ms) */
  shakeRefractoryMs: number;
  /** Struggle: RMS threshold for trigger */
  struggleRmsThreshold: number;
  /** Struggle: Gyro RMS threshold */
  struggleGyroThreshold: number;
  /** Struggle: Zero-crossing rate threshold */
  struggleZcrThreshold: number;
  /** Struggle: Required consecutive positive hops */
  struggleMinHops: number;
  /** Snatch: Jerk threshold (g/s) */
  snatchJerkThreshold: number;
  /** Snatch: Free-fall threshold (g) */
  snatchFreeFallThreshold: number;
  /** Snatch: Free-fall minimum duration (ms) */
  snatchFreeFallMinMs: number;
  /** Snatch: Impact threshold (g) */
  snatchImpactThreshold: number;
  /** Snatch: Window after jerk to look for impact (ms) */
  snatchImpactWindowMs: number;
  /** Scream: dB above baseline to trigger */
  screamDbAboveBaseline: number;
  /** Scream: Minimum duration sustained (ms) */
  screamMinDurationMs: number;
  /** Scream: Maximum duration (ms, longer = not a scream) */
  screamMaxDurationMs: number;
  /** Fusion: Fusion score threshold for auto-countdown */
  fusionAutoThreshold: number;
  /** Fusion: Fusion score threshold for soft-prompt */
  fusionSoftThreshold: number;
  /** Countdown: default countdown seconds */
  countdownDefaultSec: number;
  /** Countdown: minimum countdown seconds */
  countdownMinSec: number;
  /** Countdown: maximum countdown seconds */
  countdownMaxSec: number;
  /** Deterrence: strobe frequency in Hz (MUST be <= 3 per WCAG 2.3.1) */
  strobeHz: number;
}

export const DEFAULT_DETECTOR_CONFIG: Readonly<DetectorConfig> = {
  shakeThreshold: { low: 2.4, medium: 1.9, high: 1.5 },
  shakeMinPeakGapMs: 90,
  shakeMinPeaks: 3,
  shakeWindowMs: 1500,
  shakeRefractoryMs: 4000,
  struggleRmsThreshold: 0.7,
  struggleGyroThreshold: 2.5,
  struggleZcrThreshold: 0.25,
  struggleMinHops: 3,
  snatchJerkThreshold: 40,
  snatchFreeFallThreshold: 0.35,
  snatchFreeFallMinMs: 120,
  snatchImpactThreshold: 3.0,
  snatchImpactWindowMs: 600,
  screamDbAboveBaseline: 22,
  screamMinDurationMs: 600,
  screamMaxDurationMs: 4000,
  fusionAutoThreshold: 0.85,
  fusionSoftThreshold: 0.60,
  countdownDefaultSec: 10,
  countdownMinSec: 5,
  countdownMaxSec: 20,
  strobeHz: 2.5, // WCAG 2.3.1 compliant: <= 3 Hz
};
