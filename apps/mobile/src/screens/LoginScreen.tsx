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
        label: 'She / Her',
        emoji: '🆘',
        color: Colors.victim,
        colorLight: Colors.victimLight,
        bg: ['#2D0010', '#160008', '#080810'] as const,
        desc: 'Send SOS · Record Evidence · Share Location',
    },
    guardian: {
        label: 'Guardian',
        emoji: '🛡️',
        color: Colors.guardian,
        colorLight: Colors.guardianLight,
        bg: ['#130A30', '#09061A', '#080810'] as const,
        desc: 'Monitor Alerts · Track Location · View Evidence',
    },
    police: {
        label: 'Police',
        emoji: '👮',
        color: Colors.police,
        colorLight: Colors.policeLight,
        bg: ['#081030', '#050A20', '#080810'] as const,
        desc: 'Receive Alerts · Locate Her · Manage Cases',
    },
    volunteer: {
        label: 'Volunteer / Rakshak',
        emoji: '🤝',
        color: '#059669',
        colorLight: '#10B981',
        bg: ['#042F2E', '#022120', '#080810'] as const,
        desc: 'Respond to Nearby SOS · First Responder · Community Patrol',
    },
};

const QUICK_FILL = [
    { label: 'She / Her', user: 'victim@demo.shesafe',   pass: 'DemoOnly2024!', role: 'victim'   },
    { label: 'Guardian',  user: 'guardian@demo.shesafe', pass: 'DemoOnly2024!', role: 'guardian' },
    { label: 'Police',    user: 'police@demo.shesafe',   pass: 'DemoOnly2024!', role: 'police'   },
    { label: 'Volunteer', user: 'volunteer@demo.shesafe', pass: 'DemoOnly2024!', role: 'volunteer' },
];

