import type { ScoreCategory, ScoreEvent, ScoreType, Student } from "../apps/ScoreboardApp/data/mockScoreData";

export type GasLoginUser = {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  provider: string;
  role?: string;
  group?: number | string;
};

export type QuickScoreRule = {
  title: string;
  points: number;
  type: ScoreType;
  category: ScoreCategory;
  note?: string;
};

export type WeekSetting = {
  week: number;
  label?: string;
  start?: string;
  end?: string;
  today?: string;
  editable: boolean;
  locked: boolean;
  reason?: string;
};

export type GasScoreboardPayload = {
  students: Student[];
  events: ScoreEvent[];
  weeks: number[];
  quickScoreReasons?: QuickScoreRule[];
  weekSettings?: WeekSetting[];
  updatedAt?: string;
};

export type GasRecoveryResult = {
  ok: boolean;
  message?: string;
  user?: GasLoginUser;
};

type GasResponseData = Partial<GasScoreboardPayload> & {
  ok?: boolean;
  error?: string;
  event?: unknown;
  user?: unknown;
  scoreboard?: unknown;
  rules?: unknown;
  [key: string]: unknown;
};

type RawGasResponse = GasResponseData & { data?: GasResponseData };
type GlobalRuleCache = typeof globalThis & { __A3K64_SCORE_RULES?: QuickScoreRule[] };
type GlobalScoreboardCache = typeof globalThis & {
  __A3K64_SCOREBOARD_CACHE?: GasScoreboardPayload | null;
  __A3K64_SCOREBOARD_PROMISE?: Promise<GasScoreboardPayload | null> | null;
  __A3K64_SCOREBOARD_CACHE_AT?: number;
};

const GAS_URL = import.meta.env.VITE_GAS_WEB_APP_URL?.trim();
const JSONP_TIMEOUT_MS = 45000;
let activeMutations = 0;

function getCacheHost(): GlobalScoreboardCache | null {
  return typeof globalThis === "undefined" ? null : (globalThis as GlobalScoreboardCache);
}

function emitScoreboardCacheEvent(payload: GasScoreboardPayload | null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("a3k64-scoreboard-cache-updated", { detail: { payload } }));
}

function setScoreboardCache(payload: GasScoreboardPayload | null) {
  const host = getCacheHost();
  if (!host) return payload;
  host.__A3K64_SCOREBOARD_CACHE = payload;
  host.__A3K64_SCOREBOARD_CACHE_AT = Date.now();
  emitScoreboardCacheEvent(payload);
  return payload;
}

export function getCachedScoreboardFromGas() {
  return getCacheHost()?.__A3K64_SCOREBOARD_CACHE || null;
}

export function invalidateScoreboardCache() {
  const host = getCacheHost();
  if (!host) return;
  host.__A3K64_SCOREBOARD_CACHE = null;
  host.__A3K64_SCOREBOARD_PROMISE = null;
  host.__A3K64_SCOREBOARD_CACHE_AT = 0;
  emitScoreboardCacheEvent(null);
}

function getLastNameInitial(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts[parts.length - 1]?.[0] || name[0] || "?").toUpperCase();
}

