const SEAT_ACCESS_WINDOW = "#a3k64-seating-window";
const SEAT_ACCESS_STYLE_ID = "a3k64-seating-publish-access-style";
const SEAT_ACCESS_LOCAL_KEY = "a3k64-seating-access-v1";
const SEAT_ACCESS_GAS_URL = import.meta.env.VITE_GAS_WEB_APP_URL?.trim();
const SEAT_ACCESS_ADMIN_ROLES = ["lop_truong", "bi_thu", "gvcn"];

type SeatAccessStatus = "private" | "preview" | "published";

type SeatAccessConfig = {
  status: SeatAccessStatus;
  previewStudents: string;
  publishAt: string;
  updatedAt?: string;
  updatedBy?: string;
};

let seatAccessConfig: SeatAccessConfig = { status: "private", previewStudents: "", publishAt: "" };
let seatAccessLoop = 0;
let seatAccessCount = 0;
let seatAccessModalOpen = false;
let seatAccessBound = false;

function seatAccessNorm(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9@._-]+/g, " ")
    .trim();
}

function seatAccessCompact(value: unknown) {
  return seatAccessNorm(value).replace(/\s+/g, "");
}

function seatAccessRole() {
  try {
    const session = JSON.parse(localStorage.getItem("a3k64-login-session-v1") || "null");
    const user = session?.user || session || {};
    const role = seatAccessNorm(user.role || user.userRole || user.permission || "").replace(/[\s-]+/g, "_");
    if (role.includes("gvcn") || role.includes("giao_vien") || role.includes("admin")) return "gvcn";
    if (role.includes("lop_truong")) return "lop_truong";
    if (role.includes("bi_thu")) return "bi_thu";
    if (role.includes("to_truong")) return "to_truong";
    return role || "hoc_sinh";
  } catch {
    return "hoc_sinh";
  }
}

function seatAccessIsAdmin() {
  return SEAT_ACCESS_ADMIN_ROLES.includes(seatAccessRole());
}

function seatAccessUserStrings() {
  const out = new Set<string>();
  try {
    const session = JSON.parse(localStorage.getItem("a3k64-login-session-v1") || "null");
    const user = session?.user || session || {};
    [
      user.name,
      user.fullName,
      user.full_name,
      user.studentName,
      user.student_name,
      user.displayName,
      user.hoTen,
      user.hoten,
      user.username,
      user.email,
      session?.name,
      session?.username,
      session?.email,
    ].forEach((value) => {
      if (typeof value === "string" && value.trim()) out.add(value.trim());
    });
  } catch {}
  Array.from(out).forEach((value) => {
    const beforeAt = value.split("@")[0];
    if (beforeAt && beforeAt !== value) out.add(beforeAt);
    const noDigits = beforeAt.replace(/[0-9_.-]+/g, " ").trim();
    if (noDigits) out.add(noDigits);
    if (seatAccessCompact(value).includes("huu")) out.add("Hữu");
  });
  return Array.from(out);
}

function seatAccessLocalDefault(): SeatAccessConfig {
  try {
    const parsed = JSON.parse(localStorage.getItem(SEAT_ACCESS_LOCAL_KEY) || "{}");
    if (["private", "preview", "published"].includes(parsed.status)) {
      return {
        status: parsed.status,
        previewStudents: String(parsed.previewStudents || ""),
        publishAt: String(parsed.publishAt || ""),
        updatedAt: parsed.updatedAt,
        updatedBy: parsed.updatedBy,
      };
    }
  } catch {}
  return { status: "private", previewStudents: "", publishAt: "" };
}

function seatAccessSaveLocal(config: SeatAccessConfig) {
  localStorage.setItem(SEAT_ACCESS_LOCAL_KEY, JSON.stringify(config));
}

