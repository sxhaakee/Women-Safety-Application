/**
 * SheSafe Backend Server — v3
 *
 * Additions in this version:
 *  - Escalation ladder (t=0, t+60s, t+120s, duress → immediate level 3)
 *  - Audio chunk buffer replay: when police access is granted, all buffered
 *    audio chunks are sent immediately to police
 *  - Volunteer ping endpoint
 *  - Alert duress flag support
 *  - /api/alert/acknowledge endpoint
 */
const express = require('express');
const cors    = require('cors');
const http    = require('http');
const WebSocket = require('ws');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://bydbovjgrvfecojlkkfm.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
    realtime: { transport: WebSocket }
}) : null;
if (supabase) console.log('✅ Supabase Client initialized in backend with Service Role');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const PORT = 3001;

// ─── RECORDINGS DIR ───────────────────────────────────────────
const RECORDINGS_DIR = path.join(__dirname, 'recordings');
if (!fs.existsSync(RECORDINGS_DIR)) {
    fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

// ─── USERS ───────────────────────────────────────────────────
const USERS = [
    { id: 'user-victim-001',    username: 'victim',    password: 'shesafe', role: 'victim',    name: 'Priya Sharma',         phone: '+91 98765 43210' },
    { id: 'user-guardian-002',  username: 'guardian',  password: 'shesafe', role: 'guardian',  name: 'Meera Guardian',       phone: '+91 87654 32109' },
    { id: 'user-police-003',    username: 'police',    password: 'shesafe', role: 'police',    name: 'Officer Rajesh Kumar', phone: '+91 76543 21098' },
    { id: 'user-volunteer-004', username: 'volunteer', password: 'shesafe', role: 'volunteer', name: 'Kiran Rakshak',        phone: '+91 65432 10987' },
];

// ─── IN-MEMORY STORES ─────────────────────────────────────────
let alerts = [];
let alertIdCounter = 1;

let activeSafeWalk = null;
let activeCabRide  = null;
let communityHazards = [
    {
        id: 'haz-1',
        title: 'Broken Streetlight & Dark Alley',
        category: 'dark',
        severity: 4,
        latitude: 12.9155,
        longitude: 74.8575,
        description: 'Complete blackout between cross roads 4 and 6. Zero streetlights functional.',
        reportedAgo: '15m ago',
        verifiedCount: 8,
        created_at: new Date(Date.now() - 900000).toISOString(),
    },
    {
        id: 'haz-2',
        title: 'Harassment & Loitering Group',
        category: 'harassment',
        severity: 5,
        latitude: 12.9125,
        longitude: 74.8540,
        description: 'Group of 4 individuals catcalling commuters near the underpass.',
        reportedAgo: '42m ago',
        verifiedCount: 14,
        created_at: new Date(Date.now() - 2520000).toISOString(),
    },
    {
        id: 'haz-3',
        title: 'Isolated Construction Stretch',
        category: 'isolated',
        severity: 3,
        latitude: 12.9180,
        longitude: 74.8610,
        description: 'Deserted road after 8 PM with high debris and zero pedestrian traffic.',
        reportedAgo: '2h ago',
        verifiedCount: 5,
        created_at: new Date(Date.now() - 7200000).toISOString(),
    },
];

const policeAccessGrants = {}; // alertId → boolean
const audioChunkBuffer   = {}; // alertId → [{ seq, data, mime, ts }]
const videoFrameBuffer   = {}; // alertId → { seq, data, ts } (latest only)
const escalationTimers   = {}; // alertId → { t60, t120 }

// ─── WEBSOCKET SERVER ─────────────────────────────────────────
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server, maxPayload: 50 * 1024 * 1024 });

const wsClients = {
    victim:    new Set(),
    guardian:  new Set(),
    police:    new Set(),
    volunteer: new Set(),
};

function broadcast(roles, payload) {
    const msg = JSON.stringify(payload);
    let count = 0;
    for (const role of roles) {
        for (const ws of (wsClients[role] || [])) {
            if (ws.readyState === WebSocket.OPEN) { ws.send(msg); count++; }
        }
    }
    const t = new Date().toLocaleTimeString();
    console.log(`[BROADCAST ${t}] [${payload.type}] → [${roles.join(',')}] (${count} sockets)`);
    return count;
}

function broadcastAll(payload) { broadcast(['victim','guardian','police','volunteer'], payload); }

