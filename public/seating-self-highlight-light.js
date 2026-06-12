(() => {
  const W = '#a3k64-seating-window';
  const STYLE_ID = 'a3k64-seat-self-light-script-style';
  let count = 0;

  function norm(v) {
    return String(v || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function compact(v) {
    return norm(v).replace(/\s+/g, '');
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      body:not(.theme-dark) .seat-tools-toast,
      body:not(.theme-dark) .hard-seat-swap-toast,
      body:not(.theme-dark) .seat-ctrl-toast,
      body:not(.theme-dark) .pretty-seat-toast {
        background: rgba(255,255,255,.96) !important;
        color: #0f172a !important;
        border-color: color-mix(in srgb, var(--desktop-accent,#14b8a6) 65%, #cbd5e1) !important;
        box-shadow: 0 18px 55px rgba(15,23,42,.18) !important;
      }
      body:not(.theme-dark) ${W} .stable-seat-cell.seat-name-match {
        background: color-mix(in srgb, var(--desktop-accent,#14b8a6) 18%, #ffffff) !important;
        color: #052e2b !important;
        box-shadow: inset 0 0 0 2px var(--desktop-accent,#14b8a6), 0 0 0 4px color-mix(in srgb, var(--desktop-accent,#14b8a6) 16%, transparent) !important;
      }
      ${W} .stable-seat-cell.seat-self-match {
        background: linear-gradient(180deg,#fef3c7,#fde68a) !important;
        color: #451a03 !important;
        border-color: #f59e0b !important;
        box-shadow: inset 0 0 0 2px #f59e0b,0 0 0 4px rgba(245,158,11,.22),0 14px 34px rgba(245,158,11,.18) !important;
        z-index: 6;
      }
      .theme-dark ${W} .stable-seat-cell.seat-self-match {
        background: linear-gradient(180deg,rgba(245,158,11,.32),rgba(120,53,15,.38)) !important;
        color: #fff7ed !important;
        border-color: #f59e0b !important;
        box-shadow: inset 0 0 0 2px #f59e0b,0 0 0 4px rgba(245,158,11,.22),0 16px 36px rgba(0,0,0,.24) !important;
      }
      ${W} .stable-seat-cell.seat-self-match::before {
        content: 'Bạn';
        position: absolute;
        top: 5px;
        right: 7px;
        padding: 2px 6px;
        border-radius: 999px;
        background: #f59e0b;
        color: #111827;
        font-size: 10px;
        line-height: 1;
        font-weight: 1000;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  function pickStrings(obj) {
    const user = (obj && (obj.user || obj.account || obj.profile)) || obj || {};
    const values = [
      user.name, user.fullName, user.full_name, user.studentName, user.student_name,
      user.displayName, user.hoTen, user.hoten, user.username, user.email,
      obj && obj.name, obj && obj.fullName, obj && obj.studentName,
      obj && obj.displayName, obj && obj.username, obj && obj.email,
    ];
    return values.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim());
  }

  function candidates() {
    const keys = ['a3k64-login-session-v1', 'a3k64_user', 'currentUser', 'user', 'authUser', 'loginUser'];
    const out = new Set();
    keys.forEach((key) => {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      try { pickStrings(JSON.parse(raw)).forEach((x) => out.add(x)); }
      catch { if (raw.length < 120) out.add(raw); }
    });
    Array.from(out).forEach((item) => {
      const beforeAt = String(item).split('@')[0] || '';
      if (beforeAt && beforeAt !== item) out.add(beforeAt);
      const noDigits = beforeAt.replace(/[0-9_\-.]+/g, ' ').trim();
      if (noDigits) out.add(noDigits);
      if (compact(item).includes('huu')) out.add('Hữu');
    });
    return Array.from(out).filter((x) => compact(x).length >= 2);
  }

  function scoreMatch(candidate, shortName, fullName) {
    const c = compact(candidate), s = compact(shortName), f = compact(fullName);
    if (!c || !s) return 0;

    // Ưu tiên tuyệt đối tên hiển thị trong ô. Ví dụ candidate Hữu phải thắng ô Hữu,
    // không được bắt nhầm Nguyễn Hữu Trung.
    if (c === s) return 1000;
    if (f && c === f) return 950;

    // Nếu candidate chỉ là 1 từ ngắn, chỉ cho match tên ô, không match tên đệm trong họ tên đầy đủ.
    const isShortSingleWord = !norm(candidate).includes(' ') && c.length <= 5;
    if (isShortSingleWord) {
      if (s.includes(c) || c.includes(s)) return 700;
      return 0;
    }

    if (f.length >= 5 && f.includes(c)) return 520;
    if (f.length >= 5 && c.includes(f)) return 510;
    if (s.length >= 3 && c.includes(s)) return 460;
    if (c.length >= 3 && s.includes(c)) return 450;
    return 0;
  }

  function run() {
    injectStyle();
    const cands = candidates();
    let bestCell = null;
    let bestScore = 0;

    const cells = Array.from(document.querySelectorAll(`${W} .stable-seat-cell`));
    cells.forEach((cell) => {
      const shortName = (cell.dataset.shortName || cell.textContent || '').replace(/\s+/g, ' ').trim();
      const fullName = (cell.dataset.fullName || '').trim();
      const score = shortName && shortName !== 'Trống'
        ? Math.max(0, ...cands.map((cand) => scoreMatch(cand, shortName, fullName)))
        : 0;
      if (score > bestScore) {
        bestScore = score;
        bestCell = cell;
      }
    });

    cells.forEach((cell) => cell.classList.toggle('seat-self-match', cell === bestCell && bestScore > 0));
  }

  document.addEventListener('DOMContentLoaded', run);
  window.addEventListener('a3k64:seating-changed', () => setTimeout(run, 80));
  window.addEventListener('storage', () => setTimeout(run, 80));
  const timer = setInterval(() => {
    run();
    count += 1;
    if (count > 260) clearInterval(timer);
  }, 600);
})();
