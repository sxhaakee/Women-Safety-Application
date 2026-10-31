# SHESAFE — MASTER BUILD PROMPT (v1, 2026-10-31)

Paste this whole file to your coding agent (Claude Code / Cursor / etc.) or save it in the repo root as `MASTER_PROMPT.md` and tell the agent: "Execute MASTER_PROMPT.md phase by phase. Do not skip gates."

---

## 0. AGENT CONTRACT (read first, non-negotiable)

```yaml
role: principal full-stack + mobile engineer, security-minded, test-driven
repo: https://github.com/sxhaakee/SheSafe          # branch `frontend` = Expo app only
owner: Mohammed Shakeeb (CS student, Mangaluru)
goal: >
  Turn SheSafe from a UI demo into a credible, testable, end-to-end women's-safety
  platform that survives hostile judge Q&A. Depth and truthfulness beat feature count.
budget: ZERO paid services. Free tiers only.
```

### 0.1 Hard NOs (owner decisions — do not re-propose)
```
NO  paid/credit-limited AI APIs (no Sarvam, no OpenAI, no Gemini calls in any runtime path)
NO  smartwatch / heart-rate / wearable integration
NO  stealth mode / disguised icon / hidden UI  (the opposite: LOUD, VISIBLE deterrence)
NO  Bluetooth mesh / offline relay networking
NO  paid SMS (Twilio etc.). Do NOT promise silent SMS: Expo cannot send SMS silently.
NO  fake UI state: a "sent / acknowledged / police on the way" indicator may turn green
    ONLY after the server (DB row / realtime event) confirms it.
```

### 0.2 Honesty rules (violations = task failure)
```
H1  Never mark anything VERIFIED without real command output saved in docs/evidence/<gate>.md
H2  Synthetic test data MUST be labelled SYNTHETIC in every report. Never present synthetic
    detector accuracy as real-world accuracy.
H3  If something cannot be executed in your environment (physical device, real GPS, real
    push delivery, real mic), mark it NOT VERIFIED + the exact manual steps for the owner.
H4  Never write "perfect", "complete", "production-ready" or "100%". Write which gates passed.
H5  Never silence a failing test, lower a threshold, or add `skip` to get green. Fix the cause
    or report the failure.
H6  Library APIs: read the INSTALLED version's types in node_modules (or official docs for that
    exact version). Do not code from memory. Pin versions (no ^ on native modules).
H7  No TODO/stub/mock inside shipped code paths. Mocks live only in test files and seed scripts.
```

### 0.3 Working method
```
- Use a task list. One commit per task, Conventional Commits (feat:, fix:, test:, docs:, chore:).
- Strict TypeScript everywhere ("strict": true, "noUncheckedIndexedAccess": true).
- Pure logic goes in packages/shared (no RN/DOM imports) so it is unit-testable in Node.
- Every feature behind a flag in packages/shared/src/config/features.ts.
- Ask the owner ONLY when blocked by a missing secret/account. Otherwise decide, note the
  decision in docs/DECISIONS.md (ADR style, 5 lines max each), and continue.
- At the end of each phase: run that phase's gate commands, paste real output into
  docs/evidence/G<n>.md, then continue. Do not start phase n+1 with gate n red.
```

---

## 1. CURRENT STATE (verified by reading the repo; re-verify first — Phase 0)

```
branch frontend, 3 commits. Expo SDK ~54, RN 0.81.5, React 19.1, TS 5.9, react-navigation v7.
src/screens: Permissions, ProfileSetup, PinSetup, Dashboard, AlertCountdown, AlertFired, Settings
src/utils/api.ts      BASE_URL = 'https://shesafe-api.railway.app' (placeholder, never deployed)
src/utils/storage.ts  PIN stored PLAINTEXT in AsyncStorage (key shesafe_pin)
DashboardScreen       riskScore is Math.random() drift (fake)
AlertCountdown        45s countdown; never calls fireAlert()
AlertFired            hardcoded DEMO_STATIONS; green "✓ Sent" badges are static text (fake);
                      "Evidence Recording Active" and "Live location every 30s" are text only
expo-sensors / expo-av / expo-camera / expo-location / expo-notifications / expo-sms are
installed but NO shake detection, recording, location streaming or push code exists in src/.
The owner says a localhost demo with 3 role logins (victim / guardian / police) and a
3x-shake trigger exists elsewhere. LOCATE IT (other branch/repo/folder). If you cannot find it,
build the equivalents per this spec and keep the 3 demo logins.
```

Phase 0 tasks: clone, inventory, `git grep -nE "Math\.random|DEMO_|TODO|FIXME"`, write `docs/AUDIT.md`, then restructure into the monorepo below with `git mv` (preserve history).

---

## 2. ARCHITECTURE

```
shesafe/
├─ apps/
│  ├─ mobile/        Expo SDK 54 DEV BUILD (not Expo Go: needs config plugins), TS strict
│  └─ web/           Next.js 15 (App Router) → Vercel free. Police console, Guardian console,
│                    Admin (volunteer verification), public Witness page /w/[token]
├─ packages/
│  └─ shared/        zod schemas, DB types, risk engine, detectors, fusion, state machine,
│                    hash chain, i18n catalogs, feature flags. 100% pure TS. Vitest.
├─ supabase/
│  ├─ migrations/    SQL (PostGIS, pgcrypto, RLS)
│  ├─ functions/     Edge Functions (Deno): notify, witness, escalation-tick, export-report
│  ├─ tests/         pgTAP
│  └─ seed.sql       demo data (labelled DEMO)
├─ fixtures/sensors/ recorded + synthetic accelerometer/gyro/audio-level traces (*.json)
├─ docs/             ARCHITECTURE.md THREAT_MODEL.md PRIVACY.md BENCHMARKS.md DECISIONS.md
│                    JUDGE_QA.md AUDIT.md evidence/G0..G10.md
├─ scripts/          gen-siren.mjs  no-fakes.sh  seed-demo.ts  loadtest.js
├─ .github/workflows/ci.yml
└─ pnpm-workspace.yaml
```

