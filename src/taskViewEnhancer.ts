const TASK_VIEW_ID = "a3-task-view-overlay";
const TASK_VIEW_STYLE_ID = "a3-task-view-style";

const TASK_VIEW_CSS = `
.taskbar button[title="Chế độ xem tác vụ"] svg{display:none!important}.taskbar button[title="Chế độ xem tác vụ"]:before{content:"";width:18px;height:18px;display:block;background:currentColor;-webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='7' height='7' rx='1.5'/%3E%3Cpath d='M14 5h7'/%3E%3Cpath d='M14 10h7'/%3E%3Crect x='3' y='13' width='7' height='7' rx='1.5'/%3E%3Cpath d='M14 14h7'/%3E%3Cpath d='M14 19h7'/%3E%3C/svg%3E") center/contain no-repeat;mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='7' height='7' rx='1.5'/%3E%3Cpath d='M14 5h7'/%3E%3Cpath d='M14 10h7'/%3E%3Crect x='3' y='13' width='7' height='7' rx='1.5'/%3E%3Cpath d='M14 14h7'/%3E%3Cpath d='M14 19h7'/%3E%3C/svg%3E") center/contain no-repeat}.taskview-overlay{position:fixed;inset:0;z-index:9998;display:grid;grid-template-rows:1fr auto;gap:22px;padding:78px clamp(24px,4vw,74px) 68px;color:#f8fafc;background:radial-gradient(circle at 50% 22%,rgba(37,99,235,.55),transparent 30%),radial-gradient(circle at 22% 78%,rgba(34,197,94,.16),transparent 28%),rgba(15,23,42,.72);backdrop-filter:blur(28px) saturate(1.18);-webkit-backdrop-filter:blur(28px) saturate(1.18);animation:taskviewIn .18s ease both}.taskview-overlay.closing{animation:taskviewOut .15s ease both}@keyframes taskviewIn{from{opacity:0;transform:scale(1.018);filter:blur(6px)}to{opacity:1;transform:scale(1);filter:blur(0)}}@keyframes taskviewOut{from{opacity:1;transform:scale(1)}to{opacity:0;transform:scale(1.012)}}.taskview-close{position:fixed;right:22px;top:20px;width:40px;height:40px;border:1px solid rgba(255,255,255,.2);border-radius:14px;color:#f8fafc;background:rgba(15,23,42,.72);cursor:pointer;font-size:26px;line-height:1;box-shadow:0 18px 44px rgba(0,0,0,.28)}.taskview-window-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:28px;align-content:center;justify-items:center;max-width:1500px;width:100%;margin:0 auto}.taskview-window-card{position:relative;width:min(100%,330px);border:0;color:#f8fafc;background:transparent;cursor:pointer;text-align:left;animation:taskviewCardIn .28s cubic-bezier(.2,.8,.2,1) both}@keyframes taskviewCardIn{from{opacity:0;transform:translateY(20px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}.taskview-card-title{height:34px;display:flex;align-items:center;gap:8px;padding:0 2px;font-size:12px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 2px 8px rgba(0,0,0,.5)}.taskview-card-title .taskview-card-icon,.taskview-card-title .title-icon{width:18px!important;height:18px!important;min-width:18px!important;border-radius:5px!important;display:grid!important;place-items:center!important}.taskview-card-title svg{width:16px!important;height:16px!important}.taskview-card-close{position:absolute;right:8px;top:35px;z-index:2;width:28px;height:28px;border:1px solid rgba(255,255,255,.18);border-radius:999px;color:#fff;background:rgba(15,23,42,.78);display:grid;place-items:center;cursor:pointer;opacity:0;transform:translateY(-4px);transition:.14s ease}.taskview-window-card:hover .taskview-card-close{opacity:1;transform:translateY(0)}.taskview-card-close:hover{background:#ef4444;border-color:#ef4444}.taskview-preview-frame{height:160px;overflow:hidden;border:1px solid rgba(255,255,255,.18);border-radius:12px;background:#020617;box-shadow:0 22px 54px rgba(0,0,0,.34);transform-origin:center center;transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease}.taskview-window-card:hover .taskview-preview-frame{transform:translateY(-5px) scale(1.035);border-color:rgba(96,165,250,.78);box-shadow:0 28px 70px rgba(0,0,0,.42),0 0 0 2px rgba(96,165,250,.22)}.taskview-preview-titlebar{height:24px!important;min-height:24px!important;padding:0 8px!important;pointer-events:none!important}.taskview-preview-titlebar .title-left strong{font-size:9px!important}.taskview-preview-titlebar .title-icon{width:14px!important;height:14px!important}.taskview-preview-titlebar svg{width:10px!important;height:10px!important}.taskview-preview-body{width:1080px!important;height:650px!important;transform:scale(.142);transform-origin:top left;pointer-events:none!important;overflow:hidden!important}.taskview-preview-body *{pointer-events:none!important}.taskview-preview-empty{height:100%;display:grid;place-items:center;color:#94a3b8;font-weight:800}.taskview-empty-card{width:330px;min-height:170px;border:1px solid rgba(255,255,255,.18);border-radius:22px;display:grid;place-items:center;gap:6px;text-align:center;background:rgba(15,23,42,.66);box-shadow:0 24px 70px rgba(0,0,0,.24)}.taskview-empty-card span{color:#cbd5e1;font-size:13px}.taskview-desktop-strip{width:min(100%,1600px);min-height:112px;margin:0 auto;padding:18px;border:1px solid rgba(255,255,255,.14);border-radius:12px;display:flex;align-items:center;gap:18px;background:rgba(2,6,23,.82);box-shadow:0 -12px 44px rgba(0,0,0,.24)}.desktop-thumb{width:230px;height:78px;border:1px solid rgba(56,189,248,.38);border-radius:8px;padding:10px;display:grid;align-content:start;gap:8px;color:#f8fafc;background:rgba(30,64,175,.42);box-shadow:inset 0 -3px 0 #38bdf8;text-align:left}.desktop-thumb span{font-size:12px;font-weight:850}.desktop-thumb i{height:38px;border-radius:5px;background:radial-gradient(circle at 45% 32%,rgba(37,99,235,.8),transparent 38%),linear-gradient(135deg,rgba(15,23,42,.9),rgba(51,65,85,.9))}body:has(.win-root.theme-light) .taskview-overlay{color:#0f172a;background:radial-gradient(circle at 50% 22%,rgba(37,99,235,.35),transparent 30%),radial-gradient(circle at 22% 78%,rgba(34,197,94,.14),transparent 28%),rgba(226,232,240,.74)}body:has(.win-root.theme-light) .taskview-close,body:has(.win-root.theme-light) .taskview-desktop-strip{color:#0f172a;background:rgba(255,255,255,.8);border-color:rgba(15,23,42,.12)}body:has(.win-root.theme-light) .taskview-card-title{color:#0f172a;text-shadow:none}@media(max-width:900px){.taskview-overlay{padding:58px 18px 42px}.taskview-window-grid{grid-template-columns:1fr}.taskview-desktop-strip{overflow-x:auto}}
`;

