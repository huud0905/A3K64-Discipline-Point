const SEATING_ZONE_PATCH_STYLE_ID = "a3k64-seating-layout-zones-patch";
const SEATING_ZONE_STORAGE_KEY = "a3k64-seating-zone-positions-v1";
const SEATING_WINDOW = "#a3k64-seating-window";

type ZoneKey = "back" | "aisle" | "teacher" | "board" | "door";
type ZonePos = { x: number; y: number };

type ZoneItem = {
  key: ZoneKey;
  el: HTMLElement;
  label: string;
};

const DEFAULT_ZONE_POSITIONS: Record<ZoneKey, ZonePos> = {
  back: { x: 0, y: 0 },
  aisle: { x: 0, y: 0 },
  teacher: { x: 0, y: 0 },
  board: { x: 0, y: 0 },
  door: { x: 0, y: 0 },
};

function loadZonePositions(): Record<ZoneKey, ZonePos> {
  try {
    return { ...DEFAULT_ZONE_POSITIONS, ...JSON.parse(localStorage.getItem(SEATING_ZONE_STORAGE_KEY) || "{}") };
  } catch {
    return { ...DEFAULT_ZONE_POSITIONS };
  }
}

function saveZonePositions(positions: Record<ZoneKey, ZonePos>) {
  localStorage.setItem(SEATING_ZONE_STORAGE_KEY, JSON.stringify(positions));
}

