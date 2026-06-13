const SEAT_RUNTIME_WINDOW = "#a3k64-seating-window";
const SEAT_RUNTIME_STYLE_ID = "a3k64-seat-runtime-hard-fix-style";
const SEAT_RUNTIME_CURRENT_KEY = "a3k64-seating-sheet-current-id-v1";
const SEAT_RUNTIME_PUB_KEY = "a3k64-seating-publish-lite-v1";
const SEAT_RUNTIME_GAS_URL = String(import.meta.env.VITE_GAS_WEB_APP_URL || "").trim();

type SeatRuntimeStatus = "private" | "preview" | "published";

type SeatRuntimeAccess = {
  chartId: string;
  chartTitle: string;
  status: SeatRuntimeStatus;
  previewStudents: string;
  publishAt: string;
  updatedAt?: string;
  updatedBy?: string;
};

let seatRuntimeTimer = 0;
let seatRuntimeToastTimer = 0;
let seatRuntimeBound = false;

function seatRuntimeInjectStyle() {
  if (document.getElementById(SEAT_RUNTIME_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SEAT_RUNTIME_STYLE_ID;
  style.textContent = `
    .theme-dark ${SEAT_RUNTIME_WINDOW},
    html.a3-overlay-dark ${SEAT_RUNTIME_WINDOW}{background:#07111f!important;color:#f8fafc!important;border-color:#334155!important;}
    .theme-dark ${SEAT_RUNTIME_WINDOW} .stable-seat-titlebar,
    html.a3-overlay-dark ${SEAT_RUNTIME_WINDOW} .stable-seat-titlebar{background:#0b1220!important;border-bottom-color:#334155!important;}
    .theme-dark ${SEAT_RUNTIME_WINDOW} .stable-seat-body,
    html.a3-overlay-dark ${SEAT_RUNTIME_WINDOW} .stable-seat-body{background:linear-gradient(180deg,#07111f,#020617)!important;}
    .theme-dark ${SEAT_RUNTIME_WINDOW} .stable-seat-board,
    html.a3-overlay-dark ${SEAT_RUNTIME_WINDOW} .stable-seat-board{background:#0b1220!important;border-color:#38bdf8!important;}
    .theme-dark ${SEAT_RUNTIME_WINDOW} .stable-seat-row,
    .theme-dark ${SEAT_RUNTIME_WINDOW} .stable-seat-cell,
    html.a3-overlay-dark ${SEAT_RUNTIME_WINDOW} .stable-seat-row,
    html.a3-overlay-dark ${SEAT_RUNTIME_WINDOW} .stable-seat-cell{background:#111827!important;color:#f8fafc!important;border-color:#334155!important;}
    .theme-dark ${SEAT_RUNTIME_WINDOW} .stable-seat-cell.empty,
    html.a3-overlay-dark ${SEAT_RUNTIME_WINDOW} .stable-seat-cell.empty{background:#1e293b!important;color:#94a3b8!important;}
    .theme-dark ${SEAT_RUNTIME_WINDOW} .stable-seat-aisle,
    html.a3-overlay-dark ${SEAT_RUNTIME_WINDOW} .stable-seat-aisle{background:#0f172a!important;border-color:#334155!important;color:#60a5fa!important;}
    .theme-dark ${SEAT_RUNTIME_WINDOW} .stable-seat-students,
    html.a3-overlay-dark ${SEAT_RUNTIME_WINDOW} .stable-seat-students{background:#0b1220!important;border-color:#334155!important;}
    .theme-dark ${SEAT_RUNTIME_WINDOW} .stable-seat-student-card,
    html.a3-overlay-dark ${SEAT_RUNTIME_WINDOW} .stable-seat-student-card{background:#111827!important;color:#f8fafc!important;border-color:#334155!important;}
    .theme-dark ${SEAT_RUNTIME_WINDOW} .stable-seat-tools input,
    .theme-dark ${SEAT_RUNTIME_WINDOW} .stable-seat-tools button,
    html.a3-overlay-dark ${SEAT_RUNTIME_WINDOW} .stable-seat-tools input,
    html.a3-overlay-dark ${SEAT_RUNTIME_WINDOW} .stable-seat-tools button{background:#111827!important;color:#f8fafc!important;border-color:#334155!important;}
    .theme-dark ${SEAT_RUNTIME_WINDOW} .stable-seat-tools button.primary,
    html.a3-overlay-dark ${SEAT_RUNTIME_WINDOW} .stable-seat-tools button.primary{background:var(--desktop-accent,#14b8a6)!important;color:#fff!important;border-color:transparent!important;}
    .theme-dark ${SEAT_RUNTIME_WINDOW} .seat-ctrl-trigger,
    .theme-dark ${SEAT_RUNTIME_WINDOW} .seat-ctrl-btn,
    .theme-dark ${SEAT_RUNTIME_WINDOW} .seat-pub-lite-btn,
    html.a3-overlay-dark ${SEAT_RUNTIME_WINDOW} .seat-ctrl-trigger,
    html.a3-overlay-dark ${SEAT_RUNTIME_WINDOW} .seat-ctrl-btn,
    html.a3-overlay-dark ${SEAT_RUNTIME_WINDOW} .seat-pub-lite-btn{background:#111827!important;color:#f8fafc!important;border-color:#334155!important;}
    .theme-dark ${SEAT_RUNTIME_WINDOW} .seat-ctrl-menu,
    html.a3-overlay-dark ${SEAT_RUNTIME_WINDOW} .seat-ctrl-menu{background:#111827!important;border-color:#334155!important;box-shadow:0 24px 70px rgba(0,0,0,.44)!important;}
    .theme-dark ${SEAT_RUNTIME_WINDOW} .seat-ctrl-option,
    html.a3-overlay-dark ${SEAT_RUNTIME_WINDOW} .seat-ctrl-option{color:#f8fafc!important;}
    ${SEAT_RUNTIME_WINDOW}.seat-edit-locked .stable-seat-cell,
    ${SEAT_RUNTIME_WINDOW}.seat-edit-locked .stable-seat-student-card{cursor:default!important;}
    #a3-seat-runtime-toast{position:fixed;left:50%;top:74px;transform:translateX(-50%);z-index:1000000;display:flex;align-items:center;gap:10px;padding:10px 14px;border:1px solid rgba(20,184,166,.65);border-radius:16px;background:rgba(15,23,42,.96);color:#f8fafc;box-shadow:0 22px 68px rgba(0,0,0,.36);font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",Arial,sans-serif;font-size:14px;font-weight:900;pointer-events:none;}
    #a3-seat-runtime-toast .seat-runtime-spin{width:15px;height:15px;border-radius:999px;border:2px solid rgba(255,255,255,.28);border-top-color:#5eead4;animation:a3SeatRuntimeSpin .72s linear infinite;flex:0 0 auto;}
    #a3-seat-runtime-toast.done .seat-runtime-spin{animation:none;border-color:#5eead4;background:#5eead4;box-shadow:inset 0 0 0 4px rgba(15,23,42,.96);}
    .seat-runtime-pub-backdrop{position:fixed;inset:0;z-index:999999;background:rgba(15,23,42,.38);display:flex;align-items:center;justify-content:center;padding:18px;backdrop-filter:blur(10px);font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",Arial,sans-serif!important;}
    .seat-runtime-pub-modal{width:min(640px,100%);border:1px solid rgba(203,213,225,.9);border-radius:28px;background:rgba(255,255,255,.96);color:#0f172a;box-shadow:0 30px 100px rgba(15,23,42,.24);padding:20px;display:grid;gap:16px;}
    .seat-runtime-pub-modal h3{margin:0;font-size:22px;font-weight:950;letter-spacing:-.035em}.seat-runtime-pub-modal p{margin:5px 0 0;color:#64748b;font-size:13px}.seat-runtime-meta{font-size:12px;color:#475569;font-weight:780}.seat-runtime-field{display:grid;gap:8px}.seat-runtime-field-title{font-size:13px;font-weight:950}.seat-runtime-help{font-size:12px;font-weight:700;color:#64748b}.seat-runtime-field textarea,.seat-runtime-field input,.seat-runtime-select{min-height:44px;border:1px solid #cbd5e1;border-radius:16px;background:#fff;color:#0f172a;padding:10px 13px;font-weight:800;outline:none;font-family:inherit}.seat-runtime-field textarea{min-height:110px;resize:vertical}.seat-runtime-panel{border:1px solid #e2e8f0;border-radius:20px;background:#f8fafc;padding:14px;display:grid;gap:12px}.seat-runtime-check{display:flex;align-items:center;gap:10px;font-weight:950;cursor:pointer}.seat-runtime-radio{display:flex;gap:10px;flex-wrap:wrap}.seat-runtime-radio button,.seat-runtime-actions button{height:40px;border:1px solid #cbd5e1;border-radius:14px;background:#fff;color:#0f172a;padding:0 14px;font-weight:950;cursor:pointer}.seat-runtime-radio button.active,.seat-runtime-actions .primary{background:var(--desktop-accent,#14b8a6);border-color:transparent;color:#fff}.seat-runtime-actions{display:flex;justify-content:flex-end;gap:10px}.theme-dark .seat-runtime-pub-modal,html.a3-overlay-dark .seat-runtime-pub-modal{background:rgba(15,23,42,.97);color:#f8fafc;border-color:#334155}.theme-dark .seat-runtime-pub-modal p,.theme-dark .seat-runtime-meta,.theme-dark .seat-runtime-help,html.a3-overlay-dark .seat-runtime-pub-modal p,html.a3-overlay-dark .seat-runtime-meta,html.a3-overlay-dark .seat-runtime-help{color:#94a3b8}.theme-dark .seat-runtime-field textarea,.theme-dark .seat-runtime-field input,.theme-dark .seat-runtime-select,.theme-dark .seat-runtime-panel,.theme-dark .seat-runtime-radio button,.theme-dark .seat-runtime-actions button,html.a3-overlay-dark .seat-runtime-field textarea,html.a3-overlay-dark .seat-runtime-field input,html.a3-overlay-dark .seat-runtime-select,html.a3-overlay-dark .seat-runtime-panel,html.a3-overlay-dark .seat-runtime-radio button,html.a3-overlay-dark .seat-runtime-actions button{background:#111827;color:#f8fafc;border-color:#334155;}
    @keyframes a3SeatRuntimeSpin{to{transform:rotate(360deg)}}
  `;
  document.head.appendChild(style);
}

function seatRuntimeToast(message: string, done = false, duration = done ? 1200 : 10000) {
  seatRuntimeInjectStyle();
  clearTimeout(seatRuntimeToastTimer);
  document.getElementById("a3-seat-runtime-toast")?.remove();
  const toast = document.createElement("div");
  toast.id = "a3-seat-runtime-toast";
  if (done) toast.classList.add("done");
  toast.innerHTML = `<span class="seat-runtime-spin"></span><span>${message}</span>`;
  document.body.appendChild(toast);
  seatRuntimeToastTimer = window.setTimeout(() => toast.remove(), duration);
}

function seatRuntimeIsEditOn() {
  const button = document.querySelector<HTMLElement>(`${SEAT_RUNTIME_WINDOW} [data-tool='edit']`);
  return Boolean(button && (button.classList.contains("primary") || /đang\s*sửa/i.test(button.textContent || "")));
}

function seatRuntimeSyncEditState() {
  const win = document.querySelector<HTMLElement>(SEAT_RUNTIME_WINDOW);
  if (!win) return;
  const editOn = seatRuntimeIsEditOn();
  win.classList.toggle("seat-edit-locked", !editOn);
  win.querySelectorAll<HTMLElement>(".stable-seat-cell,.stable-seat-student-card").forEach((node) => {
    if (!editOn) {
      node.draggable = false;
      node.classList.remove("drag-over");
    }
  });
}

function seatRuntimeBlockEditWhenLocked(event: Event) {
  const target = event.target as HTMLElement | null;
  if (!target?.closest?.(SEAT_RUNTIME_WINDOW)) return;
  if (seatRuntimeIsEditOn()) return;
  if (!target.closest(".stable-seat-cell,.stable-seat-student-card")) return;
  event.preventDefault();
  event.stopPropagation();
  if ("stopImmediatePropagation" in event) event.stopImmediatePropagation();
}

function seatRuntimeCurrentChartId() {
  return localStorage.getItem(SEAT_RUNTIME_CURRENT_KEY) || "default";
}

function seatRuntimeCurrentChartTitle() {
  return document.querySelector<HTMLElement>(`${SEAT_RUNTIME_WINDOW} .seat-ctrl-trigger span`)?.textContent?.trim() || "Sơ đồ hiện tại";
}

function seatRuntimeActor() {
  try {
    const session = JSON.parse(localStorage.getItem("a3k64-login-session-v1") || "null");
    const user = session?.user || session || {};
    return { name: String(user.name || user.fullName || user.username || user.email || ""), email: String(user.email || ""), role: String(user.role || user.userRole || "") };
  } catch {
    return { name: "", email: "", role: "" };
  }
}

function seatRuntimeIsAdmin() {
  const role = seatRuntimeActor().role.toLowerCase();
  return role.includes("gvcn") || role.includes("lop_truong") || role.includes("bi_thu") || role.includes("admin");
}

function seatRuntimeCleanStatus(value: unknown): SeatRuntimeStatus {
  const raw = String(value || "").trim();
  if (raw === "preview") return "preview";
  if (raw === "published" || raw === "public") return "published";
  return "private";
}

function seatRuntimeLocalKey(chartId = seatRuntimeCurrentChartId()) {
  return `${SEAT_RUNTIME_PUB_KEY}:${chartId || "default"}`;
}

function seatRuntimeReadLocal(): SeatRuntimeAccess {
  const chartId = seatRuntimeCurrentChartId();
  try {
    const data = JSON.parse(localStorage.getItem(seatRuntimeLocalKey(chartId)) || localStorage.getItem(SEAT_RUNTIME_PUB_KEY) || "{}");
    return {
      chartId,
      chartTitle: String(data.chartTitle || data.title || seatRuntimeCurrentChartTitle()),
      status: seatRuntimeCleanStatus(data.status),
      previewStudents: String(data.previewStudents || data.preview_students || ""),
      publishAt: String(data.publishAt || data.publish_at || ""),
      updatedAt: data.updatedAt || data.updated_at,
      updatedBy: data.updatedBy || data.updated_by,
    };
  } catch {
    return { chartId, chartTitle: seatRuntimeCurrentChartTitle(), status: "private", previewStudents: "", publishAt: "" };
  }
}

function seatRuntimeSaveLocal(data: SeatRuntimeAccess) {
  localStorage.setItem(seatRuntimeLocalKey(data.chartId), JSON.stringify(data));
}

function seatRuntimeGas(action: string, payload?: unknown): Promise<any | null> {
  if (!SEAT_RUNTIME_GAS_URL) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const callbackName = `__a3k64SeatRuntime_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const callbacks = window as typeof window & Record<string, unknown>;
    const script = document.createElement("script");
    const url = new URL(SEAT_RUNTIME_GAS_URL);
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

function seatRuntimeNormalizeAccess(raw: any): SeatRuntimeAccess | null {
  const source = raw?.access || raw?.data?.access || raw?.config || raw?.data?.config || raw;
  if (!source) return null;
  return {
    chartId: String(source.chartId || source.chart_id || seatRuntimeCurrentChartId()),
    chartTitle: String(source.chartTitle || source.chart_title || source.title || seatRuntimeCurrentChartTitle()),
    status: seatRuntimeCleanStatus(source.status),
    previewStudents: String(source.previewStudents || source.preview_students || ""),
    publishAt: String(source.publishAt || source.publish_at || ""),
    updatedAt: source.updatedAt || source.updated_at,
    updatedBy: source.updatedBy || source.updated_by,
  };
}

async function seatRuntimeLoadAccess() {
  const local = seatRuntimeReadLocal();
  try {
    const response = await seatRuntimeGas("getSeatingAccess", { chartId: local.chartId, chartTitle: local.chartTitle });
    const access = seatRuntimeNormalizeAccess(response);
    if (access) {
      seatRuntimeSaveLocal(access);
      return access;
    }
  } catch (error) {
    console.warn("Không đọc được công bố, dùng local:", error);
  }
  return local;
}

async function seatRuntimeSaveAccess(data: SeatRuntimeAccess) {
  const next = { ...data, updatedAt: new Date().toISOString(), updatedBy: seatRuntimeActor().name };
  seatRuntimeSaveLocal(next);
  try {
    const response = await seatRuntimeGas("saveSeatingAccess", { ...next, actor: seatRuntimeActor() });
    const access = seatRuntimeNormalizeAccess(response);
    if (access) {
      seatRuntimeSaveLocal(access);
      return access;
    }
  } catch (error) {
    console.warn("Không lưu được công bố lên backend, đã lưu local:", error);
  }
  return next;
}

function seatRuntimeOpenPublishModal() {
  seatRuntimeInjectStyle();
  document.querySelector(".seat-runtime-pub-backdrop")?.remove();
  let current = seatRuntimeReadLocal();
  let uiMode: "private" | "preview_publish" = current.status === "private" ? "private" : "preview_publish";
  let publish = current.status === "published";
  let mode: "now" | "schedule" = current.status === "published" && current.publishAt ? "schedule" : "now";
  const localTime = current.publishAt ? new Date(current.publishAt).toISOString().slice(0, 16) : "";
  const backdrop = document.createElement("div");
  backdrop.className = "seat-runtime-pub-backdrop";
  backdrop.innerHTML = `<div class="seat-runtime-pub-modal"><div><h3>Cài đặt công bố sơ đồ</h3><p>${current.chartTitle}</p><div class="seat-runtime-meta">${current.updatedBy ? `Người lưu: ${current.updatedBy}` : "Chưa có lịch sử lưu."}</div></div><label class="seat-runtime-field"><div class="seat-runtime-field-title">Trạng thái</div><select class="seat-runtime-select" data-mode><option value="private">Riêng tư</option><option value="preview_publish">Xem trước + Công bố</option></select></label><div data-preview-area><label class="seat-runtime-field"><div class="seat-runtime-field-title">Danh sách xem trước</div><div class="seat-runtime-help">Mỗi dòng 1 tên hoặc Gmail.</div><textarea data-preview>${current.previewStudents}</textarea></label><div class="seat-runtime-panel"><label class="seat-runtime-check"><input type="checkbox" data-publish ${publish ? "checked" : ""}/> Công bố sơ đồ</label><div data-publish-inner><div class="seat-runtime-field-title">Cách công bố</div><div class="seat-runtime-radio"><button type="button" data-mode-now>Công bố ngay</button><button type="button" data-mode-schedule>Công bố theo hẹn giờ</button></div><label class="seat-runtime-field" data-time-wrap><div class="seat-runtime-field-title">Giờ công bố</div><input type="datetime-local" data-time value="${localTime}" /></label></div></div></div><div class="seat-runtime-actions"><button data-close>Huỷ</button><button class="primary" data-save>Lưu cài đặt</button></div></div>`;
  document.body.appendChild(backdrop);
  const select = backdrop.querySelector<HTMLSelectElement>("[data-mode]")!;
  select.value = uiMode;
  const sync = () => {
    const previewArea = backdrop.querySelector<HTMLElement>("[data-preview-area]")!;
    const inner = backdrop.querySelector<HTMLElement>("[data-publish-inner]")!;
    const timeWrap = backdrop.querySelector<HTMLElement>("[data-time-wrap]")!;
    previewArea.style.display = uiMode === "preview_publish" ? "grid" : "none";
    inner.style.display = uiMode === "preview_publish" && publish ? "grid" : "none";
    timeWrap.style.display = uiMode === "preview_publish" && publish && mode === "schedule" ? "grid" : "none";
    backdrop.querySelector<HTMLElement>("[data-mode-now]")?.classList.toggle("active", mode === "now");
    backdrop.querySelector<HTMLElement>("[data-mode-schedule]")?.classList.toggle("active", mode === "schedule");
  };
  sync();
  select.addEventListener("change", () => { uiMode = select.value === "preview_publish" ? "preview_publish" : "private"; if (uiMode === "private") publish = false; sync(); });
  backdrop.querySelector<HTMLInputElement>("[data-publish]")?.addEventListener("change", (event) => { publish = event.currentTarget.checked; sync(); });
  backdrop.querySelector("[data-mode-now]")?.addEventListener("click", () => { mode = "now"; sync(); });
  backdrop.querySelector("[data-mode-schedule]")?.addEventListener("click", () => { mode = "schedule"; sync(); });
  const close = () => backdrop.remove();
  backdrop.querySelector("[data-close]")?.addEventListener("click", close);
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });
  seatRuntimeLoadAccess().then((access) => {
    if (!document.body.contains(backdrop)) return;
    current = access;
  });
  backdrop.querySelector("[data-save]")?.addEventListener("click", async () => {
    const status: SeatRuntimeStatus = uiMode === "private" ? "private" : publish ? "published" : "preview";
    const rawTime = backdrop.querySelector<HTMLInputElement>("[data-time]")?.value || "";
    const publishAt = status === "published" && mode === "schedule" && rawTime ? new Date(rawTime).toISOString() : "";
    const previewStudents = uiMode === "preview_publish" ? backdrop.querySelector<HTMLTextAreaElement>("[data-preview]")!.value : "";
    seatRuntimeToast("Đang lưu cài đặt công bố...");
    await seatRuntimeSaveAccess({ ...current, chartId: seatRuntimeCurrentChartId(), chartTitle: seatRuntimeCurrentChartTitle(), status, publishAt, previewStudents });
    close();
    seatRuntimeToast("Đã lưu cài đặt công bố.", true);
  });
}

function seatRuntimeEnsurePublishButtons() {
  if (!seatRuntimeIsAdmin()) return;
  const tools = document.querySelector<HTMLElement>(`${SEAT_RUNTIME_WINDOW} .stable-seat-tools`);
  if (!tools || tools.querySelector("[data-seat-pub-lite]")) return;
  const pub = document.createElement("button");
  pub.type = "button";
  pub.className = "seat-pub-lite-btn";
  pub.dataset.seatPubLite = "1";
  pub.textContent = "Công bố";
  pub.addEventListener("click", seatRuntimeOpenPublishModal);
  const ql = document.createElement("button");
  ql.type = "button";
  ql.className = "seat-pub-lite-btn";
  ql.dataset.seatPubLiteManage = "1";
  ql.textContent = "QL";
  ql.addEventListener("click", seatRuntimeOpenPublishModal);
  const select = tools.querySelector(".seat-ctrl-select");
  tools.insertBefore(pub, select || tools.firstChild);
  tools.insertBefore(ql, pub.nextSibling);
}

function seatRuntimeBind() {
  if (seatRuntimeBound) return;
  seatRuntimeBound = true;
  ["dragstart", "dragover", "drop", "contextmenu"].forEach((type) => document.addEventListener(type, seatRuntimeBlockEditWhenLocked, true));
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const save = target?.closest?.(`${SEAT_RUNTIME_WINDOW} .seat-ctrl-btn.primary`) as HTMLElement | null;
    if (save && /lưu\s*sơ\s*đồ/i.test(save.textContent || "")) seatRuntimeToast("Đang lưu sơ đồ...");
  }, true);
  window.addEventListener("a3k64:seating-changed", () => {
    seatRuntimeSyncEditState();
    seatRuntimeEnsurePublishButtons();
  });
}

function seatRuntimeTick() {
  seatRuntimeInjectStyle();
  seatRuntimeBind();
  seatRuntimeSyncEditState();
  seatRuntimeEnsurePublishButtons();
}

function bootSeatRuntimeHardFix() {
  seatRuntimeTick();
  if (!seatRuntimeTimer) seatRuntimeTimer = window.setInterval(seatRuntimeTick, 650);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootSeatRuntimeHardFix);
else bootSeatRuntimeHardFix();

export {};
