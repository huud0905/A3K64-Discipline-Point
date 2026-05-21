let clampRaf = 0;
let internalClamp = false;

function getScrollInfo(container: HTMLElement) {
  const isDocumentScroller = container === document.documentElement || container === document.body || container === document.scrollingElement;
  return {
    top: isDocumentScroller ? window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0 : container.scrollTop,
    height: isDocumentScroller ? window.innerHeight : container.clientHeight,
    rectTop: isDocumentScroller ? 0 : container.getBoundingClientRect().top,
    setTop(value: number) {
      if (isDocumentScroller) window.scrollTo({ top: value, left: window.scrollX, behavior: 'auto' });
      else container.scrollTop = value;
    },
  };
}

function getProfileContentMaxScroll(container: HTMLElement) {
  const page = container.querySelector<HTMLElement>('.profile-page') || document.querySelector<HTMLElement>('.profile-page');
  if (!page) return Math.max(0, container.scrollHeight - container.clientHeight);

  const children = Array.from(page.children).filter((child): child is HTMLElement => child instanceof HTMLElement && child.offsetParent !== null);
  const lastChild = children.at(-1);
  if (!lastChild) return 0;

  const info = getScrollInfo(container);
  const lastRect = lastChild.getBoundingClientRect();
  const pageStyle = window.getComputedStyle(page);
  const paddingBottom = Number.parseFloat(pageStyle.paddingBottom || '0') || 0;
  const realContentBottomInViewport = lastRect.bottom + paddingBottom;
  const realContentBottomInContainerScroll = realContentBottomInViewport - info.rectTop + info.top;
  return Math.max(0, realContentBottomInContainerScroll - info.height);
}

function getProfileScrollContainers() {
  const containers = new Set<HTMLElement>();
  document.querySelectorAll<HTMLElement>('.profile-main,.win-body,.win-window,.win-root').forEach((item) => {
    if (item.querySelector('.profile-page')) containers.add(item);
  });
  if (document.querySelector('.profile-page')) {
    if (document.scrollingElement instanceof HTMLElement) containers.add(document.scrollingElement);
    containers.add(document.documentElement);
    containers.add(document.body);
  }
  return Array.from(containers);
}

function clampProfileScrollNow() {
  if (internalClamp) return;
  internalClamp = true;
  try {
    getProfileScrollContainers().forEach((container) => {
      const info = getScrollInfo(container);
      const maxTop = getProfileContentMaxScroll(container);
      if (info.top > maxTop + 2) info.setTop(maxTop);
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
  window.setTimeout(() => window.requestAnimationFrame(clampProfileScrollNow), 360);
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

  window.addEventListener('change', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.profile-app-shell')) clampProfileScroll();
  }, true);

  window.addEventListener('scroll', () => clampProfileScroll(), true);
  window.addEventListener('resize', clampProfileScroll);

  window.setInterval(() => {
    if (document.querySelector('.profile-page')) clampProfileScrollNow();
  }, 300);
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
    .profile-page{min-height:0!important;height:max-content!important;display:grid!important;gap:14px!important;align-content:start!important;grid-auto-rows:max-content!important;padding-bottom:18px!important;margin:0!important;background:var(--profile-bg)!important}
    .profile-page>.profile-card:last-child{display:block!important;margin-bottom:0!important;min-height:0!important;height:auto!important;background:var(--profile-panel)!important}
    .profile-page>.profile-card:last-child>.profile-table-wrap{min-height:0!important;height:auto!important;max-height:none!important;background:var(--profile-panel)!important}
    .profile-page>.profile-card:last-child>.profile-table-wrap table{height:auto!important}
    .profile-table-wrap{max-height:none!important;height:auto!important}
    .profile-app-shell,.profile-app-shell *{overflow-anchor:none!important}
  `;
  document.head.appendChild(style);
}

injectProfileWeekTableCss();
installProfileWeekTableFix();
clampProfileScroll();

export {};