const STYLE_ID = 'a3k64-profile-final-system-polish';
const EVENT_NAME = 'a3k64-open-profile';

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .desktop-icons .profile-super-shortcut,
    .profile-super-shortcut{
      position:static!important;left:auto!important;top:auto!important;z-index:auto!important;width:76px!important;height:auto!important;border:0!important;background:transparent!important;color:inherit!important;display:grid!important;justify-items:center!important;align-content:start!important;gap:6px!important;padding:0!important;margin:0!important;text-shadow:0 1px 4px rgba(0,0,0,.38)!important;font:inherit!important;font-weight:800!important;cursor:pointer!important;
    }
    .desktop-icons .profile-super-shortcut .desktop-shortcut-icon,
    .profile-super-shortcut .desktop-shortcut-icon{
      width:52px!important;height:52px!important;border-radius:16px!important;display:grid!important;place-items:center!important;background:transparent!important;box-shadow:none!important;border:0!important;color:#ef4444!important;
    }
    .desktop-icons .profile-super-shortcut .desktop-shortcut-icon svg,
    .profile-super-shortcut .desktop-shortcut-icon svg{
      width:34px!important;height:34px!important;stroke:currentColor!important;stroke-width:2.2!important;fill:none!important;padding:0!important;background:transparent!important;box-shadow:none!important;border-radius:0!important;
    }
    .desktop-icons .profile-super-shortcut:hover .desktop-shortcut-icon,
    .profile-super-shortcut:hover .desktop-shortcut-icon{
      background:color-mix(in srgb,var(--desktop-accent,#2563eb) 12%,transparent)!important;
    }
    .desktop-icons .profile-super-shortcut span,
    .profile-super-shortcut span{
      font-size:12px!important;line-height:1.1!important;color:inherit!important;font-weight:800!important;text-align:center!important;max-width:76px!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;
    }

    .profile-super-window{
      border-radius:18px!important;border:1px solid rgba(148,163,184,.28)!important;box-shadow:0 24px 80px rgba(0,0,0,.42)!important;background:var(--profile-bg)!important;color:var(--profile-text)!important;max-height:calc(100vh - 70px)!important;
    }
    body:has(.win-root.theme-light) .profile-super-window{--profile-bg:#f8fbff;--profile-panel:#ffffff;--profile-soft:#edf3fa;--profile-text:#111827;--profile-muted:#64748b;--profile-border:#d6e2ef;}
    body:has(.win-root.theme-dark) .profile-super-window,.profile-super-window{--profile-bg:#07111f;--profile-panel:#0f172a;--profile-soft:#111827;--profile-text:#f8fafc;--profile-muted:#94a3b8;--profile-border:#233047;}

    .profile-super-titlebar{
      height:46px!important;padding:0 10px 0 14px!important;background:var(--profile-panel)!important;border-bottom:1px solid var(--profile-border)!important;color:var(--profile-text)!important;display:flex!important;align-items:center!important;justify-content:space-between!important;cursor:grab!important;user-select:none!important;
    }
    .profile-super-titlebar>div{display:flex!important;align-items:center!important;gap:8px!important;min-width:0!important;}
    .profile-super-titlebar>div svg{width:17px!important;height:17px!important;color:var(--profile-text)!important;stroke-width:2!important;}
    .profile-super-titlebar b{font-size:14px!important;font-weight:900!important;color:var(--profile-text)!important;}
    .profile-super-titlebar span{font-size:12px!important;color:var(--profile-muted)!important;}
    .profile-super-titlebar nav{display:flex!important;align-items:center!important;gap:4px!important;background:transparent!important;border:0!important;padding:0!important;}
    .profile-super-titlebar nav button{
      width:36px!important;height:32px!important;border:0!important;border-radius:8px!important;background:transparent!important;color:var(--profile-text)!important;display:grid!important;place-items:center!important;box-shadow:none!important;padding:0!important;
    }
    .profile-super-titlebar nav button:hover{background:color-mix(in srgb,var(--desktop-accent,#2563eb) 12%,transparent)!important;}
    .profile-super-titlebar nav button.close:hover{background:#ef4444!important;color:white!important;}
    .profile-super-titlebar nav button svg{width:15px!important;height:15px!important;stroke-width:2!important;}

    .profile-super-window>main{height:calc(100% - 46px)!important;display:grid!important;grid-template-columns:260px minmax(0,1fr)!important;background:var(--profile-bg)!important;min-height:0!important;}
    .profile-super-window aside{background:var(--profile-soft)!important;border-right:1px solid var(--profile-border)!important;color:var(--profile-text)!important;padding:12px!important;min-height:0!important;overflow:auto!important;}
    .profile-super-window aside p{margin:12px 0 8px!important;color:var(--profile-muted)!important;font-size:12px!important;font-weight:900!important;text-transform:uppercase!important;letter-spacing:.02em!important;}
    .profile-super-search{height:40px!important;background:var(--profile-panel)!important;border:1px solid var(--profile-border)!important;border-radius:13px!important;color:var(--profile-muted)!important;display:grid!important;grid-template-columns:28px 1fr!important;align-items:center!important;padding:0 8px!important;}
    .profile-super-search input{background:transparent!important;color:var(--profile-text)!important;border:0!important;outline:0!important;font-weight:800!important;min-width:0!important;}
    .profile-super-results{background:var(--profile-panel)!important;border:1px solid var(--profile-border)!important;border-radius:14px!important;padding:7px!important;margin:8px 0!important;}
    .profile-super-results button{background:transparent!important;color:var(--profile-text)!important;border:0!important;border-radius:10px!important;padding:8px!important;text-align:left!important;display:grid!important;font-weight:850!important;width:100%!important;}
    .profile-super-results button:hover{background:var(--profile-soft)!important;}
    .profile-super-results small{color:var(--profile-muted)!important;}
    .profile-super-window aside>button{background:transparent!important;color:var(--profile-text)!important;border:0!important;border-radius:13px!important;min-height:42px!important;padding:0 9px!important;margin:0 0 7px!important;display:grid!important;grid-template-columns:1fr 20px!important;align-items:center!important;text-align:left!important;font-weight:850!important;}
    .profile-super-window aside>button.active,.profile-super-window aside>button:hover{background:var(--profile-panel)!important;box-shadow:inset 3px 0 0 var(--desktop-accent,#2563eb)!important;}
    .profile-super-main{background:var(--profile-bg)!important;color:var(--profile-text)!important;overflow:auto!important;min-width:0!important;}
    .profile-super-hero,.profile-super-card,.profile-super-stats article{background:var(--profile-panel)!important;border-color:var(--profile-border)!important;color:var(--profile-text)!important;}
    .profile-super-hero{background:linear-gradient(135deg,color-mix(in srgb,var(--desktop-accent,#2563eb) 18%,transparent),var(--profile-panel))!important;}
    .profile-super-hero span,.profile-super-hero p,.profile-super-hero small,.profile-super-card th,.legend{color:var(--profile-muted)!important;}
    .profile-super-card th{background:var(--profile-soft)!important;}
    .profile-super-card td,.profile-super-card th{border-color:var(--profile-border)!important;}
    .profile-super-card-title button{background:var(--profile-soft)!important;color:var(--profile-text)!important;border-color:var(--profile-border)!important;}
    .profile-super-card-title button.active{background:var(--desktop-accent,#2563eb)!important;color:white!important;}

    #a3k64-profile-taskbar-button{position:relative!important;}
    #a3k64-profile-taskbar-button svg{width:18px!important;height:18px!important;stroke-width:2.1!important;}
    #a3k64-profile-taskbar-button.running-app::after{content:'';position:absolute;left:50%;bottom:3px;transform:translateX(-50%);width:5px;height:5px;border-radius:999px;background:var(--desktop-accent,#2563eb);}

    @media(max-width:860px){
      .profile-super-window{left:8px!important;top:8px!important;width:calc(100vw - 16px)!important;height:calc(100vh - 78px)!important;min-width:0!important;min-height:0!important;}
      .profile-super-window>main{grid-template-columns:1fr!important;}
      .profile-super-window aside{display:flex!important;gap:8px!important;overflow:auto!important;border-right:0!important;border-bottom:1px solid var(--profile-border)!important;}
      .profile-super-window aside>button{min-width:190px!important;}
      .profile-super-search{min-width:190px!important;}
      .profile-super-window aside p{display:none!important;}
      .profile-super-hero,.profile-super-stats,.profile-super-grid{grid-template-columns:1fr!important;}
    }
  `;
  document.head.appendChild(style);
}

function moveIconIntoDesktopFlow() {
  const icons = document.querySelector<HTMLElement>('.desktop-icons');
  const shortcut = document.querySelector<HTMLElement>('.profile-super-shortcut');
  if (!icons || !shortcut) return;
  if (shortcut.parentElement !== icons) icons.appendChild(shortcut);
  shortcut.classList.add('desktop-shortcut');
  const icon = shortcut.querySelector('.desktop-shortcut-icon');
  if (icon) icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></svg>`;
}

function ensureTaskbarButton() {
  const taskCenter = document.querySelector<HTMLElement>('.task-center');
  if (!taskCenter) return;
  let button = document.getElementById('a3k64-profile-taskbar-button') as HTMLButtonElement | null;
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.id = 'a3k64-profile-taskbar-button';
    button.className = 'task-icon profile-super-taskbar-button';
    button.title = 'Profile';
    button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></svg>`;
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

function disableContextMenuInApps() {
  window.addEventListener('contextmenu', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.win-window,.profile-super-window')) event.preventDefault();
  }, true);
}

function tick() {
  injectStyle();
  moveIconIntoDesktopFlow();
  ensureTaskbarButton();
}

disableContextMenuInApps();
window.setInterval(tick, 350);
tick();
