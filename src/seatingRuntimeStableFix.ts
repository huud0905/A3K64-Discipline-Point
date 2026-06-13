const SEAT_FIX_WIN = "#a3k64-seating-window";
const SEAT_FIX_STYLE = "a3k64-seat-runtime-stable-fix-style";
const SEAT_FIX_CURRENT_KEY = "a3k64-seating-sheet-current-id-v1";
const SEAT_FIX_PUB_KEY = "a3k64-seating-publish-lite-v1";
const SEAT_FIX_GAS = String(import.meta.env.VITE_GAS_WEB_APP_URL || "").trim();

let seatFixTimer = 0;
let seatFixToastTimer = 0;
let seatFixBound = false;

type SeatFixStatus = "private" | "preview" | "published";

type SeatFixAccess = {
  chartId: string;
  chartTitle: string;
  status: SeatFixStatus;
  previewStudents: string;
  publishAt: string;
  updatedAt?: string;
  updatedBy?: string;
};

function seatFixStyle() {
  if (document.getElementById(SEAT_FIX_STYLE)) return;
  const style = document.createElement("style");
  style.id = SEAT_FIX_STYLE;
  style.textContent = `
    .theme-dark ${SEAT_FIX_WIN},html.a3-overlay-dark ${SEAT_FIX_WIN}{background:#07111f!important;color:#f8fafc!important;border-color:#334155!important}
    .theme-dark ${SEAT_FIX_WIN} .stable-seat-titlebar,html.a3-overlay-dark ${SEAT_FIX_WIN} .stable-seat-titlebar{background:#0b1220!important;border-bottom-color:#334155!important}
    .theme-dark ${SEAT_FIX_WIN} .stable-seat-body,html.a3-overlay-dark ${SEAT_FIX_WIN} .stable-seat-body{background:linear-gradient(180deg,#07111f,#020617)!important}
    .theme-dark ${SEAT_FIX_WIN} .stable-seat-board,html.a3-overlay-dark ${SEAT_FIX_WIN} .stable-seat-board{background:#0b1220!important;border-color:#38bdf8!important}
    .theme-dark ${SEAT_FIX_WIN} .stable-seat-row,.theme-dark ${SEAT_FIX_WIN} .stable-seat-cell,html.a3-overlay-dark ${SEAT_FIX_WIN} .stable-seat-row,html.a3-overlay-dark ${SEAT_FIX_WIN} .stable-seat-cell{background:#111827!important;color:#f8fafc!important;border-color:#334155!important}
    .theme-dark ${SEAT_FIX_WIN} .stable-seat-cell.empty,html.a3-overlay-dark ${SEAT_FIX_WIN} .stable-seat-cell.empty{background:#1e293b!important;color:#94a3b8!important}
    .theme-dark ${SEAT_FIX_WIN} .stable-seat-aisle,html.a3-overlay-dark ${SEAT_FIX_WIN} .stable-seat-aisle{background:#0f172a!important;border-color:#334155!important;color:#60a5fa!important}
    .theme-dark ${SEAT_FIX_WIN} .stable-seat-students,html.a3-overlay-dark ${SEAT_FIX_WIN} .stable-seat-students{background:#0b1220!important;border-color:#334155!important}
    .theme-dark ${SEAT_FIX_WIN} .stable-seat-student-card,html.a3-overlay-dark ${SEAT_FIX_WIN} .stable-seat-student-card{background:#111827!important;color:#f8fafc!important;border-color:#334155!important}
    .theme-dark ${SEAT_FIX_WIN} .stable-seat-tools input,.theme-dark ${SEAT_FIX_WIN} .stable-seat-tools button,html.a3-overlay-dark ${SEAT_FIX_WIN} .stable-seat-tools input,html.a3-overlay-dark ${SEAT_FIX_WIN} .stable-seat-tools button{background:#111827!important;color:#f8fafc!important;border-color:#334155!important}
    .theme-dark ${SEAT_FIX_WIN} .stable-seat-tools button.primary,html.a3-overlay-dark ${SEAT_FIX_WIN} .stable-seat-tools button.primary{background:var(--desktop-accent,#14b8a6)!important;color:#fff!important;border-color:transparent!important}
    ${SEAT_FIX_WIN}.seat-edit-locked .stable-seat-cell,${SEAT_FIX_WIN}.seat-edit-locked .stable-seat-student-card{cursor:default!important}
    #a3-seat-fix-toast{position:fixed;left:50%;top:74px;transform:translateX(-50%);z-index:1000000;display:flex;align-items:center;gap:10px;padding:10px 14px;border:1px solid rgba(20,184,166,.65);border-radius:16px;background:rgba(15,23,42,.96);color:#f8fafc;box-shadow:0 22px 68px rgba(0,0,0,.36);font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",Arial,sans-serif;font-size:14px;font-weight:900;pointer-events:none}
    #a3-seat-fix-toast .spin{width:15px;height:15px;border-radius:999px;border:2px solid rgba(255,255,255,.28);border-top-color:#5eead4;animation:a3SeatFixSpin .72s linear infinite;flex:0 0 auto}#a3-seat-fix-toast.done .spin{animation:none;border-color:#5eead4;background:#5eead4;box-shadow:inset 0 0 0 4px rgba(15,23,42,.96)}
    .seat-fix-pub-backdrop{position:fixed;inset:0;z-index:999999;background:rgba(15,23,42,.38);display:flex;align-items:center;justify-content:center;padding:18px;backdrop-filter:blur(10px);font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",Arial,sans-serif!important}.seat-fix-pub-modal{width:min(640px,100%);border:1px solid rgba(203,213,225,.9);border-radius:28px;background:rgba(255,255,255,.96);color:#0f172a;box-shadow:0 30px 100px rgba(15,23,42,.24);padding:20px;display:grid;gap:16px}.seat-fix-pub-modal h3{margin:0;font-size:22px;font-weight:950;letter-spacing:-.035em}.seat-fix-pub-modal p{margin:5px 0 0;color:#64748b;font-size:13px}.seat-fix-meta{font-size:12px;color:#475569;font-weight:780}.seat-fix-field{display:grid;gap:8px}.seat-fix-field-title{font-size:13px;font-weight:950}.seat-fix-help{font-size:12px;font-weight:700;color:#64748b}.seat-fix-field textarea,.seat-fix-field input,.seat-fix-select{min-height:44px;border:1px solid #cbd5e1;border-radius:16px;background:#fff;color:#0f172a;padding:10px 13px;font-weight:800;outline:none;font-family:inherit}.seat-fix-field textarea{min-height:110px;resize:vertical}.seat-fix-panel{border:1px solid #e2e8f0;border-radius:20px;background:#f8fafc;padding:14px;display:grid;gap:12px}.seat-fix-check{display:flex;align-items:center;gap:10px;font-weight:950;cursor:pointer}.seat-fix-radio{display:flex;gap:10px;flex-wrap:wrap}.seat-fix-radio button,.seat-fix-actions button{height:40px;border:1px solid #cbd5e1;border-radius:14px;background:#fff;color:#0f172a;padding:0 14px;font-weight:950;cursor:pointer}.seat-fix-radio button.active,.seat-fix-actions .primary{background:var(--desktop-accent,#14b8a6);border-color:transparent;color:#fff}.seat-fix-actions{display:flex;justify-content:flex-end;gap:10px}.theme-dark .seat-fix-pub-modal,html.a3-overlay-dark .seat-fix-pub-modal{background:rgba(15,23,42,.97);color:#f8fafc;border-color:#334155}.theme-dark .seat-fix-pub-modal p,.theme-dark .seat-fix-meta,.theme-dark .seat-fix-help,html.a3-overlay-dark .seat-fix-pub-modal p,html.a3-overlay-dark .seat-fix-meta,html.a3-overlay-dark .seat-fix-help{color:#94a3b8}.theme-dark .seat-fix-field textarea,.theme-dark .seat-fix-field input,.theme-dark .seat-fix-select,.theme-dark .seat-fix-panel,.theme-dark .seat-fix-radio button,.theme-dark .seat-fix-actions button,html.a3-overlay-dark .seat-fix-field textarea,html.a3-overlay-dark .seat-fix-field input,html.a3-overlay-dark .seat-fix-select,html.a3-overlay-dark .seat-fix-panel,html.a3-overlay-dark .seat-fix-radio button,html.a3-overlay-dark .seat-fix-actions button{background:#111827;color:#f8fafc;border-color:#334155}
    @keyframes a3SeatFixSpin{to{transform:rotate(360deg)}}
  `;
  document.head.appendChild(style);
}

