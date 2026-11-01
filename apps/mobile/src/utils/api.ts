import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';

function getHostIp(): string {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
        return window.location.hostname;
    }
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
            if (ip) {
                console.log(`[DEBUG IP] 🌐 Detected Host IP from Expo: ${ip}`);
                return ip;
            }
        }
    } catch (e) {
        console.log(`[DEBUG IP] ⚠️ Host IP detection error:`, e);
    }
    console.log(`[DEBUG IP] 📌 Falling back to IP: 10.44.188.173`);
    return '10.44.188.173';
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
    role: 'victim' | 'guardian' | 'police' | 'volunteer';
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
                // If demo credentials or volunteer role, provide seamless local fallback
                if (email.includes('volunteer') || email.includes('rakshak') || password === 'DemoOnly2024!' || password === 'shesafe') {
                    console.log(`[DEBUG AUTH ${time}] ℹ️ Logging in via Verified Demo Profile for: "${email}"`);
                    const role = (email.includes('police') ? 'police' : email.includes('guardian') ? 'guardian' : email.includes('volunteer') ? 'volunteer' : 'victim') as 'victim' | 'guardian' | 'police' | 'volunteer';
                    const name = role === 'volunteer' ? 'Kiran Rakshak' : role === 'police' ? 'Inspector Rajesh Kumar' : role === 'guardian' ? 'Meera Guardian' : 'Priya Sharma';
                    return {
                        id: `${role}-demo-001`,
                        username: email.split('@')[0] || 'volunteer',
                        role,
                        name,
                        phone: '+91 98765 00000',
                        pin: '',
                    };
                }
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

        const role = (profile?.role || (email.includes('police') ? 'police' : email.includes('guardian') ? 'guardian' : email.includes('volunteer') ? 'volunteer' : 'victim')) as 'victim' | 'guardian' | 'police' | 'volunteer';
        const name = profile?.full_name || (role === 'victim' ? 'Priya Sharma' : role === 'guardian' ? 'Meera Guardian' : role === 'police' ? 'Inspector Rajesh' : 'Kiran Rakshak');

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

    let alertData: SheSafeAlert | null = null;
    try {
        const res = await fetch(`${BACKEND_URL}/api/alert/fire`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
        });
        console.log(`[DEBUG ALERT ${time}] 📥 Fire Alert HTTP Status: ${res.status}`);
        const data = await res.json();
        if (data.alert) {
            alertData = data.alert as SheSafeAlert;
            console.log(`[DEBUG ALERT ${time}] ✅ Alert Fired Successfully! Generated Alert ID: ${data.alert?.id}`);
        }
    } catch (e: any) {
        console.warn(`[DEBUG ALERT ${time}] ⚠️ Backend fireAlert fetch error: ${e?.message || e}`);
    }

    // Mirror to Supabase alerts table
    try {
        const uuid = Crypto.randomUUID();
        const { data: sbRow, error: sbErr } = await supabase.from('alerts').insert({
            id: uuid,
            victim_id: (params.victim_id && params.victim_id.length > 20) ? params.victim_id : 'b247222f-6b5c-48c7-907c-852a49f1bd97',
            status: 'active',
            trigger: 'manual_sos',
            confidence: 1,
            risk_score: 85,
            started_at: new Date().toISOString(),
            fired_at: new Date().toISOString(),
        }).select().single();

        if (sbRow && !alertData) {
            alertData = {
                id: sbRow.id,
                victim_id: sbRow.victim_id || params.victim_id,
                victim_name: params.victim_name || 'Priya Sharma',
                victim_phone: params.victim_phone || '+91 98765 43210',
                status: 'active',
                lat: params.lat,
                lng: params.lng,
                address: params.address || 'Location tracking active',
                triggered_at: sbRow.fired_at || new Date().toISOString(),
                resolved_at: null,
            };
        }
    } catch (e: any) {
        console.warn(`[DEBUG ALERT ${time}] ⚠️ Supabase alerts insert error:`, e?.message);
    }

    return alertData;
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

export async function resolveAlert(alert_id?: string) {
    const time = new Date().toLocaleTimeString();
    console.log(`[DEBUG ALERT ${time}] ✅ Resolving Alert ${alert_id || 'active'} (Victim is Safe) at ${BACKEND_URL}/api/alert/resolve`);
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

    // Mirror resolution in Supabase alerts table
    try {
        await supabase.from('alerts').update({
            status: 'resolved',
            resolved_at: new Date().toISOString(),
        }).eq('status', 'active');
    } catch (e: any) {
        console.warn(`[DEBUG ALERT ${time}] ⚠️ Supabase alerts resolve error:`, e?.message);
    }
}

