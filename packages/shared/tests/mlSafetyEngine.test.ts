import { describe, it, expect } from 'vitest';
import {
  trainCalibrationProfile,
  computeMlRiskAssessment,
  findSafestRouteWithHazardAvoidance,
  calculateDistanceMeters,
  GeoPoint,
  CommunityHazardPoint,
  HistoricalCase,
  RouteCandidate,
} from '../src/risk/mlSafetyEngine';

describe('SheSafe ML Safety Engine', () => {
  it('trainCalibrationProfile learns user motor threshold and penalizes false triggers', () => {
    const rawProfile = trainCalibrationProfile({
      peaks: [2.2, 2.1, 2.3, 2.0, 2.2],
      falseTriggersInTest: 0,
    });
    expect(rawProfile.calibratedThresholdG).toBeGreaterThanOrEqual(1.3);
    expect(rawProfile.calibratedThresholdG).toBeLessThanOrEqual(2.8);
    expect(rawProfile.confidenceScore).toBeGreaterThan(0.7);

    // Profile with false triggers must increase threshold to reject noise
    const noisyProfile = trainCalibrationProfile({
      peaks: [2.2, 2.1, 2.3, 2.0, 2.2],
      falseTriggersInTest: 2,
    });
    expect(noisyProfile.calibratedThresholdG).toBeGreaterThan(rawProfile.calibratedThresholdG);
  });

  it('calculateDistanceMeters calculates accurate geodesic distance between coordinates', () => {
    const p1: GeoPoint = { latitude: 12.9141, longitude: 74.8560 };
    const p2: GeoPoint = { latitude: 12.9141, longitude: 74.8570 };
    const d = calculateDistanceMeters(p1, p2);
    expect(d).toBeGreaterThan(90);
    expect(d).toBeLessThan(120);
  });

  it('computeMlRiskAssessment integrates historical cases, hazards, isolation, and route divergence', () => {
    const loc: GeoPoint = { latitude: 12.9141, longitude: 74.8560 };

    const hazards: CommunityHazardPoint[] = [
      {
        id: 'h1',
        latitude: 12.9145,
        longitude: 74.8562,
        title: 'Dark Alleyway',
        category: 'dark',
        severity: 5,
        verifiedCount: 12,
      },
    ];

    const historicalCases: HistoricalCase[] = [
      {
        id: 'c1',
        latitude: 12.9150,
        longitude: 74.8565,
        category: 'harassment',
        severity: 4,
        occurredDaysAgo: 2,
      },
    ];

    // High risk scenario: off route + near hazard + midnight + far from police
    const assessment = computeMlRiskAssessment({
      now: new Date('2026-11-01T23:30:00Z'),
      location: loc,
      historicalCases,
      hazards,
      isolation: {
        distanceToPoliceM: 2200,
        openAmenitiesNearby: 0,
        hasFunctionalStreetlights: false,
      },
      routeDivergence: {
        isDiverted: true,
        deviationM: 180,
        divertedDurationSec: 150,
        habitualFamiliarityScore: 0.1,
      },
      temporal: {
        typicalDepartureHour: 18,
      },
    });

    expect(assessment.score).toBeGreaterThan(50);
    expect(assessment.flaggedHazardsCount).toBeGreaterThanOrEqual(1);
    expect(assessment.isRouteAnomalous).toBe(true);
    expect(['alert', 'emergency']).toContain(assessment.threatLevel);
    expect(assessment.factors.some(f => f.id === 'community_hazards')).toBe(true);
    expect(assessment.factors.some(f => f.id === 'route_divergence')).toBe(true);
  });

  it('findSafestRouteWithHazardAvoidance flags hazards on unsafe path and recommends safest alternative', () => {
    const hazards: CommunityHazardPoint[] = [
      {
        id: 'hz-danger',
        title: 'Harassment Hotspot',
        category: 'harassment',
        severity: 5,
        verifiedCount: 8,
        latitude: 12.9150,
        longitude: 74.8550,
      },
    ];

    // Route 1 passes right through the hazard
    const dangerousFastRoute: RouteCandidate = {
      id: 'r1',
      label: 'Direct Alleyway (Fastest)',
      distanceKm: 1.1,
      durationMin: 12,
      coordinates: [
        { latitude: 12.9140, longitude: 74.8550 },
        { latitude: 12.9150, longitude: 74.8550 }, // directly hits hazard
        { latitude: 12.9160, longitude: 74.8550 },
      ],
    };

    // Route 2 goes around via main avenue
    const safeAvenueRoute: RouteCandidate = {
      id: 'r2',
      label: 'Main Lit Avenue (Safest)',
      distanceKm: 1.3,
      durationMin: 14,
      coordinates: [
        { latitude: 12.9140, longitude: 74.8550 },
        { latitude: 12.9140, longitude: 74.8600 }, // bypasses hazard > 500m away
        { latitude: 12.9160, longitude: 74.8600 },
      ],
    };

    const result = findSafestRouteWithHazardAvoidance([dangerousFastRoute, safeAvenueRoute], hazards);

    expect(result.recommendedRoute.id).toBe('r2');
    expect(result.recommendedRoute.safetyScore).toBeGreaterThan(result.evaluatedRoutes.find(r => r.id === 'r1')!.safetyScore);
    expect(result.evaluatedRoutes.find(r => r.id === 'r1')!.hazardCollisions.length).toBeGreaterThanOrEqual(1);
  });
});
