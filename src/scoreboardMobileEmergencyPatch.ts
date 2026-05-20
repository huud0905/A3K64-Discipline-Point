const STYLE_ID = "a3k64-mobile-emergency-patch";

const CSS = `
@media (min-width: 761px) {
  .a3-score-filter-button,
  .a3-score-filter-close {
    display: none !important;
  }
}

@media (max-width: 760px) {
  .scoreboard-app:not(.mobile-filter-open) .a3-score-filter-close {
    display: none !important;
  }

  .scoreboard-app.mobile-filter-open .a3-score-filter-close {
    position: fixed !important;
    top: 50px !important;
    left: calc(min(calc(100vw - 58px), 318px) - 48px) !important;
    right: auto !important;
    bottom: auto !important;
    z-index: 260 !important;
    width: 38px !important;
    height: 38px !important;
    min-width: 38px !important;
    min-height: 38px !important;
    max-width: 38px !important;
    max-height: 38px !important;
    margin: 0 !important;
    padding: 0 !important;
    border-radius: 13px !important;
    display: grid !important;
    place-items: center !important;
    color: transparent !important;
    font-size: 0 !important;
    line-height: 0 !important;
    overflow: hidden !important;
    background: rgba(239, 68, 68, .18) !important;
    border: 1px solid rgba(248, 113, 113, .5) !important;
    box-shadow: 0 14px 32px rgba(0,0,0,.32) !important;
  }

  .scoreboard-app.mobile-filter-open .a3-score-filter-close::before,
  .scoreboard-app.mobile-filter-open .a3-score-filter-close::after {
    content: "" !important;
    position: absolute !important;
    left: 10px !important;
    top: 18px !important;
    width: 18px !important;
    height: 2px !important;
    border-radius: 999px !important;
    background: #fecaca !important;
  }

  .scoreboard-app.mobile-filter-open .a3-score-filter-close::before { transform: rotate(45deg) !important; }
  .scoreboard-app.mobile-filter-open .a3-score-filter-close::after { transform: rotate(-45deg) !important; }

  .scoreboard-left-tools {
    padding-top: 54px !important;
    padding-bottom: 90px !important;
  }

  .student-table-panel.compact-split-panel .compact-split-grid,
  .compact-split-grid {
    display: block !important;
    grid-template-columns: none !important;
    gap: 0 !important;
  }

  .compact-split-grid .compact-table-wrap,
  .student-table-panel .compact-table-wrap {
    width: 100% !important;
    margin: 0 !important;
    overflow: hidden !important;
  }

  .compact-split-grid .compact-table-wrap + .compact-table-wrap {
    margin-top: 0 !important;
    border-top: 0 !important;
  }

  .compact-split-grid .compact-table-wrap + .compact-table-wrap thead {
    display: none !important;
  }

  .compact-score-table,
  .compact-score-table thead,
  .compact-score-table tbody {
    display: block !important;
    width: 100% !important;
  }

  .compact-score-table thead tr,
  .compact-score-table tbody tr {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) 38px 30px 42px !important;
    column-gap: 0 !important;
    align-items: center !important;
    width: 100% !important;
  }

  .compact-score-table th,
  .compact-score-table td {
    display: block !important;
    min-width: 0 !important;
    width: auto !important;
    box-sizing: border-box !important;
    border-left: 0 !important;
    border-right: 0 !important;
  }

  .compact-score-table th:nth-child(1),
  .compact-score-table td:nth-child(1) {
    display: none !important;
  }

  .compact-score-table th:nth-child(2),
  .compact-score-table td:nth-child(2) {
    grid-column: 1 !important;
    padding-left: 8px !important;
    padding-right: 4px !important;
    text-align: left !important;
  }

  .compact-score-table th:nth-child(3),
  .compact-score-table td:nth-child(3) {
    grid-column: 2 !important;
    width: 38px !important;
    max-width: 38px !important;
    padding-left: 0 !important;
    padding-right: 0 !important;
    text-align: center !important;
  }

  .compact-score-table th:nth-child(4),
  .compact-score-table td:nth-child(4) {
    grid-column: 3 !important;
    width: 30px !important;
    max-width: 30px !important;
    padding-left: 0 !important;
    padding-right: 0 !important;
    text-align: center !important;
  }

  .compact-score-table th:nth-child(5),
  .compact-score-table td:nth-child(5) {
    grid-column: 4 !important;
    width: 42px !important;
    max-width: 42px !important;
    padding-left: 0 !important;
    padding-right: 4px !important;
    text-align: center !important;
  }

  .compact-score-table th {
    font-size: 8px !important;
    line-height: 1 !important;
    letter-spacing: .03em !important;
    white-space: nowrap !important;
  }

  .compact-score-table td {
    font-size: 10.5px !important;
    line-height: 1.15 !important;
  }

  .compact-score-table .student-name-button {
    display: block !important;
    width: 100% !important;
    max-width: none !important;
    min-width: 0 !important;
    text-align: left !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    font-size: 11.5px !important;
    line-height: 1.15 !important;
  }

  .compact-score-table .student-role {
    display: none !important;
  }

  .compact-score-table .score-positive,
  .compact-score-table .score-negative,
  .compact-score-table .rank-text {
    display: block !important;
    width: 100% !important;
    font-size: 10px !important;
    white-space: nowrap !important;
  }

  .compact-score-table .status-pill {
    min-width: 0 !important;
    width: 36px !important;
    max-width: 36px !important;
    padding: 3px 2px !important;
    font-size: 7.8px !important;
    line-height: 1 !important;
    border-radius: 999px !important;
  }
}
`;

function installCss() {
  const old = document.getElementById(STYLE_ID);
  if (old) old.remove();
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

function normalizeCloseButton() {
  const aside = document.querySelector<HTMLElement>(".scoreboard-left-tools");
  const close = aside?.querySelector<HTMLButtonElement>(".a3-score-filter-close");
  if (!aside || !close) return;

  close.textContent = "";
  close.setAttribute("aria-label", "Đóng bộ lọc");
  close.setAttribute("title", "Đóng bộ lọc");

  if (aside.firstElementChild !== close) {
    aside.insertBefore(close, aside.firstChild);
  }
}

function run() {
  normalizeCloseButton();
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
