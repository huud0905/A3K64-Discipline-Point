function clearDefaultSpecialScoreZero() {
  const modal = document.querySelector('.score-edit-modal.modern-score-editor');
  if (!modal) return;

  const inputs = Array.from(modal.querySelectorAll<HTMLInputElement>('.special-score-form input[type="number"]'));
  inputs.forEach((input) => {
    if (input.dataset.a3k64ZeroCleared === '1') return;
    input.dataset.a3k64ZeroCleared = '1';
    if (input.value === '0') input.value = '';
    input.addEventListener('focus', () => {
      if (input.value === '0') input.value = '';
    });
  });
}

const observer = new MutationObserver(() => clearDefaultSpecialScoreZero());
observer.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener('load', clearDefaultSpecialScoreZero);
clearDefaultSpecialScoreZero();

export {};
