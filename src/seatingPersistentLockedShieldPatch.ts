const PERSIST_SEAT_STYLE_ID = "a3k64-persistent-seat-lock-shield";
const PERSIST_SEAT_LOCK_KEY = "a3k64-seating-known-locked-v1";

function addPersistentLockClass() {
  try {
    if (localStorage.getItem(PERSIST_SEAT_LOCK_KEY) === "1") {
      document.documentElement.classList.add("a3-seat-known-locked-hard");
    }
  } catch {}
}

function injectPersistentLockStyle() {
  addPersistentLockClass();
  if (document.getElementById(PERSIST_SEAT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = PERSIST_SEAT_STYLE_ID;
  style.textContent = `
    html.a3-seat-known-locked-hard #a3k64-seating-window:not(.seat-view-only):not(.seat-edit-allowed) .stable-seat-board,
    html.a3-seat-known-locked-hard #a3k64-seating-window:not(.seat-view-only):not(.seat-edit-allowed) .stable-seat-student-panel,
    html.a3-seat-known-locked-hard #a3k64-seating-window:not(.seat-view-only):not(.seat-edit-allowed) .stable-seat-tools,
    html.a3-seat-known-locked-hard #a3k64-seating-window:not(.seat-view-only):not(.seat-edit-allowed) .stable-room-window,
    html.a3-seat-known-locked-hard #a3k64-seating-window:not(.seat-view-only):not(.seat-edit-allowed) .stable-room-door {
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
      filter: none !important;
    }

    html.a3-seat-known-locked-hard #a3k64-seating-window:not(.seat-view-only):not(.seat-edit-allowed)::before {
      content: "";
      position: absolute;
      inset: 68px 18px 18px;
      z-index: 88;
      border-radius: 24px;
      border: 1px solid #cbd5e1;
      background: rgba(255,255,255,.995);
      box-shadow: 0 24px 70px rgba(15,23,42,.16);
      pointer-events: auto;
    }

    html.a3-seat-known-locked-hard #a3k64-seating-window:not(.seat-view-only):not(.seat-edit-allowed)::after {
      content: "Đang kiểm tra quyền xem...";
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      z-index: 89;
      color: #0f172a;
      font-size: 18px;
      font-weight: 1000;
      pointer-events: none;
    }

    html.a3-overlay-dark.a3-seat-known-locked-hard #a3k64-seating-window:not(.seat-view-only):not(.seat-edit-allowed)::before,
    .theme-dark html.a3-seat-known-locked-hard #a3k64-seating-window:not(.seat-view-only):not(.seat-edit-allowed)::before {
      border-color: #334155;
      background: rgba(15,23,42,.995);
      box-shadow: 0 24px 80px rgba(0,0,0,.36);
    }

    html.a3-overlay-dark.a3-seat-known-locked-hard #a3k64-seating-window:not(.seat-view-only):not(.seat-edit-allowed)::after,
    .theme-dark html.a3-seat-known-locked-hard #a3k64-seating-window:not(.seat-view-only):not(.seat-edit-allowed)::after {
      color: #f8fafc;
    }

    #a3k64-seating-window.seat-locked .stable-seat-board,
    #a3k64-seating-window.seat-locked .stable-seat-student-panel,
    #a3k64-seating-window.seat-locked .stable-seat-tools,
    #a3k64-seating-window.seat-locked .stable-room-window,
    #a3k64-seating-window.seat-locked .stable-room-door {
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
      filter: none !important;
    }

    #a3k64-seating-window.seat-locked .seat-lock-panel {
      background: rgba(255,255,255,.995) !important;
      backdrop-filter: none !important;
      z-index: 95 !important;
    }

    .theme-dark #a3k64-seating-window.seat-locked .seat-lock-panel,
    .a3-overlay-dark #a3k64-seating-window.seat-locked .seat-lock-panel {
      background: rgba(15,23,42,.995) !important;
    }
  `;
  document.head.appendChild(style);
}

function syncPersistentLockState() {
  const win = document.querySelector("#a3k64-seating-window");
  if (!win) return;
  if (win.classList.contains("seat-locked")) {
    try { localStorage.setItem(PERSIST_SEAT_LOCK_KEY, "1"); } catch {}
    document.documentElement.classList.add("a3-seat-known-locked-hard");
    return;
  }
  if (win.classList.contains("seat-view-only") || win.classList.contains("seat-edit-allowed")) {
    try { localStorage.removeItem(PERSIST_SEAT_LOCK_KEY); } catch {}
    document.documentElement.classList.remove("a3-seat-known-locked-hard");
  }
}

function bootPersistentSeatShield() {
  injectPersistentLockStyle();
  syncPersistentLockState();
  const observer = new MutationObserver(syncPersistentLockState);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  window.setInterval(syncPersistentLockState, 120);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootPersistentSeatShield);
else bootPersistentSeatShield();

export {};