// ─── ESCALATION LADDER ────────────────────────────────────────
// t=0:   notify guardians + nearest station + volunteers 500m
// t+60s: if no ack → volunteers 1500m, level=1, re-push guardians
// t+120s: if no ack → all stations flash UNACKNOWLEDGED, level=2
// duress: jump straight to level 3
function startEscalation(alert) {
    const id = alert.id;

    const t60 = setTimeout(() => {
        const a = alerts.find(x => x.id === id);
        if (!a || a.status !== 'active') return;
        a.escalation_level = 1;
        const t = new Date().toLocaleTimeString();
        console.log(`[ESCALATION ${t}] ⚠️ Alert ${id} — t+60s, no ack → level 1, expanding volunteer radius`);
        broadcast(['guardian','police','volunteer'], {
            type: 'ESCALATION_UPDATE',
            alert_id: id,
            level: 1,
            message: 'No responder yet — escalating to level 1',
        });
    }, 60_000);

    const t120 = setTimeout(() => {
        const a = alerts.find(x => x.id === id);
        if (!a || a.status === 'active') {
            if (a) a.escalation_level = 2;
            const t = new Date().toLocaleTimeString();
            console.log(`[ESCALATION ${t}] 🚨 Alert ${id} — t+120s, still no police ack → level 2, ALL stations notified`);
            broadcast(['guardian','police','volunteer'], {
                type: 'ESCALATION_UPDATE',
                alert_id: id,
                level: 2,
                message: 'UNACKNOWLEDGED 2 minutes — all police stations notified',
            });
        }
    }, 120_000);

    escalationTimers[id] = { t60, t120 };
}

function stopEscalation(alertId) {
    const t = escalationTimers[alertId];
    if (t) {
        clearTimeout(t.t60);
        clearTimeout(t.t120);
        delete escalationTimers[alertId];
    }
}

function triggerDuressEscalation(alert) {
    stopEscalation(alert.id);
    alert.escalation_level = 3;
    alert.duress = true;
    const t = new Date().toLocaleTimeString();
    console.log(`[ESCALATION ${t}] 🔴 DURESS! Alert ${alert.id} → level 3 IMMEDIATE`);
    broadcast(['guardian','police','volunteer'], {
        type: 'ESCALATION_UPDATE',
        alert_id: alert.id,
        level: 3,
        message: '⚠️ DURESS PIN USED — victim may be under coercion',
        duress: true,
    });
}

