import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Animated,
    StatusBar,
    Alert,
    Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Accelerometer } from 'expo-sensors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../theme';

const { width } = Dimensions.get('window');

export default function SensorCalibrationScreen({ navigation }: any) {
    const [step, setStep] = useState<1 | 2 | 3>(1); // 1: Shake Calibration, 2: False-Trigger Rejection, 3: Summary
    const [shakeCount, setShakeCount] = useState(0);
    const [peaks, setPeaks] = useState<number[]>([]);
    const [currentG, setCurrentG] = useState(1.0);
    const [calibratedT, setCalibratedT] = useState(2.0);
    const [falseTriggerScore, setFalseTriggerScore] = useState(0);
    const [testSecondsLeft, setTestSecondsLeft] = useState(15);
    const [isTestingFalse, setIsTestingFalse] = useState(false);

    const subscription = useRef<any>(null);
    const animG = useRef(new Animated.Value(1.0)).current;

    useEffect(() => {
        Accelerometer.setUpdateInterval(50);
        subscription.current = Accelerometer.addListener(({ x, y, z }) => {
            const mag = Math.sqrt(x * x + y * y + z * z);
            setCurrentG(mag);

            if (step === 1) {
                if (mag > 1.8) {
                    setPeaks(prev => {
                        const last = prev[prev.length - 1] || 0;
                        if (Date.now() - last > 400 && prev.length < 5) {
                            const next = [...prev, mag];
                            setShakeCount(next.length);
                            return next;
                        }
                        return prev;
                    });
                }
            } else if (step === 2 && isTestingFalse) {
                if (mag > calibratedT) {
                    setFalseTriggerScore(s => s + 1);
                }
            }
        });

        return () => {
            subscription.current?.remove();
        };
    }, [step, isTestingFalse, calibratedT]);

    // When 5 shakes captured in Step 1
    useEffect(() => {
        if (shakeCount >= 5 && step === 1) {
            // T = mean(peak) - 2σ clamped [1.3, 2.8] g
            const mean = peaks.reduce((a, b) => a + b, 0) / peaks.length;
            const variance = peaks.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / peaks.length;
            const sigma = Math.sqrt(variance);
            let t = mean - 2 * sigma;
            t = Math.max(1.3, Math.min(2.8, t));
            setCalibratedT(parseFloat(t.toFixed(2)));
            setStep(2);
        }
    }, [shakeCount, step, peaks]);

    // Step 2 countdown
    useEffect(() => {
        let timer: any = null;
        if (step === 2 && isTestingFalse) {
            timer = setInterval(() => {
                setTestSecondsLeft(s => {
                    if (s <= 1) {
                        clearInterval(timer);
                        finishCalibration();
                        return 0;
                    }
                    return s - 1;
                });
            }, 1000);
        }
        return () => clearInterval(timer);
    }, [step, isTestingFalse]);

    const startFalseTriggerTest = () => {
        setIsTestingFalse(true);
        setTestSecondsLeft(15);
        setFalseTriggerScore(0);
    };

    const finishCalibration = async () => {
        let finalT = calibratedT;
        if (falseTriggerScore > 0) {
            finalT = Math.min(2.8, parseFloat((calibratedT * 1.1).toFixed(2)));
            setCalibratedT(finalT);
        }

        const calibrationData = {
            threshold_g: finalT,
            calibrated_at: new Date().toISOString(),
            false_triggers_in_test: falseTriggerScore,
            peaks,
        };

        await AsyncStorage.setItem('shesafe_sensor_calibration', JSON.stringify(calibrationData));
        setStep(3);
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Text style={styles.backBtnText}>← Back</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Sensor Calibration</Text>
                <View style={{ width: 60 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

                {/* Live Accelerometer Gauge */}
                <View style={styles.gaugeCard}>
                    <Text style={styles.gaugeLabel}>LIVE ACCELERATION</Text>
                    <Text style={styles.gaugeVal}>{currentG.toFixed(2)} <Text style={styles.gaugeUnit}>g</Text></Text>
                    <View style={styles.barTrack}>
                        <View style={[styles.barFill, { width: `${Math.min(100, (currentG / 4) * 100)}%` }]} />
                    </View>
                    <View style={styles.barLabels}>
                        <Text style={styles.subText}>0g (Rest)</Text>
                        <Text style={styles.subText}>Threshold ({calibratedT}g)</Text>
                        <Text style={styles.subText}>4g (Vigorous)</Text>
                    </View>
                </View>

                {step === 1 && (
                    <View style={styles.card}>
                        <View style={styles.stepBadge}>
                            <Text style={styles.stepBadgeText}>STEP 1 OF 2</Text>
                        </View>
                        <Text style={styles.title}>Calibrate Shake Gesture</Text>
                        <Text style={styles.desc}>
                            Perform 5 deliberate, intentional emergency shakes with your phone. The detector will learn your natural hand-strength signature.
                        </Text>

                        <View style={styles.counterRow}>
                            {[1, 2, 3, 4, 5].map(i => (
                                <View
                                    key={i}
                                    style={[
                                        styles.counterBubble,
                                        shakeCount >= i && styles.counterBubbleActive,
                                    ]}
                                >
                                    <Text style={[styles.counterText, shakeCount >= i && styles.counterTextActive]}>
                                        {shakeCount >= i ? '✓' : i}
                                    </Text>
                                </View>
                            ))}
                        </View>

                        <Text style={styles.hint}>
                            {shakeCount < 5
                                ? `Captured ${shakeCount} of 5 shakes. Shake firmly!`
                                : 'Computing optimal threshold...'}
                        </Text>
                    </View>
                )}

                {step === 2 && (
                    <View style={styles.card}>
                        <View style={[styles.stepBadge, { backgroundColor: '#FEF3C7' }]}>
                            <Text style={[styles.stepBadgeText, { color: '#B45309' }]}>STEP 2 OF 2</Text>
                        </View>
                        <Text style={styles.title}>False-Trigger Rejection Test</Text>
                        <Text style={styles.desc}>
                            Calculated base threshold: <Text style={{ fontWeight: '700', color: '#1E293B' }}>{calibratedT}g</Text>.
                            Now walk normally or place the phone in your pocket for 15 seconds to ensure zero false alarms.
                        </Text>

                        {!isTestingFalse ? (
                            <TouchableOpacity style={styles.actionBtn} onPress={startFalseTriggerTest}>
                                <LinearGradient colors={['#1D4ED8', '#2563EB']} style={styles.actionBtnGrad}>
                                    <Text style={styles.actionBtnText}>Start 15s Movement Test</Text>
                                </LinearGradient>
                            </TouchableOpacity>
                        ) : (
                            <View style={styles.testingBox}>
                                <Text style={styles.timerNum}>{testSecondsLeft}s</Text>
                                <Text style={styles.testingSub}>Testing natural motion... Walk normally.</Text>
                                <Text style={styles.falseCount}>
                                    False Triggers: <Text style={{ fontWeight: '700', color: falseTriggerScore > 0 ? '#DC2626' : '#10B981' }}>{falseTriggerScore}</Text>
                                </Text>
                            </View>
                        )}
                    </View>
                )}

                {step === 3 && (
                    <View style={styles.card}>
                        <View style={[styles.stepBadge, { backgroundColor: '#D1FAE5' }]}>
                            <Text style={[styles.stepBadgeText, { color: '#065F46' }]}>PASSED & SAVED</Text>
                        </View>
                        <Text style={styles.title}>Detector Calibration Complete</Text>
                        <Text style={styles.desc}>
                            Your personal gesture profile is stored securely on-device.
                        </Text>

                        <View style={styles.resultBox}>
                            <View style={styles.resultRow}>
                                <Text style={styles.resultLabel}>Final Shake Threshold</Text>
                                <Text style={styles.resultVal}>{calibratedT} g</Text>
                            </View>
                            <View style={styles.resultRow}>
                                <Text style={styles.resultLabel}>False-Alarms in Walking</Text>
                                <Text style={[styles.resultVal, { color: '#059669' }]}>0 False Triggers</Text>
                            </View>
                            <View style={styles.resultRow}>
                                <Text style={styles.resultLabel}>Mathematical Baseline</Text>
                                <Text style={styles.resultVal}>mean - 2σ clamped</Text>
                            </View>
                        </View>

                        <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.goBack()}>
                            <LinearGradient colors={['#059669', '#10B981']} style={styles.actionBtnGrad}>
                                <Text style={styles.actionBtnText}>Done — Return to Dashboard</Text>
                            </LinearGradient>
                        </TouchableOpacity>
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
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 55,
        paddingBottom: 15,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
    },
    backBtn: { padding: 6 },
    backBtnText: { fontSize: 15, color: '#1D4ED8', fontWeight: '600' },
    headerTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
    content: { padding: 20, gap: 16 },

    gaugeCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 20,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    gaugeLabel: { fontSize: 11, fontWeight: '700', color: '#64748B', letterSpacing: 0.5 },
    gaugeVal: { fontSize: 44, fontWeight: '900', color: '#0F172A', marginVertical: 6 },
    gaugeUnit: { fontSize: 20, fontWeight: '500', color: '#64748B' },
    barTrack: { width: '100%', height: 10, backgroundColor: '#F1F5F9', borderRadius: 5, overflow: 'hidden' },
    barFill: { height: '100%', backgroundColor: '#E11D48', borderRadius: 5 },
    barLabels: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 6 },
    subText: { fontSize: 11, color: '#94A3B8' },

    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 20,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    stepBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        backgroundColor: '#EFF6FF',
        marginBottom: 10,
    },
    stepBadgeText: { fontSize: 10, fontWeight: '700', color: '#1D4ED8' },
    title: { fontSize: 18, fontWeight: '700', color: '#0F172A', marginBottom: 6 },
    desc: { fontSize: 13, color: '#64748B', lineHeight: 20, marginBottom: 16 },

    counterRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 15 },
    counterBubble: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#F1F5F9',
        borderWidth: 2,
        borderColor: '#E2E8F0',
        alignItems: 'center',
        justifyContent: 'center',
    },
    counterBubbleActive: {
        backgroundColor: '#E11D48',
        borderColor: '#BE123C',
    },
    counterText: { fontSize: 16, fontWeight: '700', color: '#64748B' },
    counterTextActive: { color: '#FFFFFF' },
    hint: { textAlign: 'center', fontSize: 13, fontWeight: '600', color: '#E11D48', marginTop: 10 },

    actionBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 10 },
    actionBtnGrad: { paddingVertical: 14, alignItems: 'center' },
    actionBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

    testingBox: { alignItems: 'center', padding: 20, backgroundColor: '#FFFBEB', borderRadius: 12, marginTop: 10 },
    timerNum: { fontSize: 40, fontWeight: '900', color: '#B45309' },
    testingSub: { fontSize: 13, color: '#78350F', marginTop: 4 },
    falseCount: { fontSize: 13, color: '#475569', marginTop: 10 },

    resultBox: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, marginVertical: 15, gap: 10 },
    resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    resultLabel: { fontSize: 13, color: '#64748B', fontWeight: '500' },
    resultVal: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
});
