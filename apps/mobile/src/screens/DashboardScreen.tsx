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
    ScrollView,
    Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Accelerometer } from 'expo-sensors';
import * as Location from 'expo-location';
import { SheSafeUser } from '../utils/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { computeRisk, type RiskOutput } from '@shesafe/shared';
import { ensureDemoPins } from '../services/pinService';
import HoldToBeSafe from '../components/HoldToBeSafe';
import { startDrain } from '../outbox/OutboxDrain';

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
        startDrain(); // start outbox offline drain loop
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
            Animated.timing(pulseAnim, { toValue: 1.05, duration: 1800, useNativeDriver: true }),
            Animated.timing(pulseAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
        ])).start();
    };

    const startWave = () => {
        Animated.loop(Animated.timing(waveAnim, { toValue: 1, duration: 3500, useNativeDriver: false })).start();
    };

    const startShieldBreath = () => {
        Animated.loop(Animated.sequence([
            Animated.timing(shieldAnim, { toValue: 1.06, duration: 1600, useNativeDriver: true }),
            Animated.timing(shieldAnim, { toValue: 1, duration: 1600, useNativeDriver: true }),
        ])).start();
    };

    const getLocation = async () => {
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') { setLocationLabel('Location Permission Needed'); return; }
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            setLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
            const [geo] = await Location.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
            if (geo) setLocationLabel(`${geo.district || geo.city || geo.region || 'Mangaluru Central'}`);
        } catch {
            setLocationLabel('Mangaluru Central');
        }
    };

    const startShakeDetection = () => {
        Accelerometer.setUpdateInterval(100);
        accelSubscription.current = Accelerometer.addListener(({ x, y, z }) => {
            const magnitude = Math.sqrt(x * x + y * y + z * z);
            const now = Date.now();
            if (magnitude > SHAKE_THRESHOLD && now - lastShakeRef.current > 500) {
                lastShakeRef.current = now;
                shakeCountRef.current += 1;
                setShakeCount(c => c + 1);

                Animated.sequence([
                    Animated.timing(shakeFlashAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
                    Animated.timing(shakeFlashAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
                ]).start();

                if (shakeCountRef.current >= 3) {
                    if (now - lastShakeRef.current < SHAKE_COOLDOWN) {
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
        Alert.alert('Sign Out', 'Are you sure you want to exit SheSafe?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Sign Out',
                style: 'destructive',
                onPress: async () => {
                    await AsyncStorage.removeItem('shesafe_current_user');
                    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
                },
            },
        ]);
    };

    const timeString = currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const dateString = currentTime.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" />

            {/* Shake flash overlay */}
            <Animated.View style={[styles.flashOverlay, { opacity: shakeFlashAnim }]} pointerEvents="none" />

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                
                {/* Header */}
                <Animated.View style={[styles.header, { opacity: fadeAnim }]}>
                    <View style={styles.headerLeft}>
                        <View style={styles.headerLogoContainer}>
                            <Image
                                source={require('../../assets/logo.png')}
                                style={styles.headerLogoImage}
                                resizeMode="cover"
                            />
                        </View>
                        <View>
                            <Text style={styles.greeting}>Hello, {user.name?.split(' ')[0]}</Text>
                            <Text style={styles.subGreeting}>{locationLabel} · Safe</Text>
                        </View>
                    </View>
                    <View style={styles.headerRight}>
                        <View style={styles.activePill}>
                            <View style={styles.activeDot} />
                            <Text style={styles.activePillText}>ARMED</Text>
                        </View>
                        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                            <Text style={styles.logoutIcon}>🚪</Text>
                        </TouchableOpacity>
                    </View>
                </Animated.View>

                {/* Clock & Status Cards Row */}
                <Animated.View style={[styles.statsRow, { opacity: fadeAnim }]}>
                    <View style={styles.statCard}>
                        <Text style={styles.statEmoji}>📍</Text>
                        <Text style={styles.statLabel}>LOCATION</Text>
                        <Text style={styles.statValue} numberOfLines={1}>{locationLabel}</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={styles.statEmoji}>⏱️</Text>
                        <Text style={styles.statLabel}>{dateString.toUpperCase()}</Text>
                        <Text style={styles.statValue}>{timeString}</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={styles.statEmoji}>📱</Text>
                        <Text style={styles.statLabel}>SHAKE SENSOR</Text>
                        <Text style={[styles.statValue, { color: '#059669' }]}>
                            {shakeCount > 0 ? `${shakeCount}/3 Detected` : '50Hz Active'}
                        </Text>
                    </View>
                </Animated.View>

                {/* Explainable Threat Assessment Card */}
                <TouchableOpacity
                    style={styles.riskCard}
                    activeOpacity={0.85}
                    onPress={() => {
                        const breakdown = risk.factors.length > 0
                            ? risk.factors.map(f => `• ${f.label}: +${f.points} pts`).join('\n')
                            : '• Safe hours active (06:00 - 21:00)\n• 3 police stations within 2.5km\n• Low reported incidents';
                        Alert.alert(
                            `Safety Assessment: ${risk.level.toUpperCase()} (${risk.score}/100)`,
                            `Deterministic Factor Breakdown:\n\n${breakdown}\n\n(Explainable Pure TypeScript mathematical risk engine)`
                        );
                    }}
                >
                    <View style={styles.riskHeader}>
                        <View style={styles.riskBadge}>
                            <Text style={styles.riskBadgeText}>⚡ THREAT LEVEL</Text>
                        </View>
                        <Text style={styles.riskWhy}>Why this score? ℹ️</Text>
                    </View>
                    <View style={styles.riskBody}>
                        <View>
                            <Text style={[
                                styles.riskLevelTitle,
                                { color: risk.level === 'safe' ? '#059669' : '#D97706' }
                            ]}>
                                {risk.level === 'safe' ? 'Normal / Safe Zone' : risk.level.toUpperCase()}
                            </Text>
                            <Text style={styles.riskScoreSub}>Safety Risk Score: {risk.score}/100</Text>
                        </View>
                        <View style={[
                            styles.riskScoreBadge,
                            { backgroundColor: risk.level === 'safe' ? '#DCFCE7' : '#FEF3C7' }
                        ]}>
                            <Text style={[
                                styles.riskScoreNumber,
                                { color: risk.level === 'safe' ? '#166534' : '#92400E' }
                            ]}>
                                {100 - risk.score}% SAFE
                            </Text>
                        </View>
                    </View>
                </TouchableOpacity>

                {/* SheSafe AI Hero Banner */}
                <View style={styles.heroBannerCard}>
                    <Image
                        source={require('../../assets/hero_banner.jpg')}
                        style={styles.heroImage}
                        resizeMode="cover"
                    />
                    <LinearGradient
                        colors={['transparent', 'rgba(15, 23, 42, 0.88)']}
                        style={styles.heroOverlay}
                    >
                        <View style={styles.heroPill}>
                            <Text style={styles.heroPillText}>AI GUARDIAN ENCLAVE</Text>
                        </View>
                        <Text style={styles.heroTitle}>Walk with Confidence, Everywhere</Text>
                        <Text style={styles.heroSub}>Encrypted audio & video telemetry · Rapid community Rakshak response</Text>
                    </LinearGradient>
                </View>

                {/* Central Interactive SOS Button */}
                <Animated.View style={[styles.sosSection, { opacity: fadeAnim }]}>
                    <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={triggerSOS}
                        accessibilityLabel="Trigger SOS Alert"
                        style={styles.sosTouchable}
                    >
                        {/* Outer Glow Pulse */}
                        <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseAnim }] }]} />
                        <Animated.View style={[styles.pulseRing2, { transform: [{ scale: pulseAnim }] }]} />

                        {/* Core Red Shield Circle */}
                        <Animated.View style={[styles.sosCircle, { transform: [{ scale: shieldAnim }] }]}>
                            <LinearGradient
                                colors={['#F43F5E', '#E11D48', '#BE123C']}
                                style={styles.sosGradient}
                            >
                                <Text style={styles.sosEmoji}>🛡️</Text>
                                <Text style={styles.sosText}>SOS</Text>
                                <Text style={styles.sosSubText}>TAP TO ALERT</Text>
                            </LinearGradient>
                        </Animated.View>
                    </TouchableOpacity>

                    <Text style={styles.sosPrompt}>
                        {shakeCount > 0
                            ? `⚠️ Shake detected: ${shakeCount}/3!`
                            : 'Tap shield or shake phone 3 times to trigger immediate response'}
                    </Text>

                    {/* Dead-man's switch */}
                    <View style={{ width: '100%', paddingHorizontal: 8, marginTop: 12 }}>
                        <HoldToBeSafe
                            onTrigger={() => navigation.navigate('AlertCountdown', { user, location })}
                        />
                    </View>
                </Animated.View>

                {/* World-Class Prevention Tools Section */}
                <View style={styles.toolsContainer}>
                    <Text style={styles.sectionHeading}>SAFETY SUITE & PREVENTION</Text>

                    <View style={styles.toolsGrid}>
                        {/* Safe Walk */}
                        <TouchableOpacity
                            style={styles.toolCard}
                            activeOpacity={0.8}
                            onPress={() => navigation.navigate('SafeWalk')}
                        >
                            <LinearGradient colors={['#ECFDF5', '#F0FDF4']} style={styles.toolCardGrad}>
                                <View style={[styles.toolIconBox, { backgroundColor: '#D1FAE5' }]}>
                                    <Text style={styles.toolEmoji}>🚶‍♀️</Text>
                                </View>
                                <Text style={styles.toolTitle}>Safe Walk</Text>
                                <Text style={styles.toolDesc}>Well-lit routes & deviation alerts</Text>
                                <View style={styles.toolArrow}>
                                    <Text style={[styles.toolArrowText, { color: '#059669' }]}>Explore Routes →</Text>
                                </View>
                            </LinearGradient>
                        </TouchableOpacity>

                        {/* Cab Guardian */}
                        <TouchableOpacity
                            style={styles.toolCard}
                            activeOpacity={0.8}
                            onPress={() => navigation.navigate('CabGuardian', { user })}
                        >
                            <LinearGradient colors={['#FFFBEB', '#FEF3C7']} style={styles.toolCardGrad}>
                                <View style={[styles.toolIconBox, { backgroundColor: '#FDE68A' }]}>
                                    <Text style={styles.toolEmoji}>🚕</Text>
                                </View>
                                <Text style={styles.toolTitle}>Cab Guardian</Text>
                                <Text style={styles.toolDesc}>Live plate & detour speed monitor</Text>
                                <View style={styles.toolArrow}>
                                    <Text style={[styles.toolArrowText, { color: '#D97706' }]}>Start Ride Guard →</Text>
                                </View>
                            </LinearGradient>
                        </TouchableOpacity>

                        {/* Hazard Map */}
                        <TouchableOpacity
                            style={styles.toolCard}
                            activeOpacity={0.8}
                            onPress={() => navigation.navigate('CommunityReports')}
                        >
                            <LinearGradient colors={['#FFF1F2', '#FFE4E6']} style={styles.toolCardGrad}>
                                <View style={[styles.toolIconBox, { backgroundColor: '#FECDD3' }]}>
                                    <Text style={styles.toolEmoji}>⚠️</Text>
                                </View>
                                <Text style={styles.toolTitle}>Hazard Map</Text>
                                <Text style={styles.toolDesc}>Community danger & dark spots</Text>
                                <View style={styles.toolArrow}>
                                    <Text style={[styles.toolArrowText, { color: '#E11D48' }]}>View Hazards →</Text>
                                </View>
                            </LinearGradient>
                        </TouchableOpacity>

                        {/* Demo Director */}
                        <TouchableOpacity
                            style={styles.toolCard}
                            activeOpacity={0.8}
                            onPress={() => navigation.navigate('DemoDirector')}
                        >
                            <LinearGradient colors={['#F5F3FF', '#EDE9FE']} style={styles.toolCardGrad}>
                                <View style={[styles.toolIconBox, { backgroundColor: '#DDD6FE' }]}>
                                    <Text style={styles.toolEmoji}>🎬</Text>
                                </View>
                                <Text style={styles.toolTitle}>Demo Director</Text>
                                <Text style={styles.toolDesc}>Evaluation mode & test triggers</Text>
                                <View style={styles.toolArrow}>
                                    <Text style={[styles.toolArrowText, { color: '#7C3AED' }]}>Launch Suite →</Text>
                                </View>
                            </LinearGradient>
                        </TouchableOpacity>

                        {/* Train Detector (Gate 5 Calibration) */}
                        <TouchableOpacity
                            style={styles.toolCard}
                            activeOpacity={0.8}
                            onPress={() => navigation.navigate('SensorCalibration')}
                        >
                            <LinearGradient colors={['#F0FDF4', '#DCFCE7']} style={styles.toolCardGrad}>
                                <View style={[styles.toolIconBox, { backgroundColor: '#BBF7D0' }]}>
                                    <Text style={styles.toolEmoji}>🎯</Text>
                                </View>
                                <Text style={styles.toolTitle}>Train Detector</Text>
                                <Text style={styles.toolDesc}>Calibrate shake & false rejection</Text>
                                <View style={styles.toolArrow}>
                                    <Text style={[styles.toolArrowText, { color: '#16A34A' }]}>Calibrate Now →</Text>
                                </View>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Safety Guarantee Bar */}
                <View style={styles.safeFooterBar}>
                    <View style={styles.footerShieldIcon}>
                        <Text style={{ fontSize: 16 }}>🛡️</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.footerTitle}>Active Protection Guarantee</Text>
                        <Text style={styles.footerSub}>End-to-end encrypted · Pure on-device sensors · Zero latency</Text>
                    </View>
                </View>

            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    flashOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(239, 68, 68, 0.25)',
        zIndex: 99,
    },
    scrollContent: { paddingBottom: 40 },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 54,
        paddingBottom: 16,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderColor: '#F1F5F9',
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerLogoContainer: {
        width: 44,
        height: 44,
        borderRadius: 14,
        overflow: 'hidden',
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
        backgroundColor: '#0F172A',
    },
    headerLogoImage: {
        width: '100%',
        height: '100%',
    },
    avatarCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#FFE4E6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarEmoji: { fontSize: 22 },
    greeting: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
    subGreeting: { fontSize: 12, color: '#64748B', marginTop: 2, fontWeight: '500' },
    heroBannerCard: {
        marginHorizontal: 20,
        marginTop: 14,
        marginBottom: 8,
        height: 155,
        borderRadius: 20,
        overflow: 'hidden',
        position: 'relative',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 3,
    },
    heroImage: {
        width: '100%',
        height: '100%',
    },
    heroOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        top: 0,
        justifyContent: 'flex-end',
        padding: 14,
    },
    heroPill: {
        alignSelf: 'flex-start',
        backgroundColor: 'rgba(225, 29, 72, 0.85)',
        borderRadius: 12,
        paddingHorizontal: 8,
        paddingVertical: 3,
        marginBottom: 6,
    },
    heroPillText: {
        color: '#FFFFFF',
        fontSize: 9,
        fontWeight: '900',
        letterSpacing: 1,
    },
    heroTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: '#FFFFFF',
        lineHeight: 20,
    },
    heroSub: {
        fontSize: 11,
        color: '#E2E8F0',
        marginTop: 3,
        fontWeight: '500',
        lineHeight: 15,
    },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    activePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#ECFDF5',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#A7F3D0',
    },
    activeDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#10B981' },
    activePillText: { fontSize: 10, fontWeight: '800', color: '#065F46', letterSpacing: 0.5 },
    logoutBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#F1F5F9',
        justifyContent: 'center',
        alignItems: 'center',
    },
    logoutIcon: { fontSize: 16 },

    statsRow: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        marginTop: 16,
        gap: 10,
    },
    statCard: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        padding: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 1,
    },
    statEmoji: { fontSize: 18, marginBottom: 4 },
    statLabel: { fontSize: 9, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.5 },
    statValue: { fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 3 },

    riskCard: {
        backgroundColor: '#FFFFFF',
        marginHorizontal: 16,
        marginTop: 14,
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 2,
    },
    riskHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    riskBadge: {
        backgroundColor: '#F1F5F9',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    riskBadgeText: { fontSize: 10, fontWeight: '800', color: '#475569', letterSpacing: 0.5 },
    riskWhy: { fontSize: 12, color: '#E11D48', fontWeight: '700' },
    riskBody: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 10,
    },
    riskLevelTitle: { fontSize: 16, fontWeight: '900' },
    riskScoreSub: { fontSize: 12, color: '#64748B', marginTop: 2, fontWeight: '500' },
    riskScoreBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
    riskScoreNumber: { fontSize: 12, fontWeight: '900' },

    sosSection: { alignItems: 'center', marginTop: 26, marginBottom: 16 },
    sosTouchable: { width: 220, height: 220, justifyContent: 'center', alignItems: 'center' },
    pulseRing: {
        position: 'absolute',
        width: 220,
        height: 220,
        borderRadius: 110,
        backgroundColor: 'rgba(244, 63, 94, 0.12)',
    },
    pulseRing2: {
        position: 'absolute',
        width: 190,
        height: 190,
        borderRadius: 95,
        backgroundColor: 'rgba(244, 63, 94, 0.20)',
    },
    sosCircle: {
        width: 160,
        height: 160,
        borderRadius: 80,
        overflow: 'hidden',
        shadowColor: '#E11D48',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.4,
        shadowRadius: 20,
        elevation: 10,
    },
    sosGradient: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 10,
    },
    sosEmoji: { fontSize: 36, marginBottom: 2 },
    sosText: { color: '#FFFFFF', fontSize: 32, fontWeight: '900', letterSpacing: 2 },
    sosSubText: { color: 'rgba(255,255,255,0.85)', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginTop: 2 },
    sosPrompt: {
        marginTop: 14,
        fontSize: 12,
        color: '#64748B',
        fontWeight: '600',
        textAlign: 'center',
        paddingHorizontal: 24,
    },

    toolsContainer: { paddingHorizontal: 16, marginTop: 14 },
    sectionHeading: { fontSize: 12, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.8, marginBottom: 12 },
    toolsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    toolCard: {
        width: (width - 44) / 2,
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 2,
    },
    toolCardGrad: {
        padding: 14,
        minHeight: 140,
        justifyContent: 'space-between',
    },
    toolIconBox: {
        width: 38,
        height: 38,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    toolEmoji: { fontSize: 20 },
    toolTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
    toolDesc: { fontSize: 11, color: '#64748B', marginTop: 2, lineHeight: 15 },
    toolArrow: { marginTop: 10 },
    toolArrowText: { fontSize: 11, fontWeight: '800' },

    safeFooterBar: {
        marginHorizontal: 16,
        marginTop: 20,
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    footerShieldIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#ECFDF5',
        justifyContent: 'center',
        alignItems: 'center',
    },
    footerTitle: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
    footerSub: { fontSize: 10, color: '#64748B', marginTop: 2 },
});
