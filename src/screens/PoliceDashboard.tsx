import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet,
    ScrollView, Animated, StatusBar, Alert, Image, Linking, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { createAudioPlayer, setAudioModeAsync, AudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Colors, Spacing, FontSizes, BorderRadius } from '../theme';
import {
    SheSafeUser, SheSafeAlert, SheSafeWS,
    getActiveAlerts, getAllAlerts, BACKEND_URL,
} from '../utils/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function PoliceDashboard({ navigation, route }: any) {
    const user: SheSafeUser = route?.params?.user || { name: 'Officer Rajesh Kumar', role: 'police' };

    const [activeAlert, setActiveAlert]         = useState<SheSafeAlert | null>(null);
    const [history, setHistory]                 = useState<SheSafeAlert[]>([]);
    const [connected, setConnected]             = useState(false);
    const [elapsed, setElapsed]                 = useState(0);
    const [currentTime, setCurrentTime]         = useState(new Date());
    const [accessGranted, setAccessGranted]     = useState(false);
    const [liveVideoFrame, setLiveVideoFrame]   = useState<string | null>(null);
    const [audioChunkCount, setAudioChunkCount] = useState(0);
    const [audioLevel, setAudioLevel]           = useState<number[]>([]);
    const [isSaving, setIsSaving]               = useState(false);

    // ── Critical: use REF for accessGranted in WS callback to avoid closure bug ──
    const accessGrantedRef = useRef(false);

    const audioChunksRef = useRef<{ data: string; mime: string; seq: number }[]>([]);
    const videoFramesRef = useRef<{ data: string; seq: number }[]>([]);
    const currentAlertId = useRef<string | null>(null);

    const fadeAnim   = useRef(new Animated.Value(0)).current;
    const sirenAnim  = useRef(new Animated.Value(1)).current;
    const connDot    = useRef(new Animated.Value(1)).current;
    const wsRef      = useRef<SheSafeWS | null>(null);
    const elapsedRef = useRef<any>(null);

    const soundRef   = useRef<AudioPlayer | null>(null);
    const audioQueue = useRef<{ data: string; mime: string }[]>([]);
    const isPlaying  = useRef(false);

    useEffect(() => {
        Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
        startConnDot();
        const clk = setInterval(() => setCurrentTime(new Date()), 1000);
        loadAlerts();
        connectWS();
        return () => {
            clearInterval(clk);
            clearInterval(elapsedRef.current);
            wsRef.current?.disconnect();
            soundRef.current?.remove();
        };
    }, []);

    useEffect(() => {
        if (activeAlert) {
            startSiren();
            startElapsed();
            currentAlertId.current = activeAlert.id;
            audioChunksRef.current = [];
            videoFramesRef.current = [];
            // Reset access on new alert
            accessGrantedRef.current = false;
            setAccessGranted(false);
            setAudioChunkCount(0);
            setLiveVideoFrame(null);
        } else {
            clearInterval(elapsedRef.current);
            setElapsed(0);
        }
    }, [activeAlert?.id]);

    const startConnDot = () => Animated.loop(Animated.sequence([
        Animated.timing(connDot, { toValue: 0.3, duration: 1100, useNativeDriver: true }),
        Animated.timing(connDot, { toValue: 1,   duration: 1100, useNativeDriver: true }),
    ])).start();

    const startSiren = () => Animated.loop(Animated.sequence([
        Animated.timing(sirenAnim, { toValue: 0.2, duration: 600, useNativeDriver: true }),
        Animated.timing(sirenAnim, { toValue: 1,   duration: 600, useNativeDriver: true }),
    ])).start();

    const startElapsed = () => {
        clearInterval(elapsedRef.current);
        setElapsed(0);
        elapsedRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    };

    const loadAlerts = async () => {
        const [active, all] = await Promise.all([getActiveAlerts(), getAllAlerts()]);
        if (active.length > 0) setActiveAlert(active[0]);
        setHistory(all);
    };

    const connectWS = () => {
        const ws = new SheSafeWS('police', (msg) => {
            const et = new Date().toLocaleTimeString();
            switch (msg.type) {
                case 'REGISTERED':
                    setConnected(true);
                    console.log(`[POLICE WS ${et}] ✅ POLICE REGISTERED`);
                    break;
                case 'ALERT_ACTIVE':
                case 'ALERT_FIRED':
                    console.log(`[POLICE WS ${et}] 🚨 SOS: ${msg.alert.victim_name}`);
                    setActiveAlert(msg.alert);
                    setHistory(prev => [msg.alert, ...prev.filter(a => a.id !== msg.alert.id)]);
                    break;
                case 'LOCATION_UPDATE':
                    console.log(`[POLICE WS ${et}] 📍 ${msg.lat?.toFixed(5)}, ${msg.lng?.toFixed(5)}`);
                    setActiveAlert(prev =>
                        prev?.id === msg.alert_id ? { ...prev, lat: msg.lat, lng: msg.lng } : prev
                    );
                    break;

                // ── CRITICAL FIX: use accessGrantedRef.current (not state) ──
                case 'POLICE_ACCESS_GRANTED':
                    console.log(`[POLICE WS ${et}] 🔓 GUARDIAN GRANTED ACCESS — Live feed unlocked!`);
                    accessGrantedRef.current = true;   // update ref first
                    setAccessGranted(true);            // then update state for UI
                    break;

                case 'AUDIO_CHUNK':
                    if (!accessGrantedRef.current) {
                        console.log(`[POLICE WS ${et}] ⛔ Audio chunk ignored — access not yet granted`);
                        break;
                    }
                    console.log(`[POLICE WS ${et}] 🎤 Audio chunk #${msg.seq} (${Math.round(msg.data.length / 1024)} KB)`);
                    audioChunksRef.current.push({ data: msg.data, mime: msg.mime, seq: msg.seq });
                    setAudioChunkCount(c => c + 1);
                    setAudioLevel(prev => [...prev.slice(-14), Math.min(msg.data.length / 5000, 100)]);
                    enqueueAudio(msg.data, msg.mime);
                    break;

                case 'VIDEO_FRAME': {
                    if (!accessGrantedRef.current) {
                        console.log(`[POLICE WS ${et}] ⛔ Video frame ignored — access not granted`);
                        break;
                    }
                    console.log(`[POLICE WS ${et}] 📸 Video frame #${msg.seq} (${Math.round((msg.data?.length || 0) / 1024)} KB)`);
                    const cleanData = (msg.data || '').replace(/[\r\n\s]/g, '');
                    videoFramesRef.current = [...videoFramesRef.current.slice(-9), { data: cleanData, seq: msg.seq }];
                    setLiveVideoFrame(cleanData);
                    break;
                }

                case 'ALERT_RESOLVED':
                    console.log(`[POLICE WS ${et}] ✅ Alert resolved`);
                    setActiveAlert(prev => prev?.id === msg.alert.id ? null : prev);
                    setHistory(prev => prev.map(a => a.id === msg.alert.id ? msg.alert : a));
                    break;
                case 'RESET':
                    setActiveAlert(null); setHistory([]);
                    accessGrantedRef.current = false;
                    setAccessGranted(false); setLiveVideoFrame(null); setAudioChunkCount(0);
                    break;
            }
        });
        ws.connect();
        wsRef.current = ws;
    };

    const enqueueAudio = (b64: string, mime: string) => {
        audioQueue.current.push({ data: b64, mime });
        if (!isPlaying.current) playNextAudio();
    };

    const playNextAudio = async () => {
        if (audioQueue.current.length === 0) { isPlaying.current = false; return; }
        isPlaying.current = true;
        const chunk = audioQueue.current.shift()!;
        const t = new Date().toLocaleTimeString();
        try {
            if (soundRef.current) {
                try { soundRef.current.remove(); } catch (_) {}
                soundRef.current = null;
            }
            await setAudioModeAsync({ playsInSilentMode: true });
            const tmpUri = FileSystem.cacheDirectory + `p_chunk_${Date.now()}.m4a`;
            await FileSystem.writeAsStringAsync(tmpUri, chunk.data, { encoding: FileSystem.EncodingType.Base64 });
            const player = createAudioPlayer(tmpUri);
            soundRef.current = player;
            console.log(`[POLICE AUDIO ${t}] 🔊 Playing audio chunk`);
            player.play();
            const sub = player.addListener('playbackStatusUpdate', (s) => {
                if (s.didJustFinish || s.error) {
                    sub.remove();
                    try { player.remove(); } catch (_) {}
                    if (soundRef.current === player) soundRef.current = null;
                    FileSystem.deleteAsync(tmpUri, { idempotent: true }).catch(() => {});
                    playNextAudio();
                }
            });
        } catch (e: any) {
            console.warn(`[POLICE AUDIO PLAY ERROR ${t}]`, e?.message);
            isPlaying.current = false;
            if (audioQueue.current.length > 0) playNextAudio();
        }
    };

    const openGoogleMaps = (lat: number, lng: number, name?: string) => {
        const label = encodeURIComponent(name || 'Victim Location');
        Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`)
            .catch(() => Linking.openURL(`geo:${lat},${lng}?q=${lat},${lng}(${label})`));
    };

    const openMapsLocation = (lat: number, lng: number) => {
        Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);
    };

    const handleSaveRecording = async () => {
        const chunks = audioChunksRef.current;
        const frames = videoFramesRef.current;
        if (chunks.length === 0 && frames.length === 0) {
            Alert.alert('No Data', 'No recording data available. Ensure Guardian has granted access.'); return;
        }
        setIsSaving(true);
        try {
            let framesSaved = 0;
            if (frames.length > 0) {
                for (const frame of frames.slice(-5)) {
                    try {
                        const targetUri = (FileSystem.documentDirectory || FileSystem.cacheDirectory) + `pframe_${frame.seq}.jpg`;
                        await FileSystem.writeAsStringAsync(targetUri, frame.data, { encoding: FileSystem.EncodingType.Base64 });
                        framesSaved++;
                    } catch (_) {}
                }
            }
            let audioUrl = null;
            if (chunks.length > 0) {
                const last = chunks[chunks.length - 1];
                try {
                    const res = await fetch(`${BACKEND_URL}/api/recording/save`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ alert_id: currentAlertId.current, audio_b64: last.data, mime_type: last.mime }),
                    });
                    if (res.ok) { const d = await res.json(); audioUrl = d.url; }
                } catch (fe: any) { console.warn(`[POLICE SAVE AUDIO ERROR]`, fe?.message); }
            }
            setIsSaving(false);
            Alert.alert(
                '✅ Evidence Saved',
                `${framesSaved} video snapshots saved to local documents\nAudio URL: ${audioUrl || 'N/A'}`,
                [{ text: 'OK' }]
            );
        } catch (e: any) {
            setIsSaving(false);
            Alert.alert('❌ Save Failed', e?.message);
        }
    };

    const handleLogout = async () => {
        Alert.alert('Logout', 'Logout from Police Dashboard?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Logout', style: 'destructive', onPress: async () => {
                    wsRef.current?.disconnect();
                    await AsyncStorage.removeItem('shesafe_current_user');
                    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
                }
            }
        ]);
    };

    const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
    const fmtCoords = (lat?: number | null, lng?: number | null) =>
        lat && lng ? `${lat.toFixed(5)}°N, ${lng.toFixed(5)}°E` : 'Acquiring GPS...';
    const fmtTime = (iso: string) =>
        new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const timeStr = currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    return (
        <LinearGradient colors={['#050F2E', '#030818', '#080810']} style={styles.container}>
            <StatusBar barStyle="light-content" />

            <Animated.View style={[styles.header, { opacity: fadeAnim }]}>
                <View>
                    <Text style={styles.roleLabel}>👮 POLICE CONTROL</Text>
                    <Text style={styles.userName}>{user.name}</Text>
                </View>
                <View style={styles.headerRight}>
                    <View style={[styles.connPill, connected ? styles.connOn : styles.connOff]}>
                        <Animated.View style={[styles.connDot, { opacity: connDot }]} />
                        <Text style={styles.connText}>{connected ? 'Live' : 'Connecting...'}</Text>
                    </View>
                    <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                        <Text>⬅️</Text>
                    </TouchableOpacity>
                </View>
            </Animated.View>

            <Text style={styles.clock}>{timeStr}</Text>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
                {activeAlert ? (
                    <View style={styles.emergCard}>
                        <LinearGradient colors={['rgba(29,78,216,0.28)','rgba(29,78,216,0.04)']} style={styles.emergGrad}>

                            {/* Siren */}
                            <View style={styles.sirenRow}>
                                <Animated.Text style={[styles.sirenEmoji, { opacity: sirenAnim }]}>🚨</Animated.Text>
                                <Text style={styles.sirenEmoji}>🚔</Text>
                                <Animated.Text style={[styles.sirenEmoji, { opacity: sirenAnim }]}>🚨</Animated.Text>
                            </View>
                            <Text style={styles.emergTitle}>EMERGENCY ALERT</Text>
                            <Text style={styles.caseId}>Case #{activeAlert.id} · ⏱ {fmt(elapsed)}</Text>

                            {/* Victim */}
                            <View style={styles.victimCard}>
                                <Text style={styles.vcMeta}>VICTIM</Text>
                                <Text style={styles.vcName}>{activeAlert.victim_name}</Text>
                                <Text style={styles.vcPhone}>{activeAlert.victim_phone}</Text>
                            </View>

                            {/* ── LIVE MAP ── */}
                            {activeAlert.lat && activeAlert.lng ? (
                                <>
                                    <View style={styles.sectionHeader}>
                                        <Animated.View style={[styles.recDot, { opacity: sirenAnim, backgroundColor: Colors.safe }]} />
                                        <Text style={[styles.sectionTitle, { color: Colors.safe }]}>VICTIM LOCATION — LIVE MAP</Text>
                                    </View>
                                    <View style={styles.mapContainer}>
                                        <MapView
                                            style={styles.map}
                                            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
                                            region={{
                                                latitude: activeAlert.lat,
                                                longitude: activeAlert.lng,
                                                latitudeDelta: 0.005,
                                                longitudeDelta: 0.005,
                                            }}
                                            scrollEnabled={false}
                                            zoomEnabled={false}
                                        >
                                            <Marker
                                                coordinate={{ latitude: activeAlert.lat, longitude: activeAlert.lng }}
                                                title={activeAlert.victim_name}
                                                description={activeAlert.address || ''}
                                                pinColor="red"
                                            />
                                        </MapView>
                                        <View style={styles.mapOverlay}>
                                            <Text style={styles.mapCoords}>📍 {fmtCoords(activeAlert.lat, activeAlert.lng)}</Text>
                                        </View>
                                    </View>
                                    <TouchableOpacity
                                        style={styles.directionsBtn}
                                        onPress={() => openGoogleMaps(activeAlert.lat!, activeAlert.lng!, activeAlert.victim_name)}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={styles.directionsBtnText}>🗺️ Get Directions in Google Maps</Text>
                                    </TouchableOpacity>
                                    <Text style={styles.addrText}>📌 {activeAlert.address}</Text>
                                </>
                            ) : (
                                <View style={styles.locGpsRow}>
                                    <Text style={{ fontSize: 22 }}>📍</Text>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.locLabel}>VICTIM LOCATION</Text>
                                        <Text style={styles.coordsText}>{fmtCoords(activeAlert.lat, activeAlert.lng)}</Text>
                                        <Text style={styles.addrText}>{activeAlert.address}</Text>
                                    </View>
                                    <Animated.Text style={{ opacity: sirenAnim }}>🔴</Animated.Text>
                                </View>
                            )}

                            {/* ── GUARDIAN GATE ── */}
                            {!accessGranted ? (
                                <LinearGradient colors={['rgba(245,158,11,0.2)','rgba(245,158,11,0.05)']} style={styles.awaitingBox}>
                                    <Animated.Text style={{ fontSize: 36, opacity: sirenAnim }}>🔒</Animated.Text>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.awaitingTitle}>AWAITING GUARDIAN AUTHORIZATION</Text>
                                        <Text style={styles.awaitingSub}>The Guardian must tap "Grant Police Access" on their device to unlock the live evidence stream.</Text>
                                    </View>
                                </LinearGradient>
                            ) : (
                                <>
                                    <LinearGradient colors={['rgba(16,185,129,0.2)','rgba(16,185,129,0.05)']} style={styles.accessBadge}>
                                        <Text style={styles.accessBadgeText}>🔓 Guardian Access Granted — Live Feed Active</Text>
                                    </LinearGradient>

                                    {/* Live video */}
                                    <View style={styles.sectionHeader}>
                                        <Animated.View style={[styles.recDot, { opacity: sirenAnim }]} />
                                        <Text style={styles.sectionTitle}>LIVE CAMERA — FRONT FACING</Text>
                                    </View>
                                    <View style={styles.videoBox}>
                                        {liveVideoFrame ? (
                                            <>
                                                <Image
                                                    source={{ uri: `data:image/jpeg;base64,${liveVideoFrame}` }}
                                                    style={styles.videoImage}
                                                    resizeMode="cover"
                                                />
                                                <View style={styles.videoOverlay}>
                                                    <View style={styles.liveRecChip}>
                                                        <Animated.View style={[styles.recDot, { opacity: sirenAnim }]} />
                                                        <Text style={styles.recChipText}>🔴 LIVE</Text>
                                                    </View>
                                                    <Text style={styles.fpsLabel}>Front Cam</Text>
                                                </View>
                                            </>
                                        ) : (
                                            <LinearGradient colors={['#050F2E','#0A1830']} style={styles.videoPlaceholder}>
                                                <Animated.Text style={{ fontSize: 36, opacity: sirenAnim }}>📷</Animated.Text>
                                                <Text style={styles.vpText}>Receiving first frame...</Text>
                                                <Text style={styles.vpSub}>Front camera captures every 3s</Text>
                                            </LinearGradient>
                                        )}
                                    </View>

                                    {/* Live audio */}
                                    <View style={styles.sectionHeader}>
                                        <Animated.View style={[styles.recDot, { opacity: sirenAnim, backgroundColor: Colors.policeLight }]} />
                                        <Text style={[styles.sectionTitle, { color: Colors.policeLight }]}>
                                            AUDIO — {audioChunkCount} CHUNK{audioChunkCount !== 1 ? 'S' : ''} RECEIVED
                                        </Text>
                                    </View>
                                    <LinearGradient colors={['rgba(29,78,216,0.2)','rgba(29,78,216,0.05)']} style={styles.audioBox}>
                                        <View style={styles.audioTop}>
                                            <Animated.Text style={{ opacity: sirenAnim, fontSize: 20 }}>🎤</Animated.Text>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.audioTitle, { color: Colors.policeLight }]}>LIVE AUDIO — AUTO-PLAYS</Text>
                                                <Text style={styles.audioSub}>Rolling 5s chunks</Text>
                                            </View>
                                        </View>
                                        <View style={styles.eqRow}>
                                            {(audioLevel.length > 0 ? audioLevel : Array(15).fill(8)).map((h, i) => (
                                                <Animated.View
                                                    key={i}
                                                    style={[styles.eqBar, {
                                                        height: Math.max(4, h * 0.35),
                                                        backgroundColor: Colors.policeLight,
                                                        opacity: audioChunkCount > 0 ? (i % 2 === 0 ? sirenAnim : 1) : 0.25,
                                                    }]}
                                                />
                                            ))}
                                        </View>
                                    </LinearGradient>

                                    {/* Save evidence */}
                                    <TouchableOpacity
                                        style={styles.saveBtn}
                                        onPress={handleSaveRecording}
                                        disabled={isSaving}
                                        activeOpacity={0.8}
                                    >
                                        <LinearGradient colors={[Colors.safe, Colors.safeDark]} style={styles.btnInner}>
                                            <Text style={styles.btnText}>{isSaving ? '⏳ Saving...' : '💾 Save Evidence Recording'}</Text>
                                        </LinearGradient>
                                    </TouchableOpacity>
                                </>
                            )}
                        </LinearGradient>
                    </View>
                ) : (
                    <LinearGradient colors={['rgba(29,78,216,0.12)','rgba(29,78,216,0.04)']} style={styles.idleCard}>
                        <Text style={styles.idleEmoji}>👮</Text>
                        <Text style={styles.idleTitle}>ALL CLEAR</Text>
                        <Text style={styles.idleText}>No active incidents. Monitoring real-time.</Text>
                        <View style={[styles.connPill, connected ? styles.connOn : styles.connOff, { alignSelf: 'center', marginTop: Spacing.sm }]}>
                            <Animated.View style={[styles.connDot, { opacity: connDot, backgroundColor: connected ? Colors.safe : Colors.warning }]} />
                            <Text style={styles.connText}>{connected ? 'Connected & Monitoring' : 'Reconnecting...'}</Text>
                        </View>
                    </LinearGradient>
                )}

                {/* Incident History */}
                {history.length > 0 && (
                    <>
                        <Text style={styles.historyTitle}>📋 Incident History</Text>
                        {history.map(a => (
                            <LinearGradient key={a.id} colors={['rgba(255,255,255,0.06)','rgba(255,255,255,0.02)']} style={styles.histCard}>
                                <Text style={{ fontSize: 20 }}>{a.status === 'active' ? '🔴' : '✅'}</Text>
                                <View style={{ flex: 1, gap: 2 }}>
                                    <Text style={styles.histName}>{a.victim_name}</Text>
                                    <Text style={styles.histTime}>Case #{a.id} · {fmtTime(a.triggered_at)}</Text>
                                    {a.lat && a.lng ? (
                                        <>
                                            <Text style={styles.histCoords}>📍 {fmtCoords(a.lat, a.lng)}</Text>
                                            <TouchableOpacity onPress={() => openMapsLocation(a.lat!, a.lng!)}>
                                                <Text style={styles.histMapLink}>🗺️ View on Google Maps →</Text>
                                            </TouchableOpacity>
                                        </>
                                    ) : (
                                        <Text style={styles.histCoords}>📍 GPS not available</Text>
                                    )}
                                </View>
                                <View style={[styles.histStatus, { backgroundColor: a.status === 'active' ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.15)' }]}>
                                    <Text style={[styles.histStatusText, { color: a.status === 'active' ? Colors.danger : Colors.safe }]}>
                                        {a.status.toUpperCase()}
                                    </Text>
                                </View>
                            </LinearGradient>
                        ))}
                    </>
                )}
            </ScrollView>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingTop: Spacing.xxl + 10, paddingBottom: Spacing.xs },
    roleLabel: { fontSize: FontSizes.xs, color: Colors.police, fontWeight: '800', letterSpacing: 2 },
    userName: { fontSize: FontSizes.xl, fontWeight: '800', color: Colors.text },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    connPill: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, borderRadius: BorderRadius.full, paddingVertical: 6, paddingHorizontal: Spacing.sm, borderWidth: 1 },
    connOn:  { backgroundColor: 'rgba(29,78,216,0.15)', borderColor: 'rgba(29,78,216,0.35)' },
    connOff: { backgroundColor: 'rgba(245,158,11,0.12)', borderColor: 'rgba(245,158,11,0.3)' },
    connDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.police },
    connText: { fontSize: FontSizes.xs, color: Colors.text, fontWeight: '600' },
    logoutBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
    clock: { fontSize: FontSizes.xl, fontWeight: '300', color: Colors.text, letterSpacing: 3, textAlign: 'center', paddingVertical: Spacing.xs, fontVariant: ['tabular-nums'] },
    scroll: { padding: Spacing.lg, paddingTop: Spacing.xs, paddingBottom: Spacing.xxl + 20, gap: Spacing.md },
    emergCard: { borderRadius: BorderRadius.lg, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(29,78,216,0.45)' },
    emergGrad: { padding: Spacing.lg, gap: Spacing.md },
    sirenRow: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.lg },
    sirenEmoji: { fontSize: 36 },
    emergTitle: { fontSize: FontSizes.xxl, fontWeight: '900', color: Colors.policeLight, textAlign: 'center', letterSpacing: 2 },
    caseId: { fontSize: FontSizes.xs, color: Colors.textMuted, textAlign: 'center', fontWeight: '700', letterSpacing: 1 },
    victimCard: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: BorderRadius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.glassBorder },
    vcMeta: { fontSize: FontSizes.xs, color: Colors.textMuted, fontWeight: '700', letterSpacing: 1.5 },
    vcName: { fontSize: FontSizes.lg, fontWeight: '800', color: Colors.text, marginTop: 4 },
    vcPhone: { fontSize: FontSizes.sm, color: Colors.textSecondary },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    sectionTitle: { fontSize: FontSizes.xs, color: Colors.danger, fontWeight: '800', letterSpacing: 1 },
    recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.danger },
    mapContainer: { borderRadius: BorderRadius.md, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(29,78,216,0.5)', height: 200, position: 'relative' },
    map: { width: '100%', height: '100%' },
    mapOverlay: { position: 'absolute', bottom: 8, left: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8 },
    mapCoords: { color: Colors.text, fontSize: FontSizes.xs, fontWeight: '600' },
    directionsBtn: { backgroundColor: 'rgba(29,78,216,0.15)', borderRadius: BorderRadius.md, paddingVertical: Spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(29,78,216,0.35)' },
    directionsBtnText: { color: Colors.policeLight, fontWeight: '700', fontSize: FontSizes.sm },
    addrText: { fontSize: FontSizes.xs, color: Colors.textSecondary },
    locGpsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: 'rgba(16,185,129,0.08)', borderRadius: BorderRadius.md, padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)' },
    locLabel: { fontSize: FontSizes.xs, color: Colors.safe, fontWeight: '700', letterSpacing: 1 },
    coordsText: { fontSize: FontSizes.sm, color: Colors.text, fontWeight: '600', marginTop: 2 },
    awaitingBox: { borderRadius: BorderRadius.md, padding: Spacing.lg, borderWidth: 1, borderColor: 'rgba(245,158,11,0.35)', flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
    awaitingTitle: { fontSize: FontSizes.xs, color: Colors.warning, fontWeight: '900', letterSpacing: 1 },
    awaitingSub: { fontSize: FontSizes.xs, color: Colors.textSecondary, marginTop: 4, lineHeight: 16 },
    accessBadge: { borderRadius: BorderRadius.md, padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)', alignItems: 'center' },
    accessBadgeText: { color: Colors.safe, fontWeight: '800', fontSize: FontSizes.sm },
    videoBox: { borderRadius: BorderRadius.md, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(29,78,216,0.5)', height: 220 },
    videoImage: { width: '100%', height: '100%' },
    videoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
    vpText: { color: Colors.text, fontSize: FontSizes.sm, fontWeight: '700' },
    vpSub: { color: Colors.textSecondary, fontSize: FontSizes.xs },
    videoOverlay: { position: 'absolute', top: 8, left: 8, right: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    liveRecChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(239,68,68,0.55)', borderRadius: BorderRadius.full, paddingVertical: 3, paddingHorizontal: Spacing.sm, borderWidth: 1, borderColor: Colors.danger },
    recChipText: { color: '#fff', fontSize: FontSizes.xs, fontWeight: '900', letterSpacing: 1 },
    fpsLabel: { color: 'rgba(255,255,255,0.8)', fontSize: FontSizes.xs, fontWeight: '700' },
    audioBox: { borderRadius: BorderRadius.md, padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(29,78,216,0.3)', gap: Spacing.sm },
    audioTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    audioTitle: { fontSize: FontSizes.xs, fontWeight: '800', letterSpacing: 1 },
    audioSub: { fontSize: FontSizes.xs, color: Colors.textSecondary },
    eqRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 36, paddingHorizontal: 2 },
    eqBar: { width: 5, borderRadius: 2, minHeight: 4 },
    saveBtn: { borderRadius: BorderRadius.md, overflow: 'hidden' },
    btnInner: { paddingVertical: Spacing.md, alignItems: 'center' },
    btnText: { color: '#fff', fontSize: FontSizes.sm, fontWeight: '700' },
    idleCard: { borderRadius: BorderRadius.lg, padding: Spacing.xxl, alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderColor: 'rgba(29,78,216,0.2)' },
    idleEmoji: { fontSize: 52 },
    idleTitle: { fontSize: FontSizes.xxl, fontWeight: '900', color: Colors.policeLight, letterSpacing: 2 },
    idleText: { fontSize: FontSizes.sm, color: Colors.textSecondary, textAlign: 'center' },
    historyTitle: { fontSize: FontSizes.md, fontWeight: '700', color: Colors.text, marginTop: Spacing.xs },
    histCard: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, borderRadius: BorderRadius.md, padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
    histName: { color: Colors.text, fontSize: FontSizes.sm, fontWeight: '600' },
    histTime: { color: Colors.textSecondary, fontSize: FontSizes.xs },
    histCoords: { color: Colors.textMuted, fontSize: FontSizes.xs },
    histMapLink: { color: Colors.policeLight, fontSize: FontSizes.xs, marginTop: 1 },
    histStatus: { paddingVertical: 4, paddingHorizontal: Spacing.sm, borderRadius: BorderRadius.xs },
    histStatusText: { fontSize: FontSizes.xs, fontWeight: '800' },
});
