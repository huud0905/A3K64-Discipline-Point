const TASK_VIEW_ID = "a3-task-view-overlay";
const STYLE_ID = "a3-task-view-style";
const DESKTOP_KEY = "a3k64-virtual-desktops-v1";
const ACTIVE_DESKTOP_KEY = "a3k64-active-desktop-v1";
const RESTORE_PATH_KEY = "a3k64-restore-path";

type VirtualDesktop = { id: string; name: string };

const APP_PATH_TITLE: Record<string, string> = {
  "/desktop/bang-diem-a3": "Bảng điểm A3",
  "/desktop/nhap-diem-nhanh": "Nhập điểm nhanh",
  "/desktop/xep-hang": "Xếp hạng",
  "/desktop/cuoc-thi-hien-tai": "Cuộc thi hiện tại",
  "/desktop/so-do-lop": "Sơ đồ lớp",
  "/desktop/cai-dat": "Cài đặt",
};

const CSS = `
.taskbar button[title="Chế độ xem tác vụ"] svg{display:none!important}.taskbar button[title="Chế độ xem tác vụ"]:before{content:"";width:18px;height:18px;display:block;background:currentColor;-webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='7' height='7' rx='1.5'/%3E%3Cpath d='M14 5h7'/%3E%3Cpath d='M14 10h7'/%3E%3Crect x='3' y='13' width='7' height='7' rx='1.5'/%3E%3Cpath d='M14 14h7'/%3E%3Cpath d='M14 19h7'/%3E%3C/svg%3E") center/contain no-repeat;mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='7' height='7' rx='1.5'/%3E%3Cpath d='M14 5h7'/%3E%3Cpath d='M14 10h7'/%3E%3Crect x='3' y='13' width='7' height='7' rx='1.5'/%3E%3Cpath d='M14 14h7'/%3E%3Cpath d='M14 19h7'/%3E%3C/svg%3E") center/contain no-repeat}.taskview-overlay{position:fixed;inset:0;z-index:9998;display:grid;grid-template-rows:1fr auto;gap:22px;padding:74px clamp(24px,4vw,74px) 58px;color:#f8fafc;background:radial-gradient(circle at 50% 22%,rgba(37,99,235,.55),transparent 30%),radial-gradient(circle at 22% 78%,rgba(34,197,94,.16),transparent 28%),rgba(15,23,42,.72);backdrop-filter:blur(28px) saturate(1.18);-webkit-backdrop-filter:blur(28px) saturate(1.18);animation:taskviewIn .18s ease both}.taskview-overlay.closing{animation:taskviewOut .15s ease both}@keyframes taskviewIn{from{opacity:0;transform:scale(1.018);filter:blur(6px)}to{opacity:1;transform:scale(1);filter:blur(0)}}@keyframes taskviewOut{to{opacity:0;transform:scale(1.012)}}.taskview-close{position:fixed;right:22px;top:20px;width:40px;height:40px;border:1px solid rgba(255,255,255,.2);border-radius:14px;color:#f8fafc;background:rgba(15,23,42,.72);cursor:pointer;font-size:26px;line-height:1;box-shadow:0 18px 44px rgba(0,0,0,.28)}.taskview-window-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:28px;align-content:center;justify-items:center;max-width:1500px;width:100%;margin:0 auto}.taskview-window-card{position:relative;width:min(100%,330px);border:0;color:#f8fafc;background:transparent;cursor:pointer;text-align:left;animation:taskviewCardIn .28s cubic-bezier(.2,.8,.2,1) both}@keyframes taskviewCardIn{from{opacity:0;transform:translateY(20px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}.taskview-card-title{height:34px;display:flex;align-items:center;gap:8px;padding:0 2px;font-size:12px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 2px 8px rgba(0,0,0,.5)}.taskview-card-title .taskview-card-icon,.taskview-card-title .title-icon{width:18px!important;height:18px!important;min-width:18px!important;border-radius:5px!important;display:grid!important;place-items:center!important}.taskview-card-title svg{width:16px!important;height:16px!important}.taskview-card-close{position:absolute;right:8px;top:35px;z-index:2;width:28px;height:28px;border:1px solid rgba(255,255,255,.18);border-radius:999px;color:#fff;background:rgba(15,23,42,.78);display:grid;place-items:center;cursor:pointer;opacity:0;transform:translateY(-4px);transition:.14s ease}.taskview-window-card:hover .taskview-card-close{opacity:1;transform:translateY(0)}.taskview-card-close:hover{background:#ef4444;border-color:#ef4444}.taskview-preview-frame{height:160px;overflow:hidden;border:1px solid rgba(255,255,255,.18);border-radius:12px;background:#020617;box-shadow:0 22px 54px rgba(0,0,0,.34);transform-origin:center center;transition:.16s ease}.taskview-window-card:hover .taskview-preview-frame{transform:translateY(-5px) scale(1.035);border-color:rgba(96,165,250,.78);box-shadow:0 28px 70px rgba(0,0,0,.42),0 0 0 2px rgba(96,165,250,.22)}.taskview-preview-titlebar{height:24px!important;min-height:24px!important;padding:0 8px!important;pointer-events:none!important}.taskview-preview-titlebar .title-left strong{font-size:9px!important}.taskview-preview-titlebar .title-icon{width:14px!important;height:14px!important}.taskview-preview-titlebar svg{width:10px!important;height:10px!important}.taskview-preview-body{width:1080px!important;height:650px!important;transform:scale(.142);transform-origin:top left;pointer-events:none!important;overflow:hidden!important}.taskview-preview-body *{pointer-events:none!important}.taskview-empty-card{width:330px;min-height:170px;border:1px solid rgba(255,255,255,.18);border-radius:22px;display:grid;place-items:center;gap:6px;text-align:center;background:rgba(15,23,42,.66);box-shadow:0 24px 70px rgba(0,0,0,.24)}.taskview-empty-card span{color:#cbd5e1;font-size:13px}.taskview-desktop-strip{width:min(100%,1600px);min-height:122px;margin:0 auto;padding:18px;border:1px solid rgba(255,255,255,.14);border-radius:12px;display:flex;align-items:center;gap:18px;background:rgba(2,6,23,.82);box-shadow:0 -12px 44px rgba(0,0,0,.24);overflow-x:auto}.desktop-thumb{position:relative;width:230px;height:86px;border:1px solid rgba(255,255,255,.13);border-radius:10px;padding:10px;display:grid;align-content:start;gap:7px;color:#f8fafc;background:rgba(30,41,59,.78);cursor:pointer;text-align:left;flex:0 0 auto}.desktop-thumb.active{background:rgba(30,64,175,.42);box-shadow:inset 0 -3px 0 #38bdf8;border-color:rgba(56,189,248,.5)}.desktop-thumb.dragging{opacity:.48}.desktop-thumb.drag-over{outline:2px solid #38bdf8;transform:translateY(-2px)}.desktop-thumb span{font-size:12px;font-weight:850;max-width:145px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.desktop-thumb input{width:135px;height:24px;border:1px solid rgba(148,163,184,.35);border-radius:7px;color:#fff;background:rgba(15,23,42,.85);font:inherit;font-size:12px;font-weight:850;padding:0 7px;outline:0}.desktop-thumb i{height:42px;border-radius:6px;background:radial-gradient(circle at 45% 32%,rgba(37,99,235,.8),transparent 38%),linear-gradient(135deg,rgba(15,23,42,.9),rgba(51,65,85,.9))}.desktop-actions{position:absolute;right:7px;top:7px;display:flex;gap:5px;opacity:0;transition:.14s ease}.desktop-thumb:hover .desktop-actions{opacity:1}.desktop-actions button{width:24px;height:24px;border:1px solid rgba(255,255,255,.16);border-radius:7px;color:#fff;background:rgba(15,23,42,.75);cursor:pointer}.desktop-actions button:hover{background:#2563eb}.desktop-actions button.danger:hover{background:#ef4444}.desktop-thumb.new{place-items:center;text-align:center;color:#cbd5e1;border-style:dashed}.desktop-thumb.new b{font-size:28px;font-weight:400}body:has(.win-root.theme-light) .taskview-overlay{color:#0f172a;background:radial-gradient(circle at 50% 22%,rgba(37,99,235,.35),transparent 30%),radial-gradient(circle at 22% 78%,rgba(34,197,94,.14),transparent 28%),rgba(226,232,240,.74)}body:has(.win-root.theme-light) .taskview-close,body:has(.win-root.theme-light) .taskview-desktop-strip{color:#0f172a;background:rgba(255,255,255,.8);border-color:rgba(15,23,42,.12)}body:has(.win-root.theme-light) .taskview-card-title{color:#0f172a;text-shadow:none}@media(max-width:900px){.taskview-overlay{padding:58px 18px 42px}.taskview-window-grid{grid-template-columns:1fr}.taskview-desktop-strip{overflow-x:auto}}
`;

