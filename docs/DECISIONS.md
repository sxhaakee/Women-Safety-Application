# SheSafe — DECISIONS.md (ADR Log)

## D001 — Backend: Replace Express+WS with Supabase
- **Problem**: Custom backend/server.js has no auth, in-memory state, no persistence
- **Decision**: Replace with Supabase (Postgres + RLS + Realtime + Edge Functions)
- **Rationale**: Free tier, no always-on server, built-in auth, PostGIS for geospatial
- **Trade-off**: Vendor lock-in, but free tier meets all demo requirements
- **Status**: Implemented in P1

## D002 — Auth: Email/Password only, no phone OTP
- **Problem**: Prompt says "NO phone OTP: costs money"
- **Decision**: Supabase email/password auth. Demo users: victim@demo.shesafe etc.
- **Rationale**: Free, no credit card required, meets constraint
- **Status**: Implemented in P1 seed

## D003 — PIN Storage: expo-secure-store + PBKDF2
- **Problem**: Existing code stores PIN in AsyncStorage plaintext
- **Decision**: expo-secure-store + @noble/hashes PBKDF2-HMAC-SHA256, 16-byte random salt
- **Rationale**: SecureStore uses Android Keystore / iOS Keychain; PBKDF2 slows brute force
- **Status**: Implemented in P3

## D004 — Maps: OSM tiles + react-native-maps UrlTile
- **Problem**: Google Maps provider requires paid API key
- **Decision**: Use react-native-maps with UrlTile pointing to OSM tile server (demo scale)
- **Rationale**: Free, no key required, OSM attribution required by tile usage policy
- **Status**: Pending P6

## D005 — Strobe safety: STROBE_HZ = 2.5 (hard limit)
- **Problem**: WCAG 2.3.1 requires ≤3 Hz for photosensitive safety
- **Decision**: STROBE_HZ constant = 2.5; unit test asserts it; Settings has reduce-flash mode
- **Rationale**: Non-negotiable safety constraint; documented in code comments
- **Status**: Implemented in DeterrenceScreen (P4)

## D006 — Monorepo: pnpm workspaces (not Turborepo)
- **Problem**: Need monorepo for mobile + web + shared
- **Decision**: pnpm workspaces. No Turborepo (adds complexity for demo scale)
- **Rationale**: pnpm native workspaces sufficient; fewer dependencies
- **Status**: Implemented in P0
