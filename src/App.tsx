import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Gauge,
  Home,
  ListChecks,
  Lock,
  LogOut,
  Medal,
  Menu,
  Minus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserRound,
  Users,
  X,
  Maximize2,
  Minimize2,
} from "lucide-react";
import Login from "./components/Login";
import { SettingsApp, CustomContextMenu } from "./apps/SettingsApp";
import ScoreboardApp from "./apps/ScoreboardApp/ScoreboardApp";
import ProfileApp from "./apps/ProfileApp/ProfileApp";

type DesktopUser = {
  uid?: string;
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
  provider?: string;
  role?: "gvcn" | "lop_truong" | "bi_thu" | "hoc_sinh" | string;
};

type AppKey = "dashboard" | "profile" | "quickScore" | "ranking" | "contests" | "students" | "settings";

type DesktopApp = {
  key: AppKey;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  path: string;
  roles?: string[];
};

type WindowState = {
  key: AppKey;
  x: number;
  y: number;
  z: number;
  minimized: boolean;
  maximized: boolean;
};

type TaskbarSettings = {
  searchMode: "icon" | "box";
  taskView: boolean;
  widgets: boolean;
  resume: boolean;
  alignment: "left" | "center";
  autoHide: boolean;
  badges: boolean;
};

type DesktopThemeMode = "dark" | "light" | "auto";
type ResolvedDesktopTheme = "dark" | "light";
type ProfileRequest = { studentId?: string; week?: number };

const DEFAULT_TASKBAR_SETTINGS: TaskbarSettings = {
  searchMode: "box",
  taskView: true,
  widgets: false,
  resume: true,
  alignment: "center",
  autoHide: false,
  badges: true,
};

const ACCENT_COLORS: Record<string, string> = {
  blue: "#2563eb",
  violet: "#7c3aed",
  pink: "#db2777",
  green: "#059669",
  amber: "#d97706",
  red: "#dc2626",
};

const DESKTOP_APPS: DesktopApp[] = [
  {
    key: "dashboard",
    title: "Bảng điểm A3",
    subtitle: "Tổng quan điểm thi đua lớp",
    icon: Gauge,
    path: "/desktop/bang-diem-a3",
  },
  {
    key: "settings",
    title: "Cài đặt",
    subtitle: "Cá nhân hóa, màu sắc và thanh taskbar",
    icon: Settings,
    path: "/desktop/cai-dat",
  },
  {
    key: "profile",
    title: "Profile",
    subtitle: "Hồ sơ học sinh",
    icon: UserRound,
    path: "/desktop/profile",
  },
  {
    key: "quickScore",
    title: "Nhập điểm nhanh",
    subtitle: "Cộng/trừ điểm nề nếp và học tập",
    icon: ClipboardList,
    path: "/desktop/nhap-diem-nhanh",
  },
  {
    key: "ranking",
    title: "Xếp hạng",
    subtitle: "Top tổ, cá nhân theo tuần/tháng",
    icon: Medal,
    path: "/desktop/xep-hang",
  },
  {
    key: "contests",
    title: "Cuộc thi hiện tại",
    subtitle: "Chỉ GVCN, lớp trưởng, bí thư",
    icon: Trophy,
    path: "/desktop/cuoc-thi-hien-tai",
    roles: ["gvcn", "lop_truong", "bi_thu"],
  },
  {
    key: "students",
    title: "Sơ đồ lớp",
    subtitle: "Học sinh, tổ và chức vụ",
    icon: Users,
    path: "/desktop/so-do-lop",
  },
];

const DESKTOP_SHORTCUTS: AppKey[] = ["dashboard", "settings", "profile"];

const QUICK_STATS = [
  { label: "Tổng điểm tuần", value: "+245", note: "Tăng 32 điểm", icon: Sparkles },
  { label: "Vi phạm", value: "08", note: "Cần xử lý", icon: ListChecks },
  { label: "Tổ dẫn đầu", value: "Tổ 2", note: "Ổn định", icon: Trophy },
];

function readTaskbarSettings(): TaskbarSettings {
  try {
    return {
      ...DEFAULT_TASKBAR_SETTINGS,
      ...JSON.parse(localStorage.getItem("taskbar-settings") || "{}"),
    };
  } catch {
    return DEFAULT_TASKBAR_SETTINGS;
  }
}

function normalizeThemeMode(value: string | null): DesktopThemeMode | null {
  if (!value) return null;
  const normalized = value.toLowerCase().trim();
  if (["light", "sang", "sáng"].includes(normalized)) return "light";
  if (["dark", "toi", "tối"].includes(normalized)) return "dark";
  if (["auto", "system", "he-thong", "hệ thống", "hethong"].includes(normalized)) return "auto";
  return null;
}

function getDesktopThemeMode(): DesktopThemeMode {
  if (typeof window === "undefined") return "dark";
  const keys = ["login-theme", "login-theme-mode", "desktop-theme", "theme-mode", "theme", "app-theme", "color-mode"];
  for (const key of keys) {
    const mode = normalizeThemeMode(localStorage.getItem(key));
    if (mode) return mode;
  }
  return "dark";
}

function resolveDesktopTheme(): ResolvedDesktopTheme {
  if (typeof window === "undefined") return "dark";
  const mode = getDesktopThemeMode();
  if (mode === "light") return "light";
  if (mode === "auto") return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  return "dark";
}

