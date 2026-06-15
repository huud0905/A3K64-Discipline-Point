import { readSavedLoginSession } from './core/auth';
import { normalizeRole } from './core/permissions';

const SEAT_GATE_ADMIN_ROLES = ["lop_truong", "bi_thu", "gvcn"];
let seatGateCount = 0;
let seatGateTimer = 0;

function seatGateCurrentRole() {
  const user = readSavedLoginSession<Record<string, unknown>>()?.user || {};
  const role = normalizeRole(String(user.role || user.userRole || ""));
  if (role.includes("gvcn") || role.includes("giao_vien") || role.includes("admin")) return "gvcn";
  if (role.includes("lop_truong")) return "lop_truong";
  if (role.includes("bi_thu")) return "bi_thu";
  if (role.includes("to_truong")) return "to_truong";
  return role || "hoc_sinh";
}

function seatGateTick() {
  const role = seatGateCurrentRole();
  const isAdmin = SEAT_GATE_ADMIN_ROLES.includes(role);
  document.body.classList.toggle("a3k64-seat-admin", isAdmin);
  document.body.classList.toggle("a3k64-seat-viewer", !isAdmin);
  document.body.dataset.seatingRole = role;
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
