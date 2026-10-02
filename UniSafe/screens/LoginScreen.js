import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Switch, ScrollView, Modal, KeyboardAvoidingView, Keyboard, Platform, Image, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import { radius } from '../src/theme';
import { useTheme } from '../src/ThemeContext';
import { api } from '../src/utils/api';
import { connectRealtime } from '../src/utils/realtime';

const buildUser = (identifier, role) => {
  const id = (identifier || 'user').trim();
  const isEmail = id.includes('@');
  return {
    fullName: isEmail ? id.split('@')[0] : id,
    universityId: isEmail ? '' : id,
    email: isEmail ? id : `${id}@unisafe.local`,
    role: role || 'student',
  };
};

export default function LoginScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const { colors, isDark } = useTheme();
  const [role, setRole] = useState('student');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [idFocused, setIdFocused] = useState(false);
  const [passFocused, setPassFocused] = useState(false);
  const [forgotVisible, setForgotVisible] = useState(false);
  const [kbHeight, setKbHeight] = useState(0);

  const idRef = useRef(null);
  const passRef = useRef(null);
  const scrollRef = useRef(null);

  React.useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', e => {
      setKbHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      setKbHeight(0);
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const handleLogin = async () => {
    if (!identifier.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter your ID and password.');
      return;
    }
    setLoading(true);
    try {
      // Server login: identifier can be an email OR university/staff id.
      const email = identifier.includes('@') ? identifier : `${identifier}@unisafe.local`;
      await api.login(email, password);
      const me = await api.me();
      const sessionUser = {
        userId: me.userId,
        fullName: me.fullName,
        email: me.email,
        universityId: me.studentOrStaffId || '',
        roles: me.roles || [],
        role: (me.roles && me.roles[0]) || 'STUDENT',
      };
      await AsyncStorage.setItem('user', JSON.stringify(sessionUser));
      setLoading(false);
      // The realtime handshake needs the freshly issued access token, and the
      // socket may already hold the previous session's connection.
      connectRealtime().catch(() => {});
      navigation.replace('Home', { user: sessionUser });
    } catch (e) {
      setLoading(false);
      Alert.alert('Login Failed', e.message || 'Invalid credentials. Please try again.');
    }
  };

  const isSmall = winW < 380;
  const logoSize = Math.min(110, winW * 0.28);
  const topPad = Math.max(insets.top, 12) + 12;
  const bottomPad = Math.max(insets.bottom, 12) + 16 + (kbHeight > 0 ? 24 : 0);

  const focusAndScroll = (ref) => {
    setTimeout(() => {
      ref.current?.measureLayout?.(
        scrollRef.current,
        (x, y) => {
          const target = Math.max(0, y - 120);
          scrollRef.current?.scrollTo({ y: target, animated: true });
        },
        () => {}
      );
    }, 80);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.surface }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.topGoldBar, { backgroundColor: colors.accent }]} />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.container, { paddingTop: topPad, paddingBottom: bottomPad, flexGrow: 1 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      >
        <Image source={require('../assets/uot-logo-shield.png')} style={{ width: logoSize, height: logoSize, marginBottom: 10 }} resizeMode="contain" />
        <Text style={[styles.uniName, { color: colors.primary }, isSmall && { fontSize: 11 }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85}>
          Papua New Guinea{'\n'}University of Technology
        </Text>
        <Text style={[styles.title, { color: colors.primary }, isSmall && { fontSize: 26 }]}>UniSafe</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>Sign in to your account</Text>

        <View style={[styles.roleRow, { backgroundColor: colors.surfaceGold, borderColor: colors.accent }]}>
          {['student', 'staff'].map(r => (
            <TouchableOpacity
              key={r}
              style={[styles.roleBtn, role === r && { backgroundColor: colors.primary }]}
              onPress={() => setRole(r)}
              activeOpacity={0.8}
            >
              <Text style={[styles.roleBtnText, { color: colors.textSecondary }, role === r && { color: colors.textOnGold }]}>
                {r === 'student' ? '🎓 Student' : '👤 Staff'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View ref={idRef} collapsable={false} style={[styles.input, { backgroundColor: colors.surfaceCard }, idFocused && { borderColor: colors.primary }]}>
          <MaterialIcons name="person" size={20} color={colors.textMuted} style={styles.inputIcon} />
          <TextInput
            style={[styles.inputText, { color: colors.textPrimary }]}
            placeholder={role === 'student' ? 'Student ID, Email, or Username' : 'Staff ID or Email'}
            placeholderTextColor={colors.textMuted}
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            onFocus={() => { setIdFocused(true); focusAndScroll(idRef); }}
            onBlur={() => setIdFocused(false)}
            returnKeyType="next"
            onSubmitEditing={() => passRef.current?.measureLayout(
              scrollRef.current,
              (x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 120), animated: true }),
              () => {}
            ) || passRef.current}
          />
        </View>

        <View ref={passRef} collapsable={false} style={[styles.input, { backgroundColor: colors.surfaceCard }, passFocused && { borderColor: colors.primary }]}>
          <MaterialIcons name="lock" size={20} color={colors.textMuted} style={styles.inputIcon} />
          <TextInput
            style={[styles.inputText, { flex: 1, color: colors.textPrimary }]}
            placeholder="Password"
            placeholderTextColor={colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPass}
            onFocus={() => { setPassFocused(true); focusAndScroll(passRef); }}
            onBlur={() => setPassFocused(false)}
            returnKeyType="go"
            onSubmitEditing={handleLogin}
          />
          <TouchableOpacity onPress={() => setShowPass(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name={showPass ? 'visibility-off' : 'visibility'} size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={styles.row}>
          <View style={styles.rememberRow}>
            <Switch
              value={rememberMe}
              onValueChange={setRememberMe}
              trackColor={{ true: colors.primary }}
              thumbColor={rememberMe ? '#fff' : '#f4f3f4'}
              style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
            />
            <Text style={[styles.rememberText, { color: colors.textSecondary }]}>Remember Me</Text>
          </View>
          <TouchableOpacity onPress={() => setForgotVisible(true)}>
            <Text style={[styles.forgot, { color: colors.primary }]}>Forgot Password?</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={[styles.loginBtn, { backgroundColor: colors.primary, borderColor: colors.accent }]} onPress={handleLogin} disabled={loading} activeOpacity={0.85}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={[styles.loginText, { color: colors.textOnGold }]}>Login</Text>}
        </TouchableOpacity>

        <Text style={[styles.footer, { color: colors.textMuted }]}>Papua New Guinea University of Technology</Text>

        <Modal visible={forgotVisible} transparent animationType="fade">
          <View style={[styles.modalOverlay, { backgroundColor: colors.modalScrim }]}>
            <View style={[styles.modalBox, { backgroundColor: colors.surfaceCard, borderTopColor: colors.primary }]}>
              <MaterialIcons name="info" size={32} color={colors.primary} style={{ marginBottom: 12 }} />
              <Text style={[styles.modalTitle, { color: colors.primary }]}>Forgot Password?</Text>
              <Text style={[styles.modalMsg, { color: colors.textSecondary }]}>
                Please contact the IT Help Desk at{'\n'}helpdesk@pnguot.ac.pg{'\n'}or visit the ICT Office.
              </Text>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.primary }]} onPress={() => setForgotVisible(false)}>
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  topGoldBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 5, zIndex: 10 },
  container: { alignItems: 'center', justifyContent: 'center', padding: 20 },
  uniName: { fontSize: 12, fontWeight: '700', textAlign: 'center', marginBottom: 4, paddingHorizontal: 8, letterSpacing: 0.3 },
  title: { fontSize: 28, fontWeight: 'bold', letterSpacing: 4, marginBottom: 6 },
  subtitle: { fontSize: 14, marginBottom: 20 },
  roleRow: { flexDirection: 'row', borderRadius: 12, padding: 4, width: '100%', marginBottom: 16, gap: 4, borderWidth: 1 },
  roleBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  roleBtnText: { fontSize: 14, fontWeight: '600' },
  input: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, width: '100%', marginBottom: 14, borderWidth: 1.5, borderColor: 'transparent' },
  inputIcon: { marginRight: 10 },
  inputText: { fontSize: 15 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 24 },
  rememberRow: { flexDirection: 'row', alignItems: 'center' },
  rememberText: { fontSize: 13, marginLeft: 4 },
  forgot: { fontSize: 13, fontWeight: '600' },
  loginBtn: { borderRadius: 12, paddingVertical: 15, width: '100%', alignItems: 'center', marginBottom: 24, borderWidth: 2 },
  loginText: { fontSize: 16, fontWeight: 'bold', letterSpacing: 1 },
  footer: { fontSize: 11, textAlign: 'center' },
  modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  modalBox: { borderRadius: 16, padding: 28, alignItems: 'center', width: '80%', borderTopWidth: 4 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  modalMsg: { textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  modalBtn: { borderRadius: 8, paddingHorizontal: 32, paddingVertical: 10 },
});