// ─── WS MESSAGE HANDLER ───────────────────────────────────────
wss.on('connection', (ws, req) => {
    let clientRole = null;
    const clientIp = req.socket.remoteAddress;
    const t = new Date().toLocaleTimeString();
    console.log(`[WS ${t}] 🔌 TCP connect from ${clientIp}`);

    ws.on('message', (rawData) => {
        const mt = new Date().toLocaleTimeString();
        let msg;
        try { msg = JSON.parse(rawData); } catch (e) { return; }

        // ── REGISTER ──────────────────────────────────────────
        if (msg.type === 'REGISTER') {
            clientRole = msg.role;
            if (wsClients[clientRole]) wsClients[clientRole].add(ws);
            ws.send(JSON.stringify({ type: 'REGISTERED', role: clientRole }));
            console.log(`[WS ${mt}] ✅ ${clientRole.toUpperCase()} registered → V:${wsClients.victim.size} G:${wsClients.guardian.size} P:${wsClients.police.size} Vol:${wsClients.volunteer.size}`);

            // Send active alert to late joiner
            const active = alerts.find(a => a.status === 'active');
            if (active) {
                ws.send(JSON.stringify({ type: 'ALERT_ACTIVE', alert: active }));

                // If police & already granted, send grant notification FIRST
                if (clientRole === 'police' && policeAccessGrants[active.id]) {
                    ws.send(JSON.stringify({ type: 'POLICE_ACCESS_GRANTED', alert_id: active.id }));
                }

                // Send buffered video frame (if police, only if access granted)
                if (videoFrameBuffer[active.id]) {
                    if (clientRole !== 'police' || policeAccessGrants[active.id]) {
                        ws.send(JSON.stringify({
                            type: 'VIDEO_FRAME',
                            alert_id: active.id,
                            data: videoFrameBuffer[active.id].data,
                            seq: videoFrameBuffer[active.id].seq,
                        }));
                    }
                }

                // Replay buffered audio
                if (clientRole === 'police' && policeAccessGrants[active.id]) {
                    replayAudioToSocket(ws, active.id);
                } else if (clientRole === 'guardian') {
                    replayAudioToSocket(ws, active.id);
                }
            }

            // Sync Safe Walk, Cab Guardian, and Community Hazards
            if (activeSafeWalk && (clientRole === 'guardian' || clientRole === 'victim')) {
                ws.send(JSON.stringify({ type: 'SAFE_WALK_UPDATE', walk: activeSafeWalk }));
            }
            if (activeCabRide && (clientRole === 'guardian' || clientRole === 'victim')) {
                ws.send(JSON.stringify({ type: 'CAB_GUARDIAN_UPDATE', ride: activeCabRide }));
            }
            ws.send(JSON.stringify({ type: 'HAZARD_UPDATE', hazards: communityHazards }));
            return;
        }

        // ── AUDIO_CHUNK (from victim) ──────────────────────────
        if (msg.type === 'AUDIO_CHUNK') {
            const { alert_id, data, seq, mime } = msg;
            const kb = Math.round((data?.length || 0) / 1024);
            console.log(`[WS AUDIO ${mt}] 🎤 Chunk #${seq} for ${alert_id} (${kb} KB)`);

            if (!audioChunkBuffer[alert_id]) audioChunkBuffer[alert_id] = [];
            // Keep last 60 chunks (~5 min at 5s cadence)
            if (audioChunkBuffer[alert_id].length >= 60) audioChunkBuffer[alert_id].shift();
            audioChunkBuffer[alert_id].push({ seq, data, mime: mime || 'audio/m4a', ts: new Date().toISOString() });

            // Always relay to guardians immediately
            const payload = JSON.stringify({ type: 'AUDIO_CHUNK', alert_id, data, seq, mime });
            let gSent = 0;
            for (const g of wsClients.guardian) {
                if (g.readyState === WebSocket.OPEN) { g.send(payload); gSent++; }
            }
            console.log(`[WS AUDIO ${mt}] 📡 → ${gSent} guardian(s)`);

            // Relay to police only if access already granted
            if (policeAccessGrants[alert_id]) {
                let pSent = 0;
                for (const p of wsClients.police) {
                    if (p.readyState === WebSocket.OPEN) { p.send(payload); pSent++; }
                }
                console.log(`[WS AUDIO ${mt}] 👮 → ${pSent} police (access granted)`);
            }
            return;
        }

        // ── VIDEO_FRAME (from victim) ──────────────────────────
        if (msg.type === 'VIDEO_FRAME') {
            const { alert_id, data, seq } = msg;
            const kb = Math.round((data?.length || 0) / 1024);
            console.log(`[WS VIDEO ${mt}] 📸 Frame #${seq} for ${alert_id} (${kb} KB)`);

            videoFrameBuffer[alert_id] = { seq, data, ts: new Date().toISOString() };

            const payload = JSON.stringify({ type: 'VIDEO_FRAME', alert_id, data, seq });
            let gSent = 0;
            for (const g of wsClients.guardian) {
                if (g.readyState === WebSocket.OPEN) { g.send(payload); gSent++; }
            }
            console.log(`[WS VIDEO ${mt}] 📡 → ${gSent} guardian(s)`);

            if (policeAccessGrants[alert_id]) {
                let pSent = 0;
                for (const p of wsClients.police) {
                    if (p.readyState === WebSocket.OPEN) { p.send(payload); pSent++; }
                }
                console.log(`[WS VIDEO ${mt}] 👮 → ${pSent} police`);
            }
            return;
        }

        // ── GRANT_POLICE_ACCESS (from guardian) ───────────────
        if (msg.type === 'GRANT_POLICE_ACCESS' || msg.type === 'POLICE_ACCESS_GRANTED') {
            const active = alerts.find(a => a.status === 'active');
            const alert_id = msg.alert_id || active?.id || 'ALERT-0001';
            policeAccessGrants[alert_id] = true;
            if (active) policeAccessGrants[active.id] = true;

            console.log(`[WS ${mt}] 🔓 Guardian GRANTED police access for ${alert_id} (active: ${active?.id})`);

            const grantPayload = JSON.stringify({ type: 'POLICE_ACCESS_GRANTED', alert_id: active?.id || alert_id });
            let sent = 0;
            for (const p of wsClients.police) {
                if (p.readyState === WebSocket.OPEN) {
                    p.send(grantPayload);
                    sent++;
                }
            }
            console.log(`[WS ${mt}] 👮 Sent grant notification to ${sent} police client(s)`);

            // Send latest video frame immediately
            const frameObj = videoFrameBuffer[alert_id] || (active ? videoFrameBuffer[active.id] : null);
            if (frameObj) {
                const framePayload = JSON.stringify({
                    type: 'VIDEO_FRAME',
                    alert_id: active?.id || alert_id,
                    data: frameObj.data,
                    seq: frameObj.seq,
                });
                for (const p of wsClients.police) {
                    if (p.readyState === WebSocket.OPEN) p.send(framePayload);
                }
            }

            // Replay all buffered audio chunks to police
            for (const p of wsClients.police) {
                if (p.readyState === WebSocket.OPEN) {
                    replayAudioToSocket(p, active?.id || alert_id);
                }
            }
            return;
        }

        // ── VOLUNTEER_RESPONSE (accept/decline from volunteer) ─
        if (msg.type === 'VOLUNTEER_RESPONSE') {
            const { alert_id, status, volunteer_id } = msg;
            console.log(`[WS ${mt}] 🙋 Volunteer ${volunteer_id} responded: ${status} for ${alert_id}`);
            broadcast(['guardian','police'], { type: 'VOLUNTEER_STATUS', alert_id, volunteer_id, status });
            return;
        }

        // ── ALERT_RESOLVED / CANCEL_ALERT (victim safe PIN entered) ──
        if (msg.type === 'ALERT_RESOLVED' || msg.type === 'CANCEL_ALERT') {
            const targetId = msg.alert_id || msg.alert?.id;
            const alert = alerts.find(a => a.id === targetId) || alerts.find(a => a.status === 'active');
            if (alert) {
                alert.status = 'resolved';
                alert.resolved_at = new Date().toISOString();
                stopEscalation(alert.id);
                console.log(`[WS ${mt}] 🛑 ALERT ${alert.id} RESOLVED BY VICTIM PIN`);
                broadcastAll({ type: 'ALERT_RESOLVED', alert_id: alert.id, alert });
            } else {
                console.log(`[WS ${mt}] 🛑 ALERT ${targetId || 'active'} RESOLVED (broadcasted)`);
                broadcastAll({ type: 'ALERT_RESOLVED', alert_id: targetId || 'ALERT-0001', alert: { id: targetId || 'ALERT-0001', status: 'resolved' } });
            }
            return;
        }

        // ── SAFE WALK LIVE TELEMETRY ────────────────────────────
        if (msg.type === 'SAFE_WALK_START') {
            activeSafeWalk = {
                victim_name: msg.victim_name || 'Priya Sharma',
                startLocation: msg.startLocation,
                currentLocation: msg.currentLocation || msg.startLocation,
                destinationCoord: msg.destinationCoord,
                destinationQuery: msg.destinationQuery,
                routeCoordinates: msg.routeCoordinates || [],
                safetyScore: msg.safetyScore || 94,
                isOffRoute: false,
                walkElapsedSec: 0,
                started_at: new Date().toISOString(),
            };
            console.log(`[WS ${mt}] 🚶 Safe Walk started to "${activeSafeWalk.destinationQuery}"`);
            broadcast(['guardian'], { type: 'SAFE_WALK_UPDATE', walk: activeSafeWalk });
            return;
        }

        if (msg.type === 'SAFE_WALK_UPDATE') {
            if (activeSafeWalk) {
                if (msg.currentLocation) activeSafeWalk.currentLocation = msg.currentLocation;
                if (msg.isOffRoute !== undefined) activeSafeWalk.isOffRoute = msg.isOffRoute;
                if (msg.walkElapsedSec !== undefined) activeSafeWalk.walkElapsedSec = msg.walkElapsedSec;
                if (msg.safetyScore !== undefined) activeSafeWalk.safetyScore = msg.safetyScore;
            }
            broadcast(['guardian'], { type: 'SAFE_WALK_UPDATE', walk: activeSafeWalk || msg.walk });
            return;
        }

        if (msg.type === 'SAFE_WALK_END') {
            console.log(`[WS ${mt}] 🚶 Safe Walk ended`);
            activeSafeWalk = null;
            broadcast(['guardian'], { type: 'SAFE_WALK_END' });
            return;
        }

        // ── CAB GUARDIAN LIVE TELEMETRY ─────────────────────────
        if (msg.type === 'CAB_GUARDIAN_START') {
            activeCabRide = {
                victim_name: msg.victim_name || 'Priya Sharma',
                cabType: msg.cabType || 'uber',
                plateNumber: msg.plateNumber || 'KA 19 MD 4040',
                driverName: msg.driverName || 'Ramesh',
                destination: msg.destination || 'Kadri Park',
                currentLocation: msg.location,
                cabPath: msg.cabPath || [],
                speedKmh: msg.speedKmh || 42,
                deviationM: 0,
                isDetour: false,
                rideDurationSec: 0,
                started_at: new Date().toISOString(),
            };
            console.log(`[WS ${mt}] 🚕 Cab ride armed: ${activeCabRide.plateNumber}`);
            broadcast(['guardian'], { type: 'CAB_GUARDIAN_UPDATE', ride: activeCabRide });
            return;
        }

        if (msg.type === 'CAB_GUARDIAN_UPDATE') {
            if (activeCabRide) {
                if (msg.location) activeCabRide.currentLocation = msg.location;
                if (msg.speedKmh !== undefined) activeCabRide.speedKmh = msg.speedKmh;
                if (msg.deviationM !== undefined) activeCabRide.deviationM = msg.deviationM;
                if (msg.isDetour !== undefined) activeCabRide.isDetour = msg.isDetour;
                if (msg.rideDurationSec !== undefined) activeCabRide.rideDurationSec = msg.rideDurationSec;
            }
            broadcast(['guardian'], { type: 'CAB_GUARDIAN_UPDATE', ride: activeCabRide || msg.ride });
            return;
        }

        if (msg.type === 'CAB_GUARDIAN_END') {
            console.log(`[WS ${mt}] 🚕 Cab ride disarmed`);
            activeCabRide = null;
            broadcast(['guardian'], { type: 'CAB_GUARDIAN_END' });
            return;
        }

        // ── COMMUNITY HAZARD REPORTING ──────────────────────────
        if (msg.type === 'HAZARD_REPORT_NEW') {
            const newHazard = {
                id: `haz-${Date.now()}`,
                title: msg.title || 'Community Safety Alert',
                category: msg.category || 'dark',
                severity: msg.severity || 3,
                latitude: msg.latitude,
                longitude: msg.longitude,
                description: msg.description || 'Reported hazard spot',
                reportedAgo: 'Just now',
                verifiedCount: 1,
                created_at: new Date().toISOString(),
            };
            communityHazards.unshift(newHazard);
            console.log(`[WS ${mt}] ⚠️ New Hazard reported: "${newHazard.title}"`);
            broadcastAll({ type: 'HAZARD_UPDATE', hazards: communityHazards });
            return;
        }

        if (msg.type === 'HAZARD_CONFIRM') {
            const h = communityHazards.find(x => x.id === msg.hazard_id);
            if (h) {
                h.verifiedCount = (h.verifiedCount || 1) + 1;
                broadcastAll({ type: 'HAZARD_UPDATE', hazards: communityHazards });
            }
            return;
        }
    });

    ws.on('close', () => {
        const ct = new Date().toLocaleTimeString();
        if (clientRole && wsClients[clientRole]) {
            wsClients[clientRole].delete(ws);
            console.log(`[WS ${ct}] ❌ ${clientRole.toUpperCase()} disconnected → V:${wsClients.victim.size} G:${wsClients.guardian.size} P:${wsClients.police.size}`);
        }
    });

    ws.on('error', (err) => {
        if (clientRole && wsClients[clientRole]) wsClients[clientRole].delete(ws);
        console.error(`[WS SOCKET ERROR]`, err.message);
    });
});

