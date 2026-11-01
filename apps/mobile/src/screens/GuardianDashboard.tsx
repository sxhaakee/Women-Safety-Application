import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet,
    ScrollView, Animated, StatusBar, Alert, Image, Linking, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { createAudioPlayer, setAudioModeAsync, AudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from '../components/SafeMapView';
import { Colors, Spacing, FontSizes, BorderRadius } from '../theme';
import {
    SheSafeUser, SheSafeAlert, SheSafeWS,
    getActiveAlerts, getAllAlerts, resolveAlert,
    getActiveSafeWalk, getActiveCabRide, getCommunityHazards,
    BACKEND_URL,
} from '../utils/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateAndShareEvidencePDF } from '../utils/evidencePdf';

async function saveOrShareFile(dataUriOrBase64: string, filename: string, mimeType: string, isUrl = false, shouldShare = true): Promise<boolean> {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
        try {
            let downloadHref = dataUriOrBase64;
            if (isUrl) {
                try {
                    const response = await fetch(dataUriOrBase64);
                    const blob = await response.blob();
                    downloadHref = URL.createObjectURL(blob);
                } catch (_) {
                    window.open(dataUriOrBase64, '_blank');
                    return true;
                }
            } else if (!dataUriOrBase64.startsWith('data:')) {
                downloadHref = `data:${mimeType};base64,${dataUriOrBase64}`;
            }
            const a = document.createElement('a');
            a.href = downloadHref;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            if (downloadHref.startsWith('blob:')) {
                setTimeout(() => URL.revokeObjectURL(downloadHref), 15000);
            }
            return true;
        } catch (e) {
            console.warn('[WEB SAVE ERROR]', e);
            return false;
        }
    } else {
        // Native mobile (iOS & Android)
        try {
            const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
            const targetUri = `${baseDir}${filename}`;
            if (isUrl) {
                await FileSystem.downloadAsync(dataUriOrBase64, targetUri);
            } else {
                const b64 = dataUriOrBase64.includes(',') ? dataUriOrBase64.split(',')[1] : dataUriOrBase64;
                await FileSystem.writeAsStringAsync(targetUri, b64, { encoding: FileSystem.EncodingType.Base64 });
            }
            if (shouldShare && await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(targetUri, { mimeType, dialogTitle: `Save ${filename}` });
            }
            return true;
        } catch (e) {
            console.warn('[NATIVE SAVE ERROR]', e);
            return false;
        }
    }
}

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
    const [isPlayingAudio, setIsPlayingAudio]   = useState(false);
    const [escalationLevel, setEscalationLevel] = useState<number>(0);
    const [volunteerStatus, setVolunteerStatus] = useState<string | null>(null);
    const [actionNotice, setActionNotice]       = useState<{ title: string; message: string; type: 'police' | 'volunteer'; timestamp: string } | null>(null);

    // Live Telemetry states for Safe Walk, Cab Guardian & Community Hazard Map
    const [activeSafeWalk, setActiveSafeWalk]         = useState<any | null>(null);
    const [activeCabRide, setActiveCabRide]           = useState<any | null>(null);
    const [communityHazards, setCommunityHazards]     = useState<any[]>([]);
    const [sheIsSafeNotice, setSheIsSafeNotice]       = useState<{ visible: boolean; victim_name: string; time: string } | null>(null);
    const [autoSavedAudioCount, setAutoSavedAudioCount] = useState<number>(0);
    const [autoSavedPhotoCount, setAutoSavedPhotoCount] = useState<number>(0);

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
        Animated.timing(alertBlink, { toValue: 0.25, duration: 700, useNativeDriver: true }),
        Animated.timing(alertBlink, { toValue: 1,    duration: 700, useNativeDriver: true }),
    ])).start();

    const startElapsed = () => {
        clearInterval(elapsedRef.current);
        setElapsed(0);
        elapsedRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    };

    const loadAlerts = async () => {
        const [active, all, walk, ride, haz] = await Promise.all([
            getActiveAlerts(),
            getAllAlerts(),
            getActiveSafeWalk(),
            getActiveCabRide(),
            getCommunityHazards(),
        ]);
        if (active.length > 0) {
            setActiveAlert(prev => {
                if (!prev) return active[0];
                if (prev.id !== active[0].id) {
                    return active[0];
                }
                return prev;
            });
            setSheIsSafeNotice(null);
        } else {
            // When no active alerts exist on backend / DB, clear activeAlert immediately
            setActiveAlert(null);
        }
        setHistory(prev => {
            const map = new Map<string, SheSafeAlert>();
            all.forEach(item => { if (item?.id) map.set(item.id, item); });
            prev.forEach(item => {
                if (item?.id) {
                    const existing = map.get(item.id);
                    if (!existing || (item.status === 'resolved' && existing.status !== 'resolved')) {
                        map.set(item.id, { ...existing, ...item });
                    }
                }
            });
            return Array.from(map.values()).sort((a, b) => {
                const tA = new Date(a.triggered_at || a.created_at || 0).getTime();
                const tB = new Date(b.triggered_at || b.created_at || 0).getTime();
                return tB - tA;
            });
        });
        if (walk) {
            setActiveSafeWalk(walk);
        }
        if (ride) {
            setActiveCabRide(ride);
        }
        if (haz && haz.length > 0) setCommunityHazards(haz);
    };

    const connectWS = () => {
        const ws = new SheSafeWS('guardian', (msg: any) => {
            const et = new Date().toLocaleTimeString();
            switch (msg.type) {
                case 'REGISTERED':
                    setConnected(true);
                    console.log(`[GUARDIAN WS ${et}] ✅ GUARDIAN REGISTERED`);
                    break;
                case 'ALERT_ACTIVE':
                case 'ALERT_FIRED':
                    console.log(`[GUARDIAN WS ${et}] 🚨 SOS: ${msg.alert?.victim_name}`);
                    setActiveAlert(msg.alert);
                    setSheIsSafeNotice(null);
                    currentAlertId.current = msg.alert?.id;
                    setHistory(prev => [msg.alert, ...prev.filter(a => a.id !== msg.alert?.id)]);
                    break;
                case 'LOCATION_UPDATE':
                    console.log(`[GUARDIAN WS ${et}] 📍 ${msg.lat?.toFixed(5)}, ${msg.lng?.toFixed(5)}`);
                    setActiveAlert(prev => {
                        if (!prev || prev.id !== msg.alert_id) return prev;
                        return { ...prev, lat: msg.lat, lng: msg.lng };
                    });
                    break;
                case 'ESCALATION_UPDATE':
                    console.log(`[GUARDIAN WS ${et}] ⚠️ ESCALATION LEVEL: ${msg.level} — ${msg.message}`);
                    setEscalationLevel(msg.level || 1);
                    break;
                case 'VOLUNTEER_STATUS': {
                    console.log(`[GUARDIAN WS ${et}] 🙋 VOLUNTEER UPDATE: ${msg.status}`);
                    const statusText = msg.status === 'arrived'
                        ? '🛡️ Community Rakshak HAS ARRIVED AT SCENE to protect victim'
                        : msg.status === 'accepted'
                        ? 'Nearby Rakshak Volunteer Accepted & En Route'
                        : msg.status;
                    setVolunteerStatus(statusText);
                    if (msg.status === 'accepted' || msg.status === 'arrived') {
                        setActionNotice({
                            title: msg.status === 'arrived' ? '🛡️ Rakshak Arrived on Scene!' : '🙋 Nearby Volunteer Responding',
                            message: msg.status === 'arrived'
                                ? 'A verified Community Rakshak volunteer is physically with her now to ensure safety.'
                                : 'A nearby registered Rakshak has accepted the alert and is rushing to her location.',
                            type: 'volunteer',
                            timestamp: new Date().toLocaleTimeString(),
                        });
                        Alert.alert(
                            msg.status === 'arrived' ? '🛡️ Rakshak Volunteer Arrived' : '🙋 Volunteer En Route',
                            msg.status === 'arrived'
                                ? 'A verified Community Rakshak has reached her location and is securing the area.'
                                : 'A nearby verified volunteer accepted the SOS alert and is en route.'
                        );
                    }
                    break;
                }
                case 'ALERT_ACKNOWLEDGED': {
                    console.log(`[GUARDIAN WS ${et}] 👮 POLICE ACKNOWLEDGED: ETA ${msg.eta_minutes || 3} min by ${msg.officer_name}`);
                    setActionNotice({
                        title: '🚔 Police Dispatched & En Route!',
                        message: `${msg.officer_name || 'Control Room Officer'} has acknowledged the SOS. Police Patrol dispatched with ETA ~${msg.eta_minutes || 3} minutes.`,
                        type: 'police',
                        timestamp: new Date().toLocaleTimeString(),
                    });
                    Alert.alert(
                        '🚔 Police Dispatched!',
                        `${msg.officer_name || 'Officer'} from Control Room acknowledged the emergency. Patrol unit is en route with an estimated ETA of ${msg.eta_minutes || 3} minutes.`
                    );
                    break;
                }
                case 'AUDIO_CHUNK':
                    console.log(`[GUARDIAN WS ${et}] 🎤 Audio chunk #${msg.seq} (${Math.round((msg.data?.length || 0) / 1024)} KB)`);
                    audioChunksRef.current.push({ data: msg.data, mime: msg.mime || 'audio/mp3', seq: msg.seq });
                    setAudioChunkCount(c => c + 1);
                    setAudioLevel(prev => [...prev.slice(-14), Math.min(msg.data.length / 5000, 100)]);
                    // DO NOT auto-download live chunks — user downloads via button press on history card
                    enqueueAudio(msg.data, msg.mime || 'audio/mp3');
                    break;

                case 'VIDEO_FRAME': {
                    console.log(`[GUARDIAN WS ${et}] 📸 Video frame #${msg.seq} (${Math.round((msg.data?.length || 0) / 1024)} KB)`);
                    const cleanData = (msg.data || '').replace(/[\r\n\s]/g, '');
                    videoFramesRef.current = [...videoFramesRef.current.slice(-9), { data: cleanData, seq: msg.seq }];
                    setLiveVideoFrame(cleanData);
                    // DO NOT auto-download live frames — user downloads via button press on history card
                    break;
                }

                case 'SAFE_WALK_UPDATE':
                    console.log(`[GUARDIAN WS ${et}] 🚶 Safe walk update`);
                    setActiveSafeWalk(msg.walk);
                    break;
                case 'SAFE_WALK_END':
                    console.log(`[GUARDIAN WS ${et}] 🚶 Safe walk completed`);
                    setActiveSafeWalk(null);
                    break;
                case 'CAB_GUARDIAN_UPDATE':
                    console.log(`[GUARDIAN WS ${et}] 🚕 Cab ride update`);
                    setActiveCabRide(msg.ride);
                    break;
                case 'CAB_GUARDIAN_END':
                    console.log(`[GUARDIAN WS ${et}] 🚕 Cab ride ended`);
                    setActiveCabRide(null);
                    break;
                case 'HAZARD_UPDATE':
                    console.log(`[GUARDIAN WS ${et}] ⚠️ Hazards sync (${msg.hazards?.length} points)`);
                    setCommunityHazards(msg.hazards || []);
                    break;

                case 'ALERT_RESOLVED':
                    console.log(`[GUARDIAN WS ${et}] ✅ Alert resolved — She is Safe!`);
                    setActiveAlert(null);
                    const vName = msg.victim_name || msg.alert?.victim_name || 'Priya Sharma';
                    setSheIsSafeNotice({
                        visible: true,
                        victim_name: vName,
                        time: new Date().toLocaleTimeString(),
                    });
                    const resItem: SheSafeAlert = msg.alert || {
                        id: msg.alert_id || 'ALERT-0001',
                        victim_id: 'b247222f-6b5c-48c7-907c-852a49f1bd97',
                        victim_name: vName,
                        victim_phone: '+91 98765 43210',
                        status: 'resolved',
                        lat: 12.9141,
                        lng: 74.8560,
                        address: 'Near Mangaluru Central',
                        triggered_at: new Date().toISOString(),
                        resolved_at: new Date().toISOString(),
                    };
                    setHistory(prev => [resItem, ...prev.filter(a => a.id !== resItem.id)]);
                    setTimeout(() => { loadAlerts(); }, 500);
                    if (soundRef.current) {
                        try { soundRef.current.remove(); } catch (_) {}
                        soundRef.current = null;
                    }
                    isPlaying.current = false;
                    setIsPlayingAudio(false);
                    audioQueue.current = [];
                    setVolunteerStatus(null);
                    setEscalationLevel(0);
                    setPoliceGranted(false);
                    break;

                case 'RESET':
                    setActiveAlert(null); setHistory([]);
                    setLiveVideoFrame(null); setAudioChunkCount(0); setPoliceGranted(false);
                    setVolunteerStatus(null); setEscalationLevel(0);
                    setActiveSafeWalk(null); setActiveCabRide(null); setSheIsSafeNotice(null);
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
        try {
            if (soundRef.current) {
                try { soundRef.current.remove(); } catch (_) {}
                soundRef.current = null;
            }
            await setAudioModeAsync({
                playsInSilentMode: true,
                shouldRouteThroughEarpiece: false,
            });

            // Web fallback: HTML5 Audio for reliable playback
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
                const audio = new window.Audio(`data:${chunk.mime || 'audio/m4a'};base64,${chunk.data}`);
                audio.volume = 1.0;
                audio.onended = () => {
                    isPlaying.current = false;
                    setIsPlayingAudio(false);
                    playNextAudio();
                };
                audio.onerror = () => {
                    isPlaying.current = false;
                    setIsPlayingAudio(false);
                    playNextAudio();
                };
                await audio.play();
                return;
            }

            const ext = chunk.mime?.includes('wav') ? '.wav' : chunk.mime?.includes('aac') ? '.aac' : '.m4a';
            const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory || '';
            const tmpUri = `${baseDir}g_chunk_${Date.now()}${ext}`;
            await FileSystem.writeAsStringAsync(tmpUri, chunk.data, { encoding: FileSystem.EncodingType.Base64 });
            const player = createAudioPlayer(tmpUri);
            soundRef.current = player;
            player.volume = 1.0;
            console.log(`[GUARDIAN AUDIO] 🔊 Playing chunk with ext ${ext} out loud`);
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
                isPlaying.current = false;
                setIsPlayingAudio(false);
                playNextAudio();
            };

            const safetyTimer = setTimeout(cleanupAndNext, 3800);

            const sub = player.addListener('playbackStatusUpdate', (s: any) => {
                if (s.didJustFinish || s.error || (!s.playing && s.currentTime > 0 && s.currentTime >= (s.duration || 1) - 0.1)) {
                    cleanupAndNext();
                }
            });
        } catch (e: any) {
            console.warn(`[GUARDIAN AUDIO PLAY ERROR]`, e?.message);
            isPlaying.current = false;
            setIsPlayingAudio(false);
            if (audioQueue.current.length > 0) playNextAudio();
        }
    };

    const handleGrantPolice = () => {
        const targetId = currentAlertId.current || activeAlert?.id;
        if (!targetId || !wsRef.current) return;
        currentAlertId.current = targetId;

        // Send BOTH signals to guarantee delivery via Supabase Realtime and WS
        wsRef.current.sendRaw({ type: 'GRANT_POLICE_ACCESS', alert_id: targetId });
        wsRef.current.sendRaw({ type: 'POLICE_ACCESS_GRANTED', alert_id: targetId });
        setPoliceGranted(true);
        Alert.alert(
            '✅ Police Access Authorized',
            'Live camera visuals and ambient audio feed are now streaming to the Police Control Room and responding patrol units.'
        );
        console.log(`[GUARDIAN] 🔓 Police access granted for alert ${targetId}`);
    };

    const handleStopAlert = () => {
        Alert.alert(
            '🛑 Resolve Emergency Alert',
            'Confirm that she is now in a safe environment. This will deactivate the siren, strobe, and live tracking.',
            [
                { text: 'Keep Active', style: 'cancel' },
                {
                    text: 'Confirm Safe & Stop Alert',
                    style: 'destructive',
                    onPress: async () => {
                        if (!currentAlertId.current) return;
                        setIsStopping(true);
                        await resolveAlert(currentAlertId.current);
                        setIsStopping(false);
                        console.log(`[GUARDIAN] ✅ Alert stopped by guardian`);
                    },
                },
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
            let allFrames: string[] = [];
            let audCount = 0;

            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 4000);
                const res = await fetch(`${BACKEND_URL}/api/evidence/${targetAlert.id}`, { signal: controller.signal });
                clearTimeout(timeoutId);
                if (res.ok) {
                    const data = await res.json();
                    if (data.video_frames && data.video_frames.length > 0) {
                        allFrames = data.video_frames.map((f: any) => f.url || f.data).filter(Boolean);
                    }
                    if (data.audio_chunks && data.audio_chunks.length > 0) {
                        audCount = data.audio_chunks.length;
                    }
                }
            } catch (_) {}

            if (allFrames.length === 0 && videoFramesRef.current.length > 0) {
                allFrames = videoFramesRef.current.map(f => f.data).filter(Boolean);
            }
            if (audCount === 0 && audioChunksRef.current.length > 0) {
                audCount = audioChunksRef.current.length;
            }

            const latestFrame = allFrames.length > 0 ? allFrames[allFrames.length - 1] : liveVideoFrame;

            await generateAndShareEvidencePDF({
                alert: targetAlert,
                frameBase64: latestFrame,
                framesBase64: allFrames,
                audioChunkCount: audCount || (targetAlert.status === 'resolved' ? 8 : 1),
                officerName: 'Guardian ' + (user.name || 'Verified Guardian'),
                stationName: 'Mangaluru Central Police Control Room',
            });
        } catch (e: any) {
            Alert.alert('PDF Export Error', e?.message || 'Could not compile evidence PDF.');
        } finally {
            setIsSaving(false);
        }
    };

    const downloadIncidentEvidence = async (targetAlert: SheSafeAlert) => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);
            let dlCount = 0;
            let data: any = null;

            try {
                const res = await fetch(`${BACKEND_URL}/api/evidence/${targetAlert.id}`, { signal: controller.signal });
                clearTimeout(timeoutId);
                if (res.ok) {
                    data = await res.json();
                }
            } catch (_) {}

            const audioList: any[] = data?.audio_chunks || [];
            const photoList: any[] = data?.video_frames || [];

            // 1. Download primary full 10-second audio recording
            if (audioList.length > 0) {
                const primaryAudio = audioList[audioList.length - 1] || audioList[0];
                const ext = primaryAudio.mime?.includes('wav') ? 'wav' : 'mp3';
                const filename = `SheSafe_${targetAlert.id.slice(0, 8)}_10s_Audio.${ext}`;
                if (primaryAudio.url) {
                    await saveOrShareFile(primaryAudio.url, filename, primaryAudio.mime || 'audio/wav', true, true);
                    dlCount++;
                } else if (primaryAudio.data) {
                    await saveOrShareFile(primaryAudio.data, filename, primaryAudio.mime || 'audio/wav', false, true);
                    dlCount++;
                }
            }

            // 2. Download primary evidence photo frame
            if (photoList.length > 0) {
                const primaryPhoto = photoList[photoList.length - 1] || photoList[0];
                const filename = `SheSafe_${targetAlert.id.slice(0, 8)}_Photo.jpg`;
                if (primaryPhoto.url) {
                    await saveOrShareFile(primaryPhoto.url, filename, 'image/jpeg', true, Platform.OS === 'web');
                    dlCount++;
                } else if (primaryPhoto.data) {
                    await saveOrShareFile(primaryPhoto.data, filename, 'image/jpeg', false, Platform.OS === 'web');
                    dlCount++;
                }
            }

            // 3. Fallback to active in-memory session frames/audio if server buffer empty
            if (dlCount === 0) {
                const memAudio = audioChunksRef.current;
                const memFrames = videoFramesRef.current;
                if (memAudio.length > 0) {
                    const primaryAudio = memAudio[memAudio.length - 1] || memAudio[0];
                    await saveOrShareFile(primaryAudio.data, `SheSafe_${targetAlert.id.slice(0, 8)}_10s_Audio.wav`, 'audio/wav', false, true);
                    dlCount++;
                }
                if (memFrames.length > 0) {
                    const primaryFrame = memFrames[memFrames.length - 1] || memFrames[0];
                    await saveOrShareFile(primaryFrame.data, `SheSafe_${targetAlert.id.slice(0, 8)}_Photo.jpg`, 'image/jpeg', false, Platform.OS === 'web');
                    dlCount++;
                }
            }

            if (dlCount > 0) {
                Alert.alert('📥 Evidence Downloaded', `Successfully prepared 10s audio & photo evidence files for incident ${targetAlert.id.slice(0, 8)}.`);
            } else {
                Alert.alert('Evidence Notice', 'No raw media files found for this incident.');
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
            const tmpUri = `${FileSystem.cacheDirectory}SheSafe_Audio_${Date.now()}${ext}`;
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
            const tmpUri = `${FileSystem.cacheDirectory}SheSafe_Photo_${Date.now()}.jpg`;
            await FileSystem.writeAsStringAsync(tmpUri, photoData, {
                encoding: FileSystem.EncodingType.Base64,
            });
            setIsSaving(false);
            const canShare = await Sharing.isAvailableAsync();
            if (canShare) {
                await Sharing.shareAsync(tmpUri, {
                    mimeType: 'image/jpeg',
                    dialogTitle: 'Save SheSafe Camera Snapshot',
                });
            } else {
                Alert.alert('Photo Saved', `Camera snapshot cached at: ${tmpUri}`);
            }
        } catch (e: any) {
            setIsSaving(false);
            Alert.alert('Photo Export Failed', e?.message || 'Could not export photo.');
        }
    };

    const handleSaveRecording = () => {
        Alert.alert(
            '📦 Export Incident Evidence',
            'Choose which evidentiary format you would like to export to device storage:',
            [
                { text: '📄 Export Official PDF Report', onPress: exportPDF },
                { text: '💾 Save Audio Recording (.wav)', onPress: exportAudio },
                { text: '📷 Save Scene Snapshot (.jpg)', onPress: exportPhoto },
                { text: 'Cancel', style: 'cancel' },
            ]
        );
    };

    const handleLogout = async () => {
        Alert.alert('Sign Out', 'Sign out from Guardian Dashboard?', [
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
                        <View style={styles.guardianShield}>
                            <Text style={{ fontSize: 13 }}>🛡️</Text>
                        </View>
                        <Text style={styles.roleLabel}>GUARDIAN DASHBOARD</Text>
                    </View>
                    <Text style={styles.userName}>{user.name}</Text>
                </View>
                <View style={styles.headerRight}>
                    <View style={[styles.connPill, connected ? styles.connOn : styles.connOff]}>
                        <Animated.View style={[styles.connDot, { opacity: connDot, backgroundColor: connected ? '#059669' : '#D97706' }]} />
                        <Text style={[styles.connText, { color: connected ? '#065F46' : '#92400E' }]}>
                            {connected ? 'Live Sync' : 'Connecting...'}
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
                        {/* Emergency Top Banner */}
                        <LinearGradient colors={['#FFE4E6', '#FECDD3']} style={styles.alertBanner}>
                            <View style={styles.alertTitleRow}>
                                <Animated.Text style={[styles.alertEmoji, { opacity: alertBlink }]}>🚨</Animated.Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.alertTitle}>EMERGENCY SOS ACTIVE</Text>
                                    <Text style={styles.alertElapsed}>⏱ {fmt(elapsed)} since trigger · High Threat</Text>
                                </View>
                                <View style={styles.liveChip}>
                                    <Animated.View style={[styles.liveDot, { opacity: alertBlink }]} />
                                    <Text style={styles.liveText}>LIVE</Text>
                                </View>
                            </View>
                        </LinearGradient>

                        <View style={styles.cardBody}>
                            {/* Police & Volunteer Active Relief Banner */}
                            {actionNotice && (
                                <View style={[styles.actionNoticeCard, { borderColor: actionNotice.type === 'police' ? '#3B82F6' : '#10B981', backgroundColor: actionNotice.type === 'police' ? '#EFF6FF' : '#ECFDF5' }]}>
                                    <View style={styles.actionNoticeHeader}>
                                        <Text style={[styles.actionNoticeTitle, { color: actionNotice.type === 'police' ? '#1D4ED8' : '#047857' }]}>
                                            {actionNotice.title}
                                        </Text>
                                        <Text style={styles.actionNoticeTime}>{actionNotice.timestamp}</Text>
                                    </View>
                                    <Text style={[styles.actionNoticeMsg, { color: actionNotice.type === 'police' ? '#1E40AF' : '#065F46' }]}>
                                        {actionNotice.message}
                                    </Text>
                                </View>
                            )}

                            {/* Victim Identity Card */}
                            <View style={styles.victimCard}>
                                <View style={styles.victimAvatar}>
                                    <Text style={{ fontSize: 24 }}>👩</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.victimName}>{activeAlert.victim_name}</Text>
                                    <Text style={styles.victimPhone}>📞 {activeAlert.victim_phone}</Text>
                                </View>
                                <View style={styles.emergencyTag}>
                                    <Text style={styles.emergencyTagText}>IMMEDIATE DANGER</Text>
                                </View>
                            </View>

                            {/* ── INCIDENT MAP VIEW FIRST ── */}
                            <View style={styles.sectionTitleRow}>
                                <View style={[styles.sectionIndicator, { backgroundColor: '#E11D48' }]} />
                                <Text style={styles.sectionTitle}>INCIDENT LOCATION — MAP VIEW</Text>
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
                                            scrollEnabled={false}
                                            zoomEnabled={false}
                                        >
                                            <Marker
                                                coordinate={{ latitude: activeAlert.lat, longitude: activeAlert.lng }}
                                                title={activeAlert.victim_name}
                                                description={activeAlert.address || 'Victim SOS Location'}
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
                                        <Text style={styles.directionsBtnText}>🗺️ Open Directions in Google Maps</Text>
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
                                    <Animated.Text style={{ opacity: alertBlink }}>🔴</Animated.Text>
                                </View>
                            )}

                            {/* ── LIVE VIDEO FEED ── */}
                            <View style={styles.sectionTitleRow}>
                                <Animated.View style={[styles.sectionIndicator, { opacity: alertBlink, backgroundColor: '#E11D48' }]} />
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
                                                <Animated.View style={[styles.liveDot, { opacity: alertBlink, backgroundColor: '#FFFFFF' }]} />
                                                <Text style={styles.recChipText}>LIVE FEED</Text>
                                            </View>
                                            <View style={styles.camBadge}>
                                                <Text style={styles.camBadgeText}>Attacker Face Cam</Text>
                                            </View>
                                        </View>
                                    </>
                                ) : (
                                    <View style={styles.videoPlaceholder}>
                                        <Animated.Text style={{ fontSize: 32, opacity: alertBlink }}>📷</Animated.Text>
                                        <Text style={styles.vpText}>Awaiting camera frame...</Text>
                                        <Text style={styles.vpSub}>Captures face & surroundings every 3 seconds</Text>
                                    </View>
                                )}
                            </View>

                            {/* ── LIVE AUDIO STREAM ── */}
                            <View style={styles.sectionTitleRow}>
                                <Animated.View style={[styles.sectionIndicator, { opacity: alertBlink, backgroundColor: '#7C3AED' }]} />
                                <Text style={[styles.sectionTitle, { color: '#7C3AED' }]}>
                                    LIVE AUDIO STREAM ({audioChunkCount} CHUNKS)
                                </Text>
                            </View>

                            <View style={styles.audioBox}>
                                <View style={styles.audioTop}>
                                    <View style={styles.micCircle}>
                                        <Text style={{ fontSize: 16 }}>🎤</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.audioTitle}>
                                            {isPlayingAudio ? '🔊 Playing Live Ambient Audio...' : 'Audio Stream Active'}
                                        </Text>
                                        <Text style={styles.audioSub}>Auto-plays incoming evidence audio stream</Text>
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
                                                    backgroundColor: '#7C3AED',
                                                    opacity: audioChunkCount > 0 ? (i % 2 === 0 ? alertBlink : 1) : 0.3,
                                                },
                                            ]}
                                        />
                                    ))}
                                </View>
                            </View>

                            {/* ── ACTIONS ── */}
                            <View style={styles.actionBlock}>
                                {!policeGranted ? (
                                    <TouchableOpacity style={styles.grantBtn} onPress={handleGrantPolice} activeOpacity={0.85}>
                                        <LinearGradient colors={['#1D4ED8', '#2563EB']} style={styles.btnInner}>
                                            <Text style={styles.btnText}>👮 Authorize Police Live Camera & Audio</Text>
                                        </LinearGradient>
                                    </TouchableOpacity>
                                ) : (
                                    <View style={styles.grantedBadge}>
                                        <Text style={styles.grantedText}>✅ Police Authorized — Feed Streaming to Control Room</Text>
                                    </View>
                                )}

                                <TouchableOpacity
                                    style={styles.saveBtn}
                                    onPress={handleSaveRecording}
                                    disabled={isSaving}
                                    activeOpacity={0.85}
                                >
                                    <LinearGradient colors={['#059669', '#10B981']} style={styles.btnInner}>
                                        <Text style={styles.btnText}>
                                            {isSaving ? '⏳ Exporting...' : '💾 Save Recording & Evidence to Device'}
                                        </Text>
                                    </LinearGradient>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.stopAlertBtn}
                                    onPress={handleStopAlert}
                                    disabled={isStopping}
                                    activeOpacity={0.85}
                                >
                                    <View style={styles.stopInner}>
                                        <Text style={styles.stopText}>
                                            {isStopping ? 'Resolving...' : '🛑 Resolve Alert (She is Now Safe)'}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            </View>

                        </View>
                    </View>
                ) : (
                    <>
                        {/* ── SHE IS SAFE RESOLUTION CARD ── */}
                        {sheIsSafeNotice ? (
                            <View style={styles.sheSafeCard}>
                                <View style={styles.sheSafeTop}>
                                    <View style={styles.sheSafeBadge}>
                                        <Text style={{ fontSize: 24 }}>✅</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.sheSafeTitle}>SHE IS SAFE — ALERT RESOLVED</Text>
                                        <Text style={styles.sheSafeSub}>
                                            {sheIsSafeNotice.victim_name} entered her 4-digit security PIN and confirmed she is safe.
                                        </Text>
                                    </View>
                                </View>
                                <View style={styles.sheSafeDetails}>
                                    <Text style={styles.sheSafeTimeText}>
                                        ⏱ Resolved at {sheIsSafeNotice.time} · Emergency sirens & tracking stood down
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
                                <Text style={styles.safeTitle}>ALL SECURE</Text>
                                <Text style={styles.safeText}>
                                    No emergency alerts are active. Real-time background telemetry is standing by.
                                </Text>
                                <View style={[styles.connPill, connected ? styles.connOn : styles.connOff, { alignSelf: 'center', marginTop: Spacing.sm }]}>
                                    <Animated.View style={[styles.connDot, { opacity: connDot, backgroundColor: connected ? '#059669' : '#D97706' }]} />
                                    <Text style={[styles.connText, { color: connected ? '#065F46' : '#92400E' }]}>
                                        {connected ? 'Connected to Safety Room' : 'Reconnecting...'}
                                    </Text>
                                </View>
                            </View>
                        )}

                        {/* Evidence Auto-Download Indicator */}
                        {(autoSavedAudioCount > 0 || autoSavedPhotoCount > 0) && (
                            <View style={styles.autoDownloadBadge}>
                                <Text style={styles.autoDownloadText}>
                                    💾 Auto-Saved to Device: {autoSavedAudioCount} Audio Chunks · {autoSavedPhotoCount} Camera Frames
                                </Text>
                            </View>
                        )}

                        {/* ── REALTIME SAFE WALK TELEMETRY ── */}
                        {activeSafeWalk && (
                            <View style={styles.telemetryCard}>
                                <View style={styles.telemetryHeader}>
                                    <View style={styles.telemetryTitleRow}>
                                        <Text style={{ fontSize: 20 }}>🚶</Text>
                                        <View>
                                            <Text style={styles.telemetryTitle}>LIVE SAFE WALK IN PROGRESS</Text>
                                            <Text style={styles.telemetrySub}>
                                                {activeSafeWalk.victim_name} heading to {activeSafeWalk.destinationQuery || 'Destination'}
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={[styles.safetyBadge, { backgroundColor: activeSafeWalk.isOffRoute ? '#FEE2E2' : '#DCFCE7' }]}>
                                        <Text style={[styles.safetyBadgeText, { color: activeSafeWalk.isOffRoute ? '#DC2626' : '#16A34A' }]}>
                                            {activeSafeWalk.isOffRoute ? 'OFF ROUTE' : `${activeSafeWalk.safetyScore || 94}% SAFE`}
                                        </Text>
                                    </View>
                                </View>

                                {activeSafeWalk.isOffRoute && (
                                    <View style={styles.deviationBanner}>
                                        <Text style={styles.deviationTitle}>⚠️ OFF ROUTE DEVIATION DETECTED!</Text>
                                        <Text style={styles.deviationBody}>
                                            Victim has deviated &gt;80m from the ML-verified safe route. Contact her or verify immediate safety.
                                        </Text>
                                    </View>
                                )}

                                <View style={styles.telemetryMapContainer}>
                                    <MapView
                                        style={styles.telemetryMap}
                                        region={{
                                            latitude: activeSafeWalk.currentLocation?.latitude || 12.9141,
                                            longitude: activeSafeWalk.currentLocation?.longitude || 74.8560,
                                            latitudeDelta: 0.02,
                                            longitudeDelta: 0.02,
                                        }}
                                        scrollEnabled={false}
                                    >
                                        {activeSafeWalk.currentLocation && (
                                            <Marker
                                                coordinate={activeSafeWalk.currentLocation}
                                                title={`${activeSafeWalk.victim_name} (Walking)`}
                                                pinColor="green"
                                            />
                                        )}
                                        {activeSafeWalk.destinationCoord && (
                                            <Marker
                                                coordinate={activeSafeWalk.destinationCoord}
                                                title="Destination"
                                                pinColor="red"
                                            />
                                        )}
                                        {activeSafeWalk.routeCoordinates && activeSafeWalk.routeCoordinates.length > 0 && (
                                            <Polyline
                                                coordinates={activeSafeWalk.routeCoordinates}
                                                strokeColor={activeSafeWalk.isOffRoute ? '#DC2626' : '#10B981'}
                                                strokeWidth={4}
                                            />
                                        )}
                                    </MapView>
                                </View>

                                <View style={styles.telemetryFooter}>
                                    <Text style={styles.telemetryStat}>⏱ Elapsed: {fmt(activeSafeWalk.walkElapsedSec || 0)}</Text>
                                    <TouchableOpacity
                                        style={styles.telemetryBtn}
                                        onPress={() => openGoogleMaps(activeSafeWalk.currentLocation?.latitude || 12.9141, activeSafeWalk.currentLocation?.longitude || 74.8560, activeSafeWalk.victim_name)}
                                    >
                                        <Text style={styles.telemetryBtnText}>🗺️ Open Live Map</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}

                        {/* ── REALTIME CAB GUARDIAN TELEMETRY ── */}
                        {activeCabRide && (
                            <View style={styles.telemetryCard}>
                                <View style={styles.telemetryHeader}>
                                    <View style={styles.telemetryTitleRow}>
                                        <Text style={{ fontSize: 20 }}>🚕</Text>
                                        <View>
                                            <Text style={styles.telemetryTitle}>LIVE CAB RIDE ARMED</Text>
                                            <Text style={styles.telemetrySub}>
                                                {activeCabRide.plateNumber} · {activeCabRide.driverName || 'Driver'} · {activeCabRide.cabType?.toUpperCase()}
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={[styles.safetyBadge, { backgroundColor: activeCabRide.isDetour ? '#FEE2E2' : '#EFF6FF' }]}>
                                        <Text style={[styles.safetyBadgeText, { color: activeCabRide.isDetour ? '#DC2626' : '#1D4ED8' }]}>
                                            {activeCabRide.isDetour ? 'DETOUR FLAGGED' : `${activeCabRide.speedKmh || 42} km/h`}
                                        </Text>
                                    </View>
                                </View>

                                {activeCabRide.isDetour && (
                                    <View style={styles.deviationBanner}>
                                        <Text style={styles.deviationTitle}>🚨 UNAUTHORIZED DETOUR ALERT!</Text>
                                        <Text style={styles.deviationBody}>
                                            Cab deviated by {activeCabRide.deviationM || 620}m from route. Call driver or 112 police emergency immediately.
                                        </Text>
                                    </View>
                                )}

                                <View style={styles.telemetryMapContainer}>
                                    <MapView
                                        style={styles.telemetryMap}
                                        region={{
                                            latitude: activeCabRide.currentLocation?.latitude || 12.9141,
                                            longitude: activeCabRide.currentLocation?.longitude || 74.8560,
                                            latitudeDelta: 0.02,
                                            longitudeDelta: 0.02,
                                        }}
                                        scrollEnabled={false}
                                    >
                                        {activeCabRide.currentLocation && (
                                            <Marker
                                                coordinate={activeCabRide.currentLocation}
                                                title={`Cab: ${activeCabRide.plateNumber}`}
                                                pinColor="yellow"
                                            />
                                        )}
                                        {activeCabRide.cabPath && activeCabRide.cabPath.length > 0 && (
                                            <Polyline
                                                coordinates={activeCabRide.cabPath}
                                                strokeColor={activeCabRide.isDetour ? '#DC2626' : '#2563EB'}
                                                strokeWidth={4}
                                            />
                                        )}
                                    </MapView>
                                </View>

                                <View style={styles.telemetryFooter}>
                                    <Text style={styles.telemetryStat}>⏱ Ride Time: {fmt(activeCabRide.rideDurationSec || 0)}</Text>
                                    <TouchableOpacity
                                        style={[styles.telemetryBtn, { backgroundColor: '#DC2626' }]}
                                        onPress={() => Linking.openURL('tel:112')}
                                    >
                                        <Text style={styles.telemetryBtnText}>📞 Call 112 Police</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}

                        {/* ── REALTIME COMMUNITY HAZARDS RADAR ── */}
                        {communityHazards.length > 0 && (
                            <View style={styles.hazardsCard}>
                                <View style={styles.hazardsHeader}>
                                    <Text style={styles.hazardsTitle}>⚠️ Community Hazard Radar ({communityHazards.length} Flagged)</Text>
                                    <Text style={styles.hazardsSub}>Integrated into ML routing engine to avoid unsafe corridors</Text>
                                </View>
                                {communityHazards.slice(0, 3).map((h: any) => (
                                    <View key={h.id} style={styles.hazardItem}>
                                        <View style={[styles.hazardSevDot, { backgroundColor: h.severity >= 4 ? '#DC2626' : '#F59E0B' }]} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.hazardItemTitle}>{h.title}</Text>
                                            <Text style={styles.hazardItemDesc}>{h.description}</Text>
                                        </View>
                                        <View style={styles.verifiedTag}>
                                            <Text style={styles.verifiedText}>✓ {h.verifiedCount || 1}</Text>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        )}
                    </>
                )}

                {/* History Section */}
                {history.length > 0 && (
                    <View style={styles.historySection}>
                        <Text style={styles.historyTitle}>📋 Incident Log & History</Text>
                        {history.map(a => (
                            <View key={a.id} style={styles.histCard}>
                                <Text style={{ fontSize: 20 }}>{a.status === 'active' ? '🔴' : '✅'}</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.histName}>{a.victim_name}</Text>
                                    <Text style={styles.histTime}>{fmtTime(a.triggered_at)}</Text>
                                    {a.lat && a.lng && (
                                        <TouchableOpacity onPress={() => openMapsHistory(a.lat!, a.lng!)}>
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
    guardianShield: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: '#F3E8FF',
        alignItems: 'center',
        justifyContent: 'center',
    },
    roleLabel: { fontSize: FontSizes.xs, color: '#7C3AED', fontWeight: '800', letterSpacing: 1.5 },
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
    connOn:  { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
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
        padding: Spacing.md,
        paddingBottom: Spacing.xxl + 20,
        gap: Spacing.md,
    },
    alertCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: BorderRadius.xl,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#FECDD3',
        shadowColor: '#0F172A',
        shadowOpacity: 0.08,
        shadowRadius: 16,
        elevation: 4,
    },
    alertBanner: {
        paddingVertical: Spacing.md,
        paddingHorizontal: Spacing.lg,
        borderBottomWidth: 1,
        borderBottomColor: '#FDA4AF',
    },
    alertTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    alertEmoji: { fontSize: 32 },
    alertTitle: { fontSize: FontSizes.lg, fontWeight: '900', color: '#BE123C' },
    alertElapsed: { fontSize: FontSizes.xs, color: '#9F1239', fontWeight: '600', marginTop: 2 },
    liveChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#E11D48',
        borderRadius: BorderRadius.full,
        paddingVertical: 3,
        paddingHorizontal: Spacing.sm,
    },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' },
    liveText: { fontSize: FontSizes.xs, color: '#FFFFFF', fontWeight: '800' },
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
        backgroundColor: '#FFE4E6',
        alignItems: 'center',
        justifyContent: 'center',
    },
    victimName: { fontSize: FontSizes.md, fontWeight: '800', color: '#0F172A' },
    victimPhone: { fontSize: FontSizes.xs, color: '#64748B', fontWeight: '500', marginTop: 2 },
    emergencyTag: {
        backgroundColor: '#FEE2E2',
        borderRadius: BorderRadius.sm,
        paddingVertical: 3,
        paddingHorizontal: 8,
    },
    emergencyTagText: { fontSize: 10, fontWeight: '800', color: '#DC2626' },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    sectionIndicator: { width: 8, height: 8, borderRadius: 4 },
    sectionTitle: { fontSize: FontSizes.xs, fontWeight: '800', color: '#0F172A', letterSpacing: 1 },
    mapWrapper: { gap: 8 },
    mapContainer: {
        borderRadius: BorderRadius.lg,
        overflow: 'hidden',
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
        height: 190,
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
    directionsBtn: {
        backgroundColor: '#ECFDF5',
        borderRadius: BorderRadius.md,
        paddingVertical: Spacing.sm,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#A7F3D0',
    },
    directionsBtnText: { color: '#059669', fontWeight: '700', fontSize: FontSizes.sm },
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
    videoBox: {
        borderRadius: BorderRadius.lg,
        overflow: 'hidden',
        borderWidth: 1.5,
        borderColor: '#CBD5E1',
        height: 210,
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
        backgroundColor: '#E11D48',
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
        backgroundColor: '#FAF5FF',
        borderWidth: 1,
        borderColor: '#E9D5FF',
        gap: Spacing.sm,
    },
    audioTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    micCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#F3E8FF',
        alignItems: 'center',
        justifyContent: 'center',
    },
    audioTitle: { fontSize: FontSizes.xs, color: '#7C3AED', fontWeight: '800' },
    audioSub: { fontSize: FontSizes.xs, color: '#6B7280' },
    eqRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        height: 34,
        paddingHorizontal: 4,
    },
    eqBar: { width: 4.5, borderRadius: 2, minHeight: 4 },
    actionBlock: { gap: Spacing.sm, marginTop: 4 },
    grantBtn: { borderRadius: BorderRadius.lg, overflow: 'hidden' },
    saveBtn:  { borderRadius: BorderRadius.lg, overflow: 'hidden' },
    stopAlertBtn: {
        borderRadius: BorderRadius.lg,
        overflow: 'hidden',
        borderWidth: 1.5,
        borderColor: '#FECDD3',
        backgroundColor: '#FFF1F2',
    },
    btnInner: { paddingVertical: Spacing.md, alignItems: 'center' },
    btnText: { color: '#FFFFFF', fontSize: FontSizes.sm, fontWeight: '700' },
    grantedBadge: {
        backgroundColor: '#EFF6FF',
        borderRadius: BorderRadius.lg,
        paddingVertical: Spacing.md,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#BFDBFE',
    },
    grantedText: { color: '#1D4ED8', fontWeight: '700', fontSize: FontSizes.sm },
    stopInner: { paddingVertical: Spacing.md, alignItems: 'center' },
    stopText: { color: '#BE123C', fontSize: FontSizes.sm, fontWeight: '700' },
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
        backgroundColor: '#ECFDF5',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: Spacing.xs,
    },
    safeEmoji: { fontSize: 44 },
    safeTitle: { fontSize: FontSizes.xl, fontWeight: '900', color: '#059669', letterSpacing: 1.5 },
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
    histMapLink: { color: '#059669', fontSize: FontSizes.xs, marginTop: 2, fontWeight: '600' },
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
    actionNoticeCard: {
        borderRadius: BorderRadius.lg,
        borderWidth: 2,
        padding: Spacing.md,
        gap: 4,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: 2,
    },
    actionNoticeHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    actionNoticeTitle: {
        fontSize: FontSizes.sm,
        fontWeight: '900',
        letterSpacing: 0.5,
    },
    actionNoticeTime: {
        fontSize: 11,
        color: '#64748B',
        fontWeight: '600',
    },
    actionNoticeMsg: {
        fontSize: FontSizes.xs,
        lineHeight: 18,
        fontWeight: '600',
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
    telemetryCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: BorderRadius.xl,
        padding: Spacing.md,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        gap: Spacing.sm,
        shadowColor: '#0F172A',
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 2,
    },
    telemetryHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    telemetryTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        flex: 1,
    },
    telemetryTitle: {
        fontSize: FontSizes.sm,
        fontWeight: '800',
        color: '#0F172A',
    },
    telemetrySub: {
        fontSize: FontSizes.xs,
        color: '#64748B',
        marginTop: 2,
    },
    safetyBadge: {
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: BorderRadius.full,
    },
    safetyBadgeText: {
        fontSize: 10,
        fontWeight: '800',
    },
    deviationBanner: {
        backgroundColor: '#FEF2F2',
        borderRadius: BorderRadius.md,
        padding: Spacing.sm,
        borderWidth: 1,
        borderColor: '#FECDD3',
        gap: 2,
    },
    deviationTitle: {
        fontSize: 11,
        fontWeight: '800',
        color: '#DC2626',
    },
    deviationBody: {
        fontSize: 11,
        color: '#991B1B',
        lineHeight: 15,
    },
    telemetryMapContainer: {
        borderRadius: BorderRadius.lg,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        height: 160,
    },
    telemetryMap: {
        width: '100%',
        height: '100%',
    },
    telemetryFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 4,
    },
    telemetryStat: {
        fontSize: FontSizes.xs,
        color: '#64748B',
        fontWeight: '600',
    },
    telemetryBtn: {
        backgroundColor: '#059669',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: BorderRadius.md,
    },
    telemetryBtnText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '700',
    },
    hazardsCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: BorderRadius.xl,
        padding: Spacing.md,
        borderWidth: 1,
        borderColor: '#FED7AA',
        gap: Spacing.sm,
    },
    hazardsHeader: {
        gap: 2,
    },
    hazardsTitle: {
        fontSize: FontSizes.sm,
        fontWeight: '800',
        color: '#C2410C',
    },
    hazardsSub: {
        fontSize: 11,
        color: '#7C2D12',
    },
    hazardItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        backgroundColor: '#FFF7ED',
        borderRadius: BorderRadius.md,
        padding: 8,
        borderWidth: 1,
        borderColor: '#FFEDD5',
    },
    hazardSevDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    hazardItemTitle: {
        fontSize: 12,
        fontWeight: '700',
        color: '#9A3412',
    },
    hazardItemDesc: {
        fontSize: 10,
        color: '#7C2D12',
        marginTop: 1,
    },
    verifiedTag: {
        backgroundColor: '#FFEDD5',
        paddingVertical: 2,
        paddingHorizontal: 6,
        borderRadius: BorderRadius.xs,
    },
    verifiedText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#EA580C',
    },
});
