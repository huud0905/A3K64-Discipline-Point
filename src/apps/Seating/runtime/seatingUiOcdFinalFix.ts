import { upsertStyleTag } from '../../../core/dom';

const SOF_WIN = "#a3k64-seating-window";
const SOF_DOCK_ID = "a3-seat-notice-dock";
const SOF_LIST_ID = "a3-seat-student-list-box";
const SOF_SELECTORS = [
  "#a3-seat-autosave-toast",
  "#a3k64-seat-opening-toast",
  ".hard-seat-swap-toast",
  ".seat-ctrl-toast",
  ".seat-docked-toast",
  "#a3-seat-pub-toast",
  "#a3-spt-toast",
  "#a3-seat-privacy-toast",
  "#a3-seat-view-gate-toast",
];
let sofBooted = false;
let sofObserver: MutationObserver | null = null;

function sofFold(v: unknown) {
  return String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
}

function sofPanel() {
  return document.querySelector<HTMLElement>(`${SOF_WIN} .stable-seat-students`)
    || document.querySelector<HTMLElement>(`${SOF_WIN} .stable-seat-student-panel`);
}

function sofSeatVisible() {
  const win = document.querySelector<HTMLElement>(SOF_WIN);
  if (!win) return false;
  const rect = win.getBoundingClientRect();
  const css = getComputedStyle(win);
  return rect.width > 0 && rect.height > 0 && css.display !== "none" && css.visibility !== "hidden";
}

function sofEnsureBoxes() {
  const panel = sofPanel();
  if (!panel) return null;
  panel.classList.add("seat-left-panel-split", "seat-left-panel-flat");
  let dock = panel.querySelector<HTMLElement>(`#${SOF_DOCK_ID}`);
  if (!dock) {
    dock = document.createElement("div");
    dock.id = SOF_DOCK_ID;
    dock.innerHTML = `<div class="seat-notice-head"><span>Thông báo</span><button type="button" data-clear-all title="Xoá tất cả thông báo">×</button></div><div class="seat-notice-list" data-notice-list></div>`;
    panel.insertBefore(dock, panel.firstChild);
    dock.querySelector<HTMLButtonElement>("[data-clear-all]")?.addEventListener("click", () => {
      dock?.querySelectorAll<HTMLElement>(".seat-docked-toast").forEach((item) => item.remove());
    });
  }
  let list = panel.querySelector<HTMLElement>(`#${SOF_LIST_ID}`);
  if (!list) {
    list = document.createElement("div");
    list.id = SOF_LIST_ID;
    panel.appendChild(list);
  }
  Array.from(panel.childNodes).forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    if (node.id === SOF_DOCK_ID || node.id === SOF_LIST_ID) return;
    list!.appendChild(node);
  });
  return dock.querySelector<HTMLElement>("[data-notice-list]") || dock;
}

function sofIsKnownToast(el: HTMLElement) {
  return SOF_SELECTORS.some((selector) => el.matches(selector));
}

function sofLooksLikeLegacyToast(el: HTMLElement) {
  if (!sofSeatVisible()) return false;
  if (el.closest(`#${SOF_DOCK_ID}`)) return false;
  if (el.matches(".seat-pub-lite-backdrop,.seat-pub-lite-modal,.seat-create-backdrop,.seat-create-modal")) return false;
  if (el.closest(".seat-pub-lite-backdrop,.seat-pub-lite-modal,.seat-create-backdrop,.seat-create-modal")) return false;
  const text = (el.textContent || "").replace(/\s+/g, " ").trim();
  if (!text || text.length > 150) return false;
  const folded = sofFold(text);
  const seatWords = ["so do", "cho ngoi", "doi cho", "da doi", "da chuyen", "tu luu", "dang luu", "da luu", "dang cho tu luu", "da xoa", "da mo", "da tai", "cau hinh", "backend"];
  if (!seatWords.some((word) => folded.includes(word))) return false;
  const css = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  const fixedOrAbs = css.position === "fixed" || css.position === "absolute";
  const toastSized = rect.width > 80 && rect.width < 520 && rect.height > 22 && rect.height < 120;
  const nearTop = rect.top >= 0 && rect.top < 170;
  const highLayer = Number(css.zIndex || 0) >= 1000 || (el.getAttribute("style") || "").includes("z-index");
  return fixedOrAbs && toastSized && (nearTop || highLayer);
}

function sofIsToast(el: HTMLElement) {
  return sofIsKnownToast(el) || sofLooksLikeLegacyToast(el);
}

