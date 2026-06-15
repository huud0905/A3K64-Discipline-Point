export function upsertStyleTag(id: string, css: string) {
  if (typeof document === 'undefined') return null;
  let style = document.getElementById(id) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = id;
    document.head.appendChild(style);
  }
  style.textContent = css;
  return style;
}

export function removeStyleTag(id: string) {
  if (typeof document === 'undefined') return;
  document.getElementById(id)?.remove();
}
