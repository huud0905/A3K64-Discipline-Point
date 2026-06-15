const SEAT_CTRL_WINDOW = "#a3k64-seating-window";
const SEAT_CTRL_STYLE_ID = "a3k64-seat-restore-controls-style";
const SEAT_CTRL_DB_KEY = "a3k64-seating-sheet-local-db-v1";
const SEAT_CTRL_CURRENT_KEY = "a3k64-seating-sheet-current-id-v1";
const SEAT_CTRL_SEATS_KEY = "a3k64-seating-map-v1";
const SEAT_CTRL_ROOM_KEY = "a3k64-stable-room-slot-map-v1";
const SEAT_CTRL_GAS_URL = import.meta.env.VITE_GAS_WEB_APP_URL?.trim();

const SEAT_CTRL_DEFAULT = {
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

type SeatCtrlChart = { id: string; title: string; active?: boolean; layout?: any };
let seatCtrlLoop = 0;
let seatCtrlCount = 0;
let seatCtrlCharts: SeatCtrlChart[] = [];
let seatCtrlLoaded = false;
let seatCtrlBound = false;
let seatCtrlLastRenderKey = "";

function seatCtrlEscape(value: string) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
}

function seatCtrlToast(message: string) {
  document.querySelector(".seat-ctrl-toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "seat-ctrl-toast";
  toast.textContent = message;
  toast.style.cssText = "position:fixed;left:50%;top:74px;transform:translateX(-50%);z-index:999999;padding:10px 14px;border:1px solid #14b8a6;border-radius:14px;background:rgba(15,23,42,.96);color:#f8fafc;box-shadow:0 18px 55px rgba(0,0,0,.35);font-weight:900;font-size:14px";
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 1700);
}

function seatCtrlGas(action: string, payload?: unknown): Promise<any | null> {
  if (!SEAT_CTRL_GAS_URL) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const callbackName = `__a3k64SeatCtrl_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const url = new URL(SEAT_CTRL_GAS_URL);
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
    }, 12000);
    script.src = url.toString();
    document.head.appendChild(script);
  });
}

function seatCtrlReadJson(raw: string | null) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return raw; }
}

function seatCtrlSnapshot() {
  return {
    version: 1,
    seats: seatCtrlReadJson(localStorage.getItem(SEAT_CTRL_SEATS_KEY)),
    room: seatCtrlReadJson(localStorage.getItem(SEAT_CTRL_ROOM_KEY)),
    meta: { exportedAt: new Date().toISOString(), source: "frontend" },
  };
}

function seatCtrlLocalDb() {
  try {
    const db = JSON.parse(localStorage.getItem(SEAT_CTRL_DB_KEY) || "{}");
    return Array.isArray(db.items) ? db.items : [];
  } catch {
    return [];
  }
}

function seatCtrlWriteLocal(items: SeatCtrlChart[]) {
  localStorage.setItem(SEAT_CTRL_DB_KEY, JSON.stringify({ items }));
}

function seatCtrlEnsureLocal() {
  let items = seatCtrlLocalDb();
  if (items.length) return items;
  const now = new Date().toISOString();
  const item = { id: `seat_${Date.now()}`, title: "Sơ đồ 1", active: true, createdAt: now, updatedAt: now, layout: seatCtrlSnapshot() };
  items = [item];
  seatCtrlWriteLocal(items);
  localStorage.setItem(SEAT_CTRL_CURRENT_KEY, item.id);
  return items;
}

async function seatCtrlList() {
  try {
    const response = await seatCtrlGas("listSeatingCharts");
    const charts = response?.charts || response?.data?.charts;
    if (Array.isArray(charts) && charts.length) return charts;
  } catch (err) {
    console.warn("Không đọc list SEATING CHART, dùng local:", err);
  }
  return seatCtrlEnsureLocal();
}

async function seatCtrlGet(id: string) {
  try {
    const response = await seatCtrlGas("getSeatingChart", { id });
    const chart = response?.chart || response?.data?.chart;
    if (chart?.layout) return chart;
  } catch (err) {
    console.warn("Không mở SEATING CHART từ sheet, dùng local:", err);
  }
  return seatCtrlEnsureLocal().find((item: SeatCtrlChart) => item.id === id) || null;
}

async function seatCtrlSave(id: string | null, title: string) {
  const layout = seatCtrlSnapshot();
  try {
    const response = await seatCtrlGas("saveSeatingChart", { id, title, layout, makeActive: true });
    const chart = response?.chart || response?.data?.chart;
    if (chart?.id) return chart;
  } catch (err) {
    console.warn("Không lưu SEATING CHART lên sheet, lưu local:", err);
  }
  const items = seatCtrlEnsureLocal();
  const now = new Date().toISOString();
  let item = id ? items.find((entry: SeatCtrlChart) => entry.id === id) : null;
  if (!item) {
    item = { id: id || `seat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, title, active: true, createdAt: now, updatedAt: now, layout } as SeatCtrlChart;
    items.push(item);
  } else {
    item.title = title || item.title;
    item.layout = layout;
    (item as any).updatedAt = now;
  }
  items.forEach((entry: SeatCtrlChart) => { entry.active = entry.id === item!.id; });
  seatCtrlWriteLocal(items);
  return item;
}