Free-tier stack (all free; respect their usage policies):
```
Backend        Supabase free: Postgres+PostGIS, Auth (email/password; NO phone OTP), Realtime,
               Storage (private bucket), Edge Functions, pg_cron
Push           Expo Push Service (free)
Maps           Web: Leaflet + OSM tiles + leaflet.heat   Mobile: react-native-maps (Google
               provider needs key → prefer MapLibre/OSM-tile WebView or react-native-maps with
               UrlTile to OSM; DEMO-scale only, add attribution)
Geocoding      Nominatim (≤1 req/s, custom User-Agent, debounce, cache)
Routing        OSRM public demo server (demo-scale; base URL configurable via env)
POI/lit roads  Overpass API (bbox query, cache in SQLite 7 days, backoff on 429)
Hosting        Vercel free (web). No always-on server needed.
```

Delete the Railway/FastAPI assumption: Supabase RPC + Edge Functions replace it.

---

## 3. DATABASE (supabase/migrations) — implement fully, with RLS on EVERY table

```sql
create extension if not exists postgis;
create extension if not exists pgcrypto;
create extension if not exists pg_cron;

create type role_t     as enum ('victim','guardian','police','volunteer','admin');
create type alert_st   as enum ('countdown','active','acknowledged','dispatched','resolved',
                                'cancelled','false_alarm');
create type trigger_t  as enum ('manual_sos','shake','struggle','snatch','scream','dead_mans_switch',
                                'safe_walk_deviation','safe_walk_stationary','safe_walk_overdue',
                                'cab_deviation','duress_pin');

create table stations(id uuid primary key default gen_random_uuid(), name text not null,
  phone text, geom geography(point,4326) not null, is_demo boolean default true);
create index on stations using gist(geom);

create table profiles(
  id uuid primary key references auth.users on delete cascade,
  role role_t not null default 'victim',
  full_name text not null, phone text, lang text not null default 'en' check (lang in ('en','hi','kn')),
  station_id uuid references stations(id),               -- police only
  expo_push_token text, created_at timestamptz default now());

create table guardian_links(victim_id uuid references profiles, guardian_id uuid references profiles,
  status text check (status in ('pending','active','revoked')) default 'pending',
  primary key(victim_id,guardian_id));

create table volunteers(user_id uuid primary key references profiles, verified boolean default false,
  available boolean default false, geom geography(point,4326), last_seen timestamptz);
create index on volunteers using gist(geom);

create table alerts(
  id uuid primary key,                                   -- CLIENT-GENERATED uuid (works offline)
  victim_id uuid not null references profiles,
  status alert_st not null default 'countdown',
  trigger trigger_t not null, confidence real, risk_score int,
  duress boolean not null default false,
  started_at timestamptz not null, fired_at timestamptz, acknowledged_at timestamptz,
  acknowledged_by uuid references profiles, eta_minutes int,   -- ETA ONLY if dispatcher typed it
  resolved_at timestamptz, last_geom geography(point,4326),
  share_token_hash bytea,                                -- sha256 of witness token (never store raw)
  escalation_level int not null default 0, created_at timestamptz default now());
create index on alerts(status) where status in ('active','acknowledged','dispatched');

create table alert_locations(alert_id uuid references alerts on delete cascade, seq int,
  geom geography(point,4326) not null, accuracy_m real, speed_mps real, battery_pct int,
  recorded_at timestamptz not null, primary key(alert_id,seq));       -- idempotent on retry

create table alert_events(                               -- APPEND-ONLY, hash-chained audit log
  id bigserial primary key, alert_id uuid not null references alerts on delete cascade,
  type text not null, actor uuid, payload jsonb not null default '{}',
  prev_hash bytea, hash bytea not null, created_at timestamptz not null default now());
-- trigger BEFORE INSERT: prev_hash := last hash for alert_id (or '\x00'); 
-- hash := digest(prev_hash || convert_to(type||'|'||coalesce(actor::text,'')||'|'||payload::text||'|'||created_at::text,'UTF8'),'sha256')
-- REVOKE UPDATE, DELETE on alert_events from ALL roles (incl. authenticated, service_role via trigger RAISE).
-- function verify_chain(alert_id) returns table(ok boolean, broken_at bigint) recomputes the chain.

create table evidence_chunks(alert_id uuid references alerts on delete cascade, seq int,
  kind text check (kind in ('audio','photo_front','photo_back')), storage_path text not null,
  sha256 bytea not null, chain_hash bytea not null, bytes int, captured_at timestamptz not null,
  primary key(alert_id,seq,kind));
-- server recomputes chain_hash = sha256(prev_chain_hash || sha256 || seq || captured_at_iso)
-- and REJECTS (RAISE) on mismatch → client can't forge/reorder.

create table responder_pings(alert_id uuid references alerts on delete cascade,
  volunteer_id uuid references volunteers, distance_m int, status text default 'sent'
  check (status in ('sent','accepted','declined','arrived')), sent_at timestamptz default now(),
  primary key(alert_id,volunteer_id));

create table unsafe_reports(id uuid primary key default gen_random_uuid(),
  geom geography(point,4326) not null, category text not null, severity int check (severity between 1 and 5),
  reporter_hash bytea not null, created_at timestamptz default now(),
  expires_at timestamptz default now() + interval '30 days');
create index on unsafe_reports using gist(geom);

create table access_log(id bigserial primary key, who uuid, what text, alert_id uuid, at timestamptz default now());
```

