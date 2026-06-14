const SEAT_PUB_WINDOW = "#a3k64-seating-window";
const SEAT_PUB_STYLE_ID = "a3k64-seating-publish-style";
const SEAT_PUB_KEY = "a3k64-seating-publish-lite-v2";
const SEAT_PUB_CHART_KEY = "a3k64-seating-sheet-current-id-v1";
const SEAT_PUB_GAS_URL = String(import.meta.env.VITE_GAS_WEB_APP_URL || "").trim();

let seatPubBooted = false;
let seatPubToastTimer = 0;

type SeatPubStatus = "private" | "preview" | "published";
type SeatPubUiMode = "private" | "preview_publish";
type SeatPubPublishMode = "now" | "schedule";
type SeatPubPreviewMode = "view" | "edit";
type SeatPubPerm = "move" | "save" | "create" | "restore" | "random" | "export";
type SeatPubAccess = {
  chartId: string;
  chartTitle: string;
  status: SeatPubStatus;
  previewStudents: string;
  publishAt: string;
  previewMode: SeatPubPreviewMode;
  previewPermissions: Partial<Record<SeatPubPerm, boolean>>;
  updatedAt: string;
  updatedBy: string;
  revision?: number;
};

type SeatPubChart = { id: string; title: string; active?: boolean; version?: number };

const SEAT_PUB_PERMISSIONS: Array<{ key: SeatPubPerm; label: string }> = [
  { key: "move", label: "Đổi chỗ / kéo thả" },
  { key: "save", label: "Lưu sơ đồ" },
  { key: "create", label: "Tạo sơ đồ mới" },
  { key: "restore", label: "Khôi phục" },
  { key: "random", label: "Random" },
  { key: "export", label: "Xuất/in" },
];

function seatPubFold(value: unknown) {
  return String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "");
}

function seatPubCleanStatus(value: unknown): SeatPubStatus {
  const raw = seatPubFold(value);
  if (raw === "preview" || raw === "xemtruoc") return "preview";
  if (["published", "publish", "public", "congbo", "congkhai", "scheduled", "hengio", "dahengio"].includes(raw)) return "published";
  return "private";
}

function seatPubCleanPreviewMode(value: unknown): SeatPubPreviewMode {
  const raw = seatPubFold(value);
  return raw === "edit" || raw === "sua" || raw === "allowedit" ? "edit" : "view";
}

function seatPubEscape(value: unknown) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
}

function seatPubPad(n: number) { return String(n).padStart(2, "0"); }
function seatPubMs(value: string) { const t = new Date(value || "").getTime(); return Number.isFinite(t) ? t : 0; }
function seatPubToInput(value: string) {
  const d = new Date(value || "");
  if (!Number.isFinite(d.getTime())) return "";
  return `${d.getFullYear()}-${seatPubPad(d.getMonth() + 1)}-${seatPubPad(d.getDate())}T${seatPubPad(d.getHours())}:${seatPubPad(d.getMinutes())}`;
}
function seatPubFromInput(value: string) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : "";
}

function seatPubActor() {
  try {
    const session = JSON.parse(localStorage.getItem("a3k64-login-session-v1") || "null");
    const user = session?.user || session || {};
    return {
      name: String(user.name || user.fullName || user.studentName || user.displayName || user.hoTen || user.fullname || user.username || user.email || ""),
      email: String(user.email || user.username || ""),
      username: String(user.username || user.email || ""),
      role: String(user.role || user.userRole || ""),
    };
  } catch {
    return { name: "", email: "", username: "", role: "" };
  }
}

function seatPubIsAdmin() {
  const role = seatPubFold(seatPubActor().role);
  return role.includes("gvcn") || role.includes("loptruong") || role.includes("bithu") || role.includes("admin");
}

function seatPubToolbarTitle() {
  return document.querySelector<HTMLElement>(`${SEAT_PUB_WINDOW} .seat-ctrl-trigger span`)?.textContent?.trim() || "Sơ đồ hiện tại";
}

function seatPubCurrentStoredId() {
  const id = String(localStorage.getItem(SEAT_PUB_CHART_KEY) || "").trim();
  return id && id !== "default" ? id : "";
}

function seatPubKey(chartId: string, title?: string) {
  return `${SEAT_PUB_KEY}:${chartId || seatPubFold(title || seatPubToolbarTitle()) || "current"}`;
}

function seatPubDefault(chartTitle = seatPubToolbarTitle()): SeatPubAccess {
  return { chartId: "", chartTitle, status: "private", previewStudents: "", publishAt: "", previewMode: "view", previewPermissions: {}, updatedAt: "", updatedBy: "", revision: 0 };
}

function seatPubParsePerms(value: unknown): Partial<Record<SeatPubPerm, boolean>> {
  let raw: any = value || {};
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { raw = {}; }
  }
  if (raw?.permissions) raw = raw.permissions;
  const out: Partial<Record<SeatPubPerm, boolean>> = {};
  SEAT_PUB_PERMISSIONS.forEach(({ key }) => { out[key] = Boolean(raw?.[key]); });
  return out;
}