function seatCtrlRows(rows: any[]) {
  return Array.from({ length: 7 }, (_, rowIndex) => {
    const row = Array.isArray(rows?.[rowIndex]) ? rows[rowIndex] : [];
    return Array.from({ length: 4 }, (_, seatIndex) => String(row[seatIndex] || "").trim());
  });
}

function seatCtrlPaint(seats: any) {
  const source = seats || SEAT_CTRL_DEFAULT;
  const state = { left: seatCtrlRows(source.left || []), right: seatCtrlRows(source.right || []) } as { left: string[][]; right: string[][] };
  document.querySelectorAll<HTMLElement>(`${SEAT_CTRL_WINDOW} .stable-seat-cell`).forEach((cell) => {
    const side = cell.dataset.side === "right" ? "right" : cell.dataset.side === "left" ? "left" : null;
    const row = Number(cell.dataset.row);
    const seat = Number(cell.dataset.seat);
    if (!side || !Number.isFinite(row) || !Number.isFinite(seat)) return;
    const name = state[side][row][seat] || "";
    cell.textContent = name || "Trống";
    cell.classList.toggle("empty", !name);
    cell.draggable = Boolean(name);
  });
  localStorage.setItem(SEAT_CTRL_SEATS_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent("a3k64:seating-changed"));
}

function seatCtrlApply(chart: SeatCtrlChart) {
  const layout = chart.layout || {};
  seatCtrlPaint(layout.seats || null);
  if (layout.room) localStorage.setItem(SEAT_CTRL_ROOM_KEY, JSON.stringify(layout.room));
  else localStorage.removeItem(SEAT_CTRL_ROOM_KEY);
  localStorage.setItem(SEAT_CTRL_CURRENT_KEY, chart.id);
  seatCtrlLastRenderKey = "";
  seatCtrlRender(true);
  seatCtrlToast(`Đã mở ${chart.title || "sơ đồ"}.`);
}

