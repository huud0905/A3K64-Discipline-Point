function getBubbleText(bubble: Element) {
  return (bubble.querySelector('p')?.textContent || '').trim();
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
  if (setter) setter.call(textarea, value);
  else textarea.value = value;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
}

function toast(text: string) {
  const old = document.querySelector('.a3-message-action-toast');
  old?.remove();
  const node = document.createElement('div');
  node.className = 'messages-toast a3-message-action-toast';
  node.textContent = text;
  document.querySelector('.messages-native-app')?.appendChild(node);
  window.setTimeout(() => node.remove(), 2200);
}

function patchBubble(bubble: HTMLElement) {
  if (bubble.dataset.a3BubbleActions === '1') return;
  bubble.dataset.a3BubbleActions = '1';
  const meta = bubble.querySelector('span')?.textContent || '';
  if (meta) bubble.title = meta;

  const actions = document.createElement('div');
  actions.className = 'a3-message-hover-actions';
  actions.innerHTML = '<button type="button" data-action="react" title="React">😊</button><button type="button" data-action="reply" title="Trả lời">↩</button><button type="button" data-action="more" title="Thêm">⋮</button><div class="a3-message-more-menu"><button type="button" data-action="forward">Chuyển tiếp</button><button type="button" data-action="remove-me">Gỡ bên phía bạn</button><button type="button" data-action="unsend">Thu hồi cả 2 phía</button><button type="button" data-action="pin">Ghim</button></div>';
  actions.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const target = event.target as HTMLElement;
    const action = target.closest('[data-action]')?.getAttribute('data-action');
    if (!action) return;
    if (action === 'react') {
      const existing = bubble.querySelector('.a3-message-reaction');
      if (existing) existing.remove();
      else {
        const reaction = document.createElement('span');
        reaction.className = 'a3-message-reaction';
        reaction.textContent = '❤️';
        bubble.appendChild(reaction);
      }
    }
    if (action === 'reply') {
      const textarea = document.querySelector<HTMLTextAreaElement>('.messages-composer textarea');
      const text = getBubbleText(bubble);
      if (textarea && text) {
        setTextareaValue(textarea, 'Trả lời: "' + text.slice(0, 80) + '"\n');
        textarea.focus();
      }
    }
    if (action === 'more') bubble.classList.toggle('a3-more-open');
    if (action === 'forward') toast('Chuyển tiếp sẽ thêm ở bước tiếp theo.');
    if (action === 'remove-me' || action === 'unsend') {
      bubble.remove();
      toast(action === 'unsend' ? 'Đã thu hồi tin nhắn.' : 'Đã gỡ bên phía bạn.');
    }
    if (action === 'pin') {
      bubble.classList.toggle('a3-pinned-message');
      toast(bubble.classList.contains('a3-pinned-message') ? 'Đã ghim tin nhắn.' : 'Đã bỏ ghim.');
    }
  });
  bubble.appendChild(actions);
}

function patchAll() {
  document.querySelectorAll<HTMLElement>('.messages-bubble').forEach(patchBubble);
}

function init() {
  patchAll();
  const observer = new MutationObserver(patchAll);
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}

export {};
