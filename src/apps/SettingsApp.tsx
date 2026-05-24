import React, { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Image,
  Monitor,
  MousePointer2,
  Palette,
  RefreshCcw,
  Search,
  Settings,
  Sparkles,
  Upload,
  UserRound,
  Wallpaper,
} from "lucide-react";

type ThemeMode = "dark" | "light" | "auto";
type TaskbarAlign = "left" | "center";
type SettingsSection = "home" | "personalization" | "background" | "color" | "taskbar";

type SettingsAppProps = {
  accent: string;
  setAccent: (value: string) => void;
  userEmail?: string | null;
  userName?: string | null;
  userPhotoURL?: string | null;
};

type TaskbarSettings = {
  searchMode: "icon" | "box";
  taskView: boolean;
  widgets: boolean;
  resume: boolean;
  alignment: TaskbarAlign;
  autoHide: boolean;
  badges: boolean;
};

type ContextMenuItem = {
  label: string;
  icon?: React.ElementType;
  shortcut?: string;
  action?: () => void;
  divider?: boolean;
};

const DEFAULT_ACCENTS: Record<string, string> = {
  blue: "#2563eb",
  violet: "#7c3aed",
  pink: "#db2777",
  green: "#059669",
  amber: "#d97706",
  red: "#dc2626",
};

const WINDOWS_COLORS = [
  "#2563eb", "#7c3aed", "#db2777", "#059669", "#d97706", "#dc2626", "#0ea5e9", "#06b6d4",
  "#14b8a6", "#16a34a", "#f59e0b", "#f97316", "#f43f5e", "#8b5cf6", "#64748b", "#334155",
];

const DEFAULT_TASKBAR_SETTINGS: TaskbarSettings = {
  searchMode: "box",
  taskView: true,
  widgets: false,
  resume: true,
  alignment: "center",
  autoHide: false,
  badges: true,
};

