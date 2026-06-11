const ROOM_SLOT_STYLE_ID = "a3k64-seating-room-slot-swap-style";
const ROOM_SLOT_STORAGE_KEY = "a3k64-seating-room-slot-map-v1";
const ROOM_SLOT_WINDOW = "#a3k64-seating-window";

type RoomSlotKey = "leftTop" | "leftBottom" | "rightTop" | "rightMiddle" | "rightBottom" | "frontLeft" | "frontCenter" | "frontRight" | "backCenter" | "aisleCenter";
type RoomItemKey = "windowA" | "windowB" | "windowC" | "windowD" | "door" | "teacherDesk" | "board" | "backLabel" | "aisleLabel";
type RoomKind = "window" | "door" | "label" | "teacher" | "board" | "aisle";

type RoomItem = { key: RoomItemKey; label: string; kind: RoomKind };

const DEFAULT_ROOM_SLOT_MAP: Record<RoomItemKey, RoomSlotKey> = {
  windowA: "leftTop",
  windowB: "leftBottom",
  windowC: "rightTop",
  windowD: "rightMiddle",
  door: "rightBottom",
  teacherDesk: "frontLeft",
  board: "frontCenter",
  backLabel: "backCenter",
  aisleLabel: "aisleCenter",
};

const ROOM_ITEMS: RoomItem[] = [
  { key: "windowA", label: "Cửa sổ", kind: "window" },
  { key: "windowB", label: "Cửa sổ", kind: "window" },
  { key: "windowC", label: "Cửa sổ", kind: "window" },
  { key: "windowD", label: "Cửa sổ", kind: "window" },
  { key: "door", label: "Cửa ra vào", kind: "door" },
  { key: "teacherDesk", label: "BÀN GV", kind: "teacher" },
  { key: "board", label: "BẢNG", kind: "board" },
  { key: "backLabel", label: "CUỐI LỚP", kind: "label" },
  { key: "aisleLabel", label: "LỐI ĐI", kind: "aisle" },
];

const ROOM_SLOTS: Array<{ key: RoomSlotKey; allowed: RoomKind[] }> = [
  { key: "leftTop", allowed: ["window", "door"] },
  { key: "leftBottom", allowed: ["window", "door"] },
  { key: "rightTop", allowed: ["window", "door"] },
  { key: "rightMiddle", allowed: ["window", "door"] },
  { key: "rightBottom", allowed: ["window", "door"] },
  { key: "frontLeft", allowed: ["teacher", "board", "label"] },
  { key: "frontCenter", allowed: ["teacher", "board", "label"] },
  { key: "frontRight", allowed: ["teacher", "board", "label"] },
  { key: "backCenter", allowed: ["label", "teacher", "board"] },
  { key: "aisleCenter", allowed: ["aisle"] },
];

let draggingRoomItem: RoomItemKey | null = null;
let lastBoard: HTMLElement | null = null;

function getRoomItem(key: RoomItemKey) {
  return ROOM_ITEMS.find((item) => item.key === key)!;
}

function loadRoomSlotMap(): Record<RoomItemKey, RoomSlotKey> {
  try {
    return { ...DEFAULT_ROOM_SLOT_MAP, ...JSON.parse(localStorage.getItem(ROOM_SLOT_STORAGE_KEY) || "{}") };
  } catch {
    return { ...DEFAULT_ROOM_SLOT_MAP };
  }
}

function saveRoomSlotMap(map: Record<RoomItemKey, RoomSlotKey>) {
  localStorage.setItem(ROOM_SLOT_STORAGE_KEY, JSON.stringify(map));
}

