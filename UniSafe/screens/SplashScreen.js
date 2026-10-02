import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, ActivityIndicator, StyleSheet, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../src/ThemeContext';
import { api } from '../src/utils/api';

export default function SplashScreen({ navigation }) {
  const { colors } = useTheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 5, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        if (token) await api.me();
        navigation.replace(token ? 'Home' : 'Login');
      } catch {
        navigation.replace('Login');
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.primary }]}>
      <View style={[styles.goldBar, { backgroundColor: colors.accent }]} />
      <View style={[styles.goldBarBottom, { backgroundColor: colors.accent }]} />

      <Animated.View style={{ alignItems: 'center', opacity: fadeAnim, transform: [{ scale: scaleAnim }] }}>
        <View style={[styles.iconBox, { backgroundColor: colors.surfaceCard, borderColor: colors.accent }]}>
          <Image source={require('../assets/uot-logo-shield.png')} style={styles.logo} resizeMode="contain" />
        </View>
        <Text style={styles.title}>UniSafe</Text>
        <View style={[styles.titleUnderline, { backgroundColor: colors.accent }]} />
        <Text style={styles.subtitle}>Campus Security & Emergency Response</Text>
        <Text style={styles.university}>Papua New Guinea{'\n'}University of Technology</Text>
      </Animated.View>
      <ActivityIndicator color={colors.accent} size="small" style={styles.loader} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  goldBar:      { position: 'absolute', top: 0, left: 0, right: 0, height: 6 },
  goldBarBottom:{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 6 },
  iconBox: {
    width: 110, height: 110, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
    borderWidth: 3,
  },
  logo:     { width: 90, height: 90 },
  title:    { color: '#fff', fontSize: 32, fontWeight: 'bold', letterSpacing: 4, marginBottom: 6 },
  titleUnderline: { width: 60, height: 3, borderRadius: 2, marginBottom: 12 },
  subtitle:    { color: 'rgba(255,255,255,0.85)', fontSize: 13, textAlign: 'center', marginBottom: 10, letterSpacing: 0.5 },
  university:  { color: 'rgba(255,255,255,0.65)', fontSize: 12, textAlign: 'center', paddingHorizontal: 32, lineHeight: 18 },
  loader:      { position: 'absolute', bottom: 60 },
});
