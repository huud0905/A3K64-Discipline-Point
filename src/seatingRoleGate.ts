const SEAT_GATE_PATH = "/desktop/seating-chart";
const SEAT_GATE_WINDOW = "a3k64-seating-window";
const SEAT_GATE_SHORTCUT = "a3k64-seating-shortcut";
const SEAT_GATE_TASKBAR = "a3k64-seating-taskbar-button";
const SEAT_GATE_ALLOWED = ["lop_truong", "bi_thu", "gvcn"];
let seatGateCount = 0;
let seatGateTimer = 0;
let seatGateAlerted = false;

function seatGateRoleText(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[\s-]+/g, "_");
}

function seatGateCurrentRole() {
  try {
    const session = JSON.parse(localStorage.getItem("a3k64-login-session-v1") || "null");
    const user = session?.user || session || {};
    const role = seatGateRoleText(user.role || user.userRole || "");
    if (role.includes("gvcn") || role.includes("giao_vien") || role.includes("admin")) return "gvcn";
    if (role.includes("lop_truong")) return "lop_truong";
    if (role.includes("bi_thu")) return "bi_thu";
    if (role.includes("to_truong")) return "to_truong";
    return role || "hoc_sinh";
  } catch {
    return "hoc_sinh";
  }
}

function seatGateCanOpen() {
  return SEAT_GATE_ALLOWED.includes(seatGateCurrentRole());
}

function seatGateWarn() {
  if (seatGateAlerted) return;
  seatGateAlerted = true;
  window.setTimeout(() => alert("Bạn chưa có quyền truy cập app Sơ đồ chỗ ngồi."), 50);
}

function seatGateTick() {
  if (seatGateCanOpen()) return;
  document.getElementById(SEAT_GATE_SHORTCUT)?.remove();
  document.getElementById(SEAT_GATE_TASKBAR)?.remove();
  const win = document.getElementById(SEAT_GATE_WINDOW);
  if (win) {
    win.remove();
    seatGateWarn();
  }
  if (location.pathname === SEAT_GATE_PATH) {
    history.replaceState({}, "", "/desktop");
    seatGateWarn();
  }
}

function bootSeatGate() {
  seatGateTick();
  seatGateTimer = window.setInterval(() => {
    seatGateTick();
    seatGateCount += 1;
    if (seatGateCount > 240 && seatGateTimer) {
      window.clearInterval(seatGateTimer);
      seatGateTimer = 0;
    }
  }, 500);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootSeatGate);
else bootSeatGate();
