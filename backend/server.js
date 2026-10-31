const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const PORT = 3001;

// Ensure recordings directory exists
const RECORDINGS_DIR = path.join(__dirname, 'recordings');
if (!fs.existsSync(RECORDINGS_DIR)) {
    fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
    console.log(`[SERVER] 📁 Created recordings directory: ${RECORDINGS_DIR}`);
}

// ─── HARDCODED DATA STORE ────────────────────────────────────

const USERS = [
    {
        id: 'user-victim-001',
        username: 'victim',
        password: 'shesafe',
        role: 'victim',
        name: 'Priya Sharma',
        phone: '+91 98765 43210',
    },
    {
        id: 'user-guardian-002',
        username: 'guardian',
        password: 'shesafe',
        role: 'guardian',
        name: 'Meera Guardian',
        phone: '+91 87654 32109',
    },
    {
        id: 'user-police-003',
        username: 'police',
        password: 'shesafe',
        role: 'police',
        name: 'Officer Rajesh Kumar',
        phone: '+91 76543 21098',
    },
];

// In-memory stores
let alerts = [];
let alertIdCounter = 1;

// Police access grants: alertId → boolean
const policeAccessGrants = {};

// In-memory chunk buffers for replay (latest session only)
const audioChunkBuffer = {}; // alertId → [{ seq, data, ts }]
const videoFrameBuffer = {}; // alertId → { seq, data, ts } (only latest frame)

// ─── WEBSOCKET SERVER ────────────────────────────────────────

const server = http.createServer(app);

// Increase max payload to 50 MB to handle base64 audio/video chunks
const wss = new WebSocket.Server({ server, maxPayload: 50 * 1024 * 1024 });

// Map: role → Set of connected sockets
const wsClients = {
    victim: new Set(),
    guardian: new Set(),
    police: new Set(),
};

