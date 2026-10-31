import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet,
    ScrollView, Animated, StatusBar, Alert, Image, Linking, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { createAudioPlayer, setAudioModeAsync, AudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import MapView, { Marker, PROVIDER_GOOGLE } from '../components/SafeMapView';
import { Colors, Spacing, FontSizes, BorderRadius } from '../theme';
import {
    SheSafeUser, SheSafeAlert, SheSafeWS,
    getActiveAlerts, getAllAlerts, resolveAlert, BACKEND_URL,
} from '../utils/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function GuardianDashboard({ navigation, route }: any) {
    const user: SheSafeUser = route?.params?.user || { name: 'Meera Guardian', role: 'guardian' };

    const [activeAlert, setActiveAlert]         = useState<SheSafeAlert | null>(null);
    const [history, setHistory]                 = useState<SheSafeAlert[]>([]);
    const [connected, setConnected]             = useState(false);
    const [elapsed, setElapsed]                 = useState(0);
    const [currentTime, setCurrentTime]         = useState(new Date());
    const [liveVideoFrame, setLiveVideoFrame]   = useState<string | null>(null);
    const [audioChunkCount, setAudioChunkCount] = useState(0);
    const [audioLevel, setAudioLevel]           = useState<number[]>([]);
    const [policeGranted, setPoliceGranted]     = useState(false);
    const [isSaving, setIsSaving]               = useState(false);
    const [isStopping, setIsStopping]           = useState(false);

    const audioChunksRef  = useRef<{ data: string; mime: string; seq: number }[]>([]);
    const videoFramesRef  = useRef<{ data: string; seq: number }[]>([]);
    const currentAlertId  = useRef<string | null>(null);

    const fadeAnim   = useRef(new Animated.Value(0)).current;
    const alertBlink = useRef(new Animated.Value(1)).current;
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
        const poll = setInterval(loadAlerts, 3000);
        return () => {
            clearInterval(clk);
            clearInterval(poll);
            clearInterval(elapsedRef.current);
            wsRef.current?.disconnect();
            soundRef.current?.remove();
        };
    }, []);

    useEffect(() => {
        if (activeAlert) {
            startAlertAnims();
            startElapsed();
            currentAlertId.current = activeAlert.id;
            setPoliceGranted(false);
        } else {
            clearInterval(elapsedRef.current);
            setElapsed(0);
        }
    }, [activeAlert?.id]);

    const startConnDot = () => Animated.loop(Animated.sequence([
        Animated.timing(connDot, { toValue: 0.3, duration: 1100, useNativeDriver: true }),
        Animated.timing(connDot, { toValue: 1,   duration: 1100, useNativeDriver: true }),
    ])).start();

    const startAlertAnims = () => Animated.loop(Animated.sequence([
        Animated.timing(alertBlink, { toValue: 0.2, duration: 700, useNativeDriver: true }),
        Animated.timing(alertBlink, { toValue: 1,   duration: 700, useNativeDriver: true }),
    ])).start();

    const startElapsed = () => {
        clearInterval(elapsedRef.current);
        setElapsed(0);
        elapsedRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    };

    const loadAlerts = async () => {
        const [active, all] = await Promise.all([getActiveAlerts(), getAllAlerts()]);
        if (active.length > 0) {
            setActiveAlert(prev => {
                if (!prev || prev.id !== active[0].id) {
                    return active[0];
                }
                return prev;
            });
        } else {
            setActiveAlert(null);
        }
        setHistory(all);
    };

    const connectWS = () => {
        const ws = new SheSafeWS('guardian', (msg) => {
            const et = new Date().toLocaleTimeString();
            switch (msg.type) {
                case 'REGISTERED':
                    setConnected(true);
                    console.log(`[GUARDIAN WS ${et}] ✅ GUARDIAN REGISTERED`);
                    break;
                case 'ALERT_ACTIVE':
                case 'ALERT_FIRED':
                    console.log(`[GUARDIAN WS ${et}] 🚨 SOS: ${msg.alert.victim_name}`);
                    setActiveAlert(msg.alert);
                    setHistory(prev => [msg.alert, ...prev.filter(a => a.id !== msg.alert.id)]);
                    break;
                case 'LOCATION_UPDATE':
                    console.log(`[GUARDIAN WS ${et}] 📍 ${msg.lat?.toFixed(5)}, ${msg.lng?.toFixed(5)}`);
                    setActiveAlert(prev =>
                        prev?.id === msg.alert_id ? { ...prev, lat: msg.lat, lng: msg.lng } : prev
                    );
                    break;
                case 'AUDIO_CHUNK':
                    console.log(`[GUARDIAN WS ${et}] 🎤 Audio chunk #${msg.seq} (${Math.round(msg.data.length / 1024)} KB)`);
                    audioChunksRef.current.push({ data: msg.data, mime: msg.mime, seq: msg.seq });
                    setAudioChunkCount(c => c + 1);
                    setAudioLevel(prev => [...prev.slice(-14), Math.min(msg.data.length / 5000, 100)]);
                    enqueueAudio(msg.data, msg.mime);
                    break;
                case 'VIDEO_FRAME': {
                    console.log(`[GUARDIAN WS ${et}] 📸 Video frame #${msg.seq} (${Math.round((msg.data?.length || 0) / 1024)} KB)`);
                    const cleanData = (msg.data || '').replace(/[\r\n\s]/g, '');
                    videoFramesRef.current = [...videoFramesRef.current.slice(-9), { data: cleanData, seq: msg.seq }];
                    setLiveVideoFrame(cleanData);
                    break;
                }
                case 'ALERT_RESOLVED':
                    console.log(`[GUARDIAN WS ${et}] ✅ Alert resolved`);
                    setActiveAlert(prev => prev?.id === msg.alert.id ? null : prev);
                    setHistory(prev => prev.map(a => a.id === msg.alert.id ? msg.alert : a));
                    break;
                case 'RESET':
                    setActiveAlert(null); setHistory([]);
                    setLiveVideoFrame(null); setAudioChunkCount(0); setPoliceGranted(false);
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
        try {
            if (soundRef.current) {
                try { soundRef.current.remove(); } catch (_) {}
                soundRef.current = null;
            }
            await setAudioModeAsync({ playsInSilentMode: true });
            const tmpUri = FileSystem.cacheDirectory + `g_chunk_${Date.now()}.m4a`;
            await FileSystem.writeAsStringAsync(tmpUri, chunk.data, { encoding: FileSystem.EncodingType.Base64 });
            const player = createAudioPlayer(tmpUri);
            soundRef.current = player;
            console.log(`[GUARDIAN AUDIO] 🔊 Playing chunk`);
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
            console.warn(`[GUARDIAN AUDIO PLAY ERROR]`, e?.message);
            isPlaying.current = false;
            if (audioQueue.current.length > 0) playNextAudio();
        }
    };

    const handleGrantPolice = () => {
        if (!currentAlertId.current || !wsRef.current) return;
        wsRef.current.sendRaw({ type: 'GRANT_POLICE_ACCESS', alert_id: currentAlertId.current });
        setPoliceGranted(true);
        Alert.alert('✅ Police Access Granted', 'Police can now see the live audio and video feed.');
        console.log(`[GUARDIAN] 🔓 Police access granted for ${currentAlertId.current}`);
    };

    const handleStopAlert = () => {
        Alert.alert(
            '🛑 Stop Alert',
            'Are you sure you want to stop the live emergency alert? This confirms she is safe.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Yes, Stop Alert', style: 'destructive', onPress: async () => {
                        if (!currentAlertId.current) return;
                        setIsStopping(true);
                        await resolveAlert(currentAlertId.current);
                        setIsStopping(false);
                        console.log(`[GUARDIAN] ✅ Alert stopped by guardian`);
                    }
                }
            ]
        );
    };

    const openGoogleMaps = (lat: number, lng: number, name?: string) => {
        const label = encodeURIComponent(name || 'Victim Location');
        const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&destination_place_id=${label}`;
        Linking.openURL(url).catch(() =>
            Linking.openURL(`geo:${lat},${lng}?q=${lat},${lng}(${label})`)
        );
    };

    const openMapsHistory = (lat: number, lng: number) => {
        Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);
    };

    const handleSaveRecording = async () => {
        const chunks = audioChunksRef.current;
        const frames = videoFramesRef.current;
        if (chunks.length === 0 && frames.length === 0) {
            Alert.alert('No Data', 'No recording data available yet.'); return;
        }
        setIsSaving(true);
        try {
            let framesSaved = 0;
            if (frames.length > 0) {
                for (const frame of frames.slice(-5)) {
                    try {
                        const targetUri = (FileSystem.documentDirectory || FileSystem.cacheDirectory) + `gframe_${frame.seq}.jpg`;
                        await FileSystem.writeAsStringAsync(targetUri, frame.data, { encoding: FileSystem.EncodingType.Base64 });
                        framesSaved++;
                    } catch (_) {}
                }
            }
            let audioSaved = false;
            let audioTargetUri = '';
            if (chunks.length > 0) {
                const last = chunks[chunks.length - 1]!;
                try {
                    audioTargetUri = (FileSystem.documentDirectory || FileSystem.cacheDirectory) + `shesafe_audio_${Date.now()}.wav`;
                    await FileSystem.writeAsStringAsync(audioTargetUri, last.data, { encoding: FileSystem.EncodingType.Base64 });
                    audioSaved = true;
                } catch (_) {}
            }
            setIsSaving(false);
            Alert.alert(
                '💾 Evidence Saved to Device',
                `Successfully saved ${framesSaved} camera snapshots ${audioSaved ? 'and audio recording' : ''} to device storage.\n\nFile location: ${FileSystem.documentDirectory || 'App Documents'}`
            );
        } catch (e: any) {
            setIsSaving(false);
            Alert.alert('❌ Save Failed', e?.message || 'Unable to write to storage');
        }
    };

    const handleLogout = async () => {
        Alert.alert('Logout', 'Logout from Guardian?', [
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
        <LinearGradient colors={['#0A1628', '#060D1A', '#080810']} style={styles.container}>
            <StatusBar barStyle="light-content" />

            {/* Header */}
            <Animated.View style={[styles.header, { opacity: fadeAnim }]}>
                <View>
                    <Text style={styles.roleLabel}>🛡️ GUARDIAN</Text>
                    <Text style={styles.userName}>{user.name}</Text>
                </View>
                <View style={styles.headerRight}>
                    <View style={[styles.connPill, connected ? styles.connOn : styles.connOff]}>
                        <Animated.View style={[styles.connDot, { opacity: connDot, backgroundColor: connected ? Colors.safe : Colors.warning }]} />
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
                    <View style={styles.alertCard}>
                        <LinearGradient colors={['rgba(239,68,68,0.22)','rgba(239,68,68,0.04)']} style={styles.alertGrad}>

                            {/* Title row */}
                            <View style={styles.alertTitleRow}>
                                <Animated.Text style={[styles.alertEmoji, { opacity: alertBlink }]}>🚨</Animated.Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.alertTitle}>SOS ALERT ACTIVE</Text>
                                    <Text style={styles.alertElapsed}>⏱ {fmt(elapsed)} elapsed</Text>
                                </View>
                                <View style={styles.liveChip}>
                                    <Animated.View style={[styles.liveDot, { opacity: alertBlink }]} />
                                    <Text style={styles.liveText}>LIVE</Text>
                                </View>
                            </View>

                            {/* Victim */}
                            <LinearGradient colors={['rgba(255,255,255,0.07)','rgba(255,255,255,0.02)']} style={styles.victimRow}>
                                <Text style={{ fontSize: 32 }}>👩</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.victimName}>{activeAlert.victim_name}</Text>
                                    <Text style={styles.victimPhone}>{activeAlert.victim_phone}</Text>
                                </View>
                            </LinearGradient>

                            {/* ── LIVE MAP ── */}
                            {activeAlert.lat && activeAlert.lng ? (
                                <>
                                    <View style={styles.sectionHeader}>
                                        <Animated.View style={[styles.recDot, { opacity: alertBlink, backgroundColor: Colors.safe }]} />
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
                                        <Text style={styles.directionsBtnText}>🗺️ Open Directions in Google Maps</Text>
                                    </TouchableOpacity>
                                    <Text style={styles.addrText}>📌 {activeAlert.address}</Text>
                                </>
                            ) : (
                                <LinearGradient colors={['rgba(16,185,129,0.1)','rgba(16,185,129,0.03)']} style={styles.locRow}>
                                    <Text style={{ fontSize: 24 }}>📍</Text>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.sectionTitle, { color: Colors.safe }]}>VICTIM LOCATION</Text>
                                        <Text style={styles.coordsText}>{fmtCoords(activeAlert.lat, activeAlert.lng)}</Text>
                                        <Text style={styles.addrText}>{activeAlert.address}</Text>
                                    </View>
                                    <Animated.Text style={{ opacity: alertBlink }}>🔴</Animated.Text>
                                </LinearGradient>
                            )}

                            {/* ── LIVE VIDEO FEED ── */}
                            <View style={styles.sectionHeader}>
                                <Animated.View style={[styles.recDot, { opacity: alertBlink }]} />
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
                                                <Animated.View style={[styles.recDot, { opacity: alertBlink }]} />
                                                <Text style={styles.recChipText}>🔴 LIVE</Text>
                                            </View>
                                            <Text style={styles.fpsLabel}>Front Cam</Text>
                                        </View>
                                    </>
                                ) : (
                                    <LinearGradient colors={['#0A0A0A','#141414']} style={styles.videoPlaceholder}>
                                        <Animated.Text style={{ fontSize: 36, opacity: alertBlink }}>📷</Animated.Text>
                                        <Text style={styles.vpText}>Awaiting first frame...</Text>
                                        <Text style={styles.vpSub}>Front camera captures every 3s</Text>
                                    </LinearGradient>
                                )}
                            </View>

                            {/* ── LIVE AUDIO ── */}
                            <View style={styles.sectionHeader}>
                                <Animated.View style={[styles.recDot, { opacity: alertBlink, backgroundColor: Colors.guardian }]} />
                                <Text style={[styles.sectionTitle, { color: Colors.guardian }]}>
                                    AUDIO — {audioChunkCount} CHUNK{audioChunkCount !== 1 ? 'S' : ''} RECEIVED
                                </Text>
                            </View>

                            <LinearGradient colors={['rgba(139,92,246,0.18)','rgba(139,92,246,0.05)']} style={styles.audioBox}>
                                <View style={styles.audioTop}>
                                    <Animated.Text style={{ opacity: alertBlink, fontSize: 20 }}>🎤</Animated.Text>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.audioTitle}>LIVE AUDIO — AUTO-PLAYS</Text>
                                        <Text style={styles.audioSub}>Rolling 5s chunks</Text>
                                    </View>
                                </View>
                                <View style={styles.eqRow}>
                                    {(audioLevel.length > 0 ? audioLevel : Array(15).fill(8)).map((h, i) => (
                                        <Animated.View
                                            key={i}
                                            style={[styles.eqBar, {
                                                height: Math.max(4, h * 0.35),
                                                opacity: audioChunkCount > 0 ? (i % 2 === 0 ? alertBlink : 1) : 0.25,
                                            }]}
                                        />
                                    ))}
                                </View>
                            </LinearGradient>

                            {/* ── ACTION BUTTONS ── */}
                            {!policeGranted ? (
                                <TouchableOpacity style={styles.grantBtn} onPress={handleGrantPolice} activeOpacity={0.8}>
                                    <LinearGradient colors={['#1D4ED8','#1E3A8A']} style={styles.btnInner}>
                                        <Text style={styles.btnText}>👮 Grant Police Access to Live Feed</Text>
                                    </LinearGradient>
                                </TouchableOpacity>
                            ) : (
                                <View style={styles.grantedBadge}>
                                    <Text style={styles.grantedText}>✅ Police Can Now See the Live Feed</Text>
                                </View>
                            )}

                            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveRecording} disabled={isSaving} activeOpacity={0.8}>
                                <LinearGradient colors={[Colors.safe, Colors.safeDark]} style={styles.btnInner}>
                                    <Text style={styles.btnText}>{isSaving ? '⏳ Saving...' : '💾 Save Recording as Evidence'}</Text>
                                </LinearGradient>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.stopAlertBtn}
                                onPress={handleStopAlert}
                                disabled={isStopping}
                                activeOpacity={0.8}
                            >
                                <LinearGradient colors={['rgba(239,68,68,0.3)','rgba(239,68,68,0.15)']} style={styles.btnInner}>
                                    <Text style={[styles.btnText, { color: '#FCA5A5' }]}>
                                        {isStopping ? '⏳ Stopping...' : '🛑 Stop Live Alert (Victim is Safe)'}
                                    </Text>
                                </LinearGradient>
                            </TouchableOpacity>

                        </LinearGradient>
                    </View>
                ) : (
                    <LinearGradient colors={['rgba(16,185,129,0.12)','rgba(16,185,129,0.04)']} style={styles.safeCard}>
                        <Text style={styles.safeEmoji}>🛡️</Text>
                        <Text style={styles.safeTitle}>ALL CLEAR</Text>
                        <Text style={styles.safeText}>No active SOS alerts. Monitoring real-time.</Text>
                        <View style={[styles.connPill, connected ? styles.connOn : styles.connOff, { alignSelf: 'center', marginTop: Spacing.sm }]}>
                            <Animated.View style={[styles.connDot, { opacity: connDot, backgroundColor: connected ? Colors.safe : Colors.warning }]} />
                            <Text style={styles.connText}>{connected ? 'Connected & Monitoring' : 'Reconnecting...'}</Text>
                        </View>
                    </LinearGradient>
                )}

                {/* History */}
                {history.length > 0 && (
                    <>
                        <Text style={styles.historyTitle}>📋 Alert History</Text>
                        {history.map(a => (
                            <LinearGradient key={a.id} colors={['rgba(255,255,255,0.06)','rgba(255,255,255,0.02)']} style={styles.histCard}>
                                <Text style={{ fontSize: 20 }}>{a.status === 'active' ? '🔴' : '✅'}</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.histName}>{a.victim_name}</Text>
                                    <Text style={styles.histTime}>{fmtTime(a.triggered_at)}</Text>
                                    {a.lat && a.lng && (
                                        <TouchableOpacity onPress={() => openMapsHistory(a.lat!, a.lng!)}>
                                            <Text style={styles.histMapLink}>📍 {fmtCoords(a.lat, a.lng)} — tap to view</Text>
                                        </TouchableOpacity>
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
    header: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: Spacing.lg, paddingTop: Spacing.xxl + 10, paddingBottom: Spacing.xs,
    },
    roleLabel: { fontSize: FontSizes.xs, color: Colors.guardian, fontWeight: '800', letterSpacing: 2 },
    userName: { fontSize: FontSizes.xl, fontWeight: '800', color: Colors.text },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    connPill: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, borderRadius: BorderRadius.full, paddingVertical: 6, paddingHorizontal: Spacing.sm, borderWidth: 1 },
    connOn:  { backgroundColor: 'rgba(16,185,129,0.12)', borderColor: 'rgba(16,185,129,0.3)' },
    connOff: { backgroundColor: 'rgba(245,158,11,0.12)', borderColor: 'rgba(245,158,11,0.3)' },
    connDot: { width: 8, height: 8, borderRadius: 4 },
    connText: { fontSize: FontSizes.xs, color: Colors.text, fontWeight: '600' },
    logoutBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
    clock: { fontSize: FontSizes.xl, fontWeight: '300', color: Colors.text, letterSpacing: 3, textAlign: 'center', paddingVertical: Spacing.xs, fontVariant: ['tabular-nums'] },
    scroll: { padding: Spacing.lg, paddingTop: Spacing.xs, paddingBottom: Spacing.xxl + 20, gap: Spacing.md },
    alertCard: { borderRadius: BorderRadius.lg, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)' },
    alertGrad: { padding: Spacing.lg, gap: Spacing.md },
    alertTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    alertEmoji: { fontSize: 40 },
    alertTitle: { fontSize: FontSizes.xl, fontWeight: '900', color: Colors.danger },
    alertElapsed: { fontSize: FontSizes.xs, color: Colors.textSecondary, marginTop: 2 },
    liveChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(239,68,68,0.2)', borderRadius: BorderRadius.full, paddingVertical: 3, paddingHorizontal: Spacing.sm, borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)' },
    liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: Colors.danger },
    liveText: { fontSize: FontSizes.xs, color: Colors.danger, fontWeight: '800' },
    victimRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: BorderRadius.md, padding: Spacing.md },
    victimName: { fontSize: FontSizes.lg, fontWeight: '700', color: Colors.text },
    victimPhone: { fontSize: FontSizes.sm, color: Colors.textSecondary },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    sectionTitle: { fontSize: FontSizes.xs, color: Colors.danger, fontWeight: '800', letterSpacing: 1 },
    recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.danger },

    // Map
    mapContainer: { borderRadius: BorderRadius.md, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(16,185,129,0.4)', height: 200, position: 'relative' },
    map: { width: '100%', height: '100%' },
    mapOverlay: { position: 'absolute', bottom: 8, left: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8 },
    mapCoords: { color: Colors.text, fontSize: FontSizes.xs, fontWeight: '600' },
    directionsBtn: { backgroundColor: 'rgba(16,185,129,0.15)', borderRadius: BorderRadius.md, paddingVertical: Spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)' },
    directionsBtnText: { color: Colors.safe, fontWeight: '700', fontSize: FontSizes.sm },
    addrText: { fontSize: FontSizes.xs, color: Colors.textSecondary },
    locRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: BorderRadius.md, padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)' },
    coordsText: { fontSize: FontSizes.sm, color: Colors.text, fontWeight: '600', marginTop: 2 },

    // Video
    videoBox: { borderRadius: BorderRadius.md, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(239,68,68,0.5)', height: 220 },
    videoImage: { width: '100%', height: '100%' },
    videoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
    vpText: { color: Colors.text, fontSize: FontSizes.sm, fontWeight: '700' },
    vpSub: { color: Colors.textSecondary, fontSize: FontSizes.xs },
    videoOverlay: { position: 'absolute', top: 8, left: 8, right: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    liveRecChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(239,68,68,0.55)', borderRadius: BorderRadius.full, paddingVertical: 3, paddingHorizontal: Spacing.sm, borderWidth: 1, borderColor: Colors.danger },
    recChipText: { color: '#fff', fontSize: FontSizes.xs, fontWeight: '900', letterSpacing: 1 },
    fpsLabel: { color: 'rgba(255,255,255,0.8)', fontSize: FontSizes.xs, fontWeight: '700' },

    // Audio
    audioBox: { borderRadius: BorderRadius.md, padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)', gap: Spacing.sm },
    audioTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    audioTitle: { fontSize: FontSizes.xs, color: Colors.guardian, fontWeight: '800', letterSpacing: 1 },
    audioSub: { fontSize: FontSizes.xs, color: Colors.textSecondary },
    eqRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 36, paddingHorizontal: 2 },
    eqBar: { width: 5, backgroundColor: Colors.guardian, borderRadius: 2, minHeight: 4 },

    // Buttons
    grantBtn: { borderRadius: BorderRadius.md, overflow: 'hidden' },
    saveBtn:  { borderRadius: BorderRadius.md, overflow: 'hidden' },
    stopAlertBtn: { borderRadius: BorderRadius.md, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)' },
    btnInner: { paddingVertical: Spacing.md, alignItems: 'center' },
    btnText: { color: '#fff', fontSize: FontSizes.sm, fontWeight: '700' },
    grantedBadge: { backgroundColor: 'rgba(29,78,216,0.2)', borderRadius: BorderRadius.md, paddingVertical: Spacing.md, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(29,78,216,0.3)' },
    grantedText: { color: '#93C5FD', fontWeight: '700', fontSize: FontSizes.sm },

    // Safe state
    safeCard: { borderRadius: BorderRadius.lg, padding: Spacing.xxl, alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)' },
    safeEmoji: { fontSize: 52 },
    safeTitle: { fontSize: FontSizes.xxl, fontWeight: '900', color: Colors.safe, letterSpacing: 2 },
    safeText: { fontSize: FontSizes.sm, color: Colors.textSecondary, textAlign: 'center' },

    // History
    historyTitle: { fontSize: FontSizes.md, fontWeight: '700', color: Colors.text, marginTop: Spacing.xs },
    histCard: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, borderRadius: BorderRadius.md, padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
    histName: { color: Colors.text, fontSize: FontSizes.sm, fontWeight: '600' },
    histTime: { color: Colors.textSecondary, fontSize: FontSizes.xs },
    histMapLink: { color: Colors.safe, fontSize: FontSizes.xs, marginTop: 2 },
    histStatus: { paddingVertical: 4, paddingHorizontal: Spacing.sm, borderRadius: BorderRadius.xs },
    histStatusText: { fontSize: FontSizes.xs, fontWeight: '800' },
});
