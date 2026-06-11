type SeatPosition = {
  side: "left" | "right";
  row: number;
  seat: number;
};

type SeatingState = {
  left: string[][];
  right: string[][];
};

type DragPayload =
  | { type: "seat"; pos: SeatPosition; name: string }
  | { type: "student"; name: string };

const SEATING_STORAGE_KEY = "a3k64-seating-map-v1";
const SEATING_STYLE_ID = "a3k64-seating-map-runtime-style";
const SEATING_SHORTCUT_ID = "a3k64-seating-shortcut";
const SEATING_WINDOW_ID = "a3k64-seating-window";
const SEATING_START_ID = "a3k64-seating-start-app";
const SEATING_SEARCH_ID = "a3k64-seating-search-app";
const SEATING_TASKBAR_ID = "a3k64-seating-taskbar-button";

const DEFAULT_SEATING: SeatingState = {
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

const ALL_STUDENTS = Array.from(new Set(DEFAULT_SEATING.left.flat().concat(DEFAULT_SEATING.right.flat()).map((name) => name.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "vi"));

function cloneSeating(value: SeatingState): SeatingState {
  return { left: value.left.map((row) => row.slice()), right: value.right.map((row) => row.slice()) };
}

function loadSeating(): SeatingState {
  try {
    const raw = localStorage.getItem(SEATING_STORAGE_KEY);
    if (!raw) return cloneSeating(DEFAULT_SEATING);
    const parsed = JSON.parse(raw) as SeatingState;
    if (!Array.isArray(parsed.left) || !Array.isArray(parsed.right)) return cloneSeating(DEFAULT_SEATING);
    return {
      left: normalizeRows(parsed.left),
      right: normalizeRows(parsed.right),
    };
  } catch {
    return cloneSeating(DEFAULT_SEATING);
  }
}

function normalizeRows(rows: string[][]) {
  const normalized = rows.map((row) => {
    const next = Array.isArray(row) ? row.slice(0, 4).map((item) => String(item || "").trim()) : [];
    while (next.length < 4) next.push("");
    return next;
  });
  while (normalized.length < 7) normalized.push(["", "", "", ""]);
  return normalized.slice(0, 7);
}

function saveSeating(state: SeatingState) {
  localStorage.setItem(SEATING_STORAGE_KEY, JSON.stringify(state));
}

function injectSeatingStyles() {
  if (document.getElementById(SEATING_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SEATING_STYLE_ID;
  style.textContent = `
    .a3-seat-window{position:absolute;left:calc(50% - min(650px,calc((100vw - 176px)/2)));top:18px;width:min(1300px,calc(100vw - 176px));height:min(740px,calc(100vh - 104px));min-height:560px;border:1px solid color-mix(in srgb,var(--desktop-accent,#2563eb) 38%,#273244);border-radius:22px;overflow:hidden;background:#07111f;color:#f8fafc;box-shadow:0 34px 100px rgba(0,0,0,.46);z-index:90;animation:seatWindowIn .18s ease both;}
    @keyframes seatWindowIn{from{opacity:0;transform:translateY(18px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
    .a3-seat-window.maximized{position:fixed;left:0!important;top:0!important;width:100vw!important;height:calc(100vh - 58px)!important;min-height:0;border-radius:0;}
    .a3-seat-titlebar{height:46px;display:grid;grid-template-columns:1fr auto;align-items:center;border-bottom:1px solid #273244;background:#0b1220;cursor:move;user-select:none;}
    .a3-seat-title-left{display:flex;align-items:center;gap:10px;padding-left:14px;min-width:0;}
    .a3-seat-title-icon{width:30px;height:30px;display:grid;place-items:center;border-radius:10px;background:var(--desktop-accent,#2563eb);color:#fff;font-weight:900;}
    .a3-seat-title-icon svg{width:19px;height:19px;}
    .a3-seat-title-left strong{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .a3-seat-title-left span{font-size:12px;color:#94a3b8;margin-left:4px;white-space:nowrap;}
    .a3-seat-actions{display:flex;height:100%;}
    .a3-seat-actions button{width:46px;border:0;color:#e2e8f0;background:transparent;display:grid;place-items:center;cursor:pointer;font-size:18px;}
    .a3-seat-actions button:hover{background:#172033;}
    .a3-seat-actions .danger{margin:7px 8px 7px 0;width:32px;height:32px;border-radius:9px;background:rgba(239,68,68,.92);}
    .a3-seat-body{height:calc(100% - 46px);overflow:auto;padding:16px;background:radial-gradient(circle at 12% 12%,color-mix(in srgb,var(--desktop-accent,#2563eb) 18%,transparent),transparent 32%),#050914;}
    .a3-seat-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;}
    .a3-seat-heading{display:flex;align-items:center;gap:12px;min-width:0;}
    .a3-seat-heading h1{margin:0;font-size:22px;letter-spacing:-.04em;}
    .a3-seat-heading p{margin:4px 0 0;color:#94a3b8;font-size:13px;}
    .a3-seat-badge{border:1px solid color-mix(in srgb,var(--desktop-accent,#2563eb) 42%,#273244);border-radius:999px;padding:7px 10px;background:color-mix(in srgb,var(--desktop-accent,#2563eb) 14%,#0b1220);color:#dbeafe;font-weight:900;font-size:12px;white-space:nowrap;}
    .a3-seat-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;}
    .a3-seat-tools input{height:38px;width:200px;border:1px solid #273244;border-radius:13px;background:#0b1220;color:#f8fafc;padding:0 12px;outline:none;}
    .a3-seat-tools input:focus{border-color:var(--desktop-accent,#2563eb);box-shadow:0 0 0 3px color-mix(in srgb,var(--desktop-accent,#2563eb) 22%,transparent);}
    .a3-seat-tools button{height:38px;border:1px solid #273244;border-radius:13px;padding:0 12px;background:#111827;color:#e2e8f0;cursor:pointer;font-weight:900;}
    .a3-seat-tools button:hover{border-color:color-mix(in srgb,var(--desktop-accent,#2563eb) 54%,#273244);}
    .a3-seat-tools button.primary{border-color:transparent;background:var(--desktop-accent,#2563eb);color:#fff;}
    .a3-seat-main{display:grid;grid-template-columns:230px minmax(0,1fr);gap:14px;align-items:stretch;min-height:0;}
    .a3-seat-students{border:1px solid #273244;border-radius:22px;background:rgba(15,23,42,.82);padding:12px;min-height:0;display:flex;flex-direction:column;gap:10px;}
    .a3-seat-students-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;}
    .a3-seat-students-head strong{display:block;font-size:15px;}
    .a3-seat-students-head span{display:block;color:#94a3b8;font-size:12px;margin-top:2px;line-height:1.3;}
    .a3-seat-student-list{display:grid;gap:7px;overflow:auto;padding-right:2px;max-height:calc(100vh - 265px);}
    .a3-seat-student-card{border:1px solid #334155;border-radius:13px;background:#0b1220;color:#f8fafc;padding:8px 10px;font-weight:900;cursor:grab;text-align:left;display:flex;align-items:center;justify-content:space-between;gap:8px;}
    .a3-seat-student-card:active{cursor:grabbing;}
    .a3-seat-student-card:hover,.a3-seat-student-card.highlight{border-color:var(--desktop-accent,#2563eb);background:color-mix(in srgb,var(--desktop-accent,#2563eb) 18%,#0b1220);}
    .a3-seat-student-card small{font-size:11px;color:#94a3b8;font-weight:800;}
    .a3-seat-board{border:1px solid #273244;border-radius:24px;padding:18px;background:rgba(15,23,42,.82);box-shadow:inset 0 1px 0 rgba(255,255,255,.04);min-width:0;}
    .a3-seat-back,.a3-seat-front{display:flex;align-items:center;justify-content:center;gap:18px;font-weight:1000;color:#e0f2fe;letter-spacing:.05em;text-shadow:0 1px 10px rgba(0,0,0,.3);}
    .a3-seat-back{margin-bottom:16px;font-size:16px;}
    .a3-seat-layout{display:grid;grid-template-columns:minmax(0,1fr) 70px minmax(0,1fr);gap:18px;align-items:stretch;}
    .a3-seat-aisle{display:flex;align-items:center;justify-content:center;writing-mode:vertical-rl;text-orientation:mixed;color:#93c5fd;font-weight:1000;letter-spacing:.18em;border-radius:18px;border:1px dashed #334155;background:rgba(15,23,42,.52);}
    .a3-seat-side{display:grid;gap:12px;}
    .a3-seat-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1px solid #334155;border-radius:14px;overflow:hidden;background:#020617;min-height:42px;}
    .a3-seat-cell{min-height:42px;border:0;border-right:1px solid #334155;background:#0b1220;color:#f8fafc;display:flex;align-items:center;justify-content:center;padding:7px 5px;text-align:center;font-weight:900;font-size:14px;line-height:1.2;cursor:default;position:relative;}
    .a3-seat-cell:last-child{border-right:0;}
    .a3-seat-cell.empty{opacity:.72;color:#64748b;background:rgba(15,23,42,.62);}
    .a3-seat-cell.highlight{background:color-mix(in srgb,var(--desktop-accent,#2563eb) 38%,#0b1220);box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--desktop-accent,#2563eb) 76%,#fff);}
    .a3-seat-cell.editing{cursor:grab;}
    .a3-seat-cell.editing:active{cursor:grabbing;}
    .a3-seat-cell.drag-over{background:rgba(34,197,94,.2)!important;box-shadow:inset 0 0 0 2px #22c55e!important;}
    .a3-seat-front{display:grid;grid-template-columns:1fr 70px 1fr;gap:18px;margin-top:14px;color:#f8fafc;}
    .a3-seat-front span{display:block;text-align:center;font-size:16px;}
    .a3-seat-front .teacher{color:#fde68a;}
    .a3-seat-front .door{color:#bbf7d0;}
    .a3-seat-approve{text-align:right;color:#e2e8f0;margin:14px 10px 0 0;font-size:15px;}
    .a3-seat-mobile-note{display:none;margin-top:10px;color:#fbbf24;font-size:12px;}
    .theme-light .a3-seat-window{background:#f8fafc;color:#0f172a;border-color:#dbe4f0;}
    .theme-light .a3-seat-titlebar{background:#f8fafc;border-bottom-color:#dbe4f0;}
    .theme-light .a3-seat-title-left strong,.theme-light .a3-seat-heading h1{color:#0f172a;}
    .theme-light .a3-seat-title-left span,.theme-light .a3-seat-heading p,.theme-light .a3-seat-students-head span{color:#475569;}
    .theme-light .a3-seat-body{background:linear-gradient(180deg,#f8fafc,#edf2f7);}
    .theme-light .a3-seat-board,.theme-light .a3-seat-students{background:#fff;border-color:#cbd5e1;}
    .theme-light .a3-seat-back,.theme-light .a3-seat-front,.theme-light .a3-seat-front span{color:#0f172a!important;text-shadow:none;}
    .theme-light .a3-seat-front .teacher{color:#b45309!important;}
    .theme-light .a3-seat-front .door{color:#047857!important;}
    .theme-light .a3-seat-approve{color:#334155;}
    .theme-light .a3-seat-row{background:#fff;border-color:#cbd5e1;}
    .theme-light .a3-seat-cell{background:#fff;color:#020617;border-right-color:#cbd5e1;}
    .theme-light .a3-seat-cell.empty{background:#f1f5f9;color:#64748b;}
    .theme-light .a3-seat-tools input,.theme-light .a3-seat-tools button,.theme-light .a3-seat-student-card{background:#fff;color:#0f172a;border-color:#cbd5e1;}
    .theme-light .a3-seat-student-card small{color:#64748b;}
    .theme-light .a3-seat-aisle{background:#f8fafc;border-color:#cbd5e1;color:#1d4ed8;}
    .theme-light .a3-seat-badge{color:#0f172a;background:color-mix(in srgb,var(--desktop-accent,#2563eb) 10%,#fff);}
    @media (max-width:900px){.a3-seat-main{grid-template-columns:1fr}.a3-seat-student-list{grid-template-columns:repeat(2,minmax(0,1fr));max-height:none}.a3-seat-layout{grid-template-columns:1fr;gap:12px}.a3-seat-aisle{writing-mode:horizontal-tb;height:34px}.a3-seat-front{grid-template-columns:1fr;gap:8px}.a3-seat-row{min-width:520px}.a3-seat-side{overflow-x:auto;padding-bottom:4px}.a3-seat-mobile-note{display:block}}
    @media (max-width:760px){.a3-seat-window{position:fixed;left:0!important;top:0!important;width:100vw!important;height:calc(100vh - 58px)!important;min-height:0;border-radius:0}.a3-seat-body{padding:12px}.a3-seat-toolbar{display:grid;gap:10px}.a3-seat-tools{justify-content:flex-start}.a3-seat-tools input{width:100%}.a3-seat-student-list{grid-template-columns:repeat(2,minmax(0,1fr))}.a3-seat-heading{display:grid}.a3-seat-badge{width:max-content}}
    @media print{body *{visibility:hidden!important}.a3-seat-window,.a3-seat-window *{visibility:visible!important}.a3-seat-window{position:fixed!important;left:0!important;top:0!important;width:100vw!important;height:auto!important;box-shadow:none!important;border:0!important;background:#fff!important;color:#000!important}.a3-seat-titlebar,.a3-seat-toolbar .a3-seat-tools,.a3-seat-students{display:none!important}.a3-seat-body{height:auto!important;overflow:visible!important;background:#fff!important;padding:20px!important}.a3-seat-main{display:block!important}.a3-seat-board{box-shadow:none!important;background:#fff!important;border-color:#111!important}.a3-seat-cell{background:#fff!important;color:#000!important;border-color:#111!important}.a3-seat-row{border-color:#111!important}}
  `;
  document.head.appendChild(style);
}

function seatingIconSvg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16"/><path d="M4 10h16"/><path d="M4 15h16"/><path d="M7 5v14"/><path d="M17 5v14"/><path d="M5 19h14"/></svg>`;
}

function normalizeText(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").trim();
}

function seatAt(state: SeatingState, pos: SeatPosition) {
  return state[pos.side][pos.row]?.[pos.seat] || "";
}

function setSeat(state: SeatingState, pos: SeatPosition, value: string) {
  if (!state[pos.side][pos.row]) state[pos.side][pos.row] = ["", "", "", ""];
  state[pos.side][pos.row][pos.seat] = value;
}

function findStudent(state: SeatingState, name: string): SeatPosition | null {
  const wanted = normalizeText(name);
  for (const side of ["left", "right"] as const) {
    for (let row = 0; row < state[side].length; row++) {
      for (let seat = 0; seat < state[side][row].length; seat++) {
        if (normalizeText(state[side][row][seat]) === wanted) return { side, row, seat };
      }
    }
  }
  return null;
}

function openSeatingMapApp() {
  injectSeatingStyles();
  let existing = document.getElementById(SEATING_WINDOW_ID) as HTMLElement | null;
  if (existing) {
    existing.style.zIndex = String(nextSeatingZ());
    existing.classList.remove("minimized");
    ensureTaskbarButton();
    return;
  }

  const desktop = document.querySelector(".win-desktop") || document.querySelector(".win-root") || document.body;
  const win = document.createElement("section");
  win.id = SEATING_WINDOW_ID;
  win.className = "a3-seat-window focused";
  win.style.zIndex = String(nextSeatingZ());
  win.innerHTML = `
    <header class="a3-seat-titlebar">
      <div class="a3-seat-title-left"><div class="a3-seat-title-icon">${seatingIconSvg()}</div><strong>Sơ đồ chỗ ngồi</strong><span>Lớp 11A3</span></div>
      <div class="a3-seat-actions"><button type="button" data-action="maximize" title="Phóng to">□</button><button type="button" class="danger" data-action="close" title="Đóng">×</button></div>
    </header>
    <div class="a3-seat-body"></div>
  `;
  desktop.appendChild(win);
  ensureTaskbarButton();

  let state = loadSeating();
  let editMode = false;
  let query = "";
  let dragged: DragPayload | null = null;
  const body = win.querySelector(".a3-seat-body") as HTMLElement;

  const render = () => {
    const q = normalizeText(query);
    const placed = state.left.flat().concat(state.right.flat()).filter(Boolean).length;
    body.innerHTML = `
      <div class="a3-seat-toolbar">
        <div class="a3-seat-heading"><span class="a3-seat-badge">Thay đổi lần 1 · Áp dụng 5/9/2025</span><div><h1>SƠ ĐỒ CHỖ NGỒI LỚP 11A3</h1><p>${placed} học sinh · bật sửa rồi kéo tên từ danh sách bên trái vào ghế</p></div></div>
        <div class="a3-seat-tools"><input data-search="1" value="${escapeHtml(query)}" placeholder="Tìm học sinh..." /><button type="button" data-tool="edit" class="${editMode ? "primary" : ""}">${editMode ? "Đang sửa" : "Bật sửa"}</button><button type="button" data-tool="reset">Khôi phục</button><button type="button" data-tool="print">Xuất/in</button></div>
      </div>
      <div class="a3-seat-main">
        <aside class="a3-seat-students"><div class="a3-seat-students-head"><div><strong>Danh sách học sinh</strong><span>Kéo tên vào ô ghế để đổi chỗ nhanh</span></div><span class="a3-seat-badge">${ALL_STUDENTS.length}</span></div><div class="a3-seat-student-list">${renderStudentList(state, q, editMode)}</div></aside>
        <div class="a3-seat-board"><div class="a3-seat-back">CUỐI LỚP</div><div class="a3-seat-layout"><div class="a3-seat-side">${renderSide("left", state.left, q, editMode)}</div><div class="a3-seat-aisle">LỐI ĐI</div><div class="a3-seat-side">${renderSide("right", state.right, q, editMode)}</div></div><div class="a3-seat-front"><span class="teacher">BÀN GV</span><span>BẢNG</span><span class="door">CỬA RA VÀO</span></div><div class="a3-seat-approve">GVCN: Võ Thị Ngọc Tân – Đã Duyệt</div><div class="a3-seat-mobile-note">Trên điện thoại có thể kéo ngang từng dãy để xem đủ 4 chỗ/bàn.</div></div>
      </div>
    `;

    body.querySelector<HTMLInputElement>("[data-search]")?.addEventListener("input", (event) => {
      query = (event.currentTarget as HTMLInputElement).value;
      render();
      const input = body.querySelector<HTMLInputElement>("[data-search]");
      input?.focus();
      input?.setSelectionRange(query.length, query.length);
    });
    body.querySelector<HTMLElement>("[data-tool='edit']")?.addEventListener("click", () => { editMode = !editMode; render(); });
    body.querySelector<HTMLElement>("[data-tool='reset']")?.addEventListener("click", () => {
      if (!confirm("Khôi phục sơ đồ mặc định theo bản Word hiện tại?")) return;
      state = cloneSeating(DEFAULT_SEATING);
      saveSeating(state);
      render();
    });
    body.querySelector<HTMLElement>("[data-tool='print']")?.addEventListener("click", () => window.print());

    body.querySelectorAll<HTMLElement>(".a3-seat-student-card").forEach((card) => {
      if (!editMode) return;
      card.draggable = true;
      card.addEventListener("dragstart", (event) => {
        dragged = { type: "student", name: card.dataset.name || "" };
        event.dataTransfer?.setData("text/plain", JSON.stringify(dragged));
      });
    });

    body.querySelectorAll<HTMLElement>(".a3-seat-cell").forEach((cell) => {
      if (!editMode) return;
      cell.draggable = true;
      cell.addEventListener("dragstart", (event) => {
        const pos = readPosition(cell);
        if (!pos) return;
        dragged = { type: "seat", pos, name: seatAt(state, pos) };
        event.dataTransfer?.setData("text/plain", JSON.stringify(dragged));
      });
      cell.addEventListener("dragover", (event) => { event.preventDefault(); cell.classList.add("drag-over"); });
      cell.addEventListener("dragleave", () => cell.classList.remove("drag-over"));
      cell.addEventListener("drop", (event) => {
        event.preventDefault();
        cell.classList.remove("drag-over");
        const target = readPosition(cell);
        if (!target || !dragged || !dragged.name) return;
        moveStudentToSeat(state, dragged, target);
        saveSeating(state);
        dragged = null;
        render();
      });
    });
  };

  render();
  makeSeatWindowDraggable(win);
  win.querySelector<HTMLElement>("[data-action='close']")?.addEventListener("click", () => { win.remove(); removeTaskbarButton(); });
  win.querySelector<HTMLElement>("[data-action='maximize']")?.addEventListener("click", () => win.classList.toggle("maximized"));
  win.addEventListener("mousedown", () => { win.style.zIndex = String(nextSeatingZ()); markTaskbarActive(true); });
}

function moveStudentToSeat(state: SeatingState, dragged: DragPayload, target: SeatPosition) {
  const targetName = seatAt(state, target);
  if (dragged.type === "seat") {
    if (dragged.pos.side === target.side && dragged.pos.row === target.row && dragged.pos.seat === target.seat) return;
    setSeat(state, dragged.pos, targetName);
    setSeat(state, target, dragged.name);
    return;
  }
  const current = findStudent(state, dragged.name);
  if (current) setSeat(state, current, targetName);
  setSeat(state, target, dragged.name);
}

function renderStudentList(state: SeatingState, query: string, editMode: boolean) {
  return ALL_STUDENTS.filter((name) => !query || normalizeText(name).includes(query)).map((name) => {
    const pos = findStudent(state, name);
    const label = pos ? `${pos.side === "left" ? "Trái" : "Phải"} · Bàn ${pos.row + 1}` : "Chưa xếp";
    const hit = query && normalizeText(name).includes(query);
    return `<div class="a3-seat-student-card ${hit ? "highlight" : ""}" data-name="${escapeHtml(name)}" draggable="${editMode ? "true" : "false"}"><span>${escapeHtml(name)}</span><small>${escapeHtml(label)}</small></div>`;
  }).join("");
}

function renderSide(side: "left" | "right", rows: string[][], query: string, editMode: boolean) {
  return rows.map((row, rowIndex) => `<div class="a3-seat-row">${row.map((name, seatIndex) => {
    const hit = query && normalizeText(name).includes(query);
    return `<div class="a3-seat-cell ${name ? "" : "empty"} ${hit ? "highlight" : ""} ${editMode ? "editing" : ""}" data-side="${side}" data-row="${rowIndex}" data-seat="${seatIndex}">${escapeHtml(name || "Trống")}</div>`;
  }).join("")}</div>`).join("");
}

function readPosition(el: HTMLElement): SeatPosition | null {
  const side = el.dataset.side === "right" ? "right" : el.dataset.side === "left" ? "left" : null;
  const row = Number(el.dataset.row);
  const seat = Number(el.dataset.seat);
  if (!side || !Number.isFinite(row) || !Number.isFinite(seat)) return null;
  return { side, row, seat };
}

function escapeHtml(value: string) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
}

function nextSeatingZ() {
  const current = Number(document.documentElement.dataset.seatingZ || "120");
  const next = current + 1;
  document.documentElement.dataset.seatingZ = String(next);
  return next;
}

function makeSeatWindowDraggable(win: HTMLElement) {
  const titlebar = win.querySelector<HTMLElement>(".a3-seat-titlebar");
  if (!titlebar) return;
  titlebar.addEventListener("mousedown", (event) => {
    if ((event.target as HTMLElement).closest("button") || win.classList.contains("maximized")) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const rect = win.getBoundingClientRect();
    const onMove = (move: MouseEvent) => {
      win.style.left = `${Math.max(0, rect.left + move.clientX - startX)}px`;
      win.style.top = `${Math.max(0, rect.top + move.clientY - startY)}px`;
    };
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
}

function ensureTaskbarButton() {
  if (document.getElementById(SEATING_TASKBAR_ID)) return;
  const center = document.querySelector(".task-center");
  if (!center) return;
  const button = document.createElement("button");
  button.id = SEATING_TASKBAR_ID;
  button.type = "button";
  button.className = "task-icon running-app show-badge active";
  button.title = "Sơ đồ chỗ ngồi";
  button.innerHTML = seatingIconSvg();
  button.addEventListener("click", () => {
    const win = document.getElementById(SEATING_WINDOW_ID) as HTMLElement | null;
    if (!win) return openSeatingMapApp();
    win.style.zIndex = String(nextSeatingZ());
    markTaskbarActive(true);
  });
  center.appendChild(button);
}

function removeTaskbarButton() {
  document.getElementById(SEATING_TASKBAR_ID)?.remove();
}

function markTaskbarActive(active: boolean) {
  document.getElementById(SEATING_TASKBAR_ID)?.classList.toggle("active", active);
}

function ensureDesktopShortcut() {
  const icons = document.querySelector(".desktop-icons");
  if (!icons || document.getElementById(SEATING_SHORTCUT_ID)) return;
  const button = document.createElement("button");
  button.id = SEATING_SHORTCUT_ID;
  button.type = "button";
  button.className = "desktop-shortcut";
  button.title = "Sơ đồ chỗ ngồi - bấm đúp để mở";
  button.draggable = true;
  button.innerHTML = `<div class="desktop-shortcut-icon">${seatingIconSvg()}</div><span>Sơ đồ chỗ ngồi</span>`;
  button.addEventListener("dblclick", openSeatingMapApp);
  icons.appendChild(button);
}

function ensureStartMenuApp() {
  const grid = document.querySelector(".start-app-grid");
  if (!grid || document.getElementById(SEATING_START_ID)) return;
  const button = document.createElement("button");
  button.id = SEATING_START_ID;
  button.type = "button";
  button.className = "start-app";
  button.innerHTML = `<div class="start-app-icon">${seatingIconSvg()}</div><span>Sơ đồ chỗ ngồi</span>`;
  button.addEventListener("click", openSeatingMapApp);
  grid.appendChild(button);
}

function ensureSearchApp() {
  const panel = document.querySelector(".search-panel .table-like");
  if (!panel || document.getElementById(SEATING_SEARCH_ID)) return;
  const button = document.createElement("button");
  button.id = SEATING_SEARCH_ID;
  button.type = "button";
  button.className = "side-item";
  button.innerHTML = `<div class="side-item-icon">${seatingIconSvg()}</div><div><strong>Sơ đồ chỗ ngồi</strong><span>Bản trực quan của lớp 11A3</span></div>`;
  button.addEventListener("click", openSeatingMapApp);
  panel.appendChild(button);
}

function bootSeatingRuntimeApp() {
  injectSeatingStyles();
  const sync = () => { ensureDesktopShortcut(); ensureStartMenuApp(); ensureSearchApp(); if (document.getElementById(SEATING_WINDOW_ID)) ensureTaskbarButton(); };
  sync();
  const observer = new MutationObserver(sync);
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootSeatingRuntimeApp);
else bootSeatingRuntimeApp();
