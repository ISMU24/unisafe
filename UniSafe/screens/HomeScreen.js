import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl, Image, Dimensions, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import { radius } from '../src/theme';
import { useTheme } from '../src/ThemeContext';
import { api } from '../src/utils/api';
import { subscribeRealtime } from '../src/utils/realtime';

const ACTIONS = [
  { id: 'report',         label: 'Report Incident',    icon: 'warning',         screen: 'ReportIncident'    },
  { id: 'assistance',     label: 'Request Assistance', icon: 'help-outline',    screen: 'Assistance'        },
  { id: 'myreports',      label: 'My Reports',         icon: 'folder',          screen: 'MyReports'         },
  { id: 'alerts',         label: 'Safety Alerts',      icon: 'notifications',   screen: 'SafetyAlerts'      },
  { id: 'contacts',       label: 'Emergency Contacts', icon: 'phone',           screen: 'EmergencyContacts' },
  { id: 'policies',       label: 'Policies',           icon: 'menu-book',       screen: 'PolicyHub'         },
  { id: 'appeals',        label: 'Appeals',            icon: 'gavel',           screen: 'Appeals'           },
  { id: 'profile',        label: 'My Profile',         icon: 'account-circle',  screen: 'Profile'           },
];

export default function HomeScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const { colors, isDark } = useTheme();
  const [user, setUser] = useState(route.params?.user || null);
  const [refreshing, setRefreshing] = useState(false);
  const [unread, setUnread] = useState(0);

  const loadUnread = async () => {
    try {
      // Counted from the real alerts the server addresses to this user, not
      // from a fixture: a badge that invents unread alerts is worse than none.
      const alerts = await api.getMyAlerts();
      setUnread((alerts || []).filter(a => !a.is_read).length);
    } catch {
      setUnread(0);
    }
  };

  useEffect(() => {
    if (!user) {
      AsyncStorage.getItem('user').then(u => u && setUser(JSON.parse(u)));
    }
    loadUnread();
    const unsub = navigation.addListener('focus', loadUnread);
    const offRealtime = subscribeRealtime('alert-update', loadUnread);
    return () => { unsub(); offRealtime(); };
  }, [navigation, user?.userId]);

  const onRefresh = () => { setRefreshing(true); setTimeout(() => setRefreshing(false), 600); };

  const firstName = user?.fullName?.split(' ')[0] || 'User';
  const isSmall = winW < 380;
  const cardWidth = (winW - 16 * 2 - 12) / 2;
  const headerPadTop = Math.max(insets.top, 8) + 8;
  const bottomPad = Math.max(insets.bottom, 12) + 24;
  const logoSize = isSmall ? 40 : 48;

  // For dark mode, give the icon circles more brand-distinct colors
  const circleColor = (id) => {
    if (!isDark) {
      const map = { report: '#E65100', assistance: '#1565C0', myreports: '#6A1B9A', alerts: '#A80808', contacts: '#2E7D32', policies: '#455A64', appeals: '#455A64', profile: '#680808' };
      return map[id];
    }
    const mapD = { report: '#FFB74D', assistance: '#64B5F6', myreports: '#CE93D8', alerts: '#F8E808', contacts: '#81C784', policies: '#90A4AE', appeals: '#90A4AE', profile: '#C9BC08' };
    return mapD[id];
  };
  const labelColor = (id) => {
    if (!isDark) {
      const map = { report: '#E65100', assistance: '#1565C0', myreports: '#6A1B9A', alerts: '#A80808', contacts: '#2E7D32', policies: '#455A64', appeals: '#455A64', profile: '#680808' };
      return map[id];
    }
    const mapD = { report: '#FFB74D', assistance: '#64B5F6', myreports: '#CE93D8', alerts: '#F8E808', contacts: '#81C784', policies: '#90A4AE', appeals: '#90A4AE', profile: '#C9BC08' };
    return mapD[id];
  };

  return (
    <View style={[s.root, { backgroundColor: colors.surface, paddingTop: headerPadTop }]}>
      {/* PNGUOT logo watermark background */}
      <View style={s.bgLayer} pointerEvents="none">
        <Image
          source={require('../assets/uot-logo-shield.png')}
          style={[s.bgLogo, { width: winW * 0.9, height: winW * 0.9, opacity: isDark ? 0.06 : 0.10 }]}
          resizeMode="contain"
        />
      </View>

      <ScrollView
        style={s.container}
        contentContainerStyle={[s.content, { paddingBottom: bottomPad }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <View style={s.headerRow}>
          <View style={s.headerLeft}>
            <Image source={require('../assets/uot-logo-shield.png')} style={{ width: logoSize, height: logoSize }} resizeMode="contain" />
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={[s.uniName, { color: colors.primary }]} numberOfLines={1}>PNGUOT</Text>
              <Text style={[s.appBadge, { color: colors.primaryDark }]} numberOfLines={1}>🛡️ UniSafe</Text>
            </View>
          </View>
          <View style={{ position: 'relative' }}>
            <TouchableOpacity onPress={() => navigation.navigate('SafetyAlerts')} style={[s.iconBtn, { backgroundColor: colors.surfaceGold, borderColor: colors.accent }]}>
              <MaterialIcons name="notifications" size={22} color={isDark ? colors.textPrimary : colors.primary} />
              {unread > 0 && (
                <View style={[s.badge, { backgroundColor: colors.sos }]}>
                  <Text style={s.badgeText}>{unread}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <Text style={[s.hello, { color: colors.textPrimary }, isSmall && { fontSize: 20 }]} numberOfLines={1}>Hello, {firstName} 👋</Text>
        <Text style={[s.subText, { color: colors.textMuted }]}>Stay safe on campus</Text>

        <TouchableOpacity style={[s.sosCard, { backgroundColor: colors.primary, shadowColor: colors.primary }]} onPress={() => navigation.navigate('SOS')} activeOpacity={0.85}>
          <View style={[s.sosGoldStripe, { backgroundColor: colors.accent }]} />
          <MaterialIcons name="sos" size={32} color={colors.accent} />
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={[s.sosTitle, isSmall && { fontSize: 16 }]}>EMERGENCY SOS</Text>
            <Text style={s.sosSub} numberOfLines={1}>Tap to request immediate help</Text>
          </View>
          <MaterialIcons name="chevron-right" size={24} color={colors.accent} />
        </TouchableOpacity>

        <View style={s.grid}>
          {ACTIONS.map(a => (
            <TouchableOpacity
              key={a.id}
              style={[s.actionCard, { width: cardWidth, backgroundColor: colors.surfaceCard, borderColor: colors.border, shadowColor: colors.shadow }]}
              onPress={() => navigation.navigate(a.screen)}
              activeOpacity={0.85}
            >
              <View style={[s.iconCircle, { backgroundColor: circleColor(a.id) }, isSmall && { height: 40 }]}>
                <MaterialIcons name={a.icon} size={isSmall ? 20 : 22} color={isDark ? '#0E0E0E' : '#fff'} />
              </View>
              <Text
                style={[s.actionLabel, { color: labelColor(a.id) }, isSmall && { fontSize: 11 }]}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root:       { flex: 1 },
  bgLayer:    { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  bgLogo:     {},
  container:  { flex: 1 },
  content:    { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 },

  headerRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 },
  uniName:    { fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
  appBadge:   { fontSize: 11, fontWeight: '700', marginTop: 2 },
  iconBtn:    { padding: 8, borderRadius: 20, borderWidth: 1 },
  badge:      { position: 'absolute', top: -2, right: -2, borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText:  { color: '#fff', fontSize: 10, fontWeight: '700' },

  hello:      { fontSize: 22, fontWeight: 'bold', marginBottom: 2 },
  subText:    { fontSize: 13, marginBottom: 16 },

  sosCard: {
    borderRadius: radius.lg, height: 96, flexDirection: 'row',
    alignItems: 'center', paddingHorizontal: 18, marginBottom: 18, overflow: 'hidden',
    elevation: 4, shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
  sosGoldStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 6 },
  sosTitle: { color: '#fff', fontSize: 17, fontWeight: 'bold', letterSpacing: 0.8 },
  sosSub:   { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },

  grid:        { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  actionCard: {
    marginBottom: 12,
    borderRadius: radius.lg,
    padding: 12,
    alignItems: 'stretch',
    minHeight: 100,
    justifyContent: 'center',
    borderWidth: 1.5,
    elevation: 1,
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  iconCircle:  { width: '100%', height: 46, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 8, paddingHorizontal: 14 },
  actionLabel: { fontSize: 12, fontWeight: '700', textAlign: 'center', alignSelf: 'center' },
});