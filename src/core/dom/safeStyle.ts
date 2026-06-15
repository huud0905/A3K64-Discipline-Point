export function upsertStyleTag(id: string, css: string) {
  if (typeof document === 'undefined') return null;
  let style = document.getElementById(id) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
    return style;
  }
  if (style.textContent !== css) style.textContent = css;
  return style;
}
