# SheSafe — docs/AUDIT.md
# Phase 0 Audit Report
Generated: 2024-10-31

## Repository State (verified)

| Item | Finding |
|------|---------|
| Branch | `frontend` (3 commits) |
| Expo SDK | ~57.0 (package.json shows ~57, not 54 as prompt stated — actual is newer) |
| React Native | 0.86.3 |
| React | 19.2.3 |
| TypeScript | ~6.0.3 |
| Navigation | react-navigation v7 |

## Files Audited

### `src/screens/DashboardScreen.tsx`
- **Issue**: `riskScore` was using shake count as a proxy — NOT Math.random in this version (newer than spec described)
- **Issue**: Shake detection uses raw magnitude without gravity removal (SHAKE_THRESHOLD 2.5g, no HP filter)
- **Issue**: Shake window logic incorrect — checks `now - lastShakeRef.current < SHAKE_COOLDOWN` AFTER incrementing, so third shake always within cooldown of itself
- **Fixed in**: P2 (packages/shared/src/detect/shakeDetector.ts)

### `src/screens/AlertFiredScreen.tsx`
- **Good**: Real camera, audio, GPS code exists and runs
- **Issue**: PIN stored in AsyncStorage plaintext (`shesafe_victim_pin` key) — **SECURITY RISK**
- **Issue**: Resolves via custom WebSocket backend, not Supabase
- **Issue**: No duress PIN — one PIN only
- **Fixed in**: P3

### `src/screens/AlertCountdownScreen.tsx`
- **Good**: 15s countdown (not 45s as prompt stated — already correct)
- **Good**: Does call `navigation.replace('AlertFired')` on timeout
- **Issue**: PIN compared in plaintext (no KDF)

### `src/utils/api.ts`
- **Issue**: Uses local Express/WebSocket backend (backend/server.js), NOT Supabase
- **Issue**: All auth is username/password matching hardcoded USERS array (no real auth)
- **Fixed in**: P1 + P3

### `backend/server.js`
- **Issue**: In-memory data store (lost on restart)
- **Issue**: Hardcoded users: `victim/shesafe`, `guardian/shesafe`, `police/shesafe`
- **Issue**: No authentication tokens — any WebSocket can register as any role
- **Issue**: `policeAccessGrants` dict has no security checks
- **Preserved**: 3-role demo login pattern (migrated to Supabase email auth in P3)

### `src/utils/supabase.ts`
- This file just re-exports api.ts — no actual Supabase integration exists yet

## grep Results (fake patterns)

```
Math.random: 0 occurrences in src/ (only in backend/node_modules — ignored)
DEMO_:       0 occurrences in src/
TODO:        0 occurrences in src/
FIXME:       0 occurrences in src/
```

## What was found vs. prompt description

The codebase is **more advanced** than the Phase 1 description suggested:
- Real camera, audio, GPS code in AlertFiredScreen ✅
- 15s countdown (not 45s) ✅
- 3-role login with quick-fill buttons ✅
- WebSocket backend with real-time relay ✅

The backend/server.js IS the "localhost demo with 3 role logins" the owner mentioned.

## Restructure Actions

- Moved Expo app → `apps/mobile/`
- Created `packages/shared/` with pure TS business logic
- Created `supabase/` with migrations, seed, tests
- Created `docs/`, `scripts/`, `.github/workflows/`
- Root `pnpm-workspace.yaml` added
- Old `package.json` replaced with monorepo root config

## G0 Gate Status

| Check | Status |
|-------|--------|
| pnpm install | PENDING (run `pnpm install`) |
| pnpm -r typecheck | PENDING |
| docs/AUDIT.md | ✅ DONE (this file) |
| no Math.random in src/ | ✅ VERIFIED (grep output above) |
| Monorepo structure | ✅ DONE |