function isHexColor(value: string | null) {
  return !!value && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

function normalizeAccentValue(value: string | null) {
  if (!value) return null;
  const raw = value.trim();
  if (isHexColor(raw)) return raw;
  return ACCENT_COLORS[raw.toLowerCase()] || null;
}

function getDesktopAccent() {
  if (typeof window === "undefined") return ACCENT_COLORS.blue;
  const loginAccent = localStorage.getItem("login-accent");
  const loginCustomAccent = localStorage.getItem("login-custom-accent");
  if (loginAccent?.toLowerCase() === "custom" && normalizeAccentValue(loginCustomAccent)) {
    return normalizeAccentValue(loginCustomAccent) || ACCENT_COLORS.blue;
  }
  const keys = [
    "login-accent",
    "login-accent-color",
    "accent-color",
    "accentColor",
    "accent",
    "desktop-accent",
    "desktop-accent-color",
    "theme-accent",
    "login-custom-accent",
    "custom-accent",
    "customAccent",
    "desktop-custom-accent",
  ];
  for (const key of keys) {
    const color = normalizeAccentValue(localStorage.getItem(key));
    if (color) return color;
  }
  return ACCENT_COLORS.blue;
}

function getInitials(name?: string | null) {
  if (!name) return "A3";
  const parts = name.trim().split(/\s+/).slice(-2);
  return parts.map((part) => part[0]?.toUpperCase()).join("") || "A3";
}

function canOpenApp(app: DesktopApp, user: DesktopUser) {
  if (!app.roles?.length) return true;
  return app.roles.includes(String(user.role || "hoc_sinh"));
}

function getApp(key: AppKey) {
  return DESKTOP_APPS.find((app) => app.key === key) || DESKTOP_APPS[0];
}

function GenericAppContent({ active }: { active: DesktopApp }) {
  const ActiveIcon = active.icon;
  return (
    <section className="win-content">
      <div className="content-hero">
        <div className="content-hero-top">
          <div>
            <span className="hero-chip"><ActiveIcon size={16} /> {active.title}</span>
            <h1>12A3 - Quản lý thi đua</h1>
            <p>{active.subtitle}. Đường dẫn hiện tại: <b>{active.path}</b></p>
          </div>
          <button type="button" className="hero-action">Tạo mới</button>
        </div>
      </div>
      <div className="stat-grid">
        {QUICK_STATS.map((stat) => {
          const Icon = stat.icon;
          return <article className="stat-card" key={stat.label}><div className="stat-card-head"><span>{stat.label}</span><Icon size={18} /></div><strong>{stat.value}</strong><span>{stat.note}</span></article>;
        })}
      </div>
      <div className="panel-grid">
        <section className="win-panel">
          <div className="panel-header"><div><h2>Hoạt động gần đây</h2><span>Cập nhật điểm mới nhất</span></div><ChevronRight size={18} /></div>
          <div className="table-like">
            <div className="table-row"><div><strong>Phát biểu xây dựng bài</strong><span>Học tập · vừa xong</span></div><div className="score-pill">+5</div></div>
            <div className="table-row"><div><strong>Không đeo thẻ học sinh</strong><span>Nề nếp · 15 phút trước</span></div><div className="score-pill negative">-5</div></div>
            <div className="table-row"><div><strong>Kiểm tra bài cũ đạt 10</strong><span>Học tập · hôm nay</span></div><div className="score-pill">+10</div></div>
          </div>
        </section>
        <section className="win-panel">
          <div className="panel-header"><div><h2>Lịch & thông báo</h2><span>Nhắc việc trong tuần</span></div><Bell size={18} /></div>
          <div className="table-like">
            <div className="table-row"><div><strong>Tổng kết thi đua tuần</strong><span>Thứ 7 · 17:00</span></div><CalendarDays size={18} /></div>
            <div className="table-row"><div><strong>Kiểm tra danh sách vi phạm</strong><span>Lớp trưởng / Bí thư</span></div><ShieldCheck size={18} /></div>
          </div>
        </section>
      </div>
    </section>
  );
}

function WindowsDesktop({ user, onLogout }: { user: DesktopUser; onLogout: () => void }) {
  const [windows, setWindows] = useState<WindowState[]>([]);
  const [focusedKey, setFocusedKey] = useState<AppKey | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [lockedMessage, setLockedMessage] = useState("");
  const [accent, setAccent] = useState(getDesktopAccent());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedDesktopTheme>(resolveDesktopTheme);
  const [taskbarSettings, setTaskbarSettings] = useState<TaskbarSettings>(readTaskbarSettings);
  const [taskAppMenu, setTaskAppMenu] = useState<{ x: number; y: number; appKey: AppKey } | null>(null);
  const [pinnedApps, setPinnedApps] = useState<AppKey[]>(() => {
    try { return JSON.parse(localStorage.getItem("pinned-apps") || "[]"); } catch { return []; }
  });
  const [now, setNow] = useState(new Date());
  const [iconsCovered, setIconsCovered] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [profileRequest, setProfileRequest] = useState<ProfileRequest>({});
  const zCounter = useRef(20);
  const desktopIconsRef = useRef<HTMLDivElement | null>(null);
  const menuApp = taskAppMenu ? getApp(taskAppMenu.appKey) : null;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const preventSelectAll = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a" && !isTypingTarget) event.preventDefault();
    };
    window.addEventListener("keydown", preventSelectAll);
    return () => window.removeEventListener("keydown", preventSelectAll);
  }, []);

  useEffect(() => {
    const syncFocusMode = () => setFocusMode(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", syncFocusMode);
    return () => document.removeEventListener("fullscreenchange", syncFocusMode);
  }, []);

  useEffect(() => {
    const syncAccent = () => setAccent(getDesktopAccent());
    window.addEventListener("storage", syncAccent);
    window.addEventListener("accent-change", syncAccent);
    window.addEventListener("login-accent-change", syncAccent);
    window.addEventListener("appearance-change", syncAccent);
    return () => {
      window.removeEventListener("storage", syncAccent);
      window.removeEventListener("accent-change", syncAccent);
      window.removeEventListener("login-accent-change", syncAccent);
      window.removeEventListener("appearance-change", syncAccent);
    };
  }, []);

  useEffect(() => {
    const syncTheme = () => setResolvedTheme(resolveDesktopTheme());
    const mediaQuery = window.matchMedia?.("(prefers-color-scheme: light)");
    syncTheme();
    window.addEventListener("storage", syncTheme);
    window.addEventListener("desktop-theme-change", syncTheme);
    window.addEventListener("login-theme-change", syncTheme);
    window.addEventListener("appearance-change", syncTheme);
    mediaQuery?.addEventListener?.("change", syncTheme);
    return () => {
      window.removeEventListener("storage", syncTheme);
      window.removeEventListener("desktop-theme-change", syncTheme);
      window.removeEventListener("login-theme-change", syncTheme);
      window.removeEventListener("appearance-change", syncTheme);
      mediaQuery?.removeEventListener?.("change", syncTheme);
    };
  }, []);

  useEffect(() => {
    const update = () => setTaskbarSettings(readTaskbarSettings());
    const customUpdate = (event: Event) => setTaskbarSettings({ ...DEFAULT_TASKBAR_SETTINGS, ...readTaskbarSettings(), ...(event as CustomEvent<Partial<TaskbarSettings>>).detail });
    window.addEventListener("storage", update);
    window.addEventListener("taskbar-settings-change", customUpdate);
    return () => {
      window.removeEventListener("storage", update);
      window.removeEventListener("taskbar-settings-change", customUpdate);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("pinned-apps", JSON.stringify(pinnedApps));
  }, [pinnedApps]);

  useEffect(() => {
    const updateIconsCovered = () => {
      const icons = desktopIconsRef.current;
      if (!icons) return setIconsCovered(false);
      const iconRect = icons.getBoundingClientRect();
      const visibleWindows = Array.from(document.querySelectorAll<HTMLElement>(".win-window:not(.minimized)"));
      setIconsCovered(visibleWindows.some((win) => {
        const rect = win.getBoundingClientRect();
        return !(rect.right < iconRect.left || rect.left > iconRect.right || rect.bottom < iconRect.top || rect.top > iconRect.bottom);
      }));
    };
    updateIconsCovered();
    window.addEventListener("resize", updateIconsCovered);
    return () => window.removeEventListener("resize", updateIconsCovered);
  }, [windows]);

  const visibleClock = now.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  const visibleDate = now.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

  const bringToFront = (appKey: AppKey, restore = true) => {
    zCounter.current += 1;
    setWindows((current) => current.map((item) => item.key === appKey ? { ...item, minimized: restore ? false : item.minimized, z: zCounter.current } : item));
    setFocusedKey(appKey);
  };

  const openApp = (app: DesktopApp) => {
    if (!canOpenApp(app, user)) {
      setLockedMessage("Mục này chỉ dành cho gvcn, lop_truong hoặc bi_thu.");
      window.setTimeout(() => setLockedMessage(""), 2400);
      return;
    }
    setStartOpen(false);
    setSearchOpen(false);
    setTaskAppMenu(null);
    const exists = windows.some((item) => item.key === app.key);
    zCounter.current += 1;
    if (exists) {
      setWindows((current) => current.map((item) => item.key === app.key ? { ...item, minimized: false, z: zCounter.current } : item));
    } else {
      const offset = Math.min(windows.length * 28, 110);
      setWindows((current) => [...current, { key: app.key, x: offset, y: offset, z: zCounter.current, minimized: false, maximized: false }]);
    }
    setFocusedKey(app.key);
    window.history.pushState({}, "", app.path);
  };

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = ((event as CustomEvent<ProfileRequest>).detail || {}) as ProfileRequest;
      setProfileRequest(detail);
      openApp(getApp("profile"));
    };
    window.addEventListener("a3k64-open-profile", handler);
    return () => window.removeEventListener("a3k64-open-profile", handler);
  }, [windows, user]);

  const toggleFocusMode = async () => {
    setStartOpen(false);
    setSearchOpen(false);
    setTaskAppMenu(null);
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
      else await document.exitFullscreen?.();
    } catch {
      setFocusMode((value) => !value);
    }
  };

  const openSettings = () => openApp(getApp("settings"));

  const closeWindow = (appKey: AppKey) => {
    setTaskAppMenu(null);
    const remaining = windows.filter((item) => item.key !== appKey);
    setWindows(remaining);
    if (focusedKey === appKey) {
      const nextFocus = remaining.filter((item) => !item.minimized).sort((a, b) => b.z - a.z)[0] || null;
      setFocusedKey(nextFocus?.key || null);
      window.history.pushState({}, "", nextFocus ? getApp(nextFocus.key).path : "/desktop");
    }
  };

  const minimizeWindow = (appKey: AppKey) => {
    setTaskAppMenu(null);
    const nextWindows = windows.map((item) => item.key === appKey ? { ...item, minimized: true } : item);
    setWindows(nextWindows);
    if (focusedKey === appKey) {
      const nextFocus = nextWindows.filter((item) => !item.minimized).sort((a, b) => b.z - a.z)[0] || null;
      setFocusedKey(nextFocus?.key || null);
      window.history.pushState({}, "", nextFocus ? getApp(nextFocus.key).path : "/desktop");
    }
  };

  const toggleMaximize = (appKey: AppKey) => {
    bringToFront(appKey, true);
    setWindows((current) => current.map((item) => item.key === appKey ? { ...item, maximized: !item.maximized } : item));
  };

  const updateWindowPos = (appKey: AppKey, x: number, y: number) => {
    setWindows((current) => current.map((item) => item.key === appKey ? { ...item, x, y } : item));
  };

  const handleTitlebarMouseDown = (event: React.MouseEvent<HTMLElement>, win: WindowState) => {
    if (win.maximized || event.button !== 0) return;
    event.preventDefault();
    bringToFront(win.key, true);
    const startX = event.clientX;
    const startY = event.clientY;
    const startPos = { x: win.x, y: win.y };
    const handleMouseMove = (moveEvent: MouseEvent) => updateWindowPos(win.key, startPos.x + moveEvent.clientX - startX, startPos.y + moveEvent.clientY - startY);
    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const togglePinnedApp = (appKey: AppKey) => {
    setPinnedApps((current) => current.includes(appKey) ? current.filter((key) => key !== appKey) : [...current, appKey]);
    setTaskAppMenu(null);
  };

  const handleTaskbarAppClick = (appKey: AppKey) => {
    const win = windows.find((item) => item.key === appKey);
    if (win) {
      bringToFront(appKey, true);
      window.history.pushState({}, "", getApp(appKey).path);
      return;
    }
    openApp(getApp(appKey));
  };

  const taskbarItems = useMemo(() => Array.from(new Set([...pinnedApps, ...windows.map((item) => item.key)])), [pinnedApps, windows]);

  return (
    <main className={`win-root theme-${resolvedTheme} ${focusMode ? "focus-mode" : ""}`} style={{ "--desktop-accent": accent } as React.CSSProperties}>
      <style>{desktopCss}</style>
      <section className="win-desktop login-push-enter">
        <div ref={desktopIconsRef} className={`desktop-icons ${iconsCovered ? "covered" : ""}`}>
          {DESKTOP_APPS.filter((app) => DESKTOP_SHORTCUTS.includes(app.key)).map((app) => {
            const Icon = app.icon;
            const locked = !canOpenApp(app, user);
            return (
              <button key={app.key} type="button" className="desktop-shortcut" draggable onDragStart={(event) => event.dataTransfer.setData("text/plain", app.key)} onDoubleClick={() => openApp(app)} title={locked ? "Bạn chưa có quyền xem mục này" : `${app.title} - bấm đúp để mở`}>
                <div className="desktop-shortcut-icon">{locked ? <Lock /> : <Icon />}</div>
                <span>{app.title}</span>
              </button>
            );
          })}
        </div>

        {windows.length === 0 && <div className="win-empty-note"><UserRound size={40} color="var(--desktop-accent)" /><h1>Desktop 12A3</h1><p>Bấm đúp vào icon bên trái, hoặc mở ứng dụng từ Start menu.</p></div>}

        {windows.map((win) => {
          const app = getApp(win.key);
          const ActiveIcon = app.icon;
          const isFocused = focusedKey === win.key;
          const fullBodyApp = app.key === "settings" || app.key === "dashboard" || app.key === "profile";
          return (
            <section key={win.key} className={`win-window ${win.maximized ? "maximized" : ""} ${win.minimized ? "minimized" : ""} ${isFocused ? "focused" : ""}`} style={{ "--win-x": `${win.x}px`, "--win-y": `${win.y}px`, zIndex: win.z } as React.CSSProperties} onMouseDown={() => bringToFront(win.key, true)} onContextMenu={(event) => event.preventDefault()}>
              <header className="win-titlebar" onMouseDown={(event) => handleTitlebarMouseDown(event, win)} onDoubleClick={() => toggleMaximize(win.key)}>
                <div className="title-left"><div className="title-icon"><ActiveIcon size={17} /></div><strong>{app.title}</strong></div>
                <div className="window-actions" onMouseDown={(event) => event.stopPropagation()}>
                  <button type="button" title="Thu nhỏ" onClick={() => minimizeWindow(win.key)}><Minus size={16} /></button>
                  <button type="button" title={win.maximized ? "Khôi phục" : "Phóng to"} onClick={() => toggleMaximize(win.key)}>{win.maximized ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>
                  <button className="close" type="button" title="Đóng" onClick={() => closeWindow(win.key)}><X size={16} /></button>
                </div>
              </header>

              <div className={`win-body ${fullBodyApp ? "settings-mode" : ""}`}>
                {!fullBodyApp && (
                  <aside className="win-sidebar">
                    <div className="user-card"><div className="avatar">{user.photoURL ? <img src={user.photoURL} alt="Avatar" /> : getInitials(user.displayName)}</div><div style={{ minWidth: 0 }}><strong>{user.displayName || "Người dùng 12A3"}</strong><span>{user.email || user.role || "Đang đăng nhập"}</span></div></div>
                    <nav className="side-nav" aria-label="Ứng dụng">
                      {DESKTOP_APPS.map((navApp) => {
                        const Icon = navApp.icon;
                        const locked = !canOpenApp(navApp, user);
                        return <button key={navApp.key} type="button" className={`side-item ${app.key === navApp.key ? "active" : ""} ${locked ? "locked" : ""}`} style={{ "--app-accent": accent } as React.CSSProperties} onClick={() => openApp(navApp)}><div className="side-item-icon">{locked ? <Lock size={16} /> : <Icon size={16} />}</div><div style={{ minWidth: 0 }}><strong>{navApp.title}</strong><span>{navApp.subtitle}</span></div></button>;
                      })}
                    </nav>
                    <div className="side-bottom"><button type="button" className="logout-button" onClick={onLogout}><LogOut size={16} /> Đăng xuất</button></div>
                  </aside>
                )}

                {app.key === "settings" ? (
                  <SettingsApp accent={accent} setAccent={setAccent} userEmail={user.email} userName={user.displayName} userPhotoURL={user.photoURL} />
                ) : app.key === "dashboard" ? (
                  <ScoreboardApp userRole={user.role} />
                ) : app.key === "profile" ? (
                  <ProfileApp userName={user.displayName} userEmail={user.email} requestedStudentId={profileRequest.studentId} requestedWeek={profileRequest.week} />
                ) : (
                  <GenericAppContent active={app} />
                )}
              </div>
            </section>
          );
        })}
      </section>

      <nav className={`taskbar align-${taskbarSettings.alignment} ${taskbarSettings.autoHide ? "auto-hide" : ""}`} aria-label="Windows 11 taskbar" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const appKey = event.dataTransfer.getData("text/plain") as AppKey; if (DESKTOP_APPS.some((app) => app.key === appKey) && !pinnedApps.includes(appKey)) setPinnedApps((current) => [...current, appKey]); }}>
        <div className="task-left" aria-hidden="true" />
        <div className="task-center">
          <button type="button" className="task-start" onClick={() => { setSearchOpen(false); setStartOpen((value) => !value); }} title="Start"><Menu size={19} /></button>
          {taskbarSettings.searchMode === "icon" ? <button type="button" className="task-icon" onClick={() => { setStartOpen(false); setSearchOpen((value) => !value); }} title="Tìm kiếm"><Search size={17} /></button> : <button type="button" className="task-search" onClick={() => { setStartOpen(false); setSearchOpen((value) => !value); }}><Search size={16} /><span>Tìm kiếm</span></button>}
          <button type="button" className={`task-focus-switch ${focusMode ? "on" : ""}`} onClick={toggleFocusMode} title={focusMode ? "Tắt tập trung toàn màn hình" : "Bật tập trung toàn màn hình"} aria-pressed={focusMode}><span className="task-focus-knob" /><span className="task-focus-text">{focusMode ? "ON" : "OFF"}</span></button>
          {taskbarSettings.taskView && <button type="button" className="task-icon" title="Chế độ xem tác vụ"><ListChecks size={17} /></button>}
          {taskbarSettings.widgets && <button type="button" className="task-icon" title="Tiện ích"><Sparkles size={17} /></button>}
          {taskbarSettings.resume && <button type="button" className="task-icon" title="Tiếp tục"><Home size={17} /></button>}
          {taskbarItems.map((appKey) => {
            const taskApp = getApp(appKey);
            const TaskIcon = taskApp.icon;
            const isOpen = windows.some((item) => item.key === appKey);
            const taskWindow = windows.find((item) => item.key === appKey);
            const isFocused = focusedKey === appKey && !taskWindow?.minimized;
            const isPinned = pinnedApps.includes(appKey);
            return <button key={appKey} type="button" className={`task-icon ${isFocused ? "active" : ""} ${isOpen ? "running-app" : ""} ${isPinned ? "pinned-app" : ""} ${taskbarSettings.badges && isOpen ? "show-badge" : ""}`} title={taskApp.title} onClick={() => handleTaskbarAppClick(appKey)} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); setTaskAppMenu({ x: event.clientX, y: event.clientY, appKey }); }}><TaskIcon size={18} /></button>;
          })}
        </div>
        <div className="task-right"><span>{visibleClock}</span><span>{visibleDate}</span></div>
      </nav>

      {startOpen && <section className={`start-menu align-${taskbarSettings.alignment}`}><div className="start-header"><h2>Đã ghim</h2></div><div className="start-app-grid">{DESKTOP_APPS.map((app) => { const Icon = app.icon; const locked = !canOpenApp(app, user); return <button key={app.key} type="button" className="start-app" onClick={() => openApp(app)}><div className="start-app-icon">{locked ? <Lock size={18} /> : <Icon size={18} />}</div><span>{app.title}</span></button>; })}</div><div className="start-footer"><div className="user-card" style={{ padding: 0, background: "transparent" }}><div className="avatar" style={{ width: 34, height: 34, borderRadius: 12 }}>{getInitials(user.displayName)}</div><strong>{user.displayName || "12A3"}</strong></div><button type="button" className="logout-button" onClick={onLogout} style={{ width: 118 }}><LogOut size={15} /> Thoát</button></div></section>}

      {searchOpen && <section className={`search-panel align-${taskbarSettings.alignment}`}><div className="search-header"><h2>Tìm kiếm</h2></div><div className="table-like">{DESKTOP_APPS.map((app) => { const Icon = app.icon; return <button key={app.key} type="button" className="side-item" style={{ "--app-accent": accent } as React.CSSProperties} onClick={() => openApp(app)}><div className="side-item-icon"><Icon size={16} /></div><div><strong>{app.title}</strong><span>{app.subtitle}</span></div></button>; })}</div></section>}

      {taskAppMenu && menuApp && <div className="task-app-menu" style={{ left: taskAppMenu.x, top: taskAppMenu.y }} onClick={(event) => event.stopPropagation()}><button type="button" onClick={() => togglePinnedApp(menuApp.key)}><span>📌</span>{pinnedApps.includes(menuApp.key) ? "Bỏ ghim khỏi taskbar" : "Ghim vào taskbar"}</button>{windows.some((item) => item.key === menuApp.key) && <button type="button" onClick={() => { closeWindow(menuApp.key); setTaskAppMenu(null); }}><span>×</span>Đóng cửa sổ</button>}</div>}
      {lockedMessage && <div className="toast">{lockedMessage}</div>}
      <CustomContextMenu onRefresh={() => window.location.reload()} onOpenSettings={openSettings} />
    </main>
  );
}

