import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Linking, Alert } from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../src/ThemeContext';

const CONTACTS = [
  { id: '1', org: 'Campus Security', desc: 'PNGUOT Campus Security Office', phone: '+675 473 4999', icon: 'security' },
  { id: '2', org: 'University Clinic', desc: 'On-campus medical services', phone: '+675 473 4567', icon: 'local-hospital' },
  { id: '3', org: 'PNG Police', desc: 'Royal Papua New Guinea Constabulary', phone: '000', icon: 'local-police' },
  { id: '4', org: 'Fire Brigade', desc: 'PNG Fire Service emergency line', phone: '110', icon: 'local-fire-department' },
];

const ICON_NAME_KEYS = { security: 'security', 'local-hospital': 'local-hospital', 'local-police': 'local-police', 'local-fire-department': 'local-fire-department' };

const call = (phone) => {
  const url = `tel:${phone.replace(/\s/g, '')}`;
  Linking.canOpenURL(url).then(ok => {
    if (ok) Linking.openURL(url);
    else Alert.alert('Error', 'Unable to open dialler on this device.');
  });
};

export default function EmergencyContactsScreen() {
  const { colors, isDark } = useTheme();

  const ICON_COLORS = {
    security: colors.primary,
    'local-hospital': colors.fire,
    'local-police': colors.security,
    'local-fire-department': colors.other,
  };

  return (
    <FlatList
      data={CONTACTS}
      keyExtractor={i => i.id}
      contentContainerStyle={{ padding: 16 }}
      style={{ backgroundColor: colors.surface }}
      renderItem={({ item }) => {
        const c = ICON_COLORS[item.icon] || colors.primary;
        return (
          <View style={[styles.card, { backgroundColor: colors.surfaceCard, borderLeftColor: colors.primary, shadowColor: colors.shadow }]}>
            <View style={[styles.iconCircle, { backgroundColor: c + (isDark ? '30' : '15') }]}>
            <MaterialCommunityIcons name={item.icon} size={26} color={c} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.org, { color: colors.textPrimary }]}>{item.org}</Text>
              <Text style={[styles.desc, { color: colors.textMuted }]}>{item.desc}</Text>
              <Text style={[styles.phone, { color: colors.primary }]}>{item.phone}</Text>
            </View>
            <TouchableOpacity style={[styles.callBtn, { backgroundColor: colors.primary, borderColor: colors.accent }]} onPress={() => call(item.phone)}>
              <MaterialIcons name="phone" size={22} color={colors.accent} />
            </TouchableOpacity>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14, padding: 16, marginBottom: 12,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderLeftWidth: 4,
    elevation: 2, shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  iconCircle: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  org: { fontSize: 15, fontWeight: 'bold', marginBottom: 2 },
  desc: { fontSize: 12, marginBottom: 4 },
  phone: { fontWeight: '600', fontSize: 14 },
  callBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
});
