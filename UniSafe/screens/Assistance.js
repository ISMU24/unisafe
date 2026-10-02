import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Linking, Alert } from 'react-native';
import { radius } from '../src/theme';
import { useTheme } from '../src/ThemeContext';
import { api } from '../src/utils/api';

const TYPES = [
  { id: 'escort',  icon: '🚶', label: 'Safety Escort',      desc: 'Walk with a security officer to your destination' },
  { id: 'lockout', icon: '🔑', label: 'Locked Out',         desc: 'Locked out of room or building' },
  { id: 'welfare', icon: '💬', label: 'Welfare Check',      desc: 'Request a welfare check for yourself or someone else' },
  { id: 'general', icon: '🤝', label: 'General Assistance', desc: 'Other non-emergency security help' },
];

export default function AssistanceScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const [type, setType] = useState('');
  const [notes, setNotes] = useState('');
  const [location, setLocation] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (loading) return;
    if (!type) { Alert.alert('Required', 'Please select the type of assistance you need.'); return; }
    setLoading(true);
    try {
      const selected = TYPES.find(item => item.id === type);
      const saved = await api.sendAssistance({
        type: type === 'general' ? 'General' : 'Security',
        title: selected.label,
        description: notes.trim(),
        location_text: location.trim(),
      });
      if (!saved?.id) throw new Error('The server did not confirm your request.');
      setSubmitted(true);
    } catch (e) {
      Alert.alert('Request not confirmed', `${e.message} Check your requests before trying again.`);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <View style={[s.successScreen, { backgroundColor: colors.surface }]}>
        <Text style={{ fontSize: 60, marginBottom: 16 }}>✅</Text>
        <Text style={[s.successTitle, { color: colors.textPrimary }]}>Request Sent</Text>
        <Text style={[s.successSub, { color: colors.textSecondary }]}>Your request has been received. A response time has not been confirmed.</Text>
        <View style={[s.callBox, { backgroundColor: colors.surfaceGold, borderColor: colors.accent }]}>
          <Text style={[s.callBoxLabel, { color: colors.primary }]}>📞 Security Office</Text>
          <TouchableOpacity onPress={() => Linking.openURL('tel:+6754734999')}>
            <Text style={[s.callBoxNumber, { color: colors.primary }]}>+675 473 4999</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={[s.backBtn, { backgroundColor: colors.primary, borderColor: colors.accent }]} onPress={() => navigation.navigate('Home')}>
          <Text style={[s.backBtnText, { color: colors.textOnGold }]}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.surface }} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
      <View style={[s.infoBanner, { backgroundColor: isDark ? '#1E2A38' : '#eff6ff', borderColor: isDark ? '#2A4060' : '#bfdbfe' }]}>
        <Text style={[s.infoText, { color: colors.security }]}>ℹ️ For life-threatening emergencies, use the SOS button instead.</Text>
      </View>

      <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>TYPE OF ASSISTANCE</Text>
      {TYPES.map(t => (
        <TouchableOpacity
          key={t.id}
          style={[s.typeCard, { borderColor: colors.border, backgroundColor: colors.surfaceCard }, type === t.id && { borderColor: colors.security, backgroundColor: colors.security + (isDark ? '30' : '15') }]}
          onPress={() => setType(t.id)}
          activeOpacity={0.8}
        >
          <Text style={s.typeIcon}>{t.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.typeLabel, { color: colors.textPrimary }, type === t.id && { color: colors.security }]}>{t.label}</Text>
            <Text style={[s.typeDesc, { color: colors.textSecondary }]}>{t.desc}</Text>
          </View>
          {type === t.id && <Text style={{ color: colors.security, fontSize: 18 }}>✓</Text>}
        </TouchableOpacity>
      ))}

      <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>YOUR CURRENT LOCATION</Text>
      <TextInput style={[s.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceCard }]} placeholder="e.g. Engineering Block, Room 204" value={location} onChangeText={setLocation} placeholderTextColor={colors.textMuted} />

      <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>ADDITIONAL NOTES <Text style={[s.optional, { color: colors.textMuted }]}>(optional)</Text></Text>
      <TextInput style={[s.input, s.textarea, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceCard }]} placeholder="Any extra details that will help security assist you…" value={notes} onChangeText={setNotes} multiline numberOfLines={3} textAlignVertical="top" placeholderTextColor={colors.textMuted} />

      <TouchableOpacity style={[s.submitBtn, { backgroundColor: colors.primary, borderColor: colors.accent }, (!type || loading) && { backgroundColor: colors.border, borderWidth: 0 }]} onPress={handleSubmit} disabled={!type || loading} activeOpacity={0.85}>
        <Text style={[s.submitBtnText, { color: colors.textOnGold }, (!type || loading) && { color: colors.textMuted }]}>{loading ? 'Sending request…' : '🤝 Send Assistance Request'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll:            { padding: 16, paddingBottom: 40 },
  infoBanner:        { borderWidth: 1, borderRadius: radius.md, padding: 12, marginBottom: 16 },
  infoText:          { fontSize: 13 },
  sectionLabel:      { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8, marginTop: 4 },
  optional:          { fontWeight: '400' },
  typeCard:          { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: radius.md, borderWidth: 2, marginBottom: 8, gap: 14 },
  typeIcon:          { fontSize: 26 },
  typeLabel:         { fontSize: 14, fontWeight: '700' },
  typeDesc:          { fontSize: 12, marginTop: 2 },
  input:             { borderWidth: 1.5, borderRadius: radius.md, padding: 13, fontSize: 15, marginBottom: 14 },
  textarea:          { height: 90, textAlignVertical: 'top' },
  submitBtn:         { borderRadius: radius.md, padding: 15, alignItems: 'center', marginTop: 16, borderWidth: 2 },
  submitBtnText:     { fontSize: 16, fontWeight: '700' },
  successScreen:     { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  successTitle:      { fontSize: 22, fontWeight: '800', marginBottom: 8 },
  successSub:        { fontSize: 14, textAlign: 'center', marginBottom: 20 },
  callBox:           { borderWidth: 1, borderRadius: radius.md, padding: 16, alignItems: 'center', marginBottom: 24 },
  callBoxLabel:      { fontSize: 13, fontWeight: '600', marginBottom: 4 },
  callBoxNumber:     { fontSize: 18, fontWeight: '700' },
  backBtn:           { borderRadius: radius.md, paddingHorizontal: 32, paddingVertical: 14, borderWidth: 2 },
  backBtnText:       { fontSize: 15, fontWeight: '700' },
});
