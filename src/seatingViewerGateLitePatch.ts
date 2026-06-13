const SEAT_VIEW_GATE_WINDOW = "#a3k64-seating-window";
const SEAT_VIEW_GATE_STYLE_ID = "a3k64-seat-view-gate-lite-style";
const SEAT_VIEW_GATE_LOCAL_KEY = "a3k64-seating-publish-lite-v1";
const SEAT_VIEW_GATE_GAS_URL = String(import.meta.env.VITE_GAS_WEB_APP_URL || "").trim();
let seatViewGateCount = 0;
let seatViewGateTimer = 0;

type SeatViewGateConfig = {
  status: "private" | "published";
};

function seatViewGateNorm(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9_]+/g, "_");
}

function seatViewGateActor() {
  try {
    const session = JSON.parse(localStorage.getItem("a3k64-login-session-v1") || "null");
    const user = session?.user || session || {};
    return { role: String(user.role || user.userRole || "") };
  } catch {
    return { role: "" };
  }
}

function seatViewGateIsAdmin() {
  const role = seatViewGateNorm(seatViewGateActor().role);
  return role.includes("gvcn") || role.includes("lop_truong") || role.includes("bi_thu") || role.includes("admin");
}

function seatViewGateCleanStatus(value: unknown): "private" | "published" {
  return String(value || "") === "published" ? "published" : "private";
}

function seatViewGateLocal(): SeatViewGateConfig {
  try {
    const data = JSON.parse(localStorage.getItem(SEAT_VIEW_GATE_LOCAL_KEY) || "{}");
    return { status: seatViewGateCleanStatus(data.status) };
  } catch {
    return { status: "private" };
  }
}

function seatViewGateNormalize(raw: any): SeatViewGateConfig | null {
  const source = raw?.access || raw?.data?.access || raw?.config || raw?.data?.config || raw;
  if (!source) return null;
  return { status: seatViewGateCleanStatus(source.status) };
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
  try {
    const response = await seatViewGateGas("getSeatingAccess");
    const config = seatViewGateNormalize(response);
    if (config) {
      localStorage.setItem(SEAT_VIEW_GATE_LOCAL_KEY, JSON.stringify(config));
      return config;
    }
  } catch (error) {
    console.warn("Không đọc được getSeatingAccess, dùng local:", error);
  }
  return seatViewGateLocal();
}

function seatViewGateCanView(config: SeatViewGateConfig) {
  if (seatViewGateIsAdmin()) return true;
  return config.status === "published";
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
    html.a3-seat-viewer-denied ${SEAT_VIEW_GATE_WINDOW} .stable-seat-tools{
      visibility:hidden!important;opacity:0!important;pointer-events:none!important;
    }
    html.a3-seat-viewer-checking ${SEAT_VIEW_GATE_WINDOW}::after,
    html.a3-seat-viewer-denied ${SEAT_VIEW_GATE_WINDOW}::after{
      content:attr(data-seat-gate-message);
      position:absolute;inset:76px 22px 22px;z-index:80;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;border:1px solid #cbd5e1;border-radius:22px;background:rgba(255,255,255,.985);color:#0f172a;font-weight:1000;font-size:18px;line-height:1.5;box-shadow:0 24px 70px rgba(15,23,42,.16);
    }
    .theme-dark html.a3-seat-viewer-checking ${SEAT_VIEW_GATE_WINDOW}::after,
    .theme-dark html.a3-seat-viewer-denied ${SEAT_VIEW_GATE_WINDOW}::after,
    html.a3-overlay-dark.a3-seat-viewer-checking ${SEAT_VIEW_GATE_WINDOW}::after,
    html.a3-overlay-dark.a3-seat-viewer-denied ${SEAT_VIEW_GATE_WINDOW}::after{
      border-color:#334155;background:rgba(15,23,42,.985);color:#f8fafc;box-shadow:0 24px 80px rgba(0,0,0,.36);
    }
  `;
  document.head.appendChild(style);
}

function seatViewGateSetState(state: "checking" | "allowed" | "denied", message = "") {
  const root = document.documentElement;
  root.classList.toggle("a3-seat-viewer-checking", state === "checking");
  root.classList.toggle("a3-seat-viewer-denied", state === "denied");
  const win = document.querySelector<HTMLElement>(SEAT_VIEW_GATE_WINDOW);
  if (win) win.dataset.seatGateMessage = message;
}

async function seatViewGateCheck() {
  injectSeatViewGateStyle();
  if (seatViewGateIsAdmin()) {
    seatViewGateSetState("allowed");
    return;
  }
  seatViewGateSetState("checking", "Đang kiểm tra quyền xem sơ đồ...");
  const config = await seatViewGateLoad();
  if (seatViewGateCanView(config)) {
    seatViewGateSetState("allowed");
  } else {
    seatViewGateSetState("denied", "Sơ đồ chỗ ngồi đang ở chế độ riêng tư.");
  }
}

function bootSeatViewGate() {
  injectSeatViewGateStyle();
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
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootSeatViewGate);
else bootSeatViewGate();

export {};
