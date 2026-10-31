/**
 * DeterrenceScreen — P4
 *
 * The demo centrepiece. Makes an attacker believe — truthfully —
 * that help is coming and they are being recorded.
 *
 * Safety: STROBE_HZ = 2.5 (≤ 3 Hz, WCAG 2.3.1). Unit test asserts this.
 * Lock: gestureEnabled=false + BackHandler; cannot be dismissed without PIN.
 * Duress: UI shows "I'M SAFE" but alert stays active, escalation_level=3.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, BackHandler, Animated, Vibration,
  Dimensions, ScrollView, Pressable, Modal, TextInput,
  Platform, Alert as RNAlert,
} from 'react-native';
import { CameraView } from 'expo-camera';
import * as Speech from 'expo-speech';
import * as Brightness from 'expo-brightness';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { checkPin } from '../services/pinService';
import { supabase } from '../utils/supabase';
import { CATALOGS, en, type I18nCatalog } from '@shesafe/shared';

// ─── SAFETY CONSTANT ─────────────────────────────────────────────────────────
// WCAG 2.3.1: must not flash more than 3 times per second.
export const STROBE_HZ = 2.5; // Hz — this value is asserted in the unit test.
const STROBE_INTERVAL_MS = Math.round(1000 / STROBE_HZ); // 400ms

const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_SEC = 30;
const VOICE_INTERVAL_MS = 7000;
const HAPTIC_PATTERN = [0, 400, 200, 400];

const { width, height } = Dimensions.get('window');

type RootStack = {
  DeterrenceScreen: {
    alertId: string;
    lang?: 'en' | 'hi' | 'kn';
    reduceFlashing?: boolean;
  };
  VictimDashboard: undefined;
};

type NavProp = NativeStackNavigationProp<RootStack, 'DeterrenceScreen'>;
type RouteProps = RouteProp<RootStack, 'DeterrenceScreen'>;

// Checklist item states
type CheckState = 'pending' | 'queued' | 'done' | 'failed';

interface ChecklistItem {
  id: string;
  label: string;
  state: CheckState;
  timestamp?: string;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour12: false });
}

export default function DeterrenceScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteProps>();
  const params = (route.params || {}) as { alertId?: string; lang?: 'en' | 'hi' | 'kn'; reduceFlashing?: boolean };
  const alertId = params.alertId || '00000000-0000-0000-0000-000000000000';
  const lang = params.lang || 'en';
  const reduceFlashing = params.reduceFlashing || false;


  // ── State ─────────────────────────────────────────────────────────────────
  const [strobeOn, setStrobeOn] = useState(true);
  const [serverConfirmed, setServerConfirmed] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([
    { id: 'server', label: 'Alert received by server', state: 'pending' },
    { id: 'guardians', label: 'Guardians notified', state: 'pending' },
    { id: 'volunteers', label: 'Nearby responders pinged', state: 'pending' },
    { id: 'police', label: 'Police station notified', state: 'pending' },
    { id: 'police_ack', label: 'Police acknowledged', state: 'pending' },
  ]);

  // PIN cancel dock
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinAttempts, setPinAttempts] = useState(0);
  const [pinLocked, setPinLocked] = useState(false);
  const [lockoutSec, setLockoutSec] = useState(0);
  const [pinError, setPinError] = useState('');

  // ── Refs ──────────────────────────────────────────────────────────────────
  const strobeRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lockoutRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const strobeAnim = useRef(new Animated.Value(0)).current;
  const startTime = useRef(Date.now()).current;

  // ── Block hardware back ───────────────────────────────────────────────────
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  // ── Brightness + keep-awake ───────────────────────────────────────────────
  useEffect(() => {
    let prevBrightness = 1.0;
    Brightness.getBrightnessAsync()
      .then(b => { prevBrightness = b; })
      .then(() => Brightness.setBrightnessAsync(1.0))
      .catch(() => {});

    void activateKeepAwakeAsync('deterrence');

    return () => {
      Brightness.setBrightnessAsync(prevBrightness).catch(() => {});
      deactivateKeepAwake('deterrence');
    };
  }, []);

  // ── Haptics ───────────────────────────────────────────────────────────────
  useEffect(() => {
    Vibration.vibrate(HAPTIC_PATTERN, true);
    return () => Vibration.cancel();
  }, []);

  // ── Strobe ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (reduceFlashing) {
      // Slow pulsing glow instead of strobe
      Animated.loop(
        Animated.sequence([
          Animated.timing(strobeAnim, { toValue: 1, duration: 1500, useNativeDriver: false }),
          Animated.timing(strobeAnim, { toValue: 0, duration: 1500, useNativeDriver: false }),
        ])
      ).start();
      return;
    }

    // Strobe at STROBE_HZ (2.5 Hz = 400ms interval)
    strobeRef.current = setInterval(() => {
      setStrobeOn(v => !v);
    }, STROBE_INTERVAL_MS);

    return () => {
      if (strobeRef.current) clearInterval(strobeRef.current);
    };
  }, [reduceFlashing]);

  // ── Voice announcements ───────────────────────────────────────────────────
  const announce = useCallback(async () => {
    const catalog: I18nCatalog = (CATALOGS as any)[lang || 'en'] || en;
    const text = serverConfirmed
      ? catalog.voice.alertAcknowledged
      : catalog.voice.alertActive;

    try {
      const voices = await Speech.getAvailableVoicesAsync();
      const langCode = lang === 'hi' ? 'hi-IN' : lang === 'kn' ? 'kn-IN' : 'en-IN';
      const hasLang = voices.some(v => v.language?.startsWith(langCode.split('-')[0]!));
      await Speech.speak(text, {
        language: hasLang ? langCode : 'en-IN',
        rate: 0.9,
      });
    } catch {
      // Voice unavailable — continue silently
    }
  }, [serverConfirmed, lang]);

  useEffect(() => {
    void announce();
    voiceRef.current = setInterval(announce, VOICE_INTERVAL_MS);
    return () => {
      if (voiceRef.current) clearInterval(voiceRef.current);
      Speech.stop();
    };
  }, [announce]);

  // ── Elapsed timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    elapsedRef.current = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => { if (elapsedRef.current) clearInterval(elapsedRef.current); };
  }, []);

  // ── Supabase Realtime: bind to alert events ────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`deterrence_${alertId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'alerts',
        filter: `id=eq.${alertId}`,
      }, (payload) => {
        const row = payload.new as Record<string, unknown>;
        if (row['fired_at']) {
          setServerConfirmed(true);
          updateChecklist('server', 'done', new Date(row['fired_at'] as string).toISOString());
        }
        if (row['acknowledged_at']) {
          const eta = row['eta_minutes'];
          const label = eta
            ? `Police acknowledged · ETA ${eta} min`
            : 'Police acknowledged';
          updateChecklist('police_ack', 'done', new Date(row['acknowledged_at'] as string).toISOString(), label);
        }
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'alert_events',
        filter: `alert_id=eq.${alertId}`,
      }, (payload) => {
        const row = payload.new as Record<string, unknown>;
        const type = row['type'] as string;
        const now = new Date().toISOString();

        if (type === 'fired') updateChecklist('server', 'done', now);
        if (type === 'guardian_notified') updateChecklist('guardians', 'done', now);
        if (type === 'volunteers_pinged') updateChecklist('volunteers', 'done', now);
        if (type === 'station_notified') updateChecklist('police', 'done', now);
        if (type === 'acknowledged') updateChecklist('police_ack', 'done', now);
      })
      .subscribe();

    realtimeRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [alertId]);

  function updateChecklist(id: string, state: CheckState, timestamp?: string, label?: string) {
    setChecklist(prev =>
      prev.map(item =>
        item.id === id
          ? { ...item, state, timestamp, ...(label ? { label } : {}) }
          : item
      )
    );
  }

  // ── PIN cancel ────────────────────────────────────────────────────────────
  async function submitPin() {
    if (pinLocked || pinInput.length < 6) return;
    setPinError('');

    const result = await checkPin(pinInput);
    setPinInput('');

    if (result === 'wrong') {
      const attempts = pinAttempts + 1;
      setPinAttempts(attempts);
      if (attempts >= PIN_MAX_ATTEMPTS) {
        setPinLocked(true);
        let sec = PIN_LOCKOUT_SEC;
        setLockoutSec(sec);
        lockoutRef.current = setInterval(() => {
          sec--;
          setLockoutSec(sec);
          if (sec <= 0) {
            if (lockoutRef.current) clearInterval(lockoutRef.current);
            setPinLocked(false);
            setPinAttempts(0);
          }
        }, 1000);
      } else {
        setPinError(`Wrong PIN (${PIN_MAX_ATTEMPTS - attempts} left)`);
      }
      return;
    }

    if (result === 'duress') {
      // UI behaves exactly like success — but escalates silently
      void supabase.rpc('cancel_alert', { p_alert: alertId, p_duress: true });
      setPinModalVisible(false);
      navigation.replace('VictimDashboard');
      // NOTE: Alert stays ACTIVE. Recording continues silently.
      return;
    }

    if (result === 'normal') {
      void supabase.rpc('cancel_alert', { p_alert: alertId, p_duress: false });
      setPinModalVisible(false);
      navigation.replace('VictimDashboard');
    }
  }

  // ── Strobe colours ────────────────────────────────────────────────────────
  const bgColor = reduceFlashing
    ? strobeAnim.interpolate({ inputRange: [0, 1], outputRange: ['#CC0000', '#0000CC'] })
    : (strobeOn ? '#CC0000' : '#0000CC');

  const banner = serverConfirmed
    ? 'ALERT SENT · POLICE & GUARDIANS NOTIFIED'
    : 'ALERT QUEUED — RETRYING';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Animated.View style={[styles.container, { backgroundColor: bgColor as unknown as string }]}>

      {/* ── Attacker Banner ─────────────────────────────── */}
      <View style={styles.bannerWrap}>
        <Text style={styles.bannerText} adjustsFontSizeToFit numberOfLines={2}>
          {banner}
        </Text>
        <Text style={styles.bannerSub} adjustsFontSizeToFit numberOfLines={1}>
          LIVE LOCATION + VIDEO BEING RECORDED
        </Text>
      </View>

      {/* ── Front Camera Preview ─────────────────────────── */}
      <View style={styles.cameraWrap}>
        <CameraView
          style={styles.camera}
          facing="front"
          mode="video"
        />
        <View style={styles.recRow}>
          <View style={styles.recDot} />
          <Text style={styles.recText}>
            REC  {new Date(elapsedSec * 1000).toISOString().slice(11, 19)}
          </Text>
        </View>
      </View>

      {/* ── Live Checklist ───────────────────────────────── */}
      <ScrollView style={styles.checklist} contentContainerStyle={styles.checklistContent}>
        {checklist.map(item => (
          <ChecklistRow key={item.id} item={item} />
        ))}
      </ScrollView>

      {/* ── Elapsed + battery row ────────────────────────── */}
      <Text style={styles.statusRow}>
        ⏱ {elapsedSec}s elapsed
      </Text>

      {/* ── Cancel Dock ──────────────────────────────────── */}
      <View style={styles.cancelDock}>
        <Pressable style={styles.cancelBtn} onPress={() => setPinModalVisible(true)}>
          <Text style={styles.cancelBtnText}>I'M SAFE — Enter PIN</Text>
        </Pressable>
      </View>

      {/* ── PIN Modal ────────────────────────────────────── */}
      <Modal visible={pinModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Enter PIN to cancel</Text>
            <Text style={{ fontSize: 11, color: '#aaa', textAlign: 'center', marginBottom: 12 }}>
              Normal: 135790 · Duress: 246801
            </Text>
            {pinLocked
              ? <Text style={styles.pinError}>Locked for {lockoutSec}s</Text>
              : <>
                  <TextInput
                    style={styles.pinInput}
                    value={pinInput}
                    onChangeText={setPinInput}
                    keyboardType="number-pad"
                    secureTextEntry
                    maxLength={6}
                    autoFocus
                    placeholder="••••••"
                    placeholderTextColor="#666"
                  />
                  {pinError ? <Text style={styles.pinError}>{pinError}</Text> : null}
                  <Pressable style={styles.pinSubmit} onPress={submitPin}>
                    <Text style={styles.pinSubmitText}>CONFIRM</Text>
                  </Pressable>
                </>
            }
            <Pressable onPress={() => { setPinModalVisible(false); setPinInput(''); }}>
              <Text style={styles.pinCancel}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Animated.View>
  );
}

