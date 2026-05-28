import React, { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Image,
  Info,
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
type DesktopPage = "personalization" | "background" | "color" | "taskbar" | "system" | "display" | "about";
type PhonePage = "home" | DesktopPage;

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

const WINDOWS_COLORS = [
  "#fbbf24", "#fb923c", "#f97316", "#ea580c", "#dc2626", "#ef4444", "#f43f5e", "#e11d48",
  "#0ea5e9", "#0284c7", "#6366f1", "#8b5cf6", "#a855f7", "#9333ea", "#06b6d4", "#0891b2",
  "#14b8a6", "#10b981", "#059669", "#16a34a", "#15803d", "#64748b", "#52525b", "#78716c",
  "#475569", "#334155",
];

const PERSONALIZATION_ITEMS = [
  { key: "background" as const, title: "Hình nền", subtitle: "Ảnh nền desktop", icon: Wallpaper },
  { key: "color" as const, title: "Màu sắc", subtitle: "Màu chủ đạo và hiệu ứng", icon: Palette },
  { key: "taskbar" as const, title: "Thanh taskbar", subtitle: "Căn chỉnh và hành vi", icon: Monitor },
];

const SYSTEM_ITEMS = [
  { key: "display" as const, title: "Màn hình", subtitle: "Độ hiển thị và bố cục", icon: Monitor },
  { key: "about" as const, title: "Giới thiệu", subtitle: "Thông tin ứng dụng", icon: Info },
];

function normalizeThemeMode(value: string | null): ThemeMode | null {
  if (!value) return null;
  const normalized = value.toLowerCase().trim();
  if (["light", "sang", "sáng"].includes(normalized)) return "light";
  if (["dark", "toi", "tối"].includes(normalized)) return "dark";
  if (["auto", "system", "he-thong", "hệ thống", "hethong"].includes(normalized)) return "auto";
  return null;
}

function readSharedThemeMode(): ThemeMode {
  for (const key of ["login-theme", "login-theme-mode", "desktop-theme", "theme-mode", "theme", "app-theme", "color-mode"]) {
    const mode = normalizeThemeMode(localStorage.getItem(key));
    if (mode) return mode;
  }
  return "dark";
}

function isHexColor(value: string | null | undefined) {
  return !!value && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

function normalizeAccentValue(value: string | null | undefined) {
  if (!value) return null;
  const raw = value.trim();
  if (isHexColor(raw)) {
    const body = raw.slice(1);
    return body.length === 3 ? `#${body.split("").map((x) => x + x).join("")}`.toLowerCase() : raw.toLowerCase();
  }
  return DEFAULT_ACCENTS[raw.toLowerCase()] || null;
}

function readSharedAccent(currentAccent: string) {
  const loginAccent = localStorage.getItem("login-accent");
  const loginCustomAccent = localStorage.getItem("login-custom-accent");
  if (loginAccent?.toLowerCase() === "custom" && normalizeAccentValue(loginCustomAccent)) return normalizeAccentValue(loginCustomAccent) || currentAccent;
  for (const key of ["login-accent-color", "desktop-accent", "desktop-accent-color", "accent-color", "login-custom-accent", "custom-accent", "customAccent", "desktop-custom-accent", "login-accent", "accent"]) {
    const color = normalizeAccentValue(localStorage.getItem(key));
    if (color) return color;
  }
  return normalizeAccentValue(currentAccent) || DEFAULT_ACCENTS.blue;
}

function saveAccentToStorage(color: string) {
  const normalized = normalizeAccentValue(color) || DEFAULT_ACCENTS.blue;
  const match = Object.entries(DEFAULT_ACCENTS).find(([, value]) => value.toLowerCase() === normalized.toLowerCase());
  const accentKey = match?.[0] || "custom";
  localStorage.setItem("desktop-accent", normalized);
  localStorage.setItem("desktop-accent-color", normalized);
  localStorage.setItem("desktop-custom-accent", normalized);
  localStorage.setItem("login-accent", accentKey);
  localStorage.setItem("login-accent-color", normalized);
  localStorage.setItem("login-custom-accent", normalized);
  localStorage.setItem("custom-accent", normalized);
  localStorage.setItem("customAccent", normalized);
  localStorage.setItem("accent-color", normalized);
  localStorage.setItem("accent", accentKey);
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

function isPhoneViewport() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 760px)").matches || Boolean(document.querySelector(".win-root.a3-real-mobile"));
}

function usePhoneViewport() {
  const [phone, setPhone] = useState(isPhoneViewport);
  useEffect(() => {
    const update = () => setPhone(isPhoneViewport());
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    window.matchMedia?.("(max-width: 760px)").addEventListener?.("change", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.matchMedia?.("(max-width: 760px)").removeEventListener?.("change", update);
    };
  }, []);
  return phone;
}

function AccountCard({ displayName, userEmail, userPhotoURL }: { displayName: string; userEmail?: string | null; userPhotoURL?: string | null }) {
  return (
    <div className="profile-card">
      <div className="profile-avatar">{userPhotoURL ? <img src={userPhotoURL} alt="Avatar" /> : <UserRound size={34} />}</div>
      <div><strong>{displayName}</strong><span>{userEmail || "Đang đăng nhập"}</span></div>
    </div>
  );
}

function SettingRow({ icon: Icon, title, subtitle, children }: { icon?: React.ElementType; title: string; subtitle?: string; children?: React.ReactNode }) {
  return <div className="setting-row"><div className="setting-row-left">{Icon && <Icon size={20} />}<div><strong>{title}</strong>{subtitle && <span>{subtitle}</span>}</div></div><div className="setting-row-right">{children}</div></div>;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return <button type="button" className={`toggle ${checked ? "on" : ""}`} onClick={() => onChange(!checked)}><span /></button>;
}

function SelectButton<T extends string>({ value, options, onChange }: { value: T; options: { label: string; value: T }[]; onChange: (value: T) => void }) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value) || options[0];
  return <div className="select-wrap"><button type="button" className="select-button" onClick={() => setOpen((x) => !x)}><span>{current.label}</span><ChevronDown size={15} /></button>{open && <div className="select-menu">{options.map((option) => <button key={option.value} type="button" className={option.value === value ? "active" : ""} onClick={() => { onChange(option.value); setOpen(false); }}>{option.label}</button>)}</div>}</div>;
}

