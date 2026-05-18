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

export type GasScoreboardPayload = {
  students: Student[];
  events: ScoreEvent[];
  weeks: number[];
  quickScoreReasons?: QuickScoreRule[];
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

type RawGasResponse = GasResponseData & {
  data?: GasResponseData;
};

type GlobalRuleCache = typeof globalThis & {
  __A3K64_SCORE_RULES?: QuickScoreRule[];
};

const GAS_URL = import.meta.env.VITE_GAS_WEB_APP_URL?.trim();
let activeMutations = 0;

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
    const createdAt = asText(record.createdAt ?? record["Thời gian"] ?? record["Ngày"], new Date().toISOString());
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
      createdBy: asText(record.createdBy ?? record["Người nhập"], "Google Sheets"),
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

function setGlobalRules(rules: QuickScoreRule[]) {
  if (typeof globalThis === "undefined") return;
  (globalThis as GlobalRuleCache).__A3K64_SCORE_RULES = rules;
}

function normalizeWeeks(raw: unknown, events: ScoreEvent[]) {
  const fromSheet = Array.isArray(raw) ? raw.map((item) => asNumber(item, NaN)).filter(Number.isFinite) : [];
  const fromEvents = events.map((event) => event.week);
  return Array.from(new Set([...fromSheet, ...fromEvents])).sort((a, b) => a - b);
}

function normalizePayload(data: GasResponseData): GasScoreboardPayload {
  const students = normalizeStudents(data.students);
  const events = normalizeEvents(data.events);
  const weeks = normalizeWeeks(data.weeks, events);
  const quickScoreReasons = normalizeRules(data.quickScoreReasons ?? data.rules);
  if (quickScoreReasons.length) setGlobalRules(quickScoreReasons);

  return {
    students,
    events,
    weeks,
    quickScoreReasons,
    updatedAt: asText(data.updatedAt) || undefined,
  };
}

async function parseResponse<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;
  const json = JSON.parse(text) as RawGasResponse;
  if (json.ok === false) throw new Error(json.error || "Google Apps Script trả về lỗi.");
  if (json.data?.ok === false) throw new Error(asText(json.data.error, "Google Apps Script trả về lỗi."));
  return json as T;
}

function ensureProcessingStyle() {
  if (typeof document === "undefined" || document.getElementById("a3k64-processing-style")) return;
  const style = document.createElement("style");
  style.id = "a3k64-processing-style";
  style.textContent = `
    .a3k64-processing-mask{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;background:rgba(2,6,23,.36);backdrop-filter:blur(2px);pointer-events:auto}.a3k64-processing-card{min-width:230px;border:1px solid #273244;border-radius:20px;display:grid;grid-template-columns:30px 1fr;gap:12px;align-items:center;padding:18px 20px;color:#f8fafc;background:#111827;box-shadow:0 24px 80px rgba(0,0,0,.4)}.a3k64-processing-spinner{width:22px;height:22px;border:3px solid rgba(59,130,246,.25);border-top-color:#3b82f6;border-radius:999px;animation:a3k64spin .75s linear infinite}.a3k64-processing-card strong{display:block;font-size:15px}.a3k64-processing-card span{display:block;margin-top:3px;color:#94a3b8;font-size:13px}@keyframes a3k64spin{to{transform:rotate(360deg)}}`;
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

async function gasGet(action: string) {
  if (!GAS_URL) return null;
  const url = new URL(GAS_URL);
  url.searchParams.set("action", action);
  url.searchParams.set("t", String(Date.now()));
  const response = await fetch(url.toString(), { method: "GET", redirect: "follow" });
  if (!response.ok) throw new Error(`GAS GET ${action} failed: ${response.status}`);
  return parseResponse<RawGasResponse>(response);
}

async function gasPost(action: string, payload: unknown, processingMessage?: string) {
  if (!GAS_URL) return null;
  if (processingMessage) showProcessing(processingMessage);
  try {
    const response = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, payload }),
      redirect: "follow",
    });
    if (!response.ok) throw new Error(`GAS POST ${action} failed: ${response.status}`);
    return await parseResponse<RawGasResponse>(response);
  } finally {
    if (processingMessage) hideProcessing();
  }
}

export async function fetchScoreboardFromGas(): Promise<GasScoreboardPayload | null> {
  try {
    const response = await gasGet("getScoreboard");
    if (!response) return null;
    const data = response.data || response;
    return normalizePayload({ ...data, updatedAt: data.updatedAt || response.updatedAt });
  } catch (error) {
    console.error("Không đọc được dữ liệu Google Sheets:", error);
    return null;
  }
}

export async function createScoreEventInGas(event: ScoreEvent): Promise<ScoreEvent> {
  const response = await gasPost("addScoreEvent", event, "Đang lưu điểm vào Google Sheets...");
  const data = response?.data || response;
  const scoreboard = data?.scoreboard as GasResponseData | undefined;
  if (scoreboard?.events) {
    const normalized = normalizePayload(scoreboard);
    const matched = normalized.events
      .filter((item) => item.studentId === event.studentId && item.week === event.week && item.title === event.title && item.points === event.points)
      .at(-1);
    if (matched) return matched;
  }
  const normalizedEvents = normalizeEvents([data?.event || data]);
  return normalizedEvents[0] || event;
}

export async function deleteScoreEventInGas(eventId: string) {
  const response = await gasPost("deleteScoreEvent", { id: eventId }, "Đang xoá điểm trong Google Sheets...");
  const data = response?.data || response;
  if (data?.scoreboard) normalizePayload(data.scoreboard as GasResponseData);
}

export async function createWeekInGas(week: number) {
  await gasPost("createWeek", { week }, "Đang tạo tuần mới...");
}

export async function validateLoginWithGas(username: string, password: string): Promise<GasLoginUser | null> {
  try {
    const response = await gasPost("login", { username, password });
    const data = response?.data;
    if (!data?.ok || !data.user) return null;

    const user = data.user as Partial<GasLoginUser> & Record<string, unknown>;
    return {
      uid: asText(user.uid, `gas-${username}`),
      displayName: asText(user.displayName, username),
      email: asText(user.email, username),
      photoURL: null,
      provider: asText(user.provider, "gas"),
      role: asText(user.role),
      group: asText(user.group),
    };
  } catch (error) {
    console.error("Không đăng nhập được qua Google Sheets:", error);
    return null;
  }
}

export async function resetPasswordWithGas(fullName: string, phone: string, newEmail: string, newPassword: string): Promise<GasRecoveryResult> {
  try {
    const response = await gasPost(
      "resetPassword",
      { fullName, phone, newEmail, newPassword },
      "Đang cập nhật tài khoản..."
    );
    const data = response?.data;
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
            group: asText(user.group),
          }
        : undefined,
    };
  } catch (error) {
    console.error("Không khôi phục được mật khẩu qua Google Sheets:", error);
    return { ok: false, message: error instanceof Error ? error.message : "Không kết nối được Google Apps Script." };
  }
}