function sofAddClose(el: HTMLElement) {
  if (el.querySelector(".seat-docked-close")) return;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "seat-docked-close";
  close.title = "Tắt thông báo";
  close.textContent = "×";
  close.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    el.remove();
  });
  el.appendChild(close);
}

function sofDockToast(el: HTMLElement) {
  if (!sofIsToast(el) || el.closest(`#${SOF_DOCK_ID}`)) return;
  const list = sofEnsureBoxes();
  if (!list) return;
  el.classList.add("seat-docked-toast");
  el.style.cssText = "";
  sofAddClose(el);
  list.appendChild(el);
}

function sofNeutralizeBackdrop() {
  document.querySelectorAll<HTMLElement>(".seat-pub-lite-backdrop").forEach((backdrop) => {
    backdrop.style.background = "transparent";
    backdrop.style.backdropFilter = "none";
    (backdrop.style as any).webkitBackdropFilter = "none";
    backdrop.style.pointerEvents = "auto";
  });
}

function sofScan() {
  sofEnsureBoxes();
  SOF_SELECTORS.forEach((selector) => {
    document.querySelectorAll<HTMLElement>(selector).forEach(sofDockToast);
  });
  Array.from(document.body.children).forEach((child) => {
    if (child instanceof HTMLElement) sofDockToast(child);
  });
  document.querySelectorAll<HTMLElement>(".hard-seat-swap-toast").forEach(sofDockToast);
  sofNeutralizeBackdrop();
  const win = document.querySelector<HTMLElement>(SOF_WIN);
  if (win) win.classList.toggle("seat-local-modal-open", Boolean(document.querySelector(".seat-pub-lite-backdrop")));
}

