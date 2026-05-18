import { PointerEvent, useMemo, useRef, useState } from "react";
import { GroupStatsChart } from "../components/GroupStatsChart";
import { StudentTable } from "../components/StudentTable";
import { getGroupStats, StudentScoreSummary } from "../data/mockScoreData";

type OverviewGroupsPageProps = {
  summaries: StudentScoreSummary[];
  week: number;
  onOpenStudent: (studentId: string) => void;
};

const DEFAULT_ORDER = [1, 2, 3, 4];
const GROUP_ORDER_KEY = "a3k64-overview-group-order-v2";

type DragState = {
  group: number;
  startX: number;
  deltaX: number;
  pointerId: number;
};

function normalizeOrder(order: number[]) {
  const valid = order.filter((group, index, list) => DEFAULT_ORDER.includes(group) && list.indexOf(group) === index);
  return [...valid, ...DEFAULT_ORDER.filter((group) => !valid.includes(group))];
}

function readOrder() {
  try {
    const saved = localStorage.getItem(GROUP_ORDER_KEY);
    return normalizeOrder(saved ? JSON.parse(saved) : DEFAULT_ORDER);
  } catch {
    return DEFAULT_ORDER;
  }
}

function moveItem(order: number[], group: number, targetIndex: number) {
  const next = normalizeOrder(order);
  const from = next.indexOf(group);
  const to = Math.max(0, Math.min(next.length - 1, targetIndex));
  if (from < 0 || from === to) return next;
  const [removed] = next.splice(from, 1);
  next.splice(to, 0, removed);
  return next;
}

export function OverviewGroupsPage({ summaries, week, onOpenStudent }: OverviewGroupsPageProps) {
  const gridRef = useRef<HTMLElement | null>(null);
  const groupStats = getGroupStats(summaries);
  const [order, setOrder] = useState<number[]>(readOrder);
  const [drag, setDrag] = useState<DragState | null>(null);

  const orderedGroups = useMemo(() => {
    return normalizeOrder(order)
      .map((groupNumber) => groupStats.find((item) => item.group === groupNumber))
      .filter((group): group is NonNullable<typeof group> => Boolean(group));
  }, [groupStats, order]);

  const startDrag = (event: PointerEvent<HTMLDivElement>, groupNumber: number) => {
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, select, textarea")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ group: groupNumber, startX: event.clientX, deltaX: 0, pointerId: event.pointerId });
  };

  const updateDrag = (event: PointerEvent<HTMLElement>) => {
    if (!drag) return;
    setDrag({ ...drag, deltaX: event.clientX - drag.startX });
  };

  const finishDrag = () => {
    if (!drag) return;

    const currentIndex = order.indexOf(drag.group);
    const gridWidth = gridRef.current?.clientWidth || 1;
    const columnWidth = Math.max(1, gridWidth / DEFAULT_ORDER.length);
    const offset = Math.round(drag.deltaX / columnWidth);
    const targetIndex = currentIndex + offset;
    const nextOrder = moveItem(order, drag.group, targetIndex);

    setOrder(nextOrder);
    localStorage.setItem(GROUP_ORDER_KEY, JSON.stringify(nextOrder));
    setDrag(null);
  };

  return (
    <div className="score-page overview-compact-page">
      <GroupStatsChart summaries={summaries} />

      <section
        ref={gridRef}
        className={`group-overview-grid ordered-groups ${drag ? "is-dragging" : ""}`}
        aria-label={`Bảng tổng quan tuần ${week}`}
        onPointerMove={updateDrag}
        onPointerUp={finishDrag}
        onPointerCancel={() => setDrag(null)}
      >
        {orderedGroups.map((group) => {
          const isDragging = drag?.group === group.group;

          return (
            <div
              className={`group-overview-card ordered-group-card ${isDragging ? "dragging" : ""}`}
              key={group.group}
              style={isDragging ? { transform: `translateX(${drag.deltaX}px)`, zIndex: 6 } : undefined}
            >
              <div
                className="group-overview-title draggable-group-title"
                onPointerDown={(event) => startDrag(event, group.group)}
                title="Giữ chuột và kéo ngang để đổi vị trí tổ"
              >
                <span className="group-drag-grip" aria-hidden="true">⋮⋮</span>
                <span>Tổ {group.group}</span>
                <small>Kéo ngang</small>
              </div>
              <StudentTable students={group.members} compact onOpenStudent={onOpenStudent} />
            </div>
          );
        })}
      </section>
    </div>
  );
}
