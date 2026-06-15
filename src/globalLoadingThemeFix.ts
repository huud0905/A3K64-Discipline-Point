import { normalizedElementLowerText } from './core/dom';

function markGlobalLoading() {
  document.querySelectorAll<HTMLElement>('div,section').forEach((el) => {
    const t = normalizedElementLowerText(el);
    if (!t.includes('đang xử lý') && !t.includes('dang xu ly')) return;
    const rect = el.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (rect.width < 120 || rect.height < 50 || area > 180000) return;
    el.classList.add('a3-global-loading-card');
    const parent = el.parentElement;
    if (parent && getComputedStyle(parent).position === 'fixed') parent.classList.add('a3-global-loading-layer');
  });
}

new MutationObserver(markGlobalLoading).observe(document.documentElement, { childList: true, subtree: true });
window.setInterval(markGlobalLoading, 400);
markGlobalLoading();

export {};
