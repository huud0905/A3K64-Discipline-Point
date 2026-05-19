const STYLE_ID = 'a3k64-mobile-student-detail-cards';
const MARK_ATTR = 'data-a3k64-mobile-detail-cards';

const CSS = `
@media (min-width: 761px) {
  .mobile-student-detail-list { display: none !important; }
}

@media (max-width: 760px) {
  .student-table-panel .score-detail-table {
    display: none !important;
  }

  .mobile-student-detail-list {
    display: grid !important;
    gap: 12px !important;
    width: 100% !important;
  }

  .mobile-student-detail-card {
    border: 1px solid rgba(148, 163, 184, 0.18) !important;
    border-radius: 18px !important;
    background: linear-gradient(180deg, rgba(11,23,50,.98), rgba(7,18,42,.96)) !important;
    padding: 14px 14px 12px !important;
    box-shadow: inset 0 1px 0 rgba(255,255,255,.03), 0 8px 24px rgba(0,0,0,.18) !important;
  }

  .theme-light .mobile-student-detail-card,
  .win-root.theme-light .mobile-student-detail-card {
    background: linear-gradient(180deg, rgba(255,255,255,.96), rgba(241,245,249,.92)) !important;
    border-color: rgba(15, 23, 42, .12) !important;
    box-shadow: inset 0 1px 0 rgba(255,255,255,.9), 0 8px 24px rgba(15,23,42,.08) !important;
  }

  .mobile-student-detail-header {
    display: flex !important;
    justify-content: space-between !important;
    align-items: flex-start !important;
    gap: 10px !important;
    padding-bottom: 10px !important;
    margin-bottom: 10px !important;
    border-bottom: 1px dashed rgba(148,163,184,.16) !important;
  }

  .mobile-student-detail-name {
    margin: 0 !important;
    color: #f8fafc !important;
    font-size: 16px !important;
    line-height: 1.2 !important;
    font-weight: 900 !important;
  }

  .theme-light .mobile-student-detail-name,
  .win-root.theme-light .mobile-student-detail-name {
    color: #0f172a !important;
  }

  .mobile-student-detail-subtitle {
    margin-top: 4px !important;
    color: #94a3b8 !important;
    font-size: 12px !important;
    line-height: 1.2 !important;
  }

  .mobile-student-detail-rank {
    min-width: 28px !important;
    height: 28px !important;
    padding: 0 8px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    border-radius: 8px !important;
    background: rgba(15,23,42,.72) !important;
    border: 1px solid rgba(148,163,184,.14) !important;
    color: #94a3b8 !important;
    font-size: 12px !important;
    font-weight: 800 !important;
    flex-shrink: 0 !important;
  }

  .theme-light .mobile-student-detail-rank,
  .win-root.theme-light .mobile-student-detail-rank {
    background: rgba(226,232,240,.72) !important;
    color: #475569 !important;
  }

  .mobile-student-detail-section {
    margin-bottom: 10px !important;
  }

  .mobile-student-detail-label {
    display: block !important;
    margin-bottom: 6px !important;
    color: #94a3b8 !important;
    font-size: 11px !important;
    font-weight: 800 !important;
    text-transform: uppercase !important;
    letter-spacing: .03em !important;
  }

  .mobile-student-detail-content {
    color: #e2e8f0 !important;
    font-size: 12px !important;
    line-height: 1.45 !important;
    word-break: break-word !important;
  }

  .theme-light .mobile-student-detail-content,
  .win-root.theme-light .mobile-student-detail-content {
    color: #334155 !important;
  }

  .mobile-student-detail-content .event-line,
  .mobile-student-detail-content span {
    display: block !important;
    margin-bottom: 4px !important;
    color: inherit !important;
    font-size: inherit !important;
    line-height: inherit !important;
  }

  .mobile-student-detail-content .event-plus {
    color: #00f5c4 !important;
  }

  .mobile-student-detail-content .event-minus {
    color: #fb7185 !important;
  }

  .mobile-student-detail-points {
    display: flex !important;
    justify-content: space-between !important;
    align-items: center !important;
    margin-top: 6px !important;
    gap: 8px !important;
  }

  .mobile-student-detail-points .metric-label {
    color: #94a3b8 !important;
    font-size: 11px !important;
    font-weight: 800 !important;
    text-transform: uppercase !important;
  }

  .mobile-student-detail-points .metric-value {
    font-weight: 900 !important;
    font-size: 12px !important;
  }

  .mobile-student-detail-footer {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    gap: 10px !important;
    align-items: end !important;
    padding-top: 12px !important;
    margin-top: 12px !important;
    border-top: 1px solid rgba(148, 163, 184, 0.14) !important;
  }

  .mobile-student-detail-metrics {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important;
    gap: 10px !important;
  }

  .mobile-student-detail-metric {
    min-width: 0 !important;
  }

  .mobile-student-detail-metric .metric-label {
    display: block !important;
    margin-bottom: 6px !important;
    color: #94a3b8 !important;
    font-size: 11px !important;
    font-weight: 800 !important;
    text-transform: uppercase !important;
  }

  .mobile-student-detail-metric .metric-value {
    display: inline-flex !important;
    align-items: center !important;
    gap: 6px !important;
    min-height: 24px !important;
    color: #f8fafc !important;
    font-size: 14px !important;
    font-weight: 900 !important;
  }

  .theme-light .mobile-student-detail-metric .metric-value,
  .win-root.theme-light .mobile-student-detail-metric .metric-value {
    color: #0f172a !important;
  }

  .mobile-student-detail-metric .metric-value.score-positive {
    color: #00f5c4 !important;
  }

  .mobile-student-detail-metric .metric-value.score-negative {
    color: #fb7185 !important;
  }

  .mobile-student-detail-footer .status-pill {
    min-width: 52px !important;
    justify-content: center !important;
  }

  .mobile-student-detail-edit {
    width: 52px !important;
    height: 52px !important;
    border-radius: 14px !important;
    border: 0 !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    background: linear-gradient(180deg, #4f91ff, #3b82f6) !important;
    color: #ffffff !important;
    box-shadow: 0 8px 20px rgba(59,130,246,.3) !important;
  }

  .mobile-student-detail-edit:active {
    transform: scale(.98) !important;
  }
}
`;

