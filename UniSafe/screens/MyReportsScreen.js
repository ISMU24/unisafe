import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { radius } from '../src/theme';
import { useTheme } from '../src/ThemeContext';
import { api } from '../src/utils/api';
import { normalizeIncident } from '../src/utils/records';
import CategoryBadge, { StatusBadge } from '../src/components/CategoryBadge';

const FILTERS = ['All', 'Submitted', 'Received', 'Under Review', 'Assigned', 'Responding', 'Resolved', 'Closed', 'Cancelled'];

const STATUS_ICONS = {
  Submitted: 'error-outline',
  Received: 'schedule',
  'Under Review': 'manage-search',
  Assigned: 'assignment-ind',
  Responding: 'directions-run',
  'In Progress': 'schedule',
  Resolved: 'check-circle',
  Closed: 'check-circle-outline',
  Cancelled: 'cancel',
  Open: 'error-outline',
};

function statusColor(status, colors) {
  if (['Submitted', 'Open', 'Cancelled'].includes(status)) return colors.statusOpen;
  if (['Under Review', 'Received', 'Assigned', 'Responding', 'In Progress'].includes(status)) return colors.statusInProgress;
  if (status === 'Resolved') return colors.statusResolved;
  return colors.statusClosed;
}

export default function MyReportsScreen({ navigation, route }) {
  const { colors } = useTheme();
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [expanded, setExpanded] = useState(null);
  const [error, setError] = useState('');
  const [detailLoading, setDetailLoading] = useState(null);

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getIncidents();
      // Backend returns { incidents: [], total: N } or an array
      const list = Array.isArray(data) ? data : (data.incidents || []);
      setIncidents(list.map(normalizeIncident));
      setExpanded(null);
    } catch (err) {
      setIncidents([]);
      setError(err.message);
    }
    setLoading(false);
  }, []);

  const toggleReport = async (item) => {
    if (expanded === item.id) { setExpanded(null); return; }
    setExpanded(item.id);
    setDetailLoading(item.id);
    setError('');
    try {
      const detail = normalizeIncident(await api.getIncident(item.id));
      setIncidents(current => current.map(report => report.id === detail.id ? detail : report));
    } catch (err) {
      setError(`Report history could not be loaded. ${err.message}`);
    } finally {
      setDetailLoading(current => current === item.id ? null : current);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchIncidents();
    }, [fetchIncidents])
  );

  const refreshKey = route?.params?.refreshKey;
  useEffect(() => { if (refreshKey) fetchIncidents(); }, [refreshKey]);

  if (loading) return <View style={[s.center, { backgroundColor: colors.surface }]}><ActivityIndicator size="large" color={colors.primary} /></View>;

  const filtered = filter === 'All' ? incidents : incidents.filter(i => i.status === filter);

  return (
    <View style={[s.root, { backgroundColor: colors.surface }]}>
      {!!error && <Text accessibilityRole="alert" style={{ color: colors.sos, padding: 16 }}>{error} Use refresh to try again.</Text>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[s.filterBar, { backgroundColor: colors.surfaceCard, borderBottomColor: colors.border }]} contentContainerStyle={s.filterContent}>
        {FILTERS.map(f => {
          const isActive = filter === f;
          const selectedColor = f === 'All' ? colors.primary : statusColor(f, colors);
          return (
            <TouchableOpacity
              key={f}
              style={[s.chip, { borderColor: colors.border, backgroundColor: colors.surfaceCard }, isActive && { backgroundColor: selectedColor, borderColor: selectedColor }]}
              onPress={() => setFilter(f)}
              activeOpacity={0.8}
            >
              <Text style={[s.chipText, { color: colors.textSecondary }, isActive && { color: '#fff' }]}>{f}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={i => i.id}
        contentContainerStyle={{ padding: 12, paddingBottom: 30 }}
        ListEmptyComponent={
          <View style={s.empty}>
            <MaterialIcons name="folder-open" size={40} color={colors.textMuted} style={{ marginBottom: 12 }} />
            <Text style={[s.emptyText, { color: colors.textMuted }]}>No reports in this category</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isExpanded = expanded === item.id;
          return (
            <View style={[s.card, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
              <TouchableOpacity style={[s.cardHeader, isExpanded && { borderBottomColor: colors.border }]} onPress={() => toggleReport(item)} activeOpacity={0.8}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.incidentId, { color: colors.textMuted }]}>{item.id}</Text>
                  <Text style={[s.incidentTitle, { color: colors.textPrimary }]}>{item.title}</Text>
                  <View style={s.badgeRow}>
                    <CategoryBadge category={item.category} />
                    <StatusBadge status={item.status} />
                    {item.anonymous && (
                      <View style={s.anonTag}>
                        <MaterialIcons name="visibility-off" size={14} color={colors.textMuted} />
                        <Text style={{ color: colors.textMuted, fontSize: 11 }}>Confidential</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[s.submittedAt, { color: colors.textMuted }]}>Submitted: {item.submittedAt}</Text>
                </View>
                <MaterialIcons name={isExpanded ? 'expand-less' : 'expand-more'} size={22} color={colors.textMuted} />
              </TouchableOpacity>
              {isExpanded && (
                <View style={s.timeline}>
                  <Text style={[s.timelineLabel, { color: colors.textSecondary }]}>STATUS TIMELINE</Text>
                  {detailLoading === item.id && <ActivityIndicator color={colors.primary} />}
                  {item.timeline.map((ev, i) => {
                    const cfg = { color: statusColor(ev.status, colors), icon: STATUS_ICONS[ev.status] || 'radio-button-unchecked' };
                    return (
                      <View key={i} style={s.tlRow}>
                        <View style={s.tlLeft}>
                          <View style={[s.tlDot, { backgroundColor: cfg.color, borderColor: cfg.color }]} />
                          {i < item.timeline.length - 1 && <View style={[s.tlLine, { backgroundColor: colors.border }]} />}
                        </View>
                        <View style={[s.tlBody, i === item.timeline.length - 1 && { paddingBottom: 0 }]}>
                          <View style={s.timelineStatus}>
                            <MaterialIcons name={cfg.icon} size={16} color={cfg.color} />
                            <Text style={[s.tlStatus, { color: cfg.color }]}>{ev.status}</Text>
                          </View>
                          <Text style={[s.tlNote, { color: colors.textSecondary }]}>{ev.note}</Text>
                          <Text style={[s.tlTime, { color: colors.textMuted }]}>{ev.time}</Text>
                        </View>
                      </View>
                    );
                  })}
                  <TouchableOpacity onPress={() => navigation.navigate('ReportDetail', { reportId: item.id })}>
                    <Text style={{ color: colors.primary, paddingVertical: 12 }}>View report details</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root:             { flex: 1 },
  center:           { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  filterBar:        { borderBottomWidth: 1, maxHeight: 56 },
  filterContent:    { paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  chip:             { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1.5 },
  chipText:         { fontSize: 13, fontWeight: '600' },
  empty:            { alignItems: 'center', paddingVertical: 48 },
  emptyText:        { fontSize: 15 },
  card:             { borderRadius: radius.lg, borderWidth: 1, marginBottom: 12, overflow: 'hidden' },
  cardHeader:       { padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  incidentId:       { fontSize: 12, fontFamily: 'Courier New', marginBottom: 4 },
  incidentTitle:    { fontSize: 14, fontWeight: '700', lineHeight: 20, marginBottom: 8 },
  badgeRow:         { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 },
  anonTag:          { flexDirection: 'row', alignItems: 'center', gap: 3 },
  submittedAt:      { fontSize: 11 },
  timeline:         { padding: 16 },
  timelineLabel:    { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 14 },
  tlRow:            { flexDirection: 'row', gap: 12 },
  tlLeft:           { alignItems: 'center', width: 12 },
  tlDot:            { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  tlLine:           { width: 2, flex: 1, marginTop: 4 },
  tlBody:           { flex: 1, paddingBottom: 16 },
  tlStatus:         { fontSize: 13, fontWeight: '700' },
  timelineStatus:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tlNote:           { fontSize: 12, marginTop: 2 },
  tlTime:           { fontSize: 11, marginTop: 3, fontFamily: 'Courier New' },
});
