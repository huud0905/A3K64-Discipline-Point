import React, { useEffect, useMemo, useState } from "react";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "../lib/firebase";
import { resetPasswordWithGas, validateLoginWithGas } from "../lib/gasApi";
import { Eye, EyeOff, Lock, Mail, Menu, Monitor, Moon, Phone, ShieldCheck, Sun, User, X } from "lucide-react";

interface LoginProps {
  onLogin: (user: any) => void;
}

type ThemeMode = "light" | "dark" | "auto";
type ResolvedTheme = "light" | "dark";
type AccentKey = "blue" | "violet" | "pink" | "green" | "amber" | "red";
type LoginTab = "login" | "forgot";

type SavedSession = {
  user: any;
  expiresAt: number;
  lastPath?: string;
};

const SESSION_KEY = "a3k64-login-session-v1";
const RESTORE_PATH_KEY = "a3k64-restore-path";
const SESSION_DAYS = 7;

const ACCENTS: Record<AccentKey, { name: string; main: string; strong: string; soft: string }> = {
  blue: { name: "Xanh", main: "#2563eb", strong: "#1d4ed8", soft: "rgba(37,99,235,.16)" },
  violet: { name: "Tím", main: "#7c3aed", strong: "#6d28d9", soft: "rgba(124,58,237,.16)" },
  pink: { name: "Hồng", main: "#db2777", strong: "#be185d", soft: "rgba(219,39,119,.16)" },
  green: { name: "Xanh lá", main: "#059669", strong: "#047857", soft: "rgba(5,150,105,.16)" },
  amber: { name: "Cam", main: "#d97706", strong: "#b45309", soft: "rgba(217,119,6,.17)" },
  red: { name: "Đỏ", main: "#dc2626", strong: "#b91c1c", soft: "rgba(220,38,38,.16)" },
};

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function getStoredTheme(): ThemeMode {
  const saved = localStorage.getItem("login-theme");
  return saved === "dark" || saved === "light" || saved === "auto" ? saved : "auto";
}

