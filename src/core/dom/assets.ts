export function appendScriptOnce(id: string, src: string, options: { defer?: boolean } = {}) {
  if (typeof document === 'undefined') return null;
  let script = document.getElementById(id) as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.defer = options.defer ?? true;
    document.head.appendChild(script);
  }
  return script;
}

export function appendStylesheetOnce(id: string, href: string) {
  if (typeof document === 'undefined') return null;
  let link = document.getElementById(id) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }
  return link;
}
