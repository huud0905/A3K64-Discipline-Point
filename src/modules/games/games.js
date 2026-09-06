/* ============================================================
   A3K64 — Games launcher
   Thêm game mới: chỉ cần thêm 1 object vào GAME_LIST bên dưới,
   trỏ "src" tới file index.html trong thư mục game tương ứng.
   ============================================================ */

const GAME_LIST = [
  {
    key: 'duckrace',
    title: 'Duck Race',
    desc: 'Quay số ngẫu nhiên chọn tên bằng cuộc đua vịt',
    icon: '🦆',
    src: 'duckrace/index.html',
    ready: true,
  },
  // Game tiếp theo thêm vào đây, ví dụ:
  // { key: 'wheel', title: 'Vòng quay may mắn', desc: '...', icon: '🎡', src: 'wheel/index.html', ready: true },
];

function renderGamesGrid() {
  const grid = document.getElementById('games-grid');
  grid.innerHTML = GAME_LIST.map(g => `
    <button class="game-card ${g.ready ? '' : 'game-card-soon'}"
      ${g.ready ? `onclick="openGame('${g.key}')"` : 'disabled'}>
      <div class="game-card-icon">${g.icon}</div>
      <h3>${g.title}</h3>
      <p>${g.ready ? g.desc : 'Sắp ra mắt'}</p>
    </button>
  `).join('');
}

function openGame(key) {
  const game = GAME_LIST.find(g => g.key === key);
  if (!game) return;
  document.getElementById('games-hub').style.display = 'none';
  document.getElementById('games-player').style.display = 'flex';
  document.getElementById('games-player-title').textContent = game.title;

  const frame = document.getElementById('games-player-frame');
  frame.src = game.src;

  // Truyền A3K64_CONFIG vào iframe sau khi load xong
  frame.onload = function() {
    try {
      const cfg = window.A3K64_CONFIG || (window.parent && window.parent.A3K64_CONFIG) || null;
      if (cfg) {
        frame.contentWindow.postMessage({ type: 'a3k64-config', config: cfg }, '*');
      }
    } catch(e) {}
  };
}

function closeGame() {
  document.getElementById('games-player').style.display = 'none';
  document.getElementById('games-hub').style.display = 'block';
  document.getElementById('games-player-frame').src = 'about:blank';
}

renderGamesGrid();