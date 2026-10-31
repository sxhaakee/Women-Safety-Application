/**
 * Fusion Engine (Noisy-OR)
 *
 * Combines individual detector signals into a single fusion score S.
 * S = 1 - Π(1 - w_i · c_i)
 *
 * Weights: shake=1.0, struggle=0.9, snatch=0.8, scream=0.7
 * Context boosts: +0.1 if risk.level >= 'alert', +0.1 if after-hours
 *
 * Decision thresholds (configurable in DetectorConfig):
 *   explicit (manual/shake/dead-man)  → countdown 10s
 *   S >= 0.85                         → countdown 15s + haptic + voice
 *   0.60 <= S < 0.85                  → soft prompt 10s → countdown 15s
 *   S < 0.60                          → log only
 */

import type { DetectorResult } from './primitives';
import { clamp } from './primitives';
import type { DetectorConfig } from '../config/detectorConfig';
import { DEFAULT_DETECTOR_CONFIG } from '../config/detectorConfig';

export type TriggerSource =
  | 'manual_sos'
  | 'shake'
  | 'struggle'
  | 'snatch'
  | 'scream'
  | 'dead_mans_switch'
  | 'safe_walk_deviation'
  | 'safe_walk_stationary'
  | 'safe_walk_overdue'
  | 'cab_deviation'
  | 'duress_pin';

export type FusionDecision =
  | { action: 'none'; score: number }
  | { action: 'log_only'; score: number }
  | { action: 'soft_prompt'; score: number; countdownSec: number }
  | { action: 'countdown'; score: number; countdownSec: number; source: TriggerSource };

export type RiskLevel = 'safe' | 'watchful' | 'alert' | 'emergency';

export interface FusionInput {
  results: DetectorResult[];
  riskLevel?: RiskLevel;
  /** Hour in 24h format (0-23), local time */
  currentHour?: number;
  safeHours?: { start: number; end: number }; // 0-23
  explicitTrigger?: TriggerSource;
}

const WEIGHTS: Record<DetectorResult['kind'], number> = {
  shake: 1.0,
  struggle: 0.9,
  snatch: 0.8,
  scream: 0.7,
};

/**
 * Compute fusion score and return decision.
 */
export function computeFusion(
  input: FusionInput,
  config: DetectorConfig = DEFAULT_DETECTOR_CONFIG,
): FusionDecision {
  // Explicit triggers always → immediate countdown
  if (input.explicitTrigger) {
    return {
      action: 'countdown',
      score: 1.0,
      countdownSec: config.countdownDefaultSec,
      source: input.explicitTrigger,
    };
  }

  if (input.results.length === 0) {
    return { action: 'none', score: 0 };
  }

  // Noisy-OR fusion
  let productTerm = 1.0;
  for (const r of input.results) {
    const w = WEIGHTS[r.kind];
    productTerm *= (1 - w * r.confidence);
  }
  let score = clamp(1 - productTerm, 0, 1);

  // Context boosts
  let boost = 0;
  if (input.riskLevel === 'alert' || input.riskLevel === 'emergency') {
    boost += 0.1;
  }
  if (
    input.currentHour !== undefined &&
    input.safeHours !== undefined
  ) {
    const h = input.currentHour;
    const { start, end } = input.safeHours;
    const isUnsafeHour =
      h >= 0 && h <= 5 ||
      (end < 24 && h > end) ||
      h < start;
    if (isUnsafeHour) boost += 0.1;
  }

  score = clamp(score + boost, 0, 1);

  if (score >= config.fusionAutoThreshold) {
    // Find the highest-confidence individual signal as source label
    const topResult = input.results.reduce(
      (best, r) => (r.confidence > best.confidence ? r : best),
      input.results[0]!,
    );
    return {
      action: 'countdown',
      score,
      countdownSec: 15,
      source: topResult.kind as TriggerSource,
    };
  }

  if (score >= config.fusionSoftThreshold) {
    return { action: 'soft_prompt', score, countdownSec: 15 };
  }

  if (score > 0) {
    return { action: 'log_only', score };
  }

  return { action: 'none', score: 0 };
}
