import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactDOM from 'react-dom/client';
import { Maximize2, Minimize2, Minus, UserRound, X } from 'lucide-react';
import ProfileApp from './apps/ProfileApp/ProfileApp';

type OpenDetail = { studentId?: string; week?: number };
type WindowPos = { x: number; y: number };

const EVENT_NAME = 'a3k64-open-profile';
const APP_KEY = 'profile';

function getTopZ() {
  return Array.from(document.querySelectorAll<HTMLElement>('.win-window'))
    .map((item) => Number(getComputedStyle(item).zIndex) || 20)
    .reduce((max, value) => Math.max(max, value), 20) + 1;
}

function readUser() {
  try {
    return JSON.parse(localStorage.getItem('a3k64-login-session-v1') || 'null')?.user || {};
  } catch {
    return {};
  }
}

function usePortalHost(selector: string, className: string) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const ensure = () => {
      const parent = document.querySelector<HTMLElement>(selector);
      if (!parent) return;
      let node = parent.querySelector<HTMLElement>(`:scope > .${className}`);
      if (!node) {
        node = document.createElement('div');
        node.className = className;
        parent.appendChild(node);
      }
      setHost(node);
    };

    ensure();
    const timer = window.setInterval(ensure, 500);
    return () => window.clearInterval(timer);
  }, [className, selector]);

  return host;
}

