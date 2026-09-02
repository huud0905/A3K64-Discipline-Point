/* ═══════════════════════════════════════════════════════
   SETTINGS UI — navigation, sidebar, page renderers,
   UI interaction helpers.
   Phụ thuộc: settings-core.js, settings-sync.js
   A3K64 © 2025
   ═══════════════════════════════════════════════════════ */

// ─── Navigation ──────────────────────────────────────
const PAGES = [
  { id: 'home',       label: 'Cá nhân hóa', icon: 'palette',  parent: null },
  { id: 'system',     label: 'Hệ thống',    icon: 'settings', parent: null },
  { id: 'color',      label: 'Màu sắc',     icon: 'palette',  parent: 'home' },
  { id: 'background', label: 'Hình nền',    icon: 'wallpaper', parent: 'home' },
  { id: 'taskbar',    label: 'Thanh taskbar', icon: 'monitor', parent: 'home' },
  { id: 'display',    label: 'Màn hình',    icon: 'monitor',  parent: 'system' },
  { id: 'about',      label: 'Giới thiệu',  icon: 'info',     parent: 'system' },
];

function navigate(id) {
  $$('.page').forEach(el => el.classList.remove('active'));
  const el = $(`#page-${id}`);
  if (el) {
    el.classList.add('active');
    el.classList.add('anim-in');
    setTimeout(() => el.classList.remove('anim-in'), 300);
  }
  currentPage = id;
  renderPageContent(id);
  $$('#sidebar-nav .nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === id || btn.dataset.page === PAGES.find(p => p.id === id)?.parent);
  });
}

// ─── Sidebar ─────────────────────────────────────────
function buildSidebar() {
  const user = readUser();
  if (user) {
    const av = $('#sb-avatar');
    if (user.photoURL) { av.innerHTML = `<img src="${user.photoURL}" alt="Avatar">`; }
    else { av.textContent = (user.displayName || 'A3').charAt(0).toUpperCase(); }
    $('#sb-name').textContent  = user.displayName || 'Người dùng 12A3';
    $('#sb-email').textContent = user.email || user.role || 'Đang đăng nhập';
  }

  const nav = $('#sidebar-nav');
  nav.innerHTML = [
    { id: 'home',   icon: 'palette',  label: 'Cá nhân hóa' },
    { id: 'system', icon: 'settings', label: 'Hệ thống' },
  ].map(p => `
    <button class="nav-btn" data-page="${p.id}" onclick="navigate('${p.id}')">
      ${svg(ICONS[p.icon], 18)} ${p.label}
    </button>`).join('');
}

// ─── Page renderers ──────────────────────────────────
function renderPageContent(id) {
  const el = $(`#page-${id}`);
  if (!el) return;
  if (id === 'home')       return renderHome();
  if (id === 'system')     return renderSystem();
  if (id === 'color')      return renderColor(el);
  if (id === 'background') return renderBackground(el);
  if (id === 'taskbar')    return renderTaskbar(el);
  if (id === 'display')    return renderDisplay(el);
  if (id === 'about')      return renderAbout(el);
}

function breadcrumb(parentLabel, parentId, currentLabel) {
  return `<div class="breadcrumb">
    <button onclick="navigate('${parentId}')">${parentLabel}</button>
    ${svg(ICONS.chevronRight, 16)}
    <span>${currentLabel}</span>
  </div>`;
}

function renderHome() {
  const el = $('#home-nav-grid');
  el.innerHTML = [
    { id: 'background', icon: 'wallpaper', label: 'Hình nền',        sub: 'Ảnh nền desktop' },
    { id: 'color',      icon: 'palette',   label: 'Màu sắc',         sub: 'Màu chủ đạo và chế độ giao diện' },
    { id: 'taskbar',    icon: 'monitor',   label: 'Thanh taskbar',   sub: 'Căn chỉnh và hành vi' },
  ].map(p => `
    <button class="nav-card" onclick="navigate('${p.id}')">
      ${svg(ICONS[p.icon], 22)}
      <div><strong>${p.label}</strong><span>${p.sub}</span></div>
      <span class="chevron">${svg(ICONS.chevronRight, 18)}</span>
    </button>`).join('');
}