function getStoredAccent(): AccentKey {
  const saved = localStorage.getItem("login-accent") as AccentKey | null;
  return saved && saved in ACCENTS ? saved : "blue";
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function saveSession(user: any, lastPath = window.location.pathname) {
  const path = lastPath.startsWith("/desktop") ? lastPath : "/desktop";
  const session: SavedSession = {
    user: { ...user, role: user.role || "hoc_sinh" },
    lastPath: path,
    expiresAt: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  localStorage.setItem(RESTORE_PATH_KEY, path);
}

function readSession(): SavedSession | null {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null") as SavedSession | null;
    if (!session?.user || !session.expiresAt || session.expiresAt < Date.now()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function dispatchRestore(path: string) {
  localStorage.setItem(RESTORE_PATH_KEY, path);
  window.setTimeout(() => {
    window.history.replaceState({}, "", path);
    window.dispatchEvent(new CustomEvent("a3k64-restore-route", { detail: { path } }));
  }, 650);
}

export default function Login({ onLogin }: LoginProps) {
  const [theme, setTheme] = useState<ThemeMode>(getStoredTheme);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);
  const [accentKey, setAccentKey] = useState<AccentKey>(getStoredAccent);
  const [tab, setTab] = useState<LoginTab>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loadingLocal, setLoadingLocal] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingReset, setLoadingReset] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const accent = ACCENTS[accentKey];
  const resolvedTheme = theme === "auto" ? systemTheme : theme;
  const isLight = resolvedTheme === "light";

  const cssVars = useMemo(
    () => ({
      "--accent": accent.main,
      "--accent-strong": accent.strong,
      "--accent-soft": accent.soft,
      "--bg": isLight ? "#eef3fb" : "#07111f",
      "--panel": isLight ? "rgba(255,255,255,.84)" : "rgba(15,23,42,.74)",
      "--panel-strong": isLight ? "rgba(255,255,255,.96)" : "rgba(15,23,42,.92)",
      "--text": isLight ? "#0f172a" : "#f8fafc",
      "--muted": isLight ? "#64748b" : "#94a3b8",
      "--line": isLight ? "rgba(15,23,42,.12)" : "rgba(255,255,255,.13)",
      "--input": isLight ? "rgba(255,255,255,.86)" : "rgba(2,6,23,.58)",
    }) as React.CSSProperties,
    [accent, isLight]
  );

  useEffect(() => {
    const session = readSession();
    if (!session) return;
    const restorePath = window.location.pathname.startsWith("/desktop") ? window.location.pathname : session.lastPath || "/desktop";
    localStorage.setItem(RESTORE_PATH_KEY, restorePath);
    onLogin(session.user);
    dispatchRestore(restorePath);
  }, [onLogin]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const update = () => setSystemTheme(media.matches ? "light" : "dark");
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    localStorage.setItem("login-theme", theme);
    window.dispatchEvent(new Event("login-theme-change"));
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("login-accent", accentKey);
    window.dispatchEvent(new Event("login-accent-change"));
  }, [accentKey]);

  const handleLocalLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    const cleanUsername = username.trim();
    if (!cleanUsername) return setError("Vui lòng nhập tên đăng nhập");
    if (!password.trim()) return setError("Vui lòng nhập mật khẩu");

    setLoadingLocal(true);
    try {
      const user = await validateLoginWithGas(cleanUsername, password);
      if (!user) return setError("Tên đăng nhập hoặc mật khẩu không đúng");
      saveSession(user);
      onLogin(user);
      dispatchRestore("/desktop");
    } catch {
      setError("Không kết nối được hệ thống tài khoản. Hãy kiểm tra Google Apps Script.");
    } finally {
      setLoadingLocal(false);
    }
  };

  const handleResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!fullName.trim()) return setError("Vui lòng nhập họ và tên");
    if (!phone.trim()) return setError("Vui lòng nhập số điện thoại cá nhân/bố/mẹ");
    if (!isEmail(newEmail)) return setError("Gmail mới phải đúng định dạng email");
    if (newPassword.trim().length < 4) return setError("Mật khẩu mới tối thiểu 4 ký tự");

    setLoadingReset(true);
    try {
      const result = await resetPasswordWithGas(fullName, phone, newEmail, newPassword);
      if (!result.ok) return setError(result.message || "Không cập nhật được tài khoản");
      setUsername(newEmail.trim());
      setPassword(newPassword);
      setTab("login");
      setSuccess("Đã cập nhật Gmail và mật khẩu. Bạn có thể đăng nhập ngay.");
    } finally {
      setLoadingReset(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError("");
    setSuccess("");
    setLoadingGoogle(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(auth, provider);
      const user = {
        uid: result.user.uid,
        displayName: result.user.displayName || result.user.email || "Google User",
        email: result.user.email,
        photoURL: result.user.photoURL,
        provider: "google",
        role: "hoc_sinh",
      };
      saveSession(user);
      onLogin(user);
      dispatchRestore("/desktop");
    } catch (err: any) {
      const code = String(err?.code || "");
      const message = String(err?.message || "");
      if (code.includes("popup-closed-by-user")) setError("Bạn đã đóng cửa sổ đăng nhập Google.");
      else if (message.includes("origin_mismatch") || code.includes("unauthorized-domain")) setError("Google OAuth chưa cho phép domain hiện tại.");
      else setError("Không đăng nhập được bằng Google. Kiểm tra lại cấu hình Firebase/OAuth.");
    } finally {
      setLoadingGoogle(false);
    }
  };

  const themeTools = (
    <div className="brand-tools" aria-label="Tuỳ chỉnh giao diện">
      <div className="theme-toggle">
        <button type="button" className={theme === "light" ? "active" : ""} onClick={() => setTheme("light")} title="Sáng"><Sun size={17} /></button>
        <button type="button" className={theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")} title="Tối"><Moon size={17} /></button>
        <button type="button" className={theme === "auto" ? "active" : ""} onClick={() => setTheme("auto")} title="Tự động"><Monitor size={17} /></button>
      </div>
      <div className="accent-list">
        {(Object.keys(ACCENTS) as AccentKey[]).map((key) => <button key={key} type="button" className={`accent-dot ${accentKey === key ? "active" : ""}`} style={{ "--dot": ACCENTS[key].main } as React.CSSProperties} onClick={() => setAccentKey(key)} title={ACCENTS[key].name} />)}
      </div>
    </div>
  );

  return (
    <main className="login-root" style={cssVars}>
      <style>{`
        .login-root{min-height:100vh;display:grid;place-items:center;padding:28px;color:var(--text);font-family:"Segoe UI",system-ui,Arial,sans-serif;background:radial-gradient(circle at 16% 18%,var(--accent-soft),transparent 28%),radial-gradient(circle at 86% 12%,rgba(96,165,250,.2),transparent 28%),linear-gradient(135deg,var(--bg),${isLight ? "#dbeafe" : "#020617"});overflow:auto}.login-shell{width:min(1080px,100%);display:grid;grid-template-columns:minmax(0,1.03fr) minmax(320px,.75fr);gap:22px;align-items:stretch}.login-card{border:1px solid var(--line);border-radius:30px;background:var(--panel);box-shadow:0 28px 90px rgba(0,0,0,.22);backdrop-filter:blur(24px);overflow:hidden}.login-left{position:relative;padding:32px;display:grid;grid-template-rows:auto 1fr;gap:24px;min-height:590px}.brand-top{display:grid;grid-template-columns:1fr;gap:16px;align-content:start}.brand{display:flex;align-items:center;gap:13px}.brand-logo{width:50px;height:50px;border-radius:17px;display:grid;place-items:center;color:white;background:linear-gradient(135deg,var(--accent),var(--accent-strong));box-shadow:0 18px 38px color-mix(in srgb,var(--accent) 36%,transparent)}.brand h1{margin:0;font-size:24px;letter-spacing:-.04em}.brand p,.muted{margin:4px 0 0;color:var(--muted)}.brand-tools{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.theme-toggle,.accent-list{display:flex;gap:7px;padding:6px;border:1px solid var(--line);border-radius:999px;background:rgba(255,255,255,.08)}.theme-toggle button,.accent-dot{width:34px;height:34px;border:0;border-radius:999px;display:grid;place-items:center;cursor:pointer;color:var(--muted);background:transparent}.theme-toggle button.active{color:white;background:var(--accent)}.accent-dot{background:var(--dot);border:2px solid transparent}.accent-dot.active{border-color:var(--text);transform:scale(1.05)}.contest-placeholder{border:1px dashed color-mix(in srgb,var(--line) 80%,transparent);border-radius:24px;min-height:320px;background:linear-gradient(180deg,transparent,rgba(255,255,255,.025));opacity:.7}.mobile-menu-button{display:none;width:44px;height:44px;border:1px solid var(--line);border-radius:15px;place-items:center;color:#fff;background:linear-gradient(135deg,var(--accent),var(--accent-strong));box-shadow:0 14px 30px color-mix(in srgb,var(--accent) 25%,transparent);cursor:pointer}.mobile-drawer{display:none}.login-panel{padding:28px}.login-panel h2{margin:0 0 16px;font-size:30px;letter-spacing:-.04em}.login-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:18px;padding:5px;border:1px solid var(--line);border-radius:18px;background:rgba(255,255,255,.055)}.login-tabs button{height:40px;border:0;border-radius:14px;color:var(--muted);background:transparent;font-weight:900;cursor:pointer}.login-tabs button.active{color:white;background:var(--accent);box-shadow:0 12px 24px color-mix(in srgb,var(--accent) 24%,transparent)}.field{display:grid;gap:8px;margin-bottom:14px}.field label{font-weight:800;font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}.input-wrap{height:52px;border:1px solid var(--line);border-radius:17px;display:grid;grid-template-columns:42px 1fr 42px;align-items:center;background:var(--input)}.input-wrap input{height:100%;border:0;outline:0;background:transparent;color:var(--text);font:inherit;font-weight:700;min-width:0}.input-wrap svg{justify-self:center;color:var(--muted)}.eye{border:0;background:transparent;color:var(--muted);cursor:pointer}.login-button,.google-button{width:100%;height:52px;border:0;border-radius:17px;display:flex;align-items:center;justify-content:center;gap:10px;font-weight:900;cursor:pointer}.login-button{margin-top:8px;color:white;background:linear-gradient(135deg,var(--accent),var(--accent-strong));box-shadow:0 18px 36px color-mix(in srgb,var(--accent) 28%,transparent)}.google-button{margin-top:12px;border:1px solid var(--line);color:var(--text);background:var(--panel-strong)}.error,.success{margin-top:14px;border-radius:15px;padding:12px;font-weight:800}.error{border:1px solid rgba(239,68,68,.35);color:#fecaca;background:rgba(127,29,29,.32)}.success{border:1px solid rgba(16,185,129,.38);color:#bbf7d0;background:rgba(6,95,70,.28)}.hint{margin:-3px 0 14px;color:var(--muted);font-size:13px;line-height:1.5}.session-note{display:none}@media(max-width:900px){.login-root{display:block;min-height:100svh;padding:16px;background:radial-gradient(circle at 50% -10%,var(--accent-soft),transparent 38%),linear-gradient(180deg,var(--bg),${isLight ? "#e2e8f0" : "#020617"})}.login-shell{display:grid;grid-template-columns:1fr;gap:14px}.login-card{border-radius:24px;box-shadow:0 20px 60px rgba(0,0,0,.22)}.login-left{min-height:300px;padding:22px;gap:16px}.brand-top{display:grid;grid-template-columns:minmax(0,1fr) 44px;gap:12px}.brand{min-width:0}.brand-logo{width:48px;height:48px;border-radius:16px}.brand h1{font-size:22px}.brand p{font-size:14px}.brand-tools{grid-column:1/-1;display:flex;align-items:center;justify-content:flex-start;gap:8px;overflow-x:auto;padding:2px 2px 4px;scrollbar-width:none}.brand-tools::-webkit-scrollbar{display:none}.theme-toggle,.accent-list{gap:5px;padding:5px}.theme-toggle button{width:30px;height:30px}.accent-dot{width:28px;height:28px}.mobile-menu-button{display:grid}.contest-placeholder{min-height:90px;border-style:solid;background:rgba(255,255,255,.025)}.login-panel{padding:22px}.login-panel h2{font-size:28px;margin-bottom:14px}.login-button,.google-button,.input-wrap{height:50px}.mobile-drawer{position:fixed;inset:0;z-index:50;display:grid;grid-template-rows:auto 1fr;background:rgba(2,6,23,.62);backdrop-filter:blur(18px);animation:drawerIn .18s ease both}.mobile-drawer-panel{margin:12px;border:1px solid var(--line);border-radius:24px;background:var(--panel-strong);padding:18px}.mobile-drawer-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}.mobile-drawer-head strong{font-size:18px}.mobile-drawer-close{width:40px;height:40px;border:1px solid var(--line);border-radius:14px;color:var(--text);background:transparent;display:grid;place-items:center}.mobile-contest-empty{min-height:150px;border:1px dashed var(--line);border-radius:18px;background:rgba(255,255,255,.025)}@keyframes drawerIn{from{opacity:0}to{opacity:1}}}@media(max-width:520px){.login-root{padding:10px}.login-left{min-height:255px}.brand{gap:10px}.brand-logo{width:44px;height:44px}.brand h1{font-size:20px}.brand p{font-size:13px}.contest-placeholder{display:block;min-height:70px}.login-panel{padding:20px}.field label{font-size:12px}.login-panel h2{font-size:26px}.login-card{border-radius:22px}.google-button{font-size:14px}}
      `}</style>

      <section className="login-shell">
        <div className="login-card login-left">
          <div className="brand-top">
            <div className="brand">
              <div className="brand-logo"><ShieldCheck size={25} /></div>
              <div><h1>Bảng điểm A3K64</h1><p>Quản lý thi đua lớp 12A3</p></div>
            </div>
            <button type="button" className="mobile-menu-button" onClick={() => setMobileMenuOpen(true)} aria-label="Mở danh sách cuộc thi"><Menu size={22} /></button>
            {themeTools}
          </div>
          <div className="contest-placeholder" aria-hidden="true" />
        </div>

        <div className="login-card login-panel">
          <h2>{tab === "login" ? "Đăng nhập" : "Quên mật khẩu"}</h2>
          <div className="login-tabs">
            <button type="button" className={tab === "login" ? "active" : ""} onClick={() => { setTab("login"); setError(""); }}>Đăng nhập</button>
            <button type="button" className={tab === "forgot" ? "active" : ""} onClick={() => { setTab("forgot"); setError(""); }}>Quên mật khẩu</button>
          </div>

          {tab === "login" ? (
            <>
              <form onSubmit={handleLocalLogin}>
                <div className="field"><label>Tên đăng nhập</label><div className="input-wrap"><User size={18} /><input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" placeholder="username / email" /><span /></div></div>
                <div className="field"><label>Mật khẩu</label><div className="input-wrap"><Lock size={18} /><input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="••••••••" /><button type="button" className="eye" onClick={() => setShowPassword((v) => !v)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div>
                <button type="submit" className="login-button" disabled={loadingLocal}>{loadingLocal ? "Đang kiểm tra..." : "Đăng nhập"}</button>
              </form>
              <button type="button" className="google-button" onClick={handleGoogleLogin} disabled={loadingGoogle}>{loadingGoogle ? "Đang mở Google..." : "Đăng nhập bằng Google"}</button>
            </>
          ) : (
            <form onSubmit={handleResetPassword}>
              <p className="hint">Nhập đúng họ tên trong TTCN và một trong các số điện thoại cá nhân/bố/mẹ để đổi Gmail và mật khẩu.</p>
              <div className="field"><label>Họ và tên</label><div className="input-wrap"><User size={18} /><input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" placeholder="Nguyễn Văn A" /><span /></div></div>
              <div className="field"><label>Số điện thoại</label><div className="input-wrap"><Phone size={18} /><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="SĐT cá nhân / bố / mẹ" /><span /></div></div>
              <div className="field"><label>Gmail mới</label><div className="input-wrap"><Mail size={18} /><input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} inputMode="email" placeholder="email@gmail.com" /><span /></div></div>
              <div className="field"><label>Mật khẩu mới</label><div className="input-wrap"><Lock size={18} /><input type={showNewPassword ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Mật khẩu mới" /><button type="button" className="eye" onClick={() => setShowNewPassword((v) => !v)}>{showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div>
              <button type="submit" className="login-button" disabled={loadingReset}>{loadingReset ? "Đang cập nhật..." : "Cập nhật tài khoản"}</button>
            </form>
          )}

          {error && <div className="error">{error}</div>}
          {success && <div className="success">{success}</div>}
          <div className="session-note">Phiên đăng nhập tự lưu tối đa 7 ngày.</div>
        </div>
      </section>

      {mobileMenuOpen && (
        <div className="mobile-drawer" role="dialog" aria-modal="true">
          <div className="mobile-drawer-panel">
            <div className="mobile-drawer-head"><strong>Cuộc thi</strong><button className="mobile-drawer-close" type="button" onClick={() => setMobileMenuOpen(false)} aria-label="Đóng"><X size={20} /></button></div>
            <div className="mobile-contest-empty" aria-hidden="true" />
          </div>
        </div>
      )}
    </main>
  );
}
