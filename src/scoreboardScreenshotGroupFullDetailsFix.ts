function isGroupShotPage(page: HTMLElement) {
  const text = page.textContent || '';
  return /BẢNG ĐIỂM THI ĐUA/i.test(text) && /TỔ\s+[1-4]/i.test(text) && !/CẢ LỚP/i.test(text);
}

function expandClampedScoreDetails(page: HTMLElement) {
  page.querySelectorAll<HTMLElement>('[style*="-webkit-line-clamp"], [style*="overflow:hidden"], [style*="overflow: hidden"]').forEach((el) => {
    const text = (el.textContent || '').trim();
    const isScoreDetail = text.startsWith('+') || text.startsWith('-') || text.includes('Thứ ') || text.includes('Chủ nhật');
    if (!isScoreDetail) return;

    el.style.removeProperty('-webkit-line-clamp');
    el.style.removeProperty('-webkit-box-orient');
    el.style.display = 'block';
    el.style.overflow = 'visible';
    el.style.whiteSpace = 'normal';
    el.style.wordBreak = 'break-word';
    el.style.lineHeight = '1.28';
    el.style.fontSize = '10.5px';
  });
}

function compactGroupShotTable(page: HTMLElement) {
  page.style.minHeight = '0';
  page.style.height = 'auto';
  page.style.padding = '24px';
  page.style.overflow = 'visible';

  const table = page.querySelector<HTMLElement>('table');
  if (table) {
    table.style.fontSize = '13px';
    table.style.tableLayout = 'fixed';
  }

  page.querySelectorAll<HTMLElement>('th').forEach((th) => {
    th.style.padding = '6px 4px';
    th.style.fontSize = '12px';
  });

  page.querySelectorAll<HTMLElement>('td').forEach((td) => {
    td.style.padding = '5px 4px';
    td.style.verticalAlign = 'top';
    td.style.overflow = 'visible';
  });

  page.querySelectorAll<HTMLElement>('td:nth-child(2)').forEach((nameCell) => {
    nameCell.style.width = 'auto';
    nameCell.style.wordBreak = 'break-word';
  });
}

function fixGroupScreenshotDetails() {
  const page = document.querySelector<HTMLElement>('#a3-shot-hidden-area .a3-shot-page');
  if (!page || !isGroupShotPage(page)) return;

  compactGroupShotTable(page);
  expandClampedScoreDetails(page);
  page.dataset.groupFullDetailsFixed = 'true';
}

const observer = new MutationObserver(fixGroupScreenshotDetails);
observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
window.setInterval(fixGroupScreenshotDetails, 60);
fixGroupScreenshotDetails();

export {};