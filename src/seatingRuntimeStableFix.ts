const SEAT_FIX_WIN = "#a3k64-seating-window";
const SEAT_FIX_STYLE = "a3k64-seat-runtime-stable-fix-style";

let seatFixTimer = 0;

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

function seatFixBind() {
  ["dragstart", "dragover", "drop", "contextmenu", "pointerdown"].forEach((type) => {
    document.addEventListener(type, seatFixBlockWhenLocked, true);
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