function injectTaskViewCss() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

function readDesktops(): VirtualDesktop[] {
  try {
    const list = JSON.parse(localStorage.getItem(DESKTOP_KEY) || "[]") as VirtualDesktop[];
    if (Array.isArray(list) && list.length) return list;
  } catch {}
  const defaults = [{ id: "desktop-1", name: "Desktop 1" }];
  localStorage.setItem(DESKTOP_KEY, JSON.stringify(defaults));
  localStorage.setItem(ACTIVE_DESKTOP_KEY, defaults[0].id);
  return defaults;
}
function saveDesktops(items: VirtualDesktop[]) { localStorage.setItem(DESKTOP_KEY, JSON.stringify(items)); }
function activeDesktopId() { const items = readDesktops(); const saved = localStorage.getItem(ACTIVE_DESKTOP_KEY); return items.some((d) => d.id === saved) ? saved! : items[0].id; }
function setActiveDesktop(id: string) { localStorage.setItem(ACTIVE_DESKTOP_KEY, id); }
function desktopIndexName(count: number) { return `Desktop ${count}`; }
function getWindowTitle(win: HTMLElement) { return win.querySelector<HTMLElement>(".title-left strong")?.textContent?.trim() || win.getAttribute("aria-label") || "Ứng dụng"; }
function getWindowIcon(win: HTMLElement) { const icon = win.querySelector<HTMLElement>(".title-icon")?.cloneNode(true) as HTMLElement | null; if (!icon) return ""; icon.classList.add("taskview-card-icon"); return icon.outerHTML; }
function getOpenWindows() { return Array.from(document.querySelectorAll<HTMLElement>(".win-window")).sort((a, b) => Number(b.style.zIndex || 0) - Number(a.style.zIndex || 0)); }
function buildWindowPreview(win: HTMLElement) {
  const frame = document.createElement("div"); frame.className = "taskview-preview-frame";
  const titlebar = win.querySelector<HTMLElement>(".win-titlebar")?.cloneNode(true) as HTMLElement | null;
  const body = win.querySelector<HTMLElement>(".win-body")?.cloneNode(true) as HTMLElement | null;
  if (titlebar) { titlebar.querySelectorAll("button").forEach((b) => b.remove()); titlebar.classList.add("taskview-preview-titlebar"); frame.appendChild(titlebar); }
  if (body) { body.classList.add("taskview-preview-body"); frame.appendChild(body); }
  else { frame.innerHTML = `<div class="taskview-empty-card"><strong>${getWindowTitle(win)}</strong></div>`; }
  return frame;
}
function focusWindowByTitle(title: string) { Array.from(document.querySelectorAll<HTMLButtonElement>(".taskbar button[title]")).find((button) => button.title === title)?.click(); }
function closeWindowByTitle(title: string) { const win = getOpenWindows().find((item) => getWindowTitle(item) === title); win?.querySelector<HTMLButtonElement>('.window-actions button[title="Đóng"]')?.click(); }
function closeTaskView() { const overlay = document.getElementById(TASK_VIEW_ID); overlay?.classList.add("closing"); window.setTimeout(() => overlay?.remove(), 150); document.removeEventListener("keydown", handleEscape); }
function handleEscape(event: KeyboardEvent) { if (event.key === "Escape") closeTaskView(); }
function openAppByPath(path: string) {
  const title = APP_PATH_TITLE[path];
  if (!title) return;
  const tryOpen = () => {
    const opened = Array.from(document.querySelectorAll<HTMLButtonElement>(".taskbar button[title]")).find((button) => button.title === title);
    if (opened) { opened.click(); return true; }
    const shortcut = Array.from(document.querySelectorAll<HTMLButtonElement>(".desktop-shortcut")).find((button) => button.textContent?.includes(title));
    if (shortcut) { shortcut.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); return true; }
    const start = document.querySelector<HTMLButtonElement>(".task-start");
    start?.click();
    window.setTimeout(() => Array.from(document.querySelectorAll<HTMLButtonElement>(".start-app")).find((button) => button.textContent?.includes(title))?.click(), 80);
    return true;
  };
  let tries = 0;
  const timer = window.setInterval(() => { tries += 1; if (tryOpen() || tries > 15) window.clearInterval(timer); }, 120);
}
function renderDesktops(strip: HTMLElement) {
  const items = readDesktops(); const active = activeDesktopId(); strip.innerHTML = "";
  items.forEach((desktop, index) => {
    const thumb = document.createElement("div");
    thumb.className = `desktop-thumb ${desktop.id === active ? "active" : ""}`;
    thumb.draggable = true; thumb.dataset.desktopId = desktop.id;
    thumb.innerHTML = `<span>${desktop.name}</span><div class="desktop-actions"><button data-desktop-rename="${desktop.id}" title="Đổi tên">✎</button><button data-desktop-delete="${desktop.id}" class="danger" title="Xoá">×</button></div><i></i>`;
    thumb.addEventListener("click", (e) => { if ((e.target as HTMLElement).closest("button,input")) return; setActiveDesktop(desktop.id); renderDesktops(strip); });
    thumb.addEventListener("dragstart", () => { thumb.classList.add("dragging"); thumb.dataset.dragging = desktop.id; });
    thumb.addEventListener("dragend", () => thumb.classList.remove("dragging"));
    thumb.addEventListener("dragover", (e) => { e.preventDefault(); thumb.classList.add("drag-over"); });
    thumb.addEventListener("dragleave", () => thumb.classList.remove("drag-over"));
    thumb.addEventListener("drop", (e) => { e.preventDefault(); thumb.classList.remove("drag-over"); const fromId = strip.querySelector<HTMLElement>(".desktop-thumb.dragging")?.dataset.desktopId; if (!fromId || fromId === desktop.id) return; const next = readDesktops(); const from = next.findIndex((d) => d.id === fromId); const to = index; if (from < 0) return; const [moved] = next.splice(from, 1); next.splice(to, 0, moved); saveDesktops(next); renderDesktops(strip); });
    strip.appendChild(thumb);
  });
  const add = document.createElement("button"); add.type = "button"; add.className = "desktop-thumb new"; add.innerHTML = `<b>+</b><span>New desktop</span>`; add.addEventListener("click", () => { const next = readDesktops(); const id = `desktop-${Date.now()}`; next.push({ id, name: desktopIndexName(next.length + 1) }); saveDesktops(next); setActiveDesktop(id); renderDesktops(strip); }); strip.appendChild(add);
}
function createTaskView() {
  injectTaskViewCss(); document.getElementById(TASK_VIEW_ID)?.remove();
  const windows = getOpenWindows();
  const overlay = document.createElement("section"); overlay.id = TASK_VIEW_ID; overlay.className = "taskview-overlay"; overlay.setAttribute("role", "dialog");
  const grid = document.createElement("div"); grid.className = "taskview-window-grid";
  if (!windows.length) grid.innerHTML = `<div class="taskview-empty-card"><strong>Chưa có cửa sổ nào</strong><span>Mở một ứng dụng để xem trước tại đây.</span></div>`;
  else windows.forEach((win, index) => { const title = getWindowTitle(win); const card = document.createElement("div"); card.className = "taskview-window-card"; card.dataset.taskviewAppTitle = title; card.style.animationDelay = `${index * 42}ms`; card.innerHTML = `<div class="taskview-card-title">${getWindowIcon(win)}<span>${title}</span></div><button type="button" class="taskview-card-close" data-taskview-close-window-title="${title}" title="Đóng ${title}">×</button>`; card.appendChild(buildWindowPreview(win)); grid.appendChild(card); });
  const close = document.createElement("button"); close.type = "button"; close.className = "taskview-close"; close.dataset.taskviewClose = "true"; close.textContent = "×";
  const strip = document.createElement("div"); strip.className = "taskview-desktop-strip"; renderDesktops(strip);
  overlay.append(close, grid, strip); document.body.appendChild(overlay); document.addEventListener("keydown", handleEscape);
}
function toggleTaskView() { document.getElementById(TASK_VIEW_ID) ? closeTaskView() : createTaskView(); }
function installTaskViewEnhancer() {
  injectTaskViewCss(); readDesktops();
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null; if (!target) return;
    const taskViewButton = target.closest<HTMLButtonElement>('button[title="Chế độ xem tác vụ"]');
    if (taskViewButton) { event.preventDefault(); event.stopPropagation(); toggleTaskView(); return; }
    const rename = target.closest<HTMLElement>("[data-desktop-rename]");
    if (rename) { event.preventDefault(); event.stopPropagation(); const id = rename.dataset.desktopRename!; const thumb = rename.closest<HTMLElement>(".desktop-thumb")!; const current = readDesktops().find((d) => d.id === id); const input = document.createElement("input"); input.value = current?.name || "Desktop"; thumb.querySelector("span")?.replaceWith(input); input.focus(); input.select(); const commit = () => { const next = readDesktops().map((d) => d.id === id ? { ...d, name: input.value.trim() || d.name } : d); saveDesktops(next); renderDesktops(thumb.parentElement!); }; input.addEventListener("blur", commit); input.addEventListener("keydown", (e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") renderDesktops(thumb.parentElement!); }); return; }
    const del = target.closest<HTMLElement>("[data-desktop-delete]");
    if (del) { event.preventDefault(); event.stopPropagation(); const id = del.dataset.desktopDelete!; const next = readDesktops().filter((d) => d.id !== id); if (!next.length) next.push({ id: "desktop-1", name: "Desktop 1" }); saveDesktops(next); if (activeDesktopId() === id) setActiveDesktop(next[0].id); renderDesktops(del.closest(".taskview-desktop-strip") as HTMLElement); return; }
    const closeWindowButton = target.closest<HTMLElement>("[data-taskview-close-window-title]");
    if (closeWindowButton) { event.preventDefault(); event.stopPropagation(); closeWindowByTitle(closeWindowButton.dataset.taskviewCloseWindowTitle || ""); window.setTimeout(createTaskView, 80); return; }
    if (target.closest("[data-taskview-close]")) { event.preventDefault(); closeTaskView(); return; }
    const card = target.closest<HTMLElement>("[data-taskview-app-title]");
    if (card) { event.preventDefault(); closeTaskView(); window.setTimeout(() => focusWindowByTitle(card.dataset.taskviewAppTitle || ""), 130); }
  }, true);
  window.addEventListener("resize", () => { if (document.getElementById(TASK_VIEW_ID)) createTaskView(); });
  window.addEventListener("a3k64-restore-route", (event) => { const path = (event as CustomEvent<{ path?: string }>).detail?.path || localStorage.getItem(RESTORE_PATH_KEY) || window.location.pathname; window.setTimeout(() => openAppByPath(path), 250); });
  const savedPath = localStorage.getItem(RESTORE_PATH_KEY);
  if (savedPath && savedPath.startsWith("/desktop/")) window.setTimeout(() => openAppByPath(savedPath), 850);
}

if (typeof window !== "undefined") installTaskViewEnhancer();
export {};
