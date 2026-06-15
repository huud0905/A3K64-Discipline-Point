export type ThemeMode = 'dark' | 'light' | 'auto';
export type ResolvedTheme = 'dark' | 'light';

export const DEFAULT_ACCENTS: Record<string, string> = {
  blue: '#2563eb',
  violet: '#7c3aed',
  pink: '#db2777',
  green: '#059669',
  amber: '#d97706',
  red: '#dc2626',
};

export function normalizeThemeMode(value: string | null | undefined): ThemeMode | null {
  if (!value) return null;
  const normalized = value.toLowerCase().trim();
  if (['light', 'sang', 'sáng'].includes(normalized)) return 'light';
  if (['dark', 'toi', 'tối'].includes(normalized)) return 'dark';
  if (['auto', 'system', 'he-thong', 'hệ thống', 'hethong'].includes(normalized)) return 'auto';
  return null;
}

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode === 'auto' ? getSystemTheme() : mode;
}

export function isHexColor(value: string | null | undefined) {
  return !!value && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

export function normalizeHexColor(value: string | null | undefined) {
  if (!value) return null;
  const raw = value.trim();
  if (!isHexColor(raw)) return DEFAULT_ACCENTS[raw.toLowerCase()] || null;
  const body = raw.slice(1);
  return body.length === 3 ? `#${body.split('').map((x) => x + x).join('')}`.toLowerCase() : raw.toLowerCase();
}

export function readThemeFromStorage(keys: string[], fallback: ThemeMode = 'dark') {
  if (typeof localStorage === 'undefined') return fallback;
  for (const key of keys) {
    const mode = normalizeThemeMode(localStorage.getItem(key));
    if (mode) return mode;
  }
  return fallback;
}

export function readAccentFromStorage(keys: string[], fallback = DEFAULT_ACCENTS.blue) {
  if (typeof localStorage === 'undefined') return fallback;
  for (const key of keys) {
    const color = normalizeHexColor(localStorage.getItem(key));
    if (color) return color;
  }
  return fallback;
}

export function setRootAccent(color: string, cssVarName = '--desktop-accent') {
  if (typeof document === 'undefined') return;
  const normalized = normalizeHexColor(color) || DEFAULT_ACCENTS.blue;
  document.documentElement.style.setProperty(cssVarName, normalized);
}
