import './settingsCustomColorPicker.css';
import './settingsCustomColorPicker';

function getScoreModal() {
  return document.querySelector<HTMLElement>('.score-edit-modal.modern-score-editor');
}

function moveDaySwitcherIntoRecordPanel() {
  const modal = getScoreModal();
  if (!modal) return;

  const switcher = modal.querySelector<HTMLElement>('.score-day-switch-row');
  const recordPanel = modal.querySelector<HTMLElement>('.day-record-panel');
  const eventList = modal.querySelector<HTMLElement>('.day-event-list');
  if (!switcher || !recordPanel || !eventList) return;

  if (switcher.parentElement !== recordPanel) {
    recordPanel.insertBefore(switcher, eventList);
  }
}

function applyScoreModalDomPatches() {
  moveDaySwitcherIntoRecordPanel();
}

const observer = new MutationObserver(() => applyScoreModalDomPatches());
observer.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener('load', applyScoreModalDomPatches);
window.addEventListener('resize', applyScoreModalDomPatches);
applyScoreModalDomPatches();

export {};
