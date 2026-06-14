declare global {
  interface Window {
    zapi_external?: Record<string, unknown>;
    external?: Record<string, unknown>;
  }
}

try {
  if (typeof window !== "undefined") {
    window.zapi_external = window.zapi_external || {};
    window.external = window.external || {};
  }
} catch {
  // Ignore browser global guard failures.
}

export {};
