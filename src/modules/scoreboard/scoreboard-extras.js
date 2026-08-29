/* ============================================================
   A3K64 — Scoreboard EXTRAS (vanilla JS port)
   Port của scoreboardExcelExport.ts + scoreboardScreenshotCapture.ts
   Khác bản gốc: KHÔNG gọi Google Apps Script — mọi thứ tạo ra
   ngay trên trình duyệt (client-side) từ state cục bộ trong
   scoreboard.js (biến `state`, hàm `summarizeStudents`, `formatScore`).
   Nút "Tự tính điểm" (Sparkles) giữ nguyên như bản gốc: bản React
   gốc cũng chưa gắn logic cho nút này, nên ở đây cũng không tự
   bịa thêm hành vi — chỉ để lại làm nút trang trí như thiết kế cũ.
   ============================================================ */

/* ============================================================
   HELPERS DÙNG CHUNG
   ============================================================ */
function extraEsc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c] || c));
}
function extraSanitizeFileName(v) {
  return String(v || 'BaoCao').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 120);
}
function extraLoadScriptOnce(cacheKey, url, getter) {
  const existing = getter();
  if (existing) return Promise.resolve(existing);
  if (window[cacheKey]) return window[cacheKey];
  window[cacheKey] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.onload = () => { const loaded = getter(); loaded ? resolve(loaded) : reject(new Error(`Không tải được thư viện ${url}`)); };
    s.onerror = () => reject(new Error(`Không tải được thư viện ${url}`));
    document.head.appendChild(s);
  });
  return window[cacheKey];
}
function ensureHtml2Canvas() { return extraLoadScriptOnce('__a3Html2CanvasPromise', 'https://html2canvas.hertzen.com/dist/html2canvas.min.js', () => window.html2canvas); }
function ensureJSZip()      { return extraLoadScriptOnce('__a3JsZipPromise', 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', () => window.JSZip); }
function ensureXLSX()       { return extraLoadScriptOnce('__a3XlsxPromise', 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js', () => window.XLSX); }

function extraDownloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename || 'BaoCao';
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function extraCanvasToBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Không tạo được ảnh PNG.')), 'image/png'));
}
async function extraCopyBlobToClipboard(blob) {
  if (!navigator.clipboard || !window.ClipboardItem) throw new Error('Trình duyệt không hỗ trợ copy ảnh.');
  await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
}
function extraToast(title, message, kind='info') {
  const typeMap = { success:'success', warning:'warn', error:'error', info:'info' };
  const type = typeMap[kind] || 'info';
  const body = message ? `${title}: ${message}` : title;
  // Dùng _notify() từ scoreboard.js nếu đang chạy cùng window, fallback tự gọi A3Notify
  if (typeof _notify === 'function') { _notify(body, type); return; }
  if (window.A3Notify) window.A3Notify.show(body, { type });
  try { window.parent.postMessage({ type: 'a3k64-notif', title: 'Bảng điểm', body }, '*'); } catch(e) {}
}
function extraSetLoading(visible, message='Đang tạo ảnh...') {
  const current = document.getElementById('a3-shot-loading');
  if (!visible) { current?.remove(); return; }
  if (current) { const span = current.querySelector('span'); if (span) span.textContent = message; return; }
  const node = document.createElement('div');
  node.id = 'a3-shot-loading'; node.className = 'a3-shot-loading';
  node.innerHTML = `<div><i></i><strong>Đang xử lý...</strong><span>${extraEsc(message)}</span></div>`;
  document.body.appendChild(node);
}

/* Lấy dữ liệu bảng điểm cục bộ (thay cho fetch GAS trong bản gốc) */
function extraGetScoreboardPayload() {
  return {
    students: state.students,
    events: state.events,
    weeks: state.weeks && state.weeks.length ? state.weeks : [1],
  };
}
function extraGetCurrentWeek(weeks) {
  return weeks.includes(state.week) ? state.week : (weeks[weeks.length - 1] || 1);
}
function extraEventTitles(events, positive) {
  return events.filter(e => positive ? e.points > 0 : e.points < 0).map(e => (e.title || '').trim()).filter(Boolean).join(' • ');
}
function extraGetMembersForCurrentWeek() {
  const payload = extraGetScoreboardPayload();
  const week = extraGetCurrentWeek(payload.weeks);
  const summaries = summarizeStudents(payload.students, payload.events, week);
  const members = summaries.map(s => ({ ...s, plusText: extraEventTitles(s.events, true), minusText: extraEventTitles(s.events, false) }));
  return { week, members };
}

/* ============================================================
   1) XUẤT EXCEL — client-side hoàn toàn bằng SheetJS
      Fetch dữ liệu tươi từ backend (Cloudflare Worker / GAS)
      qua action "getScoreboard", sau đó tạo XLSX ngay trên
      trình duyệt — không cần action exportWeeksToExcel.
   ============================================================ */
(function excelExportModule() {
  let root = null;
  let weeks = [];
  let picked = new Set();
  let busy = false;

  /* ── CSS ── */
  function css() {
    if (document.getElementById('a3-export-css')) return;
    const st = document.createElement('style');
    st.id = 'a3-export-css';
    st.textContent = `
.a3-export-backdrop{position:fixed;inset:0;z-index:2147483647;background:rgba(2,6,23,.55);display:grid;place-items:center;padding:20px;backdrop-filter:blur(4px)}
.a3-export-card{width:min(580px,calc(100vw - 28px));border:1px solid var(--border-modal,rgba(148,163,184,.28));border-radius:24px;background:var(--bg-modal,#0f172a);color:var(--text,#f8fafc);box-shadow:0 30px 100px rgba(0,0,0,.35);overflow:hidden}
.a3-export-head{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:18px 22px;border-bottom:1px solid var(--border-subtle,rgba(148,163,184,.16));background:var(--bg-modal-header,rgba(15,23,42,.98))}
.a3-export-head h2{margin:0;font-size:18px;font-weight:800;display:flex;align-items:center;gap:8px;color:var(--text,#f8fafc)}
.a3-export-head-sub{font-size:11px;font-weight:600;color:var(--text-muted,#64748b);margin-top:2px}
.a3-export-close{width:36px;height:36px;border:0;border-radius:12px;background:var(--border-subtle,rgba(148,163,184,.13));color:var(--text-muted,#94a3b8);cursor:pointer;font-size:22px;font-weight:800;line-height:1;flex-shrink:0}
.a3-export-close:hover{background:rgba(239,68,68,.15);color:#f87171}
.a3-export-body{padding:18px 22px 20px;background:var(--bg-modal,#0f172a)}
.a3-export-source-badge{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;margin-bottom:14px}
.a3-export-source-badge.client{background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.28);color:#60a5fa}
.a3-export-tools{display:flex;justify-content:space-between;gap:10px;margin-bottom:12px;color:var(--text-sub,#cbd5e1);font-size:13px;font-weight:800;align-items:center}
.a3-export-tools div{display:flex;gap:8px;flex-wrap:wrap}
.a3-export-tools button{border:1px solid var(--border-modal,rgba(148,163,184,.24));background:var(--bg-mid,#172033);color:var(--text,#dbeafe);border-radius:999px;padding:6px 11px;font-weight:800;cursor:pointer;font-size:12px}
.a3-export-tools button:hover{border-color:var(--accent,#2563eb);color:var(--accent,#2563eb)}
.a3-export-weeks{display:grid;grid-template-rows:repeat(9,auto);grid-auto-flow:column;grid-auto-columns:minmax(84px,1fr);gap:8px;overflow-x:auto;padding:4px 2px 10px;max-height:340px}
.a3-export-week{height:36px;border:1px solid var(--border-modal,rgba(148,163,184,.24));border-radius:12px;background:var(--bg-mid,#172033);color:var(--text,#f8fafc);font-weight:800;cursor:pointer;display:grid;place-items:center;white-space:nowrap;font-size:13px;transition:background .14s,border-color .14s}
.a3-export-week:hover{border-color:var(--accent,#2563eb)}
.a3-export-week.selected{background:var(--accent,#2563eb);border-color:var(--accent,#2563eb);color:#fff;box-shadow:0 8px 20px rgba(37,99,235,.24)}
.a3-export-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:14px}
.a3-export-actions button{border:0;border-radius:14px;padding:11px 18px;font-weight:800;cursor:pointer;font-size:13.5px}
.a3-export-cancel{background:var(--bg-deep,#1e293b);color:var(--text-sub,#cbd5e1);border:1px solid var(--border-modal,rgba(148,163,184,.2))}
.a3-export-cancel:hover{border-color:var(--border,#334155)}
.a3-export-submit{background:linear-gradient(135deg,#16a34a,#059669);color:#fff;display:flex;align-items:center;gap:7px;box-shadow:0 4px 18px rgba(16,185,129,.28)}
.a3-export-submit:disabled{background:var(--bg-mid,#1e293b);color:var(--text-dim,#3d5470);box-shadow:none;cursor:not-allowed;border:1px solid var(--border-modal)}
.a3-export-msg{margin-top:12px;font-size:13px;font-weight:700;min-height:18px;line-height:1.5}
.a3-export-msg.error{color:#ef4444}
.a3-export-msg.success{color:#10b981}
.a3-export-msg.info{color:var(--accent,#3b82f6)}
.a3-export-spinner{width:14px;height:14px;border:2px solid rgba(255,255,255,.2);border-top-color:#fff;border-radius:999px;animation:a3ExSpin .7s linear infinite;display:inline-block}
@keyframes a3ExSpin{to{transform:rotate(360deg)}}`;
    document.head.appendChild(st);
  }

  /* ── Fetch dữ liệu tươi từ backend (Worker hoặc GAS) ── */
  async function fetchFreshScoreboard() {
    // Ưu tiên gasUrl (Worker hoặc GAS đều dùng biến này)
    let url = null;
    try { url = (typeof gasUrl !== 'undefined' && gasUrl) ? gasUrl : null; } catch {}
    if (!url) {
      // Không có backend URL → dùng state cục bộ
      return extraGetScoreboardPayload();
    }
    let fetchUrl;
    // Cloudflare Worker dùng POST; GAS dùng GET với ?action=
    // Thử POST trước (tương thích Worker mới)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getScoreboard' }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.ok && json.data) return json.data;
      }
    } catch {}
    // Fallback GET (tương thích GAS cũ)
    try {
      const params = new URLSearchParams({ action: 'getScoreboard' });
      const res = await fetch(`${url}?${params}`);
      if (res.ok) {
        const json = await res.json();
        if (json.ok && json.data) return json.data;
      }
    } catch {}
    // Cuối cùng dùng state cục bộ
    console.warn('[ExcelExport] Không fetch được dữ liệu tươi, dùng state cục bộ.');
    return extraGetScoreboardPayload();
  }

  /* ── Render modal ── */
  function draw(message = '', msgKind = 'error') {
    if (!root) return;
    const sourceBadge = `<div class="a3-export-source-badge client">📊 Xuất Excel — dữ liệu trực tiếp từ server</div>`;
    const weekButtons = weeks.map(w =>
      `<button type="button" class="a3-export-week ${picked.has(w) ? 'selected' : ''}" data-week="${w}">Tuần ${w}</button>`
    ).join('');
    root.innerHTML = `
<div class="a3-export-card">
  <div class="a3-export-head">
    <div>
      <h2>📊 Xuất Excel bảng chấm</h2>
      <div class="a3-export-head-sub">Chọn tuần cần xuất, sau đó bấm Xuất Excel</div>
    </div>
    <button type="button" class="a3-export-close" title="Đóng">×</button>
  </div>
  <div class="a3-export-body">
    ${sourceBadge}
    <div class="a3-export-tools">
      <span>${picked.size}/${weeks.length} tuần đã chọn</span>
      <div>
        <button type="button" data-export-action="all">Chọn tất cả</button>
        <button type="button" data-export-action="none">Bỏ chọn</button>
      </div>
    </div>
    <div class="a3-export-weeks">${weekButtons}</div>
    ${message ? `<div class="a3-export-msg ${msgKind}">${extraEsc(message)}</div>` : ''}
    <div class="a3-export-actions">
      <button type="button" class="a3-export-cancel">Huỷ</button>
      <button type="button" class="a3-export-submit" ${busy || !picked.size ? 'disabled' : ''}>
        ${busy ? `<span class="a3-export-spinner"></span> Đang xuất…` : '⬇ Xuất Excel'}
      </button>
    </div>
  </div>
</div>`;
  }

  function open() {
    css();
    const payload = extraGetScoreboardPayload();
    weeks = payload.weeks.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    picked = new Set(weeks.length ? [weeks[weeks.length - 1]] : []);
    busy = false;
    root?.remove();
    root = document.createElement('div');
    root.className = 'a3-export-backdrop';
    document.body.appendChild(root);
    draw();
  }

  function close() { root?.remove(); root = null; busy = false; }

  /* ── Tạo timestamp giống GAS: yyyyMMdd_HHmmss theo giờ VN ── */
  function exportStamp() {
    const now = new Date();
    const vn = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    const p = v => String(v).padStart(2, '0');
    return `${vn.getFullYear()}${p(vn.getMonth()+1)}${p(vn.getDate())}_${p(vn.getHours())}${p(vn.getMinutes())}${p(vn.getSeconds())}`;
  }

  /* ── buildFilename giống GAS ── */
  function buildFilename(pickedWeeks) {
    const clean = pickedWeeks.map(w => `Tuan_${w}`);
    const head = clean.slice(0, 3).join('_');
    const tail = clean.length > 3 ? `_va_${clean.length - 3}_tuan` : '';
    return `A3K64_Export_${head || 'TongHop'}${tail}_${exportStamp()}.xlsx`;
  }

  /* ── Xuất client-side bằng xlsx-js-style, clone y xì sheet TUẦN N gốc ──
     6 cột: STT | Họ và tên | Giới tính | Tổng điểm | Vị Thứ | Đánh giá
     Font Times New Roman 10, border thin toàn bộ, căn giữa đúng cột.
     Dòng 1: tiêu đề merge A:F, bold, căn giữa.
     Dòng 2: header, bold, căn giữa, nền xám nhạt.
     Dòng tổ: chỉ cột B, bold, căn giữa, merge A:F.
     Dòng học sinh: thường, căn giữa trừ cột B căn trái.
  ── */
  async function submit() {
    if (busy || !picked.size) return;
    busy = true;
    draw('Đang tải dữ liệu từ server…', 'info');

    try {
      const XLSX = await ensureXLSX();
      const pickedWeeks = Array.from(picked).sort((a, b) => a - b);

      draw('Đang tạo file Excel…', 'info');
      const payload = await fetchFreshScoreboard();

      // ── Style helpers ──────────────────────────────────────────
      const FONT = { name: 'Times New Roman', sz: 10 };
      const BORDER = {
        top:    { style: 'thin', color: { rgb: '000000' } },
        bottom: { style: 'thin', color: { rgb: '000000' } },
        left:   { style: 'thin', color: { rgb: '000000' } },
        right:  { style: 'thin', color: { rgb: '000000' } },
      };
      function cell(v, bold, hAlign, bgRgb) {
        const s = {
          font: Object.assign({}, FONT, bold ? { bold: true } : {}),
          border: BORDER,
          alignment: { horizontal: hAlign || 'center', vertical: 'center', wrapText: false },
        };
        if (bgRgb) s.fill = { fgColor: { rgb: bgRgb }, patternType: 'solid' };
        return { v, t: typeof v === 'number' ? 'n' : 's', s };
      }
      function emptyCell() {
        return { v: '', t: 's', s: { font: FONT, border: BORDER, alignment: { horizontal: 'center', vertical: 'center' } } };
      }
      // ──────────────────────────────────────────────────────────

      const wb = XLSX.utils.book_new();
      const COLS = 6;

      pickedWeeks.forEach(week => {
        const summaries = summarizeStudents(payload.students, payload.events, week);

        // Nhóm theo tổ
        const byGroup = {};
        summaries.forEach(s => {
          const g = s.group ?? 0;
          if (!byGroup[g]) byGroup[g] = [];
          byGroup[g].push(s);
        });
        const groupNos = Object.keys(byGroup).map(Number).sort((a, b) => a - b);

        // Vị thứ toàn lớp
        const allSorted = summaries.slice().sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'vi'));
        const rankMap = {};
        allSorted.forEach((s, i) => { rankMap[s.id] = i + 1; });

        // Xây worksheet dạng mảng ô có style
        const wsData = []; // mảng các hàng, mỗi hàng là mảng cell object
        const merges = [];
        let R = 0; // row index (0-based)

        // ── Hàng 0: tiêu đề merge A1:F1 ──
        const titleVal = `LỚP 12A3- TUẦN ${week}`;
        wsData.push([
          cell(titleVal, true, 'center'),
          emptyCell(), emptyCell(), emptyCell(), emptyCell(), emptyCell(),
        ]);
        merges.push({ s: { r: R, c: 0 }, e: { r: R, c: COLS - 1 } });
        R++;

        // ── Hàng 1: header ──
        // Nền xám nhạt giống Excel mẫu (D9D9D9)
        wsData.push([
          cell('STT',       true, 'center', 'D9D9D9'),
          cell('Họ và tên', true, 'center', 'D9D9D9'),
          cell('Giới tính', true, 'center', 'D9D9D9'),
          cell('Tổng điểm', true, 'center', 'D9D9D9'),
          cell('Vị Thứ',    true, 'center', 'D9D9D9'),
          cell('Đánh giá',  true, 'center', 'D9D9D9'),
        ]);
        R++;

        // ── Các tổ và học sinh ──
        let stt = 0;
        groupNos.forEach(g => {
          // Dòng tổ: merge A:F, bold, căn giữa
          const groupLabel = g > 0 ? `TỔ ${g}` : 'CHƯA PHÂN TỔ';
          wsData.push([
            cell(groupLabel, true, 'center'),
            emptyCell(), emptyCell(), emptyCell(), emptyCell(), emptyCell(),
          ]);
          merges.push({ s: { r: R, c: 0 }, e: { r: R, c: COLS - 1 } });
          R++;

          byGroup[g]
            .slice()
            .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'vi'))
            .forEach(s => {
              stt++;
              const gender = s.gender === 'Nam' || s.gender === 'Nữ' ? s.gender
                           : (s.gender === 'M' || s.gender === 'male') ? 'Nam'
                           : (s.gender === 'F' || s.gender === 'female') ? 'Nữ' : '';
              wsData.push([
                cell(stt,                  false, 'center'),
                cell(s.name,               false, 'left'),   // tên căn trái như ảnh
                cell(gender,               false, 'center'),
                cell(s.total,              false, 'center'),
                cell(rankMap[s.id] ?? '', false, 'center'),
                cell(s.status,             false, 'center'),
              ]);
              R++;
            });
        });

        // Tạo worksheet từ mảng ô
        const ws = XLSX.utils.aoa_to_sheet(wsData);

        // Gán style — aoa_to_sheet không giữ object cell, cần ghi lại thủ công
        // bằng cách encode địa chỉ và gán .s
        wsData.forEach((row, r) => {
          row.forEach((cellObj, c) => {
            const addr = XLSX.utils.encode_cell({ r, c });
            if (!ws[addr]) ws[addr] = {};
            ws[addr].s = cellObj.s;
            // Đảm bảo type đúng
            if (typeof cellObj.v === 'number') ws[addr].t = 'n';
          });
        });

        ws['!merges'] = merges;
        ws['!cols'] = [
          { wch: 5 },   // A: STT
          { wch: 28 },  // B: Họ và tên
          { wch: 10 },  // C: Giới tính
          { wch: 12 },  // D: Tổng điểm
          { wch: 8 },   // E: Vị Thứ
          { wch: 10 },  // F: Đánh giá
        ];
        // Chiều cao hàng (đơn vị: 1/20 point) — khoảng 15pt
        ws['!rows'] = Array.from({ length: R }, () => ({ hpx: 18 }));

        XLSX.utils.book_append_sheet(wb, ws, `TUAN ${week}`.slice(0, 31));
      });

      const fileName = buildFilename(pickedWeeks);
      XLSX.writeFile(wb, fileName);
      busy = false;
      draw(`✅ Đã tải về: ${fileName}`, 'success');

    } catch (err) {
      busy = false;
      draw(err instanceof Error ? err.message : 'Không xuất được Excel.', 'error');
    }
  }

  /* ── Event delegation ── */
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!target) return;
    const exportButton = target.closest?.('.toolbar-button.export');
    if (exportButton) { event.preventDefault(); event.stopPropagation(); open(); return; }
    if (!root) return;
    if (target.classList?.contains('a3-export-backdrop') || target.closest('.a3-export-close') || target.closest('.a3-export-cancel')) { close(); return; }
    const weekButton = target.closest?.('.a3-export-week');
    if (weekButton) {
      if (busy) return;
      const week = Number(weekButton.dataset.week);
      if (picked.has(week)) picked.delete(week); else picked.add(week);
      draw();
      return;
    }
    const action = target.closest?.('[data-export-action]')?.dataset.exportAction;
    if (action === 'all') { if (!busy) { picked = new Set(weeks); draw(); } return; }
    if (action === 'none') { if (!busy) { picked = new Set(); draw(); } return; }
    if (target.closest('.a3-export-submit')) submit();
  }, true);

  window.addEventListener('keydown', (event) => { if (event.key === 'Escape' && root && !busy) close(); });
})();