function isHexColor(value: string | null | undefined) {
  return !!value && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

function normalizeAccentValue(value: string | null | undefined) {
  if (!value) return null;
  const raw = value.trim();
  if (isHexColor(raw)) return raw.length === 4 ? `#${raw.slice(1).split("").map((x) => x + x).join("")}` : raw.toLowerCase();
  return DEFAULT_ACCENTS[raw.toLowerCase()] || null;
}

function normalizeThemeMode(value: string | null): ThemeMode | null {
  if (!value) return null;
  const normalized = value.toLowerCase().trim();
  if (["light", "sang", "sáng"].includes(normalized)) return "light";
  if (["dark", "toi", "tối"].includes(normalized)) return "dark";
  if (["auto", "system", "he-thong", "hệ thống", "hethong"].includes(normalized)) return "auto";
  return null;
}

function readSharedThemeMode(): ThemeMode {
  const keys = ["login-theme", "login-theme-mode", "desktop-theme", "theme-mode", "theme", "app-theme", "color-mode"];
  for (const key of keys) {
    const mode = normalizeThemeMode(localStorage.getItem(key));
    if (mode) return mode;
  }
  return "dark";
}

function readSharedAccent(currentAccent: string) {
  const loginAccent = localStorage.getItem("login-accent");
  const loginCustomAccent = localStorage.getItem("login-custom-accent");
  if (loginAccent?.toLowerCase() === "custom" && normalizeAccentValue(loginCustomAccent)) return normalizeAccentValue(loginCustomAccent) || currentAccent;

  const keys = [
    "login-accent-color", "desktop-accent", "desktop-accent-color", "accent-color", "login-custom-accent",
    "custom-accent", "customAccent", "desktop-custom-accent", "login-accent", "accent",
  ];
  for (const key of keys) {
    const color = normalizeAccentValue(localStorage.getItem(key));
    if (color) return color;
  }
  return normalizeAccentValue(currentAccent) || DEFAULT_ACCENTS.blue;
}

function saveAccentToStorage(color: string) {
  const normalized = normalizeAccentValue(color) || DEFAULT_ACCENTS.blue;
  const matched = Object.entries(DEFAULT_ACCENTS).find(([, value]) => value.toLowerCase() === normalized.toLowerCase())?.[0];
  const accentKey = matched || "custom";
  localStorage.setItem("desktop-accent", normalized);
  localStorage.setItem("desktop-accent-color", normalized);
  localStorage.setItem("desktop-custom-accent", normalized);
  localStorage.setItem("login-accent", accentKey);
  localStorage.setItem("accent", accentKey);
  localStorage.setItem("login-accent-color", normalized);
  localStorage.setItem("login-custom-accent", normalized);
  localStorage.setItem("custom-accent", normalized);
  localStorage.setItem("customAccent", normalized);
  localStorage.setItem("accent-color", normalized);
  localStorage.setItem("a3k64-personalization-local-updated-at", String(Date.now()));
  localStorage.setItem("a3k64-login-look-dirty-v1", "1");
  document.documentElement.style.setProperty("--desktop-accent", normalized);
  window.dispatchEvent(new Event("accent-change"));
  window.dispatchEvent(new Event("login-accent-change"));
  window.dispatchEvent(new Event("appearance-change"));
}

function readTaskbarSettings(): TaskbarSettings {
  try {
    return { ...DEFAULT_TASKBAR_SETTINGS, ...JSON.parse(localStorage.getItem("taskbar-settings") || "{}") };
  } catch {
    return DEFAULT_TASKBAR_SETTINGS;
  }
}

function saveTaskbarSettings(nextSettings: TaskbarSettings) {
  localStorage.setItem("taskbar-settings", JSON.stringify(nextSettings));
  window.dispatchEvent(new CustomEvent("taskbar-settings-change", { detail: nextSettings }));
}

function getDisplayName(email?: string | null, name?: string | null) {
  if (name && !name.includes("@")) return name;
  if (!email) return "Người dùng 12A3";
  return email.split("@")[0] || "Người dùng 12A3";
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  return isMobile;
}

function SettingRow({ icon: Icon, title, subtitle, children }: { icon?: React.ElementType; title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="setting-row">
      <div className="setting-row-left">
        {Icon && <Icon size={22} />}
        <div>
          <strong>{title}</strong>
          {subtitle && <span>{subtitle}</span>}
        </div>
      </div>
      <div className="setting-row-right">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return <button type="button" className={`toggle ${checked ? "on" : ""}`} onClick={() => onChange(!checked)} aria-pressed={checked}><span /></button>;
}

function SelectButton<T extends string>({ value, options, onChange }: { value: T; options: { label: string; value: T }[]; onChange: (value: T) => void }) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value) || options[0];
  return (
    <div className="select-wrap">
      <button type="button" className="select-button" onClick={() => setOpen((state) => !state)}><span>{current.label}</span><ChevronDown size={15} /></button>
      {open && <div className="select-menu">{options.map((option) => <button key={option.value} type="button" className={option.value === value ? "active" : ""} onClick={() => { onChange(option.value); setOpen(false); }}>{option.label}</button>)}</div>}
    </div>
  );
}

function AccountCard({ displayName, userEmail, userPhotoURL }: { displayName: string; userEmail?: string | null; userPhotoURL?: string | null }) {
  return (
    <section className="settings-group account-group">
      <p className="settings-group-label">Tài khoản</p>
      <div className="settings-account-card">
        <div className="settings-avatar">{userPhotoURL ? <img src={userPhotoURL} alt="Avatar" /> : <UserRound size={30} />}</div>
        <div><strong>{displayName}</strong><span>{userEmail || "Đang đăng nhập"}</span></div>
      </div>
    </section>
  );
}

function NavRow({ icon: Icon, title, subtitle, onClick }: { icon: React.ElementType; title: string; subtitle: string; onClick: () => void }) {
  return <button type="button" className="settings-nav-row" onClick={onClick}><Icon size={24} /><div><strong>{title}</strong><span>{subtitle}</span></div><ChevronRight size={20} /></button>;
}

