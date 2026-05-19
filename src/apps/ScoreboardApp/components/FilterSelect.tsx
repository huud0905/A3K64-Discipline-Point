import { ChevronDown } from "lucide-react";
import { CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type FilterSelectOption<T extends string | number> = {
  value: T;
  label: string;
};

type FilterSelectProps<T extends string | number> = {
  value: T;
  options: FilterSelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  title?: string;
  placement?: "bottom" | "top";
  portal?: boolean;
  menuClassName?: string;
  menuMaxHeight?: number | "none";
};

type FloatingStyle = CSSProperties & Record<`--${string}`, string | number>;

function isLightThemeActive() {
  if (typeof document === "undefined") return false;
  return Boolean(
    document.documentElement.classList.contains("light") ||
    document.body.classList.contains("light") ||
    document.querySelector(".theme-light, .win-root.theme-light, .light")
  );
}

function estimateMenuHeight(optionCount: number, menuClassName: string, menuMaxHeight: number | "none" | undefined) {
  if (typeof menuMaxHeight === "number") return menuMaxHeight;
  const isTwoColumn = menuClassName.includes("subject-floating-menu");
  const rows = isTwoColumn ? Math.ceil(optionCount / 2) : optionCount;
  return rows * 38 + 14;
}

export function FilterSelect<T extends string | number>({
  value,
  options,
  onChange,
  disabled = false,
  title,
  placement = "bottom",
  portal = false,
  menuClassName = "",
  menuMaxHeight,
}: FilterSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<FloatingStyle>({});
  const [lightPortal, setLightPortal] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const current = options.find((option) => option.value === value) || options[0];

  const updateFloatingPosition = () => {
    if (!portal || !buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const gap = 8;
    const safeTop = 8;
    const safeBottom = 88;
    const viewportBottom = window.innerHeight - safeBottom;
    const estimatedHeight = estimateMenuHeight(options.length, menuClassName, menuMaxHeight);
    const bottomSpace = Math.max(0, viewportBottom - rect.bottom - gap);
    const topSpace = Math.max(0, rect.top - safeTop - gap);
    const needsClamp = menuMaxHeight !== "none";
    const maxHeightNumber = needsClamp
      ? Math.max(120, placement === "top" ? topSpace : bottomSpace)
      : estimatedHeight;
    const maxHeight = menuMaxHeight === "none"
      ? "none"
      : `${Math.min(typeof menuMaxHeight === "number" ? menuMaxHeight : maxHeightNumber, maxHeightNumber)}px`;

    const floatingTop = placement === "top"
      ? Math.max(safeTop, rect.top - estimatedHeight - gap)
      : Math.min(rect.bottom + gap, viewportBottom - Math.min(estimatedHeight, maxHeightNumber));

    const nextStyle: FloatingStyle = {
      position: "fixed",
      left: rect.left,
      top: floatingTop,
      bottom: "auto",
      minWidth: rect.width,
      width: rect.width,
      zIndex: 99999,
      "--filter-menu-left": `${rect.left}px`,
      "--filter-menu-top": `${floatingTop}px`,
      "--filter-menu-bottom": "auto",
      "--filter-menu-width": `${rect.width}px`,
      "--filter-menu-max-height": maxHeight,
    };

    setMenuStyle(nextStyle);
  };

  useLayoutEffect(() => {
    if (open) {
      setLightPortal(isLightThemeActive());
      updateFloatingPosition();
    }
  }, [open, placement, portal, menuMaxHeight, options.length, menuClassName]);

  useEffect(() => {
    if (!open) return;
    const sync = () => updateFloatingPosition();
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    };
  }, [open, placement, portal, menuMaxHeight, options.length, menuClassName]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!ref.current?.contains(target) && !(target instanceof Element && target.closest(".filter-select-menu.portal-menu"))) {
        setOpen(false);
      }
    };

    const closeOnEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", closeOnEsc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", closeOnEsc);
    };
  }, []);

  const menu = open && !disabled ? (
    <div
      className={`filter-select-menu ${portal ? "portal-menu" : ""} ${portal && lightPortal ? "light-portal-menu" : ""} ${placement === "top" ? "menu-top" : ""} ${menuClassName}`}
      style={portal ? menuStyle : undefined}
    >
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          className={`filter-select-option ${option.value === value ? "active" : ""}`}
          onClick={() => {
            onChange(option.value);
            setOpen(false);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div className={`filter-select ${open ? "open" : ""}`} ref={ref}>
      <button
        ref={buttonRef}
        type="button"
        className="filter-select-button"
        disabled={disabled}
        title={title}
        onClick={() => setOpen((state) => !state)}
      >
        <span>{current?.label || "Chọn"}</span>
        <ChevronDown size={16} />
      </button>

      {portal ? (menu ? createPortal(menu, document.body) : null) : menu}
    </div>
  );
}
