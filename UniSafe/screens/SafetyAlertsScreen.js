import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { radius } from '../src/theme';
import { useTheme } from '../src/ThemeContext';
import { api } from '../src/utils/api';
import { subscribeRealtime } from '../src/utils/realtime';

// The backend has one alert entity with a severity. It is mapped onto this
// screen's kind/priority vocabulary so the existing filters keep working.
const SEVERITY_TO_PRIORITY = { Critical: 'Critical', Warning: 'Medium', Info: 'Low' };

function toItem(alert) {
  return {
    id: alert.id,
    kind: 'alert',
    title: alert.title,
    message: alert.message,
    category: 'General',
    priority: SEVERITY_TO_PRIORITY[alert.severity] || 'Low',
    createdAt: alert.sent_at || alert.created_at,
    read: Boolean(alert.is_read),
    severity: alert.severity,
  };
}

const FILTERS = ['All', 'Alerts', 'Fire', 'Security', 'Ambulance', 'Other'];

export default function SafetyAlertsScreen({ route }) {
  const { colors, isDark } = useTheme();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('All');

  const KIND_META = {
    alert:        { label: 'Alert',        icon: 'campaign',         color: colors.sos },
    notification: { label: 'Notification', icon: 'notifications',    color: colors.primary },
    announcement: { label: 'Announcement', icon: 'announcement',     color: colors.other },
  };

  const PRIORITY_COLORS = {
    Critical: colors.sos, High: colors.statusOpen, Medium: colors.other, Low: colors.statusResolved,
  };

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // /api/alerts is admin-only; a phone must use /api/alerts/my, which the
      // server already filters to this user's role and broadcast alerts.
      const backendAlerts = await api.getMyAlerts();
      const alerts = (backendAlerts || []).map(toItem);
      setItems(alerts);
    } catch (err) {
      // Deliberately no mock fallback here: a fabricated campus alert is worse
      // than an honest empty screen.
      setItems([]);
      setError(err.message || 'Alerts could not be loaded.');
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => { fetchItems(); }, [fetchItems])
  );

  const refreshKey = route?.params?.refreshKey;
  useEffect(() => { if (refreshKey) fetchItems(); }, [refreshKey]);

  // The server pushes an alert to every targeted user's phone, so a broadcast
  // reaches the screen without the student pulling to refresh.
  useEffect(() => subscribeRealtime('alert-update', (payload) => {
    const alert = payload?.alert;
    if (!alert) return;
    setItems(current => {
      const incoming = toItem(alert);
      const existing = current.findIndex(item => item.id === incoming.id);
      if (existing === -1) return [incoming, ...current];
      const next = current.slice();
      next[existing] = { ...next[existing], ...incoming };
      return next;
    });
  }), []);

  if (loading) return <View style={[s.center, { backgroundColor: colors.surface }]}><ActivityIndicator size="large" color={colors.primary} /></View>;

  const filtered = items.filter(it => {
    if (filter === 'All') return true;
    if (filter === 'Alerts') return it.kind === 'alert';
    return it.category === filter;
  });

  const renderItem = ({ item }) => {
    const kindMeta = KIND_META[item.kind] || KIND_META.alert;
    const isCritical = item.priority === 'Critical';
    const pColor = PRIORITY_COLORS[item.priority] || colors.textMuted;
    const isUnread = item.kind === 'alert' && !item.read;

    return (
      <View style={[s.card, { backgroundColor: colors.surfaceCard, borderColor: colors.border }, isCritical && { borderColor: colors.sos, borderWidth: 1.5 }, isUnread && { backgroundColor: colors.surfaceGold, borderColor: colors.accent }]}>
        <View style={[s.iconCircle, { backgroundColor: kindMeta.color + '20' }]}>
          <MaterialIcons name={kindMeta.icon} size={22} color={kindMeta.color} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={s.titleRow}>
            <Text style={[s.alertTitle, { color: colors.textPrimary }]} numberOfLines={2}>{item.title}</Text>
            <View style={[s.badge, { backgroundColor: pColor }]}>
              <Text style={s.badgeText}>{item.priority}</Text>
            </View>
          </View>
          <Text style={[s.message, { color: colors.textSecondary }]} numberOfLines={2}>{item.message}</Text>
          <View style={s.footerRow}>
            <View style={[s.kindChip, { backgroundColor: kindMeta.color + '15', borderColor: kindMeta.color + '40' }]}>
              <Text style={[s.kindChipText, { color: kindMeta.color }]}>{kindMeta.label}</Text>
            </View>
            <Text style={[s.footer, { color: colors.textMuted }]}>{item.category !== 'General' ? item.category + ' · ' : ''}{item.createdAt}</Text>
          </View>
        </View>
        {isUnread && <View style={[s.dot, { backgroundColor: colors.primary }]} />}
      </View>
    );
  };

  return (
    <View style={[s.root, { backgroundColor: colors.surface }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[s.filterBar, { backgroundColor: colors.surfaceCard, borderBottomColor: colors.border }]} contentContainerStyle={s.filterContent}>
        {FILTERS.map(f => {
          const isActive = filter === f;
          const activeColor = f === 'Alerts' ? colors.sos
                            : f === 'Fire' ? colors.fire
                            : f === 'Security' ? colors.security
                            : f === 'Ambulance' ? colors.ambulance
                            : f === 'Other' ? colors.other
                            : colors.primary;
          return (
            <TouchableOpacity
              key={f}
              style={[s.chip, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }, isActive && { backgroundColor: activeColor, borderColor: activeColor }]}
              onPress={() => setFilter(f)}
              activeOpacity={0.8}
            >
              <Text style={[s.chipText, { color: colors.textSecondary }, isActive && { color: '#fff' }]}>{f}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {error ? (
        <View style={[s.empty, { paddingVertical: 12 }]}>
          <MaterialIcons name="cloud-off" size={40} color={colors.textMuted} />
          <Text accessibilityRole="alert" style={[s.emptyText, { color: colors.textMuted }]}>{error}</Text>
          <TouchableOpacity onPress={fetchItems}><Text style={{ color: colors.primary, padding: 12 }}>Try again</Text></TouchableOpacity>
        </View>
      ) : null}

      <FlatList
        data={filtered}
        keyExtractor={i => i.kind + '-' + i.id}
        contentContainerStyle={{ padding: 12, paddingBottom: 30 }}
        ListEmptyComponent={
          error ? null : (
            <View style={s.empty}>
              <MaterialIcons name="notifications-none" size={56} color={colors.textMuted} />
              <Text style={[s.emptyText, { color: colors.textMuted }]}>No active alerts for you right now</Text>
            </View>
          )
        }
        renderItem={renderItem}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root:          { flex: 1 },
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  filterBar:     { borderBottomWidth: 1, maxHeight: 56 },
  filterContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  chip:          { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1.5 },
  chipText:      { fontSize: 13, fontWeight: '600' },
  empty:         { alignItems: 'center', paddingVertical: 48 },
  emptyText:     { fontSize: 15, marginTop: 12 },
  card:          { borderRadius: radius.lg, padding: 14, marginBottom: 12, flexDirection: 'row', gap: 12, borderWidth: 1 },
  iconCircle:    { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  titleRow:      { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4, gap: 8 },
  alertTitle:    { flex: 1, fontSize: 14, fontWeight: '700' },
  badge:         { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:     { color: '#fff', fontSize: 10, fontWeight: '700' },
  message:       { fontSize: 13, lineHeight: 18, marginBottom: 6 },
  footerRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  footer:        { fontSize: 11 },
  kindChip:      { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full, borderWidth: 1 },
  kindChipText:  { fontSize: 10, fontWeight: '700' },
  dot:           { width: 8, height: 8, borderRadius: 4, alignSelf: 'center' },
});
