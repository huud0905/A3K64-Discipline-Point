import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { UserRound } from 'lucide-react';

function ProfileDesktopShortcut() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = window.setInterval(() => setReady(Boolean(document.querySelector('.win-root'))), 500);
    return () => window.clearInterval(timer);
  }, []);
  if (!ready) return null;
  return (
    <>
      <style>{`.profile-desktop-shortcut{position:fixed;left:18px;top:286px;z-index:85;width:78px;border:0;background:transparent;color:white;display:grid;gap:6px;justify-items:center;text-shadow:0 1px 4px #000;cursor:pointer}.profile-desktop-shortcut svg{width:52px;height:52px;padding:12px;border-radius:18px;background:linear-gradient(135deg,var(--desktop-accent,#2563eb),#7c3aed);box-shadow:0 14px 34px #0005}.profile-desktop-shortcut span{font-size:12px;font-weight:800}`}</style>
      <button
        type="button"
        className="profile-desktop-shortcut"
        title="Bấm đúp để mở Profile"
        onDoubleClick={() => window.dispatchEvent(new CustomEvent('a3k64-open-profile', { detail: {} }))}
      >
        <UserRound />
        <span>Profile</span>
      </button>
    </>
  );
}

const root = document.createElement('div');
root.id = 'a3k64-profile-shortcut-root';
document.body.appendChild(root);
ReactDOM.createRoot(root).render(<ProfileDesktopShortcut />);