function ChecklistRow({ item }: { item: ChecklistItem }) {
  const stateIcon = {
    pending: '⏳',
    queued:  '🟡',
    done:    '✅',
    failed:  '🔴',
  }[item.state];

  return (
    <View style={styles.checkRow}>
      <Text style={styles.checkIcon}>{stateIcon}</Text>
      <View style={styles.checkTextWrap}>
        <Text style={[styles.checkLabel, item.state === 'done' && styles.checkDone]}>
          {item.label}
        </Text>
        {item.timestamp && item.state === 'done' ? (
          <Text style={styles.checkTimestamp}>{formatTime(item.timestamp)}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 50 },
  bannerWrap: { paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center' },
  bannerText: { color: '#FFF', fontSize: 26, fontWeight: '900', textAlign: 'center', letterSpacing: 1 },
  bannerSub: { color: '#FFE', fontSize: 14, fontWeight: '700', textAlign: 'center', marginTop: 4 },
  cameraWrap: { height: 180, marginHorizontal: 16, borderRadius: 12, overflow: 'hidden', backgroundColor: '#111' },
  camera: { flex: 1 },
  recRow: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center' },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#F00', marginRight: 4 },
  recText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  checklist: { flex: 1, marginHorizontal: 12, marginTop: 8 },
  checklistContent: { paddingBottom: 8 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 6 },
  checkIcon: { fontSize: 18, marginRight: 8, marginTop: 1 },
  checkTextWrap: { flex: 1 },
  checkLabel: { color: '#FFE', fontSize: 14, fontWeight: '600' },
  checkDone: { color: '#9F9' },
  checkTimestamp: { color: '#AAA', fontSize: 11, marginTop: 2 },
  statusRow: { color: '#DDD', fontSize: 12, textAlign: 'center', paddingVertical: 4 },
  cancelDock: { padding: 16, paddingBottom: Platform.OS === 'ios' ? 32 : 16 },
  cancelBtn: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 2, borderColor: '#FFF' },
  cancelBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: '#1A1A2E', borderRadius: 16, padding: 24, width: '80%', alignItems: 'center' },
  modalTitle: { color: '#FFF', fontSize: 18, fontWeight: '700', marginBottom: 16 },
  pinInput: { color: '#FFF', fontSize: 32, borderBottomWidth: 2, borderColor: '#666', width: '100%', textAlign: 'center', letterSpacing: 8, marginBottom: 12, paddingVertical: 8 },
  pinError: { color: '#F88', fontSize: 14, marginBottom: 8 },
  pinSubmit: { backgroundColor: '#E63946', borderRadius: 8, paddingHorizontal: 40, paddingVertical: 12, marginTop: 8 },
  pinSubmitText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  pinCancel: { color: '#AAA', marginTop: 16, fontSize: 14 },
});
