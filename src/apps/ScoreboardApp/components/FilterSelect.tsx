import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
};

export function FilterSelect<T extends string | number>({
  value,
  options,
  onChange,
  disabled = false,
  title,
}: FilterSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const current = options.find((option) => option.value === value) || options[0];

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
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

  return (
    <div className={`filter-select ${open ? "open" : ""}`} ref={ref}>
      <button
        type="button"
        className="filter-select-button"
        disabled={disabled}
        title={title}
        onClick={() => setOpen((state) => !state)}
      >
        <span>{current?.label || "Chọn"}</span>
        <ChevronDown size={16} />
      </button>

      {open && !disabled && (
        <div className="filter-select-menu">
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
      )}
    </div>
  );
}