### 3.1 RPCs / functions (all `security definer`, `set search_path = public`, validate `auth.uid()`)
```
fire_alert(p_id uuid, p_trigger trigger_t, p_conf real, p_risk int, p_lat float8, p_lng float8,
           p_started timestamptz, p_duress boolean) returns alerts
  - IDEMPOTENT: insert ... on conflict (id) do nothing; return existing row. Never creates duplicates.
  - sets status='active', fired_at=now() (server clock is truth), writes alert_events('fired')
  - generates 128-bit witness token server-side (gen_random_bytes(16)); stores sha256 only; the raw token is
    returned ONCE as a second output column: returns table(alert alerts, witness_token text). Never persisted raw.
  - calls pg_notify / net.http_post to Edge Function `notify` (or `notify` polls via realtime row)
push_locations(p_alert uuid, p_batch jsonb)  -- batch of {seq,lat,lng,acc,speed,battery,ts}; upsert on (alert_id,seq)
acknowledge_alert(p_alert uuid, p_eta int)   -- police role + station scope only; sets acknowledged_at, eta
dispatch_alert(p_alert uuid, p_note text), resolve_alert(p_alert uuid, p_outcome text)
cancel_alert(p_alert uuid, p_duress boolean) -- duress=true: DOES NOT cancel; sets duress, escalation_level=3
nearest_stations(p_lat float8, p_lng float8, p_k int default 3) returns table(id,name,phone,distance_m)
  -- order by geom <-> ST_MakePoint(lng,lat)::geography  (KNN GiST), NOT a full scan
nearby_volunteers(p_alert uuid, p_radius_m int, p_limit int default 10)
  -- verified AND available AND last_seen > now()-interval '10 minutes' AND ST_DWithin(...)
heatmap_cells(p_bbox ..., p_since interval)  -- ST_SnapToGrid aggregation for police analytics
delete_my_data()                             -- DPDP-style erasure; cascades; writes access_log
escalation_tick()                            -- see §6.3; scheduled by pg_cron every minute
```

### 3.2 RLS matrix (write as pgTAP tests FIRST, then policies)
```
victim      : SELECT/INSERT own alerts, locations, evidence; no access to others
guardian    : SELECT alerts/locations/evidence ONLY where guardian_links.status='active' AND alert.status in active|acknowledged|dispatched
              (access ends when alert resolved) ; every read inserts access_log
police      : SELECT alerts where status in active|ack|dispatched AND alert within escalation scope of
              profiles.station_id (nearest_stations top-3 at fire time → table alert_stations(alert_id,station_id));
              may call acknowledge/dispatch/resolve; NO access to resolved alerts older than 30 days
volunteer   : sees ONLY responder_pings rows addressed to them; alert first name + coarse geom until status='accepted';
              never phone, never evidence
admin       : manage volunteers.verified, stations; no alert content access
anon        : NOTHING (witness page goes through Edge Function with service role, token-checked)
storage     : bucket `evidence` private; INSERT only into folder = alert_id owned by auth.uid();
              SELECT via signed URL (60 s) minted only for authorised police/guardian
```

Seed (`supabase/seed.sql`): 6 stations in/near Mangaluru labelled `is_demo=true` (coordinates plausible, names prefixed "DEMO"), users `victim@demo.shesafe`, `guardian@demo.shesafe`, `police@demo.shesafe`, `volunteer@demo.shesafe`, `admin@demo.shesafe` (passwords in README, flagged DEMO ONLY), 40 unsafe_reports, 8 volunteers scattered within 2 km.

---

## 4. DETECTION ENGINE (packages/shared/src/detect) — pure, deterministic, unit-tested

```ts
export type Sample = { t: number /*ms*/; ax: number; ay: number; az: number /*g*/;
                       gx?: number; gy?: number; gz?: number /*rad/s*/ };
export type Sensitivity = 'low' | 'medium' | 'high';
export interface DetectorResult { kind: 'shake'|'struggle'|'snatch'|'scream'; confidence: number /*0..1*/;
                                  at: number; features: Record<string, number>; }

// Sampling: expo-sensors Accelerometer.setUpdateInterval(20) → 50 Hz; Gyroscope same.
// Ring buffer: fixed 4 s window (200 samples), O(1) push, no per-sample allocation.
// Gravity removal: high-pass  g_est = α·g_est + (1-α)·a ; a_hp = a - g_est ; α = 0.8
// a_mag = sqrt(ax²+ay²+az²) in g ; a_hp_mag = |a_hp| ; jerk = Δa_mag/Δt (g/s)
```

### 4.1 Shake (explicit trigger, keeps the owner's "3 shakes")
```
peak := local max of a_hp_mag with a_hp_mag > T(sens) ; min inter-peak gap 90 ms
T: low 2.4 g, medium 1.9 g, high 1.5 g
TRIGGER when ≥3 peaks within 1500 ms AND alternating sign of dominant axis (rejects single bump)
Debounce: 4 s refractory. Output confidence 0.9 (explicit gesture).
```

### 4.2 Struggle (passive)
```
window 2 s, hop 250 ms:
  rms_a  = RMS(a_hp_mag)           ; rms_g = RMS(|gyro|)            ; zcr = zero-crossing rate of a_hp (dominant axis)
  struggle_score = sigmoid( 2.2·(rms_a-0.7) + 0.6·(rms_g-2.5) + 1.5·(zcr-0.25) )
  require sustained: score>0.7 for ≥ 3 consecutive hops (≥ 0.75 s) → candidate
  walking/running guard: if step cadence peak in 1.4–3.2 Hz band dominates PSD (>60% energy) → suppress
Output confidence = min(0.8, score)   // passive signals never exceed 0.8 alone
```

