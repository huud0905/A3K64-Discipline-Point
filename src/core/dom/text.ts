export function normalizedText(value: string | null | undefined) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function normalizedElementText(element: Element | null | undefined) {
  return normalizedText(element?.textContent || '');
}

export function normalizedLowerText(value: string | null | undefined) {
  return normalizedText(value).toLowerCase();
}

export function normalizedElementLowerText(element: Element | null | undefined) {
  return normalizedLowerText(element?.textContent || '');
}