function seatFixToast(message: string, done = false) {
  seatFixStyle();
  clearTimeout(seatFixToastTimer);
  document.getElementById("a3-seat-fix-toast")?.remove();
  const toast = document.createElement("div");
  toast.id = "a3-seat-fix-toast";
  if (done) toast.classList.add("done");
  toast.innerHTML = `<span class="spin"></span><span>${message}</span>`;
  document.body.appendChild(toast);
  seatFixToastTimer = window.setTimeout(() => toast.remove(), done ? 1200 : 10000);
}

function seatFixEditOn() {
  const button = document.querySelector<HTMLElement>(`${SEAT_FIX_WIN} [data-tool='edit']`);
  return Boolean(button && (button.classList.contains("primary") || /đang\s*sửa/i.test(button.textContent || "")));
}

function seatFixSyncEdit() {
  const win = document.querySelector<HTMLElement>(SEAT_FIX_WIN);
  if (!win) return;
  const on = seatFixEditOn();
  win.classList.toggle("seat-edit-locked", !on);
  if (!on) {
    win.querySelectorAll<HTMLElement>(".stable-seat-cell,.stable-seat-student-card").forEach((node) => {
      node.draggable = false;
      node.classList.remove("drag-over");
    });
  }
}

function seatFixBlockWhenLocked(event: Event) {
  const target = event.target as HTMLElement | null;
  if (!target?.closest?.(SEAT_FIX_WIN)) return;
  if (seatFixEditOn()) return;
  if (!target.closest(".stable-seat-cell,.stable-seat-student-card")) return;
  event.preventDefault();
  event.stopPropagation();
  if ("stopImmediatePropagation" in event) event.stopImmediatePropagation();
}

