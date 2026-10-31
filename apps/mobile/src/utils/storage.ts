import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
    ONBOARDING_COMPLETE: 'shesafe_onboarding_complete',
    USER_PROFILE: 'shesafe_user_profile',
    TRUSTED_CONTACTS: 'shesafe_trusted_contacts',
    PIN: 'shesafe_pin',
    SHAKE_SENSITIVITY: 'shesafe_shake_sensitivity',
    SAFE_HOURS: 'shesafe_safe_hours',
};

export interface UserProfile {
    name: string;
    phone: string;
}

export interface TrustedContact {
    id: string;
    name: string;
    phone: string;
}

export interface SafeHours {
    start: string; // "HH:MM"
    end: string;   // "HH:MM"
}

export async function isOnboardingComplete(): Promise<boolean> {
    const val = await AsyncStorage.getItem(KEYS.ONBOARDING_COMPLETE);
    return val === 'true';
}

export async function setOnboardingComplete(): Promise<void> {
    await AsyncStorage.setItem(KEYS.ONBOARDING_COMPLETE, 'true');
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
    await AsyncStorage.setItem(KEYS.USER_PROFILE, JSON.stringify(profile));
}

export async function getUserProfile(): Promise<UserProfile | null> {
    const val = await AsyncStorage.getItem(KEYS.USER_PROFILE);
    return val ? JSON.parse(val) : null;
}

export async function saveTrustedContacts(contacts: TrustedContact[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.TRUSTED_CONTACTS, JSON.stringify(contacts));
}

export async function getTrustedContacts(): Promise<TrustedContact[]> {
    const val = await AsyncStorage.getItem(KEYS.TRUSTED_CONTACTS);
    return val ? JSON.parse(val) : [];
}

export async function savePin(pin: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.PIN, pin);
}

export async function getPin(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.PIN);
}

export async function verifyPin(pin: string): Promise<boolean> {
    const stored = await getPin();
    return stored === pin;
}

export async function saveShakeSensitivity(level: 'low' | 'medium' | 'high'): Promise<void> {
    await AsyncStorage.setItem(KEYS.SHAKE_SENSITIVITY, level);
}

export async function getShakeSensitivity(): Promise<'low' | 'medium' | 'high'> {
    const val = await AsyncStorage.getItem(KEYS.SHAKE_SENSITIVITY);
    return (val as 'low' | 'medium' | 'high') || 'medium';
}

export async function saveSafeHours(hours: SafeHours): Promise<void> {
    await AsyncStorage.setItem(KEYS.SAFE_HOURS, JSON.stringify(hours));
}

export async function getSafeHours(): Promise<SafeHours> {
    const val = await AsyncStorage.getItem(KEYS.SAFE_HOURS);
    return val ? JSON.parse(val) : { start: '06:00', end: '22:00' };
}