function NavCard({ title, subtitle, icon: Icon, onClick }: { title: string; subtitle: string; icon: React.ElementType; onClick: () => void }) {
  return <button type="button" className="personal-card" onClick={onClick}><Icon size={24} /><div><strong>{title}</strong><span>{subtitle}</span></div><ChevronRight size={18} /></button>;
}

function PhoneHeader({ title, subtitle, backLabel, onBack }: { title: string; subtitle?: string; backLabel?: string; onBack?: () => void }) {
  return <header className="phone-header">{onBack && <button type="button" className="phone-back" onClick={onBack}><ChevronLeft size={20} /><span>{backLabel || "Quay lại"}</span></button>}<h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</header>;
}

function BackgroundPanel() {
  return <section className="settings-card"><div className="settings-card-title"><Wallpaper size={21} /><div><h2>Hình nền</h2><p>Tùy chỉnh nền desktop. Phần tải ảnh sẽ phát triển sau.</p></div></div><div className="background-preview"><div className="preview-glow" /><span>Xem trước hình nền</span></div><SettingRow icon={Image} title="Chọn hình nền" subtitle="Tải ảnh cá nhân để đặt làm hình nền desktop"><button type="button" className="soft-button" disabled><Upload size={16} /> Sắp có</button></SettingRow></section>;
}

