import { upsertStyleTag } from '../../../core/dom';

const SND_WIN = "#a3k64-seating-window";
const SND_DOCK_ID = "a3-seat-notice-dock";
const SND_LIST_ID = "a3-seat-student-list-box";
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
  return document.querySelector<HTMLElement>(`${SND_WIN} .stable-seat-students`)
    || document.querySelector<HTMLElement>(`${SND_WIN} .stable-seat-student-panel`)
    || document.querySelector<HTMLElement>(`${SND_WIN} [class*='student-panel']`)
    || document.querySelector<HTMLElement>(`${SND_WIN} [class*='students']`);
}

function sndBoardWindow() {
  return document.querySelector<HTMLElement>(SND_WIN);
}

function sndEnsureStudentListBox(panel: HTMLElement) {
  let list = panel.querySelector<HTMLElement>(`#${SND_LIST_ID}`);
  if (!list) {
    list = document.createElement("div");
    list.id = SND_LIST_ID;
    panel.appendChild(list);
  }
  Array.from(panel.childNodes).forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    if (node.id === SND_DOCK_ID || node.id === SND_LIST_ID) return;
    list!.appendChild(node);
  });
  return list;
}

function sndEnsureDock() {
  const panel = sndPanel();
  if (!panel) return null;
  panel.classList.add("seat-left-panel-split");
  let dock = panel.querySelector<HTMLElement>(`#${SND_DOCK_ID}`);
  if (!dock) {
    dock = document.createElement("div");
    dock.id = SND_DOCK_ID;
    dock.setAttribute("aria-live", "polite");
    dock.innerHTML = `<div class="seat-notice-head"><span>Thông báo</span><button type="button" data-clear-all title="Xoá tất cả thông báo">×</button></div><div class="seat-notice-list" data-notice-list></div>`;
    panel.insertBefore(dock, panel.firstChild);
    dock.querySelector<HTMLButtonElement>("[data-clear-all]")?.addEventListener("click", () => {
      dock?.querySelectorAll<HTMLElement>(".seat-docked-toast").forEach((item) => item.remove());
    });
  }
  sndEnsureStudentListBox(panel);
  return dock.querySelector<HTMLElement>("[data-notice-list]") || dock;
}

function sndIsToast(el: HTMLElement) {
  return SND_TOAST_SELECTORS.some((selector) => el.matches(selector));
}

function sndAddClose(el: HTMLElement) {
  if (el.querySelector(".seat-docked-close")) return;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "seat-docked-close";
  close.title = "Tắt thông báo";
  close.setAttribute("aria-label", "Tắt thông báo");
  close.textContent = "×";
  close.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    el.remove();
  });
  el.appendChild(close);
}

function sndMoveToast(node: Element) {
  const el = node as HTMLElement;
  if (!el || el.closest(`#${SND_DOCK_ID}`)) return;
  if (!sndIsToast(el)) return;
  const list = sndEnsureDock();
  if (!list) return;
  el.classList.add("seat-docked-toast");
  sndAddClose(el);
  list.appendChild(el);
}

