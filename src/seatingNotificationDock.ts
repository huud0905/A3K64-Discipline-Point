const SND_WIN = "#a3k64-seating-window";
const SND_DOCK_ID = "a3-seat-notice-dock";
const SND_TOAST_SELECTORS = [
  "#a3-seat-autosave-toast",
  ".seat-ctrl-toast",
  "#a3-seat-pub-toast",
  "#a3-spt-toast",
  "#a3-seat-privacy-toast",
  "#a3-seat-view-gate-toast",
];

let sndReady = false;
let sndObserver: MutationObserver | null = null;
let sndModalObserver: MutationObserver | null = null;

function sndPanel() {
  return document.querySelector<HTMLElement>(`${SND_WIN} .stable-seat-student-panel`)
    || document.querySelector<HTMLElement>(`${SND_WIN} [class*='student-panel']`);
}

function sndBoardWindow() {
  return document.querySelector<HTMLElement>(SND_WIN);
}

function sndEnsureDock() {
  const panel = sndPanel();
  if (!panel) return null;
  let dock = panel.querySelector<HTMLElement>(`#${SND_DOCK_ID}`);
  if (!dock) {
    dock = document.createElement("div");
    dock.id = SND_DOCK_ID;
    dock.setAttribute("aria-live", "polite");
    panel.insertBefore(dock, panel.firstChild);
  }
  return dock;
}

function sndMoveToast(node: Element) {
  const el = node as HTMLElement;
  if (!el || el.closest(`#${SND_DOCK_ID}`)) return;
  if (!SND_TOAST_SELECTORS.some((selector) => el.matches(selector))) return;
  const dock = sndEnsureDock();
  if (!dock) return;
  el.classList.add("seat-docked-toast");
  dock.appendChild(el);
}

function sndScanToasts() {
  sndEnsureDock();
  SND_TOAST_SELECTORS.forEach((selector) => {
    document.querySelectorAll(selector).forEach(sndMoveToast);
  });
}

function sndSyncModalBlur() {
  const win = sndBoardWindow();
  if (!win) return;
  const hasPublishModal = Boolean(document.querySelector(".seat-pub-lite-backdrop"));
  win.classList.toggle("seat-local-modal-open", hasPublishModal);
}

function sndStyle() {
  if (document.getElementById("a3-seat-notification-dock-style")) return;
  const style = document.createElement("style");
  style.id = "a3-seat-notification-dock-style";
  style.textContent = `
    ${SND_WIN} .stable-seat-student-panel{display:flex!important;flex-direction:column!important;gap:10px!important;}
    #${SND_DOCK_ID}{width:100%;display:grid;gap:8px;order:-999;margin:0 0 2px 0;box-sizing:border-box;}
    #${SND_DOCK_ID}:empty{display:none!important;}
    #${SND_DOCK_ID} .seat-docked-toast,
    #${SND_DOCK_ID} #a3-seat-autosave-toast,
    #${SND_DOCK_ID} .seat-ctrl-toast,
    #${SND_DOCK_ID} #a3-seat-pub-toast,
    #${SND_DOCK_ID} #a3-spt-toast,
    #${SND_DOCK_ID} #a3-seat-privacy-toast,
    #${SND_DOCK_ID} #a3-seat-view-gate-toast{
      position:static!important;
      left:auto!important;
      top:auto!important;
      right:auto!important;
      bottom:auto!important;
      transform:none!important;
      width:100%!important;
      max-width:100%!important;
      min-height:38px!important;
      box-sizing:border-box!important;
      margin:0!important;
      padding:9px 10px!important;
      border-radius:14px!important;
      display:flex!important;
      align-items:center!important;
      justify-content:flex-start!important;
      gap:9px!important;
      font-size:12.5px!important;
      font-weight:950!important;
      line-height:1.25!important;
      text-align:left!important;
      pointer-events:none!important;
      z-index:auto!important;
      white-space:normal!important;
    }
    #${SND_DOCK_ID} .seat-docked-toast .spin,
    #${SND_DOCK_ID} .seat-docked-toast .dot{flex:0 0 auto;}
    .seat-pub-lite-backdrop{
      background:transparent!important;
      backdrop-filter:none!important;
      -webkit-backdrop-filter:none!important;
    }
    ${SND_WIN}.seat-local-modal-open .stable-seat-main{
      filter:blur(8px)!important;
      opacity:.62!important;
      transition:filter .16s ease,opacity .16s ease!important;
    }
    ${SND_WIN}.seat-local-modal-open .stable-seat-student-panel,
    ${SND_WIN}.seat-local-modal-open .stable-seat-tools,
    ${SND_WIN}.seat-local-modal-open .stable-seat-title,
    ${SND_WIN}.seat-local-modal-open h1,
    ${SND_WIN}.seat-local-modal-open h2{
      filter:none!important;
      opacity:1!important;
    }
    .theme-dark #${SND_DOCK_ID} .seat-docked-toast,
    html.a3-overlay-dark #${SND_DOCK_ID} .seat-docked-toast{
      background:rgba(15,23,42,.96)!important;
      color:#f8fafc!important;
      box-shadow:0 12px 30px rgba(0,0,0,.24)!important;
    }
  `;
  document.head.appendChild(style);
}

function sndBoot() {
  if (sndReady) return;
  sndReady = true;
  sndStyle();
  sndScanToasts();
  sndSyncModalBlur();
  sndObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        sndMoveToast(node);
        node.querySelectorAll?.(SND_TOAST_SELECTORS.join(",")).forEach(sndMoveToast);
      });
    }
    sndEnsureDock();
  });
  sndObserver.observe(document.body, { childList: true, subtree: true });
  sndModalObserver = new MutationObserver(() => sndSyncModalBlur());
  sndModalObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  window.setInterval(() => { sndScanToasts(); sndSyncModalBlur(); }, 500);
  window.addEventListener("a3k64:seating-changed", () => setTimeout(sndScanToasts, 60));
  window.addEventListener("a3k64:seating-autosaved", () => setTimeout(sndScanToasts, 60));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sndBoot);
else sndBoot();

export {};
