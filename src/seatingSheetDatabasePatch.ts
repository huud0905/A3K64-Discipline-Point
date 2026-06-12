const SEATING_SHEET_DB_STYLE_ID = "a3k64-seating-sheet-db-style";
const SEATING_SHEET_DB_WINDOW = "#a3k64-seating-window";
const SEATING_SHEET_LOCAL_DB_KEY = "a3k64-seating-sheet-local-db-v1";
const SEATING_SHEET_CURRENT_ID_KEY = "a3k64-seating-sheet-current-id-v1";
const SEATING_SEATS_KEY = "a3k64-seating-map-v1";
const SEATING_ROOM_KEY = "a3k64-stable-room-slot-map-v1";
const GAS_URL_FOR_SEATING = import.meta.env.VITE_GAS_WEB_APP_URL?.trim();

type SeatingChartSummary = {
  id: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
  active?: boolean;
};

type SeatingChartLayout = {
  version: 1;
  seats: unknown;
  room: unknown;
  meta: {
    exportedAt: string;
    source: "frontend";
  };
};

type SeatingChartRecord = SeatingChartSummary & {
  layout: SeatingChartLayout;
};

type SeatingLocalDb = {
  items: SeatingChartRecord[];
};

let seatingSheetDbLoop = 0;
let seatingSheetDbLoopCount = 0;
let seatingSheetDbLoaded = false;
let seatingSheetCharts: SeatingChartSummary[] = [];

function seatingNow() {
  return new Date().toISOString();
}

function seatingMakeId() {
  return `seat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function seatingReadJson(raw: string | null) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return raw; }
}

function seatingSnapshot(): SeatingChartLayout {
  return {
    version: 1,
    seats: seatingReadJson(localStorage.getItem(SEATING_SEATS_KEY)),
    room: seatingReadJson(localStorage.getItem(SEATING_ROOM_KEY)),
    meta: { exportedAt: seatingNow(), source: "frontend" },
  };
}

function applySeatingSnapshot(layout: SeatingChartLayout) {
  if (layout?.seats) localStorage.setItem(SEATING_SEATS_KEY, JSON.stringify(layout.seats));
  else localStorage.removeItem(SEATING_SEATS_KEY);
  if (layout?.room) localStorage.setItem(SEATING_ROOM_KEY, JSON.stringify(layout.room));
  else localStorage.removeItem(SEATING_ROOM_KEY);
  location.reload();
}

function readLocalDb(): SeatingLocalDb {
  try {
    const parsed = JSON.parse(localStorage.getItem(SEATING_SHEET_LOCAL_DB_KEY) || "{}");
    return Array.isArray(parsed.items) ? { items: parsed.items } : { items: [] };
  } catch {
    return { items: [] };
  }
}

function writeLocalDb(db: SeatingLocalDb) {
  localStorage.setItem(SEATING_SHEET_LOCAL_DB_KEY, JSON.stringify(db));
}

function ensureLocalDefault() {
  const db = readLocalDb();
  if (db.items.length) return db;
  const now = seatingNow();
  const item: SeatingChartRecord = {
    id: seatingMakeId(),
    title: "Sơ đồ hiện tại",
    createdAt: now,
    updatedAt: now,
    active: true,
    layout: seatingSnapshot(),
  };
  db.items.push(item);
  writeLocalDb(db);
  localStorage.setItem(SEATING_SHEET_CURRENT_ID_KEY, item.id);
  return db;
}

function localListCharts(): SeatingChartSummary[] {
  return ensureLocalDefault().items.map(({ id, title, createdAt, updatedAt, active }) => ({ id, title, createdAt, updatedAt, active }));
}

function localGetChart(id: string) {
  return ensureLocalDefault().items.find((item) => item.id === id) || null;
}

function localSaveChart(id: string | null, title: string, layout: SeatingChartLayout) {
  const db = ensureLocalDefault();
  const now = seatingNow();
  let item = id ? db.items.find((entry) => entry.id === id) : null;
  if (!item) {
    item = { id: id || seatingMakeId(), title, createdAt: now, updatedAt: now, active: true, layout };
    db.items.push(item);
  } else {
    item.title = title || item.title;
    item.updatedAt = now;
    item.layout = layout;
  }
  db.items.forEach((entry) => { entry.active = entry.id === item!.id; });
  writeLocalDb(db);
  localStorage.setItem(SEATING_SHEET_CURRENT_ID_KEY, item.id);
  return item;
}

function gasJsonpForSeating(action: string, payload?: unknown): Promise<any | null> {
  if (!GAS_URL_FOR_SEATING) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const callbackName = `__a3k64Seat_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const url = new URL(GAS_URL_FOR_SEATING);
    const callbacks = window as typeof window & Record<string, unknown>;
    let settled = false;
    let timeout = 0;

    url.searchParams.set("action", action);
    url.searchParams.set("callback", callbackName);
    url.searchParams.set("t", String(Date.now()));
    if (payload !== undefined) url.searchParams.set("payload", JSON.stringify(payload));

    callbacks[callbackName] = (json: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      delete callbacks[callbackName];
      script.remove();
      if (json?.ok === false || json?.data?.ok === false) reject(new Error(String(json.error || json.data?.error || "Backend lỗi")));
      else resolve(json?.data || json);
    };

    script.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      delete callbacks[callbackName];
      script.remove();
      reject(new Error("Không gọi được Apps Script"));
    };

    timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      delete callbacks[callbackName];
      script.remove();
      reject(new Error("Apps Script phản hồi quá lâu"));
    }, 18000);

    script.src = url.toString();
    document.head.appendChild(script);
  });
}

