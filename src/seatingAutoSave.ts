const SAS_WIN = "#a3k64-seating-window";
const SAS_MAP_KEY = "a3k64-seating-map-v1";
const SAS_ROOM_KEY = "a3k64-stable-room-slot-map-v1";
const SAS_CURRENT_KEY = "a3k64-seating-sheet-current-id-v1";
const SAS_GAS_URL = String(import.meta.env.VITE_GAS_WEB_APP_URL || "").trim();
const SAS_DELAY_MS = 1800;

let sasReady = false;
let sasTimer = 0;
let sasSaving = false;
let sasQueued = false;
let sasLastSignature = "";
let sasIgnoreUntil = 0;
let sasLastToastTimer = 0;

type SasSeats = { left: string[][]; right: string[][] };

function sasNorm(v: unknown) {
  return String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "");
}

function sasActor() {
  try {
    const s = JSON.parse(localStorage.getItem("a3k64-login-session-v1") || "null");
    const u = s?.user || s || {};
    return {
      name: String(u.name || u.fullName || u.studentName || u.displayName || u.hoTen || u.username || u.email || ""),
      email: String(u.email || u.username || ""),
      username: String(u.username || u.email || ""),
      role: String(u.role || u.userRole || ""),
    };
  } catch {
    return { name: "", email: "", username: "", role: "" };
  }
}

function sasIsAdmin() {
  const role = sasNorm(sasActor().role);
  return role.includes("gvcn") || role.includes("loptruong") || role.includes("bithu") || role.includes("admin");
}

function sasPreviewCanSave() {
  const perms = String(document.documentElement.dataset.seatPreviewPerms || "");
  return document.documentElement.classList.contains("a3-seat-preview-editor") && perms.split(",").includes("save");
}

function sasCanAutoSave() {
  return sasIsAdmin() || sasPreviewCanSave();
}

function sasWindowVisible() {
  const win = document.querySelector<HTMLElement>(SAS_WIN);
  if (!win) return false;
  const rect = win.getBoundingClientRect();
  const css = getComputedStyle(win);
  return rect.width > 0 && rect.height > 0 && css.display !== "none" && css.visibility !== "hidden";
}

function sasTitle() {
  return document.querySelector<HTMLElement>(`${SAS_WIN} .seat-ctrl-trigger span`)?.textContent?.trim() || "Sơ đồ hiện tại";
}

function sasChartId() {
  const id = String(localStorage.getItem(SAS_CURRENT_KEY) || "").trim();
  return id && id !== "default" ? id : "";
}

function sasReadJson(key: string, fallback: any) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function sasEmptyRows() {
  return Array.from({ length: 7 }, () => Array.from({ length: 4 }, () => ""));
}

function sasSeatsFromDom(): SasSeats | null {
  const cells = Array.from(document.querySelectorAll<HTMLElement>(`${SAS_WIN} .stable-seat-cell`));
  if (!cells.length) return null;
  const seats: SasSeats = { left: sasEmptyRows(), right: sasEmptyRows() };
  cells.forEach((cell) => {
    const side = cell.dataset.side === "right" ? "right" : cell.dataset.side === "left" ? "left" : null;
    const row = Number(cell.dataset.row);
    const seat = Number(cell.dataset.seat);
    if (!side || !Number.isFinite(row) || !Number.isFinite(seat) || row < 0 || row > 6 || seat < 0 || seat > 3) return;
    const text = (cell.textContent || "").replace(/\s+/g, " ").trim();
    seats[side][row][seat] = text && text !== "Trống" ? text : "";
  });
  return seats;
}

function sasSnapshot() {
  const seats = sasSeatsFromDom() || sasReadJson(SAS_MAP_KEY, { left: sasEmptyRows(), right: sasEmptyRows() });
  const room = sasReadJson(SAS_ROOM_KEY, {});
  return {
    version: 1,
    seats,
    room,
    meta: {
      source: "frontend-autosave",
      autoSavedAt: new Date().toISOString(),
      autoSavedBy: sasActor().name || sasActor().email,
    },
  };
}

function sasSignature() {
  const layout = sasSnapshot();
  return JSON.stringify({ chartId: sasChartId(), title: sasTitle(), seats: layout.seats, room: layout.room });
}

