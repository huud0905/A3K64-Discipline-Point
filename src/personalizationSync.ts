type ThemeMode = "dark" | "light" | "auto";
type AccentKey = "blue" | "violet" | "pink" | "green" | "amber" | "red" | "custom";

type SessionUser = {
  uid?: string;
  email?: string | null;
  displayName?: string | null;
  hoten?: string | null;
  name?: string | null;
};

type SavedSession = { user?: SessionUser; expiresAt?: number };

type PersonalizationPayload = {
  version: 2;
  theme?: ThemeMode;
  accentKey?: AccentKey;
  accentColor?: string;
  customAccent?: string;
  taskbarSettings?: unknown;
  pinnedApps?: string[];
  recentAccents?: string[];
  desktopTransparency?: "on" | "off";
  accentTaskbar?: "on" | "off";
  accentBorders?: "on" | "off";
  updatedAt?: string;
};

type GasResponse = { ok?: boolean; error?: string; data?: any; [key: string]: any };

const GAS_URL = import.meta.env.VITE_GAS_WEB_APP_URL?.trim();
const SESSION_KEY = "a3k64-login-session-v1";
const LOGIN_LOOK_DIRTY_KEY = "a3k64-login-look-dirty-v1";
const QUIET_UNTIL_KEY = "a3k64-personalization-quiet-until";
const JSONP_TIMEOUT_MS = 9000;

const ACCENT_COLORS: Record<string, string> = {
  blue: "#2563eb",
  violet: "#7c3aed",
  pink: "#db2777",
  green: "#059669",
  amber: "#d97706",
  red: "#dc2626",
};

const PERSONALIZATION_KEYS = new Set([
  "taskbar-settings",
  "pinned-apps",
  "desktop-theme",
  "login-theme",
  "login-theme-mode",
  "theme-mode",
  "theme",
  "app-theme",
  "color-mode",
  "login-accent",
  "login-accent-color",
  "login-custom-accent",
  "desktop-accent",
  "desktop-accent-color",
  "accent-color",
  "accent",
  "custom-accent",
  "customAccent",
  "desktop-custom-accent",
  "recent-accents",
  "desktop-transparency",
  "accent-taskbar",
  "accent-borders",
]);

let booted = false;
let activeAccount = "";
let saveTimer = 0;
let suppressCapture = false;
let lastSavedJson = "";
let remoteDisabled = false;

