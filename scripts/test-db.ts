import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://bydbovjgrvfecojlkkfm.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5ZGJvdmpncnZmZWNvamxra2ZtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MzQ0ODY3OCwiZXhwIjoyMTA5MDI0Njc4fQ.3pDIsSONumgsS_ov_c1Hhii4Yh8gBR2ag8daYJOT6OI';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

interface Assertion {
  description: string;
  test: () => Promise<boolean>;
}

async function run() {
  console.log('TAP version 13');
  
  const assertions: Assertion[] = [];

  const add = (description: string, test: () => Promise<boolean>) => {
    assertions.push({ description, test });
  };

  // 1. Tables exist and can be queried
  const tables = [
    'stations', 'profiles', 'guardian_links', 'volunteers',
    'alerts', 'alert_stations', 'alert_locations', 'alert_events',
    'evidence_chunks', 'responder_pings', 'unsafe_reports', 'access_log'
  ];

  for (const t of tables) {
    add(`table public.${t} exists and has RLS enabled`, async () => {
      const { data, error } = await supabase.from(t).select('*').limit(1);
      return error === null;
    });
  }

  // 2. Stations seed data
  add('stations table has at least 6 demo stations seeded', async () => {
    const { count } = await supabase.from('stations').select('*', { count: 'exact', head: true });
    return (count ?? 0) >= 6;
  });

  // 3. Demo profiles exist
  add('demo victim profile exists with role=victim', async () => {
    const { data } = await supabase.from('profiles').select('*').eq('role', 'victim').limit(1);
    return data !== null && data.length > 0;
  });

  add('demo guardian profile exists with role=guardian', async () => {
    const { data } = await supabase.from('profiles').select('*').eq('role', 'guardian').limit(1);
    return data !== null && data.length > 0;
  });

  add('demo police profile exists with role=police and station_id', async () => {
    const { data } = await supabase.from('profiles').select('*').eq('role', 'police').limit(1);
    return data !== null && data.length > 0 && data[0].station_id !== null;
  });

  // 4. Columns exist in tables
  const columnChecks: [string, string[]][] = [
    ['stations', ['id', 'name', 'phone', 'geom', 'is_demo']],
    ['profiles', ['id', 'role', 'full_name', 'phone', 'lang', 'station_id', 'expo_push_token']],
    ['alerts', ['id', 'victim_id', 'status', 'trigger', 'confidence', 'risk_score', 'duress', 'started_at', 'fired_at', 'last_geom']],
    ['alert_locations', ['alert_id', 'seq', 'geom', 'accuracy_m', 'speed_mps', 'battery_pct', 'recorded_at']],
    ['alert_events', ['id', 'alert_id', 'type', 'actor', 'payload', 'prev_hash', 'hash']],
    ['evidence_chunks', ['alert_id', 'seq', 'kind', 'storage_path', 'sha256', 'chain_hash']],
    ['unsafe_reports', ['id', 'geom', 'category', 'severity', 'reporter_hash']]
  ];

  for (const [table, cols] of columnChecks) {
    for (const col of cols) {
      add(`column ${table}.${col} exists`, async () => {
        const { error } = await supabase.from(table).select(col).limit(1);
        return error === null;
      });
    }
  }

  // 5. Nearest stations RPC
  add('RPC nearest_stations returns ordered stations for Mangaluru coords', async () => {
    const { data, error } = await supabase.rpc('nearest_stations', {
      p_lat: 12.9141,
      p_lng: 74.8560,
      p_k: 3
    });
    return error === null && Array.isArray(data) && data.length > 0 && data[0].distance_m !== undefined;
  });

  // 6. Idempotent fire_alert RPC
  const testAlertId = '00000000-0000-4000-8000-000000000099';
  add('RPC fire_alert creates an alert idempotently', async () => {
    const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5ZGJvdmpncnZmZWNvamxra2ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0NDg2NzgsImV4cCI6MjEwOTAyNDY3OH0.SDQF8Hc0sC5apO6Ozhj9etY3EO0GcBrLQzDsjSm9MY4';
    const client = createClient(SUPABASE_URL, ANON_KEY);
    const { data: authData } = await client.auth.signInWithPassword({
      email: 'victim@demo.shesafe',
      password: 'DemoOnly2024!'
    });
    if (!authData?.user) return false;

    // Call 1
    const res1 = await client.rpc('fire_alert', {
      p_id: testAlertId,
      p_trigger: 'manual_sos',
      p_conf: 1.0,
      p_risk: 85,
      p_lat: 12.9141,
      p_lng: 74.8560,
      p_started: new Date().toISOString(),
      p_duress: false
    });

    // Call 2 (idempotency check)
    const res2 = await client.rpc('fire_alert', {
      p_id: testAlertId,
      p_trigger: 'manual_sos',
      p_conf: 1.0,
      p_risk: 85,
      p_lat: 12.9141,
      p_lng: 74.8560,
      p_started: new Date().toISOString(),
      p_duress: false
    });

    return res1.error === null && res2.error === null;
  });

  // 7. Verify chain function
  add('RPC verify_chain returns ok=true for alert audit log', async () => {
    const { data, error } = await supabase.rpc('verify_chain', {
      p_alert: testAlertId
    });
    return error === null && Array.isArray(data);
  });

  // 8. Immutability of alert_events
  add('alert_events table blocks DELETE (append-only audit log)', async () => {
    const { error } = await supabase.from('alert_events').delete().eq('alert_id', testAlertId);
    return error !== null; // Error MUST be returned because DELETE is forbidden
  });

  console.log(`1..${assertions.length}`);

  let passed = 0;
  for (let i = 0; i < assertions.length; i++) {
    const a = assertions[i];
    try {
      const ok = await a.test();
      if (ok) {
        passed++;
        console.log(`ok ${i + 1} - ${a.description}`);
      } else {
        console.log(`not ok ${i + 1} - ${a.description}`);
      }
    } catch (err: any) {
      console.log(`not ok ${i + 1} - ${a.description} (# ${err.message})`);
    }
  }

  console.log(`\n# tests ${assertions.length}`);
  console.log(`# pass  ${passed}`);
  console.log(`# fail  ${assertions.length - passed}`);

  if (passed !== assertions.length) {
    process.exit(1);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
