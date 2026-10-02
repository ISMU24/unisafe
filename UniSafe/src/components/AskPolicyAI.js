import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, TextInput, ActivityIndicator, Keyboard } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { api } from '../utils/api';

export default function AskPolicyAI() {
  const { colors } = useTheme();
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Hi! Ask me anything about UniSafe policies. I\'ll find the relevant policy and cite the source.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const flatRef = useRef(null);

  useEffect(() => {
    if (flatRef.current) {
      flatRef.current.scrollToEnd({ animated: true });
    }
  }, [messages]);

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput('');
    Keyboard.dismiss();
    const userMsg = { id: Date.now().toString(), role: 'user', text: q };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    try {
      const data = await api.askPolicy(q);
      const aiMsg = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: data.answer || data.error || 'No answer returned.',
        sources: data.sources || [],
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (e) {
      const msg = e.message.includes('fetch') || e.message.includes('Network') || e.message.includes('Failed to fetch')
        ? 'Cannot reach policy server. Make sure the backend is running on port 3001.'
        : e.message;
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', text: `Error: ${msg}` }]);
    } finally {
      setLoading(false);
    }
  };

  const renderMessage = ({ item }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[s.msgRow, isUser ? s.userRow : s.aiRow]}>
        {!isUser && <View style={[s.avatar, { backgroundColor: '#455A64' }]}><Text style={s.avatarText}>🤖</Text></View>}
        <View style={[s.bubble, isUser ? s.userBubble : s.aiBubble, { backgroundColor: isUser ? colors.primary : colors.surfaceCard, borderColor: isUser ? colors.primary : colors.border }]}>
          <Text style={[s.msgText, { color: isUser ? '#fff' : colors.textPrimary }]}>{item.text}</Text>
          {item.sources && item.sources.length > 0 && (
            <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: isUser ? 'rgba(255,255,255,0.2)' : colors.border, paddingTop: 8 }}>
              <Text style={[s.sourceLabel, { color: isUser ? 'rgba(255,255,255,0.85)' : colors.textMuted }]}>Sources:</Text>
              {item.sources.map((src, i) => (
                <Text key={i} style={[s.sourceText, { color: isUser ? 'rgba(255,255,255,0.85)' : colors.textSecondary }]}>
                  • {src.title} (p. {src.page})
                </Text>
              ))}
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <FlatList
        ref={flatRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
        showsVerticalScrollIndicator={false}
      />

      {loading && (
        <View style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
          <ActivityIndicator size="small" color="#455A64" />
        </View>
      )}

      <View style={[s.footer, { backgroundColor: colors.surfaceCard, borderTopColor: colors.border }]}>
        <TextInput
          style={[s.input, { backgroundColor: colors.surfaceAlt, color: colors.textPrimary, borderColor: colors.border }]}
          placeholder="Ask about a policy..."
          placeholderTextColor={colors.textMuted}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={send}
          autoCorrect={false}
          autoCapitalize="none"
        />
        <TouchableOpacity style={[s.sendBtn, { backgroundColor: input.trim() ? '#455A64' : colors.surfaceAlt }]} onPress={send} disabled={!input.trim() || loading}>
          <MaterialIcons name="send" size={20} color={input.trim() ? '#fff' : colors.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={{ backgroundColor: colors.surfaceCard, paddingHorizontal: 16, paddingBottom: 12, paddingTop: 4, borderTopWidth: 1, borderTopColor: colors.border }}>
        <Text style={[s.disclaimer, { color: colors.textMuted }]}>⚠️ AI-generated summary — always verify against the linked policy.</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  msgRow: { flexDirection: 'row', marginVertical: 6, alignItems: 'flex-start' },
  userRow: { justifyContent: 'flex-end' },
  aiRow:   { justifyContent: 'flex-start' },
  avatar:    { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 8, marginTop: 4 },
  avatarText: { fontSize: 14 },
  bubble:    { maxWidth: '82%', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1 },
  userBubble: { borderBottomRightRadius: 4 },
  aiBubble:   { borderBottomLeftRadius: 4 },
  msgText:   { fontSize: 14, lineHeight: 20 },
  sourceLabel: { fontSize: 11, fontWeight: '700', marginBottom: 2 },
  sourceText:  { fontSize: 12 },
  footer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, gap: 8 },
  input:  { flex: 1, borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  disclaimer: { fontSize: 11, lineHeight: 16 },
});
