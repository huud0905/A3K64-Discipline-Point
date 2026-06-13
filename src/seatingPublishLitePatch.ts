const SEAT_PUB_WINDOW = "#a3k64-seating-window";
const SEAT_PUB_STYLE_ID = "a3k64-seating-publish-lite-style";
const SEAT_PUB_KEY = "a3k64-seating-publish-lite-v1";
const SEAT_PUB_CHART_KEY = "a3k64-seating-sheet-current-id-v1";
const SEAT_PUB_GAS_URL = String(import.meta.env.VITE_GAS_WEB_APP_URL || "").trim();

let seatPubBooted = false;

type SeatPubStatus = "private" | "preview" | "published";
type SeatPubMode = "now" | "schedule";
type SeatPubUiMode = "private" | "preview_publish";
type SeatPubConfig = {
  chartId: string;
  chartTitle?: string;
  status: SeatPubStatus;
  publishAt: string;
  previewStudents: string;
  updatedAt?: string;
  updatedBy?: string;
};

function seatPubChartId() {
  return localStorage.getItem(SEAT_PUB_CHART_KEY) || "default";
}

function seatPubChartTitle() {
  const trigger = document.querySelector<HTMLElement>(`${SEAT_PUB_WINDOW} .seat-ctrl-trigger span`);
  return (trigger?.textContent || "Sơ đồ hiện tại").trim();
}

function seatPubLocalKey(chartId = seatPubChartId()) {
  return `${SEAT_PUB_KEY}:${chartId || "default"}`;
}

function seatPubStatus(value: unknown): SeatPubStatus {
  const raw = String(value || "").trim().toLowerCase();
  const folded = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[\s_-]+/g, "");
  if (folded === "preview" || folded === "xemtruoc") return "preview";
  if (folded === "published" || folded === "publish" || folded === "public" || folded === "congbo" || folded === "congkhai") return "published";
  return "private";
}

function seatPubStatusText(status: SeatPubStatus) {
  if (status === "published") return "Đã công bố";
  if (status === "preview") return "Xem trước";
  return "Riêng tư";
}

function seatPubModeText(mode: SeatPubUiMode) {
  return mode === "preview_publish" ? "Xem trước + Công bố" : "Riêng tư";
}

function seatPubUiMode(status: SeatPubStatus): SeatPubUiMode {
  return status === "private" ? "private" : "preview_publish";
}

