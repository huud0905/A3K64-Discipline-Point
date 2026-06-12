const SEAT_SELF_WINDOW = "#a3k64-seating-window";
const SEAT_SELF_STYLE_ID = "a3k64-seat-self-highlight-style";
let seatSelfLoop = 0;
let seatSelfCount = 0;
let seatSelfBound = false;

function seatSelfNorm(value: string) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function seatSelfCompact(value: string) {
  return seatSelfNorm(value).replace(/\s+/g, "");
}

function injectSeatSelfStyle() {
  if (document.getElementById(SEAT_SELF_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SEAT_SELF_STYLE_ID;
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
    body:not(.theme-dark) ${SEAT_SELF_WINDOW} .stable-seat-cell.seat-name-match {
      background: color-mix(in srgb, var(--desktop-accent,#14b8a6) 18%, #ffffff) !important;
      color: #062f2b !important;
      box-shadow: inset 0 0 0 2px var(--desktop-accent,#14b8a6), 0 0 0 3px color-mix(in srgb, var(--desktop-accent,#14b8a6) 18%, transparent) !important;
    }
    ${SEAT_SELF_WINDOW} .stable-seat-cell.seat-self-match {
      background: linear-gradient(180deg, #fef3c7, #fde68a) !important;
      color: #451a03 !important;
      border-color: #f59e0b !important;
      box-shadow: inset 0 0 0 2px #f59e0b, 0 0 0 4px rgba(245,158,11,.22), 0 14px 34px rgba(245,158,11,.18) !important;
      z-index: 6;
    }
    .theme-dark ${SEAT_SELF_WINDOW} .stable-seat-cell.seat-self-match {
      background: linear-gradient(180deg, rgba(245,158,11,.32), rgba(120,53,15,.38)) !important;
      color: #fff7ed !important;
      border-color: #f59e0b !important;
      box-shadow: inset 0 0 0 2px #f59e0b, 0 0 0 4px rgba(245,158,11,.22), 0 16px 36px rgba(0,0,0,.24) !important;
    }
    ${SEAT_SELF_WINDOW} .stable-seat-cell.seat-self-match::before {
      content: "Bạn";
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

function pickStrings(obj: any) {
  const user = obj?.user || obj?.account || obj?.profile || obj || {};
  const list = [
    user.name,
    user.fullName,
    user.full_name,
    user.studentName,
    user.student_name,
    user.displayName,
    user.hoTen,
    user.hoten,
    user.username,
    user.email,
    obj?.name,
    obj?.fullName,
    obj?.studentName,
    obj?.displayName,
    obj?.username,
    obj?.email,
  ];
  return list.filter((item) => typeof item === "string" && item.trim()).map((item) => String(item).trim());
}

function getSeatSelfCandidates() {
  const keys = ["a3k64-login-session-v1", "a3k64_user", "currentUser", "user", "authUser", "loginUser"];
  const out = new Set<string>();
  keys.forEach((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    try {
      pickStrings(JSON.parse(raw)).forEach((item) => out.add(item));
    } catch {
      if (raw.length < 120) out.add(raw);
    }
  });

  Array.from(out).forEach((item) => {
    const beforeAt = item.split("@")[0] || "";
    if (beforeAt && beforeAt !== item) out.add(beforeAt);
    const noDigits = beforeAt.replace(/[0-9_\-.]+/g, " ").trim();
    if (noDigits) out.add(noDigits);
    if (seatSelfCompact(item).includes("huu")) out.add("Hữu");
  });
  return Array.from(out).filter((item) => seatSelfCompact(item).length >= 2);
}

function isSelfCandidateMatch(candidate: string, shortName: string, fullName: string) {
  const c = seatSelfCompact(candidate);
  const s = seatSelfCompact(shortName);
  const f = seatSelfCompact(fullName);
  if (!c || !s) return false;
  if (c === s || c === f) return true;
  if (f.length >= 5 && (c.includes(f) || f.includes(c))) return true;
  if (s.length >= 3 && c.includes(s)) return true;
  if (c.length >= 3 && s.includes(c)) return true;
  return false;
}

function applySeatSelfHighlight() {
  injectSeatSelfStyle();
  const candidates = getSeatSelfCandidates();
  let matched = false;
  document.querySelectorAll<HTMLElement>(`${SEAT_SELF_WINDOW} .stable-seat-cell`).forEach((cell) => {
    const shortName = (cell.dataset.shortName || cell.textContent || "").replace(/\s+/g, " ").trim();
    const fullName = (cell.dataset.fullName || "").trim();
    const isMatch = !matched && shortName && shortName !== "Trống" && candidates.some((candidate) => isSelfCandidateMatch(candidate, shortName, fullName));
    cell.classList.toggle("seat-self-match", Boolean(isMatch));
    if (isMatch) matched = true;
  });
}

function bindSeatSelf() {
  if (seatSelfBound) return;
  seatSelfBound = true;
  window.addEventListener("a3k64:seating-changed", () => setTimeout(applySeatSelfHighlight, 60));
  window.addEventListener("storage", () => setTimeout(applySeatSelfHighlight, 60));
}

function bootSeatSelfHighlight() {
  bindSeatSelf();
  applySeatSelfHighlight();
  seatSelfLoop = window.setInterval(() => {
    applySeatSelfHighlight();
    seatSelfCount += 1;
    if (seatSelfCount > 260 && seatSelfLoop) {
      clearInterval(seatSelfLoop);
      seatSelfLoop = 0;
    }
  }, 600);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootSeatSelfHighlight);
else bootSeatSelfHighlight();
