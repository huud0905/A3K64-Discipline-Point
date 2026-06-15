import { upsertStyleTag } from '../../../core/dom';

const SEAT_TOOLS_WINDOW = "#a3k64-seating-window";
const SEAT_TOOLS_STORAGE = "a3k64-seating-map-v1";
const SEAT_TOOLS_STYLE_ID = "a3k64-seat-tools-style";
let seatToolsLoop = 0;
let seatToolsCount = 0;
let seatContextBlockBound = false;
let seatExternalDrag: { type: "student"; name: string } | { type: "seat"; side: "left" | "right"; row: number; seat: number; name: string } | null = null;

function injectSeatToolsStyle() {
  upsertStyleTag(SEAT_TOOLS_STYLE_ID, `
    ${SEAT_TOOLS_WINDOW} .stable-seat-student-list{
      align-content:start!important;
      align-items:start!important;
      grid-auto-rows:min-content!important;
    }
    ${SEAT_TOOLS_WINDOW} .stable-seat-student-card{
      min-height:40px!important;
      max-height:46px!important;
      flex:0 0 auto!important;
      align-self:start!important;
    }
    ${SEAT_TOOLS_WINDOW} .seat-unassigned-empty{
      align-self:start!important;
      min-height:auto!important;
    }
  `);
}

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

function getCellInfo(cell: HTMLElement) {
  const side = cell.dataset.side === "right" ? "right" : cell.dataset.side === "left" ? "left" : null;
  const row = Number(cell.dataset.row);
  const seat = Number(cell.dataset.seat);
  const name = (cell.textContent || "").trim();
  if (!side || !Number.isFinite(row) || !Number.isFinite(seat) || !name || name === "Trống") return null;
  return { side, row, seat, name };
}

function readCellPos(cell: HTMLElement) {
  const side = cell.dataset.side === "right" ? "right" : cell.dataset.side === "left" ? "left" : null;
  const row = Number(cell.dataset.row);
  const seat = Number(cell.dataset.seat);
  if (!side || !Number.isFinite(row) || !Number.isFinite(seat)) return null;
  return { side, row, seat };
}

function removeSeatContextMenu() {
  document.querySelector(".seat-cell-context-menu")?.remove();
}

function updateSingleStudentCard(name: string) {
  const list = document.querySelector<HTMLElement>(`${SEAT_TOOLS_WINDOW} .stable-seat-student-list`);
  if (!list) return;
  const cards = Array.from(list.querySelectorAll<HTMLElement>(".stable-seat-student-card"));
  const card = cards.find((item) => (item.dataset.name || item.querySelector("span")?.textContent || "").trim() === name);
  if (!card) return;
  card.style.display = "";
  card.draggable = true;
  const small = card.querySelector("small");
  if (small) small.textContent = "Chưa xếp";
  list.querySelector(".seat-unassigned-empty")?.remove();
}

function deleteSeatCell(cell: HTMLElement) {
  const info = getCellInfo(cell);
  if (!info) return;
  const state = normalizeSeatState(readSeatStateFromDom());
  state[info.side][info.row][info.seat] = "";
  localStorage.setItem(SEAT_TOOLS_STORAGE, JSON.stringify(state));
  cell.textContent = "Trống";
  cell.classList.add("empty");
  updateSingleStudentCard(info.name);
  hideAssignedStudents();
  enableSeatDragDrop();
  showSeatToast(`Đã xoá ${info.name} khỏi chỗ ngồi.`);
}

function showSeatContextMenu(event: MouseEvent, cell: HTMLElement) {
  const info = getCellInfo(cell);
  removeSeatContextMenu();
  if (!info) return;
  const menu = document.createElement("div");
  menu.className = "seat-cell-context-menu";
  menu.innerHTML = `<button type="button" data-action="delete">Xoá</button>`;
  const x = Math.min(event.clientX, window.innerWidth - 130);
  const y = Math.min(event.clientY, window.innerHeight - 56);
  menu.style.cssText = "position:fixed;z-index:999999;min-width:118px;padding:6px;border:1px solid #334155;border-radius:12px;background:#111827;color:#f8fafc;box-shadow:0 20px 55px rgba(0,0,0,.35)";
  menu.style.left = `${Math.max(8, x)}px`;
  menu.style.top = `${Math.max(8, y)}px`;
  const button = menu.querySelector<HTMLButtonElement>("button")!;
  button.style.cssText = "width:100%;height:34px;border:0;border-radius:9px;background:transparent;color:#f87171;text-align:left;padding:0 12px;font-weight:900;cursor:pointer";
  button.addEventListener("mouseenter", () => { button.style.background = "rgba(248,113,113,.14)"; });
  button.addEventListener("mouseleave", () => { button.style.background = "transparent"; });
  button.addEventListener("click", () => {
    deleteSeatCell(cell);
    removeSeatContextMenu();
  });
  document.body.appendChild(menu);
}

function putExternalDragIntoCell(cell: HTMLElement) {
  if (!seatExternalDrag) return;
  const target = readCellPos(cell);
  if (!target) return;
  const state = normalizeSeatState(readSeatStateFromDom());

  if (seatExternalDrag.type === "seat") {
    if (seatExternalDrag.side === target.side && seatExternalDrag.row === target.row && seatExternalDrag.seat === target.seat) return;
    const targetName = state[target.side][target.row][target.seat];
    state[seatExternalDrag.side][seatExternalDrag.row][seatExternalDrag.seat] = targetName || "";
    state[target.side][target.row][target.seat] = seatExternalDrag.name;
  } else {
    (["left", "right"] as const).forEach((side) => {
      state[side].forEach((row: string[], rowIndex: number) => {
        row.forEach((name: string, seatIndex: number) => {
          if (name === seatExternalDrag!.name) state[side][rowIndex][seatIndex] = "";
        });
      });
    });
    state[target.side][target.row][target.seat] = seatExternalDrag.name;
  }

  localStorage.setItem(SEAT_TOOLS_STORAGE, JSON.stringify(state));
  paintSeatingFromState(state);
  seatExternalDrag = null;
  hideAssignedStudents();
  enableSeatDragDrop();
}