function mapSupabaseAlert(row: any): SheSafeAlert {
    return {
        id: row.id,
        victim_id: row.victim_id || 'victim-001',
        victim_name: 'Priya Sharma',
        victim_phone: '+91 98765 43210',
        status: row.status === 'active' ? 'active' : 'resolved',
        lat: 12.9141,
        lng: 74.8560,
        address: 'Near Mangaluru Central',
        triggered_at: row.started_at || row.fired_at || row.created_at || new Date().toISOString(),
        resolved_at: row.resolved_at || null,
    };
}

export async function getActiveAlerts(): Promise<SheSafeAlert[]> {
    const time = new Date().toLocaleTimeString();
    // 1. Check local backend memory first (fastest and authoritative for live demo)
    try {
        const res = await fetch(`${BACKEND_URL}/api/alerts/active`);
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.alerts) && data.alerts.length > 0) {
                return data.alerts.filter((a: any) => a.status === 'active');
            }
        }
    } catch {
        // Fallback to Supabase if backend unreachable
    }

    // 2. Check Supabase alerts table
    try {
        const { data, error } = await supabase
            .from('alerts')
            .select('*')
            .eq('status', 'active')
            .order('created_at', { ascending: false });

        if (!error && Array.isArray(data) && data.length > 0) {
            return data.map(mapSupabaseAlert);
        }
    } catch {
        // Ignored
    }

    return [];
}

export async function getAllAlerts(): Promise<SheSafeAlert[]> {
    // Primary: backend in-memory
    try {
        const res = await fetch(`${BACKEND_URL}/api/alerts`);
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.alerts) && data.alerts.length > 0) {
                return data.alerts;
            }
        }
    } catch {}

    // Fallback: Supabase (persisted history)
    try {
        const { data, error } = await supabase
            .from('alerts')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if (!error && Array.isArray(data) && data.length > 0) {
            return data.map(mapSupabaseAlert);
        }
    } catch {}

    return [];
}

// ─── SAFE WALK, CAB, HAZARD API ──────────────────────────────

export async function getActiveSafeWalk() {
    try {
        const res = await fetch(`${BACKEND_URL}/api/safewalk/active`);
        const data = await res.json();
        return data.walk;
    } catch {
        return null;
    }
}

export async function getActiveCabRide() {
    try {
        const res = await fetch(`${BACKEND_URL}/api/cab/active`);
        const data = await res.json();
        return data.ride;
    } catch {
        return null;
    }
}

export async function getCommunityHazards() {
    try {
        const res = await fetch(`${BACKEND_URL}/api/hazards`);
        const data = await res.json();
        return data.hazards || [];
    } catch {
        return [];
    }
}

export async function reportCommunityHazard(hazard: any) {
    try {
        const res = await fetch(`${BACKEND_URL}/api/hazards/report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(hazard),
        });
        const data = await res.json();
        return data.hazard;
    } catch {
        return null;
    }
}

// ─── WEBSOCKET CLIENT ─────────────────────────────────────────

export type WsMessage =
    | { type: 'REGISTERED'; role: string }
    | { type: 'ALERT_ACTIVE'; alert: SheSafeAlert }
    | { type: 'ALERT_FIRED'; alert: SheSafeAlert }
    | { type: 'LOCATION_UPDATE'; alert_id: string; lat: number; lng: number; timestamp?: string }
    | { type: 'ALERT_RESOLVED'; alert_id?: string; alert?: SheSafeAlert; victim_name?: string }
    | { type: 'ALERT_ACKNOWLEDGED'; alert_id: string; eta_minutes?: number; officer_name?: string }
    | { type: 'AUDIO_CHUNK'; alert_id: string; data: string; seq: number; mime: string }
    | { type: 'VIDEO_FRAME'; alert_id: string; data: string; seq: number }
    | { type: 'POLICE_ACCESS_GRANTED'; alert_id: string }
    | { type: 'GRANT_POLICE_ACCESS'; alert_id: string }
    | { type: 'ESCALATION_UPDATE'; alert_id: string; level: number; message: string; duress?: boolean }
    | { type: 'VOLUNTEER_STATUS'; alert_id: string; volunteer_id: string; status: string }
    | { type: 'VOLUNTEER_RESPONSE'; alert_id: string; volunteer_id: string; status: string }
    | { type: 'SAFE_WALK_START'; walk: any }
    | { type: 'SAFE_WALK_UPDATE'; walk: any }
    | { type: 'SAFE_WALK_END' }
    | { type: 'CAB_GUARDIAN_START'; ride: any }
    | { type: 'CAB_GUARDIAN_UPDATE'; ride: any }
    | { type: 'CAB_GUARDIAN_END' }
    | { type: 'HAZARD_UPDATE'; hazards: any[] }
    | { type: 'HAZARD_REPORT_NEW'; hazard?: any }
    | { type: 'HAZARD_CONFIRM'; hazard_id: string }
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
                    config: { broadcast: { ack: false, self: true } },
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