function PageHeader({ title, subtitle, backLabel, onBack }: { title: string; subtitle?: string; backLabel?: string; onBack?: () => void }) {
  return (
    <header className="settings-page-header">
      {onBack && <button type="button" className="settings-back-button" onClick={onBack} aria-label="Quay lại"><ChevronLeft size={20} /><span>{backLabel || "Quay lại"}</span></button>}
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </header>
  );
}

function BackgroundPanel() {
  return <section className="settings-group settings-card"><p className="settings-group-label">Hình nền</p><div className="background-preview"><div className="preview-glow" /><span>Xem trước hình nền</span></div><SettingRow icon={Image} title="Chọn hình nền" subtitle="Tải ảnh cá nhân để đặt làm hình nền desktop"><button type="button" className="soft-button" disabled><Upload size={16} /> Sắp có</button></SettingRow></section>;
}

function ColorPanel({ accent, setAccent }: Pick<SettingsAppProps, "accent" | "setAccent">) {
  const [mode, setMode] = useState<ThemeMode>(readSharedThemeMode);
  const [transparency, setTransparency] = useState(localStorage.getItem("desktop-transparency") !== "off");
  const [showOnTaskbar, setShowOnTaskbar] = useState(localStorage.getItem("accent-taskbar") === "on");
  const [showOnBorders, setShowOnBorders] = useState(localStorage.getItem("accent-borders") === "on");
  const [customColor, setCustomColor] = useState(readSharedAccent(accent));

  useEffect(() => {
    const syncAppearance = () => { setMode(readSharedThemeMode()); setCustomColor(readSharedAccent(accent)); };
    ["storage", "accent-change", "login-accent-change", "desktop-theme-change", "login-theme-change", "appearance-change"].forEach((event) => window.addEventListener(event, syncAppearance));
    return () => ["storage", "accent-change", "login-accent-change", "desktop-theme-change", "login-theme-change", "appearance-change"].forEach((event) => window.removeEventListener(event, syncAppearance));
  }, [accent]);

  const applyAccent = (color: string) => {
    const next = normalizeAccentValue(color) || DEFAULT_ACCENTS.blue;
    setAccent(next);
    setCustomColor(next);
    saveAccentToStorage(next);
    const recentColors = JSON.parse(localStorage.getItem("recent-accents") || "[]") as string[];
    localStorage.setItem("recent-accents", JSON.stringify([next, ...recentColors.filter((item) => item.toLowerCase() !== next.toLowerCase())].slice(0, 4)));
  };

  return (
    <>
      <section className="settings-group settings-card">
        <p className="settings-group-label">Chế độ hiển thị</p>
        <SettingRow icon={Monitor} title="Chọn chế độ" subtitle="Đổi màu giao diện hiển thị trong hệ thống">
          <SelectButton value={mode} onChange={(value) => { setMode(value); ["desktop-theme", "login-theme", "login-theme-mode", "theme-mode", "theme"].forEach((key) => localStorage.setItem(key, value)); window.dispatchEvent(new Event("desktop-theme-change")); window.dispatchEvent(new Event("login-theme-change")); window.dispatchEvent(new Event("appearance-change")); }} options={[{ label: "Tối", value: "dark" }, { label: "Sáng", value: "light" }, { label: "Tự động", value: "auto" }]} />
        </SettingRow>
        <SettingRow icon={Sparkles} title="Hiệu ứng trong suốt" subtitle="Cửa sổ và bề mặt có hiệu ứng kính mờ"><Toggle checked={transparency} onChange={(value) => { setTransparency(value); localStorage.setItem("desktop-transparency", value ? "on" : "off"); }} /></SettingRow>
      </section>

      <section className="settings-group settings-card color-card">
        <p className="settings-group-label">Màu sắc</p>
        <div className="color-section-head"><div><strong>Màu chủ đạo</strong><span>Chọn nhanh hoặc dùng màu tùy chỉnh.</span></div><span className="accent-chip" style={{ background: accent }} /></div>
        <div className="windows-color-grid">{WINDOWS_COLORS.map((color) => <button key={color} type="button" style={{ background: color }} onClick={() => applyAccent(color)} aria-label={color}>{accent.toLowerCase() === color.toLowerCase() ? "✓" : ""}</button>)}</div>
        <div className="custom-color-row"><div><strong>Màu tùy chỉnh</strong><span>Chọn màu tự do và cập nhật tức thì.</span></div><div className="custom-color-actions"><input type="color" value={customColor || accent} onChange={(event) => { setCustomColor(event.target.value); applyAccent(event.target.value); }} /><button type="button" className="soft-button" onClick={() => applyAccent(customColor || accent)}>Áp dụng</button></div></div>
      </section>

      <section className="settings-group settings-card">
        <p className="settings-group-label">Áp dụng màu</p>
        <SettingRow title="Hiện màu chủ đạo trên Start và thanh taskbar"><Toggle checked={showOnTaskbar} onChange={(value) => { setShowOnTaskbar(value); localStorage.setItem("accent-taskbar", value ? "on" : "off"); }} /></SettingRow>
        <SettingRow title="Hiện màu chủ đạo trên thanh tiêu đề và viền cửa sổ"><Toggle checked={showOnBorders} onChange={(value) => { setShowOnBorders(value); localStorage.setItem("accent-borders", value ? "on" : "off"); }} /></SettingRow>
      </section>
    </>
  );
}

