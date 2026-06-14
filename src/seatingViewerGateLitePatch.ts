const GATE_WINDOW = "#a3k64-seating-window";
const GATE_URL = String(import.meta.env.VITE_GAS_WEB_APP_URL || "").trim();
let gateBusy = false;

function foldGate(v: unknown) {
  return String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "");
}
function roleGate() {
  try {
    const s = JSON.parse(localStorage.getItem("a3k64-login-session-v1") || "null");
    const u = s?.user || s || {};
    return String(u.role || u.userRole || "");
  } catch { return ""; }
}
function adminGate() {
  const r = foldGate(roleGate());
  return r.includes("gvcn") || r.includes("loptruong") || r.includes("bithu") || r.includes("admin");
}
function windowGate() { return document.querySelector<HTMLElement>(GATE_WINDOW); }
function showGate(on: boolean, msg = "Sơ đồ chỗ ngồi đang ở chế độ riêng tư.") {
  const w = windowGate();
  if (!w) return;
  w.classList.toggle("gate-closed", on);
  w.dataset.gateMsg = msg;
}
function styleGate() {
  if (document.getElementById("gate-style")) return;
  const st = document.createElement("style");
  st.id = "gate-style";
  st.textContent = `${GATE_WINDOW} .stable-seat-body{position:relative}${GATE_WINDOW}.gate-closed .stable-seat-main{visibility:hidden!important;opacity:0!important;pointer-events:none!important}${GATE_WINDOW}.gate-closed .stable-seat-body:after{white-space:pre-line;content:attr(data-gate-msg);position:absolute;left:16px;right:16px;top:72px;bottom:0;z-index:70;display:flex;align-items:center;justify-content:center;text-align:center;border:1px solid #cbd5e1;border-radius:22px;background:rgba(255,255,255,.985);color:#0f172a;font-weight:1000;font-size:18px;line-height:1.5}`;
  document.head.appendChild(st);
}
async function apiGate(action: string, payload: unknown) {
  const url = new URL(GATE_URL);
  url.searchParams.set("action", action);
  url.searchParams.set("payload", JSON.stringify(payload || {}));
  url.searchParams.set("t", String(Date.now()));
  const res = await fetch(url.toString(), { method: "GET", credentials: "omit" });
  return await res.json();
}
async function checkGate() {
  if (gateBusy || !windowGate()) return;
  if (adminGate()) { showGate(false); return; }
  gateBusy = true;
  try {
    const list = await apiGate("listSeatingCharts", {});
    const arr = list?.charts || list?.data?.charts || [];
    const active = Array.isArray(arr) ? (arr.find((x: any) => x?.active === true || String(x?.active || x?.is_active || "").toLowerCase() === "true") || arr[0]) : null;
    const id = String(active?.id || active?.chartId || active?.chart_id || "");
    const title = String(active?.title || active?.chartTitle || active?.chart_title || "");
    const got = await apiGate("getSeatingAccess", { id, chartId: id, title, chartTitle: title });
    const access = got?.access || got?.data?.access || got || {};
    const st = foldGate(access.status);
    if (st === "published" || st === "publish" || st === "public" || st === "congbo" || st === "congkhai") showGate(false);
    else showGate(true, st === "preview" || st === "xemtruoc" ? "Sơ đồ đang ở chế độ xem trước.\nTài khoản này chưa được mở xem." : "Sơ đồ chỗ ngồi đang ở chế độ riêng tư.");
  } catch {
    showGate(true, "Không xác minh được trạng thái sơ đồ từ backend.");
  } finally { gateBusy = false; }
}
function bootGate() {
  styleGate();
  void checkGate();
  setInterval(checkGate, 3000);
  window.addEventListener("focus", () => setTimeout(() => void checkGate(), 120));
  window.addEventListener("a3k64:seating-backend-synced", () => setTimeout(() => void checkGate(), 120));
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootGate);
else bootGate();
export {};
