const SPI_WIN = "#a3k64-seating-window";
const SPI_KEY = "a3k64-seating-publish-lite-v1";
const SPI_CHART_KEY = "a3k64-seating-sheet-current-id-v1";
const SPI_GAS = String(import.meta.env.VITE_GAS_WEB_APP_URL || "").trim();
let spiBound = false;
let spiToastTimer = 0;

type SpiStatus = "private" | "preview" | "published";
type SpiMode = "view" | "edit";
type SpiPerm = "move" | "save" | "create" | "restore" | "random" | "export";
type SpiAccess = { chartId: string; chartTitle: string; status: SpiStatus; previewStudents: string; publishAt: string; previewMode: SpiMode; previewPermissions: Partial<Record<SpiPerm, boolean>>; updatedAt?: string; updatedBy?: string };

const SPI_PERMS: SpiPerm[] = ["move", "save", "create", "restore", "random", "export"];

function spiChartId() { return localStorage.getItem(SPI_CHART_KEY) || "default"; }
function spiTitle() { return document.querySelector<HTMLElement>(`${SPI_WIN} .seat-ctrl-trigger span`)?.textContent?.trim() || "Sơ đồ hiện tại"; }
function spiKey(id = spiChartId()) { return `${SPI_KEY}:${id || "default"}`; }
function spiActor() { try { const s = JSON.parse(localStorage.getItem("a3k64-login-session-v1") || "null"); const u = s?.user || s || {}; return { name: String(u.name || u.fullName || u.hoTen || u.username || u.email || ""), email: String(u.email || ""), role: String(u.role || u.userRole || "") }; } catch { return { name: "", email: "", role: "" }; } }
function spiFold(v: unknown) { return String(v || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[\s_-]+/g, ""); }
function spiStatus(v: unknown): SpiStatus { const x = spiFold(v); if (x === "preview" || x === "xemtruoc") return "preview"; if (["published", "publish", "public", "congbo", "congkhai", "scheduled", "hengio"].includes(x)) return "published"; return "private"; }
function spiMode(v: unknown): SpiMode { const x = spiFold(v); return x === "edit" || x === "sua" ? "edit" : "view"; }
function spiInputToIso(v: string) { if (!v) return ""; const d = new Date(v); return Number.isFinite(d.getTime()) ? d.toISOString() : ""; }
function spiHtml(v: unknown) { return String(v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function spiLocal(): SpiAccess {
  const id = spiChartId();
  try {
    const d = JSON.parse(localStorage.getItem(spiKey(id)) || "{}");
    let perms: any = d.previewPermissions || d.preview_permissions || {};
    if (typeof perms === "string") { try { perms = JSON.parse(perms); } catch { perms = {}; } }
    return { chartId: id, chartTitle: String(d.chartTitle || d.chart_title || spiTitle()), status: spiStatus(d.status), previewStudents: String(d.previewStudents || d.preview_students || ""), publishAt: String(d.publishAt || d.publish_at || ""), previewMode: spiMode(d.previewMode || d.preview_mode), previewPermissions: perms || {}, updatedAt: d.updatedAt || d.updated_at, updatedBy: d.updatedBy || d.updated_by };
  } catch {
    return { chartId: id, chartTitle: spiTitle(), status: "private", previewStudents: "", publishAt: "", previewMode: "view", previewPermissions: {} };
  }
}

function spiToast(msg: string, done = false) {
  clearTimeout(spiToastTimer);
  document.getElementById("a3-spi-toast")?.remove();
  const el = document.createElement("div");
  el.id = "a3-spi-toast";
  el.className = done ? "done" : "";
  el.innerHTML = `<span class="spin"></span><span>${spiHtml(msg)}</span>`;
  document.body.appendChild(el);
  spiToastTimer = window.setTimeout(() => el.remove(), done ? 1500 : 9000);
}

function spiStyle() {
  if (document.getElementById("a3-spi-style")) return;
  const st = document.createElement("style");
  st.id = "a3-spi-style";
  st.textContent = `#a3-spi-toast{position:fixed;left:50%;top:74px;transform:translateX(-50%);z-index:1000004;display:flex;align-items:center;gap:10px;padding:10px 14px;border:1px solid rgba(20,184,166,.65);border-radius:16px;background:rgba(255,255,255,.985);color:#0f172a;box-shadow:0 20px 58px rgba(15,23,42,.18);font-size:14px;font-weight:900;pointer-events:none;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",Arial,sans-serif}#a3-spi-toast .spin{width:15px;height:15px;border-radius:999px;border:2px solid rgba(15,23,42,.16);border-top-color:var(--desktop-accent,#14b8a6);animation:a3spi .72s linear infinite}#a3-spi-toast.done .spin{animation:none;border-color:var(--desktop-accent,#14b8a6);background:var(--desktop-accent,#14b8a6);box-shadow:inset 0 0 0 4px #fff}@keyframes a3spi{to{transform:rotate(360deg)}}`;
  document.head.appendChild(st);
}

function spiGas(action: string, payload?: unknown): Promise<any> {
  if (!SPI_GAS) return Promise.reject(new Error("Thiếu VITE_GAS_WEB_APP_URL"));
  return new Promise((resolve, reject) => {
    const cb = `__a3spi_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const callbacks = window as typeof window & Record<string, unknown>;
    const script = document.createElement("script");
    const url = new URL(SPI_GAS);
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

function spiNormalize(raw: any, chartId = spiChartId()): SpiAccess | null {
  const s = raw?.access || raw?.data?.access || raw?.config || raw?.data?.config || raw;
  if (!s) return null;
  let perms: any = s.previewPermissions || s.preview_permissions || {};
  if (typeof perms === "string") { try { perms = JSON.parse(perms); } catch { perms = {}; } }
  return { chartId: String(s.chartId || s.chart_id || chartId), chartTitle: String(s.chartTitle || s.chart_title || s.title || spiTitle()), status: spiStatus(s.status), previewStudents: String(s.previewStudents || s.preview_students || ""), publishAt: String(s.publishAt || s.publish_at || ""), previewMode: spiMode(s.previewMode || s.preview_mode), previewPermissions: perms || {}, updatedAt: s.updatedAt || s.updated_at, updatedBy: s.updatedBy || s.updated_by };
}

function spiReadModal(): SpiAccess | null {
  const modal = document.querySelector<HTMLElement>(".seat-pub-lite-backdrop .seat-pub-lite-modal");
  if (!modal || !modal.querySelector("button[data-save]")) return null;
  const modeText = modal.querySelector<HTMLElement>(".seat-pub-lite-trigger span")?.textContent || "";
  const uiMode = modeText.includes("Xem trước") ? "preview_publish" : "private";
  const publishEnabled = Boolean(modal.querySelector<HTMLInputElement>("[data-publish-enabled]")?.checked);
  const schedule = modal.querySelector<HTMLElement>("[data-pub-mode='schedule']")?.classList.contains("active");
  const rawTime = modal.querySelector<HTMLInputElement>("[data-publish-at]")?.value || "";
  const status: SpiStatus = uiMode === "private" ? "private" : publishEnabled ? "published" : "preview";
  const publishAt = status === "published" && schedule ? spiInputToIso(rawTime) : "";
  if (status === "published" && schedule && !publishAt) throw new Error("Chọn giờ công bố trước khi lưu.");
  const previewMode: SpiMode = modal.querySelector<HTMLInputElement>("[data-spp-mode='edit']")?.checked ? "edit" : "view";
  const previewPermissions: Partial<Record<SpiPerm, boolean>> = {};
  SPI_PERMS.forEach((key) => { previewPermissions[key] = previewMode === "edit" && Boolean(modal.querySelector<HTMLInputElement>(`[data-spp-perm='${key}']`)?.checked); });
  return { ...spiLocal(), chartId: spiChartId(), chartTitle: spiTitle(), status, publishAt, previewStudents: uiMode === "preview_publish" ? (modal.querySelector<HTMLTextAreaElement>("textarea[data-preview]")?.value || "") : "", previewMode, previewPermissions };
}

function spiManage(action: string): SpiAccess {
  const cur = spiLocal();
  if (action === "private") return { ...cur, status: "private", publishAt: "", previewStudents: "", previewMode: "view", previewPermissions: {} };
  if (action === "preview") return { ...cur, status: "preview", publishAt: "", previewMode: cur.previewMode || "view", previewPermissions: cur.previewPermissions || {} };
  return { ...cur, status: "published", publishAt: "" };
}

async function spiSave(want: SpiAccess) {
  const next = { ...want, previewPermissions: want.previewMode === "edit" ? want.previewPermissions : {}, updatedAt: new Date().toISOString(), updatedBy: spiActor().name };
  const res = await spiGas("saveSeatingAccess", { ...next, preview_mode: next.previewMode, preview_permissions: JSON.stringify(next.previewPermissions), actor: spiActor() });
  const saved = spiNormalize(res, next.chartId);
  if (!saved) throw new Error("Backend không trả dữ liệu quyền xem trước.");
  if (saved.status !== next.status) throw new Error("Backend không lưu đúng trạng thái.");
  if (saved.previewMode !== next.previewMode) throw new Error("Backend chưa hỗ trợ preview_mode. Cần cập nhật Apps Script.");
  localStorage.setItem(spiKey(saved.chartId), JSON.stringify(saved));
  window.dispatchEvent(new CustomEvent("a3k64:seating-access-updated", { detail: saved }));
  window.dispatchEvent(new CustomEvent("a3k64:seating-changed", { detail: { access: saved } }));
  return saved;
}

function spiBind() {
  if (spiBound) return;
  spiBound = true;
  spiStyle();
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
      const config = save ? spiReadModal() : priv ? spiManage("private") : prev ? spiManage("preview") : spiManage("published");
      if (!config) return;
      const old = btn.textContent || "Lưu";
      btn.disabled = true; btn.textContent = "Đang lưu...";
      spiToast("Đang lưu quyền xem trước lên backend...");
      const saved = await spiSave(config);
      document.querySelector(".seat-pub-lite-backdrop")?.remove();
      spiToast(`${saved.status === "private" ? "Riêng tư" : saved.status === "preview" ? "Xem trước" : "Công bố"} đã lưu.`, true);
      btn.textContent = old;
    } catch (error) {
      console.error(error);
      btn.disabled = false;
      spiToast(error instanceof Error ? error.message : "Không lưu được quyền xem trước.");
    }
  }, true);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", spiBind);
else spiBind();

export {};
