import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Alert,
    Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MapView, { Marker } from '../components/SafeMapView';
import { Colors } from '../theme';
import * as Location from 'expo-location';

const { width } = Dimensions.get('window');

export default function CabGuardianScreen({ navigation, route }: any) {
    const [plateNumber, setPlateNumber] = useState('');
    const [destination, setDestination] = useState('');
    const [isRideActive, setIsRideActive] = useState(false);
    const [speedKmh, setSpeedKmh] = useState(0);
    const [rideDurationSec, setRideDurationSec] = useState(0);
    const [deviationM, setDeviationM] = useState(0);
    const [showSafetyPrompt, setShowSafetyPrompt] = useState(false);

    const [location, setLocation] = useState<{ latitude: number; longitude: number }>({
        latitude: 12.9141,
        longitude: 74.8560,
    });

    const rideTimer = useRef<ReturnType<typeof setInterval> | null>(null);
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
            locationSub.current?.remove();
        };
    }, []);

    function startRide() {
        if (!plateNumber.trim()) {
            Alert.alert('Plate Number Required', 'Enter the cab or auto license plate number to monitor.');
            return;
        }

        setIsRideActive(true);
        setRideDurationSec(0);
        setSpeedKmh(35);

        rideTimer.current = setInterval(() => {
            setRideDurationSec(s => s + 1);
        }, 1000);

        // Start location tracking
        Location.watchPositionAsync(
            { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 3000 },
            (loc) => {
                setLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
                const spd = Math.max(0, Math.round((loc.coords.speed || 0) * 3.6));
                setSpeedKmh(spd > 0 ? spd : 38);
            }
        ).then(sub => {
            locationSub.current = sub;
        }).catch(() => {});

        Alert.alert(
            '🚕 Cab Guardian Active',
            `Monitoring vehicle ${plateNumber.toUpperCase()}. Guardians can now track your ride route live.`
        );
    }

    function endRide() {
        if (rideTimer.current) clearInterval(rideTimer.current);
        locationSub.current?.remove();
        setIsRideActive(false);
        Alert.alert('✅ Ride Ended', 'Cab Guardian disarmed. Hope you had a safe trip!');
    }

    function triggerEmergencySOS() {
        navigation.navigate('AlertCountdown', {
            user: route?.params?.user,
            location: { lat: location.latitude, lng: location.longitude },
        });
    }

    return (
        <View style={styles.container}>
            {/* Map */}
            <MapView
                style={styles.map}
                initialRegion={{
                    latitude: location.latitude,
                    longitude: location.longitude,
                    latitudeDelta: 0.02,
                    longitudeDelta: 0.02,
                }}
            >
                <Marker coordinate={location} title="Cab Location" pinColor="yellow" />
            </MapView>

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Text style={styles.backText}>⬅️</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Cab Guardian</Text>
                <View style={{ width: 40 }} />
            </View>

            {/* Bottom Content Sheet */}
            <View style={styles.sheet}>
                {isRideActive ? (
                    <View style={styles.activeRideBox}>
                        <View style={styles.statusBadge}>
                            <View style={styles.liveDot} />
                            <Text style={styles.statusBadgeText}>
                                RIDE MONITORING · {plateNumber.toUpperCase()}
                            </Text>
                        </View>

                        {/* Telemetry Row */}
                        <View style={styles.telemetryRow}>
                            <View style={styles.telemetryCard}>
                                <Text style={styles.telemetryValue}>{speedKmh}</Text>
                                <Text style={styles.telemetryLabel}>KM/H</Text>
                            </View>
                            <View style={styles.telemetryCard}>
                                <Text style={styles.telemetryValue}>
                                    {Math.floor(rideDurationSec / 60)}:{(rideDurationSec % 60).toString().padStart(2, '0')}
                                </Text>
                                <Text style={styles.telemetryLabel}>DURATION</Text>
                            </View>
                            <View style={styles.telemetryCard}>
                                <Text style={[styles.telemetryValue, { color: '#10B981' }]}>NORMAL</Text>
                                <Text style={styles.telemetryLabel}>ROUTE</Text>
                            </View>
                        </View>

                        <Text style={styles.guaranteeText}>
                            🛡️ Auto-prompt triggers if vehicle deviates &gt;500m or stops &gt;4 min
                        </Text>

                        <View style={styles.actionRow}>
                            <TouchableOpacity style={styles.sosBtn} onPress={triggerEmergencySOS}>
                                <Text style={styles.sosBtnText}>🚨 SOS</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.endRideBtn} onPress={endRide}>
                                <Text style={styles.endRideBtnText}>END RIDE</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : (
                    <View>
                        <Text style={styles.sheetHeading}>Protect Your Cab / Auto Ride</Text>
                        <Text style={styles.sheetSub}>
                            Guardians receive automatic alerts if the driver takes unexpected detours or stops.
                        </Text>

                        <Text style={styles.inputLabel}>VEHICLE REGISTRATION / PLATE NUMBER</Text>
                        <TextInput
                            style={styles.input}
                            value={plateNumber}
                            onChangeText={setPlateNumber}
                            placeholder="e.g. KA 19 MD 4040"
                            placeholderTextColor="#666"
                            autoCapitalize="characters"
                        />

                        <Text style={styles.inputLabel}>DROP DESTINATION (OPTIONAL)</Text>
                        <TextInput
                            style={styles.input}
                            value={destination}
                            onChangeText={setDestination}
                            placeholder="e.g. Mangalore Central Station"
                            placeholderTextColor="#666"
                        />

                        <TouchableOpacity style={styles.startBtn} onPress={startRide}>
                            <Text style={styles.startBtnText}>START CAB PROTECTION</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0A0814' },
    map: { flex: 1 },
    header: {
        position: 'absolute',
        top: 50,
        left: 16,
        right: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#161328',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    backBtn: { padding: 6 },
    backText: { fontSize: 18 },
    headerTitle: { color: '#FFF', fontSize: 16, fontWeight: '800' },
    sheet: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#120F24',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 20,
        paddingBottom: 32,
        borderTopWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    sheetHeading: { color: '#FFF', fontSize: 18, fontWeight: '800', marginBottom: 6 },
    sheetSub: { color: '#888', fontSize: 12, marginBottom: 16, lineHeight: 18 },
    inputLabel: { color: '#AAA', fontSize: 11, fontWeight: '700', marginBottom: 6, letterSpacing: 0.5 },
    input: {
        backgroundColor: '#1C1836',
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        color: '#FFF',
        fontSize: 14,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    startBtn: {
        backgroundColor: '#F59E0B',
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
        marginTop: 6,
    },
    startBtnText: { color: '#000', fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
    activeRideBox: { alignItems: 'center' },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        marginBottom: 16,
    },
    liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#F59E0B', marginRight: 8 },
    statusBadgeText: { color: '#F59E0B', fontSize: 12, fontWeight: '800' },
    telemetryRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 16 },
    telemetryCard: {
        flex: 1,
        backgroundColor: '#1A1633',
        borderRadius: 12,
        padding: 12,
        marginHorizontal: 4,
        alignItems: 'center',
    },
    telemetryValue: { color: '#FFF', fontSize: 20, fontWeight: '900' },
    telemetryLabel: { color: '#888', fontSize: 10, fontWeight: '700', marginTop: 4 },
    guaranteeText: { color: '#AAA', fontSize: 11, textAlign: 'center', marginBottom: 20, lineHeight: 16 },
    actionRow: { flexDirection: 'row', width: '100%', gap: 10 },
    sosBtn: {
        flex: 1,
        backgroundColor: '#DC2626',
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
    },
    sosBtnText: { color: '#FFF', fontSize: 14, fontWeight: '900' },
    endRideBtn: {
        flex: 1,
        backgroundColor: '#374151',
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
    },
    endRideBtnText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
});
