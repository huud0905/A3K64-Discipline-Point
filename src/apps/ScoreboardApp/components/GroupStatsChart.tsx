import { getGroupStats, StudentScoreSummary } from "../data/mockScoreData";

type GroupStatsChartProps = {
  summaries: StudentScoreSummary[];
};

function niceStep(rawStep: number) {
  const exponent = Math.floor(Math.log10(Math.max(rawStep, 1)));
  const base = Math.pow(10, exponent);
  const fraction = rawStep / base;

  if (fraction <= 1) return base;
  if (fraction <= 2) return 2 * base;
  if (fraction <= 5) return 5 * base;
  return 10 * base;
}

function buildScale(values: number[]) {
  const rawMax = Math.max(0, ...values);
  const rawMin = Math.min(0, ...values);
  const rawRange = rawMax - rawMin;
  const targetRange = Math.max(50, rawRange || Math.max(Math.abs(rawMax), Math.abs(rawMin), 50));
  const step = niceStep(targetRange / 5);
  const maxY = rawMax > 0 ? Math.ceil(rawMax / step) * step : 0;
  const minY = rawMin < 0 ? Math.floor(rawMin / step) * step : 0;
  const ticks: number[] = [];

  for (let value = maxY; value >= minY; value -= step) {
    ticks.push(Number(value.toFixed(10)));
  }

  if (!ticks.includes(0)) ticks.push(0);
  return { minY, maxY: maxY === minY ? maxY + step : maxY, ticks: ticks.sort((a, b) => b - a) };
}

function formatAverage(value: number) {
  return Number(value).toFixed(1);
}

function positionFor(value: number, minY: number, maxY: number) {
  const range = maxY - minY || 1;
  return Math.max(0, Math.min(100, ((maxY - value) / range) * 100));
}

export function GroupStatsChart({ summaries }: GroupStatsChartProps) {
  const groupStats = getGroupStats(summaries);
  const values = groupStats.map((item) => item.average);
  const { minY, maxY, ticks } = buildScale(values);
  const zeroTop = positionFor(0, minY, maxY);

  return (
    <section className="score-panel chart-panel group-stats-v2-panel">
      <div className="section-heading">
        <span>📈</span>
        <strong>Thống kê tổ</strong>
      </div>

      <div className="group-stats-v2-chart">
        <div className="group-stats-v2-axis" aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick} style={{ top: `${positionFor(tick, minY, maxY)}%` }}>
              {tick}
            </span>
          ))}
        </div>

        <div className="group-stats-v2-plot">
          <div className="group-stats-v2-grid" aria-hidden="true">
            {ticks.map((tick) => (
              <i key={tick} className={tick === 0 ? "zero" : ""} style={{ top: `${positionFor(tick, minY, maxY)}%` }} />
            ))}
          </div>

          <div className="group-stats-v2-columns">
            {groupStats.map((item) => {
              const valueTop = positionFor(item.average, minY, maxY);
              const isNegative = item.average < 0;
              const height = Math.max(4, Math.abs(zeroTop - valueTop));
              const top = isNegative ? zeroTop : valueTop;

              return (
                <div className="group-stats-v2-column" key={item.group}>
                  <div className="group-stats-v2-track">
                    <div
                      className={`group-stats-v2-bar group-${item.group} ${isNegative ? "negative" : "positive"}`}
                      style={{ top: `${top}%`, height: `${height}%` }}
                    >
                      <span>{formatAverage(item.average)}</span>
                    </div>
                  </div>

                  <strong>{item.label}</strong>
                  <small>
                    TB {formatAverage(item.average)} · Tổng {item.total} · {item.members.length} HS
                  </small>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}