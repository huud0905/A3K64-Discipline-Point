const SEAT_FIX_WIN = "#a3k64-seating-window";
const SEAT_FIX_STYLE = "a3k64-seat-runtime-stable-fix-style";

let seatFixTimer = 0;
let seatFixBound = false;
let seatFixToastTimer = 0;

function seatFixStyle() {
  if (document.getElementById(SEAT_FIX_STYLE)) return;
  const style = document.createElement("style");
  style.id = SEAT_FIX_STYLE;
  style.textContent = `
    ${SEAT_FIX_WIN}.seat-edit-locked .stable-seat-cell,
    ${SEAT_FIX_WIN}.seat-edit-locked .stable-seat-student-card{
      pointer-events:none!important;
      cursor:default!important;
    }
    ${SEAT_FIX_WIN}.seat-edit-locked .stable-seat-cell{
      user-select:none!important;
    }
    ${SEAT_FIX_WIN}.seat-edit-locked .stable-seat-board{
      cursor:default!important;
    }
    #a3-seat-fix-saving-toast{
      position:fixed;
      left:50%;
      top:74px;
      transform:translateX(-50%);
      z-index:1000000;
      display:flex;
      align-items:center;
      gap:10px;
      padding:10px 14px;
      border:1px solid rgba(20,184,166,.65);
      border-radius:16px;
      background:rgba(15,23,42,.96);
      color:#f8fafc;
      box-shadow:0 22px 68px rgba(0,0,0,.36);
      font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",Arial,sans-serif;
      font-size:14px;
      font-weight:900;
      pointer-events:none;
    }
    #a3-seat-fix-saving-toast .spin{
      width:15px;
      height:15px;
      border-radius:999px;
      border:2px solid rgba(255,255,255,.28);
      border-top-color:#5eead4;
      animation:a3SeatFixSpin .72s linear infinite;
      flex:0 0 auto;
    }
    body:has(.win-root.theme-light) #a3-seat-fix-saving-toast{
      background:rgba(255,255,255,.985)!important;
      color:#0f172a!important;
      border-color:rgba(20,184,166,.72)!important;
      box-shadow:0 20px 58px rgba(15,23,42,.18)!important;
    }
    body:has(.win-root.theme-light) #a3-seat-fix-saving-toast .spin{
      border-color:rgba(15,23,42,.16)!important;
      border-top-color:var(--desktop-accent,#14b8a6)!important;
    }
    @keyframes a3SeatFixSpin{to{transform:rotate(360deg)}}
  `;
  document.head.appendChild(style);
}

function seatFixEditOn() {
  const button = document.querySelector<HTMLElement>(`${SEAT_FIX_WIN} [data-tool='edit']`);
  if (!button) return false;
  return button.classList.contains("primary") || /đang\s*sửa/i.test(button.textContent || "");
}

function seatFixSyncEdit() {
  const win = document.querySelector<HTMLElement>(SEAT_FIX_WIN);
  if (!win) return;
  const on = seatFixEditOn();
  win.classList.toggle("seat-edit-locked", !on);
  win.querySelectorAll<HTMLElement>(".stable-seat-cell,.stable-seat-student-card").forEach((node) => {
    node.draggable = on && !node.classList.contains("empty") && node.textContent?.trim() !== "Trống";
    if (!on) node.classList.remove("drag-over");
  });
}

function seatFixBlockWhenLocked(event: Event) {
  const target = event.target as HTMLElement | null;
  if (!target?.closest?.(SEAT_FIX_WIN)) return;
  if (seatFixEditOn()) return;
  if (!target.closest(".stable-seat-cell,.stable-seat-student-card")) return;
  event.preventDefault();
  event.stopPropagation();
  if ("stopImmediatePropagation" in event) event.stopImmediatePropagation();
}

function seatFixShowSavingToast() {
  seatFixStyle();
  clearTimeout(seatFixToastTimer);
  document.getElementById("a3-seat-fix-saving-toast")?.remove();
  const toast = document.createElement("div");
  toast.id = "a3-seat-fix-saving-toast";
  toast.innerHTML = `<span class="spin"></span><span>Đang lưu sơ đồ...</span>`;
  document.body.appendChild(toast);
  seatFixToastTimer = window.setTimeout(() => toast.remove(), 10000);
}

function seatFixBind() {
  if (seatFixBound) return;
  seatFixBound = true;
  ["dragstart", "dragover", "drop", "contextmenu", "pointerdown"].forEach((type) => {
    document.addEventListener(type, seatFixBlockWhenLocked, true);
  });
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const save = target?.closest?.(`${SEAT_FIX_WIN} .seat-ctrl-btn.primary`) as HTMLElement | null;
    if (save && /lưu\s*sơ\s*đồ/i.test(save.textContent || "")) seatFixShowSavingToast();
  }, true);
  window.addEventListener("a3k64:seating-changed", () => {
    window.setTimeout(() => document.getElementById("a3-seat-fix-saving-toast")?.remove(), 250);
  });
}

function seatFixTick() {
  seatFixStyle();
  seatFixSyncEdit();
}

function bootSeatRuntimeStableFix() {
  seatFixBind();
  seatFixTick();
  if (!seatFixTimer) seatFixTimer = window.setInterval(seatFixTick, 500);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootSeatRuntimeStableFix);
else bootSeatRuntimeStableFix();

export {};