async function listCharts(): Promise<SeatingChartSummary[]> {
  try {
    const response = await gasJsonpForSeating("listSeatingCharts");
    const charts = response?.charts || response?.data?.charts;
    if (Array.isArray(charts)) return charts;
  } catch (error) {
    console.warn("SEATING CHART backend chưa sẵn sàng, dùng local:", error);
  }
  return localListCharts();
}

async function getChart(id: string): Promise<SeatingChartRecord | null> {
  try {
    const response = await gasJsonpForSeating("getSeatingChart", { id });
    const chart = response?.chart || response?.data?.chart;
    if (chart?.layout) return chart;
  } catch (error) {
    console.warn("Không đọc được sơ đồ từ sheet, dùng local:", error);
  }
  return localGetChart(id);
}

async function saveChart(id: string | null, title: string) {
  const layout = seatingSnapshot();
  try {
    const response = await gasJsonpForSeating("saveSeatingChart", { id, title, layout, makeActive: true });
    const chart = response?.chart || response?.data?.chart;
    if (chart?.id) {
      localStorage.setItem(SEATING_SHEET_CURRENT_ID_KEY, chart.id);
      return chart as SeatingChartRecord;
    }
  } catch (error) {
    console.warn("Không lưu được lên sheet, lưu local:", error);
  }
  return localSaveChart(id, title, layout);
}

