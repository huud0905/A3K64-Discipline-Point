import type { GasLoginUser } from './gasApi';

const GAS_URL = import.meta.env.VITE_GAS_WEB_APP_URL?.trim();
const JSONP_TIMEOUT_MS = 25000;

type RawGasResponse = { ok?: boolean; error?: string; data?: any; user?: any; [key: string]: any };

function asText(value: unknown, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function gasJsonp(action: string, payload?: unknown): Promise<RawGasResponse | null> {
  if (!GAS_URL || typeof document === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const callbackName = `__a3k64GoogleLogin_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    const url = new URL(GAS_URL);
    const callbacks = window as typeof window & Record<string, unknown>;
    let done = false;
    let timeoutId = 0;

    const finish = (value: RawGasResponse | null, keepLateNoop = false) => {
      if (done) return;
      done = true;
      window.clearTimeout(timeoutId);
      script.onerror = null;
      if (keepLateNoop) {
        callbacks[callbackName] = () => undefined;
        window.setTimeout(() => delete callbacks[callbackName], 60000);
      } else {
        delete callbacks[callbackName];
      }
      script.remove();
      resolve(value);
    };

    url.searchParams.set('action', action);
    url.searchParams.set('callback', callbackName);
    url.searchParams.set('t', String(Date.now()));
    if (payload !== undefined) url.searchParams.set('payload', JSON.stringify(payload));

    callbacks[callbackName] = (json: RawGasResponse) => finish(json);
    script.onerror = () => finish(null, true);
    timeoutId = window.setTimeout(() => finish(null, true), JSONP_TIMEOUT_MS);
    script.src = url.toString();
    document.head.appendChild(script);
  });
}

function normalizeUser(raw: any, fallbackEmail: string, googleProfile?: Partial<GasLoginUser>): GasLoginUser | null {
  if (!raw) return null;
  return {
    uid: asText(raw.uid, `google-${fallbackEmail}`),
    displayName: asText(raw.displayName ?? raw.name ?? raw.hoten, googleProfile?.displayName || fallbackEmail),
    email: asText(raw.email ?? raw.username, fallbackEmail).toLowerCase(),
    photoURL: asText(raw.photoURL, googleProfile?.photoURL || '') || null,
    provider: 'google',
    role: asText(raw.role, 'hoc_sinh'),
    group: asText(raw.group ?? raw.to),
  };
}

export async function validateGoogleLoginWithGas(googleProfile: Partial<GasLoginUser>): Promise<GasLoginUser | null> {
  const email = asText(googleProfile.email).toLowerCase();
  if (!email) return null;
  const response = await gasJsonp('googleLogin', {
    email,
    uid: googleProfile.uid,
    displayName: googleProfile.displayName,
    photoURL: googleProfile.photoURL,
    provider: 'google',
  });
  const data = response?.data || response;
  if (!data?.ok || !data.user) return null;
  return normalizeUser(data.user, email, googleProfile);
}
