/**
 * OutboxDrain — Serial drain loop for the offline outbox
 *
 * - Drains ready jobs in order (fire → locations → audio/video → cancel)
 * - Retries with exponential backoff (min 1s, max 30s ± 20% jitter)
 * - NetInfo triggers immediate retry on reconnect
 * - Runs continuously while the app is open; safe to call multiple times (singleton)
 */
import NetInfo from '@react-native-community/netinfo';
import { BACKEND_URL } from '../utils/api';
import {
  outboxPending,
  outboxDelete,
  outboxRetry,
  OutboxRow,
} from './OutboxDB';

let drainRunning = false;
let drainTimer: ReturnType<typeof setTimeout> | null = null;

/** Start the drain loop — idempotent */
export function startDrain(): void {
  if (drainRunning) return;
  drainRunning = true;
  scheduleDrain(0);

  // Trigger immediate drain on network reconnect
  NetInfo.addEventListener((state) => {
    if (state.isConnected) {
      scheduleDrain(0);
    }
  });
}

/** Stop the drain loop */
export function stopDrain(): void {
  drainRunning = false;
  if (drainTimer) {
    clearTimeout(drainTimer);
    drainTimer = null;
  }
}

function scheduleDrain(delayMs: number) {
  if (!drainRunning) return;
  if (drainTimer) clearTimeout(drainTimer);
  drainTimer = setTimeout(drain, delayMs);
}

async function drain(): Promise<void> {
  if (!drainRunning) return;

  try {
    const rows = await outboxPending();
    for (const row of rows) {
      const ok = await sendJob(row);
      if (ok) {
        await outboxDelete(row.id);
        console.log(`[OUTBOX] ✅ Delivered ${row.kind}/${row.alert_id}#${row.seq}`);
      } else {
        await outboxRetry(row.id, row.attempts);
        console.log(`[OUTBOX] ⏳ Retry scheduled for ${row.kind}/${row.alert_id}#${row.seq} (attempt ${row.attempts + 1})`);
      }
    }
  } catch (e: any) {
    console.warn('[OUTBOX] Drain error:', e?.message);
  }

  // Poll every 5 s
  scheduleDrain(5000);
}

async function sendJob(row: OutboxRow): Promise<boolean> {
  const payload = JSON.parse(row.payload);

  try {
    switch (row.kind) {
      case 'fire': {
        const res = await fetch(`${BACKEND_URL}/api/alert/fire`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        return res.ok;
      }

      case 'locations': {
        // payload: { alert_id, locations: [{lat,lng,seq,ts}] }
        const locations: { lat: number; lng: number; seq: number; ts: string }[] = payload.locations || [];
        let ok = true;
        for (const loc of locations) {
          const res = await fetch(`${BACKEND_URL}/api/alert/location`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ alert_id: row.alert_id, lat: loc.lat, lng: loc.lng }),
          });
          if (!res.ok) ok = false;
        }
        return ok;
      }

      case 'audio': {
        // payload: { data (base64), mime, seq }
        const res = await fetch(`${BACKEND_URL}/api/recording/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            alert_id: row.alert_id,
            audio_b64: payload.data,
            mime_type: payload.mime || 'audio/m4a',
          }),
        });
        return res.ok;
      }

      case 'cancel': {
        const res = await fetch(`${BACKEND_URL}/api/alert/resolve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ alert_id: row.alert_id }),
        });
        return res.ok;
      }

      default:
        // Unknown kind — drop it
        return true;
    }
  } catch {
    return false;
  }
}
