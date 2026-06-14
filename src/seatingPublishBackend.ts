const SEAT_PUB_BACKEND_WINDOW = "#a3k64-seating-window";
const SEAT_PUB_BACKEND_KEY = "a3k64-seating-publish-lite-v1";
const SEAT_PUB_BACKEND_CHART_KEY = "a3k64-seating-sheet-current-id-v1";
const SEAT_PUB_BACKEND_GAS_URL = String(import.meta.env.VITE_GAS_WEB_APP_URL || "").trim();

let seatPubBackendToastTimer = 0;
let seatPubBackendBound = false;

type SeatPubBackendStatus = "private" | "preview" | "published";
type SeatPubBackendConfig = {
  chartId: string;
  chartTitle: string;
  status: SeatPubBackendStatus;
  previewStudents: string;
  publishAt: string;
  updatedAt: string;
  updatedBy: string;
};

function seatPubBackendChartId() {
  return localStorage.getItem(SEAT_PUB_BACKEND_CHART_KEY) || "default";
}

function seatPubBackendChartTitle() {
  return document.querySelector<HTMLElement>(`${SEAT_PUB_BACKEND_WINDOW} .seat-ctrl-trigger span`)?.textContent?.trim() || "Sơ đồ hiện tại";
}

function seatPubBackendLocalKey(chartId = seatPubBackendChartId()) {
  return `${SEAT_PUB_BACKEND_KEY}:${chartId || "default"}`;
}

function seatPubBackendActor() {
  try {
    const session = JSON.parse(localStorage.getItem("a3k64-login-session-v1") || "null");
    const user = session?.user || session || {};
    return {
      name: String(user.name || user.fullName || user.studentName || user.displayName || user.hoTen || user.username || user.email || ""),
      email: String(user.email || ""),
      role: String(user.role || user.userRole || ""),
    };
  } catch {
    return { name: "", email: "", role: "" };
  }
}

function seatPubBackendFold(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[\s_-]+/g, "");
}

function seatPubBackendStatus(value: unknown): SeatPubBackendStatus {
  const raw = seatPubBackendFold(value);
  if (raw === "preview" || raw === "xemtruoc") return "preview";
  if (["published", "publish", "public", "congbo", "congkhai", "scheduled", "hengio", "dahengio"].includes(raw)) return "published";
  return "private";
}

function seatPubBackendDateMs(value: string) {
  const time = new Date(value || "").getTime();
  return Number.isFinite(time) ? time : 0;
}

function seatPubBackendStatusText(config: Pick<SeatPubBackendConfig, "status" | "publishAt">) {
  if (config.status === "published" && seatPubBackendDateMs(config.publishAt) > Date.now()) return "Hẹn giờ công bố";
  if (config.status === "published") return "Đã công bố";
  if (config.status === "preview") return "Xem trước";
  return "Riêng tư";
}

