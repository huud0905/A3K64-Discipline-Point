type StableSeatPosition = { side: "left" | "right"; row: number; seat: number };
type StableSeatingState = { left: string[][]; right: string[][] };
type StableDragPayload = { type: "seat"; pos: StableSeatPosition; name: string } | { type: "student"; name: string };

const STABLE_SEAT_PATH = "/desktop/seating-chart";
const STABLE_SEAT_STYLE_ID = "a3k64-stable-seat-style";
const STABLE_SEAT_WINDOW_ID = "a3k64-seating-window";
const STABLE_SEAT_SHORTCUT_ID = "a3k64-seating-shortcut";
const STABLE_SEAT_TASKBAR_ID = "a3k64-seating-taskbar-button";
const STABLE_SEAT_STORAGE_KEY = "a3k64-seating-map-v1";

const STABLE_DEFAULT_SEATING: StableSeatingState = {
  left: [
    ["", "V.Trường", "Nhân", ""],
    ["Lê Mạnh", "Hằng", "Sáng", "Hà Linh"],
    ["N.Hiếu", "Tuấn", "H.Linh", "A.Đạt"],
    ["D.Hiếu", "Q.Nhi", "Lộc", "Thủy"],
    ["H.Giang", "H.Nhi", "Thơ", "Tinh"],
    ["Trí", "N.Minh", "Đức An", "K.Ngân"],
    ["Huy Đạt", "Sang", "Đan", "Thành Đạt"],
  ],
  right: [
    ["Thiện", "Hiền Linh", "Đức Nam", "Việt An"],
    ["Như", "Quân", "Ynhi", "Thắng"],
    ["T.Tâm", "Đức", "Hà Tâm", "Đ.Minh"],
    ["Đức Anh", "Tài", "Thắm", "Trung"],
    ["Thục Anh", "Bảo", "Na", "Mạnh"],
    ["Thành", "K.Linh", "Duy", "Trang"],
    ["Khánh", "Tiến", "C.Trường", "Hữu"],
  ],
};

const STABLE_STUDENTS = Array.from(
  new Set(STABLE_DEFAULT_SEATING.left.flat().concat(STABLE_DEFAULT_SEATING.right.flat()).map((name) => name.trim()).filter(Boolean)),
).sort((a, b) => a.localeCompare(b, "vi"));

let stableBootTimer = 0;
let stableBootTries = 0;
let stableRouteOpenScheduled = false;
let stableDrag: StableDragPayload | null = null;

function cloneStableSeating(value: StableSeatingState): StableSeatingState {
  return { left: value.left.map((row) => row.slice()), right: value.right.map((row) => row.slice()) };
}

function normalizeStableRows(rows: string[][]) {
  const normalized = rows.map((row) => {
    const next = Array.isArray(row) ? row.slice(0, 4).map((item) => String(item || "").trim()) : [];
    while (next.length < 4) next.push("");
    return next;
  });
  while (normalized.length < 7) normalized.push(["", "", "", ""]);
  return normalized.slice(0, 7);
}

function loadStableSeating(): StableSeatingState {
  try {
    const raw = localStorage.getItem(STABLE_SEAT_STORAGE_KEY);
    if (!raw) return cloneStableSeating(STABLE_DEFAULT_SEATING);
    const parsed = JSON.parse(raw) as StableSeatingState;
    return { left: normalizeStableRows(parsed.left || []), right: normalizeStableRows(parsed.right || []) };
  } catch {
    return cloneStableSeating(STABLE_DEFAULT_SEATING);
  }
}

function saveStableSeating(state: StableSeatingState) {
  localStorage.setItem(STABLE_SEAT_STORAGE_KEY, JSON.stringify(state));
}

function stableIconSvg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16"/><path d="M4 10h16"/><path d="M4 15h16"/><path d="M7 5v14"/><path d="M17 5v14"/><path d="M5 19h14"/></svg>`;
}

function stableMinSvg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round"><path d="M6 18h12"/></svg>`;
}

function stableMaxSvg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="m21 3-7 7"/><path d="M9 21H3v-6"/><path d="m3 21 7-7"/></svg>`;
}

function stableCloseSvg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round"><path d="M6 6l12 12"/><path d="M18 6 6 18"/></svg>`;
}

function stableNormalize(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").trim();
}

