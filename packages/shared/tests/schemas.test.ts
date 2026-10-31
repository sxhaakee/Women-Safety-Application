import { describe, it, expect } from 'vitest';
import {
  RoleSchema, AlertStatusSchema, TriggerTypeSchema,
  FireAlertInputSchema, LocationPointSchema, ProfileSchema,
  CommunityReportSchema, SafeWalkDestinationSchema,
} from '../src/schemas/index';

describe('Zod Schemas', () => {
  it('RoleSchema accepts valid roles', () => {
    for (const r of ['victim','guardian','police','volunteer','admin'] as const) {
      expect(RoleSchema.parse(r)).toBe(r);
    }
  });

  it('RoleSchema rejects invalid', () => {
    expect(() => RoleSchema.parse('superuser')).toThrow();
  });

  it('AlertStatusSchema validates all statuses', () => {
    const statuses = ['countdown','active','acknowledged','dispatched','resolved','cancelled','false_alarm'];
    for (const s of statuses) expect(AlertStatusSchema.parse(s)).toBe(s);
  });

  it('TriggerTypeSchema validates all triggers', () => {
    const triggers = ['manual_sos','shake','struggle','snatch','scream','dead_mans_switch',
      'safe_walk_deviation','safe_walk_stationary','safe_walk_overdue','cab_deviation','duress_pin'];
    for (const t of triggers) expect(TriggerTypeSchema.parse(t)).toBe(t);
  });

  it('FireAlertInputSchema validates a valid payload', () => {
    const valid = {
      id: '01930000-0000-7000-8000-000000000001',
      trigger: 'shake',
      confidence: 0.9,
      riskScore: 42,
      lat: 12.9716,
      lng: 77.5946,
      startedAt: new Date().toISOString(),
      duress: false,
    };
    expect(() => FireAlertInputSchema.parse(valid)).not.toThrow();
  });

  it('FireAlertInputSchema rejects out-of-range confidence', () => {
    const bad = {
      id: '01930000-0000-7000-8000-000000000001',
      trigger: 'shake',
      confidence: 1.5,
      riskScore: 42,
      lat: 12.9716,
      lng: 77.5946,
      startedAt: new Date().toISOString(),
      duress: false,
    };
    expect(() => FireAlertInputSchema.parse(bad)).toThrow();
  });

  it('LocationPointSchema validates', () => {
    expect(() => LocationPointSchema.parse({ seq: 0, lat: 12.9716, lng: 77.5946, recordedAt: new Date().toISOString() })).not.toThrow();
  });

  it('LocationPointSchema rejects out-of-range lat/lng', () => {
    expect(() => LocationPointSchema.parse({ seq: 0, lat: 200, lng: 77.5946, recordedAt: new Date().toISOString() })).toThrow();
  });

  it('ProfileSchema validates', () => {
    expect(() => ProfileSchema.parse({ id: '01930000-0000-7000-8000-000000000001', role: 'victim', fullName: 'Test User', lang: 'en' })).not.toThrow();
  });

  it('CommunityReportSchema validates severity 1-5', () => {
    expect(() => CommunityReportSchema.parse({ lat: 12.9716, lng: 77.5946, category: 'poor_lighting', severity: 3 })).not.toThrow();
    expect(() => CommunityReportSchema.parse({ lat: 12.9716, lng: 77.5946, category: 'poor_lighting', severity: 6 })).toThrow();
  });

  it('SafeWalkDestinationSchema validates', () => {
    expect(() => SafeWalkDestinationSchema.parse({ lat: 12.9716, lng: 77.5946, label: 'Home', etaSeconds: 600 })).not.toThrow();
  });
});