function ColorPanel({ accent, setAccent }: SettingsAppProps) {
  const [mode, setMode] = useState<ThemeMode>(readSharedThemeMode);
  const [transparency, setTransparency] = useState(localStorage.getItem("desktop-transparency") !== "off");
  const [showOnTaskbar, setShowOnTaskbar] = useState(localStorage.getItem("accent-taskbar") === "on");
  const [showOnBorders, setShowOnBorders] = useState(localStorage.getItem("accent-borders") === "on");
  const [customColor, setCustomColor] = useState(readSharedAccent(accent));
  const [recentTick, setRecentTick] = useState(0);

  useEffect(() => {
    const syncAppearance = () => { setMode(readSharedThemeMode()); setCustomColor(readSharedAccent(accent)); setRecentTick((x) => x + 1); };
    ["storage", "accent-change", "login-accent-change", "desktop-theme-change", "login-theme-change", "appearance-change"].forEach((event) => window.addEventListener(event, syncAppearance));
    return () => ["storage", "accent-change", "login-accent-change", "desktop-theme-change", "login-theme-change", "appearance-change"].forEach((event) => window.removeEventListener(event, syncAppearance));
  }, [accent]);

  const recentColors = useMemo(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("recent-accents") || "[]") as string[];
      return stored.length ? stored : ["#06b6d4", "#52525b", "#ef4444", "#db2777"];
    } catch {
      return ["#06b6d4", "#52525b", "#ef4444", "#db2777"];
    }
  }, [accent, recentTick]);

  const applyAccent = (color: string) => {
    const normalized = normalizeAccentValue(color) || DEFAULT_ACCENTS.blue;
    setAccent(normalized);
    setCustomColor(normalized);
    saveAccentToStorage(normalized);
    const nextRecent = [normalized, ...recentColors.filter((item) => item.toLowerCase() !== normalized.toLowerCase())].slice(0, 4);
    localStorage.setItem("recent-accents", JSON.stringify(nextRecent));
    setRecentTick((x) => x + 1);
  };

  return (
    <section className="settings-card">
      <div className="settings-card-title"><Palette size={21} /><div><h2>Màu sắc</h2><p>Đổi màu chủ đạo cho desktop, taskbar, cửa sổ và các ứng dụng.</p></div></div>
      <SettingRow icon={Monitor} title="Chọn chế độ" subtitle="Đổi màu giao diện hiển thị trong hệ thống">
        <SelectButton value={mode} onChange={(value) => { setMode(value); ["desktop-theme", "login-theme", "login-theme-mode", "theme-mode", "theme"].forEach((key) => localStorage.setItem(key, value)); window.dispatchEvent(new Event("desktop-theme-change")); window.dispatchEvent(new Event("login-theme-change")); window.dispatchEvent(new Event("appearance-change")); }} options={[{ label: "Tối", value: "dark" }, { label: "Sáng", value: "light" }, { label: "Tự động", value: "auto" }]} />
      </SettingRow>
      <SettingRow icon={Sparkles} title="Hiệu ứng trong suốt" subtitle="Cửa sổ và bề mặt có hiệu ứng kính mờ"><Toggle checked={transparency} onChange={(value) => { setTransparency(value); localStorage.setItem("desktop-transparency", value ? "on" : "off"); }} /></SettingRow>
      <div className="color-section">
        <div className="color-section-head"><div><strong>Màu chủ đạo</strong><span>Chọn thủ công hoặc dùng màu tùy chỉnh.</span></div><span className="accent-chip" style={{ background: accent }} /></div>
        <p className="color-label">Màu gần đây</p>
        <div className="recent-colors">{recentColors.map((color) => <button key={color} type="button" style={{ background: color }} onClick={() => applyAccent(color)}>{accent.toLowerCase() === color.toLowerCase() && <Check size={18} />}</button>)}</div>
        <p className="color-label">Bảng màu</p>
        <div className="windows-color-grid">{WINDOWS_COLORS.map((color) => <button key={color} type="button" style={{ background: color }} onClick={() => applyAccent(color)}>{accent.toLowerCase() === color.toLowerCase() && <Check size={17} />}</button>)}</div>
        <div className="custom-color-row"><div><strong>Màu tùy chỉnh</strong><span>Chọn màu bất kỳ bằng bảng màu.</span></div><div className="custom-color-actions"><input type="color" value={customColor || accent} onChange={(event) => { setCustomColor(event.target.value); applyAccent(event.target.value); }} /><button type="button" className="soft-button" onClick={() => applyAccent(customColor || accent)}>Xem màu</button></div></div>
      </div>
      <SettingRow title="Hiện màu chủ đạo trên Start và thanh taskbar"><Toggle checked={showOnTaskbar} onChange={(value) => { setShowOnTaskbar(value); localStorage.setItem("accent-taskbar", value ? "on" : "off"); }} /></SettingRow>
      <SettingRow title="Hiện màu chủ đạo trên thanh tiêu đề và viền cửa sổ"><Toggle checked={showOnBorders} onChange={(value) => { setShowOnBorders(value); localStorage.setItem("accent-borders", value ? "on" : "off"); }} /></SettingRow>
    </section>
  );
}