function sndScanToasts() {
  sndEnsureDock();
  const panel = sndPanel();
  if (panel) sndEnsureStudentListBox(panel);
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
  upsertStyleTag("a3-seat-notification-dock-style", `
    ${SND_WIN} .stable-seat-students.seat-left-panel-split,
    ${SND_WIN} .stable-seat-student-panel.seat-left-panel-split{
      display:flex!important;
      flex-direction:column!important;
      gap:10px!important;
      align-items:stretch!important;
      overflow:hidden!important;
    }
    #${SND_DOCK_ID}{
      width:100%;
      flex:0 0 auto;
      order:-999;
      box-sizing:border-box;
      border:1px solid #cbd5e1;
      border-radius:18px;
      background:rgba(255,255,255,.96);
      padding:10px;
      display:grid;
      grid-template-rows:auto minmax(0,1fr);
      gap:8px;
      min-height:146px;
      max-height:176px;
      overflow:hidden;
      box-shadow:0 12px 26px rgba(15,23,42,.06);
    }
    #${SND_DOCK_ID}:has(.seat-notice-list:empty){min-height:96px;}
    #${SND_DOCK_ID} .seat-notice-head{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:8px;
      font-size:13px;
      font-weight:1000;
      color:#0f172a;
      line-height:1;
    }
    #${SND_DOCK_ID} .seat-notice-head button,
    #${SND_DOCK_ID} .seat-docked-close{
      width:28px;
      height:28px;
      min-width:28px;
      border:1px solid #cbd5e1;
      border-radius:10px;
      background:#fff;
      color:#475569;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      cursor:pointer;
      font-weight:1000;
      line-height:1;
      padding:0;
      pointer-events:auto!important;
    }
    #${SND_DOCK_ID} .seat-notice-head button:hover,
    #${SND_DOCK_ID} .seat-docked-close:hover{border-color:#fb7185;color:#e11d48;background:#fff1f2;}
    #${SND_DOCK_ID} .seat-notice-list{
      display:grid;
      gap:7px;
      overflow:auto;
      max-height:118px;
      min-height:0;
      padding-right:2px;
    }
    #${SND_DOCK_ID} .seat-notice-list:empty::before{
      content:"Chưa có thông báo.";
      min-height:42px;
      border:1px dashed #cbd5e1;
      border-radius:13px;
      display:flex;
      align-items:center;
      justify-content:center;
      color:#94a3b8;
      font-size:12px;
      font-weight:850;
    }
    #${SND_LIST_ID}{
      width:100%;
      flex:1 1 auto;
      min-height:0;
      border:1px solid #cbd5e1;
      border-radius:18px;
      background:rgba(255,255,255,.96);
      padding:12px;
      box-sizing:border-box;
      overflow:hidden;
      display:flex;
      flex-direction:column;
      gap:12px;
    }
    #${SND_LIST_ID} .stable-seat-student-list{
      gap:10px!important;
    }
    #${SND_LIST_ID} .stable-seat-student-card,
    #${SND_LIST_ID} [class*='student-card']{
      margin-bottom:3px!important;
    }
    #${SND_LIST_ID} .stable-seat-student-card + .stable-seat-student-card,
    #${SND_LIST_ID} [class*='student-card'] + [class*='student-card']{
      margin-top:3px!important;
    }
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
      min-height:34px!important;
      box-sizing:border-box!important;
      margin:0!important;
      padding:8px 7px 8px 9px!important;
      border-radius:13px!important;
      display:grid!important;
      grid-template-columns:auto 1fr auto!important;
      align-items:center!important;
      justify-content:stretch!important;
      gap:8px!important;
      font-size:12px!important;
      font-weight:950!important;
      line-height:1.2!important;
      text-align:left!important;
      pointer-events:auto!important;
      z-index:auto!important;
      white-space:normal!important;
      box-shadow:0 8px 18px rgba(15,23,42,.08)!important;
    }
    #${SND_DOCK_ID} .seat-docked-toast .spin,
    #${SND_DOCK_ID} .seat-docked-toast .dot{flex:0 0 auto;grid-column:1;}
    #${SND_DOCK_ID} .seat-docked-toast > span:last-of-type{grid-column:2;}
    .seat-pub-lite-backdrop{
      background:transparent!important;
      backdrop-filter:none!important;
      -webkit-backdrop-filter:none!important;
    }
    ${SND_WIN}.seat-local-modal-open .stable-seat-board{
      filter:blur(8px)!important;
      opacity:.62!important;
      transition:filter .16s ease,opacity .16s ease!important;
    }
    ${SND_WIN}.seat-local-modal-open .stable-seat-students,
    ${SND_WIN}.seat-local-modal-open .stable-seat-student-panel,
    ${SND_WIN}.seat-local-modal-open .stable-seat-tools,
    ${SND_WIN}.seat-local-modal-open .stable-seat-title,
    ${SND_WIN}.seat-local-modal-open h1,
    ${SND_WIN}.seat-local-modal-open h2{
      filter:none!important;
      opacity:1!important;
    }
    .theme-dark #${SND_DOCK_ID},
    html.a3-overlay-dark #${SND_DOCK_ID},
    .theme-dark #${SND_LIST_ID},
    html.a3-overlay-dark #${SND_LIST_ID}{
      background:rgba(15,23,42,.96)!important;
      border-color:#334155!important;
      box-shadow:0 12px 30px rgba(0,0,0,.24)!important;
    }
    .theme-dark #${SND_DOCK_ID} .seat-notice-head,
    html.a3-overlay-dark #${SND_DOCK_ID} .seat-notice-head{color:#f8fafc!important;}
    .theme-dark #${SND_DOCK_ID} .seat-docked-toast,
    html.a3-overlay-dark #${SND_DOCK_ID} .seat-docked-toast{
      background:rgba(15,23,42,.96)!important;
      color:#f8fafc!important;
      box-shadow:0 12px 30px rgba(0,0,0,.24)!important;
    }
  `);
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
    sndScanToasts();
  });
  sndObserver.observe(document.body, { childList: true, subtree: true });
  sndModalObserver = new MutationObserver(() => sndSyncModalBlur());
  sndModalObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  window.setInterval(() => { sndScanToasts(); sndSyncModalBlur(); }, 350);
  window.addEventListener("a3k64:seating-changed", () => setTimeout(sndScanToasts, 60));
  window.addEventListener("a3k64:seating-autosaved", () => setTimeout(sndScanToasts, 60));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sndBoot);
else sndBoot();

export {};
