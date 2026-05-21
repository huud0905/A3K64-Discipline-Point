import { fetchScoreboardFromGas } from './lib/gasApi';
import { mockStudents, Student } from './apps/ScoreboardApp/data/mockScoreData';

const EVENT_NAME = 'a3k64-open-profile';
const SESSION_KEY = 'a3k64-login-session-v1';
let studentsCache: Student[] = [];
let mountedShortcut = false;
let searchInjectedFor: Element | null = null;
let windowEnhancedFor: HTMLElement | null = null;

function normalize(value?: string | null) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

async function getStudents() {
  if (studentsCache.length) return studentsCache;
  const remote = await fetchScoreboardFromGas().catch(() => null);
  studentsCache = remote?.students?.length ? remote.students : mockStudents;
  return studentsCache;
}

function getSelfStudent(students: Student[]) {
  try {
    const user = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')?.user || {};
    const candidates = [user.displayName, user.hoten, user.name, String(user.email || '').split('@')[0]]
      .map(normalize)
      .filter(Boolean);
    return students.find((student) => candidates.some((name) => {
      const studentName = normalize(student.name);
      return studentName === name || studentName.includes(name) || name.includes(studentName);
    })) || students[0];
  } catch {
    return students[0];
  }
}

function openProfile(studentId?: string) {
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: studentId ? { studentId } : {} }));
}

async function openSelfProfile() {
  const students = await getStudents();
  const student = getSelfStudent(students);
  if (student) openProfile(student.id);
}

function addStyle() {
  if (document.getElementById('profile-desktop-integration-css')) return;
  const style = document.createElement('style');
  style.id = 'profile-desktop-integration-css';
  style.textContent = `
    .desktop-icons .profile-desktop-app{appearance:none;border:0;background:transparent;color:inherit;width:76px;display:grid;justify-items:center;gap:6px;cursor:pointer;text-shadow:0 1px 4px rgba(0,0,0,.45);font:inherit;font-weight:800}
    .desktop-icons .profile-desktop-app-icon{width:52px;height:52px;border-radius:18px;display:grid;place-items:center;background:linear-gradient(135deg,var(--desktop-accent,#2563eb),#7c3aed);box-shadow:0 14px 34px rgba(0,0,0,.28)}
    .desktop-icons .profile-desktop-app-icon svg{width:28px;height:28px;color:white}
    .desktop-icons .profile-desktop-app span{font-size:12px;color:inherit}
    .profile-window.desktop-profile-window{left:96px!important;top:62px!important;transform:none!important;width:min(1180px,calc(100vw - 130px))!important;height:min(760px,calc(100vh - 128px))!important;min-width:760px;min-height:520px;resize:both!important;overflow:hidden!important}
    .profile-window.desktop-profile-window.profile-positioned{left:var(--profile-x,96px)!important;top:var(--profile-y,62px)!important}
    .profile-window.desktop-profile-window.profile-maximized{left:10px!important;top:10px!important;width:calc(100vw - 20px)!important;height:calc(100vh - 72px)!important;border-radius:18px!important;resize:none!important}
    .profile-window .profile-window-titlebar{cursor:grab;user-select:none}
    .profile-window .profile-window-titlebar:active{cursor:grabbing}
    .profile-window .profile-extra-button{width:34px;height:34px;border:1px solid rgba(148,163,184,.2);border-radius:11px;display:grid;place-items:center;color:#e2e8f0;background:#111827;cursor:pointer}
    .profile-minimized-dock{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:4300;height:38px;padding:0 15px;border:1px solid rgba(148,163,184,.32);border-radius:999px;display:flex;align-items:center;gap:8px;color:white;background:#111827;box-shadow:0 16px 42px rgba(0,0,0,.4);font-weight:900;cursor:pointer}
    .profile-student-search{margin:0 0 10px;padding:8px;border:1px solid rgba(148,163,184,.16);border-radius:15px;background:#0b1220}
    .profile-student-search label{height:38px;border:1px solid rgba(148,163,184,.22);border-radius:12px;display:grid;grid-template-columns:28px 1fr;align-items:center;padding:0 8px;background:#111827;color:#94a3b8}
    .profile-student-search input{border:0;outline:0;background:transparent;color:#f8fafc;font:inherit;font-weight:800;min-width:0}
    .profile-student-results{display:grid;gap:5px;margin-top:7px;max-height:210px;overflow:auto}
    .profile-student-results button{border:0;border-radius:10px;padding:8px 9px;text-align:left;color:#e2e8f0;background:transparent;display:grid;cursor:pointer;font-weight:850}
    .profile-student-results button:hover{background:#111827}.profile-student-results small{color:#94a3b8;margin-top:2px}
    @media(max-width:860px){.profile-window.desktop-profile-window{left:8px!important;top:8px!important;width:calc(100vw - 16px)!important;height:calc(100vh - 78px)!important;min-width:0;min-height:0}.desktop-icons .profile-desktop-app{width:72px}}
  `;
  document.head.appendChild(style);
}

