/**
 * Risk Engine — Explainable, deterministic, no Math.random.
 *
 * Returns a score 0–100 with per-factor breakdown.
 * Levels: <25 safe, <50 watchful, <75 alert, >=75 emergency
 *
 * All formulas documented here — every factor visible to the user
 * via a "Why this score?" UI component.
 */

export interface RiskInput {
  /** Current datetime */
  now: Date;
  lat: number;
  lng: number;
  safeHours: { start: string; end: string }; // "HH:MM" format
  /** Nearby unsafe reports */
  reportsNearby: Array<{ distM: number; severity: number; ageDays: number }>;
  /** Distances to nearest police stations in metres */
  stationsNearbyM: number[];
  /** Count of open amenities nearby (shops, hospitals etc.) */
  openAmenitiesNearby: number;
  motion: {
    state: 'still' | 'walk' | 'run' | 'vehicle';
    stillSeconds: number;
  };
  safeWalk?: { deviationM: number; overdueSec: number };
  batteryPct: number;
  missedCheckIn: boolean;
}

export interface RiskFactor {
  id: string;
  label: string;
  points: number;
}

export interface RiskOutput {
  /** 0–100 */
  score: number;
  level: 'safe' | 'watchful' | 'alert' | 'emergency';
  factors: RiskFactor[];
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function parseHour(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) + (m ?? 0) / 60;
}

/**
 * Compute risk score.
 * Maximum total = 20 + 30 + 15 + 15 + 15 + 5 + 10 = 110 (cap at 100)
 */
export function computeRisk(input: RiskInput): RiskOutput {
  const factors: RiskFactor[] = [];

  // ── TIME FACTOR (0–20) ─────────────────────────────────────
  const hour = input.now.getHours() + input.now.getMinutes() / 60;
  const safeEnd = parseHour(input.safeHours.end);
  const safeStart = parseHour(input.safeHours.start);
  let timePoints = 0;

  // Peak danger: 00:00–05:00
  if (hour >= 0 && hour < 5) {
    timePoints = 20 * smoothstep(0, 1, Math.min(1, (hour < 3 ? hour / 3 : (5 - hour) / 2)));
    // Always at least 12 in 0-5h window
    timePoints = Math.max(timePoints, 12);
  } else if (hour > safeEnd) {
    // After safe hours
    timePoints = 20 * smoothstep(safeEnd, safeEnd + 4, hour);
  } else if (hour < safeStart) {
    timePoints = 20 * smoothstep(safeStart - 2, safeStart, hour < safeStart ? safeStart - hour : 0);
  }
  timePoints = Math.min(20, timePoints);
  factors.push({ id: 'time', label: 'Time of day', points: timePoints });

  // ── ZONE FACTOR (0–30) ────────────────────────────────────
  let zonePoints = 0;
  for (const r of input.reportsNearby) {
    const decayAge = Math.exp(-Math.log(2) * r.ageDays / 14);
    const decayDist = Math.exp(-r.distM / 150);
    zonePoints += r.severity * decayAge * decayDist;
  }
  zonePoints = 30 * Math.min(1, zonePoints / 8);
  factors.push({ id: 'zone', label: 'Nearby reports', points: Math.round(zonePoints) });

  // ── ISOLATION FACTOR (0–15) ───────────────────────────────
  const minStationDist =
    input.stationsNearbyM.length > 0
      ? Math.min(...input.stationsNearbyM)
      : Infinity;
  const stationFar = minStationDist > 1500 ? 1 : 0.5;
  const amenityFrac = 1 - Math.min(1, input.openAmenitiesNearby / 5);
  const isolationPoints = 15 * amenityFrac * stationFar;
  factors.push({ id: 'isolation', label: 'Area isolation', points: Math.round(isolationPoints) });

  // ── MOTION FACTOR (0–15) ──────────────────────────────────
  let motionPoints = 0;
  if (input.motion.state === 'still' && input.motion.stillSeconds >= 180) {
    // 180s → starts at 4.5; 600s → full 15
    motionPoints = 15 * Math.min(1, (input.motion.stillSeconds - 180) / 420 * 0.7 + 0.3);
  }
  factors.push({ id: 'motion', label: 'Prolonged stillness', points: Math.round(motionPoints) });

  // ── SAFE WALK FACTOR (0–15) ───────────────────────────────
  let walkPoints = 0;
  if (input.safeWalk) {
    if (input.safeWalk.deviationM > 80) walkPoints += 8;
    if (input.safeWalk.overdueSec > 300) walkPoints += 7;
  }
  walkPoints = Math.min(15, walkPoints);
  factors.push({ id: 'safe_walk', label: 'Safe Walk deviation', points: walkPoints });

  // ── BATTERY FACTOR (0–5) ──────────────────────────────────
  let batteryPoints = 0;
  if (input.batteryPct < 10) batteryPoints = 5;
  else if (input.batteryPct < 20) batteryPoints = 2;
  factors.push({ id: 'battery', label: 'Low battery', points: batteryPoints });

  // ── CHECK-IN FACTOR (0–10) ────────────────────────────────
  const checkInPoints = input.missedCheckIn ? 10 : 0;
  factors.push({ id: 'checkin', label: 'Missed check-in', points: checkInPoints });

  // ── TOTAL ─────────────────────────────────────────────────
  const raw = factors.reduce((s, f) => s + f.points, 0);
  const score = Math.min(100, Math.round(raw));

  let level: RiskOutput['level'];
  if (score < 25) level = 'safe';
  else if (score < 50) level = 'watchful';
  else if (score < 75) level = 'alert';
  else level = 'emergency';

  return { score, level, factors };
}
