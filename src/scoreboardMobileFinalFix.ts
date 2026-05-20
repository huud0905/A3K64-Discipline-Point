const STYLE_ID = "a3k64-scoreboard-mobile-final-fix";
const TOOLS_TITLE_CLASS = "a3-mobile-tools-title";
const TOOLS_MENU_CLASS = "mobile-tools-menu";
let originalActionbarParent: ParentNode | null = null;
let originalActionbarNext: ChildNode | null = null;

const CSS = `
@media (max-width: 760px) {
  html, body { font-size: 13px !important; }

  .win-window .window-actions button:not(.close) { display: none !important; }
  .win-window .win-titlebar { height: 40px !important; min-height: 40px !important; padding: 0 8px 0 12px !important; }
  .win-window .title-left strong { font-size: 13px !important; }
  .win-window .title-icon { width: 28px !important; height: 28px !important; border-radius: 9px !important; background: var(--desktop-accent, #7c3aed) !important; color: #fff !important; }
  .win-window .window-actions .close { width: 34px !important; height: 34px !important; border-radius: 11px !important; }
  .win-window { height: calc(100svh - 64px) !important; inset: 0 0 64px 0 !important; }

  .win-desktop { padding: 22px 12px 76px !important; }
  .desktop-icons { width: 100% !important; max-width: none !important; padding: 18px 4px 0 !important; grid-template-columns: repeat(3, minmax(0, 1fr)) !important; justify-content: stretch !important; gap: 18px 6px !important; }
  .desktop-shortcut { width: 100% !important; min-height: 96px !important; gap: 8px !important; padding: 6px 2px !important; }
  .desktop-shortcut-icon { width: 52px !important; height: 52px !important; border-radius: 16px !important; background: linear-gradient(135deg, var(--desktop-accent, #7c3aed), color-mix(in srgb, var(--desktop-accent, #7c3aed) 58%, #020617)) !important; color: #fff !important; }
  .desktop-shortcut:nth-child(2) .desktop-shortcut-icon { background: linear-gradient(135deg, var(--desktop-accent, #7c3aed), color-mix(in srgb, var(--desktop-accent, #7c3aed) 58%, #020617)) !important; }
  .desktop-shortcut-icon svg { width: 28px !important; height: 28px !important; stroke: currentColor !important; color: currentColor !important; }
  .desktop-shortcut span { max-width: 84px !important; font-size: 12px !important; line-height: 1.1 !important; }

  .taskbar { left: 10px !important; right: 10px !important; bottom: 8px !important; height: 54px !important; padding: 5px !important; border-radius: 18px !important; }
  .taskbar .task-start, .taskbar .a3-mobile-account-button { border-radius: 14px !important; font-size: 10px !important; }
  .taskbar .task-start svg, .taskbar .a3-mobile-account-button svg { width: 19px !important; height: 19px !important; }

  .scoreboard-app { font-size: 12px !important; }
  .scoreboard-main { height: 100% !important; overflow-y: auto !important; }

  .scoreboard-header { position: sticky !important; top: 0 !important; z-index: 35 !important; display: grid !important; grid-template-columns: minmax(0, 1fr) 42px !important; align-items: center !important; gap: 8px !important; padding: 8px 10px 9px !important; border-radius: 0 !important; min-height: 56px !important; }
  .scoreboard-header > div:first-child { display: none !important; }
  .scoreboard-header h1, .scoreboard-header p, .scoreboard-header .app-eyebrow { display: none !important; }
  .scoreboard-tabs { grid-column: 1 !important; grid-row: 1 !important; width: 100% !important; height: 42px !important; margin: 0 !important; padding: 4px !important; border-radius: 17px !important; display: grid !important; grid-template-columns: 1fr 1fr !important; }
  .scoreboard-tabs button { min-height: 34px !important; height: 34px !important; border-radius: 13px !important; font-size: 12px !important; padding: 0 6px !important; white-space: nowrap !important; }
  .a3-score-filter-button { grid-column: 2 !important; grid-row: 1 !important; width: 42px !important; height: 42px !important; margin: 0 !important; border-radius: 14px !important; background: rgba(255,255,255,.055) !important; }
  .a3-score-filter-button::after { content: ""; }

  .scoreboard-left-tools { inset: 40px auto 64px 0 !important; width: min(88vw, 318px) !important; padding: 12px !important; }
  .scoreboard-left-tools .left-tools-title strong { font-size: 18px !important; }
  .scoreboard-left-tools .score-filter span, .scoreboard-left-tools .left-mini-title { font-size: 11px !important; }
  .scoreboard-left-tools select, .scoreboard-left-tools button { font-size: 12px !important; }

  .scoreboard-actionbar { display: none !important; }
  .scoreboard-actionbar.mobile-tools-menu { display: block !important; position: static !important; padding: 0 !important; margin: 12px 0 0 !important; border: 0 !important; background: transparent !important; overflow: visible !important; }
  .scoreboard-actionbar.mobile-tools-menu .toolbar-actions { width: 100% !important; min-width: 0 !important; display: grid !important; grid-template-columns: 1fr !important; gap: 8px !important; }
  .scoreboard-actionbar.mobile-tools-menu .toolbar-button { width: 100% !important; min-height: 40px !important; justify-content: flex-start !important; padding: 0 12px !important; border-radius: 13px !important; font-size: 12px !important; }
  .a3-mobile-tools-title { margin: 14px 0 8px !important; color: var(--score-muted, #94a3b8) !important; font-size: 11px !important; font-weight: 950 !important; letter-spacing: .08em !important; text-transform: uppercase !important; }

  .scoreboard-content { padding: 8px 8px 72px !important; }
  .score-panel { border-radius: 18px !important; }
  .section-heading strong, .table-title { font-size: 16px !important; }

  .overview-feature-grid { display: flex !important; flex-direction: column !important; gap: 10px !important; }
  .ranking-podium, .chart-panel { width: 100% !important; min-width: 0 !important; }

  .ranking-podium .podium-grid, .podium-grid { gap: 8px !important; grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
  .ranking-podium .podium-card, .podium-card { min-width: 0 !important; padding: 10px 4px !important; }
  .ranking-podium .podium-card strong, .podium-card strong { max-width: 84px !important; font-size: 11px !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; }
  .ranking-podium .podium-score, .podium-score { font-size: 12px !important; }

  .chart-panel { overflow: hidden !important; }
  .group-chart-modern { height: 210px !important; width: 100% !important; margin: 0 auto !important; padding: 8px 0 0 !important; overflow: hidden !important; }
  .chart-axis-labels { left: 6px !important; width: 26px !important; font-size: 10px !important; text-align: right !important; }
  .chart-grid-lines { left: 38px !important; right: 10px !important; }
  .chart-columns-area { left: 38px !important; right: 10px !important; display: grid !important; grid-template-columns: repeat(4, minmax(0, 1fr)) !important; align-items: stretch !important; justify-items: center !important; gap: 4px !important; }
  .chart-modern-column { width: 100% !important; min-width: 0 !important; display: grid !important; justify-items: center !important; text-align: center !important; }
  .chart-modern-track { width: 42px !important; height: 118px !important; margin: 0 auto !important; }
  .chart-modern-bar { width: 42px !important; border-radius: 10px !important; left: 50% !important; transform: translateX(-50%) !important; }
  .chart-value { font-size: 11px !important; padding: 2px 7px !important; }
  .chart-modern-column strong { font-size: 14px !important; margin-top: 5px !important; }
  .chart-modern-column small { max-width: 62px !important; font-size: 9px !important; line-height: 1.15 !important; text-align: center !important; }

  .ordered-groups, .group-overview-grid.ordered-groups { display: flex !important; flex-direction: row !important; gap: 10px !important; overflow-x: auto !important; scroll-snap-type: x mandatory !important; -webkit-overflow-scrolling: touch !important; padding: 0 2px 8px !important; }
  .ordered-groups::-webkit-scrollbar { display: none !important; }
  .ordered-group-card, .group-overview-card.ordered-group-card { flex: 0 0 calc(100vw - 20px) !important; width: calc(100vw - 20px) !important; max-width: calc(100vw - 20px) !important; scroll-snap-align: start !important; transform: none !important; }
  .group-overview-title { height: 34px !important; display: grid !important; place-items: center !important; font-size: 15px !important; touch-action: pan-x !important; }
  .compact-score-table th { font-size: 9px !important; padding: 7px 5px !important; }
  .compact-score-table td { font-size: 11px !important; padding: 7px 5px !important; }
  .compact-score-table .student-name-button { max-width: 130px !important; font-size: 11px !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; }
  .status-pill { font-size: 9px !important; min-width: 42px !important; padding: 3px 7px !important; }

  .score-page, .overview-compact-page { gap: 10px !important; }
  .score-detail-table tr { padding: 13px !important; border-radius: 16px !important; }
  .score-detail-table .detail-name { font-size: 16px !important; }
  .score-detail-table td:nth-child(n+3):nth-child(-n+8)::before { font-size: 10px !important; }
  .event-line { font-size: 12px !important; }
  .score-detail-table .edit-score-button { width: 44px !important; height: 44px !important; }
}
`;

