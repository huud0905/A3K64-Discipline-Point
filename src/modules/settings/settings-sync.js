/* ═══════════════════════════════════════════════════════
   SETTINGS SYNC — đồng bộ cài đặt cá nhân hoá với backend
   (Google Apps Script, sheet PERSONALIZATION).

   Phụ thuộc: settings-core.js (ls, readUser, readAccent,
   readTheme, readTB, normalizeHex, PRESET_ACCENTS)

   API backend dùng:
     action=getPersonalization  payload={username, email, uid}
     action=savePersonalization payload={username, email, uid,
       displayName, personalization:{theme,accentKey,accentColor,
       customAccent,taskbarSettings,recentAccents,
       desktopTransparency,accentTaskbar,accentBorders}}
   ═══════════════════════════════════════════════════════ */

// ─── Đọc GAS URL từ config (cùng cơ chế scoreboard dùng) ─
function getGasUrl() {
  try { return window.A3K64_CONFIG?.gasUrl || null; } catch { return null; }
}

// ─── Trạng thái sync ─────────────────────────────────
const Sync = {
  /** 'idle' | 'loading' | 'saving' | 'saved' | 'error' */
  status: 'idle',
  /** Thời điểm lưu cuối cùng thành công lên backend */
  lastSavedAt: null,
  /** Debounce timer cho auto-save */
  _saveTimer: null,
  _DEBOUNCE_MS: 1500,

  setStatus(s) {
    this.status = s;
    renderSyncStatus(s);
  },

  /** Đọc cài đặt từ backend rồi áp vào localStorage + UI */
  async load() {
    const gasUrl = getGasUrl();
    const user   = readUser();
    if (!gasUrl || !user) return;          // offline / chưa đăng nhập → chỉ dùng localStorage

    this.setStatus('loading');
    try {
      const username = user.email || user.username || user.uid || '';
      const url = `${gasUrl}?action=getPersonalization&payload=${encodeURIComponent(JSON.stringify({ username, email: user.email || '', uid: user.uid || '' }))}`;
      const res  = await fetch(url);
      const json = await res.json();

      const p = json?.data?.personalization || json?.personalization || null;
      if (!p) { this.setStatus('idle'); return; }  // chưa có dữ liệu → giữ localStorage

      // Áp về localStorage (không ghi đè nếu local mới hơn — so updatedAt)
      // FIX (sync bug #4): backend getPersonalizationAction trả
      // { data: { ok, personalization, updatedAt } } — "updatedAt" nằm
      // NGANG HÀNG với "personalization", không lồng bên trong nó.
      // Đọc nhầm "p.updatedAt" (luôn undefined) khiến remoteUpdated luôn
      // = 0 → điều kiện remoteUpdated > localUpdated không bao giờ đúng
      // → cài đặt từ backend không bao giờ được áp về máy mới/máy khác.
      const localUpdated = Number(ls.get('settings-local-updated-at') || 0);
      const remoteUpdatedRaw = json?.data?.updatedAt ?? json?.updatedAt ?? null;
      const remoteUpdated = remoteUpdatedRaw ? Date.parse(remoteUpdatedRaw) : 0;
      if (remoteUpdated > localUpdated) {
        applyRemotePersonalization(p);
      }
      this.setStatus('idle');
    } catch (err) {
      console.warn('[Settings Sync] load() thất bại:', err);
      this.setStatus('idle'); // fallback localStorage
    }
  },

  /** Lưu cài đặt hiện tại lên backend — gọi sau mỗi thay đổi, debounce. */
  scheduleSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.save(), this._DEBOUNCE_MS);
  },

  async save() {
    const gasUrl = getGasUrl();
    const user   = readUser();
    if (!gasUrl || !user) return;

    this.setStatus('saving');
    try {
      const personalization = buildPersonalizationPayload();
      const payload = {
        username:    user.email || user.username || user.uid || '',
        email:       user.email || '',
        uid:         user.uid   || '',
        displayName: user.displayName || user.name || '',
        personalization,
      };
      const res  = await fetch(gasUrl, {
        method: 'POST',
        body: JSON.stringify({ action: 'savePersonalization', ...payload }),
      });
      const json = await res.json();
      if (json?.ok === false) throw new Error(json.error || 'Backend từ chối lưu.');

      this.lastSavedAt = Date.now();
      ls.set('settings-local-updated-at', this.lastSavedAt);
      this.setStatus('saved');
      // Sau 3s chuyển về idle
      setTimeout(() => { if (this.status === 'saved') this.setStatus('idle'); }, 3000);
    } catch (err) {
      console.warn('[Settings Sync] save() thất bại:', err);
      this.setStatus('error');
      setTimeout(() => { if (this.status === 'error') this.setStatus('idle'); }, 4000);
    }
  },
};