function renderSystem() {
  const el = $('#page-system');
  el.innerHTML = `
    <div class="page-title">Hệ thống</div>
    <div class="nav-grid">
      ${[
        { id: 'display', icon: 'monitor', label: 'Màn hình',   sub: 'Tỷ lệ và bố cục hiển thị' },
        { id: 'about',   icon: 'info',    label: 'Giới thiệu', sub: 'Thông tin ứng dụng' },
      ].map(p => `
        <button class="nav-card" onclick="navigate('${p.id}')">
          ${svg(ICONS[p.icon], 22)}
          <div><strong>${p.label}</strong><span>${p.sub}</span></div>
          <span class="chevron">${svg(ICONS.chevronRight, 18)}</span>
        </button>`).join('')}
    </div>`;
}

function renderColor(el) {
  accent = readAccent();
  theme  = readTheme();
  const recent = recentAccents.length ? recentAccents : ['#06b6d4','#52525b','#ef4444','#db2777'];

  el.innerHTML = `
    ${breadcrumb('Cá nhân hóa', 'home', 'Màu sắc')}
    <div class="s-card">
      <div class="s-card-head">
        ${svg(ICONS.palette, 20)}
        <div><h2>Màu sắc</h2><p>Màu chủ đạo, chế độ giao diện và hiệu ứng.</p></div>
      </div>

      <div class="s-row">
        <div class="s-row-left">${svg(ICONS.monitor, 18)}<div><strong>Chế độ giao diện</strong><span>Đổi giữa Tối, Sáng hoặc theo hệ thống.</span></div></div>
        <div class="s-row-right">
          <div class="sel-wrap" id="theme-sel-wrap">
            <button class="sel-btn" onclick="toggleSel('theme-sel-wrap')">
              <span id="theme-label">${THEME_LABELS[theme]}</span>
              ${svg(ICONS.chevronRight, 15)}
            </button>
            <div class="sel-menu" id="theme-sel-menu" style="display:none">
              ${['dark','light','auto'].map(m => `<button class="${m === theme ? 'active' : ''}" onclick="applyThemeUI('${m}')">${THEME_LABELS[m]}</button>`).join('')}
            </div>
          </div>
        </div>
      </div>

      <div class="s-row">
        <div class="s-row-left">${svg(ICONS.sparkles, 18)}<div><strong>Hiệu ứng trong suốt</strong><span>Cửa sổ và bề mặt có hiệu ứng kính mờ.</span></div></div>
        <div class="s-row-right">
          <button class="toggle ${ls.get('desktop-transparency') !== 'off' ? 'on' : ''}" onclick="toggleLS(this,'desktop-transparency','on','off')"><span></span></button>
        </div>
      </div>

      <div class="color-section">
        <div class="cs-head">
          <div><strong>Màu chủ đạo</strong><span>Chọn từ bảng màu hoặc dùng màu tùy chỉnh.</span></div>
          <div class="accent-chip" id="accent-chip" style="background:${accent}"></div>
        </div>
        <div class="color-label">Màu gần đây</div>
        <div class="color-swatches" id="recent-swatches">
          ${recent.map(c => `<button style="background:${c}" onclick="applyAccentUI('${c}')">${c.toLowerCase() === accent.toLowerCase() ? svg(ICONS.check, 16) : ''}</button>`).join('')}
        </div>
        <div class="color-label">Bảng màu</div>
        <div class="color-swatches" id="palette-swatches">
          ${SWATCH_PALETTE.map(c => `<button style="background:${c}" class="${c.toLowerCase() === accent.toLowerCase() ? 'active' : ''}" onclick="applyAccentUI('${c}')">${c.toLowerCase() === accent.toLowerCase() ? svg(ICONS.check, 16) : ''}</button>`).join('')}
        </div>
        <div class="custom-row">
          <div><strong>Màu tùy chỉnh</strong><span>Chọn bất kỳ màu nào bằng bảng chọn màu.</span></div>
          <div style="display:flex;align-items:center;gap:10px">
            <input type="color" class="custom-color-input" value="${accent}" oninput="applyAccentUI(this.value)" title="Chọn màu tùy chỉnh"/>
            <button class="soft-btn" onclick="applyAccentUI(document.querySelector('.custom-color-input').value)">Áp dụng</button>
          </div>
        </div>
      </div>

      <div class="s-row">
        <div class="s-row-left"><div><strong>Hiện màu trên Start và taskbar</strong></div></div>
        <div class="s-row-right">
          <button class="toggle ${ls.get('accent-taskbar') === 'on' ? 'on' : ''}" onclick="toggleLS(this,'accent-taskbar','on','off')"><span></span></button>
        </div>
      </div>
      <div class="s-row">
        <div class="s-row-left"><div><strong>Hiện màu trên viền cửa sổ</strong></div></div>
        <div class="s-row-right">
          <button class="toggle ${ls.get('accent-borders') === 'on' ? 'on' : ''}" onclick="toggleLS(this,'accent-borders','on','off')"><span></span></button>
        </div>
      </div>
    </div>`;
}