function TaskbarPanel() {
  const [settings, setSettings] = useState<TaskbarSettings>(readTaskbarSettings);
  const updateSetting = <K extends keyof TaskbarSettings>(key: K, value: TaskbarSettings[K]) => { const nextSettings = { ...settings, [key]: value }; setSettings(nextSettings); saveTaskbarSettings(nextSettings); };
  return (
    <>
      <section className="settings-group settings-card"><p className="settings-group-label">Mục trên taskbar</p><SettingRow icon={Search} title="Tìm kiếm"><SelectButton value={settings.searchMode} onChange={(value) => updateSetting("searchMode", value)} options={[{ label: "Chỉ icon", value: "icon" }, { label: "Ô tìm kiếm", value: "box" }]} /></SettingRow><SettingRow icon={Copy} title="Chế độ xem tác vụ"><Toggle checked={settings.taskView} onChange={(value) => updateSetting("taskView", value)} /></SettingRow><SettingRow icon={Sparkles} title="Tiện ích"><Toggle checked={settings.widgets} onChange={(value) => updateSetting("widgets", value)} /></SettingRow><SettingRow icon={Monitor} title="Tiếp tục" subtitle="Hiện ứng dụng có thông báo tiếp tục khi khả dụng"><Toggle checked={settings.resume} onChange={(value) => updateSetting("resume", value)} /></SettingRow></section>
      <section className="settings-group settings-card"><p className="settings-group-label">Hành vi taskbar</p><SettingRow title="Căn chỉnh taskbar"><SelectButton value={settings.alignment} onChange={(value) => updateSetting("alignment", value)} options={[{ label: "Trái", value: "left" }, { label: "Giữa", value: "center" }]} /></SettingRow><SettingRow title="Tự động ẩn taskbar"><Toggle checked={settings.autoHide} onChange={(value) => updateSetting("autoHide", value)} /></SettingRow><SettingRow title="Hiện huy hiệu trên ứng dụng taskbar"><Toggle checked={settings.badges} onChange={(value) => updateSetting("badges", value)} /></SettingRow></section>
    </>
  );
}

function PersonalizationNav({ setActiveSection }: { setActiveSection: (section: SettingsSection) => void }) {
  return <section className="settings-group"><p className="settings-group-label">Giao diện</p><div className="settings-list-card"><NavRow icon={Wallpaper} title="Hình nền" subtitle="Ảnh nền desktop" onClick={() => setActiveSection("background")} /><NavRow icon={Palette} title="Màu sắc" subtitle="Màu chủ đạo và hiệu ứng" onClick={() => setActiveSection("color")} /><NavRow icon={Monitor} title="Thanh taskbar" subtitle="Căn chỉnh và hành vi" onClick={() => setActiveSection("taskbar")} /></div></section>;
}

