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

function hardFixMobileScoreEditor() {
  const modal = document.querySelector<HTMLElement>('.score-edit-modal.modern-score-editor');
  if (!modal || !isMobileScoreEditor()) return;

  const section = activeMobileSection(modal);
  modal.dataset.mobileScoreSection = section;

  const backdrop = modal.closest<HTMLElement>('.score-edit-backdrop');
  const header = modal.querySelector<HTMLElement>('.score-edit-header');
  const body = modal.querySelector<HTMLElement>('.score-edit-body');
  const left = modal.querySelector<HTMLElement>('.score-edit-left');
  const tabs = modal.querySelector<HTMLElement>('.score-mobile-mode-tabs');
  const dayRow = modal.querySelector<HTMLElement>('.score-day-switch-row');
  const dayTabs = modal.querySelector<HTMLElement>('.score-day-switch-row .day-tabs');
  const dayHead = modal.querySelector<HTMLElement>('.inline-day-head');
  const addPanel = modal.querySelector<HTMLElement>('.score-add-panel');
  const reviewPanel = modal.querySelector<HTMLElement>('.day-record-panel');
  const eventList = modal.querySelector<HTMLElement>('.day-event-list');
  const footer = modal.querySelector<HTMLElement>('.score-edit-footer');

  document.querySelectorAll<HTMLElement>('.taskbar').forEach((taskbar) => {
    setStyle(taskbar, { display: 'none' });
  });

  setStyle(backdrop, {
    position: 'fixed',
    inset: '0',
    width: '100vw',
    height: '100dvh',
    padding: '8px',
    overflow: 'hidden',
    zIndex: '2147483000',
    display: 'flex',
    alignItems: 'stretch',
    justifyContent: 'center',
    boxSizing: 'border-box',
  });

  setStyle(modal, {
    width: '100%',
    maxWidth: '520px',
    height: 'calc(100dvh - 16px)',
    maxHeight: 'calc(100dvh - 16px)',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    transform: 'none',
  });

  setStyle(header, {
    flex: '0 0 auto',
    minHeight: '58px',
    padding: '8px 12px',
    zIndex: '40',
  });

  setStyle(footer, {
    flex: '0 0 auto',
    position: 'relative',
    bottom: 'auto',
    zIndex: '35',
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '8px',
    padding: '10px 12px calc(10px + env(safe-area-inset-bottom, 0px))',
  });

  const modalHeight = modal.clientHeight || window.innerHeight - 16;
  const headerHeight = header?.offsetHeight || 58;
  const footerHeight = footer?.offsetHeight || 144;
  const bodyHeight = Math.max(220, modalHeight - headerHeight - footerHeight);

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
    padding: '10px 12px 20px',
    overflow: 'visible',
    gap: '10px',
  });

  modal.querySelectorAll<HTMLElement>('.rules-directory,.score-week-table').forEach((el) => setStyle(el, { display: 'none' }));

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

  setStyle(dayRow, {
    order: '2',
    flex: '0 0 auto',
    display: section === 'review' ? 'block' : 'none',
    margin: '0 0 10px',
    overflow: 'visible',
    width: '100%',
  });

  setStyle(dayHead, { display: 'none' });

  setStyle(dayTabs, {
    width: '100%',
    display: 'flex',
    flexWrap: 'nowrap',
    gap: '7px',
    overflowX: 'auto',
    overflowY: 'hidden',
    padding: '0 0 6px',
    WebkitOverflowScrolling: 'touch',
    scrollbarWidth: 'thin',
  });

  dayTabs?.querySelectorAll<HTMLElement>('button').forEach((button) => {
    setStyle(button, {
      flex: '0 0 58px',
      width: '58px',
      minWidth: '58px',
      minHeight: '38px',
      height: '38px',
      borderRadius: '12px',
      fontSize: '12px',
    });
  });

  setStyle(addPanel, {
    order: '3',
    display: section === 'add' ? 'block' : 'none',
    overflow: 'visible',
    maxHeight: 'none',
  });

  setStyle(reviewPanel, {
    order: '3',
    display: section === 'review' ? 'flex' : 'none',
    flexDirection: 'column',
    minHeight: '0',
    overflow: 'visible',
  });

  setStyle(eventList, {
    minHeight: '0',
    maxHeight: 'none',
    overflowY: 'visible',
    paddingBottom: '8px',
  });

  modal.querySelectorAll<HTMLElement>('.score-edit-columns').forEach((el) => setStyle(el, { order: '3', display: 'block', minHeight: '0', overflow: 'visible' }));
  modal.querySelectorAll<HTMLElement>('.rule-select-form,.special-score-form,.bulk-score-box').forEach((el) => setStyle(el, { margin: '0 0 10px', padding: '12px', borderRadius: '16px' }));
  modal.querySelectorAll<HTMLElement>('.day-event').forEach((el) => setStyle(el, { position: 'relative', zIndex: '1', minHeight: '44px', marginBottom: '8px', borderRadius: '12px' }));

  footer?.querySelectorAll<HTMLElement>('strong').forEach((el) => setStyle(el, { minHeight: '40px', display: 'grid', placeItems: 'center', borderRadius: '12px', fontSize: '14px' }));
  footer?.querySelectorAll<HTMLElement>('button').forEach((el) => setStyle(el, { gridColumn: '1 / -1', minHeight: '44px', margin: '0', borderRadius: '13px', fontSize: '13px' }));
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