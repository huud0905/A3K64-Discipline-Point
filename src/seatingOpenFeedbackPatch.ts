const SEAT_OPEN_FEEDBACK_WINDOW = "#a3k64-seating-window";
const SEAT_OPEN_FEEDBACK_STYLE_ID = "a3k64-seat-open-feedback-style";
const SEAT_OPEN_FEEDBACK_TOAST_ID = "a3k64-seat-opening-toast";

let seatOpenFeedbackTimer = 0;

function injectSeatOpenFeedbackStyle() {
  if (document.getElementById(SEAT_OPEN_FEEDBACK_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SEAT_OPEN_FEEDBACK_STYLE_ID;
  style.textContent = `
    ${SEAT_OPEN_FEEDBACK_WINDOW} .seat-ctrl-select{
      min-width:190px!important;
      z-index:260!important;
    }
    ${SEAT_OPEN_FEEDBACK_WINDOW} .seat-ctrl-menu{
      min-height:104px!important;
      padding:8px!important;
      padding-bottom:10px!important;
      overflow:visible!important;
    }
    ${SEAT_OPEN_FEEDBACK_WINDOW} .seat-ctrl-option{
      height:39px!important;
      border-radius:12px!important;
    }
    .seat-pub-lite-modal{
      width:min(650px,100%)!important;
    }
    #${SEAT_OPEN_FEEDBACK_TOAST_ID}{
      position:fixed;
      left:50%;
      top:72px;
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
    #${SEAT_OPEN_FEEDBACK_TOAST_ID} .seat-open-spin{
      width:15px;
      height:15px;
      border-radius:999px;
      border:2px solid rgba(255,255,255,.28);
      border-top-color:#5eead4;
      animation:a3SeatOpeningSpin .72s linear infinite;
      flex:0 0 auto;
    }
    #${SEAT_OPEN_FEEDBACK_TOAST_ID}.done .seat-open-spin{
      animation:none;
      border-color:#5eead4;
      background:#5eead4;
      box-shadow:inset 0 0 0 4px rgba(15,23,42,.96);
    }
    @keyframes a3SeatOpeningSpin{to{transform:rotate(360deg)}}
  `;
  document.head.appendChild(style);
}

function showSeatOpeningToast(message: string, done = false) {
  injectSeatOpenFeedbackStyle();
  clearTimeout(seatOpenFeedbackTimer);
  document.getElementById(SEAT_OPEN_FEEDBACK_TOAST_ID)?.remove();
  const toast = document.createElement("div");
  toast.id = SEAT_OPEN_FEEDBACK_TOAST_ID;
  if (done) toast.classList.add("done");
  toast.innerHTML = `<span class="seat-open-spin"></span><span>${message}</span>`;
  document.body.appendChild(toast);
  seatOpenFeedbackTimer = window.setTimeout(() => toast.remove(), done ? 950 : 12000);
}

function bootSeatOpenFeedbackPatch() {
  injectSeatOpenFeedbackStyle();

  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const option = target?.closest?.(`${SEAT_OPEN_FEEDBACK_WINDOW} .seat-ctrl-option`) as HTMLElement | null;
    if (!option) return;
    const title = (option.textContent || "sơ đồ").trim();
    showSeatOpeningToast(`Đang mở ${title}...`);
  }, true);

  window.addEventListener("a3k64:seating-changed", () => {
    const active = document.querySelector<HTMLElement>(`${SEAT_OPEN_FEEDBACK_WINDOW} .seat-ctrl-trigger span`)?.textContent?.trim() || "sơ đồ";
    showSeatOpeningToast(`Đã mở ${active}.`, true);
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootSeatOpenFeedbackPatch);
else bootSeatOpenFeedbackPatch();

export {};
