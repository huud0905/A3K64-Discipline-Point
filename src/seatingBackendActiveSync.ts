const SBS_WIN = "#a3k64-seating-window";
const SBS_MAP_KEY = "a3k64-seating-map-v1";
const SBS_ROOM_KEY = "a3k64-stable-room-slot-map-v1";
const SBS_CURRENT_KEY = "a3k64-seating-sheet-current-id-v1";
const SBS_GAS_URL = String(import.meta.env.VITE_GAS_WEB_APP_URL || "").trim();
let sbsReady = false;
let sbsBusy = false;
let sbsLastKey = "";
let sbsLoop = 0;
let sbsLoopCount = 0;

type SbsChart = { id: string; title: string; active?: boolean; updatedAt?: string; version?: number; layout?: any };
type SbsSeats = { left: string[][]; right: string[][] };

function sbsNorm(v: unknown) {
  return String(v || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "");
}

function sbsActorRole() {
  try {
    const session = JSON.parse(localStorage.getItem("a3k64-login-session-v1") || "null");
    const user = session?.user || session || {};
    return String(user.role || user.userRole || "");
  } catch {
    return "";
  }
}

function sbsIsAdmin() {
  const role = sbsNorm(sbsActorRole());
  return role.includes("gvcn") || role.includes("loptruong") || role.includes("bithu") || role.includes("admin");
}

function sbsWindowVisible() {
  const win = document.querySelector<HTMLElement>(SBS_WIN);
  if (!win) return false;
  const rect = win.getBoundingClientRect();
  const css = getComputedStyle(win);
  return rect.width > 0 && rect.height > 0 && css.display !== "none" && css.visibility !== "hidden";
}

function sbsTitle() {
  return document.querySelector<HTMLElement>(`${SBS_WIN} .seat-ctrl-trigger span`)?.textContent?.trim() || "Sơ đồ hiện tại";
}

function sbsStoredId() {
  const id = localStorage.getItem(SBS_CURRENT_KEY) || "";
  return id && id !== "default" ? id : "";
}

