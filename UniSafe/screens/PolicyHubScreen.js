import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../src/ThemeContext';
import PolicyBrowser from '../src/components/PolicyBrowser';
import AskPolicyAI from '../src/components/AskPolicyAI';

export default function PolicyHubScreen({ navigation }) {
  const { colors } = useTheme();
  const [tab, setTab] = useState('browser');

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[s.header, { backgroundColor: colors.surfaceCard, borderBottomColor: colors.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <MaterialIcons name="menu-book" size={24} color={colors.policy} />
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Policies</Text>
        </View>
      </View>

      <View style={[s.tabBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={tab === 'browser' ? [s.tab, s.tabActive, { borderBottomColor: colors.policy }] : s.tab}
          onPress={() => setTab('browser')}
        >
          <MaterialIcons name="folder-open" size={20} color={tab === 'browser' ? colors.policy : colors.textMuted} />
          <Text style={[s.tabText, { color: tab === 'browser' ? colors.policy : colors.textMuted }]}>Browse</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={tab === 'ai' ? [s.tab, s.tabActive, { borderBottomColor: colors.policy }] : s.tab}
          onPress={() => setTab('ai')}
        >
          <MaterialIcons name="auto-awesome" size={20} color={tab === 'ai' ? colors.policy : colors.textMuted} />
          <Text style={[s.tabText, { color: tab === 'ai' ? colors.policy : colors.textMuted }]}>Ask AI</Text>
        </TouchableOpacity>
      </View>

      {tab === 'browser' ? <PolicyBrowser /> : <AskPolicyAI />}
    </View>
  );
}

const s = StyleSheet.create({
  header:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  headerTitle:{ fontSize: 20, fontWeight: '700', marginLeft: 10 },
  tabBar:     { flexDirection: 'row', borderBottomWidth: 1, backgroundColor: '#fff' },
  tab:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 6, borderBottomWidth: 3 },
  tabActive:  { borderBottomWidth: 3 },
  tabText:    { fontSize: 14, fontWeight: '600' },
});
