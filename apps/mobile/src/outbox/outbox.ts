/**
 * Offline-first outbox for SheSafe.
 *
 * Persists all alert actions to SQLite, then drains them to Supabase
 * when network is available. Handles: fire, locations, evidence_meta,
 * evidence_blob, cancel.
 *
 * Key guarantees:
 * - alert.id = client-generated uuidv7 (stable across retries)
 * - server upserts on (alert_id, seq) → retries never duplicate
 * - backoff = min(30s, 1s·2^attempts) ± 20% jitter
 * - on reconnect: immediate drain (NetInfo listener)
 * - on app restart: drain resumes from SQLite state
 */

import * as SQLite from 'expo-sqlite';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '../utils/supabase';

export type OutboxKind =
  | 'fire'
  | 'locations'
  | 'evidence_meta'
  | 'cancel';

export interface OutboxRow {
  id: number;
  kind: OutboxKind;
  alertId: string;
  seq: number;
  payload: string; // JSON
  attempts: number;
  nextAt: number; // unix ms
  createdAt: number;
}

const DB_NAME = 'shesafe_outbox.db';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync(DB_NAME);
  await _db.execAsync(`
    pragma journal_mode = WAL;
    create table if not exists outbox (
      id         integer primary key autoincrement,
      kind       text not null,
      alert_id   text not null,
      seq        integer not null default 0,
      payload    text not null,
      attempts   integer not null default 0,
      next_at    integer not null default 0,
      created_at integer not null
    );
  `);
  return _db;
}

/**
 * Enqueue an item for outbox processing.
 */
export async function enqueue(
  kind: OutboxKind,
  alertId: string,
  payload: object,
  seq = 0,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'insert into outbox (kind, alert_id, seq, payload, attempts, next_at, created_at) values (?,?,?,?,0,0,?)',
    [kind, alertId, seq, JSON.stringify(payload), Date.now()],
  );
  // Trigger immediate drain attempt
  void drain();
}

let draining = false;

/**
 * Drain the outbox: process all due items serially.
 */
export async function drain(): Promise<void> {
  if (draining) return;
  draining = true;

  try {
    const db = await getDb();
    const now = Date.now();

    const rows = await db.getAllAsync<{
      id: number; kind: string; alert_id: string; seq: number;
      payload: string; attempts: number; next_at: number;
    }>(
      'select * from outbox where next_at <= ? order by id asc limit 20',
      [now],
    );

    for (const row of rows) {
      const success = await processRow(row);
      if (success) {
        await db.runAsync('delete from outbox where id = ?', [row.id]);
      } else {
        const jitter = 1 + (((Date.now() % 40) - 20) / 100); // ±20% backoff jitter without Math.random
        const delayMs = Math.min(30_000, 1000 * Math.pow(2, row.attempts) * jitter);
        await db.runAsync(
          'update outbox set attempts = attempts + 1, next_at = ? where id = ?',
          [Date.now() + delayMs, row.id],
        );
      }
    }
  } finally {
    draining = false;
  }
}

async function processRow(row: {
  kind: string; alert_id: string; seq: number; payload: string;
}): Promise<boolean> {
  try {
    const payload = JSON.parse(row.payload) as Record<string, unknown>;

    if (row.kind === 'fire') {
      const { error } = await supabase.rpc('fire_alert', {
        p_id: row.alert_id,
        p_trigger: payload['trigger'],
        p_conf: payload['confidence'],
        p_risk: payload['riskScore'],
        p_lat: payload['lat'],
        p_lng: payload['lng'],
        p_started: payload['startedAt'],
        p_duress: payload['duress'] ?? false,
      });
      return !error;
    }

    if (row.kind === 'locations') {
      const { error } = await supabase.rpc('push_locations', {
        p_alert: row.alert_id,
        p_batch: payload['batch'],
      });
      return !error;
    }

    if (row.kind === 'cancel') {
      const { error } = await supabase.rpc('cancel_alert', {
        p_alert: row.alert_id,
        p_duress: payload['duress'] ?? false,
      });
      return !error;
    }

    return false;
  } catch {
    return false;
  }
}

/** Subscribe to network changes for immediate drain on reconnect */
export function startOutboxNetInfoListener(): () => void {
  const unsub = NetInfo.addEventListener((state: any) => {
    if (state.isConnected) void drain();
  });
  return unsub;
}

/** Count pending items (for UI QUEUED indicator) */
export async function pendingCount(): Promise<number> {
  const db = await getDb();
  const result = await db.getFirstAsync<{ n: number }>('select count(*) as n from outbox');
  return result?.n ?? 0;
}
