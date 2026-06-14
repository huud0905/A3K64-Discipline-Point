const SPB_WIN = "#a3k64-seating-window";
const SPB_KEY = "a3k64-seating-publish-lite-v1";
const SPB_CHART_KEY = "a3k64-seating-sheet-current-id-v1";
const SPB_GAS = String(import.meta.env.VITE_GAS_WEB_APP_URL || "").trim();
let spbTimer = 0;
let spbReady = false;

type SpbStatus = "private" | "preview" | "published";
type SpbAccess = { chartId: string; chartTitle: string; status: SpbStatus; previewStudents: string; publishAt: string; updatedAt?: string; updatedBy?: string };

function spbChartId() { return localStorage.getItem(SPB_CHART_KEY) || "default"; }
function spbTitle() { return document.querySelector<HTMLElement>(`${SPB_WIN} .seat-ctrl-trigger span`)?.textContent?.trim() || "Sơ đồ hiện tại"; }
function spbKey(id = spbChartId()) { return `${SPB_KEY}:${id || "default"}`; }
function spbActor() { try { const s = JSON.parse(localStorage.getItem("a3k64-login-session-v1") || "null"); const u = s?.user || s || {}; return { name: String(u.name || u.fullName || u.hoTen || u.username || u.email || ""), email: String(u.email || ""), role: String(u.role || u.userRole || "") }; } catch { return { name: "", email: "", role: "" }; } }
function spbFold(v: unknown) { return String(v || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[\s_-]+/g, ""); }
function spbStatus(v: unknown): SpbStatus { const x = spbFold(v); if (x === "preview" || x === "xemtruoc") return "preview"; if (["published", "publish", "public", "congbo", "congkhai", "scheduled", "hengio", "dahengio"].includes(x)) return "published"; return "private"; }
function spbMs(v: string) { const t = new Date(v || "").getTime(); return Number.isFinite(t) ? t : 0; }
function spbText(a: Pick<SpbAccess, "status" | "publishAt">) { if (a.status === "published" && spbMs(a.publishAt) > Date.now()) return "Hẹn giờ công bố"; if (a.status === "published") return "Đã công bố"; if (a.status === "preview") return "Xem trước"; return "Riêng tư"; }
function spbHtml(v: unknown) { return String(v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function spbInputToIso(v: string) { if (!v) return ""; const d = new Date(v); return Number.isFinite(d.getTime()) ? d.toISOString() : ""; }
function spbLocal(): SpbAccess { const id = spbChartId(); try { const d = JSON.parse(localStorage.getItem(spbKey(id)) || "{}"); return { chartId: id, chartTitle: String(d.chartTitle || d.chart_title || spbTitle()), status: spbStatus(d.status), previewStudents: String(d.previewStudents || d.preview_students || ""), publishAt: String(d.publishAt || d.publish_at || ""), updatedAt: d.updatedAt || d.updated_at, updatedBy: d.updatedBy || d.updated_by }; } catch { return { chartId: id, chartTitle: spbTitle(), status: "private", previewStudents: "", publishAt: "" }; } }

function spbToast(msg: string, done = false) {
  clearTimeout(spbTimer);
  document.getElementById("a3-spb-toast")?.remove();
  const el = document.createElement("div");
  el.id = "a3-spb-toast";
  el.className = done ? "done" : "";
  el.innerHTML = `<span class="spin"></span><span>${spbHtml(msg)}</span>`;
  document.body.appendChild(el);
  spbTimer = window.setTimeout(() => el.remove(), done ? 1600 : 9000);
}

function spbStyle() {
  if (document.getElementById("a3-spb-style")) return;
  const st = document.createElement("style");
  st.id = "a3-spb-style";
  st.textContent = `#a3-spb-toast{position:fixed;left:50%;top:74px;transform:translateX(-50%);z-index:1000002;display:flex;align-items:center;gap:10px;padding:10px 14px;border:1px solid rgba(20,184,166,.65);border-radius:16px;background:rgba(255,255,255,.985);color:#0f172a;box-shadow:0 20px 58px rgba(15,23,42,.18);font-size:14px;font-weight:900;pointer-events:none;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",Arial,sans-serif}#a3-spb-toast .spin{width:15px;height:15px;border-radius:999px;border:2px solid rgba(15,23,42,.16);border-top-color:var(--desktop-accent,#14b8a6);animation:a3spb .72s linear infinite}#a3-spb-toast.done .spin{animation:none;border-color:var(--desktop-accent,#14b8a6);background:var(--desktop-accent,#14b8a6);box-shadow:inset 0 0 0 4px #fff}.theme-dark #a3-spb-toast,html.a3-overlay-dark #a3-spb-toast{background:rgba(15,23,42,.96);color:#f8fafc}.theme-dark #a3-spb-toast .spin,html.a3-overlay-dark #a3-spb-toast .spin{border-color:rgba(255,255,255,.28);border-top-color:#5eead4}@keyframes a3spb{to{transform:rotate(360deg)}}`;
  document.head.appendChild(st);
}

function spbGas(action: string, payload?: unknown): Promise<any> {
  if (!SPB_GAS) return Promise.reject(new Error("Thiếu VITE_GAS_WEB_APP_URL"));
  return new Promise((resolve, reject) => {
    const cb = `__a3spb_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const callbacks = window as typeof window & Record<string, unknown>;
    const script = document.createElement("script");
    const url = new URL(SPB_GAS);
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

function spbNormalize(raw: any, chartId = spbChartId()): SpbAccess | null {
  const s = raw?.access || raw?.data?.access || raw?.config || raw?.data?.config || raw;
  if (!s) return null;
  return { chartId: String(s.chartId || s.chart_id || chartId), chartTitle: String(s.chartTitle || s.chart_title || s.title || spbTitle()), status: spbStatus(s.status), previewStudents: String(s.previewStudents || s.preview_students || ""), publishAt: String(s.publishAt || s.publish_at || ""), updatedAt: String(s.updatedAt || s.updated_at || ""), updatedBy: String(s.updatedBy || s.updated_by || "") };
}

function spbAssertSaved(want: SpbAccess, saved: SpbAccess | null) {
  if (!saved) throw new Error("Backend không trả dữ liệu công bố.");
  if (saved.status !== want.status) throw new Error(`Backend không lưu đúng trạng thái: ${saved.status}`);
  if (want.status === "published") {
    const a = spbMs(want.publishAt);
    const b = spbMs(saved.publishAt);
    if (a && Math.abs(a - b) > 60000) throw new Error("Backend không lưu đúng giờ hẹn công bố.");
  }
}

async function spbSave(want: SpbAccess) {
  const status = spbStatus(want.status);
  const next = { ...want, status, previewStudents: status === "private" ? "" : String(want.previewStudents || ""), publishAt: status === "published" ? String(want.publishAt || "") : "", updatedAt: new Date().toISOString(), updatedBy: spbActor().name };
  const res = await spbGas("saveSeatingAccess", { ...next, actor: spbActor() });
  const saved = spbNormalize(res, next.chartId);
  spbAssertSaved(next, saved);
  localStorage.setItem(spbKey(saved!.chartId), JSON.stringify(saved));
  window.dispatchEvent(new CustomEvent("a3k64:seating-access-updated", { detail: saved }));
  window.dispatchEvent(new CustomEvent("a3k64:seating-changed", { detail: { access: saved } }));
  return saved!;
}

function spbConfigFromSaveModal(): SpbAccess | null {
  const modal = document.querySelector<HTMLElement>(".seat-pub-lite-backdrop .seat-pub-lite-modal");
  if (!modal || !modal.querySelector("button[data-save]")) return null;
  const modeText = modal.querySelector<HTMLElement>(".seat-pub-lite-trigger span")?.textContent || "";
  const uiMode = modeText.includes("Xem trước") ? "preview_publish" : "private";
  const checked = Boolean(modal.querySelector<HTMLInputElement>("[data-publish-enabled]")?.checked);
  const schedule = modal.querySelector<HTMLElement>("[data-pub-mode='schedule']")?.classList.contains("active");
  const raw = modal.querySelector<HTMLInputElement>("[data-publish-at]")?.value || "";
  const status: SpbStatus = uiMode === "private" ? "private" : checked ? "published" : "preview";
  const publishAt = status === "published" && schedule ? spbInputToIso(raw) : "";
  if (status === "published" && schedule && !publishAt) throw new Error("Chọn giờ công bố trước khi lưu.");
  return { ...spbLocal(), chartId: spbChartId(), chartTitle: spbTitle(), status, publishAt, previewStudents: uiMode === "preview_publish" ? (modal.querySelector<HTMLTextAreaElement>("textarea[data-preview]")?.value || "") : "" };
}

function spbManage(action: string): SpbAccess {
  const cur = spbLocal();
  if (action === "private") return { ...cur, status: "private", publishAt: "", previewStudents: "" };
  if (action === "preview") return { ...cur, status: "preview", publishAt: "" };
  return { ...cur, status: "published", publishAt: "" };
}

function spbClose() { document.querySelector(".seat-pub-lite-backdrop")?.remove(); }
function spbButton(el: Element | null) { return el instanceof HTMLButtonElement ? el : null; }

function spbBind() {
  if (spbReady) return;
  spbReady = true;
  spbStyle();
  document.addEventListener("click", async (event) => {
    const target = event.target as HTMLElement | null;
    const save = spbButton(target?.closest?.(".seat-pub-lite-backdrop button[data-save]") || null);
    const priv = spbButton(target?.closest?.(".seat-pub-lite-backdrop button[data-private]") || null);
    const pubNow = spbButton(target?.closest?.(".seat-pub-lite-backdrop button[data-publish-now]") || null);
    const prev = spbButton(target?.closest?.(".seat-pub-lite-backdrop button[data-preview]") || null);
    const btn = save || priv || pubNow || prev;
    if (!btn) return;
    event.preventDefault(); event.stopPropagation(); if ("stopImmediatePropagation" in event) event.stopImmediatePropagation();
    try {
      const config = save ? spbConfigFromSaveModal() : priv ? spbManage("private") : prev ? spbManage("preview") : spbManage("published");
      if (!config) return;
      btn.disabled = true;
      const old = btn.textContent || "Lưu";
      btn.textContent = "Đang lưu...";
      spbToast("Đang lưu lên backend...");
      const saved = await spbSave(config);
      spbClose();
      spbToast(`${spbText(saved)} đã lưu lên backend.`, true);
      btn.textContent = old;
    } catch (error) {
      console.error(error);
      btn.disabled = false;
      spbToast(error instanceof Error ? error.message : "Không lưu được lên backend. Quyền xem chưa thay đổi.");
    }
  }, true);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", spbBind);
else spbBind();

export {};
