import { CalendarDays, Filter, Plus } from "lucide-react";
import { FilterSelect } from "./FilterSelect";

type ViewMode = "overview" | "students";

type WeekSelectorProps = {
  week: number;
  weeks: number[];
  onWeekChange: (week: number) => void;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  viewModeDisabled?: boolean;
  canCreateWeek?: boolean;
  onCreateWeek?: () => void;
};

export function WeekSelector({
  week,
  weeks,
  onWeekChange,
  viewMode = "overview",
  onViewModeChange,
  viewModeDisabled = false,
  canCreateWeek = false,
  onCreateWeek,
}: WeekSelectorProps) {
  return (
    <div className="score-filter-bar">
      <label className="score-filter">
        <span>
          <CalendarDays size={15} />
          Tuần
        </span>
        <div className="week-select-row">
          <FilterSelect<number>
            value={week}
            options={weeks.map((item) => ({ value: item, label: `Tuần ${item}` }))}
            onChange={onWeekChange}
            portal
            menuClassName="week-floating-menu"
            menuMaxHeight="none"
          />
          <button
            type="button"
            className="create-week-button"
            onClick={() => {
              if (!canCreateWeek) return;
              onCreateWeek?.();
            }}
            disabled={!canCreateWeek}
            title={canCreateWeek ? "Tạo tuần mới" : "Chỉ tổ trưởng, lớp trưởng, bí thư hoặc GVCN được tạo tuần mới"}
          >
            <Plus size={16} />
          </button>
        </div>
      </label>

      {onViewModeChange && (
        <label className="score-filter">
          <span>
            <Filter size={15} />
            Chế độ xem
          </span>
          <FilterSelect<ViewMode>
            value={viewMode}
            options={[
              { value: "overview", label: "Tổng quan" },
              { value: "students", label: "Cá nhân" },
            ]}
            onChange={onViewModeChange}
            disabled={viewModeDisabled}
            title={viewModeDisabled ? "Bảng chấm không dùng chế độ xem" : undefined}
          />
        </label>
      )}
    </div>
  );
}
