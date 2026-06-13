const SEAT_ACCESS_FIX_WINDOW = "#a3k64-seating-window";
const SEAT_ACCESS_FIX_STYLE_ID = "a3k64-seat-access-overlay-fix-style";

function injectSeatAccessOverlayFixStyle() {
  if (document.getElementById(SEAT_ACCESS_FIX_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SEAT_ACCESS_FIX_STYLE_ID;
  style.textContent = `
    html.a3-seat-viewer-checking ${SEAT_ACCESS_FIX_WINDOW}::after,
    html.a3-seat-viewer-denied ${SEAT_ACCESS_FIX_WINDOW}::after{
      content:none!important;
      display:none!important;
      pointer-events:none!important;
    }
    html.a3-seat-viewer-checking ${SEAT_ACCESS_FIX_WINDOW} .stable-seat-tools,
    html.a3-seat-viewer-denied ${SEAT_ACCESS_FIX_WINDOW} .stable-seat-tools,
    html.a3-seat-viewer-checking ${SEAT_ACCESS_FIX_WINDOW} .stable-seat-student-panel,
    html.a3-seat-viewer-denied ${SEAT_ACCESS_FIX_WINDOW} .stable-seat-student-panel{
      visibility:visible!important;
      opacity:1!important;
      pointer-events:auto!important;
    }
    html.a3-seat-viewer-checking ${SEAT_ACCESS_FIX_WINDOW} .stable-seat-board,
    html.a3-seat-viewer-denied ${SEAT_ACCESS_FIX_WINDOW} .stable-seat-board{
      visibility:visible!important;
      opacity:1!important;
      pointer-events:none!important;
      position:relative!important;
    }
    html.a3-seat-viewer-checking ${SEAT_ACCESS_FIX_WINDOW} .stable-seat-board::after,
    html.a3-seat-viewer-denied ${SEAT_ACCESS_FIX_WINDOW} .stable-seat-board::after{
      white-space:pre-line;
      content:attr(data-seat-gate-message);
      position:absolute;
      inset:0;
      z-index:80;
      display:flex;
      align-items:center;
      justify-content:center;
      text-align:center;
      padding:24px;
      border-radius:8px;
      background:rgba(255,255,255,.985);
      color:#0f172a;
      font-weight:1000;
      font-size:18px;
      line-height:1.5;
      box-shadow:inset 0 0 0 1px #cbd5e1;
    }
    .theme-dark html.a3-seat-viewer-checking ${SEAT_ACCESS_FIX_WINDOW} .stable-seat-board::after,
    .theme-dark html.a3-seat-viewer-denied ${SEAT_ACCESS_FIX_WINDOW} .stable-seat-board::after,
    html.a3-overlay-dark.a3-seat-viewer-checking ${SEAT_ACCESS_FIX_WINDOW} .stable-seat-board::after,
    html.a3-overlay-dark.a3-seat-viewer-denied ${SEAT_ACCESS_FIX_WINDOW} .stable-seat-board::after{
      background:rgba(15,23,42,.985);
      color:#f8fafc;
      box-shadow:inset 0 0 0 1px #334155;
    }
    html.a3-seat-viewer-readonly ${SEAT_ACCESS_FIX_WINDOW} .stable-seat-tools,
    html.a3-seat-viewer-readonly ${SEAT_ACCESS_FIX_WINDOW} .seat-ctrl-select,
    html.a3-seat-viewer-readonly ${SEAT_ACCESS_FIX_WINDOW} .seat-ctrl-trigger,
    html.a3-seat-viewer-readonly ${SEAT_ACCESS_FIX_WINDOW} .seat-ctrl-option{
      visibility:visible!important;
      opacity:1!important;
      pointer-events:auto!important;
    }
    html.a3-seat-viewer-readonly ${SEAT_ACCESS_FIX_WINDOW} .seat-ctrl-select{
      display:block!important;
    }
  `;
  document.head.appendChild(style);
}

function syncSeatAccessOverlayMessage() {
  const win = document.querySelector<HTMLElement>(SEAT_ACCESS_FIX_WINDOW);
  const board = document.querySelector<HTMLElement>(`${SEAT_ACCESS_FIX_WINDOW} .stable-seat-board`);
  if (!win || !board) return;
  board.dataset.seatGateMessage = win.dataset.seatGateMessage || "Sơ đồ chỗ ngồi đang ở chế độ riêng tư.";
}

function bootSeatAccessOverlayFix() {
  injectSeatAccessOverlayFixStyle();
  syncSeatAccessOverlayMessage();
  const observer = new MutationObserver(syncSeatAccessOverlayMessage);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  const bodyObserver = new MutationObserver(syncSeatAccessOverlayMessage);
  bodyObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-seat-gate-message", "class"] });
  window.addEventListener("a3k64:seating-changed", () => setTimeout(syncSeatAccessOverlayMessage, 80));
  window.setInterval(syncSeatAccessOverlayMessage, 1200);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootSeatAccessOverlayFix);
else bootSeatAccessOverlayFix();

export {};
