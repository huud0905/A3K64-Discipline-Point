function clampProfileScroll() {
  const clamp = () => {
    document.querySelectorAll<HTMLElement>('.profile-main,.profile-super-main,.profile-super-window,.win-window').forEach((el) => {
      const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);
      if (el.scrollTop > maxTop) el.scrollTop = maxTop;
    });
  };

  window.requestAnimationFrame(clamp);
  window.setTimeout(() => window.requestAnimationFrame(clamp), 0);
  window.setTimeout(() => window.requestAnimationFrame(clamp), 80);
}

function installProfileWeekTableFix() {
  window.addEventListener(
    'click',
    (event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      if (target.closest('.profile-week-check')) {
        // Không stopPropagation ở đây, nếu không React sẽ không nhận onChange của checkbox.
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

  window.addEventListener(
    'change',
    (event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.profile-week-check')) clampProfileScroll();
    },
    true,
  );

  window.addEventListener('resize', clampProfileScroll);
}

function injectProfileWeekTableCss() {
  if (document.getElementById('a3k64-profile-week-table-fix-css')) return;
  const style = document.createElement('style');
  style.id = 'a3k64-profile-week-table-fix-css';
  style.textContent = `
    .profile-week-radio{display:none!important}
    .profile-status-radio-cell{display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:0!important;min-width:0!important}
    .profile-week-table tbody tr{cursor:pointer!important}
    .profile-week-table .profile-week-check,.profile-week-table .profile-week-check *{cursor:pointer!important}
    .profile-main{overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain!important;scrollbar-gutter:stable!important;background:var(--profile-bg)!important}
    .profile-page{min-height:auto!important;display:grid!important;gap:14px!important;align-content:start!important;grid-auto-rows:max-content!important;padding-bottom:18px!important;background:var(--profile-bg)!important}
    .profile-page>.profile-card:last-child{flex:none!important;display:block!important;margin-bottom:0!important;min-height:0!important;height:auto!important;background:var(--profile-panel)!important}
    .profile-page>.profile-card:last-child>.profile-table-wrap{flex:none!important;min-height:0!important;height:auto!important;max-height:none!important;background:var(--profile-panel)!important}
    .profile-page>.profile-card:last-child>.profile-table-wrap table{height:auto!important}
    .profile-table-wrap{max-height:none!important;height:auto!important}
  `;
  document.head.appendChild(style);
}

injectProfileWeekTableCss();
installProfileWeekTableFix();

export {};