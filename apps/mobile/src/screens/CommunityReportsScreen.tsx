import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Modal,
    Alert,
    ScrollView,
} from 'react-native';
import MapView, { Marker } from '../components/SafeMapView';
import { Colors } from '../theme';
import { supabase } from '../utils/supabase';
import * as Location from 'expo-location';
import * as Crypto from 'expo-crypto';

const CATEGORIES = [
    { id: 'poor_lighting', label: '💡 Poor Lighting', desc: 'Broken streetlights or dark stretch' },
    { id: 'harassment', label: '⚠️ Harassment Hotspot', desc: 'Frequent catcalling or intimidation' },
    { id: 'stalking', label: '👀 Suspicious Stalking', desc: 'Individuals loitering/following' },
    { id: 'isolated', label: '🏚️ Isolated / Desolate', desc: 'No open shops or foot traffic' },
    { id: 'other', label: '🚨 General Hazard', desc: 'Unsafe surroundings' },
];

export default function CommunityReportsScreen({ navigation }: any) {
    const [reports, setReports] = useState<any[]>([]);
    const [selectedCategory, setSelectedCategory] = useState(CATEGORIES[0]!.id);
    const [severity, setSeverity] = useState(3);
    const [modalVisible, setModalVisible] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [location, setLocation] = useState<{ latitude: number; longitude: number }>({
        latitude: 12.9141,
        longitude: 74.8560,
    });

    useEffect(() => {
        (async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                setLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
            }
        })();
        fetchReports();
    }, []);

    async function fetchReports() {
        try {
            const { data } = await supabase
                .from('unsafe_reports')
                .select('*')
                .limit(40);
            if (data && data.length > 0) {
                setReports(data);
            }
        } catch {
            // Keep existing state
        }
    }

    async function submitReport() {
        setIsSubmitting(true);
        try {
            const randomBytes = await Crypto.getRandomBytesAsync(32);
            const reporterHash = '\\x' + Array.from(randomBytes, (b) => b.toString(16).padStart(2, '0')).join('');
            
            const { error } = await supabase.from('unsafe_reports').insert({
                geom: `SRID=4326;POINT(${location.longitude} ${location.latitude})`,
                category: selectedCategory,
                severity: severity,
                reporter_hash: reporterHash,
            });

            if (error) {
                console.warn('[REPORTS] Insert error:', error.message);
            }

            Alert.alert(
                '✅ Report Submitted',
                'Thank you for keeping the community safe. Your report will help route walkers through better-lit, safer avenues.'
            );
            setModalVisible(false);
            fetchReports();
        } catch (e: any) {
            Alert.alert('Submission Error', e?.message || 'Could not save report');
        } finally {
            setIsSubmitting(false);
        }
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
                <Marker coordinate={location} title="Your Location" pinColor="blue" />

                {/* Demo + Community markers */}
                <Marker
                    coordinate={{ latitude: 12.9190, longitude: 74.8520 }}
                    title="💡 Poor Lighting (Verified)"
                    description="Reported by 4 pedestrians"
                    pinColor="orange"
                />
                <Marker
                    coordinate={{ latitude: 12.9090, longitude: 74.8620 }}
                    title="⚠️ Isolated Stretch"
                    description="Reported by 3 pedestrians"
                    pinColor="red"
                />
            </MapView>

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Text style={styles.backText}>⬅️</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Safety Hazard Map</Text>
                <View style={{ width: 40 }} />
            </View>

            {/* Report Button */}
            <View style={styles.bottomBar}>
                <TouchableOpacity style={styles.reportBtn} onPress={() => setModalVisible(true)}>
                    <Text style={styles.reportBtnText}>⚠️  REPORT UNSAFE SPOT HERE</Text>
                </TouchableOpacity>
            </View>

            {/* Modal */}
            <Modal visible={modalVisible} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>Report Unsafe Area</Text>
                        <Text style={styles.modalSub}>
                            Standardized categories only (no free-text) to prevent defamation and maintain objective safety scoring.
                        </Text>

                        <Text style={styles.sectionLabel}>HAZARD CATEGORY</Text>
                        <ScrollView style={{ maxHeight: 200 }}>
                            {CATEGORIES.map(c => {
                                const isSelected = selectedCategory === c.id;
                                return (
                                    <TouchableOpacity
                                        key={c.id}
                                        style={[styles.categoryOption, isSelected && styles.categoryOptionSelected]}
                                        onPress={() => setSelectedCategory(c.id)}
                                    >
                                        <Text style={[styles.categoryLabel, isSelected && { color: '#FFF' }]}>
                                            {c.label}
                                        </Text>
                                        <Text style={styles.categoryDesc}>{c.desc}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>

                        <Text style={[styles.sectionLabel, { marginTop: 14 }]}>SEVERITY (1 = MILD, 5 = CRITICAL)</Text>
                        <View style={styles.severityRow}>
                            {[1, 2, 3, 4, 5].map(lvl => (
                                <TouchableOpacity
                                    key={lvl}
                                    style={[styles.severityBtn, severity === lvl && styles.severityBtnSelected]}
                                    onPress={() => setSeverity(lvl)}
                                >
                                    <Text style={[styles.severityText, severity === lvl && { color: '#FFF' }]}>
                                        {lvl}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <TouchableOpacity style={styles.submitBtn} onPress={submitReport} disabled={isSubmitting}>
                            <Text style={styles.submitBtnText}>
                                {isSubmitting ? 'SUBMITTING...' : 'SUBMIT SAFETY REPORT'}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.cancelModalBtn}>
                            <Text style={styles.cancelModalText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
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
    bottomBar: {
        position: 'absolute',
        bottom: 24,
        left: 16,
        right: 16,
    },
    reportBtn: {
        backgroundColor: '#DC2626',
        borderRadius: 14,
        paddingVertical: 16,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 8,
    },
    reportBtnText: { color: '#FFF', fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.75)',
        justifyContent: 'flex-end',
    },
    modalCard: {
        backgroundColor: '#161328',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 20,
        paddingBottom: 36,
        borderTopWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    modalTitle: { color: '#FFF', fontSize: 18, fontWeight: '900', marginBottom: 6 },
    modalSub: { color: '#888', fontSize: 12, lineHeight: 16, marginBottom: 16 },
    sectionLabel: { color: '#AAA', fontSize: 11, fontWeight: '800', marginBottom: 8, letterSpacing: 0.5 },
    categoryOption: {
        backgroundColor: '#1F1A3A',
        borderRadius: 10,
        padding: 12,
        marginBottom: 8,
        borderWidth: 1.5,
        borderColor: 'transparent',
    },
    categoryOptionSelected: { borderColor: '#DC2626', backgroundColor: '#281D42' },
    categoryLabel: { color: '#DDD', fontSize: 14, fontWeight: '700' },
    categoryDesc: { color: '#777', fontSize: 11, marginTop: 2 },
    severityRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
    severityBtn: {
        flex: 1,
        backgroundColor: '#1F1A3A',
        borderRadius: 10,
        paddingVertical: 12,
        marginHorizontal: 3,
        alignItems: 'center',
    },
    severityBtnSelected: { backgroundColor: '#DC2626' },
    severityText: { color: '#AAA', fontSize: 16, fontWeight: '800' },
    submitBtn: {
        backgroundColor: '#DC2626',
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
    },
    submitBtnText: { color: '#FFF', fontSize: 14, fontWeight: '900' },
    cancelModalBtn: { alignItems: 'center', marginTop: 14 },
    cancelModalText: { color: '#777', fontSize: 13 },
});
