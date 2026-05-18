const STYLE_ID = "a3k64-scoreboard-mobile-polish";
const FILTER_BUTTON_CLASS = "a3-score-filter-button";
const FILTER_CLOSE_CLASS = "a3-score-filter-close";

const CSS = `
@media (max-width: 760px) {
  .win-window .window-actions button:not(.close) {
    display: none !important;
  }

  .win-window .title-icon {
    color: #fff !important;
    background: color-mix(in srgb, var(--desktop-accent, #2563eb) 88%, #0f172a) !important;
  }

  .win-window .title-icon svg,
  .desktop-shortcut-icon svg,
  .taskbar svg {
    color: currentColor !important;
    stroke: currentColor !important;
  }

  .desktop-shortcut-icon {
    background: color-mix(in srgb, var(--desktop-accent, #2563eb) 88%, #0f172a) !important;
    color: #fff !important;
  }

  .desktop-shortcut:nth-child(2) .desktop-shortcut-icon {
    background: color-mix(in srgb, var(--desktop-accent, #2563eb) 88%, #0f172a) !important;
  }

  .scoreboard-app {
    display: block !important;
    height: 100% !important;
    min-height: 0 !important;
    overflow: hidden !important;
    position: relative !important;
  }

  .scoreboard-left-tools {
    position: fixed !important;
    inset: 46px auto 76px 0 !important;
    width: min(86vw, 320px) !important;
    z-index: 65 !important;
    transform: translateX(-105%) !important;
    transition: transform .2s ease !important;
    border-radius: 0 22px 22px 0 !important;
    box-shadow: 18px 0 60px rgba(0,0,0,.32) !important;
    overflow-y: auto !important;
  }

  .scoreboard-app.mobile-filter-open .scoreboard-left-tools {
    transform: translateX(0) !important;
  }

  .scoreboard-app.mobile-filter-open::before {
    content: "";
    position: fixed;
    inset: 46px 0 76px;
    z-index: 60;
    background: rgba(2, 6, 23, .58);
    backdrop-filter: blur(4px);
  }

  .a3-score-filter-button {
    width: 42px;
    height: 42px;
    border: 1px solid var(--score-border, rgba(148,163,184,.22));
    border-radius: 14px;
    display: grid;
    place-items: center;
    color: var(--score-text, #f8fafc);
    background: rgba(255,255,255,.06);
    margin-left: auto;
  }

  .a3-score-filter-close {
    width: 100%;
    min-height: 42px;
    margin: 10px 0 2px;
    border: 1px solid var(--score-border, rgba(148,163,184,.22));
    border-radius: 14px;
    color: var(--score-text, #f8fafc);
    background: rgba(255,255,255,.06);
    font-weight: 900;
  }

  .scoreboard-main {
    height: 100% !important;
    overflow-y: auto !important;
  }

  .scoreboard-header {
    position: sticky !important;
    top: 0 !important;
    z-index: 30 !important;
    padding: 14px 12px !important;
    display: grid !important;
    grid-template-columns: 1fr auto !important;
    gap: 10px !important;
    align-items: start !important;
    border-radius: 0 !important;
  }

  .scoreboard-header h1 {
    font-size: 24px !important;
  }

  .scoreboard-header p,
  .app-eyebrow {
    display: none !important;
  }

  .scoreboard-tabs {
    grid-column: 1 / -1 !important;
    width: 100% !important;
    margin-top: 8px !important;
  }

  .scoreboard-actionbar {
    padding: 8px 12px !important;
    overflow-x: auto !important;
    border-radius: 0 !important;
  }

  .toolbar-actions {
    width: max-content !important;
    min-width: 100% !important;
    justify-content: flex-start !important;
    gap: 8px !important;
  }

  .toolbar-button {
    min-height: 36px !important;
    padding: 0 12px !important;
    border-radius: 12px !important;
    font-size: 12px !important;
  }

  .scoreboard-content {
    padding: 10px 10px 88px !important;
  }

  .overview-feature-grid,
  .group-overview-grid,
  .ordered-groups {
    display: flex !important;
    flex-direction: column !important;
    gap: 12px !important;
  }

  .overview-feature-grid > *,
  .ordered-group-card,
  .group-overview-card {
    width: 100% !important;
    min-width: 0 !important;
  }

  .ordered-group-card {
    transform: none !important;
  }

  .group-overview-title {
    touch-action: auto !important;
  }

  .score-table-wrap {
    overflow: visible !important;
  }

  .score-detail-table,
  .score-detail-table thead,
  .score-detail-table tbody,
  .score-detail-table tr,
  .score-detail-table td {
    display: block !important;
    width: 100% !important;
  }

  .score-detail-table thead {
    display: none !important;
  }

  .score-detail-table tr {
    position: relative !important;
    margin: 0 0 12px !important;
    padding: 16px !important;
    border: 1px solid var(--score-border, rgba(148,163,184,.22)) !important;
    border-radius: 18px !important;
    background: rgba(15, 23, 42, .72) !important;
  }

  .theme-light .score-detail-table tr {
    background: rgba(255,255,255,.86) !important;
  }

  .score-detail-table td {
    border: 0 !important;
    padding: 7px 0 !important;
  }

  .score-detail-table .table-index {
    position: absolute !important;
    top: 12px !important;
    right: 14px !important;
    width: 26px !important;
    height: 26px !important;
    border-radius: 8px !important;
    display: grid !important;
    place-items: center !important;
    background: rgba(148,163,184,.13) !important;
    color: var(--score-muted, #94a3b8) !important;
    font-weight: 900 !important;
  }

  .score-detail-table .student-cell {
    padding-right: 36px !important;
  }

  .score-detail-table .detail-name {
    font-size: 18px !important;
    white-space: normal !important;
  }

  .score-detail-table td:nth-child(3)::before { content: "Nội dung (+)"; }
  .score-detail-table td:nth-child(4)::before { content: "Điểm (+)"; }
  .score-detail-table td:nth-child(5)::before { content: "Nội dung (-)"; }
  .score-detail-table td:nth-child(6)::before { content: "Điểm (-)"; }
  .score-detail-table td:nth-child(7)::before { content: "Tổng điểm"; }
  .score-detail-table td:nth-child(8)::before { content: "Xếp loại"; }

  .score-detail-table td:nth-child(n+3):nth-child(-n+8)::before {
    display: block;
    margin-bottom: 5px;
    color: var(--score-muted, #94a3b8);
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .score-detail-table td:nth-child(9) {
    display: flex !important;
    justify-content: flex-end !important;
  }

  .score-detail-table .edit-score-button {
    width: 48px !important;
    height: 48px !important;
    border-radius: 14px !important;
  }

  .event-stack {
    gap: 5px !important;
  }

  .event-line {
    white-space: normal !important;
    line-height: 1.45 !important;
  }

  .score-edit-backdrop {
    align-items: stretch !important;
    padding: 0 !important;
  }

  .score-edit-modal {
    width: 100vw !important;
    height: calc(100svh - 76px) !important;
    max-height: none !important;
    border-radius: 0 !important;
    border: 0 !important;
  }

  .score-edit-header {
    padding: 14px 14px 12px !important;
  }

  .score-edit-header h2 {
    font-size: 18px !important;
  }

  .score-edit-body {
    display: block !important;
    height: calc(100% - 138px) !important;
    overflow-y: auto !important;
    padding: 10px 12px !important;
  }

  .score-week-table {
    display: none !important;
  }

  .day-tabs {
    display: grid !important;
    grid-auto-flow: column !important;
    grid-auto-columns: minmax(58px, 1fr) !important;
    overflow-x: auto !important;
    gap: 8px !important;
    margin-bottom: 10px !important;
  }

  .day-tabs button {
    min-height: 42px !important;
    border-radius: 14px !important;
  }

  .score-mobile-mode-tabs {
    display: grid !important;
    grid-template-columns: 1fr 1fr !important;
    gap: 8px !important;
    margin: 0 0 12px !important;
  }

  .score-mobile-mode-tabs button {
    min-height: 38px;
    border: 1px solid var(--score-border, rgba(148,163,184,.22));
    border-radius: 12px;
    color: var(--score-text, #f8fafc);
    background: rgba(255,255,255,.04);
    font-weight: 900;
  }

  .score-mobile-mode-tabs button.active {
    background: var(--score-accent, var(--desktop-accent, #2563eb));
    border-color: transparent;
    color: #fff;
  }

  .score-edit-columns {
    display: block !important;
  }

  .score-add-panel,
  .day-record-panel,
  .bulk-score-box,
  .score-custom-form {
    border-radius: 16px !important;
  }

  .mobile-hidden-section {
    display: none !important;
  }

  .rules-directory {
    display: none !important;
  }

  .rule-pick-row,
  .special-row {
    display: grid !important;
    grid-template-columns: 1fr !important;
    gap: 8px !important;
  }

  .rule-pick-row .count-box {
    width: 100% !important;
  }

  .rule-select-input,
  .bulk-score-box select,
  .bulk-score-box textarea,
  .special-score-form input {
    width: 100% !important;
    min-height: 44px !important;
    border: 1px solid var(--score-border, rgba(148,163,184,.22)) !important;
    border-radius: 12px !important;
    color: var(--score-text, #f8fafc) !important;
    background: rgba(2,6,23,.45) !important;
    padding: 0 12px !important;
    font-weight: 800 !important;
  }

  .theme-light .rule-select-input,
  .theme-light .bulk-score-box select,
  .theme-light .bulk-score-box textarea,
  .theme-light .special-score-form input {
    color: #0f172a !important;
    background: rgba(255,255,255,.86) !important;
  }

  .bulk-score-box {
    display: grid !important;
    gap: 8px !important;
    margin-top: 12px !important;
    padding: 14px !important;
    border: 1px solid var(--score-border, rgba(148,163,184,.22)) !important;
    background: rgba(255,255,255,.035) !important;
  }

  .bulk-score-box > span,
  .bulk-score-box small {
    color: var(--score-muted, #94a3b8) !important;
  }

  .bulk-student-list {
    max-height: 170px;
    overflow: auto;
    display: grid;
    gap: 6px;
  }

  .bulk-student-list label {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 8px;
    border-radius: 10px;
    background: rgba(148,163,184,.08);
    font-weight: 800;
  }

  .score-edit-footer {
    position: sticky !important;
    bottom: 0 !important;
    grid-template-columns: .6fr .6fr .9fr .7fr 1.2fr !important;
    padding: 10px 10px calc(10px + env(safe-area-inset-bottom)) !important;
    gap: 8px !important;
  }

  .score-edit-footer strong,
  .score-edit-footer button {
    min-height: 42px !important;
    border-radius: 12px !important;
    font-size: 12px !important;
  }

  .score-edit-footer button {
    padding: 0 10px !important;
  }
}

@media (min-width: 761px) {
  .score-mobile-mode-tabs {
    display: none !important;
  }

  .bulk-score-box,
  .special-score-form {
    margin-top: 12px;
  }

  .bulk-score-box {
    display: grid;
    gap: 8px;
    padding: 14px;
    border: 1px solid var(--score-border, rgba(148,163,184,.22));
    border-radius: 16px;
    background: rgba(255,255,255,.035);
  }

  .bulk-score-box select,
  .bulk-score-box textarea,
  .rule-select-input,
  .special-score-form input {
    border: 1px solid var(--score-border, rgba(148,163,184,.22));
    border-radius: 12px;
    color: var(--score-text, #f8fafc);
    background: rgba(2,6,23,.45);
    padding: 0 12px;
    font-weight: 800;
  }

  .rule-select-input,
  .special-score-form input,
  .bulk-score-box select {
    min-height: 42px;
  }

  .bulk-score-box textarea {
    min-height: 76px;
    padding-top: 10px;
  }

  .bulk-student-list {
    max-height: 150px;
    overflow: auto;
    display: grid;
    gap: 6px;
  }

  .bulk-student-list label {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 8px;
    border-radius: 10px;
    background: rgba(148,163,184,.08);
    font-weight: 800;
  }
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

function toggleFilter(open?: boolean) {
  const app = document.querySelector<HTMLElement>(".scoreboard-app");
  if (!app) return;
  app.classList.toggle("mobile-filter-open", open ?? !app.classList.contains("mobile-filter-open"));
}

function ensureFilterButton() {
  const header = document.querySelector<HTMLElement>(".scoreboard-header");
  if (!header || header.querySelector(`.${FILTER_BUTTON_CLASS}`)) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = FILTER_BUTTON_CLASS;
  button.title = "Bộ lọc";
  button.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/></svg>`;
  header.insertBefore(button, header.querySelector(".scoreboard-tabs"));
}