wss.on('connection', (ws, req) => {
    let clientRole = null;
    const clientIp = req.socket.remoteAddress;
    const time = new Date().toLocaleTimeString();
    console.log(`[SERVER WS ${time}] 🔌 New WebSocket TCP Connection from IP: ${clientIp}`);

    ws.on('message', (rawData) => {
        const msgTime = new Date().toLocaleTimeString();
        let msg;
        try {
            msg = JSON.parse(rawData);
        } catch (e) {
            console.error('[SERVER WS ERROR] Parse error:', e.message);
            return;
        }

        // ── REGISTER ──────────────────────────────────────────
        if (msg.type === 'REGISTER') {
            clientRole = msg.role;
            if (wsClients[clientRole]) wsClients[clientRole].add(ws);

            ws.send(JSON.stringify({
                type: 'REGISTERED',
                role: clientRole,
                message: `Connected as ${clientRole}`,
            }));
            console.log(`[SERVER WS ${msgTime}] ✅ ${clientRole.toUpperCase()} Registered! Counts → V:${wsClients.victim.size} G:${wsClients.guardian.size} P:${wsClients.police.size}`);

            // Send active alert to late joiner
            const active = alerts.find(a => a.status === 'active');
            if (active) {
                console.log(`[SERVER WS ${msgTime}] 🚨 Sending active alert ${active.id} to newly connected ${clientRole}`);
                ws.send(JSON.stringify({ type: 'ALERT_ACTIVE', alert: active }));

                // Send latest video frame if available
                if (videoFrameBuffer[active.id]) {
                    ws.send(JSON.stringify({
                        type: 'VIDEO_FRAME',
                        alert_id: active.id,
                        data: videoFrameBuffer[active.id].data,
                        seq: videoFrameBuffer[active.id].seq,
                    }));
                    console.log(`[SERVER WS ${msgTime}] 📸 Sent buffered video frame to late-joining ${clientRole}`);
                }

                // Send police access status to police
                if (clientRole === 'police' && policeAccessGrants[active.id]) {
                    ws.send(JSON.stringify({ type: 'POLICE_ACCESS_GRANTED', alert_id: active.id }));
                    console.log(`[SERVER WS ${msgTime}] 🔓 Notified late-joining POLICE: access already granted for ${active.id}`);
                }
            }
            return;
        }

        // ── AUDIO_CHUNK (from victim) ──────────────────────────
        if (msg.type === 'AUDIO_CHUNK') {
            const { alert_id, data, seq, mime } = msg;
            console.log(`[SERVER WS AUDIO ${msgTime}] 🎤 Audio chunk #${seq} for alert ${alert_id} (${Math.round(data.length / 1024)} KB)`);

            // Buffer chunk
            if (!audioChunkBuffer[alert_id]) audioChunkBuffer[alert_id] = [];
            audioChunkBuffer[alert_id].push({ seq, data, mime, ts: new Date().toISOString() });

            // Relay to guardian always
            const guardianPayload = JSON.stringify({ type: 'AUDIO_CHUNK', alert_id, data, seq, mime });
            let sent = 0;
            for (const gsock of wsClients.guardian) {
                if (gsock.readyState === WebSocket.OPEN) { gsock.send(guardianPayload); sent++; }
            }
            console.log(`[SERVER WS AUDIO ${msgTime}] 📡 Relayed audio chunk #${seq} to ${sent} guardian(s)`);

            // Relay to police only if access granted
            if (policeAccessGrants[alert_id]) {
                let pSent = 0;
                for (const psock of wsClients.police) {
                    if (psock.readyState === WebSocket.OPEN) { psock.send(guardianPayload); pSent++; }
                }
                console.log(`[SERVER WS AUDIO ${msgTime}] 👮 Relayed audio chunk #${seq} to ${pSent} police (access granted)`);
            }
            return;
        }

        // ── VIDEO_FRAME (from victim) ──────────────────────────
        if (msg.type === 'VIDEO_FRAME') {
            const { alert_id, data, seq } = msg;
            console.log(`[SERVER WS VIDEO ${msgTime}] 📸 Video frame #${seq} for alert ${alert_id} (${Math.round(data.length / 1024)} KB)`);

            // Buffer latest frame only
            videoFrameBuffer[alert_id] = { seq, data, ts: new Date().toISOString() };

            const framePayload = JSON.stringify({ type: 'VIDEO_FRAME', alert_id, data, seq });

            // Relay to guardian
            let gSent = 0;
            for (const gsock of wsClients.guardian) {
                if (gsock.readyState === WebSocket.OPEN) { gsock.send(framePayload); gSent++; }
            }
            console.log(`[SERVER WS VIDEO ${msgTime}] 📡 Relayed video frame #${seq} to ${gSent} guardian(s)`);

            // Relay to police only if access granted
            if (policeAccessGrants[alert_id]) {
                let pSent = 0;
                for (const psock of wsClients.police) {
                    if (psock.readyState === WebSocket.OPEN) { psock.send(framePayload); pSent++; }
                }
                console.log(`[SERVER WS VIDEO ${msgTime}] 👮 Relayed video frame #${seq} to ${pSent} police (access granted)`);
            }
            return;
        }

        // ── GRANT_POLICE_ACCESS (from guardian) ───────────────
        if (msg.type === 'GRANT_POLICE_ACCESS') {
            const { alert_id } = msg;
            policeAccessGrants[alert_id] = true;
            console.log(`[SERVER WS ${msgTime}] 🔓 Guardian GRANTED police access for alert ${alert_id}!`);

            // Notify all police clients
            const grantPayload = JSON.stringify({ type: 'POLICE_ACCESS_GRANTED', alert_id });
            let sent = 0;
            for (const psock of wsClients.police) {
                if (psock.readyState === WebSocket.OPEN) { psock.send(grantPayload); sent++; }
            }
            console.log(`[SERVER WS ${msgTime}] 👮 Police access grant notification sent to ${sent} police client(s)`);

            // Send latest buffered video frame to police immediately
            if (videoFrameBuffer[alert_id]) {
                const framePayload = JSON.stringify({
                    type: 'VIDEO_FRAME',
                    alert_id,
                    data: videoFrameBuffer[alert_id].data,
                    seq: videoFrameBuffer[alert_id].seq,
                });
                for (const psock of wsClients.police) {
                    if (psock.readyState === WebSocket.OPEN) psock.send(framePayload);
                }
                console.log(`[SERVER WS ${msgTime}] 📸 Sent buffered video frame to police after access grant`);
            }
            return;
        }

    });

    ws.on('close', () => {
        const closeTime = new Date().toLocaleTimeString();
        if (clientRole && wsClients[clientRole]) {
            wsClients[clientRole].delete(ws);
            console.log(`[SERVER WS ${closeTime}] ❌ ${clientRole.toUpperCase()} Disconnected. Remaining → V:${wsClients.victim.size} G:${wsClients.guardian.size} P:${wsClients.police.size}`);
        }
    });

    ws.on('error', (err) => {
        console.error(`[SERVER WS SOCKET ERROR]:`, err.message);
        if (clientRole && wsClients[clientRole]) wsClients[clientRole].delete(ws);
    });
});