function installCss() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

function isMobile() {
  return window.matchMedia?.("(max-width: 760px)").matches;
}

function moveActionbarIntoMenu() {
  const actionbar = document.querySelector<HTMLElement>(".scoreboard-actionbar");
  const aside = document.querySelector<HTMLElement>(".scoreboard-left-tools");
  if (!actionbar || !aside) return;

  if (isMobile()) {
    if (!originalActionbarParent) {
      originalActionbarParent = actionbar.parentNode;
      originalActionbarNext = actionbar.nextSibling;
    }
    actionbar.classList.add(TOOLS_MENU_CLASS);
    let title = aside.querySelector<HTMLElement>(`.${TOOLS_TITLE_CLASS}`);
    if (!title) {
      title = document.createElement("div");
      title.className = TOOLS_TITLE_CLASS;
      title.textContent = "Công cụ";
    }
    if (title.parentNode !== aside) aside.appendChild(title);
    if (actionbar.parentNode !== aside) aside.appendChild(actionbar);
    return;
  }

  actionbar.classList.remove(TOOLS_MENU_CLASS);
  document.querySelector(`.${TOOLS_TITLE_CLASS}`)?.remove();
  if (originalActionbarParent && actionbar.parentNode !== originalActionbarParent) {
    originalActionbarParent.insertBefore(actionbar, originalActionbarNext);
  }
}

function run() {
  moveActionbarIntoMenu();
}

function installBehavior() {
  const observer = new MutationObserver(() => window.requestAnimationFrame(run));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  run();
  window.addEventListener("resize", run);
}

if (typeof window !== "undefined") {
  installCss();
  installBehavior();
}

export {};
