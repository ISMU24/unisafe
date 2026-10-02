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
        <TouchableOpacity style={[s.sosBtn, { backgroundColor: colors.sos, borderColor: colors.accent }]} onPress={sendSOS}>
          <Text style={[s.sosBtnText, { color: colors.accent }]}>YES — SEND SOS</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.cancelBtn, { backgroundColor: colors.surfaceAlt }]} onPress={() => navigation.goBack()}>
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
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: colors.surface }]}>
      <MaterialIcons name="cloud-off" size={64} color={colors.textMuted} style={{ marginBottom: 20 }} />
      <Text style={[s.title, { color: colors.textPrimary }]}>SOS Delivery Not Confirmed</Text>
      <Text style={[s.desc, { color: colors.textMuted }]}>{error} Do not assume help has been notified. Contact Campus Security directly using Emergency Contacts.</Text>
      <TouchableOpacity style={[s.cancelBtn, { backgroundColor: colors.surfaceAlt, marginBottom: 12 }]} onPress={() => navigation.navigate('EmergencyContacts')}>
        <Text style={[s.cancelText, { color: colors.textSecondary }]}>Emergency Contacts</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[s.sosBtn, { backgroundColor: colors.sos, borderColor: colors.accent }]} onPress={() => setStep('confirm')}>
        <Text style={[s.sosBtnText, { color: colors.accent }]}>Retry</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[s.cancelBtn, { backgroundColor: colors.surfaceAlt }]} onPress={() => navigation.goBack()}>
        <Text style={[s.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  title: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 12 },
  desc: { textAlign: 'center', lineHeight: 22, marginBottom: 32, fontSize: 14 },
  sosBtn: { borderRadius: 12, paddingVertical: 16, width: '100%', alignItems: 'center', marginBottom: 12, borderWidth: 2 },
  sosBtnText: { fontWeight: 'bold', fontSize: 16, letterSpacing: 1 },
  cancelBtn: { borderRadius: 12, paddingVertical: 14, width: '100%', alignItems: 'center' },
  cancelText: { fontWeight: '600', fontSize: 15 },
});
