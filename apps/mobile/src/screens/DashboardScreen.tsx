import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Animated,
    StatusBar,
    Vibration,
    Alert,
    Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Accelerometer } from 'expo-sensors';
import * as Location from 'expo-location';
import { Colors, Spacing, FontSizes, BorderRadius } from '../theme';
import { SheSafeUser } from '../utils/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { computeRisk, type RiskOutput } from '@shesafe/shared';
import { ensureDemoPins } from '../services/pinService';

const { width } = Dimensions.get('window');
const SHAKE_THRESHOLD = 2.5;
const SHAKE_COOLDOWN = 3000; // ms

export default function VictimDashboard({ navigation, route }: any) {
    const user: SheSafeUser = route?.params?.user || { name: 'Priya Sharma', role: 'victim' };

    const [isMonitoring, setIsMonitoring] = useState(true);
    const [shakeCount, setShakeCount] = useState(0);
    const [lastShake, setLastShake] = useState(0);
    const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [locationLabel, setLocationLabel] = useState('Acquiring...');
    const [currentTime, setCurrentTime] = useState(new Date());
    const [risk, setRisk] = useState<RiskOutput>(() => computeRisk({
        now: new Date(),
        lat: 12.9141,
        lng: 74.8560,
        safeHours: { start: '06:00', end: '21:00' },
        reportsNearby: [],
        stationsNearbyM: [900, 1500, 2200],
        openAmenitiesNearby: 3,
        motion: { state: 'still', stillSeconds: 30 },
        batteryPct: 85,
        missedCheckIn: false,
    }));

    // Animations
    const pulseAnim      = useRef(new Animated.Value(1)).current;
    const fadeAnim       = useRef(new Animated.Value(0)).current;
    const waveAnim       = useRef(new Animated.Value(0)).current;
    const shakeFlashAnim = useRef(new Animated.Value(0)).current;
    const shieldAnim     = useRef(new Animated.Value(1)).current;

    const shakeCountRef      = useRef(0);
    const lastShakeRef       = useRef(0);
    const accelSubscription  = useRef<any>(null);

    useEffect(() => {
        void ensureDemoPins();
        Animated.timing(fadeAnim, { toValue: 1, duration: 700, useNativeDriver: true }).start();
        startPulse();
        startWave();
        startShieldBreath();
        getLocation();
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);


    useEffect(() => {
        startShakeDetection();
        return () => stopShakeDetection();
    }, []);

    const startPulse = () => {
        Animated.loop(Animated.sequence([
            Animated.timing(pulseAnim, { toValue: 1.06, duration: 2000, useNativeDriver: true }),
            Animated.timing(pulseAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        ])).start();
    };

    const startWave = () => {
        Animated.loop(Animated.timing(waveAnim, { toValue: 1, duration: 4000, useNativeDriver: false })).start();
    };

    const startShieldBreath = () => {
        Animated.loop(Animated.sequence([
            Animated.timing(shieldAnim, { toValue: 1.08, duration: 1800, useNativeDriver: true }),
            Animated.timing(shieldAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
        ])).start();
    };

    const getLocation = async () => {
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') { setLocationLabel('Permission denied'); return; }
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            setLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
            const [geo] = await Location.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
            if (geo) setLocationLabel(`${geo.district || geo.city || geo.region || 'Tracking'}`);
        } catch {
            setLocationLabel('Location active');
        }
    };

    const startShakeDetection = () => {
        console.log('[SHAKE] Starting shake detection (threshold:', SHAKE_THRESHOLD, ')');
        Accelerometer.setUpdateInterval(100);
        accelSubscription.current = Accelerometer.addListener(({ x, y, z }) => {
            const magnitude = Math.sqrt(x * x + y * y + z * z);
            const now = Date.now();
            if (magnitude > SHAKE_THRESHOLD && now - lastShakeRef.current > 500) {
                lastShakeRef.current = now;
                shakeCountRef.current += 1;
                setShakeCount(c => c + 1);
                console.log(`[SHAKE] #${shakeCountRef.current}/3 — magnitude: ${magnitude.toFixed(2)}`);

                Animated.sequence([
                    Animated.timing(shakeFlashAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
                    Animated.timing(shakeFlashAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
                ]).start();

                if (shakeCountRef.current >= 3) {
                    if (now - lastShakeRef.current < SHAKE_COOLDOWN) {
                        console.log('[SHAKE] 🚨 3 shakes — triggering SOS!');
                        shakeCountRef.current = 0;
                        triggerSOS();
                    }
                }

                setTimeout(() => {
                    if (Date.now() - lastShakeRef.current >= 1500) {
                        shakeCountRef.current = 0;
                        setShakeCount(0);
                    }
                }, 2000);
            }
        });
    };

    const stopShakeDetection = () => {
        if (accelSubscription.current) {
            accelSubscription.current.remove();
            accelSubscription.current = null;
        }
    };

    const triggerSOS = useCallback(() => {
        Vibration.vibrate([0, 300, 100, 300, 100, 300]);
        navigation.navigate('AlertCountdown', { user, location });
    }, [navigation, user, location]);

    const handleLogout = async () => {
        Alert.alert('Logout', 'Are you sure you want to logout?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Logout',
                style: 'destructive',
                onPress: async () => {
                    await AsyncStorage.removeItem('shesafe_current_user');
                    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
                },
            },
        ]);
    };

    const timeString = currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateString = currentTime.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

    return (
        <LinearGradient colors={['#1A0010', '#0D0508', '#080810']} style={styles.container}>
            <StatusBar barStyle="light-content" />

            {/* Shake flash overlay */}
            <Animated.View style={[styles.flashOverlay, { opacity: shakeFlashAnim }]} pointerEvents="none" />

            {/* Header */}
            <Animated.View style={[styles.header, { opacity: fadeAnim }]}>
                <View>
                    <Text style={styles.greeting}>Hello, {user.name?.split(' ')[0]} 👋</Text>
                    <Text style={styles.subGreeting}>{dateString}</Text>
                </View>
                <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                    <Text style={styles.logoutIcon}>⬅️</Text>
                </TouchableOpacity>
            </Animated.View>

            {/* Time */}
            <Animated.View style={[styles.timeContainer, { opacity: fadeAnim }]}>
                <Text style={styles.timeClock}>{timeString}</Text>
            </Animated.View>

            {/* Status cards */}
            <Animated.View style={[styles.statusCards, { opacity: fadeAnim }]}>
                <LinearGradient colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.03)']} style={styles.statusCard}>
                    <Text style={styles.statusCardEmoji}>📍</Text>
                    <Text style={styles.statusCardTitle}>Location</Text>
                    <Text style={styles.statusCardValue} numberOfLines={1}>{locationLabel}</Text>
                </LinearGradient>
                <LinearGradient colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.03)']} style={styles.statusCard}>
                    <Text style={styles.statusCardEmoji}>📱</Text>
                    <Text style={styles.statusCardTitle}>Shake SOS</Text>
                    <Text style={[styles.statusCardValue, { color: isMonitoring ? Colors.safe : Colors.textMuted }]}>
                        {isMonitoring ? 'Active' : 'Off'}
                    </Text>
                </LinearGradient>
                <LinearGradient colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.03)']} style={styles.statusCard}>
                    <Text style={styles.statusCardEmoji}>🛡️</Text>
                    <Text style={styles.statusCardTitle}>Protected</Text>
                    <Text style={[styles.statusCardValue, { color: Colors.safe }]}>Yes</Text>
                </LinearGradient>
            </Animated.View>

            {/* Shake count indicator */}
            {shakeCount > 0 && (
                <View style={styles.shakeIndicator}>
                    <Text style={styles.shakeText}>🔔 Shake detected! {shakeCount}/3</Text>
                </View>
            )}

            {/* Demo Director button */}
            <TouchableOpacity
                style={styles.demoDirectorBtn}
                activeOpacity={0.8}
                onPress={() => navigation.navigate('DemoDirector')}
            >
                <Text style={styles.demoDirectorText}>🎬  Open Demo Director (Evaluation Mode)</Text>
            </TouchableOpacity>

            {/* Prevention Tools Row */}
            <View style={styles.toolsRow}>
                <TouchableOpacity
                    style={styles.toolBtn}
                    onPress={() => navigation.navigate('SafeWalk')}
                >
                    <Text style={styles.toolEmoji}>🚶‍♀️</Text>
                    <Text style={styles.toolLabel}>Safe Walk</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.toolBtn}
                    onPress={() => navigation.navigate('CabGuardian', { user })}
                >
                    <Text style={styles.toolEmoji}>🚕</Text>
                    <Text style={styles.toolLabel}>Cab Guardian</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.toolBtn}
                    onPress={() => navigation.navigate('CommunityReports')}
                >
                    <Text style={styles.toolEmoji}>⚠️</Text>
                    <Text style={styles.toolLabel}>Hazard Map</Text>
                </TouchableOpacity>
            </View>

            {/* Explainable Risk Assessment Card */}
            <TouchableOpacity
                style={styles.riskCard}
                activeOpacity={0.8}
                onPress={() => {
                    const breakdown = risk.factors.length > 0
                        ? risk.factors.map(f => `• ${f.label}: +${f.points} pts`).join('\n')
                        : '• Area rated calm\n• Safe hours active\n• Police stations in range';
                    Alert.alert(
                        `Risk Engine: ${risk.level.toUpperCase()} (${risk.score}/100)`,
                        `Why this score?\n\n${breakdown}\n\n(Deterministic mathematical model - no Math.random)`
                    );
                }}
            >
                <View style={styles.riskHeader}>
                    <Text style={styles.riskTitle}>⚡ THREAT ASSESSMENT</Text>
                    <Text style={styles.riskWhy}>Why this score? ℹ️</Text>
                </View>
                <View style={styles.riskRow}>
                    <Text style={[styles.riskLevel, { color: risk.level === 'safe' ? Colors.safe : Colors.warning }]}>
                        {risk.level.toUpperCase()} ({risk.score}/100)
                    </Text>
                    <Text style={styles.riskExplain}>Tap for factor breakdown</Text>
                </View>
            </TouchableOpacity>

            {/* Shield — interactive SOS button */}
            <Animated.View style={[styles.shieldContainer, { opacity: fadeAnim }]}>
                <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={triggerSOS}
                    accessibilityLabel="Trigger SOS Alert"
                >
                    <Animated.View style={{ transform: [{ scale: shieldAnim }] }}>
                        <LinearGradient
                            colors={['rgba(220,38,38,0.3)', 'rgba(185,28,28,0.1)']}
                            style={styles.shieldCircle}
                        >
                            <Text style={styles.shieldEmoji}>🛡️</Text>
                            <Text style={styles.shieldTitle}>TAP FOR SOS</Text>
                            <Text style={styles.shieldSubtitle}>or shake 3 times</Text>

                            {/* Glow rings */}
                            <View style={[styles.glowRing, styles.ring1]} />
                            <View style={[styles.glowRing, styles.ring2]} />
                        </LinearGradient>
                    </Animated.View>
                </TouchableOpacity>

                <Text style={styles.shakePrompt}>📳 Shake 3 times or tap shield to launch SOS</Text>
            </Animated.View>

            {/* Safety status bar */}
            <LinearGradient
                colors={['rgba(16,185,129,0.12)', 'rgba(16,185,129,0.04)']}
                style={styles.safeStatusBar}
            >
                <View style={styles.safeDot} />
                <Text style={styles.safeStatusText}>
                    🛡️ Monitoring active · Location tracking · Shake detection ON
                </Text>
            </LinearGradient>
        </LinearGradient>
    );
}