### 4.3 Snatch
```
sequence: [jerk > 40 g/s] → [free-fall: a_mag < 0.35 g for ≥ 120 ms] OR high acceleration then
          [impact: a_mag > 3 g within 600 ms] ; then classify:
  drop   : phone stationary (rms_a < 0.05 g for 1.5 s after impact)  → confidence 0.15 (ignore, log)
  snatch : continued motion after impact OR rapid orientation change (|Δgyro| > 6 rad/s)       → 0.55
Never alone triggers a countdown (0.55 < 0.6). Needs corroboration via fusion (§4.5).
```

### 4.4 Scream / loud-sound (on-device, no cloud, no speech recognition)
```
Metering only (expo-audio recorder with isMeteringEnabled, 10 Hz; if expo-audio lacks metering in the
installed version, use expo-av Recording.setProgressUpdateInterval(100) + metering). Verify in node_modules.
baseline := EMA(metering_dBFS, τ = 20 s) clamped to [-60,-25]
event := metering > max(baseline + 22 dB, -12 dBFS) sustained ≥ 600 ms, ≤ 4 s (rejects claps/doors via
         duration + crest-factor proxy: peak-to-baseline ratio over the window)
Confidence 0.5 alone. Requires foreground/mic permission; DOCUMENT honestly that background audio
monitoring is limited on iOS/Android and is only active while the app is foreground or a foreground
service is running (Android dev build: expo-task-manager + foreground service notification).
Do NOT claim "AI scream recognition". Call it "loud-sound detector".
```

### 4.5 Fusion (noisy-OR) + decision policy
```
S = 1 - Π(1 - w_i · c_i)    w: shake 1.0, struggle 0.9, snatch 0.8, scream 0.7
context boost: +0.1 if risk.level ≥ 'alert' ; +0.1 if hour outside safe hours; cap 1.0
decision:
  explicit (manual_sos | shake | dead_mans_switch release)     → countdown 10 s
  S ≥ 0.85                                                     → countdown 15 s, haptic + voice "Are you safe?"
  0.60 ≤ S < 0.85                                              → soft prompt 10 s: [I'm OK] [Send alert]; no response → countdown 15 s
  S < 0.60                                                     → log locally only
Countdown NEVER exceeds 15 s (replace the current 45 s). Configurable 5–20 s in Settings.
```

### 4.6 Dead-man's switch
`HoldToBeSafe` component: onPressIn → armed (haptic tick every 5 s); release without entering PIN within 3 s grace → countdown. PIN entry disarms. Guard against accidental release with a 400 ms hysteresis.

### 4.7 Per-user calibration (Settings → "Train detector", ≤ 3 min)
```
Step 1: 5 deliberate 3-shake gestures → T = mean(peak) - 2σ clamped [1.3, 2.8] g
Step 2: 60 s normal walking, 30 s fast walk/run, 30 s phone in pocket/bag → measure max false-trigger
        score; if any trigger → raise T by 10 % and repeat (max 3 rounds); store calibration JSON in SecureStore.
Show result honestly: "Passed: 0 false triggers in 2 min of your own movement" (that is all it proves).
```

### 4.8 Risk engine (packages/shared/src/risk) — explainable, replaces Math.random
```ts
export interface RiskInput { now: Date; lat: number; lng: number; safeHours:{start:string;end:string};
  reportsNearby: {distM:number; severity:number; ageDays:number}[];
  stationsNearbyM: number[]; openAmenitiesNearby: number;
  motion: {state:'still'|'walk'|'run'|'vehicle'; stillSeconds:number};
  safeWalk?: {deviationM:number; overdueSec:number}; batteryPct:number; missedCheckIn:boolean }
export interface RiskOutput { score:number /*0..100*/; level:'safe'|'watchful'|'alert'|'emergency';
  factors:{id:string; label:string; points:number}[] }       // ALWAYS render "Why this score?"
points (cap total 100):
  time    : up to 20 → 20·smoothstep over [safeHours.end, +4h] and [00:00..05:00] peak
  zone    : up to 30 → 30·min(1, Σ severity_i·exp(-ln2·age_i/14d)·exp(-dist_i/150m) / 8)
  isolation: up to 15 → 15·(1 - min(1, openAmenities/5))·(stationsNearbyM.min > 1500 ? 1 : 0.5)
  motion  : up to 15 → still > 180 s outside saved "safe places": 15·min(1, stillSeconds/600)
  walk    : up to 15 → deviation>80m: 8 ; overdue>300s: 7
  battery : up to 5  → <10%: 5 ; <20%: 2
  checkin : up to 10 → missed check-in: 10
levels: <25 safe, <50 watchful, <75 alert, ≥75 emergency   (thresholds in config, tested)
```
Lint gate: `Math.random` forbidden under `apps/**/src` and `packages/**/src` (eslint `no-restricted-properties`), enforced by `scripts/no-fakes.sh`.

---

## 5. DETERRENCE SCREEN (apps/mobile/src/screens/DeterrenceScreen.tsx) — the demo centerpiece

Purpose: make an attacker believe — truthfully — that help is being summoned and they are being recorded.

```
SAFETY CONSTRAINT (photosensitive epilepsy, WCAG 2.3.1): flash rate MUST be ≤ 3 Hz.
  STROBE_HZ = 2.5   // red ↔ blue alternate every 200 ms. NEVER faster. Unit test asserts it.
  Settings: "Reduce flashing" → solid pulsing glow instead. Torch strobe uses same ≤3 Hz clock.
```

