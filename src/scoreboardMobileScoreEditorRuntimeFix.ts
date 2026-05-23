function isMobileScoreEditor() {
  return window.matchMedia('(max-width: 760px)').matches;
}

function setStyle(el: HTMLElement | null | undefined, styles: Partial<CSSStyleDeclaration>) {
  if (!el) return;
  Object.entries(styles).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    el.style.setProperty(key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`), String(value), 'important');
  });
}

function activeMobileSection(modal: HTMLElement) {
  const buttons = Array.from(modal.querySelectorAll<HTMLButtonElement>('.score-mobile-mode-tabs button'));
  const reviewButton = buttons.find((button) => /xem lại|xoa|xoá/i.test(button.textContent || ''));
  return reviewButton?.classList.contains('active') ? 'review' : 'add';
}

function getWindowTitlebarHeight(modal: HTMLElement) {
  const winWindow = modal.closest<HTMLElement>('.win-window');
  const titlebar = winWindow?.querySelector<HTMLElement>('.win-titlebar');
  const measured = titlebar?.offsetHeight || 0;
  return Math.max(0, measured || 38);
}

function styleDayTabs(row: HTMLElement | null | undefined) {
  const tabs = row?.querySelector<HTMLElement>('.day-tabs');
  setStyle(row, {
    flex: '0 0 auto',
    display: 'block',
    margin: '0 0 10px',
    overflow: 'visible',
    width: '100%',
    position: 'relative',
    zIndex: '80',
    padding: '0 0 6px',
    background: 'var(--score-editor-bg, #050b18)',
    borderBottom: '1px solid rgba(239, 68, 68, .55)',
    boxShadow: '0 10px 18px rgba(2, 6, 23, .34)',
  });
  setStyle(tabs, {
    width: '100%',
    display: 'flex',
    flexWrap: 'nowrap',
    gap: '7px',
    overflowX: 'auto',
    overflowY: 'hidden',
    padding: '0 0 4px',
    WebkitOverflowScrolling: 'touch',
    scrollbarWidth: 'thin',
  });
  tabs?.querySelectorAll<HTMLElement>('button').forEach((button) => {
    setStyle(button, {
      flex: '0 0 50px',
      width: '50px',
      minWidth: '50px',
      minHeight: '36px',
      height: '36px',
      borderRadius: '12px',
      fontSize: '12px',
    });
  });
}

function syncMobileReviewDaySelector(modal: HTMLElement, show: boolean) {
  const reviewPanel = modal.querySelector<HTMLElement>('.day-record-panel');
  const sourceRow = modal.querySelector<HTMLElement>('.score-day-switch-row');
  if (!reviewPanel || !sourceRow) return;

  setStyle(sourceRow, { display: 'none' });
  let mobileRow = reviewPanel.querySelector<HTMLElement>(':scope > .mobile-review-day-switch-row');

  if (!show) {
    if (mobileRow) setStyle(mobileRow, { display: 'none' });
    return;
  }

  if (!mobileRow) {
    mobileRow = document.createElement('div');
    mobileRow.className = 'mobile-review-day-switch-row';
    const tabs = document.createElement('div');
    tabs.className = 'day-tabs';
    Array.from(sourceRow.querySelectorAll<HTMLButtonElement>('.day-tabs button')).forEach((sourceButton, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = sourceButton.textContent || '';
      button.addEventListener('click', () => {
        const latestButtons = modal.querySelectorAll<HTMLButtonElement>('.score-day-switch-row .day-tabs button');
        latestButtons[index]?.click();
      });
      tabs.appendChild(button);
    });
    mobileRow.appendChild(tabs);
  }

  if (mobileRow.parentElement !== reviewPanel || reviewPanel.firstElementChild !== mobileRow) {
    reviewPanel.prepend(mobileRow);
  }

  const sourceButtons = Array.from(sourceRow.querySelectorAll<HTMLButtonElement>('.day-tabs button'));
  const mobileButtons = Array.from(mobileRow.querySelectorAll<HTMLButtonElement>('.day-tabs button'));
  mobileButtons.forEach((button, index) => {
    button.className = sourceButtons[index]?.className || '';
    button.disabled = Boolean(sourceButtons[index]?.disabled);
  });
  setStyle(mobileRow, { display: 'block' });
  styleDayTabs(mobileRow);
}

function hardFixMobileScoreEditor() {
  const modal = document.querySelector<HTMLElement>('.score-edit-modal.modern-score-editor');
  if (!modal || !isMobileScoreEditor()) return;

  const section = activeMobileSection(modal);
  modal.dataset.mobileScoreSection = section;

  const winWindow = modal.closest<HTMLElement>('.win-window');
  const titlebar = winWindow?.querySelector<HTMLElement>('.win-titlebar');
  const winBody = winWindow?.querySelector<HTMLElement>('.win-body');
  const titlebarHeight = getWindowTitlebarHeight(modal);
  const availableHeight = Math.max(360, window.innerHeight - titlebarHeight);

  const backdrop = modal.closest<HTMLElement>('.score-edit-backdrop');
  const header = modal.querySelector<HTMLElement>('.score-edit-header');
  const body = modal.querySelector<HTMLElement>('.score-edit-body');
  const left = modal.querySelector<HTMLElement>('.score-edit-left');
  const tabs = modal.querySelector<HTMLElement>('.score-mobile-mode-tabs');
  const dayHead = modal.querySelector<HTMLElement>('.inline-day-head');
  const addPanel = modal.querySelector<HTMLElement>('.score-add-panel');
  const reviewPanel = modal.querySelector<HTMLElement>('.day-record-panel');
  const eventList = modal.querySelector<HTMLElement>('.day-event-list');
  const footer = modal.querySelector<HTMLElement>('.score-edit-footer');

  document.querySelectorAll<HTMLElement>('.taskbar').forEach((taskbar) => {
    setStyle(taskbar, { display: 'none' });
  });

  setStyle(titlebar, {
    flex: '0 0 auto',
    height: `${titlebarHeight}px`,
    minHeight: `${titlebarHeight}px`,
    maxHeight: `${titlebarHeight}px`,
    padding: '4px 8px',
    margin: '0',
    lineHeight: '1',
    zIndex: '50',
  });

  setStyle(winWindow, {
    inset: '0',
    width: '100vw',
    height: '100dvh',
    maxHeight: '100dvh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  });

  setStyle(winBody, {
    flex: '1 1 auto',
    height: `${availableHeight}px`,
    minHeight: '0',
    padding: '0',
    margin: '0',
    overflow: 'hidden',
    position: 'relative',
  });

  setStyle(backdrop, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    padding: '4px 6px 6px',
    overflow: 'hidden',
    zIndex: '2147483000',
    display: 'flex',
    alignItems: 'stretch',
    justifyContent: 'center',
    boxSizing: 'border-box',
  });

  const modalOuterHeight = Math.max(320, availableHeight - 10);
  setStyle(modal, {
    width: '100%',
    maxWidth: '520px',
    height: `${modalOuterHeight}px`,
    maxHeight: `${modalOuterHeight}px`,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    transform: 'none',
  });

  setStyle(header, {
    flex: '0 0 auto',
    minHeight: '50px',
    padding: '6px 10px',
    zIndex: '40',
    margin: '0',
  });

  setStyle(footer, {
    flex: '0 0 auto',
    position: 'relative',
    bottom: 'auto',
    zIndex: '35',
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '7px',
    padding: '8px 12px calc(8px + env(safe-area-inset-bottom, 0px))',
    marginTop: '0',
    boxSizing: 'border-box',
    background: 'var(--score-editor-bg, #050b18)',
  });

  footer?.querySelectorAll<HTMLElement>('strong').forEach((el) => setStyle(el, {
    minHeight: '38px',
    height: '38px',
    display: 'grid',
    placeItems: 'center',
    borderRadius: '12px',
    fontSize: '14px',
    boxSizing: 'border-box',
  }));
  footer?.querySelectorAll<HTMLElement>('button').forEach((el) => setStyle(el, {
    gridColumn: '1 / -1',
    minHeight: '40px',
    height: '40px',
    margin: '0',
    borderRadius: '13px',
    fontSize: '13px',
    boxSizing: 'border-box',
  }));

  const headerHeight = header?.offsetHeight || 50;
  const footerHeight = footer?.offsetHeight || 130;
  const bodyHeight = Math.max(190, modalOuterHeight - headerHeight - footerHeight);

  setStyle(body, {
    flex: '1 1 auto',
    minHeight: '0',
    height: `${bodyHeight}px`,
    maxHeight: `${bodyHeight}px`,
    display: 'block',
    overflowY: 'auto',
    overflowX: 'hidden',
    padding: '0 0 18px 0',
    WebkitOverflowScrolling: 'touch',
    overscrollBehavior: 'contain',
    touchAction: 'pan-y',
  });

  setStyle(left, {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 'max-content',
    height: 'auto',
    padding: '8px 12px 22px',
    overflow: 'visible',
    gap: '9px',
  });

  modal.querySelectorAll<HTMLElement>('.rules-directory,.score-week-table').forEach((el) => setStyle(el, { display: 'none' }));
  syncMobileReviewDaySelector(modal, section === 'review');
  setStyle(dayHead, { display: 'none' });

  setStyle(tabs, {
    order: '1',
    flex: '0 0 auto',
    position: 'relative',
    top: 'auto',
    zIndex: '20',
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
    padding: '0 0 10px',
    margin: '0',
    background: 'var(--score-editor-bg, #050b18)',
  });

  tabs?.querySelectorAll<HTMLElement>('button').forEach((button) => {
    setStyle(button, {
      minHeight: '40px',
      height: '40px',
      borderRadius: '13px',
      fontSize: '13px',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      position: 'relative',
      zIndex: '1',
    });
  });

  setStyle(addPanel, {
    order: '2',
    display: section === 'add' ? 'block' : 'none',
    overflow: 'visible',
    maxHeight: 'none',
  });

  setStyle(reviewPanel, {
    order: '2',
    display: section === 'review' ? 'flex' : 'none',
    flexDirection: 'column',
    minHeight: '0',
    overflow: 'visible',
  });

  setStyle(eventList, {
    minHeight: '0',
    maxHeight: 'none',
    overflowY: 'visible',
    paddingBottom: '10px',
  });

  modal.querySelectorAll<HTMLElement>('.score-edit-columns').forEach((el) => setStyle(el, { order: '2', display: 'block', minHeight: '0', overflow: 'visible' }));
  modal.querySelectorAll<HTMLElement>('.rule-select-form,.special-score-form,.bulk-score-box').forEach((el) => setStyle(el, { margin: '0 0 10px', padding: '12px', borderRadius: '16px' }));
  modal.querySelectorAll<HTMLElement>('.day-event').forEach((el) => setStyle(el, { position: 'relative', zIndex: '1', minHeight: '44px', marginBottom: '8px', borderRadius: '12px' }));
}

let scheduled = false;
function run() {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(() => {
    scheduled = false;
    try {
      hardFixMobileScoreEditor();
    } catch (error) {
      console.warn('Mobile score editor runtime fix skipped:', error);
    }
  });
}

new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
window.addEventListener('resize', run);
window.addEventListener('orientationchange', run);
window.setInterval(() => {
  try {
    hardFixMobileScoreEditor();
  } catch (error) {
    console.warn('Mobile score editor runtime fix skipped:', error);
  }
}, 400);
run();

export {};