function ProfileNativeShell() {
  const desktopHost = usePortalHost('.desktop-icons', 'profile-native-desktop-host');
  const taskbarHost = usePortalHost('.task-center', 'profile-native-taskbar-host');
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [pos, setPos] = useState<WindowPos>({ x: 40, y: 36 });
  const [z, setZ] = useState(80);
  const [studentId, setStudentId] = useState<string | undefined>();
  const [week, setWeek] = useState<number | undefined>();
  const dragRef = useRef<{ sx: number; sy: number; x: number; y: number } | null>(null);

  const bringToFront = () => {
    setZ(getTopZ());
  };

  const openProfile = (detail?: OpenDetail) => {
    if (detail?.studentId) setStudentId(detail.studentId);
    if (detail?.week) setWeek(detail.week);
    setOpen(true);
    setMinimized(false);
    bringToFront();
    window.history.pushState({}, '', '/desktop/profile');
  };

  useEffect(() => {
    const handler = (event: Event) => openProfile((event as CustomEvent<OpenDetail>).detail || {});
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }, []);

  useEffect(() => {
    const move = (event: MouseEvent) => {
      if (!dragRef.current || maximized) return;
      setPos({
        x: Math.max(0, dragRef.current.x + event.clientX - dragRef.current.sx),
        y: Math.max(0, dragRef.current.y + event.clientY - dragRef.current.sy),
      });
    };
    const up = () => { dragRef.current = null; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [maximized]);

  const user = readUser();
  const shortcut = (
    <button
      type="button"
      className="desktop-shortcut profile-native-shortcut"
      draggable
      onDragStart={(event) => event.dataTransfer.setData('text/plain', APP_KEY)}
      onDoubleClick={() => openProfile({})}
      title="Profile - bấm đúp để mở"
    >
      <div className="desktop-shortcut-icon profile-native-shortcut-icon"><UserRound /></div>
      <span>Profile</span>
    </button>
  );

  const taskbarButton = open ? (
    <button
      type="button"
      className={`task-icon profile-native-taskbar-button ${!minimized ? 'active running-app show-badge' : 'running-app show-badge'}`}
      title="Profile"
      onClick={() => {
        if (minimized) {
          setMinimized(false);
          bringToFront();
          return;
        }
        bringToFront();
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <UserRound size={18} />
    </button>
  ) : null;

  return (
    <>
      <style>{nativeCss}</style>
      {desktopHost ? createPortal(shortcut, desktopHost) : null}
      {taskbarHost ? createPortal(taskbarButton, taskbarHost) : null}
      {open && (
        <section
          className={`win-window profile-native-window ${maximized ? 'maximized' : ''} ${minimized ? 'minimized' : ''} focused`}
          style={{ '--win-x': `${pos.x}px`, '--win-y': `${pos.y}px`, zIndex: z } as React.CSSProperties}
          onMouseDown={bringToFront}
          onContextMenu={(event) => event.preventDefault()}
        >
          <header
            className="win-titlebar"
            onMouseDown={(event) => {
              if (event.button !== 0 || maximized) return;
              event.preventDefault();
              dragRef.current = { sx: event.clientX, sy: event.clientY, x: pos.x, y: pos.y };
              bringToFront();
            }}
            onDoubleClick={() => setMaximized((value) => !value)}
          >
            <div className="title-left">
              <div className="title-icon"><UserRound size={17} /></div>
              <strong>Profile</strong>
            </div>
            <div className="window-actions" onMouseDown={(event) => event.stopPropagation()}>
              <button type="button" title="Thu nhỏ" onClick={() => setMinimized(true)}><Minus size={16} /></button>
              <button type="button" title={maximized ? 'Khôi phục' : 'Phóng to'} onClick={() => setMaximized((value) => !value)}>
                {maximized ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
              <button className="close" type="button" title="Đóng" onClick={() => setOpen(false)}><X size={16} /></button>
            </div>
          </header>
          <div className="win-body settings-mode profile-native-body">
            <ProfileApp userName={user.displayName || user.hoten || user.name} userEmail={user.email} requestedStudentId={studentId} requestedWeek={week} />
          </div>
        </section>
      )}
    </>
  );
}

const nativeCss = `
.profile-native-desktop-host,.profile-native-taskbar-host{display:contents}
.profile-native-shortcut{background:transparent!important;border-radius:14px!important}
.profile-native-shortcut .profile-native-shortcut-icon{background:transparent!important;color:#ef4444!important;box-shadow:none!important;border:0!important}
.profile-native-shortcut .profile-native-shortcut-icon svg{fill:none!important;stroke:currentColor!important;stroke-width:2.35!important;width:34px!important;height:34px!important}
.profile-native-shortcut:hover .profile-native-shortcut-icon{background:rgba(239,68,68,.10)!important}
.profile-native-taskbar-button{position:relative}.profile-native-taskbar-button.running-app::after{content:'';position:absolute;left:50%;bottom:3px;transform:translateX(-50%);width:5px;height:5px;border-radius:999px;background:var(--desktop-accent,#2563eb)}
.profile-native-window{width:min(1180px,calc(100vw - 76px))!important;height:min(760px,calc(100vh - 116px))!important;min-width:760px!important;min-height:520px!important;resize:both!important;overflow:hidden!important;max-width:none!important;max-height:none!important}
.profile-native-window.maximized{left:10px!important;top:10px!important;right:10px!important;bottom:62px!important;width:auto!important;height:auto!important;min-width:0!important;min-height:0!important;max-width:none!important;max-height:none!important;transform:none!important;translate:none!important;resize:none!important;border-radius:18px!important}
.profile-native-window .win-titlebar{height:46px!important;min-height:46px!important;max-height:46px!important}.profile-native-window .title-left{gap:9px!important}.profile-native-window .title-icon{background:transparent!important;border:0!important;box-shadow:none!important;color:#ef4444!important}.profile-native-window .title-icon svg{stroke-width:2.25!important}
.profile-native-body{height:calc(100% - 46px)!important;display:block!important;overflow:hidden!important;padding:0!important}.profile-native-body::before{display:none!important}
.profile-native-body .profile-app-shell{height:100%!important;min-height:0!important}
.profile-native-window.maximized .profile-native-body{height:calc(100% - 46px)!important}
@media(max-width:860px){.profile-native-window{left:auto!important;top:auto!important;width:calc(100vw - 16px)!important;height:calc(100vh - 78px)!important;min-width:0!important;min-height:0!important}.profile-native-window.maximized{left:8px!important;top:8px!important;right:8px!important;bottom:70px!important;width:auto!important;height:auto!important}}
`;

const root = document.createElement('div');
root.id = 'a3k64-profile-native-shell-root';
document.body.appendChild(root);
ReactDOM.createRoot(root).render(<ProfileNativeShell />);
