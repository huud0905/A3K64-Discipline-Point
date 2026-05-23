function isGroupShotPage(page: HTMLElement) {
  const text = page.textContent || '';
  return /BẢNG ĐIỂM THI ĐUA/i.test(text) && /TỔ\s+[1-4]/i.test(text) && !/CẢ LỚP/i.test(text);
}

function escapeHtml(value: string) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
}

function parseScoreItems(text: string) {
  const cleanText = text.replace(/^[+\-]\s*/, '').replace(/\s+/g, ' ').trim();
  return cleanText
    .split(/\s*•\s*/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function scoreLineHtml(items: string[]) {
  let lastDay = '';
  return items.map((item) => {
    const match = item.match(/^(Thứ\s*[2-7]|Chủ nhật):\s*(.+)$/i);
    const day = match ? match[1].replace(/\s+/, ' ') : '';
    const content = match ? match[2].trim() : item;
    const repeated = Boolean(day && day === lastDay);
    if (day) lastDay = day;
    const label = day ? (repeated ? ':' : `${day}:`) : '';

    return `<div class="a3-shot-score-line"><span class="a3-shot-day-label">${escapeHtml(label)}</span><span class="a3-shot-score-content">${escapeHtml(content)}</span></div>`;
  }).join('');
}

function formatScoreDetailBlocks(page: HTMLElement) {
  page.querySelectorAll<HTMLElement>('td div').forEach((el) => {
    if (el.dataset.scoreLinesFormatted === 'true') return;

    const text = (el.textContent || '').trim();
    const isScoreBlock = /^[-+]\s*(Thứ\s*[2-7]|Chủ nhật):/i.test(text);
    if (!isScoreBlock) return;

    const items = parseScoreItems(text);
    if (!items.length) return;

    el.dataset.scoreLinesFormatted = 'true';
    el.innerHTML = scoreLineHtml(items);
    el.style.removeProperty('-webkit-line-clamp');
    el.style.removeProperty('-webkit-box-orient');
    el.style.display = 'block';
    el.style.overflow = 'visible';
    el.style.whiteSpace = 'normal';
    el.style.wordBreak = 'normal';
    el.style.lineHeight = '1.2';
    el.style.fontSize = '9.6px';
    el.style.marginTop = '4px';
  });
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
    el.style.wordBreak = 'normal';
    el.style.lineHeight = '1.2';
    el.style.fontSize = '9.6px';
  });
}

function injectScoreLineCss(page: HTMLElement) {
  if (page.querySelector('#a3-shot-score-line-style')) return;
  const style = document.createElement('style');
  style.id = 'a3-shot-score-line-style';
  style.textContent = `
    .a3-shot-score-line{display:grid;grid-template-columns:42px minmax(0,1fr);gap:3px;align-items:start;margin:0 0 2px 0;break-inside:avoid;page-break-inside:avoid;}
    .a3-shot-day-label{font-weight:800;white-space:nowrap;text-align:left;}
    .a3-shot-score-content{min-width:0;white-space:normal;word-break:normal;overflow-wrap:anywhere;}
  `;
  page.prepend(style);
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
    nameCell.style.wordBreak = 'normal';
    nameCell.style.overflowWrap = 'anywhere';
  });
}

function fixGroupScreenshotDetails() {
  const page = document.querySelector<HTMLElement>('#a3-shot-hidden-area .a3-shot-page');
  if (!page || !isGroupShotPage(page)) return;

  injectScoreLineCss(page);
  compactGroupShotTable(page);
  expandClampedScoreDetails(page);
  formatScoreDetailBlocks(page);
  page.dataset.groupFullDetailsFixed = 'true';
}

const observer = new MutationObserver(fixGroupScreenshotDetails);
observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
window.setInterval(fixGroupScreenshotDetails, 60);
fixGroupScreenshotDetails();

export {};