function renderBackground(el) {
  el.innerHTML = `
    ${breadcrumb('Cá nhân hóa', 'home', 'Hình nền')}
    <div class="s-card">
      <div class="s-card-head">
        ${svg(ICONS.wallpaper, 20)}
        <div><h2>Hình nền</h2><p>Tùy chỉnh nền desktop.</p></div>
      </div>
      <div class="bg-preview"><span>Xem trước hình nền</span></div>
      <div class="s-row">
        <div class="s-row-left">${svg(ICONS.upload, 18)}<div><strong>Chọn hình nền</strong><span>Tải ảnh cá nhân để đặt làm hình nền desktop.</span></div></div>
        <div class="s-row-right"><button class="soft-btn" disabled>${svg(ICONS.upload, 15)} Sắp có</button></div>
      </div>
    </div>`;
}

function renderTaskbar(el) {
  tb = readTB();
  el.innerHTML = `
    ${breadcrumb('Cá nhân hóa', 'home', 'Thanh taskbar')}
    <div class="s-card">
      <div class="s-card-head">
        ${svg(ICONS.monitor, 20)}
        <div><h2>Thanh taskbar</h2><p>Biểu tượng, căn chỉnh, thông báo và hành vi.</p></div>
      </div>
      <div class="tb-group">
        <div class="tb-group-head"><strong>Mục trên taskbar</strong><span>Hiện hoặc ẩn các nút xuất hiện trên taskbar.</span></div>
        <div class="s-row">
          <div class="s-row-left">${svg(ICONS.search, 18)}<div><strong>Tìm kiếm</strong></div></div>
          <div class="s-row-right">
            <div class="sel-wrap" id="search-sel-wrap">
              <button class="sel-btn" onclick="toggleSel('search-sel-wrap')">
                <span>${tb.searchMode === 'icon' ? 'Chỉ biểu tượng' : 'Ô tìm kiếm'}</span>
                ${svg(ICONS.chevronRight, 15)}
              </button>
              <div class="sel-menu" style="display:none">
                <button class="${tb.searchMode === 'box'  ? 'active' : ''}" onclick="updateTB('searchMode','box');closeSels();renderPageContent('taskbar')">Ô tìm kiếm</button>
                <button class="${tb.searchMode === 'icon' ? 'active' : ''}" onclick="updateTB('searchMode','icon');closeSels();renderPageContent('taskbar')">Chỉ biểu tượng</button>
              </div>
            </div>
          </div>
        </div>
        <div class="s-row">
          <div class="s-row-left"><div><strong>Chế độ xem tác vụ</strong></div></div>
          <div class="s-row-right"><button class="toggle ${tb.taskView ? 'on' : ''}" onclick="updateTBToggle(this,'taskView')"><span></span></button></div>
        </div>
        <div class="s-row">
          <div class="s-row-left"><div><strong>Tiện ích</strong></div></div>
          <div class="s-row-right"><button class="toggle ${tb.widgets ? 'on' : ''}" onclick="updateTBToggle(this,'widgets')"><span></span></button></div>
        </div>
        <div class="s-row">
          <div class="s-row-left"><div><strong>Tiếp tục</strong><span>Hiện ứng dụng có thông báo khi khả dụng.</span></div></div>
          <div class="s-row-right"><button class="toggle ${tb.resume ? 'on' : ''}" onclick="updateTBToggle(this,'resume')"><span></span></button></div>
        </div>
      </div>
      <div class="tb-group">
        <div class="tb-group-head"><strong>Hành vi của taskbar</strong><span>Căn chỉnh, huy hiệu và tự động ẩn.</span></div>
        <div class="s-row">
          <div class="s-row-left"><div><strong>Căn chỉnh taskbar</strong></div></div>
          <div class="s-row-right">
            <div class="sel-wrap" id="align-sel-wrap">
              <button class="sel-btn" onclick="toggleSel('align-sel-wrap')">
                <span>${tb.alignment === 'left' ? 'Trái' : 'Giữa'}</span>
                ${svg(ICONS.chevronRight, 15)}
              </button>
              <div class="sel-menu" style="display:none">
                <button class="${tb.alignment === 'center' ? 'active' : ''}" onclick="updateTB('alignment','center');closeSels();renderPageContent('taskbar')">Giữa</button>
                <button class="${tb.alignment === 'left'   ? 'active' : ''}" onclick="updateTB('alignment','left');closeSels();renderPageContent('taskbar')">Trái</button>
              </div>
            </div>
          </div>
        </div>
        <div class="s-row">
          <div class="s-row-left"><div><strong>Tự động ẩn taskbar</strong></div></div>
          <div class="s-row-right"><button class="toggle ${tb.autoHide ? 'on' : ''}" onclick="updateTBToggle(this,'autoHide')"><span></span></button></div>
        </div>
        <div class="s-row">
          <div class="s-row-left"><div><strong>Hiện huy hiệu trên ứng dụng taskbar</strong></div></div>
          <div class="s-row-right"><button class="toggle ${tb.badges ? 'on' : ''}" onclick="updateTBToggle(this,'badges')"><span></span></button></div>
        </div>
      </div>
    </div>`;
}

