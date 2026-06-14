const SEAT_VIEW_GATE_WINDOW = "#a3k64-seating-window";
const SEAT_VIEW_GATE_STYLE_ID = "a3k64-seat-view-gate-lite-style";
const SEAT_VIEW_GATE_LOCAL_KEY = "a3k64-seating-publish-lite-v1";
const SEAT_VIEW_CHART_KEY = "a3k64-seating-sheet-current-id-v1";
const SEAT_VIEW_GATE_GAS_URL = String(import.meta.env.VITE_GAS_WEB_APP_URL || "").trim();

let seatViewGateTimer = 0;
let seatViewGateCount = 0;
let seatViewGuardBound = false;
let seatViewLastAllowed = false;

type SeatViewGateStatus = "private" | "preview" | "published";
type SeatViewGateConfig = { status: SeatViewGateStatus; previewStudents: string; publishAt: string; chartId: string; updatedAt?: string; updatedBy?: string; backendOk?: boolean };
type SeatViewGateMode = "admin" | "preview-editor" | "public-viewer" | "denied";

function seatViewGateWindow() {
  return document.querySelector<HTMLElement>(SEAT_VIEW_GATE_WINDOW);
}

function seatViewGateWindowVisible() {
  const win = seatViewGateWindow();
  if (!win) return false;
  const rect = win.getBoundingClientRect();
  const style = window.getComputedStyle(win);
  return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
}

function seatViewGateClearGlobalUi() {
  const root = document.documentElement;
  root.classList.remove("a3-seat-viewer-checking", "a3-seat-viewer-denied", "a3-seat-viewer-readonly", "a3-seat-preview-editor");
  document.getElementById("a3-seat-view-gate-toast")?.remove();
  seatViewLastAllowed = false;
}

function seatViewGateCurrentChartId() {
  return localStorage.getItem(SEAT_VIEW_CHART_KEY) || "default";
}

function seatViewGateLocalKey(chartId = seatViewGateCurrentChartId()) {
  return `${SEAT_VIEW_GATE_LOCAL_KEY}:${chartId || "default"}`;
}

function seatViewGateNorm(value: unknown) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9@._-]+/g, " ").trim();
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
  const raw = seatViewGateCompact(value);
  if (raw === "preview" || raw === "xemtruoc") return "preview";
  if (raw === "published" || raw === "publish" || raw === "public" || raw === "congbo" || raw === "congkhai" || raw === "scheduled" || raw === "hengio") return "published";
  return "private";
}

function seatViewGatePrivate(chartId = seatViewGateCurrentChartId(), backendOk = false): SeatViewGateConfig {
  return { chartId, status: "private", previewStudents: "", publishAt: "", backendOk };
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
    updatedAt: source.updatedAt || source.updated_at,
    updatedBy: source.updatedBy || source.updated_by,
    backendOk: true,
  };
}

function seatViewGateGas(action: string): Promise<any | null> {
  if (!SEAT_VIEW_GATE_GAS_URL) return Promise.reject(new Error("Thiếu VITE_GAS_WEB_APP_URL"));
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
    const remote = seatViewGateNormalize(response);
    if (remote) {
      localStorage.setItem(seatViewGateLocalKey(chartId), JSON.stringify(remote));
      return remote;
    }
  } catch (error) {
    console.warn("Không đọc được quyền công bố từ backend, chặn xem để an toàn:", error);
  }
  return seatViewGatePrivate(chartId, false);
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
  const preview = String(config.previewStudents || "").split(/[\n,;]+/).map((item) => seatViewGateCompact(item)).filter(Boolean);
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

function seatViewGateMode(config: SeatViewGateConfig): SeatViewGateMode {
  if (seatViewGateIsAdmin()) return "admin";
  if (!config.backendOk) return "denied";
  if (seatViewGatePreviewAllowed(config)) return "preview-editor";
  if (config.status === "published" && seatViewGatePublishPassed(config)) return "public-viewer";
  return "denied";
}

function seatViewGateDeniedText(config: SeatViewGateConfig) {
  if (!config.backendOk) return "Không xác minh được quyền xem từ backend.\nVui lòng tải lại hoặc báo quản trị viên.";
  if (config.status === "published" && config.publishAt && !seatViewGatePublishPassed(config)) return "Sơ đồ đã được lên lịch công bố.\nMở lúc " + new Date(config.publishAt).toLocaleString("vi-VN") + ".";
  if (config.status === "preview") return "Sơ đồ đang ở chế độ xem trước.\nTài khoản này chưa nằm trong danh sách được xem.";
  return "Sơ đồ chỗ ngồi đang ở chế độ riêng tư.";
}

function seatViewGateToast(message: string, mode: "checking" | "ok" = "checking") {
  if (!seatViewGateWindowVisible()) return;
  document.getElementById("a3-seat-view-gate-toast")?.remove();
  const toast = document.createElement("div");
  toast.id = "a3-seat-view-gate-toast";
  toast.className = mode === "ok" ? "ok" : "checking";
  toast.innerHTML = `<span class="spin"></span><span>${message}</span>`;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), mode === "ok" ? 1200 : 2600);
}

