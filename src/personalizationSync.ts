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
type RemotePrefsResult = { exists: boolean; prefs: Partial<PersonalizationPayload> | null };

const GAS_URL = import.meta.env.VITE_GAS_WEB_APP_URL?.trim();
const SESSION_KEY = "a3k64-login-session-v1";
const LOGIN_LOOK_DIRTY_KEY = "a3k64-login-look-dirty-v1";
const LOCAL_UPDATED_KEY = "a3k64-personalization-local-updated-at";
const QUIET_UNTIL_KEY = "a3k64-personalization-quiet-until";
const JSONP_TIMEOUT_MS = 45000;

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
let initializedAccount = "";

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

function stablePrefsJson(value: Partial<PersonalizationPayload>) {
  const { updatedAt: _updatedAt, ...stable } = value || {};
  return JSON.stringify(stable);
}

function localUpdatedAtMs() {
  return Number(localStorage.getItem(LOCAL_UPDATED_KEY) || 0);
}

function remoteUpdatedAtMs(prefs?: Partial<PersonalizationPayload> | null) {
  const parsed = Date.parse(String(prefs?.updatedAt || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function markLocalChanged(setItem: (key: string, value: string) => void) {
  setItem(LOCAL_UPDATED_KEY, String(Date.now()));
  setItem(LOGIN_LOOK_DIRTY_KEY, "1");
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
  const accentColor = [localStorage.getItem("login-accent-color"), customAccent, localStorage.getItem("desktop-accent"), localStorage.getItem("accent-color"), named].find(isHex);
  const normalizedKey = accentKey || (accentColor ? "custom" : undefined);
  return {
    ...(theme ? { theme } : {}),
    ...(normalizedKey ? { accentKey: normalizedKey } : {}),
    ...(accentColor ? { accentColor } : {}),
    ...(accentColor ? { customAccent: accentColor } : customAccent && isHex(customAccent) ? { customAccent } : {}),
  };
}

function collectPrefs(): PersonalizationPayload {
  const updatedAt = new Date(localUpdatedAtMs() || Date.now()).toISOString();
  return {
    version: 2,
    ...loginLook(),
    taskbarSettings: safeJson(localStorage.getItem("taskbar-settings"), undefined),
    pinnedApps: safeJson(localStorage.getItem("pinned-apps"), []),
    recentAccents: safeJson(localStorage.getItem("recent-accents"), []),
    desktopTransparency: localStorage.getItem("desktop-transparency") === "off" ? "off" : "on",
    accentTaskbar: localStorage.getItem("accent-taskbar") === "on" ? "on" : "off",
    accentBorders: localStorage.getItem("accent-borders") === "on" ? "on" : "off",
    updatedAt,
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
      setLocal("custom-accent", color);
      setLocal("customAccent", color);
      setLocal("desktop-custom-accent", color);
      setLocal("accent-color", color);
    }
    if (prefs.taskbarSettings) setLocal("taskbar-settings", prefs.taskbarSettings);
    if (Array.isArray(prefs.pinnedApps)) setLocal("pinned-apps", prefs.pinnedApps);
    if (Array.isArray(prefs.recentAccents)) setLocal("recent-accents", prefs.recentAccents);
    if (prefs.desktopTransparency) setLocal("desktop-transparency", prefs.desktopTransparency);
    if (prefs.accentTaskbar) setLocal("accent-taskbar", prefs.accentTaskbar);
    if (prefs.accentBorders) setLocal("accent-borders", prefs.accentBorders);
    if (prefs.updatedAt) setLocal(LOCAL_UPDATED_KEY, String(remoteUpdatedAtMs(prefs) || Date.now()));

    window.dispatchEvent(new Event("desktop-theme-change"));
    window.dispatchEvent(new Event("login-theme-change"));
    window.dispatchEvent(new Event("accent-change"));
    window.dispatchEvent(new Event("login-accent-change"));
    window.dispatchEvent(new Event("appearance-change"));
    window.dispatchEvent(new Event("taskbar-settings-change"));
    window.dispatchEvent(new Event("personalization-sync-applied"));
  } finally {
    suppressCapture = false;
  }
}

function gasJsonp(action: string, payload?: unknown): Promise<GasResponse | null> {
  if (!GAS_URL || typeof document === "undefined" || remoteDisabled || isQuiet()) return Promise.resolve(null);
  return new Promise((resolve) => {
    const callbackName = `__a3k64Personalization_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const url = new URL(GAS_URL);
    const globalCallbacks = window as typeof window & Record<string, unknown>;
    let timeoutId = 0;
    let done = false;
    const finish = (value: GasResponse | null, keepLateNoop = false) => {
      if (done) return;
      done = true;
      window.clearTimeout(timeoutId);
      script.onerror = null;
      if (keepLateNoop) {
        globalCallbacks[callbackName] = () => undefined;
        window.setTimeout(() => delete globalCallbacks[callbackName], 60000);
      } else {
        delete globalCallbacks[callbackName];
      }
      script.remove();
      resolve(value);
    };
    url.searchParams.set("action", action);
    url.searchParams.set("callback", callbackName);
    url.searchParams.set("t", String(Date.now()));
    if (payload !== undefined) url.searchParams.set("payload", JSON.stringify(payload));
    globalCallbacks[callbackName] = (json: GasResponse) => finish(json, false);
    script.onerror = () => {
      quietForAWhile();
      finish(null, true);
    };
    timeoutId = window.setTimeout(() => {
      quietForAWhile();
      finish(null, true);
    }, JSONP_TIMEOUT_MS);
    script.src = url.toString();
    document.head.appendChild(script);
  });
}

function normalizeRemotePrefs(data: any): RemotePrefsResult {
  const prefs = (data?.personalization || data?.prefs || data?.preferences || data?.settings || null) as Partial<PersonalizationPayload> | null;
  const exists = Boolean(
    data?.exists === true ||
    data?.found === true ||
    data?.hasPersonalization === true ||
    data?.created === false ||
    (prefs && Object.keys(prefs).some((key) => key !== "updatedAt"))
  );
  return { exists, prefs: exists ? prefs || {} : null };
}

async function fetchRemotePrefs(user: SessionUser): Promise<RemotePrefsResult> {
  const account = accountId(user);
  const res = await gasJsonp("getPersonalization", { account, username: account, email: user.email, uid: user.uid });
  const data = res?.data || res;
  return normalizeRemotePrefs(data);
}

async function saveRemotePrefs(user: SessionUser, personalization: Partial<PersonalizationPayload>) {
  const account = accountId(user);
  const payload = {
    account,
    username: account,
    email: user.email,
    uid: user.uid,
    displayName: displayName(user),
    personalization,
    settings: personalization,
  };
  const res = await gasJsonp("savePersonalization", payload);
  return res !== null;
}

function scheduleSave() {
  if (!activeAccount || activeAccount !== initializedAccount || suppressCapture || remoteDisabled || isQuiet()) return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    const session = readSession();
    if (!session?.user || accountId(session.user) !== activeAccount) return;
    const prefs = collectPrefs();
    const json = stablePrefsJson(prefs);
    if (json === lastSavedJson) return;
    lastSavedJson = json;
    const ok = await saveRemotePrefs(session.user, prefs);
    if (!ok) quietForAWhile();
  }, 750);
}

async function syncForSession(user: SessionUser) {
  const account = accountId(user);
  if (!account || remoteDisabled || isQuiet()) return;
  activeAccount = account;
  initializedAccount = "";

  const localBeforeFetch = collectPrefs();
  const localBeforeJson = stablePrefsJson(localBeforeFetch);
  const localBeforeUpdated = localUpdatedAtMs();
  const remote = await fetchRemotePrefs(user);
  if (remoteDisabled || isQuiet()) return;

  if (remote.exists && remote.prefs) {
    const remotePrefs = { version: 2, ...remote.prefs } as PersonalizationPayload;
    const remoteJson = stablePrefsJson(remotePrefs);
    const remoteUpdated = remoteUpdatedAtMs(remotePrefs);
    const localChanged = Boolean(localStorage.getItem(LOGIN_LOOK_DIRTY_KEY));
    const localIsNewer = localBeforeUpdated > 0 && (!remoteUpdated || localBeforeUpdated > remoteUpdated + 1000);

    if ((localChanged || localIsNewer) && localBeforeJson !== remoteJson) {
      lastSavedJson = localBeforeJson;
      initializedAccount = account;
      const ok = await saveRemotePrefs(user, localBeforeFetch);
      if (!ok) quietForAWhile();
      clearLoginLookChanged();
      return;
    }

    lastSavedJson = remoteJson;
    applyPrefs(remotePrefs);
    initializedAccount = account;
    clearLoginLookChanged();
    return;
  }

  const defaults = collectPrefs();
  lastSavedJson = stablePrefsJson(defaults);
  initializedAccount = account;
  await saveRemotePrefs(user, defaults);
  clearLoginLookChanged();
}

function installStorageHook() {
  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;
  Storage.prototype.setItem = function patchedSetItem(key: string, value: string) {
    originalSetItem.call(this, key, value);
    if (key === SESSION_KEY) {
      const session = readSession();
      if (session?.user) void syncForSession(session.user);
      return;
    }
    if (this === localStorage && PERSONALIZATION_KEYS.has(key)) {
      if (!suppressCapture) markLocalChanged((markKey, markValue) => originalSetItem.call(this, markKey, markValue));
      scheduleSave();
    }
  };
  Storage.prototype.removeItem = function patchedRemoveItem(key: string) {
    originalRemoveItem.call(this, key);
    if (key === SESSION_KEY) {
      activeAccount = "";
      initializedAccount = "";
    }
    if (this === localStorage && PERSONALIZATION_KEYS.has(key)) {
      if (!suppressCapture) markLocalChanged((markKey, markValue) => originalSetItem.call(this, markKey, markValue));
      scheduleSave();
    }
  };
}

function boot() {
  if (booted || typeof window === "undefined") return;
  booted = true;
  if (isQuiet()) remoteDisabled = true;
  installStorageHook();
  const session = readSession();
  if (session?.user) void syncForSession(session.user);
  window.addEventListener("taskbar-settings-change", scheduleSave);
  window.addEventListener("accent-change", scheduleSave);
  window.addEventListener("desktop-theme-change", scheduleSave);
  window.addEventListener("login-theme-change", scheduleSave);
  window.addEventListener("appearance-change", scheduleSave);
}

boot();
