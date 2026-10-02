import React, { createContext, useContext, useEffect, useState } from 'react';
import { StatusBar } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { palettes } from './theme';

const THEME_KEY = 'appTheme';
const ThemeContext = createContext({
  mode: 'light',
  colors: palettes.light,
  isDark: false,
  toggle: () => {},
  setMode: () => {},
});

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState('light');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then(saved => {
      if (saved === 'light' || saved === 'dark') setMode(saved);
      setReady(true);
    });
  }, []);

  const update = (next) => {
    setMode(next);
    AsyncStorage.setItem(THEME_KEY, next);
  };

  const value = {
    mode,
    colors: palettes[mode],
    isDark: mode === 'dark',
    toggle: () => update(mode === 'light' ? 'dark' : 'light'),
    setMode: update,
    ready,
  };

  return (
    <ThemeContext.Provider value={value}>
      <StatusBar barStyle={palettes[mode].statusBar} backgroundColor={palettes[mode].surface} />
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
