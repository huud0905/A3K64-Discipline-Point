const SPA4_WIN = "#a3k64-seating-window";
const SPA4_MAP_KEY = "a3k64-seating-map-v1";
const SPA4_MODAL_ID = "a3-seat-print-a4-modal";
const SPA4_STYLE_ID = "a3-seat-print-a4-style";

type Spa4Seats = { left: string[][]; right: string[][] };

function spa4Escape(value: unknown) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function spa4Rows(rows: any[]): string[][] {
  return Array.from({ length: 7 }, (_, rowIndex) => {
    const row = Array.isArray(rows?.[rowIndex]) ? rows[rowIndex] : [];
    return Array.from({ length: 4 }, (_, seatIndex) => String(row[seatIndex] || "").trim());
  });
}

function spa4SeatsFromDom(): Spa4Seats | null {
  const cells = Array.from(document.querySelectorAll<HTMLElement>(`${SPA4_WIN} .stable-seat-cell`));
  if (!cells.length) return null;
  const seats: Spa4Seats = {
    left: Array.from({ length: 7 }, () => Array.from({ length: 4 }, () => "")),
    right: Array.from({ length: 7 }, () => Array.from({ length: 4 }, () => "")),
  };
  cells.forEach((cell) => {
    const side = cell.dataset.side === "right" ? "right" : cell.dataset.side === "left" ? "left" : null;
    const row = Number(cell.dataset.row);
    const seat = Number(cell.dataset.seat);
    if (!side || !Number.isFinite(row) || !Number.isFinite(seat) || row < 0 || row > 6 || seat < 0 || seat > 3) return;
    const text = (cell.textContent || "").replace(/\s+/g, " ").trim();
    seats[side][row][seat] = text && text !== "Trống" ? text : "";
  });
  return seats;
}

