import React, { useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Alert,
    StatusBar,
} from 'react-native';
import { Colors, FontSizes, Spacing, BorderRadius } from '../theme';
import ShieldIcon from '../components/ShieldIcon';

interface PermissionItem {
    key: string;
    icon: string;
    title: string;
    description: string;
    granted: boolean;
}

export default function PermissionsScreen({ navigation }: any) {
    const [permissions, setPermissions] = useState<PermissionItem[]>([
        {
            key: 'location',
            icon: '📍',
            title: 'Location (Always)',
            description: 'To find nearest police stations and share your live location during emergencies',
            granted: false,
        },
        {
            key: 'microphone',
            icon: '🎤',
            title: 'Microphone',
            description: 'To record audio evidence during an emergency alert',
            granted: false,
        },
        {
            key: 'camera',
            icon: '📷',
            title: 'Camera',
            description: 'To capture visual evidence if needed during alerts',
            granted: false,
        },
        {
            key: 'sms',
            icon: '💬',
            title: 'SMS',
            description: 'To send emergency SMS even without internet connection',
            granted: false,
        },
        {
            key: 'motion',
            icon: '📱',
            title: 'Motion Sensors',
            description: 'To detect shake gestures and unusual movement patterns',
            granted: false,
        },
    ]);

    const handleAllowAll = async () => {
        // In production, each permission would be requested via expo modules
        // For demo, we simulate granting all
        const updated = permissions.map((p) => ({ ...p, granted: true }));
        setPermissions(updated);

        // Small delay for visual feedback
        setTimeout(() => {
            navigation.navigate('ProfileSetup');
        }, 500);
    };

    const togglePermission = (key: string) => {
        setPermissions((prev) =>
            prev.map((p) => (p.key === key ? { ...p, granted: !p.granted } : p))
        );
    };

    const allGranted = permissions.every((p) => p.granted);

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <View style={styles.header}>
                    <ShieldIcon size={56} />
                    <Text style={styles.appName}>SheSafe</Text>
                    <Text style={styles.title}>App Permissions</Text>
                    <Text style={styles.subtitle}>
                        We need these permissions to keep you safe. Each one is critical for the protection system.
                    </Text>
                </View>

                <View style={styles.permissionsList}>
                    {permissions.map((perm) => (
                        <TouchableOpacity
                            key={perm.key}
                            style={[styles.permCard, perm.granted && styles.permCardGranted]}
                            onPress={() => togglePermission(perm.key)}
                            activeOpacity={0.7}
                        >
                            <View style={styles.permLeft}>
                                <Text style={styles.permIcon}>{perm.icon}</Text>
                                <View style={styles.permInfo}>
                                    <Text style={styles.permTitle}>{perm.title}</Text>
                                    <Text style={styles.permDesc}>{perm.description}</Text>
                                </View>
                            </View>
                            <View style={[styles.checkbox, perm.granted && styles.checkboxGranted]}>
                                {perm.granted && <Text style={styles.checkmark}>✓</Text>}
                            </View>
                        </TouchableOpacity>
                    ))}
                </View>

                <TouchableOpacity
                    style={[styles.allowAllBtn, allGranted && styles.allowAllBtnDone]}
                    onPress={handleAllowAll}
                    activeOpacity={0.8}
                >
                    <Text style={styles.allowAllText}>
                        {allGranted ? 'Continue →' : 'Allow All & Continue'}
                    </Text>
                </TouchableOpacity>

                <Text style={styles.footerText}>
                    Your data is encrypted and never shared with third parties
                </Text>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    scrollContent: {
        padding: Spacing.lg,
        paddingTop: Spacing.xxl + 20,
        paddingBottom: Spacing.xxl,
    },
    header: {
        alignItems: 'center',
        marginBottom: Spacing.xl,
    },
    appName: {
        fontSize: FontSizes.lg,
        fontWeight: '800',
        color: Colors.primary,
        marginTop: Spacing.sm,
        letterSpacing: 2,
    },
    title: {
        fontSize: FontSizes.xxl,
        fontWeight: '700',
        color: Colors.text,
        marginTop: Spacing.md,
    },
    subtitle: {
        fontSize: FontSizes.sm,
        color: Colors.textSecondary,
        textAlign: 'center',
        marginTop: Spacing.sm,
        lineHeight: 20,
        paddingHorizontal: Spacing.md,
    },
    permissionsList: {
        gap: Spacing.sm,
        marginBottom: Spacing.xl,
    },
    permCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    permCardGranted: {
        borderColor: Colors.safe,
        backgroundColor: 'rgba(39, 174, 96, 0.08)',
    },
    permLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    permIcon: {
        fontSize: 28,
        marginRight: Spacing.md,
    },
    permInfo: {
        flex: 1,
    },
    permTitle: {
        color: Colors.text,
        fontSize: FontSizes.md,
        fontWeight: '600',
    },
    permDesc: {
        color: Colors.textSecondary,
        fontSize: FontSizes.xs,
        marginTop: 2,
        lineHeight: 16,
    },
    checkbox: {
        width: 28,
        height: 28,
        borderRadius: 14,
        borderWidth: 2,
        borderColor: Colors.textMuted,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: Spacing.sm,
    },
    checkboxGranted: {
        backgroundColor: Colors.safe,
        borderColor: Colors.safe,
    },
    checkmark: {
        color: Colors.white,
        fontSize: FontSizes.md,
        fontWeight: '700',
    },
    allowAllBtn: {
        backgroundColor: Colors.primary,
        borderRadius: BorderRadius.lg,
        paddingVertical: Spacing.md + 2,
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    allowAllBtnDone: {
        backgroundColor: Colors.safe,
    },
    allowAllText: {
        color: Colors.white,
        fontSize: FontSizes.lg,
        fontWeight: '700',
    },
    footerText: {
        color: Colors.textMuted,
        fontSize: FontSizes.xs,
        textAlign: 'center',
    },
});
