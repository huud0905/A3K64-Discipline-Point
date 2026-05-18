const TASK_VIEW_ID = "a3-task-view-overlay";

function safeCssEscape(value: string) {
  const css = window.CSS as typeof CSS | undefined;
  if (css?.escape) return css.escape(value);
  return value.replace(/["\\]/g, "\\$&");
}

function getWindowTitle(win: HTMLElement) {
  return win.querySelector<HTMLElement>(".title-left strong")?.textContent?.trim() || "Ứng dụng";
}

function getWindowIcon(win: HTMLElement) {
  const icon = win.querySelector<HTMLElement>(".title-icon")?.cloneNode(true) as HTMLElement | null;
  if (!icon) return "";
  icon.classList.add("taskview-card-icon");
  return icon.outerHTML;
}

function isVisibleWindow(win: HTMLElement) {
  const rect = win.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && !win.classList.contains("minimized");
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
  const taskButton = Array.from(document.querySelectorAll<HTMLButtonElement>(".taskbar .task-icon")).find((button) => button.title === title);
  taskButton?.click();
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
  document.getElementById(TASK_VIEW_ID)?.remove();

  const windows = Array.from(document.querySelectorAll<HTMLElement>(".win-window")).filter(isVisibleWindow).sort((a, b) => {
    const za = Number(a.style.zIndex || 0);
    const zb = Number(b.style.zIndex || 0);
    return zb - za;
  });

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
      const card = document.createElement("button");
      card.type = "button";
      card.className = "taskview-window-card";
      card.dataset.taskviewAppTitle = title;
      card.style.animationDelay = `${index * 42}ms`;

      const titleRow = document.createElement("div");
      titleRow.className = "taskview-card-title";
      titleRow.innerHTML = `${getWindowIcon(win)}<span>${title}</span>`;

      card.appendChild(titleRow);
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
    <button type="button" class="desktop-thumb active" data-taskview-close="true">
      <span>Desktop 1</span>
      <i></i>
    </button>
    <button type="button" class="desktop-thumb" data-taskview-close="true">
      <span>Desktop 2</span>
      <i></i>
    </button>
    <button type="button" class="desktop-thumb new" data-taskview-close="true">
      <b>+</b>
      <span>New desktop</span>
    </button>
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