function ensureCloseButton() {
  const aside = document.querySelector<HTMLElement>(".scoreboard-left-tools");
  if (!aside || aside.querySelector(`.${FILTER_CLOSE_CLASS}`)) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = FILTER_CLOSE_CLASS;
  button.textContent = "Đóng bộ lọc";
  aside.appendChild(button);
}

function run() {
  if (!isMobile()) {
    toggleFilter(false);
    return;
  }
  ensureFilterButton();
  ensureCloseButton();
}

function installBehavior() {
  const observer = new MutationObserver(() => window.requestAnimationFrame(run));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  run();

  document.addEventListener(
    "click",
    (event) => {
      if (!isMobile()) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(`.${FILTER_BUTTON_CLASS}`)) {
        event.preventDefault();
        event.stopPropagation();
        toggleFilter();
      }
      if (target.closest(`.${FILTER_CLOSE_CLASS}`)) {
        event.preventDefault();
        event.stopPropagation();
        toggleFilter(false);
      }
      const app = document.querySelector<HTMLElement>(".scoreboard-app.mobile-filter-open");
      if (app && !target.closest(".scoreboard-left-tools") && !target.closest(`.${FILTER_BUTTON_CLASS}`)) {
        toggleFilter(false);
      }
    },
    true
  );
  window.addEventListener("resize", run);
}

if (typeof window !== "undefined") {
  installCss();
  installBehavior();
}

export {};
