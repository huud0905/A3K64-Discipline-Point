import React, { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
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

const DEFAULT_TASKBAR_SETTINGS: TaskbarSettings = {
  searchMode: "box",
  taskView: true,
  widgets: false,
  resume: true,
  alignment: "center",
  autoHide: false,
  badges: true,
};

const DEFAULT_ACCENTS: Record<string, string> = {
  blue: "#2563eb",
  violet: "#7c3aed",
  pink: "#db2777",
  green: "#059669",
  amber: "#d97706",
  red: "#dc2626",
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
  const keys = [
    "login-theme",
    "login-theme-mode",
    "desktop-theme",
    "theme-mode",
    "theme",
    "app-theme",
    "color-mode",
  ];

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

  const normalized = raw.toLowerCase();
  return DEFAULT_ACCENTS[normalized] || null;
}

function readSharedAccent(currentAccent: string) {
  const loginAccent = localStorage.getItem("login-accent");
  const loginCustomAccent = localStorage.getItem("login-custom-accent");

  if (loginAccent?.toLowerCase() === "custom" && normalizeAccentValue(loginCustomAccent)) {
    return normalizeAccentValue(loginCustomAccent) || currentAccent;
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

  return currentAccent;
}

const WINDOWS_COLORS = [
  "#fbbf24",
  "#fb923c",
  "#f97316",
  "#ea580c",
  "#dc2626",
  "#ef4444",
  "#f43f5e",
  "#e11d48",
  "#0ea5e9",
  "#0284c7",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#9333ea",
  "#06b6d4",
  "#0891b2",
  "#14b8a6",
  "#10b981",
  "#059669",
  "#16a34a",
  "#15803d",
  "#64748b",
  "#52525b",
  "#78716c",
  "#475569",
  "#334155",
];

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
    return {
      ...DEFAULT_TASKBAR_SETTINGS,
      ...JSON.parse(localStorage.getItem("taskbar-settings") || "{}"),
    };
  } catch {
    return DEFAULT_TASKBAR_SETTINGS;
  }
}

function saveTaskbarSettings(nextSettings: TaskbarSettings) {
  localStorage.setItem("taskbar-settings", JSON.stringify(nextSettings));
  window.dispatchEvent(
    new CustomEvent("taskbar-settings-change", {
      detail: nextSettings,
    })
  );
}

function getDisplayName(email?: string | null, name?: string | null) {
  if (name && !name.includes("@")) return name;
  if (!email) return "Người dùng 12A3";
  return email.split("@")[0] || "Người dùng 12A3";
}

