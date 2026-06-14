const SPP_WIN = "#a3k64-seating-window";
const SPP_KEY = "a3k64-seating-publish-lite-v1";
const SPP_CHART_KEY = "a3k64-seating-sheet-current-id-v1";
const SPP_GAS = String(import.meta.env.VITE_GAS_WEB_APP_URL || "").trim();
let sppReady = false;
let sppUiTimer = 0;
let sppCheckTimer = 0;
let sppToastTimer = 0;

type SppStatus = "private" | "preview" | "published";
type SppMode = "view" | "edit";
type SppPerm = "move" | "save" | "create" | "restore" | "random" | "export";
type SppAccess = { chartId: string; chartTitle: string; status: SppStatus; previewStudents: string; publishAt: string; previewMode: SppMode; previewPermissions: Partial<Record<SppPerm, boolean>>; updatedAt?: string; updatedBy?: string; backendOk?: boolean };

type SppChart = { id?: string; title?: string; active?: boolean };

const SPP_PERMS: Array<{ key: SppPerm; label: string }> = [
  { key: "move", label: "Đổi chỗ / kéo thả" },
  { key: "save", label: "Lưu sơ đồ" },
  { key: "create", label: "Tạo sơ đồ mới" },
  { key: "restore", label: "Khôi phục" },
  { key: "random", label: "Random" },
  { key: "export", label: "Xuất/in" },
];

