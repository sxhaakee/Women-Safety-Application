/**
 * AlertFiredScreen — OPEN EMERGENCY SCREEN
 * NO STEALTH MODE. NO BLACK SCREEN. NO LOCK SCREEN.
 *
 * What shows on screen:
 *   1. BIG RED EMERGENCY HEADER + live timer
 *   2. Live front-camera preview (200px tall, clearly visible)
 *   3. GPS status row
 *   4. OPEN numeric keypad (1-9, 0, ⌫) directly on screen
 *      → victim types her 4-digit login PIN → alert stops
 *
 * Background:
 *   → camera snapshot every 3s (with full console logs)
 *   → mic chunk every 5s
 *   → GPS ping every 5s
 *   → back button / swipe blocked
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, StatusBar,
    TouchableOpacity, Animated, Vibration,
    Platform, BackHandler, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
    useAudioRecorder,
    RecordingPresets,
    requestRecordingPermissionsAsync,
    setAudioModeAsync,
    createAudioPlayer,
    AudioPlayer,
} from 'expo-audio';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Spacing, BorderRadius } from '../theme';
import { SheSafeUser, SheSafeWS, fireAlert, sendLocationPing, resolveAlert, BACKEND_URL } from '../utils/api';
import { outboxEnqueue } from '../outbox/OutboxDB';

export default function AlertFiredScreen({ navigation, route }: any) {
    const user: SheSafeUser = route?.params?.user;
    const initLoc = route?.params?.location;

    // ── State ─────────────────────────────────────────────────
    const [elapsed, setElapsed]   = useState(0);
    const [pin, setPin]           = useState('');
    const [pinError, setPinError] = useState(false);
    const [pinOk, setPinOk]       = useState(false);
    const [camReady, setCamReady] = useState(false);
    const [address, setAddress]   = useState('Acquiring GPS…');

    // ── Audio Recorder (SDK 57) ───────────────────────────────
    const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

    // ── Refs ───────────────────────────────────────────────────
    // Direct browser MediaRecorder ref for rock-solid 10-second web recording
    const webMediaRecorderRef = useRef<any>(null);
    const webAudioStreamRef   = useRef<any>(null);
    const sirenPlayerRef = useRef<AudioPlayer | null>(null);
    const audioTimer     = useRef<any>(null);
    const gpsTimer     = useRef<any>(null);
    const vidTimer     = useRef<any>(null);
    const elapsedTimer = useRef<any>(null);
    const alertId      = useRef<string | null>(null);
    const audioSeq     = useRef(0);
    const videoSeq     = useRef(0);
    const wsRef        = useRef<SheSafeWS | null>(null);
    const mounted      = useRef(true);
    const capturing    = useRef(false);
    const camRef       = useRef<any>(null);
    const savedPin     = useRef('1234'); // will be loaded from AsyncStorage

    // ── Animations ─────────────────────────────────────────────
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const shakeAnim = useRef(new Animated.Value(0)).current;

    const [camPerm, requestCamPerm] = useCameraPermissions();

    // ── Block back navigation ──────────────────────────────────
    useFocusEffect(
        useCallback(() => {
            navigation.setOptions({ gestureEnabled: false });
            const sub = BackHandler.addEventListener('hardwareBackPress', () => {
                console.log('[ALERT] 🛡 Back button blocked');
                return true;
            });
            return () => sub.remove();
        }, [navigation])
    );

    // ── Boot ───────────────────────────────────────────────────
    useEffect(() => {
        mounted.current = true;
        console.log('[ALERT] ===== AlertFiredScreen MOUNTED — NO STEALTH MODE =====');

        // Load victim PIN from storage
        AsyncStorage.getItem('shesafe_victim_pin').then(p => {
            if (p && p.length === 4) {
                savedPin.current = p;
                console.log('[ALERT] ✅ Loaded victim PIN from storage:', p);
            } else {
                console.log('[ALERT] ⚠️ No victim PIN in storage — using default 1234');
            }
        });

        // Pulse siren
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 0.1, duration: 400, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1,   duration: 400, useNativeDriver: true }),
            ])
        ).start();

        // Elapsed counter
        elapsedTimer.current = setInterval(() => {
            if (mounted.current) setElapsed(e => e + 1);
        }, 1000);

        boot();

        return () => {
            mounted.current = false;
            clearInterval(gpsTimer.current);
            clearInterval(vidTimer.current);
            clearInterval(elapsedTimer.current);
            stopAudio();
            wsRef.current?.disconnect();
        };
    }, []);

    // ── Watch pin length → auto-verify when 4 digits entered ──
    useEffect(() => {
        if (pin.length === 4 && !pinOk) {
            verifyPin(pin);
        }
    }, [pin]);

    // ── Boot all services ──────────────────────────────────────
    const boot = async () => {
        console.log('[ALERT] 🔌 Connecting WebSocket...');
        const socket = new SheSafeWS('victim', () => {});
        socket.connect();
        wsRef.current = socket;

        // GPS
        let lat = initLoc?.lat ?? 12.8067;
        let lng = initLoc?.lng ?? 74.9322;
        let addr = 'Location tracking active';
        try {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            lat = loc.coords.latitude;
            lng = loc.coords.longitude;
            const [geo] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
            if (geo) addr = [geo.street, geo.district || geo.city, geo.region].filter(Boolean).join(', ');
            if (mounted.current) setAddress(addr);
            console.log('[ALERT] 📍 GPS acquired:', addr);
        } catch (e: any) {
            console.warn('[ALERT] GPS error:', e?.message);
        }

        // Fire SOS alert on server (offline-first: queue in outbox if server unreachable)
        console.log('[ALERT] 🚨 Firing SOS alert on server...');
        const alertPayload = {
            victim_id:    user?.id    ?? 'victim-001',
            victim_name:  user?.name  ?? 'Unknown Victim',
            victim_phone: user?.phone ?? '+91 00000 00000',
            lat, lng, address: addr,
        };
        const fired = await fireAlert(alertPayload);
        if (fired) {
            alertId.current = fired.id;
            console.log('[ALERT] ✅ Alert ID:', fired.id);

            // GPS ping loop
            gpsTimer.current = setInterval(async () => {
                if (!mounted.current || !alertId.current) return;
                try {
                    const l = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                    await sendLocationPing(alertId.current, l.coords.latitude, l.coords.longitude);
                    console.log(`[GPS] Pinged: ${l.coords.latitude.toFixed(5)}, ${l.coords.longitude.toFixed(5)}`);
                } catch (_) {}
            }, 5000);
        } else {
            // Offline fallback: generate a local UUID and queue in outbox
            const localId = `LOCAL-${Date.now()}`;
            alertId.current = localId;
            await outboxEnqueue('fire', localId, alertPayload, 0);
            console.warn('[ALERT] ⚠️ Server unreachable — alert queued in outbox as', localId);
            // Still start GPS so we capture track when reconnected
            gpsTimer.current = setInterval(async () => {
                if (!mounted.current || !alertId.current) return;
                try {
                    const l = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                    await sendLocationPing(alertId.current, l.coords.latitude, l.coords.longitude);
                } catch (_) {}
            }, 5000);
        }

        // Camera
        console.log('[CAM] Requesting camera permission...');
        let camGranted = camPerm?.granted;
        if (!camGranted) {
            const perm = await requestCamPerm();
            camGranted = perm.granted;
        }
        console.log('[CAM] Camera permission granted:', camGranted);
        if (camGranted && mounted.current) {
            setCamReady(true);
            console.log('[CAM] ✅ Camera ready — starting 3s frame capture loop');
            vidTimer.current = setInterval(captureAndSendFrame, 3000);
        } else {
            console.warn('[CAM] ❌ Camera NOT ready — no frames will be captured');
        }

        // Audio
        const { granted: audioOk } = await requestRecordingPermissionsAsync();
        console.log('[AUDIO] Mic permission granted:', audioOk);
        if (audioOk) {
            await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
            console.log('[AUDIO] ✅ Starting rolling 5s audio recording');
            recordAudio();
        }

        // Siren sound played out loud on victim's phone along with recording
        try {
            const sirenAsset = require('../../assets/siren.wav');
            const player = createAudioPlayer(sirenAsset);
            player.loop = true;
            sirenPlayerRef.current = player;
            player.play();
            console.log('[ALERT] 📢 Siren started playing out loud');
        } catch (e: any) {
            console.warn('[ALERT] Siren player error:', e?.message);
        }
    };

    // ── Camera frame capture (with full logging) ───────────────
    const captureAndSendFrame = async () => {
        const t = new Date().toLocaleTimeString();

        if (!mounted.current) {
            console.log(`[CAM ${t}] ⏭ Skipped — screen unmounted`);
            return;
        }
        if (capturing.current) {
            console.log(`[CAM ${t}] ⏭ Skipped — already capturing`);
            return;
        }
        if (!camRef.current) {
            console.warn(`[CAM ${t}] ❌ camRef is null — camera not mounted yet`);
            return;
        }
        if (!alertId.current) {
            console.warn(`[CAM ${t}] ❌ No alert ID — server not connected?`);
            return;
        }
        if (!wsRef.current) {
            console.warn(`[CAM ${t}] ❌ WebSocket ref is null`);
            return;
        }

        capturing.current = true;
        console.log(`[CAM ${t}] 📸 Taking photo... (seq #${videoSeq.current})`);

        try {
            const photo = await camRef.current.takePictureAsync({
                base64: true,
                quality: 0.25,
                exif: false,
            });

            if (!photo?.base64) {
                console.warn(`[CAM ${t}] ❌ takePictureAsync returned no base64 data`);
                return;
            }

            const b64 = photo.base64.replace(/[\r\n\s]/g, '');
            const sizeKb = Math.round(b64.length / 1024);
            console.log(`[CAM ${t}] 📷 Photo captured (${sizeKb} KB) — sending via WebSocket...`);

            const ok = wsRef.current.sendRaw({
                type: 'VIDEO_FRAME',
                alert_id: alertId.current,
                data: b64,
                seq: videoSeq.current,
            });

            if (ok) {
                console.log(`[CAM ${t}] ✅ Frame #${videoSeq.current} sent successfully (${sizeKb} KB)`);
            } else {
                console.warn(`[CAM ${t}] ⚠️ Frame #${videoSeq.current} — WS sendRaw returned false (not connected?)`);
            }
            videoSeq.current++;
        } catch (e: any) {
            console.error(`[CAM ${t}] 💥 takePictureAsync FAILED: ${e?.message}`);
        } finally {
            capturing.current = false;
        }
    };

    // ── Rolling audio ─────────────────────────────────────────
    const recordAudio = async () => {
        if (!mounted.current) return;

        // WEB BROWSER IMPLEMENTATION: Use browser MediaRecorder with MediaStream
        if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.mediaDevices) {
            try {
                if (!webAudioStreamRef.current) {
                    webAudioStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
                }
                const stream = webAudioStreamRef.current;
                const mr = new (window as any).MediaRecorder(stream);
                const recordedChunks: Blob[] = [];

                mr.ondataavailable = (e: any) => {
                    if (e.data && e.data.size > 0) {
                        recordedChunks.push(e.data);
                    }
                };

                mr.onstop = async () => {
                    if (!mounted.current) return;
                    try {
                        const blob = new Blob(recordedChunks, { type: 'audio/webm' });
                        if (blob.size > 0 && alertId.current && wsRef.current) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                                const res = (reader.result as string) || '';
                                const b64 = res.includes(',') ? res.split(',')[1] : res;
                                const seq = audioSeq.current++;
                                console.log(`[AUDIO WEB] 🎤 Captured 10s audio (${Math.round(b64.length / 1024)} KB)`);

                                wsRef.current?.sendRaw({
                                    type: 'AUDIO_CHUNK',
                                    alert_id: alertId.current,
                                    data: b64,
                                    seq,
                                    mime: 'audio/mp3',
                                });

                                fetch(`${BACKEND_URL}/api/recording/save`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ alert_id: alertId.current, audio_b64: b64, mime_type: 'audio/mp3' }),
                                }).catch(() => {});
                            };
                            reader.readAsDataURL(blob);
                        }
                    } catch (err) {
                        console.warn('[AUDIO WEB PROCESSING ERROR]', err);
                    }
                    if (mounted.current) {
                        recordAudio();
                    }
                };

                webMediaRecorderRef.current = mr;
                mr.start();
                console.log('[AUDIO WEB] 🎙️ Recording live microphone for full 10 seconds...');

                audioTimer.current = setTimeout(() => {
                    if (mr && mr.state === 'recording') {
                        mr.stop();
                    }
                }, 10000);
            } catch (err: any) {
                console.warn('[AUDIO WEB ERROR]', err?.message);
                if (mounted.current) audioTimer.current = setTimeout(recordAudio, 3000);
            }
            return;
        }

        // NATIVE MOBILE IMPLEMENTATION (iOS / Android)
        try {
            if (recorder.isRecording) {
                try { await recorder.stop(); } catch (_) {}
            }
            await recorder.prepareToRecordAsync();
            recorder.record();
            const seq = audioSeq.current++;
            console.log(`[AUDIO] 🎤 Recording chunk #${seq} (10s cadence)...`);

            audioTimer.current = setTimeout(async () => {
                if (!mounted.current) return;
                try {
                    await recorder.stop();
                    const uri = recorder.uri;
                    if (uri && alertId.current && wsRef.current) {
                        let b64 = '';
                        try {
                            b64 = (await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })).replace(/[\r\n\s]/g, '');
                        } catch (err) {
                            console.warn('[AUDIO FILESYSTEM CONVERT ERROR]', err);
                        }

                        if (!b64 || b64.length === 0) {
                            b64 = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
                        }

                        // Play recorded chunk out loud on victim device along with siren
                        try {
                            if (uri) {
                                const player = createAudioPlayer(uri);
                                player.volume = 1.0;
                                player.play();
                            }
                        } catch (_) {}

                        // Send live via WS to Guardian & Police
                        const sent = wsRef.current.sendRaw({
                            type: 'AUDIO_CHUNK',
                            alert_id: alertId.current,
                            data: b64,
                            seq,
                            mime: 'audio/mp3',
                        });
                        console.log(`[AUDIO] ✅ 10s Chunk #${seq} sent (${Math.round(b64.length / 1024)} KB) sent=${sent}`);

                        // Persist to backend storage
                        fetch(`${BACKEND_URL}/api/recording/save`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ alert_id: alertId.current, audio_b64: b64, mime_type: 'audio/mp3' }),
                        }).catch(() => {});

                        // Also queue in outbox for reliable sync
                        await outboxEnqueue('audio', alertId.current, { data: b64, mime: 'audio/mp3', seq }, seq);
                        await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
                    }
                } catch (e: any) {
                    console.warn('[AUDIO] Chunk error:', e?.message);
                }
                if (mounted.current) recordAudio();
            }, 10000);
        } catch (e: any) {
            console.warn('[AUDIO] Record start error:', e?.message);
            if (mounted.current) audioTimer.current = setTimeout(recordAudio, 2000);
        }
    };

    const stopAudio = async () => {
        if (audioTimer.current) clearTimeout(audioTimer.current);
        try {
            if (webMediaRecorderRef.current && webMediaRecorderRef.current.state === 'recording') {
                webMediaRecorderRef.current.stop();
            }
            if (webAudioStreamRef.current) {
                webAudioStreamRef.current.getTracks().forEach((t: any) => t.stop());
                webAudioStreamRef.current = null;
            }
        } catch (_) {}
        try {
            if (sirenPlayerRef.current) {
                sirenPlayerRef.current.pause();
                sirenPlayerRef.current.remove();
                sirenPlayerRef.current = null;
            }
        } catch (_) {}
        try {
            if (recorder.isRecording) {
                await recorder.stop();
            }
        } catch (_) {}
    };

    // ── PIN verification ──────────────────────────────────────
    const verifyPin = async (entered: string) => {
        const expected = savedPin.current;
        console.log(`[PIN] 🔍 Entered: "${entered}" | Expected: "${expected}"`);

        if (entered === expected) {
            console.log('[PIN] ✅ Correct! Resolving alert...');
            setPinOk(true);
            Vibration.cancel();
            setTimeout(async () => {
                mounted.current = false;
                clearInterval(gpsTimer.current);
                clearInterval(vidTimer.current);
                clearInterval(elapsedTimer.current);
                stopAudio();
                const aid = alertId.current || 'active';
                // Send WS message immediately so Guardian & Police react in real-time
                wsRef.current?.sendRaw({
                    type: 'ALERT_RESOLVED',
                    alert_id: aid,
                    alert: { id: aid, status: 'resolved' },
                    victim_name: user?.name || 'Priya Sharma',
                });
                try {
                    await resolveAlert(aid);
                } catch (_) {}
                try {
                    await outboxEnqueue('cancel', aid, {}, 0);
                } catch (_) {}
                console.log('[PIN] 📡 Alert resolved on server + broadcasted');
                // Give WS 1500ms to flush packets before disconnecting
                setTimeout(() => {
                    wsRef.current?.disconnect();
                }, 1500);
                navigation.reset({ index: 0, routes: [{ name: 'VictimDashboard', params: { user } }] });
            }, 500);
        } else {
            console.log('[PIN] ❌ Wrong PIN!');
            setPinError(true);
            Vibration.vibrate([0, 80, 60, 80]);
            Animated.sequence([
                Animated.timing(shakeAnim, { toValue:  14, duration: 55, useNativeDriver: true }),
                Animated.timing(shakeAnim, { toValue: -14, duration: 55, useNativeDriver: true }),
                Animated.timing(shakeAnim, { toValue:   9, duration: 55, useNativeDriver: true }),
                Animated.timing(shakeAnim, { toValue:   0, duration: 55, useNativeDriver: true }),
            ]).start();
            setTimeout(() => { setPin(''); setPinError(false); }, 800);
        }
    };

    const pressKey = (k: string) => {
        if (pinOk) return;
        if (k === '⌫') {
            setPinError(false);
            setPin(p => p.slice(0, -1));
        } else {
            if (pin.length >= 4) return;
            setPinError(false);
            setPin(p => p + k);
        }
    };

    const fmt = (s: number) =>
        `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

    // ── Render ────────────────────────────────────────────────
    return (
        <View style={styles.root}>
            <StatusBar barStyle="light-content" />

            <ScrollView
                contentContainerStyle={styles.scroll}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="always"
            >
                {/* ── EMERGENCY HEADER ──────────────────── */}
                <LinearGradient colors={['#B91C1C', '#7F1D1D']} style={styles.header}>
                    <Animated.Text style={[styles.sirenEmoji, { opacity: pulseAnim }]}>🚨</Animated.Text>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerTitle}>EMERGENCY SOS ACTIVE</Text>
                        <Text style={styles.headerSub}>Live video & audio sent to Police + Guardian</Text>
                    </View>
                    <View style={styles.timerBox}>
                        <Text style={styles.timerTxt}>⏱ {fmt(elapsed)}</Text>
                    </View>
                </LinearGradient>

                {/* ── LIVE CAMERA FEED ──────────────────── */}
                <View style={styles.camBox}>
                    {camReady ? (
                        <CameraView ref={camRef} style={styles.camView} facing="front" />
                    ) : (
                        <View style={styles.camFallback}>
                            <Text style={{ fontSize: 28 }}>📷</Text>
                            <Text style={styles.camFallbackTxt}>Starting camera…</Text>
                        </View>
                    )}
                    <View style={styles.liveBadge}>
                        <Animated.View style={[styles.liveDot, { opacity: pulseAnim }]} />
                        <Text style={styles.liveTxt}>LIVE — Streaming to Police & Guardian</Text>
                    </View>
                </View>

                {/* ── GPS + AUDIO STATUS ────────────────── */}
                <View style={styles.statusRow}>
                    <Text style={styles.statusIcon}>📍</Text>
                    <Text style={styles.statusTxt} numberOfLines={1}>{address}</Text>
                    <View style={styles.recBadge}>
                        <Animated.Text style={{ fontSize: 10, opacity: pulseAnim }}>🎤</Animated.Text>
                        <Text style={styles.recTxt}>REC</Text>
                    </View>
                </View>

                {/* ── PIN SECTION ───────────────────────── */}
                <View style={styles.pinCard}>

                    <Text style={styles.pinHeading}>🔒 Enter your 4-digit login code to stop SOS</Text>

                    {/* 4 big indicator dots */}
                    <Animated.View style={[styles.dotsRow, { transform: [{ translateX: shakeAnim }] }]}>
                        {[0, 1, 2, 3].map(i => (
                            <View key={i} style={[
                                styles.dot,
                                pin.length > i  && styles.dotFilled,
                                pinError        && styles.dotError,
                                pinOk           && styles.dotOk,
                            ]} />
                        ))}
                    </Animated.View>

                    <Text style={[
                        styles.pinStatusTxt,
                        pinError && { color: '#EF4444' },
                        pinOk    && { color: '#10B981' },
                    ]}>
                        {pinError ? '❌ Wrong code — try again'
                        : pinOk   ? '✅ Correct! Stopping SOS…'
                        :           'Enter the 4-digit code you set at login'}
                    </Text>

                    {/* ── KEYPAD — big round buttons ───────── */}
                    <View style={styles.keypadWrap}>
                        {/* Row 1: 1 2 3 */}
                        <View style={styles.keyRow}>
                            {['1','2','3'].map(k => <KeyBtn key={k} label={k} onPress={() => pressKey(k)} />)}
                        </View>
                        {/* Row 2: 4 5 6 */}
                        <View style={styles.keyRow}>
                            {['4','5','6'].map(k => <KeyBtn key={k} label={k} onPress={() => pressKey(k)} />)}
                        </View>
                        {/* Row 3: 7 8 9 */}
                        <View style={styles.keyRow}>
                            {['7','8','9'].map(k => <KeyBtn key={k} label={k} onPress={() => pressKey(k)} />)}
                        </View>
                        {/* Row 4: ⌫ 0 ✓ */}
                        <View style={styles.keyRow}>
                            <KeyBtn label="⌫" onPress={() => pressKey('⌫')} variant="delete" />
                            <KeyBtn label="0" onPress={() => pressKey('0')} />
                            <KeyBtn label="✓" onPress={() => { if (pin.length === 4) verifyPin(pin); }} variant="confirm" />
                        </View>
                    </View>

                </View>
            </ScrollView>
        </View>
    );
}

