type ThemeMode = "dark" | "light" | "auto";
type AccentKey = "blue" | "violet" | "pink" | "green" | "amber" | "red" | "custom";

type SessionUser = {
  uid?: string;
  email?: string | null;
  displayName?: string | null;
  hoten?: string | null;
  name?: string | null;
  role?: string | null;
};

type SavedSession = {
  user?: SessionUser;
  expiresAt?: number;
};

type TaskbarSettings = {
  searchMode?: "icon" | "box";
  taskView?: boolean;
  widgets?: boolean;
  resume?: boolean;
  alignment?: "left" | "center";
  autoHide?: boolean;
  badges?: boolean;
};

type PersonalizationPayload = {
  version: 2;
  theme?: ThemeMode;
  accentKey?: AccentKey;
  accentColor?: string;
  customAccent?: string;
  taskbarSettings?: TaskbarSettings;
  pinnedApps?: string[];
  recentAccents?: string[];
  desktopTransparency?: "on" | "off";
  accentTaskbar?: "on" | "off";
  accentBorders?: "on" | "off";
  updatedAt?: string;
};

type GasResponse = {
  ok?: boolean;
  error?: string;
  data?: any;
  [key: string]: any;
};

const GAS_URL = import.meta.env.VITE_GAS_WEB_APP_URL?.trim();
const SESSION_KEY = "a3k64-login-session-v1";
const PERSONALIZATION_VERSION = 2;
const JSONP_TIMEOUT_MS = 15000;

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

let activeAccount = "";
let suppressLocalCapture = false;
let saveTimer = 0;
let lastSavedJson = "";
let booted = false;

