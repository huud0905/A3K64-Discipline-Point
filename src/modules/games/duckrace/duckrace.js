/* ============================================================
   Duck Race — duckrace.js
   Thuộc dự án A3K64. Viết từ đầu, không copy bên thứ ba.

   API backend: window.A3K64_CONFIG.workerUrl
   action: "getStudents" → [{ id, full_name, group_no, ... }]
   ============================================================ */

'use strict';

const DR = (() => {

  /* ── Config ─────────────────────────────────────────────── */
  const SKINS = ['🦆','🐸','🐢','🐠','🦀','🐋','🦭','🐧','🐣','🦅'];
  const DUCK_START_X = 90; // px từ left edge đến điểm bắt đầu vịt (sau vạch xuất phát)
  // Đường đua vô hạn kiểu "camera đuổi theo": vịt di chuyển THẬT, không nén
  // tiệm cận nữa (cách cũ khiến vịt càng lúc càng ì, nhìn như đứng yên).
  // Camera (khung nhìn) đuổi theo vịt dẫn đầu bằng easing — vì đuổi chứ
  // không dính chặt, vịt dẫn đầu vẫn liên tục nhích tới trước khi camera
  // bắt kịp, tạo cảm giác chạy liên tục / vô tận, không bao giờ khựng lại.
  // Hằng số vật lý đã chuyển sang PHYS object bên dưới (trong runRace)

  /* ── State ──────────────────────────────────────────────── */
  let names        = [];        // danh sách đang đua
  let raceAnimId   = null;
  let raceRound    = 0;
  let rankedList   = [];        // [{name,rank}] theo thứ tự về đích
  let raceDurationSec = 20;     // thời gian đua mục tiêu (giây), chỉnh qua nút Thời gian đua
  let liveSpeedMultiplier = 1;  // chỉnh trực tiếp trong lúc đua: mặc định 1x, tối đa 3x
  let finishLineTriggered = false;
  let currentSkin  = '🦆';
  let historyData  = [];        // [{round, winner, skin, time}]
  let tabMode      = 'names';   // 'names' | 'numbers'
  let currentLanes = [];
  let winnerName   = '';        // tên winner lượt vừa xong
  let cachedStudents = null;    // cache backend students
  let activePause    = null;    // hàm pause của lượt đua đang chạy
  let activeResume    = null;   // hàm resume của lượt đua đang chạy
  let activeIsPaused  = () => false;

  /* ── Danh sách học sinh tĩnh (fallback khi chưa có API) ─────
     Điền tên + group_no vào đây để preset Cả lớp / Tổ hoạt động
     ngay cả khi workerUrl chưa được cấu hình.
     Để trống [] nếu muốn bắt buộc dùng API.                  ── */
  const STATIC_STUDENTS = []; // Dùng API thật — xem workerUrl()

  /* ── Worker URL helper ───────────────────────────────────── */
  function workerUrl() {
    // Thử đọc từ config chung của app
    return (window.A3K64_CONFIG?.workerUrl)
        || (window.A3K64_CONFIG?.gasUrl)
        || null;
  }

  /* ── API: lấy danh sách học sinh ────────────────────────── */
  async function fetchStudents() {
    if (cachedStudents) return cachedStudents;

    // Nếu chưa có config, chờ tối đa 1.5s để postMessage kịp đến
    let url = workerUrl();
    if (!url) {
      await new Promise(res => setTimeout(res, 1500));
      url = workerUrl();
    }
    if (!url) {
      showToast('Không tìm thấy cấu hình API — thử tải lại trang', true);
      return null;
    }
    try {
      showLoader('Đang tải danh sách học sinh...');
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getStudents' }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'API error');
      // Backend trả về json.data = [{id, full_name, group_no, ...}]
      cachedStudents = Array.isArray(json.data) ? json.data : [];
      return cachedStudents;
    } catch (e) {
      showToast('Không thể tải danh sách: ' + e.message, true);
      return null;
    } finally {
      hideLoader();
    }
  }

  /* ── Presets ─────────────────────────────────────────────── */
  async function loadPreset(type, groupNo) {
    if (type === 'numbers') {
      // Số 1→54, không cần API
      namesInput().value = Array.from({ length: 54 },
        (_, i) => String(i + 1)).join('\n');
      setTabMode('names');
      updateCount();
      return;
    }

    // Cần API cho cả lớp / từng tổ
    const students = await fetchStudents();
    if (!students) return; // fetch thất bại, đã toast

    let list;
    if (type === 'class') {
      list = students;
    } else if (type === 'to') {
      list = students.filter(s => Number(s.group_no) === Number(groupNo));
      if (!list.length) {
        showToast(`Tổ ${groupNo} chưa có học sinh trong DB`, true);
        return;
      }
    }

    namesInput().value = list
      .map(s => s.full_name)
      .join('\n');
    setTabMode('names');
    updateCount();
    showToast(`Đã tải ${list.length} tên`);
  }

  /* ── Helpers DOM ─────────────────────────────────────────── */
  const $ = id => document.getElementById(id);
  const namesInput = () => $('dr-names');

  function showLoader(msg) {
    $('dr-loader-msg').textContent = msg || 'Đang tải...';
    $('dr-loader').classList.add('show');
  }
  function hideLoader() {
    $('dr-loader').classList.remove('show');
  }

  let toastTimer = null;
  function showToast(msg, isError = false) {
    const el = $('dr-toast');
    el.textContent = msg;
    el.classList.toggle('error', isError);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
  }

  /* ── Tab mode ────────────────────────────────────────────── */
  // Trước đây có 2 mode 'names' / 'numbers' (tab thứ 2 biến textarea
  // thành readonly, tự điền dãy số 1→N). Giờ chỉ còn 1 mode 'names' —
  // nút thứ 2 đổi thành "Ngẫu nhiên" (shuffleNames) để xáo trộn ngay
  // danh sách đang có, không còn khoá textarea hay ép về dạng số nữa.
  function setTabMode(mode) {
    tabMode = mode;
    $('tab-names').classList.toggle('active', mode === 'names');
    namesInput().readOnly = false;
  }

  /* ── Xáo trộn thứ tự danh sách hiện có (ngẫu nhiên, Fisher–Yates) ── */
  function shuffleNames() {
    const list = parseNames();
    if (list.length < 2) {
      showToast('Cần ít nhất 2 tên để xáo trộn', true);
      return;
    }
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    namesInput().value = list.join('\n');
    setTabMode('names');
    updateCount();
    showToast('Đã xáo trộn thứ tự danh sách');
  }

  /* ── Parse / count ───────────────────────────────────────── */
  function parseNames() {
    return namesInput().value
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);
  }

  function updateCount() {
    const list = parseNames();
    $('dr-count').textContent = list.length + ' tên';
    $('dr-start-btn').disabled = list.length < 2;
  }

  function clearNames() {
    namesInput().value = '';
    setTabMode('names');
    updateCount();
  }

  /* ── Speed (chỉnh tay bằng slider) ──────────────────────────── */
  /* ── Tốc độ trực tiếp trong lúc đua (mặc định 1x, tối đa 3x) ──── */
  function setLiveSpeed(val) {
    liveSpeedMultiplier = Math.max(1, Math.min(3, parseFloat(val)));
    const lbl = $('dr-live-speed-val');
    if (lbl) lbl.textContent = 'x' + liveSpeedMultiplier.toFixed(1);
    // Cuộn nền (vạch lưới, sóng nước) nhanh/chậm theo đúng tốc độ đua thật —
    // xem duckrace.css: animation-duration dùng calc(... / var(--dr-bg-speed))
    const trackEl = $('dr-track');
    if (trackEl) trackEl.style.setProperty('--dr-bg-speed', liveSpeedMultiplier);
  }
  function setDurationInput(val) {
    let v = parseInt(val, 10);
    if (isNaN(v)) return;
    v = Math.max(5, Math.min(300, v));
    raceDurationSec = v;
  }

  /* ── Skins ───────────────────────────────────────────────── */
  function initSkins() {
    $('dr-skins').innerHTML = SKINS.map(s =>
      `<button class="dr-skin-btn ${s === currentSkin ? 'selected' : ''}"
        onclick="DR._selectSkin('${s}',this)">${s}</button>`
    ).join('');
  }
  function _selectSkin(skin, btn) {
    currentSkin = skin;
    document.querySelectorAll('.dr-skin-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  }

  /* ── Fullscreen ──────────────────────────────────────────── */
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  }

  /* ── History ─────────────────────────────────────────────── */
  function toggleHistory() {
    $('dr-history-wrap').classList.toggle('open');
  }
  function clearHistory() {
    historyData = [];
    renderHistory();
  }
  function addHistory(winner, round) {
    historyData.unshift({
      round, winner, skin: currentSkin,
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    });
    renderHistory();
  }
  function renderHistory() {
    const el = $('dr-history-list');
    if (!historyData.length) {
      el.innerHTML = '<div style="font-size:11.5px;color:#334155;text-align:center;margin-top:16px">Chưa có kết quả</div>';
      return;
    }
    el.innerHTML = historyData.map(h => `
      <div class="dr-history-item">
        <div class="hi-skin">${h.skin} 🥇</div>
        <div class="hi-name">${h.winner}</div>
        <div class="hi-meta">Lượt ${h.round} · ${h.time}</div>
      </div>
    `).join('');
  }

  /* ── Start / back ────────────────────────────────────────── */
  function startRace() {
    names = parseNames();
    if (names.length < 2) return;
    raceRound++;
    $('dr-setup').style.display = 'none';
    $('dr-track-wrap').style.display = 'flex';

    if ($('opt-countdown').checked) {
      doCountdown(() => runRace(names));
    } else {
      runRace(names);
    }
  }

  function backToSetup() {
    cancelAnimationFrame(raceAnimId);
    raceAnimId = null;
    activePause = null;
    activeResume = null;
    activeIsPaused = () => false;
    $('dr-track-wrap').style.display = 'none';
    $('dr-setup').style.display = 'flex';
    $('dr-result').classList.remove('show');
    $('dr-countdown').classList.remove('show');
    const sl = $('dr-track')?.querySelector('.dr-speedlines');
    if (sl) sl.classList.remove('show');
    setStatus('Sẵn sàng');
  }

  /* ── Stop / Continue (nút bên ngoài game loop) ─────────── */
  function togglePause() {
    if (activeIsPaused()) {
      if (activeResume) activeResume();
      updatePauseBtn(false);
    } else {
      if (!raceAnimId) return; // không có lượt đua nào đang chạy (đếm ngược / đã xong)
      if (activePause) activePause();
      updatePauseBtn(true);
    }
  }
  function updatePauseBtn(isPaused) {
    const btn = $('dr-pause-btn');
    if (!btn) return;
    btn.textContent = isPaused ? '▶ Tiếp tục' : '⏸ Tạm dừng';
    btn.classList.toggle('spd-active', isPaused);
  }

  /* ── Countdown ───────────────────────────────────────────── */
  function doCountdown(cb) {
    const overlay = $('dr-countdown');
    const numEl   = $('dr-cnt-num');
    overlay.classList.add('show');
    let n = 3;
    function tick() {
      if (n > 0) {
        numEl.textContent = n;
        // restart animation
        numEl.style.animation = 'none';
        void numEl.offsetWidth;
        numEl.style.animation = '';
        playBeep(n === 3 ? 330 : n === 2 ? 370 : 440, 0.18, 'square', 0.16);
        n--;
        setTimeout(tick, 900);
      } else {
        numEl.innerHTML = '<span class="dr-countdown-go">GO! 🏁</span>';
        playBeep(880, 0.4, 'square', 0.2);
        playSfx(SFX.airhorn, 0.55);
        setTimeout(() => {
          overlay.classList.remove('show');
          cb();
        }, 600);
      }
    }
    tick();
  }

  /* ════════════════════════════════════════════════════════════
     PHYSICS ENGINE — mô phỏng vật lý 2D theo đúng phân tích:
     ─ Mỗi vịt là một particle với vận tốc v (px/ms), gia tốc a
     ─ Nhiễu ngẫu nhiên liên tục (impulse ngẫu nhiên mỗi Δt nhỏ)
       mô phỏng Perlin-noise / dòng chảy không đều của sông
     ─ Hệ số cản nước (damping) giữ tốc độ không vọt quá max
     ─ Va chạm mềm giữa các vịt cùng làn (đẩy nhau nhẹ)
     ─ Bứt tốc (sprint) ngẫu nhiên trong ~20% thời gian cuối
     ─ Camera easing đuổi theo người dẫn đầu
     ─ Vạch đích hiện ra từ xa (FINISH_REVEAL_MS) rồi tiến lại gần dần
       theo camera, không mọc đột ngột sát cạnh vịt
     ════════════════════════════════════════════════════════════ */

  /* ── Hằng số vật lý ─────────────────────────────────────── */
  const PHYS = {
    BASE_V:        0.07,   // px/ms — vận tốc trung bình (tốc độ gốc)
    MAX_V:         0.22,   // px/ms — vận tốc tối đa (giới hạn vật lý)
    MIN_V:         0.01,   // px/ms — vận tốc tối thiểu (không đứng hẳn)
    DAMPING:       0.92,   // hệ số cản nước mỗi frame (0–1; nhỏ=cản nhiều)
    IMPULSE_RATE:  0.055,  // xác suất nhận impulse mỗi frame (dao động tốc độ)
    IMPULSE_MIN:  -0.04,   // biên âm của impulse (giảm tốc)
    IMPULSE_MAX:   0.10,   // biên dương của impulse (tăng tốc)
    // Nhiễu sin nhẹ (wobble) — mô phỏng dòng chảy không đều
    WOBBLE_AMP:    0.25,   // biên độ wobble (nhân vào v)
    WOBBLE_PERIOD: 220,    // ms — chu kỳ wobble
    // Lực đẩy khi 2 vịt cùng làn đụng nhau
    COLLISION_PUSH: 0.015, // px/ms thêm vào v của vịt phía sau
    COLLISION_GAP:  22,    // px — khoảng cách để coi là "đụng"
    // Bứt tốc sprint cuối
    BURST_PROB:    0.018,  // xác suất kích hoạt sprint mỗi frame (trong vùng cuối)
    BURST_V:       0.18,   // px/ms — vận tốc khi bứt tốc
    BURST_DUR:     1200,   // ms — thời gian sprint kéo dài
    // Camera
    CAM_EASE:      0.048,  // tốc độ camera bắt kịp (0=đứng yên,1=dính chặt)
    CAM_TARGET_X:  0.58,   // vịt dẫn đầu giữ ở 58% chiều rộng track
    // Khoảng hụt so với vạch đích mà các vịt KHÔNG thắng được phép
    // tiệm cận tới (không chạm/vượt) — mỗi vịt có 1 mốc riêng random
    // trong khoảng này để cả đàn không dừng thẳng hàng y hệt nhau.
    FINISH_GAP_MIN: 18,    // px
    FINISH_GAP_MAX: 130,   // px
  };

  /* ── dt-normalized lerp ──────────────────────────────────────
     Các hệ số "bắt kịp mục tiêu" (camera, tốc độ winner, v.v.) trước
     đây nhân thẳng vào mỗi frame — nghĩa là tốc độ hội tụ phụ thuộc
     vào FPS thực tế của máy (máy khựng/frame dài thì bước nhảy lớn
     hơn hẳn, gây giật). Hàm này quy đổi 1 hệ số "mỗi 16.67ms" (60fps)
     thành hệ số tương đương đúng với dt hiện tại, để chuyển động mượt
     đều bất kể khung hình có dao động. */
  function lerpFactor(ratePer60, dt) {
    return 1 - Math.pow(1 - ratePer60, dt / 16.6667);
  }

  /* ── Hằng số skew vạch đích ──────────────────────────────────
     Vạch đích / vạch xuất phát đều dùng skewX(-9deg) trong CSS.
     Với skewX(θ), điểm tại y so với tâm lệch x = y * tan(θ).
     Vịt làn TRÊN (y nhỏ hơn tâm) giao vạch đích SỚM hơn (offset âm),
     vịt làn DƯỚI giao muộn hơn (offset dương). ── */
  /* ── Race engine ─────────────────────────────────────────── */

  /* ── Helper: giao điểm 2 đoạn thẳng (port từ Helper.intersect gốc) ─── */

  /* ── Helper: line intersect (port từ gốc) ─────────────────── */
  function lineIntersect(l1, l2) {
    const den = (l2.y2-l2.y1)*(l1.x2-l1.x1) - (l2.x2-l2.x1)*(l1.y2-l1.y1);
    if (!den) return null;
    const ua = ((l2.x2-l2.x1)*(l1.y1-l2.y1)-(l2.y2-l2.y1)*(l1.x1-l2.x1))/den;
    const ub = ((l1.x2-l1.x1)*(l1.y1-l2.y1)-(l1.y2-l1.y1)*(l1.x1-l2.x1))/den;
    if (ua<0||ua>1||ub<0||ub>1) return null;
    return {x:l1.x1+ua*(l1.x2-l1.x1), y:l1.y1+ua*(l1.y2-l1.y1)};
  }

  function runRace(list) {
    cancelAnimationFrame(raceAnimId); raceAnimId=null;
    rankedList=[]; winnerName=''; currentLanes=[]; finishLineTriggered=false;

    const track   = $('dr-track');
    const showName= $('opt-show-name').checked;
    const showWave= $('opt-wave').checked;

    track.querySelectorAll('.dr-duck-free,.dr-duck-trail,.dr-duck-ripple,.dr-finish-flash,.dr-lane').forEach(e=>e.remove());
    $('dr-result').classList.remove('show');
    $('dr-confetti').innerHTML='';
    $('dr-wave').style.display = showWave?'block':'none';
    track.style.setProperty('--dr-cam','0px');
    updatePauseBtn(false);

    const N          = list.length;
    const durationMs = raceDurationSec*1000;
    const trackW     = track.clientWidth;
    const trackH     = track.clientHeight;
    const GRASS_H    = 40;
    const WATER_TOP  = GRASS_H;
    const WATER_BOT  = trackH;
    // Scale vịt theo số lượng — nhiều vịt thì nhỏ hơn
    const duckSize   = Math.max(14, Math.min(40, 420/Math.sqrt(N)));
    const labelSize  = Math.max(8, Math.min(11, duckSize*0.32));
    const TAN9       = Math.tan(9*Math.PI/180);

    // ── Tạo vịt tự do (absolute trong track) ─────────────────
    // Vịt xếp thành lưới ở bên trái, sau đó tự bơi
    const cols = Math.ceil(Math.sqrt(N * (trackH/trackW) * 1.4));
    const rows = Math.ceil(N / cols);
    const cellW = Math.min(duckSize*1.6, trackW*0.35/cols);
    const cellH = Math.min(duckSize*1.6, (trackH-GRASS_H)/rows);

    const shuffled = [...list].sort(()=>Math.random()-0.5);
    shuffled.forEach((name, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const startX = col*cellW + Math.random()*cellW*0.4;
      const startY = WATER_TOP + row*cellH + Math.random()*cellH*0.4 + 4;
      const clampY = Math.min(startY, trackH - duckSize - 4);

      const el = document.createElement('div');
      el.className = 'dr-duck-free';
      el.style.cssText = `position:absolute;left:${startX}px;top:${clampY}px;font-size:${duckSize}px;line-height:1;pointer-events:none;transition:none;z-index:2;`;
      el.innerHTML = `<span class="dr-duck-emoji" style="display:block">${currentSkin}</span>`
        + (showName ? `<span style="display:block;font-size:${labelSize}px;background:rgba(0,0,0,.7);color:#fff;border-radius:4px;padding:0 3px;white-space:nowrap;text-align:center;margin-top:1px">${name}</span>` : '');
      track.appendChild(el);

      currentLanes.push({
        el, name,
        x: startX, y: clampY,        // vị trí hiện tại
        // tween X
        txFrom:startX, txTo:startX, txStart:0, txEnd:1,
        // swim Y (bob lên xuống liên tục)
        swimBaseY: clampY,
        swimPhase: Math.random()*Math.PI*2,
        swimAmp:   3+Math.random()*5,
        swimPeriod:600+Math.random()*800,
        // trạng thái đua
        finished:false, finishRank:null,
        isWinner:false,
        tweenPhases:[], // [{start,dur,fromX,toX}]
        visualX: startX,
      });
    });

    // ── Finish line ───────────────────────────────────────────
    const finEl = $('dr-auto-finish');
    if (finEl){finEl.classList.remove('show');finEl.style.left='9999px';}
    let finLineX = null;          // screen-x tâm vạch đích (khi đã đặt)
    let finTweenFrom=null, finTweenStart=null, finTweenDur=null;

    // x của vạch đích tại y màn hình (skewX -9deg, origin center)
    function finXatY(sy){ return finLineX===null?null : finLineX-(sy-trackH/2)*TAN9; }

    // ── Pause/resume ──────────────────────────────────────────
    let startTs=null, pausedMs=0, pausedAt=null, paused=false, raceEnded=false;
    activePause  = ()=>{ if(!paused&&!raceEnded){paused=true;pausedAt=performance.now();} };
    activeResume = ()=>{ if(paused&&!raceEnded){pausedMs+=performance.now()-pausedAt;paused=false;raceAnimId=requestAnimationFrame(frame);} };
    activeIsPaused = ()=>paused;

    // ── Tween helpers ─────────────────────────────────────────
    function easeIO(t){ return t<0.5?2*t*t:-1+(4-2*t)*t; }
    function easeOut(t){ return 1-(1-t)*(1-t); }

    // Lên lịch tween X cho vịt
    function pushPhase(p, startMs, dur, toX){
      p.tweenPhases.push({start:startMs, dur, fromX:null, toX});
    }

    // Random tween tự do (giai đoạn chạy tự do đầu)
    function schedFree(p, now){
      // Bơi ngẫu nhiên, tập trung nửa trái màn hình
      const spread = Math.min(trackW*0.55, 40 + N*2.5);
      const toX = Math.random()*spread;
      const dur = 350+Math.random()*550;
      p.txFrom  = p.x;
      p.txTo    = toX;
      p.txStart = now + Math.random()*80;
      p.txEnd   = p.txStart + dur;
    }

    // ── prepareWinner ─────────────────────────────────────────
    let prepared=false;
    function prepareWinner(now, remainMs){
      // Vị trí vạch đích (tween từ ngoài phải vào)
      // Đặt target ở khoảng 55–70% trackW
      finLineX = trackW*(0.55+Math.random()*0.12);
      finTweenFrom  = trackW+100;
      finTweenStart = now;
      finTweenDur   = remainMs;
      if(finEl){finEl.classList.add('show');finEl.style.left=finTweenFrom+'px';}

      // Shuffle — index 0 = winner
      const chars = [...currentLanes].sort(()=>Math.random()-0.5);
      chars[0].isWinner = true;
      winnerName = chars[0].name;

      // Tính vị trí đích mỗi vịt dựa trên intersect (đường ngang y=duck.y với vạch đích)
      // Vạch đích tại thời điểm hết giờ sẽ ở finLineX
      // Gốc: finLineOuterBounds (top/bottom của vạch xuất phát nghiêng)
      // Ở đây: finLine top=(finLineX + trackH/2*TAN9, 0), bot=(finLineX - trackH/2*TAN9, trackH)

      const step = Math.min(finLineX / Math.max(chars.length,1), duckSize*1.8);

      chars.forEach((p, i) => {
        const sy = p.y + duckSize/2;  // y tâm vịt (screen)
        // Giao điểm với vạch đích nghiêng
        const pt = lineIntersect(
          {x1:0, y1:sy, x2:trackW, y2:sy},
          {x1:finLineX+trackH/2*TAN9, y1:0, x2:finLineX-trackH/2*TAN9, y2:trackH}
        );
        const charPosX = pt ? pt.x : finLineX;

        const timeDiv = 1.5 + Math.random()*1.6;
        const phase1Dur = remainMs - remainMs/timeDiv;
        const phase2Dur = remainMs/timeDiv;

        if(i===0){
          // Winner: lao thẳng tới chạm vạch
          const midX = Math.random()*(charPosX*0.5);
          pushPhase(p, now,         phase1Dur, midX);
          pushPhase(p, now+phase1Dur, phase2Dur, charPosX+duckSize);
        } else {
          // Loser: dừng trước vạch, phân bổ đều
          const safeX = Math.max(0, charPosX - step*i - Math.random()*step);
          const midX  = p.x + Math.random()*Math.max(0,safeX-p.x)*0.7;
          pushPhase(p, now,         phase1Dur, midX);
          pushPhase(p, now+phase1Dur, phase2Dur, safeX);
        }
      });
    }

    // ── Frame loop ────────────────────────────────────────────
    function frame(ts){
      if(paused||raceEnded) return;
      if(!startTs) startTs = ts - pausedMs;
      const elapsed  = ts - startTs - pausedMs;
      const remainMs = Math.max(0, durationMs - elapsed);
      const t01      = Math.min(1, elapsed/durationMs);

      updateRaceClock(remainMs);

      currentLanes.forEach(p => {
        let newX = p.x;

        if(prepared && p.tweenPhases.length){
          // Phase queue
          const ph = p.tweenPhases[0];
          if(ts >= ph.start){
            if(ph.fromX===null) ph.fromX = p.x;
            const pt = Math.min(1,(ts-ph.start)/Math.max(1,ph.dur));
            newX = ph.fromX + (ph.toX-ph.fromX)*easeIO(pt);
            if(pt>=1){ newX=ph.toX; p.tweenPhases.shift(); }
          }
        } else if(!prepared){
          // Tự do
          if(!p.txEnd || ts>=p.txEnd) schedFree(p,ts);
          if(ts>=p.txStart){
            const pt2=Math.min(1,(ts-p.txStart)/Math.max(1,p.txEnd-p.txStart));
            newX=p.txFrom+(p.txTo-p.txFrom)*easeIO(pt2);
          }
        }

        // Swim Y (bob lên xuống nhẹ, luôn chạy)
        const swimY = p.swimBaseY + Math.sin(ts/p.swimPeriod*Math.PI*2 + p.swimPhase)*p.swimAmp;
        const clampedY = Math.max(WATER_TOP+2, Math.min(trackH-duckSize-4, swimY));

        p.x = newX;
        p.y = clampedY;
        p.visualX = newX;
        p.el.style.left = newX+'px';
        p.el.style.top  = clampedY+'px';
      });

      // Vạch đích tween vào
      if(finLineX!==null && finTweenStart!==null){
        const ft=Math.min(1,(ts-finTweenStart)/Math.max(1,finTweenDur));
        const cx=finTweenFrom+(finLineX-finTweenFrom)*easeOut(ft);
        if(finEl) finEl.style.left=cx+'px';
      }

      // Kiểm tra winner chạm vạch
      if(prepared && finLineX!==null){
        currentLanes.forEach(p=>{
          if(!p.isWinner||p.finished) return;
          const fxAtY = finXatY(p.y+duckSize/2);
          if(fxAtY!==null && p.x+duckSize >= fxAtY){
            p.finished=true; p.finishRank=1;
            p.el.style.zIndex='10';
          }
        });
      }

      // Trigger prepareWinner
      const PREP_MS = Math.min(6000, durationMs*0.35);
      if(!prepared && remainMs<=PREP_MS){
        prepared=true;
        prepareWinner(ts, remainMs);
      }

      // Status
      if(!prepared){
        const leader = currentLanes.reduce((a,b)=>a.x>b.x?a:b);
        setStatus(`${currentSkin} ${leader.name} đang dẫn đầu`);
      } else {
        setStatus(`🏁 ${currentSkin} ${winnerName} đang về đích...`);
      }

      const done = currentLanes.some(p=>p.finished) || remainMs===0;
      if(!done){ raceAnimId=requestAnimationFrame(frame); }
      else { raceEnded=true; doFinish(); }
    }
    raceAnimId = requestAnimationFrame(frame);

    // ── Kết thúc ─────────────────────────────────────────────
    function doFinish(){
      cancelAnimationFrame(raceAnimId); raceAnimId=null;
      const MEDALS=['🥇','🥈','🥉'];
      const sorted=[...currentLanes].sort((a,b)=>{
        if(a.finished&&!b.finished) return -1;
        if(!a.finished&&b.finished) return 1;
        return b.x-a.x;
      });
      sorted.forEach((p,idx)=>{
        p.rank=idx+1;
        rankedList.push({name:p.name, rank:p.rank});
        if(p.rank<=3){
          const badge=document.createElement('div');
          badge.className='dr-rank-badge';
          badge.textContent=MEDALS[p.rank-1];
          badge.style.cssText=`position:absolute;top:-18px;left:0;font-size:14px;`;
          p.el.appendChild(badge);
          p.el.classList.add('rank-'+p.rank);
        }
      });

      winnerName=sorted[0].name;
      updateRaceClock(0);
      setStatus(`🏁 ${currentSkin} ${winnerName} về đích!`);

      const winner=sorted[0];
      setTimeout(()=>{
        if(winner){
          const trackRect=track.getBoundingClientRect();
          const dRect=winner.el.getBoundingClientRect();
          const dx=(trackRect.left+trackRect.width/2)-(dRect.left+dRect.width/2);
          const dy=(trackRect.top+trackRect.height/2)-(dRect.top+dRect.height/2);
          winner.el.style.transition='transform 0.5s ease';
          winner.el.style.transform=`translate(${dx}px,${dy}px) scale(2)`;
          winner.el.style.zIndex='99';
          track.classList.add('vignette-in');
        }
        playBeep(660,0.15,'triangle',0.22);
        playSfx(SFX.cheer, 0.5);
        setTimeout(()=>{
          if(winner){
            winner.el.style.transition='';
            winner.el.style.transform='';
            track.classList.remove('winner-zooming','vignette-in');
          }
          showResult(winnerName);
        }, 900);
      }, 400);
    }
  }



  function updateRaceClock(remainMs) {
    const el = $('dr-race-clock');
    if (!el) return;
    const s = Math.ceil(remainMs / 1000);
    el.textContent = '00:' + String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  function setStatus(msg) {
    $('dr-status').textContent = msg;
  }

  /* ── Vệt nước / gợn sóng — giới hạn số lượng phần tử DOM sống cùng lúc.
     Trước đây tần suất spawn tỉ lệ thuận với tốc độ (density), nghĩa là
     đúng lúc vịt bứt tốc mạnh nhất (vài giây cuối) lại sinh ra NHIỀU
     phần tử DOM nhất — cộng dồn với animation .burst chạy song song trên
     nhiều vịt, gây tụt FPS rõ rệt. Đặt trần cứng (giống kiểu object-pool
     trong các engine canvas) để chi phí DOM không bao giờ vượt ngưỡng dù
     đông vịt hay tốc độ cao. */
  let activeTrailCount  = 0;
  let activeRippleCount = 0;
  const MAX_TRAILS  = 50;
  const MAX_RIPPLES = 18;

  /* ── Vệt nước phía sau vịt — hiệu ứng tốc độ kiểu game chạy vô hạn ── */
  function spawnTrail(track, lane) {
    if (activeTrailCount >= MAX_TRAILS) return;
    activeTrailCount++;
    const dot = document.createElement('div');
    dot.className = 'dr-duck-trail';
    // Vị trí ngay sau đuôi vịt: dùng toạ độ đã tính sẵn (top của lane + left hiện tại)
    const laneTop = parseFloat(lane.el.style.top) || 0;
    dot.style.top  = (laneTop + lane.el.clientHeight / 2 - 4) + 'px';
    dot.style.left = (DUCK_START_X + lane.stagger + lane.visualX - 8) + 'px';
    track.appendChild(dot);
    setTimeout(() => { dot.remove(); activeTrailCount--; }, 520);
  }

  /* ── Gợn sóng lan rộng phía sau vịt — hiệu ứng đường đua sống động hơn ── */
  function spawnRipple(track, lane) {
    if (activeRippleCount >= MAX_RIPPLES) return;
    activeRippleCount++;
    const ring = document.createElement('div');
    ring.className = 'dr-duck-ripple';
    const laneTop = parseFloat(lane.el.style.top) || 0;
    ring.style.top  = (laneTop + lane.el.clientHeight / 2 - 12) + 'px';
    ring.style.left = (DUCK_START_X + lane.stagger + lane.visualX - 12) + 'px';
    track.appendChild(ring);
    setTimeout(() => { ring.remove(); activeRippleCount--; }, 700);
  }

  /* ── Show result ─────────────────────────────────────────── */
  function showResult(wName) {
    addHistory(wName, raceRound);
    $('dr-res-duck').textContent = currentSkin;
    $('dr-res-name').textContent = wName;

    const MEDALS = ['🥇','🥈','🥉'];
    const top3 = rankedList.slice(0, Math.min(3, rankedList.length));
    $('dr-rank-list').innerHTML = top3.map(r => `
      <div class="dr-result-rank-item">
        <span class="medal">${MEDALS[r.rank - 1] || ''}</span>
        <span class="rname">${escHtml(r.name)}</span>
        <span class="rhank">Hạng ${r.rank}</span>
      </div>
    `).join('');

    $('dr-result').classList.add('show');
    setStatus('🏆 Kết thúc!');
    launchConfetti();
    flashFinish();
    playSfx(SFX.cheer, 0.6);

    // Fanfare 3 nốt
    [523, 659, 784].forEach((f, i) => {
      setTimeout(() => playBeep(f, 0.32, 'triangle', 0.26), i * 125);
    });
  }

  /* ── Ánh chớp trắng khi về đích — nhấn nhá kịch tính ─────── */
  function flashFinish() {
    const track = $('dr-track');
    if (!track) return;
    const el = document.createElement('div');
    el.className = 'dr-finish-flash';
    track.appendChild(el);
    setTimeout(() => el.remove(), 500);
  }

  /* ── Confetti ────────────────────────────────────────────── */
  function launchConfetti() {
    const area = $('dr-confetti');
    area.innerHTML = '';
    const EMOJIS = ['🎉','⭐','🌟','✨','🎊','🏆','🦆','💛','🌈','🎈'];
    for (let i = 0; i < 30; i++) {
      const el = document.createElement('div');
      el.className = 'dr-confetti-piece';
      el.textContent = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
      el.style.left            = Math.random() * 100 + '%';
      el.style.fontSize        = (11 + Math.random() * 13) + 'px';
      el.style.animationDuration = (1.4 + Math.random() * 2) + 's';
      el.style.animationDelay  = Math.random() * 0.9 + 's';
      area.appendChild(el);
    }
  }

  /* ── Race again / remove winner ──────────────────────────── */
  function raceAgain() {
    $('dr-result').classList.remove('show');
    $('dr-confetti').innerHTML = '';
    raceRound++;
    if ($('opt-countdown').checked) doCountdown(() => runRace(names));
    else runRace(names);
  }

  function removeWinnerAndRace() {
    // Dùng biến winnerName (JS), không đọc DOM để tránh lỗi escape
    names = names.filter(n => n !== winnerName);
    if (names.length < 2) {
      backToSetup();
      showToast('Không đủ người để tiếp tục, về danh sách.');
      return;
    }
    $('dr-result').classList.remove('show');
    $('dr-confetti').innerHTML = '';
    raceRound++;
    if ($('opt-countdown').checked) doCountdown(() => runRace(names));
    else runRace(names);
  }

  /* ── Web Audio (không cần file ngoài) ───────────────────── */
  let _audioCtx = null;
  function getAudio() {
    if (!_audioCtx) {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return _audioCtx;
  }
  function playBeep(freq, dur, type = 'sine', vol = 0.2) {
    try {
      const ctx  = getAudio();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + dur);
    } catch (_) {/* Safari strict mode, ignore */}
  }

  /* ── Hiệu ứng âm thanh file (quack / airhorn / cheer) ────── */
  const SFX = {
    quacks:  ['sounds/duck0.mp3', 'sounds/duck1.mp3', 'sounds/duck2.mp3'],
    airhorn: 'sounds/airhorn.mp3',
    cheer:   'sounds/cheer.mp3',
  };
  function playSfx(src, vol = 1) {
    try {
      const a = new Audio(src);
      a.volume = vol;
      a.play().catch(() => {/* autoplay bị chặn trước tương tác đầu tiên, bỏ qua */});
    } catch (_) {/* ignore */}
  }
  function playRandomQuack(vol = 0.35) {
    const src = SFX.quacks[Math.floor(Math.random() * SFX.quacks.length)];
    playSfx(src, vol);
  }

  /* ── XSS safe ────────────────────────────────────────────── */
  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ── Init ────────────────────────────────────────────────── */
  /* ── Nhận A3K64_CONFIG từ games.js qua postMessage ─────────
     games.js gửi config sau khi iframe load xong; ta nhận và
     lưu vào window.A3K64_CONFIG để workerUrl() đọc được.     */
  window.addEventListener('message', function(e) {
    if (!e.data || e.data.type !== 'a3k64-config') return;
    const cfg = e.data.config;
    if (!cfg) return;
    // Ghi vào window để workerUrl() đọc được
    window.A3K64_CONFIG = Object.assign(window.A3K64_CONFIG || {}, cfg);
  });

  function init() {
    initSkins();
    namesInput().addEventListener('input', updateCount);
    updateCount();
    renderHistory();

    // Fullscreen icon sync
    document.addEventListener('fullscreenchange', () => {
      const isFs = !!document.fullscreenElement;
      document.querySelectorAll('[onclick="DR.toggleFullscreen()"]').forEach(btn => {
        if (btn.textContent.includes('⛶') || btn.textContent.trim() === '⛶') {
          btn.textContent = isFs ? '✕ Thoát' : '⛶';
        }
      });
    });
  }

  // Chạy khi DOM sẵn sàng
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* ── Public API ──────────────────────────────────────────── */
  return {
    shuffleNames,
    setLiveSpeed,
    setDurationInput,
    loadPreset,
    clearNames,
    startRace,
    togglePause,
    backToSetup,
    raceAgain,
    removeWinnerAndRace,
    toggleFullscreen,
    toggleHistory,
    clearHistory,
    _selectSkin,   // dùng trong inline onclick của skin buttons
  };

})();