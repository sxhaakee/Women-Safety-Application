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
import VolunteerDashboard from '../screens/VolunteerDashboard';

// Alert flow
import AlertCountdownScreen from '../screens/AlertCountdownScreen';
import DeterrenceScreen from '../screens/DeterrenceScreen';
import DemoDirectorScreen from '../screens/DemoDirectorScreen';

// Prevention & Community
import SafeWalkScreen from '../screens/SafeWalkScreen';
import CabGuardianScreen from '../screens/CabGuardianScreen';
import CommunityReportsScreen from '../screens/CommunityReportsScreen';
import SensorCalibrationScreen from '../screens/SensorCalibrationScreen';

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
                    name="DeterrenceScreen"
                    component={DeterrenceScreen}
                    options={{ gestureEnabled: false, animation: 'slide_from_bottom' }}
                />
                <Stack.Screen
                    name="AlertFired"
                    component={DeterrenceScreen}
                    options={{ gestureEnabled: false, animation: 'slide_from_bottom' }}
                />
                <Stack.Screen
                    name="DemoDirector"
                    component={DemoDirectorScreen}
                    options={{ headerShown: false, animation: 'slide_from_right' }}
                />
                <Stack.Screen
                    name="SafeWalk"
                    component={SafeWalkScreen}
                    options={{ headerShown: false, animation: 'slide_from_right' }}
                />
                <Stack.Screen
                    name="CabGuardian"
                    component={CabGuardianScreen}
                    options={{ headerShown: false, animation: 'slide_from_right' }}
                />
                <Stack.Screen
                    name="CommunityReports"
                    component={CommunityReportsScreen}
                    options={{ headerShown: false, animation: 'slide_from_right' }}
                />
                <Stack.Screen
                    name="SensorCalibration"
                    component={SensorCalibrationScreen}
                    options={{ headerShown: false, animation: 'slide_from_right' }}
                />

                {/* Guardian */}
                <Stack.Screen name="GuardianDashboard" component={GuardianDashboard} />

                {/* Police */}
                <Stack.Screen name="PoliceDashboard" component={PoliceDashboard} />

                {/* Volunteer / Rakshak */}
                <Stack.Screen name="VolunteerDashboard" component={VolunteerDashboard} />
            </Stack.Navigator>
        </NavigationContainer>
    );
}

