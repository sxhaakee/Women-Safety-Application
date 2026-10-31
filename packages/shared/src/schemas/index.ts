/**
 * Zod schemas for all shared data types.
 * Used client-side (validation before outbox) and server-side (RPC inputs).
 */

import { z } from 'zod';

export const RoleSchema = z.enum(['victim', 'guardian', 'police', 'volunteer', 'admin']);
export type Role = z.infer<typeof RoleSchema>;

export const AlertStatusSchema = z.enum([
  'countdown',
  'active',
  'acknowledged',
  'dispatched',
  'resolved',
  'cancelled',
  'false_alarm',
]);
export type AlertStatusDb = z.infer<typeof AlertStatusSchema>;

export const TriggerTypeSchema = z.enum([
  'manual_sos',
  'shake',
  'struggle',
  'snatch',
  'scream',
  'dead_mans_switch',
  'safe_walk_deviation',
  'safe_walk_stationary',
  'safe_walk_overdue',
  'cab_deviation',
  'duress_pin',
]);
export type TriggerType = z.infer<typeof TriggerTypeSchema>;

export const LocationPointSchema = z.object({
  seq: z.number().int().nonnegative(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().nonnegative().optional(),
  speedMps: z.number().nonnegative().optional(),
  batteryPct: z.number().int().min(0).max(100).optional(),
  recordedAt: z.string().datetime(),
});
export type LocationPoint = z.infer<typeof LocationPointSchema>;

export const FireAlertInputSchema = z.object({
  id: z.string().uuid(), // client-generated uuidv7
  trigger: TriggerTypeSchema,
  confidence: z.number().min(0).max(1),
  riskScore: z.number().int().min(0).max(100),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  startedAt: z.string().datetime(),
  duress: z.boolean(),
});
export type FireAlertInput = z.infer<typeof FireAlertInputSchema>;

export const ProfileSchema = z.object({
  id: z.string().uuid(),
  role: RoleSchema,
  fullName: z.string().min(1).max(200),
  phone: z.string().optional(),
  lang: z.enum(['en', 'hi', 'kn']).default('en'),
  expoPushToken: z.string().optional(),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const CommunityReportSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  category: z.enum(['poor_lighting', 'harassment', 'stalking', 'isolated', 'other']),
  severity: z.number().int().min(1).max(5),
});
export type CommunityReport = z.infer<typeof CommunityReportSchema>;

export const SafeWalkDestinationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  label: z.string().max(300),
  etaSeconds: z.number().int().positive(),
});
export type SafeWalkDestination = z.infer<typeof SafeWalkDestinationSchema>;
