let historyScrollTimer = 0;

function getProfileScroller(element: HTMLElement) {
  return (
    element.closest<HTMLElement>('.profile-main') ||
    element.closest<HTMLElement>('.win-body') ||
    element.closest<HTMLElement>('.win-window') ||
    document.scrollingElement as HTMLElement | null
  );
}

function scrollHistoryIntoView() {
  window.clearTimeout(historyScrollTimer);

  const run = () => {
    const historyCard = document.querySelector<HTMLElement>('.profile-page > .profile-card:last-child');
    if (!historyCard) return;

    const scroller = getProfileScroller(historyCard);
    const targetTop = Math.max(0, historyCard.offsetTop - 10);

    if (scroller && scroller !== document.documentElement && scroller !== document.body) {
      scroller.scrollTo({ top: targetTop, behavior: 'auto' });
    } else {
      historyCard.scrollIntoView({ block: 'start', behavior: 'auto' });
    }
  };

  window.requestAnimationFrame(run);
  historyScrollTimer = window.setTimeout(() => window.requestAnimationFrame(run), 70);
  window.setTimeout(() => window.requestAnimationFrame(run), 180);
}

function installProfileWeekTableFix() {
  window.addEventListener(
    'click',
    (event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      if (target.closest('.profile-week-check')) {
        scrollHistoryIntoView();
        return;
      }

      const row = target.closest<HTMLTableRowElement>('.profile-week-table tbody tr');
      if (!row) return;

      const radio = row.querySelector<HTMLInputElement>('.profile-week-radio input[type="radio"]');
      if (radio && !radio.checked) radio.click();
    },
    true,
  );

  window.addEventListener(
    'change',
    (event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.profile-week-check')) scrollHistoryIntoView();
    },
    true,
  );
}

function injectProfileWeekTableCss() {
  const oldStyle = document.getElementById('a3k64-profile-week-table-fix-css');
  oldStyle?.remove();

  const style = document.createElement('style');
  style.id = 'a3k64-profile-week-table-fix-css';
  style.textContent = `
    .profile-week-radio{display:none!important}
    .profile-status-radio-cell{display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:0!important;min-width:0!important}
    .profile-week-table tbody tr{cursor:pointer!important}
    .profile-week-table .profile-week-check,.profile-week-table .profile-week-check *{cursor:pointer!important}
    .profile-main{overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain!important;scrollbar-gutter:stable!important;background:var(--profile-bg)!important}
    .profile-page{min-height:0!important;height:auto!important;display:grid!important;gap:14px!important;align-content:start!important;grid-auto-rows:max-content!important;padding-bottom:18px!important;margin:0!important;background:var(--profile-bg)!important}
    .profile-page>.profile-card:last-child{display:block!important;margin-bottom:18px!important;min-height:0!important;height:auto!important;background:var(--profile-panel)!important}
    .profile-page>.profile-card:last-child>.profile-table-wrap{min-height:0!important;height:auto!important;max-height:none!important;background:var(--profile-panel)!important}
    .profile-page>.profile-card:last-child>.profile-table-wrap table{height:auto!important}
    .profile-table-wrap{max-height:none!important;height:auto!important}
    .profile-app-shell,.profile-app-shell *{overflow-anchor:none!important}
  `;
  document.head.appendChild(style);
}

injectProfileWeekTableCss();
installProfileWeekTableFix();

export {};