function sofStyle() {
  upsertStyleTag("a3-seat-ui-ocd-final-style", `
    ${SOF_WIN} .stable-seat-students.seat-left-panel-flat,
    ${SOF_WIN} .stable-seat-student-panel.seat-left-panel-flat{
      border:0!important;
      background:transparent!important;
      box-shadow:none!important;
      padding:0!important;
      border-radius:0!important;
      display:flex!important;
      flex-direction:column!important;
      gap:10px!important;
      overflow:hidden!important;
      filter:none!important;
      opacity:1!important;
    }
    #${SOF_DOCK_ID},#${SOF_LIST_ID}{
      width:100%!important;
      border:1px solid #cbd5e1!important;
      border-radius:18px!important;
      background:rgba(255,255,255,.96)!important;
      box-shadow:0 12px 26px rgba(15,23,42,.06)!important;
      box-sizing:border-box!important;
    }
    #${SOF_DOCK_ID}{
      flex:0 0 auto!important;
      min-height:146px!important;
      max-height:176px!important;
      padding:10px!important;
      display:grid!important;
      grid-template-rows:auto minmax(0,1fr)!important;
      gap:8px!important;
      overflow:hidden!important;
    }
    #${SOF_LIST_ID}{
      flex:1 1 auto!important;
      min-height:0!important;
      padding:12px!important;
      overflow:hidden!important;
      display:flex!important;
      flex-direction:column!important;
      gap:12px!important;
    }
    #${SOF_DOCK_ID} .seat-notice-head{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:8px!important;font-size:13px!important;font-weight:1000!important;color:#0f172a!important;line-height:1!important;}
    #${SOF_DOCK_ID} .seat-notice-list{display:grid!important;gap:7px!important;overflow:auto!important;max-height:118px!important;min-height:0!important;padding-right:2px!important;}
    #${SOF_DOCK_ID} .seat-notice-list:empty::before{content:"Chưa có thông báo.";min-height:42px;border:1px dashed #cbd5e1;border-radius:13px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:12px;font-weight:850;}
    #${SOF_DOCK_ID} .seat-notice-head button,#${SOF_DOCK_ID} .seat-docked-close{width:28px!important;height:28px!important;min-width:28px!important;border:1px solid #cbd5e1!important;border-radius:10px!important;background:#fff!important;color:#475569!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;cursor:pointer!important;font-weight:1000!important;line-height:1!important;padding:0!important;pointer-events:auto!important;}
    #${SOF_DOCK_ID} .seat-notice-head button:hover,#${SOF_DOCK_ID} .seat-docked-close:hover{border-color:#fb7185!important;color:#e11d48!important;background:#fff1f2!important;}
    #${SOF_DOCK_ID} .seat-docked-toast,
    #${SOF_DOCK_ID} #a3-seat-autosave-toast,
    #${SOF_DOCK_ID} #a3k64-seat-opening-toast,
    #${SOF_DOCK_ID} .hard-seat-swap-toast,
    #${SOF_DOCK_ID} .seat-ctrl-toast,
    #${SOF_DOCK_ID} #a3-seat-pub-toast,
    #${SOF_DOCK_ID} #a3-spt-toast,
    #${SOF_DOCK_ID} #a3-seat-privacy-toast,
    #${SOF_DOCK_ID} #a3-seat-view-gate-toast{
      position:static!important;
      left:auto!important;top:auto!important;right:auto!important;bottom:auto!important;
      transform:none!important;
      width:100%!important;max-width:100%!important;min-height:34px!important;
      box-sizing:border-box!important;margin:0!important;padding:8px 7px 8px 9px!important;
      border:1px solid rgba(20,184,166,.65)!important;border-radius:13px!important;
      display:grid!important;grid-template-columns:auto 1fr auto!important;align-items:center!important;gap:8px!important;
      font-size:12px!important;font-weight:950!important;line-height:1.2!important;text-align:left!important;white-space:normal!important;
      pointer-events:auto!important;z-index:auto!important;background:rgba(255,255,255,.985)!important;color:#0f172a!important;box-shadow:0 8px 18px rgba(15,23,42,.08)!important;
    }
    #${SOF_DOCK_ID} .seat-docked-toast .dot,#${SOF_DOCK_ID} .seat-docked-toast .spin,#${SOF_DOCK_ID} .seat-docked-toast .seat-open-spin{grid-column:1!important;flex:0 0 auto!important;}
    #${SOF_DOCK_ID} .seat-docked-toast > span:last-of-type{grid-column:2!important;}
    #${SOF_LIST_ID} .stable-seat-student-list{gap:10px!important;}
    #${SOF_LIST_ID} .stable-seat-student-card,#${SOF_LIST_ID} [class*='student-card']{margin-bottom:3px!important;}
    ${SOF_WIN}.seat-local-modal-open .stable-seat-main,
    ${SOF_WIN}.seat-local-modal-open .stable-seat-body,
    ${SOF_WIN}.seat-local-modal-open .stable-seat-students,
    ${SOF_WIN}.seat-local-modal-open .stable-seat-student-panel,
    ${SOF_WIN}.seat-local-modal-open .stable-seat-tools,
    ${SOF_WIN}.seat-local-modal-open .stable-seat-title{
      filter:none!important;
      opacity:1!important;
    }
    ${SOF_WIN}.seat-local-modal-open .stable-seat-board{
      position:relative!important;
      filter:none!important;
      opacity:1!important;
      overflow:hidden!important;
    }
    ${SOF_WIN}.seat-local-modal-open .stable-seat-board > *{
      filter:blur(14px) grayscale(.18)!important;
      opacity:.16!important;
      transition:filter .16s ease,opacity .16s ease!important;
    }
    ${SOF_WIN}.seat-local-modal-open .stable-seat-board::before{
      content:""!important;
      position:absolute!important;
      inset:0!important;
      z-index:80!important;
      border-radius:18px!important;
      background:rgba(255,255,255,.92)!important;
      pointer-events:none!important;
    }
    .seat-pub-lite-modal{position:relative!important;z-index:1000002!important;}
    .seat-pub-lite-backdrop{background:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;}
    .seat-pub-lite-backdrop::before,.seat-pub-lite-backdrop::after{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;background:transparent!important;}
    .theme-dark #${SOF_DOCK_ID},html.a3-overlay-dark #${SOF_DOCK_ID},.theme-dark #${SOF_LIST_ID},html.a3-overlay-dark #${SOF_LIST_ID}{background:rgba(15,23,42,.96)!important;border-color:#334155!important;box-shadow:0 12px 30px rgba(0,0,0,.24)!important;}
    .theme-dark #${SOF_DOCK_ID} .seat-notice-head,html.a3-overlay-dark #${SOF_DOCK_ID} .seat-notice-head{color:#f8fafc!important;}
  `);
}

function sofBoot() {
  if (sofBooted) return;
  sofBooted = true;
  sofStyle();
  sofScan();
  sofObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (node instanceof HTMLElement) sofDockToast(node);
        node.querySelectorAll?.(SOF_SELECTORS.join(",")).forEach((item) => sofDockToast(item as HTMLElement));
      });
    }
    sofScan();
  });
  sofObserver.observe(document.body, { childList: true, subtree: true });
  window.setInterval(sofScan, 180);
  window.addEventListener("a3k64:seating-changed", () => setTimeout(sofScan, 40));
  window.addEventListener("a3k64:seating-autosaved", () => setTimeout(sofScan, 40));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sofBoot);
else sofBoot();

export {};