function injectZonePatchStyle() {
  if (document.getElementById(SEATING_ZONE_PATCH_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SEATING_ZONE_PATCH_STYLE_ID;
  style.textContent = `
    ${SEATING_WINDOW} .a3-seat-body{
      overflow:hidden!important;
      display:flex!important;
      flex-direction:column!important;
      min-height:0!important;
    }
    ${SEATING_WINDOW} .a3-seat-toolbar{
      flex:0 0 auto!important;
    }
    ${SEATING_WINDOW} .a3-seat-main{
      flex:1 1 auto!important;
      min-height:0!important;
      overflow:hidden!important;
    }
    ${SEATING_WINDOW} .a3-seat-students,
    ${SEATING_WINDOW} .a3-seat-board{
      min-height:0!important;
      overflow:hidden!important;
    }
    ${SEATING_WINDOW} .a3-seat-student-list{
      flex:1 1 auto!important;
      max-height:none!important;
      min-height:0!important;
      overflow:auto!important;
    }
    ${SEATING_WINDOW} .a3-seat-board{
      position:relative!important;
    }
    ${SEATING_WINDOW} .a3-seat-zone-draggable{
      cursor:move!important;
      user-select:none!important;
      touch-action:none!important;
      transition:box-shadow .12s ease, background .12s ease, border-color .12s ease;
      border-radius:12px;
      padding:2px 8px;
      outline:1px dashed transparent;
      z-index:3;
    }
    ${SEATING_WINDOW} .a3-seat-zone-draggable:hover,
    ${SEATING_WINDOW} .a3-seat-zone-dragging{
      outline-color:color-mix(in srgb,var(--desktop-accent,#2563eb) 62%,transparent);
      background:color-mix(in srgb,var(--desktop-accent,#2563eb) 12%,transparent);
      box-shadow:0 10px 24px rgba(15,23,42,.12);
    }
    ${SEATING_WINDOW} .a3-seat-zone-hint{
      display:inline-flex;
      align-items:center;
      gap:6px;
      margin-left:8px;
      color:#64748b;
      font-size:12px;
      font-weight:800;
    }
    ${SEATING_WINDOW} .a3-seat-reset-zones{
      height:38px;
      border:1px solid #273244;
      border-radius:13px;
      padding:0 12px;
      background:#111827;
      color:#e2e8f0;
      cursor:pointer;
      font-weight:900;
    }
    .theme-light ${SEATING_WINDOW} .a3-seat-reset-zones{
      background:#fff;
      color:#0f172a;
      border-color:#cbd5e1;
    }
    @media (max-width:760px){
      ${SEATING_WINDOW} .a3-seat-body{overflow:auto!important;}
      ${SEATING_WINDOW} .a3-seat-main{overflow:visible!important;}
    }
  `;
  document.head.appendChild(style);
}

function cleanStudentCountText() {
  const paragraph = document.querySelector<HTMLElement>(`${SEATING_WINDOW} .a3-seat-heading p`);
  if (!paragraph) return;
  const cleaned = paragraph.textContent?.replace(/^\s*\d+\s*học sinh\s*·\s*/i, "") || "Bật sửa rồi kéo tên từ danh sách bên trái vào ghế";
  if (paragraph.textContent !== cleaned) paragraph.textContent = cleaned;
  if (!paragraph.querySelector(".a3-seat-zone-hint")) {
    const hint = document.createElement("span");
    hint.className = "a3-seat-zone-hint";
    hint.textContent = "Kéo CUỐI LỚP / LỐI ĐI / BẢNG / BÀN GV / CỬA RA VÀO để đổi bố cục";
    paragraph.appendChild(hint);
  }
}

function getZoneItems(): ZoneItem[] {
  const win = document.querySelector<HTMLElement>(SEATING_WINDOW);
  if (!win) return [];
  const frontSpans = Array.from(win.querySelectorAll<HTMLElement>(".a3-seat-front span"));
  const board = frontSpans.find((span) => !span.classList.contains("teacher") && !span.classList.contains("door"));
  const items: Array<ZoneItem | null> = [
    { key: "back", el: win.querySelector<HTMLElement>(".a3-seat-back")!, label: "CUỐI LỚP" },
    { key: "aisle", el: win.querySelector<HTMLElement>(".a3-seat-aisle")!, label: "LỐI ĐI" },
    { key: "teacher", el: win.querySelector<HTMLElement>(".a3-seat-front .teacher")!, label: "BÀN GV" },
    { key: "board", el: board!, label: "BẢNG" },
    { key: "door", el: win.querySelector<HTMLElement>(".a3-seat-front .door")!, label: "CỬA RA VÀO" },
  ];
  return items.filter((item): item is ZoneItem => Boolean(item?.el));
}

function applyZoneTransforms() {
  const positions = loadZonePositions();
  getZoneItems().forEach(({ key, el, label }) => {
    const pos = positions[key] || { x: 0, y: 0 };
    el.classList.add("a3-seat-zone-draggable");
    el.dataset.zoneKey = key;
    el.title = `${label}: kéo để đổi vị trí`;
    el.style.transform = `translate(${Math.round(pos.x)}px, ${Math.round(pos.y)}px)`;
    el.style.position = "relative";
  });
}

function ensureResetZonesButton() {
  const tools = document.querySelector<HTMLElement>(`${SEATING_WINDOW} .a3-seat-tools`);
  if (!tools || tools.querySelector(".a3-seat-reset-zones")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "a3-seat-reset-zones";
  button.textContent = "Reset khu vực";
  button.addEventListener("click", () => {
    localStorage.removeItem(SEATING_ZONE_STORAGE_KEY);
    applyZoneTransforms();
  });
  tools.appendChild(button);
}

let draggingZone: { key: ZoneKey; el: HTMLElement; startX: number; startY: number; origin: ZonePos } | null = null;

function bindZoneDragging() {
  getZoneItems().forEach(({ key, el }) => {
    if (el.dataset.zoneDragBound === "1") return;
    el.dataset.zoneDragBound = "1";
    el.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const positions = loadZonePositions();
      draggingZone = {
        key,
        el,
        startX: event.clientX,
        startY: event.clientY,
        origin: positions[key] || { x: 0, y: 0 },
      };
      el.classList.add("a3-seat-zone-dragging");
      el.setPointerCapture?.(event.pointerId);
    });
  });
}

function handlePointerMove(event: PointerEvent) {
  if (!draggingZone) return;
  const next = {
    x: draggingZone.origin.x + event.clientX - draggingZone.startX,
    y: draggingZone.origin.y + event.clientY - draggingZone.startY,
  };
  draggingZone.el.style.transform = `translate(${Math.round(next.x)}px, ${Math.round(next.y)}px)`;
}

function handlePointerUp() {
  if (!draggingZone) return;
  const style = draggingZone.el.style.transform;
  const match = style.match(/translate\((-?\d+)px,\s*(-?\d+)px\)/);
  const positions = loadZonePositions();
  positions[draggingZone.key] = {
    x: match ? Number(match[1]) : draggingZone.origin.x,
    y: match ? Number(match[2]) : draggingZone.origin.y,
  };
  saveZonePositions(positions);
  draggingZone.el.classList.remove("a3-seat-zone-dragging");
  draggingZone = null;
}

function syncSeatingLayoutZonesPatch() {
  injectZonePatchStyle();
  cleanStudentCountText();
  ensureResetZonesButton();
  applyZoneTransforms();
  bindZoneDragging();
}

function bootSeatingLayoutZonesPatch() {
  injectZonePatchStyle();
  syncSeatingLayoutZonesPatch();
  const observer = new MutationObserver(syncSeatingLayoutZonesPatch);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", handlePointerUp);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootSeatingLayoutZonesPatch);
else bootSeatingLayoutZonesPatch();
