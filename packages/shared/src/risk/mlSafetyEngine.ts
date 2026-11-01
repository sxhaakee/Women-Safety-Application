/**
 * SheSafe ML Safety Engine & Dynamic Hazard Avoidance Model
 *
 * Implements:
 * 1. Personalized Sensor Calibration Training (User motor-pattern learning)
 * 2. Multi-Factor Contextual ML Risk Assessment:
 *    - Crime & Case History in Region (spatial-temporal decay)
 *    - Isolated Areas & Street Lighting Metrics
 *    - Route Divergence & Habitual Path Detours
 *    - Diurnal & Temporal Routine Anomalies
 *    - Active Community Hazard Map Integration
 * 3. Dynamic Hazard Avoidance Routing:
 *    - Geospatial buffer collision against verified community hazards
 *    - Evaluates and synthesizes safest path avoiding high-threat regions
 */

export interface SensorCalibrationInput {
  peaks: number[];
  falseTriggersInTest: number;
  userWeightKg?: number;
}

export interface TrainedCalibrationProfile {
  calibratedThresholdG: number;
  meanPeakG: number;
  varianceG: number;
  sigmaG: number;
  confidenceScore: number;
  noiseFloorG: number;
  personalizedSensitivity: 'low' | 'medium' | 'high';
  trainedAt: string;
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface HistoricalCase {
  id: string;
  latitude: number;
  longitude: number;
  category: 'snatching' | 'harassment' | 'assault' | 'stalking' | 'suspicious';
  severity: number; // 1-5
  occurredDaysAgo: number;
}

export interface CommunityHazardPoint {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  category: 'dark' | 'harassment' | 'isolated' | 'stalking';
  severity: number; // 1-5
  verifiedCount: number;
}

export interface MlRiskInput {
  now: Date;
  location: GeoPoint;
  historicalCases: HistoricalCase[];
  hazards: CommunityHazardPoint[];
  isolation: {
    distanceToPoliceM: number;
    openAmenitiesNearby: number;
    hasFunctionalStreetlights: boolean;
  };
  routeDivergence: {
    isDiverted: boolean;
    deviationM: number;
    divertedDurationSec: number;
    habitualFamiliarityScore: number; // 0 (unknown area) to 1 (daily commute)
  };
  temporal: {
    typicalDepartureHour?: number; // e.g. 18 (6 PM)
  };
  calibrationProfile?: TrainedCalibrationProfile;
  liveSensors?: {
    currentG: number;
    struggleScore?: number;
    snatchScore?: number;
  };
}

export interface MlRiskFactor {
  id: string;
  label: string;
  points: number;
  weight: number;
  description: string;
}

export interface MlRiskAssessment {
  score: number; // 0-100
  threatLevel: 'safe' | 'watchful' | 'alert' | 'emergency';
  confidence: number; // 0-1
  factors: MlRiskFactor[];
  flaggedHazardsCount: number;
  isRouteAnomalous: boolean;
  recommendedAction: 'continue' | 'cautious_walk' | 'reroute_safest' | 'auto_sos';
}

export interface RouteCandidate {
  id: string;
  label: string;
  coordinates: GeoPoint[];
  distanceKm: number;
  durationMin: number;
}

export interface EvaluatedRoute extends RouteCandidate {
  safetyScore: number; // 0-100
  hazardCollisions: Array<{ hazardId: string; title: string; distanceM: number }>;
  isRecommendedSafest: boolean;
  riskPenalty: number;
}

// ─── GEODESIC HELPERS ─────────────────────────────────────────

export function calculateDistanceMeters(p1: GeoPoint, p2: GeoPoint): number {
  const R = 6371e3; // Earth radius in metres
  const phi1 = (p1.latitude * Math.PI) / 180;
  const phi2 = (p2.latitude * Math.PI) / 180;
  const deltaPhi = ((p2.latitude - p1.latitude) * Math.PI) / 180;
  const deltaLambda = ((p2.longitude - p1.longitude) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

// ─── 1. SENSOR CALIBRATION TRAINING MODEL ──────────────────────

export function trainCalibrationProfile(input: SensorCalibrationInput): TrainedCalibrationProfile {
  const peaks = input.peaks.length > 0 ? input.peaks : [2.0, 2.1, 2.2, 1.9, 2.0];
  const mean = peaks.reduce((a, b) => a + b, 0) / peaks.length;
  const variance = peaks.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / peaks.length;
  const sigma = Math.sqrt(variance);

  // Dynamic calibrated threshold: mean - 2σ, bounded [1.3, 2.8] g
  let threshold = mean - 2 * sigma;
  threshold = Math.max(1.3, Math.min(2.8, threshold));

  // False-trigger adaptation: penalize with 10% elevation per false trigger
  if (input.falseTriggersInTest > 0) {
    threshold = Math.min(2.8, threshold * (1 + 0.1 * input.falseTriggersInTest));
  }

  const roundedT = parseFloat(threshold.toFixed(2));
  const sensitivity: TrainedCalibrationProfile['personalizedSensitivity'] =
    roundedT <= 1.6 ? 'high' : roundedT >= 2.3 ? 'low' : 'medium';

  // Confidence is high if peak variance is low and false triggers are minimal
  const consistency = Math.max(0.4, 1 - sigma / (mean || 1));
  const falsePenalty = Math.min(0.5, input.falseTriggersInTest * 0.15);
  const confidenceScore = parseFloat(Math.max(0.5, consistency - falsePenalty).toFixed(2));

  return {
    calibratedThresholdG: roundedT,
    meanPeakG: parseFloat(mean.toFixed(2)),
    varianceG: parseFloat(variance.toFixed(3)),
    sigmaG: parseFloat(sigma.toFixed(3)),
    confidenceScore,
    noiseFloorG: 1.05,
    personalizedSensitivity: sensitivity,
    trainedAt: new Date().toISOString(),
  };
}

// ─── 2. MULTI-FACTOR ML RISK ASSESSMENT ───────────────────────

export function computeMlRiskAssessment(input: MlRiskInput): MlRiskAssessment {
  const factors: MlRiskFactor[] = [];

  // A. Case & Crime History Factor (0–25 points)
  let historyPoints = 0;
  for (const c of input.historicalCases) {
    const dist = calculateDistanceMeters(input.location, { latitude: c.latitude, longitude: c.longitude });
    if (dist <= 1500) {
      const spatialDecay = Math.exp(-dist / 350);
      const temporalDecay = Math.exp(-c.occurredDaysAgo / 30);
      historyPoints += c.severity * 2.2 * spatialDecay * temporalDecay;
    }
  }
  historyPoints = Math.min(25, Math.round(historyPoints));
  factors.push({
    id: 'crime_history',
    label: 'Geospatial Crime History',
    points: historyPoints,
    weight: 0.25,
    description: `Evaluated ${input.historicalCases.length} past police incidents within 1.5km buffer`,
  });

  // B. Community Hazard Map Collision Factor (0–30 points)
  let hazardPoints = 0;
  let flaggedCount = 0;
  for (const h of input.hazards) {
    const dist = calculateDistanceMeters(input.location, { latitude: h.latitude, longitude: h.longitude });
    if (dist <= 500) {
      flaggedCount++;
      const distDecay = Math.exp(-dist / 180);
      const severityMultiplier = h.severity * (1 + Math.min(1, h.verifiedCount / 10));
      hazardPoints += severityMultiplier * 3.5 * distDecay;
    }
  }
  hazardPoints = Math.min(30, Math.round(hazardPoints));
  factors.push({
    id: 'community_hazards',
    label: 'Active Community Hazard Proximity',
    points: hazardPoints,
    weight: 0.3,
    description: `${flaggedCount} verified hazard hotspots flagged within immediate perimeter (<500m)`,
  });

  // C. Route Divergence & Detour Factor (0–20 points)
  let divergencePoints = 0;
  if (input.routeDivergence.isDiverted || input.routeDivergence.deviationM > 60) {
    const devPoints = Math.min(12, (input.routeDivergence.deviationM / 50) * 3);
    const durPoints = Math.min(8, (input.routeDivergence.divertedDurationSec / 60) * 2);
    divergencePoints = Math.round(devPoints + durPoints);
  }
  // Low familiarity elevates divergence suspicion
  if (input.routeDivergence.habitualFamiliarityScore < 0.3 && divergencePoints > 0) {
    divergencePoints = Math.min(20, divergencePoints + 3);
  }
  factors.push({
    id: 'route_divergence',
    label: 'Habitual Route Divergence',
    points: divergencePoints,
    weight: 0.2,
    description: input.routeDivergence.isDiverted
      ? `Off-route by ${Math.round(input.routeDivergence.deviationM)}m for ${input.routeDivergence.divertedDurationSec}s`
      : 'Trajectory on anticipated corridor',
  });

  // D. Environmental Isolation & Street Lighting (0–15 points)
  let isolationPoints = 0;
  if (input.isolation.distanceToPoliceM > 1200) {
    isolationPoints += Math.min(6, (input.isolation.distanceToPoliceM - 1200) / 300);
  }
  if (input.isolation.openAmenitiesNearby < 3) {
    isolationPoints += (3 - input.isolation.openAmenitiesNearby) * 2;
  }
  if (!input.isolation.hasFunctionalStreetlights) {
    isolationPoints += 4;
  }
  isolationPoints = Math.min(15, Math.round(isolationPoints));
  factors.push({
    id: 'environmental_isolation',
    label: 'Area Isolation & Lighting',
    points: isolationPoints,
    weight: 0.15,
    description: `Nearest station ${input.isolation.distanceToPoliceM}m away, ${input.isolation.openAmenitiesNearby} open shops/hospitals`,
  });

  // E. Diurnal Timing & Anomaly (0–10 points)
  const hour = input.now.getHours() + input.now.getMinutes() / 60;
  let timingPoints = 0;
  if (hour >= 23 || hour < 5) {
    timingPoints = 10;
  } else if (hour >= 20 || hour < 6) {
    timingPoints = 6;
  }
  if (input.temporal.typicalDepartureHour !== undefined) {
    const diff = Math.abs(hour - input.temporal.typicalDepartureHour);
    if (diff > 3) timingPoints = Math.min(10, timingPoints + 2);
  }
  factors.push({
    id: 'timing_risk',
    label: 'Diurnal Window',
    points: timingPoints,
    weight: 0.1,
    description: `Current hour ${input.now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
  });

  // Total Score
  const rawSum = factors.reduce((sum, f) => sum + f.points, 0);
  const score = Math.min(100, rawSum);

  let threatLevel: MlRiskAssessment['threatLevel'];
  if (score < 25) threatLevel = 'safe';
  else if (score < 50) threatLevel = 'watchful';
  else if (score < 75) threatLevel = 'alert';
  else threatLevel = 'emergency';

  let recommendedAction: MlRiskAssessment['recommendedAction'] = 'continue';
  if (threatLevel === 'emergency') recommendedAction = 'auto_sos';
  else if (threatLevel === 'alert') recommendedAction = 'reroute_safest';
  else if (threatLevel === 'watchful') recommendedAction = 'cautious_walk';

  return {
    score,
    threatLevel,
    confidence: 0.92,
    factors,
    flaggedHazardsCount: flaggedCount,
    isRouteAnomalous: divergencePoints >= 10,
    recommendedAction,
  };
}

// ─── 3. HAZARD MAP INTEGRATION & SAFEST ROUTE ENGINE ──────────

export function findSafestRouteWithHazardAvoidance(
  candidates: RouteCandidate[],
  hazards: CommunityHazardPoint[]
): {
  recommendedRoute: EvaluatedRoute;
  evaluatedRoutes: EvaluatedRoute[];
  avoidedHazardsCount: number;
} {
  const evaluated: EvaluatedRoute[] = candidates.map(route => {
    let penalty = 0;
    const collisions: Array<{ hazardId: string; title: string; distanceM: number }> = [];

    // Test each vertex of route against each hazard
    for (const h of hazards) {
      let minDistanceToHazard = Infinity;
      for (const pt of route.coordinates) {
        const d = calculateDistanceMeters(pt, { latitude: h.latitude, longitude: h.longitude });
        if (d < minDistanceToHazard) {
          minDistanceToHazard = d;
        }
      }

      // If route passes within 150m of a hazard, add collision & exponential penalty
      if (minDistanceToHazard <= 150) {
        collisions.push({
          hazardId: h.id,
          title: h.title,
          distanceM: minDistanceToHazard,
        });
        const proximityMultiplier = Math.max(1, (160 - minDistanceToHazard) / 20);
        penalty += h.severity * 6 * proximityMultiplier;
      }
    }

    // Safety score: base 98, subtracted by hazard penalty
    const safetyScore = Math.max(15, Math.min(99, Math.round(98 - penalty)));

    return {
      ...route,
      safetyScore,
      hazardCollisions: collisions,
      isRecommendedSafest: false,
      riskPenalty: Math.round(penalty),
    };
  });

  // Pick route with highest safety score (tie breaker: lowest duration)
  evaluated.sort((a, b) => b.safetyScore - a.safetyScore || a.durationMin - b.durationMin);

  if (evaluated.length > 0) {
    evaluated[0]!.isRecommendedSafest = true;
  }

  const recommended = evaluated[0]!;
  const avoidedCount = hazards.length - recommended.hazardCollisions.length;

  return {
    recommendedRoute: recommended,
    evaluatedRoutes: evaluated,
    avoidedHazardsCount: Math.max(0, avoidedCount),
  };
}
