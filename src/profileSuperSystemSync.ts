const STYLE_ID = 'a3k64-profile-system-sync-style';
const TASK_ID = 'a3k64-profile-taskbar-button';
const EVENT_NAME = 'a3k64-open-profile';

function addStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    body:has(.win-root.theme-light) .profile-super-window{
      --profile-bg:#f8fbff;--profile-panel:#ffffff;--profile-soft:#eef4fb;--profile-text:#0f172a;--profile-muted:#64748b;--profile-border:#dbe7f3;
    }
    body:has(.win-root.theme-dark) .profile-super-window,
    .profile-super-window{
      --profile-bg:#07111f;--profile-panel:#0f172a;--profile-soft:#111827;--profile-text:#f8fafc;--profile-muted:#94a3b8;--profile-border:#233047;
    }
    .desktop-icons .profile-super-shortcut{
      position:static!important;left:auto!important;top:auto!important;z-index:auto!important;width:76px!important;border:0!important;background:transparent!important;color:inherit!important;display:grid!important;justify-items:center!important;gap:6px!important;text-shadow:0 1px 4px rgba(0,0,0,.45)!important;font:inherit!important;font-weight:800!important;cursor:pointer!important;
    }
    .desktop-icons .profile-super-shortcut .desktop-shortcut-icon{
      width:52px!important;height:52px!important;border-radius:18px!important;display:grid!important;place-items:center!important;background:linear-gradient(135deg,var(--desktop-accent,#2563eb),#7c3aed)!important;box-shadow:0 14px 34px rgba(0,0,0,.28)!important;color:white!important;
    }
    .desktop-icons .profile-super-shortcut span{font-size:12px!important;color:inherit!important}
    .profile-super-window{
      z-index:var(--profile-z,120)!important;border:1px solid rgba(148,163,184,.28)!important;border-radius:22px!important;background:var(--profile-bg)!important;color:var(--profile-text)!important;box-shadow:0 24px 72px rgba(0,0,0,.42)!important;resize:both!important;overflow:hidden!important;
      width:min(1180px,calc(100vw - 72px))!important;height:min(760px,calc(100vh - 118px))!important;max-height:calc(100vh - 72px)!important;
    }
    .profile-super-window.maximized{inset:10px 10px 62px 10px!important;width:auto!important;height:auto!important;border-radius:18px!important;resize:none!important}
    .profile-super-titlebar{height:46px!important;background:var(--profile-panel)!important;border-bottom:1px solid var(--profile-border)!important;color:var(--profile-text)!important;cursor:grab!important;user-select:none!important}
    .profile-super-titlebar span{color:var(--profile-muted)!important}.profile-super-titlebar b{font-weight:900!important}
    .profile-super-titlebar button{border:1px solid var(--profile-border)!important;background:var(--profile-soft)!important;color:var(--profile-text)!important}.profile-super-titlebar .close{color:#ef4444!important}
    .profile-super-window>main{height:calc(100% - 46px)!important;background:var(--profile-bg)!important;min-height:0!important;display:grid!important;grid-template-columns:252px minmax(0,1fr)!important}
    .profile-super-window aside{background:var(--profile-soft)!important;border-right:1px solid var(--profile-border)!important;color:var(--profile-text)!important;min-height:0!important}
    .profile-super-main{background:var(--profile-bg)!important;color:var(--profile-text)!important;min-width:0!important;min-height:0!important;overflow:auto!important}
    .profile-super-page{min-height:100%!important;padding:18px!important}
    .profile-super-search,.profile-super-results,.profile-super-card,.profile-super-stats article{background:var(--profile-panel)!important;border-color:var(--profile-border)!important;color:var(--profile-text)!important}
    .profile-super-search input{color:var(--profile-text)!important}.profile-super-window aside p,.profile-super-results small,.profile-super-hero span,.profile-super-hero p,.profile-super-hero small,.profile-super-card th,.legend{color:var(--profile-muted)!important}
    .profile-super-window aside>button{color:var(--profile-text)!important}.profile-super-window aside>button.active,.profile-super-window aside>button:hover{background:var(--profile-panel)!important;box-shadow:inset 3px 0 0 var(--desktop-accent,#2563eb)!important}
    .profile-super-hero{background:linear-gradient(135deg,color-mix(in srgb,var(--desktop-accent,#2563eb) 20%,transparent),var(--profile-panel))!important;border-color:var(--profile-border)!important}
    .profile-super-card th{background:var(--profile-soft)!important}.profile-super-card td,.profile-super-card th{border-color:var(--profile-border)!important}
    .profile-super-card-title button{background:var(--profile-soft)!important;color:var(--profile-text)!important;border-color:var(--profile-border)!important}.profile-super-card-title button.active{background:var(--desktop-accent,#2563eb)!important;color:white!important}
    .profile-super-taskbar-button svg{width:18px;height:18px}.profile-super-taskbar-button.running-app::after{content:'';position:absolute;left:50%;bottom:3px;transform:translateX(-50%);width:5px;height:5px;border-radius:999px;background:var(--desktop-accent,#2563eb)}
    @media(max-width:860px){.profile-super-window{left:8px!important;top:8px!important;width:calc(100vw - 16px)!important;height:calc(100vh - 78px)!important;min-width:0!important;min-height:0!important}.profile-super-window>main{grid-template-columns:1fr!important}.profile-super-window aside{display:flex!important;gap:8px!important;overflow:auto!important;border-right:0!important;border-bottom:1px solid var(--profile-border)!important}.profile-super-window aside>button{min-width:190px!important}.profile-super-search{min-width:190px!important}.profile-super-window aside p{display:none!important}.profile-super-hero,.profile-super-stats,.profile-super-grid{grid-template-columns:1fr!important}}
  `;
  document.head.appendChild(style);
}

function moveShortcutIntoDesktop() {
  const shortcut = document.querySelector<HTMLElement>('.profile-super-shortcut');
  const icons = document.querySelector<HTMLElement>('.desktop-icons');
  if (!shortcut || !icons || shortcut.parentElement === icons) return;
  icons.appendChild(shortcut);
}

function ensureTaskbarButton() {
  const taskCenter = document.querySelector<HTMLElement>('.task-center');
  if (!taskCenter) return;
  let button = document.getElementById(TASK_ID) as HTMLButtonElement | null;
  if (!button) {
    button = document.createElement('button');
    button.id = TASK_ID;
    button.type = 'button';
    button.className = 'task-icon profile-super-taskbar-button';
    button.title = 'Profile';
    button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></svg>`;
    button.addEventListener('click', () => {
      const minimized = document.querySelector<HTMLButtonElement>('.profile-super-pill');
      if (minimized) { minimized.click(); return; }
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: {} }));
    });
    taskCenter.appendChild(button);
  }
  const open = Boolean(document.querySelector('.profile-super-window'));
  const minimized = Boolean(document.querySelector('.profile-super-pill'));
  button.classList.toggle('active', open && !minimized);
  button.classList.toggle('running-app', open || minimized);
}

function syncZIndex() {
  const win = document.querySelector<HTMLElement>('.profile-super-window');
  if (!win) return;
  win.addEventListener('mousedown', () => {
    const top = Array.from(document.querySelectorAll<HTMLElement>('.win-window,.profile-super-window'))
      .map((item) => Number(getComputedStyle(item).zIndex) || 0)
      .reduce((max, value) => Math.max(max, value), 120);
    win.style.setProperty('--profile-z', String(top + 1));
  }, { once: true });
}

function disableRightClickInApps() {
  window.addEventListener('contextmenu', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.win-window,.profile-super-window')) event.preventDefault();
  }, true);
}

function tick() {
  addStyle();
  moveShortcutIntoDesktop();
  ensureTaskbarButton();
  syncZIndex();
}

disableRightClickInApps();
window.setInterval(tick, 400);
tick();
