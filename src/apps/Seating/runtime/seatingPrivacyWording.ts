const SPW_WIN = "#a3k64-seating-window";
const SPW_PRIVATE_TEXT = "Sơ đồ chỗ ngồi đang ở chế độ riêng tư.";
let spwTimer = 0;

function spwApplyPrivateWording() {
  const root = document.documentElement;
  const win = document.querySelector<HTMLElement>(SPW_WIN);
  if (!win) return;
  if (!root.classList.contains("a3-seat-viewer-denied")) return;
  if (win.dataset.seatGateMessage !== SPW_PRIVATE_TEXT) {
    win.dataset.seatGateMessage = SPW_PRIVATE_TEXT;
  }
  const board = document.querySelector<HTMLElement>(`${SPW_WIN} .stable-seat-board`);
  if (board && board.dataset.seatGateMessage !== SPW_PRIVATE_TEXT) {
    board.dataset.seatGateMessage = SPW_PRIVATE_TEXT;
  }
}

function spwBoot() {
  spwApplyPrivateWording();
  if (!spwTimer) spwTimer = window.setInterval(spwApplyPrivateWording, 350);
  window.addEventListener("a3k64:seating-changed", () => setTimeout(spwApplyPrivateWording, 80));
  window.addEventListener("a3k64:seating-access-updated", () => setTimeout(spwApplyPrivateWording, 80));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", spwBoot);
else spwBoot();

export {};