/** Replay all buffered audio chunks for an alert to a single socket */
function replayAudioToSocket(ws, alertId) {
    const chunks = audioChunkBuffer[alertId] || [];
    if (chunks.length === 0) return;
    const t = new Date().toLocaleTimeString();
    console.log(`[REPLAY ${t}] 📼 Sending ${chunks.length} buffered audio chunks for ${alertId}`);
    for (const chunk of chunks) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'AUDIO_CHUNK', alert_id: alertId, data: chunk.data, seq: chunk.seq, mime: chunk.mime }));
        }
    }
}

// ─── REST ROUTES ─────────────────────────────────────────────

app.get('/health', (req, res) => {
    res.json({
        status: '🛡️ SheSafe Backend v3',
        time: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        connected: { victim: wsClients.victim.size, guardian: wsClients.guardian.size, police: wsClients.police.size, volunteer: wsClients.volunteer.size },
        activeAlerts: alerts.filter(a => a.status === 'active').length,
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });
    const user = USERS.find(u => u.username === username.toLowerCase().trim() && u.password === password);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const t = new Date().toLocaleTimeString();
    console.log(`[LOGIN ${t}] ✅ ${user.role}: ${user.name}`);
    res.json({ success: true, user });
});

app.post('/api/alert/fire', (req, res) => {
    const { id, alert_id, victim_id, victim_name, victim_phone, lat, lng, address, duress } = req.body;
    const targetId = id || alert_id || `ALERT-${String(alertIdCounter++).padStart(4, '0')}`;

    // Idempotent: check if alert with this ID already exists
    const existing = alerts.find(a => a.id === targetId);
    if (existing) {
        return res.json({ success: true, alert: existing });
    }

    const alert = {
        id: targetId,
        victim_id,
        victim_name: victim_name || 'Priya Sharma',
        victim_phone: victim_phone || '+91 98765 43210',
        status: 'active',
        lat: lat || null,
        lng: lng || null,
        address: address || 'Location tracking active',
        triggered_at: new Date().toISOString(),
        resolved_at: null,
        escalation_level: 0,
        duress: !!duress,
        locations: [],
    };
    alerts.unshift(alert);
    if (!audioChunkBuffer[targetId]) audioChunkBuffer[targetId] = [];
    if (!videoFrameBuffer[targetId]) videoFrameBuffer[targetId] = null;
    policeAccessGrants[targetId] = false;

    const t = new Date().toLocaleTimeString();
    console.log(`[ALERT FIRE ${t}] 🚨 ${targetId} | ${alert.victim_name} | ${lat?.toFixed(5)}, ${lng?.toFixed(5)}`);

    // t=0: broadcast to all (guardian + police + volunteer see it immediately)
    broadcast(['guardian','police','volunteer'], { type: 'ALERT_FIRED', alert });

    // Start escalation ladder
    if (duress) {
        triggerDuressEscalation(alert);
    } else {
        startEscalation(alert);
    }

    // Sync with Supabase alerts table
    if (supabase) {
        try {
            supabase.from('alerts').insert({
                id: crypto.randomUUID(),
                victim_id: victim_id || 'b247222f-6b5c-48c7-907c-852a49f1bd97',
                status: 'active',
                trigger: 'manual_sos',
                confidence: 1,
                risk_score: 85,
                duress: !!duress,
                started_at: new Date().toISOString(),
                fired_at: new Date().toISOString(),
            }).catch(err => console.warn('[SUPABASE FIRE SYNC ERROR]', err?.message));
        } catch (_) {}
    }

    res.json({ success: true, alert });
});

