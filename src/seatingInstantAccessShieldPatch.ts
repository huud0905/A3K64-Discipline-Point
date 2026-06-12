const SEAT_SHIELD_STYLE_ID = "a3k64-instant-seat-access-shield";

function injectInstantSeatShield() {
  document.documentElement.classList.add("a3-seat-access-pending-hard");
  if (document.getElementById(SEAT_SHIELD_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SEAT_SHIELD_STYLE_ID;
  style.textContent = `
    html.a3-seat-access-pending-hard #a3k64-seating-window:not(.seat-locked):not(.seat-view-only):not(.seat-edit-allowed) .stable-seat-board,
    html.a3-seat-access-pending-hard #a3k64-seating-window:not(.seat-locked):not(.seat-view-only):not(.seat-edit-allowed) .stable-seat-student-panel,
    html.a3-seat-access-pending-hard #a3k64-seating-window:not(.seat-locked):not(.seat-view-only):not(.seat-edit-allowed) .stable-seat-tools {
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }

    html.a3-seat-access-pending-hard #a3k64-seating-window:not(.seat-locked):not(.seat-view-only):not(.seat-edit-allowed)::after {
      content: "Đang kiểm tra quyền xem...";
      position: absolute;
      inset: 76px 22px 22px;
      z-index: 80;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid #cbd5e1;
      border-radius: 22px;
      background: rgba(255,255,255,.98);
      color: #0f172a;
      font-weight: 1000;
      font-size: 18px;
      box-shadow: 0 24px 70px rgba(15,23,42,.16);
    }

    .theme-dark html.a3-seat-access-pending-hard #a3k64-seating-window:not(.seat-locked):not(.seat-view-only):not(.seat-edit-allowed)::after,
    html.a3-overlay-dark.a3-seat-access-pending-hard #a3k64-seating-window:not(.seat-locked):not(.seat-view-only):not(.seat-edit-allowed)::after,
    .theme-dark #a3k64-seating-window:not(.seat-locked):not(.seat-view-only):not(.seat-edit-allowed)::after {
      border-color: #334155;
      background: rgba(15,23,42,.98);
      color: #f8fafc;
      box-shadow: 0 24px 80px rgba(0,0,0,.36);
    }

    #a3k64-seating-window.seat-locked .stable-seat-board,
    #a3k64-seating-window.seat-locked .stable-seat-student-panel,
    #a3k64-seating-window.seat-locked .stable-seat-tools {
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }

    #a3k64-seating-window.seat-locked .seat-lock-panel {
      background: rgba(255,255,255,.985) !important;
      backdrop-filter: none !important;
      color: #0f172a !important;
      z-index: 90 !important;
    }

    .theme-dark #a3k64-seating-window.seat-locked .seat-lock-panel,
    .a3-overlay-dark #a3k64-seating-window.seat-locked .seat-lock-panel {
      background: rgba(15,23,42,.985) !important;
      color: #e2e8f0 !important;
    }

    #a3k64-seating-window.seat-locked .seat-lock-title {
      color: inherit !important;
    }
  `;
  document.head.appendChild(style);
}

function watchSeatShieldReady() {
  const tick = () => {
    const win = document.querySelector("#a3k64-seating-window");
    if (!win) return;
    if (win.classList.contains("seat-locked") || win.classList.contains("seat-view-only") || win.classList.contains("seat-edit-allowed")) {
      document.documentElement.classList.remove("a3-seat-access-pending-hard");
    }
  };
  tick();
  const timer = window.setInterval(tick, 120);
  window.setTimeout(() => window.clearInterval(timer), 15000);
}

injectInstantSeatShield();
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watchSeatShieldReady);
else watchSeatShieldReady();

export {};
