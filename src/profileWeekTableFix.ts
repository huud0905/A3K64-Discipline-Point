function injectProfileWeekTableCss() {
  const oldStyle = document.getElementById('a3k64-profile-week-table-fix-css');
  oldStyle?.remove();

  const style = document.createElement('style');
  style.id = 'a3k64-profile-week-table-fix-css';
  style.textContent = `
    .profile-week-radio{display:none!important}
    .profile-status-radio-cell{display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:0!important;min-width:0!important}
    .profile-week-table tbody tr{cursor:pointer!important}
    .profile-week-toggle{width:20px!important;height:20px!important;border:2px solid var(--profile-border)!important;border-radius:7px!important;display:inline-grid!important;place-items:center!important;padding:0!important;background:var(--profile-panel)!important;color:white!important;cursor:pointer!important;box-shadow:inset 0 0 0 2px var(--profile-panel)!important;line-height:1!important}
    .profile-week-toggle.selected{border-color:#ef4444!important;background:#ef4444!important;box-shadow:inset 0 0 0 2px #ef4444!important}
    .profile-week-toggle span{display:grid!important;place-items:center!important;width:100%!important;height:100%!important;color:white!important;font-size:13px!important;font-weight:950!important;line-height:1!important;pointer-events:none!important}
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

export {};