const styles = StyleSheet.create({
    container: { flex: 1 },
    flashOverlay: {
        ...(StyleSheet.absoluteFill as any),
        backgroundColor: 'rgba(255,50,50,0.3)',
        zIndex: 99,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.xxl + 10,
        paddingBottom: Spacing.md,
    },
    greeting: { fontSize: FontSizes.xl, fontWeight: '800', color: Colors.text },
    subGreeting: { fontSize: FontSizes.xs, color: Colors.textSecondary, marginTop: 2 },
    logoutBtn: {
        width: 42, height: 42, borderRadius: 21,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: Colors.border,
    },
    logoutIcon: { fontSize: 18 },

    timeContainer: { alignItems: 'center', paddingVertical: Spacing.sm },
    timeClock: {
        fontSize: FontSizes.xxl,
        fontWeight: '300',
        color: Colors.text,
        letterSpacing: 4,
        fontVariant: ['tabular-nums'],
    },

    statusCards: {
        flexDirection: 'row',
        paddingHorizontal: Spacing.lg,
        gap: Spacing.sm,
        marginVertical: Spacing.sm,
    },
    statusCard: {
        flex: 1,
        borderRadius: BorderRadius.md,
        padding: Spacing.sm + 4,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: Colors.glassBorder,
    },
    statusCardEmoji: { fontSize: 22, marginBottom: 4 },
    statusCardTitle: { fontSize: FontSizes.xs, color: Colors.textSecondary, fontWeight: '600' },
    statusCardValue: { fontSize: FontSizes.xs, color: Colors.safe, fontWeight: '700', marginTop: 2, textAlign: 'center' },

    shakeIndicator: {
        marginHorizontal: Spacing.lg,
        backgroundColor: 'rgba(239,68,68,0.2)',
        borderRadius: BorderRadius.sm,
        padding: Spacing.sm,
        borderWidth: 1,
        borderColor: 'rgba(239,68,68,0.4)',
        alignItems: 'center',
        marginBottom: Spacing.sm,
    },
    shakeText: { color: Colors.danger, fontSize: FontSizes.sm, fontWeight: '700' },

    // Shield replaces old SOS button
    shieldContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
    },
    shieldCircle: {
        width: 210,
        height: 210,
        borderRadius: 105,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: 'rgba(192,57,43,0.35)',
        position: 'relative',
    },
    shieldEmoji: { fontSize: 52, marginBottom: 4 },
    shieldTitle: { fontSize: 22, fontWeight: '900', color: Colors.text, letterSpacing: 1 },
    shieldSubtitle: { fontSize: FontSizes.xs, color: Colors.textSecondary, marginTop: 2 },
    glowRing: {
        position: 'absolute',
        borderRadius: 999,
        borderWidth: 1,
    },
    ring1: {
        top: -14, left: -14, right: -14, bottom: -14,
        borderColor: 'rgba(192,57,43,0.2)',
    },
    ring2: {
        top: -28, left: -28, right: -28, bottom: -28,
        borderColor: 'rgba(192,57,43,0.08)',
    },
    shakePrompt: {
        fontSize: FontSizes.sm,
        color: Colors.textSecondary,
        textAlign: 'center',
        letterSpacing: 0.3,
    },

    demoDirectorBtn: {
        marginHorizontal: Spacing.lg,
        marginTop: Spacing.sm,
        marginBottom: Spacing.xs,
        paddingVertical: 10,
        paddingHorizontal: Spacing.md,
        borderRadius: BorderRadius.md,
        backgroundColor: 'rgba(124,58,237,0.2)',
        borderWidth: 1,
        borderColor: 'rgba(124,58,237,0.5)',
        alignItems: 'center',
    },
    demoDirectorText: {
        color: '#DDD6FE',
        fontSize: FontSizes.xs,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    toolsRow: {
        flexDirection: 'row',
        marginHorizontal: Spacing.lg,
        marginTop: Spacing.xs,
        marginBottom: Spacing.xs,
        gap: 8,
    },
    toolBtn: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: BorderRadius.md,
        paddingVertical: 10,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    toolEmoji: { fontSize: 18, marginBottom: 2 },
    toolLabel: { color: '#EEE', fontSize: 11, fontWeight: '700' },
    riskCard: {
        marginHorizontal: Spacing.lg,
        marginTop: Spacing.xs,
        marginBottom: Spacing.sm,
        padding: Spacing.sm + 2,
        borderRadius: BorderRadius.md,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    riskHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    riskTitle: {
        fontSize: 10,
        fontWeight: '800',
        color: Colors.textMuted,
        letterSpacing: 1,
    },
    riskWhy: {
        fontSize: 11,
        color: Colors.primary,
        fontWeight: '600',
    },
    riskRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    riskLevel: {
        fontSize: FontSizes.sm,
        fontWeight: '800',
    },
    riskExplain: {
        fontSize: 11,
        color: Colors.textSecondary,
    },
    safeStatusBar: {
        margin: Spacing.lg,
        borderRadius: BorderRadius.md,
        paddingVertical: Spacing.sm + 4,
        paddingHorizontal: Spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        borderWidth: 1,
        borderColor: 'rgba(16,185,129,0.2)',
    },
    safeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.safe },
    safeStatusText: { color: Colors.safe, fontSize: FontSizes.xs, fontWeight: '600', flex: 1 },
});

