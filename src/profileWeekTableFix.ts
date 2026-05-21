function clampProfileScroll() {
  window.requestAnimationFrame(() => {
    document.querySelectorAll<HTMLElement>('.profile-main').forEach((main) => {
      const maxTop = Math.max(0, main.scrollHeight - main.clientHeight);
      if (main.scrollTop > maxTop) main.scrollTop = maxTop;
    });
  });
}

function installProfileWeekTableFix() {
  window.addEventListener(
    'click',
    (event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      if (target.closest('.profile-week-check')) {
        event.stopPropagation();
        clampProfileScroll();
        return;
      }

      const row = target.closest<HTMLTableRowElement>('.profile-week-table tbody tr');
      if (!row) return;

      const radio = row.querySelector<HTMLInputElement>('.profile-week-radio input[type="radio"]');
      if (radio && !radio.checked) radio.click();
      clampProfileScroll();
    },
    true,
  );

  window.addEventListener('change', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.profile-week-check')) clampProfileScroll();
  }, true);
}

function injectProfileWeekTableCss() {
  if (document.getElementById('a3k64-profile-week-table-fix-css')) return;
  const style = document.createElement('style');
  style.id = 'a3k64-profile-week-table-fix-css';
  style.textContent = `
    .profile-week-radio{display:none!important}
    .profile-status-radio-cell{display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:0!important;min-width:0!important}
    .profile-week-table tbody tr{cursor:pointer!important}
    .profile-week-table .profile-week-check{cursor:pointer!important}
    .profile-page{min-height:auto!important;align-content:start!important;grid-auto-rows:max-content!important;padding-bottom:18px!important}
    .profile-main{overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain!important;scrollbar-gutter:stable!important}
    .profile-card:last-child{margin-bottom:0!important}
    .profile-table-wrap{max-height:none!important}
  `;
  document.head.appendChild(style);
}

injectProfileWeekTableCss();
installProfileWeekTableFix();

export {};