const SEATING_CONTROLS_STYLE_ID = "a3k64-seating-window-controls-polish";
const SEATING_WINDOW_SELECTOR = "#a3k64-seating-window";

function minimizeIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" aria-hidden="true"><path d="M6 18h12"/></svg>`;
}

function maximizeIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="m21 3-7 7"/><path d="M9 21H3v-6"/><path d="m3 21 7-7"/></svg>`;
}

function restoreIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M3 3l7 7"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/><path d="M21 21l-7-7"/></svg>`;
}

function closeIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6 6 18"/></svg>`;
}

function injectControlsStyle() {
  if (document.getElementById(SEATING_CONTROLS_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SEATING_CONTROLS_STYLE_ID;
  style.textContent = `
    ${SEATING_WINDOW_SELECTOR} .a3-seat-titlebar{height:46px!important;}
    ${SEATING_WINDOW_SELECTOR} .a3-seat-actions{display:flex!important;align-items:stretch!important;height:46px!important;cursor:default!important;gap:0!important;padding:0!important;}
    ${SEATING_WINDOW_SELECTOR} .a3-seat-actions button{width:46px!important;height:46px!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;color:#0f172a!important;display:grid!important;place-items:center!important;line-height:1!important;}
    .theme-dark ${SEATING_WINDOW_SELECTOR} .a3-seat-actions button{color:#e2e8f0!important;}
    ${SEATING_WINDOW_SELECTOR} .a3-seat-actions button:hover{background:rgba(15,23,42,.08)!important;}
    .theme-dark ${SEATING_WINDOW_SELECTOR} .a3-seat-actions button:hover{background:#172033!important;}
    ${SEATING_WINDOW_SELECTOR} .a3-seat-actions button svg{width:16px!important;height:16px!important;stroke-width:2.25!important;}
    ${SEATING_WINDOW_SELECTOR} .a3-seat-actions button.danger{width:32px!important;height:32px!important;min-width:32px!important;min-height:32px!important;margin:7px 8px 7px 0!important;border-radius:9px!important;background:rgba(239,68,68,.92)!important;color:#fff!important;}
    ${SEATING_WINDOW_SELECTOR} .a3-seat-actions button.danger:hover{background:#dc2626!important;}
  `;
  document.head.appendChild(style);
}

function syncControls() {
  const win = document.querySelector<HTMLElement>(SEATING_WINDOW_SELECTOR);
  if (!win) return;
  const min = win.querySelector<HTMLElement>('[data-action="minimize"]');
  const max = win.querySelector<HTMLElement>('[data-action="maximize"]');
  const close = win.querySelector<HTMLElement>('[data-action="close"]');
  if (min && min.dataset.polished !== "1") {
    min.innerHTML = minimizeIcon();
    min.dataset.polished = "1";
  }
  if (close && close.dataset.polished !== "1") {
    close.innerHTML = closeIcon();
    close.dataset.polished = "1";
  }
  if (max) {
    const shouldRestore = win.classList.contains("maximized");
    const mode = shouldRestore ? "restore" : "maximize";
    if (max.dataset.polishedMode !== mode) {
      max.innerHTML = shouldRestore ? restoreIcon() : maximizeIcon();
      max.dataset.polishedMode = mode;
    }
  }
}

function bootSeatingWindowControlsPolish() {
  injectControlsStyle();
  syncControls();
  const observer = new MutationObserver(syncControls);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootSeatingWindowControlsPolish);
else bootSeatingWindowControlsPolish();
