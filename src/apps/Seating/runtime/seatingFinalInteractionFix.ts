import { upsertStyleTag } from '../../../core/dom';

const FIX_WIN = "#a3k64-seating-window";
let fixTimer = 0;

function fixText(v: unknown) {
  return String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/\s+/g, " ").trim();
}

function fixIsEditOn() {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(`${FIX_WIN} .stable-seat-tools button`));
  const edit = buttons.find((btn) => {
    const text = fixText(btn.textContent);
    return text.includes("bat sua") || text.includes("dang sua") || text.includes("tat sua");
  });
  const text = fixText(edit?.textContent);
  return Boolean(edit?.classList.contains("primary") || edit?.dataset.editState === "on" || text.includes("dang sua") || text.includes("tat sua"));
}

function fixSync() {
  const tools = document.querySelector<HTMLElement>(`${FIX_WIN} .stable-seat-tools`);
  if (!tools) return;
  const editOn = fixIsEditOn();
  tools.querySelectorAll<HTMLButtonElement>("button").forEach((btn) => {
    const text = fixText(btn.textContent);
    const gated = text.includes("khoi phuc") || text === "random";
    if (!gated) return;
    btn.disabled = !editOn;
    btn.classList.toggle("seat-needs-edit-disabled", !editOn);
    btn.title = editOn ? "" : "Bật sửa trước khi dùng công cụ này";
  });
  const select = tools.querySelector<HTMLElement>(".seat-ctrl-select");
  if (select) {
    select.style.position = "relative";
    select.style.zIndex = "9000";
    select.style.overflow = "visible";
  }
  const menu = tools.querySelector<HTMLElement>(".seat-ctrl-menu");
  if (menu) {
    menu.style.position = "absolute";
    menu.style.zIndex = "12000";
    menu.style.top = "calc(100% + 6px)";
  }
}

function fixStyle() {
  upsertStyleTag("a3-seat-final-interaction-fix", `
    ${FIX_WIN} .stable-seat-tools{position:relative!important;z-index:8000!important;overflow:visible!important;}
    ${FIX_WIN} .seat-ctrl-select{position:relative!important;z-index:9000!important;overflow:visible!important;}
    ${FIX_WIN} .seat-ctrl-menu{position:absolute!important;z-index:12000!important;top:calc(100% + 6px)!important;left:0!important;right:auto!important;min-width:100%!important;max-height:280px!important;overflow:auto!important;}
    ${FIX_WIN} .stable-seat-board{position:relative!important;z-index:1!important;}
    ${FIX_WIN} button.seat-needs-edit-disabled{opacity:.45!important;filter:grayscale(.25)!important;cursor:not-allowed!important;background:#f1f5f9!important;color:#64748b!important;border-color:#cbd5e1!important;transform:none!important;}
    ${FIX_WIN}.seat-local-modal-open .stable-seat-board{filter:blur(8px)!important;opacity:.58!important;}
    ${FIX_WIN}.seat-local-modal-open .stable-seat-board::after{content:"";position:absolute;inset:0;z-index:30;border-radius:18px;background:rgba(255,255,255,.38);pointer-events:none;}
    ${FIX_WIN}.seat-local-modal-open .stable-seat-main,${FIX_WIN}.seat-local-modal-open .stable-seat-body,${FIX_WIN}.seat-local-modal-open .stable-seat-students,${FIX_WIN}.seat-local-modal-open .stable-seat-tools{filter:none!important;opacity:1!important;}
  `);
}

function bootFix() {
  fixStyle();
  fixSync();
  fixTimer = window.setInterval(fixSync, 350);
  window.addEventListener("a3k64:seating-edit-mode", () => setTimeout(fixSync, 40));
  window.addEventListener("a3k64:seating-changed", () => setTimeout(fixSync, 80));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootFix);
else bootFix();

export {};
