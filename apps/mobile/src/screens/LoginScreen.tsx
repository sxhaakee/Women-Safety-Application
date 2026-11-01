import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Animated,
    StatusBar,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    Dimensions,
    Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Spacing, FontSizes, BorderRadius } from '../theme';
import { loginUser, SheSafeUser } from '../utils/api';
import { savePin } from '../utils/storage';

const { width } = Dimensions.get('window');

const ROLE_CONFIG = {
    victim: {
        label: 'Priya (User)',
        emoji: '🌸',
        color: '#E11D48',
        colorLight: '#FB7185',
        bg: ['#FFFFFF', '#FFF1F2', '#FDF2F8'] as const,
        desc: 'Send SOS · Stream Evidence · Share Location',
    },
    guardian: {
        label: 'Guardian',
        emoji: '🛡️',
        color: '#7C3AED',
        colorLight: '#A78BFA',
        bg: ['#FFFFFF', '#F5F3FF', '#EDE9FE'] as const,
        desc: 'Monitor Alerts · Track Location · View Evidence',
    },
    police: {
        label: 'Police / Dispatch',
        emoji: '👮',
        color: '#2563EB',
        colorLight: '#60A5FA',
        bg: ['#FFFFFF', '#EFF6FF', '#DBEAFE'] as const,
        desc: 'Receive Alerts · Rapid Response · Manage Cases',
    },
    volunteer: {
        label: 'Rakshak / Volunteer',
        emoji: '🤝',
        color: '#059669',
        colorLight: '#34D399',
        bg: ['#FFFFFF', '#ECFDF5', '#D1FAE5'] as const,
        desc: 'Nearby First Responder · Community Patrol',
    },
};

const QUICK_FILL = [
    { label: '🌸 Priya (User)', user: 'victim@demo.shesafe',    pass: 'DemoOnly2024!', role: 'victim'    },
    { label: '🛡️ Guardian',    user: 'guardian@demo.shesafe',  pass: 'DemoOnly2024!', role: 'guardian'  },
    { label: '👮 Police',      user: 'police@demo.shesafe',    pass: 'DemoOnly2024!', role: 'police'    },
    { label: '🤝 Rakshak',     user: 'volunteer@demo.shesafe', pass: 'DemoOnly2024!', role: 'volunteer' },
];

// ─── PIN SETUP STEP (User sets their private security code) ──────────────────

