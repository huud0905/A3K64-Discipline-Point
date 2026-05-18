import React, { useEffect, useMemo, useState } from "react";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "../lib/firebase";
import { validateLoginWithGas } from "../lib/gasApi";
import { Eye, EyeOff, Lock, Monitor, Moon, Palette, ShieldCheck, Sun, User } from "lucide-react";

interface LoginProps {
  onLogin: (user: any) => void;
}

type ThemeMode = "light" | "dark" | "auto";
type ResolvedTheme = "light" | "dark";
type AccentKey = "blue" | "violet" | "pink" | "green" | "amber" | "red";

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
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loadingLocal, setLoadingLocal] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [error, setError] = useState("");

  const accent = ACCENTS[accentKey];
  const resolvedTheme = theme === "auto" ? systemTheme : theme;
  const isLight = resolvedTheme === "light";

  const cssVars = useMemo(
    () => ({
      "--accent": accent.main,
      "--accent-strong": accent.strong,
      "--accent-soft": accent.soft,
      "--bg": isLight ? "#eef3fb" : "#07111f",
      "--panel": isLight ? "rgba(255,255,255,.82)" : "rgba(15,23,42,.72)",
      "--panel-strong": isLight ? "rgba(255,255,255,.96)" : "rgba(15,23,42,.9)",
      "--text": isLight ? "#0f172a" : "#f8fafc",
      "--muted": isLight ? "#64748b" : "#94a3b8",
      "--line": isLight ? "rgba(15,23,42,.12)" : "rgba(255,255,255,.13)",
      "--input": isLight ? "rgba(255,255,255,.82)" : "rgba(2,6,23,.58)",
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

  const handleGoogleLogin = async () => {
    setError("");
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

  return (
    <main className="login-root" style={cssVars}>
      <style>{`
        .login-root{min-height:100vh;display:grid;place-items:center;padding:28px;color:var(--text);font-family:"Segoe UI",system-ui,Arial,sans-serif;background:radial-gradient(circle at 16% 18%,var(--accent-soft),transparent 28%),radial-gradient(circle at 86% 12%,rgba(96,165,250,.2),transparent 28%),linear-gradient(135deg,var(--bg),${isLight ? "#dbeafe" : "#020617"});overflow:hidden}.login-shell{width:min(1080px,100%);display:grid;grid-template-columns:minmax(0,1.1fr) minmax(320px,.72fr);gap:22px;align-items:stretch}.login-card{border:1px solid var(--line);border-radius:30px;background:var(--panel);box-shadow:0 28px 90px rgba(0,0,0,.22);backdrop-filter:blur(24px);overflow:hidden}.login-left{padding:32px;display:grid;align-content:space-between;min-height:590px}.brand{display:flex;align-items:center;gap:13px}.brand-logo{width:50px;height:50px;border-radius:17px;display:grid;place-items:center;color:white;background:linear-gradient(135deg,var(--accent),var(--accent-strong));box-shadow:0 18px 38px color-mix(in srgb,var(--accent) 36%,transparent)}.brand h1{margin:0;font-size:24px;letter-spacing:-.04em}.brand p,.muted{margin:4px 0 0;color:var(--muted)}.hero h2{font-size:clamp(38px,5vw,68px);line-height:.95;letter-spacing:-.075em;margin:58px 0 16px}.hero b{color:var(--accent)}.hero p{max-width:620px;color:var(--muted);line-height:1.7}.preview-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.preview-tile{border:1px solid var(--line);border-radius:20px;padding:18px;background:var(--panel-strong)}.preview-tile strong{display:block;margin-top:12px}.login-panel{padding:28px}.tools{display:flex;justify-content:space-between;gap:10px;margin-bottom:24px;flex-wrap:wrap}.theme-toggle,.accent-list{display:flex;gap:7px;padding:6px;border:1px solid var(--line);border-radius:999px;background:rgba(255,255,255,.08)}.theme-toggle button,.accent-dot{width:34px;height:34px;border:0;border-radius:999px;display:grid;place-items:center;cursor:pointer;color:var(--muted);background:transparent}.theme-toggle button.active{color:white;background:var(--accent)}.accent-dot{background:var(--dot);border:2px solid transparent}.accent-dot.active{border-color:var(--text);transform:scale(1.05)}.login-panel h2{margin:0 0 8px;font-size:28px;letter-spacing:-.04em}.login-panel p{margin:0 0 22px;color:var(--muted);line-height:1.55}.field{display:grid;gap:8px;margin-bottom:14px}.field label{font-weight:800;font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}.input-wrap{height:52px;border:1px solid var(--line);border-radius:17px;display:grid;grid-template-columns:42px 1fr 42px;align-items:center;background:var(--input)}.input-wrap input{height:100%;border:0;outline:0;background:transparent;color:var(--text);font:inherit;font-weight:700}.input-wrap svg{justify-self:center;color:var(--muted)}.eye{border:0;background:transparent;color:var(--muted);cursor:pointer}.login-button,.google-button{width:100%;height:52px;border:0;border-radius:17px;display:flex;align-items:center;justify-content:center;gap:10px;font-weight:900;cursor:pointer}.login-button{margin-top:8px;color:white;background:linear-gradient(135deg,var(--accent),var(--accent-strong));box-shadow:0 18px 36px color-mix(in srgb,var(--accent) 28%,transparent)}.google-button{margin-top:12px;border:1px solid var(--line);color:var(--text);background:var(--panel-strong)}.error{margin-top:14px;border:1px solid rgba(239,68,68,.35);border-radius:15px;padding:12px;color:#fecaca;background:rgba(127,29,29,.32);font-weight:800}.session-note{margin-top:18px;border:1px dashed var(--line);border-radius:16px;padding:12px;color:var(--muted);font-size:13px;line-height:1.45}@media(max-width:900px){.login-shell{grid-template-columns:1fr}.login-left{min-height:auto}.preview-grid{grid-template-columns:1fr}.hero h2{margin-top:34px}}
      `}</style>

      <section className="login-shell">
        <div className="login-card login-left">
          <div className="brand">
            <div className="brand-logo"><ShieldCheck size={25} /></div>
            <div><h1>Bảng điểm A3K64</h1><p>Quản lý thi đua lớp 12A3</p></div>
          </div>
          <div className="hero"><h2>System <b>A3K64</b></h2><p>Đăng nhập để mở giao diện desktop, bảng chấm điểm, thống kê tổ và đồng bộ Google Sheets.</p></div>
          <div className="preview-grid">
            <div className="preview-tile"><Monitor size={22} color="var(--accent)" /><strong>Desktop</strong><span className="muted">Giao diện kiểu Windows.</span></div>
            <div className="preview-tile"><ShieldCheck size={22} color="var(--accent)" /><strong>Bảo mật</strong><span className="muted">Tự nhớ đăng nhập 7 ngày.</span></div>
            <div className="preview-tile"><Palette size={22} color="var(--accent)" /><strong>Theme</strong><span className="muted">Sáng / tối / tự động.</span></div>
          </div>
        </div>

        <div className="login-card login-panel">
          <div className="tools">
            <div className="theme-toggle">
              <button type="button" className={theme === "light" ? "active" : ""} onClick={() => setTheme("light")} title="Sáng"><Sun size={17} /></button>
              <button type="button" className={theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")} title="Tối"><Moon size={17} /></button>
              <button type="button" className={theme === "auto" ? "active" : ""} onClick={() => setTheme("auto")} title="Tự động"><Monitor size={17} /></button>
            </div>
            <div className="accent-list">
              {(Object.keys(ACCENTS) as AccentKey[]).map((key) => <button key={key} type="button" className={`accent-dot ${accentKey === key ? "active" : ""}`} style={{ "--dot": ACCENTS[key].main } as React.CSSProperties} onClick={() => setAccentKey(key)} title={ACCENTS[key].name} />)}
            </div>
          </div>

          <h2>Đăng nhập</h2>
          <p>Tài khoản lấy từ sheet ACCOUNTS. Sau khi đăng nhập, hệ thống sẽ tự nhớ tối đa 7 ngày trên máy này.</p>

          <form onSubmit={handleLocalLogin}>
            <div className="field"><label>Tên đăng nhập</label><div className="input-wrap"><User size={18} /><input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" placeholder="username / email" /><span /></div></div>
            <div className="field"><label>Mật khẩu</label><div className="input-wrap"><Lock size={18} /><input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="••••••••" /><button type="button" className="eye" onClick={() => setShowPassword((v) => !v)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div>
            <button type="submit" className="login-button" disabled={loadingLocal}>{loadingLocal ? "Đang kiểm tra..." : "Đăng nhập"}</button>
          </form>

          <button type="button" className="google-button" onClick={handleGoogleLogin} disabled={loadingGoogle}>{loadingGoogle ? "Đang mở Google..." : "Đăng nhập bằng Google"}</button>
          {error && <div className="error">{error}</div>}
          <div className="session-note">Khi reload ở trang /desktop/..., nếu phiên đăng nhập còn hạn, phần mềm sẽ mở lại đúng trang đang dùng thay vì quay về màn hình login.</div>
        </div>
      </section>
    </main>
  );
}
