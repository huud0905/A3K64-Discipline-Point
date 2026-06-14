function clearUnstableSeatingGateState() {
  const root = document.documentElement;
  root.classList.remove("a3-seat-viewer-checking", "a3-seat-viewer-denied", "a3-seat-viewer-readonly", "a3-seat-preview-editor");
  document.querySelector<HTMLElement>("#a3k64-seating-window")?.removeAttribute("data-seat-gate-message");
  document.getElementById("a3-seat-view-gate-toast")?.remove();
}

clearUnstableSeatingGateState();
window.addEventListener("a3k64:seating-changed", () => setTimeout(clearUnstableSeatingGateState, 40));
window.addEventListener("popstate", () => setTimeout(clearUnstableSeatingGateState, 40));

export {};
