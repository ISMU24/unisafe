import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../src/ThemeContext';
import AppealForm from '../src/components/AppealForm';
import AppealTracker from '../src/components/AppealTracker';
import AppealsQueue from '../src/components/AppealsQueue';
import { api } from '../src/utils/api';

export default function AppealsScreen({ navigation, route }) {
  const { colors } = useTheme();
  const [tab, setTab] = useState('submit');
  const [role, setRole] = useState('student');
  const [appeals, setAppeals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem('user').then(async u => {
      const parsed = u ? JSON.parse(u) : null;
      if (parsed?.role) setRole(parsed.role);
      try {
        // Pass an empty filters object — the server scopes results to the
        // authenticated user automatically via the JWT.
        const data = await api.getAppeals({});
        setAppeals(data);
      } catch {
        // Use local state only if backend unreachable
      }
      setLoading(false);
    });
  }, []);

  const handleSubmit = useCallback(async (appeal) => {
    try {
      const userRaw = await AsyncStorage.getItem('user');
      const user = userRaw ? JSON.parse(userRaw) : null;
      const saved = await api.createAppeal({
        // Server appealCreateSchema: type (enum), title (required), description (required)
        // category maps to type; userId is derived from the JWT on the server.
        type: appeal.category || 'Other',
        title: appeal.title || appeal.category || 'Appeal',
        description: appeal.description,
      });
      setAppeals(prev => [saved, ...prev]);
      setTab('my');
      Alert.alert('Submitted', `Your appeal ID is ${saved.id}`);
    } catch {
      // Fallback: use local appeal object
      setAppeals(prev => [appeal, ...prev]);
      setTab('my');
      Alert.alert('Submitted', `Your appeal ID is ${appeal.id}`);
    }
  }, []);

  const showQueue = role === 'staff' || role === 'admin';

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[s.header, { backgroundColor: colors.surfaceCard, borderBottomColor: colors.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <MaterialIcons name="gavel" size={24} color={colors.policy} />
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Appeals</Text>
        </View>
      </View>

      <View style={[s.tabBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={[s.tab, tab === 'submit' && [s.tabActive, { borderBottomColor: colors.policy }]]} onPress={() => setTab('submit')}>
          <Text style={[s.tabText, { color: tab === 'submit' ? colors.policy : colors.textMuted }]}>Submit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tab, tab === 'my' && [s.tabActive, { borderBottomColor: colors.policy }]]} onPress={() => setTab('my')}>
          <Text style={[s.tabText, { color: tab === 'my' ? colors.policy : colors.textMuted }]}>My Appeals</Text>
        </TouchableOpacity>
        {showQueue && (
          <TouchableOpacity style={[s.tab, tab === 'queue' && [s.tabActive, { borderBottomColor: colors.policy }]]} onPress={() => setTab('queue')}>
            <Text style={[s.tabText, { color: tab === 'queue' ? colors.policy : colors.textMuted }]}>Queue</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.policy} />
        </View>
      ) : (
        <>
          {tab === 'submit' && <AppealForm onSubmit={handleSubmit} />}
          {tab === 'my' && <AppealTracker appeals={appeals} />}
          {tab === 'queue' && showQueue && <AppealsQueue appeals={appeals} onViewAppeal={() => {}} />}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 20, fontWeight: '700', marginLeft: 10 },
  tabBar:      { flexDirection: 'row', borderBottomWidth: 1, backgroundColor: '#fff' },
  tab:         { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabActive:   { borderBottomWidth: 3 },
  tabText:     { fontSize: 14, fontWeight: '600' },
});
