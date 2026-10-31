import React from 'react';
import { View, Text } from 'react-native';

export const PROVIDER_GOOGLE = 'google';

export const Marker = ({ children, title }: any) => {
    return <View>{children || (title ? <Text style={{ color: '#fff' }}>{title}</Text> : null)}</View>;
};

const SafeMapView = ({ children, style }: any) => {
    return (
        <View style={[{ backgroundColor: '#131B2E', justifyContent: 'center', alignItems: 'center', minHeight: 200, borderRadius: 12, borderWidth: 1, borderColor: '#1E2D4A', padding: 16 }, style]}>
            <Text style={{ color: '#00D4FF', fontSize: 13, fontWeight: '700', marginBottom: 4 }}>📍 Live Map</Text>
            <Text style={{ color: '#8892B0', fontSize: 12, textAlign: 'center' }}>Map view is optimized for iOS / Android via Expo Go.</Text>
            {children}
        </View>
    );
};

export default SafeMapView;
