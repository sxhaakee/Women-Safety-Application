/**
 * Sensor service: bridges expo-sensors → shared detectors
 *
 * - Accelerometer + Gyroscope at 50 Hz (setUpdateInterval(20))
 * - Runs detectors on every sample via fusion
 * - Emits 'trigger' events via callback
 * - Pure start/stop lifecycle — no React state
 *
 * HONEST NOTE: This runs while the app is foregrounded.
 * Background detection on Android requires a Foreground Service notification
 * (via expo-task-manager). iOS background sensor access is limited and
 * requires the app to be in a background execution mode.
 */
import { Accelerometer, Gyroscope } from 'expo-sensors';
import {
  createShakeDetectorState, feedShake,
  createStruggleDetectorState, feedStruggle,
  createSnatchDetectorState, feedSnatch,
  computeFusion,
  type DetectorResult,
  type FusionDecision,
  type Sensitivity,
} from '@shesafe/shared';
import type { DetectorConfig } from '@shesafe/shared';

export type SensorTriggerCallback = (decision: FusionDecision) => void;

const SAMPLE_RATE_HZ = 50;
const INTERVAL_MS = 1000 / SAMPLE_RATE_HZ;

interface SensorSession {
  stop: () => void;
}

let accelSub: ReturnType<typeof Accelerometer.addListener> | null = null;
let gyroSub: ReturnType<typeof Gyroscope.addListener> | null = null;
let lastGyro = { x: 0, y: 0, z: 0 };

export function startSensors(
  onTrigger: SensorTriggerCallback,
  sensitivity: Sensitivity = 'medium',
  config?: Partial<DetectorConfig>,
): SensorSession {
  const shakeState = createShakeDetectorState();
  const struggleState = createStruggleDetectorState();
  const snatchState = createSnatchDetectorState();
  const pendingResults: DetectorResult[] = [];

  Accelerometer.setUpdateInterval(INTERVAL_MS);
  Gyroscope.setUpdateInterval(INTERVAL_MS);

  gyroSub = Gyroscope.addListener(g => {
    lastGyro = g;
  });

  accelSub = Accelerometer.addListener(a => {
    const sample = {
      t: Date.now(),
      ax: a.x, ay: a.y, az: a.z,
      gx: lastGyro.x, gy: lastGyro.y, gz: lastGyro.z,
    };

    // Run all detectors
    const shakeResult = feedShake(sample, shakeState, sensitivity);
    const struggleResult = feedStruggle(sample, struggleState);
    const snatchResult = feedSnatch(sample, snatchState);

    if (shakeResult) pendingResults.push(shakeResult);
    if (struggleResult) pendingResults.push(struggleResult);
    if (snatchResult) pendingResults.push(snatchResult);

    // Only evaluate fusion at shake triggers or every 250ms hop
    if (shakeResult || (pendingResults.length > 0 && sample.t % 250 < INTERVAL_MS)) {
      const decision = computeFusion({
        results: pendingResults.splice(0),
        ...(shakeResult ? { explicitTrigger: 'shake' as const } : {}),
      });

      if (decision.action !== 'none' && decision.action !== 'log_only') {
        onTrigger(decision);
      }
    }
  });

  return {
    stop() {
      accelSub?.remove();
      gyroSub?.remove();
      accelSub = null;
      gyroSub = null;
    },
  };
}