function sasToast(message: string, kind: "wait" | "save" | "ok" | "error" = "wait") {
  clearTimeout(sasLastToastTimer);
  document.getElementById("a3-seat-autosave-toast")?.remove();
  const toast = document.createElement("div");
  toast.id = "a3-seat-autosave-toast";
  toast.className = kind;
  toast.innerHTML = `<span class="dot"></span><span>${message}</span>`;
  document.body.appendChild(toast);
  if (kind === "ok") sasLastToastTimer = window.setTimeout(() => toast.remove(), 1600);
  if (kind === "error") sasLastToastTimer = window.setTimeout(() => toast.remove(), 4200);
}

function sasStyle() {
  if (document.getElementById("a3-seat-autosave-style")) return;
  const style = document.createElement("style");
  style.id = "a3-seat-autosave-style";
  style.textContent = `
    #a3-seat-autosave-toast{position:fixed;left:50%;top:74px;transform:translateX(-50%);z-index:1000002;display:flex;align-items:center;gap:9px;padding:9px 13px;border:1px solid rgba(20,184,166,.65);border-radius:15px;background:rgba(255,255,255,.985);color:#0f172a;box-shadow:0 18px 50px rgba(15,23,42,.18);font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",Arial,sans-serif;font-size:13px;font-weight:950;pointer-events:none}
    #a3-seat-autosave-toast .dot{width:14px;height:14px;border-radius:999px;border:2px solid rgba(15,23,42,.14);border-top-color:var(--desktop-accent,#14b8a6);animation:a3SeatAutoSaveSpin .75s linear infinite}
    #a3-seat-autosave-toast.ok .dot{animation:none;border-color:var(--desktop-accent,#14b8a6);background:var(--desktop-accent,#14b8a6);box-shadow:inset 0 0 0 4px #fff}
    #a3-seat-autosave-toast.error{border-color:#fb7185;color:#9f1239}
    #a3-seat-autosave-toast.error .dot{animation:none;border-color:#fb7185;background:#fb7185;box-shadow:inset 0 0 0 4px #fff}
    .theme-dark #a3-seat-autosave-toast,html.a3-overlay-dark #a3-seat-autosave-toast{background:rgba(15,23,42,.96);color:#f8fafc;box-shadow:0 22px 68px rgba(0,0,0,.32)}
    .theme-dark #a3-seat-autosave-toast .dot,html.a3-overlay-dark #a3-seat-autosave-toast .dot{border-color:rgba(255,255,255,.24);border-top-color:#5eead4}
    @keyframes a3SeatAutoSaveSpin{to{transform:rotate(360deg)}}
  `;
  document.head.appendChild(style);
}

