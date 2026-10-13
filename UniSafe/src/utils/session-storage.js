import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'unisafe.session.v1';
const OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
let browserSession = null;
let queue = Promise.resolve();
function serial(operation) {
  const result = queue.then(operation);
  queue = result.catch(() => {});
  return result;
}
function valid(value) {
  return typeof value?.accessToken === 'string' && value.accessToken &&
    typeof value?.refreshToken === 'string' && value.refreshToken;
}
async function read() {
  if (Platform.OS === 'web') {
    // Browser sessions last only until this tab reloads.
    await AsyncStorage.multiRemove(['token', 'refreshToken']);
    return browserSession;
  }
  const saved = await SecureStore.getItemAsync(KEY, OPTIONS);
  if (saved) {
    let session;
    try { session = JSON.parse(saved); } catch { /* Invalid credentials fail closed. */ }
    if (valid(session)) {
      await AsyncStorage.multiRemove(['token', 'refreshToken']);
      return session;
    }
    await SecureStore.deleteItemAsync(KEY, OPTIONS);
    await AsyncStorage.multiRemove(['token', 'refreshToken']);
    return null;
  }
  const [accessToken, refreshToken] = await Promise.all([
    AsyncStorage.getItem('token'), AsyncStorage.getItem('refreshToken'),
  ]);
  const legacy = { accessToken, refreshToken };
  if (valid(legacy)) {
    // Delete plaintext only after secure persistence succeeds.
    await SecureStore.setItemAsync(KEY, JSON.stringify(legacy), OPTIONS);
    await AsyncStorage.multiRemove(['token', 'refreshToken']);
    return legacy;
  }
  await AsyncStorage.multiRemove(['token', 'refreshToken']);
  return null;
}
export const getToken = () => serial(async () => (await read())?.accessToken || '');
export const getRefreshToken = () => serial(async () => (await read())?.refreshToken || '');
export const storeTokens = session => serial(async () => {
  if (!valid(session)) throw new Error('Invalid authentication response. Please sign in again.');
  const pair = { accessToken: session.accessToken, refreshToken: session.refreshToken };
  if (Platform.OS === 'web') browserSession = pair;
  else await SecureStore.setItemAsync(KEY, JSON.stringify(pair), OPTIONS);
  await AsyncStorage.multiRemove(['token', 'refreshToken']);
});
export const clearTokens = () => serial(async () => {
  browserSession = null;
  if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(KEY, OPTIONS);
  await AsyncStorage.multiRemove(['token', 'refreshToken']);
});