function ContentBySection({ activeSection, setActiveSection, accent, setAccent, isMobile }: { activeSection: SettingsSection; setActiveSection: (section: SettingsSection) => void; accent: string; setAccent: (value: string) => void; isMobile: boolean }) {
  const goHome = () => setActiveSection("home");
  const goPersonalization = () => setActiveSection("personalization");
  if (activeSection === "personalization") return <><PageHeader title="Cá nhân hóa" subtitle="Các tùy chỉnh giao diện được tách riêng để dễ thao tác." backLabel="Cài đặt" onBack={isMobile ? goHome : undefined} /><PersonalizationNav setActiveSection={setActiveSection} /></>;
  if (activeSection === "background") return <><PageHeader title="Hình nền" backLabel="Cá nhân hóa" onBack={isMobile ? goPersonalization : undefined} /><BackgroundPanel /></>;
  if (activeSection === "color") return <><PageHeader title="Màu sắc" backLabel="Cá nhân hóa" onBack={isMobile ? goPersonalization : undefined} /><ColorPanel accent={accent} setAccent={setAccent} /></>;
  if (activeSection === "taskbar") return <><PageHeader title="Thanh taskbar" backLabel="Cá nhân hóa" onBack={isMobile ? goPersonalization : undefined} /><TaskbarPanel /></>;
  return null;
}

export function SettingsApp({ accent, setAccent, userEmail, userName, userPhotoURL }: SettingsAppProps) {
  const isMobile = useIsMobile();
  const [activeSection, setActiveSection] = useState<SettingsSection>("home");
  const displayName = getDisplayName(userEmail, userName);

  if (!isMobile) {
    const desktopSection = activeSection === "home" ? "personalization" : activeSection;
    return (
      <div className="settings-app settings-desktop-win11">
        <style>{settingsCss}</style>
        <aside className="settings-sidebar">
          <div className="settings-topline"><Settings size={20} /><strong>Cài đặt</strong></div>
          <AccountCard displayName={displayName} userEmail={userEmail} userPhotoURL={userPhotoURL} />
          <nav className="windows-settings-nav">
            <button type="button" className={desktopSection === "personalization" ? "active" : ""} onClick={() => setActiveSection("personalization")}><Palette size={19} /><span>Cá nhân hóa</span></button>
            <button type="button" className={desktopSection === "background" ? "active" : ""} onClick={() => setActiveSection("background")}><Wallpaper size={19} /><span>Hình nền</span></button>
            <button type="button" className={desktopSection === "color" ? "active" : ""} onClick={() => setActiveSection("color")}><Palette size={19} /><span>Màu sắc</span></button>
            <button type="button" className={desktopSection === "taskbar" ? "active" : ""} onClick={() => setActiveSection("taskbar")}><Monitor size={19} /><span>Thanh taskbar</span></button>
          </nav>
        </aside>
        <main className="settings-content"><ContentBySection activeSection={desktopSection} setActiveSection={setActiveSection} accent={accent} setAccent={setAccent} isMobile={false} /></main>
      </div>
    );
  }

  return (
    <div className="settings-app settings-mobile-native">
      <style>{settingsCss}</style>
      {activeSection === "home" ? <main className="settings-screen"><PageHeader title="Cài đặt" subtitle="Quản lý tài khoản và tuỳ chỉnh ứng dụng." /><AccountCard displayName={displayName} userEmail={userEmail} userPhotoURL={userPhotoURL} /><section className="settings-group"><p className="settings-group-label">Tuỳ chỉnh</p><div className="settings-list-card"><NavRow icon={Palette} title="Cá nhân hóa" subtitle="Hình nền, màu sắc và thanh taskbar" onClick={() => setActiveSection("personalization")} /></div></section></main> : <main className="settings-screen"><ContentBySection activeSection={activeSection} setActiveSection={setActiveSection} accent={accent} setAccent={setAccent} isMobile /></main>}
    </div>
  );
}