function injectRoomSlotStyle() {
  if (document.getElementById(ROOM_SLOT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = ROOM_SLOT_STYLE_ID;
  style.textContent = `
    ${ROOM_SLOT_WINDOW} .a3-seat-board{position:relative!important;border:2px solid #0f3554!important;border-radius:8px!important;padding:48px 46px 52px!important;background:#fff!important;overflow:visible!important;}
    ${ROOM_SLOT_WINDOW} .a3-room-slot{position:absolute;display:grid;place-items:center;z-index:8;}
    ${ROOM_SLOT_WINDOW} .a3-room-slot-leftTop{left:-11px;top:15%;width:22px;height:98px;}
    ${ROOM_SLOT_WINDOW} .a3-room-slot-leftBottom{left:-11px;top:63%;width:22px;height:98px;}
    ${ROOM_SLOT_WINDOW} .a3-room-slot-rightTop{right:-11px;top:10%;width:22px;height:98px;}
    ${ROOM_SLOT_WINDOW} .a3-room-slot-rightMiddle{right:-11px;top:38%;width:22px;height:98px;}
    ${ROOM_SLOT_WINDOW} .a3-room-slot-rightBottom{right:-11px;bottom:18px;width:22px;height:116px;}
    ${ROOM_SLOT_WINDOW} .a3-room-slot-frontLeft{left:16%;bottom:12px;min-width:110px;height:28px;}
    ${ROOM_SLOT_WINDOW} .a3-room-slot-frontCenter{left:50%;bottom:12px;transform:translateX(-50%);min-width:100px;height:28px;}
    ${ROOM_SLOT_WINDOW} .a3-room-slot-frontRight{right:13%;bottom:12px;min-width:140px;height:28px;}
    ${ROOM_SLOT_WINDOW} .a3-room-slot-backCenter{left:50%;top:12px;transform:translateX(-50%);min-width:120px;height:28px;}
    ${ROOM_SLOT_WINDOW} .a3-room-slot-aisleCenter{left:50%;top:50%;transform:translate(-50%,-50%);width:70px;height:70%;z-index:2;}
    ${ROOM_SLOT_WINDOW} .a3-room-object{font-weight:1000;letter-spacing:.04em;user-select:none;touch-action:none;cursor:grab;text-align:center;border-radius:6px;line-height:1.1;}
    ${ROOM_SLOT_WINDOW} .a3-room-object:active{cursor:grabbing;}
    ${ROOM_SLOT_WINDOW} .a3-room-object.window{width:100%;height:100%;background:#176a8b;border:2px solid #08384d;box-shadow:inset 0 0 0 1px rgba(255,255,255,.16);font-size:0;color:transparent;}
    ${ROOM_SLOT_WINDOW} .a3-room-object.door{width:100%;height:100%;background:#050505;border:2px solid #050505;font-size:0;color:transparent;}
    ${ROOM_SLOT_WINDOW} .a3-room-object.teacher{color:#b45309;padding:2px 8px;background:rgba(251,191,36,.08);}
    ${ROOM_SLOT_WINDOW} .a3-room-object.board{color:#020617;padding:2px 10px;background:rgba(15,23,42,.04);}
    ${ROOM_SLOT_WINDOW} .a3-room-object.label{color:#020617;padding:2px 10px;background:rgba(15,23,42,.03);}
    ${ROOM_SLOT_WINDOW} .a3-room-object.aisle{width:100%;height:100%;display:flex;align-items:center;justify-content:center;writing-mode:vertical-rl;text-orientation:mixed;color:#1d4ed8;border:1px dashed #cbd5e1;border-radius:16px;background:#f8fafc;}
    ${ROOM_SLOT_WINDOW} .a3-room-slot.drag-over{outline:2px dashed var(--desktop-accent,#2563eb);outline-offset:4px;background:color-mix(in srgb,var(--desktop-accent,#2563eb) 9%,transparent);}
    ${ROOM_SLOT_WINDOW} .a3-room-invalid{animation:a3RoomInvalid .42s ease both;}
    @keyframes a3RoomInvalid{0%{box-shadow:0 0 0 0 rgba(239,68,68,.55)}60%{box-shadow:0 0 0 8px rgba(239,68,68,.13)}100%{box-shadow:0 0 0 0 rgba(239,68,68,0)}}
    ${ROOM_SLOT_WINDOW} .a3-seat-back,${ROOM_SLOT_WINDOW} .a3-seat-front,${ROOM_SLOT_WINDOW} .a3-seat-aisle{visibility:hidden!important;pointer-events:none!important;transform:none!important;}
    ${ROOM_SLOT_WINDOW} .a3-seat-layout{position:relative!important;z-index:4!important;}
    ${ROOM_SLOT_WINDOW} .a3-seat-row{background:#fff!important;}
    ${ROOM_SLOT_WINDOW} .a3-seat-cell{background:#fff!important;color:#020617!important;}
    ${ROOM_SLOT_WINDOW} .a3-seat-reset-room{height:38px;border:1px solid #273244;border-radius:13px;padding:0 12px;background:#111827;color:#e2e8f0;cursor:pointer;font-weight:900;}
    .theme-light ${ROOM_SLOT_WINDOW} .a3-seat-reset-room{background:#fff;color:#0f172a;border-color:#cbd5e1;}
    .theme-dark ${ROOM_SLOT_WINDOW} .a3-seat-board{background:#f8fafc!important;}
    @media (max-width:900px){${ROOM_SLOT_WINDOW} .a3-seat-board{padding:48px 28px 56px!important;}}
    @media print{${ROOM_SLOT_WINDOW} .a3-room-object.window{background:#176a8b!important}${ROOM_SLOT_WINDOW} .a3-room-object.door{background:#050505!important}}
  `;
  document.head.appendChild(style);
}

function getBoard() {
  return document.querySelector<HTMLElement>(`${ROOM_SLOT_WINDOW} .a3-seat-board`);
}

function ensureRoomSlots(board: HTMLElement) {
  ROOM_SLOTS.forEach((slot) => {
    if (board.querySelector(`[data-room-slot="${slot.key}"]`)) return;
    const el = document.createElement("div");
    el.className = `a3-room-slot a3-room-slot-${slot.key}`;
    el.dataset.roomSlot = slot.key;
    board.appendChild(el);
  });
}

function renderRoomObjects(board: HTMLElement) {
  const map = loadRoomSlotMap();
  board.querySelectorAll(".a3-room-object").forEach((node) => node.remove());
  ROOM_ITEMS.forEach((item) => {
    const slotKey = map[item.key] || DEFAULT_ROOM_SLOT_MAP[item.key];
    const slot = board.querySelector<HTMLElement>(`[data-room-slot="${slotKey}"]`);
    if (!slot) return;
    const obj = document.createElement("div");
    obj.className = `a3-room-object ${item.kind}`;
    obj.textContent = item.label;
    obj.draggable = item.kind !== "aisle";
    obj.dataset.roomItem = item.key;
    obj.title = item.kind === "aisle" ? "Lối đi cố định" : `${item.label}: kéo sang vị trí hợp lệ để đổi chỗ`;
    obj.addEventListener("dragstart", (event) => {
      draggingRoomItem = item.key;
      event.dataTransfer?.setData("text/plain", item.key);
    });
    slot.appendChild(obj);
  });
}

function isSwapAllowed(itemKey: RoomItemKey, targetSlotKey: RoomSlotKey, map: Record<RoomItemKey, RoomSlotKey>) {
  const item = getRoomItem(itemKey);
  const targetSlot = ROOM_SLOTS.find((slot) => slot.key === targetSlotKey);
  if (!targetSlot || !targetSlot.allowed.includes(item.kind)) return false;
  const occupying = (Object.keys(map) as RoomItemKey[]).find((key) => map[key] === targetSlotKey);
  if (!occupying) return true;
  const sourceSlotKey = map[itemKey];
  const occupant = getRoomItem(occupying);
  const sourceSlot = ROOM_SLOTS.find((slot) => slot.key === sourceSlotKey);
  return Boolean(sourceSlot?.allowed.includes(occupant.kind));
}

function bindRoomSlotSwap(board: HTMLElement) {
  board.querySelectorAll<HTMLElement>(".a3-room-slot").forEach((slot) => {
    if (slot.dataset.swapBound === "1") return;
    slot.dataset.swapBound = "1";
    slot.addEventListener("dragover", (event) => {
      if (!draggingRoomItem) return;
      event.preventDefault();
      slot.classList.add("drag-over");
    });
    slot.addEventListener("dragleave", () => slot.classList.remove("drag-over"));
    slot.addEventListener("drop", (event) => {
      event.preventDefault();
      slot.classList.remove("drag-over");
      const itemKey = (draggingRoomItem || event.dataTransfer?.getData("text/plain")) as RoomItemKey;
      const targetSlotKey = slot.dataset.roomSlot as RoomSlotKey;
      draggingRoomItem = null;
      if (!itemKey || !targetSlotKey) return;
      const map = loadRoomSlotMap();
      const sourceSlotKey = map[itemKey];
      if (sourceSlotKey === targetSlotKey) return;
      if (!isSwapAllowed(itemKey, targetSlotKey, map)) {
        flashInvalid(slot);
        return;
      }
      const occupying = (Object.keys(map) as RoomItemKey[]).find((key) => map[key] === targetSlotKey);
      map[itemKey] = targetSlotKey;
      if (occupying) map[occupying] = sourceSlotKey;
      saveRoomSlotMap(map);
      renderRoomObjects(board);
    });
  });
}

function flashInvalid(slot: HTMLElement) {
  slot.classList.remove("a3-room-invalid");
  window.setTimeout(() => slot.classList.add("a3-room-invalid"), 0);
}

function ensureResetRoomButton() {
  const tools = document.querySelector<HTMLElement>(`${ROOM_SLOT_WINDOW} .a3-seat-tools`);
  if (!tools || tools.querySelector(".a3-seat-reset-room")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "a3-seat-reset-room";
  button.textContent = "Reset phòng";
  button.addEventListener("click", () => {
    localStorage.removeItem(ROOM_SLOT_STORAGE_KEY);
    const board = getBoard();
    if (board) renderRoomObjects(board);
  });
  tools.appendChild(button);
}

function disableOldFreeZoneTransforms() {
  const selectors = [".a3-seat-back", ".a3-seat-front span", ".a3-seat-aisle"];
  document.querySelectorAll<HTMLElement>(`${ROOM_SLOT_WINDOW} ${selectors.join(`, ${ROOM_SLOT_WINDOW} `)}`).forEach((el) => {
    el.style.transform = "";
    el.style.pointerEvents = "none";
  });
}

function syncRoomSlotPatch() {
  injectRoomSlotStyle();
  ensureResetRoomButton();
  disableOldFreeZoneTransforms();
  const board = getBoard();
  if (!board) {
    lastBoard = null;
    return;
  }
  const isNewBoard = board !== lastBoard || board.dataset.roomSlotReady !== "1";
  if (!isNewBoard) return;
  lastBoard = board;
  board.dataset.roomSlotReady = "1";
  ensureRoomSlots(board);
  renderRoomObjects(board);
  bindRoomSlotSwap(board);
}

function bootRoomSlotPatch() {
  injectRoomSlotStyle();
  syncRoomSlotPatch();
  window.setInterval(syncRoomSlotPatch, 500);
  window.addEventListener("dragend", () => { draggingRoomItem = null; });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootRoomSlotPatch);
else bootRoomSlotPatch();
