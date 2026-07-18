import type { IndustryDraftBlock } from "@/lib/api";

const SUPPORTED_CHART_TYPES = new Set(["bar", "stacked_bar", "line", "area"]);
const SERIES_COLORS = ["#38bdf8", "#fb923c", "#a3e635", "#c084fc"];

type ChartPoint = { name: string; value: number; displayValue: string };
type ChartSeries = { name: string; points: ChartPoint[] };

function readPoint(value: unknown, index: number): ChartPoint {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const rawValue = data.value ?? data.y ?? 0;
  const parsed = Number(rawValue);
  return { name: String(data.name || data.label || `指标 ${index + 1}`), value: Number.isFinite(parsed) ? parsed : 0, displayValue: String(rawValue) };
}

function readSeries(value: unknown): ChartSeries[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const data = item && typeof item === "object" ? item as Record<string, unknown> : {};
    if (Array.isArray(data.points)) {
      return { name: String(data.name || `系列 ${index + 1}`), points: data.points.map(readPoint) };
    }
    const point = readPoint(data, index);
    return { name: point.name, points: [point] };
  });
}

export function ChartSpecBlock({ block }: { block: IndustryDraftBlock }) {
  const rawChartType = String(block.spec.chart_type || "bar");
  const chartType = SUPPORTED_CHART_TYPES.has(rawChartType) ? rawChartType : "bar";
  const series = readSeries(block.spec.series);
  const points = series.flatMap((item) => item.points);
  const maxValue = Math.max(1, ...points.map((item) => item.value));
  const isTrend = chartType === "line" || chartType === "area";

  return (
    <section className="rounded-[24px] border border-white/10 bg-[#0b1320] p-4">
      <header>{block.title ? <h4 className="text-sm font-semibold text-slate-100">{block.title}</h4> : null}{block.subtitle ? <p className="mt-1 text-xs text-slate-500">{block.subtitle}</p> : null}</header>
      <div className="mt-4" data-chart-type={chartType}>
        {isTrend ? <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-36 w-full overflow-visible" role="img" aria-label={block.title || "趋势图"}>
          {series.map((item, seriesIndex) => {
            const pathPoints = item.points.map((point, pointIndex) => `${item.points.length < 2 ? 50 : (pointIndex / (item.points.length - 1)) * 100},${92 - (point.value / maxValue) * 76}`).join(" ");
            const color = SERIES_COLORS[seriesIndex % SERIES_COLORS.length];
            return <g key={item.name} data-series-name={item.name}>
              {chartType === "area" ? <polygon points={`0,100 ${pathPoints} 100,100`} fill={color} fillOpacity="0.16" /> : null}
              <polyline points={pathPoints} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </g>;
          })}
        </svg> : <div className={chartType === "stacked_bar" ? "flex h-5 overflow-hidden rounded-full bg-white/[0.06]" : "space-y-3"}>
          {points.map((item, index) => chartType === "stacked_bar" ? <div key={`${item.name}-${index}`} className="h-full" style={{ width: `${(item.value / maxValue) * 100}%`, backgroundColor: SERIES_COLORS[index % SERIES_COLORS.length] }} /> : <div key={`${item.name}-${index}`} className="grid grid-cols-[minmax(0,1fr)_3fr_auto] items-center gap-3 text-sm"><span className="truncate text-slate-300">{item.name}</span><div className="h-2 rounded-full bg-white/[0.06]"><div className="h-2 rounded-full bg-[#38bdf8]" style={{ width: `${(item.value / maxValue) * 100}%` }} /></div><span className="text-slate-400">{item.displayValue}</span></div>)}
        </div>}
        {chartType === "stacked_bar" || isTrend ? <div className="mt-3 grid gap-3 sm:grid-cols-2">{series.map((item, index) => <div key={item.name} className="space-y-1 text-xs text-slate-300"><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: SERIES_COLORS[index % SERIES_COLORS.length] }} /><span>{item.name}</span></div>{item.points.map((point, pointIndex) => <div key={`${point.name}-${pointIndex}`} className="flex justify-between gap-3 pl-4 text-slate-400"><span>{point.name}</span><span>{point.displayValue}</span></div>)}</div>)}</div> : null}
      </div>
    </section>
  );
}
