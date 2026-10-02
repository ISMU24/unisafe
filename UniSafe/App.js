import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { TouchableOpacity } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { MaterialIcons } from '@expo/vector-icons';
import { ThemeProvider, useTheme } from './src/ThemeContext';
import { bindRealtimeLifecycle, connectRealtime, disconnectRealtime } from './src/utils/realtime';

import SplashScreen from './screens/SplashScreen';
import LoginScreen from './screens/LoginScreen';
import HomeScreen from './screens/HomeScreen';
import SOSScreen from './screens/SOSScreen';
import SOSStatusScreen from './screens/SOSStatusScreen';
import ReportIncidentScreen from './screens/ReportIncidentScreen';
import MyReportsScreen from './screens/MyReportsScreen';
import ReportDetailScreen from './screens/ReportDetailScreen';
import SafetyAlertsScreen from './screens/SafetyAlertsScreen';
import EmergencyContactsScreen from './screens/EmergencyContactsScreen';
import AssistanceScreen from './screens/Assistance';
import ProfileScreen from './screens/ProfileScreen';
import PolicyHubScreen from './screens/PolicyHubScreen';
import AppealsScreen from './screens/AppealsScreen';

const Stack = createStackNavigator();

function AppNavigator() {
  const { colors, isDark } = useTheme();

  // Keep the realtime connection alive across background/foreground transitions.
  // Screens still poll, so a socket that never connects only costs timeliness.
  useEffect(() => {
    const unbind = bindRealtimeLifecycle();
    // Realtime is best-effort; a failed handshake must not surface as an
    // unhandled rejection because connectRealtime() returns a Promise.
    connectRealtime().catch(() => {});
    return () => {
      unbind();
      disconnectRealtime();
    };
  }, []);

  const navTheme = {
    headerStyle: { backgroundColor: isDark ? colors.primaryDark : '#A80808', elevation: 4, shadowOpacity: 0.3 },
    headerTintColor: isDark ? colors.textOnGold : '#fff',
    headerTitleStyle: { fontWeight: 'bold', letterSpacing: 1, color: isDark ? colors.textOnGold : '#fff' },
    headerBackTitleVisible: false,
    cardStyle: { backgroundColor: colors.surface },
  };

  const sosTheme = {
    headerStyle: { backgroundColor: isDark ? colors.sosDark : '#680808', elevation: 4 },
    headerTintColor: '#fff',
    headerTitleStyle: { fontWeight: 'bold', color: '#fff' },
    headerBackTitleVisible: false,
    cardStyle: { backgroundColor: colors.surface },
  };

  return (
    <NavigationContainer theme={isDark ? DarkTheme : DefaultTheme}>
      <Stack.Navigator initialRouteName="Splash" screenOptions={navTheme}>
        <Stack.Screen name="Splash" component={SplashScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />

        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={({ navigation }) => ({
            headerShown: false,
            title: 'UniSafe',
            headerRight: () => (
              <TouchableOpacity onPress={() => navigation.navigate('Profile')} style={{ marginRight: 16 }}>
                <MaterialIcons name="account-circle" size={28} color={isDark ? colors.textOnGold : '#F8E808'} />
              </TouchableOpacity>
            ),
          })}
        />

        <Stack.Screen name="SOS"          component={SOSScreen}             options={{ headerShown: true, title: 'Emergency SOS', ...sosTheme }} />
        <Stack.Screen name="SOSStatus"    component={SOSStatusScreen}      options={{ headerShown: true, title: 'SOS Status', ...navTheme }} />
        <Stack.Screen name="ReportIncident" component={ReportIncidentScreen} options={{ headerShown: true, title: 'Report Incident', ...navTheme }} />
        <Stack.Screen name="Assistance"   component={AssistanceScreen}      options={{ headerShown: true, title: 'Request Assistance', ...navTheme }} />
        <Stack.Screen name="MyReports"    component={MyReportsScreen}       options={({ navigation }) => ({ headerShown: true, title: 'My Reports', ...navTheme, headerRight: () => (<TouchableOpacity onPress={() => navigation.setParams({ refreshKey: Date.now() })} style={{ marginRight: 16 }}><MaterialIcons name="refresh" size={24} color={isDark ? colors.textOnGold : '#fff'} /></TouchableOpacity>) })} />
        <Stack.Screen name="ReportDetail" component={ReportDetailScreen}    options={{ headerShown: true, title: 'Report Detail', ...navTheme }} />
        <Stack.Screen name="SafetyAlerts" component={SafetyAlertsScreen}    options={({ navigation }) => ({ headerShown: true, title: 'Safety Alerts', ...navTheme, headerRight: () => (<TouchableOpacity onPress={() => navigation.setParams({ refreshKey: Date.now() })} style={{ marginRight: 16 }}><MaterialIcons name="refresh" size={24} color={isDark ? colors.textOnGold : '#fff'} /></TouchableOpacity>) })} />
        <Stack.Screen name="EmergencyContacts" component={EmergencyContactsScreen} options={({ navigation }) => ({ headerShown: true, title: 'Emergency Contacts', ...navTheme, headerRight: () => (<TouchableOpacity onPress={() => navigation.setParams({ refreshKey: Date.now() })} style={{ marginRight: 16 }}><MaterialIcons name="refresh" size={24} color={isDark ? colors.textOnGold : '#fff'} /></TouchableOpacity>) })} />
        <Stack.Screen name="Profile"      component={ProfileScreen}         options={{ headerShown: true, title: 'My Profile', ...navTheme }} />
        <Stack.Screen name="PolicyHub"    component={PolicyHubScreen}       options={{ headerShown: true, title: 'Policies', ...navTheme }} />
        <Stack.Screen name="Appeals"      component={AppealsScreen}          options={{ headerShown: true, title: 'Appeals', ...navTheme }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AppNavigator />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
