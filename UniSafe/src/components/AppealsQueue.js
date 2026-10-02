import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { STATUS_META, APPEAL_STATUS_META } from '../theme';
import { api } from '../utils/api';

const NEXT_STATUS = {
  'Submitted': 'Under Review',
  'Under Review': 'Decision Issued',
};

export default function AppealsQueue({ appeals: initialAppeals, onViewAppeal }) {
  const { colors } = useTheme();
  const [filterCat, setFilterCat] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [appeals, setAppeals] = useState(initialAppeals);

  const catFilters = ['All', 'Academic', 'Disciplinary', 'Fees', 'Other'];
  const statusFilters = ['All', 'Submitted', 'Under Review', 'Decision Issued'];

  const filtered = appeals.filter(a => {
    if (filterCat !== 'All' && a.category !== filterCat) return false;
    if (filterStatus !== 'All' && a.status !== filterStatus) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[s.header, { backgroundColor: colors.surfaceCard, borderBottomColor: colors.border }]}>
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Appeals Queue</Text>
        <Text style={[s.count, { color: colors.textMuted }]}>{filtered.length} total</Text>
      </View>

      <View style={[s.filterSection, { borderBottomColor: colors.border }]}>
        <Text style={[s.filterLabel, { color: colors.textMuted }]}>Category</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {catFilters.map(f => (
            <TouchableOpacity key={f} style={[s.chip, { borderColor: colors.border, backgroundColor: filterCat === f ? '#455A64' : colors.surfaceAlt }]} onPress={() => setFilterCat(f)}>
              <Text style={[s.chipText, { color: filterCat === f ? '#fff' : colors.textSecondary }]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={[s.filterSection, { borderBottomColor: colors.border }]}>
        <Text style={[s.filterLabel, { color: colors.textMuted }]}>Status</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {statusFilters.map(f => {
            const active = filterStatus === f;
            const statusColor = STATUS_META[f]?.color || colors.primary;
            return (
              <TouchableOpacity key={f} style={[s.chip, { borderColor: colors.border, backgroundColor: active ? statusColor : colors.surfaceAlt }]} onPress={() => setFilterStatus(f)}>
                <Text style={[s.chipText, { color: active ? '#fff' : colors.textSecondary }]}>{f}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <FlatList
        data={sorted}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        renderItem={({ item }) => {
          const statusMeta = STATUS_META[item.status] || STATUS_META.Open;
          const appealMeta = APPEAL_STATUS_META[item.status] || { icon: '📋', label: item.status };
          return (
            <TouchableOpacity style={[s.card, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]} onPress={() => onViewAppeal && onViewAppeal(item)}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text style={[s.appealId, { color: colors.textMuted }]}>{item.id}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: statusMeta.color + '18', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: statusMeta.color + '44' }}>
                  <Text style={{ marginRight: 4, fontSize: 12 }}>{appealMeta.icon}</Text>
                  <Text style={[s.statusText, { color: statusMeta.color, fontSize: 11 }]}>{item.status}</Text>
                </View>
              </View>
              <Text style={[s.title, { color: colors.textPrimary }]} numberOfLines={2}>{item.description}</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, alignItems: 'center' }}>
                <View style={[s.catBadge, { backgroundColor: '#455A6422', borderColor: '#455A6444' }]}>
                  <Text style={[s.catText, { color: '#455A64' }]}>{item.category}</Text>
                </View>
                <Text style={[s.meta, { color: colors.textMuted }]}>
                  {item.submittedAt ? new Date(item.submittedAt).toLocaleDateString() : 'N/A'}
                </Text>
              </View>
              {NEXT_STATUS[item.status] && (
                <TouchableOpacity
                  style={[s.advanceBtn, { backgroundColor: statusMeta.color + '18', borderColor: statusMeta.color + '44' }]}
                  onPress={async () => {
                    const next = NEXT_STATUS[item.status];
                    try {
                      const updated = await api.updateAppealStatus(item.id, next, 'Updated by staff.');
                      setAppeals(prev => prev.map(a => a.id === updated.id ? updated : a));
                    } catch {
                      setAppeals(prev => prev.map(a => a.id === item.id ? { ...a, status: next, timeline: [...(a.timeline || []), { status: next, time: new Date().toISOString(), note: 'Updated by staff.' }] } : a));
                    }
                  }}
                >
                  <Text style={[s.advanceBtnText, { color: statusMeta.color }]}>Advance → {NEXT_STATUS[item.status]}</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={{ paddingVertical: 48, alignItems: 'center' }}>
            <Text style={{ fontSize: 40 }}>✅</Text>
            <Text style={[s.empty, { color: colors.textMuted }]}>No appeals match your filters.</Text>
          </View>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  count:       { fontSize: 13 },
  filterSection: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  filterLabel: { fontSize: 11, fontWeight: '700', color: '#9E9E9E', marginBottom: 6, letterSpacing: 0.5 },
  chip:        { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1 },
  chipText:    { fontSize: 12, fontWeight: '600' },
  card:        { borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4 },
  appealId:    { fontSize: 12, fontFamily: 'Courier New' },
  title:       { fontSize: 15, fontWeight: '600', marginTop: 8, lineHeight: 21 },
  catBadge:    { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  catText:     { fontSize: 12, fontWeight: '600' },
  meta:        { fontSize: 12 },
  statusText:  { fontWeight: '600', fontSize: 12 },
  advanceBtn:  { marginTop: 10, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  advanceBtnText: { fontSize: 12, fontWeight: '700' },
  empty:       { marginTop: 12, fontSize: 14 },
});