function safeJson<T>(value: string | null, fallback: T): T {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function isHex(value: string | null | undefined) {
  return !!value && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

function normTheme(value: string | null): ThemeMode | undefined {
  const raw = text(value).toLowerCase();
  return raw === "dark" || raw === "light" || raw === "auto" ? raw : undefined;
}

function normAccent(value: string | null): AccentKey | undefined {
  const raw = text(value).toLowerCase();
  return ["blue", "violet", "pink", "green", "amber", "red", "custom"].includes(raw) ? (raw as AccentKey) : undefined;
}

function quietForAWhile() {
  remoteDisabled = true;
  localStorage.setItem(QUIET_UNTIL_KEY, String(Date.now() + 10 * 60 * 1000));
}

function isQuiet() {
  const until = Number(localStorage.getItem(QUIET_UNTIL_KEY) || 0);
  if (until > Date.now()) return true;
  if (until) localStorage.removeItem(QUIET_UNTIL_KEY);
  return false;
}

function loginLookWasChanged() {
  return localStorage.getItem(LOGIN_LOOK_DIRTY_KEY) === "1";
}

function clearLoginLookChanged() {
  localStorage.removeItem(LOGIN_LOOK_DIRTY_KEY);
}

function readSession(): SavedSession | null {
  const session = safeJson<SavedSession | null>(localStorage.getItem(SESSION_KEY), null);
  if (!session?.user || !session.expiresAt || session.expiresAt < Date.now()) return null;
  return session;
}

function accountId(user?: SessionUser | null) {
  return text(user?.email || user?.uid).toLowerCase();
}

function displayName(user?: SessionUser | null) {
  return text(user?.displayName || user?.hoten || user?.name || user?.email || user?.uid);
}

function loginLook(): Partial<PersonalizationPayload> {
  const theme = normTheme(localStorage.getItem("login-theme")) || normTheme(localStorage.getItem("theme-mode"));
  const accentKey = normAccent(localStorage.getItem("login-accent")) || normAccent(localStorage.getItem("accent"));
  const customAccent = localStorage.getItem("login-custom-accent") || localStorage.getItem("desktop-custom-accent") || undefined;
  const named = accentKey && accentKey !== "custom" ? ACCENT_COLORS[accentKey] : undefined;
  const accentColor = [localStorage.getItem("login-accent-color"), customAccent, localStorage.getItem("desktop-accent"), named].find(isHex);
  return {
    ...(theme ? { theme } : {}),
    ...(accentKey ? { accentKey } : {}),
    ...(accentColor ? { accentColor } : {}),
    ...(customAccent && isHex(customAccent) ? { customAccent } : {}),
  };
}

function collectPrefs(): PersonalizationPayload {
  return {
    version: 2,
    ...loginLook(),
    taskbarSettings: safeJson(localStorage.getItem("taskbar-settings"), undefined),
    pinnedApps: safeJson(localStorage.getItem("pinned-apps"), []),
    recentAccents: safeJson(localStorage.getItem("recent-accents"), []),
    desktopTransparency: localStorage.getItem("desktop-transparency") === "off" ? "off" : "on",
    accentTaskbar: localStorage.getItem("accent-taskbar") === "on" ? "on" : "off",
    accentBorders: localStorage.getItem("accent-borders") === "on" ? "on" : "off",
    updatedAt: new Date().toISOString(),
  };
}

function setLocal(key: string, value: unknown) {
  if (value === undefined || value === null) return;
  localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
}

function applyPrefs(prefs?: Partial<PersonalizationPayload> | null) {
  if (!prefs) return;
  suppressCapture = true;
  try {
    if (prefs.theme) {
      setLocal("desktop-theme", prefs.theme);
      setLocal("login-theme", prefs.theme);
      setLocal("login-theme-mode", prefs.theme);
      setLocal("theme-mode", prefs.theme);
      setLocal("theme", prefs.theme);
    }
    if (prefs.accentKey) {
      setLocal("login-accent", prefs.accentKey);
      setLocal("accent", prefs.accentKey);
    }
    const color = prefs.accentColor || prefs.customAccent || (prefs.accentKey ? ACCENT_COLORS[prefs.accentKey] : "");
    if (isHex(color)) {
      setLocal("desktop-accent", color);
      setLocal("desktop-accent-color", color);
      setLocal("login-accent-color", color);
      setLocal("login-custom-accent", color);
      setLocal("accent-color", color);
    }
    if (prefs.taskbarSettings) setLocal("taskbar-settings", prefs.taskbarSettings);
    if (Array.isArray(prefs.pinnedApps)) setLocal("pinned-apps", prefs.pinnedApps);
    if (Array.isArray(prefs.recentAccents)) setLocal("recent-accents", prefs.recentAccents);
    if (prefs.desktopTransparency) setLocal("desktop-transparency", prefs.desktopTransparency);
    if (prefs.accentTaskbar) setLocal("accent-taskbar", prefs.accentTaskbar);
    if (prefs.accentBorders) setLocal("accent-borders", prefs.accentBorders);
  } finally {
    suppressCapture = false;
  }
  window.dispatchEvent(new Event("desktop-theme-change"));
  window.dispatchEvent(new Event("login-theme-change"));
  window.dispatchEvent(new Event("accent-change"));
  window.dispatchEvent(new Event("login-accent-change"));
  window.dispatchEvent(new Event("appearance-change"));
  window.dispatchEvent(new Event("personalization-sync-applied"));
}

function gasJsonp(action: string, payload?: unknown): Promise<GasResponse | null> {
  if (!GAS_URL || typeof document === "undefined" || remoteDisabled || isQuiet()) return Promise.resolve(null);
  return new Promise((resolve) => {
    const callbackName = `__a3k64Personalization_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const url = new URL(GAS_URL);
    let timeoutId = 0;
    let done = false;
    const finish = (value: GasResponse | null) => {
      if (done) return;
      done = true;
      window.clearTimeout(timeoutId);
      delete (window as typeof window & Record<string, unknown>)[callbackName];
      script.remove();
      resolve(value);
    };
    url.searchParams.set("action", action);
    url.searchParams.set("callback", callbackName);
    url.searchParams.set("t", String(Date.now()));
    if (payload !== undefined) url.searchParams.set("payload", JSON.stringify(payload));
    (window as typeof window & Record<string, unknown>)[callbackName] = (json: GasResponse) => finish(json);
    script.onerror = () => {
      quietForAWhile();
      finish(null);
    };
    timeoutId = window.setTimeout(() => {
      quietForAWhile();
      finish(null);
    }, JSONP_TIMEOUT_MS);
    script.src = url.toString();
    document.head.appendChild(script);
  });
}

async function fetchRemotePrefs(user: SessionUser) {
  const res = await gasJsonp("getPersonalization", { username: accountId(user), email: user.email, uid: user.uid });
  const data = res?.data || res;
  return (data?.personalization || data?.prefs || data?.preferences || null) as Partial<PersonalizationPayload> | null;
}

async function saveRemotePrefs(user: SessionUser, personalization: Partial<PersonalizationPayload>) {
  const res = await gasJsonp("savePersonalization", { username: accountId(user), email: user.email, uid: user.uid, displayName: displayName(user), personalization });
  return res !== null;
}

function scheduleSave() {
  if (!activeAccount || suppressCapture || remoteDisabled || isQuiet()) return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    const session = readSession();
    if (!session?.user || accountId(session.user) !== activeAccount) return;
    const prefs = collectPrefs();
    const json = JSON.stringify(prefs);
    if (json === lastSavedJson) return;
    lastSavedJson = json;
    const ok = await saveRemotePrefs(session.user, prefs);
    if (!ok) quietForAWhile();
  }, 750);
}

async function syncForSession(user: SessionUser, options?: { fromLogin?: boolean }) {
  const account = accountId(user);
  if (!account || remoteDisabled || isQuiet()) return;
  activeAccount = account;

  const loginChanged = Boolean(options?.fromLogin && loginLookWasChanged());
  const remotePrefs = await fetchRemotePrefs(user);
  if (remoteDisabled || isQuiet()) return;

  const merged: PersonalizationPayload = {
    version: 2,
    ...(remotePrefs || collectPrefs()),
    ...(loginChanged ? loginLook() : {}),
    updatedAt: new Date().toISOString(),
  };

  lastSavedJson = JSON.stringify(merged);
  applyPrefs(merged);

  if (loginChanged || !remotePrefs) {
    await saveRemotePrefs(user, merged);
    clearLoginLookChanged();
  }
}

function installStorageHook() {
  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;
  Storage.prototype.setItem = function patchedSetItem(key: string, value: string) {
    originalSetItem.call(this, key, value);
    if (key === SESSION_KEY) {
      const session = readSession();
      if (session?.user) void syncForSession(session.user, { fromLogin: true });
      return;
    }
    if (PERSONALIZATION_KEYS.has(key)) scheduleSave();
  };
  Storage.prototype.removeItem = function patchedRemoveItem(key: string) {
    originalRemoveItem.call(this, key);
    if (key === SESSION_KEY) activeAccount = "";
    if (PERSONALIZATION_KEYS.has(key)) scheduleSave();
  };
}

function boot() {
  if (booted || typeof window === "undefined") return;
  booted = true;
  if (isQuiet()) remoteDisabled = true;
  installStorageHook();
  const session = readSession();
  if (session?.user) void syncForSession(session.user, { fromLogin: false });
  window.addEventListener("taskbar-settings-change", scheduleSave);
  window.addEventListener("accent-change", scheduleSave);
  window.addEventListener("desktop-theme-change", scheduleSave);
  window.addEventListener("login-theme-change", scheduleSave);
  window.addEventListener("appearance-change", scheduleSave);
}

boot();
