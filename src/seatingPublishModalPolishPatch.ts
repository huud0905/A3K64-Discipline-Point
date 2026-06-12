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
    .seat-access-modal *{
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", "Helvetica Neue", Arial, sans-serif !important;
      letter-spacing: 0 !important;
      text-rendering: geometricPrecision;
    }

    .seat-access-modal-backdrop{
      background: rgba(2, 6, 23, .46) !important;
    }

    .seat-access-modal{
      border-radius: 24px !important;
      background: linear-gradient(180deg, #0f172a, #111827) !important;
      border-color: rgba(148, 163, 184, .28) !important;
    }

    .seat-access-modal h3{
      font-weight: 1000 !important;
      color: #f8fafc !important;
    }

    .seat-access-label{
      color: #f8fafc !important;
      font-weight: 950 !important;
    }

    .seat-access-label input,
    .seat-access-label select,
    .seat-access-label textarea{
      min-height: 44px !important;
      border-radius: 15px !important;
      border-color: rgba(148, 163, 184, .35) !important;
      background: #111827 !important;
      color: #f8fafc !important;
      font-weight: 850 !important;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.04) !important;
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

    .seat-access-label select option{
      background: #111827 !important;
      color: #f8fafc !important;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", Arial, sans-serif !important;
      font-weight: 850 !important;
    }

    .seat-access-pretty-select{
      position: relative;
      z-index: 3;
    }

    .seat-access-pretty-select select[data-field="status"]{
      display: none !important;
    }

    .seat-access-pretty-trigger{
      width: 100%;
      height: 44px;
      border: 1px solid rgba(148, 163, 184, .35);
      border-radius: 15px;
      background: #111827;
      color: #f8fafc;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 0 13px;
      cursor: pointer;
      font-weight: 950;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
    }

    .seat-access-pretty-trigger:hover,
    .seat-access-pretty-select.open .seat-access-pretty-trigger{
      border-color: var(--desktop-accent,#14b8a6);
      box-shadow: 0 0 0 3px color-mix(in srgb,var(--desktop-accent,#14b8a6) 18%,transparent);
    }

    .seat-access-pretty-trigger svg{
      width: 16px;
      height: 16px;
      transition: transform .16s ease;
      opacity: .9;
      flex: 0 0 auto;
    }

    .seat-access-pretty-select.open .seat-access-pretty-trigger svg{
      transform: rotate(180deg);
    }

    .seat-access-pretty-menu{
      position: absolute;
      left: 0;
      right: 0;
      top: calc(100% + 7px);
      display: none;
      gap: 5px;
      padding: 7px;
      border: 1px solid rgba(148, 163, 184, .32);
      border-radius: 16px;
      background: #1f2937;
      box-shadow: 0 24px 70px rgba(0,0,0,.38);
      overflow: hidden;
    }

    .seat-access-pretty-select.open .seat-access-pretty-menu{
      display: grid;
    }

    .seat-access-pretty-option{
      height: 36px;
      border: 0;
      border-radius: 11px;
      background: transparent;
      color: #f8fafc;
      text-align: left;
      padding: 0 12px;
      font-weight: 900;
      cursor: pointer;
    }

    .seat-access-pretty-option:hover{
      background: #334155;
    }

    .seat-access-pretty-option.active{
      background: #475569;
      color: #fff;
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
    body:not(.theme-dark) .seat-access-label select,
    body:not(.theme-dark) .seat-access-label textarea,
    body:not(.theme-dark) .seat-access-actions button,
    .theme-light .seat-access-label input,
    .theme-light .seat-access-label select,
    .theme-light .seat-access-label textarea,
    .theme-light .seat-access-actions button,
    .a3-overlay-light .seat-access-label input,
    .a3-overlay-light .seat-access-label select,
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
      background: #ffffff;
      color: #0f172a;
      border-color: #cbd5e1;
      box-shadow: inset 0 1px 0 rgba(15,23,42,.03), 0 10px 24px rgba(15,23,42,.08);
    }

    body:not(.theme-dark) .seat-access-pretty-menu,
    .theme-light .seat-access-pretty-menu,
    .a3-overlay-light .seat-access-pretty-menu{
      background: #ffffff;
      border-color: #cbd5e1;
      box-shadow: 0 22px 62px rgba(15,23,42,.18);
    }

    body:not(.theme-dark) .seat-access-pretty-option,
    .theme-light .seat-access-pretty-option,
    .a3-overlay-light .seat-access-pretty-option{
      color: #0f172a;
    }

    body:not(.theme-dark) .seat-access-pretty-option:hover,
    .theme-light .seat-access-pretty-option:hover,
    .a3-overlay-light .seat-access-pretty-option:hover{
      background: #e2e8f0;
    }

    body:not(.theme-dark) .seat-access-pretty-option.active,
    .theme-light .seat-access-pretty-option.active,
    .a3-overlay-light .seat-access-pretty-option.active{
      background: #dbeafe;
      color: #0f172a;
    }
  `;
  document.head.appendChild(style);
}

function buildSeatAccessPrettySelect(select: HTMLSelectElement) {
  if (select.closest(".seat-access-pretty-select")) return;
  const wrapper = document.createElement("div");
  wrapper.className = "seat-access-pretty-select";
  const label = SEAT_MODAL_VALUES[select.value] || select.options[select.selectedIndex]?.textContent || "Riêng tư";
  wrapper.innerHTML = `
    <button type="button" class="seat-access-pretty-trigger"><span>${label}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button>
    <div class="seat-access-pretty-menu">
      ${Array.from(select.options).map((option) => `<button type="button" class="seat-access-pretty-option ${option.value === select.value ? "active" : ""}" data-value="${option.value}">${option.textContent || option.value}</button>`).join("")}
    </div>
  `;
  select.parentElement?.insertBefore(wrapper, select);
  wrapper.appendChild(select);

  const trigger = wrapper.querySelector<HTMLButtonElement>(".seat-access-pretty-trigger");
  const text = wrapper.querySelector<HTMLElement>(".seat-access-pretty-trigger span");
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
      select.value = button.dataset.value || select.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      if (text) text.textContent = SEAT_MODAL_VALUES[select.value] || button.textContent || select.value;
      wrapper.querySelectorAll(".seat-access-pretty-option").forEach((node) => node.classList.remove("active"));
      button.classList.add("active");
      wrapper.classList.remove("open");
    });
  });
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
  }, 300);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootSeatAccessModalPolish);
else bootSeatAccessModalPolish();