function mountDesktopShortcut() {
  const icons = document.querySelector('.desktop-icons');
  if (!icons || mountedShortcut || icons.querySelector('.profile-desktop-app')) return;
  mountedShortcut = true;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'desktop-shortcut profile-desktop-app';
  button.title = 'Profile - bấm đúp để mở hồ sơ của mình';
  button.innerHTML = `<div class="desktop-shortcut-icon profile-desktop-app-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></svg></div><span>Profile</span>`;
  button.addEventListener('dblclick', () => void openSelfProfile());
  icons.appendChild(button);
}

function injectSearch(win: HTMLElement) {
  const tabs = win.querySelector('.profile-tabs');
  if (!tabs || searchInjectedFor === tabs || tabs.querySelector('.profile-student-search')) return;
  searchInjectedFor = tabs;
  const wrap = document.createElement('div');
  wrap.className = 'profile-student-search';
  wrap.innerHTML = `<label><span>⌕</span><input placeholder="Tìm học sinh..." /></label><div class="profile-student-results"></div>`;
  tabs.prepend(wrap);
  const input = wrap.querySelector('input')!;
  const results = wrap.querySelector('.profile-student-results')!;
  input.addEventListener('input', async () => {
    const q = normalize(input.value);
    results.innerHTML = '';
    if (!q) return;
    const students = await getStudents();
    students.filter((student) => normalize(student.name).includes(q) || String(student.group).includes(q)).slice(0, 8).forEach((student) => {
      const index = String(Math.max(0, students.findIndex((item) => item.id === student.id)) + 1).padStart(2, '0');
      const item = document.createElement('button');
      item.type = 'button';
      item.innerHTML = `<span>${index} - ${student.name}</span><small>Tổ ${student.group}</small>`;
      item.addEventListener('click', () => { input.value = ''; results.innerHTML = ''; openProfile(student.id); });
      results.appendChild(item);
    });
  });
}

function ensureDock() {
  let dock = document.querySelector<HTMLButtonElement>('.profile-minimized-dock');
  if (dock) return dock;
  dock = document.createElement('button');
  dock.type = 'button';
  dock.className = 'profile-minimized-dock';
  dock.textContent = '👤 Profile';
  dock.style.display = 'none';
  document.body.appendChild(dock);
  return dock;
}

function enhanceWindow(win: HTMLElement) {
  if (windowEnhancedFor === win) return;
  windowEnhancedFor = win;
  win.classList.add('desktop-profile-window');
  const titlebar = win.querySelector<HTMLElement>('.profile-window-titlebar');
  const actions = win.querySelector<HTMLElement>('.profile-window-actions');
  if (!titlebar || !actions) return;

  if (!actions.querySelector('.profile-min-button')) {
    const min = document.createElement('button');
    min.type = 'button'; min.className = 'profile-extra-button profile-min-button'; min.title = 'Thu nhỏ'; min.textContent = '—';
    const max = document.createElement('button');
    max.type = 'button'; max.className = 'profile-extra-button profile-max-button'; max.title = 'Phóng to'; max.textContent = '□';
    actions.insertBefore(min, actions.firstChild);
    actions.insertBefore(max, actions.children[1] || null);
    const dock = ensureDock();
    min.addEventListener('click', () => { win.style.display = 'none'; dock.style.display = 'flex'; });
    dock.addEventListener('click', () => { win.style.display = ''; dock.style.display = 'none'; });
    max.addEventListener('click', () => win.classList.toggle('profile-maximized'));
  }

  let dragging: { sx: number; sy: number; x: number; y: number } | null = null;
  titlebar.addEventListener('mousedown', (event) => {
    if (event.button !== 0 || win.classList.contains('profile-maximized')) return;
    const rect = win.getBoundingClientRect();
    dragging = { sx: event.clientX, sy: event.clientY, x: rect.left, y: rect.top };
  });
  window.addEventListener('mousemove', (event) => {
    if (!dragging) return;
    const x = Math.max(0, dragging.x + event.clientX - dragging.sx);
    const y = Math.max(0, dragging.y + event.clientY - dragging.sy);
    win.classList.add('profile-positioned');
    win.style.setProperty('--profile-x', `${x}px`);
    win.style.setProperty('--profile-y', `${y}px`);
  });
  window.addEventListener('mouseup', () => { dragging = null; });
}

function scan() {
  addStyle();
  mountDesktopShortcut();
  const win = document.querySelector<HTMLElement>('.profile-window');
  if (win) { enhanceWindow(win); injectSearch(win); }
}

window.addEventListener('contextmenu', (event) => {
  const target = event.target as HTMLElement | null;
  if (target?.closest('.win-window,.profile-window')) event.preventDefault();
}, true);

window.setInterval(scan, 500);
scan();
