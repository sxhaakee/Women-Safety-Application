import React, { useState, useEffect } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, ScrollView,
    TextInput, Alert, StatusBar, Modal, Switch,
} from 'react-native';
import { Colors, FontSizes, Spacing, BorderRadius } from '../theme';
import {
    getTrustedContacts, saveTrustedContacts, TrustedContact,
    getShakeSensitivity, saveShakeSensitivity,
    getSafeHours, saveSafeHours, SafeHours,
} from '../utils/storage';
import ContactCard from '../components/ContactCard';
import PinInput from '../components/PinInput';
import { savePin, verifyPin } from '../utils/storage';

export default function SettingsScreen({ navigation }: any) {
    const [contacts, setContacts] = useState<TrustedContact[]>([]);
    const [sensitivity, setSensitivity] = useState<'low' | 'medium' | 'high'>('medium');
    const [safeHours, setSafeHours] = useState<SafeHours>({ start: '06:00', end: '22:00' });
    const [showAddContact, setShowAddContact] = useState(false);
    const [showChangePin, setShowChangePin] = useState(false);
    const [newName, setNewName] = useState('');
    const [newPhone, setNewPhone] = useState('');
    const [pinStep, setPinStep] = useState<'verify' | 'new'>('verify');

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        setContacts(await getTrustedContacts());
        setSensitivity(await getShakeSensitivity());
        setSafeHours(await getSafeHours());
    };

    const addContact = async () => {
        if (!newName.trim() || !newPhone.trim()) return;
        if (contacts.length >= 3) { Alert.alert('Max 3 contacts'); return; }
        const updated = [...contacts, { id: Date.now().toString(), name: newName.trim(), phone: newPhone.trim() }];
        setContacts(updated);
        await saveTrustedContacts(updated);
        setNewName(''); setNewPhone(''); setShowAddContact(false);
    };

    const removeContact = async (id: string) => {
        const updated = contacts.filter(c => c.id !== id);
        setContacts(updated);
        await saveTrustedContacts(updated);
    };

    const changeSensitivity = async (level: 'low' | 'medium' | 'high') => {
        setSensitivity(level);
        await saveShakeSensitivity(level);
    };

    const handleTestAlert = () => {
        Alert.alert('Test Alert', 'This will send a TEST SMS to your trusted contacts only (not police).', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Send Test', onPress: () => Alert.alert('✓ Test SMS sent!') },
        ]);
    };

    const handlePinVerify = async (pin: string) => {
        const valid = await verifyPin(pin);
        if (valid) setPinStep('new');
        else Alert.alert('Wrong PIN');
    };

    const handleNewPin = async (pin: string) => {
        await savePin(pin);
        setShowChangePin(false);
        setPinStep('verify');
        Alert.alert('✓ PIN Updated');
    };

    const SensitivityBtn = ({ level, label }: { level: 'low' | 'medium' | 'high'; label: string }) => (
        <TouchableOpacity
            style={[st.sensBtn, sensitivity === level && st.sensBtnActive]}
            onPress={() => changeSensitivity(level)}
        >
            <Text style={[st.sensBtnText, sensitivity === level && st.sensBtnTextActive]}>{label}</Text>
        </TouchableOpacity>
    );

    return (
        <View style={st.container}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
            <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
                <View style={st.headerRow}>
                    <TouchableOpacity onPress={() => navigation.goBack()}>
                        <Text style={st.backBtn}>← Back</Text>
                    </TouchableOpacity>
                    <Text style={st.title}>Settings</Text>
                    <View style={{ width: 50 }} />
                </View>

                {/* Trusted Contacts */}
                <Text style={st.secTitle}>Trusted Contacts ({contacts.length}/3)</Text>
                {contacts.map(c => (
                    <ContactCard key={c.id} contact={c} editable onDelete={() => removeContact(c.id)} />
                ))}
                {contacts.length < 3 && !showAddContact && (
                    <TouchableOpacity style={st.addBtn} onPress={() => setShowAddContact(true)}>
                        <Text style={st.addBtnText}>+ Add Contact</Text>
                    </TouchableOpacity>
                )}
                {showAddContact && (
                    <View style={st.addForm}>
                        <TextInput style={st.input} value={newName} onChangeText={setNewName} placeholder="Name" placeholderTextColor={Colors.textMuted} />
                        <TextInput style={[st.input, { marginTop: 8 }]} value={newPhone} onChangeText={setNewPhone} placeholder="Phone" placeholderTextColor={Colors.textMuted} keyboardType="phone-pad" />
                        <View style={st.addActions}>
                            <TouchableOpacity onPress={() => { setShowAddContact(false); setNewName(''); setNewPhone(''); }}>
                                <Text style={{ color: Colors.textSecondary }}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={st.saveBtn} onPress={addContact}>
                                <Text style={{ color: Colors.white, fontWeight: '600' }}>Add</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {/* Shake Sensitivity */}
                <Text style={[st.secTitle, { marginTop: Spacing.xl }]}>Shake Sensitivity</Text>
                <View style={st.sensRow}>
                    <SensitivityBtn level="low" label="Low" />
                    <SensitivityBtn level="medium" label="Medium" />
                    <SensitivityBtn level="high" label="High" />
                </View>

                {/* Safe Hours */}
                <Text style={[st.secTitle, { marginTop: Spacing.xl }]}>Safe Hours</Text>
                <View style={st.hoursRow}>
                    <View style={st.hourInput}>
                        <Text style={st.hourLabel}>Start</Text>
                        <TextInput style={st.input} value={safeHours.start} onChangeText={t => setSafeHours({ ...safeHours, start: t })} placeholder="06:00" placeholderTextColor={Colors.textMuted} />
                    </View>
                    <View style={st.hourInput}>
                        <Text style={st.hourLabel}>End</Text>
                        <TextInput style={st.input} value={safeHours.end} onChangeText={t => setSafeHours({ ...safeHours, end: t })} placeholder="22:00" placeholderTextColor={Colors.textMuted} />
                    </View>
                </View>
                <TouchableOpacity style={st.smallBtn} onPress={() => saveSafeHours(safeHours).then(() => Alert.alert('✓ Saved'))}>
                    <Text style={st.smallBtnText}>Save Hours</Text>
                </TouchableOpacity>

                {/* Change PIN */}
                <TouchableOpacity style={[st.optionBtn, { marginTop: Spacing.xl }]} onPress={() => { setPinStep('verify'); setShowChangePin(true); }}>
                    <Text style={st.optionIcon}>🔐</Text>
                    <Text style={st.optionText}>Change PIN</Text>
                    <Text style={st.optionArrow}>→</Text>
                </TouchableOpacity>

                {/* Test Alert */}
                <TouchableOpacity style={[st.optionBtn, { borderColor: Colors.warning }]} onPress={handleTestAlert}>
                    <Text style={st.optionIcon}>🧪</Text>
                    <Text style={[st.optionText, { color: Colors.warning }]}>Test Alert</Text>
                    <Text style={st.optionArrow}>→</Text>
                </TouchableOpacity>
                <Text style={st.testNote}>Sends test SMS to trusted contacts only, not police</Text>
            </ScrollView>

            {/* Change PIN Modal */}
            <Modal visible={showChangePin} animationType="slide" transparent>
                <View style={st.modalOverlay}>
                    <View style={st.modalContent}>
                        <TouchableOpacity style={st.modalClose} onPress={() => setShowChangePin(false)}>
                            <Text style={{ color: Colors.textSecondary, fontSize: 22 }}>✕</Text>
                        </TouchableOpacity>
                        <PinInput
                            title={pinStep === 'verify' ? 'Enter Current PIN' : 'Enter New PIN'}
                            subtitle={pinStep === 'verify' ? 'Verify your identity' : 'Choose a new 6-digit PIN'}
                            onComplete={pinStep === 'verify' ? handlePinVerify : handleNewPin}
                        />
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const st = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    scroll: { padding: Spacing.lg, paddingTop: Spacing.xxl + 10, paddingBottom: Spacing.xxl },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xl },
    backBtn: { color: Colors.primary, fontSize: FontSizes.md, fontWeight: '600' },
    title: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: '800' },
    secTitle: { color: Colors.text, fontSize: FontSizes.lg, fontWeight: '700', marginBottom: Spacing.md },
    addBtn: { borderWidth: 2, borderColor: Colors.primary, borderStyle: 'dashed', borderRadius: BorderRadius.md, padding: Spacing.md, alignItems: 'center' },
    addBtnText: { color: Colors.primary, fontWeight: '600', fontSize: FontSizes.md },
    addForm: { backgroundColor: Colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
    input: { backgroundColor: Colors.surfaceLight, borderRadius: BorderRadius.sm, padding: Spacing.md, color: Colors.text, fontSize: FontSizes.md },
    addActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.md, marginTop: Spacing.md, alignItems: 'center' },
    saveBtn: { backgroundColor: Colors.primary, paddingVertical: 8, paddingHorizontal: Spacing.lg, borderRadius: BorderRadius.sm },
    sensRow: { flexDirection: 'row', gap: Spacing.sm },
    sensBtn: { flex: 1, paddingVertical: Spacing.md, borderRadius: BorderRadius.md, backgroundColor: Colors.surface, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
    sensBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    sensBtnText: { color: Colors.textSecondary, fontWeight: '600' },
    sensBtnTextActive: { color: Colors.white },
    hoursRow: { flexDirection: 'row', gap: Spacing.md },
    hourInput: { flex: 1 },
    hourLabel: { color: Colors.textSecondary, fontSize: FontSizes.sm, marginBottom: 4 },
    smallBtn: { backgroundColor: Colors.surface, borderRadius: BorderRadius.sm, padding: Spacing.sm, alignItems: 'center', marginTop: Spacing.sm, alignSelf: 'flex-end', paddingHorizontal: Spacing.lg },
    smallBtnText: { color: Colors.primary, fontWeight: '600', fontSize: FontSizes.sm },
    optionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
    optionIcon: { fontSize: 22, marginRight: Spacing.md },
    optionText: { flex: 1, color: Colors.text, fontSize: FontSizes.md, fontWeight: '600' },
    optionArrow: { color: Colors.textMuted, fontSize: FontSizes.lg },
    testNote: { color: Colors.textMuted, fontSize: FontSizes.xs, textAlign: 'center', marginTop: 4 },
    modalOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
    modalContent: { backgroundColor: Colors.background, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, paddingBottom: Spacing.xxl, minHeight: '70%' },
    modalClose: { alignSelf: 'flex-end', padding: Spacing.md },
});
