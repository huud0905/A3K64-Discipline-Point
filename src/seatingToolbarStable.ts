const STB_WIN = "#a3k64-seating-window";
let stbReady = false;
let stbTimer = 0;

type StbMode = "admin" | "preview" | "viewer";

function stbActorRole() {
  try {
    const session = JSON.parse(localStorage.getItem("a3k64-login-session-v1") || "null");
    const user = session?.user || session || {};
    return String(user.role || user.userRole || "").toLowerCase();
  } catch {
    return "";
  }
}

function stbIsAdmin() {
  const role = stbActorRole().replace(/\s+/g, "_");
  return role.includes("gvcn") || role.includes("lop_truong") || role.includes("bi_thu") || role.includes("admin");
}

function stbMode(): StbMode {
  if (stbIsAdmin()) return "admin";
  if (document.documentElement.classList.contains("a3-seat-preview-editor")) return "preview";
  return "viewer";
}

function stbVisible() {
  const win = document.querySelector<HTMLElement>(STB_WIN);
  if (!win) return false;
  const rect = win.getBoundingClientRect();
  const css = getComputedStyle(win);
  return rect.width > 0 && rect.height > 0 && css.display !== "none" && css.visibility !== "hidden";
}

function stbInjectStyle() {
  if (document.getElementById("a3-seat-toolbar-stable-style")) return;
  const style = document.createElement("style");
  style.id = "a3-seat-toolbar-stable-style";
  style.textContent = `
    ${STB_WIN} .seat-pub-lite-btn.stb-admin-disabled,
    ${STB_WIN} .seat-ctrl-btn.stb-admin-disabled{
      opacity:.45!important;
      filter:grayscale(.25)!important;
      cursor:not-allowed!important;
      pointer-events:auto!important;
      background:#f1f5f9!important;
      color:#64748b!important;
      border-color:#cbd5e1!important;
    }
    .theme-dark ${STB_WIN} .seat-pub-lite-btn.stb-admin-disabled,
    html.a3-overlay-dark ${STB_WIN} .seat-pub-lite-btn.stb-admin-disabled{
      background:#111827!important;
      color:#64748b!important;
      border-color:#334155!important;
    }
    .stb-simple-field{display:grid;gap:8px}.stb-simple-field-title{font-size:13px;font-weight:950}.stb-simple-help{font-size:12px;color:#64748b;font-weight:700}.stb-simple-field textarea,.stb-simple-field input{min-height:44px;border:1px solid #cbd5e1;border-radius:16px;background:#fff;color:#0f172a;padding:10px 13px;font-weight:750;outline:none;line-height:1.45;font-family:inherit}.stb-simple-field textarea{min-height:110px;resize:vertical}.stb-simple-panel{border:1px solid #e2e8f0;border-radius:20px;background:#f8fafc;padding:14px;display:grid;gap:12px}.stb-simple-radio{display:flex;gap:10px;flex-wrap:wrap}.stb-simple-radio button{height:40px;border:1px solid #cbd5e1;border-radius:14px;background:#fff;color:#0f172a;padding:0 13px;font-weight:900;cursor:pointer}.stb-simple-radio button.active{background:color-mix(in srgb,var(--desktop-accent,#14b8a6) 16%,#fff);border-color:var(--desktop-accent,#14b8a6)}.stb-simple-check{display:flex;align-items:center;gap:10px;font-weight:950}.stb-simple-check input{width:18px;height:18px;accent-color:var(--desktop-accent,#14b8a6)}.theme-dark .stb-simple-panel,html.a3-overlay-dark .stb-simple-panel{background:#111827;border-color:#334155}.theme-dark .stb-simple-field textarea,.theme-dark .stb-simple-field input,.theme-dark .stb-simple-radio button,html.a3-overlay-dark .stb-simple-field textarea,html.a3-overlay-dark .stb-simple-field input,html.a3-overlay-dark .stb-simple-radio button{background:#111827;color:#f8fafc;border-color:#334155}
  `;
  document.head.appendChild(style);
}

