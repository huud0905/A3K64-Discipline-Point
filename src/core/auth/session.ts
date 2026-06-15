export const SESSION_KEY = 'a3k64-login-session-v1';
export const RESTORE_PATH_KEY = 'a3k64-restore-path';

export type SavedLoginSession<TUser = unknown> = {
  user: TUser;
  expiresAt: number;
  lastPath?: string;
};

export function readSavedLoginSession<TUser = unknown>(): SavedLoginSession<TUser> | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as SavedLoginSession<TUser> | null;
    if (!session?.user || !session.expiresAt || session.expiresAt < Date.now()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function saveRestorePath(path: string) {
  localStorage.setItem(RESTORE_PATH_KEY, path);
}

export function readRestorePath(fallback = '/desktop') {
  return localStorage.getItem(RESTORE_PATH_KEY) || fallback;
}

export function clearSavedLoginSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(RESTORE_PATH_KEY);
}
