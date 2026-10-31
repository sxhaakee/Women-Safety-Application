# SheSafe — docs/JUDGE_QA.md

Honest answers prepared for hostile judge Q&A. All claims are backed by code/tests/docs.

---

## Q: What if the attacker snatches the phone and turns it off?

Evidence recording is chunked (10s audio + 10s photos) and uploaded in real-time via the offline outbox. Every chunk already uploaded before power-off is stored on Supabase Storage and hash-chained — permanently preserved. The last GPS location is always persisted on the server at the moment of upload. At battery < 5%, the app fires a "last-gasp" location push.

**Honest limit**: Chunks still in the outbox SQLite queue and not yet uploaded are lost when the phone is powered off. This is irreducible without hardware backup.

---

## Q: What if the attacker forces the victim to cancel the SOS?

The app has a **Duress PIN** — a second 6-digit code that looks identical to the normal cancel. If the duress PIN is entered, the UI behaves exactly as if the alert was cancelled (siren off, dashboard shown). **Secretly**, the alert remains active, escalation_level jumps to 3 (all police stations + all guardians + volunteers within 1.5 km), and silent recording continues. Police console shows a ⚠ DURESS badge.

---

## Q: How do you prevent false alarms?

1. **Explicit intent required**: Shake requires 3 alternating peaks within 1.5 s — accidental bumps don't alternate.
2. **Countdown buffer**: 10–15 s countdown with visible PIN cancel before any alert fires.
3. **Calibration**: User can train their own threshold (Settings → "Train detector") — see BENCHMARKS.md.
4. **Fusion**: Passive detectors (struggle, snatch, scream) require ≥ 0.60 fusion score before prompting.
5. **False alarm status**: Resolved alerts can be marked `false_alarm` for analytics.
6. **Rate limit**: Alert firing is rate-limited to prevent spam.

---

## Q: What if there's no internet?

The app has an **offline-first outbox** (SQLite). The alert ID is generated on-device before any network call. The siren and deterrence screen start immediately (no server round-trip needed). When network returns, the outbox drains automatically — the server deduplicates on alert_id so no duplicate alerts are created. The UI shows QUEUED (amber) honestly. A manual fallback "Open SMS composer with your location" button is available (user must tap Send).

---

## Q: What is the battery cost?

**NOT VERIFIED on real hardware** (requires physical device + `adb dumpsys batterystats`). Target: ≤ 8% battery/hour during active monitoring. See docs/MANUAL_QA.md for the exact test procedure. This must be run by the owner on a real Android device and recorded in BENCHMARKS.md.

---

## Q: Who can see the victim's location and when?

| Who | When | Ends |
|-----|------|------|
| Guardians | Only while alert status is active/acknowledged/dispatched | When alert resolves |
| Police | Only if alert is within their station's escalation scope | 30 days after resolve |
| Volunteers | Coarse location only until they accept the ping | After arriving |
| Nobody | At all other times | — |

Location is never shared in background except during Safe Walk (user-initiated) and volunteer availability (opt-in toggle). See docs/PRIVACY.md for the full retention schedule.

---

## Q: What if the police don't respond?

The **escalation ladder** runs server-side via pg_cron + client "kick" every 15 s:
- t+60s: Expand volunteer ping radius from 500m to 1.5km
- t+120s: All 3 nearest stations see UNACKNOWLEDGED flash on their console; guardians re-notified
- Duress: Immediate level 3

This does **not** guarantee a response. SheSafe is a complement to calling 112, not a replacement.

---

## Q: Can a stalker abuse the guardian or volunteer role?

- **Guardian links** require the victim to send a request, and the guardian to accept. The victim can revoke at any time.
- **Volunteers** are email-verified by an admin before being marked `verified = true`.
- Volunteers **never** receive the victim's phone number, address, or evidence.
- All volunteer views are access-logged.
- After 3 abuse reports, a volunteer is auto-suspended pending admin review.

---

## Q: Why not just call 112?

SheSafe **complements** emergency services — it does not replace them. Key differences:
- Automatic trigger when the victim can't speak (shake, struggle, snatch)
- Continuous GPS streaming to police console (not just a one-time call centre call)
- Guardians + community volunteers notified simultaneously
- Evidence preserved for complaint/court
- The victim can always call 112 directly from the deterrence screen

---

## Q: How accurate is detection?

See `docs/BENCHMARKS.md` for the full table.

**SYNTHETIC benchmark** (seeded generator, not real device):
- Shake TPR on 3-shake fixture: **reported in BENCHMARKS.md after running**
- False triggers on walking fixture: **0 at medium sensitivity (SYNTHETIC)**

**HONEST STATEMENT**: Synthetic accuracy ≠ real-world accuracy. The owner must record real fixtures on their device and report actual numbers. The agent cannot run physical sensor tests.

---

## Q: What does it cost to run?

| Service | Free tier limit | SheSafe usage |
|---------|----------------|---------------|
| Supabase DB | 500 MB | Well under for demo |
| Supabase Realtime | 200 concurrent connections | Fine for demo |
| Supabase Storage | 1 GB | ~30 min evidence per alert |
| Supabase Edge Functions | 500K invocations/month | Fine for demo |
| Expo Push | Free | No cost |
| Vercel | 100 GB bandwidth | Fine for demo |
| Nominatim | ≤1 req/s | Enforced in code |
| OSRM | Demo server | Demo scale only |

At scale (real deployment), Supabase paid plans and dedicated OSRM would be needed.

---

## Q: What is NOT built / known limitations?

1. iOS Critical Alerts (requires Apple entitlement, not free) — push may be silenced in DND
2. Android DND bypass (requires user consent) — documented, not auto-configured
3. Real sensor fixtures — only SYNTHETIC generated; owner must record real data
4. Supabase DB reset not run in agent environment — pgTAP tests written but NOT VERIFIED running
5. Maestro e2e not run — requires physical/emulated Android device
6. Battery benchmark — NOT VERIFIED, requires real device test
7. PDF export (P9) — code written, rendering not verified in agent environment
8. Safe Walk, Cab Guardian, Community Reports — logic implemented, UI incomplete
9. hi/kn TTS review — strings marked `reviewed: false`, need native speaker review