function installCss() {
  const old = document.getElementById(STYLE_ID);
  if (old) old.remove();
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

function textOrEmpty(node: Element | null | undefined) {
  return (node?.textContent || '').replace(/\s+/g, ' ').trim();
}

function isEmptyValue(value: string) {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  return !cleaned || cleaned === '-' || cleaned === '0' || cleaned === '+0' || cleaned === '-0';
}

function cleanHtml(html: string) {
  return html.trim();
}

function buildCard(row: HTMLTableRowElement) {
  const cells = Array.from(row.cells);
  if (cells.length < 9) return null;

  const rank = textOrEmpty(cells[0]);
  const nameButton = cells[1].querySelector('button') as HTMLButtonElement | null;
  const editButton = cells[8].querySelector('button') as HTMLButtonElement | null;
  const name = textOrEmpty(nameButton || cells[1]);
  const subtitle = textOrEmpty(cells[1].querySelector('.student-role'));

  const plusHtml = cleanHtml(cells[2].querySelector('.event-stack')?.innerHTML || cells[2].innerHTML);
  const plusText = textOrEmpty(cells[2]);
  const plusScore = textOrEmpty(cells[3]);
  const minusHtml = cleanHtml(cells[4].querySelector('.event-stack')?.innerHTML || cells[4].innerHTML);
  const minusText = textOrEmpty(cells[4]);
  const minusScore = textOrEmpty(cells[5]);
  const total = textOrEmpty(cells[6]);
  const statusEl = cells[7].querySelector('.status-pill') as HTMLElement | null;

  const card = document.createElement('article');
  card.className = 'mobile-student-detail-card';

  const header = document.createElement('div');
  header.className = 'mobile-student-detail-header';
  header.innerHTML = `
    <div>
      <h3 class="mobile-student-detail-name"></h3>
      <div class="mobile-student-detail-subtitle"></div>
    </div>
    <div class="mobile-student-detail-rank"></div>
  `;
  (header.querySelector('.mobile-student-detail-name') as HTMLElement).textContent = name;
  (header.querySelector('.mobile-student-detail-subtitle') as HTMLElement).textContent = subtitle;
  (header.querySelector('.mobile-student-detail-rank') as HTMLElement).textContent = rank;
  card.appendChild(header);

  if (!isEmptyValue(plusText) || !isEmptyValue(plusScore)) {
    const plusSection = document.createElement('section');
    plusSection.className = 'mobile-student-detail-section';
    plusSection.innerHTML = `
      <span class="mobile-student-detail-label">Nội dung (+)</span>
      <div class="mobile-student-detail-content">${plusHtml || '-'}</div>
      <div class="mobile-student-detail-points">
        <span class="metric-label">Điểm (+)</span>
        <span class="metric-value score-positive">${plusScore || '0'}</span>
      </div>
    `;
    card.appendChild(plusSection);
  }

  if (!isEmptyValue(minusText) || !isEmptyValue(minusScore)) {
    const minusSection = document.createElement('section');
    minusSection.className = 'mobile-student-detail-section';
    minusSection.innerHTML = `
      <span class="mobile-student-detail-label">Nội dung (-)</span>
      <div class="mobile-student-detail-content">${minusHtml || '-'}</div>
      <div class="mobile-student-detail-points">
        <span class="metric-label">Điểm (-)</span>
        <span class="metric-value score-negative">${minusScore || '0'}</span>
      </div>
    `;
    card.appendChild(minusSection);
  }

  const footer = document.createElement('div');
  footer.className = 'mobile-student-detail-footer';

  const metrics = document.createElement('div');
  metrics.className = 'mobile-student-detail-metrics';
  metrics.innerHTML = `
    <div class="mobile-student-detail-metric">
      <span class="metric-label">Tổng điểm</span>
      <span class="metric-value ${String(total).trim().startsWith('-') ? 'score-negative' : 'score-positive'}">${total || '0'}</span>
    </div>
    <div class="mobile-student-detail-metric">
      <span class="metric-label">Xếp loại</span>
      <span class="metric-value"></span>
    </div>
  `;
  const statusWrap = metrics.querySelectorAll('.metric-value')[1] as HTMLElement;
  if (statusEl) statusWrap.appendChild(statusEl.cloneNode(true));
  else statusWrap.textContent = textOrEmpty(cells[7]);
  footer.appendChild(metrics);

  const actionButton = document.createElement('button');
  actionButton.type = 'button';
  actionButton.className = 'mobile-student-detail-edit';
  actionButton.setAttribute('aria-label', `Chỉnh sửa ${name}`);
  actionButton.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>`;
  actionButton.addEventListener('click', () => {
    if (editButton) editButton.click();
    else if (nameButton) nameButton.click();
  });
  footer.appendChild(actionButton);

  card.appendChild(footer);
  return card;
}

function patchTables() {
  if (window.innerWidth > 760) return;
  const tables = Array.from(document.querySelectorAll<HTMLTableElement>('.student-table-panel .score-detail-table'));
  tables.forEach((table) => {
    const wrap = table.parentElement;
    if (!wrap) return;

    let mobileList = wrap.parentElement?.querySelector(`.mobile-student-detail-list[${MARK_ATTR}="true"]`) as HTMLElement | null;
    if (!mobileList) {
      mobileList = document.createElement('div');
      mobileList.className = 'mobile-student-detail-list';
      mobileList.setAttribute(MARK_ATTR, 'true');
      wrap.insertAdjacentElement('afterend', mobileList);
    }

    mobileList.innerHTML = '';
    const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr'));
    rows.forEach((row) => {
      const card = buildCard(row);
      if (card) mobileList!.appendChild(card);
    });
  });
}

function install() {
  installCss();
  const rerender = () => window.requestAnimationFrame(patchTables);
  rerender();
  const observer = new MutationObserver(rerender);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  window.addEventListener('resize', rerender);
}

if (typeof window !== 'undefined') install();

export {};
