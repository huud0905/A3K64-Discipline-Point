const STYLE_ID = "a3k64-mobile-app-shell-style";
const ACCOUNT_BUTTON_CLASS = "a3-mobile-account-button";

const CSS = `
@media (max-width: 760px) {
  .win-root {
    min-height: 100svh !important;
    overflow: hidden !important;
    background:
      radial-gradient(circle at 8% 0%, color-mix(in srgb, var(--desktop-accent, #2563eb) 35%, transparent), transparent 38%),
      radial-gradient(circle at 92% 16%, rgba(124,58,237,.22), transparent 34%),
      linear-gradient(180deg, #050b18 0%, #07111f 55%, #020617 100%) !important;
  }

  .win-root.theme-light {
    background:
      radial-gradient(circle at 8% 0%, color-mix(in srgb, var(--desktop-accent, #2563eb) 25%, transparent), transparent 38%),
      linear-gradient(180deg, #eef6ff 0%, #f8fafc 58%, #e2e8f0 100%) !important;
  }

  .win-desktop {
    min-height: 100svh !important;
    padding: 20px 18px 88px !important;
    overflow: hidden !important;
  }

  .win-empty-note,
  .search-panel,
  .start-menu,
  .task-app-menu,
  .toast {
    display: none !important;
  }

  .desktop-icons {
    position: static !important;
    width: 100% !important;
    max-width: 380px !important;
    padding: 14px 4px 0 !important;
    display: grid !important;
    grid-template-columns: repeat(2, minmax(86px, 118px)) !important;
    gap: 26px 28px !important;
    justify-content: start !important;
    align-content: start !important;
    z-index: 2 !important;
    opacity: 1 !important;
    filter: none !important;
  }

  .desktop-icons.covered {
    opacity: 1 !important;
    filter: none !important;
  }

  .desktop-shortcut {
    width: 112px !important;
    min-height: 112px !important;
    padding: 8px 4px !important;
    border: 0 !important;
    border-radius: 22px !important;
    background: transparent !important;
    color: #f8fafc !important;
    display: grid !important;
    justify-items: center !important;
    align-content: start !important;
    gap: 10px !important;
    text-align: center !important;
    transform: none !important;
    transition: transform .14s ease, background .14s ease !important;
  }

  .desktop-shortcut:hover,
  .desktop-shortcut:active {
    background: rgba(255, 255, 255, .055) !important;
    transform: translateY(-2px) !important;
  }

  .desktop-shortcut-icon {
    width: 58px !important;
    height: 58px !important;
    border-radius: 20px !important;
    display: grid !important;
    place-items: center !important;
    color: #fff !important;
    background: linear-gradient(135deg, color-mix(in srgb, var(--desktop-accent, #2563eb) 88%, #0f172a), color-mix(in srgb, var(--desktop-accent, #2563eb) 48%, #020617)) !important;
    border: 1px solid rgba(255,255,255,.12) !important;
    box-shadow: 0 16px 34px color-mix(in srgb, var(--desktop-accent, #2563eb) 22%, transparent) !important;
  }

  .desktop-shortcut:nth-child(2) .desktop-shortcut-icon {
    background: linear-gradient(135deg, #16a34a, #0f766e) !important;
  }

  .desktop-shortcut-icon svg {
    width: 31px !important;
    height: 31px !important;
    stroke-width: 2.25 !important;
  }

  .desktop-shortcut span {
    max-width: 104px !important;
    color: #f8fafc !important;
    font-size: 13px !important;
    font-weight: 850 !important;
    line-height: 1.18 !important;
    text-shadow: 0 2px 10px rgba(0,0,0,.32) !important;
    white-space: normal !important;
  }

  .desktop-shortcut[title*="Cài đặt"] {
    display: none !important;
  }

  .win-root.theme-light .desktop-shortcut {
    color: #0f172a !important;
  }

  .win-root.theme-light .desktop-shortcut span {
    color: #0f172a !important;
    text-shadow: none !important;
  }

  .win-window {
    position: fixed !important;
    inset: 0 0 76px 0 !important;
    width: 100vw !important;
    height: calc(100svh - 76px) !important;
    min-width: 0 !important;
    max-width: none !important;
    border-radius: 0 !important;
    border: 0 !important;
    transform: none !important;
    box-shadow: none !important;
    z-index: 20 !important;
  }

  .win-window.minimized {
    display: none !important;
  }

  .win-window .win-titlebar {
    height: 46px !important;
    min-height: 46px !important;
    border-radius: 0 !important;
    padding: 0 10px 0 14px !important;
  }

  .win-window .title-left strong {
    font-size: 14px !important;
  }

  .win-window .win-body {
    height: calc(100% - 46px) !important;
    overflow: auto !important;
  }

  .taskbar {
    position: fixed !important;
    left: 12px !important;
    right: 12px !important;
    bottom: 12px !important;
    width: auto !important;
    height: 58px !important;
    padding: 6px !important;
    border-radius: 20px !important;
    border: 1px solid rgba(148, 163, 184, .22) !important;
    background: rgba(15, 23, 42, .86) !important;
    box-shadow: 0 18px 48px rgba(0,0,0,.36), inset 0 1px 0 rgba(255,255,255,.06) !important;
    backdrop-filter: blur(22px) saturate(1.15) !important;
    -webkit-backdrop-filter: blur(22px) saturate(1.15) !important;
    transform: none !important;
    z-index: 80 !important;
  }

  .win-root.theme-light .taskbar {
    background: rgba(255,255,255,.86) !important;
    border-color: rgba(15,23,42,.12) !important;
    box-shadow: 0 16px 42px rgba(15,23,42,.18), inset 0 1px 0 rgba(255,255,255,.86) !important;
  }

  .taskbar .task-left,
  .taskbar .task-right {
    display: none !important;
  }

  .taskbar .task-center {
    width: 100% !important;
    height: 100% !important;
    display: grid !important;
    grid-template-columns: 1fr 1fr !important;
    gap: 8px !important;
    justify-content: stretch !important;
    align-items: stretch !important;
  }

  .taskbar .task-center > button:not(.task-start):not(.a3-mobile-account-button) {
    display: none !important;
  }

  .taskbar .task-start,
  .taskbar .a3-mobile-account-button {
    width: 100% !important;
    height: 100% !important;
    border-radius: 16px !important;
    border: 0 !important;
    display: grid !important;
    grid-template-rows: 1fr auto !important;
    place-items: center !important;
    gap: 0 !important;
    color: #94a3b8 !important;
    background: transparent !important;
    font-size: 11px !important;
    font-weight: 850 !important;
    line-height: 1 !important;
  }

  .taskbar .task-start {
    color: #f8fafc !important;
    background: color-mix(in srgb, var(--desktop-accent, #2563eb) 38%, transparent) !important;
  }

  .taskbar .task-start svg,
  .taskbar .a3-mobile-account-button svg {
    width: 21px !important;
    height: 21px !important;
  }

  .taskbar .task-start::after {
    content: "Trang chủ";
    display: block;
    color: color-mix(in srgb, var(--desktop-accent, #2563eb) 70%, #e0f2fe);
    font-size: 11px;
    font-weight: 900;
  }

  .taskbar .a3-mobile-account-button::after {
    content: "Tài khoản";
    display: block;
    color: #94a3b8;
    font-size: 11px;
    font-weight: 850;
  }

  .win-root.theme-light .taskbar .task-start,
  .win-root.theme-light .taskbar .a3-mobile-account-button {
    color: #0f172a !important;
  }
}
`;

