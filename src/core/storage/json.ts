export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function readJsonStorage<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  return safeJsonParse<T>(localStorage.getItem(key), fallback);
}

export function writeJsonStorage<T>(key: string, value: T) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
}

export function removeStorageKeys(...keys: string[]) {
  if (typeof localStorage === 'undefined') return;
  keys.forEach((key) => localStorage.removeItem(key));
}