function TaskbarPanel() {
  const [settings, setSettings] = useState<TaskbarSettings>(readTaskbarSettings);
  const updateSetting = <K extends keyof TaskbarSettings>(key: K, value: TaskbarSettings[K]) => { const nextSettings = { ...settings, [key]: value }; setSettings(nextSettings); saveTaskbarSettings(nextSettings); };
  return <section className="settings-card"><div className="settings-card-title pinned-title"><Monitor size={21} /><div><h2>Thanh taskbar</h2><p>Tùy chỉnh biểu tượng, căn chỉnh, thông báo và hành vi của taskbar.</p></div></div><div className="taskbar-group"><div className="taskbar-group-head"><strong>Mục trên taskbar</strong><span>Hiện hoặc ẩn các nút xuất hiện trên taskbar.</span></div><SettingRow icon={Search} title="Tìm kiếm"><SelectButton value={settings.searchMode} onChange={(value) => updateSetting("searchMode", value)} options={[{ label: "Chỉ biểu tượng tìm kiếm", value: "icon" }, { label: "Ô tìm kiếm", value: "box" }]} /></SettingRow><SettingRow icon={Copy} title="Chế độ xem tác vụ"><Toggle checked={settings.taskView} onChange={(value) => updateSetting("taskView", value)} /></SettingRow><SettingRow icon={Sparkles} title="Tiện ích"><Toggle checked={settings.widgets} onChange={(value) => updateSetting("widgets", value)} /></SettingRow><SettingRow icon={Monitor} title="Tiếp tục" subtitle="Hiện ứng dụng có thông báo tiếp tục khi khả dụng"><Toggle checked={settings.resume} onChange={(value) => updateSetting("resume", value)} /></SettingRow></div><div className="taskbar-group"><div className="taskbar-group-head"><strong>Hành vi của taskbar</strong><span>Căn chỉnh taskbar, huy hiệu, tự động ẩn và nhiều màn hình.</span></div><SettingRow title="Căn chỉnh taskbar"><SelectButton value={settings.alignment} onChange={(value) => updateSetting("alignment", value)} options={[{ label: "Trái", value: "left" }, { label: "Giữa", value: "center" }]} /></SettingRow><SettingRow title="Tự động ẩn taskbar"><Toggle checked={settings.autoHide} onChange={(value) => updateSetting("autoHide", value)} /></SettingRow><SettingRow title="Hiện huy hiệu trên ứng dụng taskbar"><Toggle checked={settings.badges} onChange={(value) => updateSetting("badges", value)} /></SettingRow></div></section>;
}

function DisplayPanel() {
  return <section className="settings-card"><div className="settings-card-title"><Monitor size={21} /><div><h2>Màn hình</h2><p>Các tuỳ chỉnh hiển thị sẽ được bổ sung sau.</p></div></div><SettingRow icon={Monitor} title="Kích thước hiển thị" subtitle="Tạm thời dùng theo trình duyệt"><button type="button" className="soft-button" disabled>Sắp có</button></SettingRow><SettingRow icon={Sparkles} title="Tối ưu responsive" subtitle="PC, laptop và mobile dùng bố cục riêng"><button type="button" className="soft-button" disabled>Đang bật</button></SettingRow></section>;
}

function AboutPanel() {
  return <section className="settings-card"><div className="settings-card-title"><Info size={21} /><div><h2>Giới thiệu</h2><p>Thông tin ứng dụng quản lý thi đua lớp 12A3.</p></div></div><div className="about-box"><strong>12A3 - Quản lý Thi Đua</strong><span>Phiên bản web nội bộ A3K64.</span><span>Đăng nhập bằng Google, phân quyền theo ACCOUNTS và đồng bộ cá nhân hoá.</span></div></section>;
}