function renderDisplay(el) {
  const SCALE_OPTS = [75, 80, 90, 100, 110, 125, 150, 175, 200];
  const savedScale = Number(ls.get('a3k64-display-scale')) || 100;
  el.innerHTML = `
    ${breadcrumb('Hệ thống', 'system', 'Màn hình')}
    <div class="s-card">
      <div class="s-card-head">
        ${svg(ICONS.monitor, 20)}
        <div><h2>Màn hình</h2><p>Tỷ lệ và bố cục hiển thị giao diện.</p></div>
      </div>
      <div class="s-row">
        <div class="s-row-left">${svg(ICONS.monitor, 18)}<div><strong>Tỷ lệ và bố cục</strong><span>Thay đổi kích thước chữ và ứng dụng.</span></div></div>
        <div class="s-row-right">
          <select style="height:38px;border:1px solid var(--border3);border-radius:10px;padding:0 12px;color:var(--text);background:var(--surface2);font:inherit;font-size:13px;font-weight:700;cursor:pointer;outline:none" onchange="applyScale(+this.value)">
            ${SCALE_OPTS.map(s => `<option value="${s}" ${s === savedScale ? 'selected' : ''}>${s}%${s === 100 ? ' (Mặc định)' : ''}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>`;
}

function renderAbout(el) {
  el.innerHTML = `
    ${breadcrumb('Hệ thống', 'system', 'Giới thiệu')}
    <div class="s-card">
      <div class="s-card-head">
        ${svg(ICONS.info, 20)}
        <div><h2>Giới thiệu</h2><p>Thông tin ứng dụng quản lý thi đua.</p></div>
      </div>
      <div class="about-box">
        <strong>12A3 – Quản lý Thi Đua</strong>
        <span>Phiên bản web nội bộ A3K64.</span>
        <span>Đăng nhập bằng Google, phân quyền theo ACCOUNTS và đồng bộ cá nhân hoá qua <strong>backend GAS</strong> (sheet PERSONALIZATION).</span>
        <span style="margin-top:4px;color:var(--accent);font-weight:700">A3K64 © 2025</span>
      </div>
    </div>`;
}

// ─── UI helpers ──────────────────────────────────────
function toggleSel(wrapId) {
  const wrap = $(`#${wrapId}`);
  if (!wrap) return;
  const menu   = wrap.querySelector('.sel-menu');
  const isOpen = menu.style.display !== 'none';
  closeSels();
  if (!isOpen) menu.style.display = 'block';
}

