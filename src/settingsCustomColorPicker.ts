type HsvColor = { h: number; s: number; v: number };

type RgbColor = { r: number; g: number; b: number };

const DEFAULT_COLORS = [
  '#2563eb', '#7c3aed', '#db2777', '#059669', '#d97706', '#dc2626',
  '#0ea5e9', '#06b6d4', '#14b8a6', '#16a34a', '#f59e0b', '#f97316',
  '#f43f5e', '#8b5cf6', '#64748b', '#334155',
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isHex(value: string) {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

function expandHex(hex: string) {
  const raw = hex.trim().replace('#', '');
  if (raw.length === 3) return `#${raw.split('').map((item) => item + item).join('')}`.toLowerCase();
  return `#${raw}`.toLowerCase();
}

function componentToHex(value: number) {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0');
}

function rgbToHex({ r, g, b }: RgbColor) {
  return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`.toLowerCase();
}

function hexToRgb(hex: string): RgbColor {
  const full = expandHex(hex).replace('#', '');
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function rgbToHsv({ r, g, b }: RgbColor): HsvColor {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;

  if (delta !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
    else h = 60 * ((rn - gn) / delta + 4);
  }

  if (h < 0) h += 360;
  const s = max === 0 ? 0 : delta / max;
  return { h, s, v: max };
}

function hsvToRgb({ h, s, v }: HsvColor): RgbColor {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;

  if (h < 60) [rp, gp, bp] = [c, x, 0];
  else if (h < 120) [rp, gp, bp] = [x, c, 0];
  else if (h < 180) [rp, gp, bp] = [0, c, x];
  else if (h < 240) [rp, gp, bp] = [0, x, c];
  else if (h < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];

  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
  };
}

function getCurrentAccent() {
  return getComputedStyle(document.documentElement).getPropertyValue('--desktop-accent').trim()
    || localStorage.getItem('desktop-accent')
    || localStorage.getItem('login-accent-color')
    || '#ef4444';
}

function saveAccent(color: string) {
  const normalized = expandHex(color);
  const accentKey = DEFAULT_COLORS.includes(normalized) ? normalized : 'custom';

  localStorage.setItem('desktop-accent', normalized);
  localStorage.setItem('desktop-accent-color', normalized);
  localStorage.setItem('login-accent', accentKey === 'custom' ? 'custom' : normalized);
  localStorage.setItem('login-accent-color', normalized);
  localStorage.setItem('login-custom-accent', normalized);
  localStorage.setItem('accent-color', normalized);
  localStorage.setItem('accent', accentKey);
  document.documentElement.style.setProperty('--desktop-accent', normalized);

  window.dispatchEvent(new Event('accent-change'));
  window.dispatchEvent(new Event('login-accent-change'));
  window.dispatchEvent(new Event('appearance-change'));
}

function placePicker(nativeInput: HTMLInputElement, picker: HTMLElement) {
  const colorSection = nativeInput.closest('.color-section');
  const colorCard = nativeInput.closest('.color-card') || nativeInput.closest('.settings-card') || nativeInput.parentElement;
  const recentColors = colorSection?.querySelector('.recent-colors');
  const legacyGrid = colorSection?.querySelector('.windows-color-grid') || colorCard?.querySelector('.windows-color-grid');
  const legacyLabel = legacyGrid?.previousElementSibling;

  legacyGrid?.classList.add('a3-native-palette-hidden');
  if (legacyLabel?.classList.contains('color-label')) legacyLabel.classList.add('a3-native-palette-hidden');

  picker.classList.add('a3-color-picker-near-recent');

  if (recentColors?.parentElement) {
    recentColors.insertAdjacentElement('afterend', picker);
    return;
  }

  colorSection?.appendChild(picker) || colorCard?.appendChild(picker);
}

function makePicker(nativeInput: HTMLInputElement) {
  if (nativeInput.dataset.a3PickerReady === '1') return;
  nativeInput.dataset.a3PickerReady = '1';
  nativeInput.classList.add('a3-native-color-hidden');
  nativeInput.closest('.custom-color-actions')?.classList.add('a3-native-color-row-hidden');
  nativeInput.closest('.custom-color-row')?.classList.add('a3-native-color-row-hidden');

  const picker = document.createElement('div');
  picker.className = 'a3-color-picker';

  const initial = isHex(nativeInput.value) ? expandHex(nativeInput.value) : expandHex(getCurrentAccent());
  let hsv = rgbToHsv(hexToRgb(initial));
  let hex = initial;

  picker.innerHTML = `
    <div class="a3-picker-head">
      <div><strong>Bảng màu tùy chỉnh</strong><span>Chọn nhanh hoặc kéo để đổi màu real-time.</span></div>
      <span class="a3-picker-preview" aria-hidden="true"></span>
    </div>
    <div class="a3-palette-grid" aria-label="Màu mặc định"></div>
    <div class="a3-custom-title">Tùy chỉnh màu</div>
    <div class="a3-sv-plane" role="slider" aria-label="Độ sáng và độ bão hòa"><span class="a3-sv-thumb"></span></div>
    <div class="a3-hue-row"><span>Hue</span><div class="a3-hue-slider" role="slider" aria-label="Dải màu"><span class="a3-hue-thumb"></span></div></div>
    <div class="a3-picker-fields">
      <label class="a3-field hex-field"><span>HEX</span><input class="a3-hex" maxlength="7" spellcheck="false" /></label>
      <label class="a3-field"><span>R</span><input class="a3-r" type="number" min="0" max="255" /></label>
      <label class="a3-field"><span>G</span><input class="a3-g" type="number" min="0" max="255" /></label>
      <label class="a3-field"><span>B</span><input class="a3-b" type="number" min="0" max="255" /></label>
    </div>
  `;

  placePicker(nativeInput, picker);

  const palette = picker.querySelector<HTMLElement>('.a3-palette-grid')!;
  const preview = picker.querySelector<HTMLElement>('.a3-picker-preview')!;
  const svPlane = picker.querySelector<HTMLElement>('.a3-sv-plane')!;
  const svThumb = picker.querySelector<HTMLElement>('.a3-sv-thumb')!;
  const hueSlider = picker.querySelector<HTMLElement>('.a3-hue-slider')!;
  const hueThumb = picker.querySelector<HTMLElement>('.a3-hue-thumb')!;
  const hexInput = picker.querySelector<HTMLInputElement>('.a3-hex')!;
  const rInput = picker.querySelector<HTMLInputElement>('.a3-r')!;
  const gInput = picker.querySelector<HTMLInputElement>('.a3-g')!;
  const bInput = picker.querySelector<HTMLInputElement>('.a3-b')!;

  DEFAULT_COLORS.forEach((color) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'a3-swatch';
    button.style.setProperty('--swatch', color);
    button.title = color;
    button.innerHTML = '<span></span>';
    button.addEventListener('click', () => setHex(color));
    palette.appendChild(button);
  });

  function render() {
    const rgb = hexToRgb(hex);
    nativeInput.value = hex;
    preview.style.background = hex;
    svPlane.style.background = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))`;
    svThumb.style.left = `${hsv.s * 100}%`;
    svThumb.style.top = `${(1 - hsv.v) * 100}%`;
    hueThumb.style.left = `${(hsv.h / 360) * 100}%`;
    hueThumb.style.background = `hsl(${hsv.h} 100% 50%)`;
    hexInput.value = hex;
    rInput.value = String(rgb.r);
    gInput.value = String(rgb.g);
    bInput.value = String(rgb.b);

    picker.querySelectorAll<HTMLElement>('.a3-swatch').forEach((item) => {
      item.classList.toggle('active', item.title.toLowerCase() === hex.toLowerCase());
      item.innerHTML = item.title.toLowerCase() === hex.toLowerCase() ? '✓' : '<span></span>';
    });
  }

  function commit() {
    saveAccent(hex);
    nativeInput.dispatchEvent(new Event('input', { bubbles: true }));
    nativeInput.dispatchEvent(new Event('change', { bubbles: true }));
    render();
  }

  function setHex(value: string) {
    if (!isHex(value)) return;
    hex = expandHex(value);
    hsv = rgbToHsv(hexToRgb(hex));
    commit();
  }

  function setHsv(next: HsvColor) {
    hsv = { h: clamp(next.h, 0, 359.999), s: clamp(next.s, 0, 1), v: clamp(next.v, 0, 1) };
    hex = rgbToHex(hsvToRgb(hsv));
    commit();
  }

  function updateSv(event: PointerEvent) {
    const rect = svPlane.getBoundingClientRect();
    const s = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const v = 1 - clamp((event.clientY - rect.top) / rect.height, 0, 1);
    setHsv({ ...hsv, s, v });
  }

  function updateHue(event: PointerEvent) {
    const rect = hueSlider.getBoundingClientRect();
    const h = clamp((event.clientX - rect.left) / rect.width, 0, 1) * 360;
    setHsv({ ...hsv, h });
  }

  function bindDrag(target: HTMLElement, handler: (event: PointerEvent) => void) {
    target.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      target.setPointerCapture(event.pointerId);
      handler(event);
      const move = (moveEvent: PointerEvent) => handler(moveEvent);
      const up = () => {
        target.removeEventListener('pointermove', move);
        target.removeEventListener('pointerup', up);
        target.removeEventListener('pointercancel', up);
      };
      target.addEventListener('pointermove', move);
      target.addEventListener('pointerup', up);
      target.addEventListener('pointercancel', up);
    });
  }

  bindDrag(svPlane, updateSv);
  bindDrag(hueSlider, updateHue);

  hexInput.addEventListener('input', () => {
    const value = hexInput.value.trim();
    if (isHex(value)) setHex(value);
  });

  [rInput, gInput, bInput].forEach((input) => {
    input.addEventListener('input', () => {
      const rgb = {
        r: clamp(Number(rInput.value), 0, 255),
        g: clamp(Number(gInput.value), 0, 255),
        b: clamp(Number(bInput.value), 0, 255),
      };
      setHex(rgbToHex(rgb));
    });
  });

  render();
}

function enhanceColorPickers() {
  document.querySelectorAll<HTMLInputElement>('.settings-app input[type="color"], .settings-mobile-native input[type="color"]').forEach(makePicker);
}

enhanceColorPickers();

const observer = new MutationObserver(() => enhanceColorPickers());
observer.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener('appearance-change', enhanceColorPickers);
window.addEventListener('accent-change', enhanceColorPickers);
