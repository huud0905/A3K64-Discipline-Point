import { SESSION_KEY } from './core/auth';
import { preloadScoreboardFromGas } from './core/gas';

let started = false;
let startTimer = 0;

function hasLoginSession() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') as { user?: unknown; expiresAt?: number } | null;
    return Boolean(session?.user && (!session.expiresAt || session.expiresAt > Date.now()));
  } catch {
    return false;
  }
}

function startPreload(reason = 'idle') {
  if (started || typeof window === 'undefined') return;
  started = true;
  void preloadScoreboardFromGas().catch((error) => {
    started = false;
    console.warn(`[A3K64] preload scoreboard failed (${reason})`, error);
  });
}

function schedulePreload(delay = 450) {
  if (typeof window === 'undefined') return;
  window.clearTimeout(startTimer);
  startTimer = window.setTimeout(() => startPreload(hasLoginSession() ? 'session' : 'anonymous'), delay);
}

function installSessionHook() {
  const originalSetItem = Storage.prototype.setItem;
  if ((Storage.prototype.setItem as unknown as { __a3PreloadHooked?: boolean }).__a3PreloadHooked) return;

  const patched = function patchedSetItem(this: Storage, key: string, value: string) {
    originalSetItem.call(this, key, value);
    if (this === localStorage && key === SESSION_KEY) schedulePreload(80);
  };

  (patched as unknown as { __a3PreloadHooked?: boolean }).__a3PreloadHooked = true;
  Storage.prototype.setItem = patched;
}

if (typeof window !== 'undefined') {
  installSessionHook();

  if ('requestIdleCallback' in window) {
    (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback(() => schedulePreload(0), { timeout: 1800 });
  } else {
    schedulePreload(700);
  }

  window.addEventListener('focus', () => {
    if (!started) schedulePreload(250);
  });
}

export {};
