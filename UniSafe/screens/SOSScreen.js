import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../src/ThemeContext';
import { api } from '../src/utils/api';

export default function SOSScreen({ navigation }) {
  const { colors } = useTheme();
  const [step, setStep] = useState('confirm');
  const [locationStatus, setLocationStatus] = useState('Acquiring location...');
  const [error, setError] = useState('');

  const sendSOS = async () => {
    if (step === 'sending') return;
    setStep('sending');
    setError('');
    let location = null;
    try {
      if (Platform.OS !== 'web') {
        const Location = await import('expo-location');
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          let locationTimeout;
          const loc = await Promise.race([
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
            new Promise((_, reject) => { locationTimeout = setTimeout(() => reject(new Error('Location timed out')), 8000); }),
          ]).finally(() => clearTimeout(locationTimeout));
          location = { lat: loc.coords.latitude, lng: loc.coords.longitude };
          setLocationStatus(`Location captured: ${loc.coords.latitude.toFixed(5)}, ${loc.coords.longitude.toFixed(5)}`);
        } else {
          setLocationStatus('Location unavailable. Sending without GPS.');
        }
      } else {
        setLocationStatus('Sending without GPS. Location is unavailable on web.');
      }
    } catch {
      setLocationStatus('Location unavailable. Sending without GPS.');
    }
    try {
      const result = await api.sendSOS({
        location,
        locationText: location ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}` : 'Unknown',
      });

      if (!result?.id) throw new Error('The server did not confirm your SOS.');
      navigation.replace('SOSStatus', { sosId: result.id, sos: result });
    } catch (e) {
      setError(e.message);
      setStep('failed');
    }
  };

  if (step === 'confirm') {
    return (
      <View style={[s.container, { backgroundColor: colors.surface }]}>
        <MaterialIcons name="warning" size={64} color={colors.sos} style={{ marginBottom: 20 }} />
        <Text style={[s.title, { color: colors.textPrimary }]}>Request Emergency Assistance?</Text>
        <Text style={[s.desc, { color: colors.textMuted }]}>
          This sends an emergency request to Campus Security. Responder acknowledgement will be shown after receipt.
        </Text>
        <TouchableOpacity style={[s.sosBtn, { backgroundColor: colors.sos, borderColor: colors.sos }]} onPress={sendSOS} accessibilityRole="button">
          <Text style={s.sosBtnText}>YES — SEND SOS</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.cancelBtn, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]} onPress={() => navigation.goBack()} accessibilityRole="button">
          <Text style={[s.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (step === 'sending') {
    return (
      <View style={[s.container, { backgroundColor: colors.surface }]}>
        <ActivityIndicator size="large" color={colors.sos} style={{ marginBottom: 20 }} />
        <Text style={[s.title, { color: colors.textPrimary }]}>Sending SOS...</Text>
        <Text style={[s.desc, { color: colors.textMuted }]}>{locationStatus}</Text>
        <Text style={[s.desc, { color: colors.textMuted }]}>The server may take 30-60 seconds to wake up. Keep this screen open while waiting for confirmation.</Text>
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: colors.surface }]}>
      <MaterialIcons name="cloud-off" size={64} color={colors.textMuted} style={{ marginBottom: 20 }} />
      <Text style={[s.title, { color: colors.textPrimary }]}>SOS Delivery Not Confirmed</Text>
      <Text style={[s.desc, { color: colors.textMuted }]}>{error} Do not assume help has been notified. Contact Campus Security directly using Emergency Contacts.</Text>
      <TouchableOpacity style={[s.cancelBtn, { backgroundColor: colors.surfaceCard, borderColor: colors.border, marginBottom: 12 }]} onPress={() => navigation.navigate('EmergencyContacts')}>
        <Text style={[s.cancelText, { color: colors.textSecondary }]}>Emergency Contacts</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[s.sosBtn, { backgroundColor: colors.sos, borderColor: colors.sos }]} onPress={() => setStep('confirm')}>
        <Text style={s.sosBtnText}>Retry</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[s.cancelBtn, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]} onPress={() => navigation.goBack()}>
        <Text style={[s.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  desc: { textAlign: 'center', lineHeight: 22, marginBottom: 32, fontSize: 14 },
  sosBtn: { borderRadius: 12, minHeight: 52, paddingVertical: 14, width: '100%', alignItems: 'center', justifyContent: 'center', marginBottom: 12, borderWidth: 1 },
  sosBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15, letterSpacing: 0.2 },
  cancelBtn: { borderRadius: 12, minHeight: 48, paddingVertical: 13, width: '100%', alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  cancelText: { fontWeight: '600', fontSize: 15 },
});
