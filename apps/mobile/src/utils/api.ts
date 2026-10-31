import Constants from 'expo-constants';
import { supabase } from './supabase';

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
    usernameOrEmail: string,
    password: string,
): Promise<SheSafeUser | null> {
    const time = new Date().toLocaleTimeString();
    let email = usernameOrEmail.toLowerCase().trim();
    if (!email.includes('@')) {
        email = `${email}@demo.shesafe`;
    }

    console.log(`[DEBUG AUTH ${time}] 🔑 Supabase auth attempting login for: "${email}"`);

    try {
        let authUser: any = null;

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error || !data.user) {
            console.log(`[DEBUG AUTH ${time}] ⚠️ Primary Supabase login failed: ${error?.message}`);
            // Also try fallback to DemoOnly2024! if someone entered 'shesafe'
            if (password === 'shesafe') {
                const retry = await supabase.auth.signInWithPassword({
                    email,
                    password: 'DemoOnly2024!',
                });
                if (retry.data?.user) {
                    authUser = retry.data.user;
                }
            }
            if (!authUser) {
                return null;
            }
        } else {
            authUser = data.user;
        }

        console.log(`[DEBUG AUTH ${time}] ✅ Supabase Auth Success! User ID: ${authUser.id}`);

        // Fetch user profile from public.profiles
        const { data: profile, error: profileErr } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', authUser.id)
            .single();

        if (profileErr) {
            console.log(`[DEBUG AUTH ${time}] ⚠️ Could not fetch profile: ${profileErr.message}`);
        }

        const role = (profile?.role || (email.includes('police') ? 'police' : email.includes('guardian') ? 'guardian' : 'victim')) as 'victim' | 'guardian' | 'police';
        const name = profile?.full_name || (role === 'victim' ? 'DEMO Victim' : role === 'guardian' ? 'DEMO Guardian' : 'DEMO Officer');

        const user: SheSafeUser = {
            id: authUser.id,
            username: email.split('@')[0],
            role,
            name,
            phone: profile?.phone || '',
            pin: '',
        };

        return user;
    } catch (e: any) {
        console.error(`[DEBUG AUTH ${time}] 💥 Supabase login error:`, e?.message || e);
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

function mapSupabaseAlert(row: any): SheSafeAlert {
    const profile = row.profiles || {};
    return {
        id: row.id,
        victim_id: row.victim_id,
        victim_name: profile.full_name || 'Priya Sharma (Demo)',
        victim_phone: profile.phone || '+91 98765 43210',
        status: (row.status === 'active' || row.status === 'acknowledged' || row.status === 'dispatched') ? 'active' : 'resolved',
        lat: 12.9141,
        lng: 74.8560,
        address: 'Mangaluru Central',
        triggered_at: row.started_at || new Date().toISOString(),
        resolved_at: row.resolved_at || null,
    };
}

export async function getActiveAlerts(): Promise<SheSafeAlert[]> {
    const time = new Date().toLocaleTimeString();
    try {
        const { data, error } = await supabase
            .from('alerts')
            .select('*, profiles:victim_id(full_name, phone)')
            .in('status', ['active', 'acknowledged', 'dispatched'])
            .order('started_at', { ascending: false });

        if (!error && data) {
            console.log(`[DEBUG API ${time}] 📥 Active Alerts Count (Supabase): ${data.length}`);
            return data.map(mapSupabaseAlert);
        }
    } catch {
        // Fallback to local HTTP if needed
    }

    try {
        const res = await fetch(`${BACKEND_URL}/api/alerts/active`);
        const data = await res.json();
        return data.alerts || [];
    } catch {
        return [];
    }
}

export async function getAllAlerts(): Promise<SheSafeAlert[]> {
    const time = new Date().toLocaleTimeString();
    try {
        const { data, error } = await supabase
            .from('alerts')
            .select('*, profiles:victim_id(full_name, phone)')
            .order('started_at', { ascending: false });

        if (!error && data) {
            console.log(`[DEBUG API ${time}] 📥 Total Alerts Count (Supabase): ${data.length}`);
            return data.map(mapSupabaseAlert);
        }
    } catch {
        // Fallback to local HTTP if needed
    }

    try {
        const res = await fetch(`${BACKEND_URL}/api/alerts`);
        const data = await res.json();
        return data.alerts || [];
    } catch {
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
    private realtimeChannel: any = null;

    constructor(role: string, onMsg: (msg: WsMessage) => void) {
        this.role = role;
        this.onMsg = onMsg;
        console.log(`[DEBUG WS INSTANCE] 🛠️ Created SheSafeWS client for role: [${role}]`);
    }

    connect() {
        this.shouldReconnect = true;
        console.log(`[DEBUG WS CONNECT] 🔌 Initiating Realtime connection for role [${this.role}]...`);

        // 1. Supabase Realtime Channel with Broadcast + Postgres Changes
        try {
            this.realtimeChannel = supabase
                .channel('shesafe_live_room', {
                    config: { broadcast: { ack: false, self: false } },
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, (payload) => {
                    const row = payload.new as any;
                    if (row) {
                        const alert = mapSupabaseAlert(row);
                        if (row.status === 'resolved' || row.status === 'cancelled') {
                            this.onMsg({ type: 'ALERT_RESOLVED', alert });
                        } else {
                            this.onMsg({ type: 'ALERT_FIRED', alert });
                        }
                    }
                })
                .on('broadcast', { event: 'shesafe_msg' }, ({ payload }) => {
                    if (payload && payload.type) {
                        this.onMsg(payload as WsMessage);
                    }
                })
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        console.log(`[DEBUG REALTIME] ✅ Supabase Realtime subscribed for role [${this.role}]`);
                        this.onMsg({ type: 'REGISTERED', role: this.role });
                    }
                });
        } catch (e) {
            console.warn('[DEBUG WS REALTIME] Realtime subscription init error:', e);
        }

        // 2. Optional Local WS
        this._open();
    }

    private _open() {
        if (!this.shouldReconnect) return;
        try {
            this.ws = new WebSocket(WS_URL);

            this.ws.onopen = () => {
                const regMsg = JSON.stringify({ type: 'REGISTER', role: this.role });
                this.ws?.send(regMsg);
            };

            this.ws.onmessage = (event: MessageEvent) => {
                try {
                    const msg: WsMessage = JSON.parse(event.data as string);
                    this.onMsg(msg);
                } catch {}
            };

            this.ws.onclose = () => {
                if (this.shouldReconnect) {
                    this.reconnectTimeout = setTimeout(() => this._open(), 10000);
                }
            };

            this.ws.onerror = () => {
                this.ws?.close();
            };
        } catch {
            if (this.shouldReconnect) {
                this.reconnectTimeout = setTimeout(() => this._open(), 10000);
            }
        }
    }

    sendRaw(msg: object): boolean {
        let sent = false;
        // Broadcast through Supabase Realtime (Global Cloud)
        if (this.realtimeChannel) {
            try {
                this.realtimeChannel.send({
                    type: 'broadcast',
                    event: 'shesafe_msg',
                    payload: msg,
                }).catch(() => {});
                sent = true;
            } catch {}
        }

        // Send via local WebSocket if available
        if (this.ws && (this.ws as any).readyState === (this.ws as any).OPEN) {
            try {
                this.ws.send(JSON.stringify(msg));
                sent = true;
            } catch {}
        }
        return sent;
    }

    disconnect() {
        this.shouldReconnect = false;
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
        if (this.realtimeChannel) {
            supabase.removeChannel(this.realtimeChannel);
            this.realtimeChannel = null;
        }
        this.ws?.close();
        this.ws = null;
    }
}

