const SESSION_KEY = "a3k64-login-session-v1";
const RESTORE_PATH_KEY = "a3k64-restore-path";
const PINNED_APPS_KEY = "pinned-apps";

const REMOVED_APP_KEYS = new Set(["quickScore", "ranking", "contests", "students"]);
const REMOVED_APP_LABELS = ["Nhập điểm nhanh", "Xếp hạng", "Cuộc thi hiện tại", "Sơ đồ lớp"];
const REMOVED_APP_PATHS = new Set([
  "/desktop/nhap-diem-nhanh",
  "/desktop/xep-hang",
  "/desktop/cuoc-thi-hien-tai",
  "/desktop/so-do-lop",
]);

function normalizeRoute() {
  if (!window.location.pathname.startsWith("/desktop")) return;

  if (REMOVED_APP_PATHS.has(window.location.pathname)) {
    window.history.replaceState({}, "", "/desktop/bang-diem-a3");
    localStorage.setItem(RESTORE_PATH_KEY, "/desktop/bang-diem-a3");
    return;
  }

  localStorage.setItem(RESTORE_PATH_KEY, window.location.pathname);
}

function clearLoginSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(RESTORE_PATH_KEY);
  localStorage.removeItem("a3k64-session-restore");
  sessionStorage.setItem("a3k64-manual-logout", "1");
}

function cleanupPinnedApps() {
  try {
    const pinned = JSON.parse(localStorage.getItem(PINNED_APPS_KEY) || "[]");
    if (!Array.isArray(pinned)) return;
    const clean = pinned.filter((key) => !REMOVED_APP_KEYS.has(String(key)));
    if (clean.length !== pinned.length) localStorage.setItem(PINNED_APPS_KEY, JSON.stringify(clean));
  } catch {
    localStorage.setItem(PINNED_APPS_KEY, "[]");
  }
}

function isRemovedButton(element: Element) {
  const text = (element.textContent || "").replace(/\s+/g, " ").trim();
  return REMOVED_APP_LABELS.some((label) => text.includes(label));
}

function cleanupDesktopUi() {
  const candidates = document.querySelectorAll<HTMLElement>(
    ".start-app, .desktop-shortcut, .side-item, .task-app-menu button, .search-panel .side-item"
  );

  candidates.forEach((item) => {
    if (!isRemovedButton(item)) return;
    item.style.display = "none";
    item.setAttribute("aria-hidden", "true");
    item.setAttribute("tabindex", "-1");
  });

  const startGrid = document.querySelector<HTMLElement>(".start-app-grid");
  if (startGrid) startGrid.style.gridTemplateColumns = "repeat(2, minmax(110px, 1fr))";
}

function installLogoutFix() {
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const button = target.closest<HTMLButtonElement>("button");
      if (!button) return;

      const text = (button.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      const looksLikeLogout = button.classList.contains("logout-button") || text === "thoát" || text.includes("đăng xuất");
      if (looksLikeLogout) clearLoginSession();
    },
    true
  );
}

function installUiCleanupObserver() {
  const run = () => window.requestAnimationFrame(cleanupDesktopUi);
  const observer = new MutationObserver(run);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  run();
}

function installRoutePersistence() {
  normalizeRoute();

  const originalPushState = history.pushState.bind(history);
  history.pushState = (...args) => {
    originalPushState(...args);
    normalizeRoute();
  };

  const originalReplaceState = history.replaceState.bind(history);
  history.replaceState = (...args) => {
    originalReplaceState(...args);
    normalizeRoute();
  };

  window.addEventListener("popstate", normalizeRoute);
}

if (typeof window !== "undefined") {
  cleanupPinnedApps();
  installLogoutFix();
  installRoutePersistence();
  installUiCleanupObserver();
}

export {};
