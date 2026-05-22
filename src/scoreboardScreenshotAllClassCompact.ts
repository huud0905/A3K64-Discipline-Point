function compactAllClassScreenshotPage() {
  const area = document.getElementById('a3-shot-hidden-area');
  const page = area?.querySelector<HTMLElement>('.a3-shot-page');
  if (!page) return;

  const text = page.textContent || '';
  const isAllClass = text.includes('CẢ LỚP') || text.includes('CA LOP');
  if (!isAllClass) return;

  page.style.minHeight = '0';
  page.style.height = 'auto';
  page.style.paddingBottom = '22px';
  page.dataset.compactAllClass = 'true';
}

const observer = new MutationObserver(compactAllClassScreenshotPage);
observer.observe(document.documentElement, { childList: true, subtree: true });

window.setInterval(compactAllClassScreenshotPage, 80);
compactAllClassScreenshotPage();

export {};