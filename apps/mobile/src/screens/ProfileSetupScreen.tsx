import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
    Alert,
    StatusBar,
} from 'react-native';
import { Colors, FontSizes, Spacing, BorderRadius } from '../theme';
import {
    saveUserProfile,
    saveTrustedContacts,
    TrustedContact,
} from '../utils/storage';
import ContactCard from '../components/ContactCard';

export default function ProfileSetupScreen({ navigation }: any) {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [contacts, setContacts] = useState<TrustedContact[]>([]);
    const [newContactName, setNewContactName] = useState('');
    const [newContactPhone, setNewContactPhone] = useState('');
    const [showAddContact, setShowAddContact] = useState(false);

    const addContact = () => {
        if (!newContactName.trim() || !newContactPhone.trim()) {
            Alert.alert('Required', 'Please enter both name and phone number');
            return;
        }
        if (contacts.length >= 3) {
            Alert.alert('Maximum Reached', 'You can add up to 3 trusted contacts');
            return;
        }
        const newContact: TrustedContact = {
            id: Date.now().toString(),
            name: newContactName.trim(),
            phone: newContactPhone.trim(),
        };
        setContacts([...contacts, newContact]);
        setNewContactName('');
        setNewContactPhone('');
        setShowAddContact(false);
    };

    const removeContact = (id: string) => {
        setContacts(contacts.filter((c) => c.id !== id));
    };

    const handleContinue = async () => {
        if (!name.trim() || !phone.trim()) {
            Alert.alert('Required', 'Please enter your name and phone number');
            return;
        }
        if (contacts.length === 0) {
            Alert.alert('Required', 'Please add at least one trusted contact');
            return;
        }
        await saveUserProfile({ name: name.trim(), phone: phone.trim() });
        await saveTrustedContacts(contacts);
        navigation.navigate('PinSetup');
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.flex}
            >
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    <Text style={styles.step}>Step 2 of 3</Text>
                    <Text style={styles.title}>Your Profile</Text>
                    <Text style={styles.subtitle}>
                        This info is used only during emergencies to identify you
                    </Text>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Full Name</Text>
                        <TextInput
                            style={styles.input}
                            value={name}
                            onChangeText={setName}
                            placeholder="Enter your full name"
                            placeholderTextColor={Colors.textMuted}
                            autoCapitalize="words"
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Phone Number</Text>
                        <TextInput
                            style={styles.input}
                            value={phone}
                            onChangeText={setPhone}
                            placeholder="+91 XXXXX XXXXX"
                            placeholderTextColor={Colors.textMuted}
                            keyboardType="phone-pad"
                        />
                    </View>

                    {/* Trusted Contacts Section */}
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>
                                Trusted Contacts ({contacts.length}/3)
                            </Text>
                            <Text style={styles.sectionSubtitle}>
                                These people will be notified in an emergency
                            </Text>
                        </View>

                        {contacts.map((contact) => (
                            <ContactCard
                                key={contact.id}
                                contact={contact}
                                editable
                                onDelete={() => removeContact(contact.id)}
                            />
                        ))}

                        {showAddContact ? (
                            <View style={styles.addContactForm}>
                                <TextInput
                                    style={styles.input}
                                    value={newContactName}
                                    onChangeText={setNewContactName}
                                    placeholder="Contact name"
                                    placeholderTextColor={Colors.textMuted}
                                    autoCapitalize="words"
                                    autoFocus
                                />
                                <TextInput
                                    style={[styles.input, { marginTop: Spacing.sm }]}
                                    value={newContactPhone}
                                    onChangeText={setNewContactPhone}
                                    placeholder="+91 XXXXX XXXXX"
                                    placeholderTextColor={Colors.textMuted}
                                    keyboardType="phone-pad"
                                />
                                <View style={styles.addContactActions}>
                                    <TouchableOpacity
                                        style={styles.cancelBtn}
                                        onPress={() => {
                                            setShowAddContact(false);
                                            setNewContactName('');
                                            setNewContactPhone('');
                                        }}
                                    >
                                        <Text style={styles.cancelBtnText}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.addBtn} onPress={addContact}>
                                        <Text style={styles.addBtnText}>Add</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ) : (
                            contacts.length < 3 && (
                                <TouchableOpacity
                                    style={styles.addContactBtn}
                                    onPress={() => setShowAddContact(true)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.addContactBtnIcon}>+</Text>
                                    <Text style={styles.addContactBtnText}>Add Trusted Contact</Text>
                                </TouchableOpacity>
                            )
                        )}
                    </View>

                    <TouchableOpacity
                        style={[
                            styles.continueBtn,
                            (!name.trim() || !phone.trim() || contacts.length === 0) &&
                            styles.continueBtnDisabled,
                        ]}
                        onPress={handleContinue}
                        activeOpacity={0.8}
                        disabled={!name.trim() || !phone.trim() || contacts.length === 0}
                    >
                        <Text style={styles.continueBtnText}>Continue →</Text>
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    flex: {
        flex: 1,
    },
    scrollContent: {
        padding: Spacing.lg,
        paddingTop: Spacing.xxl + 20,
        paddingBottom: Spacing.xxl,
    },
    step: {
        color: Colors.primary,
        fontSize: FontSizes.sm,
        fontWeight: '700',
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    title: {
        fontSize: FontSizes.xxl,
        fontWeight: '700',
        color: Colors.text,
        marginTop: Spacing.sm,
    },
    subtitle: {
        fontSize: FontSizes.sm,
        color: Colors.textSecondary,
        marginTop: Spacing.xs,
        marginBottom: Spacing.xl,
    },
    inputGroup: {
        marginBottom: Spacing.md,
    },
    label: {
        color: Colors.textSecondary,
        fontSize: FontSizes.sm,
        fontWeight: '600',
        marginBottom: Spacing.sm,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    input: {
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.md,
        paddingVertical: Spacing.md,
        paddingHorizontal: Spacing.md,
        color: Colors.text,
        fontSize: FontSizes.md,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    section: {
        marginTop: Spacing.lg,
        marginBottom: Spacing.xl,
    },
    sectionHeader: {
        marginBottom: Spacing.md,
    },
    sectionTitle: {
        color: Colors.text,
        fontSize: FontSizes.lg,
        fontWeight: '700',
    },
    sectionSubtitle: {
        color: Colors.textSecondary,
        fontSize: FontSizes.xs,
        marginTop: 2,
    },
    addContactBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.md,
        borderWidth: 2,
        borderColor: Colors.primary,
        borderStyle: 'dashed',
    },
    addContactBtnIcon: {
        color: Colors.primary,
        fontSize: FontSizes.xl,
        fontWeight: '700',
        marginRight: Spacing.sm,
    },
    addContactBtnText: {
        color: Colors.primary,
        fontSize: FontSizes.md,
        fontWeight: '600',
    },
    addContactForm: {
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    addContactActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: Spacing.sm,
        marginTop: Spacing.md,
    },
    cancelBtn: {
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.md,
    },
    cancelBtnText: {
        color: Colors.textSecondary,
        fontSize: FontSizes.md,
    },
    addBtn: {
        backgroundColor: Colors.primary,
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.lg,
        borderRadius: BorderRadius.sm,
    },
    addBtnText: {
        color: Colors.white,
        fontSize: FontSizes.md,
        fontWeight: '600',
    },
    continueBtn: {
        backgroundColor: Colors.primary,
        borderRadius: BorderRadius.lg,
        paddingVertical: Spacing.md + 2,
        alignItems: 'center',
    },
    continueBtnDisabled: {
        opacity: 0.4,
    },
    continueBtnText: {
        color: Colors.white,
        fontSize: FontSizes.lg,
        fontWeight: '700',
    },
});
