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
  if (document.getElementById("a3-seat-toolbar-stable-style")) return;
  const style = document.createElement("style");
  style.id = "a3-seat-toolbar-stable-style";
  style.textContent = `
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
  `;
  document.head.appendChild(style);
}

function stbNormText(value: unknown) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/\s+/g, " ").trim();
}

function stbAdminOnlyButton(btn: HTMLButtonElement) {
  const text = stbNormText(btn.textContent);
  if (btn.dataset.seatPubLite || btn.dataset.seatPubLiteManage) return true;
  return text.includes("tao so do moi") || text.includes("khoi phuc") || text === "random";
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
    if (!stbAdminOnlyButton(btn)) return;
    stbSetDisabled(btn, !isAdmin);
  });
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
