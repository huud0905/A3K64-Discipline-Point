function colorLuminance(value: string) {
  const match = String(value || '').match(/rgba?\(([^)]+)\)/i);
  if (!match) return null;
  const parts = match[1].split(',').map((part) => Number(part.trim()));
  if (parts.length < 3 || parts.some((part, index) => index < 3 && !Number.isFinite(part))) return null;
  const [r, g, b] = parts;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function classTheme() {
  const classText = [
    document.documentElement.className,
    document.body?.className,
    document.getElementById('root')?.className,
    document.querySelector('[data-theme]')?.getAttribute('data-theme') || '',
  ].join(' ').toLowerCase();

  if (/theme-light|light-mode|\blight\b/.test(classText)) return 'light';
  if (/theme-dark|dark-mode|\bdark\b/.test(classText)) return 'dark';
  return '';
}

function storageTheme() {
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) || '';
      const value = localStorage.getItem(key) || '';
      const source = `${key} ${value}`.toLowerCase();
      if (!/(theme|appearance|personalization|mode)/.test(source)) continue;
      if (/"light"|'light'|:\s*light|=light|\blight\b/.test(source)) return 'light';
      if (/"dark"|'dark'|:\s*dark|=dark|\bdark\b/.test(source)) return 'dark';
    }
  } catch {}
  return '';
}

function computedTheme() {
  const selectors = ['.win-root', '.desktop-root', '.desktop-shell', '.desktop', '.app-shell', '.app-root', '#root > *', '#root', 'body', 'html'];
  for (const selector of selectors) {
    const element = document.querySelector(selector) as HTMLElement | null;
    if (!element) continue;
    const styles = window.getComputedStyle(element);
    const colors = [styles.backgroundColor, styles.color];
    for (const color of colors) {
      const lum = colorLuminance(color);
      if (lum === null) continue;
      if (color === 'rgba(0, 0, 0, 0)' || color === 'transparent') continue;
      if (lum > 0.68) return 'light';
      if (lum < 0.35) return 'dark';
    }
  }

  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
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

const observer = new MutationObserver(syncOverlayTheme);
observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
if (document.body) observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });

window.addEventListener('storage', syncOverlayTheme);
window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', syncOverlayTheme);
window.setInterval(syncOverlayTheme, 600);
syncOverlayTheme();

export {};