const HARD_SWAP_WINDOW = "#a3k64-seating-window";
const HARD_SWAP_STORAGE = "a3k64-seating-map-v1";
let hardSwapLoop = 0;
let hardSwapCount = 0;
let hardSwapBound = false;
let hardSwapDrag: { side: "left" | "right"; row: number; seat: number; name: string } | null = null;

function hardSwapReadPos(cell: HTMLElement) {
  const side = cell.dataset.side === "right" ? "right" : cell.dataset.side === "left" ? "left" : null;
  const row = Number(cell.dataset.row);
  const seat = Number(cell.dataset.seat);
  if (!side || !Number.isFinite(row) || !Number.isFinite(seat)) return null;
  return { side, row, seat };
}

function hardSwapReadName(cell: HTMLElement) {
  const name = (cell.textContent || "").trim();
  return name && name !== "Trống" ? name : "";
}

function hardSwapReadState() {
  const state = {
    left: Array.from({ length: 7 }, () => Array(4).fill("")),
    right: Array.from({ length: 7 }, () => Array(4).fill("")),
  } as { left: string[][]; right: string[][] };
  document.querySelectorAll<HTMLElement>(`${HARD_SWAP_WINDOW} .stable-seat-cell`).forEach((cell) => {
    const pos = hardSwapReadPos(cell);
    if (!pos) return;
    state[pos.side][pos.row][pos.seat] = hardSwapReadName(cell);
  });
  return state;
}

function hardSwapPaint(state: { left: string[][]; right: string[][] }) {
  document.querySelectorAll<HTMLElement>(`${HARD_SWAP_WINDOW} .stable-seat-cell`).forEach((cell) => {
    const pos = hardSwapReadPos(cell);
    if (!pos) return;
    const name = state[pos.side][pos.row][pos.seat] || "";
    cell.textContent = name || "Trống";
    cell.classList.toggle("empty", !name);
    cell.draggable = Boolean(name);
    cell.style.cursor = name ? "grab" : "default";
  });
}

function hardSwapSaveAndPaint(state: { left: string[][]; right: string[][] }) {
  localStorage.setItem(HARD_SWAP_STORAGE, JSON.stringify(state));
  hardSwapPaint(state);
  window.dispatchEvent(new CustomEvent("a3k64:seating-changed"));
}

function hardSwapToast(message: string) {
  document.querySelector(".hard-seat-swap-toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "hard-seat-swap-toast";
  toast.textContent = message;
  toast.style.cssText = "position:fixed;left:50%;top:74px;transform:translateX(-50%);z-index:999999;padding:10px 14px;border:1px solid #14b8a6;border-radius:14px;background:rgba(15,23,42,.96);color:#f8fafc;box-shadow:0 18px 55px rgba(0,0,0,.35);font-weight:900;font-size:14px";
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 1700);
}

function hardSwapSetDraggable() {
  document.querySelectorAll<HTMLElement>(`${HARD_SWAP_WINDOW} .stable-seat-cell`).forEach((cell) => {
    const name = hardSwapReadName(cell);
    cell.draggable = Boolean(name);
    cell.style.cursor = name ? "grab" : "default";
  });
}

function hardSwapStart(event: DragEvent) {
  const cell = (event.target as HTMLElement | null)?.closest?.(`${HARD_SWAP_WINDOW} .stable-seat-cell`) as HTMLElement | null;
  if (!cell) return;
  const pos = hardSwapReadPos(cell);
  const name = hardSwapReadName(cell);
  if (!pos || !name) return;
  hardSwapDrag = { ...pos, name };
  event.dataTransfer?.setData("text/plain", name);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  event.stopPropagation();
  if ("stopImmediatePropagation" in event) event.stopImmediatePropagation();
}

function hardSwapOver(event: DragEvent) {
  const cell = (event.target as HTMLElement | null)?.closest?.(`${HARD_SWAP_WINDOW} .stable-seat-cell`) as HTMLElement | null;
  if (!cell || !hardSwapDrag) return;
  event.preventDefault();
  event.stopPropagation();
  cell.classList.add("drag-over");
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
}

function hardSwapLeave(event: DragEvent) {
  const cell = (event.target as HTMLElement | null)?.closest?.(`${HARD_SWAP_WINDOW} .stable-seat-cell`) as HTMLElement | null;
  cell?.classList.remove("drag-over");
}

function hardSwapDrop(event: DragEvent) {
  const cell = (event.target as HTMLElement | null)?.closest?.(`${HARD_SWAP_WINDOW} .stable-seat-cell`) as HTMLElement | null;
  if (!cell || !hardSwapDrag) return;
  event.preventDefault();
  event.stopPropagation();
  if ("stopImmediatePropagation" in event) event.stopImmediatePropagation();
  cell.classList.remove("drag-over");

  const target = hardSwapReadPos(cell);
  if (!target) return;
  if (target.side === hardSwapDrag.side && target.row === hardSwapDrag.row && target.seat === hardSwapDrag.seat) {
    hardSwapDrag = null;
    return;
  }

  const state = hardSwapReadState();
  const targetName = state[target.side][target.row][target.seat] || "";
  state[target.side][target.row][target.seat] = hardSwapDrag.name;
  state[hardSwapDrag.side][hardSwapDrag.row][hardSwapDrag.seat] = targetName;
  hardSwapSaveAndPaint(state);
  hardSwapToast(targetName ? `Đã đổi chỗ ${hardSwapDrag.name} ↔ ${targetName}` : `Đã chuyển ${hardSwapDrag.name}`);
  hardSwapDrag = null;
}

function hardSwapEnd() {
  hardSwapDrag = null;
  document.querySelectorAll(`${HARD_SWAP_WINDOW} .stable-seat-cell.drag-over`).forEach((node) => node.classList.remove("drag-over"));
}

function bindHardSeatSwap() {
  if (hardSwapBound) return;
  hardSwapBound = true;
  document.addEventListener("dragstart", hardSwapStart, true);
  document.addEventListener("dragover", hardSwapOver, true);
  document.addEventListener("dragleave", hardSwapLeave, true);
  document.addEventListener("drop", hardSwapDrop, true);
  document.addEventListener("dragend", hardSwapEnd, true);
}

function bootHardSeatSwap() {
  bindHardSeatSwap();
  hardSwapSetDraggable();
  hardSwapLoop = window.setInterval(() => {
    hardSwapSetDraggable();
    hardSwapCount += 1;
    if (hardSwapCount > 240 && hardSwapLoop) {
      clearInterval(hardSwapLoop);
      hardSwapLoop = 0;
    }
  }, 500);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootHardSeatSwap);
else bootHardSeatSwap();

export {};
