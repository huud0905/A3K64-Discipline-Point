const STYLE_ID = "a3k64-scoreboard-mobile-ocd-fix";

const CSS = `
@media (max-width: 760px) {
  .scoreboard-header {
    grid-template-columns: 42px minmax(0, 1fr) !important;
    gap: 7px !important;
    padding: 7px 8px 8px !important;
    min-height: 55px !important;
  }

  .a3-score-filter-button {
    grid-column: 1 !important;
    grid-row: 1 !important;
    width: 42px !important;
    height: 42px !important;
    margin: 0 !important;
    border-radius: 15px !important;
    background: rgba(255, 255, 255, .065) !important;
    border-color: rgba(148, 163, 184, .2) !important;
    box-shadow: inset 0 1px 0 rgba(255,255,255,.06) !important;
  }

  .scoreboard-tabs {
    grid-column: 2 !important;
    grid-row: 1 !important;
    height: 42px !important;
    min-width: 0 !important;
  }

  .scoreboard-tabs button {
    font-size: 11.5px !important;
    letter-spacing: -.01em !important;
  }

  .scoreboard-app.mobile-filter-open::before {
    inset: 40px 0 66px !important;
    z-index: 118 !important;
    background: rgba(2, 6, 23, .54) !important;
    backdrop-filter: blur(4px) !important;
  }

  .scoreboard-left-tools {
    inset: 40px auto 70px 0 !important;
    width: min(calc(100vw - 58px), 318px) !important;
    max-height: calc(100svh - 110px) !important;
    z-index: 130 !important;
    padding: 12px 12px 92px !important;
    border-radius: 0 20px 20px 0 !important;
    border-right: 1px solid rgba(148, 163, 184, .22) !important;
    background: rgba(8, 14, 28, .96) !important;
    overflow-y: auto !important;
    overscroll-behavior: contain !important;
  }

  .theme-light .scoreboard-left-tools,
  .win-root.theme-light .scoreboard-left-tools {
    background: rgba(248, 250, 252, .98) !important;
  }

  .scoreboard-left-tools .filter-select-trigger,
  .scoreboard-left-tools select,
  .scoreboard-left-tools button {
    min-height: 40px !important;
  }

  .a3-score-filter-close {
    position: sticky !important;
    bottom: 0 !important;
    margin-top: 12px !important;
    z-index: 2 !important;
    background: color-mix(in srgb, var(--desktop-accent, #7c3aed) 38%, #0f172a) !important;
  }

  .scoreboard-actionbar.mobile-tools-menu {
    margin: 10px 0 0 !important;
  }

  .scoreboard-actionbar.mobile-tools-menu .toolbar-actions {
    gap: 7px !important;
  }

  .scoreboard-actionbar.mobile-tools-menu .toolbar-button {
    min-height: 38px !important;
    font-size: 11.5px !important;
  }

  .scoreboard-content {
    padding: 8px 8px 76px !important;
  }

  .overview-feature-grid {
    display: flex !important;
    flex-direction: column !important;
    gap: 10px !important;
  }

  .ordered-groups,
  .group-overview-grid.ordered-groups {
    display: flex !important;
    flex-direction: column !important;
    gap: 10px !important;
    overflow-x: visible !important;
    overflow-y: visible !important;
    scroll-snap-type: none !important;
    padding: 0 !important;
  }

  .ordered-groups::-webkit-scrollbar {
    display: none !important;
  }

  .ordered-group-card,
  .group-overview-card.ordered-group-card {
    flex: 0 0 auto !important;
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    scroll-snap-align: none !important;
    transform: none !important;
  }

  .group-overview-title {
    touch-action: auto !important;
  }

  .chart-panel {
    overflow: hidden !important;
    padding-left: 10px !important;
    padding-right: 10px !important;
  }

  .group-chart-modern {
    min-height: 212px !important;
    height: 212px !important;
    width: 100% !important;
    display: grid !important;
    grid-template-columns: 30px minmax(0, 1fr) !important;
    gap: 4px !important;
    padding: 4px 2px 8px 0 !important;
    margin: 0 auto !important;
    position: relative !important;
    overflow: hidden !important;
  }

  .chart-axis-labels {
    grid-column: 1 !important;
    position: relative !important;
    height: 138px !important;
    margin-top: 6px !important;
    width: 30px !important;
    left: auto !important;
    top: auto !important;
  }

  .chart-axis-labels span {
    right: 2px !important;
    left: auto !important;
    font-size: 9px !important;
    line-height: 1 !important;
  }

  .chart-grid-lines {
    position: absolute !important;
    left: 34px !important;
    right: 4px !important;
    top: 10px !important;
    height: 138px !important;
  }

  .chart-columns-area {
    grid-column: 2 !important;
    position: relative !important;
    left: auto !important;
    right: auto !important;
    top: auto !important;
    bottom: auto !important;
    width: 100% !important;
    min-width: 0 !important;
    height: 186px !important;
    display: grid !important;
    grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
    gap: 2px !important;
    align-items: start !important;
    justify-items: stretch !important;
    z-index: 1 !important;
  }

  .chart-modern-column {
    min-width: 0 !important;
    width: 100% !important;
    display: grid !important;
    grid-template-rows: 138px auto auto !important;
    justify-items: center !important;
    align-items: start !important;
    text-align: center !important;
    gap: 2px !important;
  }

  .chart-modern-track {
    position: relative !important;
    width: 36px !important;
    height: 138px !important;
    margin: 0 auto !important;
  }

  .chart-modern-bar {
    width: 36px !important;
    min-height: 20px !important;
    max-height: 122px !important;
    border-radius: 10px !important;
    left: 50% !important;
    transform: translateX(-50%) !important;
    padding-top: 7px !important;
  }

  .chart-value {
    min-width: 34px !important;
    height: 19px !important;
    font-size: 10px !important;
    padding: 1px 5px !important;
  }

  .chart-modern-column strong {
    margin-top: 4px !important;
    font-size: 13px !important;
    line-height: 1 !important;
  }

  .chart-modern-column small {
    max-width: 56px !important;
    font-size: 8.5px !important;
    line-height: 1.08 !important;
    white-space: normal !important;
    overflow-wrap: anywhere !important;
  }

  .compact-score-table th {
    font-size: 8.8px !important;
    padding: 6px 4px !important;
  }

  .compact-score-table td {
    font-size: 10.5px !important;
    padding: 6px 4px !important;
  }

  .compact-score-table .student-name-button {
    max-width: 172px !important;
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

if (typeof window !== "undefined") installCss();

export {};
