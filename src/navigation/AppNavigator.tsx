import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Colors } from '../theme';

// Auth
import LoginScreen from '../screens/LoginScreen';

// Role dashboards
import VictimDashboard from '../screens/DashboardScreen';
import GuardianDashboard from '../screens/GuardianDashboard';
import PoliceDashboard from '../screens/PoliceDashboard';

// Alert flow
import AlertCountdownScreen from '../screens/AlertCountdownScreen';
import AlertFiredScreen from '../screens/AlertFiredScreen';

const Stack = createNativeStackNavigator();

/**
 * AppNavigator — always starts at Login so victim always goes
 * through PIN setup fresh and `shesafe_victim_pin` is always saved.
 */
export default function AppNavigator() {
    return (
        <NavigationContainer>
            <Stack.Navigator
                initialRouteName="Login"
                screenOptions={{
                    headerShown: false,
                    animation: 'fade',
                    contentStyle: { backgroundColor: Colors.background },
                }}
            >
                {/* Auth — always starts here */}
                <Stack.Screen name="Login" component={LoginScreen} />

                {/* Victim flow */}
                <Stack.Screen name="VictimDashboard" component={VictimDashboard} />
                <Stack.Screen
                    name="AlertCountdown"
                    component={AlertCountdownScreen}
                    options={{ gestureEnabled: false, animation: 'slide_from_bottom' }}
                />
                <Stack.Screen
                    name="AlertFired"
                    component={AlertFiredScreen}
                    options={{ gestureEnabled: false, animation: 'slide_from_bottom' }}
                />

                {/* Guardian */}
                <Stack.Screen name="GuardianDashboard" component={GuardianDashboard} />

                {/* Police */}
                <Stack.Screen name="PoliceDashboard" component={PoliceDashboard} />
            </Stack.Navigator>
        </NavigationContainer>
    );
}