// ─── Xây payload personalization từ localStorage hiện tại ──
function buildPersonalizationPayload() {
  const accentColor = readAccent();
  const matchEntry  = Object.entries(PRESET_ACCENTS).find(([, v]) => v === accentColor);
  return {
    theme:               readTheme(),
    accentKey:           matchEntry ? matchEntry[0] : 'custom',
    accentColor:         accentColor,
    customAccent:        ls.get('desktop-custom-accent') || '',
    taskbarSettings:     readTB(),
    recentAccents:       (() => { try { return JSON.parse(ls.get('recent-accents') || '[]'); } catch { return []; } })(),
    desktopTransparency: ls.get('desktop-transparency') || 'on',
    accentTaskbar:       ls.get('accent-taskbar') || 'off',
    accentBorders:       ls.get('accent-borders') || 'off',
  };
}

// ─── Áp personalization từ backend → localStorage + UI ───
function applyRemotePersonalization(p) {
  // Theme
  if (p.theme && ['dark','light','auto'].includes(p.theme)) {
    ['desktop-theme','login-theme','login-theme-mode','theme-mode','theme','a3k64-theme'].forEach(k => ls.set(k, p.theme));
    applyTheme(p.theme);
    theme = p.theme;
  }
  // Accent
  const ac = normalizeHex(p.accentColor || p.customAccent);
  if (ac) {
    saveAccentLocal(ac);
    accent = ac;
  }
  // Taskbar
  if (p.taskbarSettings && typeof p.taskbarSettings === 'object') {
    const merged = { ...DEFAULT_TB, ...p.taskbarSettings };
    ls.set('taskbar-settings', JSON.stringify(merged));
    tb = merged;
    window.dispatchEvent(new CustomEvent('taskbar-settings-change', { detail: merged }));
  }
  // Recent accents
  if (Array.isArray(p.recentAccents) && p.recentAccents.length) {
    recentAccents = p.recentAccents;
    ls.set('recent-accents', JSON.stringify(recentAccents));
  }
  // Toggles
  if (p.desktopTransparency) ls.set('desktop-transparency', p.desktopTransparency);
  if (p.accentTaskbar)       ls.set('accent-taskbar', p.accentTaskbar);
  if (p.accentBorders)       ls.set('accent-borders', p.accentBorders);

  // Re-render trang hiện tại để phản ánh giá trị mới
  renderPageContent(currentPage);
}

// ─── Render chỉ báo sync ─────────────────────────────
function renderSyncStatus(status) {
  const el = $('#sync-status-bar');
  if (!el) return;

  const map = {
    idle:    { cls: '',        icon: '',                                                 text: '' },
    loading: { cls: 'syncing', icon: ICONS.spinner,  text: 'Đang tải cài đặt…' },
    saving:  { cls: 'syncing', icon: ICONS.spinner,  text: 'Đang lưu…' },
    saved:   { cls: 'saved',   icon: ICONS.check,    text: 'Đã đồng bộ' },
    error:   { cls: 'error',   icon: ICONS.info,     text: 'Không đồng bộ được — đã lưu cục bộ' },
  };
  const m = map[status] || map.idle;
  if (!m.text) { el.style.display = 'none'; return; }
  el.style.display = 'inline-flex';
  el.className = `sync-status ${m.cls}`;
  el.innerHTML = `${svg(m.icon, 14)} ${m.text}`;
}

// ─── Wrapper: lưu local RỒI schedule backend save ────
// Gọi ở mọi nơi thay đổi setting thay cho saveAccentLocal/saveTBLocal trực tiếp.

function saveAccent(color) {
  const norm = saveAccentLocal(color);
  accent = norm;
  Sync.scheduleSave();
  return norm;
}

function saveTB(settings) {
  saveTBLocal(settings);
  Sync.scheduleSave();
}