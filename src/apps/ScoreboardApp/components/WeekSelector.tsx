import { CalendarDays, Filter, Plus } from "lucide-react";
import { FilterSelect } from "./FilterSelect";

type WeekSelectorProps = {
  week: number;
  weeks: number[];
  onWeekChange: (week: number) => void;
  viewMode?: "overview" | "groups" | "students";
  onViewModeChange?: (mode: "overview" | "groups" | "students") => void;
  canCreateWeek?: boolean;
  onCreateWeek?: () => void;
};

export function WeekSelector({
  week,
  weeks,
  onWeekChange,
  viewMode = "overview",
  onViewModeChange,
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
          />
          <button
            type="button"
            className="create-week-button"
            onClick={onCreateWeek}
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
          <FilterSelect<"overview" | "students" | "groups">
            value={viewMode}
            options={[
              { value: "overview", label: "Tổng quan" },
              { value: "students", label: "Cá nhân" },
              { value: "groups", label: "Theo tổ" },
            ]}
            onChange={onViewModeChange}
          />
        </label>
      )}
    </div>
  );
}
