const SEAT_TOOLS_WINDOW = "#a3k64-seating-window";
const SEAT_TOOLS_STORAGE = "a3k64-seating-map-v1";
let seatToolsLoop = 0;
let seatToolsCount = 0;
let seatContextBlockBound = false;

function readSeatStateFromStorage() {
  try {
    const raw = localStorage.getItem(SEAT_TOOLS_STORAGE);
    if (!raw) return null;
    const state = JSON.parse(raw);
    if (!Array.isArray(state.left) || !Array.isArray(state.right)) return null;
    return state;
  } catch {
    return null;
  }
}

function readSeatStateFromDom() {
  const state = {
    left: Array.from({ length: 7 }, () => Array(4).fill("")),
    right: Array.from({ length: 7 }, () => Array(4).fill("")),
  };
  document.querySelectorAll<HTMLElement>(`${SEAT_TOOLS_WINDOW} .stable-seat-cell`).forEach((cell) => {
    const side = cell.dataset.side === "right" ? "right" : cell.dataset.side === "left" ? "left" : null;
    const row = Number(cell.dataset.row);
    const seat = Number(cell.dataset.seat);
    if (!side || !Number.isFinite(row) || !Number.isFinite(seat)) return;
    const text = (cell.textContent || "").trim();
    state[side][row][seat] = text === "Trống" ? "" : text;
  });
  return state;
}

function normalizeSeatState(state: any) {
  const normalizeSide = (rows: any[]) => {
    const next = Array.from({ length: 7 }, (_, rowIndex) => {
      const row = Array.isArray(rows?.[rowIndex]) ? rows[rowIndex] : [];
      return Array.from({ length: 4 }, (_, seatIndex) => String(row[seatIndex] || "").trim());
    });
    return next;
  };
  return { left: normalizeSide(state.left), right: normalizeSide(state.right) };
}

function shuffleSeatNames<T>(items: T[]) {
  const next = items.slice();
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function showSeatToast(message: string) {
  document.querySelector(".seat-tools-toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "seat-tools-toast";
  toast.textContent = message;
  toast.style.cssText = "position:fixed;left:50%;top:74px;transform:translateX(-50%);z-index:999999;padding:11px 15px;border:1px solid #14b8a6;border-radius:14px;background:rgba(15,23,42,.96);color:#f8fafc;box-shadow:0 18px 55px rgba(0,0,0,.35);font-weight:900;font-size:14px";
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 2400);
}

function paintSeatingFromState(state: { left: string[][]; right: string[][] }) {
  document.querySelectorAll<HTMLElement>(`${SEAT_TOOLS_WINDOW} .stable-seat-cell`).forEach((cell) => {
    const side = cell.dataset.side === "right" ? "right" : cell.dataset.side === "left" ? "left" : null;
    const row = Number(cell.dataset.row);
    const seat = Number(cell.dataset.seat);
    if (!side || !Number.isFinite(row) || !Number.isFinite(seat)) return;
    const name = state[side]?.[row]?.[seat] || "";
    cell.textContent = name || "Trống";
    cell.classList.toggle("empty", !name);
  });
}

function randomizeSeating() {
  const current = normalizeSeatState(readSeatStateFromDom());
  const positions: Array<{ side: "left" | "right"; row: number; seat: number }> = [];
  const names: string[] = [];

  (["left", "right"] as const).forEach((side) => {
    current[side].forEach((row: string[], rowIndex: number) => {
      row.forEach((name: string, seatIndex: number) => {
        if (!name) return;
        positions.push({ side, row: rowIndex, seat: seatIndex });
        names.push(name);
      });
    });
  });

  if (names.length < 2) {
    showSeatToast("Không đủ học sinh để random.");
    return;
  }

  const shuffled = shuffleSeatNames(names);
  positions.forEach((pos, index) => {
    current[pos.side][pos.row][pos.seat] = shuffled[index];
  });

  localStorage.setItem(SEAT_TOOLS_STORAGE, JSON.stringify(current));
  paintSeatingFromState(current);
  hideAssignedStudents();
  showSeatToast("Đã random chỗ ngồi cục bộ. Bấm Lưu sơ đồ để lưu lên sheet.");
}

function addRandomButton() {
  const tools = document.querySelector<HTMLElement>(`${SEAT_TOOLS_WINDOW} .stable-seat-tools`);
  if (!tools || tools.querySelector("[data-seat-random]") || !tools.querySelector("[data-tool='edit']")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.seatRandom = "1";
  button.textContent = "Random";
  button.title = "Xếp chỗ ngồi ngẫu nhiên cục bộ";
  button.addEventListener("click", randomizeSeating);
  const printButton = tools.querySelector("[data-tool='print']");
  tools.insertBefore(button, printButton || null);
}

function blockSeatContextEvent(event: Event) {
  const target = event.target as HTMLElement | null;
  if (!target?.closest?.(SEAT_TOOLS_WINDOW)) return;
  event.preventDefault();
  event.stopPropagation();
  if ("stopImmediatePropagation" in event) event.stopImmediatePropagation();
}

function disableRightClickInSeating() {
  const win = document.querySelector<HTMLElement>(SEAT_TOOLS_WINDOW);
  if (!win) return;
  if (!seatContextBlockBound) {
    seatContextBlockBound = true;
    document.addEventListener("contextmenu", blockSeatContextEvent, true);
    document.addEventListener("mousedown", (event) => {
      if (event.button === 2) blockSeatContextEvent(event);
    }, true);
    document.addEventListener("pointerdown", (event) => {
      if (event.button === 2) blockSeatContextEvent(event);
    }, true);
  }
  if (win.dataset.noContextMenu !== "1") {
    win.dataset.noContextMenu = "1";
    win.addEventListener("contextmenu", blockSeatContextEvent, true);
  }
}

function hideAssignedStudents() {
  const list = document.querySelector<HTMLElement>(`${SEAT_TOOLS_WINDOW} .stable-seat-student-list`);
  if (!list) return;
  let visible = 0;
  list.querySelectorAll<HTMLElement>(".stable-seat-student-card").forEach((card) => {
    const label = card.querySelector("small")?.textContent || "";
    const unassigned = label.includes("Chưa xếp");
    card.style.display = unassigned ? "" : "none";
    if (unassigned) visible += 1;
  });
  let empty = list.querySelector<HTMLElement>(".seat-unassigned-empty");
  if (!visible) {
    if (!empty) {
      empty = document.createElement("div");
      empty.className = "seat-unassigned-empty";
      empty.textContent = "Tất cả học sinh đã có chỗ ngồi.";
      empty.style.cssText = "padding:12px;border:1px dashed #64748b;border-radius:14px;color:#94a3b8;font-weight:900;text-align:center;font-size:13px";
      list.appendChild(empty);
    }
  } else {
    empty?.remove();
  }
}

function seatToolsTick() {
  disableRightClickInSeating();
  hideAssignedStudents();
  addRandomButton();
}

function bootSeatToolsPatch() {
  seatToolsTick();
  seatToolsLoop = window.setInterval(() => {
    seatToolsTick();
    seatToolsCount += 1;
    if (seatToolsCount > 240 && seatToolsLoop) {
      window.clearInterval(seatToolsLoop);
      seatToolsLoop = 0;
    }
  }, 500);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootSeatToolsPatch);
else bootSeatToolsPatch();
