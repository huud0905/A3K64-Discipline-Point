const STYLE_ID = "a3k64-start-menu-list-style";

const REMOVED_APP_LABELS = ["Nhập điểm nhanh", "Xếp hạng", "Cuộc thi hiện tại", "Sơ đồ lớp"];
const KEEP_APP_LABELS = ["Bảng điểm A3", "Cài đặt"];

const START_MENU_CSS = `
.start-menu {
  width: 430px !important;
  min-height: 570px !important;
  max-height: min(720px, calc(100vh - 86px)) !important;
  left: 12px !important;
  right: auto !important;
  bottom: 64px !important;
  transform: none !important;
  padding: 18px 16px 18px 78px !important;
  border-radius: 0 18px 18px 0 !important;
  border: 1px solid rgba(148, 163, 184, .24) !important;
  background: rgba(17, 24, 39, .92) !important;
  box-shadow: 0 24px 70px rgba(0, 0, 0, .46) !important;
  backdrop-filter: blur(24px) saturate(1.12) !important;
  -webkit-backdrop-filter: blur(24px) saturate(1.12) !important;
  overflow: hidden !important;
  animation: a3StartMenuListIn .17s ease both !important;
}

@keyframes a3StartMenuListIn {
  from { opacity: 0; transform: translateY(14px) scale(.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.start-menu::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 62px;
  background: rgba(3, 7, 18, .42);
  border-right: 1px solid rgba(148, 163, 184, .16);
}

.start-menu::after {
  content: "A3K64";
  position: absolute;
  left: 78px;
  top: 18px;
  color: #cbd5e1;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: .16em;
  text-transform: uppercase;
}

.start-menu .start-header {
  display: none !important;
}

.start-menu .start-app-grid {
  height: calc(100% - 92px) !important;
  margin-top: 42px !important;
  padding: 0 6px 12px 0 !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 4px !important;
  overflow-y: auto !important;
  scrollbar-width: thin;
}

.start-menu .start-app-grid::before {
  content: "Ứng dụng";
  padding: 0 0 8px 2px;
  color: #94a3b8;
  font-size: 13px;
  font-weight: 800;
}

.start-menu .start-app {
  width: 100% !important;
  min-height: 52px !important;
  padding: 6px 12px !important;
  border: 0 !important;
  border-radius: 0 !important;
  display: grid !important;
  grid-template-columns: 42px minmax(0, 1fr) !important;
  align-items: center !important;
  gap: 12px !important;
  color: #f8fafc !important;
  background: transparent !important;
  text-align: left !important;
  transition: background .12s ease, transform .12s ease !important;
}

.start-menu .start-app:hover {
  background: rgba(255, 255, 255, .105) !important;
  transform: translateX(2px) !important;
}

.start-menu .start-app-icon {
  width: 38px !important;
  height: 38px !important;
  border-radius: 0 !important;
  display: grid !important;
  place-items: center !important;
  color: #fff !important;
  background: var(--desktop-accent, #ef4444) !important;
  box-shadow: none !important;
}

.start-menu .start-app-icon svg {
  width: 22px !important;
  height: 22px !important;
  stroke-width: 2.4 !important;
}

.start-menu .start-app span {
  min-width: 0 !important;
  color: #f8fafc !important;
  font-size: 15px !important;
  font-weight: 600 !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}

.start-menu .start-footer {
  position: absolute !important;
  left: 0 !important;
  top: 0 !important;
  bottom: 0 !important;
  width: 62px !important;
  padding: 0 0 16px !important;
  border: 0 !important;
  display: flex !important;
  flex-direction: column !important;
  justify-content: flex-end !important;
  align-items: center !important;
  gap: 14px !important;
  background: transparent !important;
  z-index: 2 !important;
}

.start-menu .start-footer .user-card {
  width: 44px !important;
  height: 44px !important;
  padding: 0 !important;
  display: grid !important;
  place-items: center !important;
  background: transparent !important;
}

.start-menu .start-footer .user-card strong,
.start-menu .start-footer .user-card span {
  display: none !important;
}

.start-menu .start-footer .avatar {
  width: 36px !important;
  height: 36px !important;
  border-radius: 999px !important;
  font-size: 12px !important;
  background: color-mix(in srgb, var(--desktop-accent, #ef4444) 84%, #020617) !important;
}

.start-menu .start-footer .logout-button {
  width: 44px !important;
  height: 44px !important;
  min-width: 44px !important;
  padding: 0 !important;
  border-radius: 999px !important;
  display: grid !important;
  place-items: center !important;
  color: #f8fafc !important;
  background: transparent !important;
  border: 0 !important;
  font-size: 0 !important;
}

.start-menu .start-footer .logout-button:hover {
  background: rgba(239, 68, 68, .26) !important;
}

.start-menu .start-footer .logout-button svg {
  width: 22px !important;
  height: 22px !important;
  margin: 0 !important;
}

.start-menu .a3-removed-start-app,
.start-menu .start-app[aria-hidden="true"] {
  display: none !important;
}

.win-root.theme-light .start-menu {
  color: #0f172a !important;
  background: rgba(248, 250, 252, .94) !important;
  border-color: rgba(15, 23, 42, .14) !important;
  box-shadow: 0 24px 70px rgba(15, 23, 42, .18) !important;
}

.win-root.theme-light .start-menu::before {
  background: rgba(226, 232, 240, .62) !important;
  border-right-color: rgba(15, 23, 42, .12) !important;
}

.win-root.theme-light .start-menu::after,
.win-root.theme-light .start-menu .start-app-grid::before {
  color: #64748b !important;
}

.win-root.theme-light .start-menu .start-app,
.win-root.theme-light .start-menu .start-app span {
  color: #0f172a !important;
}

.win-root.theme-light .start-menu .start-app:hover {
  background: rgba(15, 23, 42, .075) !important;
}

.win-root.theme-light .start-menu .start-footer .logout-button {
  color: #0f172a !important;
}

@media (max-width: 620px) {
  .start-menu {
    width: calc(100vw - 18px) !important;
    left: 9px !important;
    right: 9px !important;
  }
}
`;

function injectStartMenuCss() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = START_MENU_CSS;
  document.head.appendChild(style);
}

function textOf(element: Element) {
  return (element.textContent || "").replace(/\s+/g, " ").trim();
}

function cleanupStartMenu() {
  const startMenu = document.querySelector<HTMLElement>(".start-menu");
  if (!startMenu) return;

  startMenu.querySelectorAll<HTMLButtonElement>(".start-app").forEach((button) => {
    const label = textOf(button);
    const shouldRemove = REMOVED_APP_LABELS.some((item) => label.includes(item));
    const shouldKeep = KEEP_APP_LABELS.some((item) => label.includes(item));

    if (shouldRemove || !shouldKeep) {
      button.classList.add("a3-removed-start-app");
      button.setAttribute("aria-hidden", "true");
      button.tabIndex = -1;
    }
  });
}

function installStartMenuListEnhancer() {
  injectStartMenuCss();
  const run = () => window.requestAnimationFrame(cleanupStartMenu);
  const observer = new MutationObserver(run);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  run();
}

if (typeof window !== "undefined") installStartMenuListEnhancer();

export {};
