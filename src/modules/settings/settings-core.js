/* ═══════════════════════════════════════════════════════
   SETTINGS CORE — state, localStorage helpers, accent /
   theme / taskbar read-write, scale, icon defs.
   Không phụ thuộc DOM — chạy trước mọi file khác.
   A3K64 © 2025
   ═══════════════════════════════════════════════════════ */

// ─── DOM helpers ─────────────────────────────────────
const $ = (s, ctx = document) => ctx.querySelector(s);
const $$ = (s, ctx = document) => [...ctx.querySelectorAll(s)];

// ─── Safe localStorage ───────────────────────────────
const ls = {
  get:  k => { try { return localStorage.getItem(k); } catch { return null; } },
  set:  (k, v) => { try { localStorage.setItem(k, String(v)); } catch {} },
  json: k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
};

// ─── SVG helper ──────────────────────────────────────
function svg(path, size = 20) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

const ICONS = {
  palette:      `<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c1.1 0 2-.9 2-2 0-.53-.21-1.01-.54-1.37-.31-.33-.5-.77-.5-1.26 0-.97.78-1.37 1.37-1.37H16c2.76 0 5-2.24 5-5 0-4.97-4.03-9-9-9z"/><circle cx="6.5" cy="11.5" r="1.5"/><circle cx="9.5" cy="7.5" r="1.5"/><circle cx="14.5" cy="7.5" r="1.5"/><circle cx="17.5" cy="11.5" r="1.5"/>`,
  wallpaper:    `<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>`,
  monitor:      `<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>`,
  info:         `<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>`,
  settings:     `<circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>`,
  chevronRight: `<path d="m9 18 6-6-6-6"/>`,
  chevronLeft:  `<path d="m15 18-6-6 6-6"/>`,
  check:        `<path d="M20 6 9 17l-5-5"/>`,
  search:       `<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>`,
  upload:       `<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>`,
  sparkles:     `<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3z"/>`,
  cloud:        `<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/>`,
  spinner:      `<path d="M21 12a9 9 0 1 1-6.219-8.56"/>`,
};

// ─── Accent ──────────────────────────────────────────
const PRESET_ACCENTS = {
  blue: '#2563eb', violet: '#7c3aed', pink: '#db2777',
  green: '#059669', amber: '#d97706', red: '#dc2626',
};

const SWATCH_PALETTE = [
  '#fbbf24','#fb923c','#f97316','#ea580c','#dc2626','#ef4444','#f43f5e','#e11d48',
  '#0ea5e9','#0284c7','#6366f1','#8b5cf6','#a855f7','#9333ea','#06b6d4','#0891b2',
  '#14b8a6','#10b981','#059669','#16a34a','#15803d','#64748b','#52525b','#78716c',
];

function normalizeHex(v) {
  if (!v) return null;
  const raw = v.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) {
    const body = raw.slice(1);
    return body.length === 3 ? '#' + body.split('').map(x => x + x).join('') : raw.toLowerCase();
  }
  return PRESET_ACCENTS[raw.toLowerCase()] || null;
}

function readAccent() {
  const keys = ['desktop-accent','desktop-accent-color','login-accent-color','accent-color','login-custom-accent','custom-accent'];
  for (const k of keys) { const c = normalizeHex(ls.get(k)); if (c) return c; }
  return PRESET_ACCENTS.blue;
}

function saveAccentLocal(color) {
  const normalized = normalizeHex(color) || PRESET_ACCENTS.blue;
  const match = Object.entries(PRESET_ACCENTS).find(([, v]) => v === normalized);
  const key = match ? match[0] : 'custom';
  const storage = {
    'desktop-accent': normalized, 'desktop-accent-color': normalized,
    'desktop-custom-accent': normalized, 'login-accent': key,
    'login-accent-color': normalized, 'login-custom-accent': normalized,
    'custom-accent': normalized, 'customAccent': normalized,
    'accent-color': normalized, 'accent': key,
  };
  for (const [k, v] of Object.entries(storage)) ls.set(k, v);
  document.documentElement.style.setProperty('--accent', normalized);
  try { window.parent.document.documentElement.style.setProperty('--desktop-accent', normalized); } catch {}
  window.dispatchEvent(new Event('accent-change'));
  window.dispatchEvent(new Event('appearance-change'));
  return normalized;
}

// ─── Theme ───────────────────────────────────────────
const THEME_LABELS = { dark: 'Tối', light: 'Sáng', auto: 'Tự động' };

function readTheme() {
  const raw = (ls.get('desktop-theme') || ls.get('login-theme') || ls.get('theme-mode') || 'dark').toLowerCase();
  return ['dark','light','auto'].includes(raw) ? raw : 'dark';
}

function applyTheme(mode) {
  const resolved = mode === 'auto'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : mode;
  document.documentElement.setAttribute('data-theme', resolved);
  ['desktop-theme','login-theme','login-theme-mode','theme-mode','theme','a3k64-theme'].forEach(k => ls.set(k, mode));
  try { window.parent.document.documentElement.setAttribute('data-theme', resolved); } catch {}
  try {
    const p = window.parent;
    if (p && p !== window && typeof p.readTheme === 'function' && typeof p.applyThemeClass === 'function') {
      p.resolvedTheme = p.readTheme();
      p.applyThemeClass();
    }
  } catch {}
  window.dispatchEvent(new Event('desktop-theme-change'));
  window.dispatchEvent(new Event('appearance-change'));
}

// ─── Taskbar ─────────────────────────────────────────
const DEFAULT_TB = { searchMode: 'box', taskView: true, widgets: false, resume: true, alignment: 'center', autoHide: false, badges: true };

function readTB() { return { ...DEFAULT_TB, ...(ls.json('taskbar-settings') || {}) }; }

function saveTBLocal(settings) {
  ls.set('taskbar-settings', JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent('taskbar-settings-change', { detail: settings }));
  try { window.parent.dispatchEvent(new CustomEvent('taskbar-settings-change', { detail: settings })); } catch {}
}

// ─── User session ────────────────────────────────────
function readUser() {
  try { return JSON.parse(sessionStorage.getItem('a3k64-user') || 'null'); } catch { return null; }
}

// ─── Display scale ───────────────────────────────────
function applyScaleToWin(win, scale) {
  const doc = win.document;
  const ratio = scale / 100;
  const root = doc.getElementById('desktop-root') || doc.body;
  doc.documentElement.style.setProperty('--a3-display-scale', ratio);
  if (ratio === 1) {
    root.style.transform = '';
    root.style.transformOrigin = '';
    root.style.width = '';
    root.style.height = '';
    root.style.minHeight = '';
  } else {
    const w = win.innerWidth  / ratio;
    const h = win.innerHeight / ratio;
    root.style.transformOrigin = 'top left';
    root.style.transform = `scale(${ratio})`;
    root.style.width  = `${w}px`;
    root.style.height = `${h}px`;
    root.style.minHeight = `${h}px`;
  }
}

function applyScale(scale) {
  ls.set('a3k64-display-scale', scale);
  try { applyScaleToWin(window.parent, scale); } catch {}
  window.dispatchEvent(new CustomEvent('a3k64-display-scale-change', { detail: { scale } }));
}

// ─── App state ───────────────────────────────────────
let currentPage = 'home';
let accent = readAccent();
let theme  = readTheme();
let tb     = readTB();
let recentAccents = (() => { try { return (JSON.parse(ls.get('recent-accents') || '[]')).filter(c => normalizeHex(c)); } catch { return []; } })(); // filter: chỉ giữ hex hợp lệ, phòng localStorage bị chỉnh tay inject vào onclick