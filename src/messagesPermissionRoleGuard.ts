const STYLE_ID = 'a3-message-permission-role-guard-style';

function safeJson<T>(raw: string | null, fallback: T): T {
  try {
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function normalizeRole(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readRole() {
  const session = safeJson<{ user?: Record<string, unknown> } | null>(localStorage.getItem('a3k64-login-session-v1'), null);
  return normalizeRole(session?.user?.role);
}

function canUsePermissionRequests() {
  return readRole() === 'to truong';
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .messages-native-app.a3-no-permission-requests .messages-segment{grid-template-columns:1fr!important}
    .messages-native-app.a3-no-permission-requests .messages-segment button:nth-child(2){display:none!important}
    .messages-native-app.a3-no-permission-requests .messages-chat-header button:has(svg){display:none!important}
    .messages-native-app.a3-no-permission-requests .messages-permission-panel{display:none!important}
  `;
  document.head.appendChild(style);
}

function isRequestPanelOpen(app: Element) {
  return Boolean(app.querySelector('.messages-permission-panel')) || /Xin quyền hỗ trợ chấm điểm/i.test(app.textContent || '');
}

function clickChatsTab(app: Element) {
  const buttons = Array.from(app.querySelectorAll<HTMLButtonElement>('.messages-segment button'));
  const chatButton = buttons.find((button) => /Tin nhắn/i.test(button.textContent || ''));
  chatButton?.click();
}

function guardMessagesPermissionUi() {
  ensureStyle();
  const allowed = canUsePermissionRequests();
  document.querySelectorAll<HTMLElement>('.messages-native-app').forEach((app) => {
    app.classList.toggle('a3-no-permission-requests', !allowed);
    if (!allowed && isRequestPanelOpen(app)) clickChatsTab(app);
  });
}

function init() {
  guardMessagesPermissionUi();
  const observer = new MutationObserver(() => guardMessagesPermissionUi());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('storage', guardMessagesPermissionUi);
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}

export {};