function broadcast(roles, payload) {
    const time = new Date().toLocaleTimeString();
    const msg = JSON.stringify(payload);
    let count = 0;
    for (const role of roles) {
        for (const ws of (wsClients[role] || [])) {
            if (ws.readyState === WebSocket.OPEN) { ws.send(msg); count++; }
        }
    }
    console.log(`[SERVER BROADCAST ${time}] 📡 Pushed [${payload.type}] to [${roles.join(', ')}] (${count} sockets)`);
}

function broadcastAll(payload) {
    broadcast(['victim', 'guardian', 'police'], payload);
}

// ─── REST ROUTES ─────────────────────────────────────────────

app.get('/health', (req, res) => {
    console.log(`[SERVER HTTP GET /health] Status checked`);
    res.json({
        status: '🛡️ SheSafe Backend Running',
        time: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        network: `http://${NETWORK_IP}:3001`,
        ws: `ws://${NETWORK_IP}:3001`,
        connectedClients: {
            victim: wsClients.victim.size,
            guardian: wsClients.guardian.size,
            police: wsClients.police.size,
        },
        activeAlerts: alerts.filter(a => a.status === 'active').length,
        policeAccessGrants,
    });
});

app.post('/api/login', (req, res) => {
    const time = new Date().toLocaleTimeString();
    const { username, password } = req.body;
    console.log(`[SERVER HTTP POST /api/login ${time}] 🔑 Login: "${username}"`);
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    const user = USERS.find(u => u.username === username.toLowerCase().trim() && u.password === password);
    if (!user) {
        console.log(`[SERVER HTTP POST /api/login ${time}] ❌ Invalid credentials for "${username}"`);
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    console.log(`[SERVER HTTP POST /api/login ${time}] ✅ Login OK! Role: ${user.role}, Name: ${user.name}`);
    res.json({ success: true, user });
});

app.post('/api/alert/fire', (req, res) => {
    const time = new Date().toLocaleTimeString();
    const { victim_id, victim_name, victim_phone, lat, lng, address } = req.body;
    const alertId = `ALERT-${String(alertIdCounter++).padStart(4, '0')}`;
    const alert = {
        id: alertId,
        victim_id,
        victim_name: victim_name || 'Priya Sharma',
        victim_phone: victim_phone || '+91 98765 43210',
        status: 'active',
        lat: lat || null,
        lng: lng || null,
        address: address || 'Location tracking active',
        triggered_at: new Date().toISOString(),
        resolved_at: null,
        locations: [],
    };
    alerts.unshift(alert);
    // Initialize buffers
    audioChunkBuffer[alertId] = [];
    videoFrameBuffer[alertId] = null;
    policeAccessGrants[alertId] = false;

    console.log(`[SERVER HTTP POST /api/alert/fire ${time}] 🚨 ALERT FIRED! ID: ${alertId} | Victim: ${victim_name} | Lat: ${lat}, Lng: ${lng}`);
    broadcast(['guardian', 'police'], { type: 'ALERT_FIRED', alert });
    res.json({ success: true, alert });
});

app.post('/api/alert/location', (req, res) => {
    const time = new Date().toLocaleTimeString();
    const { alert_id, lat, lng } = req.body;
    console.log(`[SERVER HTTP POST /api/alert/location ${time}] 📍 GPS Ping for ${alert_id} → ${lat?.toFixed(5)}, ${lng?.toFixed(5)}`);
    const alert = alerts.find(a => a.id === alert_id);
    if (alert) {
        alert.lat = lat;
        alert.lng = lng;
        alert.locations = alert.locations || [];
        alert.locations.push({ lat, lng, at: new Date().toISOString() });
    }
    broadcast(['guardian', 'police'], {
        type: 'LOCATION_UPDATE',
        alert_id,
        lat,
        lng,
        timestamp: new Date().toISOString(),
    });
    res.json({ success: true });
});

app.post('/api/alert/resolve', (req, res) => {
    const time = new Date().toLocaleTimeString();
    const { alert_id } = req.body;
    console.log(`[SERVER HTTP POST /api/alert/resolve ${time}] ✅ Alert ${alert_id} RESOLVED!`);
    const alert = alerts.find(a => a.id === alert_id);
    if (alert) {
        alert.status = 'resolved';
        alert.resolved_at = new Date().toISOString();
        broadcastAll({ type: 'ALERT_RESOLVED', alert });
    }
    res.json({ success: true });
});

// Save recording to disk and return URL
app.post('/api/recording/save', (req, res) => {
    const time = new Date().toLocaleTimeString();
    const { alert_id, audio_b64, mime_type } = req.body;
    console.log(`[SERVER HTTP POST /api/recording/save ${time}] 💾 Saving recording for alert ${alert_id} (${Math.round((audio_b64?.length || 0) / 1024)} KB base64)`);

    if (!alert_id || !audio_b64) {
        return res.status(400).json({ error: 'alert_id and audio_b64 required' });
    }

    try {
        const ext = (mime_type || 'audio/m4a').includes('mp4') ? 'm4a' : 'm4a';
        const filename = `recording_${alert_id}_${Date.now()}.${ext}`;
        const filepath = path.join(RECORDINGS_DIR, filename);
        const buffer = Buffer.from(audio_b64, 'base64');
        fs.writeFileSync(filepath, buffer);

        const fileUrl = `http://${NETWORK_IP}:3001/recordings/${filename}`;
        console.log(`[SERVER HTTP POST /api/recording/save ${time}] ✅ Saved: ${filepath} → URL: ${fileUrl}`);
        res.json({ success: true, url: fileUrl, filename });
    } catch (err) {
        console.error(`[SERVER HTTP POST /api/recording/save ${time}] ❌ Failed to save:`, err.message);
        res.status(500).json({ error: 'Failed to save recording' });
    }
});

// Serve saved recordings
app.use('/recordings', express.static(RECORDINGS_DIR));

app.get('/api/alerts', (req, res) => {
    res.json({ alerts: alerts.slice(0, 20) });
});

app.get('/api/alerts/active', (req, res) => {
    res.json({ alerts: alerts.filter(a => a.status === 'active') });
});

app.post('/api/reset', (req, res) => {
    alerts = [];
    alertIdCounter = 1;
    Object.keys(policeAccessGrants).forEach(k => delete policeAccessGrants[k]);
    Object.keys(audioChunkBuffer).forEach(k => delete audioChunkBuffer[k]);
    Object.keys(videoFrameBuffer).forEach(k => delete videoFrameBuffer[k]);
    broadcastAll({ type: 'RESET' });
    console.log('[RESET] 🔄 All alerts, buffers, and grants cleared');
    res.json({ success: true, message: 'Demo reset complete' });
});

app.get('/api/status', (req, res) => {
    res.json({
        connected: {
            victim: wsClients.victim.size,
            guardian: wsClients.guardian.size,
            police: wsClients.police.size,
        },
        alerts: {
            total: alerts.length,
            active: alerts.filter(a => a.status === 'active').length,
        },
        policeAccess: policeAccessGrants,
    });
});

const os = require('os');
function getLocalNetworkIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
            if (net.family === 'IPv4' && !net.internal) return net.address;
        }
    }
    return '10.117.231.173';
}
const NETWORK_IP = getLocalNetworkIp();

server.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('╔═══════════════════════════════════════════════╗');
    console.log('║        🛡️  SheSafe Backend Server              ║');
    console.log('╠═══════════════════════════════════════════════╣');
    console.log(`║  Local:   http://localhost:${PORT}               ║`);
    console.log(`║  Network: http://${NETWORK_IP}:${PORT}          ║`);
    console.log(`║  WS:      ws://${NETWORK_IP}:${PORT}            ║`);
    console.log('╠═══════════════════════════════════════════════╣');
    console.log('║  USERS:   victim / guardian / police          ║');
    console.log('║  PASS:    shesafe                             ║');
    console.log('╠═══════════════════════════════════════════════╣');
    console.log('║  POST /api/reset  ← reset demo anytime       ║');
    console.log('║  WS maxPayload: 50MB (for audio/video chunks) ║');
    console.log('╚═══════════════════════════════════════════════╝');
    console.log('');
    console.log('Waiting for phone connections...');
});