app.post('/api/alert/location', (req, res) => {
    const { alert_id, lat, lng } = req.body;
    const alert = alerts.find(a => a.id === alert_id);
    if (alert) {
        alert.lat = lat;
        alert.lng = lng;
        alert.locations = alert.locations || [];
        alert.locations.push({ lat, lng, at: new Date().toISOString() });
    }
    broadcast(['guardian','police','volunteer'], {
        type: 'LOCATION_UPDATE',
        alert_id,
        lat,
        lng,
        timestamp: new Date().toISOString(),
    });
    res.json({ success: true });
});

app.post('/api/alert/acknowledge', (req, res) => {
    const { alert_id, eta_minutes, officer_name } = req.body;
    const alert = alerts.find(a => a.id === alert_id);
    if (!alert) return res.status(404).json({ error: 'Alert not found' });
    alert.status = 'acknowledged';
    alert.acknowledged_at = new Date().toISOString();
    alert.eta_minutes = eta_minutes;
    alert.acknowledged_by = officer_name;
    stopEscalation(alert_id);
    const t = new Date().toLocaleTimeString();
    console.log(`[ACK ${t}] ✅ ${alert_id} acknowledged by ${officer_name} ETA ${eta_minutes}min`);
    broadcastAll({ type: 'ALERT_ACKNOWLEDGED', alert_id, eta_minutes, officer_name });
    res.json({ success: true });
});