function injectSeatCtrlStyle() {
  if (document.getElementById(SEAT_CTRL_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SEAT_CTRL_STYLE_ID;
  style.textContent = `
    ${SEAT_CTRL_WINDOW} .seat-db-select{display:none!important;}
    ${SEAT_CTRL_WINDOW} .seat-ctrl-select{position:relative;min-width:180px;z-index:90;}
    ${SEAT_CTRL_WINDOW} .seat-ctrl-trigger{width:100%;height:40px;border:1px solid #334155;border-radius:14px;background:#111827;color:#f8fafc;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 13px;font-weight:1000;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 10px 24px rgba(0,0,0,.18)}
    ${SEAT_CTRL_WINDOW} .seat-ctrl-select.open .seat-ctrl-trigger,${SEAT_CTRL_WINDOW} .seat-ctrl-trigger:hover{border-color:var(--desktop-accent,#14b8a6)}
    ${SEAT_CTRL_WINDOW} .seat-ctrl-trigger svg{width:15px;height:15px;transition:transform .16s ease;opacity:.9}
    ${SEAT_CTRL_WINDOW} .seat-ctrl-select.open .seat-ctrl-trigger svg{transform:rotate(180deg)}
    ${SEAT_CTRL_WINDOW} .seat-ctrl-menu{position:absolute;left:0;right:0;top:calc(100% + 6px);padding:7px;border:1px solid #334155;border-radius:15px;background:#1f2937;box-shadow:0 24px 70px rgba(0,0,0,.36);display:none;overflow:hidden}
    ${SEAT_CTRL_WINDOW} .seat-ctrl-select.open .seat-ctrl-menu{display:grid;gap:5px}
    ${SEAT_CTRL_WINDOW} .seat-ctrl-option{height:36px;border:0;border-radius:10px;background:transparent;color:#f8fafc;text-align:left;padding:0 12px;font-weight:900;cursor:pointer}
    ${SEAT_CTRL_WINDOW} .seat-ctrl-option:hover{background:#334155}
    ${SEAT_CTRL_WINDOW} .seat-ctrl-option.active{background:#475569;color:#fff}
    ${SEAT_CTRL_WINDOW} .seat-ctrl-btn{height:40px;border:1px solid #334155;border-radius:14px;background:#111827;color:#f8fafc;padding:0 13px;font-weight:1000;cursor:pointer;white-space:nowrap;box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 10px 24px rgba(0,0,0,.18)}
    ${SEAT_CTRL_WINDOW} .seat-ctrl-btn:hover{border-color:var(--desktop-accent,#14b8a6)}
    ${SEAT_CTRL_WINDOW} .seat-ctrl-btn.primary{background:var(--desktop-accent,#14b8a6);border-color:transparent;color:#fff}
    .theme-light ${SEAT_CTRL_WINDOW} .seat-ctrl-trigger,.theme-light ${SEAT_CTRL_WINDOW} .seat-ctrl-btn{background:#fff;color:#0f172a;border-color:#cbd5e1;box-shadow:0 10px 24px rgba(15,23,42,.08)}
    .theme-light ${SEAT_CTRL_WINDOW} .seat-ctrl-menu{background:#fff;border-color:#cbd5e1;box-shadow:0 20px 55px rgba(15,23,42,.16)}
    .theme-light ${SEAT_CTRL_WINDOW} .seat-ctrl-option{color:#0f172a}.theme-light ${SEAT_CTRL_WINDOW} .seat-ctrl-option:hover{background:#e2e8f0}.theme-light ${SEAT_CTRL_WINDOW} .seat-ctrl-option.active{background:#cbd5e1}
    .seat-create-backdrop{position:fixed;inset:0;z-index:999999;background:rgba(15,23,42,.42);display:flex;align-items:center;justify-content:center;padding:18px;backdrop-filter:blur(8px)}
    .seat-create-modal{width:min(430px,100%);border:1px solid #cbd5e1;border-radius:24px;background:#fff;color:#0f172a;box-shadow:0 28px 90px rgba(15,23,42,.22);padding:18px;display:grid;gap:14px;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",Arial,sans-serif!important}
    .seat-create-modal h3{margin:0;font-size:20px;font-weight:1000}.seat-create-modal p{margin:0;color:#64748b;font-size:13px;line-height:1.45}.seat-create-modal label{display:grid;gap:7px;font-size:13px;font-weight:950}.seat-create-modal input{height:44px;border:1px solid #cbd5e1;border-radius:15px;background:#fff;color:#0f172a;padding:0 12px;font-weight:900;outline:none}.seat-create-modal input:focus{border-color:var(--desktop-accent,#14b8a6);box-shadow:0 0 0 3px color-mix(in srgb,var(--desktop-accent,#14b8a6) 18%,transparent)}.seat-create-actions{display:flex;justify-content:flex-end;gap:10px}.seat-create-actions button{height:38px;border:1px solid #cbd5e1;border-radius:13px;background:#fff;color:#0f172a;padding:0 14px;font-weight:1000;cursor:pointer}.seat-create-actions .primary{background:var(--desktop-accent,#14b8a6);border-color:transparent;color:#fff}.seat-create-actions button:disabled{opacity:.65;cursor:wait}
    .theme-dark .seat-create-modal{background:#0f172a;color:#f8fafc;border-color:#334155;box-shadow:0 28px 90px rgba(0,0,0,.42)}.theme-dark .seat-create-modal p{color:#94a3b8}.theme-dark .seat-create-modal input,.theme-dark .seat-create-actions button{background:#111827;color:#f8fafc;border-color:#334155}
  `;
  document.head.appendChild(style);
}

function seatCtrlCurrentId() {
  return localStorage.getItem(SEAT_CTRL_CURRENT_KEY) || seatCtrlCharts.find((item) => item.active)?.id || seatCtrlCharts[0]?.id || "";
}

function seatCtrlOpenCreateModal() {
  injectSeatCtrlStyle();
  document.querySelector(".seat-create-backdrop")?.remove();
  const suggested = `Sơ đồ ${seatCtrlCharts.length + 1}`;
  const backdrop = document.createElement("div");
  backdrop.className = "seat-create-backdrop";
  backdrop.innerHTML = `
    <div class="seat-create-modal">
      <div><h3>Tạo sơ đồ mới</h3><p>Sơ đồ mới sẽ mặc định ở chế độ Riêng tư cho đến khi bạn công bố.</p></div>
      <label>Tên sơ đồ mới<input data-name value="${seatCtrlEscape(suggested)}" maxlength="60" /></label>
      <div class="seat-create-actions"><button data-close>Huỷ</button><button class="primary" data-save>Tạo sơ đồ</button></div>
    </div>
  `;
  document.body.appendChild(backdrop);
  const input = backdrop.querySelector<HTMLInputElement>("[data-name]");
  const close = () => backdrop.remove();
  const save = async () => {
    const title = (input?.value || "").trim();
    if (!title) {
      input?.focus();
      return;
    }
    const saveBtn = backdrop.querySelector<HTMLButtonElement>("[data-save]");
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Đang tạo..."; }
    const chart = await seatCtrlSave(null, title);
    localStorage.setItem(SEAT_CTRL_CURRENT_KEY, chart.id);
    try {
      const key = `a3k64-seating-publish-lite-v1:${chart.id}`;
      localStorage.setItem(key, JSON.stringify({ chartId: chart.id, chartTitle: title, status: "private", publishAt: "", previewStudents: "" }));
    } catch {}
    seatCtrlLastRenderKey = "";
    await seatCtrlRefresh();
    seatCtrlToast("Đã tạo sơ đồ mới.");
    close();
  };
  backdrop.querySelector("[data-close]")?.addEventListener("click", close);
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });
  backdrop.querySelector("[data-save]")?.addEventListener("click", () => void save());
  input?.addEventListener("keydown", (event) => { if (event.key === "Enter") void save(); });
  setTimeout(() => { input?.focus(); input?.select(); }, 30);
}

