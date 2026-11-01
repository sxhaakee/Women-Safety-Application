import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet,
    ScrollView, Animated, StatusBar, Alert, Image, Linking, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { createAudioPlayer, setAudioModeAsync, AudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import MapView, { Marker, PROVIDER_GOOGLE } from '../components/SafeMapView';
import { Colors, Spacing, FontSizes, BorderRadius } from '../theme';
import {
    SheSafeUser, SheSafeAlert, SheSafeWS,
    getActiveAlerts, getAllAlerts,
    BACKEND_URL,
} from '../utils/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateAndShareEvidencePDF } from '../utils/evidencePdf';

function triggerBrowserDownload(dataUri: string, filename: string) {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
        try {
            const a = document.createElement('a');
            a.href = dataUri;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (e) {
            console.warn('[AUTO DOWNLOAD WEB ERROR]', e);
        }
    }
}

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
    const [isPlayingAudio, setIsPlayingAudio]   = useState(false);
    const [sheIsSafeNotice, setSheIsSafeNotice] = useState<{ visible: boolean; victim_name: string; time: string } | null>(null);
    const [autoSavedAudioCount, setAutoSavedAudioCount] = useState<number>(0);
    const [autoSavedPhotoCount, setAutoSavedPhotoCount] = useState<number>(0);
    const [patrolDispatched, setPatrolDispatched] = useState(false);

    // Critical: use REF for accessGranted in WS callback to prevent stale closures
    const accessGrantedRef = useRef(false);

    const audioChunksRef = useRef<{ data: string; mime: string; seq: number }[]>([]);
    const videoFramesRef = useRef<{ data: string; seq: number }[]>([]);
    const currentAlertId = useRef<string | null>(null);
    const lastBufferedFrameRef = useRef<string | null>(null);
    const bufferedAudioBeforeGrantRef = useRef<{ data: string; mime: string; seq: number }[]>([]);

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
            startSiren();
            startElapsed();
            currentAlertId.current = activeAlert.id;
            audioChunksRef.current = [];
            videoFramesRef.current = [];
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
        Animated.timing(sirenAnim, { toValue: 0.25, duration: 600, useNativeDriver: true }),
        Animated.timing(sirenAnim, { toValue: 1,    duration: 600, useNativeDriver: true }),
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
                if (!prev) return active[0]!;
                if (prev.id !== active[0]!.id) {
                    return active[0]!;
                }
                return prev;
            });
            setSheIsSafeNotice(null);
        } else {
            // When no active alerts exist on backend / DB, clear activeAlert immediately
            setActiveAlert(null);
        }
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
                    setSheIsSafeNotice(null);
                    currentAlertId.current = msg.alert.id;
                    setHistory(prev => [msg.alert, ...prev.filter(a => a.id !== msg.alert.id)]);
                    break;
                case 'LOCATION_UPDATE':
                    console.log(`[POLICE WS ${et}] 📍 ${msg.lat?.toFixed(5)}, ${msg.lng?.toFixed(5)}`);
                    setActiveAlert(prev => {
                        if (!prev || prev.id !== msg.alert_id) return prev;
                        return { ...prev, lat: msg.lat, lng: msg.lng };
                    });
                    break;

                // Listen to BOTH grant message types
                case 'GRANT_POLICE_ACCESS':
                case 'POLICE_ACCESS_GRANTED':
                    console.log(`[POLICE WS ${et}] 🔓 GUARDIAN GRANTED ACCESS — Live feed unlocked!`);
                    accessGrantedRef.current = true;
                    setAccessGranted(true);
                    if (lastBufferedFrameRef.current) {
                        setLiveVideoFrame(lastBufferedFrameRef.current);
                    }
                    // Flush any audio chunks received while waiting for authorization
                    while (bufferedAudioBeforeGrantRef.current.length > 0) {
                        const b = bufferedAudioBeforeGrantRef.current.shift()!;
                        enqueueAudio(b.data, b.mime);
                    }
                    break;

                case 'AUDIO_CHUNK':
                    console.log(`[POLICE WS ${et}] 🎤 Audio chunk #${msg.seq} (${Math.round((msg.data?.length || 0) / 1024)} KB)`);
                    audioChunksRef.current.push({ data: msg.data, mime: msg.mime || 'audio/mp3', seq: msg.seq });
                    setAudioChunkCount(c => c + 1);
                    setAudioLevel(prev => [...prev.slice(-14), Math.min((msg.data?.length || 0) / 5000, 100)]);

                    // Auto-download as MP3 to browser Downloads folder on Web
                    triggerBrowserDownload(`data:${msg.mime || 'audio/mp3'};base64,${msg.data}`, `SheSafe_Police_Audio_${msg.seq}_${Date.now()}.mp3`);

                    // Auto-download incoming audio to police storage on Native
                    (async () => {
                        try {
                            const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
                            if (baseDir) {
                                const autoUri = `${baseDir}SheSafe_Police_Audio_${msg.seq}_${Date.now()}.mp3`;
                                await FileSystem.writeAsStringAsync(autoUri, msg.data, { encoding: FileSystem.EncodingType.Base64 });
                            }
                            setAutoSavedAudioCount(c => c + 1);
                        } catch (_) {}
                    })();

                    if (!accessGrantedRef.current) {
                        console.log(`[POLICE WS ${et}] ⏳ Pre-buffering audio chunk #${msg.seq} until guardian authorizes`);
                        bufferedAudioBeforeGrantRef.current.push({ data: msg.data, mime: msg.mime || 'audio/mp3', seq: msg.seq });
                    } else {
                        enqueueAudio(msg.data, msg.mime || 'audio/mp3');
                    }
                    break;

                case 'VIDEO_FRAME': {
                    console.log(`[POLICE WS ${et}] 📸 Video frame #${msg.seq} (${Math.round((msg.data?.length || 0) / 1024)} KB)`);
                    const cleanData = (msg.data || '').replace(/[\r\n\s]/g, '');
                    lastBufferedFrameRef.current = cleanData;
                    videoFramesRef.current = [...videoFramesRef.current.slice(-9), { data: cleanData, seq: msg.seq }];
                    if (accessGrantedRef.current) {
                        setLiveVideoFrame(cleanData);
                    }

                    // Auto-download to browser Downloads folder on Web
                    triggerBrowserDownload(`data:image/jpeg;base64,${cleanData}`, `SheSafe_Police_Photo_${msg.seq}_${Date.now()}.jpg`);

                    // Auto-download camera frames to police storage on Native
                    (async () => {
                        try {
                            const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
                            if (baseDir) {
                                const autoImgUri = `${baseDir}SheSafe_Police_Photo_${msg.seq}_${Date.now()}.jpg`;
                                await FileSystem.writeAsStringAsync(autoImgUri, cleanData, { encoding: FileSystem.EncodingType.Base64 });
                            }
                            setAutoSavedPhotoCount(c => c + 1);
                        } catch (_) {}
                    })();
                    break;
                }

                case 'ALERT_RESOLVED':
                    console.log(`[POLICE WS ${et}] ✅ Alert resolved - She is safe!`);
                    const resolvedName = msg.victim_name || (msg.alert && msg.alert.victim_name) || 'Priya Sharma';
                    setActiveAlert(null);
                    setSheIsSafeNotice({
                        visible: true,
                        victim_name: resolvedName,
                        time: new Date().toLocaleTimeString(),
                    });
                    if (msg.alert) {
                        setHistory(prev => prev.map(a => a.id === msg.alert!.id ? msg.alert! : a));
                    }
                    try { soundRef.current?.remove(); } catch (_) {}
                    soundRef.current = null;
                    audioQueue.current = [];
                    isPlaying.current = false;
                    setIsPlayingAudio(false);
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
        if (audioQueue.current.length === 0) {
            isPlaying.current = false;
            setIsPlayingAudio(false);
            return;
        }
        isPlaying.current = true;
        setIsPlayingAudio(true);
        const chunk = audioQueue.current.shift()!;

        // On web/browser, FileSystem.cacheDirectory is undefined - use HTML5 Audio data URI fallback
        if (Platform.OS === 'web' || !FileSystem.cacheDirectory) {
            try {
                const audioEl = new (window as any).Audio(`data:${chunk.mime || 'audio/m4a'};base64,${chunk.data}`);
                audioEl.volume = 1.0;
                audioEl.onended = () => { playNextAudio(); };
                audioEl.onerror = () => { playNextAudio(); };
                audioEl.play().catch(() => { playNextAudio(); });
                return;
            } catch (err) {
                console.warn('[POLICE WEB AUDIO FALLBACK FAILED]', err);
            }
        }

        try {
            if (soundRef.current) {
                try { soundRef.current.remove(); } catch (_) {}
                soundRef.current = null;
            }
            await setAudioModeAsync({ playsInSilentMode: true });
            const ext = chunk.mime?.includes('wav') ? '.wav' : chunk.mime?.includes('aac') ? '.aac' : '.m4a';
            const tmpUri = `${FileSystem.cacheDirectory}p_chunk_${Date.now()}${ext}`;
            await FileSystem.writeAsStringAsync(tmpUri, chunk.data, { encoding: FileSystem.EncodingType.Base64 });
            const player = createAudioPlayer(tmpUri);
            soundRef.current = player;
            console.log(`[POLICE AUDIO] 🔊 Playing chunk out loud`);
            player.play();

            // Safety timeout to ensure audio queue NEVER hangs even if player event doesn't fire
            let cleanedUp = false;
            const cleanupAndNext = () => {
                if (cleanedUp) return;
                cleanedUp = true;
                clearTimeout(safetyTimer);
                try { sub?.remove(); } catch (_) {}
                try { player?.remove(); } catch (_) {}
                if (soundRef.current === player) soundRef.current = null;
                FileSystem.deleteAsync(tmpUri, { idempotent: true }).catch(() => {});
                playNextAudio();
            };

            const safetyTimer = setTimeout(cleanupAndNext, 3200);

            const sub = player.addListener('playbackStatusUpdate', (s: any) => {
                if (s.didJustFinish || s.error || (!s.playing && s.currentTime > 0 && s.currentTime >= (s.duration || 1) - 0.1)) {
                    cleanupAndNext();
                }
            });
        } catch (e: any) {
            console.warn(`[POLICE AUDIO PLAY ERROR]`, e?.message);
            isPlaying.current = false;
            setIsPlayingAudio(false);
            if (audioQueue.current.length > 0) playNextAudio();
        }
    };

    const handleOfficerOverride = () => {
        Alert.alert(
            '⚡ Officer Emergency Override',
            'Under Exigent Powers (CrPC § 165 / Section 100), override guardian authorization to immediately unlock live camera and audio evidence?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Confirm Override & Unlock Feed',
                    style: 'destructive',
                    onPress: () => {
                        accessGrantedRef.current = true;
                        setAccessGranted(true);
                        // Also notify server and guardians
                        if (currentAlertId.current && wsRef.current) {
                            wsRef.current.sendRaw({
                                type: 'POLICE_ACCESS_GRANTED',
                                alert_id: currentAlertId.current,
                                override_by: user.name,
                            });
                        }
                        Alert.alert('🔓 Live Evidence Unlocked', 'Officer emergency override active. Live camera frames and audio are now streaming.');
                    },
                },
            ]
        );
    };

    const handleDispatchPatrol = () => {
        if (!activeAlert) return;
        setPatrolDispatched(true);
        wsRef.current?.sendRaw({
            type: 'ALERT_ACKNOWLEDGED',
            alert_id: activeAlert.id,
            eta_minutes: 3,
            officer_name: user.name || 'Patrol Unit 7',
        });
        Alert.alert(
            '🚔 Patrol Dispatched',
            `Patrol unit acknowledged emergency for ${activeAlert.victim_name}. ETA transmitted as 3 minutes to victim and guardians.`
        );
    };

    const openGoogleMaps = (lat: number, lng: number, name?: string) => {
        const label = encodeURIComponent(name || 'Victim Incident Location');
        const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&destination_place_id=${label}`;
        Linking.openURL(url).catch(() =>
            Linking.openURL(`geo:${lat},${lng}?q=${lat},${lng}(${label})`)
        );
    };

    const exportPDF = async () => {
        if (!activeAlert) {
            Alert.alert('No Active Incident', 'An active incident is required to generate an official report.');
            return;
        }
        await exportAlertPDF(activeAlert);
    };

    const exportAlertPDF = async (targetAlert: SheSafeAlert) => {
        setIsSaving(true);
        try {
            // Fetch all stored frames & audio from server evidence store
            let allFrames = videoFramesRef.current.map(f => f.data);
            let audCount = audioChunksRef.current.length;

            try {
                const res = await fetch(`${BACKEND_URL}/api/evidence/${targetAlert.id}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.video_frames && data.video_frames.length > 0) {
                        allFrames = data.video_frames.map((f: any) => f.data);
                    }
                    if (data.audio_chunks && data.audio_chunks.length > 0) {
                        audCount = data.audio_chunks.length;
                    }
                }
            } catch (_) {}

            const latestFrame = allFrames.length > 0 ? allFrames[allFrames.length - 1] : liveVideoFrame;

            await generateAndShareEvidencePDF({
                alert: targetAlert,
                frameBase64: latestFrame,
                framesBase64: allFrames,
                audioChunkCount: audCount || (targetAlert.status === 'resolved' ? 8 : 0),
                officerName: user.name || 'Officer Rajesh Kumar',
                stationName: 'Mangaluru Central Police Station',
            });
        } catch (e: any) {
            Alert.alert('PDF Export Error', e?.message || 'Could not compile evidence PDF.');
        } finally {
            setIsSaving(false);
        }
    };

    const downloadIncidentEvidence = async (targetAlert: SheSafeAlert) => {
        try {
            const res = await fetch(`${BACKEND_URL}/api/evidence/${targetAlert.id}`);
            if (res.ok) {
                const data = await res.json();
                let dlCount = 0;
                // Auto-download all audio chunks for this incident
                if (data.audio_chunks && data.audio_chunks.length > 0) {
                    data.audio_chunks.forEach((c: any) => {
                        if (c.data) {
                            triggerBrowserDownload(`data:audio/mp3;base64,${c.data}`, `SheSafe_${targetAlert.id}_Audio_${c.seq}.mp3`);
                            dlCount++;
                        }
                    });
                }
                // Auto-download all photo frames for this incident
                if (data.video_frames && data.video_frames.length > 0) {
                    data.video_frames.forEach((f: any) => {
                        if (f.data) {
                            triggerBrowserDownload(`data:image/jpeg;base64,${f.data}`, `SheSafe_${targetAlert.id}_Photo_${f.seq}.jpg`);
                            dlCount++;
                        }
                    });
                }
                Alert.alert('📥 Evidence Downloaded', `Successfully triggered download for ${dlCount} media files from incident ${targetAlert.id}.`);
            } else {
                Alert.alert('Evidence Notice', 'No additional raw recordings stored for this incident.');
            }
        } catch (e: any) {
            Alert.alert('Download Error', e?.message || 'Could not download incident files.');
        }
    };

    const exportAudio = async () => {
        const chunks = audioChunksRef.current;
        if (chunks.length === 0) {
            Alert.alert('No Audio Yet', 'Waiting for live audio chunks to arrive from victim device.');
            return;
        }
        setIsSaving(true);
        try {
            const lastAudio = chunks[chunks.length - 1]!;
            const ext = lastAudio.mime?.includes('wav') ? '.wav' : '.m4a';
            const tmpUri = `${FileSystem.cacheDirectory}SheSafe_Police_Audio_${Date.now()}${ext}`;
            await FileSystem.writeAsStringAsync(tmpUri, lastAudio.data, {
                encoding: FileSystem.EncodingType.Base64,
            });
            setIsSaving(false);
            const canShare = await Sharing.isAvailableAsync();
            if (canShare) {
                await Sharing.shareAsync(tmpUri, {
                    mimeType: ext === '.wav' ? 'audio/wav' : 'audio/m4a',
                    dialogTitle: 'Save SheSafe Audio Recording',
                });
            } else {
                Alert.alert('Audio Saved', `Audio recording cached at: ${tmpUri}`);
            }
        } catch (e: any) {
            setIsSaving(false);
            Alert.alert('Audio Export Failed', e?.message || 'Could not export audio.');
        }
    };

    const exportPhoto = async () => {
        const frames = videoFramesRef.current;
        const photoData = frames.length > 0 ? frames[frames.length - 1]!.data : liveVideoFrame;
        if (!photoData) {
            Alert.alert('No Photo Yet', 'Waiting for front-camera frames to arrive from victim device.');
            return;
        }
        setIsSaving(true);
        try {
            const tmpUri = `${FileSystem.cacheDirectory}SheSafe_Police_Photo_${Date.now()}.jpg`;
            await FileSystem.writeAsStringAsync(tmpUri, photoData, {
                encoding: FileSystem.EncodingType.Base64,
            });
            setIsSaving(false);
            const canShare = await Sharing.isAvailableAsync();
            if (canShare) {
                await Sharing.shareAsync(tmpUri, {
                    mimeType: 'image/jpeg',
                    dialogTitle: 'Save SheSafe Crime Scene Snapshot',
                });
            } else {
                Alert.alert('Photo Saved', `Camera snapshot cached at: ${tmpUri}`);
            }
        } catch (e: any) {
            setIsSaving(false);
            Alert.alert('Photo Export Failed', e?.message || 'Could not export photo.');
        }
    };

    const handleSaveEvidence = () => {
        Alert.alert(
            '📦 Official Police Evidence Dossier',
            'Select the evidentiary format to export directly to device storage or dispatch units:',
            [
                { text: '📄 Export Official FIR Report (PDF)', onPress: exportPDF },
                { text: '💾 Save Ambient Audio Stream (.wav)', onPress: exportAudio },
                { text: '📷 Save Scene Visual Snapshot (.jpg)', onPress: exportPhoto },
                { text: 'Cancel', style: 'cancel' },
            ]
        );
    };

    const handleLogout = async () => {
        Alert.alert('Sign Out', 'Sign out from Police Control Dashboard?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Sign Out',
                style: 'destructive',
                onPress: async () => {
                    wsRef.current?.disconnect();
                    await AsyncStorage.removeItem('shesafe_current_user');
                    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
                },
            },
        ]);
    };

    const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    const fmtCoords = (lat?: number | null, lng?: number | null) =>
        lat && lng ? `${lat.toFixed(5)}°N, ${lng.toFixed(5)}°E` : 'Acquiring GPS...';
    const fmtTime = (iso: string) =>
        new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const timeStr = currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" />

            {/* Header */}
            <Animated.View style={[styles.header, { opacity: fadeAnim }]}>
                <View>
                    <View style={styles.roleRow}>
                        <View style={styles.policeBadgeBox}>
                            <Text style={{ fontSize: 13 }}>👮</Text>
                        </View>
                        <Text style={styles.roleLabel}>POLICE CONTROL ROOM · EMERGENCY 112</Text>
                    </View>
                    <Text style={styles.userName}>{user.name}</Text>
                </View>
                <View style={styles.headerRight}>
                    <View style={[styles.connPill, connected ? styles.connOn : styles.connOff]}>
                        <Animated.View style={[styles.connDot, { opacity: connDot, backgroundColor: connected ? '#1D4ED8' : '#D97706' }]} />
                        <Text style={[styles.connText, { color: connected ? '#1E40AF' : '#92400E' }]}>
                            {connected ? 'Patrol Live' : 'Connecting...'}
                        </Text>
                    </View>
                    <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                        <Text style={{ fontSize: 15 }}>🚪</Text>
                    </TouchableOpacity>
                </View>
            </Animated.View>

            <View style={styles.clockBar}>
                <Text style={styles.clock}>{timeStr}</Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

                {activeAlert ? (
                    <View style={styles.alertCard}>
                        {/* Siren & Case Header */}
                        <LinearGradient colors={['#EFF6FF', '#DBEAFE']} style={styles.alertBanner}>
                            <View style={styles.sirenRow}>
                                <Animated.Text style={[styles.sirenEmoji, { opacity: sirenAnim }]}>🚨</Animated.Text>
                                <Text style={styles.sirenEmoji}>🚔</Text>
                                <Animated.Text style={[styles.sirenEmoji, { opacity: sirenAnim }]}>🚨</Animated.Text>
                            </View>
                            <Text style={styles.emergTitle}>CRITICAL INCIDENT ALERT</Text>
                            <Text style={styles.caseId}>Case #{activeAlert.id.slice(0, 18)} · Elapsed: {fmt(elapsed)}</Text>
                        </LinearGradient>

                        <View style={styles.cardBody}>
                            <View style={styles.webRow}>
                                {/* Left Column: Tactical Location & Dispatch Controls */}
                                <View style={styles.webColLeft}>
                                    {/* Victim Summary Card */}
                                    <View style={styles.victimCard}>
                                        <View style={styles.victimAvatar}>
                                            <Text style={{ fontSize: 24 }}>🚨</Text>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.victimName}>{activeAlert.victim_name}</Text>
                                            <Text style={styles.victimPhone}>📞 {activeAlert.victim_phone}</Text>
                                        </View>
                                        <View style={styles.priorityBadge}>
                                            <Text style={styles.priorityText}>PRIORITY 1</Text>
                                        </View>
                                    </View>

                                    {/* Quick Response Patrol Actions */}
                                    <View style={styles.mobileActionRow}>
                                        {!patrolDispatched ? (
                                            <TouchableOpacity
                                                style={styles.dispatchBtn}
                                                onPress={handleDispatchPatrol}
                                                activeOpacity={0.85}
                                            >
                                                <LinearGradient colors={['#DC2626', '#B91C1C']} style={styles.dispatchBtnInner}>
                                                    <Text style={styles.dispatchBtnText}>🚔 DISPATCH PATROL (ACKNOWLEDGE 3-MIN ETA)</Text>
                                                </LinearGradient>
                                            </TouchableOpacity>
                                        ) : (
                                            <View style={styles.dispatchedBadge}>
                                                <Text style={styles.dispatchedText}>✅ PATROL DISPATCHED · ETA 3 MIN ACKNOWLEDGED</Text>
                                            </View>
                                        )}

                                        <TouchableOpacity
                                            style={styles.callVictimBtn}
                                            onPress={() => Linking.openURL(`tel:${activeAlert.victim_phone || '112'}`)}
                                            activeOpacity={0.85}
                                        >
                                            <Text style={styles.callVictimText}>📞 Call Victim Immediately</Text>
                                        </TouchableOpacity>
                                    </View>

                                    {/* Evidence Auto-Download Indicator */}
                                    {(autoSavedAudioCount > 0 || autoSavedPhotoCount > 0) && (
                                        <View style={styles.autoDownloadBadge}>
                                            <Text style={styles.autoDownloadText}>
                                                💾 Auto-Saved Evidence to Police Storage: {autoSavedAudioCount} Audio Chunks · {autoSavedPhotoCount} Camera Frames
                                            </Text>
                                        </View>
                                    )}

                                    {/* ── INCIDENT MAP VIEW (Tactical Control) ── */}
                                    <View style={styles.sectionTitleRow}>
                                        <View style={[styles.sectionIndicator, { backgroundColor: '#1D4ED8' }]} />
                                        <Text style={styles.sectionTitle}>TACTICAL INCIDENT LOCATION — MAP VIEW</Text>
                                    </View>

                                    {activeAlert.lat && activeAlert.lng ? (
                                        <View style={styles.mapWrapper}>
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
                                                    scrollEnabled={true}
                                                    zoomEnabled={true}
                                                >
                                                    <Marker
                                                        coordinate={{ latitude: activeAlert.lat, longitude: activeAlert.lng }}
                                                        title={activeAlert.victim_name}
                                                        description={activeAlert.address || 'Incident Scene'}
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
                                                activeOpacity={0.85}
                                            >
                                                <LinearGradient colors={['#1D4ED8', '#2563EB']} style={styles.directionsInner}>
                                                    <Text style={styles.directionsBtnText}>🗺️ Open Full Tactical Route in Google Maps</Text>
                                                </LinearGradient>
                                            </TouchableOpacity>
                                            <Text style={styles.addrText}>📌 {activeAlert.address || 'Near Mangaluru Central'}</Text>
                                        </View>
                                    ) : (
                                        <View style={styles.locFallback}>
                                            <Text style={{ fontSize: 24 }}>📍</Text>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.locFallbackLabel}>VICTIM LOCATION</Text>
                                                <Text style={styles.locFallbackCoords}>{fmtCoords(activeAlert.lat, activeAlert.lng)}</Text>
                                                <Text style={styles.addrText}>{activeAlert.address || 'Acquiring GPS fix...'}</Text>
                                            </View>
                                            <Animated.Text style={{ opacity: sirenAnim }}>🔴</Animated.Text>
                                        </View>
                                    )}
                                </View>

                                {/* Right Column: Live Video/Audio Streams & Exigent Controls */}
                                <View style={styles.webColRight}>
                                    {/* ── GUARDIAN CONSENT / EMERGENCY OVERRIDE GATE ── */}
                                    {!accessGranted ? (
                                        <View style={styles.awaitingBox}>
                                            <View style={styles.awaitingTop}>
                                                <Text style={{ fontSize: 32 }}>🔒</Text>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={styles.awaitingTitle}>AWAITING GUARDIAN AUTHORIZATION</Text>
                                                    <Text style={styles.awaitingSub}>
                                                        Privacy protocols require guardian consent before streaming live audio/video.
                                                    </Text>
                                                </View>
                                            </View>
                                            <TouchableOpacity
                                                style={styles.overrideBtn}
                                                onPress={handleOfficerOverride}
                                                activeOpacity={0.85}
                                            >
                                                <LinearGradient colors={['#DC2626', '#B91C1C']} style={styles.overrideInner}>
                                                    <Text style={styles.overrideText}>⚡ OFFICER EMERGENCY OVERRIDE (CRITICAL THREAT)</Text>
                                                </LinearGradient>
                                            </TouchableOpacity>
                                        </View>
                                    ) : (
                                        <>
                                            <View style={styles.accessBadge}>
                                                <Text style={styles.accessBadgeText}>🔓 Authorized — Live Evidence Feed Active</Text>
                                            </View>

                                            {/* ── LIVE FRONT CAMERA ── */}
                                            <View style={styles.sectionTitleRow}>
                                                <Animated.View style={[styles.sectionIndicator, { opacity: sirenAnim, backgroundColor: '#DC2626' }]} />
                                                <Text style={styles.sectionTitle}>LIVE FRONT CAMERA EVIDENCE</Text>
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
                                                                <Animated.View style={[styles.liveDot, { opacity: sirenAnim, backgroundColor: '#FFFFFF' }]} />
                                                                <Text style={styles.recChipText}>🔴 LIVE EVIDENCE</Text>
                                                            </View>
                                                            <View style={styles.camBadge}>
                                                                <Text style={styles.camBadgeText}>Attacker Face Cam</Text>
                                                            </View>
                                                        </View>
                                                    </>
                                                ) : (
                                                    <View style={styles.videoPlaceholder}>
                                                        <Animated.Text style={{ fontSize: 32, opacity: sirenAnim }}>📷</Animated.Text>
                                                        <Text style={styles.vpText}>Awaiting camera frame...</Text>
                                                        <Text style={styles.vpSub}>Front camera captures every 3 seconds</Text>
                                                    </View>
                                                )}
                                            </View>

                                            {/* ── LIVE AUDIO ── */}
                                            <View style={styles.sectionTitleRow}>
                                                <Animated.View style={[styles.sectionIndicator, { opacity: sirenAnim, backgroundColor: '#1D4ED8' }]} />
                                                <Text style={[styles.sectionTitle, { color: '#1D4ED8' }]}>
                                                    LIVE AMBIENT AUDIO ({audioChunkCount} CHUNKS)
                                                </Text>
                                            </View>

                                            <View style={styles.audioBox}>
                                                <View style={styles.audioTop}>
                                                    <View style={styles.policeAudioIcon}>
                                                        <Text style={{ fontSize: 16 }}>🎤</Text>
                                                    </View>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={styles.audioTitle}>
                                                            {isPlayingAudio ? '🔊 Playing Live Ambient Stream...' : 'Audio Feed Connected'}
                                                        </Text>
                                                        <Text style={styles.audioSub}>Auto-plays incoming evidence audio stream out loud</Text>
                                                    </View>
                                                </View>
                                                <View style={styles.eqRow}>
                                                    {(audioLevel.length > 0 ? audioLevel : Array(16).fill(10)).map((h, i) => (
                                                        <Animated.View
                                                            key={i}
                                                            style={[
                                                                styles.eqBar,
                                                                {
                                                                    height: Math.max(5, h * 0.38),
                                                                    backgroundColor: '#1D4ED8',
                                                                    opacity: audioChunkCount > 0 ? (i % 2 === 0 ? sirenAnim : 1) : 0.3,
                                                                },
                                                            ]}
                                                        />
                                                    ))}
                                                </View>
                                            </View>

                                            {/* Save Evidence */}
                                            <TouchableOpacity
                                                style={styles.saveBtn}
                                                onPress={handleSaveEvidence}
                                                disabled={isSaving}
                                                activeOpacity={0.85}
                                            >
                                                <LinearGradient colors={['#059669', '#10B981']} style={styles.btnInner}>
                                                    <Text style={styles.btnText}>
                                                        {isSaving ? '⏳ Exporting...' : '💾 Export Official Police Evidence Dossier'}
                                                    </Text>
                                                </LinearGradient>
                                            </TouchableOpacity>
                                        </>
                                    )}
                                </View>
                            </View>
                        </View>
                    </View>
                ) : (
                    <>
                        {sheIsSafeNotice ? (
                            <View style={styles.sheSafeCard}>
                                <View style={styles.sheSafeTop}>
                                    <View style={styles.sheSafeBadge}>
                                        <Text style={{ fontSize: 24 }}>✅</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.sheSafeTitle}>INCIDENT RESOLVED — SHE IS SAFE</Text>
                                        <Text style={styles.sheSafeSub}>
                                            {sheIsSafeNotice.victim_name} confirmed safety via PIN verification. Emergency alerts, sirens, and live evidence feeds have been safely stood down.
                                        </Text>
                                    </View>
                                </View>
                                <View style={styles.sheSafeDetails}>
                                    <Text style={styles.sheSafeTimeText}>
                                        ⏱ Resolved at {sheIsSafeNotice.time} · Logged in Incident Dispatch Archive
                                    </Text>
                                    <TouchableOpacity
                                        style={styles.dismissNoticeBtn}
                                        onPress={() => setSheIsSafeNotice(null)}
                                    >
                                        <Text style={styles.dismissNoticeText}>Dismiss</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ) : (
                            <View style={styles.safeCard}>
                                <View style={styles.safeShieldCircle}>
                                    <Text style={styles.safeEmoji}>🛡️</Text>
                                </View>
                                <Text style={styles.safeTitle}>PATROL MONITORING NORMAL</Text>
                                <Text style={styles.safeText}>
                                    No emergency SOS incidents flagged. Control room standing by for priority dispatch.
                                </Text>
                                <View style={[styles.connPill, connected ? styles.connOn : styles.connOff, { alignSelf: 'center', marginTop: Spacing.sm }]}>
                                    <Animated.View style={[styles.connDot, { opacity: connDot, backgroundColor: connected ? '#1D4ED8' : '#D97706' }]} />
                                    <Text style={[styles.connText, { color: connected ? '#1E40AF' : '#92400E' }]}>
                                        {connected ? 'Police Realtime Bridge Online' : 'Connecting...'}
                                    </Text>
                                </View>
                            </View>
                        )}

                        {/* Evidence Auto-Download Indicator */}
                        {(autoSavedAudioCount > 0 || autoSavedPhotoCount > 0) && (
                            <View style={styles.autoDownloadBadge}>
                                <Text style={styles.autoDownloadText}>
                                    💾 Auto-Saved Evidence Archive: {autoSavedAudioCount} Audio Chunks · {autoSavedPhotoCount} Camera Frames
                                </Text>
                            </View>
                        )}
                    </>
                )}

                {/* History Section */}
                {history.length > 0 && (
                    <View style={styles.historySection}>
                        <Text style={styles.historyTitle}>📋 Incident Dispatch Archive</Text>
                        {history.map(a => (
                            <View key={a.id} style={styles.histCard}>
                                <Text style={{ fontSize: 20 }}>{a.status === 'active' ? '🔴' : '✅'}</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.histName}>{a.victim_name}</Text>
                                    <Text style={styles.histTime}>{fmtTime(a.triggered_at)}</Text>
                                    {a.lat && a.lng && (
                                        <TouchableOpacity onPress={() => openGoogleMaps(a.lat!, a.lng!, a.victim_name)}>
                                            <Text style={styles.histMapLink}>📍 {fmtCoords(a.lat, a.lng)}</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                                    <View style={[styles.histStatus, { backgroundColor: a.status === 'active' ? '#FEE2E2' : '#DCFCE7' }]}>
                                        <Text style={[styles.histStatusText, { color: a.status === 'active' ? '#DC2626' : '#16A34A' }]}>
                                            {a.status.toUpperCase()}
                                        </Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', gap: 6 }}>
                                        <TouchableOpacity
                                            style={styles.histPdfBtn}
                                            onPress={() => exportAlertPDF(a)}
                                        >
                                            <Text style={styles.histPdfBtnText}>📄 PDF Report</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.histPdfBtn, { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' }]}
                                            onPress={() => downloadIncidentEvidence(a)}
                                        >
                                            <Text style={[styles.histPdfBtnText, { color: '#16A34A' }]}>💾 Download Evidence</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        ))}
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.xxl + 8,
        paddingBottom: Spacing.sm,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
    },
    roleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
    policeBadgeBox: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: '#DBEAFE',
        alignItems: 'center',
        justifyContent: 'center',
    },
    roleLabel: { fontSize: FontSizes.xs, color: '#1D4ED8', fontWeight: '800', letterSpacing: 1.5 },
    userName: { fontSize: FontSizes.xl, fontWeight: '800', color: '#0F172A' },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    connPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
        borderRadius: BorderRadius.full,
        paddingVertical: 5,
        paddingHorizontal: Spacing.sm,
        borderWidth: 1,
    },
    connOn:  { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
    connOff: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
    connDot: { width: 7, height: 7, borderRadius: 3.5 },
    connText: { fontSize: FontSizes.xs, fontWeight: '700' },
    logoutBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    clockBar: {
        backgroundColor: '#FFFFFF',
        paddingVertical: 4,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    clock: {
        fontSize: FontSizes.sm,
        fontWeight: '600',
        color: '#64748B',
        letterSpacing: 2,
        textAlign: 'center',
        fontVariant: ['tabular-nums'],
    },
    scroll: {
        padding: Spacing.lg,
        paddingBottom: Spacing.xxl + 20,
        gap: Spacing.lg,
        maxWidth: 1600,
        width: '100%',
        alignSelf: 'center',
    },
    alertCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: BorderRadius.xl,
        overflow: 'hidden',
        borderWidth: 1.5,
        borderColor: '#93C5FD',
        shadowColor: '#1E3A8A',
        shadowOpacity: 0.12,
        shadowRadius: 20,
        elevation: 6,
    },
    alertBanner: {
        paddingVertical: Spacing.lg,
        paddingHorizontal: Spacing.xl,
        borderBottomWidth: 1.5,
        borderBottomColor: '#BFDBFE',
        alignItems: 'center',
    },
    sirenRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 4 },
    sirenEmoji: { fontSize: 26 },
    emergTitle: { fontSize: FontSizes.lg, fontWeight: '900', color: '#1E3A8A', letterSpacing: 1 },
    caseId: { fontSize: FontSizes.xs, color: '#3B82F6', fontWeight: '600', marginTop: 2 },
    cardBody: { padding: Spacing.md, gap: Spacing.md },
    victimCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        backgroundColor: '#F8FAFC',
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    victimAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#DBEAFE',
        alignItems: 'center',
        justifyContent: 'center',
    },
    victimName: { fontSize: FontSizes.md, fontWeight: '800', color: '#0F172A' },
    victimPhone: { fontSize: FontSizes.xs, color: '#64748B', fontWeight: '500', marginTop: 2 },
    priorityBadge: {
        backgroundColor: '#FEE2E2',
        borderRadius: BorderRadius.sm,
        paddingVertical: 3,
        paddingHorizontal: 8,
    },
    priorityText: { fontSize: 10, fontWeight: '800', color: '#DC2626' },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    sectionIndicator: { width: 8, height: 8, borderRadius: 4 },
    sectionTitle: { fontSize: FontSizes.xs, fontWeight: '800', color: '#0F172A', letterSpacing: 1 },
    mapWrapper: { gap: 8 },
    mapContainer: {
        borderRadius: BorderRadius.lg,
        overflow: 'hidden',
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
        height: Platform.OS === 'web' ? 340 : 190,
        position: 'relative',
    },
    map: { width: '100%', height: '100%' },
    mapOverlay: {
        position: 'absolute',
        bottom: 8,
        left: 8,
        right: 8,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        borderRadius: 8,
        paddingVertical: 4,
        paddingHorizontal: 8,
    },
    mapCoords: { color: '#FFFFFF', fontSize: FontSizes.xs, fontWeight: '600' },
    directionsBtn: { borderRadius: BorderRadius.md, overflow: 'hidden' },
    directionsInner: { paddingVertical: Spacing.sm, alignItems: 'center' },
    directionsBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: FontSizes.sm },
    addrText: { fontSize: FontSizes.xs, color: '#64748B', paddingHorizontal: 2 },
    locFallback: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
        backgroundColor: '#F1F5F9',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    locFallbackLabel: { fontSize: 11, fontWeight: '800', color: '#64748B' },
    locFallbackCoords: { fontSize: FontSizes.sm, fontWeight: '700', color: '#0F172A' },
    awaitingBox: {
        backgroundColor: '#FFFBEB',
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        borderWidth: 1,
        borderColor: '#FDE68A',
        gap: Spacing.sm,
    },
    awaitingTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    awaitingTitle: { fontSize: FontSizes.xs, fontWeight: '800', color: '#92400E', letterSpacing: 0.5 },
    awaitingSub: { fontSize: FontSizes.xs, color: '#B45309', marginTop: 2, lineHeight: 16 },
    overrideBtn: { borderRadius: BorderRadius.md, overflow: 'hidden', marginTop: 4 },
    overrideInner: { paddingVertical: Spacing.sm + 2, alignItems: 'center' },
    overrideText: { color: '#FFFFFF', fontSize: FontSizes.xs, fontWeight: '800', letterSpacing: 0.5 },
    accessBadge: {
        backgroundColor: '#ECFDF5',
        borderRadius: BorderRadius.lg,
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.md,
        borderWidth: 1,
        borderColor: '#A7F3D0',
        alignItems: 'center',
    },
    accessBadgeText: { color: '#059669', fontSize: FontSizes.xs, fontWeight: '800' },
    videoBox: {
        borderRadius: BorderRadius.lg,
        overflow: 'hidden',
        borderWidth: 1.5,
        borderColor: '#CBD5E1',
        height: Platform.OS === 'web' ? 320 : 210,
        backgroundColor: '#0F172A',
    },
    videoImage: { width: '100%', height: '100%' },
    videoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
    vpText: { color: '#F8FAFC', fontSize: FontSizes.sm, fontWeight: '700' },
    vpSub: { color: '#94A3B8', fontSize: FontSizes.xs },
    videoOverlay: {
        position: 'absolute',
        top: 8,
        left: 8,
        right: 8,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    liveRecChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: '#DC2626',
        borderRadius: BorderRadius.full,
        paddingVertical: 3,
        paddingHorizontal: 8,
    },
    recChipText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
    camBadge: {
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        borderRadius: BorderRadius.full,
        paddingVertical: 3,
        paddingHorizontal: 8,
    },
    camBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '600' },
    audioBox: {
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        backgroundColor: '#EFF6FF',
        borderWidth: 1,
        borderColor: '#BFDBFE',
        gap: Spacing.sm,
    },
    audioTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    policeAudioIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#DBEAFE',
        alignItems: 'center',
        justifyContent: 'center',
    },
    audioTitle: { fontSize: FontSizes.xs, color: '#1D4ED8', fontWeight: '800' },
    audioSub: { fontSize: FontSizes.xs, color: '#64748B' },
    eqRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        height: 34,
        paddingHorizontal: 4,
    },
    eqBar: { width: 4.5, borderRadius: 2, minHeight: 4 },
    saveBtn: { borderRadius: BorderRadius.lg, overflow: 'hidden' },
    btnInner: { paddingVertical: Spacing.md, alignItems: 'center' },
    btnText: { color: '#FFFFFF', fontSize: FontSizes.sm, fontWeight: '700' },
    safeCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: BorderRadius.xl,
        padding: Spacing.xxl,
        alignItems: 'center',
        gap: Spacing.sm,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#0F172A',
        shadowOpacity: 0.05,
        shadowRadius: 12,
        elevation: 2,
    },
    safeShieldCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#EFF6FF',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: Spacing.xs,
    },
    safeEmoji: { fontSize: 44 },
    safeTitle: { fontSize: FontSizes.xl, fontWeight: '900', color: '#1D4ED8', letterSpacing: 1.5 },
    safeText: { fontSize: FontSizes.sm, color: '#64748B', textAlign: 'center', lineHeight: 20 },
    historySection: { gap: Spacing.sm, marginTop: Spacing.xs },
    historyTitle: { fontSize: FontSizes.md, fontWeight: '800', color: '#0F172A' },
    histCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        backgroundColor: '#FFFFFF',
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    histName: { color: '#0F172A', fontSize: FontSizes.sm, fontWeight: '700' },
    histTime: { color: '#64748B', fontSize: FontSizes.xs },
    histMapLink: { color: '#1D4ED8', fontSize: FontSizes.xs, marginTop: 2, fontWeight: '600' },
    histStatus: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: BorderRadius.xs },
    histStatusText: { fontSize: 10, fontWeight: '800' },
    histPdfBtn: {
        backgroundColor: '#EFF6FF',
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: BorderRadius.xs,
        borderWidth: 1,
        borderColor: '#BFDBFE',
    },
    histPdfBtnText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#1D4ED8',
    },
    liveDot: { width: 6, height: 6, borderRadius: 3 },
    mobileActionRow: { gap: 8, marginTop: 4 },
    dispatchBtn: { borderRadius: BorderRadius.md, overflow: 'hidden' },
    dispatchBtnInner: { paddingVertical: Spacing.md, alignItems: 'center', borderRadius: BorderRadius.md },
    dispatchBtnText: { color: '#FFFFFF', fontSize: FontSizes.xs, fontWeight: '900', letterSpacing: 0.5 },
    dispatchedBadge: {
        backgroundColor: '#DCFCE7',
        borderRadius: BorderRadius.md,
        paddingVertical: Spacing.md,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#86EFAC',
    },
    dispatchedText: { color: '#15803D', fontSize: FontSizes.xs, fontWeight: '800' },
    callVictimBtn: {
        backgroundColor: '#F1F5F9',
        borderRadius: BorderRadius.md,
        paddingVertical: Spacing.sm + 2,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#CBD5E1',
    },
    callVictimText: { color: '#334155', fontSize: FontSizes.sm, fontWeight: '700' },
    autoDownloadBadge: {
        backgroundColor: '#EFF6FF',
        borderRadius: BorderRadius.md,
        paddingVertical: 8,
        paddingHorizontal: Spacing.md,
        borderWidth: 1,
        borderColor: '#BFDBFE',
        alignItems: 'center',
    },
    autoDownloadText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#1D4ED8',
    },
    sheSafeCard: {
        backgroundColor: '#F0FDF4',
        borderRadius: BorderRadius.xl,
        padding: Spacing.lg,
        borderWidth: 2,
        borderColor: '#86EFAC',
        gap: Spacing.sm,
        shadowColor: '#16A34A',
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 3,
    },
    sheSafeTop: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
    },
    sheSafeBadge: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#DCFCE7',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: '#4ADE80',
    },
    sheSafeTitle: {
        fontSize: FontSizes.md,
        fontWeight: '900',
        color: '#15803D',
        letterSpacing: 0.5,
    },
    sheSafeSub: {
        fontSize: FontSizes.xs,
        color: '#166534',
        marginTop: 2,
        lineHeight: 16,
    },
    sheSafeDetails: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: '#BBF7D0',
        paddingTop: Spacing.sm,
        marginTop: 4,
    },
    sheSafeTimeText: {
        fontSize: 11,
        color: '#15803D',
        fontWeight: '600',
        flex: 1,
    },
    dismissNoticeBtn: {
        backgroundColor: '#DCFCE7',
        paddingVertical: 5,
        paddingHorizontal: 12,
        borderRadius: BorderRadius.full,
        borderWidth: 1,
        borderColor: '#86EFAC',
    },
    dismissNoticeText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#166534',
    },
    webRow: {
        flexDirection: Platform.OS === 'web' ? 'row' : 'column',
        gap: 20,
    },
    webColLeft: {
        flex: Platform.OS === 'web' ? 1.2 : 1,
        gap: Spacing.md,
    },
    webColRight: {
        flex: Platform.OS === 'web' ? 1 : 1,
        gap: Spacing.md,
    },
});
