const SEAT_PUB_LITE_WINDOW = "#a3k64-seating-window";
const SEAT_PUB_LITE_STYLE_ID = "a3k64-seating-publish-lite-style";
const SEAT_PUB_LITE_KEY = "a3k64-seating-publish-lite-v1";
const SEAT_PUB_CHART_KEY = "a3k64-seating-sheet-current-id-v1";
const SEAT_PUB_LITE_GAS_URL = String(import.meta.env.VITE_GAS_WEB_APP_URL || "").trim();

let seatPubLiteBooted = false;

type SeatPubLiteStatus = "private" | "preview" | "published";
type SeatPubMode = "now" | "schedule";
type SeatPubUiMode = "private" | "preview_publish";

type SeatPubLiteConfig = {
  chartId: string;
  chartTitle?: string;
  status: SeatPubLiteStatus;
  publishAt: string;
  previewStudents: string;
  updatedAt?: string;
  updatedBy?: string;
};

function seatPubLiteCurrentChartId() {
  return localStorage.getItem(SEAT_PUB_CHART_KEY) || "default";
}

function seatPubLiteCurrentChartTitle() {
  const trigger = document.querySelector<HTMLElement>(`${SEAT_PUB_LITE_WINDOW} .seat-ctrl-trigger span`);
  return (trigger?.textContent || "Sơ đồ hiện tại").trim();
}

function seatPubLiteLocalKey(chartId = seatPubLiteCurrentChartId()) {
  return `${SEAT_PUB_LITE_KEY}:${chartId || "default"}`;
}

function seatPubLiteCleanStatus(value: unknown): SeatPubLiteStatus {
  const raw = String(value || "").trim();
  if (raw === "preview") return "preview";
  if (raw === "published" || raw === "public") return "published";
  return "private";
}

function seatPubLiteStatusText(status: SeatPubLiteStatus) {
  if (status === "published") return "Đã công bố";
  if (status === "preview") return "Xem trước";
  return "Riêng tư";
}

function seatPubLiteModeText(mode: SeatPubUiMode) {
  return mode === "preview_publish" ? "Xem trước + Công bố" : "Riêng tư";
}

function seatPubLiteUiModeFromStatus(status: SeatPubLiteStatus): SeatPubUiMode {
  return status === "private" ? "private" : "preview_publish";
}