### 5.1 Layers (top → bottom)
```
1  AttackerBanner  (huge, high-contrast, localized, auto-fit):
     "ALERT SENT • POLICE & GUARDIANS NOTIFIED"  /  "LIVE LOCATION + VIDEO BEING RECORDED"
   (text switches to "ALERT QUEUED — RETRYING" if server not yet confirmed. Never lie.)
2  FrontCameraPreview  expo-camera CameraView facing="front", REC dot, wall-clock + ms, so the
   attacker sees their own face being recorded.
3  LiveStatusChecklist (bound to Supabase Realtime on alerts/alert_events/responder_pings):
     [ ] Alert received by server          ← done when alerts.fired_at != null
     [ ] Guardians notified (n)            ← count of notify events with status 'delivered_to_push_service'
     [ ] Nearby responders pinged (n)      ← count(responder_pings)
     [ ] Police station notified (name)    ← alert_stations rows
     [ ] Police ACKNOWLEDGED               ← alerts.acknowledged_at ; shows station + "ETA m min" ONLY if eta_minutes set
   states: pending(grey spinner) | queued(amber) | done(green ✓ with server timestamp) | failed(red, retrying)
4  Elapsed timer, GPS accuracy, battery %.
5  CancelDock (bottom, small): "I'M SAFE" → 6-digit PIN pad. Wrong PIN ×5 → 30 s lockout; alarm continues.
```

### 5.2 Effects (all via free device APIs)
```
siren   : assets/siren.wav generated by scripts/gen-siren.mjs (original, no licensing):
            22050 Hz mono PCM16, 2.0 s, f(t)=1100+400·tri(2π·0.5·t) Hz sweep, amplitude 0.95, loop
          expo-audio/expo-av: playsInSilentMode:true, staysActiveInBackground:true, loop:true, volume:1.0
          system volume → max via react-native-volume-manager (dev build, config plugin); if unavailable
          log + continue (do not crash)
voice   : expo-speech, every 7 s, language by profile.lang: en-IN | hi-IN | kn-IN. On start call
          Speech.getAvailableVoicesAsync(); if no voice for lang, fall back to en-IN and record fallback in events.
          EN:  "Alert dispatched. Police and neighbours are on the way. You are being recorded."
          HI/KN: translated strings from i18n catalog (must be reviewed by a native speaker — flag in docs).
          Do NOT say "police are on the way" in speech unless acknowledged_at is set; before that say
          "Police have been alerted." (truthful wording table in i18n, keyed by checklist state)
brightness: expo-brightness setBrightnessAsync(1), restore on exit
keep-awake: expo-keep-awake
torch   : expo-camera enableTorch toggled on the same 2.5 Hz clock (skip if unsupported)
haptics : Vibration pattern [0,400,200,400]
lock    : BackHandler.addEventListener blocks hardware back; gestureEnabled:false; no navigation header
          (document honestly: Android/iOS cannot truly pin the screen without kiosk/MDM; app switching remains possible)
```

### 5.3 Duress PIN
```
Two PINs set at onboarding (must differ; reject sequences like 123456/000000 and PIN==duress).
Normal PIN → cancel_alert(duress=false) → status 'cancelled' → back to Dashboard.
Duress PIN → UI behaves EXACTLY like a successful cancel (siren/strobe off, Dashboard shown) but calls
cancel_alert(duress=true): alert stays ACTIVE, escalation_level=3 immediately (all stations in scope + all
guardians + volunteers 1.5 km), recording continues silently (camera preview hidden, no sound),
foreground location keeps streaming. Police console shows a ⚠ DURESS badge.
PIN storage: expo-secure-store; derive with PBKDF2-HMAC-SHA256 (@noble/hashes) random 16-byte salt,
iterations chosen so verify takes ~300 ms on the slowest test phone (benchmark and record in BENCHMARKS.md).
Compare in constant time. Never log PINs.
```

---

## 6. ALERT LIFECYCLE, OFFLINE OUTBOX, ESCALATION

### 6.1 State machine (packages/shared/src/alert/machine.ts — XState v5 or a hand-written reducer; exhaustive tests)
```
idle ─trigger→ countdown ─timeout→ firing ─server ok→ active ─police ack→ acknowledged ─dispatch→ dispatched ─resolve→ resolved
countdown ─PIN→ cancelled        active|acknowledged|dispatched ─PIN→ resolved(victim_safe)
countdown|active ─duress PIN→ active(duress=true)    (UI shows cancelled)
firing: client holds local state 'firing_pending' until fire_alert RPC ack; deterrence UI starts at 'countdown end'
        (NOT at server ack) so the siren is never delayed by network.
Illegal transitions throw and are tested (table-driven, ≥ 40 cases). Terminal states reject all events.
```

### 6.2 Offline-first outbox (apps/mobile/src/outbox)
```
- alert.id = uuidv7() generated ON DEVICE at trigger time → whole flow works before any network.
- expo-sqlite table outbox(id integer pk, kind text, alert_id text, seq int, payload json, attempts int,
  next_at int, created_at int). Kinds: fire, locations, evidence_meta, evidence_blob, cancel.
- Single serial drain loop; backoff = min(30s, 1s·2^attempts) ± 20% jitter; NetInfo-triggered immediate retry.
- Idempotency: server upserts on (alert_id,seq); fire_alert is idempotent; retries can never duplicate.
- Location sampler: every 5 s (expo-location, Accuracy.High, foreground service on Android), batched ≤ 12 pts/req;
  seq is monotonically increasing and persisted so a killed app resumes at the right seq.
- If app is killed mid-alert: on next launch, outbox flushes and Dashboard shows "Active alert recovered".
- Honest degradation: when no network, UI shows QUEUED (amber). Provide an optional "Open SMS composer with
  location link" button (expo-sms composer; user must tap Send) labelled clearly as manual fallback.
```