function installCss() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

function isMobile() {
  return window.matchMedia?.("(max-width: 760px)").matches;
}

function normalizeMobileShortcuts() {
  if (!isMobile()) return;

  document.querySelectorAll<HTMLButtonElement>(".desktop-shortcut").forEach((button) => {
    const text = (button.textContent || "").replace(/\s+/g, " ").trim();
    const label = button.querySelector("span");

    button.classList.remove("a3-hidden-removed-app");
    button.removeAttribute("aria-hidden");
    button.tabIndex = 0;

    if (text.includes("Bảng điểm A3") && label) {
      label.textContent = "Bảng chấm điểm";
      button.title = "Bảng chấm điểm";
    }

    if ((text.includes("Sơ đồ lớp") || text.includes("Sơ đồ chỗ ngồi")) && label) {
      label.textContent = "Sơ đồ chỗ ngồi";
      button.title = "Sơ đồ chỗ ngồi";
    }
  });
}

function ensureAccountButton() {
  const taskCenter = document.querySelector<HTMLElement>(".taskbar .task-center");
  if (!taskCenter || taskCenter.querySelector(`.${ACCOUNT_BUTTON_CLASS}`)) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = `task-icon ${ACCOUNT_BUTTON_CLASS}`;
  button.title = "Tài khoản";
  button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></svg>`;
  taskCenter.appendChild(button);
}

function openShortcutByTitle(keyword: string) {
  const shortcut = Array.from(document.querySelectorAll<HTMLButtonElement>(".desktop-shortcut")).find((button) =>
    (button.textContent || button.title || "").includes(keyword)
  );
  shortcut?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
}

function goHome() {
  document.querySelectorAll<HTMLButtonElement>(".win-window .window-actions .close").forEach((button) => button.click());
  window.history.pushState({}, "", "/desktop");
}

function installBehavior() {
  const run = () => {
    normalizeMobileShortcuts();
    ensureAccountButton();
  };

  const observer = new MutationObserver(() => window.requestAnimationFrame(run));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  run();

  document.addEventListener(
    "click",
    (event) => {
      if (!isMobile()) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const shortcut = target.closest<HTMLButtonElement>(".desktop-shortcut");
      if (shortcut && !shortcut.title.includes("Cài đặt")) {
        event.preventDefault();
        event.stopPropagation();
        shortcut.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
        return;
      }

      const start = target.closest<HTMLButtonElement>(".task-start");
      if (start) {
        event.preventDefault();
        event.stopPropagation();
        goHome();
        return;
      }

      const account = target.closest<HTMLButtonElement>(`.${ACCOUNT_BUTTON_CLASS}`);
      if (account) {
        event.preventDefault();
        event.stopPropagation();
        openShortcutByTitle("Cài đặt");
      }
    },
    true
  );

  window.addEventListener("resize", run);
}

if (typeof window !== "undefined") {
  installCss();
  installBehavior();
}

export {};
