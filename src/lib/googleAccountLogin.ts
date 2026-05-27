import type { GasLoginUser } from './gasApi';

const GAS_URL = import.meta.env.VITE_GAS_WEB_APP_URL?.trim();
const JSONP_TIMEOUT_MS = 25000;

type RawGasResponse = { ok?: boolean; error?: string; message?: string; data?: any; user?: any; [key: string]: any };

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
    displayName: asText(raw.displayName ?? raw.name ?? raw.hoten ?? raw.fullName, googleProfile?.displayName || fallbackEmail),
    email: asText(raw.email ?? raw.username ?? raw.gmail, fallbackEmail).toLowerCase(),
    photoURL: asText(raw.photoURL, googleProfile?.photoURL || '') || null,
    provider: 'google',
    role: asText(raw.role, 'hoc_sinh'),
    group: asText(raw.group ?? raw.to ?? raw.group_num),
  };
}

function extractUser(response: RawGasResponse | null, fallbackEmail: string, googleProfile: Partial<GasLoginUser>) {
  if (!response) return null;
  const data = response.data || response;
  const nested = data.data || data;
  const user = nested.user || data.user || response.user;
  const ok = nested.ok === true || data.ok === true || response.ok === true;
  if (!ok || !user) return null;
  return normalizeUser(user, fallbackEmail, googleProfile);
}

function responseError(response: RawGasResponse | null) {
  if (!response) return 'Không nhận được phản hồi từ Google Apps Script.';
  const data = response.data || response;
  const nested = data.data || data;
  return asText(nested.error || data.error || response.error || nested.message || data.message || response.message);
}

export async function validateGoogleLoginWithGas(googleProfile: Partial<GasLoginUser>): Promise<GasLoginUser | null> {
  const email = asText(googleProfile.email).toLowerCase();
  if (!email) throw new Error('Google không trả về Gmail.');

  const payload = {
    email,
    googleEmail: email,
    username: email,
    uid: googleProfile.uid,
    displayName: googleProfile.displayName,
    photoURL: googleProfile.photoURL,
    provider: 'google',
  };

  const actions = ['googleLogin', 'loginWithGoogleEmail'];
  const errors: string[] = [];

  for (const action of actions) {
    const response = await gasJsonp(action, payload);
    const user = extractUser(response, email, googleProfile);
    if (user) return user;
    const err = responseError(response);
    if (err && !/GAS API is running/i.test(err)) errors.push(`${action}: ${err}`);
  }

  if (errors.length) throw new Error(errors[errors.length - 1]);
  throw new Error('Backend chưa expose action googleLogin/loginWithGoogleEmail, hoặc Gmail chưa trùng với ACCOUNTS.');
}
