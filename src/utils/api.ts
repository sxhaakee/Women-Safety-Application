import Constants from 'expo-constants';

function getHostIp(): string {
    try {
        // SDK 57: expoConfig.hostUri is the primary source
        const hostUri =
            (Constants as any).expoGoConfig?.debuggerHost ||
            Constants.expoConfig?.hostUri ||
            (Constants as any).manifest2?.extra?.expoGo?.debuggerHost ||
            (Constants as any).manifest?.debuggerHost ||
            '';
        if (hostUri) {
            const ip = hostUri.split(':')[0];
            if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
                console.log(`[DEBUG IP] 🌐 Detected Host IP from Expo: ${ip}`);
                return ip;
            }
        }
    } catch (e) {
        console.log(`[DEBUG IP] ⚠️ Host IP detection error:`, e);
    }
    console.log(`[DEBUG IP] 📌 Falling back to IP: 10.117.231.173`);
    return '10.117.231.173';
}

const SERVER_HOST = getHostIp();
export const BACKEND_URL = `http://${SERVER_HOST}:3001`;
export const WS_URL      = `ws://${SERVER_HOST}:3001`;

console.log(`[DEBUG INIT] 🚀 API BACKEND_URL = ${BACKEND_URL}`);
console.log(`[DEBUG INIT] 🔌 WEBSOCKET WS_URL = ${WS_URL}`);

// ─── TYPES ───────────────────────────────────────────────────

export interface SheSafeUser {
    id: string;
    username: string;
    role: 'victim' | 'guardian' | 'police';
    name: string;
    phone: string;
    pin: string;
}

export interface SheSafeAlert {
    id: string;
    victim_id: string;
    victim_name: string;
    victim_phone: string;
    status: 'active' | 'resolved' | 'cancelled';
    lat: number | null;
    lng: number | null;
    address: string | null;
    triggered_at: string;
    resolved_at: string | null;
}

// ─── AUTH ─────────────────────────────────────────────────────

export async function loginUser(
    username: string,
    password: string,
): Promise<SheSafeUser | null> {
    const time = new Date().toLocaleTimeString();
    console.log(`[DEBUG AUTH ${time}] 🔑 Attempting login for username: "${username}" at ${BACKEND_URL}/api/login`);
    try {
        const res = await fetch(`${BACKEND_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username.toLowerCase().trim(), password }),
        });
        console.log(`[DEBUG AUTH ${time}] 📥 Login HTTP Status: ${res.status}`);
        if (!res.ok) {
            console.log(`[DEBUG AUTH ${time}] ❌ Login HTTP failed with status ${res.status}`);
            return null;
        }
        const data = await res.json();
        console.log(`[DEBUG AUTH ${time}] ✅ Login Success! User role: ${data.user?.role}, Name: ${data.user?.name}`);
        return data.user as SheSafeUser;
    } catch (e: any) {
        console.error(`[DEBUG AUTH ${time}] 💥 Login FETCH ERROR: ${e?.message || e}`);
        return null;
    }
}

// ─── ALERTS ───────────────────────────────────────────────────

export async function fireAlert(params: {
    victim_id: string;
    victim_name: string;
    victim_phone: string;
    lat: number;
    lng: number;
    address?: string;
}): Promise<SheSafeAlert | null> {
    const time = new Date().toLocaleTimeString();
    console.log(`[DEBUG ALERT ${time}] 🚨 FIRING SOS ALERT to ${BACKEND_URL}/api/alert/fire`);
    console.log(`[DEBUG ALERT ${time}] 📦 Payload:`, JSON.stringify(params, null, 2));
    try {
        const res = await fetch(`${BACKEND_URL}/api/alert/fire`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
        });
        console.log(`[DEBUG ALERT ${time}] 📥 Fire Alert HTTP Status: ${res.status}`);
        const data = await res.json();
        console.log(`[DEBUG ALERT ${time}] ✅ Alert Fired Successfully! Generated Alert ID: ${data.alert?.id}`);
        return data.alert as SheSafeAlert;
    } catch (e: any) {
        console.error(`[DEBUG ALERT ${time}] 💥 Fire Alert FETCH ERROR: ${e?.message || e}`);
        return null;
    }
}

export async function sendLocationPing(alert_id: string, lat: number, lng: number) {
    const time = new Date().toLocaleTimeString();
    console.log(`[DEBUG GPS ${time}] 📍 Sending Location Ping for Alert ${alert_id} → Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`);
    try {
        const res = await fetch(`${BACKEND_URL}/api/alert/location`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ alert_id, lat, lng }),
        });
        console.log(`[DEBUG GPS ${time}] 📥 Location Ping HTTP Status: ${res.status}`);
    } catch (e: any) {
        console.error(`[DEBUG GPS ${time}] 💥 Location Ping FETCH ERROR: ${e?.message || e}`);
    }
}

export async function resolveAlert(alert_id: string) {
    const time = new Date().toLocaleTimeString();
    console.log(`[DEBUG ALERT ${time}] ✅ Resolving Alert ${alert_id} (Victim is Safe) at ${BACKEND_URL}/api/alert/resolve`);
    try {
        const res = await fetch(`${BACKEND_URL}/api/alert/resolve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ alert_id }),
        });
        console.log(`[DEBUG ALERT ${time}] 📥 Resolve Alert HTTP Status: ${res.status}`);
    } catch (e: any) {
        console.error(`[DEBUG ALERT ${time}] 💥 Resolve Alert FETCH ERROR: ${e?.message || e}`);
    }
}