function seatPubEscape(value: unknown) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function seatPubLocalInput(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

function seatPubReadLocal(chartId = seatPubChartId()): SeatPubConfig {
  try {
    const data = JSON.parse(localStorage.getItem(seatPubLocalKey(chartId)) || localStorage.getItem(SEAT_PUB_KEY) || "{}");
    return {
      chartId,
      chartTitle: String(data.chartTitle || data.chart_title || data.title || seatPubChartTitle()),
      status: seatPubStatus(data.status),
      publishAt: String(data.publishAt || data.publish_at || ""),
      previewStudents: String(data.previewStudents || data.preview_students || ""),
      updatedAt: data.updatedAt || data.updated_at,
      updatedBy: data.updatedBy || data.updated_by,
    };
  } catch {
    return { chartId, chartTitle: seatPubChartTitle(), status: "private", publishAt: "", previewStudents: "" };
  }
}

function seatPubSaveLocal(data: SeatPubConfig) {
  const chartId = data.chartId || seatPubChartId();
  localStorage.setItem(seatPubLocalKey(chartId), JSON.stringify({ ...data, chartId }));
}

function seatPubActor() {
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

function seatPubRole() {
  const role = seatPubActor().role.toLowerCase();
  return role.includes("gvcn") || role.includes("lop_truong") || role.includes("bi_thu") || role.includes("admin") ? "admin" : "viewer";
}

function seatPubGas(action: string, payload?: unknown): Promise<any | null> {
  if (!SEAT_PUB_GAS_URL) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const callbackName = `__a3k64SeatPub_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const callbacks = window as typeof window & Record<string, unknown>;
    const script = document.createElement("script");
    const url = new URL(SEAT_PUB_GAS_URL);
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

function seatPubNormalize(raw: any, chartId = seatPubChartId()): SeatPubConfig | null {
  const source = raw?.access || raw?.data?.access || raw?.config || raw?.data?.config || raw;
  if (!source) return null;
  return {
    chartId: String(source.chartId || source.chart_id || chartId || "default"),
    chartTitle: String(source.chartTitle || source.chart_title || source.title || seatPubChartTitle()),
    status: seatPubStatus(source.status),
    publishAt: String(source.publishAt || source.publish_at || ""),
    previewStudents: String(source.previewStudents || source.preview_students || ""),
    updatedAt: source.updatedAt || source.updated_at,
    updatedBy: source.updatedBy || source.updated_by,
  };
}

function seatPubPreferLocal(remote: SeatPubConfig | null, local: SeatPubConfig) {
  if (!remote) return local;
  const localHasAccess = local.status !== "private" || Boolean(local.publishAt || local.previewStudents);
  const remoteEmptyPrivate = remote.status === "private" && !remote.publishAt && !remote.previewStudents;
  if (remoteEmptyPrivate && localHasAccess) return local;
  return remote;
}

async function seatPubLoad(chartId = seatPubChartId()): Promise<SeatPubConfig> {
  const local = seatPubReadLocal(chartId);
  try {
    const response = await seatPubGas("getSeatingAccess", { chartId, chartTitle: seatPubChartTitle() });
    const remote = seatPubNormalize(response, chartId);
    const config = seatPubPreferLocal(remote, local);
    seatPubSaveLocal(config);
    return config;
  } catch (error) {
    console.warn("getSeatingAccess chưa sẵn sàng, dùng local:", error);
  }
  return local;
}

async function seatPubSave(data: SeatPubConfig): Promise<SeatPubConfig> {
  const chartId = data.chartId || seatPubChartId();
  const status = seatPubStatus(data.status);
  const next: SeatPubConfig = {
    chartId,
    chartTitle: data.chartTitle || seatPubChartTitle(),
    status,
    publishAt: status === "published" ? String(data.publishAt || "") : "",
    previewStudents: status === "private" ? "" : String(data.previewStudents || ""),
    updatedAt: new Date().toISOString(),
    updatedBy: seatPubActor().name,
  };
  seatPubSaveLocal(next);
  try {
    const response = await seatPubGas("saveSeatingAccess", { ...next, actor: seatPubActor() });
    const remote = seatPubNormalize(response, chartId);
    const config = seatPubPreferLocal(remote, next);
    seatPubSaveLocal(config);
    return config;
  } catch (error) {
    console.warn("saveSeatingAccess chưa sẵn sàng, đã lưu local:", error);
  }
  return next;
}

function injectSeatPubStyle() {
  if (document.getElementById(SEAT_PUB_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SEAT_PUB_STYLE_ID;
  style.textContent = `
    ${SEAT_PUB_WINDOW} .seat-pub-lite-btn{height:40px;border:1px solid rgba(148,163,184,.45);border-radius:14px;background:#fff;color:#0f172a;padding:0 13px;font-weight:900;cursor:pointer;white-space:nowrap;box-shadow:0 10px 24px rgba(15,23,42,.08);font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",Arial,sans-serif}
    ${SEAT_PUB_WINDOW} .seat-pub-lite-btn:hover{border-color:var(--desktop-accent,#14b8a6);transform:translateY(-1px)}
    .theme-dark ${SEAT_PUB_WINDOW} .seat-pub-lite-btn,html.a3-overlay-dark ${SEAT_PUB_WINDOW} .seat-pub-lite-btn{background:#111827;color:#f8fafc;border-color:#334155;box-shadow:0 12px 28px rgba(0,0,0,.2)}
    .seat-pub-lite-backdrop{position:fixed;inset:0;z-index:999999;background:rgba(15,23,42,.38);display:flex;align-items:center;justify-content:center;padding:18px;backdrop-filter:blur(10px);font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",Arial,sans-serif!important}
    .seat-pub-lite-modal{width:min(650px,100%);max-height:min(92vh,760px);overflow:auto;border:1px solid rgba(203,213,225,.9);border-radius:28px;background:rgba(255,255,255,.96);color:#0f172a;box-shadow:0 30px 100px rgba(15,23,42,.24);padding:20px;display:grid;gap:16px}
    .seat-pub-lite-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.seat-pub-lite-title h3{margin:0;font-size:22px;font-weight:950;letter-spacing:-.035em}.seat-pub-lite-title p{margin:5px 0 0;color:#64748b;font-size:13px}.seat-pub-lite-meta{font-size:12px;color:#475569;font-weight:780;margin-top:5px}.seat-pub-lite-badge{height:32px;border-radius:999px;padding:0 12px;display:inline-flex;align-items:center;background:color-mix(in srgb,var(--desktop-accent,#14b8a6) 13%,#fff);border:1px solid color-mix(in srgb,var(--desktop-accent,#14b8a6) 42%,#cbd5e1);font-size:12px;font-weight:950}.seat-pub-lite-grid{display:grid;gap:12px}.seat-pub-lite-field{display:grid;gap:8px}.seat-pub-lite-field-title{font-size:13px;font-weight:950}.seat-pub-lite-help{font-size:12px;font-weight:700;color:#64748b}.seat-pub-lite-field textarea,.seat-pub-lite-field input{min-height:44px;border:1px solid #cbd5e1;border-radius:16px;background:#fff;color:#0f172a;padding:10px 13px;font-weight:700;outline:none;line-height:1.45;font-family:inherit}.seat-pub-lite-field textarea{min-height:110px;resize:vertical}.seat-pub-lite-field textarea:focus,.seat-pub-lite-field input:focus{border-color:var(--desktop-accent,#14b8a6);box-shadow:0 0 0 4px color-mix(in srgb,var(--desktop-accent,#14b8a6) 16%,transparent)}
    .seat-pub-lite-select{position:relative;width:max-content;min-width:220px}.seat-pub-lite-trigger{width:100%;height:46px;border:1px solid #cbd5e1;border-radius:16px;background:#fff;color:#0f172a;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 14px;font-weight:900;cursor:pointer}.seat-pub-lite-menu{position:absolute;left:0;top:calc(100% + 8px);width:280px;display:none;gap:6px;padding:8px;border:1px solid #cbd5e1;border-radius:18px;background:#fff;box-shadow:0 24px 70px rgba(15,23,42,.2);z-index:20}.seat-pub-lite-select.open .seat-pub-lite-menu{display:grid}.seat-pub-lite-option{height:42px;border:0;border-radius:13px;background:transparent;color:#0f172a;text-align:left;padding:0 13px;font-weight:900;cursor:pointer}.seat-pub-lite-option:hover,.seat-pub-lite-option.active{background:color-mix(in srgb,var(--desktop-accent,#14b8a6) 15%,#fff)}
    .seat-pub-lite-panel{border:1px solid #e2e8f0;border-radius:20px;background:#f8fafc;padding:14px;display:grid;gap:12px}.seat-pub-lite-check{display:flex;align-items:center;gap:10px;font-weight:950;cursor:pointer}.seat-pub-lite-check input{width:18px;height:18px;accent-color:var(--desktop-accent,#14b8a6)}.seat-pub-lite-radio{display:flex;gap:10px;flex-wrap:wrap}.seat-pub-lite-radio button{height:40px;border:1px solid #cbd5e1;border-radius:14px;background:#fff;color:#0f172a;padding:0 13px;font-weight:900;cursor:pointer}.seat-pub-lite-radio button.active{background:color-mix(in srgb,var(--desktop-accent,#14b8a6) 16%,#fff);border-color:var(--desktop-accent,#14b8a6)}.seat-pub-lite-schedule-input{max-width:300px;justify-self:start}
    .seat-pub-lite-actions{display:flex;justify-content:flex-end;gap:10px}.seat-pub-lite-actions button,.seat-pub-lite-mini-btn{height:40px;border:1px solid #cbd5e1;border-radius:14px;background:#fff;color:#0f172a;padding:0 16px;font-weight:950;cursor:pointer}.seat-pub-lite-actions .primary,.seat-pub-lite-mini-btn.primary{background:var(--desktop-accent,#14b8a6);border-color:transparent;color:#fff}.seat-pub-lite-manage-row{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;border:1px solid #e2e8f0;border-radius:18px;padding:14px;background:#f8fafc}.seat-pub-lite-manage-title{font-weight:950}.seat-pub-lite-manage-sub{font-size:12px;color:#64748b;font-weight:780;margin-top:3px}.seat-pub-lite-manage-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}.seat-pub-lite-status-pill{display:inline-flex;align-items:center;justify-content:center;min-width:100px;height:32px;border-radius:999px;font-weight:950;font-size:12px;border:1px solid #cbd5e1;background:#fff}.seat-pub-lite-status-pill.preview{background:#fef9c3;color:#854d0e;border-color:#fde68a}.seat-pub-lite-status-pill.on{background:#dcfce7;color:#166534;border-color:#86efac}
    .theme-dark .seat-pub-lite-modal,html.a3-overlay-dark .seat-pub-lite-modal{background:rgba(15,23,42,.97);color:#f8fafc;border-color:#334155}.theme-dark .seat-pub-lite-title p,.theme-dark .seat-pub-lite-meta,.theme-dark .seat-pub-lite-help,.theme-dark .seat-pub-lite-manage-sub,html.a3-overlay-dark .seat-pub-lite-title p,html.a3-overlay-dark .seat-pub-lite-meta,html.a3-overlay-dark .seat-pub-lite-help,html.a3-overlay-dark .seat-pub-lite-manage-sub{color:#94a3b8}.theme-dark .seat-pub-lite-trigger,.theme-dark .seat-pub-lite-actions button,.theme-dark .seat-pub-lite-mini-btn,.theme-dark .seat-pub-lite-field textarea,.theme-dark .seat-pub-lite-field input,.theme-dark .seat-pub-lite-radio button,html.a3-overlay-dark .seat-pub-lite-trigger,html.a3-overlay-dark .seat-pub-lite-actions button,html.a3-overlay-dark .seat-pub-lite-mini-btn,html.a3-overlay-dark .seat-pub-lite-field textarea,html.a3-overlay-dark .seat-pub-lite-field input,html.a3-overlay-dark .seat-pub-lite-radio button{background:#111827;color:#f8fafc;border-color:#334155}.theme-dark .seat-pub-lite-menu,html.a3-overlay-dark .seat-pub-lite-menu{background:#1f2937;border-color:#334155}.theme-dark .seat-pub-lite-option,html.a3-overlay-dark .seat-pub-lite-option{color:#f8fafc}.theme-dark .seat-pub-lite-option:hover,.theme-dark .seat-pub-lite-option.active,html.a3-overlay-dark .seat-pub-lite-option:hover,html.a3-overlay-dark .seat-pub-lite-option.active{background:#334155}.theme-dark .seat-pub-lite-panel,.theme-dark .seat-pub-lite-manage-row,html.a3-overlay-dark .seat-pub-lite-panel,html.a3-overlay-dark .seat-pub-lite-manage-row{background:#111827;border-color:#334155}.theme-dark .seat-pub-lite-status-pill,.theme-dark .seat-pub-lite-badge,html.a3-overlay-dark .seat-pub-lite-status-pill,html.a3-overlay-dark .seat-pub-lite-badge{background:#111827;color:#f8fafc;border-color:#334155}
    @media(max-width:760px){.seat-pub-lite-modal{width:100%;max-height:94vh}.seat-pub-lite-select,.seat-pub-lite-schedule-input{width:100%;max-width:100%}.seat-pub-lite-menu{width:100%}}
  `;
  document.head.appendChild(style);
}

function seatPubMeta(config: SeatPubConfig) {
  if (!config.updatedAt && !config.updatedBy) return "Chưa có lịch sử lưu.";
  const parts = [];
  if (config.updatedBy) parts.push(`Người lưu: ${config.updatedBy}`);
  if (config.updatedAt) parts.push(`Lúc: ${new Date(config.updatedAt).toLocaleString("vi-VN")}`);
  return parts.join(" • ");
}

function seatPubModeSelect(mode: SeatPubUiMode) {
  return `<div class="seat-pub-lite-select"><button type="button" class="seat-pub-lite-trigger" data-mode-trigger><span>${seatPubModeText(mode)}</span><span>⌄</span></button><div class="seat-pub-lite-menu"><button type="button" class="seat-pub-lite-option" data-value="private">Riêng tư</button><button type="button" class="seat-pub-lite-option" data-value="preview_publish">Xem trước + Công bố</button></div></div>`;
}

function seatPubBindMode(backdrop: HTMLElement, getMode: () => SeatPubUiMode, setMode: (value: SeatPubUiMode) => void, onSync?: () => void) {
  const select = backdrop.querySelector<HTMLElement>(".seat-pub-lite-select");
  const triggerText = backdrop.querySelector<HTMLElement>(".seat-pub-lite-trigger span");
  const sync = () => {
    if (triggerText) triggerText.textContent = seatPubModeText(getMode());
    backdrop.querySelectorAll<HTMLElement>(".seat-pub-lite-option").forEach((node) => node.classList.toggle("active", node.dataset.value === getMode()));
    onSync?.();
  };
  sync();
  backdrop.querySelector(".seat-pub-lite-trigger")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    select?.classList.toggle("open");
  });
  backdrop.querySelectorAll<HTMLElement>(".seat-pub-lite-option").forEach((option) => {
    option.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setMode(option.dataset.value === "preview_publish" ? "preview_publish" : "private");
      select?.classList.remove("open");
      sync();
    });
  });
  backdrop.addEventListener("click", (event) => {
    if (!(event.target as HTMLElement).closest(".seat-pub-lite-select")) select?.classList.remove("open");
  });
}

function seatPubPreviewBlock(visible: boolean, value: string) {
  return `<div class="seat-pub-lite-field" data-preview-wrap style="display:${visible ? "grid" : "none"}"><div><div class="seat-pub-lite-field-title">Danh sách xem trước</div><div class="seat-pub-lite-help">Mỗi dòng 1 tên hoặc Gmail. Người trong danh sách này được mở công cụ sửa sơ đồ.</div></div><textarea data-preview placeholder="Ví dụ:\nĐinh Mạnh Hữu\nhuud09052009@gmail.com">${seatPubEscape(value)}</textarea></div>`;
}

function seatPubPublishBlock(visible: boolean, enabled: boolean, mode: SeatPubMode, publishAt: string) {
  const localValue = seatPubLocalInput(publishAt);
  return `<div class="seat-pub-lite-panel" data-publish-wrap style="display:${visible ? "grid" : "none"}"><label class="seat-pub-lite-check"><input type="checkbox" data-publish-enabled ${enabled ? "checked" : ""}/><span>Công bố sơ đồ</span></label><div data-publish-inner style="display:${enabled ? "grid" : "none"};gap:10px"><div class="seat-pub-lite-field"><div class="seat-pub-lite-field-title">Cách công bố</div><div class="seat-pub-lite-radio"><button type="button" data-pub-mode="now" class="${mode === "now" ? "active" : ""}">Công bố ngay</button><button type="button" data-pub-mode="schedule" class="${mode === "schedule" ? "active" : ""}">Công bố theo hẹn giờ</button></div></div><div class="seat-pub-lite-field" data-pub-time-wrap style="display:${mode === "schedule" ? "grid" : "none"}"><div class="seat-pub-lite-field-title">Giờ công bố</div><input class="seat-pub-lite-schedule-input" type="datetime-local" data-publish-at value="${localValue}" /></div></div></div>`;
}

function openSeatPubLiteModal() {
  injectSeatPubStyle();
  let current = seatPubReadLocal();
  document.querySelector(".seat-pub-lite-backdrop")?.remove();
  let uiMode: SeatPubUiMode = seatPubUiMode(current.status);
  let publishEnabled = current.status === "published";
  let mode: SeatPubMode = current.status === "published" && current.publishAt ? "schedule" : "now";
  let userTouched = false;
  const markTouched = () => { userTouched = true; };
  const backdrop = document.createElement("div");
  backdrop.className = "seat-pub-lite-backdrop";
  backdrop.innerHTML = `<div class="seat-pub-lite-modal" role="dialog" aria-modal="true"><div class="seat-pub-lite-head"><div class="seat-pub-lite-title"><h3>Cài đặt công bố sơ đồ</h3><p>${seatPubEscape(current.chartTitle || seatPubChartTitle())}</p><div class="seat-pub-lite-meta">${seatPubEscape(seatPubMeta(current))}</div></div><span class="seat-pub-lite-badge">${seatPubStatusText(current.status)}</span></div><div class="seat-pub-lite-grid"><div class="seat-pub-lite-field"><div class="seat-pub-lite-field-title">Trạng thái</div>${seatPubModeSelect(uiMode)}</div><div class="seat-pub-lite-preview-publish">${seatPubPreviewBlock(uiMode === "preview_publish", current.previewStudents)}${seatPubPublishBlock(uiMode === "preview_publish", publishEnabled, mode, current.publishAt)}</div></div><div class="seat-pub-lite-actions"><button type="button" data-close>Huỷ</button><button type="button" class="primary" data-save>Lưu cài đặt</button></div></div>`;
  document.body.appendChild(backdrop);
  const meta = backdrop.querySelector<HTMLElement>(".seat-pub-lite-meta");
  const badge = backdrop.querySelector<HTMLElement>(".seat-pub-lite-badge");
  const sync = () => {
    const preview = backdrop.querySelector<HTMLElement>("[data-preview-wrap]");
    const publish = backdrop.querySelector<HTMLElement>("[data-publish-wrap]");
    const inner = backdrop.querySelector<HTMLElement>("[data-publish-inner]");
    const time = backdrop.querySelector<HTMLElement>("[data-pub-time-wrap]");
    if (preview) preview.style.display = uiMode === "preview_publish" ? "grid" : "none";
    if (publish) publish.style.display = uiMode === "preview_publish" ? "grid" : "none";
    if (inner) inner.style.display = uiMode === "preview_publish" && publishEnabled ? "grid" : "none";
    if (time) time.style.display = uiMode === "preview_publish" && publishEnabled && mode === "schedule" ? "grid" : "none";
    backdrop.querySelectorAll<HTMLElement>("[data-pub-mode]").forEach((btn) => btn.classList.toggle("active", btn.dataset.pubMode === mode));
    if (badge) badge.textContent = uiMode === "private" ? "Riêng tư" : publishEnabled ? "Sẽ công bố" : "Xem trước";
  };
  seatPubBindMode(backdrop, () => uiMode, (value) => { markTouched(); uiMode = value; if (value === "private") publishEnabled = false; }, sync);
  backdrop.querySelector<HTMLTextAreaElement>("[data-preview]")?.addEventListener("input", markTouched);
  backdrop.querySelector<HTMLInputElement>("[data-publish-enabled]")?.addEventListener("change", (event) => { markTouched(); publishEnabled = (event.currentTarget as HTMLInputElement).checked; sync(); });
  backdrop.querySelectorAll<HTMLElement>("[data-pub-mode]").forEach((btn) => btn.addEventListener("click", () => { markTouched(); mode = btn.dataset.pubMode === "schedule" ? "schedule" : "now"; sync(); }));
  backdrop.querySelector<HTMLInputElement>("[data-publish-at]")?.addEventListener("input", markTouched);
  seatPubLoad().then((config) => {
    current = config;
    if (meta) meta.textContent = seatPubMeta(config);
    const title = backdrop.querySelector<HTMLElement>(".seat-pub-lite-title p");
    if (title) title.textContent = config.chartTitle || seatPubChartTitle();
    if (userTouched) return;
    uiMode = seatPubUiMode(config.status);
    publishEnabled = config.status === "published";
    mode = config.status === "published" && config.publishAt ? "schedule" : "now";
    const textarea = backdrop.querySelector<HTMLTextAreaElement>("[data-preview]");
    if (textarea) textarea.value = config.previewStudents;
    const checkbox = backdrop.querySelector<HTMLInputElement>("[data-publish-enabled]");
    if (checkbox) checkbox.checked = publishEnabled;
    const timeInput = backdrop.querySelector<HTMLInputElement>("[data-publish-at]");
    if (timeInput) timeInput.value = seatPubLocalInput(config.publishAt);
    const trigger = backdrop.querySelector<HTMLElement>(".seat-pub-lite-trigger span");
    if (trigger) trigger.textContent = seatPubModeText(uiMode);
    backdrop.querySelectorAll<HTMLElement>(".seat-pub-lite-option").forEach((node) => node.classList.toggle("active", node.dataset.value === uiMode));
    sync();
  });
  const close = () => backdrop.remove();
  backdrop.querySelector("[data-close]")?.addEventListener("click", close);
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });
  backdrop.querySelector<HTMLButtonElement>("[data-save]")?.addEventListener("click", async () => {
    const saveBtn = backdrop.querySelector<HTMLButtonElement>("[data-save]");
    const previewStudents = uiMode === "preview_publish" ? (backdrop.querySelector<HTMLTextAreaElement>("[data-preview]")?.value || "") : "";
    const rawTime = backdrop.querySelector<HTMLInputElement>("[data-publish-at]")?.value || "";
    const status: SeatPubStatus = uiMode === "private" ? "private" : publishEnabled ? "published" : "preview";
    const publishAt = status === "published" && mode === "schedule" && rawTime ? new Date(rawTime).toISOString() : "";
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Đang lưu..."; }
    await seatPubSave({ ...current, chartId: seatPubChartId(), chartTitle: seatPubChartTitle(), status, publishAt, previewStudents });
    close();
  });
}

async function openSeatPubManageModal() {
  injectSeatPubStyle();
  document.querySelector(".seat-pub-lite-backdrop")?.remove();
  const backdrop = document.createElement("div");
  backdrop.className = "seat-pub-lite-backdrop";
  backdrop.innerHTML = `<div class="seat-pub-lite-modal"><div class="seat-pub-lite-title"><h3>Quản lý công bố</h3><p>Quản lý trạng thái công bố của sơ đồ hiện tại.</p></div><div class="seat-pub-lite-loading">Đang tải dữ liệu...</div><div class="seat-pub-lite-actions"><button data-close>Đóng</button></div></div>`;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.querySelector("[data-close]")?.addEventListener("click", close);
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });
  const config = await seatPubLoad();
  if (!document.body.contains(backdrop)) return;
  const cls = config.status === "published" ? "on" : config.status === "preview" ? "preview" : "";
  const sub = `${seatPubMeta(config)}${config.publishAt ? ` • Hẹn giờ: ${new Date(config.publishAt).toLocaleString("vi-VN")}` : ""}`;
  backdrop.querySelector(".seat-pub-lite-modal")!.innerHTML = `<div class="seat-pub-lite-title"><h3>Quản lý công bố</h3><p>${seatPubEscape(config.chartTitle || seatPubChartTitle())}</p></div><div class="seat-pub-lite-manage-row"><div><div class="seat-pub-lite-manage-title">Sơ đồ hiện tại</div><div class="seat-pub-lite-manage-sub">${seatPubEscape(sub)}</div></div><span class="seat-pub-lite-status-pill ${cls}">${seatPubStatusText(config.status)}</span></div><div class="seat-pub-lite-manage-actions"><button class="seat-pub-lite-mini-btn" data-private>Riêng tư</button><button class="seat-pub-lite-mini-btn" data-edit>Xem trước + Công bố</button><button class="seat-pub-lite-mini-btn primary" data-publish>Công bố ngay</button><button class="seat-pub-lite-mini-btn" data-reset>Đặt lại</button></div><div class="seat-pub-lite-actions"><button data-close>Đóng</button></div>`;
  backdrop.querySelector("[data-close]")?.addEventListener("click", close);
  backdrop.querySelector("[data-private]")?.addEventListener("click", async () => { await seatPubSave({ ...config, status: "private", publishAt: "", previewStudents: "" }); close(); });
  backdrop.querySelector("[data-edit]")?.addEventListener("click", () => { close(); openSeatPubLiteModal(); });
  backdrop.querySelector("[data-publish]")?.addEventListener("click", async () => { await seatPubSave({ ...config, status: "published", publishAt: "", previewStudents: config.previewStudents || "" }); close(); });
  backdrop.querySelector("[data-reset]")?.addEventListener("click", async () => { await seatPubSave({ ...config, status: "private", publishAt: "", previewStudents: "" }); close(); });
}

function seatPubTick() {
  injectSeatPubStyle();
  if (seatPubRole() !== "admin") return;
  const tools = document.querySelector<HTMLElement>(`${SEAT_PUB_WINDOW} .stable-seat-tools`);
  if (!tools || tools.querySelector("[data-seat-pub-lite]")) return;
  const pubBtn = document.createElement("button");
  pubBtn.type = "button";
  pubBtn.className = "seat-pub-lite-btn";
  pubBtn.dataset.seatPubLite = "1";
  pubBtn.textContent = "Công bố";
  pubBtn.addEventListener("click", openSeatPubLiteModal);
  const manageBtn = document.createElement("button");
  manageBtn.type = "button";
  manageBtn.className = "seat-pub-lite-btn";
  manageBtn.dataset.seatPubLiteManage = "1";
  manageBtn.textContent = "QL";
  manageBtn.title = "Quản lý công bố";
  manageBtn.addEventListener("click", openSeatPubManageModal);
  const search = tools.querySelector("input");
  tools.insertBefore(pubBtn, search || tools.firstChild);
  tools.insertBefore(manageBtn, search || tools.firstChild);
}

function bootSeatPub() {
  if (seatPubBooted) return;
  seatPubBooted = true;
  seatPubTick();
  const timer = window.setInterval(() => {
    seatPubTick();
    if (document.querySelector(`${SEAT_PUB_WINDOW} [data-seat-pub-lite]`)) clearInterval(timer);
  }, 500);
  window.setTimeout(() => clearInterval(timer), 12000);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootSeatPub);
else bootSeatPub();

export {};
