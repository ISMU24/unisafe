import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, FlatList, ActivityIndicator, Linking, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { POLICY_CATEGORIES } from '../theme';
import { POLICY_CATALOG, POLICIES_BY_FILENAME } from '../data/policyCatalog';
import PolicySearch from './PolicySearch';
import * as WebBrowser from 'expo-web-browser';

import { REST_BASE as API_BASE } from '../utils/api';

function formatSize(file) {
  const kb = (file.size / 1024).toFixed(1);
  return kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
}

function formatDate(file) {
  const d = new Date(file.stat?.mtime || file.lastModified || Date.now());
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function PolicyBrowser() {
  const { colors } = useTheme();
  const [expandedCategory, setExpandedCategory] = useState(null);

  const toggleCategory = (id) => {
    setExpandedCategory(prev => prev === id ? null : id);
  };

  const openPdf = async (filename) => {
    const folder = POLICIES_BY_FILENAME[filename]?.folder;
    if (!folder) return;
    const url = `${API_BASE}/api/policies/${encodeURIComponent(folder)}/${encodeURIComponent(filename)}`;
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      Linking.openURL(url).catch(() => {});
    }
  };

  const downloadPdf = openPdf;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <PolicySearch
        onResultPress={(item) => {
          const folder = item.folder;
          openPdf(item.filename);
        }}
      />

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={{ padding: 16, paddingTop: 8 }}>
          {POLICY_CATEGORIES.map(cat => {
            const isExpanded = expandedCategory === cat.id;
            const policies = POLICY_CATALOG[cat.folder] || [];
            return (
              <View key={cat.id} style={[s.catBlock, { marginBottom: 12 }]}>
                <TouchableOpacity
                  style={[s.catHeader, { backgroundColor: colors.policy + '14', borderColor: colors.policy + '44' }]}
                  onPress={() => toggleCategory(cat.id)}
                  activeOpacity={0.8}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <Text style={{ fontSize: 18, marginRight: 10 }}>{cat.icon}</Text>
                    <View>
                      <Text style={[s.catTitle, { color: colors.textPrimary }]}>{cat.label}</Text>
                      <Text style={[s.catCount, { color: colors.textMuted }]}>{policies.length} {policies.length === 1 ? 'policy' : 'policies'}</Text>
                    </View>
                  </View>
                  <MaterialIcons
                    name={isExpanded ? 'expand-less' : 'expand-more'}
                    size={24}
                    color={colors.textMuted}
                  />
                </TouchableOpacity>

                {isExpanded && (
                  <View style={[s.catBody, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
                    {policies.map((p, idx) => (
                      <View
                        key={p.filename}
                        style={[
                          s.policyRow,
                          { borderBottomColor: colors.border },
                          idx === policies.length - 1 && { borderBottomWidth: 0 },
                        ]}
                      >
                        <View style={{ flex: 1, marginRight: 12 }}>
                          <Text style={[s.policyTitle, { color: colors.textPrimary }]} numberOfLines={2}>{p.title}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                            <Text style={[s.policyMeta, { color: colors.textMuted }]}>PDF</Text>
                          </View>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <TouchableOpacity
                            style={[s.iconBtn, { backgroundColor: colors.policy + '18', borderColor: colors.policy + '44' }]}
                            onPress={() => openPdf(p.filename)}
                          >
                            <MaterialIcons name="visibility" size={20} color={colors.policy} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[s.iconBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
                            onPress={() => downloadPdf(p.filename)}
                          >
                            <MaterialIcons name="download" size={20} color={colors.textSecondary} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  catBlock: { borderRadius: 12, overflow: 'hidden', elevation: 1, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4 },
  catHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderWidth: 1, borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  catTitle: { fontSize: 15, fontWeight: '700' },
  catCount: { fontSize: 12, marginTop: 1 },
  catBody:  { borderWidth: 1, borderTopWidth: 0, borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },
  policyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1 },
  policyTitle: { fontSize: 14, fontWeight: '500', lineHeight: 19 },
  policyMeta:  { fontSize: 11 },
  iconBtn:    { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});