function seatPubBackendEscape(value: unknown) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function seatPubBackendFromLocalInput(value: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

function seatPubBackendToast(message: string, done = false) {
  clearTimeout(seatPubBackendToastTimer);
  document.getElementById("a3-seat-pub-backend-toast")?.remove();
  const toast = document.createElement("div");
  toast.id = "a3-seat-pub-backend-toast";
  if (done) toast.classList.add("done");
  toast.innerHTML = `<span class="spin"></span><span>${seatPubBackendEscape(message)}</span>`;
  document.body.appendChild(toast);
  seatPubBackendToastTimer = window.setTimeout(() => toast.remove(), done ? 1600 : 9000);
}

function seatPubBackendInjectStyle() {
  if (document.getElementById("a3-seat-pub-backend-style")) return;
  const style = document.createElement("style");
  style.id = "a3-seat-pub-backend-style";
  style.textContent = `
    #a3-seat-pub-backend-toast{position:fixed;left:50%;top:74px;transform:translateX(-50%);z-index:1000001;display:flex;align-items:center;gap:10px;padding:10px 14px;border:1px solid rgba(20,184,166,.65);border-radius:16px;background:rgba(255,255,255,.985);color:#0f172a;box-shadow:0 20px 58px rgba(15,23,42,.18);font-size:14px;font-weight:900;pointer-events:none;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",Arial,sans-serif}
    #a3-seat-pub-backend-toast .spin{width:15px;height:15px;border-radius:999px;border:2px solid rgba(15,23,42,.16);border-top-color:var(--desktop-accent,#14b8a6);animation:a3SeatPubBackendSpin .72s linear infinite}#a3-seat-pub-backend-toast.done .spin{animation:none;border-color:var(--desktop-accent,#14b8a6);background:var(--desktop-accent,#14b8a6);box-shadow:inset 0 0 0 4px #fff}.theme-dark #a3-seat-pub-backend-toast,html.a3-overlay-dark #a3-seat-pub-backend-toast{background:rgba(15,23,42,.96);color:#f8fafc;box-shadow:0 22px 68px rgba(0,0,0,.36)}.theme-dark #a3-seat-pub-backend-toast .spin,html.a3-overlay-dark #a3-seat-pub-backend-toast .spin{border-color:rgba(255,255,255,.28);border-top-color:#5eead4}@keyframes a3SeatPubBackendSpin{to{transform:rotate(360deg)}}
  `;
  document.head.appendChild(style);
}

function seatPubBackendGas(action: string, payload?: unknown): Promise<any> {
  if (!SEAT_PUB_BACKEND_GAS_URL) return Promise.reject(new Error("Thiếu VITE_GAS_WEB_APP_URL"));
  return new Promise((resolve, reject) => {
    const callbackName = `__a3SeatPubBackend_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const callbacks = window as typeof window & Record<string, unknown>;
    const script = document.createElement("script");
    const url = new URL(SEAT_PUB_BACKEND_GAS_URL);
    let done = false;
    let timeout = 0;
    url.searchParams.set("action", action);
    url.searchParams.set("callback", callbackName);
    url.searchParams.set("t", String(Date.now()));
    if (payload !== undefined) url.searchParams.set("payload", JSON.stringify(payload));
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
    }, 10000);
    script.src = url.toString();
    document.head.appendChild(script);
  });
}

function seatPubBackendNormalize(raw: any, chartId = seatPubBackendChartId()): SeatPubBackendConfig | null {
  const source = raw?.access || raw?.data?.access || raw?.config || raw?.data?.config || raw;
  if (!source) return null;
  return {
    chartId: String(source.chartId || source.chart_id || chartId || "default"),
    chartTitle: String(source.chartTitle || source.chart_title || source.title || seatPubBackendChartTitle()),
    status: seatPubBackendStatus(source.status),
    previewStudents: String(source.previewStudents || source.preview_students || ""),
    publishAt: String(source.publishAt || source.publish_at || ""),
    updatedAt: String(source.updatedAt || source.updated_at || ""),
    updatedBy: String(source.updatedBy || source.updated_by || ""),
  };
}

function seatPubBackendReadLocal(): SeatPubBackendConfig {
  const chartId = seatPubBackendChartId();
  try {
    const data = JSON.parse(localStorage.getItem(seatPubBackendLocalKey(chartId)) || "{}");
    return {
      chartId,
      chartTitle: String(data.chartTitle || data.chart_title || seatPubBackendChartTitle()),
      status: seatPubBackendStatus(data.status),
      previewStudents: String(data.previewStudents || data.preview_students || ""),
      publishAt: String(data.publishAt || data.publish_at || ""),
      updatedAt: String(data.updatedAt || data.updated_at || ""),
      updatedBy: String(data.updatedBy || data.updated_by || ""),
    };
  } catch {
    return { chartId, chartTitle: seatPubBackendChartTitle(), status: "private", previewStudents: "", publishAt: "", updatedAt: "", updatedBy: "" };
  }
}

function seatPubBackendAssertSaved(wanted: SeatPubBackendConfig, saved: SeatPubBackendConfig | null) {
  if (!saved) throw new Error("Backend không trả dữ liệu công bố.");
  if (saved.status !== wanted.status) throw new Error(`Backend không lưu đúng trạng thái: ${saved.status}`);
  if (wanted.status === "published") {
    const wantedTime = seatPubBackendDateMs(wanted.publishAt);
    const savedTime = seatPubBackendDateMs(saved.publishAt);
    if (wantedTime && Math.abs(wantedTime - savedTime) > 60000) throw new Error("Backend không lưu đúng giờ hẹn công bố.");
  }
}

async function seatPubBackendSave(wanted: SeatPubBackendConfig) {
  const next = {
    ...wanted,
    status: seatPubBackendStatus(wanted.status),
    previewStudents: wanted.status === "private" ? "" : String(wanted.previewStudents || ""),
    publishAt: wanted.status === "published" ? String(wanted.publishAt || "") : "",
    updatedAt: new Date().toISOString(),
    updatedBy: seatPubBackendActor().name,
  };
  const response = await seatPubBackendGas("saveSeatingAccess", { ...next, actor: seatPubBackendActor() });
  const saved = seatPubBackendNormalize(response, next.chartId);
  seatPubBackendAssertSaved(next, saved);
  localStorage.setItem(seatPubBackendLocalKey(saved!.chartId), JSON.stringify(saved));
  window.dispatchEvent(new CustomEvent("a3k64:seating-access-updated", { detail: saved }));
  window.dispatchEvent(new CustomEvent("a3k64:seating-changed", { detail: { access: saved } }));
  return saved!;
}

function seatPubBackendConfigFromSettingsModal(): SeatPubBackendConfig | null {
  const modal = document.querySelector<HTMLElement>(".seat-pub-lite-backdrop .seat-pub-lite-modal");
  if (!modal || !modal.querySelector("[data-save]")) return null;
  const title = seatPubBackendChartTitle();
  const modeText = modal.querySelector<HTMLElement>(".seat-pub-lite-trigger span")?.textContent || "";
  const uiMode: "private" | "preview_publish" = modeText.includes("Xem trước") ? "preview_publish" : "private";
  const publishEnabled = Boolean(modal.querySelector<HTMLInputElement>("[data-publish-enabled]")?.checked);
  const scheduleActive = modal.querySelector<HTMLElement>("[data-pub-mode='schedule']")?.classList.contains("active");
  const rawTime = modal.querySelector<HTMLInputElement>("[data-publish-at]")?.value || "";
  const status: SeatPubBackendStatus = uiMode === "private" ? "private" : publishEnabled ? "published" : "preview";
  const publishAt = status === "published" && scheduleActive ? seatPubBackendFromLocalInput(rawTime) : "";
  if (status === "published" && scheduleActive && !publishAt) throw new Error("Chọn giờ công bố trước khi lưu.");
  return {
    ...seatPubBackendReadLocal(),
    chartId: seatPubBackendChartId(),
    chartTitle: title,
    status,
    publishAt,
    previewStudents: uiMode === "preview_publish" ? (modal.querySelector<HTMLTextAreaElement>("[data-preview]")?.value || "") : "",
  };
}

function seatPubBackendManageTarget(action: string): SeatPubBackendConfig {
  const current = seatPubBackendReadLocal();
  if (action === "private") return { ...current, status: "private", publishAt: "", previewStudents: "" };
  if (action === "preview") return { ...current, status: "preview", publishAt: "" };
  return { ...current, status: "published", publishAt: "" };
}

function seatPubBackendCloseModal() {
  document.querySelector(".seat-pub-lite-backdrop")?.remove();
}

function seatPubBackendBind() {
  if (seatPubBackendBound) return;
  seatPubBackendBound = true;
  seatPubBackendInjectStyle();
  document.addEventListener("click", async (event) => {
    const target = event.target as HTMLElement | null;
    const saveBtn = target?.closest?.(".seat-pub-lite-backdrop [data-save]") as HTMLButtonElement | null;
    const privateBtn = target?.closest?.(".seat-pub-lite-backdrop [data-private]") as HTMLButtonElement | null;
    const publishNowBtn = target?.closest?.(".seat-pub-lite-backdrop [data-publish-now]") as HTMLButtonElement | null;
    const previewBtn = target?.closest?.(".seat-pub-lite-backdrop [data-preview]") as HTMLButtonElement | null;
    const handledBtn = saveBtn || privateBtn || publishNowBtn || previewBtn;
    if (!handledBtn) return;
    event.preventDefault();
    event.stopPropagation();
    if ("stopImmediatePropagation" in event) event.stopImmediatePropagation();
    try {
      let config: SeatPubBackendConfig | null = null;
      if (saveBtn) config = seatPubBackendConfigFromSettingsModal();
      else if (privateBtn) config = seatPubBackendManageTarget("private");
      else if (previewBtn) config = seatPubBackendManageTarget("preview");
      else if (publishNowBtn) config = seatPubBackendManageTarget("published");
      if (!config) return;
      handledBtn.disabled = true;
      const oldText = handledBtn.textContent || "Lưu";
      handledBtn.textContent = "Đang lưu...";
      seatPubBackendToast("Đang lưu lên backend...");
      const saved = await seatPubBackendSave(config);
      seatPubBackendCloseModal();
      seatPubBackendToast(`${seatPubBackendStatusText(saved)} đã lưu lên backend.`, true);
      handledBtn.textContent = oldText;
    } catch (error) {
      console.error(error);
      handledBtn.disabled = false;
      seatPubBackendToast(error instanceof Error ? error.message : "Không lưu được lên backend. Quyền xem chưa thay đổi.");
    }
  }, true);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", seatPubBackendBind);
else seatPubBackendBind();

export {};
