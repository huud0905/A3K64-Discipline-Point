const PRETTY_SEAT_WINDOW = "#a3k64-seating-window";
const PRETTY_SEAT_STYLE_ID = "a3k64-pretty-seat-select-style";
const PRETTY_SEAT_DB_KEY = "a3k64-seating-sheet-local-db-v1";
const PRETTY_SEAT_CURRENT_KEY = "a3k64-seating-sheet-current-id-v1";
const PRETTY_SEAT_SEATS_KEY = "a3k64-seating-map-v1";
const PRETTY_SEAT_ROOM_KEY = "a3k64-stable-room-slot-map-v1";
const PRETTY_GAS_URL = import.meta.env.VITE_GAS_WEB_APP_URL?.trim();
let prettySeatLoop = 0;
let prettySeatCount = 0;
let prettySelectCaptureBound = false;

type PrettySeatChart = {
  id: string;
  title: string;
  layout?: any;
};

function prettySeatToast(message: string) {
  document.querySelector(".pretty-seat-toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "pretty-seat-toast";
  toast.textContent = message;
  toast.style.cssText = "position:fixed;left:50%;top:74px;transform:translateX(-50%);z-index:999999;padding:10px 14px;border:1px solid #14b8a6;border-radius:14px;background:rgba(15,23,42,.96);color:#f8fafc;box-shadow:0 18px 55px rgba(0,0,0,.35);font-weight:900;font-size:14px";
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 1600);
}

function prettyEscape(value: string) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
}

