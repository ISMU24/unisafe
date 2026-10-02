import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { APPEAL_CATEGORIES } from '../theme';

export default function AppealForm({ onSubmit }) {
  const { colors: th } = useTheme();
  const [category, setCategory] = useState(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!category) { Alert.alert('Required', 'Please select a category.'); return; }
    if (!description.trim()) { Alert.alert('Required', 'Please describe your appeal.'); return; }
    setSubmitting(true);
    const id = `APPEAL-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const appeal = {
      id,
      category,
      description: description.trim(),
      status: 'Submitted',
      submittedAt: new Date().toISOString(),
      timeline: [{ status: 'Submitted', time: new Date().toISOString(), note: 'Appeal received.' }],
    };
    await new Promise(r => setTimeout(r, 500));
    setSubmitting(false);
    onSubmit && onSubmit(appeal);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: th.surface }} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16 }}>
      <Text style={[s.label, { color: th.textMuted }]}>APPEAL CATEGORY</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {APPEAL_CATEGORIES.map(cat => {
          const selected = category === cat.id;
          return (
            <TouchableOpacity
              key={cat.id}
              style={[s.catChip, { borderColor: selected ? cat.color : th.border, backgroundColor: selected ? cat.color + '22' : th.surfaceCard }]}
              onPress={() => setCategory(cat.id)}
            >
              <Text style={{ fontSize: 16 }}>{cat.icon}</Text>
              <Text style={[s.catChipText, { color: selected ? cat.color : th.textSecondary }]}>{cat.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={[s.label, { color: th.textMuted }]}>DESCRIPTION</Text>
      <TextInput
        style={[s.textarea, { backgroundColor: th.surfaceCard, color: th.textPrimary, borderColor: th.border }]}
        placeholder="Describe your appeal in detail..."
        placeholderTextColor={th.textMuted}
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={8}
        textAlignVertical="top"
        autoCorrect
      />

      <Text style={[s.hint, { color: th.textMuted }]}>
        Your appeal will receive a unique ID (e.g. APPEAL-2024-001234) for tracking. Status updates: Submitted → Under Review → Decision Issued.
      </Text>

      <TouchableOpacity
        style={[s.submitBtn, { backgroundColor: category ? '#455A64' : th.surfaceAlt }]}
        onPress={submit}
        disabled={!category || submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <MaterialIcons name="send" size={20} color="#fff" />
            <Text style={s.submitText}>Submit Appeal</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  label:     { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
  catChip:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1 },
  catChipText: { fontSize: 14, fontWeight: '600' },
  textarea:  { borderRadius: 12, borderWidth: 1, padding: 14, fontSize: 15, minHeight: 160 },
  hint:      { fontSize: 12, lineHeight: 18, marginTop: 12, marginBottom: 20 },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, marginBottom: 32 },
  submitText:{ color: '#fff', fontSize: 16, fontWeight: '700' },
});
