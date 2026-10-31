import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, FontSizes, Spacing, BorderRadius } from '../theme';
import { TrustedContact } from '../utils/storage';

interface ContactCardProps {
    contact: TrustedContact;
    onEdit?: () => void;
    onDelete?: () => void;
    editable?: boolean;
}

export default function ContactCard({ contact, onEdit, onDelete, editable = false }: ContactCardProps) {
    const initials = contact.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

    return (
        <View style={styles.card}>
            <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={styles.info}>
                <Text style={styles.name}>{contact.name}</Text>
                <Text style={styles.phone}>{contact.phone}</Text>
            </View>
            {editable && (
                <View style={styles.actions}>
                    {onEdit && (
                        <TouchableOpacity onPress={onEdit} style={styles.actionBtn}>
                            <Text style={styles.editText}>Edit</Text>
                        </TouchableOpacity>
                    )}
                    {onDelete && (
                        <TouchableOpacity onPress={onDelete} style={styles.actionBtn}>
                            <Text style={styles.deleteText}>✕</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
        marginBottom: Spacing.sm,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: Colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: Spacing.md,
    },
    avatarText: {
        color: Colors.white,
        fontSize: FontSizes.md,
        fontWeight: '700',
    },
    info: {
        flex: 1,
    },
    name: {
        color: Colors.text,
        fontSize: FontSizes.md,
        fontWeight: '600',
    },
    phone: {
        color: Colors.textSecondary,
        fontSize: FontSizes.sm,
        marginTop: 2,
    },
    actions: {
        flexDirection: 'row',
        gap: Spacing.sm,
    },
    actionBtn: {
        padding: Spacing.sm,
    },
    editText: {
        color: Colors.primary,
        fontSize: FontSizes.sm,
        fontWeight: '600',
    },
    deleteText: {
        color: Colors.danger,
        fontSize: FontSizes.lg,
        fontWeight: '700',
    },
});