function SettingsPage({ page, setPage, accent, setAccent, mobile }: { page: DesktopPage; setPage: (page: DesktopPage) => void; accent: string; setAccent: (value: string) => void; mobile?: boolean }) {
  if (page === "personalization") return <>{mobile ? <PhoneHeader title="Cá nhân hóa" subtitle="Các tùy chỉnh giao diện được tách riêng để dễ thao tác." backLabel="Cài đặt" onBack={() => (setPage as (page: PhonePage) => void)("home")} /> : <><div className="settings-breadcrumb"><button type="button" onClick={() => setPage("personalization")}>Cài đặt</button><ChevronRight size={18} /><span>Cá nhân hóa</span></div><h1>Cá nhân hóa</h1></>}<div className="personalization-grid compact">{PERSONALIZATION_ITEMS.map((item) => <NavCard key={item.key} title={item.title} subtitle={item.subtitle} icon={item.icon} onClick={() => setPage(item.key)} />)}</div></>;
  if (page === "system") return <>{mobile ? <PhoneHeader title="Hệ thống" subtitle="Các thiết lập hệ thống sẽ được bổ sung dần." backLabel="Cài đặt" onBack={() => (setPage as (page: PhonePage) => void)("home")} /> : <><div className="settings-breadcrumb"><button type="button" onClick={() => setPage("system")}>Cài đặt</button><ChevronRight size={18} /><span>Hệ thống</span></div><h1>Hệ thống</h1></>}<div className="personalization-grid compact">{SYSTEM_ITEMS.map((item) => <NavCard key={item.key} title={item.title} subtitle={item.subtitle} icon={item.icon} onClick={() => setPage(item.key)} />)}</div></>;
  if (page === "background") return <>{mobile ? <PhoneHeader title="Hình nền" backLabel="Cá nhân hóa" onBack={() => setPage("personalization")} /> : <div className="settings-breadcrumb"><button type="button" onClick={() => setPage("personalization")}>Cá nhân hóa</button><ChevronRight size={18} /><span>Hình nền</span></div>}<BackgroundPanel /></>;
  if (page === "color") return <>{mobile ? <PhoneHeader title="Màu sắc" backLabel="Cá nhân hóa" onBack={() => setPage("personalization")} /> : <div className="settings-breadcrumb"><button type="button" onClick={() => setPage("personalization")}>Cá nhân hóa</button><ChevronRight size={18} /><span>Màu sắc</span></div>}<ColorPanel accent={accent} setAccent={setAccent} /></>;
  if (page === "taskbar") return <>{mobile ? <PhoneHeader title="Thanh taskbar" backLabel="Cá nhân hóa" onBack={() => setPage("personalization")} /> : <div className="settings-breadcrumb"><button type="button" onClick={() => setPage("personalization")}>Cá nhân hóa</button><ChevronRight size={18} /><span>Thanh taskbar</span></div>}<TaskbarPanel /></>;
  if (page === "display") return <>{mobile ? <PhoneHeader title="Màn hình" backLabel="Hệ thống" onBack={() => setPage("system")} /> : <div className="settings-breadcrumb"><button type="button" onClick={() => setPage("system")}>Hệ thống</button><ChevronRight size={18} /><span>Màn hình</span></div>}<DisplayPanel /></>;
  return <>{mobile ? <PhoneHeader title="Giới thiệu" backLabel="Hệ thống" onBack={() => setPage("system")} /> : <div className="settings-breadcrumb"><button type="button" onClick={() => setPage("system")}>Hệ thống</button><ChevronRight size={18} /><span>Giới thiệu</span></div>}<AboutPanel /></>;
}

export function SettingsApp({ accent, setAccent, userEmail, userName, userPhotoURL }: SettingsAppProps) {
  const phone = usePhoneViewport();
  const [desktopPage, setDesktopPage] = useState<DesktopPage>("personalization");
  const [phonePage, setPhonePage] = useState<PhonePage>("home");
  const displayName = getDisplayName(userEmail, userName);

  if (phone) {
    return <div className="settings-app settings-phone-only"><style>{settingsCss}</style>{phonePage === "home" ? <main className="phone-screen"><PhoneHeader title="Cài đặt" subtitle="Quản lý tài khoản và tuỳ chỉnh ứng dụng." /><p className="phone-label">Tài khoản</p><AccountCard displayName={displayName} userEmail={userEmail} userPhotoURL={userPhotoURL} /><p className="phone-label">Tuỳ chỉnh</p><div className="phone-list"><NavCard title="Cá nhân hóa" subtitle="Hình nền, màu sắc và thanh taskbar" icon={Palette} onClick={() => setPhonePage("personalization")} /></div><p className="phone-label">Hệ thống</p><div className="phone-list"><NavCard title="Hệ thống" subtitle="Màn hình và giới thiệu" icon={Settings} onClick={() => setPhonePage("system")} /></div></main> : <main className="phone-screen"><SettingsPage page={phonePage as DesktopPage} setPage={setPhonePage as (page: DesktopPage) => void} accent={accent} setAccent={setAccent} mobile /></main>}</div>;
  }

  return <div className="settings-app settings-desktop-only"><style>{settingsCss}</style><div className="settings-layout"><aside className="settings-sidebar windows-like"><div className="settings-topline"><Settings size={19} /><strong>Cài đặt</strong></div><AccountCard displayName={displayName} userEmail={userEmail} userPhotoURL={userPhotoURL} /><nav className="windows-settings-nav"><button type="button" className={`parent-nav ${desktopPage === "personalization" || ["background", "color", "taskbar"].includes(desktopPage) ? "active" : ""}`} onClick={() => setDesktopPage("personalization")}><Palette size={18} /><span>Cá nhân hóa</span></button><button type="button" className={`parent-nav ${desktopPage === "system" || ["display", "about"].includes(desktopPage) ? "active" : ""}`} onClick={() => setDesktopPage("system")}><Settings size={18} /><span>Hệ thống</span></button><button type="button" className={`child-nav ${desktopPage === "background" ? "active" : ""}`} onClick={() => setDesktopPage("background")}><Wallpaper size={18} /><span>Hình nền</span></button><button type="button" className={`child-nav ${desktopPage === "color" ? "active" : ""}`} onClick={() => setDesktopPage("color")}><Palette size={18} /><span>Màu sắc</span></button><button type="button" className={`child-nav ${desktopPage === "taskbar" ? "active" : ""}`} onClick={() => setDesktopPage("taskbar")}><Monitor size={18} /><span>Thanh taskbar</span></button><button type="button" className={`child-nav ${desktopPage === "display" ? "active" : ""}`} onClick={() => setDesktopPage("display")}><Monitor size={18} /><span>Màn hình</span></button><button type="button" className={`child-nav ${desktopPage === "about" ? "active" : ""}`} onClick={() => setDesktopPage("about")}><Info size={18} /><span>Giới thiệu</span></button></nav></aside><main className="settings-content"><SettingsPage page={desktopPage} setPage={setDesktopPage} accent={accent} setAccent={setAccent} /></main></div></div>;
}

