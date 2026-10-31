import { describe, it, expect } from 'vitest';
import { computeRisk } from '../src/risk/riskEngine';

const BASE_INPUT = {
  now: new Date('2024-06-15T14:00:00'),
  lat: 12.87, lng: 74.84,
  safeHours: { start: '07:00', end: '21:00' },
  reportsNearby: [],
  stationsNearbyM: [500],
  openAmenitiesNearby: 3,
  motion: { state: 'walk' as const, stillSeconds: 0 },
  batteryPct: 80,
  missedCheckIn: false,
};

describe('RiskEngine', () => {
  it('daytime safe with no threats → score < 25', () => {
    const r = computeRisk(BASE_INPUT);
    expect(r.level).toBe('safe');
    expect(r.score).toBeLessThan(25);
  });

  it('2am → time factor adds ≥12 points', () => {
    const r = computeRisk({ ...BASE_INPUT, now: new Date('2024-06-15T02:00:00') });
    const tf = r.factors.find(f => f.id === 'time')!;
    expect(tf.points).toBeGreaterThanOrEqual(12);
  });

  it('after safe hours → time factor > 0', () => {
    const r = computeRisk({ ...BASE_INPUT, now: new Date('2024-06-15T22:30:00') });
    const tf = r.factors.find(f => f.id === 'time')!;
    expect(tf.points).toBeGreaterThan(0);
  });

  it('many nearby severe reports → zone factor > 20', () => {
    const r = computeRisk({
      ...BASE_INPUT,
      reportsNearby: [
        { distM: 50, severity: 5, ageDays: 1 },
        { distM: 80, severity: 5, ageDays: 2 },
        { distM: 100, severity: 4, ageDays: 3 },
      ],
    });
    const zf = r.factors.find(f => f.id === 'zone')!;
    expect(zf.points).toBeGreaterThan(20);
  });

  it('old reports decay: 60 days old → low zone score', () => {
    const r = computeRisk({
      ...BASE_INPUT,
      reportsNearby: [{ distM: 50, severity: 5, ageDays: 60 }],
    });
    const zf = r.factors.find(f => f.id === 'zone')!;
    expect(zf.points).toBeLessThan(5);
  });

  it('distant reports decay: 500m away → low zone score', () => {
    const r = computeRisk({
      ...BASE_INPUT,
      reportsNearby: [{ distM: 500, severity: 5, ageDays: 1 }],
    });
    const zf = r.factors.find(f => f.id === 'zone')!;
    expect(zf.points).toBeLessThan(10);
  });

  it('no stations nearby + no amenities → isolation ≥ 12', () => {
    const r = computeRisk({
      ...BASE_INPUT,
      stationsNearbyM: [3000],
      openAmenitiesNearby: 0,
    });
    const iso = r.factors.find(f => f.id === 'isolation')!;
    expect(iso.points).toBeGreaterThanOrEqual(12);
  });

  it('stillness > 600s → motion factor = 15', () => {
    const r = computeRisk({
      ...BASE_INPUT,
      motion: { state: 'still', stillSeconds: 600 },
    });
    const mf = r.factors.find(f => f.id === 'motion')!;
    expect(mf.points).toBe(15);
  });

  it('stillness 180s → motion factor > 0', () => {
    const r = computeRisk({
      ...BASE_INPUT,
      motion: { state: 'still', stillSeconds: 180 },
    });
    const mf = r.factors.find(f => f.id === 'motion')!;
    expect(mf.points).toBeGreaterThan(0);
  });

  it('safe walk deviation > 80m → walk factor includes 8', () => {
    const r = computeRisk({ ...BASE_INPUT, safeWalk: { deviationM: 100, overdueSec: 0 } });
    const wf = r.factors.find(f => f.id === 'safe_walk')!;
    expect(wf.points).toBeGreaterThanOrEqual(8);
  });

  it('overdue > 300s → walk factor includes 7', () => {
    const r = computeRisk({ ...BASE_INPUT, safeWalk: { deviationM: 0, overdueSec: 400 } });
    const wf = r.factors.find(f => f.id === 'safe_walk')!;
    expect(wf.points).toBeGreaterThanOrEqual(7);
  });

  it('battery < 10% → battery factor = 5', () => {
    const r = computeRisk({ ...BASE_INPUT, batteryPct: 8 });
    const bf = r.factors.find(f => f.id === 'battery')!;
    expect(bf.points).toBe(5);
  });

  it('battery 15% → battery factor = 2', () => {
    const r = computeRisk({ ...BASE_INPUT, batteryPct: 15 });
    const bf = r.factors.find(f => f.id === 'battery')!;
    expect(bf.points).toBe(2);
  });

  it('missed checkin → 10 points', () => {
    const r = computeRisk({ ...BASE_INPUT, missedCheckIn: true });
    const cf = r.factors.find(f => f.id === 'checkin')!;
    expect(cf.points).toBe(10);
  });

  it('score is capped at 100', () => {
    const r = computeRisk({
      ...BASE_INPUT,
      now: new Date('2024-06-15T02:00:00'),
      reportsNearby: [
        { distM: 10, severity: 5, ageDays: 0 },
        { distM: 20, severity: 5, ageDays: 0 },
        { distM: 30, severity: 5, ageDays: 0 },
      ],
      stationsNearbyM: [5000],
      openAmenitiesNearby: 0,
      motion: { state: 'still', stillSeconds: 900 },
      batteryPct: 5,
      missedCheckIn: true,
      safeWalk: { deviationM: 200, overdueSec: 600 },
    });
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.level).toBe('emergency');
  });

  it('always returns all 7 factor ids', () => {
    const r = computeRisk(BASE_INPUT);
    const ids = r.factors.map(f => f.id);
    expect(ids).toContain('time');
    expect(ids).toContain('zone');
    expect(ids).toContain('isolation');
    expect(ids).toContain('motion');
    expect(ids).toContain('safe_walk');
    expect(ids).toContain('battery');
    expect(ids).toContain('checkin');
  });

  it('level thresholds: <25 safe, <50 watchful, <75 alert, >=75 emergency', () => {
    // Manually check boundary
    const r1 = computeRisk({ ...BASE_INPUT });
    const sc = r1.score;
    if (sc < 25) expect(r1.level).toBe('safe');
    else if (sc < 50) expect(r1.level).toBe('watchful');
    else if (sc < 75) expect(r1.level).toBe('alert');
    else expect(r1.level).toBe('emergency');
  });
});