function sbsGas(action: string, payload?: unknown): Promise<any> {
  if (!SBS_GAS_URL) return Promise.reject(new Error("Thiếu VITE_GAS_WEB_APP_URL"));
  return new Promise((resolve, reject) => {
    const callbackName = `__a3sbs_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const callbacks = window as typeof window & Record<string, unknown>;
    const script = document.createElement("script");
    const url = new URL(SBS_GAS_URL);
    let settled = false;
    let timeout = 0;
    url.searchParams.set("action", action);
    url.searchParams.set("callback", callbackName);
    url.searchParams.set("t", String(Date.now()));
    if (payload !== undefined) url.searchParams.set("payload", JSON.stringify(payload));
    callbacks[callbackName] = (json: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      delete callbacks[callbackName];
      script.remove();
      if (json?.ok === false || json?.data?.ok === false || json?.success === false) reject(new Error(String(json.error || json.data?.error || "Backend lỗi")));
      else resolve(json?.data || json);
    };
    script.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      delete callbacks[callbackName];
      script.remove();
      reject(new Error("Không gọi được Apps Script"));
    };
    timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      delete callbacks[callbackName];
      script.remove();
      reject(new Error("Apps Script phản hồi quá lâu"));
    }, 9000);
    script.src = url.toString();
    document.head.appendChild(script);
  });
}

function sbsCharts(raw: any): SbsChart[] {
  const list = raw?.charts || raw?.data?.charts || raw?.data?.data?.charts || [];
  return Array.isArray(list) ? list.map((item) => ({
    id: String(item?.id || item?.chartId || item?.chart_id || "").trim(),
    title: String(item?.title || item?.chartTitle || item?.chart_title || "").trim(),
    active: item?.active === true || String(item?.active || item?.is_active || "").toLowerCase() === "true",
    updatedAt: String(item?.updatedAt || item?.updated_at || ""),
    version: Number(item?.version || 0) || 0,
    layout: item?.layout,
  })).filter((item) => item.id || item.title) : [];
}

function sbsRows(rows: any[]): string[][] {
  return Array.from({ length: 7 }, (_, rowIndex) => {
    const row = Array.isArray(rows?.[rowIndex]) ? rows[rowIndex] : [];
    return Array.from({ length: 4 }, (_, seatIndex) => String(row[seatIndex] || "").trim());
  });
}

function sbsSeatsFromLayout(layout: any): SbsSeats | null {
  const source = layout?.seats || layout;
  if (!source || !Array.isArray(source.left) || !Array.isArray(source.right)) return null;
  return { left: sbsRows(source.left), right: sbsRows(source.right) };
}

function sbsPickChart(charts: SbsChart[]) {
  const title = sbsTitle();
  const stored = sbsStoredId();
  const n = String(title).match(/\d+/)?.[0] || "";
  if (sbsIsAdmin()) {
    return (stored ? charts.find((chart) => chart.id === stored) : null)
      || charts.find((chart) => chart.active)
      || charts[0]
      || null;
  }
  return charts.find((chart) => chart.active)
    || (n ? charts.find((chart) => (String(chart.title).match(/\d+/)?.[0] || "") === n && sbsNorm(chart.title).includes("sodo")) : null)
    || charts[0]
    || null;
}

function sbsPaint(seats: SbsSeats) {
  document.querySelectorAll<HTMLElement>(`${SBS_WIN} .stable-seat-cell`).forEach((cell) => {
    const side = cell.dataset.side === "right" ? "right" : cell.dataset.side === "left" ? "left" : null;
    const row = Number(cell.dataset.row);
    const seat = Number(cell.dataset.seat);
    if (!side || !Number.isFinite(row) || !Number.isFinite(seat)) return;
    const name = seats[side][row]?.[seat] || "";
    cell.textContent = name || "Trống";
    cell.classList.toggle("empty", !name);
    cell.draggable = Boolean(name && !document.documentElement.classList.contains("a3-seat-viewer-readonly"));
  });
  localStorage.setItem(SBS_MAP_KEY, JSON.stringify(seats));
}

async function sbsSyncOnce(force = false) {
  if (sbsBusy || !sbsWindowVisible()) return;
  sbsBusy = true;
  try {
    const listResponse = await sbsGas("listSeatingCharts", {});
    const charts = sbsCharts(listResponse);
    const selected = sbsPickChart(charts);
    if (!selected) return;
    const key = `${selected.id}|${selected.updatedAt || ""}|${selected.version || ""}`;
    if (!force && key && key === sbsLastKey) return;
    const chartResponse = await sbsGas("getSeatingChart", { id: selected.id, chartId: selected.id, title: selected.title, chartTitle: selected.title });
    const chart = chartResponse?.chart || chartResponse?.data?.chart || selected;
    const layout = chart?.layout || selected.layout || {};
    const seats = sbsSeatsFromLayout(layout);
    if (!seats) return;
    if (layout.room) localStorage.setItem(SBS_ROOM_KEY, JSON.stringify(layout.room));
    else localStorage.removeItem(SBS_ROOM_KEY);
    if (selected.id) localStorage.setItem(SBS_CURRENT_KEY, selected.id);
    sbsPaint(seats);
    sbsLastKey = key || `${selected.id}|${Date.now()}`;
    window.dispatchEvent(new CustomEvent("a3k64:seating-backend-synced", { detail: { chart: selected, seats } }));
    window.dispatchEvent(new CustomEvent("a3k64:seating-changed", { detail: { chart: selected, source: "backend-active-sync" } }));
  } catch (error) {
    console.warn("Không đồng bộ được sơ đồ từ backend:", error);
  } finally {
    sbsBusy = false;
  }
}

function sbsBoot() {
  if (sbsReady) return;
  sbsReady = true;
  void sbsSyncOnce(true);
  sbsLoop = window.setInterval(() => {
    void sbsSyncOnce(false);
    sbsLoopCount += 1;
    if (sbsLoopCount > 120 && sbsLoop) {
      clearInterval(sbsLoop);
      sbsLoop = 0;
    }
  }, 2000);
  window.addEventListener("a3k64:seating-changed", () => setTimeout(() => void sbsSyncOnce(false), 120));
  window.addEventListener("focus", () => setTimeout(() => void sbsSyncOnce(true), 150));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sbsBoot);
else sbsBoot();

export {};
