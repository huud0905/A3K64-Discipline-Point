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

function blankNumberZero(input: HTMLInputElement) {
  if (input.value === '0') {
    input.value = '';
    input.setAttribute('value', '');
  }
}

function clearDefaultSpecialScoreZero() {
  const modal = getScoreModal();
  if (!modal) return;

  const inputs = Array.from(modal.querySelectorAll<HTMLInputElement>('.special-score-form input[type="number"]'));
  inputs.forEach((input) => {
    input.placeholder = 'Điểm';
    blankNumberZero(input);

    if (input.dataset.a3k64ZeroCleared === '1') return;
    input.dataset.a3k64ZeroCleared = '1';

    const clearSoon = () => {
      blankNumberZero(input);
      requestAnimationFrame(() => blankNumberZero(input));
      window.setTimeout(() => blankNumberZero(input), 40);
      window.setTimeout(() => blankNumberZero(input), 120);
    };

    input.addEventListener('focus', clearSoon);
    input.addEventListener('click', clearSoon);
    input.addEventListener('keydown', () => {
      if (input.value === '0') input.value = '';
    });
  });
}

function applyScoreModalDomPatches() {
  moveDaySwitcherIntoRecordPanel();
  clearDefaultSpecialScoreZero();
}

const observer = new MutationObserver(() => applyScoreModalDomPatches());
observer.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener('load', applyScoreModalDomPatches);
window.addEventListener('resize', applyScoreModalDomPatches);
window.setInterval(applyScoreModalDomPatches, 250);
applyScoreModalDomPatches();

export {};
