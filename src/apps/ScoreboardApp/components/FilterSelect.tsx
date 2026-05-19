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
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const ref = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const current = options.find((option) => option.value === value) || options[0];

  const updateFloatingPosition = () => {
    if (!portal || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const base: CSSProperties = {
      position: "fixed",
      left: rect.left,
      minWidth: rect.width,
      width: rect.width,
      zIndex: 99999,
    };

    if (placement === "top") {
      base.bottom = Math.max(8, window.innerHeight - rect.top + 8);
      if (menuMaxHeight !== "none") base.maxHeight = menuMaxHeight ?? Math.max(180, rect.top - 24);
    } else {
      base.top = Math.min(window.innerHeight - 8, rect.bottom + 8);
      if (menuMaxHeight !== "none") base.maxHeight = menuMaxHeight ?? Math.max(180, window.innerHeight - rect.bottom - 24);
    }

    setMenuStyle(base);
  };

  useLayoutEffect(() => {
    if (open) updateFloatingPosition();
  }, [open, placement, portal, menuMaxHeight]);

  useEffect(() => {
    if (!open) return;
    const sync = () => updateFloatingPosition();
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    };
  }, [open, placement, portal, menuMaxHeight]);

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
    <div className={`filter-select-menu ${portal ? "portal-menu" : ""} ${placement === "top" ? "menu-top" : ""} ${menuClassName}`} style={portal ? menuStyle : undefined}>
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