function seatFixCurrentId() { return localStorage.getItem(SEAT_FIX_CURRENT_KEY) || "default"; }
function seatFixCurrentTitle() { return document.querySelector<HTMLElement>(`${SEAT_FIX_WIN} .seat-ctrl-trigger span`)?.textContent?.trim() || "Sơ đồ hiện tại"; }
function seatFixLocalKey(id = seatFixCurrentId()) { return `${SEAT_FIX_PUB_KEY}:${id || "default"}`; }
function seatFixStatus(value: unknown): SeatFixStatus { const raw = String(value || "").trim(); return raw === "preview" ? "preview" : raw === "published" || raw === "public" ? "published" : "private"; }
function seatFixActor() {
  try { const s = JSON.parse(localStorage.getItem("a3k64-login-session-v1") || "null"); const u = s?.user || s || {}; return { name: String(u.name || u.fullName || u.username || u.email || ""), email: String(u.email || ""), role: String(u.role || u.userRole || "") }; } catch { return { name: "", email: "", role: "" }; }
}
function seatFixAdmin() { const role = seatFixActor().role.toLowerCase(); return role.includes("gvcn") || role.includes("lop_truong") || role.includes("bi_thu") || role.includes("admin"); }

function seatFixReadLocal(): SeatFixAccess {
  const chartId = seatFixCurrentId();
  try {
    const data = JSON.parse(localStorage.getItem(seatFixLocalKey(chartId)) || localStorage.getItem(SEAT_FIX_PUB_KEY) || "{}");
    return { chartId, chartTitle: String(data.chartTitle || data.title || seatFixCurrentTitle()), status: seatFixStatus(data.status), previewStudents: String(data.previewStudents || data.preview_students || ""), publishAt: String(data.publishAt || data.publish_at || ""), updatedAt: data.updatedAt || data.updated_at, updatedBy: data.updatedBy || data.updated_by };
  } catch { return { chartId, chartTitle: seatFixCurrentTitle(), status: "private", previewStudents: "", publishAt: "" }; }
}
function seatFixSaveLocal(data: SeatFixAccess) { localStorage.setItem(seatFixLocalKey(data.chartId), JSON.stringify(data)); }