### 6.3 Escalation ladder (server-side, authoritative)
```
t=0     : notify guardians (push) ; alert_stations := nearest_stations(k=3) → nearest station sees it on console ;
          nearby_volunteers(radius=500 m, limit=10) pinged
t+60 s  : if no responder 'accepted' and no police ack → volunteers radius 1500 m (limit 20), escalation_level=1
t+120 s : if still no police ack → console of ALL 3 stations flashes UNACKNOWLEDGED; guardians re-pushed; level=2
duress  : jump straight to level 3 (everything at once)
escalation_tick() runs under pg_cron every minute + is also invoked by a 15 s client "kick" RPC from the
victim device while alert active (cheap, idempotent) to get sub-minute granularity on free tier.
All actions append alert_events (hash-chained).
```

Push (Edge Function `notify`): Expo Push API, `priority:'high'`, Android channel `alerts` importance MAX, sound custom. Document honestly: iOS Critical Alerts need an Apple entitlement and Android DND bypass needs user consent → both are "NOT available by default"; mark limits in README.

---

## 7. WEB APP (apps/web, Next.js App Router, TS strict, Tailwind, supabase-js with RLS)

```
/login                         role-based redirect (police→/console, guardian→/guardian, admin→/admin)
/console                       Police live board:
   - Leaflet map (OSM, attribution) w/ clustered active alerts, pulsing marker, polyline of alert_locations
   - Left rail: alerts sorted by (duress desc, unacked desc, age desc); age badge turns red after 120 s unacked
   - New-alert chime (Web Audio) behind an explicit "Enable sound" button (autoplay policy)
   - Supabase Realtime channel on alerts + alert_locations + responder_pings, auto-reconnect w/ visible status dot
/console/alerts/[id]           Timeline from alert_events; live track; evidence list (signed URLs, audio player,
                               photo grid); "Chain verified ✓ / BROKEN ✗" badge calling verify_chain();
                               buttons: Acknowledge (ETA minutes input), Dispatch (note), Resolve (outcome);
                               keyboard: A ack, D dispatch, R resolve. Export report PDF button.
/console/analytics             response-time p50/p90 (acknowledged_at - fired_at), alerts by hour, false-alarm rate,
                               heatmap (leaflet.heat) from heatmap_cells(), per-trigger breakdown
/guardian                      linked victims; active-alert view (live map, battery, "I'm responding", tel: call)
/admin                         verify volunteers, manage stations, view access_log
/w/[token]  (PUBLIC witness)   Route Handler → Edge Function `witness`: sha256(token) must match share_token_hash,
                               alert not resolved+2h, returns {first_name, last_geom, updated_at, status} only;
                               rate limit 30 req/min/IP (counter table), constant-time compare, no PII, no evidence;
                               noindex, no-store cache headers
```
Accessibility: axe-core 0 serious/critical violations on every route; full keyboard navigation; reduced-motion respected.

---

## 8. VOLUNTEER ("Rakshak") NETWORK

```
Onboarding: email auth → profile → "Request verification" → admin verifies (no SMS OTP: costs money).
Availability toggle → expo-location Accuracy.Balanced every 2 min ONLY while available → volunteers.geom/last_seen.
Ping screen: first name + distance + bearing arrow (haversine + initial bearing) + coarse map; [Accept] [Decline].
After Accept: exact location + victim first name; buttons: "Navigate" (geo: URI), "Call 112" (tel:112), "Arrived".
Safety copy (i18n): "Do not confront. Go to the location, stay visible, and call 112."
Abuse controls: ≤ 3 pings/volunteer/hour, report-volunteer flow, auto-suspend after 3 reports pending admin review,
volunteer never receives victim phone/evidence, all views logged.
```

---

## 9. PREVENTION FEATURES

### 9.1 Safe Walk
```
1 Destination: Nominatim search (debounce 600 ms, UA "SheSafe/1.0 (contact)", ≤1 req/s, cache 24 h)
2 Routes: OSRM  /route/v1/foot/{lng,lat;lng,lat}?alternatives=3&overview=full&geometries=geojson
3 Score each route polyline sampled every 50 m:
    lit      : Overpass way["highway"]["lit"="yes"] within 20 m (bbox fetched once, cached SQLite 7 d)
    amenity  : count of open shop/pharmacy/hospital/police/bus_stop within 100 m
    reports  : unsafe_reports kernel density (same kernel as §4.8)
  safety = 100 - (35·unlitFrac + 30·isolationFrac + 35·reportDensityNorm) ; show fastest vs safest + Δ minutes.
4 Monitor while walking (foreground service): 
   deviation > 80 m from chosen polyline for > 60 s → prompt "Are you OK?" (20 s) → else countdown
   stationary > 180 s away from destination → same
   not arrived by ETA + 5 min → notify guardians (soft), escalate to alert after +10 min w/o response
5 Share live via witness link /w/[token] (opt-in)
```

### 9.2 Community reports
Long-press map → category (poor lighting, harassment, stalking, isolated, other) + severity 1–5. `reporter_hash = HMAC(user_id, server_secret)`. Dedup: same reporter within 50 m / 1 h ignored. Visible to others only when ≥ 3 distinct reporters within 100 m (anti-defamation of places/people). Cap 10 reports/user/day. Expiry 30 d. Free-text NOT allowed (prevents naming individuals).

### 9.3 Cab Guardian
Start ride: enter vehicle plate (stored on alert as text), destination → OSRM route → witness link auto-shared with guardians. Prompts: route deviation > 500 m for > 90 s, unscheduled stop > 4 min, speed > 100 km/h for > 30 s. Same "Are you OK?" → countdown policy.

---

