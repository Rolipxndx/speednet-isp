import { createContext, useContext, useEffect, useState } from 'react';
import { hexToHSLString } from '@/lib/colorUtils';

type Mode = 'light' | 'dark' | 'system';

type ThemeContextType = {
  mode: Mode;
  setMode: (m: Mode) => void;
  primaryColor: string;
  setPrimaryColor: (c: string) => void;
};

const ThemeContext = createContext<ThemeContextType>({} as ThemeContextType);

export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>(() => {
    return (localStorage.getItem('theme-mode') as Mode) || 'system';
  });
  const [primaryColor, setPrimaryColor] = useState<string>(() => {
    return localStorage.getItem('theme-primary') || '#2563eb';
  });

  // Efecto para modo claro/oscuro/sistema
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    
    if (mode === 'light') {
      root.classList.add('light');
    } else if (mode === 'dark') {
      root.classList.add('dark');
    } else {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      root.classList.toggle('dark', mediaQuery.matches);
      
      const listener = (e: MediaQueryListEvent) => root.classList.toggle('dark', e.matches);
      mediaQuery.addEventListener('change', listener);
      
      return () => mediaQuery.removeEventListener('change', listener);
    }
    localStorage.setItem('theme-mode', mode);
  }, [mode]);

  // Aplicar color primario (con ajuste automático en modo oscuro)
  useEffect(() => {
    const root = document.documentElement;
    const isDark = root.classList.contains('dark');
    // En oscuro aclaramos un 25% para mantener contraste
    const hsl = isDark ? adjustLightness(primaryColor, 25) : hexToHSLString(primaryColor);
    root.style.setProperty('--primary', hsl);
    root.style.setProperty('--primary-color', primaryColor);
    localStorage.setItem('theme-primary', primaryColor);
  }, [primaryColor, mode]);

  return (
    <ThemeContext.Provider value={{ mode, setMode, primaryColor, setPrimaryColor }}>
      {children}
    </ThemeContext.Provider>
  );
}

// Función auxiliar para aclarar un color hex
function adjustLightness(hex: string, amount: number): string {
  const { h, s, l } = hexToHSL(hex);
  const newL = Math.min(100, Math.max(0, l + amount));
  return `${h} ${s}% ${newL}%`;
}

// Helpers duplicados para autonomía del contexto
function hexToHSL(hex: string): { h: number; s: number; l: number } {
  hex = hex.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}