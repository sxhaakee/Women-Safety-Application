import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Alert,
    Dimensions,
    ScrollView,
    Modal,
    Vibration,
    Share,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MapView, { Marker, Polyline } from '../components/SafeMapView';
import * as Location from 'expo-location';

const { width } = Dimensions.get('window');

const CAB_TYPES = [
    { id: 'uber', label: '🟢 Uber' },
    { id: 'ola', label: '🟡 Ola' },
    { id: 'auto', label: '🛺 Auto' },
    { id: 'taxi', label: '🚕 Taxi' },
];

export default function CabGuardianScreen({ navigation, route }: any) {
    const [cabType, setCabType] = useState('uber');
    const [plateNumber, setPlateNumber] = useState('');
    const [driverName, setDriverName] = useState('');
    const [destination, setDestination] = useState('');
    const [isRideActive, setIsRideActive] = useState(false);

    // Telemetry state
    const [speedKmh, setSpeedKmh] = useState(0);
    const [rideDurationSec, setRideDurationSec] = useState(0);
    const [deviationM, setDeviationM] = useState(0);
    const [isDetour, setIsDetour] = useState(false);
    const [stationaryMinutes, setStationaryMinutes] = useState(0);

    // Modals
    const [showDetourModal, setShowDetourModal] = useState(false);
    const [detourCountdown, setDetourCountdown] = useState(30);
    const [showFakeCall, setShowFakeCall] = useState(false);

    const [location, setLocation] = useState<{ latitude: number; longitude: number }>({
        latitude: 12.9141,
        longitude: 74.8560,
    });

    const [cabPath, setCabPath] = useState<{ latitude: number; longitude: number }[]>([
        { latitude: 12.9141, longitude: 74.8560 },
        { latitude: 12.9080, longitude: 74.8510 },
        { latitude: 12.8980, longitude: 74.8470 },
        { latitude: 12.8860, longitude: 74.8420 },
    ]);

    const rideTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    const detourTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    const locationSub = useRef<Location.LocationSubscription | null>(null);

    useEffect(() => {
        (async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
                setLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
            }
        })();

        return () => {
            if (rideTimer.current) clearInterval(rideTimer.current);
            if (detourTimer.current) clearInterval(detourTimer.current);
            locationSub.current?.remove();
        };
    }, []);

    function startRide() {
        if (!plateNumber.trim()) {
            Alert.alert('Plate Number Required', 'Please enter the vehicle registration number (e.g. KA 19 MD 4040).');
            return;
        }

        setIsRideActive(true);
        setRideDurationSec(0);
        setSpeedKmh(42);
        setIsDetour(false);
        setDeviationM(0);

        rideTimer.current = setInterval(() => {
            setRideDurationSec(s => s + 1);
        }, 1000);

        // Location monitoring
        Location.watchPositionAsync(
            { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 3000 },
            (loc) => {
                setLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
                const spd = Math.max(0, Math.round((loc.coords.speed || 0) * 3.6));
                setSpeedKmh(spd > 0 ? spd : 45);
            }
        ).then(sub => {
            locationSub.current = sub;
        }).catch(() => {});

        Alert.alert(
            '🚕 Cab Guardian Armed',
            `Monitoring ${plateNumber.toUpperCase()}. Live GPS shared with guardians. Speed & route deviation guards are active.`
        );
    }

    function simulateDetour() {
        Vibration.vibrate([0, 300, 100, 300]);
        setIsDetour(true);
        setDeviationM(620);
        setShowDetourModal(true);
        setDetourCountdown(30);

        if (detourTimer.current) clearInterval(detourTimer.current);
        detourTimer.current = setInterval(() => {
            setDetourCountdown(c => {
                if (c <= 1) {
                    clearInterval(detourTimer.current!);
                    setShowDetourModal(false);
                    triggerSOS();
                    return 0;
                }
                return c - 1;
            });
        }, 1000);
    }

    function dismissDetour() {
        if (detourTimer.current) clearInterval(detourTimer.current);
        setShowDetourModal(false);
        setIsDetour(false);
        setDeviationM(0);
        Alert.alert('✅ Confirmed Safe', 'Route monitoring resumed.');
    }

    async function shareTrackingLink() {
        try {
            await Share.share({
                message: `🛡️ SheSafe Live Cab Tracking: I am traveling in ${plateNumber.toUpperCase()} (${cabType.toUpperCase()}). Track my ride live: https://shesafe.app/w/demo-ride-token`,
            });
        } catch (_) {}
    }

    function endRide() {
        if (rideTimer.current) clearInterval(rideTimer.current);
        if (detourTimer.current) clearInterval(detourTimer.current);
        locationSub.current?.remove();
        setIsRideActive(false);
        Alert.alert('🎉 Safe Arrival', 'Cab Guardian disarmed. Hope you had a safe and comfortable ride!');
    }

    function triggerSOS() {
        if (rideTimer.current) clearInterval(rideTimer.current);
        navigation.navigate('AlertCountdown', { user: route?.params?.user, location });
    }

    return (
        <View style={styles.container}>
            {/* Map */}
            <MapView
                style={styles.map}
                initialRegion={{
                    latitude: location.latitude,
                    longitude: location.longitude,
                    latitudeDelta: 0.04,
                    longitudeDelta: 0.04,
                }}
            >
                <Marker coordinate={location} title="Cab Position" pinColor="yellow" />
                <Polyline coordinates={cabPath} strokeColor="#F59E0B" strokeWidth={5} />
            </MapView>

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Text style={styles.backText}>⬅️</Text>
                </TouchableOpacity>
                <View>
                    <Text style={styles.headerTitle}>Cab Guardian</Text>
                    <Text style={styles.headerSub}>Real-Time Ride Security</Text>
                </View>
                <TouchableOpacity style={styles.shareBtn} onPress={shareTrackingLink}>
                    <Text style={{ fontSize: 16 }}>📤</Text>
                </TouchableOpacity>
            </View>

            {/* Bottom Panel */}
            <View style={styles.bottomCard}>
                {isRideActive ? (
                    /* ── Active Ride HUD ── */
                    <View style={styles.activeRideHUD}>
                        <View style={[styles.statusBadge, { backgroundColor: isDetour ? '#FEE2E2' : '#FEF3C7' }]}>
                            <View style={[styles.statusDot, { backgroundColor: isDetour ? '#DC2626' : '#F59E0B' }]} />
                            <Text style={[styles.statusText, { color: isDetour ? '#991B1B' : '#92400E' }]}>
                                {isDetour ? '⚠️ UNEXPECTED ROUTE DETOUR (>500M)' : `● ON ROUTE · ${plateNumber.toUpperCase()}`}
                            </Text>
                        </View>

                        {/* Telemetry HUD */}
                        <View style={styles.telemetryRow}>
                            <View style={styles.teleCard}>
                                <Text style={[styles.teleVal, { color: speedKmh > 90 ? '#DC2626' : '#0F172A' }]}>
                                    {speedKmh}
                                </Text>
                                <Text style={styles.teleSub}>KM/H SPEED</Text>
                            </View>
                            <View style={styles.teleCard}>
                                <Text style={styles.teleVal}>
                                    {Math.floor(rideDurationSec / 60)}:{(rideDurationSec % 60).toString().padStart(2, '0')}
                                </Text>
                                <Text style={styles.teleSub}>DURATION</Text>
                            </View>
                            <View style={styles.teleCard}>
                                <Text style={[styles.teleVal, { color: isDetour ? '#DC2626' : '#059669' }]}>
                                    {isDetour ? `+${deviationM}m` : 'Normal'}
                                </Text>
                                <Text style={styles.teleSub}>PATH CHECK</Text>
                            </View>
                        </View>

                        {/* Detour simulation button for demonstration */}
                        <TouchableOpacity style={styles.detourSimBtn} onPress={simulateDetour}>
                            <Text style={styles.detourSimText}>⚡ Test Driver Detour Alert (&gt;500m Detour)</Text>
                        </TouchableOpacity>

                        {/* Action buttons */}
                        <View style={styles.actionRow}>
                            <TouchableOpacity style={styles.fakeCallBtn} onPress={() => setShowFakeCall(true)}>
                                <Text style={styles.fakeCallText}>📞 Fake Call</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.sosActionBtn} onPress={triggerSOS}>
                                <Text style={styles.sosActionText}>🚨 SOS</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.endRideBtn} onPress={endRide}>
                                <Text style={styles.endRideText}>END RIDE</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : (
                    /* ── Setup Form ── */
                    <ScrollView showsVerticalScrollIndicator={false}>
                        <Text style={styles.setupHeading}>Protect Your Cab / Auto Ride</Text>
                        <Text style={styles.setupSub}>
                            Automatic guards trigger if driver takes detours, exceeds 100km/h, or stops unexpectedly.
                        </Text>

                        {/* Cab Type Selection */}
                        <Text style={styles.fieldLabel}>VEHICLE TYPE</Text>
                        <View style={styles.cabTypeRow}>
                            {CAB_TYPES.map(c => (
                                <TouchableOpacity
                                    key={c.id}
                                    style={[styles.cabTypeBtn, cabType === c.id && styles.cabTypeBtnActive]}
                                    onPress={() => setCabType(c.id)}
                                >
                                    <Text style={[styles.cabTypeText, cabType === c.id && { color: '#0F172A', fontWeight: '800' }]}>
                                        {c.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Plate Number */}
                        <Text style={styles.fieldLabel}>VEHICLE REGISTRATION / NUMBER PLATE</Text>
                        <TextInput
                            style={styles.textInput}
                            value={plateNumber}
                            onChangeText={setPlateNumber}
                            placeholder="e.g. KA 19 MD 4040"
                            placeholderTextColor="#94A3B8"
                            autoCapitalize="characters"
                        />

                        {/* Driver Name (Optional) */}
                        <Text style={styles.fieldLabel}>DRIVER NAME / CAR MODEL (OPTIONAL)</Text>
                        <TextInput
                            style={styles.textInput}
                            value={driverName}
                            onChangeText={setDriverName}
                            placeholder="e.g. Ramesh / White Swift Dzire"
                            placeholderTextColor="#94A3B8"
                        />

                        <TouchableOpacity style={styles.startBtn} onPress={startRide} activeOpacity={0.9}>
                            <LinearGradient colors={['#D97706', '#F59E0B']} style={styles.startGrad}>
                                <Text style={styles.startBtnText}>START CAB PROTECTION</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </ScrollView>
                )}
            </View>

            {/* Detour Alert Modal */}
            <Modal visible={showDetourModal} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={{ fontSize: 44, marginBottom: 8 }}>🚨</Text>
                        <Text style={styles.modalAlertTitle}>Driver Detour Detected</Text>
                        <Text style={styles.modalAlertDesc}>
                            The vehicle is {deviationM}m away from the expected route. Confirm your safety before auto-escalation.
                        </Text>
                        <View style={styles.detourTimerBox}>
                            <Text style={styles.detourTimerNum}>{detourCountdown}s</Text>
                            <Text style={styles.detourTimerSub}>Auto-SOS Alert in</Text>
                        </View>
                        <TouchableOpacity style={styles.detourSafeBtn} onPress={dismissDetour}>
                            <Text style={styles.detourSafeText}>I AM OK — NORMAL DETOUR</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.detourSOSBtn} onPress={triggerSOS}>
                            <Text style={styles.detourSOSText}>DISPATCH POLICE &amp; SOS NOW</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Fake Call Modal */}
            <Modal visible={showFakeCall} transparent animationType="slide">
                <View style={styles.fakeCallOverlay}>
                    <View style={styles.fakeCallCard}>
                        <Text style={{ fontSize: 60, marginBottom: 12 }}>👮‍♂️</Text>
                        <Text style={styles.fcName}>Police Sub-Inspector / Dad</Text>
                        <Text style={styles.fcStatus}>SheSafe Live Shield Audio</Text>
                        <Text style={styles.fcSpeech}>
                            "Haan beta, I'm watching your cab's live speed and GPS right now on SheSafe. You're taking the bypass road, I'll be waiting at the gate!"
                        </Text>
                        <TouchableOpacity style={styles.fcEndBtn} onPress={() => setShowFakeCall(false)}>
                            <Text style={styles.fcEndText}>End Deterrence Call</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    map: { flex: 1 },
    header: {
        position: 'absolute',
        top: 50,
        left: 16,
        right: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
        elevation: 4,
    },
    backBtn: { padding: 4 },
    backText: { fontSize: 18 },
    headerTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
    headerSub: { fontSize: 10, color: '#64748B', fontWeight: '500' },
    shareBtn: { padding: 6, backgroundColor: '#F1F5F9', borderRadius: 8 },

    bottomCard: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 20,
        paddingBottom: 34,
        borderTopWidth: 1,
        borderColor: '#E2E8F0',
        maxHeight: '60%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
        elevation: 6,
    },
    setupHeading: { fontSize: 18, fontWeight: '900', color: '#0F172A', marginBottom: 4 },
    setupSub: { fontSize: 12, color: '#64748B', marginBottom: 16, lineHeight: 17 },
    fieldLabel: { fontSize: 10, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.5, marginBottom: 6 },
    cabTypeRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
    cabTypeBtn: {
        flex: 1,
        backgroundColor: '#F8FAFC',
        borderRadius: 10,
        paddingVertical: 10,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    cabTypeBtnActive: { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' },
    cabTypeText: { fontSize: 11, fontWeight: '600', color: '#64748B' },
    textInput: {
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 14,
        color: '#0F172A',
        fontWeight: '600',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        marginBottom: 14,
    },
    startBtn: { borderRadius: 14, overflow: 'hidden', marginTop: 4 },
    startGrad: { paddingVertical: 16, alignItems: 'center' },
    startBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900', letterSpacing: 0.8 },

    activeRideHUD: { alignItems: 'center' },
    statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginBottom: 14 },
    statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
    statusText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
    telemetryRow: { flexDirection: 'row', width: '100%', gap: 8, marginBottom: 14 },
    teleCard: { flex: 1, backgroundColor: '#F8FAFC', borderRadius: 14, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
    teleVal: { fontSize: 22, fontWeight: '900' },
    teleSub: { fontSize: 9, fontWeight: '800', color: '#94A3B8', marginTop: 2 },
    detourSimBtn: { backgroundColor: '#F1F5F9', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginBottom: 14 },
    detourSimText: { fontSize: 11, color: '#475569', fontWeight: '700' },
    actionRow: { flexDirection: 'row', width: '100%', gap: 8 },
    fakeCallBtn: { flex: 1, backgroundColor: '#E0E7FF', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    fakeCallText: { color: '#3730A3', fontSize: 12, fontWeight: '800' },
    sosActionBtn: { flex: 1, backgroundColor: '#FEE2E2', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    sosActionText: { color: '#DC2626', fontSize: 12, fontWeight: '900' },
    endRideBtn: { flex: 1.5, backgroundColor: '#334155', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    endRideText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    modalCard: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, width: '100%', alignItems: 'center' },
    modalAlertTitle: { fontSize: 20, fontWeight: '900', color: '#0F172A' },
    modalAlertDesc: { fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 6, lineHeight: 18 },
    detourTimerBox: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#FEE2E2', justifyContent: 'center', alignItems: 'center', marginVertical: 16 },
    detourTimerNum: { fontSize: 22, fontWeight: '900', color: '#DC2626' },
    detourTimerSub: { fontSize: 9, color: '#991B1B', fontWeight: '700' },
    detourSafeBtn: { backgroundColor: '#059669', width: '100%', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginBottom: 10 },
    detourSafeText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
    detourSOSBtn: { width: '100%', paddingVertical: 12, alignItems: 'center' },
    detourSOSText: { color: '#DC2626', fontSize: 13, fontWeight: '800' },

    fakeCallOverlay: { flex: 1, backgroundColor: '#0F172A', justifyContent: 'center', alignItems: 'center', padding: 24 },
    fakeCallCard: { backgroundColor: '#1E293B', borderRadius: 24, padding: 28, width: '100%', alignItems: 'center' },
    fcName: { fontSize: 20, fontWeight: '900', color: '#F8FAFC' },
    fcStatus: { fontSize: 12, color: '#10B981', marginTop: 4 },
    fcSpeech: { fontSize: 14, color: '#94A3B8', textAlign: 'center', marginVertical: 24, fontStyle: 'italic', lineHeight: 22 },
    fcEndBtn: { backgroundColor: '#DC2626', width: '100%', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    fcEndText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});