function asText(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(String(value ?? "").replace(/^\+/, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeGroup(value: unknown): Student["group"] {
  const group = asNumber(value, 1);
  return group === 1 || group === 2 || group === 3 || group === 4 ? group : 1;
}

function normalizeType(value: unknown, points: number): ScoreType {
  const type = asText(value).toUpperCase();
  if (type === "CONG" || type === "TRU") return type;
  return points >= 0 ? "CONG" : "TRU";
}

function normalizeCategory(value: unknown): ScoreCategory {
  const category = asText(value).toUpperCase();
  if (category === "NE_NEP" || category === "HOC_TAP" || category === "PHONG_TRAO") return category;
  if (category.includes("NỀ") || category.includes("NE")) return "NE_NEP";
  if (category.includes("PHONG")) return "PHONG_TRAO";
  return "HOC_TAP";
}

function normalizeStudents(raw: unknown): Student[] {
  if (!Array.isArray(raw)) return [];
  const students: Student[] = [];

  raw.forEach((item, index) => {
    const record = item as Partial<Student> & Record<string, unknown>;
    const name = asText(record.name ?? record["Họ và tên"] ?? record["Học sinh"] ?? record["Tên"]);
    if (!name) return;
    const role = asText(record.role ?? record["Chức vụ"]);

    students.push({
      id: asText(record.id ?? record.studentId, `s${String(index + 1).padStart(2, "0")}`),
      name,
      group: normalizeGroup(record.group ?? record["Tổ"]),
      role: role || undefined,
      avatarInitial: asText(record.avatarInitial, getLastNameInitial(name)),
    });
  });

  return students;
}

function normalizeEvents(raw: unknown): ScoreEvent[] {
  if (!Array.isArray(raw)) return [];
  const events: ScoreEvent[] = [];

  raw.forEach((item, index) => {
    const record = item as Partial<ScoreEvent> & Record<string, unknown>;
    const studentId = asText(record.studentId ?? record["Mã học sinh"] ?? record["student_id"]);
    const title = asText(record.title ?? record["Nội dung"] ?? record["Lý do"]);
    if (!studentId || !title) return;

    const points = asNumber(record.points ?? record["Điểm"] ?? record["score"], 0);
    const createdAt = asText(record.createdAt ?? record["Thời gian"] ?? record["Ngày"] ?? record.timestamp ?? record.created_at, "");
    const note = asText(record.note ?? record["Ghi chú"]);

    events.push({
      id: asText(record.id, `e${String(index + 1).padStart(4, "0")}`),
      studentId,
      week: asNumber(record.week ?? record["Tuần"], 1),
      title,
      points,
      type: normalizeType(record.type ?? record["Loại"], points),
      category: normalizeCategory(record.category ?? record["Nhóm"] ?? record["Danh mục"]),
      note: note || undefined,
      createdBy: asText(record.createdBy ?? record["Người nhập"] ?? record.actor ?? record.user, "Google Sheets"),
      createdAt,
    });
  });

  return events;
}

function normalizeRules(raw: unknown): QuickScoreRule[] {
  if (!Array.isArray(raw)) return [];
  const rules: QuickScoreRule[] = [];

  raw.forEach((item) => {
    const record = item as Record<string, unknown>;
    const title = asText(record.title ?? record["Tên"] ?? record.ten);
    const rawPoint = asNumber(record.points ?? record["Điểm"] ?? record.diem, NaN);
    if (!title || !Number.isFinite(rawPoint)) return;
    const type = normalizeType(record.type ?? record["Tính"] ?? record.tinh, rawPoint);
    rules.push({
      title,
      type,
      points: type === "TRU" ? -Math.abs(rawPoint) : Math.abs(rawPoint),
      category: normalizeCategory(record.category ?? record["Phân loại"] ?? record.phanloai),
      note: asText(record.note ?? record["Ghi chú"] ?? record.ghichu) || undefined,
    });
  });

  return rules;
}

function normalizeWeekSettings(raw: unknown): WeekSetting[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const record = item as Record<string, unknown>;
      const week = asNumber(record.week ?? record["tuần"] ?? record["tuan"], NaN);
      if (!Number.isFinite(week)) return null;
      const editable = Boolean(record.editable ?? !record.locked);
      const locked = Boolean(record.locked ?? !editable);
      return {
        week,
        label: asText(record.label, `TUẦN ${week}`),
        start: asText(record.start),
        end: asText(record.end),
        today: asText(record.today),
        editable,
        locked,
        reason: asText(record.reason) || undefined,
      };
    })
    .filter((item): item is WeekSetting => Boolean(item));
}

function setGlobalRules(rules: QuickScoreRule[]) {
  if (typeof globalThis === "undefined") return;
  (globalThis as GlobalRuleCache).__A3K64_SCORE_RULES = rules;
}

function normalizeWeeks(raw: unknown, events: ScoreEvent[]) {
  const fromSheet = Array.isArray(raw) ? raw.map((item) => asNumber(item, NaN)).filter(Number.isFinite) : [];
  const fromEvents = events.map((event) => event.week);
  const weeks = Array.from(new Set([...fromSheet, ...fromEvents])).sort((a, b) => a - b);
  return weeks.length ? weeks : [1];
}

function normalizePayload(data: GasResponseData): GasScoreboardPayload {
  const students = normalizeStudents(data.students);
  const events = normalizeEvents(data.events);
  const weeks = normalizeWeeks(data.weeks, events);
  const quickScoreReasons = normalizeRules(data.quickScoreReasons ?? data.rules);
  const weekSettings = normalizeWeekSettings(data.weekSettings);
  if (quickScoreReasons.length) setGlobalRules(quickScoreReasons);

  return { students, events, weeks, quickScoreReasons, weekSettings, updatedAt: asText(data.updatedAt) || undefined };
}

function ensureProcessingStyle() {
  if (typeof document === "undefined" || document.getElementById("a3k64-processing-style")) return;
  const style = document.createElement("style");
  style.id = "a3k64-processing-style";
  style.textContent = `.a3k64-processing-mask{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;background:rgba(2,6,23,.36);backdrop-filter:blur(2px);pointer-events:auto}.a3k64-processing-card{min-width:230px;border:1px solid #273244;border-radius:20px;display:grid;grid-template-columns:30px 1fr;gap:12px;align-items:center;padding:18px 20px;color:#f8fafc;background:#111827;box-shadow:0 24px 80px rgba(0,0,0,.4)}.a3k64-processing-spinner{width:22px;height:22px;border:3px solid rgba(59,130,246,.25);border-top-color:#3b82f6;border-radius:999px;animation:a3k64spin .75s linear infinite}.a3k64-processing-card strong{display:block;font-size:15px}.a3k64-processing-card span{display:block;margin-top:3px;color:#94a3b8;font-size:13px}@keyframes a3k64spin{to{transform:rotate(360deg)}}`;
  document.head.appendChild(style);
}

function showProcessing(message = "Vui lòng chờ...") {
  if (typeof document === "undefined") return;
  activeMutations += 1;
  ensureProcessingStyle();
  let mask = document.getElementById("a3k64-processing-mask");
  if (!mask) {
    mask = document.createElement("div");
    mask.id = "a3k64-processing-mask";
    mask.className = "a3k64-processing-mask";
    mask.innerHTML = `<div class="a3k64-processing-card"><div class="a3k64-processing-spinner"></div><div><strong>Đang xử lý...</strong><span></span></div></div>`;
    document.body.appendChild(mask);
  }
  const text = mask.querySelector("span");
  if (text) text.textContent = message;
}

function hideProcessing() {
  if (typeof document === "undefined") return;
  activeMutations = Math.max(0, activeMutations - 1);
  if (activeMutations > 0) return;
  document.getElementById("a3k64-processing-mask")?.remove();
}

function gasJsonp(action: string, payload?: unknown): Promise<RawGasResponse | null> {
  if (!GAS_URL || typeof document === "undefined") return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const callbackName = `__a3k64GasCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const url = new URL(GAS_URL);
    const globalCallbacks = window as typeof window & Record<string, unknown>;
    let timeoutId = 0;
    let settled = false;

    url.searchParams.set("action", action);
    url.searchParams.set("callback", callbackName);
    url.searchParams.set("t", String(Date.now()));
    if (payload !== undefined) url.searchParams.set("payload", JSON.stringify(payload));

    const cleanup = (keepLateNoop = false) => {
      window.clearTimeout(timeoutId);
      script.onerror = null;
      if (keepLateNoop) {
        globalCallbacks[callbackName] = () => undefined;
        window.setTimeout(() => delete globalCallbacks[callbackName], 60000);
      } else {
        delete globalCallbacks[callbackName];
      }
      script.remove();
    };

    globalCallbacks[callbackName] = (json: RawGasResponse) => {
      if (settled) return;
      settled = true;
      cleanup(false);
      if (json?.ok === false) reject(new Error(asText(json.error, "Google Apps Script trả về lỗi.")));
      else if (json?.data?.ok === false) reject(new Error(asText(json.data.error, "Google Apps Script trả về lỗi.")));
      else resolve(json);
    };

    script.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup(true);
      reject(new Error("Không tải được JSONP từ Google Apps Script. Hãy cập nhật api.gs và deploy lại Web App."));
    };
    timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup(true);
      reject(new Error("Google Apps Script phản hồi quá lâu. Kiểm tra deploy Web App hoặc api.gs."));
    }, JSONP_TIMEOUT_MS);
    script.src = url.toString();
    document.head.appendChild(script);
  });
}

async function gasGet(action: string) {
  if (!GAS_URL) return null;
  return gasJsonp(action);
}

async function gasPost(action: string, payload: unknown, processingMessage?: string) {
  if (!GAS_URL) return null;
  if (processingMessage) showProcessing(processingMessage);
  try {
    return await gasJsonp(action, payload);
  } finally {
    if (processingMessage) hideProcessing();
  }
}

function actorPayload() {
  try {
    const session = JSON.parse(localStorage.getItem("a3k64-login-session-v1") || "null") as { user?: Record<string, unknown> } | null;
    const user = session?.user || {};
    return {
      actorEmail: asText(user.email),
      actorUid: asText(user.uid),
      actorName: asText(user.displayName ?? user.name ?? user.hoten),
      actorRole: asText(user.role),
      actorGroup: asText(user.group ?? user.to),
    };
  } catch {
    return {};
  }
}

export async function fetchScoreboardFromGas(options: { force?: boolean } = {}): Promise<GasScoreboardPayload | null> {
  const host = getCacheHost();
  if (!options.force && host?.__A3K64_SCOREBOARD_CACHE) return host.__A3K64_SCOREBOARD_CACHE;
  if (!options.force && host?.__A3K64_SCOREBOARD_PROMISE) return host.__A3K64_SCOREBOARD_PROMISE;

  const request = (async () => {
    try {
      const response = await gasGet("getScoreboard");
      if (!response) return host?.__A3K64_SCOREBOARD_CACHE || null;
      const data = response.data || response;
      return setScoreboardCache(normalizePayload({ ...data, updatedAt: data.updatedAt || response.updatedAt }));
    } catch (error) {
      console.warn("Không đọc được dữ liệu Google Sheets qua JSONP:", error);
      return host?.__A3K64_SCOREBOARD_CACHE || null;
    } finally {
      if (host) host.__A3K64_SCOREBOARD_PROMISE = null;
    }
  })();

  if (host) host.__A3K64_SCOREBOARD_PROMISE = request;
  return request;
}

export function preloadScoreboardFromGas() {
  return fetchScoreboardFromGas();
}

export async function refreshScoreboardFromGas() {
  return fetchScoreboardFromGas({ force: true });
}

export async function createScoreEventInGas(event: ScoreEvent): Promise<ScoreEvent> {
  const response = await gasPost("addScoreEvent", { ...event, ...actorPayload() }, "Đang lưu điểm vào Google Sheets...");
  const data = response?.data || response;
  const scoreboard = data?.scoreboard as GasResponseData | undefined;
  if (scoreboard?.events) {
    const normalized = setScoreboardCache(normalizePayload(scoreboard));
    const matched = normalized?.events
      .filter((item) => item.studentId === event.studentId && item.week === event.week && item.title === event.title && item.points === event.points)
      .at(-1);
    if (matched) return matched;
  }
  const normalizedEvents = normalizeEvents([data?.event || data]);
  return normalizedEvents[0] || event;
}

export async function deleteScoreEventInGas(eventId: string) {
  const response = await gasPost("deleteScoreEvent", { id: eventId, ...actorPayload() }, "Đang xoá điểm trong Google Sheets...");
  const data = response?.data || response;
  if (data?.scoreboard) setScoreboardCache(normalizePayload(data.scoreboard as GasResponseData));
  else invalidateScoreboardCache();
}

export async function createWeekInGas(week: number) {
  await gasPost("createWeek", { week, ...actorPayload() }, "Đang tạo tuần mới...");
  invalidateScoreboardCache();
}

export async function validateLoginWithGas(username: string, password: string): Promise<GasLoginUser | null> {
  try {
    const response = await gasPost("login", { username, password });
    const data = response?.data || response;
    if (!data?.ok || !data.user) return null;

    const user = data.user as Partial<GasLoginUser> & Record<string, unknown>;
    return {
      uid: asText(user.uid, `gas-${username}`),
      displayName: asText(user.displayName, username),
      email: asText(user.email, username),
      photoURL: null,
      provider: asText(user.provider, "gas"),
      role: asText(user.role),
      group: asText(user.group ?? user.to),
    };
  } catch (error) {
    console.error("Không đăng nhập được qua Google Sheets:", error);
    return null;
  }
}

export async function resetPasswordWithGas(fullName: string, phone: string, newEmail: string, newPassword: string): Promise<GasRecoveryResult> {
  try {
    const response = await gasPost("resetPassword", { fullName, phone, newEmail, newPassword }, "Đang cập nhật tài khoản...");
    const data = response?.data || response;
    if (!data?.ok) return { ok: false, message: asText(data?.error, "Không cập nhật được tài khoản.") };
    const user = data.user as Partial<GasLoginUser> & Record<string, unknown> | undefined;
    return {
      ok: true,
      message: asText(data.message, "Đã cập nhật email và mật khẩu."),
      user: user
        ? {
            uid: asText(user.uid, `gas-${newEmail}`),
            displayName: asText(user.displayName, fullName),
            email: asText(user.email, newEmail),
            photoURL: null,
            provider: asText(user.provider, "gas"),
            role: asText(user.role, "hoc_sinh"),
            group: asText(user.group ?? user.to),
          }
        : undefined,
    };
  } catch (error) {
    console.error("Không khôi phục được mật khẩu qua Google Sheets:", error);
    return { ok: false, message: error instanceof Error ? error.message : "Không kết nối được Google Apps Script." };
  }
}