function stbEscape(v: unknown) {
  return String(v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}

function stbLocalAccess() {
  const chartId = localStorage.getItem("a3k64-seating-sheet-current-id-v1") || "default";
  try {
    const data = JSON.parse(localStorage.getItem(`a3k64-seating-publish-lite-v1:${chartId}`) || "{}");
    return {
      status: String(data.status || "private"),
      preview: String(data.previewStudents || data.preview_students || ""),
      publishAt: String(data.publishAt || data.publish_at || ""),
    };
  } catch {
    return { status: "private", preview: "", publishAt: "" };
  }
}

function stbIsoToLocalInput(value: string) {
  if (!value) return "";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function stbOpenPublishModal() {
  document.querySelector(".seat-pub-lite-backdrop")?.remove();
  const access = stbLocalAccess();
  const uiMode = access.status === "private" ? "private" : "preview_publish";
  const publishEnabled = access.status === "published";
  const schedule = Boolean(access.publishAt);
  const backdrop = document.createElement("div");
  backdrop.className = "seat-pub-lite-backdrop";
  backdrop.innerHTML = `
    <div class="seat-pub-lite-modal" role="dialog" aria-modal="true">
      <div class="seat-pub-lite-head">
        <div class="seat-pub-lite-title"><h3>Cài đặt công bố sơ đồ</h3><p>${stbEscape(document.querySelector<HTMLElement>(`${STB_WIN} .seat-ctrl-trigger span`)?.textContent || "Sơ đồ hiện tại")}</p><div class="seat-pub-lite-meta">Bản ổn định: lưu bắt buộc lên backend.</div></div>
        <span class="seat-pub-lite-badge">${publishEnabled ? (schedule ? "Hẹn giờ công bố" : "Sẽ công bố") : uiMode === "preview_publish" ? "Xem trước" : "Riêng tư"}</span>
      </div>
      <div class="seat-pub-lite-grid">
        <div class="stb-simple-field">
          <div class="stb-simple-field-title">Trạng thái</div>
          <div class="seat-pub-lite-select">
            <button type="button" class="seat-pub-lite-trigger"><span>${uiMode === "preview_publish" ? "Xem trước + Công bố" : "Riêng tư"}</span><span>⌄</span></button>
            <div class="seat-pub-lite-menu"><button type="button" class="seat-pub-lite-option" data-value="private">Riêng tư</button><button type="button" class="seat-pub-lite-option" data-value="preview_publish">Xem trước + Công bố</button></div>
          </div>
        </div>
        <div class="stb-simple-field" data-preview-wrap style="display:${uiMode === "preview_publish" ? "grid" : "none"}">
          <div><div class="stb-simple-field-title">Danh sách xem trước</div><div class="stb-simple-help">Mỗi dòng 1 tên hoặc Gmail.</div></div>
          <textarea data-preview>${stbEscape(access.preview)}</textarea>
        </div>
        <div class="stb-simple-panel" data-publish-wrap style="display:${uiMode === "preview_publish" ? "grid" : "none"}">
          <label class="stb-simple-check"><input type="checkbox" data-publish-enabled ${publishEnabled ? "checked" : ""}/><span>Công bố sơ đồ</span></label>
          <div data-publish-inner style="display:${publishEnabled ? "grid" : "none"};gap:10px">
            <div class="stb-simple-field"><div class="stb-simple-field-title">Cách công bố</div><div class="stb-simple-radio"><button type="button" data-pub-mode="now" class="${schedule ? "" : "active"}">Công bố ngay</button><button type="button" data-pub-mode="schedule" class="${schedule ? "active" : ""}">Công bố theo hẹn giờ</button></div></div>
            <div class="stb-simple-field" data-pub-time-wrap style="display:${schedule ? "grid" : "none"}"><div class="stb-simple-field-title">Giờ công bố</div><input type="datetime-local" data-publish-at value="${stbIsoToLocalInput(access.publishAt)}" /></div>
          </div>
        </div>
      </div>
      <div class="seat-pub-lite-actions"><button type="button" data-close>Huỷ</button><button type="button" class="primary" data-save>Lưu cài đặt</button></div>
    </div>`;
  document.body.appendChild(backdrop);
  const sync = () => {
    const mode = backdrop.querySelector<HTMLElement>(".seat-pub-lite-trigger span")?.textContent?.includes("Xem trước") ? "preview_publish" : "private";
    const enabled = Boolean(backdrop.querySelector<HTMLInputElement>("[data-publish-enabled]")?.checked);
    const scheduleOn = backdrop.querySelector<HTMLElement>("[data-pub-mode='schedule']")?.classList.contains("active");
    const preview = backdrop.querySelector<HTMLElement>("[data-preview-wrap]");
    const publish = backdrop.querySelector<HTMLElement>("[data-publish-wrap]");
    const inner = backdrop.querySelector<HTMLElement>("[data-publish-inner]");
    const time = backdrop.querySelector<HTMLElement>("[data-pub-time-wrap]");
    if (preview) preview.style.display = mode === "preview_publish" ? "grid" : "none";
    if (publish) publish.style.display = mode === "preview_publish" ? "grid" : "none";
    if (inner) inner.style.display = mode === "preview_publish" && enabled ? "grid" : "none";
    if (time) time.style.display = mode === "preview_publish" && enabled && scheduleOn ? "grid" : "none";
  };
  backdrop.querySelector("[data-close]")?.addEventListener("click", () => backdrop.remove());
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) backdrop.remove(); if (!(e.target as HTMLElement).closest(".seat-pub-lite-select")) backdrop.querySelector(".seat-pub-lite-select")?.classList.remove("open"); });
  backdrop.querySelector(".seat-pub-lite-trigger")?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); backdrop.querySelector(".seat-pub-lite-select")?.classList.toggle("open"); });
  backdrop.querySelectorAll<HTMLElement>(".seat-pub-lite-option").forEach((op) => op.addEventListener("click", () => { const span = backdrop.querySelector<HTMLElement>(".seat-pub-lite-trigger span"); if (span) span.textContent = op.dataset.value === "preview_publish" ? "Xem trước + Công bố" : "Riêng tư"; if (op.dataset.value === "private") { const cb = backdrop.querySelector<HTMLInputElement>("[data-publish-enabled]"); if (cb) cb.checked = false; } backdrop.querySelector(".seat-pub-lite-select")?.classList.remove("open"); sync(); }));
  backdrop.querySelector<HTMLInputElement>("[data-publish-enabled]")?.addEventListener("change", sync);
  backdrop.querySelectorAll<HTMLElement>("[data-pub-mode]").forEach((b) => b.addEventListener("click", () => { backdrop.querySelectorAll<HTMLElement>("[data-pub-mode]").forEach((x) => x.classList.remove("active")); b.classList.add("active"); sync(); }));
}

