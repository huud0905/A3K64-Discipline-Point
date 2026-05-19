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
  const minimumMax = 50;
  const targetMax = Math.max(minimumMax, rawMax);
  const step = niceStep(targetMax / 5);
  const maxY = Math.max(step, Math.ceil(targetMax / step) * step);
  const ticks: number[] = [];

  for (let value = maxY; value >= 0; value -= step) {
    ticks.push(Number(value.toFixed(10)));
  }

  if (!ticks.includes(0)) ticks.push(0);
  return { maxY, ticks };
}

function formatAverage(value: number) {
  return Number(value).toFixed(1);
}

function percentFor(value: number, maxY: number) {
  return Math.max(0, Math.min(100, (value / maxY) * 100));
}

export function GroupStatsChart({ summaries }: GroupStatsChartProps) {
  const groupStats = getGroupStats(summaries);
  const values = groupStats.map((item) => item.average);
  const { maxY, ticks } = buildScale(values);

  return (
    <section className="score-panel chart-panel group-stats-v2-panel">
      <div className="section-heading">
        <span>📈</span>
        <strong>Thống kê tổ</strong>
      </div>

      <div className="group-stats-v2-chart">
        <div className="group-stats-v2-axis" aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick} style={{ top: `${100 - percentFor(tick, maxY)}%` }}>
              {tick}
            </span>
          ))}
        </div>

        <div className="group-stats-v2-plot">
          <div className="group-stats-v2-grid" aria-hidden="true">
            {ticks.map((tick) => (
              <i key={tick} className={tick === 0 ? "zero" : ""} style={{ top: `${100 - percentFor(tick, maxY)}%` }} />
            ))}
          </div>

          <div className="group-stats-v2-columns">
            {groupStats.map((item) => {
              const height = percentFor(item.average, maxY);

              return (
                <div className="group-stats-v2-column" key={item.group}>
                  <div className="group-stats-v2-track">
                    <div className={`group-stats-v2-bar group-${item.group}`} style={{ height: `${height}%` }}>
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
