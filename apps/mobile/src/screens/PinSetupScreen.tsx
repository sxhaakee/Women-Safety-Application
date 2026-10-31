import React, { useState } from 'react';
import { View, Text, StyleSheet, StatusBar, Alert } from 'react-native';
import { Colors, FontSizes, Spacing } from '../theme';
import PinInput from '../components/PinInput';
import { savePin, setOnboardingComplete } from '../utils/storage';

export default function PinSetupScreen({ navigation }: any) {
    const [step, setStep] = useState<'create' | 'confirm' | 'done'>('create');
    const [firstPin, setFirstPin] = useState('');
    const [error, setError] = useState('');

    const handlePinCreate = (pin: string) => {
        setFirstPin(pin);
        setStep('confirm');
        setError('');
    };

    const handlePinConfirm = async (pin: string) => {
        if (pin === firstPin) {
            await savePin(pin);
            await setOnboardingComplete();
            setStep('done');
            // Navigate to dashboard after brief delay
            setTimeout(() => {
                navigation.reset({
                    index: 0,
                    routes: [{ name: 'Dashboard' }],
                });
            }, 1500);
        } else {
            setError('PINs do not match. Try again.');
            setStep('create');
            setFirstPin('');
        }
    };

    if (step === 'done') {
        return (
            <View style={styles.container}>
                <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
                <View style={styles.doneContainer}>
                    <Text style={styles.doneIcon}>🛡️</Text>
                    <Text style={styles.doneTitle}>You're All Set!</Text>
                    <Text style={styles.doneSubtitle}>SheSafe is now protecting you</Text>

                    <View style={styles.widgetGuide}>
                        <Text style={styles.widgetTitle}>📱 Add Home Screen Widget</Text>
                        <Text style={styles.widgetStep}>
                            1. Long press on your home screen
                        </Text>
                        <Text style={styles.widgetStep}>
                            2. Tap "Widgets" → Find "SheSafe"
                        </Text>
                        <Text style={styles.widgetStep}>
                            3. Drag it to your home screen
                        </Text>
                        <Text style={styles.widgetStepBold}>
                            One tap on the widget = instant emergency trigger
                        </Text>
                    </View>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
            <Text style={styles.step}>Step 3 of 3</Text>
            <PinInput
                title={step === 'create' ? 'Create Your PIN' : 'Confirm Your PIN'}
                subtitle={
                    step === 'create'
                        ? 'This 6-digit PIN is used to cancel false alarms'
                        : 'Enter the same PIN again to confirm'
                }
                onComplete={step === 'create' ? handlePinCreate : handlePinConfirm}
                error={error}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.xxl + 20,
    },
    step: {
        color: Colors.primary,
        fontSize: FontSizes.sm,
        fontWeight: '700',
        letterSpacing: 1,
        textTransform: 'uppercase',
        textAlign: 'center',
    },
    doneContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingBottom: 80,
    },
    doneIcon: {
        fontSize: 80,
        marginBottom: Spacing.lg,
    },
    doneTitle: {
        fontSize: FontSizes.xxl,
        fontWeight: '800',
        color: Colors.safe,
    },
    doneSubtitle: {
        fontSize: FontSizes.md,
        color: Colors.textSecondary,
        marginTop: Spacing.sm,
        marginBottom: Spacing.xl,
    },
    widgetGuide: {
        backgroundColor: Colors.surface,
        borderRadius: 16,
        padding: Spacing.lg,
        width: '100%',
        borderWidth: 1,
        borderColor: Colors.border,
    },
    widgetTitle: {
        fontSize: FontSizes.lg,
        fontWeight: '700',
        color: Colors.text,
        marginBottom: Spacing.md,
    },
    widgetStep: {
        fontSize: FontSizes.sm,
        color: Colors.textSecondary,
        marginBottom: Spacing.sm,
        lineHeight: 20,
    },
    widgetStepBold: {
        fontSize: FontSizes.sm,
        color: Colors.warning,
        fontWeight: '700',
        marginTop: Spacing.sm,
        lineHeight: 20,
    },
});