function injectSeatingSheetDbStyle() {
  if (document.getElementById(SEATING_SHEET_DB_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SEATING_SHEET_DB_STYLE_ID;
  style.textContent = `
    ${SEATING_SHEET_DB_WINDOW} .seat-db-select{
      height:38px;
      min-width:168px;
      max-width:230px;
      border:1px solid #cbd5e1;
      border-radius:13px;
      padding:0 10px;
      background:#fff;
      color:#0f172a;
      font-weight:800;
      outline:none;
    }
    ${SEATING_SHEET_DB_WINDOW} .seat-db-btn{
      height:38px;
      border:1px solid #cbd5e1;
      border-radius:13px;
      padding:0 12px;
      background:#fff;
      color:#0f172a;
      cursor:pointer;
      font-weight:900;
      white-space:nowrap;
    }
    ${SEATING_SHEET_DB_WINDOW} .seat-db-btn.primary{
      background:var(--desktop-accent,#14b8a6);
      border-color:transparent;
      color:#fff;
    }
    .theme-dark ${SEATING_SHEET_DB_WINDOW} .seat-db-select,
    .theme-dark ${SEATING_SHEET_DB_WINDOW} .seat-db-btn{
      background:#111827;
      color:#e2e8f0;
      border-color:#334155;
    }
  `;
  document.head.appendChild(style);
}

function renderSelectOptions() {
  const select = document.querySelector<HTMLSelectElement>(`${SEATING_SHEET_DB_WINDOW} .seat-db-select`);
  if (!select) return;
  const currentId = localStorage.getItem(SEATING_SHEET_CURRENT_ID_KEY) || seatingSheetCharts.find((item) => item.active)?.id || seatingSheetCharts[0]?.id || "";
  select.innerHTML = seatingSheetCharts.map((chart) => `<option value="${escapeHtml(chart.id)}">${escapeHtml(chart.title || "Sơ đồ")}</option>`).join("");
  if (currentId) select.value = currentId;
}

function escapeHtml(value: string) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

async function refreshCharts() {
  seatingSheetCharts = await listCharts();
  seatingSheetDbLoaded = true;
  renderSelectOptions();
}

function ensureSeatingDbControls() {
  const tools = document.querySelector<HTMLElement>(`${SEATING_SHEET_DB_WINDOW} .stable-seat-tools`);
  if (!tools || tools.querySelector(".seat-db-select")) return;

  const select = document.createElement("select");
  select.className = "seat-db-select";
  select.title = "Các sơ đồ đã lưu trong sheet SEATING CHART";
  select.addEventListener("change", async () => {
    const id = select.value;
    const chart = await getChart(id);
    if (!chart) return alert("Không tìm thấy sơ đồ này.");
    if (!confirm(`Mở \"${chart.title}\"?`)) return renderSelectOptions();
    localStorage.setItem(SEATING_SHEET_CURRENT_ID_KEY, chart.id);
    applySeatingSnapshot(chart.layout);
  });

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "seat-db-btn primary";
  saveBtn.textContent = "Lưu sơ đồ";
  saveBtn.addEventListener("click", async () => {
    const id = select.value || localStorage.getItem(SEATING_SHEET_CURRENT_ID_KEY);
    const title = seatingSheetCharts.find((item) => item.id === id)?.title || "Sơ đồ hiện tại";
    await saveChart(id, title);
    await refreshCharts();
    alert("Đã lưu sơ đồ.");
  });

  const newBtn = document.createElement("button");
  newBtn.type = "button";
  newBtn.className = "seat-db-btn";
  newBtn.textContent = "Tạo sơ đồ mới";
  newBtn.addEventListener("click", async () => {
    const title = prompt("Tên sơ đồ mới:", `Sơ đồ ${seatingSheetCharts.length + 1}`)?.trim();
    if (!title) return;
    const chart = await saveChart(null, title);
    localStorage.setItem(SEATING_SHEET_CURRENT_ID_KEY, chart.id);
    await refreshCharts();
    alert("Đã tạo và lưu sơ đồ mới.");
  });

  tools.prepend(newBtn);
  tools.prepend(saveBtn);
  tools.prepend(select);

  if (!seatingSheetDbLoaded) void refreshCharts();
  else renderSelectOptions();
}

function bootSeatingSheetDatabasePatch() {
  injectSeatingSheetDbStyle();
  const tick = () => ensureSeatingDbControls();
  tick();
  seatingSheetDbLoop = window.setInterval(() => {
    tick();
    seatingSheetDbLoopCount += 1;
    if (seatingSheetDbLoopCount > 120 && seatingSheetDbLoop) {
      window.clearInterval(seatingSheetDbLoop);
      seatingSheetDbLoop = 0;
    }
  }, 700);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootSeatingSheetDatabasePatch);
else bootSeatingSheetDatabasePatch();