function prettyGas(action: string, payload?: unknown): Promise<any | null> {
  if (!PRETTY_GAS_URL) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const callbackName = `__a3k64PrettySeat_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const url = new URL(PRETTY_GAS_URL);
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

function prettyLocalChart(id: string): PrettySeatChart | null {
  try {
    const db = JSON.parse(localStorage.getItem(PRETTY_SEAT_DB_KEY) || "{}");
    const items = Array.isArray(db.items) ? db.items : [];
    return items.find((item: PrettySeatChart) => item.id === id) || null;
  } catch {
    return null;
  }
}

async function prettyGetChart(id: string): Promise<PrettySeatChart | null> {
  try {
    const response = await prettyGas("getSeatingChart", { id });
    const chart = response?.chart || response?.data?.chart;
    if (chart?.layout) return chart;
  } catch (error) {
    console.warn("Không mở được sơ đồ từ sheet, dùng local:", error);
  }
  return prettyLocalChart(id);
}

function prettyNormalizeRows(rows: any[]) {
  const out = Array.from({ length: 7 }, (_, rowIndex) => {
    const row = Array.isArray(rows?.[rowIndex]) ? rows[rowIndex] : [];
    return Array.from({ length: 4 }, (_, seatIndex) => String(row[seatIndex] || "").trim());
  });
  return out;
}

function prettyPaintSeats(seats: any) {
  if (!seats) return;
  const state = {
    left: prettyNormalizeRows(seats.left || []),
    right: prettyNormalizeRows(seats.right || []),
  } as { left: string[][]; right: string[][] };
  document.querySelectorAll<HTMLElement>(`${PRETTY_SEAT_WINDOW} .stable-seat-cell`).forEach((cell) => {
    const side = cell.dataset.side === "right" ? "right" : cell.dataset.side === "left" ? "left" : null;
    const row = Number(cell.dataset.row);
    const seat = Number(cell.dataset.seat);
    if (!side || !Number.isFinite(row) || !Number.isFinite(seat)) return;
    const name = state[side][row][seat] || "";
    cell.textContent = name || "Trống";
    cell.classList.toggle("empty", !name);
    cell.draggable = Boolean(name);
  });
  localStorage.setItem(PRETTY_SEAT_SEATS_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent("a3k64:seating-changed"));
}

function prettyApplyChart(chart: PrettySeatChart) {
  const layout = chart.layout || {};
  if (layout.seats) prettyPaintSeats(layout.seats);
  else localStorage.removeItem(PRETTY_SEAT_SEATS_KEY);
  if (layout.room) localStorage.setItem(PRETTY_SEAT_ROOM_KEY, JSON.stringify(layout.room));
  else localStorage.removeItem(PRETTY_SEAT_ROOM_KEY);
  localStorage.setItem(PRETTY_SEAT_CURRENT_KEY, chart.id);
  const select = document.querySelector<HTMLSelectElement>(`${PRETTY_SEAT_WINDOW} .seat-db-select`);
  if (select) select.value = chart.id;
  syncPrettySelect();
  prettySeatToast(`Đã mở ${chart.title || "sơ đồ"}.`);
}

function injectPrettySeatStyle() {
  if (document.getElementById(PRETTY_SEAT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = PRETTY_SEAT_STYLE_ID;
  style.textContent = `
    ${PRETTY_SEAT_WINDOW} .seat-db-select{display:none!important;}
    ${PRETTY_SEAT_WINDOW} .pretty-seat-select{position:relative;min-width:180px;z-index:80;}
    ${PRETTY_SEAT_WINDOW} .pretty-seat-trigger{
      width:100%;height:40px;border:1px solid #334155;border-radius:14px;background:#111827;color:#f8fafc;
      display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 13px;font-weight:1000;cursor:pointer;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 10px 24px rgba(0,0,0,.18);
    }
    ${PRETTY_SEAT_WINDOW} .pretty-seat-trigger:hover,${PRETTY_SEAT_WINDOW} .pretty-seat-select.open .pretty-seat-trigger{border-color:var(--desktop-accent,#14b8a6);}
    ${PRETTY_SEAT_WINDOW} .pretty-seat-trigger svg{width:15px;height:15px;transition:transform .16s ease;opacity:.9;}
    ${PRETTY_SEAT_WINDOW} .pretty-seat-select.open .pretty-seat-trigger svg{transform:rotate(180deg);}
    ${PRETTY_SEAT_WINDOW} .pretty-seat-menu{
      position:absolute;left:0;right:0;top:calc(100% + 6px);padding:7px;border:1px solid #334155;border-radius:15px;background:#1f2937;
      box-shadow:0 24px 70px rgba(0,0,0,.36);display:none;overflow:hidden;
    }
    ${PRETTY_SEAT_WINDOW} .pretty-seat-select.open .pretty-seat-menu{display:grid;gap:5px;}
    ${PRETTY_SEAT_WINDOW} .pretty-seat-option{
      height:36px;border:0;border-radius:10px;background:transparent;color:#f8fafc;text-align:left;padding:0 12px;font-weight:900;cursor:pointer;
    }
    ${PRETTY_SEAT_WINDOW} .pretty-seat-option:hover{background:#334155;}
    ${PRETTY_SEAT_WINDOW} .pretty-seat-option.active{background:#475569;color:#fff;}
    .theme-light ${PRETTY_SEAT_WINDOW} .pretty-seat-trigger{background:#fff;color:#0f172a;border-color:#cbd5e1;}
    .theme-light ${PRETTY_SEAT_WINDOW} .pretty-seat-menu{background:#fff;border-color:#cbd5e1;box-shadow:0 20px 55px rgba(15,23,42,.16);}
    .theme-light ${PRETTY_SEAT_WINDOW} .pretty-seat-option{color:#0f172a;}
    .theme-light ${PRETTY_SEAT_WINDOW} .pretty-seat-option:hover{background:#e2e8f0;}
    .theme-light ${PRETTY_SEAT_WINDOW} .pretty-seat-option.active{background:#cbd5e1;}
  `;
  document.head.appendChild(style);
}

function selectOptions() {
  const select = document.querySelector<HTMLSelectElement>(`${PRETTY_SEAT_WINDOW} .seat-db-select`);
  if (!select) return [];
  return Array.from(select.options).map((option) => ({ id: option.value, title: option.textContent || "Sơ đồ" }));
}

function currentSelectId() {
  const select = document.querySelector<HTMLSelectElement>(`${PRETTY_SEAT_WINDOW} .seat-db-select`);
  return select?.value || localStorage.getItem(PRETTY_SEAT_CURRENT_KEY) || "";
}

function syncPrettySelect() {
  const tools = document.querySelector<HTMLElement>(`${PRETTY_SEAT_WINDOW} .stable-seat-tools`);
  const select = document.querySelector<HTMLSelectElement>(`${PRETTY_SEAT_WINDOW} .seat-db-select`);
  if (!tools || !select) return;
  let wrapper = tools.querySelector<HTMLElement>(".pretty-seat-select");
  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.className = "pretty-seat-select";
    wrapper.innerHTML = `<button type="button" class="pretty-seat-trigger"><span></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button><div class="pretty-seat-menu"></div>`;
    select.after(wrapper);
    wrapper.querySelector(".pretty-seat-trigger")?.addEventListener("click", (event) => {
      event.stopPropagation();
      wrapper!.classList.toggle("open");
    });
  }
  const current = currentSelectId();
  const options = selectOptions();
  const currentTitle = options.find((item) => item.id === current)?.title || options[0]?.title || "Sơ đồ";
  const label = wrapper.querySelector<HTMLElement>(".pretty-seat-trigger span");
  const menu = wrapper.querySelector<HTMLElement>(".pretty-seat-menu");
  if (label) label.textContent = currentTitle;
  if (!menu) return;
  menu.innerHTML = options.map((item) => `<button type="button" class="pretty-seat-option ${item.id === current ? "active" : ""}" data-id="${prettyEscape(item.id)}">${prettyEscape(item.title)}</button>`).join("");
  menu.querySelectorAll<HTMLButtonElement>(".pretty-seat-option").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      wrapper!.classList.remove("open");
      const id = button.dataset.id || "";
      if (!id) return;
      const chart = await prettyGetChart(id);
      if (!chart) return prettySeatToast("Không tìm thấy sơ đồ này.");
      prettyApplyChart(chart);
    });
  });
}

function bindPrettyChangeCapture() {
  if (prettySelectCaptureBound) return;
  prettySelectCaptureBound = true;
  document.addEventListener("change", async (event) => {
    const target = event.target as HTMLSelectElement | null;
    if (!target?.matches?.(`${PRETTY_SEAT_WINDOW} .seat-db-select`)) return;
    event.preventDefault();
    event.stopPropagation();
    if ("stopImmediatePropagation" in event) event.stopImmediatePropagation();
    const chart = await prettyGetChart(target.value);
    if (chart) prettyApplyChart(chart);
  }, true);
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (!target?.closest?.(`${PRETTY_SEAT_WINDOW} .pretty-seat-select`)) {
      document.querySelector(`${PRETTY_SEAT_WINDOW} .pretty-seat-select.open`)?.classList.remove("open");
    }
  }, true);
}

function bootPrettySeatSelect() {
  injectPrettySeatStyle();
  bindPrettyChangeCapture();
  const tick = () => syncPrettySelect();
  tick();
  prettySeatLoop = window.setInterval(() => {
    tick();
    prettySeatCount += 1;
    if (prettySeatCount > 180 && prettySeatLoop) {
      clearInterval(prettySeatLoop);
      prettySeatLoop = 0;
    }
  }, 500);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootPrettySeatSelect);
else bootPrettySeatSelect();
