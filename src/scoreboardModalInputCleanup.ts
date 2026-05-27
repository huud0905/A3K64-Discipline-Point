import './settingsCustomColorPicker.css';
import './settingsCustomColorPicker';
import './accentPersistenceFix';
import './settingsDesktopHierarchyFix.css';
import './settingsPhoneLightModeFix.css';

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

function setNativeInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function clearSpecialScoreFields() {
  const modal = getScoreModal();
  if (!modal) return;
  const specialForm = modal.querySelector<HTMLElement>('.special-score-form');
  if (!specialForm) return;
  const inputs = Array.from(specialForm.querySelectorAll<HTMLInputElement>('input'));
  inputs.forEach((input) => setNativeInputValue(input, ''));
}

function installSpecialScoreGuard() {
  if ((window as typeof window & { __a3k64SpecialScoreGuard?: boolean }).__a3k64SpecialScoreGuard) return;
  (window as typeof window & { __a3k64SpecialScoreGuard?: boolean }).__a3k64SpecialScoreGuard = true;

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const pickedNormalRule = target.closest('.rule-suggestion-menu button, .rule-card');
    const addedSpecialScore = target.closest('.special-score-form .score-add-button');

    if (pickedNormalRule || addedSpecialScore) {
      window.setTimeout(clearSpecialScoreFields, 0);
      window.setTimeout(clearSpecialScoreFields, 80);
    }
  }, true);
}

function applyScoreModalDomPatches() {
  moveDaySwitcherIntoRecordPanel();
  installSpecialScoreGuard();
}

const observer = new MutationObserver(() => applyScoreModalDomPatches());
observer.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener('load', applyScoreModalDomPatches);
window.addEventListener('resize', applyScoreModalDomPatches);
applyScoreModalDomPatches();

export {};
