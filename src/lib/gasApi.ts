import type { ScoreCategory, ScoreEvent, ScoreType, Student } from "../apps/ScoreboardApp/data/mockScoreData";

export type GasScoreboardPayload = {
  students: Student[];
  events: ScoreEvent[];
  weeks: number[];
  updatedAt?: string;
};

type RawGasResponse = {
  ok?: boolean;
  error?: string;
  data?: Partial<GasScoreboardPayload> & { event?: unknown };
  event?: unknown;
  students?: unknown;
  events?: unknown;
  weeks?: unknown;
  updatedAt?: string;
};

const GAS_URL = import.meta.env.VITE_GAS_WEB_APP_URL?.trim();

function getLastNameInitial(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts[parts.length - 1]?.[0] || name[0] || "?").toUpperCase();
}

function asText(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
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
      week: asNumber(record.week ?? record["Tuần"], 37),
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

function normalizeWeeks(raw: unknown, events: ScoreEvent[]) {
  const fromSheet = Array.isArray(raw) ? raw.map((item) => asNumber(item, NaN)).filter(Number.isFinite) : [];
  const fromEvents = events.map((event) => event.week);
  return Array.from(new Set([...fromSheet, ...fromEvents])).sort((a, b) => a - b);
}

async function parseResponse<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;

  const json = JSON.parse(text) as RawGasResponse;
  if (json.ok === false) throw new Error(json.error || "Google Apps Script trả về lỗi.");
  return json as T;
}

async function gasGet(action: string) {
  if (!GAS_URL) return null;

  const url = new URL(GAS_URL);
  url.searchParams.set("action", action);
  url.searchParams.set("t", String(Date.now()));

  const response = await fetch(url.toString(), {
    method: "GET",
    redirect: "follow",
  });

  if (!response.ok) throw new Error(`GAS GET ${action} failed: ${response.status}`);
  return parseResponse<RawGasResponse>(response);
}

async function gasPost(action: string, payload: unknown) {
  if (!GAS_URL) return null;

  const response = await fetch(GAS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify({ action, payload }),
    redirect: "follow",
  });

  if (!response.ok) throw new Error(`GAS POST ${action} failed: ${response.status}`);
  return parseResponse<RawGasResponse>(response);
}

export async function fetchScoreboardFromGas(): Promise<GasScoreboardPayload | null> {
  try {
    const response = await gasGet("getScoreboard");
    if (!response) return null;

    const data = response.data || response;
    const students = normalizeStudents(data.students);
    const events = normalizeEvents(data.events);
    const weeks = normalizeWeeks(data.weeks, events);

    return {
      students,
      events,
      weeks,
      updatedAt: data.updatedAt || response.updatedAt,
    };
  } catch (error) {
    console.error("Không đọc được dữ liệu Google Sheets:", error);
    return null;
  }
}

export async function createScoreEventInGas(event: ScoreEvent): Promise<ScoreEvent> {
  const response = await gasPost("addScoreEvent", event);
  const data = response?.data || response;
  const normalizedEvents = normalizeEvents([data?.events ? undefined : data?.event || data]);
  return normalizedEvents[0] || event;
}

export async function deleteScoreEventInGas(eventId: string) {
  await gasPost("deleteScoreEvent", { id: eventId });
}

export async function createWeekInGas(week: number) {
  await gasPost("createWeek", { week });
}
