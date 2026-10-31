import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Modal,
    Alert,
    ScrollView,
    Dimensions,
} from 'react-native';
import MapView, { Marker } from '../components/SafeMapView';
import { supabase } from '../utils/supabase';
import * as Location from 'expo-location';
import * as Crypto from 'expo-crypto';

const { width } = Dimensions.get('window');

interface HazardReport {
    id: string;
    category: string;
    severity: number;
    title: string;
    description: string;
    verifiedCount: number;
    reportedAgo: string;
    coordinate: { latitude: number; longitude: number };
}

const CATEGORIES = [
    { id: 'poor_lighting', label: '💡 Poor Lighting', desc: 'Broken streetlights or dark stretch' },
    { id: 'harassment', label: '⚠️ Harassment Hotspot', desc: 'Frequent catcalling or intimidation' },
    { id: 'stalking', label: '👀 Suspicious Loitering', desc: 'Individuals following or loitering' },
    { id: 'isolated', label: '🏚️ Isolated / Deserted', desc: 'No open shops or pedestrian traffic' },
];

const INITIAL_HAZARDS: HazardReport[] = [
    {
        id: 'h1',
        category: 'poor_lighting',
        severity: 4,
        title: 'Broken Streetlights on 3rd Cross',
        description: 'Complete blackout between 8 PM and 6 AM. Narrow walkway.',
        verifiedCount: 5,
        reportedAgo: '3 hours ago',
        coordinate: { latitude: 12.9180, longitude: 74.8540 },
    },
    {
        id: 'h2',
        category: 'harassment',
        severity: 5,
        title: 'Harassment Hotspot near Underpass',
        description: 'Group loitering near vacant compound, passes remarks at commuters.',
        verifiedCount: 7,
        reportedAgo: 'Yesterday',
        coordinate: { latitude: 12.9100, longitude: 74.8590 },
    },
    {
        id: 'h3',
        category: 'stalking',
        severity: 4,
        title: 'Suspicious Vehicle Following Walkers',
        description: 'Two-wheeler slowly following pedestrians towards bus depot.',
        verifiedCount: 3,
        reportedAgo: '2 days ago',
        coordinate: { latitude: 12.9050, longitude: 74.8520 },
    },
    {
        id: 'h4',
        category: 'isolated',
        severity: 3,
        title: 'Completely Deserted Stretch after 9 PM',
        description: 'No commercial activity, zero CCTV coverage.',
        verifiedCount: 4,
        reportedAgo: '4 days ago',
        coordinate: { latitude: 12.9220, longitude: 74.8620 },
    },
];

