function weekFromText(text: string) {
  const match = text.match(/(?:T|Tuần)\s*(\d+)/i);
  return match ? Number(match[1]) : null;
}

function getHistoryChipButtons() {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.profile-history-week-chips button'));
}

function findHistoryChip(week: number) {
  return getHistoryChipButtons().find((button) => weekFromText(button.textContent || '') === week) || null;
}

function chipIsSelected(button: HTMLButtonElement | null) {
  if (!button) return false;
  return button.classList.contains('selected') || button.getAttribute('aria-pressed') === 'true';
}

function syncInlineHistoryColumn() {
  const table = document.querySelector<HTMLTableElement>('.profile-week-table');
  if (!table) return;

  const headRow = table.querySelector<HTMLTableRowElement>('thead tr');
  if (!headRow) return;

  const lastHead = headRow.lastElementChild as HTMLElement | null;
  if (!lastHead || lastHead.textContent?.trim() !== 'Lịch sử') {
    const th = document.createElement('th');
    th.className = 'profile-history-inline-head';
    th.textContent = 'Lịch sử';
    headRow.appendChild(th);
  }

  table.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach((row) => {
    const firstCell = row.cells[0];
    const week = weekFromText(firstCell?.textContent || '');
    if (!week) return;

    let cell = row.querySelector<HTMLTableCellElement>('td.profile-history-inline-cell');
    if (!cell) {
      cell = document.createElement('td');
      cell.className = 'profile-history-inline-cell';
      row.appendChild(cell);
    }

    let button = cell.querySelector<HTMLButtonElement>('button.profile-history-inline-toggle');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'profile-history-inline-toggle';
      button.setAttribute('aria-label', `Chọn tuần ${week} để xem lịch sử`);
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const chip = findHistoryChip(week);
        chip?.click();
        window.setTimeout(syncInlineHistoryColumn, 0);
      });
      cell.appendChild(button);
    }

    const chip = findHistoryChip(week);
    const selected = chipIsSelected(chip);
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    button.innerHTML = selected ? '<span>✓</span>' : '<span></span>';
  });
}

function installProfileHistoryInlineSelector() {
  let raf = 0;
  const schedule = () => {
    if (raf) return;
    raf = window.requestAnimationFrame(() => {
      raf = 0;
      syncInlineHistoryColumn();
    });
  };

  window.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.profile-history-week-chips') || target?.closest('.profile-week-table') || target?.closest('.profile-week-picker')) {
      window.setTimeout(schedule, 0);
    }
  }, true);

  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-pressed'] });
  schedule();
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
    .profile-history-week-chips{display:none!important}
    .profile-week-picker{width:auto!important;min-width:310px!important;max-width:min(680px,calc(100vw - 42px))!important}
    .profile-week-picker div{display:grid!important;grid-template-rows:repeat(9,auto)!important;grid-auto-flow:column!important;grid-auto-columns:minmax(112px,1fr)!important;gap:8px!important;align-items:stretch!important}
    .profile-week-picker button{width:100%!important;text-align:left!important;justify-content:flex-start!important;border-radius:10px!important;padding:9px 12px!important}
    .profile-history-inline-head,.profile-history-inline-cell{text-align:center!important;width:82px!important}
    .profile-history-inline-toggle{width:20px!important;height:20px!important;border:2px solid var(--profile-border)!important;border-radius:7px!important;display:inline-grid!important;place-items:center!important;padding:0!important;background:var(--profile-panel)!important;color:white!important;cursor:pointer!important;box-shadow:inset 0 0 0 2px var(--profile-panel)!important;line-height:1!important;vertical-align:middle!important}
    .profile-history-inline-toggle:hover{border-color:var(--desktop-accent,#2563eb)!important}
    .profile-history-inline-toggle.selected{border-color:#ef4444!important;background:#ef4444!important;box-shadow:inset 0 0 0 2px #ef4444!important}
    .profile-history-inline-toggle span{display:grid!important;place-items:center!important;width:100%!important;height:100%!important;color:white!important;font-size:13px!important;font-weight:950!important;line-height:1!important;pointer-events:none!important}
    .profile-main{overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:auto!important;scrollbar-gutter:stable!important;background:var(--profile-bg)!important}
    .profile-page{min-height:0!important;height:auto!important;display:grid!important;gap:14px!important;align-content:start!important;grid-auto-rows:max-content!important;padding-bottom:18px!important;margin:0!important;background:var(--profile-bg)!important}
    .profile-card{min-height:0!important}
    .profile-page>.profile-card:last-child{display:block!important;margin-bottom:18px!important;min-height:0!important;height:auto!important;background:var(--profile-panel)!important}
    .profile-page>.profile-card:last-child>.profile-table-wrap{min-height:0!important;height:auto!important;max-height:none!important;background:var(--profile-panel)!important}
    .profile-page>.profile-card:last-child>.profile-table-wrap table{height:auto!important}
    .profile-table-wrap{max-height:none!important;height:auto!important}
    .profile-app-shell,.profile-app-shell *{overflow-anchor:auto!important}
    @media(max-width:720px){.profile-week-picker{min-width:260px!important}.profile-week-picker div{grid-template-rows:repeat(9,auto)!important;grid-auto-columns:minmax(96px,1fr)!important}.profile-week-picker button{padding:8px 10px!important}}
  `;
  document.head.appendChild(style);
}

injectProfileWeekTableCss();
installProfileHistoryInlineSelector();

export {};