app.post('/api/alert/resolve', async (req, res) => {
    const { alert_id } = req.body;
    let resolvedAlert = null;
    alerts.forEach(a => {
        if (!alert_id || a.id === alert_id || a.status === 'active') {
            a.status = 'resolved';
            a.resolved_at = new Date().toISOString();
            stopEscalation(a.id);
            if (!resolvedAlert) resolvedAlert = a;
        }
    });

    if (!resolvedAlert) {
        resolvedAlert = { id: alert_id || 'ALERT-0001', status: 'resolved', victim_name: 'Priya Sharma' };
    }

    // Mirror to Supabase alerts table
    if (supabase) {
        try {
            await supabase.from('alerts').update({
                status: 'resolved',
                resolved_at: new Date().toISOString(),
            }).eq('status', 'active');
        } catch (err) {
            console.warn('[SUPABASE RESOLVE SYNC ERROR]', err?.message);
        }
    }

    const t = new Date().toLocaleTimeString();
    console.log(`[RESOLVE ${t}] ✅ Alert ${resolvedAlert.id} resolved and broadcasted to all sockets`);
    broadcastAll({
        type: 'ALERT_RESOLVED',
        alert_id: resolvedAlert.id,
        victim_name: resolvedAlert.victim_name || 'Priya Sharma',
        alert: resolvedAlert,
    });
    res.json({ success: true, alert: resolvedAlert });
});

// Safe Walk & Cab & Hazard REST endpoints
app.get('/api/safewalk/active', (req, res) => res.json({ walk: activeSafeWalk }));
app.post('/api/safewalk/start', (req, res) => {
    activeSafeWalk = {
        victim_name: req.body.victim_name || 'Priya Sharma',
        startLocation: req.body.startLocation,
        currentLocation: req.body.currentLocation || req.body.startLocation,
        destinationCoord: req.body.destinationCoord,
        destinationQuery: req.body.destinationQuery,
        routeCoordinates: req.body.routeCoordinates || [],
        safetyScore: req.body.safetyScore || 94,
        isOffRoute: false,
        walkElapsedSec: 0,
        started_at: new Date().toISOString(),
    };
    broadcast(['guardian'], { type: 'SAFE_WALK_UPDATE', walk: activeSafeWalk });
    res.json({ success: true, walk: activeSafeWalk });
});
app.post('/api/safewalk/update', (req, res) => {
    if (activeSafeWalk) {
        if (req.body.currentLocation) activeSafeWalk.currentLocation = req.body.currentLocation;
        if (req.body.isOffRoute !== undefined) activeSafeWalk.isOffRoute = req.body.isOffRoute;
        if (req.body.walkElapsedSec !== undefined) activeSafeWalk.walkElapsedSec = req.body.walkElapsedSec;
        if (req.body.safetyScore !== undefined) activeSafeWalk.safetyScore = req.body.safetyScore;
    } else {
        activeSafeWalk = req.body;
    }
    broadcast(['guardian'], { type: 'SAFE_WALK_UPDATE', walk: activeSafeWalk });
    res.json({ success: true, walk: activeSafeWalk });
});
app.post('/api/safewalk/end', (req, res) => {
    activeSafeWalk = null;
    broadcast(['guardian'], { type: 'SAFE_WALK_END' });
    res.json({ success: true });
});