function stbOpenManageModal() {
  document.querySelector(".seat-pub-lite-backdrop")?.remove();
  const backdrop = document.createElement("div");
  backdrop.className = "seat-pub-lite-backdrop";
  backdrop.innerHTML = `<div class="seat-pub-lite-modal"><div class="seat-pub-lite-title"><h3>Quản lý công bố</h3><p>${stbEscape(document.querySelector<HTMLElement>(`${STB_WIN} .seat-ctrl-trigger span`)?.textContent || "Sơ đồ hiện tại")}</p></div><div class="seat-pub-lite-manage-row"><div><div class="seat-pub-lite-manage-title">Trạng thái hiện tại</div><div class="seat-pub-lite-manage-sub">Dùng backend làm nguồn quyền xem.</div></div><span class="seat-pub-lite-status-pill">${stbEscape(stbLocalAccess().status)}</span></div><div class="seat-pub-lite-manage-actions"><button class="seat-pub-lite-mini-btn" data-edit>Sửa cài đặt</button><button class="seat-pub-lite-mini-btn primary" data-publish-now>Công bố ngay</button><button class="seat-pub-lite-mini-btn" data-preview>Chỉ xem trước</button><button class="seat-pub-lite-mini-btn" data-private>Đưa về riêng tư</button></div><div class="seat-pub-lite-actions"><button data-close>Đóng</button></div></div>`;
  document.body.appendChild(backdrop);
  backdrop.querySelector("[data-close]")?.addEventListener("click", () => backdrop.remove());
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) backdrop.remove(); });
  backdrop.querySelector("[data-edit]")?.addEventListener("click", () => { backdrop.remove(); stbOpenPublishModal(); });
}

function stbButton(label: string, adminOnly: boolean, onClick: () => void) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "seat-pub-lite-btn";
  btn.textContent = label;
  if (label === "Công bố") btn.dataset.seatPubLite = "stable";
  if (label === "QL") btn.dataset.seatPubLiteManage = "stable";
  if (adminOnly && stbMode() !== "admin") {
    btn.disabled = true;
    btn.classList.add("stb-admin-disabled");
    btn.title = "Chỉ quản trị viên được dùng công cụ này";
  } else {
    btn.addEventListener("click", onClick);
  }
  return btn;
}

function stbSyncToolbar() {
  stbInjectStyle();
  if (!stbVisible()) return;
  const mode = stbMode();
  const tools = document.querySelector<HTMLElement>(`${STB_WIN} .stable-seat-tools`);
  if (!tools) return;
  const shouldShow = mode === "admin" || mode === "preview";
  let pub = tools.querySelector<HTMLButtonElement>("[data-seat-pub-lite]");
  let manage = tools.querySelector<HTMLButtonElement>("[data-seat-pub-lite-manage]");
  if (!shouldShow) return;
  const search = tools.querySelector("input");
  if (!pub) {
    pub = stbButton("Công bố", true, stbOpenPublishModal);
    tools.insertBefore(pub, search || tools.firstChild);
  }
  if (!manage) {
    manage = stbButton("QL", true, stbOpenManageModal);
    tools.insertBefore(manage, search || tools.firstChild);
  }
  [pub, manage].forEach((btn) => {
    const disabled = mode !== "admin";
    btn.disabled = disabled;
    btn.classList.toggle("stb-admin-disabled", disabled);
    btn.title = disabled ? "Chỉ quản trị viên được dùng công cụ này" : "";
  });
}

function stbBoot() {
  if (stbReady) return;
  stbReady = true;
  stbSyncToolbar();
  if (!stbTimer) stbTimer = window.setInterval(stbSyncToolbar, 500);
  window.addEventListener("a3k64:seating-changed", () => setTimeout(stbSyncToolbar, 80));
  window.addEventListener("a3k64:seating-access-updated", () => setTimeout(stbSyncToolbar, 80));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", stbBoot);
else stbBoot();

export {};
