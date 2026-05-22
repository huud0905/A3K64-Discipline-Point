import { fetchScoreboardFromGas, getCachedScoreboardFromGas } from "./lib/gasApi";

const GAS_URL = import.meta.env.VITE_GAS_WEB_APP_URL?.trim();
const TIMEOUT_MS = 90000;
let root: HTMLDivElement | null = null;
let weeks: number[] = [];
let picked = new Set<number>();
let busy = false;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function actor() {
  try {
    const user = JSON.parse(localStorage.getItem("a3k64-login-session-v1") || "null")?.user || {};
    return { actorEmail: text(user.email), actorName: text(user.displayName || user.name || user.hoten), actorRole: text(user.role), actorGroup: text(user.group || user.to) };
  } catch {
    return {};
  }
}

type GasResult = Record<string, unknown> & { ok?: boolean; error?: string; data?: Record<string, unknown> };

function callGas(action: string, payload: unknown): Promise<GasResult | null> {
  if (!GAS_URL) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const cb = `__a3Export_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const s = document.createElement("script");
    const u = new URL(GAS_URL);
    let done = false;
    let timer = 0;
    u.searchParams.set("action", action);
    u.searchParams.set("callback", cb);
    u.searchParams.set("t", String(Date.now()));
    u.searchParams.set("payload", JSON.stringify(payload));
    const finish = () => { window.clearTimeout(timer); delete (window as unknown as Record<string, unknown>)[cb]; s.remove(); };
    (window as unknown as Record<string, unknown>)[cb] = (json: GasResult) => {
      if (done) return;
      done = true;
      finish();
      if (json?.ok === false) reject(new Error(text(json.error) || "GAS lỗi."));
      else if (json?.data?.ok === false) reject(new Error(text(json.data.error) || "GAS lỗi."));
      else resolve(json);
    };
    s.onerror = () => { if (done) return; done = true; finish(); reject(new Error("Không tải được Google Apps Script.")); };
    timer = window.setTimeout(() => { if (done) return; done = true; finish(); reject(new Error("Xuất Excel quá lâu.")); }, TIMEOUT_MS);
    s.setAttribute("src", u.toString());
    document.head.appendChild(s);
  });
}

function downloadBase64(base64: string, filename: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || `A3K64_Export_${Date.now()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function css() {
  if (document.getElementById("a3-export-css")) return;
  const st = document.createElement("style");
  st.id = "a3-export-css";
  st.textContent = `.a3-export-backdrop{position:fixed;inset:0;z-index:2147483647;background:rgba(2,6,23,.55);display:grid;place-items:center;padding:20px;backdrop-filter:blur(4px)}.a3-export-card{width:min(560px,calc(100vw - 28px));border:1px solid rgba(148,163,184,.28);border-radius:24px;background:#0f172a;color:#f8fafc;box-shadow:0 30px 100px rgba(0,0,0,.45);overflow:hidden}.a3-export-head{display:flex;justify-content:space-between;gap:16px;padding:20px 22px;border-bottom:1px solid rgba(148,163,184,.16);background:linear-gradient(135deg,rgba(37,99,235,.18),rgba(15,23,42,.98))}.a3-export-head h2{margin:0;font-size:20px;font-weight:950}.a3-export-close{width:36px;height:36px;border:0;border-radius:12px;background:rgba(148,163,184,.13);color:#f8fafc;cursor:pointer;font-size:22px;font-weight:800}.a3-export-body{padding:18px 22px 20px}.a3-export-tools{display:flex;justify-content:space-between;gap:10px;margin-bottom:14px;color:#cbd5e1;font-size:13px;font-weight:800}.a3-export-tools div{display:flex;gap:8px;flex-wrap:wrap}.a3-export-tools button{border:1px solid rgba(148,163,184,.24);background:#172033;color:#dbeafe;border-radius:999px;padding:7px 11px;font-weight:850;cursor:pointer}.a3-export-weeks{display:grid;grid-template-rows:repeat(9,auto);grid-auto-flow:column;grid-auto-columns:minmax(84px,1fr);gap:8px;overflow-x:auto;padding:4px 2px 10px}.a3-export-week{height:36px;border:1px solid rgba(148,163,184,.24);border-radius:12px;background:#172033;color:#f8fafc;font-weight:900;cursor:pointer;display:grid;place-items:center;white-space:nowrap}.a3-export-week.selected{background:#2563eb;border-color:#60a5fa;box-shadow:0 10px 24px rgba(37,99,235,.24)}.a3-export-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:14px}.a3-export-actions button{border:0;border-radius:14px;padding:11px 16px;font-weight:950;cursor:pointer}.a3-export-cancel{background:#1e293b;color:#cbd5e1}.a3-export-submit{background:#16a34a;color:white}.a3-export-submit:disabled{opacity:.55;cursor:not-allowed}.a3-export-msg{margin-top:12px;color:#fca5a5;font-size:13px;font-weight:750;min-height:18px}`;
  document.head.appendChild(st);
}

function draw(message = "") {
  if (!root) return;
  const weekButtons = weeks.map((w) => `<button type="button" class="a3-export-week ${picked.has(w) ? "selected" : ""}" data-week="${w}">Tuần ${w}</button>`).join("");
  root.innerHTML = `<div class="a3-export-card"><div class="a3-export-head"><h2>Xuất Excel bảng chấm</h2><button type="button" class="a3-export-close">×</button></div><div class="a3-export-body"><div class="a3-export-tools"><span>${picked.size}/${weeks.length} tuần đã chọn</span><div><button type="button" data-export-action="all">Chọn tất cả</button><button type="button" data-export-action="none">Bỏ chọn</button></div></div><div class="a3-export-weeks">${weekButtons}</div><div class="a3-export-msg">${message}</div><div class="a3-export-actions"><button type="button" class="a3-export-cancel">Huỷ</button><button type="button" class="a3-export-submit" ${busy || !picked.size ? "disabled" : ""}>${busy ? "Đang xuất..." : "Xuất Excel"}</button></div></div></div>`;
}

function close() {
  root?.remove();
  root = null;
  busy = false;
}

async function open() {
  css();
  const cached = getCachedScoreboardFromGas();
  const remote = cached?.weeks?.length ? cached : await fetchScoreboardFromGas();
  weeks = (remote?.weeks?.length ? remote.weeks : [1]).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  picked = new Set(weeks.length ? [weeks[weeks.length - 1]] : []);
  busy = false;
  root?.remove();
  root = document.createElement("div");
  root.className = "a3-export-backdrop";
  document.body.appendChild(root);
  draw();
}

async function submit() {
  if (busy || !picked.size) return;
  busy = true;
  draw();
  try {
    const response = await callGas("exportWeeksToExcel", { weeks: Array.from(picked).sort((a, b) => a - b), ...actor() });
    const data = (response?.data || response || {}) as Record<string, unknown>;
    const base64 = text(data.base64);
    const fileName = text(data.fileName) || `A3K64_Export_${Date.now()}.xlsx`;
    const url = text(data.downloadUrl || data.fileUrl);
    close();
    if (base64) {
      downloadBase64(base64, fileName);
    } else if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      throw new Error("Không nhận được file Excel từ GAS.");
    }
  } catch (error) {
    busy = false;
    draw(error instanceof Error ? error.message : "Không xuất được Excel.");
  }
}

document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement | null;
  if (!target) return;
  const exportButton = target.closest<HTMLButtonElement>(".toolbar-button.export");
  if (exportButton) {
    event.preventDefault();
    event.stopPropagation();
    void open();
    return;
  }
  if (!root) return;
  if (target.classList.contains("a3-export-backdrop") || target.closest(".a3-export-close") || target.closest(".a3-export-cancel")) return close();
  const weekButton = target.closest<HTMLButtonElement>(".a3-export-week");
  if (weekButton) {
    const week = Number(weekButton.dataset.week);
    if (picked.has(week)) picked.delete(week); else picked.add(week);
    draw();
    return;
  }
  const action = target.closest<HTMLButtonElement>("[data-export-action]")?.dataset.exportAction;
  if (action === "all") { picked = new Set(weeks); draw(); return; }
  if (action === "none") { picked = new Set(); draw(); return; }
  if (target.closest(".a3-export-submit")) void submit();
}, true);

window.addEventListener("keydown", (event) => { if (event.key === "Escape" && root) close(); });

export {};
