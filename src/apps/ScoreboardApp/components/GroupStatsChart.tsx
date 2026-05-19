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
  const rawMin = Math.min(0, ...values);
  const rawMax = Math.max(0, ...values);
  const allNonNegative = values.every((value) => value >= 0);
  const allNonPositive = values.every((value) => value <= 0);
  const range = Math.max(20, rawMax - rawMin);
  const step = niceStep(range / 5);

  let minY = allNonNegative ? 0 : Math.floor(rawMin / step) * step;
  let maxY = allNonPositive ? 0 : Math.ceil(rawMax / step) * step;

  if (minY === maxY) {
    if (minY === 0) maxY = step;
    else {
      minY -= step;
      maxY += step;
    }
  }

  if (allNonNegative && maxY <= rawMax) maxY += step;
  if (allNonPositive && minY >= rawMin) minY -= step;

  const ticks: number[] = [];
  for (let value = maxY; value >= minY; value -= step) ticks.push(Number(value.toFixed(10)));

  if (!ticks.includes(0)) {
    ticks.push(0);
    ticks.sort((a, b) => b - a);
  }

  return { minY, maxY, ticks };
}

function percentFor(value: number, minY: number, maxY: number) {
  return ((maxY - value) / (maxY - minY)) * 100;
}

function formatAverage(value: number) {
  return Number(value).toFixed(1);
}

export function GroupStatsChart({ summaries }: GroupStatsChartProps) {
  const groupStats = getGroupStats(summaries);
  const values = groupStats.map((item) => item.average);
  const { minY, maxY, ticks } = buildScale(values);
  const zeroTop = percentFor(0, minY, maxY);

  return (
    <section className="score-panel chart-panel">
      <div className="section-heading">
        <span>📈</span>
        <strong>Thống kê tổ</strong>
      </div>

      <div className="group-chart-modern">
        <div className="chart-axis-labels" aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick} style={{ top: `${percentFor(tick, minY, maxY)}%` }}>
              {tick}
            </span>
          ))}
        </div>

        <div className="chart-grid-lines" aria-hidden="true">
          {ticks.map((tick) => (
            <i key={tick} className={tick === 0 ? "zero" : ""} style={{ top: `${percentFor(tick, minY, maxY)}%` }} />
          ))}
        </div>

        <div className="chart-columns-area">
          {groupStats.map((item) => {
            const value = item.average;
            const valueTop = percentFor(value, minY, maxY);
            const isPositive = value >= 0;
            const height = Math.max(8, Math.abs(valueTop - zeroTop));

            return (
              <div className="chart-modern-column" key={item.group}>
                <div className="chart-modern-track">
                  <div
                    className={`chart-modern-bar group-${item.group} ${isPositive ? "positive" : "negative"}`}
                    style={{ top: isPositive ? `${valueTop}%` : `${zeroTop}%`, height: `${height}%` }}
                  >
                    <span className="chart-value">{formatAverage(value)}</span>
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
    </section>
  );
}
