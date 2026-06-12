const SEAT_CANON_WINDOW = "#a3k64-seating-window";
const SEAT_CANON_STYLE_ID = "a3k64-seat-canonical-name-style";
const SEAT_CANON_STORAGE = "a3k64-seating-map-v1";
const SEAT_CANON_LOCAL_DB = "a3k64-seating-sheet-local-db-v1";
let seatCanonLoop = 0;
let seatCanonCount = 0;
let seatCanonSearchBound = false;

const SEAT_NAME_REPLACE: Record<string, string> = {
  "A.Đạt": "A Đạt",
  "A. Đạt": "A Đạt",
  "V.Trường": "V Trường",
  "V. Trường": "V Trường",
  "D.Hiếu": "D Hiếu",
  "D. Hiếu": "D Hiếu",
  "N.Hiếu": "N Hiếu",
  "N. Hiếu": "N Hiếu",
  "N.Minh": "N Minh",
  "N. Minh": "N Minh",
  "K.Ngân": "K Ngân",
  "K. Ngân": "K Ngân",
  "T.Tâm": "T Tâm",
  "T. Tâm": "T Tâm",
  "Đ.Minh": "Đ Minh",
  "Đ. Minh": "Đ Minh",
  "H.Nhi": "H Nhi",
  "H. Nhi": "H Nhi",
  "K.Linh": "K Linh",
  "K. Linh": "K Linh",
  "C.Trường": "C Trường",
  "C. Trường": "C Trường",
  "Q.Nhi": "Q Nhi",
  "Q. Nhi": "Q Nhi",
  "H.Giang": "H Giang",
  "H. Giang": "H Giang",
  "H.Linh": "Hoàng Linh",
  "H. Linh": "Hoàng Linh",
  "Ynhi": "Y Nhi",
  "Y.Nhi": "Y Nhi",
  "Y. Nhi": "Y Nhi",
  "Thủy": "Thuỳ",
  "Thùy": "Thuỳ",
};

const SEAT_CANON_FULL: Record<string, string> = {
  "Hằng": "Nguyễn Thị Hằng",
  "Thiện": "Nguyễn Minh Thiện",
  "N Minh": "Hoàng Nguyễn Nhật Minh",
  "Hà Tâm": "Hà Minh Tâm",
  "Bảo": "Lê Hoàng Đức Bảo",
  "Thành": "Trần Văn Thành",
  "A Đạt": "Phan Anh Đạt",
  "V Trường": "Võ Văn Trường",
  "D Hiếu": "Dương Trung Hiếu",
  "Tài": "Lê Văn Tấn Tài",
  "Tinh": "Nguyễn Văn Quang Tinh",
  "K Ngân": "Nguyễn Thị Kim Ngân",
  "Thành Đạt": "Nguyễn Thành Đạt",
  "Hoàng Linh": "Nguyễn Hoàng Linh",
  "Lê Mạnh": "Nguyễn Lê Đức Mạnh",
  "Thục Anh": "Lê Thục Anh",
  "Quân": "Nguyễn Bảo Quân",
  "Như": "Lê Hoàng Gia Như",
  "Sáng": "Phạm Minh Sáng",
  "Hà Linh": "Nguyễn Hà Linh",
  "Tiến": "Đặng Lê Tiến",
  "Trang": "Nguyễn Thị Thu Trang",
  "Đ Minh": "Phạm Đăng Minh",
  "Thơ": "Lê Thị Anh Thơ",
  "Đức": "Nguyễn Minh Đức",
  "Huy Đạt": "Nguyễn Huy Thành Đạt",
  "Khánh": "Nguyễn Ngọc Nam Khánh",
  "N Hiếu": "Nguyễn Ngọc Hiếu",
  "Hữu": "Đinh Mạnh Hữu",
  "T Tâm": "Phạm Thanh Tâm",
  "Thắm": "Nguyễn Thị Hồng Thắm",
  "Hiền Linh": "Lê Hiền Linh",
  "Trung": "Nguyễn Hữu Trung",
  "Sang": "Phạm Tiến Sang",
  "Việt An": "Ngô Việt An",
  "Na": "Vi Kim Na",
  "Y Nhi": "Nguyễn Thị Yến Nhi",
  "Thắng": "Nguyễn Chiến Thắng",
  "H Nhi": "Nguyễn Lê Hải Nhi",
  "Đức Nam": "Nguyễn Đức Nam",
  "Mạnh": "Thái Đức Mạnh",
  "K Linh": "Nguyễn Khánh Linh",
  "C Trường": "Nguyễn Lê Công Trường",
  "Q Nhi": "Nguyễn Quỳnh Nhi",
  "Lộc": "Mai Thanh Lộc",
  "H Giang": "Phan Thị Hương Giang",
  "Duy": "Nguyễn Văn Khánh Duy",
  "Nhân": "Nguyễn Trọng Nhân",
  "Tuấn": "Nguyễn Văn Tuấn",
  "Đức An": "Nguyễn Bá Đức An",
  "Đan": "Nguyễn Bùi Linh Đan",
  "Thuỳ": "Thái Thị Thuỳ",
  "Đức Anh": "Lương Hoàng Đức Anh",
  "Trí": "Nguyễn Minh Trí",
};

function canonName(value: string) {
  const name = String(value || "").replace(/\s+/g, " ").trim();
  if (!name || name === "Trống") return name;
  return SEAT_NAME_REPLACE[name] || name;
}

function canonNorm(value: string) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function canonCompact(value: string) {
  return canonNorm(value).replace(/\s+/g, "");
}

