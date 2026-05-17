import React, { useEffect, useMemo, useState } from "react";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "../lib/firebase";
import { validateLoginWithGas } from "../lib/gasApi";
import {
  AppWindow,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Menu,
  Moon,
  Monitor,
  Palette,
  ShieldCheck,
  Sparkles,
  Sun,
  Trophy,
  User,
} from "lucide-react";

interface LoginProps {
  onLogin: (user: any) => void;
}

type ThemeMode = "light" | "dark" | "auto";
type ResolvedTheme = "light" | "dark";
type AccentKey = "blue" | "violet" | "pink" | "green" | "amber" | "red";

const ACCENTS: Record<
  AccentKey,
  {
    name: string;
    main: string;
    soft: string;
    strong: string;
  }
> = {
  blue: { name: "Xanh", main: "#2563eb", soft: "rgba(37, 99, 235, .14)", strong: "#1d4ed8" },
  violet: { name: "Tím", main: "#7c3aed", soft: "rgba(124, 58, 237, .15)", strong: "#6d28d9" },
  pink: { name: "Hồng", main: "#db2777", soft: "rgba(219, 39, 119, .15)", strong: "#be185d" },
  green: { name: "Xanh lá", main: "#059669", soft: "rgba(5, 150, 105, .15)", strong: "#047857" },
  amber: { name: "Cam", main: "#d97706", soft: "rgba(217, 119, 6, .16)", strong: "#b45309" },
  red: { name: "Đỏ", main: "#dc2626", soft: "rgba(220, 38, 38, .14)", strong: "#b91c1c" },
};



const getSystemTheme = (): ResolvedTheme => {
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
};

const getStoredTheme = (): ThemeMode => {
  const saved = localStorage.getItem("login-theme");
  return saved === "dark" || saved === "light" || saved === "auto" ? saved : "auto";
};

const getStoredAccent = (): AccentKey => {
  const saved = localStorage.getItem("login-accent") as AccentKey | null;
  return saved && saved in ACCENTS ? saved : "blue";
};

