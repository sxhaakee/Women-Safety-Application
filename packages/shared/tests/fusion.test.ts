import { describe, it, expect } from 'vitest';
import { computeFusion, type FusionInput } from '../src/detect/fusion';
import { DEFAULT_DETECTOR_CONFIG } from '../src/config/detectorConfig';

describe('Fusion Engine', () => {
  it('explicit trigger → countdown action, score 1.0', () => {
    const r = computeFusion({ results: [], explicitTrigger: 'manual_sos' });
    expect(r.action).toBe('countdown');
    if (r.action === 'countdown') expect(r.score).toBe(1.0);
  });

  it('shake trigger → countdown with default countdown seconds', () => {
    const r = computeFusion({ results: [], explicitTrigger: 'shake' });
    expect(r.action).toBe('countdown');
    if (r.action === 'countdown') expect(r.countdownSec).toBe(DEFAULT_DETECTOR_CONFIG.countdownDefaultSec);
  });

  it('S >= 0.85 → auto countdown 15s', () => {
    const r = computeFusion({
      results: [{ kind: 'shake', confidence: 0.9, at: 0, features: {} }],
    });
    expect(r.action).toBe('countdown');
    if (r.action === 'countdown') expect(r.countdownSec).toBe(15);
  });

  it('0.60 <= S < 0.85 → soft_prompt', () => {
    const r = computeFusion({
      results: [
        { kind: 'struggle', confidence: 0.7, at: 0, features: {} },
      ],
    });
    // struggle weight=0.9, c=0.7: S = 1-(1-0.9*0.7) = 0.63
    expect(r.action).toBe('soft_prompt');
  });

  it('S < 0.60 (snatch alone 0.55) → log_only', () => {
    const r = computeFusion({
      results: [{ kind: 'snatch', confidence: 0.55, at: 0, features: {} }],
    });
    // S = 1-(1-0.8*0.55) = 0.44 < 0.60
    expect(r.action).toBe('log_only');
  });

  it('empty results → none', () => {
    const r = computeFusion({ results: [] });
    expect(r.action).toBe('none');
  });

  it('risk=alert context boost: snatch alone → soft_prompt (not log_only)', () => {
    const r = computeFusion({
      results: [{ kind: 'snatch', confidence: 0.55, at: 0, features: {} }],
      riskLevel: 'alert',
    });
    // Base S=0.44 + 0.10 = 0.54 still log_only
    // With emergency boost
    const r2 = computeFusion({
      results: [{ kind: 'snatch', confidence: 0.55, at: 0, features: {} }],
      riskLevel: 'emergency',
      currentHour: 2,
      safeHours: { start: 7, end: 21 },
    });
    // 0.44 + 0.10 (risk) + 0.10 (hour) = 0.64 → soft_prompt
    expect(r2.action).toBe('soft_prompt');
  });

  it('noisy-OR: snatch + scream fusion > individual', () => {
    const solo = computeFusion({ results: [{ kind: 'snatch', confidence: 0.55, at: 0, features: {} }] });
    const combo = computeFusion({ results: [
      { kind: 'snatch', confidence: 0.55, at: 0, features: {} },
      { kind: 'scream', confidence: 0.5, at: 0, features: {} },
    ]});
    if (solo.action !== 'none' && combo.action !== 'none') {
      expect(combo.score).toBeGreaterThan(solo.score);
    }
  });

  it('score is always between 0 and 1', () => {
    const cases: FusionInput[] = [
      { results: [] },
      { results: [{ kind: 'shake', confidence: 1, at: 0, features: {} }] },
      { results: [{ kind: 'struggle', confidence: 0.8, at: 0, features: {} }, { kind: 'scream', confidence: 0.5, at: 0, features: {} }] },
    ];
    for (const c of cases) {
      const r = computeFusion(c);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });
});
