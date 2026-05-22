import { fetchScoreboardFromGas, getCachedScoreboardFromGas } from "./lib/gasApi";
import { formatScore, mockScoreEvents, mockStudents, readScoreStatus, ScoreEvent, Student, StudentScoreSummary, summarizeStudents } from "./apps/ScoreboardApp/data/mockScoreData";

const HTML2CANVAS_URL = "https://html2canvas.hertzen.com/dist/html2canvas.min.js";
const JSZIP_URL = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
const SESSION_KEY = "a3k64-login-session-v1";

type CaptureType = "ALL" | 1 | 2 | 3 | 4;
type Html2CanvasFn = (element: HTMLElement, options?: Record<string, unknown>) => Promise<HTMLCanvasElement>;
type ShotPreview = { blob: Blob | null; url: string | null; filename: string };
type GlobalWithLibs = typeof window & {
  html2canvas?: Html2CanvasFn;
  JSZip?: new () => { file: (name: string, data: Blob) => void; generateAsync: (options: { type: "blob" }) => Promise<Blob> };
  ClipboardItem?: new (items: Record<string, Blob>) => unknown;
  __a3ShotPreview?: ShotPreview;
  __a3Html2CanvasPromise?: Promise<Html2CanvasFn>;
  __a3JsZipPromise?: Promise<NonNullable<GlobalWithLibs["JSZip"]>>;
};

type MemberForShot = StudentScoreSummary & {
  plusText: string;
  minusText: string;
};

function esc(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] || char));
}

function sanitizeFileName(value: string) {
  return String(value || "BaoCao").replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").slice(0, 120);
}

function getGlobal() {
  return window as GlobalWithLibs;
}

function injectScriptOnce<T>(key: "__a3Html2CanvasPromise" | "__a3JsZipPromise", url: string, getter: () => T | undefined) {
  const win = getGlobal();
  const existing = getter();
  if (existing) return Promise.resolve(existing);
  if (win[key]) return win[key] as Promise<T>;
  win[key] = new Promise<T>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.onload = () => {
      const loaded = getter();
      loaded ? resolve(loaded) : reject(new Error(`Không tải được thư viện ${url}`));
    };
    script.onerror = () => reject(new Error(`Không tải được thư viện ${url}`));
    document.head.appendChild(script);
  }) as never;
  return win[key] as Promise<T>;
}

function ensureHtml2Canvas() {
  return injectScriptOnce<Html2CanvasFn>("__a3Html2CanvasPromise", HTML2CANVAS_URL, () => getGlobal().html2canvas);
}

function ensureJSZip() {
  return injectScriptOnce<NonNullable<GlobalWithLibs["JSZip"]>>("__a3JsZipPromise", JSZIP_URL, () => getGlobal().JSZip);
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      blob ? resolve(blob) : reject(new Error("Không tạo được ảnh PNG."));
    }, "image/png");
  });
}

async function copyBlobToClipboard(blob: Blob) {
  const win = getGlobal();
  if (!navigator.clipboard || !win.ClipboardItem) throw new Error("Trình duyệt không hỗ trợ copy ảnh.");
  await navigator.clipboard.write([new win.ClipboardItem({ "image/png": blob }) as ClipboardItem]);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || "BaoCao.png";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function showToast(title: string, message: string, kind: "success" | "warning" | "error" | "info" = "info") {
  const old = document.querySelector(".a3-shot-toast");
  old?.remove();
  const toast = document.createElement("div");
  toast.className = `a3-shot-toast ${kind}`;
  toast.innerHTML = `<strong>${esc(title)}</strong><span>${esc(message)}</span>`;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 3600);
}

