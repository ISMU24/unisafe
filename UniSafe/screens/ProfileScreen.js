import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, Modal, ActivityIndicator, Switch, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../src/ThemeContext';
import { api } from '../src/utils/api';
import { disconnectRealtime } from '../src/utils/realtime';

export default function ProfileScreen({ navigation }) {
  const { colors, isDark, toggle, setMode } = useTheme();
  const [user, setUser] = useState(null);
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [logoutVisible, setLogoutVisible] = useState(false);

  const toggleEdit = useCallback(() => setEditing(v => !v), []);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={toggleEdit} style={{ marginRight: 16 }}>
          <MaterialIcons name="edit" size={22} color={isDark ? colors.textOnGold : '#fff'} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, toggleEdit, isDark, colors]);

  useEffect(() => {
    AsyncStorage.getItem('user').then(u => {
      if (u) {
        const parsed = JSON.parse(u);
        setUser(parsed);
        setPhone(parsed.phone || '');
      }
    });
  }, []);

  const saveChanges = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 600));
    const updated = { ...user, phone };
    await AsyncStorage.setItem('user', JSON.stringify(updated));
    setUser(updated);
    setSaving(false);
    setEditing(false);
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      Alert.alert('Signed out on this device', 'The server could not confirm session revocation.');
    } finally {
      // Drop the socket explicitly: leaving it connected would keep pushing the
      // previous user's records to a screen that no longer has a session.
      disconnectRealtime();
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    }
  };

  if (!user) return <View style={[styles.center, { backgroundColor: colors.surface }]}><ActivityIndicator size="large" color={colors.primary} /></View>;

  const initial = user.fullName?.[0]?.toUpperCase() || 'U';

  const Field = ({ label, value, editable, onChangeText }) => (
    <View style={[styles.field, { borderBottomColor: colors.border }]}>
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
      {editable
        ? <TextInput style={[styles.fieldInput, { color: colors.textPrimary, borderBottomColor: colors.primary }]} value={value} onChangeText={onChangeText} placeholderTextColor={colors.textMuted} />
        : <Text style={[styles.fieldValue, { color: colors.textPrimary }]}>{value || '—'}</Text>
      }
    </View>
  );

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.surface }]} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      {/* Avatar */}
      <View style={styles.avatarSection}>
        <View style={[styles.avatar, { backgroundColor: colors.primary, borderColor: colors.accent }]}>
          <Text style={[styles.avatarText, { color: colors.textOnGold }]}>{initial}</Text>
        </View>
        <Text style={[styles.name, { color: colors.textPrimary }]}>{user.fullName}</Text>
        <View style={[styles.roleBadge, { backgroundColor: colors.primary, borderColor: colors.accent }]}>
          <Text style={[styles.roleText, { color: colors.textOnGold }]}>{user.role?.toUpperCase()}</Text>
        </View>
      </View>

      {/* Fields */}
      <View style={[styles.card, { backgroundColor: colors.surfaceCard, borderTopColor: colors.primary, shadowColor: colors.shadow }]}>
        <Field label="Full Name"     value={user.fullName} />
        <Field label="University ID" value={user.universityId} />
        <Field label="Email"         value={user.email} />
        <Field label="Phone"         value={phone} editable={editing} onChangeText={setPhone} />
      </View>

      {/* Appearance card */}
      <View style={[styles.card, { backgroundColor: colors.surfaceCard, borderTopColor: colors.accent, shadowColor: colors.shadow }]}>
        <View style={[styles.field, { borderBottomWidth: 0, paddingVertical: 16 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <MaterialIcons
              name={isDark ? 'dark-mode' : 'light-mode'}
              size={22}
              color={isDark ? colors.accent : colors.primary}
              style={{ marginRight: 12 }}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted, marginBottom: 2 }]}>APPEARANCE</Text>
              <Text style={[styles.fieldValue, { color: colors.textPrimary, fontWeight: '700' }]}>
                {isDark ? 'Dark Mode' : 'Light Mode'}
              </Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggle}
              trackColor={{ false: '#D0D0D0', true: colors.accent }}
              thumbColor={isDark ? colors.primaryDark : '#fff'}
            />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {['light', 'dark'].map(m => (
            <TouchableOpacity
              key={m}
              style={[
                styles.modeChip,
                { borderColor: colors.border, backgroundColor: colors.surfaceAlt },
                (isDark ? m === 'dark' : m === 'light') && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
              onPress={() => setMode(m)}
              activeOpacity={0.8}
            >
              <MaterialIcons
                name={m === 'dark' ? 'dark-mode' : 'light-mode'}
                size={16}
                color={(isDark ? m === 'dark' : m === 'light') ? colors.textOnGold : colors.textSecondary}
                style={{ marginRight: 6 }}
              />
              <Text style={{
                color: (isDark ? m === 'dark' : m === 'light') ? colors.textOnGold : colors.textSecondary,
                fontWeight: '600', fontSize: 13,
              }}>{m === 'dark' ? 'Dark' : 'Light'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Buttons */}
      {editing ? (
        <View style={styles.btnRow}>
          <TouchableOpacity style={[styles.btn, styles.cancelBtn, { backgroundColor: colors.surfaceAlt }]} onPress={() => setEditing(false)}>
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary, borderColor: colors.accent, borderWidth: 1 }]} onPress={saveChanges} disabled={saving}>
            {saving ? <ActivityIndicator color={colors.textOnGold} size="small" /> : <Text style={{ color: colors.textOnGold, fontWeight: 'bold' }}>Save Changes</Text>}
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={[styles.logoutBtn, { backgroundColor: colors.sos }]} onPress={() => setLogoutVisible(true)}>
          <MaterialIcons name="logout" size={20} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      )}

      <Modal visible={logoutVisible} transparent animationType="fade">
        <View style={[styles.modalOverlay, { backgroundColor: colors.modalScrim }]}>
          <View style={[styles.modalBox, { backgroundColor: colors.surfaceCard, borderTopColor: colors.primary }]}>
            <MaterialIcons name="logout" size={36} color={colors.sos} style={{ marginBottom: 12 }} />
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Confirm Logout</Text>
            <Text style={[styles.modalMsg, { color: colors.textMuted }]}>Are you sure you want to log out?</Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.modalCancel, { backgroundColor: colors.surfaceAlt }]} onPress={() => setLogoutVisible(false)}>
                <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalLogout, { backgroundColor: colors.sos }]} onPress={logout}>
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  avatarSection: { alignItems: 'center', marginBottom: 24 },
  avatar: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 12, borderWidth: 3 },
  avatarText: { fontSize: 32, fontWeight: 'bold' },
  name: { fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  roleBadge: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 4, borderWidth: 1 },
  roleText: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  card: { borderRadius: 14, overflow: 'hidden', marginBottom: 20, elevation: 2, shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, borderTopWidth: 3 },
  field: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  fieldLabel: { fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldValue: { fontSize: 15, fontWeight: '500' },
  fieldInput: { fontSize: 15, borderBottomWidth: 1.5, paddingVertical: 2 },
  modeChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1.5 },
  btnRow: { flexDirection: 'row', gap: 12 },
  btn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  cancelBtn: {},
  cancelText: { fontWeight: '600' },
  logoutBtn: { borderRadius: 12, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  logoutText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  modalBox: { borderRadius: 16, padding: 28, alignItems: 'center', width: '80%', borderTopWidth: 4 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  modalMsg: { marginBottom: 20 },
  modalBtns: { flexDirection: 'row', gap: 12, width: '100%' },
  modalCancel: { flex: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  modalLogout: { flex: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
});