/* ============================================================
   2) CHỤP ẢNH — port gần như nguyên vẹn từ scoreboardScreenshotCapture.ts
      (module này vốn đã chạy 100% phía trình duyệt, chỉ thay
       nguồn dữ liệu GAS bằng state cục bộ)
   ============================================================ */
(function screenshotCaptureModule() {
  // Fallback local nếu SCORE_STATUS chưa tải (tránh crash khi load order thay đổi)
  const _SS = (typeof SCORE_STATUS !== 'undefined')
    ? SCORE_STATUS
    : { GOOD: 'Tốt', FAIR: 'Khá', PASS: 'Đạt', FAIL: 'Chưa đạt' };
  const RANK_COLOR_BY_STATUS = {
    [_SS.GOOD]: '#059669',
    [_SS.FAIR]: '#d97706',
    [_SS.PASS]: '#ea580c',
    [_SS.FAIL]: '#e11d48',
  };
  function rankColorOf(status) {
    return RANK_COLOR_BY_STATUS[status] || '#111827';
  }
  function statusBadge(status) {
    const color = rankColorOf(status);
    return `<span style="display:inline-block;color:${color};font-weight:800;border:1px solid ${color};padding:2px 7px;border-radius:7px;font-size:12px;white-space:nowrap;">${extraEsc(status)}</span>`;
  }
  function th(text, extra='') { return `<th style="border:1px solid #e5e7eb;padding:13px 10px;background:#f8fafc;color:#64748b;font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:.4px;${extra}">${extraEsc(text)}</th>`; }
  function td(html, extra='') { return `<td style="border:1px solid #e5e7eb;padding:12px 10px;vertical-align:top;${extra}">${html}</td>`; }
  function rowBg(index) { return index % 2 === 1 ? 'background:#f8fafc;' : ''; }
  function screenshotHeader(title) {
    return `<div style="text-align:center;margin-bottom:18px;"><div style="font-size:22px;font-weight:800;letter-spacing:.3px;text-transform:uppercase;line-height:1.2;">${extraEsc(title)}</div><div style="margin-top:6px;font-size:14px;color:#374151;">Lớp A3K64</div></div>`;
  }
  function pageWrap(content, width = 794) {
    const now = new Date().toLocaleString('vi-VN');
    return `<div class="a3-shot-page" style="width:${width}px;min-height:1123px;box-sizing:border-box;padding:28px;background:#fff;color:#000;font-family:'Inter',system-ui,sans-serif;border:1px solid #e5e7eb;">${content}<div style="margin-top:14px;text-align:right;font-style:italic;color:#6b7280;font-size:12px;">Xuất từ hệ thống quản lý A3K64 - ${extraEsc(now)}</div></div>`;
  }

  // Style dùng chung để tên luôn nằm gọn 1 dòng (cắt bằng dấu "..." nếu quá
  // dài) và các ô số không bao giờ tràn ra ngoài khung ô, kể cả với số lớn
  // như "+13.250" — trước đây tên bị xuống 2 dòng làm lệch chiều cao hàng,
  // còn cột Điểm cố định 60px không đủ chỗ nên số bị "thọt" ra ngoài ô.
  const NAME_CELL_STYLE = 'text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
  const NUM_CELL_STYLE = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';

  // Trang "CẢ LỚP" tách riêng khổ rộng hơn (1120px thay vì 794px) vì phải
  // xếp 2 bảng cạnh nhau — với khổ A4 794px, cột "Họ tên" chỉ còn lại
  // ~139px sau khi trừ các cột số cố định, khiến tên dài bị cắt "..." dở
  // dang (vd "Nguyễn Lê Công T..."). Khổ rộng hơn cho cột tên đủ ~250px+.
  const ALL_CLASS_PAGE_WIDTH = 1200;

  function renderAllClass(members, week) {
    const data = [...members].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'vi'));
    const mid = Math.ceil(data.length / 2);
    const leftData = data.slice(0, mid);
    const rightData = data.slice(mid);
    const renderRow = (member, index, startIndex) => `<tr style="${rowBg(startIndex + index)}">${td(String(startIndex + index + 1), 'text-align:center;font-weight:700;color:#475569;')}${td(`<span style="font-weight:700;color:#0f172a;">${extraEsc(member.name)}</span>`, NAME_CELL_STYLE)}${td(`<span style="font-weight:800;font-size:15px;">${extraEsc(formatScore(member.total))}</span>`, `text-align:center;color:${member.total >= 0 ? '#059669' : '#e11d48'};${NUM_CELL_STYLE}`)}${td(`#${extraEsc(member.rank || '-')}`, 'text-align:center;color:#475569;')}${td(statusBadge(member.status), 'text-align:center;')}</tr>`;
    const renderTable = (items, startIndex) => `<table style="width:100%;border-collapse:collapse;font-size:15px;table-layout:fixed;"><thead><tr>${th('STT','width:34px;text-align:center;')}${th('Họ tên','text-align:left;')}${th('Điểm','width:78px;text-align:center;')}${th('Thứ','width:46px;text-align:center;')}${th('XL','width:82px;text-align:center;')}</tr></thead><tbody>${items.map((m,i)=>renderRow(m,i,startIndex)).join('')}</tbody></table>`;
    return pageWrap(`${screenshotHeader(`BẢNG ĐIỂM THI ĐUA - TUẦN ${week} - CẢ LỚP`)}<div style="display:flex;gap:20px;align-items:flex-start;"><div style="flex:1;min-width:0;">${renderTable(leftData,0)}</div><div style="flex:1;min-width:0;">${renderTable(rightData,mid)}</div></div>`, ALL_CLASS_PAGE_WIDTH);
  }

  function renderGroup(members, week, group) {
    const data = members.filter(m => Number(m.group) === group).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'vi'));
    const clamp = 'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.25;';
    const rowHtml = (member, index) => {
      const plusShort = member.plusText ? `<div style="margin-top:3px;font-size:12px;color:#059669;${clamp}">+ ${extraEsc(member.plusText)}</div>` : '';
      const minusShort = member.minusText ? `<div style="margin-top:2px;font-size:12px;color:#e11d48;${clamp}">- ${extraEsc(member.minusText)}</div>` : '';
      const nameCell = `<div style="font-weight:800;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${extraEsc(member.name)}</div>${plusShort}${minusShort}`;
      return `<tr style="${rowBg(index)}">${td(String(index+1),'text-align:center;font-weight:700;color:#475569;')}${td(nameCell,'text-align:left;')}${td(`<span style="font-weight:800;">${member.positive>0?extraEsc(formatScore(member.positive)):''}</span>`,`text-align:center;color:#059669;${NUM_CELL_STYLE}`)}${td(`<span style="font-weight:800;">${member.negative<0?extraEsc(member.negative):''}</span>`,`text-align:center;color:#e11d48;${NUM_CELL_STYLE}`)}${td(`<span style="font-weight:800;font-size:15px;">${extraEsc(formatScore(member.total))}</span>`,`text-align:center;color:${member.total>=0?'#059669':'#e11d48'};${NUM_CELL_STYLE}`)}${td(`#${extraEsc(member.rank||'-')}`,'text-align:center;color:#475569;')}${td(statusBadge(member.status),'text-align:center;')}</tr>`;
    };
    return pageWrap(`${screenshotHeader(`BẢNG ĐIỂM THI ĐUA - TUẦN ${week} - TỔ ${group}`)}<table style="width:100%;border-collapse:collapse;font-size:15px;table-layout:fixed;"><thead><tr>${th('STT','width:32px;text-align:center;')}${th('Họ tên','text-align:left;')}${th('Cộng','width:64px;text-align:center;')}${th('Trừ','width:64px;text-align:center;')}${th('Tổng','width:64px;text-align:center;')}${th('Thứ','width:44px;text-align:center;')}${th('XL','width:70px;text-align:center;')}</tr></thead><tbody>${data.map(rowHtml).join('') || `<tr>${td('Không có dữ liệu tổ này.','text-align:center;color:#6b7280;')}</tr>`}</tbody></table>`);
  }

  function renderScreenshotHtml(type, members, week) { return type === 'ALL' ? renderAllClass(members, week) : renderGroup(members, week, type); }

  function ensureHiddenArea() {
    let area = document.getElementById('a3-shot-hidden-area');
    if (!area) { area = document.createElement('div'); area.id = 'a3-shot-hidden-area'; document.body.appendChild(area); }
    return area;
  }

  async function captureBlob(type, members, week, scale=2) {
    const html2canvas = await ensureHtml2Canvas();
    const area = ensureHiddenArea();
    area.innerHTML = renderScreenshotHtml(type, members, week);
    const target = area.firstElementChild;
    if (!target) throw new Error('Không dựng được ảnh báo cáo.');
    await new Promise(resolve => window.setTimeout(resolve, 120));
    const canvas = await html2canvas(target, { scale, useCORS: true, logging: false, backgroundColor: '#ffffff' });
    const blob = await extraCanvasToBlob(canvas);
    area.innerHTML = '';
    return blob;
  }

  function previewState() {
    if (!window.__a3ShotPreview) window.__a3ShotPreview = { blob: null, url: null, filename: 'BaoCao.png' };
    return window.__a3ShotPreview;
  }
  function closePreview() {
    document.getElementById('a3-shot-preview')?.remove();
    const s = previewState();
    if (s.url) {
      try { URL.revokeObjectURL(s.url); }
      catch (err) { console.warn('[closePreview] Không giải phóng được URL ảnh xem trước:', err); }
      s.url = null;
    }
  }
  function openPreview(blob, filename, copiedOk) {
    closePreview();
    const s = previewState();
    const url = URL.createObjectURL(blob);
    s.blob = blob; s.url = url; s.filename = filename;
    const modal = document.createElement('div');
    modal.id = 'a3-shot-preview';
    modal.className = 'a3-shot-preview-backdrop';
    modal.innerHTML = `<div class="a3-shot-preview-card"><header class="a3-shot-preview-header"><div><span>ẢNH BÁO CÁO</span><strong>${extraEsc(filename)}</strong><small>${copiedOk ? '✅ Đã copy vào clipboard — có thể dán ngay vào tin nhắn.' : '⚠️ Không copy được — có thể tải PNG bằng nút bên dưới.'}</small></div><button type="button" class="a3-shot-close" aria-label="Đóng">×</button></header><div class="a3-shot-preview-body"><img src="${url}" alt="Ảnh báo cáo" /></div><footer class="a3-shot-preview-footer"><button type="button" class="a3-shot-copy">Copy lại</button><button type="button" class="a3-shot-download">Tải PNG</button></footer></div>`;
    document.body.appendChild(modal);
  }

  async function captureSingle(type) {
    extraSetLoading(true, 'Đang tạo ảnh...');
    try {
      const { week, members } = extraGetMembersForCurrentWeek();
      const blob = await captureBlob(type, members, week, 2);
      const filename = `BaoCao_${type}_${extraSanitizeFileName(`Tuan_${week}`)}.png`;
      let copiedOk = false;
      try { await extraCopyBlobToClipboard(blob); copiedOk = true; extraToast('Đã copy ảnh', 'Bạn có thể dán Ctrl+V vào tin nhắn.', 'success'); }
      catch { extraToast('Không copy được', 'Trình duyệt chặn copy ảnh. Dùng nút tải PNG trong preview.', 'warning'); }
      openPreview(blob, filename, copiedOk);
    } catch (error) {
      extraToast('Lỗi', error instanceof Error ? error.message : 'Không thể tạo ảnh.', 'error');
    } finally {
      extraSetLoading(false);
      hideScreenshotMenu();
    }
  }

  async function captureZip() {
    extraSetLoading(true, 'Đang tạo ZIP 5 ảnh...');
    try {
      const { week, members } = extraGetMembersForCurrentWeek();
      const JSZip = await ensureJSZip();
      const zip = new JSZip();
      const types = ['ALL', 1, 2, 3, 4];
      for (let i = 0; i < types.length; i++) {
        extraSetLoading(true, `Đang tạo ảnh ${i+1}/${types.length}...`);
        const blob = await captureBlob(types[i], members, week, 1.9);
        zip.file(`BaoCao_${types[i]}_${extraSanitizeFileName(`Tuan_${week}`)}.png`, blob);
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      extraDownloadBlob(zipBlob, `BaoCao_${extraSanitizeFileName(`Tuan_${week}`)}_5_anh.zip`);
      extraToast('Thành công', 'Đã tải ZIP gồm 5 ảnh.', 'success');
    } catch (error) {
      extraToast('Lỗi', error instanceof Error ? error.message : 'Không thể tạo ZIP ảnh.', 'error');
    } finally {
      extraSetLoading(false);
      hideScreenshotMenu();
    }
  }

  async function shareAllMobile() {
    extraSetLoading(true, 'Đang chuẩn bị 5 ảnh để chia sẻ...');
    try {
      const { week, members } = extraGetMembersForCurrentWeek();
      const files = [];
      const types = ['ALL', 1, 2, 3, 4];
      for (let i = 0; i < types.length; i++) {
        extraSetLoading(true, `Đang tạo ảnh ${i+1}/${types.length}...`);
        const blob = await captureBlob(types[i], members, week, 1.6);
        files.push(new File([blob], `BaoCao_${types[i]}_${extraSanitizeFileName(`Tuan_${week}`)}.png`, { type: 'image/png' }));
      }
      if (!navigator.share || (navigator.canShare && !navigator.canShare({ files }))) {
        extraToast('Thiết bị chưa hỗ trợ', 'Sẽ tải ZIP thay thế.', 'warning');
        await captureZip();
        return;
      }
      await navigator.share({ files, title: 'Bộ ảnh báo cáo thi đua', text: 'Bộ 5 ảnh báo cáo thi đua A3K64' });
      extraToast('Đã mở chia sẻ', 'Chọn ứng dụng để gửi ảnh.', 'success');
    } catch (error) {
      extraToast('Lỗi chia sẻ', error instanceof Error ? error.message : 'Không thể chia sẻ ảnh.', 'error');
    } finally {
      extraSetLoading(false);
      hideScreenshotMenu();
    }
  }

  function hideScreenshotMenu() { document.getElementById('a3-screenshot-menu')?.remove(); }
  function showScreenshotMenu(anchor) {
    hideScreenshotMenu();
    const rect = anchor.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.id = 'a3-screenshot-menu';
    menu.className = 'a3-screenshot-menu';
    menu.innerHTML = `<div class="a3-shot-dropdown-header">Chụp ảnh báo cáo</div><button type="button" data-shot="ALL">📋 Cả lớp</button><button type="button" data-shot="1">👥 Tổ 1</button><button type="button" data-shot="2">👥 Tổ 2</button><button type="button" data-shot="3">👥 Tổ 3</button><button type="button" data-shot="4">👥 Tổ 4</button><button type="button" data-shot="zip">📦 Tải ZIP 5 ảnh</button><button type="button" data-shot="share" class="a3-share-mobile">📤 Chia sẻ 5 ảnh</button>`;
    menu.style.left = `${Math.min(rect.left, window.innerWidth - 230)}px`;
    menu.style.top = `${rect.bottom + 8}px`;
    document.body.appendChild(menu);
  }

  function injectStyle() {
    if (document.getElementById('a3-shot-style')) return;
    const style = document.createElement('style');
    style.id = 'a3-shot-style';
    style.textContent = `#a3-shot-hidden-area{position:fixed!important;left:-20000px!important;top:0!important;z-index:-1!important;pointer-events:none!important;opacity:1!important;background:#fff!important;width:820px!important;min-width:820px!important;overflow:visible!important}
.a3-screenshot-menu{position:fixed;width:210px;background:var(--bg-modal,rgba(15,23,42,.97));border:1px solid var(--border-modal,rgba(148,163,184,.28));border-radius:14px;padding:6px;z-index:2147483647;box-shadow:0 18px 50px rgba(0,0,0,.3);backdrop-filter:blur(20px);animation:a3ShotIn .16s ease}
.a3-shot-dropdown-header{padding:9px 12px 8px;font-size:10px;font-weight:800;text-transform:uppercase;color:var(--text-muted,#94a3b8);letter-spacing:1px;border-bottom:1px solid var(--border-subtle,rgba(148,163,184,.18));margin-bottom:5px}
.a3-screenshot-menu button{width:100%;border:0;background:transparent;color:var(--text,#e5e7eb);text-align:left;padding:10px 12px;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer}
.a3-screenshot-menu button:hover{background:color-mix(in srgb,var(--accent,#3b82f6) 14%,var(--bg-input,transparent));color:var(--accent,#93c5fd)}
.a3-share-mobile{display:none!important}@media(max-width:760px){.a3-share-mobile{display:block!important}}
.a3-shot-loading{position:fixed;inset:0;z-index:2147483647;background:rgba(2,6,23,.46);backdrop-filter:blur(3px);display:grid;place-items:center}
.a3-shot-loading>div{min-width:245px;border:1px solid var(--border-subtle,rgba(148,163,184,.24));border-radius:22px;display:grid;grid-template-columns:34px 1fr;gap:12px;align-items:center;padding:18px 20px;background:var(--bg-modal,#111827);color:var(--text,#f8fafc);box-shadow:0 24px 80px rgba(0,0,0,.42)}
.a3-shot-loading i{width:24px;height:24px;border:3px solid rgba(59,130,246,.22);border-top-color:#3b82f6;border-radius:999px;animation:a3Spin .75s linear infinite}
.a3-shot-loading strong{display:block;font-size:15px}
.a3-shot-loading span{display:block;margin-top:3px;color:var(--text-muted,#94a3b8);font-size:13px}
.a3-shot-preview-backdrop{position:fixed;inset:0;z-index:2147483647;background:rgba(2,6,23,.62);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:22px}
.a3-shot-preview-card{width:min(1180px,96vw);height:min(900px,92vh);border:1px solid var(--border-modal,rgba(148,163,184,.28));border-radius:28px;background:var(--bg-modal,#0f172a);color:var(--text,#f8fafc);display:flex;flex-direction:column;overflow:hidden;box-shadow:0 30px 100px rgba(0,0,0,.4)}
.a3-shot-preview-header{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:18px 22px;background:var(--bg-modal-header,rgba(15,23,42,.98));border-bottom:1px solid var(--border-subtle,rgba(148,163,184,.18))}
.a3-shot-preview-header span{display:block;font-size:11px;font-weight:800;letter-spacing:3px;color:var(--text-muted,#94a3b8)}
.a3-shot-preview-header strong{display:block;margin-top:4px;font-size:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:760px;color:var(--text,#f8fafc)}
.a3-shot-preview-header small{display:block;margin-top:5px;color:var(--text-sub,#cbd5e1)}
.a3-shot-close{width:38px;height:38px;border:0;border-radius:13px;background:var(--border-subtle,rgba(148,163,184,.13));color:var(--text,#f8fafc);cursor:pointer;font-size:24px;font-weight:800}
.a3-shot-close:hover{background:rgba(239,68,68,.15);color:#f87171}
.a3-shot-preview-body{flex:1;overflow:auto;padding:18px;background:var(--bg-deep,#111827);display:grid;place-items:start center}
.a3-shot-preview-body img{max-width:100%;height:auto;border-radius:12px;background:#fff;box-shadow:0 18px 50px rgba(0,0,0,.3)}
.a3-shot-preview-footer{display:flex;justify-content:flex-end;gap:10px;padding:14px 18px;border-top:1px solid var(--border-subtle,rgba(148,163,184,.18))}
.a3-shot-preview-footer button{border:0;border-radius:14px;padding:11px 16px;font-weight:800;cursor:pointer}
.a3-shot-copy{background:var(--bg-mid,#1e293b);color:var(--text,#dbeafe);border:1px solid var(--border-modal)}
.a3-shot-copy:hover{border-color:var(--accent)}
.a3-shot-download{background:var(--accent,#2563eb);color:#fff}
.a3-shot-toast{position:fixed;right:18px;bottom:22px;z-index:2147483647;min-width:250px;max-width:min(380px,calc(100vw - 28px));border-radius:18px;padding:14px 16px;background:var(--bg-modal,#111827);color:var(--text,#f8fafc);border:1px solid var(--border-subtle,rgba(148,163,184,.24));box-shadow:0 18px 50px rgba(0,0,0,.3);display:grid;gap:4px}
.a3-shot-toast strong{font-size:14px}
.a3-shot-toast span{font-size:13px;color:var(--text-sub,#cbd5e1)}
.a3-shot-toast.success{border-color:rgba(34,197,94,.45)}
.a3-shot-toast.warning{border-color:rgba(245,158,11,.45)}
.a3-shot-toast.error{border-color:rgba(239,68,68,.5)}
@keyframes a3Spin{to{transform:rotate(360deg)}}
@keyframes a3ShotIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}`;
    document.head.appendChild(style);
  }

  function install() {
    injectStyle();
    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!target) return;
      if (target.closest('.a3-shot-close')) { closePreview(); return; }
      if (target.classList?.contains('a3-shot-preview-backdrop')) { closePreview(); return; }
      if (target.closest('.a3-shot-copy')) {
        const s = previewState();
        if (s.blob) extraCopyBlobToClipboard(s.blob).then(() => extraToast('Đã copy ảnh', 'Bạn có thể dán Ctrl+V vào tin nhắn.', 'success')).catch(() => extraToast('Không copy được', 'Trình duyệt chặn copy ảnh.', 'warning'));
        return;
      }
      if (target.closest('.a3-shot-download')) { const s = previewState(); if (s.blob) extraDownloadBlob(s.blob, s.filename); return; }
      const menuItem = target.closest?.('#a3-screenshot-menu [data-shot]');
      if (menuItem) {
        event.preventDefault(); event.stopPropagation();
        const value = menuItem.dataset.shot || '';
        if (value === 'zip') captureZip();
        else if (value === 'share') shareAllMobile();
        else captureSingle(value === 'ALL' ? 'ALL' : Number(value));
        return;
      }
      const cameraButton = target.closest?.('.toolbar-button.camera');
      if (cameraButton) {
        event.preventDefault(); event.stopPropagation();
        const isOpen = Boolean(document.getElementById('a3-screenshot-menu'));
        if (isOpen) hideScreenshotMenu(); else showScreenshotMenu(cameraButton);
        return;
      }
      if (!target.closest?.('#a3-screenshot-menu')) hideScreenshotMenu();
    }, true);
    window.addEventListener('keydown', (event) => { if (event.key === 'Escape') { hideScreenshotMenu(); closePreview(); } });
  }

  install();
})();