function injectTaskViewCss() {
  if (document.getElementById(TASK_VIEW_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = TASK_VIEW_STYLE_ID;
  style.textContent = TASK_VIEW_CSS;
  document.head.appendChild(style);
}

function getWindowTitle(win: HTMLElement) {
  return win.querySelector<HTMLElement>(".title-left strong")?.textContent?.trim() || win.getAttribute("aria-label") || "Ứng dụng";
}

function getWindowIcon(win: HTMLElement) {
  const icon = win.querySelector<HTMLElement>(".title-icon")?.cloneNode(true) as HTMLElement | null;
  if (!icon) return "";
  icon.classList.add("taskview-card-icon");
  return icon.outerHTML;
}

function getOpenWindows() {
  return Array.from(document.querySelectorAll<HTMLElement>(".win-window")).sort((a, b) => Number(b.style.zIndex || 0) - Number(a.style.zIndex || 0));
}

function buildWindowPreview(win: HTMLElement) {
  const frame = document.createElement("div");
  frame.className = "taskview-preview-frame";

  const titlebar = win.querySelector<HTMLElement>(".win-titlebar")?.cloneNode(true) as HTMLElement | null;
  const body = win.querySelector<HTMLElement>(".win-body")?.cloneNode(true) as HTMLElement | null;

  if (titlebar) {
    titlebar.querySelectorAll("button").forEach((button) => button.remove());
    titlebar.classList.add("taskview-preview-titlebar");
    frame.appendChild(titlebar);
  }

  if (body) {
    body.classList.add("taskview-preview-body");
    frame.appendChild(body);
  } else {
    const fallback = document.createElement("div");
    fallback.className = "taskview-preview-empty";
    fallback.textContent = getWindowTitle(win);
    frame.appendChild(fallback);
  }

  return frame;
}

function focusWindowByTitle(title: string) {
  const taskButton = Array.from(document.querySelectorAll<HTMLButtonElement>(".taskbar button[title]")).find((button) => button.title === title);
  taskButton?.click();
}

function closeWindowByTitle(title: string) {
  const win = getOpenWindows().find((item) => getWindowTitle(item) === title);
  const closeButton = win?.querySelector<HTMLButtonElement>('.window-actions button[title="Đóng"]');
  closeButton?.click();
}

function closeTaskView() {
  const overlay = document.getElementById(TASK_VIEW_ID);
  overlay?.classList.add("closing");
  window.setTimeout(() => overlay?.remove(), 150);
  document.removeEventListener("keydown", handleEscape);
}

function handleEscape(event: KeyboardEvent) {
  if (event.key === "Escape") closeTaskView();
}

function createTaskView() {
  injectTaskViewCss();
  document.getElementById(TASK_VIEW_ID)?.remove();

  const windows = getOpenWindows();
  const overlay = document.createElement("section");
  overlay.id = TASK_VIEW_ID;
  overlay.className = "taskview-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", "Chế độ xem tác vụ");

  const grid = document.createElement("div");
  grid.className = "taskview-window-grid";

  if (windows.length === 0) {
    grid.innerHTML = `<div class="taskview-empty-card"><strong>Chưa có cửa sổ nào</strong><span>Mở một ứng dụng để xem trước tại đây.</span></div>`;
  } else {
    windows.forEach((win, index) => {
      const title = getWindowTitle(win);
      const card = document.createElement("div");
      card.className = "taskview-window-card";
      card.dataset.taskviewAppTitle = title;
      card.style.animationDelay = `${index * 42}ms`;

      const titleRow = document.createElement("div");
      titleRow.className = "taskview-card-title";
      titleRow.innerHTML = `${getWindowIcon(win)}<span>${title}</span>`;

      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.className = "taskview-card-close";
      closeButton.dataset.taskviewCloseWindowTitle = title;
      closeButton.textContent = "×";
      closeButton.title = `Đóng ${title}`;

      card.appendChild(titleRow);
      card.appendChild(closeButton);
      card.appendChild(buildWindowPreview(win));
      grid.appendChild(card);
    });
  }

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "taskview-close";
  closeButton.dataset.taskviewClose = "true";
  closeButton.textContent = "×";
  closeButton.title = "Đóng chế độ xem tác vụ";

  const desktopStrip = document.createElement("div");
  desktopStrip.className = "taskview-desktop-strip";
  desktopStrip.innerHTML = `
    <div class="desktop-thumb active">
      <span>Desktop 1</span>
      <i></i>
    </div>
  `;

  overlay.appendChild(closeButton);
  overlay.appendChild(grid);
  overlay.appendChild(desktopStrip);
  document.body.appendChild(overlay);
  document.addEventListener("keydown", handleEscape);
}

function toggleTaskView() {
  if (document.getElementById(TASK_VIEW_ID)) {
    closeTaskView();
    return;
  }
  createTaskView();
}

function installTaskViewEnhancer() {
  injectTaskViewCss();
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const taskViewButton = target.closest<HTMLButtonElement>('button[title="Chế độ xem tác vụ"]');
      if (taskViewButton) {
        event.preventDefault();
        event.stopPropagation();
        toggleTaskView();
        return;
      }

      const closeWindowButton = target.closest<HTMLElement>("[data-taskview-close-window-title]");
      if (closeWindowButton) {
        event.preventDefault();
        event.stopPropagation();
        const title = closeWindowButton.dataset.taskviewCloseWindowTitle || "";
        closeWindowByTitle(title);
        window.setTimeout(createTaskView, 80);
        return;
      }

      if (target.closest("[data-taskview-close]")) {
        event.preventDefault();
        closeTaskView();
        return;
      }

      const card = target.closest<HTMLElement>("[data-taskview-app-title]");
      if (card) {
        event.preventDefault();
        const title = card.dataset.taskviewAppTitle || "";
        closeTaskView();
        window.setTimeout(() => focusWindowByTitle(title), 130);
      }
    },
    true
  );

  window.addEventListener("resize", () => {
    if (document.getElementById(TASK_VIEW_ID)) createTaskView();
  });
}

if (typeof window !== "undefined") {
  installTaskViewEnhancer();
}

export {};