export function CustomContextMenu({ onRefresh, onOpenSettings }: { onRefresh?: () => void; onOpenSettings?: () => void }) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => { event.preventDefault(); const menuWidth = 250; const menuHeight = 292; const x = Math.min(event.clientX, window.innerWidth - menuWidth - 10); const y = Math.min(event.clientY, window.innerHeight - menuHeight - 10); setMenu({ x, y }); };
    const close = () => setMenu(null);
    window.addEventListener("contextmenu", handleContextMenu); window.addEventListener("click", close); window.addEventListener("keydown", close);
    return () => { window.removeEventListener("contextmenu", handleContextMenu); window.removeEventListener("click", close); window.removeEventListener("keydown", close); };
  }, []);
  const items: ContextMenuItem[] = [{ label: "Làm mới", icon: RefreshCcw, shortcut: "Ctrl+R", action: onRefresh }, { label: "Dán", icon: Copy, shortcut: "Ctrl+V" }, { label: "Tải xuống", icon: Download, divider: true }, { label: "Cá nhân hóa", icon: Palette, action: onOpenSettings }, { label: "Cài đặt", icon: Settings, action: onOpenSettings }, { label: "Kiểm tra giao diện", icon: MousePointer2 }];
  if (!menu) return null;
  return <div className="custom-context-menu" style={{ left: menu.x, top: menu.y }} onClick={(event) => event.stopPropagation()}><style>{contextMenuCss}</style>{items.map((item) => { const Icon = item.icon; return <React.Fragment key={item.label}>{item.divider && <div className="context-divider" />}<button type="button" className="context-item" onClick={() => { item.action?.(); setMenu(null); }}><span className="context-left">{Icon && <Icon size={16} />} {item.label}</span>{item.shortcut && <span className="context-shortcut">{item.shortcut}</span>}</button></React.Fragment>; })}</div>;
}

const contextMenuCss = `
  .custom-context-menu{position:fixed;z-index:9999;width:250px;padding:7px;border:1px solid #273244;border-radius:14px;color:#f8fafc;background:#161616;box-shadow:0 24px 70px rgba(0,0,0,.45);animation:contextIn .12s ease both}@keyframes contextIn{from{opacity:0;transform:translateY(6px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}.context-divider{height:1px;margin:6px 4px;background:#2b3445}.context-item{width:100%;height:34px;border:0;border-radius:9px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 10px;color:#f8fafc;background:transparent;font:inherit;font-size:13px;cursor:pointer}.context-item:hover{background:#2a2a2a}.context-left{display:inline-flex;align-items:center;gap:9px}.context-left svg{color:var(--desktop-accent,#2563eb)}.context-shortcut{color:#a1a1aa;font-size:12px}
`;