function seatPubLiteEscape(value: unknown) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function seatPubLiteToLocalInputValue(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

function seatPubLiteReadLocal(chartId = seatPubLiteCurrentChartId()): SeatPubLiteConfig {
  try {
    const data = JSON.parse(localStorage.getItem(seatPubLiteLocalKey(chartId)) || localStorage.getItem(SEAT_PUB_LITE_KEY) || "{}");
    return {
      chartId,
      chartTitle: String(data.chartTitle || data.title || seatPubLiteCurrentChartTitle() || "Sơ đồ hiện tại"),
      status: seatPubLiteCleanStatus(data.status),
      publishAt: String(data.publishAt || data.publish_at || ""),
      previewStudents: String(data.previewStudents || data.preview_students || ""),
      updatedAt: data.updatedAt || data.updated_at,
      updatedBy: data.updatedBy || data.updated_by,
    };
  } catch {
    return { chartId, chartTitle: seatPubLiteCurrentChartTitle(), status: "private", publishAt: "", previewStudents: "" };
  }
}

function seatPubLiteSaveLocal(data: SeatPubLiteConfig) {
  const chartId = data.chartId || seatPubLiteCurrentChartId();
  localStorage.setItem(seatPubLiteLocalKey(chartId), JSON.stringify({ ...data, chartId }));
}

function seatPubLiteActor() {
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

function seatPubLiteGas(action: string, payload?: unknown): Promise<any | null> {
  if (!SEAT_PUB_LITE_GAS_URL) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const callbackName = `__a3k64SeatPubLite_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const callbacks = window as typeof window & Record<string, unknown>;
    const script = document.createElement("script");
    const url = new URL(SEAT_PUB_LITE_GAS_URL);
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

function seatPubLiteNormalizeConfig(raw: any, chartId = seatPubLiteCurrentChartId()): SeatPubLiteConfig | null {
  const source = raw?.access || raw?.data?.access || raw?.config || raw?.data?.config || raw;
  if (!source) return null;

  return {
    chartId: String(source.chartId || source.chart_id || chartId || "default"),
    chartTitle: String(source.chartTitle || source.chart_title || source.title || seatPubLiteCurrentChartTitle()),
    status: seatPubLiteCleanStatus(source.status),
    publishAt: String(source.publishAt || source.publish_at || ""),
    previewStudents: String(source.previewStudents || source.preview_students || ""),
    updatedAt: source.updatedAt || source.updated_at,
    updatedBy: source.updatedBy || source.updated_by,
  };
}

async function seatPubLiteLoad(chartId = seatPubLiteCurrentChartId()): Promise<SeatPubLiteConfig> {
  const local = seatPubLiteReadLocal(chartId);
  try {
    const response = await seatPubLiteGas("getSeatingAccess", { chartId, chartTitle: seatPubLiteCurrentChartTitle() });
    const config = seatPubLiteNormalizeConfig(response, chartId);
    if (config) {
      seatPubLiteSaveLocal(config);
      return config;
    }
  } catch (error) {
    console.warn("getSeatingAccess chưa sẵn sàng, dùng local:", error);
  }
  return local;
}

async function seatPubLiteSave(data: SeatPubLiteConfig): Promise<SeatPubLiteConfig> {
  const chartId = data.chartId || seatPubLiteCurrentChartId();
  const status = seatPubLiteCleanStatus(data.status);
  const next: SeatPubLiteConfig = {
    chartId,
    chartTitle: data.chartTitle || seatPubLiteCurrentChartTitle(),
    status,
    publishAt: status === "published" ? String(data.publishAt || "") : "",
    previewStudents: status === "private" ? "" : String(data.previewStudents || ""),
    updatedAt: new Date().toISOString(),
    updatedBy: seatPubLiteActor().name,
  };

  seatPubLiteSaveLocal(next);
  try {
    const response = await seatPubLiteGas("saveSeatingAccess", { ...next, actor: seatPubLiteActor() });
    const config = seatPubLiteNormalizeConfig(response, chartId);
    if (config) {
      seatPubLiteSaveLocal(config);
      return config;
    }
  } catch (error) {
    console.warn("saveSeatingAccess chưa sẵn sàng, đã lưu local:", error);
  }
  return next;
}

function seatPubLiteRole() {
  try {
    const session = JSON.parse(localStorage.getItem("a3k64-login-session-v1") || "null");
    const user = session?.user || session || {};
    const role = String(user.role || user.userRole || "").toLowerCase();
    if (role.includes("gvcn") || role.includes("lop_truong") || role.includes("bi_thu")) return "admin";
  } catch {}
  return "viewer";
}

function injectSeatPubLiteStyle() {
  if (document.getElementById(SEAT_PUB_LITE_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SEAT_PUB_LITE_STYLE_ID;
  style.textContent = `
    ${SEAT_PUB_LITE_WINDOW} .seat-pub-lite-btn{height:40px;border:1px solid rgba(148,163,184,.45);border-radius:14px;background:#fff;color:#0f172a;padding:0 13px;font-weight:900;cursor:pointer;white-space:nowrap;box-shadow:0 10px 24px rgba(15,23,42,.08);font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",Arial,sans-serif}
    ${SEAT_PUB_LITE_WINDOW} .seat-pub-lite-btn:hover{border-color:var(--desktop-accent,#14b8a6);transform:translateY(-1px)}
    .theme-dark ${SEAT_PUB_LITE_WINDOW} .seat-pub-lite-btn{background:#111827;color:#f8fafc;border-color:#334155;box-shadow:0 12px 28px rgba(0,0,0,.2)}
    .seat-pub-lite-backdrop{position:fixed;inset:0;z-index:999999;background:rgba(15,23,42,.38);display:flex;align-items:center;justify-content:center;padding:18px;backdrop-filter:blur(10px);font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",Arial,sans-serif!important}
    .seat-pub-lite-modal{width:min(640px,100%);max-height:min(92vh,760px);overflow:auto;border:1px solid rgba(203,213,225,.9);border-radius:28px;background:rgba(255,255,255,.96);color:#0f172a;box-shadow:0 30px 100px rgba(15,23,42,.24);padding:20px;display:grid;gap:16px}
    .seat-pub-lite-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.seat-pub-lite-title h3{margin:0;font-size:22px;font-weight:950;letter-spacing:-.035em}.seat-pub-lite-title p{margin:5px 0 0;color:#64748b;font-size:13px;line-height:1.45}.seat-pub-lite-meta{font-size:12px;color:#475569;font-weight:780;margin-top:5px}.seat-pub-lite-badge{display:inline-flex;align-items:center;height:32px;border-radius:999px;padding:0 12px;background:color-mix(in srgb,var(--desktop-accent,#14b8a6) 13%,#fff);border:1px solid color-mix(in srgb,var(--desktop-accent,#14b8a6) 42%,#cbd5e1);font-size:12px;font-weight:950;color:#0f172a;white-space:nowrap}.seat-pub-lite-loading{font-weight:900;color:#64748b}.seat-pub-lite-grid{display:grid;gap:12px}.seat-pub-lite-preview-publish{display:grid;gap:12px}.seat-pub-lite-field{display:grid;gap:8px}.seat-pub-lite-field-title{font-size:13px;font-weight:950;color:#0f172a}.seat-pub-lite-help{font-size:12px;font-weight:700;color:#64748b}.seat-pub-lite-field textarea,.seat-pub-lite-field input{min-height:44px;border:1px solid #cbd5e1;border-radius:16px;background:#fff;color:#0f172a;padding:10px 13px;font-weight:700;outline:none;line-height:1.45;font-family:inherit}.seat-pub-lite-field textarea{min-height:110px;resize:vertical}.seat-pub-lite-field textarea:focus,.seat-pub-lite-field input:focus{border-color:var(--desktop-accent,#14b8a6);box-shadow:0 0 0 4px color-mix(in srgb,var(--desktop-accent,#14b8a6) 16%,transparent)}
    .seat-pub-lite-select{position:relative;width:max-content;min-width:210px}.seat-pub-lite-trigger{width:100%;height:46px;border:1px solid #cbd5e1;border-radius:16px;background:#fff;color:#0f172a;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 14px;font-weight:900;cursor:pointer;font-family:inherit}.seat-pub-lite-trigger:hover{border-color:var(--desktop-accent,#14b8a6)}.seat-pub-lite-chevron{font-size:16px;color:#64748b}.seat-pub-lite-menu{position:absolute;left:0;top:calc(100% + 8px);width:260px;display:none;gap:6px;padding:8px;border:1px solid #cbd5e1;border-radius:18px;background:#fff;box-shadow:0 24px 70px rgba(15,23,42,.2);z-index:20}.seat-pub-lite-select.open .seat-pub-lite-menu{display:grid}.seat-pub-lite-option{height:42px;border:0;border-radius:13px;background:transparent;color:#0f172a;text-align:left;padding:0 13px;font-weight:900;cursor:pointer;font-family:inherit}.seat-pub-lite-option:hover,.seat-pub-lite-option.active{background:color-mix(in srgb,var(--desktop-accent,#14b8a6) 15%,#fff)}
    .seat-pub-lite-panel{border:1px solid #e2e8f0;border-radius:20px;background:#f8fafc;padding:14px;display:grid;gap:12px}.seat-pub-lite-check{display:flex;align-items:center;gap:10px;font-weight:950;cursor:pointer;user-select:none}.seat-pub-lite-check input{width:18px;height:18px;accent-color:var(--desktop-accent,#14b8a6)}.seat-pub-lite-radio{display:flex;gap:10px;flex-wrap:wrap}.seat-pub-lite-radio button{height:40px;border:1px solid #cbd5e1;border-radius:14px;background:#fff;color:#0f172a;padding:0 13px;font-weight:900;cursor:pointer;font-family:inherit}.seat-pub-lite-radio button.active{background:color-mix(in srgb,var(--desktop-accent,#14b8a6) 16%,#fff);border-color:var(--desktop-accent,#14b8a6)}.seat-pub-lite-schedule-input{max-width:300px;justify-self:start}.seat-pub-lite-schedule-input::-webkit-calendar-picker-indicator{cursor:pointer;opacity:.78}.seat-pub-lite-schedule-input:hover::-webkit-calendar-picker-indicator{opacity:1}
    .seat-pub-lite-actions{display:flex;justify-content:flex-end;gap:10px}.seat-pub-lite-actions button,.seat-pub-lite-mini-btn{height:40px;border:1px solid #cbd5e1;border-radius:14px;background:#fff;color:#0f172a;padding:0 16px;font-weight:950;cursor:pointer;font-family:inherit}.seat-pub-lite-actions .primary,.seat-pub-lite-mini-btn.primary{background:var(--desktop-accent,#14b8a6);border-color:transparent;color:#fff}.seat-pub-lite-actions button:disabled,.seat-pub-lite-mini-btn:disabled{opacity:.65;cursor:wait}.seat-pub-lite-manage-row{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;border:1px solid #e2e8f0;border-radius:18px;padding:14px;background:#f8fafc}.seat-pub-lite-manage-title{font-weight:950}.seat-pub-lite-manage-sub{font-size:12px;color:#64748b;font-weight:780;margin-top:3px}.seat-pub-lite-manage-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}.seat-pub-lite-status-pill{display:inline-flex;align-items:center;justify-content:center;min-width:100px;height:32px;border-radius:999px;font-weight:950;font-size:12px;border:1px solid #cbd5e1;background:#fff;color:#0f172a}.seat-pub-lite-status-pill.preview{background:#fef9c3;color:#854d0e;border-color:#fde68a}.seat-pub-lite-status-pill.on{background:#dcfce7;color:#166534;border-color:#86efac}
    .theme-dark .seat-pub-lite-modal{background:rgba(15,23,42,.97);color:#f8fafc;border-color:#334155;box-shadow:0 28px 90px rgba(0,0,0,.42)}.theme-dark .seat-pub-lite-title p,.theme-dark .seat-pub-lite-meta,.theme-dark .seat-pub-lite-help,.theme-dark .seat-pub-lite-manage-sub,.theme-dark .seat-pub-lite-loading{color:#94a3b8}.theme-dark .seat-pub-lite-field-title{color:#f8fafc}.theme-dark .seat-pub-lite-trigger,.theme-dark .seat-pub-lite-actions button,.theme-dark .seat-pub-lite-mini-btn,.theme-dark .seat-pub-lite-field textarea,.theme-dark .seat-pub-lite-field input,.theme-dark .seat-pub-lite-radio button{background:#111827;color:#f8fafc;border-color:#334155}.theme-dark .seat-pub-lite-radio button.active{background:#0f766e;border-color:#2dd4bf}.theme-dark .seat-pub-lite-menu{background:#1f2937;border-color:#334155}.theme-dark .seat-pub-lite-option{color:#f8fafc}.theme-dark .seat-pub-lite-option:hover,.theme-dark .seat-pub-lite-option.active{background:#334155}.theme-dark .seat-pub-lite-panel,.theme-dark .seat-pub-lite-manage-row{background:#111827;border-color:#334155}.theme-dark .seat-pub-lite-status-pill,.theme-dark .seat-pub-lite-badge{background:#111827;color:#f8fafc;border-color:#334155}.theme-dark .seat-pub-lite-status-pill.preview{background:#713f12;color:#fef9c3;border-color:#a16207}.theme-dark .seat-pub-lite-status-pill.on{background:#064e3b;color:#bbf7d0;border-color:#047857}
    @media(max-width:760px){.seat-pub-lite-modal{width:100%;max-height:94vh}.seat-pub-lite-select,.seat-pub-lite-schedule-input{width:100%;max-width:100%}.seat-pub-lite-menu{width:100%}}
  `;
  document.head.appendChild(style);
}

function formatMeta(config: SeatPubLiteConfig) {
  if (!config.updatedAt && !config.updatedBy) return "Chưa có lịch sử lưu.";
  const parts = [];
  if (config.updatedBy) parts.push(`Người lưu: ${config.updatedBy}`);
  if (config.updatedAt) parts.push(`Lúc: ${new Date(config.updatedAt).toLocaleString("vi-VN")}`);
  return parts.join(" • ");
}

function renderModeSelect(mode: SeatPubUiMode) {
  return `<div class="seat-pub-lite-select"><button type="button" class="seat-pub-lite-trigger" data-mode-trigger><span>${seatPubLiteModeText(mode)}</span><span class="seat-pub-lite-chevron">⌄</span></button><div class="seat-pub-lite-menu"><button type="button" class="seat-pub-lite-option" data-value="private">Riêng tư</button><button type="button" class="seat-pub-lite-option" data-value="preview_publish">Xem trước + Công bố</button></div></div>`;
}

function bindModeSelect(backdrop: HTMLElement, getMode: () => SeatPubUiMode, setMode: (value: SeatPubUiMode) => void, onSync?: () => void) {
  const select = backdrop.querySelector<HTMLElement>(".seat-pub-lite-select");
  const triggerText = backdrop.querySelector<HTMLElement>(".seat-pub-lite-trigger span");
  const sync = () => {
    if (triggerText) triggerText.textContent = seatPubLiteModeText(getMode());
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

function previewBlock(visible: boolean, value: string) {
  return `<div class="seat-pub-lite-field" data-preview-wrap style="display:${visible ? "grid" : "none"}"><div><div class="seat-pub-lite-field-title">Danh sách xem trước</div><div class="seat-pub-lite-help">Mỗi dòng 1 tên hoặc Gmail. Người trong danh sách này được mở công cụ sửa sơ đồ.</div></div><textarea data-preview placeholder="Ví dụ:\nĐinh Mạnh Hữu\nhuud09052009@gmail.com">${seatPubLiteEscape(value)}</textarea></div>`;
}

function publishBlock(visible: boolean, enabled: boolean, mode: SeatPubMode, publishAt: string) {
  const localValue = seatPubLiteToLocalInputValue(publishAt);
  return `<div class="seat-pub-lite-panel" data-publish-wrap style="display:${visible ? "grid" : "none"}"><label class="seat-pub-lite-check"><input type="checkbox" data-publish-enabled ${enabled ? "checked" : ""}/><span>Công bố sơ đồ</span></label><div data-publish-inner style="display:${enabled ? "grid" : "none"};gap:10px"><div class="seat-pub-lite-field"><div class="seat-pub-lite-field-title">Cách công bố</div><div class="seat-pub-lite-radio"><button type="button" data-pub-mode="now" class="${mode === "now" ? "active" : ""}">Công bố ngay</button><button type="button" data-pub-mode="schedule" class="${mode === "schedule" ? "active" : ""}">Công bố theo hẹn giờ</button></div></div><div class="seat-pub-lite-field" data-pub-time-wrap style="display:${mode === "schedule" ? "grid" : "none"}"><div class="seat-pub-lite-field-title">Giờ công bố</div><input class="seat-pub-lite-schedule-input" type="datetime-local" data-publish-at value="${localValue}" /></div></div></div>`;
}

function openSeatPubLiteModal() {
  injectSeatPubLiteStyle();
  let current = seatPubLiteReadLocal();
  document.querySelector(".seat-pub-lite-backdrop")?.remove();

  let uiMode: SeatPubUiMode = seatPubLiteUiModeFromStatus(current.status);
  let publishEnabled = current.status === "published";
  let mode: SeatPubMode = current.status === "published" && current.publishAt ? "schedule" : "now";
  let userTouched = false;
  const markTouched = () => { userTouched = true; };

  const backdrop = document.createElement("div");
  backdrop.className = "seat-pub-lite-backdrop";
  backdrop.innerHTML = `
    <div class="seat-pub-lite-modal" role="dialog" aria-modal="true">
      <div class="seat-pub-lite-head"><div class="seat-pub-lite-title"><h3>Cài đặt công bố sơ đồ</h3><p>${seatPubLiteEscape(current.chartTitle || seatPubLiteCurrentChartTitle())}</p><div class="seat-pub-lite-meta">${seatPubLiteEscape(formatMeta(current))}</div></div><span class="seat-pub-lite-badge">${seatPubLiteStatusText(current.status)}</span></div>
      <div class="seat-pub-lite-grid"><div class="seat-pub-lite-field"><div class="seat-pub-lite-field-title">Trạng thái</div>${renderModeSelect(uiMode)}</div><div class="seat-pub-lite-preview-publish">${previewBlock(uiMode === "preview_publish", current.previewStudents)}${publishBlock(uiMode === "preview_publish", publishEnabled, mode, current.publishAt)}</div></div>
      <div class="seat-pub-lite-actions"><button type="button" data-close>Huỷ</button><button type="button" class="primary" data-save>Lưu cài đặt</button></div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const meta = backdrop.querySelector<HTMLElement>(".seat-pub-lite-meta");
  const badge = backdrop.querySelector<HTMLElement>(".seat-pub-lite-badge");
  const syncBlocks = () => {
    const preview = backdrop.querySelector<HTMLElement>("[data-preview-wrap]");
    const publish = backdrop.querySelector<HTMLElement>("[data-publish-wrap]");
    const publishInner = backdrop.querySelector<HTMLElement>("[data-publish-inner]");
    const time = backdrop.querySelector<HTMLElement>("[data-pub-time-wrap]");
    if (preview) preview.style.display = uiMode === "preview_publish" ? "grid" : "none";
    if (publish) publish.style.display = uiMode === "preview_publish" ? "grid" : "none";
    if (publishInner) publishInner.style.display = uiMode === "preview_publish" && publishEnabled ? "grid" : "none";
    if (time) time.style.display = uiMode === "preview_publish" && publishEnabled && mode === "schedule" ? "grid" : "none";
    backdrop.querySelectorAll<HTMLElement>("[data-pub-mode]").forEach((btn) => btn.classList.toggle("active", btn.dataset.pubMode === mode));
    if (badge) badge.textContent = uiMode === "private" ? "Riêng tư" : publishEnabled ? "Sẽ công bố" : "Xem trước";
  };

  bindModeSelect(backdrop, () => uiMode, (value) => { markTouched(); uiMode = value; if (value === "private") publishEnabled = false; }, syncBlocks);
  backdrop.querySelector<HTMLTextAreaElement>("[data-preview]")?.addEventListener("input", markTouched);
  backdrop.querySelector<HTMLInputElement>("[data-publish-enabled]")?.addEventListener("change", (event) => { markTouched(); publishEnabled = (event.currentTarget as HTMLInputElement).checked; syncBlocks(); });
  backdrop.querySelectorAll<HTMLElement>("[data-pub-mode]").forEach((btn) => btn.addEventListener("click", () => { markTouched(); mode = btn.dataset.pubMode === "schedule" ? "schedule" : "now"; syncBlocks(); }));
  backdrop.querySelector<HTMLInputElement>("[data-publish-at]")?.addEventListener("input", markTouched);

  seatPubLiteLoad().then((config) => {
    current = config;
    if (meta) meta.textContent = formatMeta(config);
    const title = backdrop.querySelector<HTMLElement>(".seat-pub-lite-title p");
    if (title) title.textContent = config.chartTitle || seatPubLiteCurrentChartTitle();
    if (userTouched) return;

    uiMode = seatPubLiteUiModeFromStatus(config.status);
    publishEnabled = config.status === "published";
    mode = config.status === "published" && config.publishAt ? "schedule" : "now";
    const textarea = backdrop.querySelector<HTMLTextAreaElement>("[data-preview]");
    if (textarea) textarea.value = config.previewStudents;
    const checkbox = backdrop.querySelector<HTMLInputElement>("[data-publish-enabled]");
    if (checkbox) checkbox.checked = publishEnabled;
    const timeInput = backdrop.querySelector<HTMLInputElement>("[data-publish-at]");
    if (timeInput) timeInput.value = seatPubLiteToLocalInputValue(config.publishAt);
    backdrop.querySelector<HTMLElement>(".seat-pub-lite-trigger span")!.textContent = seatPubLiteModeText(uiMode);
    backdrop.querySelectorAll<HTMLElement>(".seat-pub-lite-option").forEach((node) => node.classList.toggle("active", node.dataset.value === uiMode));
    syncBlocks();
  });

  const close = () => backdrop.remove();
  backdrop.querySelector("[data-close]")?.addEventListener("click", close);
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });
  backdrop.querySelector<HTMLButtonElement>("[data-save]")?.addEventListener("click", async () => {
    const saveBtn = backdrop.querySelector<HTMLButtonElement>("[data-save]");
    const previewStudents = uiMode === "preview_publish" ? (backdrop.querySelector<HTMLTextAreaElement>("[data-preview]")?.value || "") : "";
    const rawTime = backdrop.querySelector<HTMLInputElement>("[data-publish-at]")?.value || "";
    const status: SeatPubLiteStatus = uiMode === "private" ? "private" : publishEnabled ? "published" : "preview";
    const publishAt = status === "published" && mode === "schedule" && rawTime ? new Date(rawTime).toISOString() : "";
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Đang lưu..."; }
    await seatPubLiteSave({ ...current, chartId: seatPubLiteCurrentChartId(), chartTitle: seatPubLiteCurrentChartTitle(), status, publishAt, previewStudents });
    close();
  });
}

async function openSeatPubManageModal() {
  injectSeatPubLiteStyle();
  document.querySelector(".seat-pub-lite-backdrop")?.remove();
  const backdrop = document.createElement("div");
  backdrop.className = "seat-pub-lite-backdrop";
  backdrop.innerHTML = `<div class="seat-pub-lite-modal"><div class="seat-pub-lite-title"><h3>Quản lý công bố</h3><p>Quản lý trạng thái công bố của sơ đồ hiện tại.</p></div><div class="seat-pub-lite-loading">Đang tải dữ liệu...</div><div class="seat-pub-lite-actions"><button data-close>Đóng</button></div></div>`;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.querySelector("[data-close]")?.addEventListener("click", close);
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });

  const config = await seatPubLiteLoad();
  if (!document.body.contains(backdrop)) return;
  const cls = config.status === "published" ? "on" : config.status === "preview" ? "preview" : "";
  const sub = `${formatMeta(config)}${config.publishAt ? ` • Hẹn giờ: ${new Date(config.publishAt).toLocaleString("vi-VN")}` : ""}`;
  backdrop.querySelector(".seat-pub-lite-modal")!.innerHTML = `<div class="seat-pub-lite-title"><h3>Quản lý công bố</h3><p>${seatPubLiteEscape(config.chartTitle || seatPubLiteCurrentChartTitle())}</p></div><div class="seat-pub-lite-manage-row"><div><div class="seat-pub-lite-manage-title">Sơ đồ hiện tại</div><div class="seat-pub-lite-manage-sub">${seatPubLiteEscape(sub)}</div></div><span class="seat-pub-lite-status-pill ${cls}">${seatPubLiteStatusText(config.status)}</span></div><div class="seat-pub-lite-manage-actions"><button class="seat-pub-lite-mini-btn" data-private>Riêng tư</button><button class="seat-pub-lite-mini-btn" data-edit>Xem trước + Công bố</button><button class="seat-pub-lite-mini-btn primary" data-publish>Công bố ngay</button><button class="seat-pub-lite-mini-btn" data-reset>Đặt lại</button></div><div class="seat-pub-lite-actions"><button data-close>Đóng</button></div>`;
  backdrop.querySelector("[data-close]")?.addEventListener("click", close);
  backdrop.querySelector("[data-private]")?.addEventListener("click", async () => { await seatPubLiteSave({ ...config, status: "private", publishAt: "", previewStudents: "" }); close(); });
  backdrop.querySelector("[data-edit]")?.addEventListener("click", () => { close(); openSeatPubLiteModal(); });
  backdrop.querySelector("[data-publish]")?.addEventListener("click", async () => { await seatPubLiteSave({ ...config, status: "published", publishAt: "", previewStudents: config.previewStudents || "" }); close(); });
  backdrop.querySelector("[data-reset]")?.addEventListener("click", async () => { await seatPubLiteSave({ ...config, status: "private", publishAt: "", previewStudents: "" }); close(); });
}

function seatPubLiteTick() {
  injectSeatPubLiteStyle();
  if (seatPubLiteRole() !== "admin") return;
  const tools = document.querySelector<HTMLElement>(`${SEAT_PUB_LITE_WINDOW} .stable-seat-tools`);
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

function bootSeatPubLite() {
  if (seatPubLiteBooted) return;
  seatPubLiteBooted = true;
  seatPubLiteTick();
  const timer = window.setInterval(() => {
    seatPubLiteTick();
    if (document.querySelector(`${SEAT_PUB_LITE_WINDOW} [data-seat-pub-lite]`)) clearInterval(timer);
  }, 500);
  window.setTimeout(() => clearInterval(timer), 12000);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootSeatPubLite);
else bootSeatPubLite();

export {};