## 10. EVIDENCE PIPELINE

```
Audio  : 10 s AAC (m4a) chunks, 32 kbps mono (≈ 40 KB / chunk)
Photos : front + back every 10 s, JPEG quality 0.4, max 640 px (≈ 40 KB). Android shutter sound off where supported.
Budget : cap 30 min full-rate per alert, then audio-only. Free tier 1 GB ≈ many hours; add per-user daily cap.
Hash   : file_sha = sha256(bytes) ; chain_n = sha256(chain_{n-1} || file_sha || seq || captured_at_iso)  (hex, '|' separated, spec in docs)
Upload : outbox kind evidence_blob → Storage `evidence/{alert_id}/{seq}.{ext}` then evidence_meta row; server verifies chain.
Report : Next.js route /api/report/[alertId] → @react-pdf/renderer: header, parties (first names only unless police),
         map snapshot (static OSM tiles), timeline (alert_events), evidence table with hashes, chain verification result,
         QR → /verify/[alertId]. Section "DRAFT COMPLAINT (template)" with fields prefilled from facts.
         Footer: "Auto-generated from device data. Not a legal document. Verify before use."
         NO AI text generation — templated strings only.
```

---

## 11. I18N (packages/shared/src/i18n) — en, hi, kn
Catalogs as typed JSON; a unit test asserts key parity across the three; spoken strings keyed by checklist state (§5.2). Mark hi/kn strings `reviewed:false` until the owner confirms with a native speaker.

---

## 12. SECURITY & PRIVACY

```
Threat model (docs/THREAT_MODEL.md, STRIDE table). Must cover at least:
 T1 attacker forces cancel → duress PIN        T2 phone snatched/switched off → chunked evidence + last-gasp ping (battery<5% sends final location)
 T3 false alarms/abuse → fusion, calibration, rate limits, false_alarm status, audit   T4 stalker abuses guardian/volunteer role → verification, link consent, revocation, logs
 T5 IDOR on alerts/evidence → RLS + tests       T6 witness token guessing → 128-bit, hashed at rest, rate limited, expiry
 T7 police-side misuse → access_log, scoped RLS, no historical browsing > 30 d   T8 data breach → minimization, retention purge (pg_cron: delete locations 30 d after resolve), private bucket, signed URLs
 T9 siren provokes attacker → alert is user-armed, countdown, configurable; documented trade-off (no claim of guaranteed safety)
 T10 photosensitivity → ≤3 Hz + reduce-flashing option
Privacy (docs/PRIVACY.md): purpose limitation, consent screens before each permission with plain language,
location shared ONLY during active alert / Safe Walk / volunteer-available, delete_my_data(), retention table,
grievance contact. Write "designed with DPDP Act 2023 principles in mind" — NEVER claim certification/compliance.
Secrets: service-role key only in Edge Functions/Vercel server env; client has anon key only; .env* gitignored;
add gitleaks to CI. Validate every input with zod (client AND server). pnpm audit --prod must show 0 high/critical or documented waivers.
```

---

## 13. TESTING STRATEGY — the definition of "works"

```
LAYER                TOOL                         WHAT MUST BE PROVEN
unit (shared)        vitest + fast-check          risk engine ≥ 40 table cases; detectors on fixtures; fusion policy table;
                                                  state machine all legal/illegal transitions; hash chain: flip any 1 byte → verify FAILS (property test);
                                                  i18n key parity; PIN KDF round-trip + wrong PIN + timing-safe compare
db                   pgTAP (supabase test db)     full RLS matrix §3.2 incl. NEGATIVE cases (A cannot read B; guardian loses access after resolve;
                                                  volunteer cannot read phone; anon reads nothing); fire_alert idempotent (call 5× → 1 row, 1 'fired' event);
                                                  alert_events UPDATE/DELETE blocked; verify_chain detects tamper via superuser edit; nearest_stations vs known distances (±1%);
                                                  nearby_volunteers radius edges; evidence chain mismatch rejected
edge functions       deno test                    notify payload shape + Expo API mocked; witness: wrong token 404, expired 410, rate limit 429, no PII leaked
mobile component     jest-expo + RNTL             DeterrenceScreen: STROBE_HZ ≤ 3 asserted via fake timers (count color flips per second);
                                                  checklist never green before server event (inject realtime events step by step);
                                                  offline → "QUEUED" amber; back button blocked; PIN lockout after 5; duress path = fake-cancel + RPC duress=true
mobile integration   jest + sqlite in-memory      outbox: offline fire → 3 location batches → reconnect → exactly 1 alert, ordered seq, no dupes;
                                                  kill mid-flush & restart → resumes without duplication
web e2e              Playwright (3 browsers ctx)  victim row inserted → police console shows it < 2 s → Acknowledge → victim-side realtime flips checklist;
                                                  verify badge ✓; tamper via SQL → badge ✗; witness link valid/expired/rate-limited; axe: 0 serious
mobile e2e           Maestro on Android emulator  onboarding→PIN+duress PIN→arm→debug trigger→deterrence→ack from web→status flips→PIN cancel;
                                                  duress flow; emulator console `sensor set acceleration x:y:z` to inject shake pattern; airplane-mode flow
perf                 k6/node script               200 concurrent active alerts × location every 5 s: p95 (insert → police console receives) < 1500 ms;
                                                  record Supabase free-tier limits hit (Realtime concurrent connections etc.) honestly
device               adb dumpsys batterystats     1 h foreground monitoring: report battery %, CPU %; target ≤ 8 % battery/h — report actual, do not fudge
security             scripted                     IDOR attempts with other user's JWT on every table/RPC/storage path; path traversal in storage names;
                                                  witness token brute force → blocked; JWT of role X calling RPC of role Y → denied
static               tsc --noEmit, eslint, expo-doctor, gitleaks, scripts/no-fakes.sh (fails on: Math.random, DEMO_ constants outside seed/tests, hardcoded phone/station arrays in src, 'TODO', 'FIXME', .skip( / .only()
```