function seatPubNormalize(raw: any, fallbackTitle = seatPubToolbarTitle()): SeatPubAccess | null {
  const source = raw?.access || raw?.data?.access || raw?.config || raw?.data?.config || raw;
  if (!source) return null;
  return {
    chartId: String(source.chartId || source.chart_id || source.id || "").trim(),
    chartTitle: String(source.chartTitle || source.chart_title || source.title || fallbackTitle || "Sơ đồ hiện tại").trim(),
    status: seatPubCleanStatus(source.status),
    previewStudents: String(source.previewStudents || source.preview_students || ""),
    publishAt: String(source.publishAt || source.publish_at || ""),
    previewMode: seatPubCleanPreviewMode(source.previewMode || source.preview_mode),
    previewPermissions: seatPubParsePerms(source.previewPermissions || source.preview_permissions),
    updatedAt: String(source.updatedAt || source.updated_at || ""),
    updatedBy: String(source.updatedBy || source.updated_by || ""),
    revision: Number(source.revision || source.access_revision || 0) || 0,
  };
}

function seatPubSaveCache(access: SeatPubAccess) {
  try {
    localStorage.setItem(seatPubKey(access.chartId, access.chartTitle), JSON.stringify(access));
    if (access.chartId) localStorage.setItem(SEAT_PUB_CHART_KEY, access.chartId);
  } catch {}
}

function seatPubSyncRuntime(access: SeatPubAccess) {
  const root = document.documentElement;
  root.dataset.seatPreviewMode = access.previewMode;
  root.dataset.seatPreviewPerms = Object.entries(access.previewPermissions || {}).filter(([, v]) => Boolean(v)).map(([k]) => k).join(",");
  window.dispatchEvent(new CustomEvent("a3k64:seating-access-updated", { detail: access }));
  window.dispatchEvent(new CustomEvent("a3k64:seating-changed", { detail: { access } }));
}

function seatPubStatusText(config: Pick<SeatPubAccess, "status" | "publishAt">) {
  if (config.status === "published" && seatPubMs(config.publishAt) > Date.now()) return "Hẹn giờ công bố";
  if (config.status === "published") return "Đã công bố";
  if (config.status === "preview") return "Xem trước";
  return "Riêng tư";
}

function seatPubMeta(config: SeatPubAccess) {
  const parts = [];
  if (config.updatedBy) parts.push(`Người lưu: ${config.updatedBy}`);
  if (config.updatedAt) parts.push(`Lúc: ${new Date(config.updatedAt).toLocaleString("vi-VN")}`);
  if (config.status === "published" && config.publishAt) parts.push(`Hẹn giờ: ${new Date(config.publishAt).toLocaleString("vi-VN")}`);
  return parts.join(" • ") || "Lưu trực tiếp lên backend.";
}

function seatPubStatusClass(config: SeatPubAccess) {
  if (config.status === "published" && seatPubMs(config.publishAt) > Date.now()) return "scheduled";
  if (config.status === "published") return "on";
  if (config.status === "preview") return "preview";
  return "";
}

function seatPubModeText(mode: SeatPubUiMode) { return mode === "preview_publish" ? "Xem trước + Công bố" : "Riêng tư"; }
function seatPubUiMode(status: SeatPubStatus): SeatPubUiMode { return status === "private" ? "private" : "preview_publish"; }

function seatPubToast(message: string, done = false) {
  clearTimeout(seatPubToastTimer);
  document.getElementById("a3-seat-pub-toast")?.remove();
  const toast = document.createElement("div");
  toast.id = "a3-seat-pub-toast";
  if (done) toast.classList.add("done");
  toast.innerHTML = `<span class="spin"></span><span>${seatPubEscape(message)}</span>`;
  document.body.appendChild(toast);
  seatPubToastTimer = window.setTimeout(() => toast.remove(), done ? 1500 : 10000);
}

function seatPubGas(action: string, payload?: unknown): Promise<any> {
  if (!SEAT_PUB_GAS_URL) return Promise.reject(new Error("Thiếu VITE_GAS_WEB_APP_URL."));
  return new Promise((resolve, reject) => {
    const callbackName = `__a3SeatPub_${Date.now()}_${Math.random().toString(36).slice(2)}`;
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
      if (json?.ok === false || json?.data?.ok === false || json?.success === false) reject(new Error(String(json.error || json.data?.error || json.msg || "Backend lỗi")));
      else resolve(json?.data || json);
    };
    script.onerror = () => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      delete callbacks[callbackName];
      script.remove();
      reject(new Error("Không gọi được Apps Script."));
    };
    timeout = window.setTimeout(() => {
      if (done) return;
      done = true;
      delete callbacks[callbackName];
      script.remove();
      reject(new Error("Apps Script phản hồi quá lâu."));
    }, 12000);
    script.src = url.toString();
    document.head.appendChild(script);
  });
}

function seatPubChartsFrom(raw: any): SeatPubChart[] {
  const list = raw?.charts || raw?.data?.charts || raw?.data?.data?.charts || [];
  return Array.isArray(list) ? list.map((item) => ({
    id: String(item?.id || item?.chartId || item?.chart_id || "").trim(),
    title: String(item?.title || item?.chartTitle || item?.chart_title || "").trim(),
    active: item?.active === true || String(item?.active || item?.is_active || "").toLowerCase() === "true",
    version: Number(item?.version || 0) || 0,
  })).filter((item) => item.id || item.title) : [];
}

