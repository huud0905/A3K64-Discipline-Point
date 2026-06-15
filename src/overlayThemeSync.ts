import { getSystemTheme } from './core/theme';

function colorLuminance(value: string) {
  const match = String(value || '').match(/rgba?\(([^)]+)\)/i);
  if (!match) return null;
  const raw = match[1].split(',').map((part) => Number(part.trim()));
  if (raw.length < 3 || raw.slice(0, 3).some((part) => !Number.isFinite(part))) return null;
  const [r, g, b] = raw;
  const alpha = raw.length >= 4 && Number.isFinite(raw[3]) ? raw[3] : 1;
  if (alpha <= 0.05) return null;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function normalizeThemeText(value: string) {
  return String(value || '')
    .replace(/a3-overlay-(light|dark)/g, '')
    .replace(/a3-shot-[\w-]+/g, '')
    .toLowerCase();
}

function classTheme() {
  const nodes = [
    document.documentElement,
    document.body,
    document.getElementById('root'),
    document.querySelector('.win-root'),
    document.querySelector('.desktop-root'),
    document.querySelector('.desktop-shell'),
    document.querySelector('.scoreboard-app'),
    document.querySelector('[data-theme]'),
    document.querySelector('[data-mode]'),
    document.querySelector('[data-color-scheme]'),
  ].filter(Boolean) as Element[];

  const classText = normalizeThemeText(nodes.map((node) => [
    node.className,
    node.getAttribute('data-theme') || '',
    node.getAttribute('data-mode') || '',
    node.getAttribute('data-color-scheme') || '',
  ].join(' ')).join(' '));

  if (/theme-light|light-mode|mode-light|appearance-light|\blight\b/.test(classText)) return 'light';
  if (/theme-dark|dark-mode|mode-dark|appearance-dark|\bdark\b/.test(classText)) return 'dark';
  return '';
}

function storageTheme() {
  try {
    const strongKeys = ['theme', 'appearance', 'mode', 'colorScheme', 'color-scheme', 'a3-theme', 'a3k64-theme', 'desktop-theme', 'personalization'];
    for (const key of strongKeys) {
      const value = localStorage.getItem(key);
      if (!value) continue;
      const source = normalizeThemeText(`${key} ${value}`);
      if (/"light"|'light'|:\s*light|=light|\blight\b/.test(source)) return 'light';
      if (/"dark"|'dark'|:\s*dark|=dark|\bdark\b/.test(source)) return 'dark';
    }

    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) || '';
      const value = localStorage.getItem(key) || '';
      const source = normalizeThemeText(`${key} ${value}`);
      if (!/(theme|appearance|personalization|mode|scheme)/.test(source)) continue;
      if (/"light"|'light'|:\s*light|=light|\blight\b/.test(source)) return 'light';
      if (/"dark"|'dark'|:\s*dark|=dark|\bdark\b/.test(source)) return 'dark';
    }
  } catch {}
  return '';
}

function computedTheme() {
  const selectors = [
    '.win-window:not(.minimized)',
    '.scoreboard-app',
    '.desktop-root',
    '.desktop-shell',
    '.desktop',
    '.app-shell',
    '.app-root',
    '#root > *',
    '#root',
    'body',
    'html',
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector) as HTMLElement | null;
    if (!element) continue;
    const styles = window.getComputedStyle(element);
    const lum = colorLuminance(styles.backgroundColor);
    if (lum === null) continue;
    if (lum > 0.56) return 'light';
    if (lum < 0.42) return 'dark';
  }

  const bodyLum = colorLuminance(window.getComputedStyle(document.body).backgroundColor);
  if (bodyLum !== null) return bodyLum > 0.56 ? 'light' : 'dark';

  return getSystemTheme();
}

function detectOverlayTheme() {
  return classTheme() || storageTheme() || computedTheme();
}

function syncOverlayTheme() {
  const theme = detectOverlayTheme();
  const root = document.documentElement;
  root.classList.toggle('a3-overlay-light', theme === 'light');
  root.classList.toggle('a3-overlay-dark', theme !== 'light');
  root.dataset.a3OverlayTheme = theme === 'light' ? 'light' : 'dark';
}

function loadSeatingSelfHighlightLightScript() {
  if (document.getElementById('a3k64-seating-self-highlight-light-script')) return;
  const script = document.createElement('script');
  script.id = 'a3k64-seating-self-highlight-light-script';
  script.src = '/seating-self-highlight-light.js';
  script.defer = true;
  document.head.appendChild(script);
}

function loadSeatingAdminViewCss() {
  if (document.getElementById('a3k64-seating-admin-view-css')) return;
  const link = document.createElement('link');
  link.id = 'a3k64-seating-admin-view-css';
  link.rel = 'stylesheet';
  link.href = '/seating-admin-view.css';
  document.head.appendChild(link);
}

const observer = new MutationObserver(syncOverlayTheme);
observer.observe(document.documentElement, { attributes: true, childList: true, subtree: true, attributeFilter: ['class', 'data-theme', 'data-mode', 'data-color-scheme', 'style'] });
if (document.body) observer.observe(document.body, { attributes: true, childList: true, subtree: true, attributeFilter: ['class', 'data-theme', 'data-mode', 'data-color-scheme', 'style'] });

window.addEventListener('storage', syncOverlayTheme);
window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', syncOverlayTheme);
window.setInterval(syncOverlayTheme, 300);
syncOverlayTheme();
loadSeatingSelfHighlightLightScript();
loadSeatingAdminViewCss();

export {};
