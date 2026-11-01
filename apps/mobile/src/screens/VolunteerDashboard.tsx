import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Animated,
    StatusBar,
    Alert,
    Linking,
    Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MapView, { Marker, Polyline } from '../components/SafeMapView';
import { Colors } from '../theme';
import {
    SheSafeUser,
    SheSafeAlert,
    SheSafeWS,
    getActiveAlerts,
    getAllAlerts,
} from '../utils/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

const { width } = Dimensions.get('window');

export default function VolunteerDashboard({ navigation, route }: any) {
    const user: SheSafeUser = route?.params?.user || { name: 'Kiran Rakshak', role: 'volunteer' };

    const [isAvailable, setIsAvailable] = useState(true);
    const [activeAlert, setActiveAlert] = useState<SheSafeAlert | null>(null);
    const [accepted, setAccepted] = useState(false);
    const [arrived, setArrived] = useState(false);
    const [connected, setConnected] = useState(false);
    const [distanceM, setDistanceM] = useState(450);

    const [location, setLocation] = useState<{ latitude: number; longitude: number }>({
        latitude: 12.9165,
        longitude: 74.8580,
    });

    const fadeAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const wsRef = useRef<SheSafeWS | null>(null);
    const activeAlertRef = useRef<SheSafeAlert | null>(null);

    useEffect(() => {
        Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();

        // Pulsing dot
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.08, duration: 800, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
            ])
        ).start();

        (async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                setLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
            }
        })();

        loadAlerts();
        connectWS();

        const poll = setInterval(loadAlerts, 3000);

        return () => {
            clearInterval(poll);
            wsRef.current?.disconnect();
        };
    }, []);

    const loadAlerts = async () => {
        try {
            const active = await getActiveAlerts();
            if (active.length > 0) {
                activeAlertRef.current = active[0]!;
                setActiveAlert(active[0]!);
            }
        } catch (_) {}
    };

    const connectWS = () => {
        const ws = new SheSafeWS('volunteer', (msg) => {
            switch (msg.type) {
                case 'REGISTERED':
                    setConnected(true);
                    break;
                case 'ALERT_FIRED':
                case 'ALERT_ACTIVE':
                    console.log(`[VOLUNTEER WS] 🚨 Incoming SOS for ${msg.alert?.victim_name}`);
                    activeAlertRef.current = msg.alert;
                    setActiveAlert(msg.alert);
                    break;
                case 'LOCATION_UPDATE':
                    if (activeAlertRef.current && activeAlertRef.current.id === msg.alert_id) {
                        const updated = { ...activeAlertRef.current, lat: msg.lat, lng: msg.lng };
                        activeAlertRef.current = updated;
                        setActiveAlert(updated);
                    }
                    break;
                case 'ALERT_RESOLVED':
                    console.log('[VOLUNTEER WS] 🛑 SOS alert has been marked safe / resolved');
                    activeAlertRef.current = null;
                    setActiveAlert(null);
                    setAccepted(false);
                    setArrived(false);
                    break;
            }
        });
        ws.connect();
        wsRef.current = ws;
    };

    const handleAccept = () => {
        setAccepted(true);
        if (wsRef.current && activeAlert) {
            wsRef.current.sendRaw({
                type: 'VOLUNTEER_RESPONSE',
                alert_id: activeAlert.id,
                volunteer_id: user.id || 'volunteer-001',
                status: 'accepted',
            });
        }
        Alert.alert(
            '🤝 Dispatch Accepted',
            'Proceed immediately to the incident location. Remember: Stay visible, do not confront, and coordinate with 112 police.'
        );
    };

    const handleDecline = () => {
        if (wsRef.current && activeAlert) {
            wsRef.current.sendRaw({
                type: 'VOLUNTEER_RESPONSE',
                alert_id: activeAlert.id,
                volunteer_id: user.id || 'volunteer-001',
                status: 'declined',
            });
        }
        setActiveAlert(null);
        setAccepted(false);
    };

    const handleCall112 = () => {
        Linking.openURL('tel:112').catch(() => {
            Alert.alert('Emergency Call', 'Dial 112 from your dialer.');
        });
    };

    const handleOpenNavigation = () => {
        const destLat = activeAlert?.lat || 12.9141;
        const destLng = activeAlert?.lng || 74.8560;
        const url = `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}`;
        Linking.openURL(url).catch(() => {});
    };

    const handleMarkArrived = () => {
        setArrived(true);
        if (wsRef.current && activeAlert) {
            wsRef.current.sendRaw({
                type: 'VOLUNTEER_RESPONSE',
                alert_id: activeAlert.id,
                volunteer_id: user.id || 'volunteer-001',
                status: 'arrived',
            });
        }
        Alert.alert('✅ Marked as Arrived', 'Your on-scene presence has been logged. Stand by for police arrival.');
    };

    const handleLogout = async () => {
        Alert.alert('Logout', 'Sign out from Volunteer Rakshak?', [
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

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" />

            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <View style={styles.avatarBox}>
                        <Text style={{ fontSize: 22 }}>🤝</Text>
                    </View>
                    <View>
                        <Text style={styles.roleTitle}>COMMUNITY RAKSHAK</Text>
                        <Text style={styles.userName}>{user.name}</Text>
                    </View>
                </View>
                <View style={styles.headerRight}>
                    <TouchableOpacity
                        style={[styles.availBadge, isAvailable ? styles.availOn : styles.availOff]}
                        onPress={() => setIsAvailable(v => !v)}
                    >
                        <View style={[styles.availDot, { backgroundColor: isAvailable ? '#10B981' : '#94A3B8' }]} />
                        <Text style={[styles.availText, { color: isAvailable ? '#065F46' : '#64748B' }]}>
                            {isAvailable ? 'AVAILABLE' : 'OFFLINE'}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                        <Text style={{ fontSize: 16 }}>🚪</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

                {activeAlert ? (
                    /* ── Active Incident for Volunteer ── */
                    <View style={styles.incidentContainer}>
                        
                        {/* Incident Map View First */}
                        <View style={styles.mapCard}>
                            <View style={styles.mapHeaderRow}>
                                <View style={styles.mapBadge}>
                                    <View style={styles.recDot} />
                                    <Text style={styles.mapBadgeText}>NEARBY SOS INCIDENT</Text>
                                </View>
                                <Text style={styles.distText}>📍 ~{distanceM}m away</Text>
                            </View>

                            <MapView
                                style={styles.map}
                                initialRegion={{
                                    latitude: activeAlert.lat || 12.9141,
                                    longitude: activeAlert.lng || 74.8560,
                                    latitudeDelta: 0.02,
                                    longitudeDelta: 0.02,
                                }}
                            >
                                <Marker
                                    coordinate={{
                                        latitude: activeAlert.lat || 12.9141,
                                        longitude: activeAlert.lng || 74.8560,
                                    }}
                                    title="Victim Location"
                                    pinColor="red"
                                />
                                <Marker
                                    coordinate={location}
                                    title="Your Position"
                                    pinColor="green"
                                />
                                <Polyline
                                    coordinates={[
                                        location,
                                        { latitude: activeAlert.lat || 12.9141, longitude: activeAlert.lng || 74.8560 },
                                    ]}
                                    strokeColor="#DC2626"
                                    strokeWidth={3}
                                />
                            </MapView>
                        </View>

                        {/* Safety Directive Banner */}
                        <View style={styles.safetyDirective}>
                            <Text style={styles.directiveTitle}>⚠️ RAKSHAK PROTOCOL</Text>
                            <Text style={styles.directiveBody}>
                                Do not confront attackers. Arrive on-scene, make yourself visible, and coordinate with 112 police dispatch.
                            </Text>
                        </View>

                        {/* Victim Summary Card (Privacy Preserving) */}
                        <View style={styles.victimCard}>
                            <View style={styles.victimRow}>
                                <View style={styles.victimIcon}>
                                    <Text style={{ fontSize: 24 }}>🆘</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.victimName}>
                                        {activeAlert.victim_name?.split(' ')[0]} (Victim)
                                    </Text>
                                    <Text style={styles.victimArea}>
                                        {activeAlert.address || 'Near Mangaluru Central'}
                                    </Text>
                                </View>
                                <View style={styles.statusPill}>
                                    <Text style={styles.statusPillText}>DISPATCH ACTIVE</Text>
                                </View>
                            </View>
                        </View>

                        {/* Actions */}
                        {!accepted ? (
                            <View style={styles.responseRow}>
                                <TouchableOpacity style={styles.declineBtn} onPress={handleDecline}>
                                    <Text style={styles.declineText}>DECLINE</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.acceptBtn} onPress={handleAccept}>
                                    <LinearGradient colors={['#059669', '#10B981']} style={styles.acceptGrad}>
                                        <Text style={styles.acceptText}>ACCEPT DISPATCH</Text>
                                    </LinearGradient>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View style={styles.acceptedActions}>
                                <TouchableOpacity style={styles.navBtn} onPress={handleOpenNavigation}>
                                    <Text style={styles.navBtnText}>🗺️ Open Directions in Google Maps</Text>
                                </TouchableOpacity>

                                <View style={styles.subActionRow}>
                                    <TouchableOpacity style={styles.call112Btn} onPress={handleCall112}>
                                        <Text style={styles.call112Text}>📞 Call 112 Police</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.arrivedBtn, arrived && { backgroundColor: '#10B981' }]}
                                        onPress={handleMarkArrived}
                                    >
                                        <Text style={styles.arrivedText}>
                                            {arrived ? '✓ ON SCENE' : 'Mark Arrived'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}

                    </View>
                ) : (
                    /* ── Standby State ── */
                    <View style={styles.standbyContainer}>
                        <View style={styles.shieldCenterBox}>
                            <Animated.View style={[styles.pulseCircle, { transform: [{ scale: pulseAnim }] }]} />
                            <View style={styles.shieldCore}>
                                <Text style={{ fontSize: 44 }}>🛡️</Text>
                            </View>
                        </View>

                        <Text style={styles.standbyHeading}>Standing By as Rakshak</Text>
                        <Text style={styles.standbySub}>
                            You are active on the SheSafe Community Safety Network within 1.5 km of Mangaluru Central.
                        </Text>

                        <View style={styles.statsCard}>
                            <View style={styles.statCol}>
                                <Text style={styles.statNum}>1.5 km</Text>
                                <Text style={styles.statLabel}>RESPONSE RADIUS</Text>
                            </View>
                            <View style={styles.statDivider} />
                            <View style={styles.statCol}>
                                <Text style={styles.statNum}>&lt; 3 min</Text>
                                <Text style={styles.statLabel}>TARGET ARRIVAL</Text>
                            </View>
                            <View style={styles.statDivider} />
                            <View style={styles.statCol}>
                                <Text style={[styles.statNum, { color: '#059669' }]}>VERIFIED</Text>
                                <Text style={styles.statLabel}>STATUS</Text>
                            </View>
                        </View>

                        <View style={styles.guidelinesCard}>
                            <Text style={styles.guideTitle}>📋 Community Volunteer Guidelines</Text>
                            <Text style={styles.guideText}>• Keep your phone charged and volume audible.</Text>
                            <Text style={styles.guideText}>• Upon receiving a dispatch ping, respond immediately.</Text>
                            <Text style={styles.guideText}>• Never confront an armed aggressor; use your presence as deterrence and alert police immediately.</Text>
                        </View>
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
        paddingHorizontal: 20,
        paddingTop: 54,
        paddingBottom: 16,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderColor: '#E2E8F0',
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatarBox: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#DCFCE7', justifyContent: 'center', alignItems: 'center' },
    roleTitle: { fontSize: 10, fontWeight: '800', color: '#059669', letterSpacing: 0.8 },
    userName: { fontSize: 17, fontWeight: '900', color: '#0F172A' },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    availBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
    availOn: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
    availOff: { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' },
    availDot: { width: 7, height: 7, borderRadius: 3.5 },
    availText: { fontSize: 10, fontWeight: '800' },
    logoutBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },

    scroll: { paddingBottom: 40 },
    incidentContainer: { padding: 16 },
    mapCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
        elevation: 4,
        marginBottom: 14,
    },
    mapHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 12,
        backgroundColor: '#FFFFFF',
    },
    mapBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#DC2626' },
    mapBadgeText: { fontSize: 11, fontWeight: '900', color: '#DC2626', letterSpacing: 0.5 },
    distText: { fontSize: 12, fontWeight: '800', color: '#0F172A' },
    map: { width: '100%', height: 230 },

    safetyDirective: {
        backgroundColor: '#FEF2F2',
        borderRadius: 14,
        padding: 14,
        borderWidth: 1,
        borderColor: '#FECACA',
        marginBottom: 14,
    },
    directiveTitle: { fontSize: 11, fontWeight: '900', color: '#991B1B', letterSpacing: 0.5 },
    directiveBody: { fontSize: 12, color: '#7F1D1D', marginTop: 4, lineHeight: 18 },

    victimCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        marginBottom: 16,
    },
    victimRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    victimIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FEE2E2', justifyContent: 'center', alignItems: 'center' },
    victimName: { fontSize: 16, fontWeight: '900', color: '#0F172A' },
    victimArea: { fontSize: 12, color: '#64748B', marginTop: 2 },
    statusPill: { backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    statusPillText: { fontSize: 10, fontWeight: '900', color: '#DC2626' },

    responseRow: { flexDirection: 'row', gap: 10 },
    declineBtn: { flex: 1, backgroundColor: '#F1F5F9', paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
    declineText: { fontSize: 13, fontWeight: '800', color: '#64748B' },
    acceptBtn: { flex: 2, borderRadius: 14, overflow: 'hidden' },
    acceptGrad: { paddingVertical: 16, alignItems: 'center' },
    acceptText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },

    acceptedActions: { gap: 10 },
    navBtn: { backgroundColor: '#0284C7', paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
    navBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
    subActionRow: { flexDirection: 'row', gap: 10 },
    call112Btn: { flex: 1, backgroundColor: '#DC2626', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    call112Text: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
    arrivedBtn: { flex: 1, backgroundColor: '#334155', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    arrivedText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },

    standbyContainer: { alignItems: 'center', padding: 24, paddingTop: 40 },
    shieldCenterBox: { width: 140, height: 140, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    pulseCircle: { position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(16, 185, 129, 0.15)' },
    shieldCore: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#DCFCE7', justifyContent: 'center', alignItems: 'center' },
    standbyHeading: { fontSize: 20, fontWeight: '900', color: '#0F172A', marginBottom: 6 },
    standbySub: { fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 19, paddingHorizontal: 12, marginBottom: 24 },

    statsCard: {
        flexDirection: 'row',
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        width: '100%',
        justifyContent: 'space-between',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        marginBottom: 20,
    },
    statCol: { flex: 1, alignItems: 'center' },
    statNum: { fontSize: 16, fontWeight: '900', color: '#0F172A' },
    statLabel: { fontSize: 9, fontWeight: '800', color: '#94A3B8', marginTop: 4 },
    statDivider: { width: 1, backgroundColor: '#E2E8F0' },

    guidelinesCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, width: '100%', borderWidth: 1, borderColor: '#E2E8F0' },
    guideTitle: { fontSize: 14, fontWeight: '800', color: '#0F172A', marginBottom: 10 },
    guideText: { fontSize: 12, color: '#64748B', lineHeight: 18, marginBottom: 6 },
});
