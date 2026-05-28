function setReactInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function openSelectedContact(button: HTMLButtonElement) {
  const app = button.closest('.messages-native-app');
  const box = button.closest('.messages-new-thread');
  const input = box?.querySelector<HTMLInputElement>('.messages-contact-box input');
  const createButton = box?.querySelector<HTMLButtonElement>(':scope > button');
  const name = (button.querySelector('strong')?.textContent || button.textContent || '').trim();
  if (!app || !input || !createButton || !name) return;

  setReactInputValue(input, name);
  window.setTimeout(() => createButton.click(), 80);
}

function initMessageSuggestionOpenPatch() {
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest('.messages-contact-suggestions button') as HTMLButtonElement | null;
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    openSelectedContact(button);
  }, true);
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initMessageSuggestionOpenPatch, { once: true });
  else initMessageSuggestionOpenPatch();
}

export {};
