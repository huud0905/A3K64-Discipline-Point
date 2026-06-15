import { normalizedElementText, upsertStyleTag } from './core/dom';

const SEAT_OPEN_FEEDBACK_WINDOW = "#a3k64-seating-window";
const SEAT_OPEN_FEEDBACK_STYLE_ID = "a3k64-seat-open-feedback-style";
const SEAT_OPEN_FEEDBACK_TOAST_ID = "a3k64-seat-opening-toast";

let seatOpenFeedbackTimer = 0;

function seatOpenFeedbackWindowVisible() {
  const win = document.querySelector<HTMLElement>(SEAT_OPEN_FEEDBACK_WINDOW);
  return Boolean(win && win.offsetParent !== null);
}

function seatOpenFeedbackDock() {
  return document.querySelector<HTMLElement>("#a3-seat-notice-dock [data-notice-list]");
}

function injectSeatOpenFeedbackStyle() {
  upsertStyleTag(SEAT_OPEN_FEEDBACK_STYLE_ID, `
    ${SEAT_OPEN_FEEDBACK_WINDOW} .seat-ctrl-select{min-width:190px!important;z-index:260!important;}
    ${SEAT_OPEN_FEEDBACK_WINDOW} .seat-ctrl-menu{min-height:0!important;height:auto!important;max-height:260px!important;padding:6px!important;overflow:auto!important;}
    ${SEAT_OPEN_FEEDBACK_WINDOW} .seat-ctrl-option{height:38px!important;border-radius:12px!important;}
    ${SEAT_OPEN_FEEDBACK_WINDOW} .seat-ctrl-option:only-child{margin:0!important;}
    .seat-pub-lite-modal{width:min(650px,100%)!important;}
    #${SEAT_OPEN_FEEDBACK_TOAST_ID}{position:fixed;left:50%;top:72px;transform:translateX(-50%);z-index:1000000;display:flex;align-items:center;gap:10px;padding:10px 14px;border:1px solid rgba(20,184,166,.65);border-radius:16px;background:rgba(15,23,42,.96);color:#f8fafc;box-shadow:0 22px 68px rgba(0,0,0,.36);font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",Arial,sans-serif;font-size:14px;font-weight:900;pointer-events:none;}
    #${SEAT_OPEN_FEEDBACK_TOAST_ID}.seat-docked-toast{position:static!important;left:auto!important;top:auto!important;right:auto!important;bottom:auto!important;transform:none!important;width:100%!important;max-width:100%!important;min-height:34px!important;box-sizing:border-box!important;margin:0!important;padding:8px 7px 8px 9px!important;border-radius:13px!important;display:grid!important;grid-template-columns:auto 1fr auto!important;align-items:center!important;gap:8px!important;font-size:12px!important;font-weight:950!important;line-height:1.2!important;text-align:left!important;pointer-events:auto!important;z-index:auto!important;white-space:normal!important;background:rgba(255,255,255,.985)!important;color:#0f172a!important;box-shadow:0 8px 18px rgba(15,23,42,.08)!important;}
    #${SEAT_OPEN_FEEDBACK_TOAST_ID} .seat-open-spin{width:15px;height:15px;border-radius:999px;border:2px solid rgba(255,255,255,.28);border-top-color:#5eead4;animation:a3SeatOpeningSpin .72s linear infinite;flex:0 0 auto;}
    #${SEAT_OPEN_FEEDBACK_TOAST_ID}.seat-docked-toast .seat-open-spin{border-color:rgba(15,23,42,.14);border-top-color:var(--desktop-accent,#14b8a6);grid-column:1;}
    #${SEAT_OPEN_FEEDBACK_TOAST_ID}.done .seat-open-spin{animation:none;border-color:#5eead4;background:#5eead4;box-shadow:inset 0 0 0 4px rgba(15,23,42,.96);}
    #${SEAT_OPEN_FEEDBACK_TOAST_ID}.seat-docked-toast.done .seat-open-spin{border-color:var(--desktop-accent,#14b8a6);background:var(--desktop-accent,#14b8a6);box-shadow:inset 0 0 0 4px #fff;}
    #${SEAT_OPEN_FEEDBACK_TOAST_ID} .seat-docked-close{width:28px;height:28px;min-width:28px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:#475569;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-weight:1000;line-height:1;padding:0;pointer-events:auto!important;grid-column:3;}
    #${SEAT_OPEN_FEEDBACK_TOAST_ID} .seat-docked-close:hover{border-color:#fb7185;color:#e11d48;background:#fff1f2;}
    @keyframes a3SeatOpeningSpin{to{transform:rotate(360deg)}}
  `);
}

function showSeatOpeningToast(message: string, done = false) {
  if (!seatOpenFeedbackWindowVisible()) return;
  injectSeatOpenFeedbackStyle();
  clearTimeout(seatOpenFeedbackTimer);
  document.getElementById(SEAT_OPEN_FEEDBACK_TOAST_ID)?.remove();
  const toast = document.createElement("div");
  toast.id = SEAT_OPEN_FEEDBACK_TOAST_ID;
  if (done) toast.classList.add("done");
  toast.innerHTML = `<span class="seat-open-spin"></span><span>${message}</span>`;
  const dock = seatOpenFeedbackDock();
  if (dock) {
    toast.classList.add("seat-docked-toast");
    const close = document.createElement("button");
    close.type = "button";
    close.className = "seat-docked-close";
    close.textContent = "×";
    close.title = "Tắt thông báo";
    close.addEventListener("click", () => toast.remove());
    toast.appendChild(close);
    dock.appendChild(toast);
  } else {
    document.body.appendChild(toast);
  }
  seatOpenFeedbackTimer = window.setTimeout(() => toast.remove(), done ? 950 : 12000);
}

function bootSeatOpenFeedbackPatch() {
  injectSeatOpenFeedbackStyle();
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const option = target?.closest?.(`${SEAT_OPEN_FEEDBACK_WINDOW} .seat-ctrl-option`) as HTMLElement | null;
    if (!option) return;
    const title = normalizedElementText(option) || "sơ đồ";
    showSeatOpeningToast(`Đang mở ${title}...`);
  }, true);
  window.addEventListener("a3k64:seating-changed", () => {
    const active = normalizedElementText(document.querySelector<HTMLElement>(`${SEAT_OPEN_FEEDBACK_WINDOW} .seat-ctrl-trigger span`)) || "sơ đồ";
    showSeatOpeningToast(`Đã mở ${active}.`, true);
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootSeatOpenFeedbackPatch);
else bootSeatOpenFeedbackPatch();

export {};