### 13.1 Detector fixtures (fixtures/sensors/*.json)
```
Build apps/mobile "Dev Tools → Record fixture" (dev builds only): records 50 Hz accel+gyro (+audio dBFS) to JSON with a label.
Required labelled sets: walking, fast_walk, running, pocket_walk, bag_swing, bus_ride, stairs, phone_on_desk_typing, drop_on_floor,
  shake_3x (low/med/high intensity), struggle_sim, snatch_sim.
If you (the agent) cannot record real data: generate SYNTHETIC fixtures with a seeded PRNG (documented generator in scripts/),
mark every file `"synthetic": true`, and have the owner record real ones. Report two separate tables: SYNTHETIC vs REAL.
Metrics to report: shake TPR (must be ≥ 0.95 on shake_3x), false triggers per hour on negative sets (target 0 at medium;
report the real number), snatch/drop separation matrix. Write results to docs/BENCHMARKS.md with date + commit SHA.
```

### 13.2 Manual QA checklist (owner runs on a real Android phone; agent writes docs/MANUAL_QA.md with expected results)
Siren audible at full volume in silent mode · torch flashes ≤ 3 Hz · TTS speaks en/hi/kn · front camera shows face · airplane-mode alert shows QUEUED then flips on reconnect · kill app mid-alert → recovered on reopen · battery saver ON behaviour documented · lock-screen behaviour documented · push arrives on a second phone within 5 s · volunteer ping arrives · police ack flips victim screen.

---

## 14. PHASES & GATES (do not advance with a red gate; paste real output to docs/evidence/G<n>.md)

```
P0 Audit + monorepo restructure (history preserved) ........................ G0: `pnpm i && pnpm -r typecheck` green; docs/AUDIT.md
P1 Supabase schema, RLS, RPCs, seed ........................................ G1: `supabase db reset && supabase test db` ALL pass (≥ 60 assertions)
P2 packages/shared (risk, detectors, fusion, state machine, hash chain, i18n) G2: `pnpm --filter shared test --coverage` ≥ 90 % lines on src/{risk,detect,alert,chain}
P3 Mobile core: auth, onboarding, secure PIN+duress, outbox, state machine .. G3: RNTL + outbox integration tests green; Maestro onboarding flow green
P4 Deterrence screen ....................................................... G4: component tests green (STROBE_HZ ≤ 3, no-fake-green, duress); screen recording on emulator saved
P5 Sensors + detectors on device + calibration + dead-man's switch ......... G5: fixture benchmark table (SYNTHETIC vs REAL) in BENCHMARKS.md; emulator-injected shake triggers countdown
P6 Web: police console, guardian, witness, analytics ........................ G6: Playwright e2e + axe green; realtime latency measured
P7 Volunteer network + escalation ladder .................................... G7: pgTAP + e2e: unacked alert escalates at t+60/+120 s (use fake clock/shortened env override), duress → level 3 immediately
P8 Safe Walk + reports + Cab Guardian ....................................... G8: unit tests for route scoring on fixture GeoJSON; Overpass/Nominatim mocked; rate limits respected
P9 Evidence + hash chain + PDF report ....................................... G9: tamper tests (file byte flip, reorder, delete middle chunk) all detected; PDF generated & text-extracted check
P10 Hardening: security tests, perf, CI, docs, demo director ................ G10: full CI green on clean checkout; k6 results; threat model; JUDGE_QA.md; README with 5-min demo script
P11 Final verification report .............................................. docs/FINAL_REPORT.md (template below)
```

### 14.1 Demo Director (dev/demo flag): one screen that scripts the pitch
Buttons: "Simulate snatch", "Simulate 3-shake", "Simulate scream", "Airplane-mode demo", "Police ack now" (opens console), "Show chain verify", "Tamper & re-verify". Each triggers the REAL pipeline (not canned UI).

### 14.2 docs/JUDGE_QA.md — write honest answers to at least these
What if phone is snatched/off? · What if attacker forces cancel? · False alarms? · No internet? · Battery cost? · Who can see my location and when? · What if police don't respond? · Misuse by stalkers / fake volunteers? · Why not just call 112? (complement, not replace) · How accurate is detection? (cite BENCHMARKS.md, state limits) · What does it cost to run? (free tiers; list limits) · What is NOT built / known limitations.

---

## 15. FINAL REPORT TEMPLATE (docs/FINAL_REPORT.md) — mandatory last step

```
| Requirement                                   | Status                       | Evidence (file / command output) |
|-----------------------------------------------|------------------------------|----------------------------------|
| RLS matrix incl. negative cases               | VERIFIED / FAILED / NOT VERIFIED | docs/evidence/G1.md            |
| ...one row per § in this prompt...            |                              |                                  |
Then: (1) KNOWN LIMITATIONS (honest), (2) NOT VERIFIED items + exact manual steps for the owner,
(3) free-tier limits that could bite during the live demo, (4) exact commands to run the full demo from a clean clone,
(5) list of anything that deviated from this prompt and why.
```

The agent may report completion ONLY as: "Gates G0–G10: <passed list>. NOT VERIFIED: <list>." Nothing else counts as finished.

---

## 16. START NOW
1. Phase 0: clone, audit, find the existing 3-login demo + shake code, restructure.
2. Write failing pgTAP + vitest tests BEFORE implementation in P1/P2 (test-first).
3. Proceed phase by phase. Commit often. Keep docs/evidence/ honest.