export function CustomContextMenu({ onRefresh, onOpenSettings }: { onRefresh?: () => void; onOpenSettings?: () => void }) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => { event.preventDefault(); const x = Math.min(event.clientX, window.innerWidth - 260); const y = Math.min(event.clientY, window.innerHeight - 302); setMenu({ x, y }); };
    const close = () => setMenu(null);
    window.addEventListener("contextmenu", handleContextMenu); window.addEventListener("click", close); window.addEventListener("keydown", close);
    return () => { window.removeEventListener("contextmenu", handleContextMenu); window.removeEventListener("click", close); window.removeEventListener("keydown", close); };
  }, []);
  const items: ContextMenuItem[] = [{ label: "Làm mới", icon: RefreshCcw, shortcut: "Ctrl+R", action: onRefresh }, { label: "Dán", icon: Copy, shortcut: "Ctrl+V" }, { label: "Tải xuống", icon: Download, divider: true }, { label: "Cá nhân hóa", icon: Palette, action: onOpenSettings }, { label: "Cài đặt", icon: Settings, action: onOpenSettings }, { label: "Kiểm tra giao diện", icon: MousePointer2 }];
  if (!menu) return null;
  return <div className="custom-context-menu" style={{ left: menu.x, top: menu.y }} onClick={(event) => event.stopPropagation()}><style>{contextMenuCss}</style>{items.map((item) => { const Icon = item.icon; return <React.Fragment key={item.label}>{item.divider && <div className="context-divider" />}<button type="button" className="context-item" onClick={() => { item.action?.(); setMenu(null); }}><span className="context-left">{Icon && <Icon size={16} />} {item.label}</span>{item.shortcut && <span className="context-shortcut">{item.shortcut}</span>}</button></React.Fragment>; })}</div>;
}

const contextMenuCss = `.custom-context-menu{position:fixed;z-index:9999;width:250px;padding:7px;border:1px solid #273244;border-radius:14px;color:#f8fafc;background:#161616;box-shadow:0 24px 70px rgba(0,0,0,.45)}.context-divider{height:1px;margin:6px 4px;background:#2b3445}.context-item{width:100%;height:34px;border:0;border-radius:9px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 10px;color:#f8fafc;background:transparent;font:inherit;font-size:13px;cursor:pointer}.context-item:hover{background:#2a2a2a}.context-left{display:inline-flex;align-items:center;gap:9px}.context-left svg{color:var(--desktop-accent,#2563eb)}.context-shortcut{color:#a1a1aa;font-size:12px}`;

