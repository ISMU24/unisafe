import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { radius } from '../theme';
import { useTheme } from '../ThemeContext';

const CATEGORY_META = {
  Security: { color: 'security', icon: 'security', label: 'Security' },
  Fire: { color: 'fire', icon: 'local-fire-department', label: 'Fire' },
  Ambulance: { color: 'ambulance', icon: 'medical-services', label: 'Ambulance' },
  Other: { color: 'other', icon: 'report-problem', label: 'Other' },
};

const STATUS_META = {
  Submitted: ['statusOpen', 'error-outline'],
  Open: ['statusOpen', 'error-outline'],
  Active: ['statusOpen', 'error-outline'],
  Pending: ['statusOpen', 'schedule'],
  Received: ['statusInProgress', 'schedule'],
  Acknowledged: ['statusInProgress', 'support-agent'],
  Assigned: ['statusInProgress', 'assignment-ind'],
  Responding: ['statusInProgress', 'directions-run'],
  'In Progress': ['statusInProgress', 'schedule'],
  'Under Review': ['statusInProgress', 'manage-search'],
  'Additional Info Required': ['statusInProgress', 'info-outline'],
  Resolved: ['statusResolved', 'check-circle'],
  Approved: ['statusResolved', 'check-circle'],
  Completed: ['statusResolved', 'check-circle'],
  Rejected: ['sos', 'cancel'],
  Cancelled: ['textMuted', 'cancel'],
  Closed: ['textMuted', 'check-circle-outline'],
};

export default function CategoryBadge({ category, size = 'sm' }) {
  const { colors } = useTheme();
  const meta = CATEGORY_META[category] || CATEGORY_META.Other;
  const color = colors[meta.color];
  const large = size === 'lg';
  return (
    <View style={[s.badge, { backgroundColor: `${color}14`, borderColor: `${color}40`, paddingHorizontal: large ? 12 : 8, paddingVertical: large ? 6 : 4 }]}>
      <MaterialIcons name={meta.icon} size={large ? 17 : 14} color={color} />
      <Text style={[s.text, { color, fontSize: large ? 13 : 11 }]}>{meta.label}</Text>
    </View>
  );
}

export function StatusBadge({ status, size = 'sm' }) {
  const { colors } = useTheme();
  const [colorToken, icon] = STATUS_META[status] || ['textMuted', 'radio-button-unchecked'];
  const color = colors[colorToken];
  const large = size === 'lg';
  return (
    <View style={[s.badge, { backgroundColor: `${color}14`, borderColor: `${color}40`, paddingHorizontal: large ? 12 : 8, paddingVertical: large ? 6 : 4 }]}>
      <MaterialIcons name={icon} size={large ? 17 : 14} color={color} />
      <Text style={[s.text, { color, fontSize: large ? 13 : 11 }]}>{status}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.full, borderWidth: 1, alignSelf: 'flex-start' },
  text: { fontWeight: '600' },
});
