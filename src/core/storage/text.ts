export function readTextStorage(key: string, fallback = '') {
  if (typeof localStorage === 'undefined') return fallback;
  return localStorage.getItem(key) ?? fallback;
}

export function writeTextStorage(key: string, value: string | number | boolean) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(key, String(value));
}

export function readNumberStorage(key: string, fallback = 0) {
  const value = Number(readTextStorage(key, String(fallback)));
  return Number.isFinite(value) ? value : fallback;
}
