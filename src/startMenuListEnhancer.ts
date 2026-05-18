const STYLE_ID = "a3k64-start-menu-list-style";

const REMOVED_APP_LABELS = ["Nhập điểm nhanh", "Xếp hạng", "Cuộc thi hiện tại", "Sơ đồ lớp"];
const KEEP_APP_LABELS = ["Bảng điểm A3", "Cài đặt"];

const START_MENU_CSS = `
.start-menu {
  width: 430px !important;
  min-height: 570px !important;
  max-height: min(720px, calc(100vh - 86px)) !important;
  left: 16px !important;
  right: auto !important;
  bottom: 70px !important;
  transform: none !important;
  padding: 20px 18px 20px 80px !important;
  border-radius: 26px !important;
  border: 1px solid rgba(148, 163, 184, .24) !important;
  background: linear-gradient(180deg, rgba(17, 24, 39, .96), rgba(15, 23, 42, .92)) !important;
  box-shadow: 0 26px 80px rgba(0, 0, 0, .48), inset 0 1px 0 rgba(255,255,255,.04) !important;
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
  width: 64px;
  background: rgba(3, 7, 18, .42);
  border-right: 1px solid rgba(148, 163, 184, .16);
  border-radius: 26px 0 0 26px;
}

.start-menu::after {
  content: "A3K64";
  position: absolute;
  left: 84px;
  top: 20px;
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
  margin-top: 44px !important;
  padding: 0 6px 12px 0 !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 8px !important;
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
  position: relative !important;
  width: 100% !important;
  min-height: 56px !important;
  padding: 7px 46px 7px 12px !important;
  border: 1px solid transparent !important;
  border-radius: 16px !important;
  display: grid !important;
  grid-template-columns: 42px minmax(0, 1fr) !important;
  align-items: center !important;
  gap: 12px !important;
  color: #f8fafc !important;
  background: transparent !important;
  text-align: left !important;
  transition: background .14s ease, transform .14s ease, border-color .14s ease, box-shadow .14s ease !important;
}

.start-menu .start-app:hover {
  background: rgba(255, 255, 255, .105) !important;
  border-color: rgba(148, 163, 184, .18) !important;
  box-shadow: 0 12px 28px rgba(0, 0, 0, .18) !important;
  transform: translateX(3px) !important;
}

.start-menu .start-app::after {
  content: attr(data-app-initial);
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 27px;
  height: 27px;
  border: 1px solid rgba(255,255,255,.14);
  border-radius: 10px;
  display: grid;
  place-items: center;
  color: #f8fafc;
  background: color-mix(in srgb, var(--desktop-accent, #ef4444) 82%, #020617);
  font-size: 12px;
  font-weight: 950;
  letter-spacing: .02em;
  box-shadow: 0 10px 22px color-mix(in srgb, var(--desktop-accent, #ef4444) 22%, transparent);
}

.start-menu .start-app-icon {
  width: 40px !important;
  height: 40px !important;
  border-radius: 14px !important;
  display: grid !important;
  place-items: center !important;
  color: #fff !important;
  background: linear-gradient(135deg, var(--desktop-accent, #ef4444), color-mix(in srgb, var(--desktop-accent, #ef4444) 72%, #020617)) !important;
  box-shadow: 0 12px 26px color-mix(in srgb, var(--desktop-accent, #ef4444) 25%, transparent) !important;
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
  font-weight: 700 !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}

.start-menu .start-footer {
  position: absolute !important;
  left: 0 !important;
  top: 0 !important;
  bottom: 0 !important;
  width: 64px !important;
  padding: 0 0 18px !important;
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
  background: linear-gradient(180deg, rgba(248, 250, 252, .96), rgba(241, 245, 249, .92)) !important;
  border-color: rgba(15, 23, 42, .14) !important;
  box-shadow: 0 24px 70px rgba(15, 23, 42, .18), inset 0 1px 0 rgba(255,255,255,.86) !important;
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

.win-root.theme-light .start-menu .start-app::after {
  color: #fff !important;
  border-color: rgba(15, 23, 42, .1) !important;
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

function getAppInitial(label: string) {
  const clean = label.trim();
  if (clean.includes("Cài đặt")) return "C";
  if (clean.includes("Bảng điểm")) return "B";
  return (clean[0] || "A").toUpperCase();
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
      return;
    }

    button.dataset.appInitial = getAppInitial(label);
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
