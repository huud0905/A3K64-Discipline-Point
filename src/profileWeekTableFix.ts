function installProfileWeekTableFix() {
  window.addEventListener(
    'click',
    (event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      // Checkbox lịch sử chỉ dùng để chọn nhiều tuần xem lịch sử, không đổi tuần hồ sơ.
      if (target.closest('.profile-week-check')) {
        event.stopPropagation();
        return;
      }

      // Bấm vào dòng tuần thì đổi hồ sơ phía trên sang tuần đó.
      const row = target.closest<HTMLTableRowElement>('.profile-week-table tbody tr');
      if (!row) return;

      const radio = row.querySelector<HTMLInputElement>('.profile-week-radio input[type="radio"]');
      if (radio && !radio.checked) radio.click();
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
    .profile-main{overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:auto!important;scrollbar-gutter:stable!important;background:var(--profile-bg)!important}
    .profile-page{min-height:0!important;height:auto!important;display:grid!important;gap:14px!important;align-content:start!important;grid-auto-rows:max-content!important;padding-bottom:18px!important;margin:0!important;background:var(--profile-bg)!important}
    .profile-card{min-height:0!important}
    .profile-page>.profile-card:last-child{display:block!important;margin-bottom:18px!important;min-height:0!important;height:auto!important;background:var(--profile-panel)!important}
    .profile-page>.profile-card:last-child>.profile-table-wrap{min-height:0!important;height:auto!important;max-height:none!important;background:var(--profile-panel)!important}
    .profile-page>.profile-card:last-child>.profile-table-wrap table{height:auto!important}
    .profile-table-wrap{max-height:none!important;height:auto!important}
    .profile-app-shell,.profile-app-shell *{overflow-anchor:auto!important}
  `;
  document.head.appendChild(style);
}

injectProfileWeekTableCss();
installProfileWeekTableFix();

export {};