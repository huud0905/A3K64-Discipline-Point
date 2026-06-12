const SEAT_MODAL_STYLE_ID = "a3k64-seating-publish-modal-polish";
const SEAT_MODAL_VALUES: Record<string, string> = {
  private: "Riêng tư",
  preview: "Xem trước",
  published: "Công bố ngay",
};
let seatModalLoop = 0;
let seatModalCount = 0;
let seatModalBound = false;

function injectSeatModalPolishStyle() {
  if (document.getElementById(SEAT_MODAL_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SEAT_MODAL_STYLE_ID;
  style.textContent = `
    .seat-access-modal,
    .seat-access-modal *,
    .seat-access-modal-backdrop,
    .seat-access-modal-backdrop *{
      font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", "Helvetica Neue", Arial, sans-serif !important;
      letter-spacing: 0 !important;
      text-rendering: geometricPrecision !important;
    }

    .seat-access-modal-backdrop{
      background: rgba(2, 6, 23, .46) !important;
    }

    .seat-access-modal{
      border-radius: 24px !important;
      background: linear-gradient(180deg, #0f172a, #111827) !important;
      border: 1px solid rgba(148, 163, 184, .28) !important;
      color: #e2e8f0 !important;
    }

    .seat-access-modal h3{
      font-weight: 1000 !important;
      color: #f8fafc !important;
    }

    .seat-access-modal p{
      color: #94a3b8 !important;
    }

    .seat-access-label{
      color: #f8fafc !important;
      font-weight: 950 !important;
    }

    .seat-access-label input,
    .seat-access-label textarea{
      min-height: 44px !important;
      border-radius: 15px !important;
      border: 1px solid rgba(148, 163, 184, .35) !important;
      background: #111827 !important;
      color: #f8fafc !important;
      font-weight: 850 !important;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.04) !important;
      outline: none !important;
    }

    .seat-access-label textarea{
      line-height: 1.45 !important;
      font-weight: 760 !important;
    }

    .seat-access-label input::placeholder,
    .seat-access-label textarea::placeholder{
      color: #94a3b8 !important;
      opacity: 1 !important;
    }

    .seat-access-modal select[data-field="status"]{
      display: none !important;
      opacity: 0 !important;
      pointer-events: none !important;
      width: 0 !important;
      height: 0 !important;
      min-height: 0 !important;
      padding: 0 !important;
      margin: 0 !important;
      border: 0 !important;
      position: absolute !important;
    }

    .seat-access-pretty-select{
      position: relative !important;
      z-index: 20 !important;
      width: 100% !important;
      display: block !important;
      margin-top: 6px !important;
    }

    .seat-access-pretty-trigger{
      width: 100% !important;
      height: 44px !important;
      border: 1px solid rgba(148, 163, 184, .35) !important;
      border-radius: 15px !important;
      background: #111827 !important;
      color: #f8fafc !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      gap: 12px !important;
      padding: 0 13px !important;
      cursor: pointer !important;
      font-weight: 950 !important;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.04) !important;
      outline: none !important;
    }

    .seat-access-pretty-trigger:hover,
    .seat-access-pretty-trigger:focus,
    .seat-access-pretty-select.open .seat-access-pretty-trigger{
      border-color: var(--desktop-accent,#14b8a6) !important;
      box-shadow: 0 0 0 3px color-mix(in srgb,var(--desktop-accent,#14b8a6) 18%,transparent) !important;
    }

    .seat-access-pretty-trigger svg{
      width: 16px !important;
      height: 16px !important;
      transition: transform .16s ease !important;
      opacity: .9 !important;
      flex: 0 0 auto !important;
    }

    .seat-access-pretty-select.open .seat-access-pretty-trigger svg{
      transform: rotate(180deg) !important;
    }

    .seat-access-pretty-menu{
      position: absolute !important;
      left: 0 !important;
      right: 0 !important;
      top: calc(100% + 7px) !important;
      display: none !important;
      gap: 5px !important;
      padding: 7px !important;
      border: 1px solid rgba(148, 163, 184, .32) !important;
      border-radius: 16px !important;
      background: #1f2937 !important;
      box-shadow: 0 24px 70px rgba(0,0,0,.38) !important;
      overflow: hidden !important;
      z-index: 999999 !important;
    }

    .seat-access-pretty-select.open .seat-access-pretty-menu{
      display: grid !important;
    }

    .seat-access-pretty-option{
      height: 36px !important;
      border: 0 !important;
      border-radius: 11px !important;
      background: transparent !important;
      color: #f8fafc !important;
      text-align: left !important;
      padding: 0 12px !important;
      font-weight: 900 !important;
      cursor: pointer !important;
    }

    .seat-access-pretty-option:hover{
      background: #334155 !important;
    }

    .seat-access-pretty-option.active{
      background: #475569 !important;
      color: #fff !important;
    }

    .seat-access-actions button{
      font-weight: 1000 !important;
    }

    body:not(.theme-dark) .seat-access-modal-backdrop,
    .theme-light .seat-access-modal-backdrop,
    .a3-overlay-light .seat-access-modal-backdrop{
      background: rgba(15, 23, 42, .24) !important;
    }

    body:not(.theme-dark) .seat-access-modal,
    .theme-light .seat-access-modal,
    .a3-overlay-light .seat-access-modal{
      background: rgba(255,255,255,.97) !important;
      color: #0f172a !important;
      border-color: #d7e2ee !important;
      box-shadow: 0 28px 90px rgba(15,23,42,.18) !important;
    }

    body:not(.theme-dark) .seat-access-modal h3,
    .theme-light .seat-access-modal h3,
    .a3-overlay-light .seat-access-modal h3,
    body:not(.theme-dark) .seat-access-label,
    .theme-light .seat-access-label,
    .a3-overlay-light .seat-access-label{
      color: #0f172a !important;
    }

    body:not(.theme-dark) .seat-access-modal p,
    .theme-light .seat-access-modal p,
    .a3-overlay-light .seat-access-modal p{
      color: #64748b !important;
    }

    body:not(.theme-dark) .seat-access-label input,
    body:not(.theme-dark) .seat-access-label textarea,
    body:not(.theme-dark) .seat-access-actions button,
    .theme-light .seat-access-label input,
    .theme-light .seat-access-label textarea,
    .theme-light .seat-access-actions button,
    .a3-overlay-light .seat-access-label input,
    .a3-overlay-light .seat-access-label textarea,
    .a3-overlay-light .seat-access-actions button{
      background: #ffffff !important;
      color: #0f172a !important;
      border-color: #cbd5e1 !important;
      box-shadow: inset 0 1px 0 rgba(15,23,42,.03) !important;
    }

    body:not(.theme-dark) .seat-access-label input::placeholder,
    body:not(.theme-dark) .seat-access-label textarea::placeholder,
    .theme-light .seat-access-label input::placeholder,
    .theme-light .seat-access-label textarea::placeholder,
    .a3-overlay-light .seat-access-label input::placeholder,
    .a3-overlay-light .seat-access-label textarea::placeholder{
      color: #64748b !important;
    }

    body:not(.theme-dark) .seat-access-pretty-trigger,
    .theme-light .seat-access-pretty-trigger,
    .a3-overlay-light .seat-access-pretty-trigger{
      background: #ffffff !important;
      color: #0f172a !important;
      border-color: #cbd5e1 !important;
      box-shadow: inset 0 1px 0 rgba(15,23,42,.03), 0 10px 24px rgba(15,23,42,.08) !important;
    }

    body:not(.theme-dark) .seat-access-pretty-menu,
    .theme-light .seat-access-pretty-menu,
    .a3-overlay-light .seat-access-pretty-menu{
      background: #ffffff !important;
      border-color: #cbd5e1 !important;
      box-shadow: 0 22px 62px rgba(15,23,42,.18) !important;
    }

    body:not(.theme-dark) .seat-access-pretty-option,
    .theme-light .seat-access-pretty-option,
    .a3-overlay-light .seat-access-pretty-option{
      color: #0f172a !important;
    }

    body:not(.theme-dark) .seat-access-pretty-option:hover,
    .theme-light .seat-access-pretty-option:hover,
    .a3-overlay-light .seat-access-pretty-option:hover{
      background: #e2e8f0 !important;
    }

    body:not(.theme-dark) .seat-access-pretty-option.active,
    .theme-light .seat-access-pretty-option.active,
    .a3-overlay-light .seat-access-pretty-option.active{
      background: #dbeafe !important;
      color: #0f172a !important;
    }
  `;
  document.head.appendChild(style);
}

function seatModalLabel(value: string) {
  return SEAT_MODAL_VALUES[value] || "Riêng tư";
}

function buildSeatAccessPrettySelect(select: HTMLSelectElement) {
  const parent = select.parentElement;
  if (!parent || parent.querySelector(".seat-access-pretty-select")) return;

  const wrapper = document.createElement("div");
  wrapper.className = "seat-access-pretty-select";
  wrapper.innerHTML = `
    <button type="button" class="seat-access-pretty-trigger"><span>${seatModalLabel(select.value)}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button>
    <div class="seat-access-pretty-menu">
      <button type="button" class="seat-access-pretty-option" data-value="private">Riêng tư</button>
      <button type="button" class="seat-access-pretty-option" data-value="preview">Xem trước</button>
      <button type="button" class="seat-access-pretty-option" data-value="published">Công bố ngay</button>
    </div>
  `;
  parent.insertBefore(wrapper, select.nextSibling);

  const trigger = wrapper.querySelector<HTMLButtonElement>(".seat-access-pretty-trigger");
  const text = wrapper.querySelector<HTMLElement>(".seat-access-pretty-trigger span");
  const sync = () => {
    if (text) text.textContent = seatModalLabel(select.value);
    wrapper.querySelectorAll<HTMLButtonElement>(".seat-access-pretty-option").forEach((button) => {
      button.classList.toggle("active", button.dataset.value === select.value);
    });
  };
  sync();

  trigger?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    document.querySelectorAll(".seat-access-pretty-select.open").forEach((node) => {
      if (node !== wrapper) node.classList.remove("open");
    });
    wrapper.classList.toggle("open");
  });

  wrapper.querySelectorAll<HTMLButtonElement>(".seat-access-pretty-option").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      select.value = button.dataset.value || "private";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      sync();
      wrapper.classList.remove("open");
    });
  });

  select.addEventListener("change", sync);
}

function polishSeatAccessModal() {
  injectSeatModalPolishStyle();
  const select = document.querySelector<HTMLSelectElement>(".seat-access-modal select[data-field='status']");
  if (select) buildSeatAccessPrettySelect(select);
}

function bootSeatAccessModalPolish() {
  polishSeatAccessModal();
  if (!seatModalBound) {
    seatModalBound = true;
    document.addEventListener("click", (event) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest?.(".seat-access-pretty-select")) {
        document.querySelectorAll(".seat-access-pretty-select.open").forEach((node) => node.classList.remove("open"));
      }
    }, true);
  }
  seatModalLoop = window.setInterval(() => {
    polishSeatAccessModal();
    seatModalCount += 1;
    if (seatModalCount > 260 && seatModalLoop) {
      clearInterval(seatModalLoop);
      seatModalLoop = 0;
    }
  }, 200);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootSeatAccessModalPolish);
else bootSeatAccessModalPolish();
