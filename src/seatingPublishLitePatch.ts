const SEAT_PUB_LITE_WINDOW = "#a3k64-seating-window";
const SEAT_PUB_LITE_STYLE_ID = "a3k64-seating-publish-lite-style";
const SEAT_PUB_LITE_KEY = "a3k64-seating-publish-lite-v1";
const SEAT_PUB_CHART_KEY = "a3k64-seating-sheet-current-id-v1";
const SEAT_PUB_LITE_GAS_URL = String(import.meta.env.VITE_GAS_WEB_APP_URL || "").trim();
let seatPubLiteBooted = false;

type SeatPubLiteStatus = "private" | "preview" | "published";
type SeatPubMode = "now" | "schedule";

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
  if (raw === "published") return "published";
  return "private";
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
  const next = {
    chartId,
    chartTitle: data.chartTitle || seatPubLiteCurrentChartTitle(),
    status: seatPubLiteCleanStatus(data.status),
    publishAt: data.status === "published" ? String(data.publishAt || "") : "",
    previewStudents: data.status === "preview" ? String(data.previewStudents || "") : "",
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
    ${SEAT_PUB_LITE_WINDOW} .seat-pub-lite-btn{height:40px;border:1px solid rgba(148,163,184,.45);border-radius:14px;background:#fff;color:#0f172a;padding:0 13px;font-weight:1000;cursor:pointer;white-space:nowrap;box-shadow:0 10px 24px rgba(15,23,42,.08)}
    ${SEAT_PUB_LITE_WINDOW} .seat-pub-lite-btn:hover{border-color:var(--desktop-accent,#14b8a6)}
    .theme-dark ${SEAT_PUB_LITE_WINDOW} .seat-pub-lite-btn{background:#111827;color:#f8fafc;border-color:#334155;box-shadow:0 12px 28px rgba(0,0,0,.2)}
    .seat-pub-lite-backdrop{position:fixed;inset:0;z-index:999999;background:rgba(15,23,42,.42);display:flex;align-items:center;justify-content:center;padding:18px;backdrop-filter:blur(8px)}
    .seat-pub-lite-modal{width:min(590px,100%);border:1px solid #cbd5e1;border-radius:24px;background:#fff;color:#0f172a;box-shadow:0 28px 90px rgba(15,23,42,.2);padding:18px;display:grid;gap:14px;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",Arial,sans-serif!important}
    .seat-pub-lite-modal h3{margin:0;font-size:20px;font-weight:1000}.seat-pub-lite-modal p{margin:0;color:#64748b;font-size:13px;line-height:1.45}.seat-pub-lite-meta{font-size:12px;color:#64748b;font-weight:800}.seat-pub-lite-loading{font-weight:950;color:#64748b}.seat-pub-lite-status-pill{display:inline-flex;align-items:center;justify-content:center;min-width:92px;height:30px;border-radius:999px;font-weight:1000;font-size:12px;border:1px solid #cbd5e1;background:#f8fafc;color:#0f172a}.seat-pub-lite-status-pill.preview{background:#fef9c3;color:#854d0e;border-color:#fde68a}.seat-pub-lite-status-pill.on{background:#dcfce7;color:#166534;border-color:#86efac}
    .seat-pub-lite-grid{display:grid;gap:10px}.seat-pub-lite-label{display:grid;gap:6px;font-weight:950;font-size:13px}.seat-pub-lite-label textarea,.seat-pub-lite-label input{min-height:44px;border:1px solid #cbd5e1;border-radius:15px;background:#fff;color:#0f172a;padding:10px 12px;font-weight:760;outline:none;line-height:1.45}.seat-pub-lite-label textarea{min-height:112px;resize:vertical}.seat-pub-lite-label textarea:focus,.seat-pub-lite-label input:focus{border-color:var(--desktop-accent,#14b8a6);box-shadow:0 0 0 3px color-mix(in srgb,var(--desktop-accent,#14b8a6) 18%,transparent)}
    .seat-pub-lite-select{position:relative}.seat-pub-lite-trigger{height:44px;border:1px solid #cbd5e1;border-radius:15px;background:#fff;color:#0f172a;display:flex;align-items:center;justify-content:space-between;padding:0 13px;font-weight:950;cursor:pointer}.seat-pub-lite-menu{position:absolute;left:0;right:0;top:calc(100% + 7px);display:none;gap:5px;padding:7px;border:1px solid #cbd5e1;border-radius:16px;background:#fff;box-shadow:0 22px 62px rgba(15,23,42,.18);z-index:3}.seat-pub-lite-select.open .seat-pub-lite-menu{display:grid}.seat-pub-lite-option{height:36px;border:0;border-radius:11px;background:transparent;color:#0f172a;text-align:left;padding:0 12px;font-weight:900;cursor:pointer}.seat-pub-lite-option:hover,.seat-pub-lite-option.active{background:#dbeafe}.seat-pub-lite-radio{display:flex;gap:10px;flex-wrap:wrap}.seat-pub-lite-radio button{height:38px;border:1px solid #cbd5e1;border-radius:13px;background:#fff;color:#0f172a;padding:0 12px;font-weight:950;cursor:pointer}.seat-pub-lite-radio button.active{background:color-mix(in srgb,var(--desktop-accent,#14b8a6) 16%,#fff);border-color:var(--desktop-accent,#14b8a6)}
    .seat-pub-lite-actions{display:flex;justify-content:flex-end;gap:10px}.seat-pub-lite-actions button,.seat-pub-lite-mini-btn{height:38px;border:1px solid #cbd5e1;border-radius:13px;background:#fff;color:#0f172a;padding:0 14px;font-weight:1000;cursor:pointer}.seat-pub-lite-actions .primary,.seat-pub-lite-mini-btn.primary{background:var(--desktop-accent,#14b8a6);border-color:transparent;color:#fff}.seat-pub-lite-actions button:disabled,.seat-pub-lite-mini-btn:disabled{opacity:.65;cursor:wait}.seat-pub-lite-manage-row{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;border:1px solid #e2e8f0;border-radius:16px;padding:12px;background:#f8fafc}.seat-pub-lite-manage-title{font-weight:1000}.seat-pub-lite-manage-sub{font-size:12px;color:#64748b;font-weight:800;margin-top:3px}.seat-pub-lite-manage-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}
    .theme-dark .seat-pub-lite-modal{background:#0f172a;color:#f8fafc;border-color:#334155;box-shadow:0 28px 90px rgba(0,0,0,.42)}.theme-dark .seat-pub-lite-modal p,.theme-dark .seat-pub-lite-meta,.theme-dark .seat-pub-lite-manage-sub,.theme-dark .seat-pub-lite-loading{color:#94a3b8}.theme-dark .seat-pub-lite-trigger,.theme-dark .seat-pub-lite-actions button,.theme-dark .seat-pub-lite-mini-btn,.theme-dark .seat-pub-lite-label textarea,.theme-dark .seat-pub-lite-label input,.theme-dark .seat-pub-lite-radio button{background:#111827;color:#f8fafc;border-color:#334155}.theme-dark .seat-pub-lite-radio button.active{background:#0f766e;border-color:#2dd4bf}.theme-dark .seat-pub-lite-menu{background:#1f2937;border-color:#334155}.theme-dark .seat-pub-lite-option{color:#f8fafc}.theme-dark .seat-pub-lite-option:hover,.theme-dark .seat-pub-lite-option.active{background:#334155}.theme-dark .seat-pub-lite-manage-row{background:#111827;border-color:#334155}.theme-dark .seat-pub-lite-status-pill{background:#111827;color:#f8fafc;border-color:#334155}.theme-dark .seat-pub-lite-status-pill.preview{background:#713f12;color:#fef9c3;border-color:#a16207}.theme-dark .seat-pub-lite-status-pill.on{background:#064e3b;color:#bbf7d0;border-color:#047857}
  `;
  document.head.appendChild(style);
}

function statusText(value: SeatPubLiteStatus) {
  if (value === "preview") return "Xem trước";
  return value === "published" ? "Công bố" : "Riêng tư";
}

function formatMeta(config: SeatPubLiteConfig) {
  if (!config.updatedAt && !config.updatedBy) return "Chưa có lịch sử lưu.";
  const parts = [];
  if (config.updatedBy) parts.push(`Người lưu: ${config.updatedBy}`);
  if (config.updatedAt) parts.push(`Lúc: ${new Date(config.updatedAt).toLocaleString("vi-VN")}`);
  return parts.join(" • ");
}

function renderStatusSelect(status: SeatPubLiteStatus) {
  return `<div class="seat-pub-lite-select"><button type="button" class="seat-pub-lite-trigger"><span>${statusText(status)}</span><span>⌄</span></button><div class="seat-pub-lite-menu"><button type="button" class="seat-pub-lite-option" data-value="private">Riêng tư</button><button type="button" class="seat-pub-lite-option" data-value="preview">Xem trước</button><button type="button" class="seat-pub-lite-option" data-value="published">Công bố</button></div></div>`;
}

function bindStatusSelect(backdrop: HTMLElement, getStatus: () => SeatPubLiteStatus, setStatus: (value: SeatPubLiteStatus) => void, onSync?: () => void) {
  const select = backdrop.querySelector<HTMLElement>(".seat-pub-lite-select");
  const triggerText = backdrop.querySelector<HTMLElement>(".seat-pub-lite-trigger span");
  const sync = () => {
    if (triggerText) triggerText.textContent = statusText(getStatus());
    backdrop.querySelectorAll<HTMLElement>(".seat-pub-lite-option").forEach((node) => node.classList.toggle("active", node.dataset.value === getStatus()));
    onSync?.();
  };
  sync();
  backdrop.querySelector(".seat-pub-lite-trigger")?.addEventListener("click", (event) => {
    event.preventDefault();
    select?.classList.toggle("open");
  });
  backdrop.querySelectorAll<HTMLElement>(".seat-pub-lite-option").forEach((option) => {
    option.addEventListener("click", () => {
      setStatus(seatPubLiteCleanStatus(option.dataset.value));
      select?.classList.remove("open");
      sync();
    });
  });
}

function previewBlock(visible: boolean, value: string) {
  return `<label class="seat-pub-lite-label" data-preview-wrap style="display:${visible ? "grid" : "none"}">Học sinh được xem trước <span style="font-weight:700;color:#94a3b8">mỗi dòng 1 tên hoặc Gmail</span><textarea data-preview placeholder="Ví dụ:\nĐinh Mạnh Hữu\nhuud09052009@gmail.com">${String(value || "")}</textarea></label>`;
}

function publishBlock(visible: boolean, mode: SeatPubMode, publishAt: string) {
  const localValue = publishAt ? new Date(publishAt).toISOString().slice(0, 16) : "";
  return `<div data-publish-wrap style="display:${visible ? "grid" : "none"};gap:10px"><label class="seat-pub-lite-label">Loại công bố<div class="seat-pub-lite-radio"><button type="button" data-pub-mode="now" class="${mode === "now" ? "active" : ""}">Công bố ngay</button><button type="button" data-pub-mode="schedule" class="${mode === "schedule" ? "active" : ""}">Công bố theo hẹn giờ</button></div></label><label class="seat-pub-lite-label" data-pub-time-wrap style="display:${mode === "schedule" ? "grid" : "none"}">Giờ công bố<input type="datetime-local" data-publish-at value="${localValue}" /></label></div>`;
}

function openSeatPubLiteModal() {
  injectSeatPubLiteStyle();
  let current = seatPubLiteReadLocal();
  document.querySelector(".seat-pub-lite-backdrop")?.remove();
  let status = current.status;
  let mode: SeatPubMode = current.status === "published" && current.publishAt ? "schedule" : "now";
  const backdrop = document.createElement("div");
  backdrop.className = "seat-pub-lite-backdrop";
  backdrop.innerHTML = `
    <div class="seat-pub-lite-modal">
      <div><h3>Cài đặt công bố sơ đồ</h3><p>${current.chartTitle || seatPubLiteCurrentChartTitle()}</p><div class="seat-pub-lite-meta">${formatMeta(current)}</div></div>
      <div class="seat-pub-lite-grid"><label class="seat-pub-lite-label">Trạng thái${renderStatusSelect(status)}</label>${previewBlock(status === "preview", current.previewStudents)}${publishBlock(status === "published", mode, current.publishAt)}</div>
      <div class="seat-pub-lite-actions"><button data-close>Huỷ</button><button class="primary" data-save>Lưu cài đặt</button></div>
    </div>
  `;
  document.body.appendChild(backdrop);
  const meta = backdrop.querySelector<HTMLElement>(".seat-pub-lite-meta");
  const syncBlocks = () => {
    const preview = backdrop.querySelector<HTMLElement>("[data-preview-wrap]");
    const publish = backdrop.querySelector<HTMLElement>("[data-publish-wrap]");
    const time = backdrop.querySelector<HTMLElement>("[data-pub-time-wrap]");
    if (preview) preview.style.display = status === "preview" ? "grid" : "none";
    if (publish) publish.style.display = status === "published" ? "grid" : "none";
    if (time) time.style.display = status === "published" && mode === "schedule" ? "grid" : "none";
    backdrop.querySelectorAll<HTMLElement>("[data-pub-mode]").forEach((btn) => btn.classList.toggle("active", btn.dataset.pubMode === mode));
  };
  bindStatusSelect(backdrop, () => status, (value) => { status = value; }, syncBlocks);
  backdrop.querySelectorAll<HTMLElement>("[data-pub-mode]").forEach((btn) => btn.addEventListener("click", () => { mode = btn.dataset.pubMode === "schedule" ? "schedule" : "now"; syncBlocks(); }));

  seatPubLiteLoad().then((config) => {
    current = config;
    status = config.status;
    mode = config.status === "published" && config.publishAt ? "schedule" : "now";
    if (meta) meta.textContent = formatMeta(config);
    const textarea = backdrop.querySelector<HTMLTextAreaElement>("[data-preview]");
    if (textarea) textarea.value = config.previewStudents;
    const timeInput = backdrop.querySelector<HTMLInputElement>("[data-publish-at]");
    if (timeInput) timeInput.value = config.publishAt ? new Date(config.publishAt).toISOString().slice(0, 16) : "";
    backdrop.querySelector<HTMLElement>(".seat-pub-lite-trigger span")!.textContent = statusText(status);
    backdrop.querySelectorAll<HTMLElement>(".seat-pub-lite-option").forEach((node) => node.classList.toggle("active", node.dataset.value === status));
    syncBlocks();
  });

  const close = () => backdrop.remove();
  backdrop.querySelector("[data-close]")?.addEventListener("click", close);
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });
  backdrop.querySelector<HTMLButtonElement>("[data-save]")?.addEventListener("click", async () => {
    const saveBtn = backdrop.querySelector<HTMLButtonElement>("[data-save]");
    const previewStudents = backdrop.querySelector<HTMLTextAreaElement>("[data-preview]")?.value || "";
    const rawTime = backdrop.querySelector<HTMLInputElement>("[data-publish-at]")?.value || "";
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
  backdrop.innerHTML = `<div class="seat-pub-lite-modal"><div><h3>QL công bố</h3><p>Quản lí trạng thái công bố của sơ đồ hiện tại.</p></div><div class="seat-pub-lite-loading">Đang tải dữ liệu...</div><div class="seat-pub-lite-actions"><button data-close>Đóng</button></div></div>`;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.querySelector("[data-close]")?.addEventListener("click", close);
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });

  const config = await seatPubLiteLoad();
  if (!document.body.contains(backdrop)) return;
  const cls = config.status === "published" ? "on" : config.status === "preview" ? "preview" : "";
  const sub = `${formatMeta(config)}${config.publishAt ? ` • Hẹn giờ: ${new Date(config.publishAt).toLocaleString("vi-VN")}` : ""}`;
  backdrop.querySelector(".seat-pub-lite-modal")!.innerHTML = `<div><h3>QL công bố</h3><p>${config.chartTitle || seatPubLiteCurrentChartTitle()}</p></div><div class="seat-pub-lite-manage-row"><div><div class="seat-pub-lite-manage-title">Sơ đồ hiện tại</div><div class="seat-pub-lite-manage-sub">${sub}</div></div><span class="seat-pub-lite-status-pill ${cls}">${statusText(config.status)}</span></div><div class="seat-pub-lite-manage-actions"><button class="seat-pub-lite-mini-btn" data-private>Riêng tư</button><button class="seat-pub-lite-mini-btn" data-preview>Xem trước</button><button class="seat-pub-lite-mini-btn primary" data-publish>Công bố ngay</button><button class="seat-pub-lite-mini-btn" data-edit>Sửa</button><button class="seat-pub-lite-mini-btn" data-reset>Đặt lại</button></div><div class="seat-pub-lite-actions"><button data-close>Đóng</button></div>`;
  backdrop.querySelector("[data-close]")?.addEventListener("click", close);
  backdrop.querySelector("[data-private]")?.addEventListener("click", async () => { await seatPubLiteSave({ ...config, status: "private", publishAt: "", previewStudents: "" }); close(); });
  backdrop.querySelector("[data-preview]")?.addEventListener("click", () => { close(); openSeatPubLiteModal(); });
  backdrop.querySelector("[data-publish]")?.addEventListener("click", async () => { await seatPubLiteSave({ ...config, status: "published", publishAt: "", previewStudents: "" }); close(); });
  backdrop.querySelector("[data-reset]")?.addEventListener("click", async () => { await seatPubLiteSave({ ...config, status: "private", publishAt: "", previewStudents: "" }); close(); });
  backdrop.querySelector("[data-edit]")?.addEventListener("click", () => { close(); openSeatPubLiteModal(); });
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
  manageBtn.title = "Quản lí công bố";
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