function PinSetupStep({
    user,
    onDone,
}: {
    user: SheSafeUser;
    onDone: (pin: string) => void;
}) {
    const cfg = ROLE_CONFIG['victim'];

    const [stage, setStage]       = useState<'set' | 'confirm'>('set');
    const [firstPin, setFirstPin] = useState('');
    const [input, setInput]       = useState('');
    const [error, setError]       = useState('');

    const shakeAnim = useRef(new Animated.Value(0)).current;
    const fadeAnim  = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    }, []);

    useEffect(() => {
        Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
            Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
        });
    }, [stage]);

    const shake = (msg: string) => {
        setError(msg);
        Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 12,  duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -12, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 8,   duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0,   duration: 60, useNativeDriver: true }),
        ]).start(() => setInput(''));
    };

    const handleDigit = (d: string) => {
        setError('');
        const next = input + d;
        setInput(next);

        if (next.length === 4) {
            if (stage === 'set') {
                setFirstPin(next);
                setTimeout(() => { setStage('confirm'); setInput(''); }, 150);
            } else {
                if (next === firstPin) {
                    onDone(next);
                } else {
                    shake("Codes don't match — try again");
                    setTimeout(() => { setStage('set'); setFirstPin(''); }, 300);
                }
            }
        }
    };

    const handleDelete = () => {
        setError('');
        setInput(p => p.slice(0, -1));
    };

    const DIGITS = [
        ['1', '2', '3'],
        ['4', '5', '6'],
        ['7', '8', '9'],
        ['',  '0', '⌫'],
    ];

    return (
        <LinearGradient colors={cfg.bg as any} style={pinStyles.container}>
            <StatusBar barStyle="dark-content" />
            <Animated.View style={[pinStyles.content, { opacity: fadeAnim }]}>

                <View style={pinStyles.iconCircle}>
                    <Text style={pinStyles.roleEmoji}>🔐</Text>
                </View>
                <Text style={pinStyles.welcome}>
                    {stage === 'set' ? 'Set Your Safety PIN' : 'Confirm Your PIN'}
                </Text>
                <Text style={pinStyles.subtitle}>
                    {stage === 'set'
                        ? 'Choose a 4-digit security PIN. You will enter this\nto cancel an emergency alert countdown.'
                        : 'Enter the same 4 digits again\nto confirm your safety PIN.'}
                </Text>

                {/* PIN dots */}
                <Animated.View style={[pinStyles.dotsRow, { transform: [{ translateX: shakeAnim }] }]}>
                    {[0, 1, 2, 3].map(i => (
                        <View
                            key={i}
                            style={[
                                pinStyles.dot,
                                input.length > i && { borderColor: cfg.color, backgroundColor: '#FFF1F2' },
                            ]}
                        >
                            {input.length > i && <Text style={[pinStyles.dotFilled, { color: cfg.color }]}>•</Text>}
                        </View>
                    ))}
                </Animated.View>

                {error ? (
                    <View style={pinStyles.errorBox}>
                        <Text style={pinStyles.errorText}>⚠️  {error}</Text>
                    </View>
                ) : (
                    <View style={{ height: 32 }} />
                )}

                {/* Numpad */}
                <View style={pinStyles.numpad}>
                    {DIGITS.map((row, ri) => (
                        <View key={ri} style={pinStyles.numpadRow}>
                            {row.map((d, di) => {
                                if (d === '') return <View key={di} style={pinStyles.numpadEmpty} />;
                                return (
                                    <TouchableOpacity
                                        key={di}
                                        style={[pinStyles.key, d === '⌫' && pinStyles.keyBack]}
                                        onPress={() => d === '⌫' ? handleDelete() : handleDigit(d)}
                                        activeOpacity={0.65}
                                    >
                                        <Text style={[pinStyles.keyText, d === '⌫' && pinStyles.keyBackText]}>{d}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    ))}
                </View>

                {/* Progress indicator */}
                <View style={pinStyles.stepRow}>
                    <View style={[pinStyles.stepDot, { backgroundColor: cfg.color }]} />
                    <View style={[pinStyles.stepDot, stage === 'confirm' ? { backgroundColor: cfg.color } : { backgroundColor: '#CBD5E1' }]} />
                </View>
                <Text style={pinStyles.stepLabel}>
                    {stage === 'set' ? 'Step 1 of 2 — Create PIN' : 'Step 2 of 2 — Confirm PIN'}
                </Text>

            </Animated.View>
        </LinearGradient>
    );
}

const pinStyles = StyleSheet.create({
    container: { flex: 1 },
    content: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: Spacing.xl,
        gap: Spacing.sm,
    },
    iconCircle: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: '#FFF1F2',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4,
    },
    roleEmoji: { fontSize: 36 },
    welcome: { fontSize: FontSizes.xxl, fontWeight: '900', color: '#0F172A', textAlign: 'center' },
    subtitle: { fontSize: FontSizes.sm, color: '#64748B', textAlign: 'center', lineHeight: 20 },
    dotsRow: { flexDirection: 'row', gap: Spacing.md, marginVertical: Spacing.md },
    dot: {
        width: 60, height: 68, borderRadius: BorderRadius.md,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1.5, borderColor: '#CBD5E1',
        backgroundColor: '#FFFFFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    dotFilled: { fontSize: 32, fontWeight: '900' },
    errorBox: {
        backgroundColor: '#FEF2F2',
        borderRadius: BorderRadius.sm,
        paddingVertical: 6, paddingHorizontal: Spacing.md,
        borderWidth: 1, borderColor: '#FECACA',
    },
    errorText: { color: '#DC2626', fontSize: FontSizes.sm, fontWeight: '600' },
    numpad: { width: '100%', gap: Spacing.sm },
    numpadRow: { flexDirection: 'row', gap: Spacing.sm, justifyContent: 'center' },
    numpadEmpty: { flex: 1, height: 54 },
    key: {
        flex: 1, height: 54, borderRadius: BorderRadius.md,
        backgroundColor: '#FFFFFF',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: '#E2E8F0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
        elevation: 1,
    },
    keyBack: { backgroundColor: '#FEE2E2', borderColor: '#FECDD3' },
    keyText: { fontSize: FontSizes.xl, color: '#0F172A', fontWeight: '700' },
    keyBackText: { fontSize: FontSizes.md, color: '#DC2626' },
    stepRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
    stepDot: { width: 28, height: 4, borderRadius: 2 },
    stepLabel: { fontSize: FontSizes.xs, color: '#94A3B8', fontWeight: '600' },
});

// ─── MAIN LOGIN SCREEN ────────────────────────────────────────────────────────

export default function LoginScreen({ navigation }: any) {
    const [username, setUsername]         = useState('');
    const [password, setPassword]         = useState('');
    const [loading, setLoading]           = useState(false);
    const [error, setError]               = useState('');
    const [detectedRole, setDetectedRole] = useState<string | null>(null);
    const [loggedInUser, setLoggedInUser] = useState<SheSafeUser | null>(null);

    const fadeAnim    = useRef(new Animated.Value(0)).current;
    const slideAnim   = useRef(new Animated.Value(40)).current;
    const shieldScale = useRef(new Animated.Value(1)).current;
    const errorShake  = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim,  { toValue: 1, duration: 700, useNativeDriver: true }),
            Animated.spring(slideAnim, { toValue: 0, tension: 55, friction: 10, useNativeDriver: true }),
        ]).start();
        Animated.loop(Animated.sequence([
            Animated.timing(shieldScale, { toValue: 1.05, duration: 2200, useNativeDriver: true }),
            Animated.timing(shieldScale, { toValue: 1,    duration: 2200, useNativeDriver: true }),
        ])).start();
    }, []);

    useEffect(() => {
        const u = username.toLowerCase().trim();
        setDetectedRole(
            u.includes('victim') || u.includes('priya') || u.includes('she') ? 'victim' :
            u.includes('guardian') ? 'guardian' :
            u.includes('police') ? 'police' :
            u.includes('volunteer') || u.includes('rakshak') ? 'volunteer' : null
        );
        setError('');
    }, [username]);

    const currentRole = detectedRole ? ROLE_CONFIG[detectedRole as keyof typeof ROLE_CONFIG] : null;

    const shakeError = () => {
        Animated.sequence([
            Animated.timing(errorShake, { toValue: 12,  duration: 70, useNativeDriver: true }),
            Animated.timing(errorShake, { toValue: -12, duration: 70, useNativeDriver: true }),
            Animated.timing(errorShake, { toValue: 8,   duration: 70, useNativeDriver: true }),
            Animated.timing(errorShake, { toValue: 0,   duration: 70, useNativeDriver: true }),
        ]).start();
    };

    const handleLogin = async () => {
        if (!username.trim() || !password.trim()) {
            setError('Please enter username and password');
            shakeError();
            return;
        }
        setLoading(true);
        setError('');
        const user = await loginUser(username, password);
        setLoading(false);
        if (!user) {
            setError('Invalid credentials. Please try again.');
            shakeError();
            return;
        }
        await AsyncStorage.setItem('shesafe_current_user', JSON.stringify(user));
        if (user.role === 'victim') {
            setLoggedInUser(user);
        } else {
            navigateByRole(user);
        }
    };

    const navigateByRole = (user: SheSafeUser, pin?: string) => {
        const route =
            user.role === 'victim'    ? 'VictimDashboard' :
            user.role === 'guardian'  ? 'GuardianDashboard' :
            user.role === 'police'    ? 'PoliceDashboard' :
                                        'VolunteerDashboard';
        navigation.reset({ index: 0, routes: [{ name: route, params: { user: { ...user, pin: pin || '' } } }] });
    };

    if (loggedInUser) {
        return (
            <PinSetupStep
                user={loggedInUser}
                onDone={async (pin) => {
                    await AsyncStorage.setItem('shesafe_victim_pin', pin);
                    await AsyncStorage.setItem('shesafe_pin', pin);
                    await savePin(pin);
                    navigateByRole(loggedInUser, pin);
                }}
            />
        );
    }

    const bgColors = currentRole ? currentRole.bg : (['#FFFFFF', '#F8FAFC', '#F1F5F9'] as const);

    return (
        <LinearGradient colors={bgColors as any} style={styles.container}>
            <StatusBar barStyle="dark-content" />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
                <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

                    {/* Minimalist AI Logo */}
                    <Animated.View style={{ transform: [{ scale: shieldScale }] }}>
                        <View style={styles.logoContainer}>
                            <Image
                                source={require('../../assets/logo_minimal.jpg')}
                                style={styles.logoImage}
                                resizeMode="cover"
                            />
                        </View>
                    </Animated.View>

                    <Text style={styles.appName}>SheSafe</Text>
                    <Text style={styles.tagline}>Intelligent Autonomous Personal Safety</Text>

                    {/* Role detected pill */}
                    {currentRole && (
                        <View style={[styles.roleBadge, { borderColor: currentRole.color + '40', backgroundColor: '#FFFFFF' }]}>
                            <Text style={styles.roleBadgeEmoji}>{currentRole.emoji}</Text>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.roleBadgeLabel, { color: currentRole.color }]}>
                                    Logging in as {currentRole.label}
                                </Text>
                                <Text style={styles.roleBadgeDesc}>{currentRole.desc}</Text>
                            </View>
                        </View>
                    )}

                    {/* Form Card */}
                    <Animated.View style={[styles.form, { transform: [{ translateX: errorShake }] }]}>

                        <View style={styles.inputWrap}>
                            <Text style={styles.inputLabel}>USERNAME</Text>
                            <View style={[styles.inputBox, currentRole && { borderColor: currentRole.color + '50' }]}>
                                <Text style={styles.inputIcon}>👤</Text>
                                <TextInput
                                    style={styles.inputText}
                                    value={username}
                                    onChangeText={setUsername}
                                    placeholder="priya / guardian / police"
                                    placeholderTextColor="#94A3B8"
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                />
                            </View>
                        </View>

                        <View style={styles.inputWrap}>
                            <Text style={styles.inputLabel}>PASSWORD</Text>
                            <View style={[styles.inputBox, currentRole && { borderColor: currentRole.color + '50' }]}>
                                <Text style={styles.inputIcon}>🔒</Text>
                                <TextInput
                                    style={styles.inputText}
                                    value={password}
                                    onChangeText={setPassword}
                                    placeholder="shesafe"
                                    placeholderTextColor="#94A3B8"
                                    secureTextEntry
                                    onSubmitEditing={handleLogin}
                                />
                            </View>
                        </View>

                        {error ? (
                            <View style={styles.errorBox}>
                                <Text style={styles.errorText}>⚠️  {error}</Text>
                            </View>
                        ) : null}

                        <TouchableOpacity
                            style={[styles.loginBtn, loading && { opacity: 0.6 }]}
                            onPress={handleLogin}
                            disabled={loading}
                            activeOpacity={0.85}
                        >
                            <LinearGradient
                                colors={currentRole ? [currentRole.color, currentRole.colorLight] : ['#E11D48', '#FB7185']}
                                style={styles.loginBtnInner}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                            >
                                {loading
                                    ? <ActivityIndicator color="#fff" size="small" />
                                    : <Text style={styles.loginBtnText}>
                                        {currentRole ? `Enter as ${currentRole.label}` : 'Sign In →'}
                                      </Text>
                                }
                            </LinearGradient>
                        </TouchableOpacity>
                    </Animated.View>

                    {/* Quick fill buttons */}
                    <View style={styles.quickSection}>
                        <View style={styles.dividerRow}>
                            <View style={styles.divider} />
                            <Text style={styles.dividerText}>QUICK DEMO ACCESS</Text>
                            <View style={styles.divider} />
                        </View>
                        <View style={styles.quickBtns}>
                            {QUICK_FILL.map(q => {
                                const cfg = ROLE_CONFIG[q.role as keyof typeof ROLE_CONFIG];
                                return (
                                    <TouchableOpacity
                                        key={q.role}
                                        style={[styles.quickBtn, { borderColor: cfg.color + '35' }]}
                                        onPress={() => { setUsername(q.user); setPassword(q.pass); setError(''); }}
                                    >
                                        <Text style={styles.quickEmoji}>{cfg.emoji}</Text>
                                        <Text style={[styles.quickLabel, { color: cfg.color }]}>{q.label}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                        <Text style={styles.credHint}>
                            Demo Password: <Text style={{ color: '#0F172A', fontWeight: '700' }}>shesafe</Text>
                            {'  ·  '}
                            User receives a private Security PIN to disarm SOS
                        </Text>
                    </View>

                </Animated.View>
            </KeyboardAvoidingView>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    flex: { flex: 1 },
    content: {
        flex: 1,
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.xxl + 20,
        paddingBottom: Spacing.xl,
        alignItems: 'center',
        gap: Spacing.md,
    },
    logoContainer: {
        width: 88,
        height: 88,
        borderRadius: 24,
        overflow: 'hidden',
        shadowColor: '#E11D48',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
        elevation: 8,
        borderWidth: 2,
        borderColor: '#FFFFFF',
        backgroundColor: '#FFFFFF',
    },
    logoImage: {
        width: '100%',
        height: '100%',
    },
    appName: { fontSize: 32, fontWeight: '900', color: '#0F172A', letterSpacing: 2 },
    tagline: { fontSize: FontSizes.sm, color: '#64748B', letterSpacing: 0.5, marginTop: -Spacing.sm, fontWeight: '500' },
    roleBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        borderWidth: 1.5,
        gap: Spacing.sm,
        width: '100%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: 2,
    },
    roleBadgeEmoji: { fontSize: 28 },
    roleBadgeLabel: { fontSize: FontSizes.md, fontWeight: '800' },
    roleBadgeDesc: { fontSize: FontSizes.xs, color: '#64748B', marginTop: 2 },
    form: {
        width: '100%',
        gap: Spacing.sm,
        backgroundColor: '#FFFFFF',
        borderRadius: BorderRadius.xl,
        padding: Spacing.lg,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
        elevation: 3,
    },
    inputWrap: { gap: 6 },
    inputLabel: { fontSize: FontSizes.xs, color: '#64748B', fontWeight: '800', letterSpacing: 1 },
    inputBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        borderRadius: BorderRadius.md,
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
        paddingHorizontal: Spacing.md,
        height: 52,
        gap: Spacing.sm,
    },
    inputIcon: { fontSize: 18 },
    inputText: { flex: 1, color: '#0F172A', fontSize: FontSizes.md, fontWeight: '500' },
    errorBox: {
        backgroundColor: '#FEF2F2',
        borderRadius: BorderRadius.sm,
        padding: Spacing.sm + 2,
        borderWidth: 1,
        borderColor: '#FECACA',
    },
    errorText: { color: '#DC2626', fontSize: FontSizes.sm, fontWeight: '600' },
    loginBtn: {
        borderRadius: BorderRadius.md,
        overflow: 'hidden',
        shadowColor: '#E11D48',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
        elevation: 6,
        marginTop: Spacing.xs,
    },
    loginBtnInner: {
        paddingVertical: Spacing.md + 2,
        alignItems: 'center',
    },
    loginBtnText: { color: '#FFFFFF', fontSize: FontSizes.lg, fontWeight: '800', letterSpacing: 0.5 },
    quickSection: { width: '100%', marginTop: Spacing.sm },
    dividerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
    divider: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
    dividerText: { fontSize: FontSizes.xs, color: '#94A3B8', fontWeight: '800', letterSpacing: 1 },
    quickBtns: { flexDirection: 'row', gap: Spacing.sm },
    quickBtn: {
        flex: 1,
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: BorderRadius.md,
        paddingVertical: Spacing.sm + 4,
        borderWidth: 1.5,
        gap: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
        elevation: 1,
    },
    quickEmoji: { fontSize: 20 },
    quickLabel: { fontSize: 11, fontWeight: '700' },
    credHint: { textAlign: 'center', color: '#94A3B8', fontSize: FontSizes.xs, marginTop: Spacing.sm },
});