function seatCtrlRender(force = false) {
  const tools = document.querySelector<HTMLElement>(`${SEAT_CTRL_WINDOW} .stable-seat-tools`);
  if (!tools) return;
  if (!force && tools.querySelector(".seat-ctrl-select.open")) return;

  const current = seatCtrlCurrentId();
  const renderKey = `${current}|${seatCtrlCharts.map((item) => `${item.id}:${item.title}`).join("|")}`;
  if (!force && renderKey === seatCtrlLastRenderKey && tools.querySelector(".seat-ctrl-select")) return;
  seatCtrlLastRenderKey = renderKey;

  tools.querySelector(".seat-ctrl-select")?.remove();
  tools.querySelectorAll(".seat-ctrl-btn").forEach((node) => node.remove());

  const currentTitle = seatCtrlCharts.find((item) => item.id === current)?.title || seatCtrlCharts[0]?.title || "Sơ đồ";
  const select = document.createElement("div");
  select.className = "seat-ctrl-select";
  select.innerHTML = `<button type="button" class="seat-ctrl-trigger"><span>${seatCtrlEscape(currentTitle)}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button><div class="seat-ctrl-menu">${seatCtrlCharts.map((item) => `<button type="button" class="seat-ctrl-option ${item.id === current ? "active" : ""}" data-id="${seatCtrlEscape(item.id)}">${seatCtrlEscape(item.title || "Sơ đồ")}</button>`).join("")}</div>`;
  select.querySelector(".seat-ctrl-trigger")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if ("stopImmediatePropagation" in event) event.stopImmediatePropagation();
    select.classList.toggle("open");
  });
  select.querySelectorAll<HTMLButtonElement>(".seat-ctrl-option").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if ("stopImmediatePropagation" in event) event.stopImmediatePropagation();
      const id = button.dataset.id || "";
      select.classList.remove("open");
      const chart = await seatCtrlGet(id);
      if (!chart) return seatCtrlToast("Không tìm thấy sơ đồ này.");
      seatCtrlApply(chart);
    });
  });

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "seat-ctrl-btn primary";
  saveBtn.textContent = "Lưu sơ đồ";
  saveBtn.addEventListener("click", async () => {
    const id = seatCtrlCurrentId();
    const title = seatCtrlCharts.find((item) => item.id === id)?.title || "Sơ đồ hiện tại";
    const chart = await seatCtrlSave(id, title);
    localStorage.setItem(SEAT_CTRL_CURRENT_KEY, chart.id);
    seatCtrlLastRenderKey = "";
    await seatCtrlRefresh();
    seatCtrlToast("Đã lưu sơ đồ.");
  });

  const newBtn = document.createElement("button");
  newBtn.type = "button";
  newBtn.className = "seat-ctrl-btn";
  newBtn.textContent = "Tạo sơ đồ mới";
  newBtn.addEventListener("click", () => seatCtrlOpenCreateModal());

  const search = tools.querySelector("input");
  tools.insertBefore(newBtn, search || tools.firstChild);
  tools.insertBefore(saveBtn, newBtn);
  tools.insertBefore(select, saveBtn);
}