// ─── PIN SETUP STEP (victim sets their own code) ──────────────

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
        // Also re-fade when moving to confirm stage
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
                // Move to confirm stage
                setFirstPin(next);
                setTimeout(() => { setStage('confirm'); setInput(''); }, 150);
            } else {
                // Confirm stage — check match
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
            <StatusBar barStyle="light-content" />
            <Animated.View style={[pinStyles.content, { opacity: fadeAnim }]}>

                <Text style={pinStyles.roleEmoji}>🔐</Text>
                <Text style={pinStyles.welcome}>
                    {stage === 'set' ? 'Set Your Safety Code' : 'Confirm Your Code'}
                </Text>
                <Text style={pinStyles.subtitle}>
                    {stage === 'set'
                        ? 'Choose a 4-digit code. You\'ll enter this\nto cancel an SOS alert countdown.'
                        : 'Enter the same 4 digits again\nto confirm your code.'}
                </Text>

                {/* PIN dots */}
                <Animated.View style={[pinStyles.dotsRow, { transform: [{ translateX: shakeAnim }] }]}>
                    {[0,1,2,3].map(i => (
                        <LinearGradient
                            key={i}
                            colors={input.length > i ? [cfg.color + '55', cfg.color + '22'] : ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.04)']}
                            style={[pinStyles.dot, input.length > i && { borderColor: cfg.color }]}
                        >
                            {input.length > i && <Text style={[pinStyles.dotFilled, { color: cfg.color }]}>•</Text>}
                        </LinearGradient>
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
                    <View style={[pinStyles.stepDot, stage === 'confirm' ? { backgroundColor: cfg.color } : { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
                </View>
                <Text style={pinStyles.stepLabel}>
                    {stage === 'set' ? 'Step 1 of 2 — Set code' : 'Step 2 of 2 — Confirm code'}
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
    roleEmoji: { fontSize: 56 },
    welcome: { fontSize: FontSizes.xxl, fontWeight: '900', color: Colors.text, textAlign: 'center' },
    subtitle: { fontSize: FontSizes.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
    dotsRow: { flexDirection: 'row', gap: Spacing.md, marginVertical: Spacing.md },
    dot: {
        width: 64, height: 72, borderRadius: BorderRadius.md,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1.5, borderColor: Colors.border,
    },
    dotFilled: { fontSize: 32, fontWeight: '900' },
    errorBox: {
        backgroundColor: 'rgba(239,68,68,0.12)',
        borderRadius: BorderRadius.sm,
        paddingVertical: 6, paddingHorizontal: Spacing.md,
        borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
    },
    errorText: { color: Colors.danger, fontSize: FontSizes.sm, fontWeight: '600' },
    numpad: { width: '100%', gap: Spacing.sm },
    numpadRow: { flexDirection: 'row', gap: Spacing.sm, justifyContent: 'center' },
    numpadEmpty: { flex: 1, height: 54 },
    key: {
        flex: 1, height: 54, borderRadius: BorderRadius.md,
        backgroundColor: 'rgba(255,255,255,0.09)',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    },
    keyBack: { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.2)' },
    keyText: { fontSize: FontSizes.xl, color: Colors.text, fontWeight: '700' },
    keyBackText: { fontSize: FontSizes.md, color: Colors.danger },
    stepRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
    stepDot: { width: 28, height: 4, borderRadius: 2 },
    stepLabel: { fontSize: FontSizes.xs, color: Colors.textMuted, fontWeight: '600' },
});

// ─── MAIN LOGIN SCREEN ─────────────────────────────────────────

export default function LoginScreen({ navigation }: any) {
    const [username, setUsername]   = useState('');
    const [password, setPassword]   = useState('');
    const [loading, setLoading]     = useState(false);
    const [error, setError]         = useState('');
    const [detectedRole, setDetectedRole] = useState<string | null>(null);
    const [loggedInUser, setLoggedInUser] = useState<SheSafeUser | null>(null); // PIN setup step (victim only)

    const fadeAnim    = useRef(new Animated.Value(0)).current;
    const slideAnim   = useRef(new Animated.Value(50)).current;
    const shieldScale = useRef(new Animated.Value(1)).current;
    const errorShake  = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim,  { toValue: 1, duration: 700, useNativeDriver: true }),
            Animated.spring(slideAnim, { toValue: 0, tension: 55, friction: 10, useNativeDriver: true }),
        ]).start();
        // Shield breathe
        Animated.loop(Animated.sequence([
            Animated.timing(shieldScale, { toValue: 1.07, duration: 2000, useNativeDriver: true }),
            Animated.timing(shieldScale, { toValue: 1,    duration: 2000, useNativeDriver: true }),
        ])).start();
    }, []);

    useEffect(() => {
        const u = username.toLowerCase().trim();
        setDetectedRole(
            u.includes('victim') ? 'victim' :
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
            setError('Enter username and password');
            shakeError();
            return;
        }
        setLoading(true);
        setError('');
        const user = await loginUser(username, password);
        setLoading(false);
        if (!user) {
            setError('Wrong credentials. Try again.');
            shakeError();
            return;
        }
        // Save session (without PIN yet — victim will set it next)
        await AsyncStorage.setItem('shesafe_current_user', JSON.stringify(user));
        // Only victim sets a PIN — guardian/police/volunteer go straight to dashboard
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
        // Pass the user-set PIN through to the victim dashboard
        navigation.reset({ index: 0, routes: [{ name: route, params: { user: { ...user, pin: pin || '' } } }] });
    };

    // ── PIN setup step (victim only) ───────────────────────────
    if (loggedInUser) {
        return (
            <PinSetupStep
                user={loggedInUser}
                onDone={async (pin) => {
                    // Save PIN to AsyncStorage and storage service so all screens can read it
                    await AsyncStorage.setItem('shesafe_victim_pin', pin);
                    await AsyncStorage.setItem('shesafe_pin', pin);
                    await savePin(pin);
                    navigateByRole(loggedInUser, pin);
                }}
            />
        );
    }

    // ── Login form ─────────────────────────────────────────────
    const bgColors = currentRole ? currentRole.bg : (['#0C0A1E', '#080810', '#080810'] as const);

    return (
        <LinearGradient colors={bgColors as any} style={styles.container}>
            <StatusBar barStyle="light-content" />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
                <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

                    {/* Shield logo */}
                    <Animated.View style={{ transform: [{ scale: shieldScale }] }}>
                        <View style={styles.logoContainer}>
                            <Image
                                source={require('../../assets/logo.png')}
                                style={styles.logoImage}
                                resizeMode="cover"
                            />
                        </View>
                    </Animated.View>

                    <Text style={styles.appName}>SheSafe</Text>
                    <Text style={styles.tagline}>Your safety, always on</Text>

                    {/* Role detected badge */}
                    {currentRole && (
                        <View style={[styles.roleBadge, { borderColor: currentRole.color + '60' }]}>
                            <Text style={styles.roleBadgeEmoji}>{currentRole.emoji}</Text>
                            <View>
                                <Text style={[styles.roleBadgeLabel, { color: currentRole.color }]}>
                                    Logging in as {currentRole.label}
                                </Text>
                                <Text style={styles.roleBadgeDesc}>{currentRole.desc}</Text>
                            </View>
                        </View>
                    )}

                    {/* Form */}
                    <Animated.View style={[styles.form, { transform: [{ translateX: errorShake }] }]}>

                        <View style={styles.inputWrap}>
                            <Text style={styles.inputLabel}>USERNAME</Text>
                            <View style={[styles.inputBox, currentRole && { borderColor: currentRole.color + '70' }]}>
                                <Text style={styles.inputIcon}>👤</Text>
                                <TextInput
                                    style={styles.inputText}
                                    value={username}
                                    onChangeText={setUsername}
                                    placeholder="she / guardian / police"
                                    placeholderTextColor={Colors.textMuted}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                />
                            </View>
                        </View>

                        <View style={styles.inputWrap}>
                            <Text style={styles.inputLabel}>PASSWORD</Text>
                            <View style={[styles.inputBox, currentRole && { borderColor: currentRole.color + '70' }]}>
                                <Text style={styles.inputIcon}>🔒</Text>
                                <TextInput
                                    style={styles.inputText}
                                    value={password}
                                    onChangeText={setPassword}
                                    placeholder="shesafe"
                                    placeholderTextColor={Colors.textMuted}
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
                                colors={currentRole ? [currentRole.color, currentRole.colorLight] : [Colors.primary, Colors.primaryLight]}
                                style={styles.loginBtnInner}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                            >
                                {loading
                                    ? <ActivityIndicator color="#fff" size="small" />
                                    : <Text style={styles.loginBtnText}>
                                        {currentRole ? `Login as ${currentRole.label}` : 'Login →'}
                                      </Text>
                                }
                            </LinearGradient>
                        </TouchableOpacity>
                    </Animated.View>

                    {/* Quick fill */}
                    <View style={styles.quickSection}>
                        <View style={styles.dividerRow}>
                            <View style={styles.divider} />
                            <Text style={styles.dividerText}>QUICK DEMO LOGIN</Text>
                            <View style={styles.divider} />
                        </View>
                        <View style={styles.quickBtns}>
                            {QUICK_FILL.map(q => {
                                const cfg = ROLE_CONFIG[q.role as keyof typeof ROLE_CONFIG];
                                return (
                                    <TouchableOpacity
                                        key={q.role}
                                        style={[styles.quickBtn, { borderColor: cfg.color + '55' }]}
                                        onPress={() => { setUsername(q.user); setPassword(q.pass); setError(''); }}
                                    >
                                        <Text style={styles.quickEmoji}>{cfg.emoji}</Text>
                                        <Text style={[styles.quickLabel, { color: cfg.color }]}>{q.label}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    <Text style={styles.credHint}>
                            Password: <Text style={{ color: Colors.textSecondary, fontWeight: '700' }}>shesafe</Text>
                            {'  ·  '}
                            Victim gets a safety PIN to cancel SOS
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
        width: 96,
        height: 96,
        borderRadius: 28,
        overflow: 'hidden',
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.6,
        shadowRadius: 24,
        elevation: 16,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.2)',
        backgroundColor: '#0F172A',
    },
    logoImage: {
        width: '100%',
        height: '100%',
    },
    logoGradient: {
        width: 92,
        height: 92,
        borderRadius: 26,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.6,
        shadowRadius: 24,
        elevation: 16,
    },
    logoEmoji: { fontSize: 42 },
    appName: { fontSize: 34, fontWeight: '900', color: Colors.text, letterSpacing: 3 },
    tagline: { fontSize: FontSizes.sm, color: Colors.textSecondary, letterSpacing: 1, marginTop: -Spacing.sm },
    roleBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
        borderWidth: 1,
        gap: Spacing.sm,
        width: '100%',
    },
    roleBadgeEmoji: { fontSize: 26 },
    roleBadgeLabel: { fontSize: FontSizes.md, fontWeight: '700' },
    roleBadgeDesc: { fontSize: FontSizes.xs, color: Colors.textSecondary, marginTop: 2 },
    form: { width: '100%', gap: Spacing.sm },
    inputWrap: { gap: 6 },
    inputLabel: { fontSize: FontSizes.xs, color: Colors.textMuted, fontWeight: '700', letterSpacing: 1.5 },
    inputBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.07)',
        borderRadius: BorderRadius.md,
        borderWidth: 1,
        borderColor: Colors.border,
        paddingHorizontal: Spacing.md,
        height: 52,
        gap: Spacing.sm,
    },
    inputIcon: { fontSize: 18 },
    inputText: { flex: 1, color: Colors.text, fontSize: FontSizes.md },
    errorBox: {
        backgroundColor: 'rgba(239,68,68,0.12)',
        borderRadius: BorderRadius.sm,
        padding: Spacing.sm + 2,
        borderWidth: 1,
        borderColor: 'rgba(239,68,68,0.3)',
    },
    errorText: { color: '#EF4444', fontSize: FontSizes.sm, fontWeight: '600' },
    loginBtn: {
        borderRadius: BorderRadius.md,
        overflow: 'hidden',
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 8,
        marginTop: Spacing.xs,
    },
    loginBtnInner: {
        paddingVertical: Spacing.md + 4,
        alignItems: 'center',
    },
    loginBtnText: { color: Colors.white, fontSize: FontSizes.lg, fontWeight: '800' },
    quickSection: { width: '100%', marginTop: Spacing.sm },
    dividerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
    divider: { flex: 1, height: 1, backgroundColor: Colors.border },
    dividerText: { fontSize: FontSizes.xs, color: Colors.textMuted, fontWeight: '700', letterSpacing: 1 },
    quickBtns: { flexDirection: 'row', gap: Spacing.sm },
    quickBtn: {
        flex: 1,
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: BorderRadius.sm,
        paddingVertical: Spacing.sm + 4,
        borderWidth: 1,
        gap: 4,
    },
    quickEmoji: { fontSize: 22 },
    quickLabel: { fontSize: FontSizes.xs, fontWeight: '700' },
    credHint: { textAlign: 'center', color: Colors.textMuted, fontSize: FontSizes.xs, marginTop: Spacing.sm },
});
