import { upsertStyleTag } from '../../../core/dom';

const STB_WIN = "#a3k64-seating-window";
let stbReady = false;
let stbTimer = 0;

function stbActorRole() {
  try {
    const session = JSON.parse(localStorage.getItem("a3k64-login-session-v1") || "null");
    const user = session?.user || session || {};
    return String(user.role || user.userRole || "").toLowerCase();
  } catch {
    return "";
  }
}

function stbIsAdmin() {
  const role = stbActorRole().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[\s-]+/g, "_");
  return role.includes("gvcn") || role.includes("lop_truong") || role.includes("bi_thu") || role.includes("admin");
}

function stbVisible() {
  const win = document.querySelector<HTMLElement>(STB_WIN);
  if (!win) return false;
  const rect = win.getBoundingClientRect();
  const css = getComputedStyle(win);
  return rect.width > 0 && rect.height > 0 && css.display !== "none" && css.visibility !== "hidden";
}

function stbInjectStyle() {
  upsertStyleTag("a3-seat-toolbar-stable-style", `
    ${STB_WIN} .stable-seat-tools{
      display:flex!important;
      align-items:center!important;
      gap:8px!important;
      flex-wrap:nowrap!important;
      line-height:1!important;
    }
    ${STB_WIN} .stable-seat-tools button,
    ${STB_WIN} .stable-seat-tools input,
    ${STB_WIN} .stable-seat-tools .seat-ctrl-trigger{
      height:40px!important;
      min-height:40px!important;
      box-sizing:border-box!important;
      align-self:center!important;
      margin-top:0!important;
      margin-bottom:0!important;
      line-height:1!important;
      vertical-align:middle!important;
    }
    ${STB_WIN} [data-seat-pub-lite],
    ${STB_WIN} [data-seat-pub-lite-manage]{
      display:inline-flex!important;
      align-items:center!important;
      justify-content:center!important;
      padding-top:0!important;
      padding-bottom:0!important;
      position:relative!important;
      top:2px!important;
      transform:none!important;
    }
    ${STB_WIN} [data-seat-pub-lite]:hover,
    ${STB_WIN} [data-seat-pub-lite-manage]:hover{
      transform:none!important;
    }
    ${STB_WIN} [data-seat-pub-lite]{order:1!important;min-width:82px!important;}
    ${STB_WIN} [data-seat-pub-lite-manage]{order:2!important;min-width:48px!important;}
    ${STB_WIN} .seat-ctrl-select{order:3!important;min-width:190px!important;align-self:center!important;display:flex!important;align-items:center!important;}
    ${STB_WIN} .stable-seat-tools input{order:20!important;min-width:190px!important;}
    ${STB_WIN} button.stb-admin-disabled{
      opacity:.45!important;
      filter:grayscale(.25)!important;
      cursor:not-allowed!important;
      pointer-events:auto!important;
      background:#f1f5f9!important;
      color:#64748b!important;
      border-color:#cbd5e1!important;
      transform:none!important;
    }
    .theme-dark ${STB_WIN} button.stb-admin-disabled,
    html.a3-overlay-dark ${STB_WIN} button.stb-admin-disabled{
      background:#111827!important;
      color:#64748b!important;
      border-color:#334155!important;
    }
  `);
}

function stbNormText(value: unknown) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/\s+/g, " ").trim();
}

function stbAdminOnlyButton(btn: HTMLButtonElement) {
  const text = stbNormText(btn.textContent);
  if (btn.dataset.seatPubLite || btn.dataset.seatPubLiteManage) return true;
  return text.includes("tao so do moi") || text.includes("khoi phuc") || text === "random";
}

function stbOrderButton(btn: HTMLButtonElement) {
  const text = stbNormText(btn.textContent);
  if (btn.dataset.seatPubLite) btn.style.order = "1";
  else if (btn.dataset.seatPubLiteManage) btn.style.order = "2";
  else if (text.includes("luu so do")) btn.style.order = "4";
  else if (text.includes("tao so do moi")) btn.style.order = "5";
  else if (text.includes("bat sua") || text.includes("tat sua")) btn.style.order = "30";
  else if (text.includes("khoi phuc")) btn.style.order = "31";
  else if (text === "random") btn.style.order = "32";
  else if (text.includes("xuat") || text.includes("in")) btn.style.order = "33";
}

function stbSetDisabled(btn: HTMLButtonElement, disabled: boolean) {
  btn.disabled = disabled;
  btn.classList.toggle("stb-admin-disabled", disabled);
  btn.title = disabled ? "Chỉ quản trị viên được dùng công cụ này" : "";
}

function stbSyncToolbar() {
  stbInjectStyle();
  if (!stbVisible()) return;
  const tools = document.querySelector<HTMLElement>(`${STB_WIN} .stable-seat-tools`);
  if (!tools) return;
  const isAdmin = stbIsAdmin();
  tools.querySelectorAll<HTMLButtonElement>("button").forEach((btn) => {
    stbOrderButton(btn);
    if (btn.dataset.seatPubLite || btn.dataset.seatPubLiteManage) {
      btn.style.display = "inline-flex";
      btn.style.alignItems = "center";
      btn.style.justifyContent = "center";
      btn.style.position = "relative";
      btn.style.top = "2px";
    }
    if (!stbAdminOnlyButton(btn)) return;
    stbSetDisabled(btn, !isAdmin);
  });
  const select = tools.querySelector<HTMLElement>(".seat-ctrl-select");
  if (select) select.style.order = "3";
  const search = tools.querySelector<HTMLInputElement>("input");
  if (search) search.style.order = "20";
}

function stbBoot() {
  if (stbReady) return;
  stbReady = true;
  stbSyncToolbar();
  if (!stbTimer) stbTimer = window.setInterval(stbSyncToolbar, 500);
  window.addEventListener("a3k64:seating-changed", () => setTimeout(stbSyncToolbar, 80));
  window.addEventListener("a3k64:seating-access-updated", () => setTimeout(stbSyncToolbar, 80));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", stbBoot);
else stbBoot();

export {};