export default function Login({ onLogin }: LoginProps) {
  const [theme, setTheme] = useState<ThemeMode>(getStoredTheme);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);
  const [accentKey, setAccentKey] = useState<AccentKey>(getStoredAccent);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingLocal, setLoadingLocal] = useState(false);
  const [error, setError] = useState("");
  const [showMobileInfo, setShowMobileInfo] = useState(false);

  const accent = ACCENTS[accentKey];
  const resolvedTheme = theme === "auto" ? systemTheme : theme;
  const isLight = resolvedTheme === "light";

  const cssVars = useMemo(
    () =>
      ({
        "--accent": accent.main,
        "--accent-soft": accent.soft,
        "--accent-strong": accent.strong,
        "--bg": isLight ? "#eef3fb" : "#07111f",
        "--wallpaper-a": isLight ? "#f8fbff" : "#0f172a",
        "--wallpaper-b": isLight ? "#dbeafe" : "#172554",
        "--wallpaper-c": isLight ? "#ffffff" : "#020617",
        "--card": isLight ? "rgba(255,255,255,.76)" : "rgba(15,23,42,.66)",
        "--card-strong": isLight ? "rgba(255,255,255,.94)" : "rgba(15,23,42,.88)",
        "--text": isLight ? "#0f172a" : "#f8fafc",
        "--muted": isLight ? "#64748b" : "#94a3b8",
        "--line": isLight ? "rgba(15,23,42,.12)" : "rgba(255,255,255,.12)",
        "--input": isLight ? "rgba(255,255,255,.78)" : "rgba(2,6,23,.55)",
        "--taskbar": isLight ? "rgba(255,255,255,.78)" : "rgba(15,23,42,.72)",
        "--taskbar-item": isLight ? "rgba(15,23,42,.06)" : "rgba(255,255,255,.08)",
        "--shadow": isLight ? "0 24px 70px rgba(15,23,42,.16)" : "0 26px 80px rgba(0,0,0,.38)",
      }) as React.CSSProperties,
    [accent, isLight]
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const updateSystemTheme = () => setSystemTheme(media.matches ? "light" : "dark");

    updateSystemTheme();
    media.addEventListener?.("change", updateSystemTheme);

    return () => media.removeEventListener?.("change", updateSystemTheme);
  }, []);

  useEffect(() => {
    localStorage.setItem("login-theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("login-accent", accentKey);
  }, [accentKey]);

  const handleLocalLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    const cleanUsername = username.trim();

    if (!cleanUsername) {
      setError("Vui lòng nhập tên đăng nhập trước");
      return;
    }

    if (!password.trim()) {
      setError("Vui lòng nhập mật khẩu");
      return;
    }

    setLoadingLocal(true);

    try {
      const user = await validateLoginWithGas(cleanUsername, password);

      if (!user) {
        setError("Tên đăng nhập hoặc mật khẩu không đúng");
        return;
      }

      onLogin(user);
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

      onLogin({
        uid: result.user.uid,
        displayName: result.user.displayName || result.user.email || "Google User",
        email: result.user.email,
        photoURL: result.user.photoURL,
        provider: "google",
      });
    } catch (err: any) {
      const code = String(err?.code || "");
      const message = String(err?.message || "");

      if (code.includes("popup-closed-by-user")) {
        setError("Bạn đã đóng cửa sổ đăng nhập Google.");
      } else if (message.includes("origin_mismatch") || code.includes("unauthorized-domain")) {
        setError(
          "Google OAuth chưa cho phép domain hiện tại. Hãy thêm domain Render/Firebase vào Authorized JavaScript origins và Firebase Authentication Authorized domains."
        );
      } else {
        setError("Không đăng nhập được bằng Google. Kiểm tra lại cấu hình Firebase/OAuth.");
      }
    } finally {
      setLoadingGoogle(false);
    }
  };

  return (
    <main className="login-root" style={cssVars}>
      <style>{`
        .login-root {
          min-height: 100vh;
          width: 100%;
          overflow: hidden;
          font-family: "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, Arial, sans-serif;
          color: var(--text);
          background:
            radial-gradient(circle at 14% 18%, var(--accent-soft), transparent 30%),
            radial-gradient(circle at 82% 12%, rgba(96,165,250,.22), transparent 28%),
            linear-gradient(135deg, var(--wallpaper-a), var(--wallpaper-b) 48%, var(--wallpaper-c));
        }

        .desktop-shell {
          min-height: 100vh;
          padding: 34px 28px 86px;
          position: relative;
        }

        .desktop-grid {
          max-width: 1320px;
          height: calc(100vh - 130px);
          min-height: 620px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: minmax(760px, 1fr) minmax(330px, 390px);
          gap: 22px;
          align-items: stretch;
        }

        .glass-panel {
          height: 100%;
          min-height: 0;
          overflow: hidden;
          border: 1px solid var(--line);
          border-radius: 30px;
          background: var(--card);
          box-shadow: var(--shadow);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
        }

        .left-panel-inner,
        .login-panel-inner {
          height: 100%;
          min-height: 0;
          overflow-y: auto;
          scrollbar-width: thin;
        }

        .left-panel-inner {
          padding: 28px;
        }

        .login-panel-inner {
          padding: 28px;
        }

        .mobile-menu-button {
          display: none;
        }

        .topbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 28px;
          margin-bottom: 24px;
          flex-wrap: nowrap;
          width: 100%;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 300px;
          flex: 1 1 380px;
        }

        .brand-logo {
          width: 48px;
          height: 48px;
          flex: 0 0 auto;
          display: grid;
          place-items: center;
          border-radius: 17px;
          color: white;
          background: linear-gradient(135deg, var(--accent), var(--accent-strong));
          box-shadow: 0 16px 36px color-mix(in srgb, var(--accent) 34%, transparent);
        }

        .brand h1 {
          margin: 0;
          font-size: clamp(18px, 2.1vw, 22px);
          line-height: 1.15;
          letter-spacing: -.03em;
          white-space: nowrap;
        }

        .brand p,
        .hero-copy p,
        .muted {
          color: var(--muted);
        }

        .brand p {
          margin: 3px 0 0;
          font-size: 13px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .appearance-tools {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 14px;
          flex-wrap: nowrap;
          min-width: max-content;
          flex: 0 0 auto;
        }

        .theme-toggle {
          height: 52px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: 1px solid var(--line);
          border-radius: 999px;
          background: var(--taskbar-item);
          padding: 6px;
          flex: 0 0 auto;
        }

        .accent-inline {
          height: 52px;
          display: inline-flex;
          align-items: center;
          gap: 9px;
          border: 1px solid var(--line);
          border-radius: 999px;
          background: var(--taskbar-item);
          padding: 6px 10px 6px 13px;
          flex: 0 0 auto;
        }

        .accent-inline > svg {
          color: var(--muted);
          flex: 0 0 auto;
        }

        .accent-inline-list {
          display: inline-flex;
          align-items: center;
          gap: 7px;
        }

        .accent-inline-dot {
          width: 30px;
          height: 30px;
          border: 1px solid color-mix(in srgb, #ffffff 42%, transparent);
          border-radius: 999px;
          cursor: pointer;
          display: grid;
          place-items: center;
          background: var(--dot-color);
          transition: .15s ease;
        }

        .accent-inline-dot.active {
          outline: 3px solid var(--accent-soft);
          transform: translateY(-1px);
        }

        .accent-inline-dot svg {
          color: #fff;
        }

        .theme-toggle button,
        .icon-button {
          border: 0;
          color: var(--text);
          cursor: pointer;
          display: inline-grid;
          place-items: center;
          background: transparent;
          transition: .18s ease;
        }

        .theme-toggle button {
          width: 36px;
          height: 36px;
          border-radius: 999px;
        }

        .theme-toggle button.active,
        .icon-button:hover {
          background: var(--accent);
          color: #fff;
        }

        .hero-copy {
          margin-top: 18px;
          padding: 24px;
          border: 1px solid var(--line);
          border-radius: 26px;
          background: var(--card-strong);
        }

        .hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 999px;
          color: var(--accent-strong);
          background: var(--accent-soft);
          font-weight: 700;
          font-size: 13px;
        }

        .hero-copy h2 {
          margin: 18px 0 10px;
          max-width: 680px;
          font-size: clamp(30px, 5vw, 58px);
          line-height: .98;
          letter-spacing: -.06em;
        }

        .hero-copy p {
          margin: 0;
          max-width: 600px;
          line-height: 1.7;
        }

        .quick-stats {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
          margin-top: 18px;
        }

        .stat-card,
        .feature-card,
        .mini-window {
          border: 1px solid var(--line);
          border-radius: 22px;
          background: var(--card-strong);
        }

        .stat-card {
          padding: 16px;
        }

        .stat-card strong {
          display: block;
          font-size: 24px;
          letter-spacing: -.04em;
        }

        .stat-card span {
          display: block;
          margin-top: 4px;
          color: var(--muted);
          font-size: 13px;
        }

        .feature-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
          margin-top: 18px;
        }

        .feature-card {
          padding: 16px;
          display: flex;
          gap: 12px;
          align-items: flex-start;
        }

        .feature-icon {
          width: 40px;
          height: 40px;
          flex: 0 0 auto;
          display: grid;
          place-items: center;
          border-radius: 15px;
          color: var(--accent);
          background: var(--accent-soft);
        }

        .feature-card h3 {
          margin: 0;
          font-size: 15px;
        }

        .feature-card p {
          margin: 5px 0 0;
          color: var(--muted);
          font-size: 13px;
          line-height: 1.5;
        }

        .mini-window {
          margin-top: 18px;
          overflow: hidden;
        }

        .mini-window-header {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 13px 15px;
          border-bottom: 1px solid var(--line);
        }

        .dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: var(--accent);
          opacity: .85;
        }

        .mini-window-body {
          padding: 16px;
          display: grid;
          gap: 10px;
        }

        .rank-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          padding: 11px 13px;
          border-radius: 16px;
          background: var(--taskbar-item);
        }

        .rank-row span {
          color: var(--muted);
          font-size: 13px;
        }

        .login-header {
          margin-bottom: 22px;
        }

        .login-header h2 {
          margin: 14px 0 8px;
          font-size: 30px;
          letter-spacing: -.04em;
        }

        .login-header p {
          margin: 0;
          color: var(--muted);
          line-height: 1.6;
        }

        .login-mark {
          width: 58px;
          height: 58px;
          display: grid;
          place-items: center;
          border-radius: 21px;
          color: #fff;
          background: linear-gradient(135deg, var(--accent), var(--accent-strong));
          box-shadow: 0 18px 40px color-mix(in srgb, var(--accent) 35%, transparent);
        }

        .form {
          display: grid;
          gap: 14px;
        }

        .field-label {
          display: block;
          margin-bottom: 7px;
          font-size: 13px;
          font-weight: 700;
        }

        .input-wrap {
          display: flex;
          align-items: center;
          gap: 10px;
          height: 50px;
          border: 1px solid var(--line);
          border-radius: 17px;
          background: var(--input);
          padding: 0 13px;
          transition: .18s ease;
        }

        .input-wrap:focus-within {
          border-color: color-mix(in srgb, var(--accent) 58%, var(--line));
          box-shadow: 0 0 0 4px var(--accent-soft);
        }

        .input-wrap svg {
          color: var(--muted);
          flex: 0 0 auto;
        }

        .input-wrap input {
          width: 100%;
          min-width: 0;
          border: 0;
          outline: 0;
          color: var(--text);
          background: transparent;
          font: inherit;
        }

        .input-wrap input::placeholder {
          color: color-mix(in srgb, var(--muted) 80%, transparent);
        }

        .icon-button {
          width: 34px;
          height: 34px;
          border-radius: 12px;
          flex: 0 0 auto;
        }

        .primary-button,
        .google-button {
          width: 100%;
          height: 46px;
          border-radius: 17px;
          border: 1px solid transparent;
          cursor: pointer;
          font: inherit;
          font-weight: 800;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          transition: transform .16s ease, filter .16s ease, background .16s ease;
        }

        .primary-button {
          margin-top: 4px;
          color: #fff;
          background: linear-gradient(135deg, var(--accent), var(--accent-strong));
          box-shadow: 0 15px 35px color-mix(in srgb, var(--accent) 28%, transparent);
        }

        .google-button {
          color: var(--text);
          background: var(--card-strong);
          border-color: var(--line);
        }

        .primary-button:hover,
        .google-button:hover {
          transform: translateY(-1px);
          filter: brightness(1.02);
        }

        .primary-button:disabled,
        .google-button:disabled {
          opacity: .65;
          cursor: not-allowed;
          transform: none;
        }

        .divider {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 18px 0;
          color: var(--muted);
          font-size: 13px;
        }

        .divider::before,
        .divider::after {
          content: "";
          height: 1px;
          flex: 1;
          background: var(--line);
        }

        .error-box {
          margin-top: 14px;
          padding: 12px 13px;
          border-radius: 16px;
          color: #991b1b;
          background: rgba(239, 68, 68, .12);
          border: 1px solid rgba(239, 68, 68, .28);
          font-size: 13px;
          line-height: 1.5;
        }

        .accent-picker {
          margin-top: 18px;
          padding: 14px;
          border: 1px solid var(--line);
          border-radius: 20px;
          background: var(--card-strong);
        }

        .accent-picker-title {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
          font-size: 13px;
          font-weight: 800;
        }

        .accent-list {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 9px;
        }

        .accent-dot {
          height: 38px;
          border: 1px solid var(--line);
          border-radius: 14px;
          cursor: pointer;
          display: grid;
          place-items: center;
          background: var(--dot-color);
          transition: .15s ease;
        }

        .accent-dot.active {
          outline: 3px solid var(--accent-soft);
          transform: translateY(-1px);
        }

        .accent-dot svg {
          color: #fff;
        }

        .google-g {
          width: 22px;
          height: 22px;
          border-radius: 999px;
          display: inline-grid;
          place-items: center;
          font-weight: 900;
          font-size: 15px;
          color: var(--accent);
          background: var(--accent-soft);
        }

        @media (max-width: 760px) {
          .desktop-shell {
            padding: 12px;
          }

          .desktop-grid {
            gap: 14px;
          }

          .info-panel {
            order: 1;
          }

          .login-panel {
            order: 2;
          }

          .left-panel-inner,
          .login-panel-inner {
            padding: 16px;
          }

          .topbar {
            align-items: stretch;
            flex-direction: column;
            flex-wrap: nowrap;
            gap: 14px;
          }

          .brand {
            width: 100%;
            min-width: 0;
            flex: 0 0 auto;
          }

          .brand-logo {
            width: 48px;
            height: 48px;
            border-radius: 17px;
          }

          .brand h1 {
            font-size: 21px;
            white-space: normal;
          }

          .brand p {
            white-space: normal;
            overflow: visible;
            text-overflow: clip;
          }

          .appearance-tools {
            width: 100%;
            min-width: 0;
            overflow-x: auto;
            justify-content: flex-start;
            padding-bottom: 2px;
          }

          .mobile-menu-button {
            width: 100%;
            height: 42px;
            margin-top: 2px;
            border: 1px solid var(--line);
            border-radius: 16px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            color: var(--text);
            background: var(--taskbar-item);
            font: inherit;
            font-size: 13px;
            font-weight: 800;
            cursor: pointer;
          }

          .info-panel .hero-copy,
          .info-panel .quick-stats,
          .info-panel .feature-grid,
          .info-panel .mini-window {
            display: none;
          }

          .info-panel.mobile-open .hero-copy,
          .info-panel.mobile-open .mini-window {
            display: block;
          }

          .info-panel.mobile-open .quick-stats,
          .info-panel.mobile-open .feature-grid {
            display: grid;
          }

          .theme-toggle,
          .accent-inline {
            height: 42px;
          }

          .theme-toggle button {
            width: 30px;
            height: 30px;
          }

          .accent-inline-dot {
            width: 25px;
            height: 25px;
          }

          .hero-copy {
            margin-top: 12px;
            padding: 18px;
            border-radius: 24px;
          }

          .hero-copy h2 {
            font-size: 34px;
            line-height: 1.02;
          }
        }

        @media (max-width: 1120px) {
          .desktop-grid {
            grid-template-columns: 1fr;
            max-width: 900px;
          }
        }

        @media (max-width: 960px) {
          .desktop-shell {
            padding: 18px 14px 92px;
            overflow-y: auto;
          }

          .desktop-grid {
            height: auto;
            min-height: 0;
          }

          .glass-panel {
            height: auto;
            min-height: auto;
          }

          .left-panel-inner,
          .login-panel-inner {
            height: auto;
            overflow: visible;
            padding: 20px;
          }

          .quick-stats,
          .feature-grid {
            grid-template-columns: 1fr;
          }

          .taskbar {
            grid-template-columns: auto 1fr auto;
          }
        }

        @media (max-width: 520px) {
          .desktop-shell {
            padding: 8px;
          }

          .glass-panel {
            border-radius: 22px;
          }

          .left-panel-inner,
          .login-panel-inner {
            padding: 14px;
          }

          .brand-logo {
            width: 44px;
            height: 44px;
            border-radius: 15px;
          }

          .brand h1 {
            font-size: 20px;
          }

          .brand p {
            font-size: 12.5px;
          }

          .appearance-tools {
            gap: 8px;
          }

          .theme-toggle {
            gap: 4px;
            padding: 4px;
          }

          .accent-inline {
            gap: 6px;
            padding: 4px 7px 4px 9px;
          }

          .accent-inline-list {
            gap: 5px;
          }

          .primary-button,
          .google-button {
            height: 42px;
            border-radius: 14px;
            font-size: 13px;
          }

          .hero-copy h2 {
            font-size: 29px;
          }

          .hero-copy p {
            font-size: 14px;
            line-height: 1.55;
          }

          .quick-stats,
          .feature-grid {
            gap: 10px;
          }

          .rank-row {
            align-items: flex-start;
            flex-direction: column;
            gap: 5px;
          }
        }
      `}</style>

      <section className="desktop-shell">
        <div className="desktop-grid">
          <section className={`glass-panel info-panel ${showMobileInfo ? "mobile-open" : ""}`} aria-label="Tổng quan ứng dụng">
            <div className="left-panel-inner">
              <div className="topbar">
                <div className="brand">
                  <div className="brand-logo">
                    <Trophy size={25} />
                  </div>
                  <div>
                    <h1>Điểm thi đua 12A3</h1>
                    <p>Quản lý nề nếp, học tập và xếp hạng lớp</p>
                  </div>
                </div>

                <div className="appearance-tools">
                  <div className="theme-toggle" aria-label="Đổi giao diện">
                    <button
                      type="button"
                      className={theme === "auto" ? "active" : ""}
                      onClick={() => setTheme("auto")}
                      title="Tự động theo hệ thống"
                    >
                      <Monitor size={18} />
                    </button>
                    <button
                      type="button"
                      className={theme === "light" ? "active" : ""}
                      onClick={() => setTheme("light")}
                      title="Theme sáng"
                    >
                      <Sun size={18} />
                    </button>
                    <button
                      type="button"
                      className={theme === "dark" ? "active" : ""}
                      onClick={() => setTheme("dark")}
                      title="Theme tối"
                    >
                      <Moon size={18} />
                    </button>
                  </div>

                  <div className="accent-inline" aria-label="Màu chủ đạo">
                    <Palette size={17} />
                    <div className="accent-inline-list">
                      {(Object.keys(ACCENTS) as AccentKey[]).map((key) => (
                        <button
                          key={key}
                          type="button"
                          className={`accent-inline-dot ${accentKey === key ? "active" : ""}`}
                          style={{ "--dot-color": ACCENTS[key].main } as React.CSSProperties}
                          onClick={() => setAccentKey(key)}
                          title={ACCENTS[key].name}
                          aria-label={ACCENTS[key].name}
                        >
                          {accentKey === key && <CheckCircle2 size={13} />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="mobile-menu-button"
                onClick={() => setShowMobileInfo((value) => !value)}
              >
                <Menu size={17} />
                <span>{showMobileInfo ? "Ẩn phần xem nhanh" : "Mở phần xem nhanh"}</span>
              </button>

              <div className="hero-copy">
                <span className="hero-badge">
                  <Sparkles size={16} /> Giao diện mới ổn định hơn
                </span>
                <h2>Theo dõi thi đua lớp gọn, đẹp và dễ dùng.</h2>
                <p>
                  Bản login này được viết lại độc lập, không phụ thuộc ThemeContext. Hỗ trợ đăng nhập nhanh bằng tài khoản nội bộ hoặc Google Firebase.
                </p>
              </div>

              <div className="quick-stats">
                <div className="stat-card">
                  <strong>12A3</strong>
                  <span>Lớp đang quản lý</span>
                </div>
                <div className="stat-card">
                  <strong>2 loại</strong>
                  <span>Nề nếp và học tập</span>
                </div>
                <div className="stat-card">
                  <strong>Live</strong>
                  <span>Dữ liệu cập nhật nhanh</span>
                </div>
              </div>

              <div className="feature-grid">
                <article className="feature-card">
                  <div className="feature-icon">
                    <ShieldCheck size={21} />
                  </div>
                  <div>
                    <h3>Đăng nhập rõ ràng</h3>
                    <p>Tài khoản nội bộ dùng để test, Google dùng Firebase Auth.</p>
                  </div>
                </article>

                <article className="feature-card">
                  <div className="feature-icon">
                    <Palette size={21} />
                  </div>
                  <div>
                    <h3>Theme không lỗi màu</h3>
                    <p>Theme sáng/tối đều dùng cùng biến màu chủ đạo.</p>
                  </div>
                </article>
              </div>

              <div className="mini-window">
                <div className="mini-window-header">
                  <span className="dot" />
                  <span className="dot" style={{ opacity: 0.65 }} />
                  <span className="dot" style={{ opacity: 0.4 }} />
                  <span className="muted" style={{ marginLeft: 8, fontSize: 13 }}>Xem nhanh sau khi đăng nhập</span>
                </div>
                <div className="mini-window-body">
                  <div className="rank-row">
                    <strong>Bảng điều khiển</strong>
                    <span>Tổng quan điểm thi đua lớp</span>
                  </div>
                  <div className="rank-row">
                    <strong>Nhập điểm nhanh</strong>
                    <span>Cộng/trừ điểm nề nếp và học tập</span>
                  </div>
                  <div className="rank-row">
                    <strong>Xếp hạng</strong>
                    <span>Xem top tổ, cá nhân theo tuần/tháng</span>
                  </div>
                  <div className="rank-row">
                    <strong>Cuộc thi hiện tại</strong>
                    <span>Chỉ gvcn, lop_truong, bi_thu được xem</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="glass-panel login-panel" aria-label="Đăng nhập">
            <div className="login-panel-inner">
              <div className="login-header">
                <div className="login-mark">
                  <User size={28} />
                </div>
                <h2>Đăng nhập</h2>
                <p>Vào hệ thống điểm thi đua 12A3. Có thể dùng tài khoản test hoặc Google.</p>
              </div>

              <form className="form" onSubmit={handleLocalLogin}>
                <label>
                  <span className="field-label">Tên đăng nhập</span>
                  <div className="input-wrap">
                    <User size={19} />
                    <input
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      placeholder="Ví dụ: tổ trưởng, lớp trưởng..."
                      autoComplete="username"
                    />
                  </div>
                </label>

                <label>
                  <span className="field-label">Mật khẩu</span>
                  <div className="input-wrap">
                    <Lock size={19} />
                    <input
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Mật khẩu test"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => setShowPassword((value) => !value)}
                      title={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </label>

                <button className="primary-button" type="submit" disabled={loadingLocal || loadingGoogle}>
                  <AppWindow size={19} />
                  {loadingLocal ? "Đang mở..." : "Mở ứng dụng"}
                </button>
              </form>

              <div className="divider">hoặc</div>

              <button className="google-button" type="button" onClick={handleGoogleLogin} disabled={loadingGoogle || loadingLocal}>
                <span className="google-g" aria-hidden="true">G</span>
                {loadingGoogle ? "Đang đăng nhập Google..." : "Đăng nhập bằng Google"}
              </button>

              {error && <div className="error-box">{error}</div>}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