const settingsCss = `
.settings-app{height:100%;min-height:0;overflow:hidden;color:#f8fafc;background:#050914;font-family:"Segoe UI",system-ui,-apple-system,BlinkMacSystemFont,Arial,sans-serif}.settings-layout{height:100%;display:grid;grid-template-columns:320px minmax(0,1fr);min-height:0;background:#050914}.settings-sidebar{border-right:1px solid #1f2937;padding:18px 14px;background:#050914;overflow-y:auto}.settings-topline{height:34px;display:flex;align-items:center;gap:10px;margin-bottom:12px}.settings-topline svg,.windows-settings-nav button svg,.personal-card svg,.settings-card-title svg{color:var(--desktop-accent,#f97316)}.profile-card{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:12px;min-height:76px;margin-bottom:14px;padding:12px;border:1px solid #1f2937;border-radius:14px;background:#0b1220}.profile-avatar{width:58px;height:58px;border-radius:999px;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,var(--desktop-accent,#f97316),#64748b);overflow:hidden}.profile-avatar img{width:100%;height:100%;object-fit:cover}.profile-card strong,.profile-card span{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.profile-card span{color:#cbd5e1;font-size:12px;margin-top:3px}.windows-settings-nav{display:grid;gap:4px}.windows-settings-nav button{height:42px;border:0;border-radius:8px;display:flex;align-items:center;gap:13px;padding:0 12px;color:#f8fafc;background:transparent;font:inherit;cursor:pointer;text-align:left;position:relative}.windows-settings-nav button:hover,.windows-settings-nav button.active{background:#111827}.windows-settings-nav button.active::before{content:"";position:absolute;left:0;top:10px;bottom:10px;width:3px;border-radius:999px;background:var(--desktop-accent,#f97316)}.windows-settings-nav .child-nav{display:none}.settings-content{min-width:0;min-height:0;overflow:auto;padding:22px 34px 34px;background:#050914}.settings-breadcrumb{height:34px;display:flex;align-items:center;gap:8px;margin-bottom:14px;color:#cbd5e1}.settings-breadcrumb button{border:0;background:transparent;color:inherit;font:inherit;cursor:pointer}.settings-content h1{margin:0 0 20px;font-size:38px;line-height:1.05;letter-spacing:-.04em}.personalization-grid{display:grid;gap:12px;max-width:780px}.personal-card{width:100%;min-height:72px;border:1px solid #243044;border-radius:16px;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:14px;padding:0 18px;text-align:left;color:#f8fafc;background:#0b1220;cursor:pointer}.personal-card:hover{background:#111827;border-color:#334155}.personal-card strong,.personal-card span{display:block}.personal-card span{margin-top:4px;color:#94a3b8;font-size:13px}.settings-card{max-width:960px;border:1px solid #243044;border-radius:18px;background:#0b1220;overflow:hidden}.settings-card-title{display:grid;grid-template-columns:auto minmax(0,1fr);gap:14px;align-items:center;padding:18px;border-bottom:1px solid #243044}.settings-card-title h2{margin:0;font-size:24px}.settings-card-title p{margin:4px 0 0;color:#94a3b8}.setting-row{min-height:66px;border-bottom:1px solid #243044;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 18px}.setting-row:last-child{border-bottom:0}.setting-row-left{display:flex;align-items:center;gap:13px;min-width:0}.setting-row-left svg{color:#94a3b8}.setting-row-left strong{display:block}.setting-row-left span{display:block;margin-top:3px;color:#94a3b8;font-size:12px}.setting-row-right{display:flex;align-items:center;gap:10px}.select-wrap{position:relative}.select-button,.soft-button{min-height:38px;border:1px solid #334155;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:0 14px;color:#f8fafc;background:#0f172a;font:inherit;cursor:pointer}.select-menu{position:absolute;right:0;top:44px;z-index:50;width:190px;border:1px solid #334155;border-radius:12px;background:#0f172a;box-shadow:0 20px 45px rgba(0,0,0,.32);padding:6px}.select-menu button{width:100%;height:34px;border:0;border-radius:8px;padding:0 10px;text-align:left;color:#f8fafc;background:transparent;font:inherit;cursor:pointer}.select-menu button:hover,.select-menu button.active{background:#1e293b}.toggle{width:48px;height:26px;border:1px solid #334155;border-radius:999px;padding:3px;background:#111827;cursor:pointer}.toggle span{display:block;width:18px;height:18px;border-radius:999px;background:#cbd5e1;transition:transform .18s ease}.toggle.on{background:var(--desktop-accent,#f97316);border-color:transparent}.toggle.on span{transform:translateX(20px);background:#fff}.background-preview{height:160px;margin:18px;border:1px solid #334155;border-radius:16px;display:grid;place-items:center;position:relative;overflow:hidden;background:radial-gradient(circle at 30% 20%,var(--desktop-accent,#f97316),transparent 28%),linear-gradient(135deg,#111827,#020617)}.background-preview span{position:relative;font-weight:800}.color-section{padding:18px;border-bottom:1px solid #243044}.color-section-head,.custom-color-row{display:flex;align-items:center;justify-content:space-between;gap:18px}.color-section-head strong,.custom-color-row strong{display:block}.color-section-head span:not(.accent-chip),.custom-color-row span{display:block;margin-top:4px;color:#94a3b8;font-size:12px}.accent-chip{width:44px;height:44px;border-radius:12px;border:2px solid rgba(255,255,255,.8);box-shadow:0 10px 24px rgba(0,0,0,.22)}.color-label{margin:18px 0 8px;color:#cbd5e1;font-weight:900;font-size:13px}.recent-colors,.windows-color-grid{display:flex;flex-wrap:wrap;gap:8px}.recent-colors button,.windows-color-grid button{width:36px;height:36px;border:1px solid rgba(255,255,255,.18);border-radius:9px;color:#fff;display:grid;place-items:center;cursor:pointer}.custom-color-row{margin-top:18px}.custom-color-actions{display:flex;align-items:center;gap:10px}.custom-color-actions input{width:44px;height:44px;border:0;background:transparent}.taskbar-group{border-bottom:1px solid #243044}.taskbar-group:last-child{border-bottom:0}.taskbar-group-head{padding:18px 18px 6px}.taskbar-group-head strong{display:block}.taskbar-group-head span{display:block;margin-top:4px;color:#94a3b8;font-size:12px}.about-box{display:grid;gap:8px;padding:20px}.about-box strong{font-size:20px}.about-box span{color:#94a3b8}.phone-screen{min-height:100%;padding:18px;background:#050914}.phone-header{margin-bottom:18px}.phone-back{height:38px;border:0;background:transparent;color:#94a3b8;display:inline-flex;align-items:center;gap:6px;font:inherit;cursor:pointer}.phone-header h1{margin:8px 0 4px;font-size:34px;line-height:1.05}.phone-header p{margin:0;color:#94a3b8}.phone-label{margin:18px 0 8px;color:#94a3b8;font-weight:900}.phone-list{display:grid;gap:10px}.theme-light .settings-app,.win-root.theme-light .settings-app{color:#0f172a;background:#f8fafc}.theme-light .settings-layout,.win-root.theme-light .settings-layout,.theme-light .settings-sidebar,.win-root.theme-light .settings-sidebar,.theme-light .settings-content,.win-root.theme-light .settings-content,.theme-light .phone-screen,.win-root.theme-light .phone-screen{background:#f8fafc;color:#0f172a}.theme-light .settings-sidebar,.win-root.theme-light .settings-sidebar,.theme-light .settings-card,.win-root.theme-light .settings-card,.theme-light .profile-card,.win-root.theme-light .profile-card,.theme-light .personal-card,.win-root.theme-light .personal-card{background:#fff;color:#0f172a;border-color:#d7dee8}.theme-light .windows-settings-nav button,.win-root.theme-light .windows-settings-nav button{color:#0f172a}.theme-light .windows-settings-nav button:hover,.theme-light .windows-settings-nav button.active,.win-root.theme-light .windows-settings-nav button:hover,.win-root.theme-light .windows-settings-nav button.active{background:#e2e8f0}.theme-light .profile-card span,.theme-light .personal-card span,.theme-light .settings-card-title p,.theme-light .setting-row-left span,.theme-light .color-section-head span:not(.accent-chip),.theme-light .custom-color-row span,.theme-light .taskbar-group-head span,.theme-light .phone-header p,.theme-light .phone-label,.win-root.theme-light .profile-card span,.win-root.theme-light .personal-card span,.win-root.theme-light .settings-card-title p,.win-root.theme-light .setting-row-left span,.win-root.theme-light .color-section-head span:not(.accent-chip),.win-root.theme-light .custom-color-row span,.win-root.theme-light .taskbar-group-head span,.win-root.theme-light .phone-header p,.win-root.theme-light .phone-label{color:#64748b}.theme-light .settings-card-title,.theme-light .setting-row,.theme-light .color-section,.theme-light .taskbar-group,.theme-light .settings-sidebar,.win-root.theme-light .settings-card-title,.win-root.theme-light .setting-row,.win-root.theme-light .color-section,.win-root.theme-light .taskbar-group,.win-root.theme-light .settings-sidebar{border-color:#d7dee8}.theme-light .select-button,.theme-light .soft-button,.theme-light .select-menu,.win-root.theme-light .select-button,.win-root.theme-light .soft-button,.win-root.theme-light .select-menu{color:#0f172a;background:#fff;border-color:#cbd5e1}.theme-light .select-menu button,.win-root.theme-light .select-menu button{color:#0f172a}.theme-light .select-menu button:hover,.theme-light .select-menu button.active,.win-root.theme-light .select-menu button:hover,.win-root.theme-light .select-menu button.active{background:#f1f5f9}.theme-light .toggle,.win-root.theme-light .toggle{background:#e2e8f0;border-color:#cbd5e1}.theme-light .toggle span,.win-root.theme-light .toggle span{background:#fff}@media(max-width:760px){.settings-app{overflow:auto}.settings-layout{display:block}.settings-sidebar{display:none}.settings-content{padding:16px}.settings-content h1{font-size:32px}.personal-card{min-height:66px;padding:0 14px}.settings-card{border-radius:16px}.setting-row{min-height:60px;padding:10px 14px}.color-section-head,.custom-color-row{align-items:flex-start}.windows-color-grid button,.recent-colors button{width:34px;height:34px}}
`;
