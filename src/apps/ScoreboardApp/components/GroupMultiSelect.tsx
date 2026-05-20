import { Check, ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export type GroupId = "1" | "2" | "3" | "4";

const GROUP_OPTIONS: { value: GroupId; label: string }[] = [
  { value: "1", label: "Tổ 1" },
  { value: "2", label: "Tổ 2" },
  { value: "3", label: "Tổ 3" },
  { value: "4", label: "Tổ 4" },
];

type GroupMultiSelectProps = {
  value: GroupId[];
  onChange: (value: GroupId[]) => void;
  disabled?: boolean;
  title?: string;
};

function getLabel(value: GroupId[]) {
  if (!value.length || value.length === GROUP_OPTIONS.length) return "Tất cả tổ";
  return GROUP_OPTIONS.filter((option) => value.includes(option.value)).map((option) => option.label).join(" + ");
}

function normalizeGroups(groups: GroupId[]) {
  const unique = GROUP_OPTIONS.map((option) => option.value).filter((value) => groups.includes(value));
  return unique.length === GROUP_OPTIONS.length ? [] : unique;
}

export function GroupMultiSelect({ value, onChange, disabled = false, title }: GroupMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const selected = useMemo(() => normalizeGroups(value), [value]);
  const allSelected = selected.length === 0;

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
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

  const chooseAll = () => onChange([]);

  const toggleGroup = (group: GroupId) => {
    if (allSelected) {
      onChange([group]);
      return;
    }

    const next = selected.includes(group) ? selected.filter((item) => item !== group) : [...selected, group];
    onChange(normalizeGroups(next));
  };

  return (
    <div className={`filter-select group-multi-select ${open ? "open" : ""}`} ref={ref}>
      <button
        type="button"
        className="filter-select-button"
        disabled={disabled}
        title={title}
        onClick={() => setOpen((state) => !state)}
      >
        <span>{getLabel(selected)}</span>
        <ChevronDown size={16} />
      </button>

      {open && !disabled && (
        <div className="filter-select-menu group-multi-menu">
          <button type="button" className={`filter-select-option group-multi-option ${allSelected ? "active" : ""}`} onClick={chooseAll}>
            <span className="group-check-box">{allSelected && <Check size={14} />}</span>
            <span>Tất cả tổ</span>
          </button>

          {GROUP_OPTIONS.map((option) => {
            const checked = !allSelected && selected.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                className={`filter-select-option group-multi-option ${checked ? "active" : ""}`}
                onClick={() => toggleGroup(option.value)}
              >
                <span className="group-check-box">{checked && <Check size={14} />}</span>
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