async function seatCtrlRefresh() {
  seatCtrlCharts = await seatCtrlList();
  seatCtrlLoaded = true;
  seatCtrlLastRenderKey = "";
  seatCtrlRender(true);
}

function seatCtrlBindReset() {
  if (seatCtrlBound) return;
  seatCtrlBound = true;
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (!target?.matches?.(`${SEAT_CTRL_WINDOW} [data-tool='reset']`)) return;
    event.preventDefault();
    event.stopPropagation();
    if ("stopImmediatePropagation" in event) event.stopImmediatePropagation();
    localStorage.removeItem(SEAT_CTRL_ROOM_KEY);
    seatCtrlPaint(SEAT_CTRL_DEFAULT);
    seatCtrlToast("Đã khôi phục sơ đồ mặc định.");
  }, true);
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (!target?.closest?.(`${SEAT_CTRL_WINDOW} .seat-ctrl-select`)) document.querySelector(`${SEAT_CTRL_WINDOW} .seat-ctrl-select.open`)?.classList.remove("open");
  }, true);
}

function bootSeatRestoreControls() {
  injectSeatCtrlStyle();
  seatCtrlBindReset();
  void seatCtrlRefresh();
  seatCtrlLoop = window.setInterval(() => {
    if (document.querySelector(`${SEAT_CTRL_WINDOW} .stable-seat-tools`) && (seatCtrlLoaded || seatCtrlCharts.length) && !document.querySelector(`${SEAT_CTRL_WINDOW} .seat-ctrl-select.open`)) seatCtrlRender();
    seatCtrlCount += 1;
    if (seatCtrlCount > 240 && seatCtrlLoop) {
      clearInterval(seatCtrlLoop);
      seatCtrlLoop = 0;
    }
  }, 700);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootSeatRestoreControls);
else bootSeatRestoreControls();
