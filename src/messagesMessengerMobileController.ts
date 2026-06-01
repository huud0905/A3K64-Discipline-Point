/* Mobile controller cho Messages.
   Biến layout desktop 2 cột thành luồng mobile kiểu Messenger:
   - list: chỉ danh sách chat
   - chat: chỉ khung chat, có nút quay lại
   - requests: màn yêu cầu riêng
*/

type MobileView = "list" | "chat" | "requests";

const MOBILE_CLASS = "a3k64-messages-mobile";
const BACK_CLASS = "a3k64-messages-back";
const HEAD_CLASS = "a3k64-messages-mobile-head";
const QUICK_CLASS = "a3k64-messages-quick-strip";
const NAV_CLASS = "a3k64-messages-bottom-nav";

function getApp(target?: Element | null) {
  return (target?.closest?.(".messages-native-app.messages-redesign") || document.querySelector(".messages-native-app.messages-redesign")) as HTMLElement | null;
}

function setView(app: HTMLElement, view: MobileView) {
  app.dataset.mobileView = view;
  app.classList.toggle("messages-mobile-view-list", view === "list");
  app.classList.toggle("messages-mobile-view-chat", view === "chat");
  app.classList.toggle("messages-mobile-view-requests", view === "requests");
  syncBottomNav(app, view);
}

function isSmallApp(app: HTMLElement) {
  const rect = app.getBoundingClientRect();
  return rect.width <= 760 || window.innerWidth <= 760;
}

function updateMobileFlag(app: HTMLElement) {
  const small = isSmallApp(app);
  app.classList.toggle(MOBILE_CLASS, small);
  if (small && !app.dataset.mobileView) setView(app, "list");
}

function icon(name: "back" | "chat" | "shield" | "refresh" | "edit") {
  const common = "width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'";
  const paths: Record<typeof name, string> = {
    back: "<path d='m15 18-6-6 6-6'/>",
    chat: "<path d='M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z'/>",
    shield: "<path d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10'/><path d='m9 12 2 2 4-4'/>",
    refresh: "<path d='M21 12a9 9 0 0 1-15.5 6.2'/><path d='M3 12A9 9 0 0 1 18.5 5.8'/><path d='M3 19v-5h5'/><path d='M21 5v5h-5'/>",
    edit: "<path d='M12 20h9'/><path d='M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z'/>",
  };
  return `<svg ${common}>${paths[name]}</svg>`;
}

function ensureMobileHead(app: HTMLElement) {
  const left = app.querySelector<HTMLElement>(".messages-left-panel");
  if (!left || left.querySelector(`.${HEAD_CLASS}`)) return;
  const head = document.createElement("header");
  head.className = HEAD_CLASS;
  head.innerHTML = `
    <div><small>12A3</small><strong>Messages</strong></div>
    <div>
      <button type="button" data-a3k64-msg-action="refresh" title="Đồng bộ">${icon("refresh")}</button>
      <button type="button" data-a3k64-msg-action="new" title="Tạo chat">${icon("edit")}</button>
    </div>
  `;
  left.prepend(head);
}

function ensureBackButton(app: HTMLElement) {
  const header = app.querySelector<HTMLElement>(".messages-chat-header");
  if (!header || header.querySelector(`.${BACK_CLASS}`)) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = BACK_CLASS;
  btn.innerHTML = icon("back");
  btn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setView(app, "list");
  });
  header.prepend(btn);
}

function threadTargetName(thread: HTMLElement) {
  return thread.querySelector(".messages-thread-info strong")?.textContent?.trim() || "Chat";
}

function threadAvatarText(thread: HTMLElement) {
  return thread.querySelector(".messages-thread-avatar")?.textContent?.trim() || threadTargetName(thread).slice(0, 2).toUpperCase();
}

