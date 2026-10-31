/**
 * Feature flags — every feature behind a flag so it can be toggled
 * without shipping broken code. Flags are read at runtime.
 */

export interface FeatureFlags {
  /** Enable 3-shake SOS trigger (always true in production) */
  SHAKE_TRIGGER: boolean;
  /** Enable passive struggle detector */
  STRUGGLE_DETECTOR: boolean;
  /** Enable snatch detector (requires fusion corroboration) */
  SNATCH_DETECTOR: boolean;
  /** Enable loud-sound (scream) detector */
  SCREAM_DETECTOR: boolean;
  /** Enable dead-man's switch HoldToBeSafe component */
  DEAD_MANS_SWITCH: boolean;
  /** Enable Safe Walk feature */
  SAFE_WALK: boolean;
  /** Enable Cab Guardian feature */
  CAB_GUARDIAN: boolean;
  /** Enable volunteer (Rakshak) network */
  VOLUNTEER_NETWORK: boolean;
  /** Enable community hazard reports */
  COMMUNITY_REPORTS: boolean;
  /** Enable evidence recording (audio + photo) */
  EVIDENCE_RECORDING: boolean;
  /** Enable strobe/torch on deterrence screen */
  DETERRENCE_STROBE: boolean;
  /** Show demo director panel (dev/demo mode only) */
  DEMO_DIRECTOR: boolean;
  /** Enable per-user detector calibration */
  DETECTOR_CALIBRATION: boolean;
}

/** Safe production defaults — all real features ON, demo director OFF */
export const DEFAULT_FLAGS: Readonly<FeatureFlags> = {
  SHAKE_TRIGGER: true,
  STRUGGLE_DETECTOR: true,
  SNATCH_DETECTOR: true,
  SCREAM_DETECTOR: true,
  DEAD_MANS_SWITCH: true,
  SAFE_WALK: true,
  CAB_GUARDIAN: true,
  VOLUNTEER_NETWORK: true,
  COMMUNITY_REPORTS: true,
  EVIDENCE_RECORDING: true,
  DETERRENCE_STROBE: true,
  DEMO_DIRECTOR: false,
  DETECTOR_CALIBRATION: true,
};

/** Demo/dev overrides — enables director panel */
export const DEMO_FLAGS: Readonly<FeatureFlags> = {
  ...DEFAULT_FLAGS,
  DEMO_DIRECTOR: true,
};
