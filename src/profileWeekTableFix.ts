let clampRaf = 0;
let internalClamp = false;

function getProfileContentMaxScroll(main: HTMLElement) {
  const page = main.querySelector<HTMLElement>('.profile-page');
  if (!page) return Math.max(0, main.scrollHeight - main.clientHeight);

  const pageRect = page.getBoundingClientRect();
  const children = Array.from(page.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
  const lastChild = children.at(-1);
  if (!lastChild) return Math.max(0, main.scrollHeight - main.clientHeight);

  const lastRect = lastChild.getBoundingClientRect();
  const pageStyle = window.getComputedStyle(page);
  const paddingBottom = Number.parseFloat(pageStyle.paddingBottom || '0') || 0;
  const realContentBottom = lastRect.bottom - pageRect.top + paddingBottom;

  return Math.max(0, realContentBottom - main.clientHeight);
}

function clampProfileScrollNow() {
  if (internalClamp) return;
  internalClamp = true;
  try {
    document.querySelectorAll<HTMLElement>('.profile-main').forEach((main) => {
      const maxTop = getProfileContentMaxScroll(main);
      if (main.scrollTop > maxTop) main.scrollTop = maxTop;
    });
  } finally {
    internalClamp = false;
  }
}

function clampProfileScroll() {
  if (clampRaf) window.cancelAnimationFrame(clampRaf);
  clampRaf = window.requestAnimationFrame(() => {
    clampRaf = 0;
    clampProfileScrollNow();
  });
  window.setTimeout(() => window.requestAnimationFrame(clampProfileScrollNow), 0);
  window.setTimeout(() => window.requestAnimationFrame(clampProfileScrollNow), 80);
  window.setTimeout(() => window.requestAnimationFrame(clampProfileScrollNow), 180);
}

function installProfileWeekTableFix() {
  window.addEventListener(
    'click',
    (event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      if (target.closest('.profile-week-check')) {
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

  window.addEventListener(
    'scroll',
    (event) => {
      const target = event.target as HTMLElement | null;
      if (!target?.classList?.contains('profile-main')) return;
      clampProfileScroll();
    },
    true,
  );

  window.addEventListener('resize', clampProfileScroll);

  const observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.target instanceof HTMLElement && mutation.target.closest?.('.profile-app-shell'))) clampProfileScroll();
  });
  observer.observe(document.body, { childList: true, subtree: true });
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
    .profile-page{min-height:0!important;height:auto!important;display:grid!important;gap:14px!important;align-content:start!important;grid-auto-rows:max-content!important;padding-bottom:18px!important;margin-bottom:0!important;background:var(--profile-bg)!important}
    .profile-page>.profile-card:last-child{flex:none!important;display:block!important;margin-bottom:0!important;min-height:0!important;height:auto!important;background:var(--profile-panel)!important}
    .profile-page>.profile-card:last-child>.profile-table-wrap{flex:none!important;min-height:0!important;height:auto!important;max-height:none!important;background:var(--profile-panel)!important}
    .profile-page>.profile-card:last-child>.profile-table-wrap table{height:auto!important}
    .profile-table-wrap{max-height:none!important;height:auto!important}
    .profile-app-shell,.profile-app-shell *{overflow-anchor:none!important}
  `;
  document.head.appendChild(style);
}

function installExtensionNoiseGuard() {
  window.addEventListener(
    'error',
    (event) => {
      const filename = String(event.filename || '');
      const message = String(event.message || '');
      if (filename.startsWith('chrome-extension://') || message.includes('chrome-extension://')) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
}

injectProfileWeekTableCss();
installExtensionNoiseGuard();
installProfileWeekTableFix();
clampProfileScroll();

export {};