const settingsCss = `
  body .settings-app{--settings-bg:#f8fafc;--settings-surface:#fff;--settings-soft:#f1f5f9;--settings-text:#0f172a;--settings-muted:#64748b;--settings-border:#d7dee8;--settings-strong:#cbd5e1;--settings-shadow:0 10px 24px rgba(15,23,42,.045);width:100%;height:100%;min-height:0;color:var(--settings-text);background:var(--settings-bg);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;box-sizing:border-box}body .win-root.theme-dark .settings-app{--settings-bg:#050914;--settings-surface:#0b1220;--settings-soft:#111827;--settings-text:#f8fafc;--settings-muted:#94a3b8;--settings-border:#273244;--settings-strong:#334155;--settings-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 16px 34px rgba(0,0,0,.28)}body .settings-app *{box-sizing:border-box}.settings-desktop-win11{display:grid;grid-template-columns:300px minmax(0,1fr);overflow:hidden}.settings-desktop-win11 .settings-sidebar{min-width:0;padding:18px;border-right:1px solid var(--settings-border);background:color-mix(in srgb,var(--settings-bg) 88%,var(--settings-surface));overflow:auto}.settings-topline{height:36px;display:flex;align-items:center;gap:10px;margin-bottom:18px;font-weight:900}.windows-settings-nav{display:grid;gap:8px;margin-top:18px}.windows-settings-nav button{height:44px;border:0;border-radius:10px;display:flex;align-items:center;gap:12px;padding:0 12px;color:var(--settings-text);background:transparent;font:inherit;font-weight:800;cursor:pointer}.windows-settings-nav button.active,.windows-settings-nav button:hover{background:var(--settings-soft)}.windows-settings-nav svg,.settings-topline svg,.settings-nav-row>svg:first-child,.setting-row-left>svg{color:var(--desktop-accent,#ef4444)}.settings-content{overflow:auto;padding:28px 34px 46px;background:var(--settings-bg)}.settings-desktop-win11 .settings-content{max-width:1100px;width:100%;justify-self:center}.settings-page-header{margin-bottom:20px}.settings-back-button{min-height:40px;margin:0 0 10px -6px;border:0;border-radius:12px;display:inline-flex;align-items:center;gap:5px;padding:0 10px 0 6px;color:var(--settings-muted);background:transparent;font:inherit;font-size:14px;font-weight:800;cursor:pointer}.settings-back-button:hover{background:var(--settings-soft);color:var(--settings-text)}.settings-page-header h1{margin:0;color:var(--settings-text);font-size:clamp(30px,3.2vw,40px);line-height:1.05;font-weight:950;letter-spacing:-.045em}.settings-page-header p{margin:8px 0 0;color:var(--settings-muted);font-size:14px;line-height:1.45}.settings-group{margin:0 0 20px}.settings-group-label{margin:0 0 8px;color:var(--settings-muted);font-size:12px;line-height:1.2;font-weight:900;letter-spacing:.02em}.settings-list-card,.settings-card,.settings-account-card{width:100%;border:1px solid var(--settings-border);border-radius:16px;overflow:hidden;background:var(--settings-surface);box-shadow:var(--settings-shadow)}.settings-account-card{min-height:74px;display:grid;grid-template-columns:54px minmax(0,1fr);align-items:center;gap:12px;padding:10px 12px}.settings-avatar{width:54px;height:54px;border-radius:999px;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,var(--desktop-accent,#ef4444),#64748b);overflow:hidden}.settings-avatar img{width:100%;height:100%;object-fit:cover}.settings-account-card strong,.settings-account-card span{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.settings-account-card strong{color:var(--settings-text);font-size:14px;line-height:1.2;font-weight:900}.settings-account-card span{margin-top:4px;color:var(--settings-muted);font-size:12px}.settings-nav-row,.setting-row{width:100%;min-height:62px;border:0;border-bottom:1px solid var(--settings-border);display:grid;grid-template-columns:30px minmax(0,1fr) auto;align-items:center;gap:12px;padding:10px 14px;color:var(--settings-text);background:var(--settings-surface);font:inherit;text-align:left;cursor:pointer}.settings-nav-row:last-child,.setting-row:last-child{border-bottom:0}.settings-nav-row:hover,.settings-nav-row:active{background:var(--settings-soft)}.settings-nav-row>svg:last-child{color:var(--desktop-accent,#ef4444);justify-self:end}.settings-nav-row div,.setting-row-left div{min-width:0}.settings-nav-row strong,.setting-row-left strong{display:block;color:var(--settings-text);font-size:14.5px;line-height:1.2;font-weight:900;white-space:normal;overflow-wrap:anywhere}.settings-nav-row span,.setting-row-left span{display:block;margin-top:3px;color:var(--settings-muted);font-size:12px;line-height:1.3;white-space:normal;overflow-wrap:anywhere}.setting-row{cursor:default;grid-template-columns:minmax(0,1fr) auto}.setting-row-left{min-width:0;display:flex;align-items:center;gap:12px}.setting-row-right{justify-self:end;display:flex;align-items:center;justify-content:flex-end}.toggle{width:48px;height:28px;border:1px solid var(--settings-strong);border-radius:999px;padding:3px;background:var(--settings-soft);cursor:pointer}.toggle span{display:block;width:20px;height:20px;border-radius:999px;background:#fff;box-shadow:0 1px 3px rgba(15,23,42,.18);transition:.16s ease}.toggle.on{border-color:transparent;background:var(--desktop-accent,#ef4444)}.toggle.on span{transform:translateX(20px)}.select-wrap{position:relative;max-width:150px}.select-button{min-width:126px;max-width:150px;height:40px;border:1px solid var(--settings-strong);border-radius:10px;display:inline-flex;align-items:center;justify-content:space-between;gap:8px;padding:0 10px;color:var(--settings-text);background:var(--settings-surface);font:inherit;font-size:13px;cursor:pointer}.select-button span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.select-menu{position:absolute;right:0;top:calc(100% + 6px);z-index:50;min-width:190px;padding:6px;border:1px solid var(--settings-strong);border-radius:12px;background:var(--settings-surface);box-shadow:0 18px 50px rgba(15,23,42,.16)}.select-menu button{width:100%;min-height:40px;border:0;border-radius:8px;padding:0 10px;color:var(--settings-text);background:transparent;text-align:left;font:inherit;font-size:13px;cursor:pointer}.select-menu button:hover,.select-menu button.active{background:var(--settings-soft)}.background-preview{height:170px;margin:14px;border:1px solid var(--settings-border);border-radius:14px;display:grid;place-items:center;position:relative;overflow:hidden;color:var(--settings-text);background:var(--settings-soft)}.background-preview span{position:relative;z-index:2;font-weight:900}.preview-glow{position:absolute;width:180px;height:180px;border-radius:999px;background:var(--desktop-accent,#ef4444);filter:blur(58px);opacity:.25}.soft-button{min-height:40px;border:1px solid var(--settings-strong);border-radius:10px;display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:0 12px;color:var(--settings-text);background:var(--settings-surface);font:inherit;font-size:13px;cursor:pointer}.soft-button:disabled{opacity:.55;cursor:not-allowed}.color-card{padding:14px}.color-section-head,.custom-color-row{display:flex;align-items:center;justify-content:space-between;gap:12px}.color-section-head strong,.custom-color-row strong{display:block;color:var(--settings-text);font-size:14.5px;line-height:1.2;font-weight:900}.color-section-head span,.custom-color-row span{display:block;margin-top:3px;color:var(--settings-muted);font-size:12px;line-height:1.3}.accent-chip{width:38px;height:38px;border-radius:10px;border:2px solid rgba(255,255,255,.85);box-shadow:0 0 0 1px var(--settings-strong);flex:0 0 auto}.windows-color-grid{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.windows-color-grid button{width:40px;height:40px;border:0;border-radius:9px;display:grid;place-items:center;color:#fff;cursor:pointer;font-weight:900}.custom-color-row{margin-top:16px;padding-top:14px;border-top:1px solid var(--settings-border)}.custom-color-actions{display:flex;align-items:center;gap:8px;flex:0 0 auto}.custom-color-actions input{width:44px;height:40px;border:0;padding:0;background:transparent}
  @media(max-width:760px){body .settings-mobile-native{height:100%;min-height:100%;overflow:auto;-webkit-overflow-scrolling:touch;background:var(--settings-bg)}body .win-window:has(.settings-mobile-native),body .win-window:has(.settings-mobile-native) .win-body,body .win-window:has(.settings-mobile-native) .win-body.settings-mode{background:var(--settings-bg)!important;border-bottom:0!important;overflow:hidden!important}body .settings-screen{min-height:100%;padding:16px 16px 18px;background:var(--settings-bg)}.settings-page-header{margin-bottom:18px}.settings-page-header h1{font-size:30px}.settings-nav-row,.setting-row{min-height:60px;padding:10px 14px}.settings-list-card,.settings-account-card{overflow:hidden}.settings-card{overflow:visible}.settings-content{padding:0}.settings-account-card strong,.settings-account-card span{white-space:normal;overflow:visible;text-overflow:clip;overflow-wrap:anywhere}.settings-desktop-win11{display:block}}
`;

export default SettingsApp;