function setLoading(visible: boolean, message = "Đang tạo ảnh...") {
  const current = document.getElementById("a3-shot-loading");
  if (!visible) {
    current?.remove();
    return;
  }
  if (current) {
    const span = current.querySelector("span");
    if (span) span.textContent = message;
    return;
  }
  const node = document.createElement("div");
  node.id = "a3-shot-loading";
  node.className = "a3-shot-loading";
  node.innerHTML = `<div><i></i><strong>Đang xử lý...</strong><span>${esc(message)}</span></div>`;
  document.body.appendChild(node);
}

function getCurrentWeekFromDom(weeks: number[]) {
  const labels = Array.from(document.querySelectorAll<HTMLElement>(".score-filter"));
  const weekFilter = labels.find((item) => /tuần/i.test(item.querySelector("span")?.textContent || ""));
  const text = weekFilter?.querySelector(".filter-select-button span")?.textContent || "";
  const match = text.match(/(\d+)/);
  const parsed = match ? Number(match[1]) : NaN;
  if (Number.isFinite(parsed) && weeks.includes(parsed)) return parsed;
  return weeks.length ? weeks[weeks.length - 1] : 1;
}

async function getScoreboardPayload() {
  const cached = getCachedScoreboardFromGas();
  if (cached?.students?.length) return cached;
  const remote = await fetchScoreboardFromGas();
  if (remote?.students?.length) return remote;
  return { students: mockStudents, events: mockScoreEvents, weeks: [1] };
}

function eventTitles(events: ScoreEvent[], positive: boolean) {
  return events
    .filter((event) => (positive ? event.points > 0 : event.points < 0))
    .map((event) => event.title.trim())
    .filter(Boolean)
    .join(" • ");
}

async function getMembersForCurrentWeek() {
  const payload = await getScoreboardPayload();
  const weeks = payload.weeks.length ? payload.weeks : [1];
  const week = getCurrentWeekFromDom(weeks);
  const summaries = summarizeStudents(payload.students, payload.events, week) as StudentScoreSummary[];
  const members = summaries.map((summary) => ({
    ...summary,
    plusText: eventTitles(summary.events, true),
    minusText: eventTitles(summary.events, false),
  }));
  return { week, members };
}

function rankColorOf(status: string) {
  if (status === "Tốt") return "#059669";
  if (status === "Khá") return "#d97706";
  if (status === "Đạt") return "#ea580c";
  if (status === "Chưa đạt") return "#e11d48";
  return "#111827";
}

function statusBadge(status: string) {
  const color = rankColorOf(status);
  return `<span style="display:inline-block;color:${color};font-weight:800;border:1px solid ${color};padding:2px 7px;border-radius:7px;font-size:12px;white-space:nowrap;">${esc(status)}</span>`;
}

function th(text: string, extra = "") {
  return `<th style="border:1px solid #d1d5db;padding:8px 6px;background:#f3f4f6;font-weight:800;${extra}">${esc(text)}</th>`;
}

function td(html: string, extra = "") {
  return `<td style="border:1px solid #d1d5db;padding:7px 6px;vertical-align:top;${extra}">${html}</td>`;
}

function screenshotHeader(title: string) {
  return `
    <div style="text-align:center;margin-bottom:18px;">
      <div style="font-size:22px;font-weight:900;letter-spacing:.3px;text-transform:uppercase;line-height:1.2;">${esc(title)}</div>
      <div style="margin-top:6px;font-size:14px;color:#374151;">Lớp 12A3</div>
    </div>
  `;
}

function pageWrap(content: string) {
  const now = new Date().toLocaleString("vi-VN");
  return `
    <div class="a3-shot-page" style="width:794px;min-height:1123px;box-sizing:border-box;padding:28px;background:#fff;color:#000;font-family:'Times New Roman',serif;border:1px solid #e5e7eb;">
      ${content}
      <div style="margin-top:14px;text-align:right;font-style:italic;color:#6b7280;font-size:12px;">Xuất từ hệ thống quản lý 12A3 - ${esc(now)}</div>
    </div>
  `;
}

