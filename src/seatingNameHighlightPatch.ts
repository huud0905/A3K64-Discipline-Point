const SEAT_NAME_WINDOW = "#a3k64-seating-window";
const SEAT_NAME_STYLE_ID = "a3k64-seat-name-highlight-style";
let seatNameLoop = 0;
let seatNameCount = 0;
let seatNameSearchBound = false;

void import("./seatingPreviewPermissions");
void import("./seatingPreviewPermissionControls");

const SEAT_FULL_NAMES: Record<string, string> = {
  "Hằng": "Nguyễn Thị Hằng",
  "Thiện": "Nguyễn Minh Thiện",
  "N.Minh": "Hoàng Nguyễn Nhật Minh",
  "Hà Tâm": "Hà Minh Tâm",
  "Bảo": "Lê Hoàng Đức Bảo",
  "Thành": "Trần Văn Thành",
  "A.Đạt": "Phan Anh Đạt",
  "V.Trường": "Võ Văn Trường",
  "D.Hiếu": "Dương Trung Hiếu",
  "Tài": "Lê Văn Tấn Tài",
  "Tinh": "Nguyễn Văn Quang Tinh",
  "K.Ngân": "Nguyễn Thị Kim Ngân",
  "Thành Đạt": "Nguyễn Thành Đạt",
  "H.Linh": "Nguyễn Hoàng Linh",
  "Lê Mạnh": "Nguyễn Lê Đức Mạnh",
  "Thục Anh": "Lê Thục Anh",
  "Quân": "Nguyễn Bảo Quân",
  "Như": "Lê Hoàng Gia Như",
  "Sáng": "Phạm Minh Sáng",
  "Hà Linh": "Nguyễn Hà Linh",
  "Tiến": "Đặng Lê Tiến",
  "Trang": "Nguyễn Thị Thu Trang",
  "Đ.Minh": "Phạm Đăng Minh",
  "Thơ": "Lê Thị Anh Thơ",
  "Đức": "Nguyễn Minh Đức",
  "Huy Đạt": "Nguyễn Huy Thành Đạt",
  "Khánh": "Nguyễn Ngọc Nam Khánh",
  "N.Hiếu": "Nguyễn Ngọc Hiếu",
  "Hữu": "Đinh Mạnh Hữu",
  "T.Tâm": "Phạm Thanh Tâm",
  "Thắm": "Nguyễn Thị Hồng Thắm",
  "Hiền Linh": "Lê Hiền Linh",
  "Trung": "Nguyễn Hữu Trung",
  "Sang": "Phạm Tiến Sang",
  "Việt An": "Ngô Việt An",
  "Na": "Vi Kim Na",
  "Ynhi": "Nguyễn Thị Yến Nhi",
  "Y Nhi": "Nguyễn Thị Yến Nhi",
  "Y.Nhi": "Nguyễn Thị Yến Nhi",
  "Thắng": "Nguyễn Chiến Thắng",
  "H.Nhi": "Nguyễn Lê Hải Nhi",
  "Đức Nam": "Nguyễn Đức Nam",
  "Mạnh": "Thái Đức Mạnh",
  "K.Linh": "Nguyễn Khánh Linh",
  "C.Trường": "Nguyễn Lê Công Trường",
  "Q.Nhi": "Nguyễn Quỳnh Nhi",
  "Lộc": "Mai Thanh Lộc",
  "H.Giang": "Phan Thị Hương Giang",
  "Duy": "Nguyễn Văn Khánh Duy",
  "Nhân": "Nguyễn Trọng Nhân",
  "Tuấn": "Nguyễn Văn Tuấn",
  "Đức An": "Nguyễn Bá Đức An",
  "Đan": "Nguyễn Bùi Linh Đan",
  "Thủy": "Thái Thị Thuỳ",
  "Thùy": "Thái Thị Thuỳ",
  "Thuỳ": "Thái Thị Thuỳ",
  "Đức Anh": "Lương Hoàng Đức Anh",
  "Trí": "Nguyễn Minh Trí",
};