function sasGas(action: string, payload?: unknown): Promise<any> {
  if (!SAS_GAS_URL) return Promise.reject(new Error("Thiếu VITE_GAS_WEB_APP_URL"));
  return new Promise((resolve, reject) => {
    const cb = `__a3SeatAutoSave_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const callbacks = window as typeof window & Record<string, unknown>;
    const script = document.createElement("script");
    const url = new URL(SAS_GAS_URL);
    let done = false;
    let timeout = 0;
    url.searchParams.set("action", action);
    url.searchParams.set("callback", cb);
    url.searchParams.set("t", String(Date.now()));
    if (payload !== undefined) url.searchParams.set("payload", JSON.stringify(payload));
    callbacks[cb] = (json: any) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      delete callbacks[cb];
      script.remove();
      if (json?.ok === false || json?.data?.ok === false || json?.success === false) reject(new Error(String(json.error || json.data?.error || json.msg || "Backend lỗi")));
      else resolve(json?.data || json);
    };
    script.onerror = () => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      delete callbacks[cb];
      script.remove();
      reject(new Error("Không gọi được Apps Script"));
    };
    timeout = window.setTimeout(() => {
      if (done) return;
      done = true;
      delete callbacks[cb];
      script.remove();
      reject(new Error("Apps Script phản hồi quá lâu"));
    }, 12000);
    script.src = url.toString();
    document.head.appendChild(script);
  });
}

async function sasSaveNow() {
  clearTimeout(sasTimer);
  sasTimer = 0;
  if (!sasCanAutoSave() || !sasWindowVisible()) return;
  const nowSignature = sasSignature();
  if (!nowSignature || nowSignature === sasLastSignature) return;
  if (sasSaving) {
    sasQueued = true;
    return;
  }
  sasSaving = true;
  sasToast("Đang tự lưu sơ đồ...", "save");
  try {
    const layout = sasSnapshot();
    const response = await sasGas("saveSeatingChart", {
      id: sasChartId() || null,
      chartId: sasChartId() || null,
      title: sasTitle(),
      chartTitle: sasTitle(),
      layout,
      makeActive: true,
      autosave: true,
      actor: sasActor(),
    });
    const chart = response?.chart || response?.data?.chart;
    if (chart?.id) localStorage.setItem(SAS_CURRENT_KEY, String(chart.id));
    sasLastSignature = sasSignature();
    sasToast(`Đã tự lưu lúc ${new Date().toLocaleTimeString("vi-VN")}`, "ok");
    window.dispatchEvent(new CustomEvent("a3k64:seating-autosaved", { detail: { chart } }));
  } catch (error) {
    console.error("Tự lưu sơ đồ thất bại:", error);
    sasToast("Tự lưu thất bại, bấm Lưu sơ đồ để thử lại.", "error");
  } finally {
    sasSaving = false;
    if (sasQueued) {
      sasQueued = false;
      sasSchedule("queued");
    }
  }
}

function sasSchedule(reason = "change") {
  if (!sasCanAutoSave() || !sasWindowVisible()) return;
  if (Date.now() < sasIgnoreUntil) return;
  const nextSignature = sasSignature();
  if (!nextSignature || nextSignature === sasLastSignature) return;
  clearTimeout(sasTimer);
  sasToast("Đang chờ tự lưu...", "wait");
  sasTimer = window.setTimeout(() => void sasSaveNow(), SAS_DELAY_MS);
}

function sasSeedSignature(delay = 0) {
  window.setTimeout(() => { sasLastSignature = sasSignature(); }, delay);
}

function sasIgnoreBackendPaint(ms = 1800) {
  sasIgnoreUntil = Date.now() + ms;
  clearTimeout(sasTimer);
  document.getElementById("a3-seat-autosave-toast")?.remove();
  window.setTimeout(() => sasSeedSignature(0), ms + 60);
}

function sasBindUserEvents() {
  document.addEventListener("dragstart", (event) => {
    if (!(event.target as HTMLElement | null)?.closest?.(SAS_WIN)) return;
    clearTimeout(sasTimer);
  }, true);
  document.addEventListener("drop", (event) => {
    if (!(event.target as HTMLElement | null)?.closest?.(SAS_WIN)) return;
    setTimeout(() => sasSchedule("drop"), 220);
  }, true);
  document.addEventListener("dragend", (event) => {
    if (!(event.target as HTMLElement | null)?.closest?.(SAS_WIN)) return;
    setTimeout(() => sasSchedule("dragend"), 260);
  }, true);
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest(`${SAS_WIN} .seat-ctrl-option`)) {
      sasIgnoreBackendPaint(2400);
      return;
    }
    const inSeat = Boolean(target.closest(SAS_WIN));
    const text = sasNorm(target.closest("button")?.textContent || target.textContent || "");
    if (inSeat && (text.includes("random") || text.includes("khoiphuc"))) {
      setTimeout(() => sasSchedule("button"), 260);
      return;
    }
    if (text === "xoa" || text.includes("xoa")) {
      setTimeout(() => sasSchedule("delete"), 260);
    }
  }, true);
}

function sasBoot() {
  if (sasReady) return;
  sasReady = true;
  sasStyle();
  sasSeedSignature(2000);
  sasBindUserEvents();
  window.addEventListener("a3k64:seating-backend-synced", () => sasIgnoreBackendPaint(2200));
  window.addEventListener("a3k64:seating-changed", (event: Event) => {
    const detail = (event as CustomEvent).detail || {};
    const source = String(detail?.source || "");
    if (!source || source.includes("backend") || source.includes("sync") || source.includes("open")) {
      sasIgnoreBackendPaint(1800);
      return;
    }
    if (source.includes("user") || source.includes("drag") || source.includes("random") || source.includes("restore")) {
      setTimeout(() => sasSchedule("event"), 160);
    }
  });
  window.addEventListener("beforeunload", () => {
    if (sasTimer && sasCanAutoSave()) void sasSaveNow();
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sasBoot);
else sasBoot();

export {};
