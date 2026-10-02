import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { radius } from '../src/theme';
import { useTheme } from '../src/ThemeContext';
import CategoryBadge, { StatusBadge } from '../src/components/CategoryBadge';
import { api } from '../src/utils/api';
import { normalizeIncident } from '../src/utils/records';
import { subscribeRealtime } from '../src/utils/realtime';

// Must cover the backend's incident statuses; anything missing falls back to a
// neutral dot, which makes a real status change look like no change at all.
const STATUS_COLORS = {
  Submitted: '#D32F2F', Received: '#E65100', 'Under Review': '#E65100',
  Assigned: '#E65100', Responding: '#E65100', 'In Progress': '#E65100',
  Resolved: '#2E7D32', Cancelled: '#9E9E9E', Closed: '#9E9E9E', Open: '#D32F2F',
};
const STATUS_ICONS = {
  Submitted: '🔴', Received: '🟠', 'Under Review': '🟡', Assigned: '🟡',
  Responding: '🟡', 'In Progress': '🟡', Resolved: '🟢', Cancelled: '⚪',
  Closed: '⚪', Open: '🔴',
};

export default function ReportDetailScreen({ route }) {
  const { colors } = useTheme();
  const reportId = route.params?.reportId || route.params?.report?.id;
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // When a responder changes the status or assigns the report, the server pushes
  // it here so the student's screen updates without a manual refresh.
  useEffect(() => subscribeRealtime('incident-update', (payload) => {
    const updated = payload?.incident;
    if (updated && (!reportId || updated.id === reportId)) {
      setReport(normalizeIncident({ ...(report || {}), ...updated }));
    }
  }), [reportId, report]);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError('');
    (async () => {
      try {
        if (!reportId) throw new Error('No report reference is available.');
        const latest = normalizeIncident(await api.getIncident(reportId));
        if (active) setReport(latest);
      } catch (err) {
        if (active) { setReport(null); setError(err.message); }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [reportId, refreshKey]));

  if (loading) return <View style={[s.center, { backgroundColor: colors.surface }]}><ActivityIndicator color={colors.primary} /></View>;

  if (!report) {
    return (
      <View style={[s.center, { backgroundColor: colors.surface }]}>
        <Text accessibilityRole="alert" style={{ color: colors.textMuted }}>{error || 'Report not found'}</Text>
        <TouchableOpacity onPress={() => setRefreshKey(value => value + 1)}><Text style={{ color: colors.primary, padding: 16 }}>Retry</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.surface }} contentContainerStyle={{ padding: 16 }}>
      <TouchableOpacity onPress={() => setRefreshKey(value => value + 1)}><Text style={{ color: colors.primary, paddingVertical: 12 }}>Refresh status</Text></TouchableOpacity>
      <View style={s.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[s.incidentId, { color: colors.textMuted }]}>{report.id}</Text>
          <Text style={[s.title, { color: colors.textPrimary }]}>{report.title}</Text>
        </View>
        <StatusBadge status={report.status} size="lg" />
      </View>

      <View style={[s.card, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
        <View style={[s.row, { borderBottomColor: colors.border }]}>
          <Text style={[s.label, { color: colors.textMuted }]}>CATEGORY</Text>
          <CategoryBadge category={report.category} />
        </View>
        <View style={[s.row, { borderBottomColor: colors.border }]}>
          <Text style={[s.label, { color: colors.textMuted }]}>SUBMITTED</Text>
          <Text style={[s.value, { color: colors.textPrimary }]}>{report.submittedAt}</Text>
        </View>
        {report.location && (
          <View style={[s.row, { borderBottomColor: colors.border }]}>
            <Text style={[s.label, { color: colors.textMuted }]}>LOCATION</Text>
            <Text style={[s.value, { color: colors.textPrimary }]}>{typeof report.location === 'string' ? report.location : `${report.location.lat?.toFixed(4)}, ${report.location.lng?.toFixed(4)}`}</Text>
          </View>
        )}
        {report.description && (
          <View style={[s.row, { borderBottomColor: colors.border }]}>
            <Text style={[s.label, { color: colors.textMuted }]}>DESCRIPTION</Text>
            <Text style={[s.value, { color: colors.textPrimary }]}>{report.description}</Text>
          </View>
        )}
        <View style={[s.row, { borderBottomWidth: 0 }]}>
          <Text style={[s.label, { color: colors.textMuted }]}>IDENTITY</Text>
          <Text style={[s.value, { color: colors.textPrimary }]}>{report.anonymous ? '🕵️ Anonymous' : '👤 Identified'}</Text>
        </View>
      </View>

      {report.timeline && report.timeline.length > 0 && (
        <View style={[s.timelineCard, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
          <Text style={[s.timelineLabel, { color: colors.textSecondary }]}>STATUS TIMELINE</Text>
          {report.timeline.map((ev, i) => {
            const c = STATUS_COLORS[ev.status] || colors.textMuted;
            const ic = STATUS_ICONS[ev.status] || '•';
            return (
              <View key={i} style={s.tlRow}>
                <View style={s.tlLeft}>
                  <View style={[s.tlDot, { backgroundColor: c, borderColor: c }]} />
                  {i < report.timeline.length - 1 && <View style={[s.tlLine, { backgroundColor: colors.border }]} />}
                </View>
                <View style={[s.tlBody, i === report.timeline.length - 1 && { paddingBottom: 0 }]}>
                  <Text style={[s.tlStatus, { color: c }]}>{ic} {ev.status}</Text>
                  <Text style={[s.tlNote, { color: colors.textSecondary }]}>{ev.note}</Text>
                  <Text style={[s.tlTime, { color: colors.textMuted }]}>{ev.time}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16, gap: 12 },
  incidentId: { fontSize: 12, fontFamily: 'Courier New', marginBottom: 4 },
  title: { fontSize: 18, fontWeight: '800' },
  card: { borderRadius: radius.lg, padding: 16, marginBottom: 12, borderWidth: 1 },
  row: { paddingVertical: 10, borderBottomWidth: 1 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 },
  value: { fontSize: 14 },
  timelineCard: { borderRadius: radius.lg, padding: 16, borderWidth: 1 },
  timelineLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 14 },
  tlRow: { flexDirection: 'row', gap: 12 },
  tlLeft: { alignItems: 'center', width: 12 },
  tlDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  tlLine: { width: 2, flex: 1, marginTop: 4 },
  tlBody: { flex: 1, paddingBottom: 16 },
  tlStatus: { fontSize: 13, fontWeight: '700' },
  tlNote: { fontSize: 12, marginTop: 2 },
  tlTime: { fontSize: 11, marginTop: 3, fontFamily: 'Courier New' },
});
