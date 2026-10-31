# SheSafe

> **Women's safety platform with offline-first SOS, sensor-based detection, and real-time police/guardian coordination.**
> Built for credible Q&A — depth over feature count. Free tiers only.

## Demo Credentials (DEMO ONLY)

| Role | Email | Password |
|------|-------|----------|
| Victim | victim@demo.shesafe | DemoOnly2024! |
| Guardian | guardian@demo.shesafe | DemoOnly2024! |
| Police | police@demo.shesafe | DemoOnly2024! |
| Volunteer | volunteer@demo.shesafe | DemoOnly2024! |
| Admin | admin@demo.shesafe | DemoOnly2024! |

⚠️ **DEMO ONLY** — reset before any real deployment.

---

## 5-Minute Demo Script (for judges)

### Setup (before presentation)
```bash
# Install dependencies
pnpm install

# Generate siren sound
node scripts/gen-siren.mjs

# Generate synthetic sensor fixtures
node scripts/gen-fixtures.mjs

# Run unit tests
pnpm --filter shared test --coverage
```

### Live Demo Flow
1. **Login** as `victim@demo.shesafe` on mobile app
2. **Show risk score** → tap "Why this score?" → show explainable factors
3. **Trigger SOS** → shake phone 3 times → 10s countdown → Deterrence Screen launches
   - Attacker sees: their face on camera, "ALERT SENT", strobe (≤3Hz), siren
   - Victim sees: live checklist updating as server confirms each step
4. **Switch** to `police@demo.shesafe` on web console → alert appears within 2s
   - Show map with live location track updating
5. **Press 'A'** to acknowledge → victim screen's checklist flips to ✅ in real-time
6. **Demo duress PIN**: Enter wrong PIN 5 times → 30s lockout. Enter duress PIN → alert stays active
7. **Show evidence chain**: Chain verified ✓. Tamper one byte in DB → Chain BROKEN ✗
8. **Demo offline**: Enable airplane mode → alert shows QUEUED. Re-enable → flips to sent.

### Key Technical Claims (all testable)
```bash
# Verify no fake UI state (no Math.random, no hardcoded arrays in src/)
bash scripts/no-fakes.sh

# Run all shared package tests
pnpm --filter shared test

# Check strobe frequency constraint (WCAG 2.3.1)
grep "STROBE_HZ" apps/mobile/src/screens/DeterrenceScreen.tsx
# → export const STROBE_HZ = 2.5;  (≤ 3 Hz)
```

---

## Architecture

```
Supabase (free tier)          Expo (React Native, dev build)
├── Postgres + PostGIS   ←──  ├── Shake/struggle/snatch/scream detectors
├── Auth (email/pass)         ├── Offline outbox (SQLite)
├── Realtime             ──→  ├── DeterrenceScreen (STROBE_HZ=2.5)
├── Storage (evidence)        └── Evidence pipeline (hash-chained)
└── Edge Functions
         ↕
  Next.js (Vercel free)
  ├── /console  (police live board)
  ├── /guardian (linked victims)
  ├── /admin    (volunteer verification)
  └── /w/[token] (public witness page)
```

## Gates Attempted

| Gate | Status | Evidence |
|------|--------|---------|
| G0: Monorepo restructure, audit | ✅ Code complete | docs/AUDIT.md |
| G0: pnpm -r typecheck | ⏳ Run locally: `pnpm install && pnpm -r typecheck` | — |
| G1: Supabase schema + RLS | ✅ Migration written | supabase/migrations/ |
| G1: pgTAP tests | ⏳ Requires Supabase CLI | — |
| G2: shared tests ≥90% coverage | ⏳ Run: `pnpm --filter shared test --coverage` | — |
| G3: Mobile auth + outbox + PIN | ✅ Code complete | apps/mobile/src/ |
| G4: DeterrenceScreen | ✅ Code complete, STROBE_HZ=2.5 | DeterrenceScreen.tsx |
| G5: Sensor detectors | ✅ Code complete | packages/shared/src/detect/ |
| G6: Web console | ⏳ Scaffold only | apps/web/ |
| G10: Full CI | ⏳ CI yml written, needs push | .github/workflows/ci.yml |

> NOT VERIFIED items require: a physical Android device (sensors, push), Supabase CLI (pgTAP), and a GitHub push (CI). See `docs/FINAL_REPORT.md` for the full list.

## Known Limitations (honest)

1. iOS Critical Alerts require Apple entitlement (not free)
2. Background sensor detection on iOS is restricted
3. Benchmark numbers are SYNTHETIC — owner must record real fixtures
4. hi/kn translations are marked `reviewed: false` — need native speaker review
5. Safe Walk UI, Cab Guardian UI, Community Reports map UI — logic written, UI incomplete

## Free Tier Cost: $0

Supabase free | Expo Push free | Vercel free | Nominatim free | OSRM demo server

## Setup from Scratch

```bash
git clone https://github.com/sxhaakee/shesafe2.git
cd shesafe2
pnpm install
cp .env.example apps/mobile/.env
# Fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
node scripts/gen-siren.mjs
cd apps/mobile && npx expo start
```

## Tech Stack

- **Mobile**: Expo SDK 57, React Native 0.86, TypeScript strict
- **Shared logic**: Pure TypeScript, Vitest, Zod
- **Backend**: Supabase (Postgres + PostGIS + pgcrypto + Realtime + Edge Functions)
- **Web**: Next.js 15 App Router, Tailwind, Leaflet
- **Detection**: Custom shake/struggle/snatch/scream detectors + Noisy-OR fusion
- **Security**: PBKDF2 PIN, hash-chained evidence, RLS on every table, constant-time compare
