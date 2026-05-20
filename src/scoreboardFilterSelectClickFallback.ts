type ReactHost = HTMLElement & Record<string, unknown>;

type ReactButtonProps = {
  onPointerDown?: (event: unknown) => void;
  onClick?: (event: unknown) => void;
};

function getReactProps(element: HTMLElement): ReactButtonProps | null {
  const host = element as ReactHost;
  const key = Object.keys(host).find((item) => item.startsWith('__reactProps$'));
  if (!key) return null;
  return (host[key] as ReactButtonProps) || null;
}

function pointInside(element: HTMLElement, x: number, y: number) {
  const rect = element.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function findScoreModalSelectButton(event: PointerEvent) {
  const target = event.target as Element | null;
  const direct = target?.closest?.('.score-edit-modal.modern-score-editor .filter-select-button') as HTMLButtonElement | null;
  if (direct) return direct;

  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.score-edit-modal.modern-score-editor .filter-select-button'));
  return buttons.find((button) => pointInside(button, event.clientX, event.clientY)) || null;
}

function openReactFilterSelect(button: HTMLButtonElement, nativeEvent: PointerEvent) {
  if (button.disabled) return false;
  const props = getReactProps(button);
  if (!props?.onPointerDown && !props?.onClick) return false;

  nativeEvent.preventDefault();
  nativeEvent.stopPropagation();
  nativeEvent.stopImmediatePropagation();

  const fakeEvent = {
    preventDefault() {},
    stopPropagation() {},
    currentTarget: button,
    target: button,
    nativeEvent,
  };

  if (props.onPointerDown) props.onPointerDown(fakeEvent);
  else props.onClick?.(fakeEvent);
  return true;
}

function installFilterSelectFallback() {
  if ((window as unknown as { __a3k64SelectFallback?: boolean }).__a3k64SelectFallback) return;
  (window as unknown as { __a3k64SelectFallback?: boolean }).__a3k64SelectFallback = true;

  document.addEventListener(
    'pointerdown',
    (event) => {
      const button = findScoreModalSelectButton(event);
      if (!button) return;
      openReactFilterSelect(button, event);
    },
    true,
  );
}

installFilterSelectFallback();

export {};