async function seatPubResolveChart(title = seatPubToolbarTitle()) {
  const storedId = seatPubCurrentStoredId();
  const charts = seatPubChartsFrom(await seatPubGas("listSeatingCharts", {}));
  const titleKey = seatPubFold(title);
  const byId = storedId ? charts.find((chart) => chart.id === storedId) : null;
  const byTitle = charts.find((chart) => seatPubFold(chart.title) === titleKey);
  const byNumber = (() => {
    const n = String(title || "").match(/\d+/)?.[0] || "";
    return n ? charts.find((chart) => (String(chart.title || "").match(/\d+/)?.[0] || "") === n && seatPubFold(chart.title).includes("sodo")) : null;
  })();
  const active = charts.find((chart) => chart.active);
  const found = byId || byTitle || byNumber || active || null;
  return { chartId: String(found?.id || storedId || ""), chartTitle: String(found?.title || title || "Sơ đồ hiện tại") };
}

async function seatPubLoadAccess(title = seatPubToolbarTitle()) {
  const resolved = await seatPubResolveChart(title);
  const response = await seatPubGas("getSeatingAccess", resolved);
  const access = seatPubNormalize(response, resolved.chartTitle) || seatPubDefault(resolved.chartTitle);
  const finalAccess = { ...access, chartId: access.chartId || resolved.chartId, chartTitle: access.chartTitle || resolved.chartTitle };
  seatPubSaveCache(finalAccess);
  seatPubSyncRuntime(finalAccess);
  return finalAccess;
}