function enableSeatDragDrop() {
  document.querySelectorAll<HTMLElement>(`${SEAT_TOOLS_WINDOW} .stable-seat-student-card`).forEach((card) => {
    if (card.dataset.externalDragBound !== "1") {
      card.dataset.externalDragBound = "1";
      card.addEventListener("dragstart", (event) => {
        if (card.style.display === "none") return;
        const name = (card.dataset.name || card.querySelector("span")?.textContent || "").trim();
        if (!name) return;
        seatExternalDrag = { type: "student", name };
        event.dataTransfer?.setData("text/plain", name);
        event.dataTransfer!.effectAllowed = "move";
        event.stopPropagation();
        if ("stopImmediatePropagation" in event) event.stopImmediatePropagation();
      }, true);
    }
    if (card.style.display !== "none") card.draggable = true;
  });

  document.querySelectorAll<HTMLElement>(`${SEAT_TOOLS_WINDOW} .stable-seat-cell`).forEach((cell) => {
    if (cell.dataset.externalDropBound !== "1") {
      cell.dataset.externalDropBound = "1";
      cell.addEventListener("dragstart", (event) => {
        const pos = readCellPos(cell);
        const name = (cell.textContent || "").trim();
        if (!pos || !name || name === "Trống") return;
        seatExternalDrag = { type: "seat", ...pos, name };
        event.dataTransfer?.setData("text/plain", name);
        event.dataTransfer!.effectAllowed = "move";
        event.stopPropagation();
        if ("stopImmediatePropagation" in event) event.stopImmediatePropagation();
      }, true);
      cell.addEventListener("dragover", (event) => {
        if (!seatExternalDrag) return;
        event.preventDefault();
        event.stopPropagation();
        cell.classList.add("drag-over");
      }, true);
      cell.addEventListener("dragleave", () => cell.classList.remove("drag-over"), true);
      cell.addEventListener("drop", (event) => {
        if (!seatExternalDrag) return;
        event.preventDefault();
        event.stopPropagation();
        if ("stopImmediatePropagation" in event) event.stopImmediatePropagation();
        cell.classList.remove("drag-over");
        putExternalDragIntoCell(cell);
      }, true);
    }
  });
}

function blockSeatContextEvent(event: Event) {
  const mouseEvent = event as MouseEvent;
  const target = event.target as HTMLElement | null;
  const app = target?.closest?.(SEAT_TOOLS_WINDOW);
  if (!app) return;
  const cell = target?.closest?.(".stable-seat-cell") as HTMLElement | null;
  event.preventDefault();
  event.stopPropagation();
  if ("stopImmediatePropagation" in event) event.stopImmediatePropagation();
  if (event.type === "contextmenu" && cell) showSeatContextMenu(mouseEvent, cell);
}

function disableRightClickInSeating() {
  const win = document.querySelector<HTMLElement>(SEAT_TOOLS_WINDOW);
  if (!win) return;
  if (!seatContextBlockBound) {
    seatContextBlockBound = true;
    document.addEventListener("contextmenu", blockSeatContextEvent, true);
    document.addEventListener("mousedown", (event) => {
      if (event.button === 2 && (event.target as HTMLElement | null)?.closest?.(SEAT_TOOLS_WINDOW)) {
        event.stopPropagation();
        if ("stopImmediatePropagation" in event) event.stopImmediatePropagation();
      }
    }, true);
    document.addEventListener("pointerdown", (event) => {
      if (event.button === 2 && (event.target as HTMLElement | null)?.closest?.(SEAT_TOOLS_WINDOW)) {
        event.stopPropagation();
        if ("stopImmediatePropagation" in event) event.stopImmediatePropagation();
      }
    }, true);
    document.addEventListener("click", removeSeatContextMenu, true);
    window.addEventListener("scroll", removeSeatContextMenu, true);
    window.addEventListener("dragend", () => { seatExternalDrag = null; });
  }
  if (win.dataset.noContextMenu !== "1") {
    win.dataset.noContextMenu = "1";
    win.addEventListener("contextmenu", blockSeatContextEvent, true);
  }
}

function hideAssignedStudents() {
  const list = document.querySelector<HTMLElement>(`${SEAT_TOOLS_WINDOW} .stable-seat-student-list`);
  if (!list) return;
  const state = normalizeSeatState(readSeatStateFromDom());
  const assigned = new Set<string>();
  (["left", "right"] as const).forEach((side) => {
    state[side].forEach((row: string[]) => row.forEach((name: string) => { if (name) assigned.add(name); }));
  });
  let visible = 0;
  list.querySelectorAll<HTMLElement>(".stable-seat-student-card").forEach((card) => {
    const name = (card.dataset.name || card.querySelector("span")?.textContent || "").trim();
    const unassigned = Boolean(name) && !assigned.has(name);
    card.style.display = unassigned ? "" : "none";
    card.draggable = unassigned;
    const small = card.querySelector("small");
    if (small && unassigned) small.textContent = "Chưa xếp";
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
  injectSeatToolsStyle();
  disableRightClickInSeating();
  hideAssignedStudents();
  addRandomButton();
  enableSeatDragDrop();
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

export {};