function seatAccessGas(action: string, payload?: unknown): Promise<any | null> {
  if (!SEAT_ACCESS_GAS_URL) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const callbackName = `__a3k64SeatAccess_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const url = new URL(SEAT_ACCESS_GAS_URL);
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

async function seatAccessFetch() {
  try {
    const response = await seatAccessGas("getSeatingAccess");
    const access = response?.access || response?.data?.access;
    if (access && ["private", "preview", "published"].includes(access.status)) {
      seatAccessConfig = {
        status: access.status,
        previewStudents: String(access.previewStudents || access.preview_students || ""),
        publishAt: String(access.publishAt || access.publish_at || ""),
        updatedAt: access.updatedAt || access.updated_at,
        updatedBy: access.updatedBy || access.updated_by,
      };
      seatAccessSaveLocal(seatAccessConfig);
      return;
    }
  } catch (error) {
    console.warn("getSeatingAccess chưa sẵn sàng, dùng local:", error);
  }
  seatAccessConfig = seatAccessLocalDefault();
}

async function seatAccessSave(config: SeatAccessConfig) {
  const next = {
    ...config,
    updatedAt: new Date().toISOString(),
    updatedBy: seatAccessUserStrings()[0] || "",
  };
  try {
    const response = await seatAccessGas("saveSeatingAccess", next);
    const access = response?.access || response?.data?.access;
    if (access && ["private", "preview", "published"].includes(access.status)) {
      seatAccessConfig = {
        status: access.status,
        previewStudents: String(access.previewStudents || access.preview_students || ""),
        publishAt: String(access.publishAt || access.publish_at || ""),
        updatedAt: access.updatedAt || access.updated_at,
        updatedBy: access.updatedBy || access.updated_by,
      };
      seatAccessSaveLocal(seatAccessConfig);
      return;
    }
  } catch (error) {
    console.warn("saveSeatingAccess chưa sẵn sàng, lưu local:", error);
  }
  seatAccessConfig = next;
  seatAccessSaveLocal(next);
}

function seatAccessPreviewTokens(config = seatAccessConfig) {
  return String(config.previewStudents || "")
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function seatAccessIsPreviewUser() {
  const tokens = seatAccessPreviewTokens().map(seatAccessCompact).filter(Boolean);
  if (!tokens.length) return false;
  const users = seatAccessUserStrings().map(seatAccessCompact).filter(Boolean);
  return users.some((user) => tokens.some((token) => user.includes(token) || token.includes(user)));
}

function seatAccessPublishDate() {
  if (!seatAccessConfig.publishAt) return null;
  const date = new Date(seatAccessConfig.publishAt);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function seatAccessCanView() {
  if (seatAccessIsAdmin()) return true;
  if (seatAccessConfig.status === "published") return true;
  const publishDate = seatAccessPublishDate();
  if (publishDate && Date.now() >= publishDate.getTime()) return true;
  if (seatAccessConfig.status === "preview" && seatAccessIsPreviewUser()) return true;
  return false;
}

function seatAccessCanEdit() {
  return seatAccessIsAdmin();
}

function seatAccessCountdownText() {
  const publishDate = seatAccessPublishDate();
  if (!publishDate) return "Chưa có lịch công bố.";
  const diff = Math.max(0, publishDate.getTime() - Date.now());
  const total = Math.floor(diff / 1000);
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `Mở sau ${h}:${m}:${s}`;
}

function seatAccessFormatPublish() {
  const date = seatAccessPublishDate();
  if (!date) return "Chưa đặt giờ mở";
  return date.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
}

function injectSeatAccessStyle() {
  if (document.getElementById(SEAT_ACCESS_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SEAT_ACCESS_STYLE_ID;
  style.textContent = `
    ${SEAT_ACCESS_WINDOW} .seat-access-btn{height:40px;border:1px solid #334155;border-radius:14px;background:#111827;color:#f8fafc;padding:0 13px;font-weight:1000;cursor:pointer;white-space:nowrap;box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 10px 24px rgba(0,0,0,.18)}
    ${SEAT_ACCESS_WINDOW} .seat-access-btn:hover{border-color:var(--desktop-accent,#14b8a6)}
    .theme-light ${SEAT_ACCESS_WINDOW} .seat-access-btn{background:#fff;color:#0f172a;border-color:#cbd5e1;box-shadow:0 10px 24px rgba(15,23,42,.08)}
    ${SEAT_ACCESS_WINDOW}.seat-view-only [data-tool='edit'],
    ${SEAT_ACCESS_WINDOW}.seat-view-only [data-tool='reset'],
    ${SEAT_ACCESS_WINDOW}.seat-view-only [data-seat-random],
    ${SEAT_ACCESS_WINDOW}.seat-view-only .seat-ctrl-btn,
    ${SEAT_ACCESS_WINDOW}.seat-view-only .seat-access-btn,
    ${SEAT_ACCESS_WINDOW}.seat-view-only .stable-seat-student-panel,
    ${SEAT_ACCESS_WINDOW}.seat-locked .stable-seat-tools button:not(.seat-access-btn),
    ${SEAT_ACCESS_WINDOW}.seat-locked .stable-seat-tools input,
    ${SEAT_ACCESS_WINDOW}.seat-locked .seat-ctrl-select,
    ${SEAT_ACCESS_WINDOW}.seat-locked .seat-ctrl-btn{display:none!important}
    ${SEAT_ACCESS_WINDOW}.seat-view-only .stable-seat-cell{cursor:default!important;pointer-events:auto!important}
    ${SEAT_ACCESS_WINDOW}.seat-view-only .stable-seat-student-card{pointer-events:none!important}
    ${SEAT_ACCESS_WINDOW} .seat-lock-panel{display:none;position:absolute;inset:76px 22px 22px;z-index:70;border:1px solid #334155;border-radius:22px;background:rgba(15,23,42,.94);color:#e2e8f0;align-items:center;justify-content:center;text-align:center;padding:24px;box-shadow:0 24px 80px rgba(0,0,0,.36);backdrop-filter:blur(12px)}
    ${SEAT_ACCESS_WINDOW}.seat-locked .seat-lock-panel{display:flex}
    ${SEAT_ACCESS_WINDOW} .seat-lock-card{max-width:460px;display:grid;gap:12px}
    ${SEAT_ACCESS_WINDOW} .seat-lock-title{font-size:24px;font-weight:1000;color:#fff}
    ${SEAT_ACCESS_WINDOW} .seat-lock-time{font-size:15px;color:#5eead4;font-weight:900}
    ${SEAT_ACCESS_WINDOW} .seat-lock-note{font-size:13px;color:#94a3b8;line-height:1.5}
    .theme-light ${SEAT_ACCESS_WINDOW} .seat-lock-panel{background:rgba(255,255,255,.94);color:#0f172a;border-color:#cbd5e1;box-shadow:0 24px 70px rgba(15,23,42,.18)}
    .theme-light ${SEAT_ACCESS_WINDOW} .seat-lock-title{color:#0f172a}.theme-light ${SEAT_ACCESS_WINDOW} .seat-lock-note{color:#64748b}
    .seat-access-modal-backdrop{position:fixed;inset:0;z-index:999999;background:rgba(2,6,23,.52);display:flex;align-items:center;justify-content:center;padding:18px;backdrop-filter:blur(8px)}
    .seat-access-modal{width:min(560px,100%);border:1px solid #334155;border-radius:22px;background:#0f172a;color:#e2e8f0;box-shadow:0 28px 90px rgba(0,0,0,.42);padding:18px;display:grid;gap:14px}
    .seat-access-modal h3{margin:0;font-size:20px}.seat-access-modal p{margin:0;color:#94a3b8;font-size:13px;line-height:1.45}
    .seat-access-grid{display:grid;gap:10px}.seat-access-label{display:grid;gap:6px;font-weight:900;font-size:13px}.seat-access-label input,.seat-access-label select,.seat-access-label textarea{border:1px solid #334155;border-radius:13px;background:#111827;color:#f8fafc;padding:10px 12px;font-weight:800;outline:none}.seat-access-label textarea{min-height:112px;resize:vertical;line-height:1.4}.seat-access-label input:focus,.seat-access-label select:focus,.seat-access-label textarea:focus{border-color:var(--desktop-accent,#14b8a6);box-shadow:0 0 0 3px color-mix(in srgb,var(--desktop-accent,#14b8a6) 18%,transparent)}
    .seat-access-actions{display:flex;justify-content:flex-end;gap:10px}.seat-access-actions button{height:38px;border:1px solid #334155;border-radius:13px;background:#111827;color:#f8fafc;padding:0 14px;font-weight:1000;cursor:pointer}.seat-access-actions .primary{background:var(--desktop-accent,#14b8a6);border-color:transparent;color:#fff}
    .theme-light .seat-access-modal{background:#fff;color:#0f172a;border-color:#cbd5e1;box-shadow:0 28px 90px rgba(15,23,42,.2)}.theme-light .seat-access-modal p{color:#64748b}.theme-light .seat-access-label input,.theme-light .seat-access-label select,.theme-light .seat-access-label textarea,.theme-light .seat-access-actions button{background:#fff;color:#0f172a;border-color:#cbd5e1}
  `;
  document.head.appendChild(style);
}

function seatAccessEnsureLockPanel() {
  const win = document.querySelector<HTMLElement>(SEAT_ACCESS_WINDOW);
  if (!win || win.querySelector(".seat-lock-panel")) return;
  const panel = document.createElement("div");
  panel.className = "seat-lock-panel";
  panel.innerHTML = `<div class="seat-lock-card"><div class="seat-lock-title">Sơ đồ chỗ ngồi chưa được công bố</div><div class="seat-lock-time"></div><div class="seat-lock-note">Bạn chưa nằm trong danh sách xem trước hoặc chưa đến giờ mở. Hãy quay lại sau.</div></div>`;
  win.appendChild(panel);
}

function seatAccessEnsureButton() {
  const tools = document.querySelector<HTMLElement>(`${SEAT_ACCESS_WINDOW} .stable-seat-tools`);
  if (!tools || tools.querySelector("[data-seat-access-settings]") || !seatAccessIsAdmin()) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "seat-access-btn";
  button.dataset.seatAccessSettings = "1";
  button.textContent = "Công bố";
  button.addEventListener("click", openSeatAccessModal);
  const search = tools.querySelector("input");
  tools.insertBefore(button, search || tools.firstChild);
}

function seatAccessApplyUi() {
  injectSeatAccessStyle();
  seatAccessEnsureLockPanel();
  seatAccessEnsureButton();
  const win = document.querySelector<HTMLElement>(SEAT_ACCESS_WINDOW);
  if (!win) return;
  const canView = seatAccessCanView();
  const canEdit = seatAccessCanEdit();
  win.classList.toggle("seat-locked", !canView);
  win.classList.toggle("seat-view-only", canView && !canEdit);
  win.classList.toggle("seat-edit-allowed", canEdit);
  const time = win.querySelector<HTMLElement>(".seat-lock-time");
  if (time) time.textContent = seatAccessCountdownText();
  document.body.classList.toggle("a3k64-seat-can-edit", canEdit);
  document.body.classList.toggle("a3k64-seat-view-only", canView && !canEdit);
}

function openSeatAccessModal() {
  if (seatAccessModalOpen) return;
  seatAccessModalOpen = true;
  document.querySelector(".seat-access-modal-backdrop")?.remove();
  const backdrop = document.createElement("div");
  backdrop.className = "seat-access-modal-backdrop";
  const publishValue = seatAccessConfig.publishAt ? new Date(seatAccessConfig.publishAt).toISOString().slice(0, 16) : "";
  backdrop.innerHTML = `
    <div class="seat-access-modal">
      <div><h3>Cài đặt công bố sơ đồ</h3><p>Chọn ai được xem trước và giờ mở cho toàn bộ học sinh.</p></div>
      <div class="seat-access-grid">
        <label class="seat-access-label">Trạng thái
          <select data-field="status">
            <option value="private">Riêng tư</option>
            <option value="preview">Xem trước</option>
            <option value="published">Công bố ngay</option>
          </select>
        </label>
        <label class="seat-access-label">Giờ mở cho toàn lớp
          <input data-field="publishAt" type="datetime-local" value="${publishValue}" />
        </label>
        <label class="seat-access-label">Học sinh được xem trước <span style="font-weight:700;color:#94a3b8">mỗi dòng 1 tên hoặc Gmail</span>
          <textarea data-field="previewStudents" placeholder="Ví dụ:\nĐinh Mạnh Hữu\nhuud09052009@gmail.com">${seatAccessConfig.previewStudents}</textarea>
        </label>
      </div>
      <div class="seat-access-actions"><button data-close>Huỷ</button><button class="primary" data-save>Lưu cài đặt</button></div>
    </div>
  `;
  document.body.appendChild(backdrop);
  const status = backdrop.querySelector<HTMLSelectElement>("[data-field='status']");
  if (status) status.value = seatAccessConfig.status;
  const close = () => {
    seatAccessModalOpen = false;
    backdrop.remove();
  };
  backdrop.querySelector("[data-close]")?.addEventListener("click", close);
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });
  backdrop.querySelector("[data-save]")?.addEventListener("click", async () => {
    const statusValue = backdrop.querySelector<HTMLSelectElement>("[data-field='status']")?.value as SeatAccessStatus || "private";
    const publishRaw = backdrop.querySelector<HTMLInputElement>("[data-field='publishAt']")?.value || "";
    const preview = backdrop.querySelector<HTMLTextAreaElement>("[data-field='previewStudents']")?.value || "";
    await seatAccessSave({ status: statusValue, publishAt: publishRaw ? new Date(publishRaw).toISOString() : "", previewStudents: preview });
    seatAccessApplyUi();
    close();
  });
}

function bindSeatAccess() {
  if (seatAccessBound) return;
  seatAccessBound = true;
  document.addEventListener("dragstart", (event) => { if (!seatAccessCanEdit() && (event.target as HTMLElement | null)?.closest?.(SEAT_ACCESS_WINDOW)) event.preventDefault(); }, true);
  document.addEventListener("drop", (event) => { if (!seatAccessCanEdit() && (event.target as HTMLElement | null)?.closest?.(SEAT_ACCESS_WINDOW)) event.preventDefault(); }, true);
}

async function bootSeatAccess() {
  bindSeatAccess();
  await seatAccessFetch();
  seatAccessApplyUi();
  seatAccessLoop = window.setInterval(async () => {
    if (seatAccessCount % 10 === 0) await seatAccessFetch();
    seatAccessApplyUi();
    seatAccessCount += 1;
    if (seatAccessCount > 3600 && seatAccessLoop) {
      clearInterval(seatAccessLoop);
      seatAccessLoop = 0;
    }
  }, 1000);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => void bootSeatAccess());
else void bootSeatAccess();