// ── Small reusable key button component ───────────────────────
function KeyBtn({
    label,
    onPress,
    variant,
}: {
    label: string;
    onPress: () => void;
    variant?: 'delete' | 'confirm';
}) {
    return (
        <TouchableOpacity
            style={[
                styles.key,
                variant === 'delete'  && styles.keyDel,
                variant === 'confirm' && styles.keyCon,
            ]}
            onPress={onPress}
            activeOpacity={0.55}
        >
            <Text style={[
                styles.keyTxt,
                variant === 'delete'  && styles.keyTxtDel,
                variant === 'confirm' && styles.keyTxtCon,
            ]}>
                {label}
            </Text>
        </TouchableOpacity>
    );
}

// ── Styles ────────────────────────────────────────────────────
const KEY_D = 72; // key button diameter

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: '#1A0000', // clearly dark red — NOT the iOS lock screen black
    },
    scroll: {
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'ios' ? 54 : 32,
        paddingBottom: 36,
        gap: 12,
    },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderRadius: 14,
        padding: 14,
        elevation: 6,
    },
    sirenEmoji: { fontSize: 28 },
    headerTitle: { fontSize: 15, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },
    headerSub:   { fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
    timerBox:    { backgroundColor: 'rgba(0,0,0,0.4)', paddingVertical: 5, paddingHorizontal: 9, borderRadius: 8 },
    timerTxt:    { fontSize: 11, fontWeight: '800', color: '#fff' },

    // Camera
    camBox: {
        height: 200,
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: '#000',
        borderWidth: 2,
        borderColor: '#EF4444',
        position: 'relative',
    },
    camView: { width: '100%', height: '100%' },
    camFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
    camFallbackTxt: { color: '#aaa', fontSize: 12 },
    liveBadge: {
        position: 'absolute', top: 9, left: 9,
        flexDirection: 'row', alignItems: 'center', gap: 5,
        backgroundColor: 'rgba(0,0,0,0.8)',
        paddingVertical: 3, paddingHorizontal: 9,
        borderRadius: 20, borderWidth: 1, borderColor: '#EF4444',
    },
    liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#EF4444' },
    liveTxt: { color: '#fff', fontSize: 10, fontWeight: '800' },

    // Status row
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 10,
        padding: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    statusIcon: { fontSize: 15 },
    statusTxt:  { flex: 1, fontSize: 11, color: '#aaa' },
    recBadge:   { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(139,92,246,0.22)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(139,92,246,0.4)' },
    recTxt:     { fontSize: 10, fontWeight: '800', color: '#A78BFA' },

    // PIN card
    pinCard: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 20,
        paddingVertical: 22,
        paddingHorizontal: 14,
        alignItems: 'center',
        gap: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    pinHeading: { fontSize: 13, fontWeight: '700', color: '#F3F4F6', textAlign: 'center' },

    // Dots
    dotsRow: { flexDirection: 'row', gap: 18 },
    dot: {
        width: 20, height: 20, borderRadius: 10,
        borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.3)',
        backgroundColor: 'transparent',
    },
    dotFilled: { backgroundColor: '#fff', borderColor: '#fff' },
    dotError:  { backgroundColor: '#EF4444', borderColor: '#EF4444' },
    dotOk:     { backgroundColor: '#10B981', borderColor: '#10B981' },

    pinStatusTxt: { fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center' },

    // Keypad
    keypadWrap: { width: '100%', gap: 10 },
    keyRow:     { flexDirection: 'row', justifyContent: 'center', gap: 10 },

    key: {
        width: KEY_D, height: KEY_D, borderRadius: KEY_D / 2,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)',
    },
    keyDel: { backgroundColor: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.35)' },
    keyCon: { backgroundColor: 'rgba(16,185,129,0.15)', borderColor: 'rgba(16,185,129,0.45)' },
    keyTxt:    { fontSize: 24, fontWeight: '700', color: '#F3F4F6' },
    keyTxtDel: { fontSize: 22, color: '#EF4444' },
    keyTxtCon: { fontSize: 22, color: '#10B981' },
});