function safeJsonParse<T>(value: string | null, fallback: T): T {
  try {
    if (!value) return fallback;
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function asText(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function normalizeTheme(value: string | null): ThemeMode | undefined {
  const raw = asText(value).toLowerCase();
  if (raw === "dark" || raw === "light" || raw === "auto") return raw;
  return undefined;
}

function normalizeAccentKey(value: string | null): AccentKey | undefined {
  const raw = asText(value).toLowerCase();
  if (["blue", "violet", "pink", "green", "amber", "red", "custom"].includes(raw)) return raw as AccentKey;
  return undefined;
}

function isHex(value: string | null) {
  return !!value && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

function readSession(): SavedSession | null {
  const session = safeJsonParse<SavedSession | null>(localStorage.getItem(SESSION_KEY), null);
  if (!session?.user || !session.expiresAt || session.expiresAt < Date.now()) return null;
  return session;
}

function accountId(user?: SessionUser | null) {
  const email = asText(user?.email).toLowerCase();
  if (email) return email;
  return asText(user?.uid).toLowerCase();
}

function displayNameOf(user?: SessionUser | null) {
  return asText(user?.displayName || user?.hoten || user?.name || user?.email || user?.uid);
}

function collectLoginAppearanceOnly(): Partial<PersonalizationPayload> {
  const theme = normalizeTheme(localStorage.getItem("login-theme")) || normalizeTheme(localStorage.getItem("theme-mode"));
  const accentKey = normalizeAccentKey(localStorage.getItem("login-accent")) || normalizeAccentKey(localStorage.getItem("accent"));
  const customAccent = localStorage.getItem("login-custom-accent") || localStorage.getItem("desktop-custom-accent") || undefined;
  const namedColor = accentKey && accentKey !== "custom" ? ACCENT_COLORS[accentKey] : undefined;
  const accentColor = [localStorage.getItem("login-accent-color"), customAccent || null, localStorage.getItem("desktop-accent"), namedColor || null].find((item) => isHex(item)) || undefined;

  return {
    ...(theme ? { theme } : {}),
    ...(accentKey ? { accentKey } : {}),
    ...(accentColor ? { accentColor } : {}),
    ...(customAccent && isHex(customAccent) ? { customAccent } : {}),
  };
}

function collectPersonalization(): PersonalizationPayload {
  const loginAppearance = collectLoginAppearanceOnly();
  const taskbarSettings = safeJsonParse<TaskbarSettings | undefined>(localStorage.getItem("taskbar-settings"), undefined);
  const pinnedApps = safeJsonParse<string[] | undefined>(localStorage.getItem("pinned-apps"), undefined);
  const recentAccents = safeJsonParse<string[] | undefined>(localStorage.getItem("recent-accents"), undefined);

  return {
    version: PERSONALIZATION_VERSION,
    ...loginAppearance,
    ...(taskbarSettings ? { taskbarSettings } : {}),
    ...(Array.isArray(pinnedApps) ? { pinnedApps } : {}),
    ...(Array.isArray(recentAccents) ? { recentAccents } : {}),
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

function applyPersonalization(prefs?: Partial<PersonalizationPayload> | null) {
  if (!prefs) return;
  suppressLocalCapture = true;
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
    if (color && isHex(color)) {
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
    suppressLocalCapture = false;
  }

  window.dispatchEvent(new Event("desktop-theme-change"));
  window.dispatchEvent(new Event("login-theme-change"));
  window.dispatchEvent(new Event("accent-change"));
  window.dispatchEvent(new Event("login-accent-change"));
  window.dispatchEvent(new Event("appearance-change"));
  window.dispatchEvent(new CustomEvent("taskbar-settings-change", { detail: prefs.taskbarSettings || {} }));
  window.dispatchEvent(new Event("personalization-sync-applied"));
}

function gasJsonp(action: string, payload?: unknown): Promise<GasResponse | null> {
  if (!GAS_URL || typeof document === "undefined") return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const callbackName = `__a3k64Personalization_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const url = new URL(GAS_URL);
    let timeoutId = 0;

    url.searchParams.set("action", action);
    url.searchParams.set("callback", callbackName);
    url.searchParams.set("t", String(Date.now()));
    if (payload !== undefined) url.searchParams.set("payload", JSON.stringify(payload));

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      delete (window as typeof window & Record<string, unknown>)[callbackName];
      script.remove();
    };

    (window as typeof window & Record<string, unknown>)[callbackName] = (json: GasResponse) => {
      cleanup();
      if (json?.ok === false) reject(new Error(asText(json.error, "Google Apps Script trả về lỗi.")));
      else if (json?.data?.ok === false) reject(new Error(asText(json.data.error, "Google Apps Script trả về lỗi.")));
      else resolve(json);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Không tải được JSONP PERSONALIZATION từ Google Apps Script."));
    };
    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Google Apps Script PERSONALIZATION phản hồi quá lâu."));
    }, JSONP_TIMEOUT_MS);
    script.src = url.toString();
    document.head.appendChild(script);
  });
}

async function fetchRemotePersonalization(user: SessionUser): Promise<Partial<PersonalizationPayload> | null> {
  const response = await gasJsonp("getPersonalization", {
    username: accountId(user),
    email: user.email,
    uid: user.uid,
  });
  const data = response?.data || response;
  return (data?.personalization || data?.prefs || data?.preferences || null) as Partial<PersonalizationPayload> | null;
}

async function saveRemotePersonalization(user: SessionUser, personalization: PersonalizationPayload | Partial<PersonalizationPayload>) {
  const response = await gasJsonp("savePersonalization", {
    username: accountId(user),
    email: user.email,
    uid: user.uid,
    displayName: displayNameOf(user),
    personalization,
  });
  const data = response?.data || response;
  if (data?.ok === false) throw new Error(asText(data.error, "Không lưu được cá nhân hoá."));
}

function scheduleSave() {
  if (!activeAccount || suppressLocalCapture) return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    const session = readSession();
    if (!session?.user || accountId(session.user) !== activeAccount) return;
    const prefs = collectPersonalization();
    const json = JSON.stringify(prefs);
    if (json === lastSavedJson) return;
    lastSavedJson = json;
    try {
      await saveRemotePersonalization(session.user, prefs);
    } catch (error) {
      console.warn("Không đồng bộ được cá nhân hoá:", error);
    }
  }, 650);
}

async function syncForSession(user: SessionUser, options?: { loginAppearanceOnly?: boolean }) {
  const account = accountId(user);
  if (!account) return;
  activeAccount = account;

  try {
    const currentLoginAppearance = collectLoginAppearanceOnly();
    const remotePrefs = await fetchRemotePersonalization(user);
    const merged: PersonalizationPayload = {
      version: PERSONALIZATION_VERSION,
      ...(remotePrefs || {}),
      ...(options?.loginAppearanceOnly ? currentLoginAppearance : {}),
      updatedAt: new Date().toISOString(),
    };

    if (options?.loginAppearanceOnly || !remotePrefs) {
      await saveRemotePersonalization(user, merged);
    }

    lastSavedJson = JSON.stringify(merged);
    applyPersonalization(merged);
  } catch (error) {
    console.warn("Không tải/lưu cá nhân hoá từ PERSONALIZATION:", error);
  }
}

function installLocalStorageHook() {
  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;

  Storage.prototype.setItem = function patchedSetItem(key: string, value: string) {
    originalSetItem.call(this, key, value);

    if (key === SESSION_KEY) {
      const session = readSession();
      if (session?.user) void syncForSession(session.user, { loginAppearanceOnly: true });
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
  installLocalStorageHook();

  const session = readSession();
  if (session?.user) void syncForSession(session.user, { loginAppearanceOnly: false });

  window.addEventListener("taskbar-settings-change", scheduleSave);
  window.addEventListener("accent-change", scheduleSave);
  window.addEventListener("desktop-theme-change", scheduleSave);
  window.addEventListener("login-theme-change", scheduleSave);
  window.addEventListener("appearance-change", scheduleSave);
  window.addEventListener("beforeunload", () => {
    if (!activeAccount) return;
    const session = readSession();
    if (session?.user) void saveRemotePersonalization(session.user, collectPersonalization());
  });
}

boot();
