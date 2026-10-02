import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { useTheme } from '../ThemeContext';
import { POLICY_CATEGORIES } from '../theme';
import { POLICY_CATALOG, POLICIES_BY_FILENAME } from '../data/policyCatalog';
import Fuse from 'fuse.js';

const fuseOptions = {
  keys: ['title', 'filename'],
  threshold: 0.35,
  includeScore: true,
};

export default function PolicySearch({ onResultPress }) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(false);

  const flatList = useMemo(() => {
    const items = [];
    for (const [folder, policies] of Object.entries(POLICY_CATALOG)) {
      for (const p of policies) {
        items.push({ ...p, folder });
      }
    }
    return items;
  }, []);

  const fuse = useMemo(() => new Fuse(flatList, fuseOptions), []);
  const results = useMemo(() => {
    if (!query.trim()) return [];
    return fuse.search(query.trim()).map(r => r.item);
  }, [query, fuse]);

  const highlight = (text, q) => {
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return text;
    return [text.slice(0, idx), text.slice(idx, idx + q.length), text.slice(idx + q.length)];
  };

  return (
    <View style={[s.wrap, { backgroundColor: colors.surfaceCard, borderBottomColor: colors.border }]}>
      <View style={[s.bar, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
        <Text style={{ color: colors.textMuted, fontSize: 16, marginRight: 8 }}>🔍</Text>
        <TextInput
          style={[s.input, { color: colors.textPrimary }]}
          placeholder="Search policies..."
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          onFocus={() => setActive(true)}
          onBlur={() => setTimeout(() => setActive(false), 150)}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Text style={{ color: colors.textMuted, fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {active && results.length > 0 && (
        <View style={[s.dropdown, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
          <FlatList
            data={results}
            keyExtractor={item => item.filename}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const meta = POLICY_CATEGORIES.find(c => c.folder === item.folder);
              return (
                <TouchableOpacity
                  style={[s.resultRow, { borderBottomColor: colors.border }]}
                  onPress={() => {
                    setQuery('');
                    onResultPress && onResultPress(item);
                  }}
                >
                  <Text style={[s.resultTitle, { color: colors.textPrimary }]} numberOfLines={1}>{item.title}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ fontSize: 10, marginRight: 4 }}>{meta?.icon || '📄'}</Text>
                    <Text style={[s.resultCat, { color: colors.textMuted }]}>{meta?.label || item.folder}</Text>
                  </View>
                </TouchableOpacity>
              );
            }}
            style={{ maxHeight: 280 }}
          />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap:   { paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1 },
  bar:    { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, height: 44 },
  input:  { flex: 1, fontSize: 15, padding: 0 },
  dropdown: { borderWidth: 1, borderTopWidth: 0, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, maxHeight: 300 },
  resultRow: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultTitle: { fontWeight: '600', fontSize: 14, flex: 1, marginRight: 8 },
  resultCat:  { fontSize: 11 },
});