function ensureQuickStrip(app: HTMLElement) {
  const left = app.querySelector<HTMLElement>(".messages-left-panel");
  const search = left?.querySelector<HTMLElement>(".messages-search-box");
  const newBox = left?.querySelector<HTMLElement>(".messages-new-box");
  if (!left || !search || !newBox) return;
  let strip = left.querySelector<HTMLElement>(`.${QUICK_CLASS}`);
  if (!strip) {
    strip = document.createElement("div");
    strip.className = QUICK_CLASS;
    search.insertAdjacentElement("afterend", strip);
  }
  const threads = Array.from(left.querySelectorAll<HTMLElement>(".messages-thread-card")).slice(0, 8);
  strip.innerHTML = `<button type="button" class="a3k64-quick-new" data-a3k64-msg-action="focus-new"><span>${icon("edit")}</span><b>Tạo</b></button>` + threads.map((thread, index) => {
    const name = threadTargetName(thread);
    const avatar = threadAvatarText(thread);
    const online = thread.querySelector(".messages-dot.online") ? "<i></i>" : "";
    return `<button type="button" class="a3k64-quick-contact" data-a3k64-thread-index="${index}"><span>${avatar}</span>${online}<b>${name}</b></button>`;
  }).join("");
}

function syncBottomNav(app: HTMLElement, view: MobileView) {
  const nav = app.querySelector<HTMLElement>(`.${NAV_CLASS}`);
  if (!nav) return;
  nav.querySelectorAll("button").forEach((button) => button.classList.remove("active"));
  nav.querySelector<HTMLButtonElement>(`[data-view="${view === "chat" ? "list" : view}"]`)?.classList.add("active");
}

function ensureBottomNav(app: HTMLElement) {
  const left = app.querySelector<HTMLElement>(".messages-left-panel");
  if (!left || left.querySelector(`.${NAV_CLASS}`)) return;
  const nav = document.createElement("nav");
  nav.className = NAV_CLASS;
  nav.innerHTML = `
    <button type="button" data-view="list" class="active">${icon("chat")}<span>Đoạn chat</span></button>
    <button type="button" data-view="requests">${icon("shield")}<span>Yêu cầu</span></button>
    <button type="button" data-view="refresh">${icon("refresh")}<span>Làm mới</span></button>
  `;
  nav.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>("button[data-view]");
    if (!button) return;
    const view = button.dataset.view;
    event.preventDefault();
    event.stopPropagation();
    if (view === "list") {
      app.querySelectorAll<HTMLButtonElement>(".messages-segment button")[0]?.click();
      setView(app, "list");
    }
    if (view === "requests") {
      app.querySelectorAll<HTMLButtonElement>(".messages-segment button")[1]?.click();
      setView(app, "requests");
    }
    if (view === "refresh") app.querySelector<HTMLButtonElement>(".messages-profile-card > button")?.click();
  });
  left.appendChild(nav);
}

function bindDelegation(app: HTMLElement) {
  if (app.dataset.mobileControllerBound === "1") return;
  app.dataset.mobileControllerBound = "1";
  app.addEventListener("click", (event) => {
    const target = event.target as Element;
    const threadMain = target.closest(".messages-thread-main");
    const quickContact = target.closest<HTMLElement>(".a3k64-quick-contact[data-a3k64-thread-index]");
    const refresh = target.closest('[data-a3k64-msg-action="refresh"]');
    const focusNew = target.closest('[data-a3k64-msg-action="new"],[data-a3k64-msg-action="focus-new"]');

    if (threadMain) setView(app, "chat");
    if (quickContact) {
      const index = Number(quickContact.dataset.a3k64ThreadIndex || 0);
      app.querySelectorAll<HTMLButtonElement>(".messages-thread-main")[index]?.click();
      setView(app, "chat");
    }
    if (refresh) app.querySelector<HTMLButtonElement>(".messages-profile-card > button")?.click();
    if (focusNew) app.querySelector<HTMLInputElement>(".messages-contact-box input")?.focus();
  }, true);
}

function enhance(app: HTMLElement) {
  updateMobileFlag(app);
  ensureMobileHead(app);
  ensureBackButton(app);
  ensureQuickStrip(app);
  ensureBottomNav(app);
  bindDelegation(app);
  syncBottomNav(app, (app.dataset.mobileView as MobileView) || "list");
}

function bootMessagesMobileController() {
  const scan = () => document.querySelectorAll<HTMLElement>(".messages-native-app.messages-redesign").forEach(enhance);
  scan();
  window.setInterval(scan, 700);
  const observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  const resize = new ResizeObserver((entries) => entries.forEach((entry) => enhance(entry.target as HTMLElement)));
  window.setInterval(() => document.querySelectorAll<HTMLElement>(".messages-native-app.messages-redesign").forEach((app) => resize.observe(app)), 1200);
}

if (typeof window !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootMessagesMobileController, { once: true });
  else bootMessagesMobileController();
}

export {};
