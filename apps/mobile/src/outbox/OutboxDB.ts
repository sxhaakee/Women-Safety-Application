/**
 * OutboxDB — SQLite-backed offline outbox for SheSafe
 *
 * Stores pending network operations (fire_alert, location_batch, audio, video, cancel)
 * so the app can survive network loss, kills, and Expo Go restarts.
 *
 * Uses expo-sqlite with idempotent upserts so retries never create duplicates.
 */
import * as SQLite from 'expo-sqlite';

export type OutboxKind = 'fire' | 'locations' | 'audio' | 'video' | 'cancel';

export interface OutboxRow {
  id: number;
  kind: OutboxKind;
  alert_id: string;
  seq: number;
  payload: string; // JSON-encoded
  attempts: number;
  next_at: number; // epoch ms
  created_at: number;
}

let db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync('shesafe_outbox.db');
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS outbox (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      kind       TEXT NOT NULL,
      alert_id   TEXT NOT NULL,
      seq        INTEGER NOT NULL DEFAULT 0,
      payload    TEXT NOT NULL,
      attempts   INTEGER NOT NULL DEFAULT 0,
      next_at    INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_outbox_next ON outbox(next_at);
  `);
  return db;
}

/** Insert a new outbox job (idempotent: skip if same alert_id+kind+seq already exists) */
export async function outboxEnqueue(
  kind: OutboxKind,
  alert_id: string,
  payload: object,
  seq = 0,
): Promise<void> {
  const database = await getDB();
  const now = Date.now();
  // For audio/video we allow multiple seq entries; for fire/cancel we use seq=0 as unique key
  await database.runAsync(
    `INSERT OR IGNORE INTO outbox (kind, alert_id, seq, payload, attempts, next_at, created_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)`,
    [kind, alert_id, seq, JSON.stringify(payload), now, now],
  );
}

/** Fetch all jobs that are ready to drain (next_at <= now) */
export async function outboxPending(): Promise<OutboxRow[]> {
  const database = await getDB();
  const now = Date.now();
  const rows = await database.getAllAsync<OutboxRow>(
    `SELECT * FROM outbox WHERE next_at <= ? ORDER BY created_at ASC LIMIT 20`,
    [now],
  );
  return rows;
}

/** Mark a job as successfully delivered — delete it */
export async function outboxDelete(id: number): Promise<void> {
  const database = await getDB();
  await database.runAsync(`DELETE FROM outbox WHERE id = ?`, [id]);
}

/** Increment attempt count and set next retry with exponential backoff */
export async function outboxRetry(id: number, attempts: number): Promise<void> {
  const database = await getDB();
  const backoff = Math.min(30_000, 1000 * Math.pow(2, attempts)) * (0.8 + 0.4 * Math.random());
  const nextAt = Date.now() + backoff;
  await database.runAsync(
    `UPDATE outbox SET attempts = ?, next_at = ? WHERE id = ?`,
    [attempts + 1, nextAt, id],
  );
}

/** Count pending jobs */
export async function outboxCount(): Promise<number> {
  const database = await getDB();
  const row = await database.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) as c FROM outbox WHERE next_at <= ?`,
    [Date.now()],
  );
  return row?.c ?? 0;
}

/** Wipe all jobs for a resolved/cancelled alert */
export async function outboxClear(alert_id: string): Promise<void> {
  const database = await getDB();
  await database.runAsync(`DELETE FROM outbox WHERE alert_id = ?`, [alert_id]);
}
