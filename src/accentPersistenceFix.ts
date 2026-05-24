const ACCENT_COLORS: Record<string, string> = {
  blue: '#2563eb',
  violet: '#7c3aed',
  pink: '#db2777',
  green: '#059669',
  amber: '#d97706',
  red: '#dc2626',
};

const COLOR_KEYS = [
  'login-accent-color',
  'desktop-accent',
  'desktop-accent-color',
  'accent-color',
  'login-custom-accent',
  'custom-accent',
  'customAccent',
  'desktop-custom-accent',
];

function isHex(value: string | null | undefined) {
  return !!value && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

function expandHex(value: string) {
  const raw = value.trim().replace('#', '');
  if (raw.length === 3) return `#${raw.split('').map((item) => item + item).join('')}`.toLowerCase();
  return `#${raw}`.toLowerCase();
}

function namedColor(key: string | null) {
  return key ? ACCENT_COLORS[key.toLowerCase()] || null : null;
}

function readFirstColor() {
  for (const key of COLOR_KEYS) {
    const value = localStorage.getItem(key);
    if (isHex(value)) return expandHex(value as string);
  }
  return null;
}

function bestAccentColor() {
  const loginAccent = localStorage.getItem('login-accent');
  const named = namedColor(loginAccent);
  const directLogin = isHex(loginAccent) ? expandHex(loginAccent as string) : null;
  const storedColor = readFirstColor();

  if (directLogin) return directLogin;

  // Important: Login.tsx can mount before auto-login and write login-accent=blue.
  // If a real color key still contains the user's custom color, keep that instead of resetting to blue.
  if (named && storedColor && storedColor.toLowerCase() !== named.toLowerCase()) return storedColor;
  if (named) return named;
  if (loginAccent?.toLowerCase() === 'custom' && storedColor) return storedColor;
  return storedColor;
}

let applying = false;

function writeAccent(color: string) {
  const normalized = expandHex(color);
  const matchedName = Object.entries(ACCENT_COLORS).find(([, value]) => value.toLowerCase() === normalized.toLowerCase())?.[0];
  const currentLoginAccent = localStorage.getItem('login-accent');
  const currentNamed = namedColor(currentLoginAccent);
  const shouldForceCustom = currentNamed && currentNamed.toLowerCase() !== normalized.toLowerCase();
  const accentKey = shouldForceCustom ? 'custom' : matchedName || 'custom';

  applying = true;
  try {
    localStorage.setItem('login-accent', accentKey);
    localStorage.setItem('accent', accentKey);
    localStorage.setItem('login-accent-color', normalized);
    localStorage.setItem('login-custom-accent', normalized);
    localStorage.setItem('desktop-accent', normalized);
    localStorage.setItem('desktop-accent-color', normalized);
    localStorage.setItem('desktop-custom-accent', normalized);
    localStorage.setItem('custom-accent', normalized);
    localStorage.setItem('customAccent', normalized);
    localStorage.setItem('accent-color', normalized);
    localStorage.setItem('a3k64-personalization-local-updated-at', String(Date.now()));
    localStorage.setItem('a3k64-login-look-dirty-v1', '1');
    document.documentElement.style.setProperty('--desktop-accent', normalized);
  } finally {
    applying = false;
  }
}

function syncAccentNow() {
  if (applying || typeof window === 'undefined') return;
  const color = bestAccentColor();
  if (!color) return;
  const currentRoot = getComputedStyle(document.documentElement).getPropertyValue('--desktop-accent').trim();
  const currentDesktop = localStorage.getItem('desktop-accent');
  const currentLoginColor = localStorage.getItem('login-accent-color');
  const currentLoginAccent = localStorage.getItem('login-accent');
  const named = namedColor(currentLoginAccent);
  const loginWouldOverride = Boolean(named && named.toLowerCase() !== color.toLowerCase());

  if (currentRoot.toLowerCase() !== color.toLowerCase()) {
    document.documentElement.style.setProperty('--desktop-accent', color);
  }

  if (loginWouldOverride || currentDesktop?.toLowerCase() !== color.toLowerCase() || currentLoginColor?.toLowerCase() !== color.toLowerCase()) {
    writeAccent(color);
    window.dispatchEvent(new Event('accent-change'));
    window.dispatchEvent(new Event('login-accent-change'));
    window.dispatchEvent(new Event('appearance-change'));
  }
}

function scheduleSync() {
  window.setTimeout(syncAccentNow, 0);
  window.setTimeout(syncAccentNow, 80);
  window.setTimeout(syncAccentNow, 300);
  window.setTimeout(syncAccentNow, 1000);
}

if (typeof window !== 'undefined') {
  scheduleSync();
  window.addEventListener('storage', scheduleSync);
  window.addEventListener('accent-change', scheduleSync);
  window.addEventListener('login-accent-change', scheduleSync);
  window.addEventListener('appearance-change', scheduleSync);
  window.addEventListener('personalization-sync-applied', scheduleSync);
  window.setInterval(syncAccentNow, 1500);
}

export {};