export default function App() {
  const [user, setUser] = useState<DesktopUser | null>(null);
  const [leavingLogin, setLeavingLogin] = useState(false);

  const handleLogin = (loginUser: DesktopUser) => {
    setLeavingLogin(true);
    window.setTimeout(() => {
      setUser({ ...loginUser, role: loginUser.role || "hoc_sinh" });
      window.history.pushState({}, "", "/desktop");
      setLeavingLogin(false);
    }, 520);
  };

  const handleLogout = () => {
    window.history.pushState({}, "", "/");
    setUser(null);
  };

  if (!user) {
    return <div className={leavingLogin ? "login-exit-push" : ""}><style>{`.login-exit-push{animation:loginExitPush .54s cubic-bezier(.2,.8,.2,1) both;transform-origin:center center}@keyframes loginExitPush{0%{opacity:1;transform:translateY(0) scale(1);filter:blur(0)}100%{opacity:0;transform:translateY(-34px) scale(1.035);filter:blur(12px)}}`}</style><Login onLogin={handleLogin} /></div>;
  }

  return <WindowsDesktop user={user} onLogout={handleLogout} />;
}

const desktopCss = `
  .win-root,.win-root *{-webkit-user-select:none;user-select:none;box-sizing:border-box}.win-root input,.win-root textarea,.win-root [contenteditable="true"]{-webkit-user-select:text;user-select:text}
  .win-root{min-height:100vh;overflow:hidden;color:#f8fafc;font-family:"Segoe UI",system-ui,-apple-system,BlinkMacSystemFont,Arial,sans-serif;background:radial-gradient(circle at 18% 12%,color-mix(in srgb,var(--desktop-accent) 34%,transparent),transparent 32%),radial-gradient(circle at 86% 24%,rgba(168,85,247,.18),transparent 28%),linear-gradient(135deg,#07111f 0%,#111827 48%,#020617 100%)}
  .login-push-enter{animation:desktopPushIn .64s cubic-bezier(.2,.8,.2,1) both;transform-origin:center bottom}@keyframes desktopPushIn{0%{opacity:0;transform:translateY(34px) scale(.965);filter:blur(12px)}60%{opacity:1;filter:blur(0)}100%{opacity:1;transform:translateY(0) scale(1);filter:blur(0)}}
  .win-desktop{min-height:100vh;padding:28px 28px 72px;position:relative}.desktop-icons{width:96px;display:grid;grid-template-columns:1fr;gap:22px;position:absolute;left:26px;top:28px;z-index:1;transition:opacity .18s ease,filter .18s ease}.desktop-icons.covered{opacity:0;filter:blur(8px);pointer-events:none}
  .desktop-shortcut{border:0;padding:8px 6px;border-radius:14px;color:#f8fafc;background:transparent;cursor:pointer;text-align:center;transition:.16s ease}.desktop-shortcut:hover{background:#111827}.desktop-shortcut-icon{width:48px;height:48px;margin:0 auto 6px;display:grid;place-items:center;color:var(--desktop-accent);background:transparent}.desktop-shortcut-icon svg{width:34px;height:34px;stroke-width:2.2;filter:drop-shadow(0 8px 18px color-mix(in srgb,var(--desktop-accent) 34%,transparent))}.desktop-shortcut span{display:block;font-size:12px;font-weight:800;line-height:1.18;text-shadow:0 2px 8px rgba(0,0,0,.55)}
  .win-empty-note{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);width:min(440px,calc(100vw - 170px));border:1px solid #273244;border-radius:26px;padding:24px;color:#dbeafe;text-align:center;background:#0b1220}.win-empty-note h1{margin:12px 0 8px;font-size:26px;letter-spacing:-.04em}.win-empty-note p{margin:0;color:#94a3b8;line-height:1.55}
  .win-window{position:absolute;left:calc(50% - min(540px,calc((100vw - 176px)/2)));top:28px;width:min(1080px,calc(100vw - 176px));height:min(680px,calc(100vh - 104px));min-height:560px;border:1px solid #273244;border-radius:22px;overflow:hidden;background:#0b1220;box-shadow:0 34px 100px rgba(0,0,0,.46);transform:translate(var(--win-x,0px),var(--win-y,0px));animation:windowOpen .18s ease both;will-change:transform}.win-window.focused{border-color:color-mix(in srgb,var(--desktop-accent) 48%,#273244)}.win-window.minimized{display:none}.win-window.maximized{position:fixed;left:0;top:0;width:100vw;height:calc(100vh - 58px);min-height:0;border-radius:0;transform:none!important}@keyframes windowOpen{from{opacity:0}to{opacity:1}}
  .win-titlebar{height:46px;display:grid;grid-template-columns:1fr auto;align-items:center;border-bottom:1px solid #273244;background:#0b1220;cursor:move;user-select:none}.title-left{display:flex;align-items:center;gap:10px;padding-left:14px;min-width:0}.title-icon{width:28px;height:28px;display:grid;place-items:center;border-radius:9px;background:var(--desktop-accent);color:#fff}.title-left strong{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.window-actions{display:flex;height:100%;cursor:default}.window-actions button{width:46px;border:0;color:#e2e8f0;background:transparent;display:grid;place-items:center;cursor:pointer}.window-actions button:hover{background:#172033}.window-actions button.close{margin:7px 8px 7px 0;width:32px;height:32px;border-radius:9px;background:rgba(239,68,68,.92)}.window-actions button.close:hover{background:#dc2626}
  .win-body{height:calc(100% - 46px);display:grid;grid-template-columns:240px 1fr;min-height:0}.win-body.settings-mode{grid-template-columns:1fr}.win-sidebar{border-right:1px solid #273244;background:#050914;padding:14px;display:flex;flex-direction:column;gap:12px;min-height:0}.user-card{display:flex;align-items:center;gap:10px;padding:10px;border-radius:18px;background:#111827}.avatar{width:42px;height:42px;border-radius:14px;display:grid;place-items:center;color:#fff;font-weight:900;background:linear-gradient(135deg,var(--desktop-accent),color-mix(in srgb,var(--desktop-accent) 58%,#7c3aed));overflow:hidden}.avatar img{width:100%;height:100%;object-fit:cover}.user-card strong,.user-card span{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.user-card span{color:#94a3b8;font-size:12px;margin-top:2px}.side-nav{display:grid;gap:6px;overflow:auto;padding-right:2px}.side-item{border:0;border-radius:15px;padding:10px;display:flex;align-items:center;gap:10px;color:#dbeafe;background:transparent;cursor:pointer;text-align:left;transition:.16s ease}.side-item.active,.side-item:hover{background:#111827}.side-item.locked{opacity:.56}.side-item-icon{width:32px;height:32px;border-radius:11px;display:grid;place-items:center;background:var(--app-accent);flex:0 0 auto;color:#fff}.side-item strong,.side-item span{display:block;min-width:0}.side-item span{color:#94a3b8;font-size:12px;margin-top:2px}.side-bottom{margin-top:auto;display:grid;gap:8px}.logout-button{height:40px;border:1px solid #273244;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;gap:8px;color:#fecaca;background:#25111a;cursor:pointer;font-weight:800}
  .win-content{min-width:0;min-height:0;overflow:auto;padding:22px;background:#050914}.content-hero{border:1px solid #273244;border-radius:24px;padding:22px;background:#111827}.content-hero-top{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}.content-hero h1{margin:12px 0 8px;font-size:clamp(26px,4vw,42px);letter-spacing:-.05em;line-height:1}.content-hero p{margin:0;color:#b6c4d8;line-height:1.6}.hero-chip{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:999px;color:#dbeafe;background:#0b1220;font-size:13px;font-weight:800}.hero-action{height:40px;border:0;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;color:#fff;background:var(--desktop-accent);padding:0 14px;cursor:pointer;font-weight:800;white-space:nowrap}.stat-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:16px}.stat-card{border:1px solid #273244;border-radius:20px;padding:15px;background:#111827}.stat-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px;color:#bfdbfe}.stat-card strong{display:block;margin-top:14px;font-size:28px;letter-spacing:-.04em}.stat-card span{display:block;color:#94a3b8;font-size:13px;margin-top:4px}.panel-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:14px;margin-top:16px}.win-panel{border:1px solid #273244;border-radius:22px;background:#111827;overflow:hidden}.panel-header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:15px 16px;border-bottom:1px solid #273244}.panel-header h2{margin:0;font-size:16px}.panel-header span{color:#94a3b8;font-size:12px}.table-like{display:grid;padding:10px;gap:8px}.table-row{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;padding:11px 12px;border-radius:15px;background:#0b1220}.table-row strong{font-size:14px}.table-row span{display:block;color:#94a3b8;font-size:12px;margin-top:2px}.score-pill{padding:6px 10px;border-radius:999px;color:#dcfce7;background:#12321f;font-weight:900;font-size:13px}.score-pill.negative{color:#fecaca;background:#351217}
  .taskbar{position:fixed;left:50%;bottom:8px;transform:translateX(-50%);width:calc(100vw - 32px);height:48px;border:1px solid #273244;border-radius:18px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;padding:0 10px;background:#0b1220;box-shadow:0 22px 60px rgba(0,0,0,.42);z-index:1000;transition:transform .2s ease}.taskbar.align-left{grid-template-columns:auto 1fr auto}.taskbar.align-left .task-center{justify-content:flex-start}.taskbar.auto-hide{transform:translateX(-50%) translateY(calc(100% - 6px))}.taskbar.auto-hide:hover{transform:translateX(-50%) translateY(0)}.task-left,.task-center,.task-right{display:flex;align-items:center;gap:8px;min-width:0}.task-center{justify-content:center;align-items:center;height:100%}.task-right{justify-content:center;align-items:flex-end;flex-direction:column;color:#cbd5e1;font-size:12px;line-height:1.2;white-space:nowrap}.task-icon,.task-start{width:34px;height:34px;box-sizing:border-box;flex:0 0 auto;align-self:center;border:1px solid #273244;border-radius:11px;display:grid;place-items:center;color:#f8fafc;background:#111827;cursor:pointer;transition:.16s ease;position:relative}.task-start{background:linear-gradient(135deg,var(--desktop-accent),color-mix(in srgb,var(--desktop-accent) 58%,#7c3aed));border-color:transparent}.task-icon.active,.task-icon:hover,.task-start:hover{transform:none;background:#172033}.task-focus-switch{height:34px;min-width:76px;box-sizing:border-box;align-self:center;border:1px solid #273244;border-radius:999px;display:inline-grid;grid-template-columns:30px auto;align-items:center;gap:7px;padding:0 9px 0 4px;color:#94a3b8;background:#111827;font:inherit;font-size:12px;font-weight:950;cursor:pointer;transition:.16s ease}.task-focus-switch:hover{background:#172033}.task-focus-switch.on{color:#fff;border-color:transparent;background:color-mix(in srgb,var(--desktop-accent) 82%,#0b1220)}.task-focus-knob{width:26px;height:26px;border-radius:999px;display:block;position:relative;background:#334155;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}.task-focus-knob::after{content:"";position:absolute;width:12px;height:12px;left:7px;top:7px;border-radius:999px;background:#cbd5e1;transition:.16s ease}.task-focus-switch.on .task-focus-knob{background:rgba(255,255,255,.18)}.task-focus-switch.on .task-focus-knob::after{background:#fff;transform:translateX(6px)}.task-focus-text{line-height:1;min-width:22px;text-align:center}.running-app::after{content:"";position:absolute;left:11px;right:11px;bottom:3px;height:2px;border-radius:999px;background:var(--desktop-accent)}.task-icon.show-badge::before{content:"";position:absolute;top:5px;right:5px;width:7px;height:7px;border-radius:999px;background:#ef4444;box-shadow:0 0 0 2px #0b1220}.pinned-app{opacity:.92}.task-search{width:260px;height:34px;box-sizing:border-box;align-self:center;border:1px solid #273244;border-radius:999px;display:flex;align-items:center;gap:8px;padding:0 12px;color:#cbd5e1;background:#111827;cursor:pointer}
  .start-menu,.search-panel{position:fixed;left:50%;bottom:66px;transform:translateX(-50%);width:min(560px,calc(100vw - 28px));border:1px solid #273244;border-radius:26px;background:#0b1220;box-shadow:0 30px 90px rgba(0,0,0,.48);z-index:2000;overflow:hidden;animation:menuUp .18s ease both}@keyframes menuUp{from{opacity:0;transform:translateX(-50%) translateY(12px) scale(.98)}to{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}}.start-header,.search-header{padding:18px;border-bottom:1px solid #273244}.start-header h2,.search-header h2{margin:0;font-size:18px}.start-app-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:16px}.start-app{border:0;border-radius:18px;padding:12px 8px;color:#f8fafc;background:transparent;cursor:pointer;text-align:center}.start-app:hover{background:#111827}.start-app-icon{width:42px;height:42px;margin:0 auto 8px;border-radius:14px;display:grid;place-items:center;color:var(--desktop-accent);background:transparent}.start-app-icon svg{width:30px;height:30px;stroke-width:2.15}.start-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-top:1px solid #273244;background:#050914}.task-app-menu{position:fixed;z-index:3000;width:220px;padding:6px;border:1px solid #273244;border-radius:12px;color:#f8fafc;background:#161616;box-shadow:0 22px 60px rgba(0,0,0,.42);transform:translateY(-100%)}.task-app-menu button{width:100%;height:34px;border:0;border-radius:8px;display:flex;align-items:center;gap:10px;padding:0 10px;color:#f8fafc;background:transparent;font:inherit;font-size:13px;text-align:left;cursor:pointer}.task-app-menu button:hover{background:#2a2a2a}.toast{position:fixed;right:20px;bottom:90px;max-width:320px;padding:12px 14px;border:1px solid #7f1d1d;border-radius:16px;color:#fecaca;background:#351217;box-shadow:0 20px 60px rgba(0,0,0,.36);z-index:3000;animation:menuUp .18s ease both}
  .win-root,.win-window,.win-content,.win-body{scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--desktop-accent,#10b981) 70%,#334155) #050914}.win-root::-webkit-scrollbar,.win-window::-webkit-scrollbar,.win-content::-webkit-scrollbar,.win-body::-webkit-scrollbar{width:10px;height:10px}.win-root::-webkit-scrollbar-track,.win-window::-webkit-scrollbar-track,.win-content::-webkit-scrollbar-track,.win-body::-webkit-scrollbar-track{background:#050914}.win-root::-webkit-scrollbar-thumb,.win-window::-webkit-scrollbar-thumb,.win-content::-webkit-scrollbar-thumb,.win-body::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--desktop-accent,#10b981) 70%,#334155);border:2px solid #050914;border-radius:999px}
  .win-root.theme-light{color:#0f172a;background:radial-gradient(circle at 18% 12%,color-mix(in srgb,var(--desktop-accent) 18%,transparent),transparent 32%),linear-gradient(135deg,#eff6ff 0%,#f8fafc 52%,#e2e8f0 100%)}.win-root.theme-light .desktop-shortcut{color:#0f172a}.win-root.theme-light .desktop-shortcut:hover{background:#e2e8f0}.win-root.theme-light .desktop-shortcut span{text-shadow:0 1px 8px rgba(255,255,255,.85)}.win-root.theme-light .win-empty-note,.win-root.theme-light .win-window,.win-root.theme-light .taskbar,.win-root.theme-light .start-menu,.win-root.theme-light .search-panel{color:#0f172a;border-color:#cbd5e1;background:#fff}.win-root.theme-light .win-titlebar{color:#0f172a;border-bottom-color:#d7dee8;background:#f8fafc}.win-root.theme-light .window-actions button{color:#334155}.win-root.theme-light .window-actions button:hover{background:#e2e8f0}.win-root.theme-light .win-sidebar,.win-root.theme-light .win-content{background:#f1f5f9}.win-root.theme-light .win-sidebar,.win-root.theme-light .panel-header,.win-root.theme-light .start-header,.win-root.theme-light .search-header,.win-root.theme-light .start-footer{border-color:#d7dee8}.win-root.theme-light .user-card,.win-root.theme-light .content-hero,.win-root.theme-light .stat-card,.win-root.theme-light .win-panel,.win-root.theme-light .task-focus-switch{color:#334155;border-color:#d7dee8;background:#fff}.win-root.theme-light .task-focus-switch:hover{background:#e2e8f0}.win-root.theme-light .task-focus-switch.on{color:#fff;border-color:transparent;background:var(--desktop-accent)}.win-root.theme-light .task-focus-knob{background:#e2e8f0;box-shadow:inset 0 0 0 1px #cbd5e1}.win-root.theme-light .task-focus-knob::after{background:#64748b}.win-root.theme-light .task-focus-switch.on .task-focus-knob{background:rgba(255,255,255,.25);box-shadow:none}.win-root.theme-light .task-focus-switch.on .task-focus-knob::after{background:#fff}.win-root.theme-light .task-icon,.win-root.theme-light .task-search,.win-root.theme-light .table-row,.win-root.theme-light .hero-chip{color:#0f172a;border-color:#d7dee8;background:#fff}.win-root.theme-light .task-icon:hover,.win-root.theme-light .task-icon.active,.win-root.theme-light .task-start:hover,.win-root.theme-light .side-item:hover,.win-root.theme-light .side-item.active,.win-root.theme-light .start-app:hover{background:#e2e8f0}.win-root.theme-light .content-hero p,.win-root.theme-light .stat-card span,.win-root.theme-light .panel-header span,.win-root.theme-light .table-row span,.win-root.theme-light .user-card span,.win-root.theme-light .side-item span,.win-root.theme-light .task-right,.win-root.theme-light .task-search{color:#475569}.win-root.theme-light .side-item{color:#0f172a}.win-root.theme-light .score-pill{color:#166534;background:#dcfce7}.win-root.theme-light .score-pill.negative{color:#991b1b;background:#fee2e2}.win-root.theme-light .logout-button{color:#991b1b;border-color:#fecaca;background:#fff1f2}.win-root.theme-light .task-app-menu{color:#0f172a;border-color:#cbd5e1;background:#fff}.win-root.theme-light .task-app-menu button{color:#0f172a}.win-root.theme-light .task-app-menu button:hover{background:#e2e8f0}.win-root.theme-light .win-empty-note h1{color:#0f172a}.win-root.theme-light .win-empty-note p{color:#64748b}.win-root.theme-light .task-icon.show-badge::before{box-shadow:0 0 0 2px #fff}.win-root.theme-light .start-app{color:#0f172a}.win-root.theme-light .start-app span{color:#0f172a}.win-root.theme-light .start-header h2,.win-root.theme-light .search-header h2{color:#0f172a}.win-root.theme-light .start-footer{color:#0f172a;background:#f8fafc;border-top-color:#d7dee8}.win-root.theme-light .start-footer strong{color:#0f172a}.win-root.theme-light .start-footer .user-card{color:#0f172a;background:transparent}.win-root.theme-light .taskbar{background:#fff;border-color:#cbd5e1}.win-root.theme-light .task-start{color:#fff}.search-panel.align-left,.start-menu.align-left{left:16px;transform:none;animation:menuUpLeft .18s ease both}@keyframes menuUpLeft{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
  @media (max-width:920px){.win-desktop{padding:12px 12px 72px}.desktop-icons{left:14px;top:14px;gap:18px}.win-empty-note{display:none}.win-window{left:12px;width:calc(100vw - 24px);height:calc(100vh - 92px);min-height:0}.win-body{grid-template-columns:1fr}.win-sidebar{display:none}.stat-grid,.panel-grid{grid-template-columns:1fr}.taskbar{height:48px;grid-template-columns:auto 1fr auto}.task-left{display:none}.task-search{width:100%}}
  @media (max-width:520px){.win-content{padding:14px}.content-hero{padding:16px}.content-hero-top{flex-direction:column}.window-actions button{width:40px}.task-right{display:none}.start-app-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;