function stableEscape(value: string) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function injectStableSeatStyle() {
  if (document.getElementById(STABLE_SEAT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STABLE_SEAT_STYLE_ID;
  style.textContent = `
    #${STABLE_SEAT_WINDOW_ID}{position:absolute;left:calc(50% - min(650px,calc((100vw - 176px)/2)));top:18px;width:min(1300px,calc(100vw - 176px));height:min(740px,calc(100vh - 104px));min-height:560px;border:1px solid #cbd5e1;border-radius:22px;overflow:hidden;background:#f8fafc;color:#0f172a;box-shadow:0 34px 100px rgba(0,0,0,.28);z-index:90;}
    #${STABLE_SEAT_WINDOW_ID}.maximized{position:fixed;left:0!important;top:0!important;width:100vw!important;height:calc(100vh - 58px)!important;min-height:0;border-radius:0;}
    #${STABLE_SEAT_WINDOW_ID}.minimized{display:none!important;}
    .stable-seat-titlebar{height:46px;display:grid;grid-template-columns:1fr auto;align-items:center;border-bottom:1px solid #dbe4f0;background:#f8fafc;cursor:move;user-select:none;}
    .stable-seat-title{display:flex;align-items:center;gap:10px;padding-left:14px;min-width:0;}
    .stable-seat-title-icon{width:30px;height:30px;display:grid;place-items:center;border-radius:10px;background:var(--desktop-accent,#14b8a6);color:#fff;}
    .stable-seat-title-icon svg{width:19px;height:19px;}
    .stable-seat-title strong{font-size:14px;white-space:nowrap;}
    .stable-seat-title span{font-size:12px;color:#64748b;}
    .stable-seat-actions{display:flex;height:46px;align-items:stretch;}
    .stable-seat-actions button{width:46px;height:46px;border:0;background:transparent;color:#334155;display:grid;place-items:center;cursor:pointer;padding:0;}
    .stable-seat-actions button:hover{background:#e2e8f0;}
    .stable-seat-actions button svg{width:16px;height:16px;}
    .stable-seat-actions .danger{width:32px;height:32px;margin:7px 8px 7px 0;border-radius:9px;background:rgba(239,68,68,.92);color:#fff;}
    .stable-seat-actions .danger:hover{background:#dc2626;}
    .stable-seat-body{height:calc(100% - 46px);overflow:hidden;padding:16px;background:linear-gradient(180deg,#f8fafc,#edf2f7);display:flex;flex-direction:column;min-height:0;}
    .stable-seat-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex:0 0 auto;margin-bottom:14px;}
    .stable-seat-heading{display:flex;align-items:center;gap:12px;min-width:0;}
    .stable-seat-badge{border:1px solid color-mix(in srgb,var(--desktop-accent,#14b8a6) 46%,#cbd5e1);border-radius:999px;padding:7px 10px;background:#fff;font-size:12px;font-weight:900;white-space:nowrap;}
    .stable-seat-heading h1{margin:0;font-size:22px;letter-spacing:-.04em;}
    .stable-seat-heading p{margin:4px 0 0;color:#475569;font-size:13px;}
    .stable-seat-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;}
    .stable-seat-tools input{height:38px;width:200px;border:1px solid #cbd5e1;border-radius:13px;background:#fff;color:#0f172a;padding:0 12px;outline:none;}
    .stable-seat-tools input:focus{border-color:var(--desktop-accent,#14b8a6);box-shadow:0 0 0 3px color-mix(in srgb,var(--desktop-accent,#14b8a6) 18%,transparent);}
    .stable-seat-tools button{height:38px;border:1px solid #cbd5e1;border-radius:13px;padding:0 12px;background:#fff;color:#0f172a;cursor:pointer;font-weight:900;}
    .stable-seat-tools button.primary{background:var(--desktop-accent,#14b8a6);border-color:transparent;color:#fff;}
    .stable-seat-main{display:grid;grid-template-columns:230px minmax(0,1fr);gap:14px;flex:1 1 auto;min-height:0;overflow:hidden;}
    .stable-seat-students{border:1px solid #cbd5e1;border-radius:22px;background:#fff;padding:12px;display:flex;flex-direction:column;gap:10px;min-height:0;overflow:hidden;}
    .stable-seat-students-head{display:flex;justify-content:space-between;gap:8px;}
    .stable-seat-students-head strong{display:block;font-size:15px;}
    .stable-seat-students-head span{display:block;color:#64748b;font-size:12px;margin-top:2px;line-height:1.3;}
    .stable-seat-student-list{display:grid;gap:7px;overflow:auto;min-height:0;flex:1 1 auto;padding-right:2px;}
    .stable-seat-student-card{border:1px solid #cbd5e1;border-radius:13px;background:#fff;color:#0f172a;padding:8px 10px;font-weight:900;cursor:grab;text-align:left;display:flex;align-items:center;justify-content:space-between;gap:8px;}
    .stable-seat-student-card:hover,.stable-seat-student-card.highlight{border-color:var(--desktop-accent,#14b8a6);background:color-mix(in srgb,var(--desktop-accent,#14b8a6) 10%,#fff);}
    .stable-seat-student-card small{font-size:11px;color:#64748b;font-weight:800;}
    .stable-seat-board{position:relative;border:2px solid #0f3554;border-radius:8px;background:#fff;padding:48px 46px 52px;min-width:0;overflow:hidden;}
    .stable-room-window{position:absolute;width:22px;height:98px;background:#176a8b;border:2px solid #08384d;z-index:6;}
    .stable-room-window.left.a{left:-11px;top:15%;}.stable-room-window.left.b{left:-11px;top:63%;}.stable-room-window.right.a{right:-11px;top:10%;}.stable-room-window.right.b{right:-11px;top:38%;}
    .stable-room-door{position:absolute;right:-11px;bottom:18px;width:22px;height:116px;background:#050505;border:2px solid #050505;z-index:6;}
    .stable-seat-back{position:absolute;left:50%;top:14px;transform:translateX(-50%);font-weight:1000;letter-spacing:.04em;}
    .stable-seat-layout{position:relative;z-index:3;display:grid;grid-template-columns:minmax(0,1fr) 70px minmax(0,1fr);gap:18px;align-items:stretch;}
    .stable-seat-aisle{display:flex;align-items:center;justify-content:center;writing-mode:vertical-rl;text-orientation:mixed;color:#1d4ed8;border:1px dashed #cbd5e1;border-radius:16px;background:#f8fafc;font-weight:1000;letter-spacing:.18em;}
    .stable-seat-side{display:grid;gap:12px;}
    .stable-seat-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1px solid #cbd5e1;border-radius:14px;overflow:hidden;background:#fff;min-height:42px;}
    .stable-seat-cell{min-height:42px;border-right:1px solid #cbd5e1;background:#fff;color:#020617;display:flex;align-items:center;justify-content:center;padding:7px 5px;text-align:center;font-weight:900;font-size:14px;line-height:1.2;}
    .stable-seat-cell:last-child{border-right:0;}
    .stable-seat-cell.empty{background:#f1f5f9;color:#64748b;}.stable-seat-cell.highlight{background:color-mix(in srgb,var(--desktop-accent,#14b8a6) 18%,#fff);box-shadow:inset 0 0 0 2px var(--desktop-accent,#14b8a6);}.stable-seat-cell.drag-over{background:rgba(34,197,94,.18)!important;box-shadow:inset 0 0 0 2px #22c55e!important;}
    .stable-seat-front{display:grid;grid-template-columns:1fr 70px 1fr;gap:18px;margin-top:14px;position:relative;z-index:3;font-size:16px;font-weight:1000;letter-spacing:.05em;}
    .stable-seat-front span{text-align:center;}.stable-seat-front .teacher{color:#b45309}.stable-seat-front .door{color:#047857}.stable-seat-approve{text-align:right;color:#334155;margin:14px 10px 0 0;font-size:15px;}
    .theme-dark #${STABLE_SEAT_WINDOW_ID}{background:#07111f;color:#f8fafc;border-color:#273244;}.theme-dark .stable-seat-titlebar{background:#0b1220;border-bottom-color:#273244}.theme-dark .stable-seat-title span{color:#94a3b8}.theme-dark .stable-seat-actions button{color:#e2e8f0}.theme-dark .stable-seat-actions button:hover{background:#172033}.theme-dark .stable-seat-body{background:#050914}.theme-dark .stable-seat-students,.theme-dark .stable-seat-tools input,.theme-dark .stable-seat-tools button{background:#0b1220;color:#f8fafc;border-color:#273244}.theme-dark .stable-seat-board,.theme-dark .stable-seat-row,.theme-dark .stable-seat-cell{background:#fff;color:#020617}.theme-dark .stable-seat-student-card{background:#111827;color:#f8fafc;border-color:#334155}.theme-dark .stable-seat-heading p,.theme-dark .stable-seat-students-head span,.theme-dark .stable-seat-student-card small{color:#94a3b8}
    @media(max-width:900px){#${STABLE_SEAT_WINDOW_ID}{position:fixed;left:0!important;top:0!important;width:100vw!important;height:calc(100vh - 58px)!important;min-height:0;border-radius:0}.stable-seat-main{grid-template-columns:1fr}.stable-seat-student-list{grid-template-columns:repeat(2,minmax(0,1fr));max-height:220px}.stable-seat-layout{grid-template-columns:1fr}.stable-seat-aisle{writing-mode:horizontal-tb;height:34px}.stable-seat-row{min-width:520px}.stable-seat-side{overflow-x:auto}.stable-seat-front{grid-template-columns:1fr}.stable-seat-toolbar{display:grid}.stable-seat-tools{justify-content:flex-start}.stable-seat-tools input{width:100%}}
  `;
  document.head.appendChild(style);
}

function stableFindStudent(state: StableSeatingState, name: string): StableSeatPosition | null {
  const wanted = stableNormalize(name);
  for (const side of ["left", "right"] as const) {
    for (let row = 0; row < state[side].length; row++) {
      for (let seat = 0; seat < state[side][row].length; seat++) if (stableNormalize(state[side][row][seat]) === wanted) return { side, row, seat };
    }
  }
  return null;
}

function stableSeatAt(state: StableSeatingState, pos: StableSeatPosition) {
  return state[pos.side][pos.row]?.[pos.seat] || "";
}

function stableSetSeat(state: StableSeatingState, pos: StableSeatPosition, value: string) {
  state[pos.side][pos.row][pos.seat] = value;
}

function stableMove(state: StableSeatingState, payload: StableDragPayload, target: StableSeatPosition) {
  const targetName = stableSeatAt(state, target);
  if (payload.type === "seat") {
    if (payload.pos.side === target.side && payload.pos.row === target.row && payload.pos.seat === target.seat) return;
    stableSetSeat(state, payload.pos, targetName);
    stableSetSeat(state, target, payload.name);
    return;
  }
  const current = stableFindStudent(state, payload.name);
  if (current) stableSetSeat(state, current, targetName);
  stableSetSeat(state, target, payload.name);
}

function renderStableSide(side: "left" | "right", rows: string[][], q: string, edit: boolean) {
  return rows.map((row, rowIndex) => `<div class="stable-seat-row">${row.map((name, seatIndex) => {
    const hit = q && stableNormalize(name).includes(q);
    return `<div class="stable-seat-cell ${name ? "" : "empty"} ${hit ? "highlight" : ""}" data-side="${side}" data-row="${rowIndex}" data-seat="${seatIndex}" draggable="${edit}">${stableEscape(name || "Trống")}</div>`;
  }).join("")}</div>`).join("");
}

function renderStableStudentList(state: StableSeatingState, q: string, edit: boolean) {
  return STABLE_STUDENTS.filter((name) => !q || stableNormalize(name).includes(q)).map((name) => {
    const pos = stableFindStudent(state, name);
    const label = pos ? `${pos.side === "left" ? "Trái" : "Phải"} · Bàn ${pos.row + 1}` : "Chưa xếp";
    const hit = q && stableNormalize(name).includes(q);
    return `<div class="stable-seat-student-card ${hit ? "highlight" : ""}" data-name="${stableEscape(name)}" draggable="${edit}"><span>${stableEscape(name)}</span><small>${stableEscape(label)}</small></div>`;
  }).join("");
}

function readStablePos(el: HTMLElement): StableSeatPosition | null {
  const side = el.dataset.side === "right" ? "right" : el.dataset.side === "left" ? "left" : null;
  const row = Number(el.dataset.row);
  const seat = Number(el.dataset.seat);
  if (!side || !Number.isFinite(row) || !Number.isFinite(seat)) return null;
  return { side, row, seat };
}

function openStableSeating(pushUrl = true) {
  injectStableSeatStyle();
  const old = document.getElementById(STABLE_SEAT_WINDOW_ID) as HTMLElement | null;
  if (old) {
    old.classList.remove("minimized");
    old.style.zIndex = "160";
    ensureStableTaskbar();
    if (pushUrl && location.pathname !== STABLE_SEAT_PATH) history.pushState({}, "", STABLE_SEAT_PATH);
    return;
  }
  const host = document.querySelector(".win-desktop") || document.querySelector(".win-root") || document.body;
  const win = document.createElement("section");
  win.id = STABLE_SEAT_WINDOW_ID;
  win.innerHTML = `<header class="stable-seat-titlebar"><div class="stable-seat-title"><div class="stable-seat-title-icon">${stableIconSvg()}</div><strong>Sơ đồ chỗ ngồi</strong><span>Lớp 11A3</span></div><div class="stable-seat-actions"><button data-action="minimize" title="Thu nhỏ">${stableMinSvg()}</button><button data-action="maximize" title="Phóng to">${stableMaxSvg()}</button><button data-action="close" class="danger" title="Đóng">${stableCloseSvg()}</button></div></header><div class="stable-seat-body"></div>`;
  host.appendChild(win);
  ensureStableTaskbar();
  if (pushUrl && location.pathname !== STABLE_SEAT_PATH) history.pushState({}, "", STABLE_SEAT_PATH);

  let state = loadStableSeating();
  let query = "";
  let edit = false;
  const body = win.querySelector<HTMLElement>(".stable-seat-body")!;

  const render = () => {
    const q = stableNormalize(query);
    body.innerHTML = `<div class="stable-seat-toolbar"><div class="stable-seat-heading"><span class="stable-seat-badge">Thay đổi lần 1 · Áp dụng 5/9/2025</span><div><h1>SƠ ĐỒ CHỖ NGỒI LỚP 11A3</h1><p>Bật sửa rồi kéo tên từ danh sách bên trái vào ghế</p></div></div><div class="stable-seat-tools"><input data-search value="${stableEscape(query)}" placeholder="Tìm học sinh..."/><button data-tool="edit" class="${edit ? "primary" : ""}">${edit ? "Đang sửa" : "Bật sửa"}</button><button data-tool="reset">Khôi phục</button><button data-tool="print">Xuất/in</button></div></div><div class="stable-seat-main"><aside class="stable-seat-students"><div class="stable-seat-students-head"><div><strong>Danh sách học sinh</strong><span>Kéo tên vào ô ghế để đổi chỗ nhanh</span></div><span class="stable-seat-badge">${STABLE_STUDENTS.length}</span></div><div class="stable-seat-student-list">${renderStableStudentList(state, q, edit)}</div></aside><div class="stable-seat-board"><div class="stable-room-window left a"></div><div class="stable-room-window left b"></div><div class="stable-room-window right a"></div><div class="stable-room-window right b"></div><div class="stable-room-door"></div><div class="stable-seat-back">CUỐI LỚP</div><div class="stable-seat-layout"><div class="stable-seat-side">${renderStableSide("left", state.left, q, edit)}</div><div class="stable-seat-aisle">LỐI ĐI</div><div class="stable-seat-side">${renderStableSide("right", state.right, q, edit)}</div></div><div class="stable-seat-front"><span class="teacher">BÀN GV</span><span>BẢNG</span><span class="door">CỬA RA VÀO</span></div><div class="stable-seat-approve">GVCN: Võ Thị Ngọc Tân – Đã Duyệt</div></div></div>`;

    body.querySelector<HTMLInputElement>("[data-search]")?.addEventListener("input", (event) => {
      query = (event.currentTarget as HTMLInputElement).value;
      render();
      const input = body.querySelector<HTMLInputElement>("[data-search]");
      input?.focus();
      input?.setSelectionRange(query.length, query.length);
    });
    body.querySelector<HTMLElement>("[data-tool='edit']")?.addEventListener("click", () => { edit = !edit; render(); });
    body.querySelector<HTMLElement>("[data-tool='reset']")?.addEventListener("click", () => {
      if (!confirm("Khôi phục sơ đồ mặc định?")) return;
      state = cloneStableSeating(STABLE_DEFAULT_SEATING);
      saveStableSeating(state);
      render();
    });
    body.querySelector<HTMLElement>("[data-tool='print']")?.addEventListener("click", () => window.print());
    body.querySelectorAll<HTMLElement>(".stable-seat-student-card").forEach((card) => {
      if (!edit) return;
      card.addEventListener("dragstart", (event) => {
        stableDrag = { type: "student", name: card.dataset.name || "" };
        event.dataTransfer?.setData("text/plain", JSON.stringify(stableDrag));
      });
    });
    body.querySelectorAll<HTMLElement>(".stable-seat-cell").forEach((cell) => {
      if (!edit) return;
      cell.addEventListener("dragstart", (event) => {
        const pos = readStablePos(cell);
        if (!pos) return;
        stableDrag = { type: "seat", pos, name: stableSeatAt(state, pos) };
        event.dataTransfer?.setData("text/plain", JSON.stringify(stableDrag));
      });
      cell.addEventListener("dragover", (event) => { event.preventDefault(); cell.classList.add("drag-over"); });
      cell.addEventListener("dragleave", () => cell.classList.remove("drag-over"));
      cell.addEventListener("drop", (event) => {
        event.preventDefault();
        cell.classList.remove("drag-over");
        const target = readStablePos(cell);
        if (!target || !stableDrag || !stableDrag.name) return;
        stableMove(state, stableDrag, target);
        saveStableSeating(state);
        stableDrag = null;
        render();
      });
    });
  };

  render();
  makeStableDraggable(win);
  win.querySelector<HTMLElement>("[data-action='minimize']")?.addEventListener("click", () => { win.classList.add("minimized"); if (location.pathname === STABLE_SEAT_PATH) history.pushState({}, "", "/desktop"); });
  win.querySelector<HTMLElement>("[data-action='close']")?.addEventListener("click", () => { win.remove(); removeStableTaskbar(); if (location.pathname === STABLE_SEAT_PATH) history.pushState({}, "", "/desktop"); });
  win.querySelector<HTMLElement>("[data-action='maximize']")?.addEventListener("click", () => win.classList.toggle("maximized"));
}

function makeStableDraggable(win: HTMLElement) {
  const bar = win.querySelector<HTMLElement>(".stable-seat-titlebar");
  if (!bar) return;
  bar.addEventListener("mousedown", (event) => {
    if ((event.target as HTMLElement).closest("button") || win.classList.contains("maximized")) return;
    event.preventDefault();
    const startX = event.clientX, startY = event.clientY, rect = win.getBoundingClientRect();
    const move = (e: MouseEvent) => { win.style.left = `${Math.max(0, rect.left + e.clientX - startX)}px`; win.style.top = `${Math.max(0, rect.top + e.clientY - startY)}px`; };
    const up = () => { removeEventListener("mousemove", move); removeEventListener("mouseup", up); };
    addEventListener("mousemove", move);
    addEventListener("mouseup", up);
  });
}

function ensureStableTaskbar() {
  if (document.getElementById(STABLE_SEAT_TASKBAR_ID)) return;
  const center = document.querySelector(".task-center");
  if (!center) return;
  const button = document.createElement("button");
  button.id = STABLE_SEAT_TASKBAR_ID;
  button.className = "task-icon running-app show-badge active";
  button.type = "button";
  button.title = "Sơ đồ chỗ ngồi";
  button.innerHTML = stableIconSvg();
  button.addEventListener("click", () => openStableSeating(true));
  center.appendChild(button);
}

function removeStableTaskbar() {
  document.getElementById(STABLE_SEAT_TASKBAR_ID)?.remove();
}

function ensureStableShortcut() {
  const icons = document.querySelector(".desktop-icons");
  if (!icons || document.getElementById(STABLE_SEAT_SHORTCUT_ID)) return;
  const button = document.createElement("button");
  button.id = STABLE_SEAT_SHORTCUT_ID;
  button.type = "button";
  button.className = "desktop-shortcut";
  button.draggable = true;
  button.title = "Sơ đồ chỗ ngồi - bấm đúp để mở";
  button.innerHTML = `<div class="desktop-shortcut-icon">${stableIconSvg()}</div><span>Sơ đồ chỗ ngồi</span>`;
  button.addEventListener("dblclick", () => openStableSeating(true));
  icons.appendChild(button);
}

function stableBootTick() {
  injectStableSeatStyle();
  ensureStableShortcut();
  if (document.getElementById(STABLE_SEAT_WINDOW_ID)) ensureStableTaskbar();
  const desktopReady = Boolean(document.querySelector(".win-desktop") || document.querySelector(".win-root"));
  if (location.pathname === STABLE_SEAT_PATH && desktopReady && !document.getElementById(STABLE_SEAT_WINDOW_ID) && !stableRouteOpenScheduled) {
    stableRouteOpenScheduled = true;
    window.setTimeout(() => openStableSeating(false), 80);
  }
  stableBootTries++;
  if (stableBootTries > 80 && stableBootTimer) {
    window.clearInterval(stableBootTimer);
    stableBootTimer = 0;
  }
}

function bootStableSeating() {
  stableBootTick();
  stableBootTimer = window.setInterval(stableBootTick, 500);
  window.addEventListener("popstate", () => {
    if (location.pathname === STABLE_SEAT_PATH) {
      stableRouteOpenScheduled = false;
      stableBootTick();
    }
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootStableSeating);
else bootStableSeating();
