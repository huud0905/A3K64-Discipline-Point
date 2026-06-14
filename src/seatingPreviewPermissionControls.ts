const SPC_WIN = "#a3k64-seating-window";
let spcReady = false;
let spcTimer = 0;

type SpcPerm = "move" | "save" | "create" | "restore" | "random" | "export";

function spcRole() {
  try {
    const s = JSON.parse(localStorage.getItem("a3k64-login-session-v1") || "null");
    const u = s?.user || s || {};
    return String(u.role || u.userRole || "").toLowerCase();
  } catch {
    return "";
  }
}

function spcAdmin() {
  const role = spcRole().replace(/\s+/g, "_");
  return role.includes("gvcn") || role.includes("lop_truong") || role.includes("bi_thu") || role.includes("admin");
}

function spcVisible() {
  const win = document.querySelector<HTMLElement>(SPC_WIN);
  if (!win) return false;
  const rect = win.getBoundingClientRect();
  const css = getComputedStyle(win);
  return rect.width > 0 && rect.height > 0 && css.display !== "none" && css.visibility !== "hidden";
}

function spcNorm(v: unknown) {
  return String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/\s+/g, " ").trim();
}

function spcPreviewMode() {
  return document.documentElement.dataset.seatPreviewMode === "edit" ? "edit" : "view";
}

function spcPerms() {
  const set = new Set<SpcPerm>();
  String(document.documentElement.dataset.seatPreviewPerms || "").split(",").map((x) => x.trim()).forEach((x) => {
    if (["move", "save", "create", "restore", "random", "export"].includes(x)) set.add(x as SpcPerm);
  });
  return set;
}

function spcButtonPerm(btn: HTMLButtonElement): SpcPerm | "publish" | null {
  if (btn.dataset.seatPubLite || btn.dataset.seatPubLiteManage) return "publish";
  const text = spcNorm(btn.textContent);
  if (text.includes("bat sua") || text.includes("dang sua")) return "move";
  if (text.includes("luu so do")) return "save";
  if (text.includes("tao so do moi")) return "create";
  if (text.includes("khoi phuc")) return "restore";
  if (text === "random" || text.includes("random")) return "random";
  if (text.includes("xuat") || text.includes("in")) return "export";
  return null;
}

function spcSetButton(btn: HTMLButtonElement, disabled: boolean) {
  btn.disabled = disabled;
  btn.classList.toggle("stb-admin-disabled", disabled);
  btn.title = disabled ? "Không có quyền dùng công cụ này trong chế độ xem trước" : "";
}

function spcInjectStyle() {
  if (document.getElementById("a3-spc-style")) return;
  const style = document.createElement("style");
  style.id = "a3-spc-style";
  style.textContent = `
    html.a3-seat-viewer-readonly ${SPC_WIN} [data-tool='edit'],
    html.a3-seat-viewer-readonly ${SPC_WIN} [data-tool='reset'],
    html.a3-seat-viewer-readonly ${SPC_WIN} [data-seat-random],
    html.a3-seat-viewer-readonly ${SPC_WIN} .seat-ctrl-btn,
    html.a3-seat-viewer-readonly ${SPC_WIN} .seat-pub-lite-btn{
      display:inline-flex!important;
      visibility:visible!important;
      opacity:.45!important;
    }
    ${SPC_WIN} button.stb-admin-disabled{opacity:.45!important;filter:grayscale(.25)!important;cursor:not-allowed!important;background:#f1f5f9!important;color:#64748b!important;border-color:#cbd5e1!important;transform:none!important;}
    .theme-dark ${SPC_WIN} button.stb-admin-disabled,html.a3-overlay-dark ${SPC_WIN} button.stb-admin-disabled{background:#111827!important;color:#64748b!important;border-color:#334155!important;}
  `;
  document.head.appendChild(style);
}

function spcApply() {
  spcInjectStyle();
  if (!spcVisible()) return;
  const tools = document.querySelector<HTMLElement>(`${SPC_WIN} .stable-seat-tools`);
  if (!tools) return;
  if (spcAdmin()) {
    tools.querySelectorAll<HTMLButtonElement>("button.stb-admin-disabled").forEach((btn) => spcSetButton(btn, false));
    return;
  }
  const mode = spcPreviewMode();
  const perms = spcPerms();
  tools.querySelectorAll<HTMLButtonElement>("button").forEach((btn) => {
    const perm = spcButtonPerm(btn);
    if (!perm) return;
    const allowed = mode === "edit" && perm !== "publish" && perms.has(perm);
    spcSetButton(btn, !allowed);
  });
}

function spcMoveAllowed() {
  if (spcAdmin()) return true;
  return spcPreviewMode() === "edit" && spcPerms().has("move");
}

function spcGuard(event: Event) {
  const target = event.target as HTMLElement | null;
  if (!target?.closest?.(SPC_WIN)) return;
  if (spcMoveAllowed()) return;
  if (!target.closest(".stable-seat-cell,.stable-seat-student-card")) return;
  event.preventDefault();
  event.stopPropagation();
  if ("stopImmediatePropagation" in event) event.stopImmediatePropagation();
}

function spcClickGuard(event: Event) {
  const target = event.target as HTMLElement | null;
  const btn = target?.closest?.(`${SPC_WIN} button.stb-admin-disabled`);
  if (!btn) return;
  event.preventDefault();
  event.stopPropagation();
  if ("stopImmediatePropagation" in event) event.stopImmediatePropagation();
}

function spcBoot() {
  if (spcReady) return;
  spcReady = true;
  spcApply();
  if (!spcTimer) spcTimer = window.setInterval(spcApply, 450);
  ["dragstart", "dragover", "drop", "contextmenu"].forEach((type) => document.addEventListener(type, spcGuard, true));
  document.addEventListener("click", spcClickGuard, true);
  window.addEventListener("a3k64:seating-changed", () => setTimeout(spcApply, 80));
  window.addEventListener("a3k64:seating-access-updated", () => setTimeout(spcApply, 80));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", spcBoot);
else spcBoot();

export {};