function SettingRow({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon?: React.ElementType;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="setting-row">
      <div className="setting-row-left">
        {Icon && <Icon size={20} />}
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
    <button type="button" className={`toggle ${checked ? "on" : ""}`} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

function SelectButton<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { label: string; value: T }[];
  onChange: (value: T) => void;
}) {
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

function BackgroundPanel() {
  return (
    <section className="settings-card">
      <div className="settings-card-title">
        <Wallpaper size={21} />
        <div>
          <h2>Hình nền</h2>
          <p>Tùy chỉnh nền desktop. Phần tải ảnh sẽ phát triển sau.</p>
        </div>
      </div>

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

  const recentColors = useMemo(() => {
    const stored = localStorage.getItem("recent-accents");
    if (!stored) return ["#06b6d4", "#52525b", "#ef4444", "#db2777"];
    try {
      return JSON.parse(stored) as string[];
    } catch {
      return ["#06b6d4", "#52525b", "#ef4444", "#db2777"];
    }
  }, [accent]);

  const applyAccent = (color: string) => {
    setAccent(color);
    setCustomColor(color);
    saveAccentToStorage(color);
    const nextRecent = [color, ...recentColors.filter((item) => item.toLowerCase() !== color.toLowerCase())].slice(0, 4);
    localStorage.setItem("recent-accents", JSON.stringify(nextRecent));
  };

  return (
    <section className="settings-card">
      <div className="settings-card-title">
        <Palette size={21} />
        <div>
          <h2>Màu sắc</h2>
          <p>Đổi màu chủ đạo cho desktop, taskbar, cửa sổ và các ứng dụng.</p>
        </div>
      </div>

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
        <Toggle
          checked={transparency}
          onChange={(value) => {
            setTransparency(value);
            localStorage.setItem("desktop-transparency", value ? "on" : "off");
          }}
        />
      </SettingRow>

      <div className="color-section">
        <div className="color-section-head">
          <div>
            <strong>Màu chủ đạo</strong>
            <span>Chọn thủ công hoặc dùng màu tùy chỉnh.</span>
          </div>
          <span className="accent-chip" style={{ background: accent }} />
        </div>

        <p className="color-label">Màu gần đây</p>
        <div className="recent-colors">
          {recentColors.map((color) => (
            <button key={color} type="button" style={{ background: color }} onClick={() => applyAccent(color)}>
              {accent.toLowerCase() === color.toLowerCase() && <Check size={18} />}
            </button>
          ))}
        </div>

        <p className="color-label">Bảng màu</p>
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
            <input
              type="color"
              value={customColor}
              onChange={(event) => {
                setCustomColor(event.target.value);
                applyAccent(event.target.value);
              }}
            />
            <button type="button" className="soft-button" onClick={() => applyAccent(customColor)}>
              Xem màu
            </button>
          </div>
        </div>
      </div>

      <SettingRow title="Hiện màu chủ đạo trên Start và thanh taskbar">
        <Toggle
          checked={showOnTaskbar}
          onChange={(value) => {
            setShowOnTaskbar(value);
            localStorage.setItem("accent-taskbar", value ? "on" : "off");
          }}
        />
      </SettingRow>

      <SettingRow title="Hiện màu chủ đạo trên thanh tiêu đề và viền cửa sổ">
        <Toggle
          checked={showOnBorders}
          onChange={(value) => {
            setShowOnBorders(value);
            localStorage.setItem("accent-borders", value ? "on" : "off");
          }}
        />
      </SettingRow>
    </section>
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
    <section className="settings-card">
      <div className="settings-card-title pinned-title">
        <Monitor size={21} />
        <div>
          <h2>Thanh taskbar</h2>
          <p>Tùy chỉnh biểu tượng, căn chỉnh, thông báo và hành vi của taskbar.</p>
        </div>
      </div>

      <div className="taskbar-group">
        <div className="taskbar-group-head">
          <strong>Mục trên taskbar</strong>
          <span>Hiện hoặc ẩn các nút xuất hiện trên taskbar.</span>
        </div>

        <SettingRow icon={Search} title="Tìm kiếm">
          <SelectButton
            value={settings.searchMode}
            onChange={(value) => updateSetting("searchMode", value)}
            options={[
              { label: "Chỉ biểu tượng tìm kiếm", value: "icon" },
              { label: "Ô tìm kiếm", value: "box" },
            ]}
          />
        </SettingRow>

        <SettingRow icon={Copy} title="Chế độ xem tác vụ">
          <Toggle checked={settings.taskView} onChange={(value) => updateSetting("taskView", value)} />
        </SettingRow>

        <SettingRow icon={Sparkles} title="Tiện ích">
          <Toggle checked={settings.widgets} onChange={(value) => updateSetting("widgets", value)} />
        </SettingRow>

        <SettingRow icon={Monitor} title="Tiếp tục" subtitle="Hiện ứng dụng có thông báo tiếp tục khi khả dụng">
          <Toggle checked={settings.resume} onChange={(value) => updateSetting("resume", value)} />
        </SettingRow>
      </div>

      <div className="taskbar-group">
        <div className="taskbar-group-head">
          <strong>Hành vi của taskbar</strong>
          <span>Căn chỉnh taskbar, huy hiệu, tự động ẩn và nhiều màn hình.</span>
        </div>

        <SettingRow title="Căn chỉnh taskbar">
          <SelectButton
            value={settings.alignment}
            onChange={(value) => updateSetting("alignment", value)}
            options={[
              { label: "Trái", value: "left" },
              { label: "Giữa", value: "center" },
            ]}
          />
        </SettingRow>

        <SettingRow title="Tự động ẩn taskbar">
          <Toggle checked={settings.autoHide} onChange={(value) => updateSetting("autoHide", value)} />
        </SettingRow>

        <SettingRow title="Hiện huy hiệu trên ứng dụng taskbar">
          <Toggle checked={settings.badges} onChange={(value) => updateSetting("badges", value)} />
        </SettingRow>
      </div>
    </section>
  );
}

export function SettingsApp({ accent, setAccent, userEmail, userName, userPhotoURL }: SettingsAppProps) {
  const [activeSection, setActiveSection] = useState<"personalization" | "background" | "color" | "taskbar">("personalization");

  const displayName = getDisplayName(userEmail, userName);

  const personalizationCards = [
    { key: "background", title: "Hình nền", subtitle: "Ảnh nền desktop", icon: Wallpaper },
    { key: "color", title: "Màu sắc", subtitle: "Màu chủ đạo và hiệu ứng", icon: Palette },
    { key: "taskbar", title: "Thanh taskbar", subtitle: "Căn chỉnh và hành vi", icon: Monitor },
  ] as const;

  return (
    <div className="settings-app">
      <style>{settingsCss}</style>
      <div className="settings-layout">
        <aside className="settings-sidebar windows-like">
          <div className="settings-topline">
            <Settings size={19} />
            <strong>Cài đặt</strong>
          </div>

          <div className="profile-card">
            <div className="profile-avatar">
              {userPhotoURL ? <img src={userPhotoURL} alt="Avatar" /> : <UserRound size={34} />}
            </div>
            <div>
              <strong>{displayName}</strong>
              <span>{userEmail || "Đang đăng nhập"}</span>
            </div>
          </div>

          <nav className="windows-settings-nav">
            <button
              type="button"
              className={["personalization", "background", "color", "taskbar"].includes(activeSection) ? "active" : ""}
              onClick={() => setActiveSection("personalization")}
            >
              <Palette size={18} />
              <span>Cá nhân hóa</span>
            </button>
          </nav>
        </aside>

        <main className="settings-content">
          {activeSection === "personalization" && (
            <>
              <div className="settings-breadcrumb">
                <button type="button" onClick={() => setActiveSection("personalization")}>Cài đặt</button>
                <ChevronRight size={18} />
                <span>Cá nhân hóa</span>
              </div>
              <h1>Cá nhân hóa</h1>
              <div className="personalization-grid compact">
                {personalizationCards.map((section) => {
                  const Icon = section.icon;
                  return (
                    <button key={section.key} type="button" className="personal-card" onClick={() => setActiveSection(section.key)}>
                      <Icon size={24} />
                      <div>
                        <strong>{section.title}</strong>
                        <span>{section.subtitle}</span>
                      </div>
                      <ChevronRight size={18} />
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {activeSection === "background" && (
            <>
              <div className="settings-breadcrumb">
                <button type="button" onClick={() => setActiveSection("personalization")}>Cá nhân hóa</button>
                <ChevronRight size={18} />
                <span>Hình nền</span>
              </div>
              <BackgroundPanel />
            </>
          )}

          {activeSection === "color" && (
            <>
              <div className="settings-breadcrumb">
                <button type="button" onClick={() => setActiveSection("personalization")}>Cá nhân hóa</button>
                <ChevronRight size={18} />
                <span>Màu sắc</span>
              </div>
              <ColorPanel accent={accent} setAccent={setAccent} />
            </>
          )}

          {activeSection === "taskbar" && (
            <>
              <div className="settings-breadcrumb">
                <button type="button" onClick={() => setActiveSection("personalization")}>Cá nhân hóa</button>
                <ChevronRight size={18} />
                <span>Thanh taskbar</span>
              </div>
              <TaskbarPanel />
            </>
          )}
        </main>
      </div>
    </div>
  );
}

type ContextMenuItem = {
  label: string;
  icon?: React.ElementType;
  shortcut?: string;
  action?: () => void;
  divider?: boolean;
};

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
            <button
              type="button"
              className="context-item"
              onClick={() => {
                item.action?.();
                setMenu(null);
              }}
            >
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
  .custom-context-menu {
    position: fixed;
    z-index: 9999;
    width: 250px;
    padding: 7px;
    border: 1px solid #273244;
    border-radius: 14px;
    color: #f8fafc;
    background: #161616;
    box-shadow: 0 24px 70px rgba(0,0,0,.45);
    animation: contextIn .12s ease both;
  }

  @keyframes contextIn {
    from { opacity: 0; transform: translateY(6px) scale(.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  .context-divider {
    height: 1px;
    margin: 6px 4px;
    background: #2b3445;
  }

  .context-item {
    width: 100%;
    height: 34px;
    border: 0;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 10px;
    color: #f8fafc;
    background: transparent;
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }

  .context-item:hover {
    background: #2a2a2a;
  }

  .context-left {
    display: inline-flex;
    align-items: center;
    gap: 9px;
  }

  .context-left svg {
    color: var(--desktop-accent, #2563eb);
  }

  .context-shortcut {
    color: #a1a1aa;
    font-size: 12px;
  }
`;

const settingsCss = `
  .settings-app {
    height: 100%;
    min-height: 0;
    overflow: hidden;
    color: #f8fafc;
    background: #050914;
  }

  .settings-layout {
    height: 100%;
    display: grid;
    grid-template-columns: 320px 1fr;
    min-height: 0;
    background: #050914;
  }

  .settings-sidebar {
    border-right: 1px solid #1f2937;
    padding: 18px 14px;
    background: #050914;
    overflow-y: auto;
  }

  .settings-topline {
    height: 34px;
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }

  .settings-topline svg {
    color: var(--desktop-accent);
  }

  .profile-card {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 12px;
    min-height: 76px;
    margin-bottom: 14px;
    padding: 12px;
    border: 1px solid #1f2937;
    border-radius: 8px;
    background: #0b1220;
  }

  .profile-avatar {
    width: 58px;
    height: 58px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    color: #fff;
    background: linear-gradient(135deg, var(--desktop-accent), #64748b);
    overflow: hidden;
  }

  .profile-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .profile-card strong,
  .profile-card span {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .profile-card span {
    color: #cbd5e1;
    font-size: 12px;
    margin-top: 3px;
  }

  .windows-settings-nav {
    display: grid;
    gap: 4px;
  }

  .windows-settings-nav button {
    height: 42px;
    border: 0;
    border-radius: 7px;
    display: flex;
    align-items: center;
    gap: 13px;
    padding: 0 12px;
    color: #f8fafc;
    background: transparent;
    font: inherit;
    cursor: pointer;
    text-align: left;
    position: relative;
  }

  .windows-settings-nav button svg {
    color: var(--desktop-accent);
  }

  .windows-settings-nav button:hover,
  .windows-settings-nav button.active {
    background: #111827;
  }

  .windows-settings-nav button.active::before {
    content: "";
    width: 3px;
    height: 18px;
    border-radius: 999px;
    background: var(--desktop-accent);
    position: absolute;
    left: 0;
  }

  .settings-content {
    min-width: 0;
    min-height: 0;
    overflow: auto;
    padding: 0;
    background: #050914;
  }

  .settings-breadcrumb {
    position: sticky;
    top: 0;
    z-index: 40;
    display: flex;
    align-items: center;
    gap: 8px;
    color: #cbd5e1;
    margin: 0 0 16px;
    padding: 14px 20px;
    font-size: 14px;
    background: #050914;
    border-bottom: 1px solid #1f2937;
  }

  .settings-breadcrumb button {
    border: 0;
    padding: 0;
    color: #cbd5e1;
    background: transparent;
    font: inherit;
    cursor: pointer;
  }

  .settings-breadcrumb button:hover {
    color: #f8fafc;
    text-decoration: underline;
  }

  .settings-breadcrumb span {
    color: #f8fafc;
  }

  .settings-content > h1 {
    margin: 0 0 22px;
    padding: 0 20px;
    font-size: 34px;
    letter-spacing: -.04em;
  }

  .personalization-grid {
    display: grid;
    gap: 12px;
    padding: 0 20px 20px;
  }

  .personal-card {
    min-height: 66px;
    border: 1px solid #273244;
    border-radius: 14px;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 14px;
    padding: 12px 14px;
    color: #f8fafc;
    background: #111827;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .personal-card:hover {
    background: #172033;
  }

  .personal-card svg {
    color: var(--desktop-accent);
    width: 24px;
    height: 24px;
  }

  .personal-card strong,
  .personal-card span {
    display: block;
  }

  .personal-card span {
    margin-top: 4px;
    color: #94a3b8;
    font-size: 13px;
  }

  .settings-card {
    border-top: 1px solid #273244;
    border-bottom: 1px solid #273244;
    border-left: 0;
    border-right: 0;
    border-radius: 0;
    overflow: visible;
    background: #0b1220;
  }

  .settings-card-title {
    display: flex;
    gap: 12px;
    padding: 18px;
    border-bottom: 1px solid #273244;
    background: #0b1220;
  }

  .settings-card-title.pinned-title {
    position: sticky;
    top: 49px;
    z-index: 35;
  }

  .settings-card-title svg {
    color: var(--desktop-accent);
  }

  .settings-card-title h2 {
    margin: 0;
    font-size: 22px;
  }

  .settings-card-title p {
    margin: 4px 0 0;
    color: #94a3b8;
    font-size: 13px;
  }

  .setting-row {
    min-height: 66px;
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 16px;
    padding: 12px 18px;
    border-bottom: 1px solid #1f2937;
  }

  .setting-row-left {
    display: flex;
    align-items: center;
    gap: 13px;
    min-width: 0;
  }

  .setting-row-left svg {
    color: #cbd5e1;
  }

  .setting-row-left strong,
  .setting-row-left span {
    display: block;
  }

  .setting-row-left span {
    margin-top: 3px;
    color: #94a3b8;
    font-size: 12px;
  }

  .setting-row-right {
    display: flex;
    justify-content: flex-end;
  }

  .toggle {
    width: 46px;
    height: 24px;
    border: 1px solid #334155;
    border-radius: 999px;
    padding: 2px;
    background: #111827;
    cursor: pointer;
  }

  .toggle span {
    display: block;
    width: 18px;
    height: 18px;
    border-radius: 999px;
    background: #d1d5db;
    transition: .16s ease;
  }

  .toggle.on {
    background: var(--desktop-accent);
    border-color: transparent;
  }

  .toggle.on span {
    transform: translateX(20px);
    background: #fff;
  }

  .select-wrap {
    position: relative;
  }

  .select-button {
    min-width: 152px;
    height: 36px;
    border: 1px solid #273244;
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 12px;
    color: #f8fafc;
    background: #111827;
    font: inherit;
    cursor: pointer;
  }

  .select-menu {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    z-index: 20;
    min-width: 210px;
    padding: 6px;
    border: 1px solid #273244;
    border-radius: 10px;
    background: #161616;
    box-shadow: 0 18px 50px rgba(0,0,0,.35);
  }

  .select-menu button {
    width: 100%;
    height: 34px;
    border: 0;
    border-radius: 7px;
    padding: 0 10px;
    color: #f8fafc;
    background: transparent;
    text-align: left;
    font: inherit;
    cursor: pointer;
  }

  .select-menu button:hover,
  .select-menu button.active {
    background: #2a2a2a;
  }

  .background-preview {
    height: 190px;
    margin: 18px;
    border: 1px solid #273244;
    border-radius: 18px;
    display: grid;
    place-items: center;
    position: relative;
    overflow: hidden;
    background: #050914;
  }

  .background-preview span {
    position: relative;
    z-index: 2;
    font-weight: 800;
  }

  .preview-glow {
    position: absolute;
    width: 180px;
    height: 180px;
    border-radius: 999px;
    background: var(--desktop-accent);
    filter: blur(60px);
    opacity: .32;
  }

  .soft-button {
    min-height: 36px;
    border: 1px solid #273244;
    border-radius: 9px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0 12px;
    color: #f8fafc;
    background: #111827;
    font: inherit;
    cursor: pointer;
  }

  .soft-button:disabled {
    opacity: .55;
    cursor: not-allowed;
  }

  .color-section {
    padding: 18px;
    border-bottom: 1px solid #1f2937;
  }

  .color-section-head,
  .custom-color-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .color-section-head strong,
  .custom-color-row strong,
  .color-section-head span,
  .custom-color-row span {
    display: block;
  }

  .color-section-head span,
  .custom-color-row span {
    color: #94a3b8;
    font-size: 12px;
    margin-top: 3px;
  }

  .accent-chip {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    border: 2px solid rgba(255,255,255,.70);
  }

  .color-label {
    margin: 20px 0 10px;
    color: #cbd5e1;
    font-size: 13px;
    font-weight: 800;
  }

  .recent-colors,
  .windows-color-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .recent-colors button,
  .windows-color-grid button {
    width: 44px;
    height: 44px;
    border: 0;
    border-radius: 5px;
    display: grid;
    place-items: center;
    color: #fff;
    cursor: pointer;
  }

  .windows-color-grid {
    max-width: 390px;
  }

  .custom-color-row {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid #1f2937;
  }

  .custom-color-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .custom-color-actions input {
    width: 48px;
    height: 36px;
    border: 0;
    padding: 0;
    background: transparent;
  }

  .taskbar-group {
    border-bottom: 1px solid #1f2937;
  }

  .taskbar-group-head {
    padding: 16px 18px 8px;
  }

  .taskbar-group-head strong,
  .taskbar-group-head span {
    display: block;
  }

  .taskbar-group-head span {
    color: #94a3b8;
    font-size: 12px;
    margin-top: 3px;
  }


  /* Light mode for Settings: solid surfaces, readable contrast */
  .win-root.theme-light .settings-app,
  .win-root.theme-light .settings-layout,
  .win-root.theme-light .settings-content,
  .win-root.theme-light .settings-breadcrumb {
    color: #0f172a;
    background: #f8fafc;
  }

  .win-root.theme-light .settings-sidebar {
    color: #0f172a;
    border-right-color: #d7dee8;
    background: #f1f5f9;
  }

  .win-root.theme-light .profile-card,
  .win-root.theme-light .personal-card,
  .win-root.theme-light .settings-card,
  .win-root.theme-light .settings-card-title,
  .win-root.theme-light .select-button,
  .win-root.theme-light .soft-button {
    color: #0f172a;
    border-color: #d7dee8;
    background: #ffffff;
  }

  .win-root.theme-light .windows-settings-nav button {
    color: #0f172a;
  }

  .win-root.theme-light .windows-settings-nav button:hover,
  .win-root.theme-light .windows-settings-nav button.active,
  .win-root.theme-light .personal-card:hover,
  .win-root.theme-light .soft-button:hover {
    background: #e2e8f0;
  }

  .win-root.theme-light .settings-breadcrumb,
  .win-root.theme-light .settings-card-title,
  .win-root.theme-light .setting-row,
  .win-root.theme-light .color-section,
  .win-root.theme-light .taskbar-group,
  .win-root.theme-light .custom-color-row {
    border-color: #d7dee8;
  }

  .win-root.theme-light .settings-breadcrumb button,
  .win-root.theme-light .settings-breadcrumb {
    color: #475569;
  }

  .win-root.theme-light .settings-breadcrumb span,
  .win-root.theme-light .settings-breadcrumb button:hover {
    color: #0f172a;
  }

  .win-root.theme-light .profile-card span,
  .win-root.theme-light .personal-card span,
  .win-root.theme-light .settings-card-title p,
  .win-root.theme-light .setting-row-left span,
  .win-root.theme-light .color-section-head span,
  .win-root.theme-light .custom-color-row span,
  .win-root.theme-light .taskbar-group-head span {
    color: #64748b;
  }

  .win-root.theme-light .toggle {
    border-color: #cbd5e1;
    background: #e2e8f0;
  }

  .win-root.theme-light .toggle span {
    background: #ffffff;
    box-shadow: 0 1px 3px rgba(15,23,42,.18);
  }

  .win-root.theme-light .toggle.on {
    background: var(--desktop-accent);
  }

  .win-root.theme-light .select-menu,
  .win-root.theme-light .custom-context-menu {
    color: #0f172a;
    border-color: #cbd5e1;
    background: #ffffff;
  }

  .win-root.theme-light .select-menu button,
  .win-root.theme-light .context-item {
    color: #0f172a;
  }

  .win-root.theme-light .select-menu button:hover,
  .win-root.theme-light .select-menu button.active,
  .win-root.theme-light .context-item:hover {
    background: #e2e8f0;
  }

  .win-root.theme-light .context-shortcut {
    color: #64748b;
  }

  .win-root.theme-light .context-divider {
    background: #e2e8f0;
  }

  .win-root.theme-light .background-preview {
    color: #0f172a;
    border-color: #d7dee8;
    background: #e2e8f0;
  }

  @media (max-width: 820px) {
    .settings-layout {
      grid-template-columns: 1fr;
    }

    .settings-sidebar {
      border-right: 0;
      border-bottom: 1px solid #1f2937;
      max-height: 220px;
    }

    .setting-row {
      grid-template-columns: 1fr;
    }

    .setting-row-right {
      justify-content: flex-start;
    }
  }
`;

export default SettingsApp;
