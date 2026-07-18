import type { IndustryDraftBlock } from "@/lib/api";

const SUPPORTED_CHART_TYPES = new Set(["bar", "stacked_bar", "line", "area"]);

function readSeries(value: unknown): { name: string; value: number; displayValue: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    const data = item && typeof item === "object" ? item as Record<string, unknown> : {};
    if (Array.isArray(data.points)) {
      return data.points.map((point, pointIndex) => {
        const value = point && typeof point === "object" ? point as Record<string, unknown> : {};
        const rawValue = value.value ?? value.y ?? 0;
        const parsed = Number(rawValue);
        return { name: String(value.name || value.label || `指标 ${pointIndex + 1}`), value: Number.isFinite(parsed) ? parsed : 0, displayValue: String(rawValue) };
      });
    }
    const rawValue = data.value ?? data.y ?? 0;
    const parsed = Number(rawValue);
    return { name: String(data.name || data.label || `指标 ${index + 1}`), value: Number.isFinite(parsed) ? parsed : 0, displayValue: String(rawValue) };
  });
}

export function ChartSpecBlock({ block }: { block: IndustryDraftBlock }) {
  const rawChartType = String(block.spec.chart_type || "bar");
  const chartType = SUPPORTED_CHART_TYPES.has(rawChartType) ? rawChartType : "bar";
  const series = readSeries(block.spec.series);
  const maxValue = Math.max(1, ...series.map((item) => item.value));
  const points = series.map((item, index) => `${series.length < 2 ? 50 : (index / (series.length - 1)) * 100},${92 - (item.value / maxValue) * 76}`).join(" ");
  const areaPoints = `0,100 ${points} 100,100`;
  const isTrend = chartType === "line" || chartType === "area";

  return (
    <section className="rounded-[24px] border border-white/10 bg-[#0b1320] p-4">
      <header>{block.title ? <h4 className="text-sm font-semibold text-slate-100">{block.title}</h4> : null}{block.subtitle ? <p className="mt-1 text-xs text-slate-500">{block.subtitle}</p> : null}</header>
      <div className="mt-4" data-chart-type={chartType}>
        {isTrend ? <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-36 w-full overflow-visible" role="img" aria-label={block.title || "趋势图"}>
          {chartType === "area" ? <polygon points={areaPoints} fill="rgba(56,189,248,0.18)" /> : null}
          <polyline points={points} fill="none" stroke="#38bdf8" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg> : <div className={chartType === "stacked_bar" ? "flex h-5 overflow-hidden rounded-full bg-white/[0.06]" : "space-y-3"}>
          {series.map((item, index) => chartType === "stacked_bar" ? <div key={item.name} className="h-full" style={{ width: `${(item.value / maxValue) * 100}%`, backgroundColor: ["#38bdf8", "#fb923c", "#a3e635", "#c084fc"][index % 4] }} /> : <div key={item.name} className="grid grid-cols-[minmax(0,1fr)_3fr_auto] items-center gap-3 text-sm"><span className="truncate text-slate-300">{item.name}</span><div className="h-2 rounded-full bg-white/[0.06]"><div className="h-2 rounded-full bg-[#38bdf8]" style={{ width: `${(item.value / maxValue) * 100}%` }} /></div><span className="text-slate-400">{item.displayValue}</span></div>)}
        </div>}
        {chartType === "stacked_bar" || isTrend ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{series.map((item, index) => <div key={item.name} className="flex items-center justify-between gap-3 text-xs text-slate-300"><span>{item.name}</span><span className="text-slate-400">{item.displayValue}</span>{chartType === "stacked_bar" ? <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ["#38bdf8", "#fb923c", "#a3e635", "#c084fc"][index % 4] }} /> : null}</div>)}</div> : null}
      </div>
    </section>
  );
}
