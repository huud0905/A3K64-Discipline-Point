const SPT_WIN = "#a3k64-seating-window";
const SPT_KEY = "a3k64-seating-publish-lite-v1";
const SPT_CHART_KEY = "a3k64-seating-sheet-current-id-v1";
const SPT_GAS = String(import.meta.env.VITE_GAS_WEB_APP_URL || "").trim();
let sptReady = false;
let sptLoadingKey = "";
let sptToastTimer = 0;

type SptStatus = "private" | "preview" | "published";
type SptMode = "view" | "edit";
type SptPerm = "move" | "save" | "create" | "restore" | "random" | "export";
type SptAccess = { chartId: string; chartTitle: string; status: SptStatus; previewStudents: string; publishAt: string; previewMode: SptMode; previewPermissions: Partial<Record<SptPerm, boolean>>; updatedAt?: string; updatedBy?: string };
const SPT_PERMS: SptPerm[] = ["move", "save", "create", "restore", "random", "export"];

function sptFold(v: unknown) { return String(v || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, ""); }
function sptStatus(v: unknown): SptStatus { const x = sptFold(v); if (x === "preview" || x === "xemtruoc") return "preview"; if (["published", "publish", "public", "congbo", "congkhai", "scheduled", "hengio", "dahengio"].includes(x)) return "published"; return "private"; }
function sptMode(v: unknown): SptMode { const x = sptFold(v); return x === "edit" || x === "sua" || x === "allowedit" ? "edit" : "view"; }
function sptHtml(v: unknown) { return String(v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function sptChartId() { return localStorage.getItem(SPT_CHART_KEY) || ""; }
function sptTitle() { return document.querySelector<HTMLElement>(".seat-pub-lite-backdrop .seat-pub-lite-title p")?.textContent?.trim() || document.querySelector<HTMLElement>(`${SPT_WIN} .seat-ctrl-trigger span`)?.textContent?.trim() || "Sơ đồ hiện tại"; }
function sptKey(id: string) { return `${SPT_KEY}:${id || sptTitle() || "default"}`; }
function sptPad(n: number) { return String(n).padStart(2, "0"); }
function sptIsoToInput(v: string) { const d = new Date(v || ""); if (!Number.isFinite(d.getTime())) return ""; return `${d.getFullYear()}-${sptPad(d.getMonth() + 1)}-${sptPad(d.getDate())}T${sptPad(d.getHours())}:${sptPad(d.getMinutes())}`; }
function sptInputToIso(v: string) { if (!v) return ""; const d = new Date(v); return Number.isFinite(d.getTime()) ? d.toISOString() : ""; }
function sptActor() { try { const s = JSON.parse(localStorage.getItem("a3k64-login-session-v1") || "null"); const u = s?.user || s || {}; return { name: String(u.name || u.fullName || u.hoTen || u.username || u.email || ""), email: String(u.email || ""), role: String(u.role || u.userRole || "") }; } catch { return { name: "", email: "", role: "" }; } }
function sptPerms(raw: unknown): Partial<Record<SptPerm, boolean>> { let d: any = raw || {}; if (typeof d === "string") { try { d = JSON.parse(d); } catch { d = {}; } } const out: Partial<Record<SptPerm, boolean>> = {}; SPT_PERMS.forEach((k) => out[k] = Boolean(d?.[k])); return out; }
function sptNormalize(raw: any): SptAccess | null { const s = raw?.access || raw?.data?.access || raw?.config || raw?.data?.config || raw; if (!s) return null; return { chartId: String(s.chartId || s.chart_id || s.id || sptChartId()), chartTitle: String(s.chartTitle || s.chart_title || s.title || sptTitle()), status: sptStatus(s.status), previewStudents: String(s.previewStudents || s.preview_students || ""), publishAt: String(s.publishAt || s.publish_at || ""), previewMode: sptMode(s.previewMode || s.preview_mode), previewPermissions: sptPerms(s.previewPermissions || s.preview_permissions), updatedAt: s.updatedAt || s.updated_at, updatedBy: s.updatedBy || s.updated_by }; }
function sptSaveLocal(a: SptAccess) { localStorage.setItem(sptKey(a.chartId), JSON.stringify(a)); if (a.chartId && a.chartId !== "default") localStorage.setItem(SPT_CHART_KEY, a.chartId); }

function sptGas(action: string, payload?: unknown): Promise<any> {
  if (!SPT_GAS) return Promise.reject(new Error("Thiếu VITE_GAS_WEB_APP_URL"));
  return new Promise((resolve, reject) => {
    const cb = `__a3spt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const callbacks = window as typeof window & Record<string, unknown>;
    const script = document.createElement("script");
    const url = new URL(SPT_GAS);
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

function sptToast(msg: string, done = false) { clearTimeout(sptToastTimer); document.getElementById("a3-spt-toast")?.remove(); const el = document.createElement("div"); el.id = "a3-spt-toast"; el.className = done ? "done" : ""; el.innerHTML = `<span class="spin"></span><span>${sptHtml(msg)}</span>`; document.body.appendChild(el); sptToastTimer = window.setTimeout(() => el.remove(), done ? 1500 : 9000); }
function sptStyle() { if (document.getElementById("a3-spt-style")) return; const st = document.createElement("style"); st.id = "a3-spt-style"; st.textContent = `#a3-spt-toast{position:fixed;left:50%;top:74px;transform:translateX(-50%);z-index:1000005;display:flex;align-items:center;gap:10px;padding:10px 14px;border:1px solid rgba(20,184,166,.65);border-radius:16px;background:rgba(255,255,255,.985);color:#0f172a;box-shadow:0 20px 58px rgba(15,23,42,.18);font-size:14px;font-weight:900;pointer-events:none;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",Arial,sans-serif}#a3-spt-toast .spin{width:15px;height:15px;border-radius:999px;border:2px solid rgba(15,23,42,.16);border-top-color:var(--desktop-accent,#14b8a6);animation:a3spt .72s linear infinite}#a3-spt-toast.done .spin{animation:none;border-color:var(--desktop-accent,#14b8a6);background:var(--desktop-accent,#14b8a6);box-shadow:inset 0 0 0 4px #fff}@keyframes a3spt{to{transform:rotate(360deg)}}`; document.head.appendChild(st); }

async function sptResolve(title = sptTitle()) {
  const id = sptChartId();
  if (id && id !== "default") return { chartId: id, chartTitle: title };
  const res = await sptGas("listSeatingCharts", {});
  const charts = res?.charts || res?.data?.charts || [];
  const key = sptFold(title);
  const found = charts.find((c: any) => sptFold(c.title) === key) || charts.find((c: any) => c.active) || charts[0];
  return { chartId: String(found?.id || ""), chartTitle: String(found?.title || title) };
}
async function sptLoadRemote() { const resolved = await sptResolve(); const res = await sptGas("getSeatingAccess", resolved); const a = sptNormalize(res); if (!a) throw new Error("Backend không trả quyền công bố."); sptSaveLocal(a); return a; }

function sptSetTrigger(modal: HTMLElement, text: string) { const span = modal.querySelector<HTMLElement>(".seat-pub-lite-trigger span"); if (span) span.textContent = text; }
function sptSetBadge(modal: HTMLElement, a: SptAccess) { const b = modal.querySelector<HTMLElement>(".seat-pub-lite-badge,.seat-pub-lite-status-pill"); if (!b) return; b.textContent = a.status === "private" ? "Riêng tư" : a.status === "preview" ? "Xem trước" : a.publishAt ? "Hẹn giờ công bố" : "Đã công bố"; }
function sptSyncVisibility(modal: HTMLElement) { const show = (modal.querySelector<HTMLElement>(".seat-pub-lite-trigger span")?.textContent || "").includes("Xem trước"); ["[data-preview-wrap]", "[data-publish-wrap]", "[data-spp-panel]"].forEach((sel) => { const el = modal.querySelector<HTMLElement>(sel); if (el) el.style.display = show ? "grid" : "none"; }); const edit = modal.querySelector<HTMLInputElement>("[data-spp-mode='edit']")?.checked; const opt = modal.querySelector<HTMLElement>("[data-spp-edit-options]"); if (opt) opt.style.display = show && edit ? "grid" : "none"; const inner = modal.querySelector<HTMLElement>("[data-publish-inner]"); const cb = modal.querySelector<HTMLInputElement>("[data-publish-enabled]"); if (inner) inner.style.display = show && cb?.checked ? "grid" : "none"; }
function sptApplyToModal(a: SptAccess) { const modal = document.querySelector<HTMLElement>(".seat-pub-lite-backdrop .seat-pub-lite-modal"); if (!modal) return; modal.dataset.sptLoaded = a.updatedAt || String(Date.now()); sptSetTrigger(modal, a.status === "private" ? "Riêng tư" : "Xem trước + Công bố"); sptSetBadge(modal, a); const ta = modal.querySelector<HTMLTextAreaElement>("textarea[data-preview]"); if (ta) ta.value = a.previewStudents; const pub = modal.querySelector<HTMLInputElement>("[data-publish-enabled]"); if (pub) pub.checked = a.status === "published"; const time = modal.querySelector<HTMLInputElement>("[data-publish-at]"); if (time) time.value = sptIsoToInput(a.publishAt); modal.querySelectorAll<HTMLElement>("[data-pub-mode]").forEach((btn) => btn.classList.toggle("active", btn.dataset.pubMode === (a.publishAt ? "schedule" : "now"))); const mode = modal.querySelector<HTMLInputElement>(`[data-spp-mode='${a.previewMode}']`); if (mode) mode.checked = true; SPT_PERMS.forEach((k) => { const c = modal.querySelector<HTMLInputElement>(`[data-spp-perm='${k}']`); if (c) c.checked = Boolean(a.previewPermissions[k]); }); sptSyncVisibility(modal); }

async function sptMaybeLoadModal() { const modal = document.querySelector<HTMLElement>(".seat-pub-lite-backdrop .seat-pub-lite-modal"); if (!modal || modal.dataset.sptLoading || modal.dataset.sptLoaded || !modal.querySelector(".seat-pub-lite-trigger")) return; const key = sptTitle(); if (sptLoadingKey === key) return; sptLoadingKey = key; modal.dataset.sptLoading = "1"; try { sptToast("Đang tải cấu hình công bố từ backend..."); const a = await sptLoadRemote(); if (document.body.contains(modal)) sptApplyToModal(a); sptToast("Đã tải cấu hình từ backend.", true); } catch (e) { console.warn(e); } finally { sptLoadingKey = ""; delete modal.dataset.sptLoading; } }

function sptReadModal(): SptAccess | null { const modal = document.querySelector<HTMLElement>(".seat-pub-lite-backdrop .seat-pub-lite-modal"); if (!modal) return null; const modeText = modal.querySelector<HTMLElement>(".seat-pub-lite-trigger span")?.textContent || ""; const previewUi = modeText.includes("Xem trước"); const publish = Boolean(modal.querySelector<HTMLInputElement>("[data-publish-enabled]")?.checked); const schedule = modal.querySelector<HTMLElement>("[data-pub-mode='schedule']")?.classList.contains("active"); const rawTime = modal.querySelector<HTMLInputElement>("[data-publish-at]")?.value || ""; const status: SptStatus = previewUi ? publish ? "published" : "preview" : "private"; const previewMode: SptMode = modal.querySelector<HTMLInputElement>("[data-spp-mode='edit']")?.checked ? "edit" : "view"; const previewPermissions: Partial<Record<SptPerm, boolean>> = {}; SPT_PERMS.forEach((k) => previewPermissions[k] = previewMode === "edit" && Boolean(modal.querySelector<HTMLInputElement>(`[data-spp-perm='${k}']`)?.checked)); const publishAt = status === "published" && schedule ? sptInputToIso(rawTime) : ""; if (status === "published" && schedule && !publishAt) throw new Error("Chọn giờ công bố trước khi lưu."); return { chartId: sptChartId(), chartTitle: sptTitle(), status, previewStudents: previewUi ? (modal.querySelector<HTMLTextAreaElement>("textarea[data-preview]")?.value || "") : "", publishAt, previewMode, previewPermissions }; }
async function sptSave(a: SptAccess) { const resolved = await sptResolve(a.chartTitle); const next = { ...a, ...resolved, previewPermissions: a.previewMode === "edit" ? a.previewPermissions : {}, updatedAt: new Date().toISOString(), updatedBy: sptActor().name }; const res = await sptGas("saveSeatingAccess", { ...next, preview_mode: next.previewMode, preview_permissions: JSON.stringify(next.previewPermissions), actor: sptActor() }); const saved = sptNormalize(res); if (!saved) throw new Error("Backend không trả dữ liệu sau khi lưu."); if (saved.status !== next.status) throw new Error("Backend không lưu đúng trạng thái."); if (saved.previewMode !== next.previewMode) throw new Error("Backend chưa trả đúng quyền xem trước."); sptSaveLocal(saved); window.dispatchEvent(new CustomEvent("a3k64:seating-access-updated", { detail: saved })); window.dispatchEvent(new CustomEvent("a3k64:seating-changed", { detail: { access: saved } })); return saved; }

function sptBind() { if (sptReady) return; sptReady = true; sptStyle(); window.setInterval(sptMaybeLoadModal, 250); document.addEventListener("click", () => setTimeout(sptSyncVisibility, 0, document.querySelector<HTMLElement>(".seat-pub-lite-backdrop .seat-pub-lite-modal") as HTMLElement), true); window.addEventListener("click", async (event) => { const target = event.target as HTMLElement | null; const btn = target?.closest?.(".seat-pub-lite-backdrop button[data-save],.seat-pub-lite-backdrop button[data-private],.seat-pub-lite-backdrop button[data-preview],.seat-pub-lite-backdrop button[data-publish-now]") as HTMLButtonElement | null; if (!btn) return; event.preventDefault(); event.stopPropagation(); if ("stopImmediatePropagation" in event) event.stopImmediatePropagation(); try { let config = sptReadModal(); if (!config) return; if (btn.dataset.private !== undefined) config = { ...config, status: "private", previewStudents: "", publishAt: "", previewMode: "view", previewPermissions: {} }; if (btn.dataset.preview !== undefined) config = { ...config, status: "preview", publishAt: "" }; if (btn.dataset.publishNow !== undefined) config = { ...config, status: "published", publishAt: "" }; const old = btn.textContent || "Lưu"; btn.disabled = true; btn.textContent = "Đang lưu..."; sptToast("Đang lưu đúng cấu hình lên backend..."); const saved = await sptSave(config); document.querySelector(".seat-pub-lite-backdrop")?.remove(); sptToast(`${saved.status === "private" ? "Riêng tư" : saved.status === "preview" ? "Xem trước" : "Công bố"} đã lưu.`, true); btn.textContent = old; } catch (e) { console.error(e); btn.disabled = false; sptToast(e instanceof Error ? e.message : "Không lưu được công bố."); } }, true); }

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sptBind);
else sptBind();

export {};