function sppModalTitle() { return document.querySelector<HTMLElement>(".seat-pub-lite-backdrop .seat-pub-lite-title p")?.textContent?.trim() || ""; }
function sppChartId() { return localStorage.getItem(SPP_CHART_KEY) || ""; }
function sppTitle() { return sppModalTitle() || document.querySelector<HTMLElement>(`${SPP_WIN} .seat-ctrl-trigger span`)?.textContent?.trim() || "Sơ đồ hiện tại"; }
function sppKey(id = sppChartId()) { return `${SPP_KEY}:${id || sppTitle() || "default"}`; }
function sppFold(v: unknown) { return String(v || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9@._-]+/g, " ").trim(); }
function sppCompact(v: unknown) { return sppFold(v).replace(/\s+/g, ""); }
function sppStatus(v: unknown): SppStatus { const x = sppCompact(v); if (x === "preview" || x === "xemtruoc") return "preview"; if (["published", "publish", "public", "congbo", "congkhai", "scheduled", "hengio"].includes(x)) return "published"; return "private"; }
function sppMode(v: unknown): SppMode { const x = sppCompact(v); return x === "edit" || x === "sua" ? "edit" : "view"; }
function sppHtml(v: unknown) { return String(v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;"); }
function sppInputToIso(v: string) { if (!v) return ""; const d = new Date(v); return Number.isFinite(d.getTime()) ? d.toISOString() : ""; }

function sppActor() {
  try {
    const s = JSON.parse(localStorage.getItem("a3k64-login-session-v1") || "null");
    const u = s?.user || s || {};
    return { name: String(u.name || u.fullName || u.studentName || u.displayName || u.hoTen || u.username || ""), email: String(u.email || ""), username: String(u.username || ""), role: String(u.role || u.userRole || "") };
  } catch {
    return { name: "", email: "", username: "", role: "" };
  }
}
function sppAdmin() { const role = sppFold(sppActor().role).replace(/\s+/g, "_"); return role.includes("gvcn") || role.includes("lop_truong") || role.includes("bi_thu") || role.includes("admin"); }

function sppParsePerms(raw: unknown): Partial<Record<SppPerm, boolean>> {
  if (!raw) return {};
  let data: any = raw;
  if (typeof raw === "string") { try { data = JSON.parse(raw); } catch { return {}; } }
  if (data?.permissions) data = data.permissions;
  const out: Partial<Record<SppPerm, boolean>> = {};
  SPP_PERMS.forEach(({ key }) => { out[key] = Boolean(data?.[key]); });
  return out;
}

function sppNormalize(raw: any, backendOk = false): SppAccess | null {
  const s = raw?.access || raw?.data?.access || raw?.config || raw?.data?.config || raw;
  if (!s) return null;
  return { chartId: String(s.chartId || s.chart_id || sppChartId()), chartTitle: String(s.chartTitle || s.chart_title || s.title || sppTitle()), status: sppStatus(s.status), previewStudents: String(s.previewStudents || s.preview_students || ""), publishAt: String(s.publishAt || s.publish_at || ""), previewMode: sppMode(s.previewMode || s.preview_mode), previewPermissions: sppParsePerms(s.previewPermissions || s.preview_permissions), updatedAt: s.updatedAt || s.updated_at, updatedBy: s.updatedBy || s.updated_by, backendOk };
}

function sppLocal(): SppAccess {
  try { return sppNormalize(JSON.parse(localStorage.getItem(sppKey()) || "{}"), false) || { chartId: sppChartId(), chartTitle: sppTitle(), status: "private", previewStudents: "", publishAt: "", previewMode: "view", previewPermissions: {} }; }
  catch { return { chartId: sppChartId(), chartTitle: sppTitle(), status: "private", previewStudents: "", publishAt: "", previewMode: "view", previewPermissions: {} }; }
}
function sppSaveLocal(a: SppAccess) { localStorage.setItem(sppKey(a.chartId), JSON.stringify(a)); if (a.chartId && a.chartId !== "default") localStorage.setItem(SPP_CHART_KEY, a.chartId); }

function sppGas(action: string, payload?: unknown): Promise<any> {
  if (!SPP_GAS) return Promise.reject(new Error("Thiếu VITE_GAS_WEB_APP_URL"));
  return new Promise((resolve, reject) => {
    const cb = `__a3spp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const callbacks = window as typeof window & Record<string, unknown>;
    const script = document.createElement("script");
    const url = new URL(SPP_GAS);
    let done = false;
    let timeout = 0;
    url.searchParams.set("action", action); url.searchParams.set("callback", cb); url.searchParams.set("t", String(Date.now()));
    if (payload !== undefined) url.searchParams.set("payload", JSON.stringify(payload));
    callbacks[cb] = (json: any) => { if (done) return; done = true; clearTimeout(timeout); delete callbacks[cb]; script.remove(); if (json?.ok === false || json?.data?.ok === false) reject(new Error(String(json.error || json.data?.error || "Backend lỗi"))); else resolve(json?.data || json); };
    script.onerror = () => { if (done) return; done = true; clearTimeout(timeout); delete callbacks[cb]; script.remove(); reject(new Error("Không gọi được Apps Script")); };
    timeout = window.setTimeout(() => { if (done) return; done = true; delete callbacks[cb]; script.remove(); reject(new Error("Apps Script phản hồi quá lâu")); }, 10000);
    script.src = url.toString(); document.head.appendChild(script);
  });
}

function sppToast(msg: string, done = false) {
  clearTimeout(sppToastTimer);
  document.getElementById("a3-spp-toast")?.remove();
  const el = document.createElement("div");
  el.id = "a3-spp-toast";
  el.className = done ? "done" : "";
  el.innerHTML = `<span class="spin"></span><span>${sppHtml(msg)}</span>`;
  document.body.appendChild(el);
  sppToastTimer = window.setTimeout(() => el.remove(), done ? 1500 : 9000);
}

function sppStyle() {
  if (document.getElementById("a3-spp-style")) return;
  const st = document.createElement("style");
  st.id = "a3-spp-style";
  st.textContent = `.spp-panel{border:1px solid #e2e8f0;border-radius:20px;background:#f8fafc;padding:14px;display:grid;gap:12px}.spp-title{font-size:13px;font-weight:950}.spp-help{font-size:12px;color:#64748b;font-weight:750}.spp-row{display:flex;flex-wrap:wrap;gap:10px}.spp-choice,.spp-check{display:flex;align-items:center;gap:8px;min-height:38px;border:1px solid #cbd5e1;border-radius:14px;background:#fff;padding:0 12px;font-weight:900}.spp-choice input,.spp-check input{accent-color:var(--desktop-accent,#14b8a6)}.spp-edit-options{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}.theme-dark .spp-panel,html.a3-overlay-dark .spp-panel{background:#111827;border-color:#334155}.theme-dark .spp-choice,.theme-dark .spp-check,html.a3-overlay-dark .spp-choice,html.a3-overlay-dark .spp-check{background:#111827;color:#f8fafc;border-color:#334155}.theme-dark .spp-help,html.a3-overlay-dark .spp-help{color:#94a3b8}#a3-spp-toast{position:fixed;left:50%;top:74px;transform:translateX(-50%);z-index:1000003;display:flex;align-items:center;gap:10px;padding:10px 14px;border:1px solid rgba(20,184,166,.65);border-radius:16px;background:rgba(255,255,255,.985);color:#0f172a;box-shadow:0 20px 58px rgba(15,23,42,.18);font-size:14px;font-weight:900;pointer-events:none;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",Arial,sans-serif}#a3-spp-toast .spin{width:15px;height:15px;border-radius:999px;border:2px solid rgba(15,23,42,.16);border-top-color:var(--desktop-accent,#14b8a6);animation:a3sppspin .72s linear infinite}#a3-spp-toast.done .spin{animation:none;border-color:var(--desktop-accent,#14b8a6);background:var(--desktop-accent,#14b8a6);box-shadow:inset 0 0 0 4px #fff}@keyframes a3sppspin{to{transform:rotate(360deg)}}`;
  document.head.appendChild(st);
}

function sppEnhanceModal() {
  sppStyle();
  const modal = document.querySelector<HTMLElement>(".seat-pub-lite-backdrop .seat-pub-lite-modal");
  if (!modal || modal.querySelector("[data-spp-panel]") || !modal.querySelector("[data-preview-wrap]")) return;
  const a = sppLocal();
  const panel = document.createElement("div");
  panel.className = "spp-panel";
  panel.dataset.sppPanel = "1";
  panel.innerHTML = `<div><div class="spp-title">Quyền xem trước</div><div class="spp-help">Chỉ có 2 chế độ: chỉ xem, hoặc cho sửa theo checkbox.</div></div><div class="spp-row"><label class="spp-choice"><input type="radio" name="spp-mode" data-spp-mode="view" ${a.previewMode !== "edit" ? "checked" : ""}/> Chỉ xem</label><label class="spp-choice"><input type="radio" name="spp-mode" data-spp-mode="edit" ${a.previewMode === "edit" ? "checked" : ""}/> Sửa</label></div><div class="spp-edit-options" data-spp-edit-options style="display:${a.previewMode === "edit" ? "grid" : "none"}">${SPP_PERMS.map(({ key, label }) => `<label class="spp-check"><input type="checkbox" data-spp-perm="${key}" ${a.previewPermissions[key] ? "checked" : ""}/> ${label}</label>`).join("")}</div>`;
  modal.querySelector("[data-preview-wrap]")?.after(panel);
  panel.querySelectorAll<HTMLInputElement>("[data-spp-mode]").forEach((r) => r.addEventListener("change", () => { const edit = modal.querySelector<HTMLInputElement>("[data-spp-mode='edit']")?.checked; const opt = modal.querySelector<HTMLElement>("[data-spp-edit-options]"); if (opt) opt.style.display = edit ? "grid" : "none"; }));
}

async function sppResolveRealChart(input: SppAccess): Promise<SppAccess> {
  const title = String(input.chartTitle || sppTitle()).trim();
  const currentId = String(input.chartId || sppChartId()).trim();
  if (currentId && currentId !== "default") return { ...input, chartId: currentId, chartTitle: title || input.chartTitle };
  try {
    const res = await sppGas("listSeatingCharts", {});
    const charts: SppChart[] = res?.charts || res?.data?.charts || [];
    const titleKey = sppCompact(title);
    const exact = charts.find((c) => sppCompact(c.title) === titleKey);
    const active = charts.find((c) => c.active);
    const fallback = exact || active || charts[0];
    if (fallback?.id) return { ...input, chartId: String(fallback.id), chartTitle: String(fallback.title || title || input.chartTitle) };
  } catch (error) {
    console.warn("Không lấy được danh sách sơ đồ để resolve id:", error);
  }
  return { ...input, chartId: "", chartTitle: title || input.chartTitle };
}

function sppReadModal(): SppAccess | null {
  const modal = document.querySelector<HTMLElement>(".seat-pub-lite-backdrop .seat-pub-lite-modal");
  if (!modal || !modal.querySelector("button[data-save]")) return null;
  const modeText = modal.querySelector<HTMLElement>(".seat-pub-lite-trigger span")?.textContent || "";
  const uiMode = modeText.includes("Xem trước") ? "preview_publish" : "private";
  const pub = Boolean(modal.querySelector<HTMLInputElement>("[data-publish-enabled]")?.checked);
  const schedule = modal.querySelector<HTMLElement>("[data-pub-mode='schedule']")?.classList.contains("active");
  const rawTime = modal.querySelector<HTMLInputElement>("[data-publish-at]")?.value || "";
  const status: SppStatus = uiMode === "private" ? "private" : pub ? "published" : "preview";
  const publishAt = status === "published" && schedule ? sppInputToIso(rawTime) : "";
  if (status === "published" && schedule && !publishAt) throw new Error("Chọn giờ công bố trước khi lưu.");
  const previewMode: SppMode = modal.querySelector<HTMLInputElement>("[data-spp-mode='edit']")?.checked ? "edit" : "view";
  const previewPermissions: Partial<Record<SppPerm, boolean>> = {};
  SPP_PERMS.forEach(({ key }) => { previewPermissions[key] = previewMode === "edit" && Boolean(modal.querySelector<HTMLInputElement>(`[data-spp-perm='${key}']`)?.checked); });
  return { ...sppLocal(), chartId: sppChartId(), chartTitle: sppTitle(), status, publishAt, previewStudents: uiMode === "preview_publish" ? (modal.querySelector<HTMLTextAreaElement>("textarea[data-preview]")?.value || "") : "", previewMode, previewPermissions };
}

function sppManage(action: string): SppAccess {
  const cur = sppLocal();
  if (action === "private") return { ...cur, status: "private", publishAt: "", previewStudents: "", previewMode: "view", previewPermissions: {} };
  if (action === "preview") return { ...cur, status: "preview", publishAt: "", previewMode: cur.previewMode || "view", previewPermissions: cur.previewPermissions || {} };
  return { ...cur, status: "published", publishAt: "" };
}

async function sppSave(a: SppAccess) {
  const resolved = await sppResolveRealChart(a);
  const next = { ...resolved, previewPermissions: resolved.previewMode === "edit" ? resolved.previewPermissions : {}, updatedAt: new Date().toISOString(), updatedBy: sppActor().name };
  const payload: any = { ...next, preview_mode: next.previewMode, preview_permissions: JSON.stringify(next.previewPermissions), actor: sppActor() };
  if (!payload.chartId || payload.chartId === "default") delete payload.chartId;
  if (!payload.chart_id || payload.chart_id === "default") delete payload.chart_id;
  const res = await sppGas("saveSeatingAccess", payload);
  const saved = sppNormalize(res, true);
  if (!saved) throw new Error("Backend không trả dữ liệu quyền xem trước.");
  if (saved.status !== next.status) throw new Error("Backend không lưu đúng trạng thái công bố.");
  if (saved.previewMode !== next.previewMode) throw new Error("Backend chưa hỗ trợ preview_mode. Cần cập nhật Apps Script.");
  sppSaveLocal(saved);
  window.dispatchEvent(new CustomEvent("a3k64:seating-access-updated", { detail: saved }));
  window.dispatchEvent(new CustomEvent("a3k64:seating-changed", { detail: { access: saved } }));
  return saved;
}

function sppTokens() { const a = sppActor(); const out = new Set<string>(); [a.name, a.email, a.username].forEach((v) => { if (v) out.add(v); const b = String(v || "").split("@")[0]; if (b) out.add(b); const nd = b.replace(/[0-9_.-]+/g, " ").trim(); if (nd) out.add(nd); }); return Array.from(out).map(sppCompact).filter(Boolean); }
function sppAllowed(a: SppAccess) { const list = String(a.previewStudents || "").split(/[\n,;]+/).map(sppCompact).filter(Boolean); if (!list.length) return false; const users = sppTokens(); return users.some((u) => list.some((t) => u.includes(t) || t.includes(u))); }

async function sppCheck() {
  if (sppAdmin()) return;
  try {
    const resolved = await sppResolveRealChart({ ...sppLocal(), chartId: sppChartId(), chartTitle: sppTitle() });
    const res = await sppGas("getSeatingAccess", { chartId: resolved.chartId, chartTitle: resolved.chartTitle });
    const a = sppNormalize(res, true);
    if (!a) return;
    sppSaveLocal(a);
    const root = document.documentElement;
    root.dataset.seatPreviewMode = a.previewMode;
    root.dataset.seatPreviewPerms = Object.entries(a.previewPermissions || {}).filter(([, v]) => v).map(([k]) => k).join(",");
    if (a.status === "preview" && sppAllowed(a)) {
      if (a.previewMode === "edit") { root.classList.add("a3-seat-preview-editor"); root.classList.remove("a3-seat-viewer-readonly", "a3-seat-viewer-denied"); }
      else { root.classList.remove("a3-seat-preview-editor", "a3-seat-viewer-denied"); root.classList.add("a3-seat-viewer-readonly"); }
    }
  } catch (e) { console.warn("Không kiểm tra được quyền xem trước nâng cấp:", e); }
}

function sppBind() {
  if (sppReady) return;
  sppReady = true;
  sppStyle();
  sppUiTimer = window.setInterval(sppEnhanceModal, 300);
  sppCheckTimer = window.setInterval(() => void sppCheck(), 7000);
  void sppCheck();
  window.addEventListener("a3k64:seating-changed", () => setTimeout(() => void sppCheck(), 120));
  window.addEventListener("a3k64:seating-access-updated", () => setTimeout(() => void sppCheck(), 120));
  window.addEventListener("click", async (event) => {
    const target = event.target as HTMLElement | null;
    const save = target?.closest?.(".seat-pub-lite-backdrop button[data-save]") as HTMLButtonElement | null;
    const priv = target?.closest?.(".seat-pub-lite-backdrop button[data-private]") as HTMLButtonElement | null;
    const pubNow = target?.closest?.(".seat-pub-lite-backdrop button[data-publish-now]") as HTMLButtonElement | null;
    const prev = target?.closest?.(".seat-pub-lite-backdrop button[data-preview]") as HTMLButtonElement | null;
    const btn = save || priv || pubNow || prev;
    if (!btn) return;
    event.preventDefault(); event.stopPropagation(); if ("stopImmediatePropagation" in event) event.stopImmediatePropagation();
    try {
      const config = save ? sppReadModal() : priv ? sppManage("private") : prev ? sppManage("preview") : sppManage("published");
      if (!config) return;
      const old = btn.textContent || "Lưu";
      btn.disabled = true; btn.textContent = "Đang lưu...";
      sppToast("Đang xác định sơ đồ thật...");
      const saved = await sppSave(config);
      document.querySelector(".seat-pub-lite-backdrop")?.remove();
      sppToast(`${saved.status === "private" ? "Riêng tư" : saved.status === "preview" ? "Xem trước" : "Công bố"} đã lưu.`, true);
      btn.textContent = old;
    } catch (error) {
      console.error(error);
      btn.disabled = false;
      sppToast(error instanceof Error ? error.message : "Không lưu được quyền xem trước.");
    }
  }, true);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sppBind);
else sppBind();

export {};