function spa4SeatsFromStorage(): Spa4Seats {
  try {
    const raw = localStorage.getItem(SPA4_MAP_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return { left: spa4Rows(parsed.left || []), right: spa4Rows(parsed.right || []) };
  } catch {
    return { left: spa4Rows([]), right: spa4Rows([]) };
  }
}

function spa4CurrentSeats() {
  return spa4SeatsFromDom() || spa4SeatsFromStorage();
}

function spa4Cell(name: string) {
  const clean = String(name || "").trim();
  const len = clean.length;
  const cls = len >= 12 ? "tiny" : len >= 9 ? "small" : "";
  return `<td class="${cls}"><span>${spa4Escape(clean)}</span></td>`;
}

function spa4Side(rows: string[][]) {
  return `<div class="side">${rows.map((row) => `<table class="desk"><tr>${row.map(spa4Cell).join("")}</tr></table>`).join("")}</div>`;
}

function spa4PrintHtml(seats: Spa4Seats, changeNo: string, dateText: string) {
  const no = spa4Escape(changeNo || "...");
  const date = spa4Escape(dateText || ".../.../...");
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<title>Sơ đồ chỗ ngồi lớp 12A3</title>
<style>
  @page{size:A4 landscape;margin:7mm 9mm;}
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;background:#fff;color:#000;font-family:"Times New Roman","Noto Serif",Arial,serif;}
  body{width:279mm;min-height:192mm;}
  .page{width:100%;min-height:192mm;position:relative;padding:6mm 7mm 7mm;}
  .title{text-align:center;color:red;font-size:19pt;font-weight:700;margin:0 0 3.5mm;text-transform:uppercase;}
  .subtitle{text-align:center;color:red;font-size:15.5pt;font-weight:700;margin:0 0 2mm;}
  .room{position:relative;border:1.8px solid #0f3554;min-height:148mm;padding:12mm 10mm 9mm;}
  .back{position:absolute;top:4mm;left:50%;transform:translateX(-50%);font-size:14pt;font-weight:700;}
  .layout{display:grid;grid-template-columns:minmax(0,1fr) 23mm minmax(0,1fr);gap:12mm;align-items:stretch;margin-top:1mm;}
  .side{display:grid;grid-template-rows:repeat(7,1fr);gap:8.8mm;align-content:stretch;min-width:0;}
  .desk{width:100%;height:8.8mm;border-collapse:collapse;table-layout:fixed;font-size:12.4pt;}
  .desk td{border:1px solid #000;text-align:center;vertical-align:middle;height:8.8mm;width:25%;padding:0 1.1mm;white-space:nowrap;line-height:1.05;overflow:hidden;}
  .desk td span{display:block;width:100%;overflow:hidden;text-overflow:clip;white-space:nowrap;}
  .desk td.small{font-size:11.4pt;letter-spacing:-.02em;}
  .desk td.tiny{font-size:10.3pt;letter-spacing:-.04em;}
  .aisle{display:flex;align-items:flex-end;justify-content:center;font-size:13pt;font-weight:700;padding-bottom:1mm;}
  .front{display:grid;grid-template-columns:minmax(0,1fr) 23mm minmax(0,1fr);gap:12mm;margin-top:2mm;font-size:14pt;font-weight:700;}
  .front span{text-align:center;}
  .gv{position:absolute;right:8mm;bottom:2mm;font-size:13.2pt;}
  .window{position:absolute;width:5mm;height:26mm;background:#176a8b;border:1.3px solid #08384d;}
  .window.left.a{left:-2.7mm;top:16%;}.window.left.b{left:-2.7mm;top:66%;}
  .window.right.a{right:-2.7mm;top:10%;}.window.right.b{right:-2.7mm;top:38%;}
  .door{position:absolute;right:-2.7mm;bottom:5mm;width:5mm;height:34mm;background:#050505;border:1.3px solid #050505;}
  @media print{.page{break-inside:avoid;} body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
</style>
</head>
<body>
  <main class="page">
    <h1 class="title">SƠ ĐỒ CHỖ NGỒI LỚP 12A3</h1>
    <h2 class="subtitle">Thay đổi lần ${no} – Áp dụng từ ngày ${date}</h2>
    <section class="room">
      <div class="window left a"></div><div class="window left b"></div><div class="window right a"></div><div class="window right b"></div><div class="door"></div>
      <div class="back">CUỐI LỚP</div>
      <div class="layout">
        ${spa4Side(seats.left)}
        <div class="aisle"></div>
        ${spa4Side(seats.right)}
      </div>
      <div class="front"><span>BÀN GV</span><span>BẢNG</span><span></span></div>
      <div class="gv">GVCN: Võ Thị Ngọc Tân – Đã duyệt</div>
    </section>
  </main>
  <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),120));</script>
</body>
</html>`;
}

function spa4OpenPrint(changeNo: string, dateText: string) {
  const seats = spa4CurrentSeats();
  const html = spa4PrintHtml(seats, changeNo, dateText);
  const printWindow = window.open("", "_blank", "width=1200,height=820");
  if (!printWindow) {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "so-do-cho-ngoi-12A3.html";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    return;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

function spa4TodayText() {
  const now = new Date();
  return `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
}

function spa4ShowModal() {
  document.getElementById(SPA4_MODAL_ID)?.remove();
  spa4Style();
  const wrap = document.createElement("div");
  wrap.id = SPA4_MODAL_ID;
  wrap.innerHTML = `
    <div class="spa4-card" role="dialog" aria-modal="true">
      <h2>In / Xuất sơ đồ chỗ ngồi</h2>
      <p>Khổ giấy A4 ngang, lớp 12A3. Nhập thông tin để in.</p>
      <div class="spa4-grid">
        <label>Thay đổi lần<input data-field="change" value="1" inputmode="numeric" /></label>
        <label>Áp dụng từ ngày<input data-field="date" value="${spa4Escape(spa4TodayText())}" placeholder="dd/mm/yyyy" /></label>
      </div>
      <div class="spa4-actions"><button type="button" data-close>Huỷ</button><button type="button" data-print>In A4 ngang</button></div>
    </div>`;
  document.body.appendChild(wrap);
  wrap.querySelector<HTMLButtonElement>("[data-close]")?.addEventListener("click", () => wrap.remove());
  wrap.addEventListener("click", (event) => { if (event.target === wrap) wrap.remove(); });
  wrap.querySelector<HTMLButtonElement>("[data-print]")?.addEventListener("click", () => {
    const get = (name: string) => (wrap.querySelector<HTMLInputElement>(`[data-field='${name}']`)?.value || "").trim();
    spa4OpenPrint(get("change"), get("date"));
    wrap.remove();
  });
  setTimeout(() => wrap.querySelector<HTMLInputElement>("[data-field='change']")?.focus(), 60);
}

function spa4Style() {
  if (document.getElementById(SPA4_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SPA4_STYLE_ID;
  style.textContent = `
    #${SPA4_MODAL_ID}{position:fixed;inset:0;z-index:1000005;background:rgba(15,23,42,.28);display:grid;place-items:center;padding:20px;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",Arial,sans-serif;}
    #${SPA4_MODAL_ID} .spa4-card{width:min(560px,calc(100vw - 32px));max-width:100%;background:rgba(255,255,255,.98);border:1px solid #cbd5e1;border-radius:24px;box-shadow:0 30px 100px rgba(15,23,42,.24);padding:22px;color:#0f172a;overflow:hidden;}
    #${SPA4_MODAL_ID} h2{margin:0 0 6px;font-size:22px;letter-spacing:-.03em;}
    #${SPA4_MODAL_ID} p{margin:0 0 16px;color:#475569;font-weight:750;font-size:13px;}
    #${SPA4_MODAL_ID} .spa4-grid{display:grid;grid-template-columns:minmax(120px,.72fr) minmax(230px,1.28fr);gap:12px;width:100%;}
    #${SPA4_MODAL_ID} label{min-width:0;display:grid;gap:6px;font-size:12px;font-weight:950;color:#334155;}
    #${SPA4_MODAL_ID} input{width:100%;min-width:0;height:42px;border:1px solid #cbd5e1;border-radius:14px;padding:0 12px;font-size:15px;font-weight:900;outline:none;box-sizing:border-box;}
    #${SPA4_MODAL_ID} input:focus{border-color:var(--desktop-accent,#14b8a6);box-shadow:0 0 0 3px color-mix(in srgb,var(--desktop-accent,#14b8a6) 18%,transparent);}
    #${SPA4_MODAL_ID} .spa4-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px;}
    #${SPA4_MODAL_ID} button{height:42px;border:1px solid #cbd5e1;border-radius:14px;padding:0 16px;background:#fff;color:#0f172a;font-weight:950;cursor:pointer;}
    #${SPA4_MODAL_ID} [data-print]{background:var(--desktop-accent,#14b8a6);border-color:transparent;color:#fff;}
    .theme-dark #${SPA4_MODAL_ID},
    html.a3-overlay-dark #${SPA4_MODAL_ID},
    html.dark #${SPA4_MODAL_ID},
    body.theme-dark #${SPA4_MODAL_ID},
    body.a3-overlay-dark #${SPA4_MODAL_ID},
    [data-theme="dark"] #${SPA4_MODAL_ID}{background:rgba(0,0,0,.55);}
    .theme-dark #${SPA4_MODAL_ID} .spa4-card,
    html.a3-overlay-dark #${SPA4_MODAL_ID} .spa4-card,
    html.dark #${SPA4_MODAL_ID} .spa4-card,
    body.theme-dark #${SPA4_MODAL_ID} .spa4-card,
    body.a3-overlay-dark #${SPA4_MODAL_ID} .spa4-card,
    [data-theme="dark"] #${SPA4_MODAL_ID} .spa4-card{background:#0f172a;color:#f8fafc;border-color:#334155;box-shadow:0 32px 110px rgba(0,0,0,.48);}
    .theme-dark #${SPA4_MODAL_ID} p,.theme-dark #${SPA4_MODAL_ID} label,
    html.a3-overlay-dark #${SPA4_MODAL_ID} p,html.a3-overlay-dark #${SPA4_MODAL_ID} label,
    html.dark #${SPA4_MODAL_ID} p,html.dark #${SPA4_MODAL_ID} label,
    body.theme-dark #${SPA4_MODAL_ID} p,body.theme-dark #${SPA4_MODAL_ID} label,
    body.a3-overlay-dark #${SPA4_MODAL_ID} p,body.a3-overlay-dark #${SPA4_MODAL_ID} label,
    [data-theme="dark"] #${SPA4_MODAL_ID} p,[data-theme="dark"] #${SPA4_MODAL_ID} label{color:#cbd5e1;}
    .theme-dark #${SPA4_MODAL_ID} input,.theme-dark #${SPA4_MODAL_ID} button,
    html.a3-overlay-dark #${SPA4_MODAL_ID} input,html.a3-overlay-dark #${SPA4_MODAL_ID} button,
    html.dark #${SPA4_MODAL_ID} input,html.dark #${SPA4_MODAL_ID} button,
    body.theme-dark #${SPA4_MODAL_ID} input,body.theme-dark #${SPA4_MODAL_ID} button,
    body.a3-overlay-dark #${SPA4_MODAL_ID} input,body.a3-overlay-dark #${SPA4_MODAL_ID} button,
    [data-theme="dark"] #${SPA4_MODAL_ID} input,[data-theme="dark"] #${SPA4_MODAL_ID} button{background:#111827;color:#f8fafc;border-color:#334155;}
    @media (max-width:560px){#${SPA4_MODAL_ID} .spa4-grid{grid-template-columns:1fr;}#${SPA4_MODAL_ID} .spa4-actions{justify-content:stretch;}#${SPA4_MODAL_ID} button{flex:1;}}
  `;
  document.head.appendChild(style);
}

function spa4IsPrintButton(btn: HTMLElement | null) {
  const text = (btn?.textContent || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
  return text.includes("xuat") || text.includes("in");
}

function spa4Boot() {
  spa4Style();
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const btn = target?.closest?.(`${SPA4_WIN} .stable-seat-tools button`) as HTMLButtonElement | null;
    if (!btn || !spa4IsPrintButton(btn)) return;
    event.preventDefault();
    event.stopPropagation();
    if ("stopImmediatePropagation" in event) event.stopImmediatePropagation();
    spa4ShowModal();
  }, true);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", spa4Boot);
else spa4Boot();

export {};
