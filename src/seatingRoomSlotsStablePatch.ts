const STABLE_ROOM_PATCH_STYLE_ID = "a3k64-stable-room-slots-style";
const STABLE_ROOM_MAP_KEY = "a3k64-stable-room-slot-map-v1";
const STABLE_ROOM_WINDOW = "#a3k64-seating-window";

type StableRoomKind = "window" | "door" | "teacher" | "board" | "label" | "aisle";
type StableRoomSlotKey = "leftTop" | "leftBottom" | "rightTop" | "rightMiddle" | "rightBottom" | "frontLeft" | "frontCenter" | "frontRight" | "backCenter" | "aisleCenter";
type StableRoomItemKey = "windowA" | "windowB" | "windowC" | "windowD" | "door" | "teacher" | "board" | "back" | "aisle";

type StableRoomItem = {
  key: StableRoomItemKey;
  label: string;
  kind: StableRoomKind;
};

const STABLE_ROOM_ITEMS: StableRoomItem[] = [
  { key: "windowA", label: "Cửa sổ", kind: "window" },
  { key: "windowB", label: "Cửa sổ", kind: "window" },
  { key: "windowC", label: "Cửa sổ", kind: "window" },
  { key: "windowD", label: "Cửa sổ", kind: "window" },
  { key: "door", label: "Cửa ra vào", kind: "door" },
  { key: "teacher", label: "BÀN GV", kind: "teacher" },
  { key: "board", label: "BẢNG", kind: "board" },
  { key: "back", label: "CUỐI LỚP", kind: "label" },
  { key: "aisle", label: "LỐI ĐI", kind: "aisle" },
];

const STABLE_ROOM_DEFAULT_MAP: Record<StableRoomItemKey, StableRoomSlotKey> = {
  windowA: "leftTop",
  windowB: "leftBottom",
  windowC: "rightTop",
  windowD: "rightMiddle",
  door: "rightBottom",
  teacher: "frontLeft",
  board: "frontCenter",
  back: "backCenter",
  aisle: "aisleCenter",
};

