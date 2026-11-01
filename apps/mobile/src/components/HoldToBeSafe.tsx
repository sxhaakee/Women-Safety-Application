/**
 * HoldToBeSafe — Dead-man's switch component (§4.6)
 *
 * Behaviour:
 *   onPressIn  → armed; haptic tick every 5 s while held
 *   onPressOut → 400 ms hysteresis grace; if PIN not entered within 3 s → triggers countdown
 *   PIN entry  → disarms and cancels any pending countdown
 *
 * Props:
 *   onTrigger  — called when the switch fires (navigate to countdown)
 *   disabled   — hides the component during active alert
 */
import React, { useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Modal,
  TouchableOpacity, Vibration, Animated, Pressable,
} from 'react-native';

interface Props {
  onTrigger: () => void;
  disabled?: boolean;
  pinLength?: number; // default 4
}

const GRACE_MS = 400;       // hysteresis: ignore release shorter than this
const TRIGGER_MS = 3000;    // after grace, countdown triggers if PIN not entered
const HAPTIC_INTERVAL = 5000;

export default function HoldToBeSafe({ onTrigger, disabled = false, pinLength = 4 }: Props) {
  const [armed, setArmed]       = useState(false);
  const [showPin, setShowPin]   = useState(false);
  const [pin, setPin]           = useState('');
  const [error, setError]       = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const pressTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hapticTimer   = useRef<ReturnType<typeof setInterval> | null>(null);
  const triggerTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cdInterval    = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearAll = useCallback(() => {
    if (pressTimer.current)   clearTimeout(pressTimer.current);
    if (hapticTimer.current)  clearInterval(hapticTimer.current);
    if (triggerTimer.current) clearTimeout(triggerTimer.current);
    if (cdInterval.current)   clearInterval(cdInterval.current);
    pressTimer.current = hapticTimer.current = triggerTimer.current = cdInterval.current = null;
  }, []);

  const handlePressIn = useCallback(() => {
    if (disabled) return;
    setArmed(true);
    Vibration.vibrate(60);

    hapticTimer.current = setInterval(() => {
      Vibration.vibrate(30);
    }, HAPTIC_INTERVAL);
  }, [disabled]);

  const handlePressOut = useCallback(() => {
    if (disabled) return;

    // 400 ms hysteresis — ignore accidental lift
    pressTimer.current = setTimeout(() => {
      setArmed(false);
      if (hapticTimer.current) clearInterval(hapticTimer.current);

      // Show PIN disarm dialog
      setShowPin(true);
      setPin('');
      setError(false);
      let secs = 3;
      setCountdown(secs);

      cdInterval.current = setInterval(() => {
        secs -= 1;
        setCountdown(secs);
        if (secs <= 0) {
          clearAll();
          setShowPin(false);
          setCountdown(null);
          onTrigger();
        }
      }, 1000);
    }, GRACE_MS);
  }, [disabled, clearAll, onTrigger]);

  const handlePinInput = (digit: string) => {
    if (digit === '⌫') {
      setPin(p => p.slice(0, -1));
      return;
    }
    const next = pin + digit;
    setPin(next);
    if (next.length >= pinLength) {
      // Any pin entry during dead-man window = disarm
      clearAll();
      setShowPin(false);
      setCountdown(null);
      setArmed(false);
      setPin('');
      Vibration.vibrate([0, 50, 50, 50]);
    }
  };

  const handleForceCancel = () => {
    clearAll();
    setShowPin(false);
    setCountdown(null);
    setArmed(false);
    setPin('');
  };

  if (disabled) return null;

  return (
    <>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={({ pressed }) => [
          styles.holdBtn,
          armed && styles.holdBtnArmed,
          pressed && styles.holdBtnPressed,
        ]}
      >
        <Text style={styles.holdIcon}>🖐️</Text>
        <Text style={styles.holdLabel}>
          {armed ? 'HOLDING — Release to test alarm' : 'HOLD for Dead-Man Switch'}
        </Text>
        {armed && (
          <View style={styles.armedBadge}>
            <View style={styles.armedDot} />
            <Text style={styles.armedTxt}>ARMED</Text>
          </View>
        )}
      </Pressable>

      {/* Disarm PIN dialog */}
      <Modal visible={showPin} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>🚨 Alert in {countdown}s</Text>
            <Text style={styles.dialogSub}>
              Enter any PIN digit to disarm the dead-man switch
            </Text>

            {/* PIN dots */}
            <Animated.View style={[styles.dotsRow, { transform: [{ translateX: shakeAnim }] }]}>
              {Array.from({ length: pinLength }).map((_, i) => (
                <View key={i} style={[styles.dot, pin.length > i && styles.dotFilled]} />
              ))}
            </Animated.View>

            {/* Keypad */}
            <View style={styles.keypad}>
              {[['1','2','3'],['4','5','6'],['7','8','9'],['⌫','0','✓']].map((row, ri) => (
                <View key={ri} style={styles.keyRow}>
                  {row.map(k => (
                    <TouchableOpacity
                      key={k}
                      style={[styles.key, k==='⌫' && styles.keyDel, k==='✓' && styles.keyCon]}
                      onPress={() => handlePinInput(k)}
                    >
                      <Text style={[styles.keyTxt, k==='⌫' && {color:'#EF4444'}, k==='✓' && {color:'#10B981'}]}>
                        {k}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </View>

            <TouchableOpacity style={styles.cancelBtn} onPress={handleForceCancel}>
              <Text style={styles.cancelTxt}>Cancel (will NOT trigger alert)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  holdBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(245,158,11,0.3)',
    borderRadius: 16,
    padding: 14,
    borderStyle: 'dashed',
  },
  holdBtnArmed: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderColor: '#EF4444',
    borderStyle: 'solid',
  },
  holdBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  holdIcon: { fontSize: 24 },
  holdLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: '#92400E' },
  armedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EF4444', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  armedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  armedTxt: { color: '#fff', fontSize: 10, fontWeight: '800' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  dialog: { backgroundColor: '#1A1A1A', borderRadius: 24, padding: 24, width: '100%', alignItems: 'center', gap: 16, borderWidth: 1.5, borderColor: '#EF4444' },
  dialogTitle: { fontSize: 22, fontWeight: '900', color: '#EF4444' },
  dialogSub: { fontSize: 13, color: '#aaa', textAlign: 'center' },
  dotsRow: { flexDirection: 'row', gap: 16 },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  dotFilled: { backgroundColor: '#fff', borderColor: '#fff' },
  keypad: { gap: 10, width: '100%' },
  keyRow: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  key: { width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)' },
  keyDel: { backgroundColor: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.4)' },
  keyCon: { backgroundColor: 'rgba(16,185,129,0.12)', borderColor: 'rgba(16,185,129,0.4)' },
  keyTxt: { fontSize: 22, fontWeight: '700', color: '#F3F4F6' },
  cancelBtn: { paddingVertical: 8 },
  cancelTxt: { color: '#666', fontSize: 12, textDecorationLine: 'underline' },
});
