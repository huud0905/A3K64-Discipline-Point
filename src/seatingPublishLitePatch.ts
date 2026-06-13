const SEAT_PUB_LITE_WINDOW = "#a3k64-seating-window";
const SEAT_PUB_LITE_STYLE_ID = "a3k64-seating-publish-lite-style";
const SEAT_PUB_LITE_KEY = "a3k64-seating-publish-lite-v1";
const SEAT_PUB_LITE_GAS_URL = String(import.meta.env.VITE_GAS_WEB_APP_URL || "").trim();
let seatPubLiteBooted = false;

type SeatPubLiteStatus = "private" | "preview" | "published";

type SeatPubLiteConfig = {
  status: SeatPubLiteStatus;
  publishAt: string;
  previewStudents: string;
  updatedAt?: string;
  updatedBy?: string;
};

function seatPubLiteReadLocal(): SeatPubLiteConfig {
  try {
    const data = JSON.parse(localStorage.getItem(SEAT_PUB_LITE_KEY) || "{}");
    return {
      status: ["private", "preview", "published"].includes(data.status) ? data.status : "private",
      publishAt: String(data.publishAt || ""),
      previewStudents: String(data.previewStudents || ""),
      updatedAt: data.updatedAt,
      updatedBy: data.updatedBy,
    };
  } catch {
    return { status: "private", publishAt: "", previewStudents: "" };
  }
}

function seatPubLiteSaveLocal(data: SeatPubLiteConfig) {
  localStorage.setItem(SEAT_PUB_LITE_KEY, JSON.stringify(data));
}

function seatPubLiteActor() {
  try {
    const session = JSON.parse(localStorage.getItem("a3k64-login-session-v1") || "null");
    const user = session?.user || session || {};
    return {
      name: String(user.name || user.fullName || user.studentName || user.displayName || user.hoTen || user.username || user.email || ""),
      email: String(user.email || ""),
      role: String(user.role || user.userRole || ""),
    };
  } catch {
    return { name: "", email: "", role: "" };
  }
}