function canonFull(shortName: string) {
  const name = canonName(shortName);
  if (!name || name === "Trống") return "";
  if (SEAT_CANON_FULL[name]) return SEAT_CANON_FULL[name];
  const norm = canonNorm(name);
  const found = Object.entries(SEAT_CANON_FULL).find(([key]) => canonNorm(key) === norm);
  return found?.[1] || name;
}

function canonMatch(shortName: string, fullName: string, query: string) {
  if (!query) return false;
  const q = canonNorm(query);
  const qc = canonCompact(query);
  return canonNorm(shortName).includes(q) || canonNorm(fullName).includes(q) || canonCompact(shortName).includes(qc) || canonCompact(fullName).includes(qc);
}

function canonRows(rows: any[]) {
  return Array.from({ length: 7 }, (_, r) => {
    const row = Array.isArray(rows?.[r]) ? rows[r] : [];
    return Array.from({ length: 4 }, (_, c) => canonName(String(row[c] || "")) === "Trống" ? "" : canonName(String(row[c] || "")));
  });
}

function normalizeState(state: any) {
  return { left: canonRows(state?.left || []), right: canonRows(state?.right || []) };
}

function normalizeStorage() {
  try {
    const raw = localStorage.getItem(SEAT_CANON_STORAGE);
    if (raw) {
      const next = normalizeState(JSON.parse(raw));
      const nextRaw = JSON.stringify(next);
      if (nextRaw !== raw) localStorage.setItem(SEAT_CANON_STORAGE, nextRaw);
    }
  } catch {}

  try {
    const raw = localStorage.getItem(SEAT_CANON_LOCAL_DB);
    if (!raw) return;
    const db = JSON.parse(raw);
    if (!Array.isArray(db.items)) return;
    let changed = false;
    db.items.forEach((item: any) => {
      if (item?.layout?.seats) {
        const next = normalizeState(item.layout.seats);
        if (JSON.stringify(next) !== JSON.stringify(item.layout.seats)) {
          item.layout.seats = next;
          changed = true;
        }
      }
    });
    if (changed) localStorage.setItem(SEAT_CANON_LOCAL_DB, JSON.stringify(db));
  } catch {}
}

function injectCanonStyle() {
  if (document.getElementById(SEAT_CANON_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SEAT_CANON_STYLE_ID;
  style.textContent = `
    ${SEAT_CANON_WINDOW} .stable-seat-cell.seat-name-match{
      background:color-mix(in srgb,var(--desktop-accent,#14b8a6) 24%,#fff)!important;
      color:#052e2b!important;
      box-shadow:inset 0 0 0 2px var(--desktop-accent,#14b8a6),0 0 0 3px color-mix(in srgb,var(--desktop-accent,#14b8a6) 18%,transparent)!important;
      z-index:4;
    }
    .theme-dark ${SEAT_CANON_WINDOW} .stable-seat-cell.seat-name-match{
      background:linear-gradient(180deg,color-mix(in srgb,var(--desktop-accent,#14b8a6) 34%,#111827),#0f172a)!important;
      color:#ecfeff!important;
    }
  `;
  document.head.appendChild(style);
}

function canonSearchValue() {
  return document.querySelector<HTMLInputElement>(`${SEAT_CANON_WINDOW} .stable-seat-tools input`)?.value || "";
}

function normalizeDomNames() {
  const query = canonSearchValue();
  document.querySelectorAll<HTMLElement>(`${SEAT_CANON_WINDOW} .stable-seat-cell`).forEach((cell) => {
    const before = (cell.textContent || "").replace(/\s+/g, " ").trim();
    const after = canonName(before);
    if (before && before !== after) cell.textContent = after === "Trống" ? "Trống" : after;
    const shortName = after === "Trống" ? "" : after;
    const fullName = canonFull(shortName);
    cell.dataset.shortName = shortName;
    cell.dataset.fullName = fullName;
    cell.title = shortName && fullName !== shortName ? `${shortName} — ${fullName}` : shortName;
    cell.classList.toggle("seat-name-match", canonMatch(shortName, fullName, query));
  });

  document.querySelectorAll<HTMLElement>(`${SEAT_CANON_WINDOW} .stable-seat-student-card`).forEach((card) => {
    const span = card.querySelector<HTMLElement>("span");
    const before = (card.dataset.name || span?.textContent || "").replace(/\s+/g, " ").trim();
    const after = canonName(before);
    if (after && before !== after) {
      card.dataset.name = after;
      if (span) span.textContent = after;
    }
    const fullName = canonFull(after);
    card.dataset.shortName = after;
    card.dataset.fullName = fullName;
    card.title = after && fullName !== after ? `${after} — ${fullName}` : after;
    card.classList.toggle("seat-name-match", canonMatch(after, fullName, query));
  });
}

function bindCanonSearch() {
  if (seatCanonSearchBound) return;
  seatCanonSearchBound = true;
  document.addEventListener("input", (event) => {
    const target = event.target as HTMLElement | null;
    if (!target?.matches?.(`${SEAT_CANON_WINDOW} .stable-seat-tools input`)) return;
    setTimeout(runCanonNames, 0);
    setTimeout(runCanonNames, 80);
  }, true);
  window.addEventListener("a3k64:seating-changed", () => setTimeout(runCanonNames, 0));
}

function runCanonNames() {
  injectCanonStyle();
  normalizeStorage();
  normalizeDomNames();
}

function bootCanonNames() {
  bindCanonSearch();
  runCanonNames();
  seatCanonLoop = window.setInterval(() => {
    runCanonNames();
    seatCanonCount += 1;
    if (seatCanonCount > 260 && seatCanonLoop) {
      clearInterval(seatCanonLoop);
      seatCanonLoop = 0;
    }
  }, 450);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootCanonNames);
else bootCanonNames();