function seatNameNorm(value: string) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function seatNameCompact(value: string) {
  return seatNameNorm(value).replace(/\s+/g, "");
}

function seatShortName(el: HTMLElement) {
  const text = (el.textContent || "").replace(/\s+/g, " ").trim();
  return text === "Trống" ? "" : text;
}

function seatFullName(shortName: string) {
  if (!shortName) return "";
  if (SEAT_FULL_NAMES[shortName]) return SEAT_FULL_NAMES[shortName];
  const normShort = seatNameNorm(shortName);
  const found = Object.entries(SEAT_FULL_NAMES).find(([key]) => seatNameNorm(key) === normShort);
  return found?.[1] || shortName;
}

function seatMatchesQuery(shortName: string, fullName: string, query: string) {
  if (!query) return false;
  const q = seatNameNorm(query);
  const qc = seatNameCompact(query);
  const shortNorm = seatNameNorm(shortName);
  const fullNorm = seatNameNorm(fullName);
  return shortNorm.includes(q) || fullNorm.includes(q) || seatNameCompact(shortName).includes(qc) || seatNameCompact(fullName).includes(qc);
}

function injectSeatNameStyle() {
  if (document.getElementById(SEAT_NAME_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SEAT_NAME_STYLE_ID;
  style.textContent = `
    ${SEAT_NAME_WINDOW} .stable-seat-cell,
    ${SEAT_NAME_WINDOW} .stable-seat-student-card{
      position:relative!important;
    }
    ${SEAT_NAME_WINDOW} .stable-seat-cell.seat-name-match{
      background:color-mix(in srgb,var(--desktop-accent,#14b8a6) 24%,#fff)!important;
      color:#052e2b!important;
      box-shadow:inset 0 0 0 2px var(--desktop-accent,#14b8a6),0 0 0 3px color-mix(in srgb,var(--desktop-accent,#14b8a6) 18%,transparent)!important;
      z-index:4;
    }
    .theme-dark ${SEAT_NAME_WINDOW} .stable-seat-cell.seat-name-match{
      background:linear-gradient(180deg,color-mix(in srgb,var(--desktop-accent,#14b8a6) 34%,#111827),#0f172a)!important;
      color:#ecfeff!important;
      box-shadow:inset 0 0 0 2px var(--desktop-accent,#14b8a6),0 0 0 3px color-mix(in srgb,var(--desktop-accent,#14b8a6) 20%,transparent),0 12px 26px rgba(0,0,0,.22)!important;
    }
    ${SEAT_NAME_WINDOW} .stable-seat-cell.seat-name-match::after,
    ${SEAT_NAME_WINDOW} .stable-seat-cell:hover::after{
      content:attr(data-full-name);
      position:absolute;
      left:8px;
      right:8px;
      bottom:5px;
      display:block;
      padding-top:3px;
      border-top:1px solid rgba(20,184,166,.35);
      color:color-mix(in srgb,var(--desktop-accent,#14b8a6) 78%,#0f172a);
      font-size:10px;
      line-height:1.05;
      font-weight:900;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
      pointer-events:none;
      opacity:.96;
    }
    .theme-dark ${SEAT_NAME_WINDOW} .stable-seat-cell.seat-name-match::after,
    .theme-dark ${SEAT_NAME_WINDOW} .stable-seat-cell:hover::after{
      color:#5eead4;
      border-top-color:rgba(94,234,212,.32);
    }
    ${SEAT_NAME_WINDOW} .stable-seat-cell.empty::after,
    ${SEAT_NAME_WINDOW} .stable-seat-cell[data-full-name=""]::after{
      display:none!important;
    }
    ${SEAT_NAME_WINDOW} .stable-seat-student-card.seat-name-match{
      border-color:var(--desktop-accent,#14b8a6)!important;
      background:color-mix(in srgb,var(--desktop-accent,#14b8a6) 14%,#fff)!important;
      box-shadow:0 0 0 3px color-mix(in srgb,var(--desktop-accent,#14b8a6) 18%,transparent)!important;
    }
    .theme-dark ${SEAT_NAME_WINDOW} .stable-seat-student-card.seat-name-match{
      background:color-mix(in srgb,var(--desktop-accent,#14b8a6) 18%,#111827)!important;
    }
    ${SEAT_NAME_WINDOW} .stable-seat-student-card[data-full-name]::after{
      content:attr(data-full-name);
      position:absolute;
      left:12px;
      right:12px;
      bottom:-18px;
      display:none;
      font-size:10px;
      color:#64748b;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
      pointer-events:none;
    }
    ${SEAT_NAME_WINDOW} .stable-seat-student-card:hover::after,
    ${SEAT_NAME_WINDOW} .stable-seat-student-card.seat-name-match::after{
      display:block;
    }
  `;
  document.head.appendChild(style);
}

function currentSeatQuery() {
  const input = document.querySelector<HTMLInputElement>(`${SEAT_NAME_WINDOW} .stable-seat-tools input`);
  return input?.value || "";
}

function annotateSeatCells() {
  document.querySelectorAll<HTMLElement>(`${SEAT_NAME_WINDOW} .stable-seat-cell`).forEach((cell) => {
    const shortName = seatShortName(cell);
    const fullName = seatFullName(shortName);
    cell.dataset.shortName = shortName;
    cell.dataset.fullName = shortName ? fullName : "";
    cell.title = shortName && fullName !== shortName ? `${shortName} — ${fullName}` : shortName;
  });
}

function annotateStudentCards() {
  document.querySelectorAll<HTMLElement>(`${SEAT_NAME_WINDOW} .stable-seat-student-card`).forEach((card) => {
    const shortName = (card.dataset.name || card.querySelector("span")?.textContent || "").trim();
    const fullName = seatFullName(shortName);
    card.dataset.shortName = shortName;
    card.dataset.fullName = shortName ? fullName : "";
    card.title = shortName && fullName !== shortName ? `${shortName} — ${fullName}` : shortName;
  });
}

function applySeatNameHighlight() {
  injectSeatNameStyle();
  annotateSeatCells();
  annotateStudentCards();
  const query = currentSeatQuery();
  document.querySelectorAll<HTMLElement>(`${SEAT_NAME_WINDOW} .stable-seat-cell`).forEach((cell) => {
    const shortName = cell.dataset.shortName || "";
    const fullName = cell.dataset.fullName || "";
    cell.classList.toggle("seat-name-match", seatMatchesQuery(shortName, fullName, query));
  });
  document.querySelectorAll<HTMLElement>(`${SEAT_NAME_WINDOW} .stable-seat-student-card`).forEach((card) => {
    const shortName = card.dataset.shortName || "";
    const fullName = card.dataset.fullName || "";
    card.classList.toggle("seat-name-match", seatMatchesQuery(shortName, fullName, query));
  });
}

function bindSeatNameSearch() {
  if (seatNameSearchBound) return;
  seatNameSearchBound = true;
  document.addEventListener("input", (event) => {
    const target = event.target as HTMLElement | null;
    if (!target?.matches?.(`${SEAT_NAME_WINDOW} .stable-seat-tools input`)) return;
    setTimeout(applySeatNameHighlight, 0);
    setTimeout(applySeatNameHighlight, 80);
  }, true);
  window.addEventListener("a3k64:seating-changed", () => setTimeout(applySeatNameHighlight, 0));
}

function bootSeatNameHighlight() {
  injectSeatNameStyle();
  bindSeatNameSearch();
  applySeatNameHighlight();
  seatNameLoop = window.setInterval(() => {
    applySeatNameHighlight();
    seatNameCount += 1;
    if (seatNameCount > 240 && seatNameLoop) {
      clearInterval(seatNameLoop);
      seatNameLoop = 0;
    }
  }, 600);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootSeatNameHighlight);
else bootSeatNameHighlight();