async function seatPubSaveAccess(input: SeatPubAccess) {
  const resolved = await seatPubResolveChart(input.chartTitle || seatPubToolbarTitle());
  const next: SeatPubAccess = {
    ...input,
    chartId: resolved.chartId || input.chartId,
    chartTitle: resolved.chartTitle || input.chartTitle || seatPubToolbarTitle(),
    status: seatPubCleanStatus(input.status),
    previewStudents: input.status === "private" ? "" : String(input.previewStudents || ""),
    publishAt: input.status === "published" ? String(input.publishAt || "") : "",
    previewMode: input.status === "private" ? "view" : seatPubCleanPreviewMode(input.previewMode),
    previewPermissions: input.status !== "private" && input.previewMode === "edit" ? seatPubParsePerms(input.previewPermissions) : {},
    updatedAt: new Date().toISOString(),
    updatedBy: seatPubActor().name,
  };
  const response = await seatPubGas("saveSeatingAccess", {
    ...next,
    chart_id: next.chartId,
    chart_title: next.chartTitle,
    preview_students: next.previewStudents,
    publish_at: next.publishAt,
    preview_mode: next.previewMode,
    preview_permissions: JSON.stringify(next.previewPermissions || {}),
    actor: seatPubActor(),
  });
  const saved = seatPubNormalize(response, next.chartTitle);
  if (!saved) throw new Error("Backend không trả dữ liệu công bố sau khi lưu.");
  if (saved.status !== next.status) throw new Error("Frontend đã lưu nhưng backend trả sai trạng thái.");
  if (saved.previewMode !== next.previewMode) throw new Error("Backend chưa trả đúng chế độ xem trước.");
  const finalSaved = { ...saved, chartId: saved.chartId || next.chartId, chartTitle: saved.chartTitle || next.chartTitle };
  seatPubSaveCache(finalSaved);
  seatPubSyncRuntime(finalSaved);
  return finalSaved;
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
    .seat-pub-lite-modal{width:min(670px,100%);max-height:min(92vh,780px);overflow:auto;border:1px solid rgba(203,213,225,.9);border-radius:28px;background:rgba(255,255,255,.97);color:#0f172a;box-shadow:0 30px 100px rgba(15,23,42,.24);padding:20px;display:grid;gap:16px}
    .seat-pub-lite-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.seat-pub-lite-title h3{margin:0;font-size:22px;font-weight:950;letter-spacing:-.035em}.seat-pub-lite-title p{margin:5px 0 0;color:#64748b;font-size:13px}.seat-pub-lite-meta{font-size:12px;color:#475569;font-weight:780;margin-top:5px}.seat-pub-lite-badge,.seat-pub-lite-status-pill{display:inline-flex;align-items:center;justify-content:center;height:32px;border-radius:999px;padding:0 12px;border:1px solid #cbd5e1;background:#fff;color:#0f172a;font-size:12px;font-weight:950;white-space:nowrap}.seat-pub-lite-status-pill.on{background:#dcfce7;color:#166534;border-color:#86efac}.seat-pub-lite-status-pill.preview{background:#fef9c3;color:#854d0e;border-color:#fde68a}.seat-pub-lite-status-pill.scheduled{background:#dbeafe;color:#1d4ed8;border-color:#93c5fd}
    .seat-pub-lite-grid{display:grid;gap:12px}.seat-pub-lite-field{display:grid;gap:8px}.seat-pub-lite-field-title{font-size:13px;font-weight:950}.seat-pub-lite-help{font-size:12px;font-weight:700;color:#64748b}.seat-pub-lite-field textarea,.seat-pub-lite-field input{min-height:44px;border:1px solid #cbd5e1;border-radius:16px;background:#fff;color:#0f172a;padding:10px 13px;font-weight:750;outline:none;line-height:1.45;font-family:inherit}.seat-pub-lite-field textarea{min-height:110px;resize:vertical}.seat-pub-lite-field textarea:focus,.seat-pub-lite-field input:focus{border-color:var(--desktop-accent,#14b8a6);box-shadow:0 0 0 4px color-mix(in srgb,var(--desktop-accent,#14b8a6) 16%,transparent)}
    .seat-pub-lite-select{position:relative;width:max-content;min-width:220px}.seat-pub-lite-trigger{width:100%;height:46px;border:1px solid #cbd5e1;border-radius:16px;background:#fff;color:#0f172a;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 14px;font-weight:900;cursor:pointer}.seat-pub-lite-menu{position:absolute;left:0;top:calc(100% + 8px);width:280px;display:none;gap:6px;padding:8px;border:1px solid #cbd5e1;border-radius:18px;background:#fff;box-shadow:0 24px 70px rgba(15,23,42,.2);z-index:20}.seat-pub-lite-select.open .seat-pub-lite-menu{display:grid}.seat-pub-lite-option{height:42px;border:0;border-radius:13px;background:transparent;color:#0f172a;text-align:left;padding:0 13px;font-weight:900;cursor:pointer}.seat-pub-lite-option:hover,.seat-pub-lite-option.active{background:color-mix(in srgb,var(--desktop-accent,#14b8a6) 15%,#fff)}
    .seat-pub-lite-panel,.seat-pub-perm-panel{border:1px solid #e2e8f0;border-radius:20px;background:#f8fafc;padding:14px;display:grid;gap:12px}.seat-pub-lite-check{display:flex;align-items:center;gap:10px;font-weight:950;cursor:pointer}.seat-pub-lite-check input{width:18px;height:18px;accent-color:var(--desktop-accent,#14b8a6)}.seat-pub-lite-radio{display:flex;gap:10px;flex-wrap:wrap}.seat-pub-lite-radio button,.seat-pub-choice,.seat-pub-check{height:40px;min-height:40px;border:1px solid #cbd5e1;border-radius:14px;background:#fff;color:#0f172a;padding:0 13px;font-weight:900;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;line-height:1;box-sizing:border-box}.seat-pub-lite-radio button.active,.seat-pub-choice:has(input:checked){background:color-mix(in srgb,var(--desktop-accent,#14b8a6) 16%,#fff);border-color:var(--desktop-accent,#14b8a6)}.seat-pub-choice input,.seat-pub-check input{width:16px;height:16px;margin:0;accent-color:var(--desktop-accent,#14b8a6)}.seat-pub-perms{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}.seat-pub-lite-schedule-input{max-width:310px;justify-self:start}
    .seat-pub-lite-actions{display:flex;justify-content:flex-end;gap:10px}.seat-pub-lite-actions button,.seat-pub-lite-mini-btn{height:40px;border:1px solid #cbd5e1;border-radius:14px;background:#fff;color:#0f172a;padding:0 16px;font-weight:950;cursor:pointer}.seat-pub-lite-actions .primary,.seat-pub-lite-mini-btn.primary{background:var(--desktop-accent,#14b8a6);border-color:transparent;color:#fff}.seat-pub-lite-actions button:disabled,.seat-pub-lite-mini-btn:disabled{opacity:.65;cursor:wait}.seat-pub-lite-manage-row{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;border:1px solid #e2e8f0;border-radius:18px;padding:14px;background:#f8fafc}.seat-pub-lite-manage-title{font-weight:950}.seat-pub-lite-manage-sub{font-size:12px;color:#64748b;font-weight:780;margin-top:3px}.seat-pub-lite-manage-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}
    #a3-seat-pub-toast{position:fixed;left:50%;top:74px;transform:translateX(-50%);z-index:1000000;display:flex;align-items:center;gap:10px;padding:10px 14px;border:1px solid rgba(20,184,166,.65);border-radius:16px;background:rgba(255,255,255,.985);color:#0f172a;box-shadow:0 20px 58px rgba(15,23,42,.18);font-size:14px;font-weight:900;pointer-events:none}#a3-seat-pub-toast .spin{width:15px;height:15px;border-radius:999px;border:2px solid rgba(15,23,42,.16);border-top-color:var(--desktop-accent,#14b8a6);animation:a3SeatPubSpin .72s linear infinite}#a3-seat-pub-toast.done .spin{animation:none;border-color:var(--desktop-accent,#14b8a6);background:var(--desktop-accent,#14b8a6);box-shadow:inset 0 0 0 4px #fff}@keyframes a3SeatPubSpin{to{transform:rotate(360deg)}}
    .theme-dark .seat-pub-lite-modal,html.a3-overlay-dark .seat-pub-lite-modal{background:rgba(15,23,42,.97);color:#f8fafc;border-color:#334155}.theme-dark .seat-pub-lite-title p,.theme-dark .seat-pub-lite-meta,.theme-dark .seat-pub-lite-help,.theme-dark .seat-pub-lite-manage-sub,html.a3-overlay-dark .seat-pub-lite-title p,html.a3-overlay-dark .seat-pub-lite-meta,html.a3-overlay-dark .seat-pub-lite-help,html.a3-overlay-dark .seat-pub-lite-manage-sub{color:#94a3b8}.theme-dark .seat-pub-lite-trigger,.theme-dark .seat-pub-lite-actions button,.theme-dark .seat-pub-lite-mini-btn,.theme-dark .seat-pub-lite-field textarea,.theme-dark .seat-pub-lite-field input,.theme-dark .seat-pub-lite-radio button,.theme-dark .seat-pub-choice,.theme-dark .seat-pub-check,html.a3-overlay-dark .seat-pub-lite-trigger,html.a3-overlay-dark .seat-pub-lite-actions button,html.a3-overlay-dark .seat-pub-lite-mini-btn,html.a3-overlay-dark .seat-pub-lite-field textarea,html.a3-overlay-dark .seat-pub-lite-field input,html.a3-overlay-dark .seat-pub-lite-radio button,html.a3-overlay-dark .seat-pub-choice,html.a3-overlay-dark .seat-pub-check{background:#111827;color:#f8fafc;border-color:#334155}.theme-dark .seat-pub-lite-menu,html.a3-overlay-dark .seat-pub-lite-menu{background:#1f2937;border-color:#334155}.theme-dark .seat-pub-lite-option,html.a3-overlay-dark .seat-pub-lite-option{color:#f8fafc}.theme-dark .seat-pub-lite-option:hover,.theme-dark .seat-pub-lite-option.active,html.a3-overlay-dark .seat-pub-lite-option:hover,html.a3-overlay-dark .seat-pub-lite-option.active{background:#334155}.theme-dark .seat-pub-lite-panel,.theme-dark .seat-pub-lite-manage-row,.theme-dark .seat-pub-perm-panel,html.a3-overlay-dark .seat-pub-lite-panel,html.a3-overlay-dark .seat-pub-lite-manage-row,html.a3-overlay-dark .seat-pub-perm-panel{background:#111827;border-color:#334155}.theme-dark .seat-pub-lite-status-pill,.theme-dark .seat-pub-lite-badge,html.a3-overlay-dark .seat-pub-lite-status-pill,html.a3-overlay-dark .seat-pub-lite-badge{background:#111827;color:#f8fafc;border-color:#334155}.theme-dark #a3-seat-pub-toast,html.a3-overlay-dark #a3-seat-pub-toast{background:rgba(15,23,42,.96);color:#f8fafc;box-shadow:0 22px 68px rgba(0,0,0,.36)}.theme-dark #a3-seat-pub-toast .spin,html.a3-overlay-dark #a3-seat-pub-toast .spin{border-color:rgba(255,255,255,.28);border-top-color:#5eead4}
    @media(max-width:760px){.seat-pub-lite-modal{width:100%;max-height:94vh}.seat-pub-lite-select,.seat-pub-lite-schedule-input{width:100%;max-width:100%}.seat-pub-lite-menu{width:100%}}
  `;
  document.head.appendChild(style);
}

function seatPubModeSelect(mode: SeatPubUiMode) {
  return `<div class="seat-pub-lite-select"><button type="button" class="seat-pub-lite-trigger" data-mode-trigger><span>${seatPubModeText(mode)}</span><span>⌄</span></button><div class="seat-pub-lite-menu"><button type="button" class="seat-pub-lite-option ${mode === "private" ? "active" : ""}" data-value="private">Riêng tư</button><button type="button" class="seat-pub-lite-option ${mode === "preview_publish" ? "active" : ""}" data-value="preview_publish">Xem trước + Công bố</button></div></div>`;
}

function seatPubPreviewBlock(show: boolean, value: string) {
  return `<div class="seat-pub-lite-field" data-preview-wrap style="display:${show ? "grid" : "none"}"><div><div class="seat-pub-lite-field-title">Danh sách xem trước</div><div class="seat-pub-lite-help">Mỗi dòng 1 tên hoặc Gmail.</div></div><textarea data-preview placeholder="Ví dụ:\nĐinh Mạnh Hữu\nhuud09052009@gmail.com">${seatPubEscape(value)}</textarea></div>`;
}

function seatPubPermissionBlock(show: boolean, mode: SeatPubPreviewMode, perms: Partial<Record<SeatPubPerm, boolean>>) {
  return `<div class="seat-pub-perm-panel" data-seat-pub-perm-wrap style="display:${show ? "grid" : "none"}"><div><div class="seat-pub-lite-field-title">Quyền xem trước</div><div class="seat-pub-lite-help">Chỉ có 2 chế độ: chỉ xem, hoặc cho sửa theo checkbox.</div></div><div class="seat-pub-lite-radio"><label class="seat-pub-choice"><input type="radio" name="seat-preview-mode" data-preview-mode="view" ${mode !== "edit" ? "checked" : ""}/> Chỉ xem</label><label class="seat-pub-choice"><input type="radio" name="seat-preview-mode" data-preview-mode="edit" ${mode === "edit" ? "checked" : ""}/> Sửa</label></div><div class="seat-pub-perms" data-seat-pub-perms style="display:${show && mode === "edit" ? "grid" : "none"}">${SEAT_PUB_PERMISSIONS.map(({ key, label }) => `<label class="seat-pub-check"><input type="checkbox" data-seat-pub-perm="${key}" ${perms[key] ? "checked" : ""}/> ${label}</label>`).join("")}</div></div>`;
}

function seatPubPublishBlock(show: boolean, enabled: boolean, mode: SeatPubPublishMode, publishAt: string) {
  return `<div class="seat-pub-lite-panel" data-publish-wrap style="display:${show ? "grid" : "none"}"><label class="seat-pub-lite-check"><input type="checkbox" data-publish-enabled ${enabled ? "checked" : ""}/><span>Công bố sơ đồ</span></label><div data-publish-inner style="display:${enabled ? "grid" : "none"};gap:10px"><div class="seat-pub-lite-field"><div class="seat-pub-lite-field-title">Cách công bố</div><div class="seat-pub-lite-radio"><button type="button" data-pub-mode="now" class="${mode === "now" ? "active" : ""}">Công bố ngay</button><button type="button" data-pub-mode="schedule" class="${mode === "schedule" ? "active" : ""}">Công bố theo hẹn giờ</button></div></div><div class="seat-pub-lite-field" data-pub-time-wrap style="display:${mode === "schedule" ? "grid" : "none"}"><div class="seat-pub-lite-field-title">Giờ công bố</div><input class="seat-pub-lite-schedule-input" type="datetime-local" data-publish-at value="${seatPubToInput(publishAt)}" /></div></div></div>`;
}

function seatPubReadModal(backdrop: HTMLElement, base: SeatPubAccess): SeatPubAccess {
  const triggerText = backdrop.querySelector<HTMLElement>(".seat-pub-lite-trigger span")?.textContent || "Riêng tư";
  const uiMode: SeatPubUiMode = triggerText.includes("Xem trước") ? "preview_publish" : "private";
  const publishEnabled = Boolean(backdrop.querySelector<HTMLInputElement>("[data-publish-enabled]")?.checked);
  const schedule = backdrop.querySelector<HTMLElement>("[data-pub-mode='schedule']")?.classList.contains("active");
  const rawTime = backdrop.querySelector<HTMLInputElement>("[data-publish-at]")?.value || "";
  const status: SeatPubStatus = uiMode === "private" ? "private" : publishEnabled ? "published" : "preview";
  const publishAt = status === "published" && schedule ? seatPubFromInput(rawTime) : "";
  if (status === "published" && schedule && !publishAt) throw new Error("Chọn giờ công bố trước khi lưu.");
  const previewMode: SeatPubPreviewMode = backdrop.querySelector<HTMLInputElement>("[data-preview-mode='edit']")?.checked ? "edit" : "view";
  const previewPermissions: Partial<Record<SeatPubPerm, boolean>> = {};
  SEAT_PUB_PERMISSIONS.forEach(({ key }) => { previewPermissions[key] = status !== "private" && previewMode === "edit" && Boolean(backdrop.querySelector<HTMLInputElement>(`[data-seat-pub-perm='${key}']`)?.checked); });
  return {
    ...base,
    status,
    previewStudents: uiMode === "preview_publish" ? (backdrop.querySelector<HTMLTextAreaElement>("[data-preview]")?.value || "") : "",
    publishAt,
    previewMode: status === "private" ? "view" : previewMode,
    previewPermissions: status === "private" || previewMode !== "edit" ? {} : previewPermissions,
  };
}

function seatPubApplyModalState(backdrop: HTMLElement, access: SeatPubAccess) {
  const uiMode = seatPubUiMode(access.status);
  const publishEnabled = access.status === "published";
  const pubMode: SeatPubPublishMode = publishEnabled && access.publishAt ? "schedule" : "now";
  const title = backdrop.querySelector<HTMLElement>(".seat-pub-lite-title p");
  const meta = backdrop.querySelector<HTMLElement>(".seat-pub-lite-meta");
  const badge = backdrop.querySelector<HTMLElement>(".seat-pub-lite-badge");
  const body = backdrop.querySelector<HTMLElement>("[data-pub-body]");
  if (title) title.textContent = access.chartTitle;
  if (meta) meta.textContent = seatPubMeta(access);
  if (badge) badge.textContent = seatPubStatusText(access);
  if (body) body.innerHTML = `<div class="seat-pub-lite-field"><div class="seat-pub-lite-field-title">Trạng thái</div>${seatPubModeSelect(uiMode)}</div><div class="seat-pub-lite-preview-publish">${seatPubPreviewBlock(uiMode === "preview_publish", access.previewStudents)}${seatPubPermissionBlock(uiMode === "preview_publish", access.previewMode, access.previewPermissions)}${seatPubPublishBlock(uiMode === "preview_publish", publishEnabled, pubMode, access.publishAt)}</div>`;
  seatPubBindModalControls(backdrop, access);
}

function seatPubBindModalControls(backdrop: HTMLElement, base: SeatPubAccess) {
  const select = backdrop.querySelector<HTMLElement>(".seat-pub-lite-select");
  const syncVisibility = () => {
    const triggerText = backdrop.querySelector<HTMLElement>(".seat-pub-lite-trigger span")?.textContent || "";
    const show = triggerText.includes("Xem trước");
    const publishEnabled = Boolean(backdrop.querySelector<HTMLInputElement>("[data-publish-enabled]")?.checked);
    const schedule = backdrop.querySelector<HTMLElement>("[data-pub-mode='schedule']")?.classList.contains("active");
    const edit = Boolean(backdrop.querySelector<HTMLInputElement>("[data-preview-mode='edit']")?.checked);
    const preview = backdrop.querySelector<HTMLElement>("[data-preview-wrap]");
    const permWrap = backdrop.querySelector<HTMLElement>("[data-seat-pub-perm-wrap]");
    const perms = backdrop.querySelector<HTMLElement>("[data-seat-pub-perms]");
    const publish = backdrop.querySelector<HTMLElement>("[data-publish-wrap]");
    const inner = backdrop.querySelector<HTMLElement>("[data-publish-inner]");
    const time = backdrop.querySelector<HTMLElement>("[data-pub-time-wrap]");
    if (preview) preview.style.display = show ? "grid" : "none";
    if (permWrap) permWrap.style.display = show ? "grid" : "none";
    if (perms) perms.style.display = show && edit ? "grid" : "none";
    if (publish) publish.style.display = show ? "grid" : "none";
    if (inner) inner.style.display = show && publishEnabled ? "grid" : "none";
    if (time) time.style.display = show && publishEnabled && schedule ? "grid" : "none";
    const badge = backdrop.querySelector<HTMLElement>(".seat-pub-lite-badge");
    if (badge) badge.textContent = !show ? "Riêng tư" : publishEnabled && schedule ? "Hẹn giờ công bố" : publishEnabled ? "Sẽ công bố" : "Xem trước";
  };
  backdrop.querySelector<HTMLElement>(".seat-pub-lite-trigger")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    select?.classList.toggle("open");
  });
  backdrop.querySelectorAll<HTMLElement>(".seat-pub-lite-option").forEach((option) => option.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const value = option.dataset.value === "preview_publish" ? "preview_publish" : "private";
    const span = backdrop.querySelector<HTMLElement>(".seat-pub-lite-trigger span");
    if (span) span.textContent = seatPubModeText(value);
    backdrop.querySelectorAll<HTMLElement>(".seat-pub-lite-option").forEach((node) => node.classList.toggle("active", node === option));
    if (value === "private") {
      const cb = backdrop.querySelector<HTMLInputElement>("[data-publish-enabled]");
      if (cb) cb.checked = false;
      const view = backdrop.querySelector<HTMLInputElement>("[data-preview-mode='view']");
      if (view) view.checked = true;
      backdrop.querySelectorAll<HTMLInputElement>("[data-seat-pub-perm]").forEach((box) => box.checked = false);
    }
    select?.classList.remove("open");
    syncVisibility();
  }));
  backdrop.addEventListener("click", (event) => { if (!(event.target as HTMLElement).closest(".seat-pub-lite-select")) select?.classList.remove("open"); });
  backdrop.querySelector<HTMLInputElement>("[data-publish-enabled]")?.addEventListener("change", syncVisibility);
  backdrop.querySelectorAll<HTMLElement>("[data-pub-mode]").forEach((btn) => btn.addEventListener("click", () => {
    backdrop.querySelectorAll<HTMLElement>("[data-pub-mode]").forEach((node) => node.classList.toggle("active", node === btn));
    syncVisibility();
  }));
  backdrop.querySelectorAll<HTMLInputElement>("[data-preview-mode]").forEach((radio) => radio.addEventListener("change", syncVisibility));
  backdrop.querySelector<HTMLButtonElement>("[data-save]")?.addEventListener("click", async () => {
    const btn = backdrop.querySelector<HTMLButtonElement>("[data-save]");
    try {
      const next = seatPubReadModal(backdrop, base);
      if (btn) { btn.disabled = true; btn.textContent = "Đang lưu..."; }
      seatPubToast("Đang lưu cấu hình công bố lên backend...");
      const saved = await seatPubSaveAccess(next);
      backdrop.remove();
      seatPubToast(`${seatPubStatusText(saved)} đã lưu.`, true);
    } catch (error) {
      if (btn) { btn.disabled = false; btn.textContent = "Lưu cài đặt"; }
      seatPubToast(error instanceof Error ? error.message : "Không lưu được cấu hình công bố.");
    }
  });
  syncVisibility();
}

async function openSeatPubLiteModal() {
  injectSeatPubStyle();
  document.querySelector(".seat-pub-lite-backdrop")?.remove();
  const title = seatPubToolbarTitle();
  const backdrop = document.createElement("div");
  backdrop.className = "seat-pub-lite-backdrop";
  backdrop.innerHTML = `<div class="seat-pub-lite-modal" role="dialog" aria-modal="true"><div class="seat-pub-lite-head"><div class="seat-pub-lite-title"><h3>Cài đặt công bố sơ đồ</h3><p>${seatPubEscape(title)}</p><div class="seat-pub-lite-meta">Đang tải cấu hình từ backend...</div></div><span class="seat-pub-lite-badge">Đang tải</span></div><div class="seat-pub-lite-grid" data-pub-body></div><div class="seat-pub-lite-actions"><button type="button" data-close>Huỷ</button><button type="button" class="primary" data-save>Lưu cài đặt</button></div></div>`;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.querySelector("[data-close]")?.addEventListener("click", close);
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });
  try {
    seatPubToast("Đang tải cấu hình công bố từ backend...");
    const access = await seatPubLoadAccess(title);
    if (!document.body.contains(backdrop)) return;
    seatPubApplyModalState(backdrop, access);
    seatPubToast("Đã tải cấu hình từ backend.", true);
  } catch (error) {
    const access = seatPubDefault(title);
    seatPubApplyModalState(backdrop, access);
    seatPubToast(error instanceof Error ? error.message : "Không tải được cấu hình công bố.");
  }
}

async function openSeatPubManageModal() {
  injectSeatPubStyle();
  document.querySelector(".seat-pub-lite-backdrop")?.remove();
  const backdrop = document.createElement("div");
  backdrop.className = "seat-pub-lite-backdrop";
  backdrop.innerHTML = `<div class="seat-pub-lite-modal"><div class="seat-pub-lite-title"><h3>Quản lý công bố</h3><p>Đang tải trạng thái công bố...</p></div><div class="seat-pub-lite-actions"><button data-close>Đóng</button></div></div>`;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.querySelector("[data-close]")?.addEventListener("click", close);
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });
  try {
    const config = await seatPubLoadAccess(seatPubToolbarTitle());
    if (!document.body.contains(backdrop)) return;
    const cls = seatPubStatusClass(config);
    const sub = seatPubMeta(config);
    backdrop.querySelector(".seat-pub-lite-modal")!.innerHTML = `<div class="seat-pub-lite-title"><h3>Quản lý công bố</h3><p>${seatPubEscape(config.chartTitle || seatPubToolbarTitle())}</p></div><div class="seat-pub-lite-manage-row"><div><div class="seat-pub-lite-manage-title">Trạng thái hiện tại</div><div class="seat-pub-lite-manage-sub">${seatPubEscape(sub)}</div></div><span class="seat-pub-lite-status-pill ${cls}">${seatPubStatusText(config)}</span></div><div class="seat-pub-lite-manage-actions"><button class="seat-pub-lite-mini-btn" data-edit>Sửa cài đặt</button><button class="seat-pub-lite-mini-btn primary" data-publish-now>Công bố ngay</button><button class="seat-pub-lite-mini-btn" data-preview>Chỉ xem trước</button><button class="seat-pub-lite-mini-btn" data-private>Đưa về riêng tư</button></div><div class="seat-pub-lite-actions"><button data-close>Đóng</button></div>`;
    backdrop.querySelector("[data-close]")?.addEventListener("click", close);
    backdrop.querySelector("[data-edit]")?.addEventListener("click", () => { close(); openSeatPubLiteModal(); });
    backdrop.querySelector("[data-publish-now]")?.addEventListener("click", async () => { seatPubToast("Đang công bố sơ đồ..."); const saved = await seatPubSaveAccess({ ...config, status: "published", publishAt: "" }); close(); seatPubToast(`${seatPubStatusText(saved)} đã lưu.`, true); });
    backdrop.querySelector("[data-preview]")?.addEventListener("click", async () => { seatPubToast("Đang chuyển sang xem trước..."); const saved = await seatPubSaveAccess({ ...config, status: "preview", publishAt: "" }); close(); seatPubToast(`${seatPubStatusText(saved)} đã lưu.`, true); });
    backdrop.querySelector("[data-private]")?.addEventListener("click", async () => { seatPubToast("Đang đưa về riêng tư..."); const saved = await seatPubSaveAccess({ ...config, status: "private", publishAt: "", previewStudents: "", previewMode: "view", previewPermissions: {} }); close(); seatPubToast(`${seatPubStatusText(saved)} đã lưu.`, true); });
  } catch (error) {
    backdrop.querySelector(".seat-pub-lite-modal")!.innerHTML = `<div class="seat-pub-lite-title"><h3>Quản lý công bố</h3><p>${seatPubEscape(error instanceof Error ? error.message : "Không tải được trạng thái.")}</p></div><div class="seat-pub-lite-actions"><button data-close>Đóng</button></div>`;
    backdrop.querySelector("[data-close]")?.addEventListener("click", close);
  }
}

function seatPubTick() {
  injectSeatPubStyle();
  const tools = document.querySelector<HTMLElement>(`${SEAT_PUB_WINDOW} .stable-seat-tools`);
  if (!tools) return;
  let pubBtn = tools.querySelector<HTMLButtonElement>("[data-seat-pub-lite]");
  let manageBtn = tools.querySelector<HTMLButtonElement>("[data-seat-pub-lite-manage]");
  if (!pubBtn) {
    pubBtn = document.createElement("button");
    pubBtn.type = "button";
    pubBtn.className = "seat-pub-lite-btn";
    pubBtn.dataset.seatPubLite = "1";
    pubBtn.textContent = "Công bố";
    pubBtn.addEventListener("click", openSeatPubLiteModal);
  }
  if (!manageBtn) {
    manageBtn = document.createElement("button");
    manageBtn.type = "button";
    manageBtn.className = "seat-pub-lite-btn";
    manageBtn.dataset.seatPubLiteManage = "1";
    manageBtn.textContent = "QL";
    manageBtn.title = "Quản lý công bố";
    manageBtn.addEventListener("click", openSeatPubManageModal);
  }
  pubBtn.disabled = !seatPubIsAdmin();
  manageBtn.disabled = !seatPubIsAdmin();
  pubBtn.style.display = "inline-flex";
  manageBtn.style.display = "inline-flex";
  const search = tools.querySelector("input");
  if (!tools.contains(pubBtn)) tools.insertBefore(pubBtn, search || tools.firstChild);
  if (!tools.contains(manageBtn)) tools.insertBefore(manageBtn, search || tools.firstChild);
}

function bootSeatPub() {
  if (seatPubBooted) return;
  seatPubBooted = true;
  seatPubTick();
  const timer = window.setInterval(seatPubTick, 500);
  window.setTimeout(() => clearInterval(timer), 30000);
  window.addEventListener("a3k64:seating-changed", () => setTimeout(seatPubTick, 100));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootSeatPub);
else bootSeatPub();

export {};