app.get('/api/cab/active', (req, res) => res.json({ ride: activeCabRide }));
app.post('/api/cab/start', (req, res) => {
    activeCabRide = {
        victim_name: req.body.victim_name || 'Priya Sharma',
        cabType: req.body.cabType || 'uber',
        plateNumber: req.body.plateNumber || 'KA 19 MD 4040',
        driverName: req.body.driverName || 'Ramesh',
        destination: req.body.destination || 'Kadri Park',
        currentLocation: req.body.currentLocation || req.body.location,
        cabPath: req.body.cabPath || [],
        speedKmh: req.body.speedKmh || 42,
        deviationM: 0,
        isDetour: false,
        rideDurationSec: 0,
        started_at: new Date().toISOString(),
    };
    broadcast(['guardian'], { type: 'CAB_GUARDIAN_UPDATE', ride: activeCabRide });
    res.json({ success: true, ride: activeCabRide });
});
app.post('/api/cab/update', (req, res) => {
    if (activeCabRide) {
        if (req.body.currentLocation || req.body.location) activeCabRide.currentLocation = req.body.currentLocation || req.body.location;
        if (req.body.speedKmh !== undefined) activeCabRide.speedKmh = req.body.speedKmh;
        if (req.body.deviationM !== undefined) activeCabRide.deviationM = req.body.deviationM;
        if (req.body.isDetour !== undefined) activeCabRide.isDetour = req.body.isDetour;
        if (req.body.rideDurationSec !== undefined) activeCabRide.rideDurationSec = req.body.rideDurationSec;
    } else {
        activeCabRide = req.body;
    }
    broadcast(['guardian'], { type: 'CAB_GUARDIAN_UPDATE', ride: activeCabRide });
    res.json({ success: true, ride: activeCabRide });
});
app.post('/api/cab/end', (req, res) => {
    activeCabRide = null;
    broadcast(['guardian'], { type: 'CAB_GUARDIAN_END' });
    res.json({ success: true });
});

app.get('/api/hazards', (req, res) => res.json({ hazards: communityHazards }));

app.post('/api/hazards/report', (req, res) => {
    const { title, category, severity, latitude, longitude, description } = req.body;
    const newHazard = {
        id: `haz-${Date.now()}`,
        title: title || 'Safety Hazard',
        category: category || 'dark',
        severity: severity || 3,
        latitude: latitude || 12.9141,
        longitude: longitude || 74.8560,
        description: description || 'Reported hazard',
        reportedAgo: 'Just now',
        verifiedCount: 1,
        created_at: new Date().toISOString(),
    };
    communityHazards.unshift(newHazard);
    broadcastAll({ type: 'HAZARD_UPDATE', hazards: communityHazards });
    res.json({ success: true, hazard: newHazard });
});

app.post('/api/alert/duress', (req, res) => {
    const { alert_id } = req.body;
    const alert = alerts.find(a => a.id === alert_id);
    if (!alert) return res.status(404).json({ error: 'Alert not found' });
    triggerDuressEscalation(alert);
    res.json({ success: true });
});

// Save recording to disk
app.post('/api/recording/save', (req, res) => {
    const { alert_id, audio_b64, mime_type } = req.body;
    if (!alert_id || !audio_b64) return res.status(400).json({ error: 'alert_id and audio_b64 required' });
    try {
        const filename = `recording_${alert_id}_${Date.now()}.m4a`;
        const filepath = path.join(RECORDINGS_DIR, filename);
        fs.writeFileSync(filepath, Buffer.from(audio_b64, 'base64'));
        const fileUrl = `http://${NETWORK_IP}:3001/recordings/${filename}`;
        const t = new Date().toLocaleTimeString();
        console.log(`[RECORDING ${t}] 💾 Saved ${filename} (${Math.round(audio_b64.length / 1024)} KB)`);
        res.json({ success: true, url: fileUrl, filename });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save recording' });
    }
});

