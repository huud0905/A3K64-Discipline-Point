const LIGHT_BACKGROUND =
  "radial-gradient(circle at 18% 12%, rgba(5, 150, 105, 0.16), transparent 31%), " +
  "radial-gradient(circle at 84% 18%, rgba(37, 99, 235, 0.10), transparent 30%), " +
  "linear-gradient(135deg, #eff6ff 0%, #f8fafc 52%, #e2e8f0 100%)";

const LIGHT_SOLID = "#eef2f7";

function normalizeThemeMode(value: string | null) {
  if (!value) return "";
  return value.toLowerCase().trim();
}

function shouldUseLightMode(root: Element | null) {
  if (root?.classList.contains("theme-light")) return true;
  const keys = ["login-theme", "login-theme-mode", "desktop-theme", "theme-mode", "theme", "app-theme", "color-mode"];
  return keys.some((key) => {
    const value = normalizeThemeMode(localStorage.getItem(key));
    return value === "light" || value === "sang" || value === "sáng";
  });
}

function setImportantStyle(element: HTMLElement | null | undefined, property: string, value: string) {
  if (!element) return;
  element.style.setProperty(property, value, "important");
}

function clearFixedBackground(element: HTMLElement | null | undefined) {
  if (!element || element.dataset.a3k64LightBgFixed !== "1") return;
  element.style.removeProperty("background");
  element.style.removeProperty("background-color");
  element.style.removeProperty("background-image");
  element.style.removeProperty("color");
  delete element.dataset.a3k64LightBgFixed;
}

function forceLightDesktopBackground() {
  const root = document.querySelector<HTMLElement>(".win-root");
  const desktop = document.querySelector<HTMLElement>(".win-root .win-desktop");
  const html = document.documentElement;
  const body = document.body;
  const appRoot = document.getElementById("root");

  if (!shouldUseLightMode(root)) {
    [html, body, appRoot, root, desktop].forEach(clearFixedBackground);
    return;
  }

  [html, body, appRoot].forEach((element) => {
    if (!element) return;
    element.dataset.a3k64LightBgFixed = "1";
    setImportantStyle(element, "background", LIGHT_SOLID);
    setImportantStyle(element, "background-color", LIGHT_SOLID);
    setImportantStyle(element, "color", "#0f172a");
  });

  if (root) {
    root.dataset.a3k64LightBgFixed = "1";
    setImportantStyle(root, "background", LIGHT_BACKGROUND);
    setImportantStyle(root, "background-color", LIGHT_SOLID);
    setImportantStyle(root, "background-image", LIGHT_BACKGROUND);
    setImportantStyle(root, "color", "#0f172a");
  }

  if (desktop) {
    desktop.dataset.a3k64LightBgFixed = "1";
    setImportantStyle(desktop, "background", LIGHT_BACKGROUND);
    setImportantStyle(desktop, "background-color", LIGHT_SOLID);
    setImportantStyle(desktop, "background-image", LIGHT_BACKGROUND);
  }
}

function installDesktopLightBackgroundFix() {
  forceLightDesktopBackground();
  window.setTimeout(forceLightDesktopBackground, 0);
  window.setTimeout(forceLightDesktopBackground, 80);
  window.setTimeout(forceLightDesktopBackground, 300);
  window.setInterval(forceLightDesktopBackground, 900);

  ["storage", "desktop-theme-change", "login-theme-change", "appearance-change", "accent-change", "login-accent-change"].forEach((eventName) => {
    window.addEventListener(eventName, () => window.setTimeout(forceLightDesktopBackground, 0));
  });

  const observer = new MutationObserver(() => forceLightDesktopBackground());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style"],
  });
}

if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installDesktopLightBackgroundFix, { once: true });
  } else {
    installDesktopLightBackgroundFix();
  }
}

export {};