function renderAllClass(members: MemberForShot[], week: number) {
  const data = [...members].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "vi"));
  const mid = Math.ceil(data.length / 2);
  const leftData = data.slice(0, mid);
  const rightData = data.slice(mid);
  const renderRow = (member: MemberForShot, index: number, startIndex: number) => `
    <tr>
      ${td(String(startIndex + index + 1), "text-align:center;font-weight:700;")}
      ${td(`<span style="font-weight:900;">${esc(member.name)}</span>`, "text-align:left;")}
      ${td(`<span style="font-weight:900;font-size:16px;">${esc(formatScore(member.total))}</span>`, `text-align:center;color:${member.total >= 0 ? "#059669" : "#e11d48"};`)}
      ${td(`#${esc(member.rank || "-")}`, "text-align:center;")}
      ${td(statusBadge(member.status), "text-align:center;")}
    </tr>
  `;
  const renderTable = (items: MemberForShot[], startIndex: number) => `
    <table style="width:100%;border-collapse:collapse;font-size:15px;table-layout:fixed;">
      <thead><tr>${th("STT", "width:34px;text-align:center;")}${th("Họ tên", "text-align:left;")}${th("Điểm", "width:60px;text-align:center;")}${th("Thứ", "width:48px;text-align:center;")}${th("XL", "width:76px;text-align:center;")}</tr></thead>
      <tbody>${items.map((member, index) => renderRow(member, index, startIndex)).join("")}</tbody>
    </table>
  `;
  return pageWrap(`
    ${screenshotHeader(`BẢNG ĐIỂM THI ĐUA - TUẦN ${week} - CẢ LỚP`)}
    <div style="display:flex;gap:12px;align-items:flex-start;">
      <div style="flex:1;min-width:0;">${renderTable(leftData, 0)}</div>
      <div style="flex:1;min-width:0;">${renderTable(rightData, mid)}</div>
    </div>
  `);
}

function renderGroup(members: MemberForShot[], week: number, group: 1 | 2 | 3 | 4) {
  const data = members.filter((member) => Number(member.group) === group).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "vi"));
  const clamp = "display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.25;";
  const rowHtml = (member: MemberForShot, index: number) => {
    const plusShort = member.plusText ? `<div style="margin-top:3px;font-size:12px;color:#059669;${clamp}">+ ${esc(member.plusText)}</div>` : "";
    const minusShort = member.minusText ? `<div style="margin-top:2px;font-size:12px;color:#e11d48;${clamp}">- ${esc(member.minusText)}</div>` : "";
    const nameCell = `<div style="font-weight:900;font-size:15px;">${esc(member.name)}</div>${plusShort}${minusShort}`;
    return `
      <tr>
        ${td(String(index + 1), "text-align:center;font-weight:700;")}
        ${td(nameCell, "text-align:left;")}
        ${td(`<span style="font-weight:900;">${member.positive > 0 ? esc(formatScore(member.positive)) : ""}</span>`, "text-align:center;color:#059669;")}
        ${td(`<span style="font-weight:900;">${member.negative < 0 ? esc(member.negative) : ""}</span>`, "text-align:center;color:#e11d48;")}
        ${td(`<span style="font-weight:900;font-size:16px;">${esc(formatScore(member.total))}</span>`, `text-align:center;color:${member.total >= 0 ? "#059669" : "#e11d48"};`)}
        ${td(`#${esc(member.rank || "-")}`, "text-align:center;")}
        ${td(statusBadge(member.status), "text-align:center;")}
      </tr>
    `;
  };
  return pageWrap(`
    ${screenshotHeader(`BẢNG ĐIỂM THI ĐUA - TUẦN ${week} - TỔ ${group}`)}
    <table style="width:100%;border-collapse:collapse;font-size:15px;table-layout:fixed;">
      <thead><tr>${th("STT", "width:34px;text-align:center;")}${th("Họ tên", "text-align:left;")}${th("Cộng", "width:58px;text-align:center;")}${th("Trừ", "width:58px;text-align:center;")}${th("Tổng", "width:58px;text-align:center;")}${th("Thứ", "width:46px;text-align:center;")}${th("XL", "width:76px;text-align:center;")}</tr></thead>
      <tbody>${data.map(rowHtml).join("") || `<tr>${td("Không có dữ liệu tổ này.", "text-align:center;color:#6b7280;",)}</tr>`}</tbody>
    </table>
  `);
}

function renderScreenshotHtml(type: CaptureType, members: MemberForShot[], week: number) {
  return type === "ALL" ? renderAllClass(members, week) : renderGroup(members, week, type);
}

function ensureHiddenArea() {
  let area = document.getElementById("a3-shot-hidden-area");
  if (!area) {
    area = document.createElement("div");
    area.id = "a3-shot-hidden-area";
    document.body.appendChild(area);
  }
  return area;
}

async function captureBlob(type: CaptureType, members: MemberForShot[], week: number, scale = 2) {
  const html2canvas = await ensureHtml2Canvas();
  const area = ensureHiddenArea();
  area.innerHTML = renderScreenshotHtml(type, members, week);
  const target = area.firstElementChild as HTMLElement | null;
  if (!target) throw new Error("Không dựng được ảnh báo cáo.");
  await new Promise((resolve) => window.setTimeout(resolve, 120));
  const canvas = await html2canvas(target, { scale, useCORS: true, logging: false, backgroundColor: "#ffffff" });
  const blob = await canvasToBlob(canvas);
  area.innerHTML = "";
  return blob;
}

function previewState() {
  const win = getGlobal();
  if (!win.__a3ShotPreview) win.__a3ShotPreview = { blob: null, url: null, filename: "BaoCao.png" };
  return win.__a3ShotPreview;
}

function closePreview() {
  const modal = document.getElementById("a3-shot-preview");
  modal?.remove();
  const state = previewState();
  if (state.url) {
    try { URL.revokeObjectURL(state.url); } catch {}
    state.url = null;
  }
}

function openPreview(blob: Blob, filename: string, copiedOk: boolean) {
  closePreview();
  const state = previewState();
  const url = URL.createObjectURL(blob);
  state.blob = blob;
  state.url = url;
  state.filename = filename;
  const modal = document.createElement("div");
  modal.id = "a3-shot-preview";
  modal.className = "a3-shot-preview-backdrop";
  modal.innerHTML = `
    <div class="a3-shot-preview-card">
      <header class="a3-shot-preview-header">
        <div><span>ẢNH BÁO CÁO</span><strong>${esc(filename)}</strong><small>${copiedOk ? "✅ Đã copy vào clipboard — có thể dán ngay vào tin nhắn." : "⚠️ Không copy được — có thể tải PNG bằng nút bên dưới."}</small></div>
        <button type="button" class="a3-shot-close" aria-label="Đóng">×</button>
      </header>
      <div class="a3-shot-preview-body"><img src="${url}" alt="Ảnh báo cáo" /></div>
      <footer class="a3-shot-preview-footer">
        <button type="button" class="a3-shot-copy">Copy lại</button>
        <button type="button" class="a3-shot-download">Tải PNG</button>
      </footer>
    </div>
  `;
  document.body.appendChild(modal);
}

async function captureSingle(type: CaptureType) {
  setLoading(true, "Đang tạo ảnh...");
  try {
    const { week, members } = await getMembersForCurrentWeek();
    const blob = await captureBlob(type, members, week, 2);
    const filename = `BaoCao_${type}_${sanitizeFileName(`Tuan_${week}`)}.png`;
    let copiedOk = false;
    try {
      await copyBlobToClipboard(blob);
      copiedOk = true;
      showToast("Đã copy ảnh", "Bạn có thể dán Ctrl+V vào tin nhắn.", "success");
    } catch {
      showToast("Không copy được", "Trình duyệt chặn copy ảnh. Dùng nút tải PNG trong preview.", "warning");
    }
    openPreview(blob, filename, copiedOk);
  } catch (error) {
    showToast("Lỗi", error instanceof Error ? error.message : "Không thể tạo ảnh.", "error");
  } finally {
    setLoading(false);
    hideScreenshotMenu();
  }
}

async function captureZip() {
  setLoading(true, "Đang tạo ZIP 5 ảnh...");
  try {
    const { week, members } = await getMembersForCurrentWeek();
    const JSZip = await ensureJSZip();
    const zip = new JSZip();
    const types: CaptureType[] = ["ALL", 1, 2, 3, 4];
    for (let index = 0; index < types.length; index += 1) {
      setLoading(true, `Đang tạo ảnh ${index + 1}/${types.length}...`);
      const type = types[index];
      const blob = await captureBlob(type, members, week, 1.9);
      zip.file(`BaoCao_${type}_${sanitizeFileName(`Tuan_${week}`)}.png`, blob);
    }
    const zipBlob = await zip.generateAsync({ type: "blob" });
    downloadBlob(zipBlob, `BaoCao_${sanitizeFileName(`Tuan_${week}`)}_5_anh.zip`);
    showToast("Thành công", "Đã tải ZIP gồm 5 ảnh.", "success");
  } catch (error) {
    showToast("Lỗi", error instanceof Error ? error.message : "Không thể tạo ZIP ảnh.", "error");
  } finally {
    setLoading(false);
    hideScreenshotMenu();
  }
}

async function shareAllMobile() {
  setLoading(true, "Đang chuẩn bị 5 ảnh để chia sẻ...");
  try {
    const { week, members } = await getMembersForCurrentWeek();
    const files: File[] = [];
    const types: CaptureType[] = ["ALL", 1, 2, 3, 4];
    for (let index = 0; index < types.length; index += 1) {
      setLoading(true, `Đang tạo ảnh ${index + 1}/${types.length}...`);
      const type = types[index];
      const blob = await captureBlob(type, members, week, 1.6);
      files.push(new File([blob], `BaoCao_${type}_${sanitizeFileName(`Tuan_${week}`)}.png`, { type: "image/png" }));
    }
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean; share?: (data: ShareData) => Promise<void> };
    if (!nav.share || (nav.canShare && !nav.canShare({ files }))) {
      showToast("Thiết bị chưa hỗ trợ", "Sẽ tải ZIP thay thế.", "warning");
      await captureZip();
      return;
    }
    await nav.share({ files, title: "Bộ ảnh báo cáo thi đua", text: "Bộ 5 ảnh báo cáo thi đua lớp 12A3" });
    showToast("Đã mở chia sẻ", "Chọn ứng dụng để gửi ảnh.", "success");
  } catch (error) {
    showToast("Lỗi chia sẻ", error instanceof Error ? error.message : "Không thể chia sẻ ảnh.", "error");
  } finally {
    setLoading(false);
    hideScreenshotMenu();
  }
}

function hideScreenshotMenu() {
  document.getElementById("a3-screenshot-menu")?.remove();
}

function showScreenshotMenu(anchor: HTMLElement) {
  hideScreenshotMenu();
  const rect = anchor.getBoundingClientRect();
  const menu = document.createElement("div");
  menu.id = "a3-screenshot-menu";
  menu.className = "a3-screenshot-menu";
  menu.innerHTML = `
    <div class="a3-shot-dropdown-header">Chụp ảnh báo cáo</div>
    <button type="button" data-shot="ALL">📋 Cả lớp</button>
    <button type="button" data-shot="1">👥 Tổ 1</button>
    <button type="button" data-shot="2">👥 Tổ 2</button>
    <button type="button" data-shot="3">👥 Tổ 3</button>
    <button type="button" data-shot="4">👥 Tổ 4</button>
    <button type="button" data-shot="zip">📦 Tải ZIP 5 ảnh</button>
    <button type="button" data-shot="share" class="a3-share-mobile">📤 Chia sẻ 5 ảnh</button>
  `;
  menu.style.left = `${Math.min(rect.left, window.innerWidth - 230)}px`;
  menu.style.top = `${rect.bottom + 8}px`;
  document.body.appendChild(menu);
}

function injectStyle() {
  if (document.getElementById("a3-shot-style")) return;
  const style = document.createElement("style");
  style.id = "a3-shot-style";
  style.textContent = `
    #a3-shot-hidden-area{position:fixed!important;left:-20000px!important;top:0!important;z-index:-1!important;pointer-events:none!important;opacity:1!important;background:#fff!important;width:820px!important;min-width:820px!important;overflow:visible!important}
    .a3-screenshot-menu{position:fixed;width:210px;background:rgba(15,23,42,.96);border:1px solid rgba(148,163,184,.28);border-radius:14px;padding:6px;z-index:2147483647;box-shadow:0 18px 50px rgba(0,0,0,.38);backdrop-filter:blur(20px);animation:a3ShotIn .16s ease}
    .a3-shot-dropdown-header{padding:9px 12px 8px;font-size:10px;font-weight:950;text-transform:uppercase;color:#94a3b8;letter-spacing:1px;border-bottom:1px solid rgba(148,163,184,.18);margin-bottom:5px}
    .a3-screenshot-menu button{width:100%;border:0;background:transparent;color:#e5e7eb;text-align:left;padding:10px 12px;border-radius:9px;font-size:13px;font-weight:750;cursor:pointer}.a3-screenshot-menu button:hover{background:rgba(59,130,246,.14);color:#93c5fd}.a3-share-mobile{display:none!important}@media(max-width:760px){.a3-share-mobile{display:block!important}}
    .a3-shot-loading{position:fixed;inset:0;z-index:2147483647;background:rgba(2,6,23,.46);backdrop-filter:blur(3px);display:grid;place-items:center}.a3-shot-loading>div{min-width:245px;border:1px solid rgba(148,163,184,.24);border-radius:22px;display:grid;grid-template-columns:34px 1fr;gap:12px;align-items:center;padding:18px 20px;background:#111827;color:#f8fafc;box-shadow:0 24px 80px rgba(0,0,0,.42)}.a3-shot-loading i{width:24px;height:24px;border:3px solid rgba(59,130,246,.22);border-top-color:#3b82f6;border-radius:999px;animation:a3Spin .75s linear infinite}.a3-shot-loading strong{display:block;font-size:15px}.a3-shot-loading span{display:block;margin-top:3px;color:#94a3b8;font-size:13px}
    .a3-shot-preview-backdrop{position:fixed;inset:0;z-index:2147483647;background:rgba(2,6,23,.62);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:22px}.a3-shot-preview-card{width:min(1180px,96vw);height:min(900px,92vh);border:1px solid rgba(148,163,184,.28);border-radius:28px;background:#0f172a;color:#f8fafc;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 30px 100px rgba(0,0,0,.5)}.a3-shot-preview-header{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:18px 22px;background:linear-gradient(135deg,rgba(37,99,235,.18),rgba(15,23,42,.98));border-bottom:1px solid rgba(148,163,184,.18)}.a3-shot-preview-header span{display:block;font-size:11px;font-weight:950;letter-spacing:3px;color:#94a3b8}.a3-shot-preview-header strong{display:block;margin-top:4px;font-size:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:760px}.a3-shot-preview-header small{display:block;margin-top:5px;color:#cbd5e1}.a3-shot-close{width:38px;height:38px;border:0;border-radius:13px;background:rgba(148,163,184,.13);color:#f8fafc;cursor:pointer;font-size:24px;font-weight:900}.a3-shot-preview-body{flex:1;overflow:auto;padding:18px;background:#111827;display:grid;place-items:start center}.a3-shot-preview-body img{max-width:100%;height:auto;border-radius:12px;background:#fff;box-shadow:0 18px 50px rgba(0,0,0,.35)}.a3-shot-preview-footer{display:flex;justify-content:flex-end;gap:10px;padding:14px 18px;border-top:1px solid rgba(148,163,184,.18)}.a3-shot-preview-footer button{border:0;border-radius:14px;padding:11px 16px;font-weight:950;cursor:pointer}.a3-shot-copy{background:#1e293b;color:#dbeafe}.a3-shot-download{background:#2563eb;color:#fff}
    .a3-shot-toast{position:fixed;right:18px;bottom:22px;z-index:2147483647;min-width:250px;max-width:min(380px,calc(100vw - 28px));border-radius:18px;padding:14px 16px;background:#111827;color:#f8fafc;border:1px solid rgba(148,163,184,.24);box-shadow:0 18px 50px rgba(0,0,0,.36);display:grid;gap:4px}.a3-shot-toast strong{font-size:14px}.a3-shot-toast span{font-size:13px;color:#cbd5e1}.a3-shot-toast.success{border-color:rgba(34,197,94,.45)}.a3-shot-toast.warning{border-color:rgba(245,158,11,.45)}.a3-shot-toast.error{border-color:rgba(239,68,68,.5)}
    @keyframes a3Spin{to{transform:rotate(360deg)}}@keyframes a3ShotIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
    .theme-light .a3-screenshot-menu,.win-root.theme-light .a3-screenshot-menu,:root.light .a3-screenshot-menu{background:#fff;color:#0f172a}.theme-light .a3-screenshot-menu button,.win-root.theme-light .a3-screenshot-menu button,:root.light .a3-screenshot-menu button{color:#0f172a}.theme-light .a3-shot-preview-card,.win-root.theme-light .a3-shot-preview-card,:root.light .a3-shot-preview-card{background:#fff;color:#0f172a}.theme-light .a3-shot-preview-body,.win-root.theme-light .a3-shot-preview-body,:root.light .a3-shot-preview-body{background:#f1f5f9}
  `;
  document.head.appendChild(style);
}

function installScreenshotCapture() {
  injectStyle();
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const previewClose = target.closest(".a3-shot-close");
    if (previewClose) { closePreview(); return; }
    const previewBackdrop = target.classList.contains("a3-shot-preview-backdrop");
    if (previewBackdrop) { closePreview(); return; }
    if (target.closest(".a3-shot-copy")) {
      const state = previewState();
      if (state.blob) void copyBlobToClipboard(state.blob).then(() => showToast("Đã copy ảnh", "Bạn có thể dán Ctrl+V vào tin nhắn.", "success")).catch(() => showToast("Không copy được", "Trình duyệt chặn copy ảnh.", "warning"));
      return;
    }
    if (target.closest(".a3-shot-download")) {
      const state = previewState();
      if (state.blob) downloadBlob(state.blob, state.filename);
      return;
    }

    const menuItem = target.closest<HTMLElement>("#a3-screenshot-menu [data-shot]");
    if (menuItem) {
      event.preventDefault();
      event.stopPropagation();
      const value = menuItem.dataset.shot || "";
      if (value === "zip") void captureZip();
      else if (value === "share") void shareAllMobile();
      else void captureSingle(value === "ALL" ? "ALL" : (Number(value) as 1 | 2 | 3 | 4));
      return;
    }

    const cameraButton = target.closest<HTMLElement>(".toolbar-button.camera");
    if (cameraButton) {
      event.preventDefault();
      event.stopPropagation();
      const open = Boolean(document.getElementById("a3-screenshot-menu"));
      if (open) hideScreenshotMenu();
      else showScreenshotMenu(cameraButton);
      return;
    }

    if (!target.closest("#a3-screenshot-menu")) hideScreenshotMenu();
  }, true);

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideScreenshotMenu();
      closePreview();
    }
  });
}

installScreenshotCapture();

export {};