function seatFixGas(action: string, payload?: unknown): Promise<any | null> {
  if (!SEAT_FIX_GAS) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const callbackName = `__a3k64SeatFix_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const callbacks = window as typeof window & Record<string, unknown>;
    const script = document.createElement("script");
    const url = new URL(SEAT_FIX_GAS);
    let done = false;
    let timeout = 0;
    url.searchParams.set("action", action); url.searchParams.set("callback", callbackName); url.searchParams.set("t", String(Date.now()));
    if (payload !== undefined) url.searchParams.set("payload", JSON.stringify(payload));
    callbacks[callbackName] = (json: any) => { if (done) return; done = true; clearTimeout(timeout); delete callbacks[callbackName]; script.remove(); if (json?.ok === false || json?.data?.ok === false) reject(new Error(String(json.error || json.data?.error || "Backend lỗi"))); else resolve(json?.data || json); };
    script.onerror = () => { if (done) return; done = true; clearTimeout(timeout); delete callbacks[callbackName]; script.remove(); reject(new Error("Không gọi được Apps Script")); };
    timeout = window.setTimeout(() => { if (done) return; done = true; delete callbacks[callbackName]; script.remove(); reject(new Error("Apps Script phản hồi quá lâu")); }, 10000);
    script.src = url.toString(); document.head.appendChild(script);
  });
}
function seatFixNormalize(raw: any): SeatFixAccess | null { const s = raw?.access || raw?.data?.access || raw?.config || raw?.data?.config || raw; if (!s) return null; return { chartId: String(s.chartId || s.chart_id || seatFixCurrentId()), chartTitle: String(s.chartTitle || s.chart_title || s.title || seatFixCurrentTitle()), status: seatFixStatus(s.status), previewStudents: String(s.previewStudents || s.preview_students || ""), publishAt: String(s.publishAt || s.publish_at || ""), updatedAt: s.updatedAt || s.updated_at, updatedBy: s.updatedBy || s.updated_by }; }
async function seatFixLoadAccess() { const local = seatFixReadLocal(); try { const res = await seatFixGas("getSeatingAccess", { chartId: local.chartId, chartTitle: local.chartTitle }); const access = seatFixNormalize(res); if (access) { seatFixSaveLocal(access); return access; } } catch (e) { console.warn("Không đọc được công bố, dùng local:", e); } return local; }
async function seatFixSaveAccess(data: SeatFixAccess) { const next = { ...data, updatedAt: new Date().toISOString(), updatedBy: seatFixActor().name }; seatFixSaveLocal(next); try { const res = await seatFixGas("saveSeatingAccess", { ...next, actor: seatFixActor() }); const access = seatFixNormalize(res); if (access) { seatFixSaveLocal(access); return access; } } catch (e) { console.warn("Không lưu được công bố lên backend, đã lưu local:", e); } return next; }

function seatFixOpenPublish() {
  seatFixStyle();
  document.querySelector(".seat-fix-pub-backdrop")?.remove();
  let current = seatFixReadLocal();
  let uiMode: "private" | "preview_publish" = current.status === "private" ? "private" : "preview_publish";
  let publish = current.status === "published";
  let mode: "now" | "schedule" = current.status === "published" && current.publishAt ? "schedule" : "now";
  const localTime = current.publishAt ? new Date(current.publishAt).toISOString().slice(0, 16) : "";
  const backdrop = document.createElement("div");
  backdrop.className = "seat-fix-pub-backdrop";
  backdrop.innerHTML = `<div class="seat-fix-pub-modal"><div><h3>Cài đặt công bố sơ đồ</h3><p>${current.chartTitle}</p><div class="seat-fix-meta">${current.updatedBy ? `Người lưu: ${current.updatedBy}` : "Chưa có lịch sử lưu."}</div></div><label class="seat-fix-field"><div class="seat-fix-field-title">Trạng thái</div><select class="seat-fix-select" data-mode><option value="private">Riêng tư</option><option value="preview_publish">Xem trước + Công bố</option></select></label><div data-preview-area><label class="seat-fix-field"><div class="seat-fix-field-title">Danh sách xem trước</div><div class="seat-fix-help">Mỗi dòng 1 tên hoặc Gmail.</div><textarea data-preview>${current.previewStudents}</textarea></label><div class="seat-fix-panel"><label class="seat-fix-check"><input type="checkbox" data-publish ${publish ? "checked" : ""}/> Công bố sơ đồ</label><div data-publish-inner><div class="seat-fix-field-title">Cách công bố</div><div class="seat-fix-radio"><button type="button" data-now>Công bố ngay</button><button type="button" data-schedule>Công bố theo hẹn giờ</button></div><label class="seat-fix-field" data-time-wrap><div class="seat-fix-field-title">Giờ công bố</div><input type="datetime-local" data-time value="${localTime}" /></label></div></div></div><div class="seat-fix-actions"><button data-close>Huỷ</button><button class="primary" data-save>Lưu cài đặt</button></div></div>`;
  document.body.appendChild(backdrop);
  const select = backdrop.querySelector<HTMLSelectElement>("[data-mode]")!;
  select.value = uiMode;
  const sync = () => { const area = backdrop.querySelector<HTMLElement>("[data-preview-area]")!; const inner = backdrop.querySelector<HTMLElement>("[data-publish-inner]")!; const time = backdrop.querySelector<HTMLElement>("[data-time-wrap]")!; area.style.display = uiMode === "preview_publish" ? "grid" : "none"; inner.style.display = uiMode === "preview_publish" && publish ? "grid" : "none"; time.style.display = uiMode === "preview_publish" && publish && mode === "schedule" ? "grid" : "none"; backdrop.querySelector<HTMLElement>("[data-now]")?.classList.toggle("active", mode === "now"); backdrop.querySelector<HTMLElement>("[data-schedule]")?.classList.toggle("active", mode === "schedule"); };
  sync();
  select.addEventListener("change", () => { uiMode = select.value === "preview_publish" ? "preview_publish" : "private"; if (uiMode === "private") publish = false; sync(); });
  backdrop.querySelector<HTMLInputElement>("[data-publish]")?.addEventListener("change", (event) => { publish = (event.currentTarget as HTMLInputElement).checked; sync(); });
  backdrop.querySelector("[data-now]")?.addEventListener("click", () => { mode = "now"; sync(); });
  backdrop.querySelector("[data-schedule]")?.addEventListener("click", () => { mode = "schedule"; sync(); });
  const close = () => backdrop.remove();
  backdrop.querySelector("[data-close]")?.addEventListener("click", close);
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });
  seatFixLoadAccess().then((access) => { if (document.body.contains(backdrop)) current = access; });
  backdrop.querySelector("[data-save]")?.addEventListener("click", async () => { const status: SeatFixStatus = uiMode === "private" ? "private" : publish ? "published" : "preview"; const rawTime = backdrop.querySelector<HTMLInputElement>("[data-time]")?.value || ""; const publishAt = status === "published" && mode === "schedule" && rawTime ? new Date(rawTime).toISOString() : ""; const previewStudents = uiMode === "preview_publish" ? backdrop.querySelector<HTMLTextAreaElement>("[data-preview]")!.value : ""; seatFixToast("Đang lưu cài đặt công bố..."); await seatFixSaveAccess({ ...current, chartId: seatFixCurrentId(), chartTitle: seatFixCurrentTitle(), status, publishAt, previewStudents }); close(); seatFixToast("Đã lưu cài đặt công bố.", true); });
}

function seatFixEnsurePubButtons() {
  if (!seatFixAdmin()) return;
  const tools = document.querySelector<HTMLElement>(`${SEAT_FIX_WIN} .stable-seat-tools`);
  if (!tools || tools.querySelector("[data-seat-pub-lite]")) return;
  const pub = document.createElement("button"); pub.type = "button"; pub.className = "seat-pub-lite-btn"; pub.dataset.seatPubLite = "1"; pub.textContent = "Công bố"; pub.addEventListener("click", seatFixOpenPublish);
  const ql = document.createElement("button"); ql.type = "button"; ql.className = "seat-pub-lite-btn"; ql.dataset.seatPubLiteManage = "1"; ql.textContent = "QL"; ql.addEventListener("click", seatFixOpenPublish);
  const select = tools.querySelector(".seat-ctrl-select");
  tools.insertBefore(pub, select || tools.firstChild);
  tools.insertBefore(ql, pub.nextSibling);
}

function seatFixBind() {
  if (seatFixBound) return;
  seatFixBound = true;
  ["dragstart", "dragover", "drop", "contextmenu"].forEach((type) => document.addEventListener(type, seatFixBlockWhenLocked, true));
  document.addEventListener("click", (event) => { const target = event.target as HTMLElement | null; const save = target?.closest?.(`${SEAT_FIX_WIN} .seat-ctrl-btn.primary`) as HTMLElement | null; if (save && /lưu\s*sơ\s*đồ/i.test(save.textContent || "")) seatFixToast("Đang lưu sơ đồ..."); }, true);
  window.addEventListener("a3k64:seating-changed", () => { seatFixSyncEdit(); seatFixEnsurePubButtons(); });
}

function seatFixTick() {
  seatFixStyle();
  seatFixBind();
  seatFixSyncEdit();
  seatFixEnsurePubButtons();
}

function bootSeatRuntimeStableFix() {
  seatFixTick();
  if (!seatFixTimer) seatFixTimer = window.setInterval(seatFixTick, 650);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootSeatRuntimeStableFix);
else bootSeatRuntimeStableFix();

export {};
