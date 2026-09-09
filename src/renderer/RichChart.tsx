import { useId } from 'react';
import { RichTable } from './RichTable';

type ChartData = {
  title: string;
  type: 'bar' | 'line' | 'area';
  labels: string[];
  series: { name: string; values: number[] }[];
};
export function chartData(value: unknown): ChartData | undefined {
  if (!value || typeof value !== 'object') return;
  const c = value as ChartData;
  if (
    !['bar', 'line', 'area'].includes(c.type) ||
    typeof c.title !== 'string' ||
    c.title.length > 200 ||
    !Array.isArray(c.labels) ||
    !c.labels.length ||
    c.labels.length > 40 ||
    !c.labels.every((l) => typeof l === 'string' && l.length <= 120) ||
    !Array.isArray(c.series) ||
    !c.series.length ||
    c.series.length > 5 ||
    !c.series.every(
      (s) =>
        s &&
        typeof s.name === 'string' &&
        s.name.length <= 120 &&
        Array.isArray(s.values) &&
        s.values.length === c.labels.length &&
        s.values.every((v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e15),
    )
  )
    return;
  return c;
}
const format = (value: number) =>
  value !== 0 && Math.abs(value) < 0.001
    ? value.toExponential(1)
    : new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(
        value,
      );
export function RichChart({ value }: { value: unknown }) {
  const id = useId();
  const c = chartData(value);
  if (!c)
    return (
      <p className="rich-notice">
        This chart needs a type, title, labels and matching numeric series.
      </p>
    );
  const values = c.series.flatMap((s) => s.values);
  const min = Math.min(0, ...values),
    max = Math.max(0, ...values);
  const range = max - min || 1;
  const rawTick = Math.max(range / 4, Number.MIN_VALUE);
  const magnitude = 10 ** Math.floor(Math.log10(rawTick)) || Number.MIN_VALUE;
  const tick = [1, 2, 5, 10].find((n) => n * magnitude >= rawTick)! * magnitude;
  const top = Math.ceil((max || (min === 0 ? 1 : 0)) / tick) * tick;
  const bottom = Math.floor(min / tick) * tick;
  const y = (n: number) => 230 - ((n - bottom) / (top - bottom)) * 206;
  const step = 490 / c.labels.length;
  const x = (n: number) => 66 + step * (n + 0.5);
  const stride = Math.max(1, Math.ceil(c.labels.length / 8));
  return (
    <figure className="rich-figure rich-chart">
      <figcaption>{c.title}</figcaption>
      <svg viewBox="0 0 580 280" role="img" aria-labelledby={id}>
        <title id={id}>{c.title}</title>
        <desc>{c.type} chart. Exact values are available in the data table below.</desc>
        {Array.from(
          { length: Math.round((top - bottom) / tick) + 1 },
          (_, i) => bottom + tick * i,
        ).map((v, i) => (
          <g key={i} className="chart-axis">
            <line x1="66" x2="556" y1={y(v)} y2={y(v)} />
            <text x="54" y={y(v) + 4} textAnchor="end">
              {format(v)}
            </text>
          </g>
        ))}
        <line className="chart-baseline" x1="66" x2="556" y1={y(0)} y2={y(0)} />
        {c.labels.map(
          (label, i) =>
            i % stride === 0 && (
              <text className="chart-label" key={i} x={x(i)} y="255" textAnchor="middle">
                <title>{label}</title>
                {label.length > 12 ? label.slice(0, 10) + '…' : label}
              </text>
            ),
        )}
        {c.series.map((s, si) => {
          const points = s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
          return (
            <g key={si} className={`chart-series series-${si}`}>
              {c.type === 'area' && (
                <polygon
                  className="chart-area"
                  points={`${x(0)},${y(0)} ${points} ${x(c.labels.length - 1)},${y(0)}`}
                />
              )}
              {c.type !== 'bar' && <polyline className="chart-line" points={points} />}
              {s.values.map((v, i) =>
                c.type === 'bar' ? (
                  <rect
                    key={i}
                    x={x(i) - step * 0.36 + (si * step * 0.72) / c.series.length}
                    y={Math.min(y(v), y(0))}
                    width={(step * 0.65) / c.series.length}
                    height={Math.max(0.5, Math.abs(y(v) - y(0)))}
                    rx="2"
                  >
                    <title>{`${c.labels[i]} · ${s.name}: ${v}`}</title>
                  </rect>
                ) : (
                  <circle key={i} cx={x(i)} cy={y(v)} r="3.5">
                    <title>{`${c.labels[i]} · ${s.name}: ${v}`}</title>
                  </circle>
                ),
              )}
            </g>
          );
        })}
      </svg>
      <div className="chart-legend">
        {c.series.map((s, i) => (
          <span key={i}>
            <i className={`series-${i}`} />
            {s.name}
          </span>
        ))}
      </div>
      <details>
        <summary>View chart data</summary>
        <RichTable
          title={`${c.title} data`}
          columns={['Category', ...c.series.map((s) => s.name)]}
          rows={c.labels.map((l, i) => [l, ...c.series.map((s) => s.values[i])])}
        />
      </details>
    </figure>
  );
}
