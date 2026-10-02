import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../src/ThemeContext';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../src/utils/api';
import { subscribeRealtime } from '../src/utils/realtime';

export default function SOSStatusScreen({ navigation, route }) {
  const { colors } = useTheme();
  const { sosId } = route.params || {};
  const [sos, setSos] = useState(route.params?.sos || null);
  const [error, setError] = useState('');

  // Realtime gives an instant update when a responder acts. The polling loop
  // below stays as a safety net: it is the only thing keeping this screen
  // correct if the WebSocket cannot be established.
  useEffect(() => subscribeRealtime('sos-update', (payload) => {
    const updated = payload?.sos;
    if (updated && (!sosId || updated.id === sosId)) {
      setSos(updated);
      setError('');
    }
  }), [sosId]);

  useFocusEffect(useCallback(() => {
    let active = true;
    let timer;
    const refresh = async () => {
      try {
        if (!sosId) throw new Error('No SOS reference is available.');
        const latest = await api.getSOSEvent(sosId);
        if (active) { setSos(latest); setError(''); }
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) timer = setTimeout(refresh, 5000);
      }
    };
    refresh();
    return () => { active = false; clearTimeout(timer); };
  }, [sosId]));

  const messages = {
    Active: 'Your SOS was received by the server. A responder has not yet acknowledged it.',
    Acknowledged: 'A responder has acknowledged your SOS.',
    Responding: 'A responder has marked your SOS as Responding.',
    Resolved: 'Your SOS has been marked resolved.',
    Closed: 'Your SOS has been closed.',
  };

  return (
    <View style={[s.container, { backgroundColor: colors.surface }]}>
      <View style={s.iconCircle}>
        <MaterialIcons name="check-circle" size={64} color={colors.ambulance} />
      </View>
      <Text style={[s.title, { color: colors.ambulance }]}>{sos ? `SOS: ${sos.status}` : 'Checking SOS Status'}</Text>
      <Text style={[s.id, { color: colors.primary, backgroundColor: colors.surfaceGold }]}>Reference: {sosId}</Text>
      <Text style={[s.desc, { color: colors.textMuted }]}>
        {messages[sos?.status] || 'Responder status is not available.'}
      </Text>
      {!!error && <Text accessibilityRole="alert" style={[s.desc, { color: colors.sos }]}>Status could not be refreshed. {error}</Text>}
      <TouchableOpacity style={[s.homeBtn, { backgroundColor: colors.surfaceAlt, marginBottom: 12 }]} onPress={() => navigation.navigate('EmergencyContacts')}>
        <Text style={{ color: colors.textPrimary }}>Emergency Contacts</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[s.homeBtn, { backgroundColor: colors.primary, borderColor: colors.accent }]} onPress={() => navigation.navigate('Home')}>
        <Text style={[s.homeBtnText, { color: colors.textOnGold }]}>Return to Home</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  iconCircle: { marginBottom: 20 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 8 },
  id: { fontWeight: '600', fontSize: 14, marginBottom: 16, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  desc: { textAlign: 'center', lineHeight: 22, marginBottom: 36, fontSize: 14 },
  homeBtn: { borderRadius: 12, paddingVertical: 15, width: '100%', alignItems: 'center', borderWidth: 2 },
  homeBtnText: { fontWeight: 'bold', fontSize: 16, letterSpacing: 1 },
});