export async function getActiveAlerts(): Promise<SheSafeAlert[]> {
    const time = new Date().toLocaleTimeString();
    console.log(`[DEBUG API ${time}] 📡 Fetching Active Alerts from ${BACKEND_URL}/api/alerts/active`);
    try {
        const res = await fetch(`${BACKEND_URL}/api/alerts/active`);
        const data = await res.json();
        console.log(`[DEBUG API ${time}] 📥 Active Alerts Count: ${data.alerts?.length || 0}`);
        return data.alerts || [];
    } catch (e: any) {
        console.error(`[DEBUG API ${time}] 💥 Fetch Active Alerts ERROR: ${e?.message || e}`);
        return [];
    }
}

export async function getAllAlerts(): Promise<SheSafeAlert[]> {
    const time = new Date().toLocaleTimeString();
    console.log(`[DEBUG API ${time}] 📋 Fetching All Alert History from ${BACKEND_URL}/api/alerts`);
    try {
        const res = await fetch(`${BACKEND_URL}/api/alerts`);
        const data = await res.json();
        console.log(`[DEBUG API ${time}] 📥 Total Alerts Count: ${data.alerts?.length || 0}`);
        return data.alerts || [];
    } catch (e: any) {
        console.error(`[DEBUG API ${time}] 💥 Fetch All Alerts ERROR: ${e?.message || e}`);
        return [];
    }
}

// ─── WEBSOCKET CLIENT ─────────────────────────────────────────

type WsMessage =
    | { type: 'REGISTERED'; role: string }
    | { type: 'ALERT_ACTIVE'; alert: SheSafeAlert }
    | { type: 'ALERT_FIRED'; alert: SheSafeAlert }
    | { type: 'LOCATION_UPDATE'; alert_id: string; lat: number; lng: number; timestamp: string }
    | { type: 'ALERT_RESOLVED'; alert: SheSafeAlert }
    | { type: 'AUDIO_CHUNK'; alert_id: string; data: string; seq: number; mime: string }
    | { type: 'VIDEO_FRAME'; alert_id: string; data: string; seq: number }
    | { type: 'POLICE_ACCESS_GRANTED'; alert_id: string }
    | { type: 'RESET' };

export class SheSafeWS {
    private ws: WebSocket | null = null;
    private role: string;
    private onMsg: (msg: WsMessage) => void;
    private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    private shouldReconnect = true;

    constructor(role: string, onMsg: (msg: WsMessage) => void) {
        this.role = role;
        this.onMsg = onMsg;
        console.log(`[DEBUG WS INSTANCE] 🛠️ Created SheSafeWS client for role: [${role}] targeting ${WS_URL}`);
    }

    connect() {
        this.shouldReconnect = true;
        console.log(`[DEBUG WS CONNECT] 🔌 Initiating WebSocket connection for [${this.role}]...`);
        this._open();
    }

    private _open() {
        try {
            this.ws = new WebSocket(WS_URL);

            this.ws.onopen = () => {
                const time = new Date().toLocaleTimeString();
                console.log(`[DEBUG WS OPEN ${time}] 🟢 WebSocket OPENED successfully for role [${this.role}]`);
                const regMsg = JSON.stringify({ type: 'REGISTER', role: this.role });
                console.log(`[DEBUG WS SEND ${time}] 📤 Sending Registration payload: ${regMsg}`);
                this.ws!.send(regMsg);
            };

            this.ws.onmessage = (event: MessageEvent) => {
                const time = new Date().toLocaleTimeString();
                console.log(`[DEBUG WS MSG ${time}] 📥 Raw WebSocket Message Received: ${event.data}`);
                try {
                    const msg: WsMessage = JSON.parse(event.data as string);
                    console.log(`[DEBUG WS PARSED ${time}] ⚡ Event Type: [${msg.type}] for Role [${this.role}]`);
                    this.onMsg(msg);
                } catch (err) {
                    console.error(`[DEBUG WS PARSE ERROR ${time}] ⚠️ Failed to parse message JSON:`, err);
                }
            };

            this.ws.onclose = (ev) => {
                const time = new Date().toLocaleTimeString();
                console.log(`[DEBUG WS CLOSE ${time}] 🔴 WebSocket CLOSED (Role: [${this.role}]), Code: ${ev.code}, Reason: "${ev.reason}"`);
                if (this.shouldReconnect) {
                    console.log(`[DEBUG WS RECONNECT ${time}] 🔄 Scheduling reconnect attempt in 3s...`);
                    this.reconnectTimeout = setTimeout(() => this._open(), 3000);
                }
            };

            this.ws.onerror = (err: any) => {
                const time = new Date().toLocaleTimeString();
                console.error(`[DEBUG WS ERROR ${time}] 💥 WebSocket Socket Error (Role: [${this.role}]):`, err?.message || err);
                this.ws?.close();
            };
        } catch (e: any) {
            console.error(`[DEBUG WS EXCEPTION] 💥 Failed to create WebSocket instance:`, e?.message || e);
            if (this.shouldReconnect) {
                this.reconnectTimeout = setTimeout(() => this._open(), 3000);
            }
        }
    }

    sendRaw(msg: object): boolean {
        if (this.ws && this.ws.readyState === (this.ws as any).OPEN) {
            this.ws.send(JSON.stringify(msg));
            return true;
        }
        const time = new Date().toLocaleTimeString();
        console.warn(`[DEBUG WS SEND RAW ${time}] ⚠️ WS not open, cannot send [${(msg as any).type}]`);
        return false;
    }

    disconnect() {
        console.log(`[DEBUG WS DISCONNECT] 🛑 Disconnecting SheSafeWS for role [${this.role}]`);
        this.shouldReconnect = false;
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
        this.ws?.close();
        this.ws = null;
    }
}