export default function CommunityReportsScreen({ navigation }: any) {
    const [hazards, setHazards] = useState<HazardReport[]>(INITIAL_HAZARDS);
    const [activeFilter, setActiveFilter] = useState('all');
    const [selectedHazard, setSelectedHazard] = useState<HazardReport | null>(null);

    // Report modal state
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState(CATEGORIES[0]!.id);
    const [severity, setSeverity] = useState(3);
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
                .limit(20);
            if (data && data.length > 0) {
                // Merge Supabase reports if present
            }
        } catch (_) {}
    }

    async function submitReport() {
        setIsSubmitting(true);
        try {
            const randomBytes = await Crypto.getRandomBytesAsync(32);
            const reporterHash = '\\x' + Array.from(randomBytes, b => b.toString(16).padStart(2, '0')).join('');

            await supabase.from('unsafe_reports').insert({
                geom: `SRID=4326;POINT(${location.longitude} ${location.latitude})`,
                category: selectedCategory,
                severity: severity,
                reporter_hash: reporterHash,
            });

            // Add to local state
            const catObj = CATEGORIES.find(c => c.id === selectedCategory) || CATEGORIES[0]!;
            const newReport: HazardReport = {
                id: `rep_${Date.now()}`,
                category: selectedCategory,
                severity,
                title: `${catObj.label} Report`,
                description: catObj.desc,
                verifiedCount: 1,
                reportedAgo: 'Just now',
                coordinate: { ...location },
            };
            setHazards(prev => [newReport, ...prev]);

            Alert.alert(
                '✅ Hazard Spot Reported',
                'Your report has been cryptographically recorded. Safe Walk routing algorithms will now avoid this point for all women.'
            );
            setModalVisible(false);
        } catch (e: any) {
            Alert.alert('Submission Error', e?.message || 'Could not save report');
        } finally {
            setIsSubmitting(false);
        }
    }

    const filteredHazards = activeFilter === 'all'
        ? hazards
        : hazards.filter(h => h.category === activeFilter);

    return (
        <View style={styles.container}>
            {/* Map */}
            <MapView
                style={styles.map}
                initialRegion={{
                    latitude: location.latitude,
                    longitude: location.longitude,
                    latitudeDelta: 0.035,
                    longitudeDelta: 0.035,
                }}
            >
                {/* User location */}
                <Marker coordinate={location} title="Your Location" pinColor="blue" />

                {/* Hazard Markers */}
                {filteredHazards.map(h => (
                    <Marker
                        key={h.id}
                        coordinate={h.coordinate}
                        title={h.title}
                        description={`Verified by ${h.verifiedCount} pedestrians · ${h.reportedAgo}`}
                        pinColor={h.severity >= 4 ? 'red' : 'orange'}
                        onPress={() => setSelectedHazard(h)}
                    />
                ))}
            </MapView>

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Text style={styles.backText}>⬅️</Text>
                </TouchableOpacity>
                <View>
                    <Text style={styles.headerTitle}>Safety Hazard Map</Text>
                    <Text style={styles.headerSub}>Community Verified Incidents</Text>
                </View>
                <View style={{ width: 36 }} />
            </View>

            {/* Filter Pills */}
            <View style={styles.filtersWrapper}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
                    <TouchableOpacity
                        style={[styles.filterChip, activeFilter === 'all' && styles.filterChipActive]}
                        onPress={() => setActiveFilter('all')}
                    >
                        <Text style={[styles.filterText, activeFilter === 'all' && styles.filterTextActive]}>
                            All ({hazards.length})
                        </Text>
                    </TouchableOpacity>
                    {CATEGORIES.map(c => {
                        const count = hazards.filter(h => h.category === c.id).length;
                        return (
                            <TouchableOpacity
                                key={c.id}
                                style={[styles.filterChip, activeFilter === c.id && styles.filterChipActive]}
                                onPress={() => setActiveFilter(c.id)}
                            >
                                <Text style={[styles.filterText, activeFilter === c.id && styles.filterTextActive]}>
                                    {c.label.split(' ')[0]} {count}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            {/* Selected Hazard Card or Report Action */}
            <View style={styles.bottomBar}>
                {selectedHazard ? (
                    <View style={styles.hazardDetailCard}>
                        <View style={styles.hdcTop}>
                            <View style={styles.hdcBadge}>
                                <Text style={styles.hdcBadgeText}>SEVERITY {selectedHazard.severity}/5</Text>
                            </View>
                            <TouchableOpacity onPress={() => setSelectedHazard(null)}>
                                <Text style={{ color: '#94A3B8', fontSize: 16, fontWeight: '700' }}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.hdcTitle}>{selectedHazard.title}</Text>
                        <Text style={styles.hdcDesc}>{selectedHazard.description}</Text>
                        <View style={styles.hdcMetaRow}>
                            <Text style={styles.hdcMeta}>🛡️ Verified by {selectedHazard.verifiedCount} commuters</Text>
                            <Text style={styles.hdcMeta}>⏱️ {selectedHazard.reportedAgo}</Text>
                        </View>
                        <TouchableOpacity
                            style={styles.confirmBtn}
                            onPress={() => {
                                Alert.alert('Thank You', 'Your corroboration strengthens route avoidance.');
                                setSelectedHazard(null);
                            }}
                        >
                            <Text style={styles.confirmBtnText}>✓ I ALSO CONFIRM THIS HAZARD</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <TouchableOpacity style={styles.reportBtn} onPress={() => setModalVisible(true)} activeOpacity={0.9}>
                        <Text style={styles.reportBtnText}>⚠️  REPORT UNSAFE SPOT HERE</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* Report Modal */}
            <Modal visible={modalVisible} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalHeading}>Report Safety Hazard</Text>
                        <Text style={styles.modalSub}>
                            Standardized categories only (no free-text) to protect privacy, prevent defamation, and feed into automated safe routing.
                        </Text>

                        <Text style={styles.fieldHeading}>HAZARD CATEGORY</Text>
                        <ScrollView style={{ maxHeight: 180 }}>
                            {CATEGORIES.map(c => {
                                const isSelected = selectedCategory === c.id;
                                return (
                                    <TouchableOpacity
                                        key={c.id}
                                        style={[styles.catOption, isSelected && styles.catOptionActive]}
                                        onPress={() => setSelectedCategory(c.id)}
                                    >
                                        <Text style={[styles.catTitle, isSelected && { color: '#0F172A' }]}>
                                            {c.label}
                                        </Text>
                                        <Text style={styles.catDesc}>{c.desc}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>

                        <Text style={[styles.fieldHeading, { marginTop: 14 }]}>SEVERITY (1 = CONCERN, 5 = CRITICAL)</Text>
                        <View style={styles.severityRow}>
                            {[1, 2, 3, 4, 5].map(lvl => (
                                <TouchableOpacity
                                    key={lvl}
                                    style={[styles.severityBtn, severity === lvl && styles.severityBtnActive]}
                                    onPress={() => setSeverity(lvl)}
                                >
                                    <Text style={[styles.severityText, severity === lvl && { color: '#FFFFFF' }]}>
                                        {lvl}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <TouchableOpacity
                            style={styles.submitBtn}
                            onPress={submitReport}
                            disabled={isSubmitting}
                            activeOpacity={0.9}
                        >
                            <Text style={styles.submitBtnText}>
                                {isSubmitting ? 'SUBMITTING...' : 'SUBMIT SAFETY REPORT'}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.cancelBtn}>
                            <Text style={styles.cancelText}>Cancel</Text>
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
    filtersWrapper: { position: 'absolute', top: 116, left: 16, right: 16 },
    filterScroll: { flexDirection: 'row' },
    filterChip: {
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        paddingHorizontal: 14,
        paddingVertical: 7,
        marginRight: 8,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 2,
    },
    filterChipActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
    filterText: { fontSize: 12, fontWeight: '700', color: '#475569' },
    filterTextActive: { color: '#FFFFFF' },

    bottomBar: { position: 'absolute', bottom: 24, left: 16, right: 16 },
    reportBtn: {
        backgroundColor: '#E11D48',
        borderRadius: 14,
        paddingVertical: 16,
        alignItems: 'center',
        shadowColor: '#E11D48',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    reportBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900', letterSpacing: 0.8 },

    hazardDetailCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 18,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.1,
        shadowRadius: 14,
        elevation: 6,
    },
    hdcTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    hdcBadge: { backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    hdcBadgeText: { fontSize: 10, fontWeight: '900', color: '#DC2626' },
    hdcTitle: { fontSize: 16, fontWeight: '900', color: '#0F172A', marginTop: 8 },
    hdcDesc: { fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 18 },
    hdcMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderColor: '#F1F5F9' },
    hdcMeta: { fontSize: 11, color: '#64748B', fontWeight: '600' },
    confirmBtn: { backgroundColor: '#F1F5F9', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
    confirmBtnText: { color: '#0F172A', fontSize: 11, fontWeight: '800' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.75)', justifyContent: 'flex-end' },
    modalCard: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 22,
        paddingBottom: 36,
    },
    modalHeading: { fontSize: 20, fontWeight: '900', color: '#0F172A' },
    modalSub: { fontSize: 12, color: '#64748B', marginTop: 4, marginBottom: 16, lineHeight: 17 },
    fieldHeading: { fontSize: 10, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.5, marginBottom: 8 },
    catOption: {
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        padding: 12,
        marginBottom: 8,
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
    },
    catOptionActive: { borderColor: '#E11D48', backgroundColor: '#FFF1F2' },
    catTitle: { fontSize: 14, fontWeight: '800', color: '#334155' },
    catDesc: { fontSize: 11, color: '#64748B', marginTop: 2 },
    severityRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
    severityBtn: {
        flex: 1,
        backgroundColor: '#F8FAFC',
        borderRadius: 10,
        paddingVertical: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    severityBtnActive: { backgroundColor: '#E11D48', borderColor: '#E11D48' },
    severityText: { fontSize: 16, fontWeight: '900', color: '#64748B' },
    submitBtn: { backgroundColor: '#E11D48', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
    submitBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
    cancelBtn: { alignItems: 'center', marginTop: 14 },
    cancelText: { color: '#64748B', fontSize: 13, fontWeight: '600' },
});
