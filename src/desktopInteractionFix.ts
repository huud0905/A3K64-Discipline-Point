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
  `;
  document.head.appendChild(style);
}

removeLegacyProfilePin();
installContextGuard();
injectStyle();

export {};