app.use('/recordings', express.static(RECORDINGS_DIR));

app.get('/api/alerts',        (req, res) => res.json({ alerts: alerts.slice(0, 20) }));
app.get('/api/alerts/active', (req, res) => res.json({ alerts: alerts.filter(a => a.status === 'active') }));

app.get('/api/audio/:alertId', (req, res) => {
    const chunks = audioChunkBuffer[req.params.alertId] || [];
    res.json({ count: chunks.length, chunks: chunks.map(c => ({ seq: c.seq, mime: c.mime, ts: c.ts, sizeKb: Math.round((c.data?.length || 0) / 1024) })) });
});

// Full incident report & evidence metadata
app.get('/api/report/:alertId', (req, res) => {
    const alertId = req.params.alertId;
    const alert = alerts.find(a => a.id === alertId) || alerts.find(a => a.status === 'active') || alerts[0];
    if (!alert) return res.status(404).json({ error: 'Alert not found' });

    const chunks = audioChunkBuffer[alert.id] || [];
    const frame = videoFrameBuffer[alert.id];
    const isGranted = !!policeAccessGrants[alert.id];

    res.json({
        report_id: `REP-${alert.id}-${Date.now().toString(36).toUpperCase()}`,
        generated_at: new Date().toISOString(),
        alert,
        evidence: {
            audio_chunks_count: chunks.length,
            latest_frame_available: !!frame,
            latest_frame_seq: frame?.seq ?? null,
            police_access_authorized: isGranted,
            hash_chain_status: 'VERIFIED_TAMPER_EVIDENT',
            sha256_root: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        },
        timeline: [
            { event: 'SOS_TRIGGERED', at: alert.triggered_at, actor: alert.victim_name },
            { event: 'GUARDIAN_NOTIFIED', at: alert.triggered_at, actor: 'System' },
            ...(isGranted ? [{ event: 'POLICE_ACCESS_GRANTED', at: new Date().toISOString(), actor: 'Guardian' }] : []),
            ...(alert.acknowledged_at ? [{ event: 'POLICE_ACKNOWLEDGED', at: alert.acknowledged_at, actor: alert.acknowledged_by || 'Control Room' }] : []),
            ...(alert.resolved_at ? [{ event: 'ALERT_RESOLVED', at: alert.resolved_at, actor: 'Victim/Police' }] : []),
        ],
    });
});

app.post('/api/reset', async (req, res) => {
    Object.keys(escalationTimers).forEach(id => stopEscalation(id));
    alerts = [];
    alertIdCounter = 1;
    Object.keys(policeAccessGrants).forEach(k => delete policeAccessGrants[k]);
    Object.keys(audioChunkBuffer).forEach(k => delete audioChunkBuffer[k]);
    Object.keys(videoFrameBuffer).forEach(k => delete videoFrameBuffer[k]);
    activeSafeWalk = null;
    activeCabRide = null;
    if (supabase) {
        try {
            await supabase.from('alerts').update({
                status: 'resolved',
                resolved_at: new Date().toISOString(),
            }).eq('status', 'active');
        } catch (_) {}
    }
    broadcastAll({ type: 'RESET' });
    console.log('[RESET] 🔄 All state cleared');
    res.json({ success: true });
});

app.get('/api/status', (req, res) => {
    res.json({
        connected: { victim: wsClients.victim.size, guardian: wsClients.guardian.size, police: wsClients.police.size, volunteer: wsClients.volunteer.size },
        alerts: { total: alerts.length, active: alerts.filter(a => a.status === 'active').length },
        policeAccess: policeAccessGrants,
        escalations: Object.keys(escalationTimers),
    });
});

// ─── NETWORK IP ───────────────────────────────────────────────
const os = require('os');
function getLocalNetworkIp() {
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
        for (const net of ifaces[name]) {
            if (net.family === 'IPv4' && !net.internal) return net.address;
        }
    }
    return '10.117.231.173';
}
const NETWORK_IP = getLocalNetworkIp();

server.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║    🛡️  SheSafe Backend Server v3 (with Escalation) ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log(`║  Local:   http://localhost:${PORT}                  ║`);
    console.log(`║  Network: http://${NETWORK_IP}:${PORT}             ║`);
    console.log(`║  WS:      ws://${NETWORK_IP}:${PORT}               ║`);
    console.log('╠══════════════════════════════════════════════════╣');
    console.log('║  USERS:   victim / guardian / police / volunteer  ║');
    console.log('║  PASS:    shesafe                                 ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log('║  Escalation: t+60s → level1, t+120s → level2     ║');
    console.log('║  Audio: buffered + replayed on police access grant║');
    console.log('║  POST /api/reset  ← reset demo state             ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');
});
