const PINNED_APPS_KEY = 'pinned-apps';
const STYLE_ID = 'a3k64-desktop-interaction-fix-style';

function readPinnedApps(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(PINNED_APPS_KEY) || '[]');
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}

function removeLegacyProfilePin() {
  const current = readPinnedApps();
  const next = current.filter((key) => key !== 'profile');
  if (next.length !== current.length) {
    localStorage.setItem(PINNED_APPS_KEY, JSON.stringify(next));
  }
}

function looksLikeUserIcon(button: HTMLButtonElement) {
  const svgText = button.innerHTML.replace(/\s+/g, ' ');
  return (
    svgText.includes('M20 21a8 8 0 0 0-16 0') ||
    svgText.includes('circle cx="12" cy="7" r="4"') ||
    svgText.includes('circle cx="12" cy="8" r="4"')
  );
}

function removeLegacyTaskbarProfileIcons() {
  removeLegacyProfilePin();

  document.querySelectorAll<HTMLButtonElement>('.taskbar button.task-icon').forEach((button) => {
    const title = (button.getAttribute('title') || '').trim().toLowerCase();
    const running = button.classList.contains('running-app') || button.classList.contains('active') || button.classList.contains('pinned-app');

    // Profile chính thức chỉ nên hiện trên taskbar khi app đang mở. Nếu chỉ là icon pin/cũ thì ẩn.
    if (title === 'profile' && !running) {
      button.style.display = 'none';
      return;
    }

    // Dọn icon account/profile cũ không có trạng thái chạy, thường không có title rõ ràng.
    if (!running && looksLikeUserIcon(button)) {
      button.style.display = 'none';
    }
  });
}

function closeDesktopContextMenu() {
  document.querySelectorAll<HTMLElement>('.custom-context-menu').forEach((menu) => menu.remove());
}

function installContextGuard() {
  window.addEventListener(
    'contextmenu',
    (event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const insideApp = Boolean(target.closest('.win-window, .start-menu, .search-panel, .task-app-menu'));
      const insideDesktop = Boolean(target.closest('.win-desktop, .taskbar, .desktop-icons'));

      if (insideApp) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        closeDesktopContextMenu();
        return;
      }

      if (!insideDesktop) {
        closeDesktopContextMenu();
      }
    },
    true,
  );
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .profile-native-desktop-host,
    .profile-native-taskbar-host,
    #a3k64-profile-native-shell-root,
    #a3k64-profile-super-root,
    #a3k64-profile-root,
    #a3k64-profile-shortcut-root{
      display:none!important;
      pointer-events:none!important;
    }

    .taskbar button.task-icon[title="Profile"]:not(.running-app):not(.active){
      display:none!important;
    }
  `;
  document.head.appendChild(style);
}

function boot() {
  removeLegacyTaskbarProfileIcons();
  installContextGuard();
  injectStyle();
  window.setInterval(removeLegacyTaskbarProfileIcons, 600);
  window.addEventListener('storage', removeLegacyTaskbarProfileIcons);
  window.addEventListener('taskbar-settings-change', removeLegacyTaskbarProfileIcons);
  window.addEventListener('personalization-sync-applied', removeLegacyTaskbarProfileIcons);
}

boot();

export {};
