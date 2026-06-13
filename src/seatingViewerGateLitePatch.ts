const SEAT_VIEW_GATE_WINDOW = "#a3k64-seating-window";
const SEAT_VIEW_GATE_STYLE_ID = "a3k64-seat-view-gate-lite-style";
const SEAT_VIEW_GATE_LOCAL_KEY = "a3k64-seating-publish-lite-v1";
const SEAT_VIEW_CHART_KEY = "a3k64-seating-sheet-current-id-v1";
const SEAT_VIEW_GATE_GAS_URL = String(import.meta.env.VITE_GAS_WEB_APP_URL || "").trim();
let seatViewGateCount = 0;
let seatViewGateTimer = 0;
let seatViewGuardBound = false;

type SeatViewGateStatus = "private" | "preview" | "published";
type SeatViewGateConfig = { status: SeatViewGateStatus; previewStudents: string; publishAt: string; chartId: string };

function seatViewGateCurrentChartId() {
  return localStorage.getItem(SEAT_VIEW_CHART_KEY) || "default";
}

function seatViewGateLocalKey(chartId = seatViewGateCurrentChartId()) {
  return `${SEAT_VIEW_GATE_LOCAL_KEY}:${chartId || "default"}`;
}

function seatViewGateNorm(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9@._-]+/g, " ")
    .trim();
}

function seatViewGateCompact(value: unknown) {
  return seatViewGateNorm(value).replace(/\s+/g, "");
}

function seatViewGateActor() {
  try {
    const session = JSON.parse(localStorage.getItem("a3k64-login-session-v1") || "null");
    const user = session?.user || session || {};
    return {
      name: String(user.name || user.fullName || user.studentName || user.displayName || user.hoTen || user.username || ""),
      email: String(user.email || ""),
      username: String(user.username || ""),
      role: String(user.role || user.userRole || ""),
    };
  } catch {
    return { name: "", email: "", username: "", role: "" };
  }
}

function seatViewGateIsAdmin() {
  const role = seatViewGateNorm(seatViewGateActor().role).replace(/\s+/g, "_");
  return role.includes("gvcn") || role.includes("lop_truong") || role.includes("bi_thu") || role.includes("admin");
}

function seatViewGateCleanStatus(value: unknown): SeatViewGateStatus {
  const raw = String(value || "").trim();
  if (raw === "preview") return "preview";
  if (raw === "published") return "published";
  return "private";
}

function seatViewGateLocal(): SeatViewGateConfig {
  const chartId = seatViewGateCurrentChartId();
  try {
    const data = JSON.parse(localStorage.getItem(seatViewGateLocalKey(chartId)) || localStorage.getItem(SEAT_VIEW_GATE_LOCAL_KEY) || "{}");
    return {
      chartId,
      status: seatViewGateCleanStatus(data.status),
      previewStudents: String(data.previewStudents || data.preview_students || ""),
      publishAt: String(data.publishAt || data.publish_at || ""),
    };
  } catch {
    return { chartId, status: "private", previewStudents: "", publishAt: "" };
  }
}

function seatViewGateNormalize(raw: any): SeatViewGateConfig | null {
  const chartId = seatViewGateCurrentChartId();
  const source = raw?.access || raw?.data?.access || raw?.config || raw?.data?.config || raw;
  if (!source) return null;
  return {
    chartId: String(source.chartId || source.chart_id || chartId),
    status: seatViewGateCleanStatus(source.status),
    previewStudents: String(source.previewStudents || source.preview_students || ""),
    publishAt: String(source.publishAt || source.publish_at || ""),
  };
}