function injectSeatViewGateStyle() {
  if (document.getElementById(SEAT_VIEW_GATE_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SEAT_VIEW_GATE_STYLE_ID;
  style.textContent = `
    html.a3-seat-viewer-denied ${SEAT_VIEW_GATE_WINDOW} .stable-seat-board,
    html.a3-seat-viewer-denied ${SEAT_VIEW_GATE_WINDOW} .stable-seat-student-panel,
    html.a3-seat-viewer-denied ${SEAT_VIEW_GATE_WINDOW} .stable-seat-tools{visibility:hidden!important;opacity:0!important;pointer-events:none!important;}
    html.a3-seat-viewer-denied ${SEAT_VIEW_GATE_WINDOW}::after{white-space:pre-line;content:attr(data-seat-gate-message);position:absolute;inset:76px 22px 22px;z-index:80;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;border:1px solid #cbd5e1;border-radius:22px;background:rgba(255,255,255,.985);color:#0f172a;font-weight:1000;font-size:18px;line-height:1.5;box-shadow:0 24px 70px rgba(15,23,42,.16);}
    .theme-dark html.a3-seat-viewer-denied ${SEAT_VIEW_GATE_WINDOW}::after,html.a3-overlay-dark.a3-seat-viewer-denied ${SEAT_VIEW_GATE_WINDOW}::after{border-color:#334155;background:rgba(15,23,42,.985);color:#f8fafc;box-shadow:0 24px 80px rgba(0,0,0,.36);}
    html.a3-seat-viewer-readonly ${SEAT_VIEW_GATE_WINDOW} [data-tool='edit'],
    html.a3-seat-viewer-readonly ${SEAT_VIEW_GATE_WINDOW} [data-tool='reset'],
    html.a3-seat-viewer-readonly ${SEAT_VIEW_GATE_WINDOW} [data-seat-random],
    html.a3-seat-viewer-readonly ${SEAT_VIEW_GATE_WINDOW} .seat-ctrl-btn,
    html.a3-seat-viewer-readonly ${SEAT_VIEW_GATE_WINDOW} .seat-pub-lite-btn{display:none!important;}
    html.a3-seat-viewer-readonly ${SEAT_VIEW_GATE_WINDOW} .stable-seat-student-card,
    html.a3-seat-viewer-readonly ${SEAT_VIEW_GATE_WINDOW} .stable-seat-cell{cursor:default!important;}
    #a3-seat-view-gate-toast{position:fixed;left:50%;top:72px;transform:translateX(-50%);z-index:1000000;display:flex;align-items:center;gap:10px;padding:9px 13px;border:1px solid rgba(20,184,166,.7);border-radius:15px;background:rgba(255,255,255,.985);color:#0f172a;box-shadow:0 18px 50px rgba(15,23,42,.18);font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",Arial,sans-serif;font-size:13px;font-weight:900;pointer-events:none;}
    #a3-seat-view-gate-toast .spin{width:14px;height:14px;border-radius:999px;border:2px solid rgba(15,23,42,.16);border-top-color:var(--desktop-accent,#14b8a6);animation:a3SeatGateSpin .72s linear infinite;}
    #a3-seat-view-gate-toast.ok .spin{animation:none;border-color:var(--desktop-accent,#14b8a6);background:var(--desktop-accent,#14b8a6);box-shadow:inset 0 0 0 4px #fff;}
    .theme-dark #a3-seat-view-gate-toast,html.a3-overlay-dark #a3-seat-view-gate-toast{background:rgba(15,23,42,.96);color:#f8fafc;box-shadow:0 22px 68px rgba(0,0,0,.36)}
    .theme-dark #a3-seat-view-gate-toast .spin,html.a3-overlay-dark #a3-seat-view-gate-toast .spin{border-color:rgba(255,255,255,.28);border-top-color:#5eead4}
    @keyframes a3SeatGateSpin{to{transform:rotate(360deg)}}
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

function seatViewGateSetState(state: "allowed" | "denied", message = "", readonly = false) {
  const root = document.documentElement;
  root.classList.remove("a3-seat-viewer-checking");
  root.classList.toggle("a3-seat-viewer-denied", state === "denied");
  root.classList.toggle("a3-seat-viewer-readonly", readonly);
  root.classList.toggle("a3-seat-preview-editor", state === "allowed" && !readonly && !seatViewGateIsAdmin());
  const win = seatViewGateWindow();
  if (win) win.dataset.seatGateMessage = message;
  seatViewLastAllowed = state === "allowed";
  seatViewGateApplyReadonlyDom();
}

async function seatViewGateCheck() {
  injectSeatViewGateStyle();
  seatViewGateBindReadonlyGuard();
  if (!seatViewGateWindowVisible()) {
    seatViewGateClearGlobalUi();
    return;
  }
  if (seatViewGateIsAdmin()) {
    seatViewGateSetState("allowed", "", false);
    return;
  }
  if (!seatViewLastAllowed && !document.documentElement.classList.contains("a3-seat-viewer-denied")) seatViewGateToast("Đang kiểm tra quyền xem sơ đồ...");
  const config = await seatViewGateLoad();
  if (!seatViewGateWindowVisible()) {
    seatViewGateClearGlobalUi();
    return;
  }
  const mode = seatViewGateMode(config);
  if (mode === "preview-editor") {
    const wasAllowed = seatViewLastAllowed;
    seatViewGateSetState("allowed", "", false);
    if (!wasAllowed) seatViewGateToast("Đã xác nhận quyền xem trước.", "ok");
  } else if (mode === "public-viewer") {
    const wasAllowed = seatViewLastAllowed;
    seatViewGateSetState("allowed", "", true);
    if (!wasAllowed) seatViewGateToast("Sơ đồ đã được công bố.", "ok");
  } else if (mode === "admin") {
    seatViewGateSetState("allowed", "", false);
  } else {
    seatViewGateSetState("denied", seatViewGateDeniedText(config), true);
  }
}

function bootSeatViewGate() {
  injectSeatViewGateStyle();
  seatViewGateBindReadonlyGuard();
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
  window.addEventListener("a3k64:seating-access-updated", () => setTimeout(() => void seatViewGateCheck(), 80));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootSeatViewGate);
else bootSeatViewGate();

export {};