const STABLE_ROOM_SLOTS: Array<{ key: StableRoomSlotKey; allowed: StableRoomKind[] }> = [
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

let stableRoomDragging: StableRoomItemKey | null = null;
let stableRoomLoop = 0;
let stableRoomLoopCount = 0;

function stableRoomItem(key: StableRoomItemKey) {
  return STABLE_ROOM_ITEMS.find((item) => item.key === key)!;
}

function stableRoomSlot(key: StableRoomSlotKey) {
  return STABLE_ROOM_SLOTS.find((slot) => slot.key === key)!;
}

function loadStableRoomMap(): Record<StableRoomItemKey, StableRoomSlotKey> {
  try {
    return { ...STABLE_ROOM_DEFAULT_MAP, ...JSON.parse(localStorage.getItem(STABLE_ROOM_MAP_KEY) || "{}") };
  } catch {
    return { ...STABLE_ROOM_DEFAULT_MAP };
  }
}

function saveStableRoomMap(map: Record<StableRoomItemKey, StableRoomSlotKey>) {
  localStorage.setItem(STABLE_ROOM_MAP_KEY, JSON.stringify(map));
}

function injectStableRoomStyle() {
  if (document.getElementById(STABLE_ROOM_PATCH_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STABLE_ROOM_PATCH_STYLE_ID;
  style.textContent = `
    ${STABLE_ROOM_WINDOW} .stable-seat-board{
      border:2px solid #0f3554!important;
      border-radius:8px!important;
      padding:48px 46px 52px!important;
      overflow:visible!important;
    }
    ${STABLE_ROOM_WINDOW} .stable-room-window,
    ${STABLE_ROOM_WINDOW} .stable-room-door,
    ${STABLE_ROOM_WINDOW} .stable-seat-back,
    ${STABLE_ROOM_WINDOW} .stable-seat-front .teacher,
    ${STABLE_ROOM_WINDOW} .stable-seat-front .door,
    ${STABLE_ROOM_WINDOW} .stable-seat-front span:not(.teacher):not(.door),
    ${STABLE_ROOM_WINDOW} .stable-seat-aisle{
      visibility:hidden!important;
      pointer-events:none!important;
    }
    ${STABLE_ROOM_WINDOW} .stable-room-slot{
      position:absolute;
      display:grid;
      place-items:center;
      z-index:18;
    }
    ${STABLE_ROOM_WINDOW} .stable-room-slot-leftTop{left:-11px;top:15%;width:22px;height:98px;}
    ${STABLE_ROOM_WINDOW} .stable-room-slot-leftBottom{left:-11px;top:63%;width:22px;height:98px;}
    ${STABLE_ROOM_WINDOW} .stable-room-slot-rightTop{right:-11px;top:10%;width:22px;height:98px;}
    ${STABLE_ROOM_WINDOW} .stable-room-slot-rightMiddle{right:-11px;top:38%;width:22px;height:98px;}
    ${STABLE_ROOM_WINDOW} .stable-room-slot-rightBottom{right:-11px;bottom:18px;width:22px;height:116px;}
    ${STABLE_ROOM_WINDOW} .stable-room-slot-frontLeft{left:16%;bottom:12px;min-width:112px;height:30px;}
    ${STABLE_ROOM_WINDOW} .stable-room-slot-frontCenter{left:50%;bottom:12px;transform:translateX(-50%);min-width:104px;height:30px;}
    ${STABLE_ROOM_WINDOW} .stable-room-slot-frontRight{right:13%;bottom:12px;min-width:148px;height:30px;}
    ${STABLE_ROOM_WINDOW} .stable-room-slot-backCenter{left:50%;top:12px;transform:translateX(-50%);min-width:126px;height:30px;}
    ${STABLE_ROOM_WINDOW} .stable-room-slot-aisleCenter{left:50%;top:50%;transform:translate(-50%,-50%);width:70px;height:70%;z-index:2;}
    ${STABLE_ROOM_WINDOW} .stable-room-item{
      user-select:none;
      touch-action:none;
      cursor:grab;
      text-align:center;
      font-weight:1000;
      letter-spacing:.04em;
      line-height:1.05;
      border-radius:7px;
    }
    ${STABLE_ROOM_WINDOW} .stable-room-item:active{cursor:grabbing;}
    ${STABLE_ROOM_WINDOW} .stable-room-item.window{
      width:100%;height:100%;background:#176a8b;border:2px solid #08384d;color:transparent;font-size:0;
      box-shadow:inset 0 0 0 1px rgba(255,255,255,.16);
    }
    ${STABLE_ROOM_WINDOW} .stable-room-item.door{width:100%;height:100%;background:#050505;border:2px solid #050505;color:transparent;font-size:0;}
    ${STABLE_ROOM_WINDOW} .stable-room-item.teacher{color:#b45309;padding:3px 10px;background:rgba(251,191,36,.1);}
    ${STABLE_ROOM_WINDOW} .stable-room-item.board{color:#020617;padding:3px 10px;background:rgba(15,23,42,.05);}
    ${STABLE_ROOM_WINDOW} .stable-room-item.label{color:#020617;padding:3px 10px;background:rgba(15,23,42,.03);}
    ${STABLE_ROOM_WINDOW} .stable-room-item.aisle{
      width:100%;height:100%;display:flex;align-items:center;justify-content:center;writing-mode:vertical-rl;text-orientation:mixed;
      color:#1d4ed8;border:1px dashed #cbd5e1;border-radius:16px;background:#f8fafc;
    }
    ${STABLE_ROOM_WINDOW} .stable-room-slot.drag-over{
      outline:2px dashed var(--desktop-accent,#14b8a6);
      outline-offset:4px;
      background:color-mix(in srgb,var(--desktop-accent,#14b8a6) 10%,transparent);
    }
    ${STABLE_ROOM_WINDOW} .stable-room-slot.invalid{
      animation:stableRoomInvalid .42s ease both;
    }
    @keyframes stableRoomInvalid{
      0%{box-shadow:0 0 0 0 rgba(239,68,68,.5)}
      60%{box-shadow:0 0 0 8px rgba(239,68,68,.13)}
      100%{box-shadow:0 0 0 0 rgba(239,68,68,0)}
    }
    ${STABLE_ROOM_WINDOW} .stable-seat-room-reset{
      height:38px;border:1px solid #cbd5e1;border-radius:13px;padding:0 12px;background:#fff;color:#0f172a;cursor:pointer;font-weight:900;
    }
    .theme-dark ${STABLE_ROOM_WINDOW} .stable-seat-room-reset{background:#111827;color:#e2e8f0;border-color:#273244;}
    @media(max-width:900px){
      ${STABLE_ROOM_WINDOW} .stable-seat-board{padding:48px 28px 56px!important;}
    }
  `;
  document.head.appendChild(style);
}

function roomItemInSlot(map: Record<StableRoomItemKey, StableRoomSlotKey>, slotKey: StableRoomSlotKey) {
  return (Object.keys(map) as StableRoomItemKey[]).find((key) => map[key] === slotKey) || null;
}

function canSwapRoomItem(itemKey: StableRoomItemKey, targetSlotKey: StableRoomSlotKey, map: Record<StableRoomItemKey, StableRoomSlotKey>) {
  const item = stableRoomItem(itemKey);
  const targetSlot = stableRoomSlot(targetSlotKey);
  if (!targetSlot.allowed.includes(item.kind)) return false;
  const occupying = roomItemInSlot(map, targetSlotKey);
  if (!occupying) return true;
  const sourceSlot = stableRoomSlot(map[itemKey]);
  const occupant = stableRoomItem(occupying);
  return sourceSlot.allowed.includes(occupant.kind);
}

function ensureStableRoomResetButton() {
  const tools = document.querySelector<HTMLElement>(`${STABLE_ROOM_WINDOW} .stable-seat-tools`);
  if (!tools || tools.querySelector(".stable-seat-room-reset")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "stable-seat-room-reset";
  button.textContent = "Reset phòng";
  button.addEventListener("click", () => {
    localStorage.removeItem(STABLE_ROOM_MAP_KEY);
    const board = document.querySelector<HTMLElement>(`${STABLE_ROOM_WINDOW} .stable-seat-board`);
    if (board) renderStableRoomObjects(board);
  });
  tools.appendChild(button);
}

function ensureStableRoomSlots(board: HTMLElement) {
  ROOM_SLOT_SAFE_KEYS().forEach((slotKey) => {
    if (board.querySelector(`[data-stable-room-slot="${slotKey}"]`)) return;
    const slot = document.createElement("div");
    slot.className = `stable-room-slot stable-room-slot-${slotKey}`;
    slot.dataset.stableRoomSlot = slotKey;
    board.appendChild(slot);
  });
}

function ROOM_SLOT_SAFE_KEYS(): StableRoomSlotKey[] {
  return STABLE_ROOM_SLOTS.map((slot) => slot.key);
}

function renderStableRoomObjects(board: HTMLElement) {
  const map = loadStableRoomMap();
  board.querySelectorAll(".stable-room-item").forEach((node) => node.remove());
  STABLE_ROOM_ITEMS.forEach((item) => {
    const slotKey = map[item.key] || STABLE_ROOM_DEFAULT_MAP[item.key];
    const slot = board.querySelector<HTMLElement>(`[data-stable-room-slot="${slotKey}"]`);
    if (!slot) return;
    const el = document.createElement("div");
    el.className = `stable-room-item ${item.kind}`;
    el.textContent = item.label;
    el.dataset.stableRoomItem = item.key;
    el.draggable = item.kind !== "aisle";
    el.title = item.kind === "aisle" ? "Lối đi cố định" : `${item.label}: kéo sang vị trí hợp lệ để đổi chỗ`;
    el.addEventListener("dragstart", (event) => {
      stableRoomDragging = item.key;
      event.dataTransfer?.setData("text/plain", item.key);
    });
    el.addEventListener("dragend", () => {
      stableRoomDragging = null;
    });
    slot.appendChild(el);
  });
}

function bindStableRoomSlots(board: HTMLElement) {
  board.querySelectorAll<HTMLElement>(".stable-room-slot").forEach((slot) => {
    if (slot.dataset.stableRoomBound === "1") return;
    slot.dataset.stableRoomBound = "1";
    slot.addEventListener("dragover", (event) => {
      if (!stableRoomDragging) return;
      event.preventDefault();
      slot.classList.add("drag-over");
    });
    slot.addEventListener("dragleave", () => slot.classList.remove("drag-over"));
    slot.addEventListener("drop", (event) => {
      event.preventDefault();
      slot.classList.remove("drag-over");
      const itemKey = (stableRoomDragging || event.dataTransfer?.getData("text/plain")) as StableRoomItemKey;
      stableRoomDragging = null;
      const targetSlotKey = slot.dataset.stableRoomSlot as StableRoomSlotKey;
      if (!itemKey || !targetSlotKey) return;
      const map = loadStableRoomMap();
      const sourceSlotKey = map[itemKey];
      if (sourceSlotKey === targetSlotKey) return;
      if (!canSwapRoomItem(itemKey, targetSlotKey, map)) {
        slot.classList.remove("invalid");
        setTimeout(() => slot.classList.add("invalid"), 0);
        return;
      }
      const occupying = roomItemInSlot(map, targetSlotKey);
      map[itemKey] = targetSlotKey;
      if (occupying) map[occupying] = sourceSlotKey;
      saveStableRoomMap(map);
      renderStableRoomObjects(board);
    });
  });
}

function syncStableRoomSlots() {
  injectStableRoomStyle();
  ensureStableRoomResetButton();
  const board = document.querySelector<HTMLElement>(`${STABLE_ROOM_WINDOW} .stable-seat-board`);
  if (!board) return;
  ensureStableRoomSlots(board);
  if (board.dataset.stableRoomSlotsReady !== "1") {
    board.dataset.stableRoomSlotsReady = "1";
    bindStableRoomSlots(board);
    renderStableRoomObjects(board);
    return;
  }
  if (!board.querySelector(".stable-room-item")) renderStableRoomObjects(board);
}

function bootStableRoomSlots() {
  injectStableRoomStyle();
  syncStableRoomSlots();
  stableRoomLoop = window.setInterval(() => {
    syncStableRoomSlots();
    stableRoomLoopCount += 1;
    if (stableRoomLoopCount > 240 && stableRoomLoop) {
      window.clearInterval(stableRoomLoop);
      stableRoomLoop = 0;
    }
  }, 500);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootStableRoomSlots);
else bootStableRoomSlots();