function seatViewGateGas(action: string): Promise<any | null> {
  if (!SEAT_VIEW_GATE_GAS_URL) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const callbackName = `__a3k64SeatGate_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const callbacks = window as typeof window & Record<string, unknown>;
    const script = document.createElement("script");
    const url = new URL(SEAT_VIEW_GATE_GAS_URL);
    let done = false;
    let timeout = 0;

    url.searchParams.set("action", action);
    url.searchParams.set("callback", callbackName);
    url.searchParams.set("t", String(Date.now()));
    url.searchParams.set("payload", JSON.stringify({ chartId: seatViewGateCurrentChartId() }));

    callbacks[callbackName] = (json: any) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      delete callbacks[callbackName];
      script.remove();
      if (json?.ok === false || json?.data?.ok === false) reject(new Error(String(json.error || json.data?.error || "Backend lỗi")));
      else resolve(json?.data || json);
    };

    script.onerror = () => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      delete callbacks[callbackName];
      script.remove();
      reject(new Error("Không gọi được Apps Script"));
    };

    timeout = window.setTimeout(() => {
      if (done) return;
      done = true;
      delete callbacks[callbackName];
      script.remove();
      reject(new Error("Apps Script phản hồi quá lâu"));
    }, 6000);

    script.src = url.toString();
    document.head.appendChild(script);
  });
}

async function seatViewGateLoad() {
  const chartId = seatViewGateCurrentChartId();
  try {
    const response = await seatViewGateGas("getSeatingAccess");
    const config = seatViewGateNormalize(response);
    if (config) {
      localStorage.setItem(seatViewGateLocalKey(chartId), JSON.stringify(config));
      return config;
    }
  } catch (error) {
    console.warn("Không đọc được getSeatingAccess, dùng local:", error);
  }
  return seatViewGateLocal();
}

function seatViewGateUserTokens() {
  const actor = seatViewGateActor();
  const out = new Set<string>();
  [actor.name, actor.email, actor.username].forEach((value) => {
    if (value) out.add(value);
    const beforeAt = String(value || "").split("@")[0];
    if (beforeAt) out.add(beforeAt);
    const noDigits = beforeAt.replace(/[0-9_.-]+/g, " ").trim();
    if (noDigits) out.add(noDigits);
  });
  return Array.from(out).map(seatViewGateCompact).filter(Boolean);
}

function seatViewGatePreviewAllowed(config: SeatViewGateConfig) {
  const preview = String(config.previewStudents || "")
    .split(/[\n,;]+/)
    .map((item) => seatViewGateCompact(item))
    .filter(Boolean);
  if (!preview.length) return false;
  const users = seatViewGateUserTokens();
  return users.some((user) => preview.some((token) => user.includes(token) || token.includes(user)));
}

function seatViewGatePublishPassed(config: SeatViewGateConfig) {
  if (!config.publishAt) return true;
  const time = new Date(config.publishAt).getTime();
  if (!Number.isFinite(time)) return true;
  return Date.now() >= time;
}

function seatViewGateCanView(config: SeatViewGateConfig) {
  if (seatViewGateIsAdmin()) return true;
  if (config.status === "published" && seatViewGatePublishPassed(config)) return true;
  if (config.status === "preview" && seatViewGatePreviewAllowed(config)) return true;
  return false;
}

function seatViewGateDeniedText(config: SeatViewGateConfig) {
  if (config.status === "published" && config.publishAt && !seatViewGatePublishPassed(config)) {
    return "Sơ đồ đã được lên lịch công bố.\A Mở lúc " + new Date(config.publishAt).toLocaleString("vi-VN") + ".";
  }
  if (config.status === "preview") return "Sơ đồ đang ở chế độ xem trước.\A Tài khoản này chưa nằm trong danh sách được xem.";
  return "Sơ đồ chỗ ngồi đang ở chế độ riêng tư.";
}

function injectSeatViewGateStyle() {
  if (document.getElementById(SEAT_VIEW_GATE_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SEAT_VIEW_GATE_STYLE_ID;
  style.textContent = `
    html.a3-seat-viewer-checking ${SEAT_VIEW_GATE_WINDOW} .stable-seat-board,
    html.a3-seat-viewer-checking ${SEAT_VIEW_GATE_WINDOW} .stable-seat-student-panel,
    html.a3-seat-viewer-checking ${SEAT_VIEW_GATE_WINDOW} .stable-seat-tools,
    html.a3-seat-viewer-denied ${SEAT_VIEW_GATE_WINDOW} .stable-seat-board,
    html.a3-seat-viewer-denied ${SEAT_VIEW_GATE_WINDOW} .stable-seat-student-panel,
    html.a3-seat-viewer-denied ${SEAT_VIEW_GATE_WINDOW} .stable-seat-tools{visibility:hidden!important;opacity:0!important;pointer-events:none!important;}
    html.a3-seat-viewer-checking ${SEAT_VIEW_GATE_WINDOW}::after,
    html.a3-seat-viewer-denied ${SEAT_VIEW_GATE_WINDOW}::after{white-space:pre-line;content:attr(data-seat-gate-message);position:absolute;inset:76px 22px 22px;z-index:80;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;border:1px solid #cbd5e1;border-radius:22px;background:rgba(255,255,255,.985);color:#0f172a;font-weight:1000;font-size:18px;line-height:1.5;box-shadow:0 24px 70px rgba(15,23,42,.16);}
    .theme-dark html.a3-seat-viewer-checking ${SEAT_VIEW_GATE_WINDOW}::after,.theme-dark html.a3-seat-viewer-denied ${SEAT_VIEW_GATE_WINDOW}::after,html.a3-overlay-dark.a3-seat-viewer-checking ${SEAT_VIEW_GATE_WINDOW}::after,html.a3-overlay-dark.a3-seat-viewer-denied ${SEAT_VIEW_GATE_WINDOW}::after{border-color:#334155;background:rgba(15,23,42,.985);color:#f8fafc;box-shadow:0 24px 80px rgba(0,0,0,.36);}
    html.a3-seat-viewer-readonly ${SEAT_VIEW_GATE_WINDOW} [data-tool='edit'],
    html.a3-seat-viewer-readonly ${SEAT_VIEW_GATE_WINDOW} [data-tool='reset'],
    html.a3-seat-viewer-readonly ${SEAT_VIEW_GATE_WINDOW} [data-seat-random],
    html.a3-seat-viewer-readonly ${SEAT_VIEW_GATE_WINDOW} .seat-ctrl-btn,
    html.a3-seat-viewer-readonly ${SEAT_VIEW_GATE_WINDOW} .seat-pub-lite-btn{display:none!important;}
    html.a3-seat-viewer-readonly ${SEAT_VIEW_GATE_WINDOW} .stable-seat-student-card,
    html.a3-seat-viewer-readonly ${SEAT_VIEW_GATE_WINDOW} .stable-seat-cell{cursor:default!important;}
  `;
  document.head.appendChild(style);
}

function seatViewGateApplyReadonlyDom() {
  if (!document.documentElement.classList.contains("a3-seat-viewer-readonly")) return;
  document.querySelectorAll<HTMLElement>(`${SEAT_VIEW_GATE_WINDOW} .stable-seat-student-card,${SEAT_VIEW_GATE_WINDOW} .stable-seat-cell`).forEach((node) => {
    node.draggable = false;
    node.classList.remove("drag-over");
  });
}

function seatViewGateBindReadonlyGuard() {
  if (seatViewGuardBound) return;
  seatViewGuardBound = true;
  ["dragstart", "dragover", "drop", "contextmenu"].forEach((type) => {
    document.addEventListener(type, (event) => {
      const target = event.target as HTMLElement | null;
      if (!document.documentElement.classList.contains("a3-seat-viewer-readonly")) return;
      if (!target?.closest?.(SEAT_VIEW_GATE_WINDOW)) return;
      event.preventDefault();
      event.stopPropagation();
      if ("stopImmediatePropagation" in event) event.stopImmediatePropagation();
    }, true);
  });
}

function seatViewGateSetState(state: "checking" | "allowed" | "denied", message = "", readonly = false) {
  const root = document.documentElement;
  root.classList.toggle("a3-seat-viewer-checking", state === "checking");
  root.classList.toggle("a3-seat-viewer-denied", state === "denied");
  root.classList.toggle("a3-seat-viewer-readonly", readonly);
  const win = document.querySelector<HTMLElement>(SEAT_VIEW_GATE_WINDOW);
  if (win) win.dataset.seatGateMessage = message;
  seatViewGateApplyReadonlyDom();
}

async function seatViewGateCheck() {
  injectSeatViewGateStyle();
  seatViewGateBindReadonlyGuard();
  if (seatViewGateIsAdmin()) {
    seatViewGateSetState("allowed", "", false);
    return;
  }
  seatViewGateSetState("checking", "Đang kiểm tra quyền xem sơ đồ...", true);
  const config = await seatViewGateLoad();
  if (seatViewGateCanView(config)) {
    seatViewGateSetState("allowed", "", true);
  } else {
    seatViewGateSetState("denied", seatViewGateDeniedText(config), true);
  }
}

function bootSeatViewGate() {
  injectSeatViewGateStyle();
  seatViewGateBindReadonlyGuard();
  if (!seatViewGateIsAdmin()) document.documentElement.classList.add("a3-seat-viewer-checking");
  void seatViewGateCheck();
  seatViewGateTimer = window.setInterval(() => {
    void seatViewGateCheck();
    seatViewGateCount += 1;
    if (seatViewGateCount > 120 && seatViewGateTimer) {
      clearInterval(seatViewGateTimer);
      seatViewGateTimer = 0;
    }
  }, 15000);
  window.addEventListener("a3k64:seating-changed", () => setTimeout(() => void seatViewGateCheck(), 80));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootSeatViewGate);
else bootSeatViewGate();

export {};
