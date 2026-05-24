import React, { useEffect, useState } from "react";
import {
  Check,
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
  "#fbbf24", "#fb923c", "#f97316", "#ea580c", "#dc2626", "#ef4444", "#f43f5e", "#e11d48",
  "#0ea5e9", "#0284c7", "#6366f1", "#8b5cf6", "#a855f7", "#9333ea", "#06b6d4", "#0891b2",
  "#14b8a6", "#10b981", "#059669", "#16a34a", "#15803d", "#64748b", "#52525b", "#78716c",
  "#475569", "#334155",
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

function isHexColor(value: string | null) {
  return !!value && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

function normalizeAccentValue(value: string | null) {
  if (!value) return null;
  const raw = value.trim();
  if (isHexColor(raw)) return raw;
  return DEFAULT_ACCENTS[raw.toLowerCase()] || null;
}

function readSharedAccent(currentAccent: string) {
  const loginAccent = localStorage.getItem("login-accent");
  const loginCustomAccent = localStorage.getItem("login-custom-accent");

  if (loginAccent?.toLowerCase() === "custom" && normalizeAccentValue(loginCustomAccent)) {
    return normalizeAccentValue(loginCustomAccent) || currentAccent;
  }

  const keys = [
    "login-accent", "login-accent-color", "accent-color", "accentColor", "accent", "desktop-accent", "desktop-accent-color",
    "theme-accent", "login-custom-accent", "custom-accent", "customAccent", "desktop-custom-accent",
  ];
  for (const key of keys) {
    const color = normalizeAccentValue(localStorage.getItem(key));
    if (color) return color;
  }
  return normalizeAccentValue(currentAccent) || DEFAULT_ACCENTS.blue;
}

function saveAccentToStorage(color: string) {
  const match = Object.entries(DEFAULT_ACCENTS).find(([, value]) => value.toLowerCase() === color.toLowerCase());
  const accentKey = match?.[0] || "custom";
  localStorage.setItem("desktop-accent", color);
  localStorage.setItem("desktop-accent-color", color);
  localStorage.setItem("login-accent", accentKey);
  localStorage.setItem("login-accent-color", color);
  localStorage.setItem("login-custom-accent", color);
  localStorage.setItem("accent-color", color);
  localStorage.setItem("accent", accentKey);
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
  return (
    <button type="button" className={`toggle ${checked ? "on" : ""}`} onClick={() => onChange(!checked)} aria-pressed={checked}>
      <span />
    </button>
  );
}

function SelectButton<T extends string>({ value, options, onChange }: { value: T; options: { label: string; value: T }[]; onChange: (value: T) => void }) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value) || options[0];

  return (
    <div className="select-wrap">
      <button type="button" className="select-button" onClick={() => setOpen((state) => !state)}>
        <span>{current.label}</span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="select-menu">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={option.value === value ? "active" : ""}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AccountCard({ displayName, userEmail, userPhotoURL }: { displayName: string; userEmail?: string | null; userPhotoURL?: string | null }) {
  return (
    <section className="settings-group account-group">
      <p className="settings-group-label">Tài khoản</p>
      <div className="settings-account-card">
        <div className="settings-avatar">{userPhotoURL ? <img src={userPhotoURL} alt="Avatar" /> : <UserRound size={30} />}</div>
        <div>
          <strong>{displayName}</strong>
          <span>{userEmail || "Đang đăng nhập"}</span>
        </div>
      </div>
    </section>
  );
}

function NavRow({ icon: Icon, title, subtitle, onClick }: { icon: React.ElementType; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button type="button" className="settings-nav-row" onClick={onClick}>
      <Icon size={24} />
      <div>
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
      <ChevronRight size={20} />
    </button>
  );
}

function PageHeader({ title, subtitle, backLabel, onBack }: { title: string; subtitle?: string; backLabel?: string; onBack?: () => void }) {
  return (
    <header className="settings-page-header">
      {onBack && (
        <button type="button" className="settings-back-button" onClick={onBack} aria-label="Quay lại">
          <ChevronLeft size={20} />
          <span>{backLabel || "Quay lại"}</span>
        </button>
      )}
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </header>
  );
}

function BackgroundPanel() {
  return (
    <section className="settings-group settings-card">
      <p className="settings-group-label">Hình nền</p>
      <div className="background-preview">
        <div className="preview-glow" />
        <span>Xem trước hình nền</span>
      </div>
      <SettingRow icon={Image} title="Chọn hình nền" subtitle="Tải ảnh cá nhân để đặt làm hình nền desktop">
        <button type="button" className="soft-button" disabled>
          <Upload size={16} /> Sắp có
        </button>
      </SettingRow>
    </section>
  );
}

function ColorPanel({ accent, setAccent }: SettingsAppProps) {
  const [mode, setMode] = useState<ThemeMode>(readSharedThemeMode);
  const [transparency, setTransparency] = useState(localStorage.getItem("desktop-transparency") !== "off");
  const [showOnTaskbar, setShowOnTaskbar] = useState(localStorage.getItem("accent-taskbar") === "on");
  const [showOnBorders, setShowOnBorders] = useState(localStorage.getItem("accent-borders") === "on");
  const [customColor, setCustomColor] = useState(readSharedAccent(accent));

  useEffect(() => {
    const syncAppearance = () => {
      setMode(readSharedThemeMode());
      setCustomColor(readSharedAccent(accent));
    };
    window.addEventListener("storage", syncAppearance);
    window.addEventListener("accent-change", syncAppearance);
    window.addEventListener("login-accent-change", syncAppearance);
    window.addEventListener("desktop-theme-change", syncAppearance);
    window.addEventListener("login-theme-change", syncAppearance);
    window.addEventListener("appearance-change", syncAppearance);
    return () => {
      window.removeEventListener("storage", syncAppearance);
      window.removeEventListener("accent-change", syncAppearance);
      window.removeEventListener("login-accent-change", syncAppearance);
      window.removeEventListener("desktop-theme-change", syncAppearance);
      window.removeEventListener("login-theme-change", syncAppearance);
      window.removeEventListener("appearance-change", syncAppearance);
    };
  }, [accent]);

  const applyAccent = (color: string) => {
    setAccent(color);
    setCustomColor(color);
    saveAccentToStorage(color);
    const stored = localStorage.getItem("recent-accents");
    const recentColors = stored ? JSON.parse(stored) as string[] : [];
    const nextRecent = [color, ...recentColors.filter((item) => item.toLowerCase() !== color.toLowerCase())].slice(0, 4);
    localStorage.setItem("recent-accents", JSON.stringify(nextRecent));
  };

  return (
    <>
      <section className="settings-group settings-card">
        <p className="settings-group-label">Chế độ hiển thị</p>
        <SettingRow icon={Monitor} title="Chọn chế độ" subtitle="Đổi màu giao diện hiển thị trong hệ thống">
          <SelectButton
            value={mode}
            onChange={(value) => {
              setMode(value);
              localStorage.setItem("desktop-theme", value);
              localStorage.setItem("login-theme", value);
              localStorage.setItem("login-theme-mode", value);
              localStorage.setItem("theme-mode", value);
              localStorage.setItem("theme", value);
              window.dispatchEvent(new Event("desktop-theme-change"));
              window.dispatchEvent(new Event("login-theme-change"));
              window.dispatchEvent(new Event("appearance-change"));
            }}
            options={[
              { label: "Tối", value: "dark" },
              { label: "Sáng", value: "light" },
              { label: "Tự động", value: "auto" },
            ]}
          />
        </SettingRow>
        <SettingRow icon={Sparkles} title="Hiệu ứng trong suốt" subtitle="Cửa sổ và bề mặt có hiệu ứng kính mờ">
          <Toggle checked={transparency} onChange={(value) => { setTransparency(value); localStorage.setItem("desktop-transparency", value ? "on" : "off"); }} />
        </SettingRow>
      </section>

      <section className="settings-group settings-card color-card">
        <p className="settings-group-label">Màu sắc</p>
        <div className="color-section-head">
          <div>
            <strong>Màu chủ đạo</strong>
            <span>Chọn thủ công hoặc dùng màu tùy chỉnh.</span>
          </div>
          <span className="accent-chip" style={{ background: accent }} />
        </div>
        <div className="windows-color-grid">
          {WINDOWS_COLORS.map((color) => (
            <button key={color} type="button" style={{ background: color }} onClick={() => applyAccent(color)}>
              {accent.toLowerCase() === color.toLowerCase() && <Check size={17} />}
            </button>
          ))}
        </div>
        <div className="custom-color-row">
          <div>
            <strong>Màu tùy chỉnh</strong>
            <span>Chọn màu bất kỳ bằng bảng màu của trình duyệt.</span>
          </div>
          <div className="custom-color-actions">
            <input type="color" value={customColor} onChange={(event) => { setCustomColor(event.target.value); applyAccent(event.target.value); }} />
            <button type="button" className="soft-button" onClick={() => applyAccent(customColor)}>Áp dụng</button>
          </div>
        </div>
      </section>

      <section className="settings-group settings-card">
        <p className="settings-group-label">Áp dụng màu</p>
        <SettingRow title="Hiện màu chủ đạo trên Start và thanh taskbar">
          <Toggle checked={showOnTaskbar} onChange={(value) => { setShowOnTaskbar(value); localStorage.setItem("accent-taskbar", value ? "on" : "off"); }} />
        </SettingRow>
        <SettingRow title="Hiện màu chủ đạo trên thanh tiêu đề và viền cửa sổ">
          <Toggle checked={showOnBorders} onChange={(value) => { setShowOnBorders(value); localStorage.setItem("accent-borders", value ? "on" : "off"); }} />
        </SettingRow>
      </section>
    </>
  );
}

function TaskbarPanel() {
  const [settings, setSettings] = useState<TaskbarSettings>(readTaskbarSettings);
  const updateSetting = <K extends keyof TaskbarSettings>(key: K, value: TaskbarSettings[K]) => {
    const nextSettings = { ...settings, [key]: value };
    setSettings(nextSettings);
    saveTaskbarSettings(nextSettings);
  };

  return (
    <>
      <section className="settings-group settings-card">
        <p className="settings-group-label">Mục trên taskbar</p>
        <SettingRow icon={Search} title="Tìm kiếm">
          <SelectButton
            value={settings.searchMode}
            onChange={(value) => updateSetting("searchMode", value)}
            options={[{ label: "Chỉ icon", value: "icon" }, { label: "Ô tìm kiếm", value: "box" }]}
          />
        </SettingRow>
        <SettingRow icon={Copy} title="Chế độ xem tác vụ"><Toggle checked={settings.taskView} onChange={(value) => updateSetting("taskView", value)} /></SettingRow>
        <SettingRow icon={Sparkles} title="Tiện ích"><Toggle checked={settings.widgets} onChange={(value) => updateSetting("widgets", value)} /></SettingRow>
        <SettingRow icon={Monitor} title="Tiếp tục" subtitle="Hiện ứng dụng có thông báo tiếp tục khi khả dụng"><Toggle checked={settings.resume} onChange={(value) => updateSetting("resume", value)} /></SettingRow>
      </section>
      <section className="settings-group settings-card">
        <p className="settings-group-label">Hành vi taskbar</p>
        <SettingRow title="Căn chỉnh taskbar">
          <SelectButton value={settings.alignment} onChange={(value) => updateSetting("alignment", value)} options={[{ label: "Trái", value: "left" }, { label: "Giữa", value: "center" }]} />
        </SettingRow>
        <SettingRow title="Tự động ẩn taskbar"><Toggle checked={settings.autoHide} onChange={(value) => updateSetting("autoHide", value)} /></SettingRow>
        <SettingRow title="Hiện huy hiệu trên ứng dụng taskbar"><Toggle checked={settings.badges} onChange={(value) => updateSetting("badges", value)} /></SettingRow>
      </section>
    </>
  );
}

export function SettingsApp({ accent, setAccent, userEmail, userName, userPhotoURL }: SettingsAppProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>("home");
  const displayName = getDisplayName(userEmail, userName);

  const openPersonalization = () => setActiveSection("personalization");
  const goHome = () => setActiveSection("home");
  const goPersonalization = () => setActiveSection("personalization");

  return (
    <div className="settings-app settings-mobile-native">
      <style>{settingsCss}</style>

      {activeSection === "home" && (
        <main className="settings-screen">
          <PageHeader title="Cài đặt" subtitle="Quản lý tài khoản và tuỳ chỉnh ứng dụng." />
          <AccountCard displayName={displayName} userEmail={userEmail} userPhotoURL={userPhotoURL} />
          <section className="settings-group">
            <p className="settings-group-label">Tuỳ chỉnh</p>
            <div className="settings-list-card">
              <NavRow icon={Palette} title="Cá nhân hóa" subtitle="Hình nền, màu sắc và thanh taskbar" onClick={openPersonalization} />
            </div>
          </section>
        </main>
      )}

      {activeSection === "personalization" && (
        <main className="settings-screen">
          <PageHeader title="Cá nhân hóa" subtitle="Các tuỳ chỉnh giao diện được tách riêng để dễ thao tác." backLabel="Cài đặt" onBack={goHome} />
          <section className="settings-group">
            <p className="settings-group-label">Giao diện</p>
            <div className="settings-list-card">
              <NavRow icon={Wallpaper} title="Hình nền" subtitle="Ảnh nền desktop" onClick={() => setActiveSection("background")} />
              <NavRow icon={Palette} title="Màu sắc" subtitle="Màu chủ đạo và hiệu ứng" onClick={() => setActiveSection("color")} />
              <NavRow icon={Monitor} title="Thanh taskbar" subtitle="Căn chỉnh và hành vi" onClick={() => setActiveSection("taskbar")} />
            </div>
          </section>
        </main>
      )}

      {activeSection === "background" && (
        <main className="settings-screen">
          <PageHeader title="Hình nền" backLabel="Cá nhân hóa" onBack={goPersonalization} />
          <BackgroundPanel />
        </main>
      )}

      {activeSection === "color" && (
        <main className="settings-screen">
          <PageHeader title="Màu sắc" backLabel="Cá nhân hóa" onBack={goPersonalization} />
          <ColorPanel accent={accent} setAccent={setAccent} />
        </main>
      )}

      {activeSection === "taskbar" && (
        <main className="settings-screen">
          <PageHeader title="Thanh taskbar" backLabel="Cá nhân hóa" onBack={goPersonalization} />
          <TaskbarPanel />
        </main>
      )}
    </div>
  );
}

export function CustomContextMenu({ onRefresh, onOpenSettings }: { onRefresh?: () => void; onOpenSettings?: () => void }) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      const menuWidth = 250;
      const menuHeight = 292;
      const x = Math.min(event.clientX, window.innerWidth - menuWidth - 10);
      const y = Math.min(event.clientY, window.innerHeight - menuHeight - 10);
      setMenu({ x, y });
    };
    const close = () => setMenu(null);
    window.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("click", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", close);
    };
  }, []);

  const items: ContextMenuItem[] = [
    { label: "Làm mới", icon: RefreshCcw, shortcut: "Ctrl+R", action: onRefresh },
    { label: "Dán", icon: Copy, shortcut: "Ctrl+V" },
    { label: "Tải xuống", icon: Download, divider: true },
    { label: "Cá nhân hóa", icon: Palette, action: onOpenSettings },
    { label: "Cài đặt", icon: Settings, action: onOpenSettings },
    { label: "Kiểm tra giao diện", icon: MousePointer2 },
  ];

  if (!menu) return null;
  return (
    <div className="custom-context-menu" style={{ left: menu.x, top: menu.y }} onClick={(event) => event.stopPropagation()}>
      <style>{contextMenuCss}</style>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <React.Fragment key={item.label}>
            {item.divider && <div className="context-divider" />}
            <button type="button" className="context-item" onClick={() => { item.action?.(); setMenu(null); }}>
              <span className="context-left">{Icon && <Icon size={16} />} {item.label}</span>
              {item.shortcut && <span className="context-shortcut">{item.shortcut}</span>}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

const contextMenuCss = `
  .custom-context-menu { position: fixed; z-index: 9999; width: 250px; padding: 7px; border: 1px solid #273244; border-radius: 14px; color: #f8fafc; background: #161616; box-shadow: 0 24px 70px rgba(0,0,0,.45); animation: contextIn .12s ease both; }
  @keyframes contextIn { from { opacity: 0; transform: translateY(6px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
  .context-divider { height: 1px; margin: 6px 4px; background: #2b3445; }
  .context-item { width: 100%; height: 34px; border: 0; border-radius: 9px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 10px; color: #f8fafc; background: transparent; font: inherit; font-size: 13px; cursor: pointer; }
  .context-item:hover { background: #2a2a2a; }
  .context-left { display: inline-flex; align-items: center; gap: 9px; }
  .context-left svg { color: var(--desktop-accent, #2563eb); }
  .context-shortcut { color: #a1a1aa; font-size: 12px; }
`;

const settingsCss = `
  body .settings-mobile-native {
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: auto;
    color: #0f172a;
    background: #f8fafc;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    -webkit-overflow-scrolling: touch;
  }

  body .settings-screen {
    min-height: 100%;
    padding: 18px 20px 110px;
    box-sizing: border-box;
    color: #0f172a;
    background: #f8fafc;
  }

  body .settings-page-header {
    margin-bottom: 18px;
  }

  body .settings-back-button {
    min-height: 40px;
    margin: 0 0 10px -6px;
    border: 0;
    border-radius: 12px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0 10px 0 6px;
    color: #475569;
    background: transparent;
    font: inherit;
    font-size: 14px;
    font-weight: 800;
    cursor: pointer;
  }

  body .settings-back-button:hover { background: #eef2f7; color: #0f172a; }

  body .settings-page-header h1 {
    margin: 0;
    color: #0f172a;
    font-size: clamp(28px, 5vw, 36px);
    line-height: 1.05;
    font-weight: 950;
    letter-spacing: -.045em;
  }

  body .settings-page-header p {
    margin: 7px 0 0;
    color: #64748b;
    font-size: 13px;
    line-height: 1.45;
  }

  body .settings-group {
    margin: 0 0 20px;
  }

  body .settings-group-label {
    margin: 0 0 8px;
    color: #64748b;
    font-size: 12px;
    line-height: 1.2;
    font-weight: 900;
    letter-spacing: .02em;
  }

  body .settings-list-card,
  body .settings-card,
  body .settings-account-card {
    width: 100%;
    border: 1px solid #d7dee8;
    border-radius: 16px;
    overflow: hidden;
    background: #ffffff;
    box-shadow: 0 10px 24px rgba(15, 23, 42, .045);
    box-sizing: border-box;
  }

  body .settings-account-card {
    min-height: 74px;
    display: grid;
    grid-template-columns: 54px minmax(0, 1fr);
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
  }

  body .settings-avatar {
    width: 54px;
    height: 54px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    color: #fff;
    background: linear-gradient(135deg, var(--desktop-accent, #ef4444), #64748b);
    overflow: hidden;
  }

  body .settings-avatar img { width: 100%; height: 100%; object-fit: cover; }
  body .settings-account-card strong,
  body .settings-account-card span { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  body .settings-account-card strong { color: #0f172a; font-size: 14px; line-height: 1.2; font-weight: 900; }
  body .settings-account-card span { margin-top: 4px; color: #64748b; font-size: 12px; }

  body .settings-nav-row,
  body .setting-row {
    width: 100%;
    min-height: 60px;
    border: 0;
    border-bottom: 1px solid #e2e8f0;
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    color: #0f172a;
    background: #ffffff;
    font: inherit;
    text-align: left;
    box-sizing: border-box;
    cursor: pointer;
  }

  body .settings-nav-row:last-child,
  body .setting-row:last-child { border-bottom: 0; }
  body .settings-nav-row:hover,
  body .settings-nav-row:active { background: #f1f5f9; }
  body .settings-nav-row > svg:first-child,
  body .setting-row-left > svg { color: var(--desktop-accent, #ef4444); width: 24px; height: 24px; stroke-width: 2.25; }
  body .settings-nav-row > svg:last-child { color: var(--desktop-accent, #ef4444); justify-self: end; }
  body .settings-nav-row div,
  body .setting-row-left div { min-width: 0; }
  body .settings-nav-row strong,
  body .setting-row-left strong { display: block; color: #0f172a; font-size: 14.5px; line-height: 1.2; font-weight: 900; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  body .settings-nav-row span,
  body .setting-row-left span { display: block; margin-top: 3px; color: #64748b; font-size: 12px; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  body .setting-row { cursor: default; grid-template-columns: minmax(0, 1fr) auto; }
  body .setting-row-left { min-width: 0; display: flex; align-items: center; gap: 12px; }
  body .setting-row-right { justify-self: end; display: flex; align-items: center; justify-content: flex-end; }

  body .toggle { width: 48px; height: 28px; border: 1px solid #cbd5e1; border-radius: 999px; padding: 3px; background: #e2e8f0; cursor: pointer; }
  body .toggle span { display: block; width: 20px; height: 20px; border-radius: 999px; background: #fff; box-shadow: 0 1px 3px rgba(15, 23, 42, .18); transition: .16s ease; }
  body .toggle.on { border-color: transparent; background: var(--desktop-accent, #ef4444); }
  body .toggle.on span { transform: translateX(20px); }

  body .select-wrap { position: relative; max-width: 150px; }
  body .select-button { min-width: 126px; max-width: 150px; height: 40px; border: 1px solid #d7dee8; border-radius: 10px; display: inline-flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 10px; color: #0f172a; background: #fff; font: inherit; font-size: 13px; cursor: pointer; }
  body .select-button span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  body .select-menu { position: absolute; right: 0; top: calc(100% + 6px); z-index: 50; min-width: 190px; padding: 6px; border: 1px solid #cbd5e1; border-radius: 12px; background: #fff; box-shadow: 0 18px 50px rgba(15,23,42,.16); }
  body .select-menu button { width: 100%; min-height: 40px; border: 0; border-radius: 8px; padding: 0 10px; color: #0f172a; background: transparent; text-align: left; font: inherit; font-size: 13px; cursor: pointer; }
  body .select-menu button:hover,
  body .select-menu button.active { background: #f1f5f9; }

  body .background-preview { height: 150px; margin: 14px; border: 1px solid #d7dee8; border-radius: 14px; display: grid; place-items: center; position: relative; overflow: hidden; color: #0f172a; background: #eef2f7; }
  body .background-preview span { position: relative; z-index: 2; font-weight: 900; }
  body .preview-glow { position: absolute; width: 160px; height: 160px; border-radius: 999px; background: var(--desktop-accent, #ef4444); filter: blur(58px); opacity: .25; }

  body .soft-button { min-height: 40px; border: 1px solid #d7dee8; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 0 12px; color: #0f172a; background: #fff; font: inherit; font-size: 13px; cursor: pointer; }
  body .soft-button:disabled { opacity: .55; cursor: not-allowed; }

  body .color-card { padding: 14px; }
  body .color-section-head,
  body .custom-color-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  body .color-section-head strong,
  body .custom-color-row strong { display: block; color: #0f172a; font-size: 14.5px; line-height: 1.2; font-weight: 900; }
  body .color-section-head span,
  body .custom-color-row span { display: block; margin-top: 3px; color: #64748b; font-size: 12px; line-height: 1.3; }
  body .accent-chip { width: 38px; height: 38px; border-radius: 10px; border: 2px solid rgba(255,255,255,.85); box-shadow: 0 0 0 1px #cbd5e1; }
  body .windows-color-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
  body .windows-color-grid button { width: 40px; height: 40px; border: 0; border-radius: 9px; display: grid; place-items: center; color: #fff; cursor: pointer; }
  body .custom-color-row { margin-top: 16px; padding-top: 14px; border-top: 1px solid #e2e8f0; }
  body .custom-color-actions { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
  body .custom-color-actions input { width: 44px; height: 40px; border: 0; padding: 0; background: transparent; }

  @media (max-width: 600px) {
    body .win-window:has(.settings-mobile-native),
    body .win-window:has(.settings-mobile-native) .win-titlebar,
    body .win-window:has(.settings-mobile-native) .win-body,
    body .win-window:has(.settings-mobile-native) .win-body.settings-mode {
      color: #0f172a !important;
      background: #f8fafc !important;
      border-color: #d7dee8 !important;
    }
    body .win-window:has(.settings-mobile-native) .win-titlebar { border-bottom: 1px solid #d7dee8 !important; }
    body .settings-screen { padding: 16px 16px 96px; }
    body .settings-page-header { margin-bottom: 18px; }
    body .settings-page-header h1 { font-size: 30px; }
  }
`;

export default SettingsApp;
