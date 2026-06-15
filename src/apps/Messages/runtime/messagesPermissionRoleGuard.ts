import { normalizedElementText, upsertStyleTag } from '../../../core/dom';
import { readSavedLoginSession } from '../../../core/auth';
import { normalizeRole } from '../../../core/permissions';

const STYLE_ID = 'a3-message-permission-role-guard-style';

function readRole() {
  return normalizeRole(readSavedLoginSession<Record<string, unknown>>()?.user?.role as string | null | undefined);
}

function canUsePermissionRequests() {
  return readRole() === 'to_truong';
}

function ensureStyle() {
  upsertStyleTag(STYLE_ID, `
    .messages-native-app.a3-no-permission-requests .messages-segment{grid-template-columns:1fr!important}
    .messages-native-app.a3-no-permission-requests .messages-segment button:nth-child(2){display:none!important}
    .messages-native-app.a3-no-permission-requests .messages-chat-header button:has(svg){display:none!important}
    .messages-native-app.a3-no-permission-requests .messages-permission-panel{display:none!important}
  `);
}

function isRequestPanelOpen(app: Element) {
  return Boolean(app.querySelector('.messages-permission-panel')) || /Xin quyền hỗ trợ chấm điểm/i.test(normalizedElementText(app));
}

function clickChatsTab(app: Element) {
  const buttons = Array.from(app.querySelectorAll<HTMLButtonElement>('.messages-segment button'));
  const chatButton = buttons.find((button) => /Tin nhắn/i.test(normalizedElementText(button)));
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