function closeSels() { $$('.sel-menu').forEach(m => m.style.display = 'none'); }

document.addEventListener('click', e => { if (!e.target.closest('.sel-wrap')) closeSels(); });

/** Toggle một setting boolean trong localStorage và schedule backend save. */
function toggleLS(btn, key, onVal, offVal) {
  const isOn = btn.classList.toggle('on');
  ls.set(key, isOn ? onVal : offVal);
  Sync.scheduleSave();
}

/** Cập nhật accent trên UI + lưu local + schedule backend save. */
function applyAccentUI(color) {
  const norm = saveAccent(color);   // saveAccent đã gọi Sync.scheduleSave()
  accent = norm;
  const chip = $('#accent-chip');
  if (chip) chip.style.background = norm;
  $$('#palette-swatches button').forEach((btn, i) => {
    const c = SWATCH_PALETTE[i];
    btn.classList.toggle('active', c.toLowerCase() === norm.toLowerCase());
    btn.innerHTML = c.toLowerCase() === norm.toLowerCase() ? svg(ICONS.check, 16) : '';
  });
  $$('#recent-swatches button').forEach(btn => {
    const c   = btn.style.background;
    const hex = rgbToHex(c) || c;
    btn.innerHTML = hex.toLowerCase() === norm.toLowerCase() ? svg(ICONS.check, 16) : '';
  });
  recentAccents = [norm, ...recentAccents.filter(c => c.toLowerCase() !== norm.toLowerCase())].slice(0, 4);
  ls.set('recent-accents', JSON.stringify(recentAccents));
}

function rgbToHex(rgb) {
  const m = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!m) return null;
  return '#' + [m[1],m[2],m[3]].map(n => (+n).toString(16).padStart(2, '0')).join('');
}

/** Đổi theme trên UI + lưu local + schedule backend save. */
function applyThemeUI(mode) {
  theme = mode;
  applyTheme(mode);
  Sync.scheduleSave();
  const el = $('#page-color');
  if (el) renderColor(el);
  const label = $('#theme-label');
  if (label) label.textContent = THEME_LABELS[mode];
}

/** Cập nhật một trường taskbar + schedule backend save. */
function updateTB(key, value) {
  tb[key] = value;
  saveTB(tb);   // saveTB đã gọi Sync.scheduleSave()
}

function updateTBToggle(btn, key) {
  const isOn = btn.classList.toggle('on');
  updateTB(key, isOn);
}

// ─── Listen for external storage changes ─────────────
window.addEventListener('storage', () => {
  accent = readAccent();
  theme  = readTheme();
  document.documentElement.style.setProperty('--accent', accent);
  applyTheme(theme);
});