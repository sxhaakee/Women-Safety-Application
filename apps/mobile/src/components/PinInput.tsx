import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, FontSizes, Spacing, BorderRadius } from '../theme';

interface PinInputProps {
    title: string;
    subtitle?: string;
    onComplete: (pin: string) => void;
    error?: string;
}

export default function PinInput({ title, subtitle, onComplete, error }: PinInputProps) {
    const [pin, setPin] = useState('');
    const maxLength = 6;

    const handlePress = (digit: string) => {
        if (pin.length < maxLength) {
            const newPin = pin + digit;
            setPin(newPin);
            if (newPin.length === maxLength) {
                onComplete(newPin);
            }
        }
    };

    const handleDelete = () => {
        setPin(pin.slice(0, -1));
    };

    const handleClear = () => {
        setPin('');
    };

    const dots = Array.from({ length: maxLength }, (_, i) => (
        <View
            key={i}
            style={[
                styles.dot,
                i < pin.length && styles.dotFilled,
                error ? styles.dotError : null,
            ]}
        />
    ));

    const keys = [
        ['1', '2', '3'],
        ['4', '5', '6'],
        ['7', '8', '9'],
        ['CLR', '0', '⌫'],
    ];

    return (
        <View style={styles.container}>
            <Text style={styles.title}>{title}</Text>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

            <View style={styles.dotsContainer}>{dots}</View>

            {error && <Text style={styles.errorText}>{error}</Text>}

            <View style={styles.keypad}>
                {keys.map((row, rowIndex) => (
                    <View key={rowIndex} style={styles.keyRow}>
                        {row.map((key) => (
                            <TouchableOpacity
                                key={key}
                                style={[
                                    styles.key,
                                    key === 'CLR' || key === '⌫' ? styles.actionKey : null,
                                ]}
                                onPress={() => {
                                    if (key === '⌫') handleDelete();
                                    else if (key === 'CLR') handleClear();
                                    else handlePress(key);
                                }}
                                activeOpacity={0.6}
                            >
                                <Text
                                    style={[
                                        styles.keyText,
                                        key === 'CLR' || key === '⌫' ? styles.actionKeyText : null,
                                    ]}
                                >
                                    {key}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        paddingTop: Spacing.xl,
    },
    title: {
        fontSize: FontSizes.xl,
        fontWeight: '700',
        color: Colors.text,
        marginBottom: Spacing.sm,
    },
    subtitle: {
        fontSize: FontSizes.sm,
        color: Colors.textSecondary,
        marginBottom: Spacing.lg,
    },
    dotsContainer: {
        flexDirection: 'row',
        gap: Spacing.md,
        marginVertical: Spacing.xl,
    },
    dot: {
        width: 18,
        height: 18,
        borderRadius: 9,
        borderWidth: 2,
        borderColor: Colors.textMuted,
        backgroundColor: 'transparent',
    },
    dotFilled: {
        backgroundColor: Colors.primary,
        borderColor: Colors.primary,
    },
    dotError: {
        borderColor: Colors.danger,
        backgroundColor: 'transparent',
    },
    errorText: {
        color: Colors.danger,
        fontSize: FontSizes.sm,
        marginBottom: Spacing.md,
    },
    keypad: {
        marginTop: Spacing.lg,
        gap: Spacing.sm,
    },
    keyRow: {
        flexDirection: 'row',
        gap: Spacing.sm,
    },
    key: {
        width: 80,
        height: 64,
        borderRadius: BorderRadius.lg,
        backgroundColor: Colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionKey: {
        backgroundColor: Colors.surfaceLight,
    },
    keyText: {
        fontSize: FontSizes.xl,
        fontWeight: '600',
        color: Colors.text,
    },
    actionKeyText: {
        fontSize: FontSizes.lg,
        color: Colors.textSecondary,
    },
});
