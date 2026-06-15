import { normalizedElementText, upsertStyleTag } from './core/dom';
import { readJsonStorage, writeJsonStorage } from './core/storage';

const HIDDEN_KEY = 'a3k64-message-hidden-thread-labels-v1';
const UNREAD_KEY = 'a3k64-message-unread-thread-labels-v1';
const STYLE_ID = 'a3-message-thread-actions-style';

function readList(key: string) {
  const list = readJsonStorage<unknown>(key, []);
  return Array.isArray(list) ? list.map(String) : [];
}

function writeList(key: string, list: string[]) {
  writeJsonStorage(key, Array.from(new Set(list)));
}

function threadLabel(thread: Element) {
  return normalizedElementText(thread.querySelector('strong'));
}

function isHidden(label: string) {
  return readList(HIDDEN_KEY).includes(label);
}

function setHidden(label: string) {
  writeList(HIDDEN_KEY, [...readList(HIDDEN_KEY), label]);
}

function setRead(label: string) {
  writeList(UNREAD_KEY, readList(UNREAD_KEY).filter((item) => item !== label));
}

function setUnread(label: string) {
  writeList(UNREAD_KEY, [...readList(UNREAD_KEY), label]);
}

function isUnread(label: string) {
  return readList(UNREAD_KEY).includes(label);
}

function ensureStyle() {
  upsertStyleTag(STYLE_ID, `
    .messages-thread{position:relative!important;padding-right:42px!important;overflow:visible!important}
    .messages-thread.a3-thread-hidden{display:none!important}
    .a3-thread-more{position:absolute;right:9px;top:9px;width:28px;height:28px;border:1px solid transparent;border-radius:999px;display:grid;place-items:center;color:#94a3b8;background:rgba(15,23,42,.72);opacity:0;pointer-events:none;transition:opacity .15s ease,background .15s ease,border-color .15s ease;z-index:5}
    .messages-thread:hover .a3-thread-more,.messages-thread.a3-menu-open .a3-thread-more{opacity:1;pointer-events:auto}
    .a3-thread-more:hover{color:#f8fafc;background:#111827;border-color:#273244}
    .a3-thread-menu{position:absolute;right:8px;top:40px;z-index:30;min-width:190px;border:1px solid #273244;border-radius:14px;padding:6px;background:#0b1220;box-shadow:0 18px 45px rgba(0,0,0,.42);display:none}
    .messages-thread.a3-menu-open .a3-thread-menu{display:grid;gap:4px}
    .a3-thread-menu button{height:34px;border:0;border-radius:10px;padding:0 10px;display:flex;align-items:center;gap:8px;color:#f8fafc;background:transparent;font:inherit;font-size:12px;font-weight:800;text-align:left;cursor:pointer}
    .a3-thread-menu button:hover{background:#111827}
    .a3-thread-menu button.danger{color:#fb7185}
    .a3-thread-menu button.danger:hover{background:rgba(239,68,68,.14)}
    .messages-thread.a3-force-unread b{display:grid!important}
    .messages-thread.a3-force-unread::after{content:'1';position:absolute;right:34px;top:14px;min-width:18px;height:18px;border-radius:999px;display:grid;place-items:center;color:#fff;background:#ef4444;font-size:11px;font-weight:900}
    .win-root.theme-light .a3-thread-more{background:rgba(255,255,255,.9);color:#64748b}
    .win-root.theme-light .a3-thread-more:hover{background:#e2e8f0;color:#0f172a;border-color:#d7dee8}
    .win-root.theme-light .a3-thread-menu{background:#fff;border-color:#d7dee8;box-shadow:0 18px 45px rgba(15,23,42,.18)}
    .win-root.theme-light .a3-thread-menu button{color:#0f172a}
    .win-root.theme-light .a3-thread-menu button:hover{background:#e2e8f0}
    .win-root.theme-light .a3-thread-menu button.danger{color:#dc2626}
  `);
}

function closeOtherMenus(current?: Element) {
  document.querySelectorAll('.messages-thread.a3-menu-open').forEach((node) => {
    if (node !== current) node.classList.remove('a3-menu-open');
  });
}

function applyThreadState(thread: HTMLElement) {
  const label = threadLabel(thread);
  if (!label) return;
  thread.classList.toggle('a3-thread-hidden', isHidden(label));
  thread.classList.toggle('a3-force-unread', isUnread(label) && !thread.querySelector('b'));
}

function patchThread(thread: HTMLElement) {
  if (thread.dataset.a3ActionsPatched === '1') {
    applyThreadState(thread);
    return;
  }
  thread.dataset.a3ActionsPatched = '1';
  applyThreadState(thread);

  const more = document.createElement('span');
  more.className = 'a3-thread-more';
  more.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>';

  const menu = document.createElement('span');
  menu.className = 'a3-thread-menu';
  menu.innerHTML = `
    <button type="button" data-a3-action="read"><span>✓</span> Đánh dấu đã đọc</button>
    <button type="button" data-a3-action="unread"><span>●</span> Đánh dấu chưa đọc</button>
    <button type="button" data-a3-action="hide" class="danger"><span>×</span> Xoá tin nhắn</button>
  `;

  more.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const open = thread.classList.contains('a3-menu-open');
    closeOtherMenus(thread);
    thread.classList.toggle('a3-menu-open', !open);
  });

  menu.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const target = event.target as HTMLElement | null;
    const button = target?.closest('button[data-a3-action]') as HTMLButtonElement | null;
    if (!button) return;
    const label = threadLabel(thread);
    if (!label) return;
    const action = button.dataset.a3Action;
    if (action === 'read') setRead(label);
    if (action === 'unread') setUnread(label);
    if (action === 'hide') setHidden(label);
    thread.classList.remove('a3-menu-open');
    applyThreadState(thread);
  });

  thread.appendChild(more);
  thread.appendChild(menu);
}

function patchMessages() {
  ensureStyle();
  document.querySelectorAll<HTMLElement>('.messages-thread').forEach(patchThread);
}

function init() {
  patchMessages();
  const observer = new MutationObserver(() => patchMessages());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('click', () => closeOtherMenus());
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}

export {};
