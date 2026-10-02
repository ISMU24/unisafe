import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { STATUS_META } from '../theme';
import { APPEAL_STATUS_META } from '../theme';

export default function AppealTracker({ appeals, onBack }) {
  const { colors } = useTheme();
  const [filter, setFilter] = useState('All');

  const filters = ['All', 'Submitted', 'Under Review', 'Decision Issued'];
  const filtered = filter === 'All' ? appeals : appeals.filter(a => a.status === filter);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[s.header, { backgroundColor: colors.surfaceCard, borderBottomColor: colors.border }]}>
        {onBack && <TouchableOpacity onPress={onBack}><MaterialIcons name="arrow-back" size={24} color={colors.textPrimary} /></TouchableOpacity>}
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>My Appeals</Text>
      </View>

      <View style={[s.filterBar, { borderBottomColor: colors.border }]}>
        {filters.map(f => {
          const active = filter === f;
          const meta = APPEAL_STATUS_META[f];
          const statusColor = meta ? (STATUS_META[meta.label]?.color || colors.primary) : colors.primary;
          return (
            <TouchableOpacity
              key={f}
              style={[s.chip, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }, active && { backgroundColor: statusColor, borderColor: statusColor }]}
              onPress={() => setFilter(f)}
            >
              <Text style={[s.chipText, { color: active ? '#fff' : colors.textSecondary }]}>{f}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        renderItem={({ item }) => {
          const meta = STATUS_META[item.status] || STATUS_META.Open;
          const appealMeta = APPEAL_STATUS_META[item.status] || { icon: '📋', label: item.status };
          return (
            <View style={[s.card, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text style={[s.appealId, { color: colors.textMuted }]}>{item.id}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: meta.color + '18', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: meta.color + '44' }}>
                  <Text style={{ marginRight: 4, fontSize: 12 }}>{appealMeta.icon}</Text>
                  <Text style={[s.statusText, { color: meta.color, fontSize: 11 }]}>{item.status}</Text>
                </View>
              </View>
              <Text style={[s.title, { color: colors.textPrimary }]} numberOfLines={2}>{item.description}</Text>
              <Text style={[s.meta, { color: colors.textMuted }]}>Submitted {item.submittedAt ? new Date(item.submittedAt).toLocaleDateString() : 'N/A'}</Text>
              {item.timeline && (
                <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }}>
                  {item.timeline.slice(-3).reverse().map((t, i) => (
                    <View key={i} style={{ flexDirection: 'row', marginBottom: 4 }}>
                      <Text style={{ color: colors.textMuted, fontSize: 11, width: 100 }}>{new Date(t.time).toLocaleDateString()}</Text>
                      <Text style={[s.statusText, { color: STATUS_META[t.status]?.color || colors.textSecondary, fontSize: 12 }]}>{t.note}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={{ paddingVertical: 48, alignItems: 'center' }}>
            <Text style={{ fontSize: 40 }}>📋</Text>
            <Text style={[s.empty, { color: colors.textMuted }]}>No appeals {filter !== 'All' ? `in "${filter}"` : ''}</Text>
          </View>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  header:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, gap: 12 },
  headerTitle:{ fontSize: 18, fontWeight: '700', flex: 1 },
  filterBar:  { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8, borderBottomWidth: 1 },
  chip:       { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  chipText:   { fontSize: 12, fontWeight: '600' },
  card:       { borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4 },
  appealId:   { fontSize: 12, fontFamily: 'Courier New' },
  title:      { fontSize: 15, fontWeight: '600', marginTop: 8, lineHeight: 21 },
  meta:       { fontSize: 12, marginTop: 6 },
  statusText: { fontWeight: '600', fontSize: 12 },
  empty:      { marginTop: 12, fontSize: 14 },
});
