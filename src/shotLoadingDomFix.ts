function fixShotLoadingDom() {
  const loading = document.getElementById('a3-shot-loading');
  const card = loading?.firstElementChild as HTMLElement | null;
  if (!card || card.querySelector('.a3-shot-loading-copy')) return;
  const title = card.querySelector('strong');
  const text = card.querySelector('span');
  if (!title || !text) return;
  const box = document.createElement('div');
  box.className = 'a3-shot-loading-copy';
  box.appendChild(title);
  box.appendChild(text);
  card.appendChild(box);
}

window.setInterval(fixShotLoadingDom, 120);
fixShotLoadingDom();

export {};