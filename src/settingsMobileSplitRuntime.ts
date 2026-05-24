const STYLE_ID = 'a3-settings-mobile-split-style';
const HOME_CLASS = 'a3-mobile-settings-home';
const SHOW_CONTENT_CLASS = 'a3-mobile-show-content';

const CSS = `
@media (max-width: 760px) {
  .win-root.a3-real-mobile .settings-app { width: 100% !important; height: 100% !important; overflow: hidden !important; color: #f8fafc !important; background: #050914 !important; }
  .win-root.a3-real-mobile .settings-app .settings-layout { display: block !important; width: 100% !important; height: 100% !important; background: #050914 !important; overflow: hidden !important; }
  .win-root.a3-real-mobile .settings-app .settings-sidebar { display: none !important; }
  .win-root.a3-real-mobile .settings-app .settings-content { display: none !important; width: 100% !important; height: 100% !important; padding: 0 0 18px !important; overflow-y: auto !important; overflow-x: hidden !important; color: #f8fafc !important; background: #050914 !important; -webkit-overflow-scrolling: touch !important; }
  .win-root.a3-real-mobile .settings-app.${SHOW_CONTENT_CLASS} .settings-content { display: block !important; }
  .win-root.a3-real-mobile .${HOME_CLASS} { display: block !important; width: 100% !important; height: 100% !important; overflow-y: auto !important; overflow-x: hidden !important; padding: 18px 18px 22px !important; color: #f8fafc !important; background: #050914 !important; box-sizing: border-box !important; }
  .win-root.a3-real-mobile .settings-app.${SHOW_CONTENT_CLASS} .${HOME_CLASS} { display: none !important; }
  .win-root.a3-real-mobile .a3-mobile-page-title { margin: 0 0 8px !important; font-size: 31px !important; line-height: 1.06 !important; font-weight: 950 !important; letter-spacing: -.045em !important; color: #f8fafc !important; }
  .win-root.a3-real-mobile .a3-mobile-page-subtitle { margin: 0 0 20px !important; color: #94a3b8 !important; font-size: 13px !important; line-height: 1.4 !important; }
  .win-root.a3-real-mobile .a3-mobile-group-label { margin: 0 0 8px !important; color: #94a3b8 !important; font-size: 12px !important; line-height: 1.2 !important; font-weight: 900 !important; letter-spacing: .02em !important; }
  .win-root.a3-real-mobile .a3-mobile-account-card, .win-root.a3-real-mobile .a3-mobile-list-card { border: 1px solid #273244 !important; border-radius: 16px !important; background: #0b1220 !important; box-shadow: none !important; box-sizing: border-box !important; }
  .win-root.a3-real-mobile .a3-mobile-account-card { min-height: 82px !important; margin: 0 0 20px !important; padding: 12px !important; display: grid !important; grid-template-columns: 58px minmax(0, 1fr) !important; align-items: center !important; gap: 12px !important; }
  .win-root.a3-real-mobile .a3-mobile-avatar { width: 58px !important; height: 58px !important; border-radius: 999px !important; display: grid !important; place-items: center !important; color: #fff !important; background: linear-gradient(135deg, var(--desktop-accent, #f97316), #64748b) !important; overflow: hidden !important; font-size: 30px !important; }
  .win-root.a3-real-mobile .a3-mobile-avatar img { width: 100% !important; height: 100% !important; object-fit: cover !important; }
  .win-root.a3-real-mobile .a3-mobile-account-card strong, .win-root.a3-real-mobile .a3-mobile-account-card span { display: block !important; min-width: 0 !important; white-space: normal !important; overflow: visible !important; text-overflow: clip !important; overflow-wrap: anywhere !important; }
  .win-root.a3-real-mobile .a3-mobile-account-card strong { color: #f8fafc !important; font-size: 14px !important; line-height: 1.22 !important; font-weight: 900 !important; }
  .win-root.a3-real-mobile .a3-mobile-account-card span { margin-top: 4px !important; color: #94a3b8 !important; font-size: 12px !important; line-height: 1.25 !important; }
  .win-root.a3-real-mobile .a3-mobile-list-card { overflow: hidden !important; }
  .win-root.a3-real-mobile .a3-mobile-nav-row { width: 100% !important; min-height: 62px !important; border: 0 !important; display: grid !important; grid-template-columns: 30px minmax(0, 1fr) auto !important; align-items: center !important; gap: 12px !important; padding: 12px 14px !important; color: #f8fafc !important; background: #0b1220 !important; font: inherit !important; text-align: left !important; cursor: pointer !important; box-sizing: border-box !important; }
  .win-root.a3-real-mobile .a3-mobile-nav-row .a3-mobile-icon, .win-root.a3-real-mobile .a3-mobile-nav-row .a3-mobile-chevron { color: var(--desktop-accent, #f97316) !important; font-size: 22px !important; font-weight: 900 !important; }
  .win-root.a3-real-mobile .a3-mobile-nav-row strong, .win-root.a3-real-mobile .a3-mobile-nav-row span { display: block !important; min-width: 0 !important; white-space: normal !important; overflow: visible !important; text-overflow: clip !important; overflow-wrap: anywhere !important; }
  .win-root.a3-real-mobile .a3-mobile-nav-row strong { color: #f8fafc !important; font-size: 14.5px !important; line-height: 1.2 !important; font-weight: 900 !important; }
  .win-root.a3-real-mobile .a3-mobile-nav-row span { margin-top: 3px !important; color: #94a3b8 !important; font-size: 12px !important; line-height: 1.3 !important; }
  .win-root.a3-real-mobile .settings-content .settings-breadcrumb { position: sticky !important; top: 0 !important; z-index: 20 !important; min-height: 50px !important; margin: 0 0 22px !important; padding: 13px 18px !important; border-top: 0 !important; border-bottom: 1px solid #273244 !important; background: #050914 !important; }
  .win-root.a3-real-mobile .settings-content > h1 { margin: 0 0 22px !important; padding: 0 18px !important; color: #f8fafc !important; font-size: 31px !important; line-height: 1.06 !important; }
  .win-root.a3-real-mobile .settings-content .personalization-grid { display: grid !important; grid-template-columns: 1fr !important; gap: 12px !important; padding: 0 18px 22px !important; }
  .win-root.a3-real-mobile .settings-content .personal-card { border: 1px solid #273244 !important; border-radius: 14px !important; min-height: 66px !important; background: #0b1220 !important; }
  .win-root.a3-real-mobile .settings-content .settings-card { width: calc(100% - 36px) !important; margin: 0 18px 20px !important; border: 1px solid #273244 !important; border-radius: 16px !important; overflow: visible !important; background: #0b1220 !important; }
}
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function installStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

function isRealMobile() {
  return Boolean(document.querySelector('.win-root.a3-real-mobile'));
}

function getUserInfo(settingsApp: HTMLElement) {
  const profile = settingsApp.querySelector<HTMLElement>('.profile-card');
  return {
    name: profile?.querySelector('strong')?.textContent?.trim() || 'Người dùng',
    email: profile?.querySelector('span')?.textContent?.trim() || 'Đang đăng nhập',
    img: profile?.querySelector<HTMLImageElement>('img')?.src || '',
  };
}

function signature(settingsApp: HTMLElement) {
  const { name, email, img } = getUserInfo(settingsApp);
  return `${name}|${email}|${img}|${isRealMobile() ? 'mobile' : 'desktop'}`;
}

function fillHome(settingsApp: HTMLElement, home: HTMLElement) {
  const sig = signature(settingsApp);
  if (home.dataset.a3Sig === sig && home.childElementCount > 0) return;
  home.dataset.a3Sig = sig;

  const { name, email, img } = getUserInfo(settingsApp);
  home.replaceChildren();
  home.append(el('h1', 'a3-mobile-page-title', 'Cài đặt'));
  home.append(el('p', 'a3-mobile-page-subtitle', 'Quản lý tài khoản và tuỳ chỉnh ứng dụng.'));
  home.append(el('p', 'a3-mobile-group-label', 'Tài khoản'));

  const account = el('div', 'a3-mobile-account-card');
  const avatar = el('div', 'a3-mobile-avatar');
  if (img) {
    const image = document.createElement('img');
    image.src = img;
    image.alt = 'Avatar';
    avatar.append(image);
  } else {
    avatar.textContent = '♙';
  }
  const userText = el('div');
  userText.append(el('strong', '', name));
  userText.append(el('span', '', email));
  account.append(avatar, userText);
  home.append(account);

  home.append(el('p', 'a3-mobile-group-label', 'Tuỳ chỉnh'));
  const list = el('div', 'a3-mobile-list-card');
  const row = el('button', 'a3-mobile-nav-row') as HTMLButtonElement;
  row.type = 'button';
  row.dataset.a3MobileOpenPersonalization = '1';
  row.append(el('span', 'a3-mobile-icon', '◉'));
  const rowText = el('div');
  rowText.append(el('strong', '', 'Cá nhân hóa'));
  rowText.append(el('span', '', 'Hình nền, màu sắc và thanh taskbar'));
  row.append(rowText, el('span', 'a3-mobile-chevron', '›'));
  list.append(row);
  home.append(list);
}

function ensureMobileHome(settingsApp: HTMLElement) {
  let home = settingsApp.querySelector<HTMLElement>(`.${HOME_CLASS}`);
  if (!home) {
    home = el('section', HOME_CLASS);
    settingsApp.prepend(home);
  }
  fillHome(settingsApp, home);
}

function wireSettingsApp(settingsApp: HTMLElement) {
  if (settingsApp.dataset.a3MobileWired === '1') return;
  settingsApp.dataset.a3MobileWired = '1';
  settingsApp.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('[data-a3-mobile-open-personalization]')) {
      settingsApp.classList.add(SHOW_CONTENT_CLASS);
      settingsApp.querySelector<HTMLButtonElement>('.windows-settings-nav button')?.click();
      return;
    }
    const back = target.closest<HTMLButtonElement>('.settings-breadcrumb button');
    const label = back?.textContent?.trim().toLowerCase() || '';
    if (back && label === 'cài đặt') {
      event.preventDefault();
      event.stopPropagation();
      settingsApp.classList.remove(SHOW_CONTENT_CLASS);
    }
  }, true);
}

function applyMobileSplitNow() {
  document.querySelectorAll<HTMLElement>('.settings-app').forEach((settingsApp) => {
    if (!isRealMobile()) {
      settingsApp.classList.remove(SHOW_CONTENT_CLASS, 'settings-mobile-native');
      settingsApp.querySelector(`.${HOME_CLASS}`)?.remove();
      return;
    }
    settingsApp.classList.add('settings-mobile-native');
    wireSettingsApp(settingsApp);
    ensureMobileHome(settingsApp);
  });
}

let rafId = 0;
function scheduleApply() {
  if (rafId) return;
  rafId = window.requestAnimationFrame(() => {
    rafId = 0;
    applyMobileSplitNow();
  });
}

installStyle();
scheduleApply();

const observer = new MutationObserver((mutations) => {
  const shouldRun = mutations.some((mutation) => {
    if (mutation.type !== 'childList') return false;
    return Array.from(mutation.addedNodes).some((node) => node instanceof HTMLElement && !node.closest(`.${HOME_CLASS}`));
  });
  if (shouldRun) scheduleApply();
});
observer.observe(document.body, { childList: true, subtree: true });
window.addEventListener('resize', scheduleApply);
window.addEventListener('orientationchange', scheduleApply);
window.addEventListener('appearance-change', scheduleApply);

export {};