function seatPubLiteGas(action: string, payload?: unknown): Promise<any | null> {
  if (!SEAT_PUB_LITE_GAS_URL) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const callbackName = `__a3k64SeatPubLite_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const callbacks = window as typeof window & Record<string, unknown>;
    const script = document.createElement("script");
    const url = new URL(SEAT_PUB_LITE_GAS_URL);
    let done = false;
    let timeout = 0;

    url.searchParams.set("action", action);
    url.searchParams.set("callback", callbackName);
    url.searchParams.set("t", String(Date.now()));
    if (payload !== undefined) url.searchParams.set("payload", JSON.stringify(payload));

    callbacks[callbackName] = (json: any) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      delete callbacks[callbackName];
      script.remove();
      if (json?.ok === false || json?.data?.ok === false) reject(new Error(String(json.error || json.data?.error || "Backend lỗi")));
      else resolve(json?.data || json);
    };

    script.onerror = () => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      delete callbacks[callbackName];
      script.remove();
      reject(new Error("Không gọi được Apps Script"));
    };

    timeout = window.setTimeout(() => {
      if (done) return;
      done = true;
      delete callbacks[callbackName];
      script.remove();
      reject(new Error("Apps Script phản hồi quá lâu"));
    }, 10000);

    script.src = url.toString();
    document.head.appendChild(script);
  });
}

function seatPubLiteNormalizeConfig(raw: any): SeatPubLiteConfig | null {
  const source = raw?.access || raw?.data?.access || raw?.config || raw?.data?.config || raw;
  if (!source || !["private", "preview", "published"].includes(source.status)) return null;
  return {
    status: source.status,
    publishAt: String(source.publishAt || source.publish_at || ""),
    previewStudents: String(source.previewStudents || source.preview_students || ""),
    updatedAt: source.updatedAt || source.updated_at,
    updatedBy: source.updatedBy || source.updated_by,
  };
}

async function seatPubLiteLoad(): Promise<SeatPubLiteConfig> {
  const local = seatPubLiteReadLocal();
  try {
    const response = await seatPubLiteGas("getSeatingAccess");
    const config = seatPubLiteNormalizeConfig(response);
    if (config) {
      seatPubLiteSaveLocal(config);
      return config;
    }
  } catch (error) {
    console.warn("getSeatingAccess chưa sẵn sàng, dùng local:", error);
  }
  return local;
}

async function seatPubLiteSave(data: SeatPubLiteConfig): Promise<SeatPubLiteConfig> {
  const next = { ...data, updatedAt: new Date().toISOString(), updatedBy: seatPubLiteActor().name };
  seatPubLiteSaveLocal(next);
  try {
    const response = await seatPubLiteGas("saveSeatingAccess", { ...next, actor: seatPubLiteActor() });
    const config = seatPubLiteNormalizeConfig(response);
    if (config) {
      seatPubLiteSaveLocal(config);
      return config;
    }
  } catch (error) {
    console.warn("saveSeatingAccess chưa sẵn sàng, đã lưu local:", error);
  }
  return next;
}

function seatPubLiteRole() {
  try {
    const session = JSON.parse(localStorage.getItem("a3k64-login-session-v1") || "null");
    const user = session?.user || session || {};
    const role = String(user.role || user.userRole || "").toLowerCase();
    if (role.includes("gvcn") || role.includes("lop_truong") || role.includes("bi_thu")) return "admin";
  } catch {}
  return "viewer";
}

function injectSeatPubLiteStyle() {
  if (document.getElementById(SEAT_PUB_LITE_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SEAT_PUB_LITE_STYLE_ID;
  style.textContent = `
    ${SEAT_PUB_LITE_WINDOW} .seat-pub-lite-btn{height:40px;border:1px solid rgba(148,163,184,.45);border-radius:14px;background:#fff;color:#0f172a;padding:0 13px;font-weight:1000;cursor:pointer;white-space:nowrap;box-shadow:0 10px 24px rgba(15,23,42,.08)}
    ${SEAT_PUB_LITE_WINDOW} .seat-pub-lite-btn:hover{border-color:var(--desktop-accent,#14b8a6)}
    .theme-dark ${SEAT_PUB_LITE_WINDOW} .seat-pub-lite-btn{background:#111827;color:#f8fafc;border-color:#334155;box-shadow:0 12px 28px rgba(0,0,0,.2)}
    .seat-pub-lite-backdrop{position:fixed;inset:0;z-index:999999;background:rgba(15,23,42,.42);display:flex;align-items:center;justify-content:center;padding:18px;backdrop-filter:blur(8px)}
    .seat-pub-lite-modal{width:min(560px,100%);border:1px solid #cbd5e1;border-radius:24px;background:#fff;color:#0f172a;box-shadow:0 28px 90px rgba(15,23,42,.2);padding:18px;display:grid;gap:14px;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",Arial,sans-serif!important}
    .seat-pub-lite-modal h3{margin:0;font-size:20px;font-weight:1000}.seat-pub-lite-modal p{margin:0;color:#64748b;font-size:13px;line-height:1.45}.seat-pub-lite-meta{font-size:12px;color:#64748b;font-weight:800}
    .seat-pub-lite-grid{display:grid;gap:10px}.seat-pub-lite-label{display:grid;gap:6px;font-weight:950;font-size:13px}.seat-pub-lite-label input,.seat-pub-lite-label textarea{min-height:44px;border:1px solid #cbd5e1;border-radius:15px;background:#fff;color:#0f172a;padding:10px 12px;font-weight:800;outline:none}.seat-pub-lite-label textarea{min-height:112px;resize:vertical;line-height:1.45;font-weight:760}.seat-pub-lite-label input:focus,.seat-pub-lite-label textarea:focus{border-color:var(--desktop-accent,#14b8a6);box-shadow:0 0 0 3px color-mix(in srgb,var(--desktop-accent,#14b8a6) 18%,transparent)}
    .seat-pub-lite-select{position:relative}.seat-pub-lite-trigger{height:44px;border:1px solid #cbd5e1;border-radius:15px;background:#fff;color:#0f172a;display:flex;align-items:center;justify-content:space-between;padding:0 13px;font-weight:950;cursor:pointer}.seat-pub-lite-menu{position:absolute;left:0;right:0;top:calc(100% + 7px);display:none;gap:5px;padding:7px;border:1px solid #cbd5e1;border-radius:16px;background:#fff;box-shadow:0 22px 62px rgba(15,23,42,.18);z-index:3}.seat-pub-lite-select.open .seat-pub-lite-menu{display:grid}.seat-pub-lite-option{height:36px;border:0;border-radius:11px;background:transparent;color:#0f172a;text-align:left;padding:0 12px;font-weight:900;cursor:pointer}.seat-pub-lite-option:hover,.seat-pub-lite-option.active{background:#dbeafe}
    .seat-pub-lite-actions{display:flex;justify-content:flex-end;gap:10px}.seat-pub-lite-actions button{height:38px;border:1px solid #cbd5e1;border-radius:13px;background:#fff;color:#0f172a;padding:0 14px;font-weight:1000;cursor:pointer}.seat-pub-lite-actions .primary{background:var(--desktop-accent,#14b8a6);border-color:transparent;color:#fff}.seat-pub-lite-actions button:disabled{opacity:.65;cursor:wait}
    .theme-dark .seat-pub-lite-modal{background:#0f172a;color:#f8fafc;border-color:#334155;box-shadow:0 28px 90px rgba(0,0,0,.42)}.theme-dark .seat-pub-lite-modal p,.theme-dark .seat-pub-lite-meta{color:#94a3b8}.theme-dark .seat-pub-lite-label input,.theme-dark .seat-pub-lite-label textarea,.theme-dark .seat-pub-lite-trigger,.theme-dark .seat-pub-lite-actions button{background:#111827;color:#f8fafc;border-color:#334155}.theme-dark .seat-pub-lite-menu{background:#1f2937;border-color:#334155}.theme-dark .seat-pub-lite-option{color:#f8fafc}.theme-dark .seat-pub-lite-option:hover,.theme-dark .seat-pub-lite-option.active{background:#334155}
  `;
  document.head.appendChild(style);
}

function statusText(value: SeatPubLiteStatus) {
  if (value === "preview") return "Xem trước";
  if (value === "published") return "Công bố ngay";
  return "Riêng tư";
}

function formatMeta(config: SeatPubLiteConfig) {
  if (!config.updatedAt && !config.updatedBy) return "";
  const parts = [];
  if (config.updatedBy) parts.push(`Người lưu: ${config.updatedBy}`);
  if (config.updatedAt) parts.push(`Lúc: ${new Date(config.updatedAt).toLocaleString("vi-VN")}`);
  return parts.join(" • ");
}

function openSeatPubLiteModal() {
  injectSeatPubLiteStyle();
  let current = seatPubLiteReadLocal();
  document.querySelector(".seat-pub-lite-backdrop")?.remove();
  let status = current.status;
  const backdrop = document.createElement("div");
  backdrop.className = "seat-pub-lite-backdrop";
  backdrop.innerHTML = `
    <div class="seat-pub-lite-modal">
      <div><h3>Cài đặt công bố sơ đồ</h3><p>Lưu vào sheet SEATING CHART nếu backend đã deploy. Nếu chưa deploy thì app vẫn lưu tạm trên máy.</p><div class="seat-pub-lite-meta">${formatMeta(current)}</div></div>
      <div class="seat-pub-lite-grid">
        <label class="seat-pub-lite-label">Trạng thái
          <div class="seat-pub-lite-select"><button type="button" class="seat-pub-lite-trigger"><span>${statusText(status)}</span><span>⌄</span></button><div class="seat-pub-lite-menu"><button type="button" class="seat-pub-lite-option" data-value="private">Riêng tư</button><button type="button" class="seat-pub-lite-option" data-value="preview">Xem trước</button><button type="button" class="seat-pub-lite-option" data-value="published">Công bố ngay</button></div></div>
        </label>
        <label class="seat-pub-lite-label">Giờ mở cho toàn lớp
          <input data-pub-at type="datetime-local" value="${current.publishAt ? new Date(current.publishAt).toISOString().slice(0, 16) : ""}" />
        </label>
        <label class="seat-pub-lite-label">Học sinh được xem trước <span style="font-weight:700;color:#94a3b8">mỗi dòng 1 tên hoặc Gmail</span>
          <textarea data-preview placeholder="Ví dụ:\nĐinh Mạnh Hữu\nhuud09052009@gmail.com">${current.previewStudents}</textarea>
        </label>
      </div>
      <div class="seat-pub-lite-actions"><button data-close>Huỷ</button><button class="primary" data-save>Lưu cài đặt</button></div>
    </div>
  `;
  document.body.appendChild(backdrop);
  const select = backdrop.querySelector<HTMLElement>(".seat-pub-lite-select");
  const triggerText = backdrop.querySelector<HTMLElement>(".seat-pub-lite-trigger span");
  const pubAtInput = backdrop.querySelector<HTMLInputElement>("[data-pub-at]");
  const previewInput = backdrop.querySelector<HTMLTextAreaElement>("[data-preview]");
  const meta = backdrop.querySelector<HTMLElement>(".seat-pub-lite-meta");
  const sync = () => {
    if (triggerText) triggerText.textContent = statusText(status);
    backdrop.querySelectorAll<HTMLElement>(".seat-pub-lite-option").forEach((node) => node.classList.toggle("active", node.dataset.value === status));
  };
  sync();

  seatPubLiteLoad().then((config) => {
    current = config;
    status = config.status;
    if (pubAtInput) pubAtInput.value = config.publishAt ? new Date(config.publishAt).toISOString().slice(0, 16) : "";
    if (previewInput) previewInput.value = config.previewStudents;
    if (meta) meta.textContent = formatMeta(config);
    sync();
  });

  backdrop.querySelector(".seat-pub-lite-trigger")?.addEventListener("click", (event) => {
    event.preventDefault();
    select?.classList.toggle("open");
  });
  backdrop.querySelectorAll<HTMLElement>(".seat-pub-lite-option").forEach((option) => {
    option.addEventListener("click", () => {
      status = (option.dataset.value || "private") as SeatPubLiteStatus;
      select?.classList.remove("open");
      sync();
    });
  });
  const close = () => backdrop.remove();
  backdrop.querySelector("[data-close]")?.addEventListener("click", close);
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });
  backdrop.querySelector<HTMLButtonElement>("[data-save]")?.addEventListener("click", async () => {
    const saveBtn = backdrop.querySelector<HTMLButtonElement>("[data-save]");
    const raw = (pubAtInput?.value || "").trim();
    const preview = previewInput?.value || "";
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Đang lưu..."; }
    const saved = await seatPubLiteSave({ status, publishAt: raw ? new Date(raw).toISOString() : "", previewStudents: preview });
    if (meta) meta.textContent = formatMeta(saved);
    close();
  });
}

function seatPubLiteTick() {
  injectSeatPubLiteStyle();
  if (seatPubLiteRole() !== "admin") return;
  const tools = document.querySelector<HTMLElement>(`${SEAT_PUB_LITE_WINDOW} .stable-seat-tools`);
  if (!tools || tools.querySelector("[data-seat-pub-lite]")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "seat-pub-lite-btn";
  btn.dataset.seatPubLite = "1";
  btn.textContent = "Công bố";
  btn.addEventListener("click", openSeatPubLiteModal);
  const search = tools.querySelector("input");
  tools.insertBefore(btn, search || tools.firstChild);
}

function bootSeatPubLite() {
  if (seatPubLiteBooted) return;
  seatPubLiteBooted = true;
  seatPubLiteTick();
  const timer = window.setInterval(() => {
    seatPubLiteTick();
    if (document.querySelector(`${SEAT_PUB_LITE_WINDOW} [data-seat-pub-lite]`)) clearInterval(timer);
  }, 500);
  window.setTimeout(() => clearInterval(timer), 12000);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootSeatPubLite);
else bootSeatPubLite();

export {};
