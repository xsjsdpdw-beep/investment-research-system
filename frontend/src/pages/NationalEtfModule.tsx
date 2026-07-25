import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";
import { RefreshCw } from "lucide-react";
import type { NationalDisclosure, NationalEtfItem, NationalEtfSnapshot, NationalSeriesRow } from "@/data/national-etf-dashboard";

type NationalRange = "latest" | "near1m" | "near3m" | "ytd" | "near1y" | "all";

const GROUP_CODE = "__GROUP__";
const RANGE_OPTIONS: Array<{ key: NationalRange; label: string; days?: number }> = [
  { key: "latest", label: "最新" },
  { key: "near1m", label: "近1月", days: 30 },
  { key: "near3m", label: "近3月", days: 90 },
  { key: "ytd", label: "今年以来" },
  { key: "near1y", label: "近1年", days: 250 },
  { key: "all", label: "全区间" },
];

function numeric(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(Number(value)) ? 0 : Number(value);
}

function formatValue(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString("zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatSigned(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return `${Number(value) >= 0 ? "+" : "−"}${formatValue(Math.abs(Number(value)), digits)}`;
}

function formatPercent(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `${formatValue(value)}%`;
}

function tone(value: number | null | undefined) {
  return numeric(value) > 0 ? "positive" : numeric(value) < 0 ? "negative" : "neutral";
}

function dateValue(value: string | undefined) {
  return value ? value.slice(0, 10) : "—";
}

function lastOf<T>(items: T[]) {
  return items[items.length - 1];
}

function aggregateSeries(items: NationalEtfItem[]): NationalSeriesRow[] {
  const buckets = new Map<string, NationalSeriesRow>();
  items.forEach((item) => item.series?.forEach((row) => {
    const current = buckets.get(row.date) || {
      date: row.date,
      price: null,
      avg_price: null,
      turnover_yi: 0,
      scale_yi: 0,
      units_yi: 0,
      delta_units_yi: 0,
      estimated_flow_yi: 0,
    };
    current.turnover_yi = numeric(current.turnover_yi) + numeric(row.turnover_yi);
    current.scale_yi = numeric(current.scale_yi) + numeric(row.scale_yi);
    current.units_yi = numeric(current.units_yi) + numeric(row.units_yi);
    current.delta_units_yi = numeric(current.delta_units_yi) + numeric(row.delta_units_yi);
    current.estimated_flow_yi = numeric(current.estimated_flow_yi) + numeric(row.estimated_flow_yi);
    current.price = current.units_yi ? current.scale_yi / current.units_yi : null;
    buckets.set(row.date, current);
  }));
  return [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function aggregateDisclosures(items: NationalEtfItem[]): NationalDisclosure[] {
  const buckets = new Map<string, { value: number; total: number; held: number }>();
  items.forEach((item) => item.disclosures?.forEach((row) => {
    const current = buckets.get(row.date) || { value: 0, total: 0, held: 0 };
    current.value += numeric(row.value_yi);
    current.total += numeric(row.total_shares_yi_qfq);
    if (row.ratio_pct !== null && row.ratio_pct !== undefined) current.held += numeric(row.total_shares_yi_qfq) * row.ratio_pct / 100;
    buckets.set(row.date, current);
  }));
  return [...buckets.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, row]) => ({
    date,
    ratio_pct: row.total ? row.held / row.total * 100 : null,
    value_yi: row.value || null,
    total_shares_yi_qfq: row.total || null,
  }));
}

function filterSeries(series: NationalSeriesRow[], range: NationalRange, start: string, end: string, latestDate: string) {
  if (start || end) return series.filter((row) => (!start || row.date >= start) && (!end || row.date <= end));
  if (range === "latest") {
    const latest = lastOf(series);
    return latest ? [latest] : [];
  }
  if (range === "all") return series;
  if (range === "ytd") return series.filter((row) => row.date >= `${latestDate.slice(0, 4)}-01-01`);
  const days = RANGE_OPTIONS.find((item) => item.key === range)?.days || 30;
  return series.slice(-days);
}

function rangeLabel(range: NationalRange, start: string, end: string) {
  if (start || end) return `${start || "最早可用"} — ${end || "最新可用"}`;
  return RANGE_OPTIONS.find((item) => item.key === range)?.label || "最新";
}

function ChartCard({ title, subtitle, unit, option, className = "", height = 250 }: { title: string; subtitle: string; unit: string; option: EChartsOption; className?: string; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chart.setOption(option);
    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.dispose();
    };
  }, [option]);
  return (
    <article className={`market-card national-chart-card ${className}`}>
      <div className="national-card-head"><div><h3>{title}</h3><p>{subtitle}</p></div><span>{unit}</span></div>
      <div className="national-chart-wrap" ref={ref} style={{ height }} />
    </article>
  );
}

function lineOption(rows: NationalSeriesRow[]): EChartsOption {
  return {
    animationDuration: 350,
    grid: { top: 12, right: 18, bottom: 26, left: 42, containLabel: true },
    tooltip: { trigger: "axis", backgroundColor: "#172131", borderWidth: 0, textStyle: { color: "#fffdf8", fontSize: 12 }, valueFormatter: (value) => `${formatValue(typeof value === "number" ? value : null)} 亿份` },
    xAxis: { type: "category", data: rows.map((row) => dateValue(row.date).slice(5)), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: "#73808d", fontSize: 10, hideOverlap: true } },
    yAxis: { type: "value", splitLine: { show: false }, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: "#73808d", fontSize: 10, formatter: (value: string | number) => formatValue(Number(value), 0) } },
    series: [{ type: "line", data: rows.map((row) => row.units_yi), smooth: true, symbol: "none", lineStyle: { color: "#c94b43", width: 2 }, areaStyle: { color: "rgba(201,75,67,.09)" } }],
  };
}

function flowOption(rows: NationalSeriesRow[]): EChartsOption {
  return {
    animationDuration: 350,
    grid: { top: 12, right: 18, bottom: 26, left: 42, containLabel: true },
    tooltip: { trigger: "axis", backgroundColor: "#172131", borderWidth: 0, textStyle: { color: "#fffdf8", fontSize: 12 }, valueFormatter: (value) => `${formatSigned(typeof value === "number" ? value : null)} 亿元` },
    xAxis: { type: "category", data: rows.map((row) => dateValue(row.date).slice(5)), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: "#73808d", fontSize: 10, hideOverlap: true } },
    yAxis: { type: "value", splitLine: { show: false }, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: "#73808d", fontSize: 10, formatter: (value: string | number) => formatValue(Number(value), 0) } },
    series: [{ type: "bar", barMaxWidth: 16, data: rows.map((row) => ({ value: row.estimated_flow_yi, itemStyle: { color: numeric(row.estimated_flow_yi) >= 0 ? "#c94b43" : "#2b8f84", borderRadius: [2, 2, 0, 0] } })) }],
  };
}

function industryOption(entries: Array<{ name: string; value: number }>): EChartsOption {
  return {
    animationDuration: 350,
    grid: { top: 8, right: 34, bottom: 22, left: 122, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, backgroundColor: "#172131", borderWidth: 0, textStyle: { color: "#fffdf8", fontSize: 12 }, valueFormatter: (value) => `${formatSigned(typeof value === "number" ? value : null, 1)} 亿份` },
    xAxis: { type: "value", splitLine: { show: false }, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: "#73808d", fontSize: 10, formatter: (value: string | number) => formatSigned(Number(value), 0) } },
    yAxis: { type: "category", inverse: true, data: entries.map((entry) => entry.name), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: "#172131", fontSize: 11, width: 110, overflow: "truncate" } },
    series: [{ type: "bar", barMaxWidth: 14, data: entries.map((entry) => ({ value: entry.value, itemStyle: { color: entry.value >= 0 ? "#c94b43" : "#2b8f84", borderRadius: entry.value >= 0 ? [0, 3, 3, 0] : [3, 0, 0, 3] } })) }],
  };
}

export function NationalEtfModule({ snapshot, loading, error, onRefresh }: { snapshot: NationalEtfSnapshot; loading: boolean; error: string; onRefresh: () => void }) {
  const [group, setGroup] = useState("ALL");
  const [code, setCode] = useState(GROUP_CODE);
  const [range, setRange] = useState<NationalRange>("latest");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const groups = useMemo(() => {
    const groupCodes = new Map<string, Set<string>>();
    snapshot.etfs.forEach((item) => {
      const codes = groupCodes.get(item.group) || new Set<string>();
      codes.add(item.code);
      groupCodes.set(item.group, codes);
    });
    return snapshot.groups
      .map((item) => ({ ...item, count: groupCodes.get(item.name)?.size || 0 }))
      .filter((item) => item.count > 0);
  }, [snapshot.etfs, snapshot.groups]);
  const visibleEtfs = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const byCode = new Map<string, NationalEtfItem>();
    snapshot.etfs.forEach((item) => {
      const matchesGroup = group === "ALL" || item.group === group;
      const matchesSearch = !keyword || `${item.code} ${item.name} ${item.manager || ""} ${item.group}`.toLowerCase().includes(keyword);
      if (matchesGroup && matchesSearch && !byCode.has(item.code)) byCode.set(item.code, item);
    });
    return [...byCode.values()];
  }, [group, search, snapshot.etfs]);
  const selectedItem = code === GROUP_CODE ? null : visibleEtfs.find((item) => item.code === code) || null;
  const selectedSeries = useMemo(() => selectedItem ? selectedItem.series || [] : aggregateSeries(visibleEtfs), [selectedItem, visibleEtfs]);
  const latestDate = snapshot.meta.latest_complete_market_date || snapshot.meta.latest_market_date || lastOf(selectedSeries)?.date || "";
  const rangedSeries = useMemo(() => filterSeries(selectedSeries, range, start, end, latestDate), [end, latestDate, range, selectedSeries, start]);
  const disclosures = useMemo(() => selectedItem ? selectedItem.disclosures || [] : aggregateDisclosures(visibleEtfs), [selectedItem, visibleEtfs]);
  const latestDisclosure = lastOf(disclosures) || null;
  const latestRow = lastOf(rangedSeries) || lastOf(selectedSeries) || null;
  const selectedName = selectedItem?.name || (group === "ALL" ? "全部覆盖合计" : `${lastOf(group.split(" / "))}合计`);
  const selectedGroupName = selectedItem?.group || (group === "ALL" ? "全部覆盖" : group);

  useEffect(() => {
    setCode(GROUP_CODE);
    setPage(1);
  }, [group, search, snapshot.etfs]);

  const industryEntries = useMemo(() => {
    if (group !== "ALL") return [];
    return groups.map((item) => {
      const members = snapshot.etfs.filter((etf) => etf.group === item.name);
      const series = filterSeries(aggregateSeries(members), range, start, end, latestDate);
      const first = series[0];
      const last = lastOf(series);
      const value = range === "latest" ? numeric(last?.delta_units_yi) : numeric(last?.units_yi) - numeric(first?.units_yi);
      return { name: item.name.replace(" / ", "·"), value };
    }).filter((item) => Number.isFinite(item.value)).sort((a, b) => a.value - b.value);
  }, [end, group, groups, latestDate, range, snapshot.etfs, start]);

  const tableRows = useMemo(() => [...rangedSeries].reverse(), [rangedSeries]);
  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(tableRows.length / pageSize));
  const pageRows = tableRows.slice((page - 1) * pageSize, page * pageSize);

  const lineChart = useMemo(() => lineOption(rangedSeries), [rangedSeries]);
  const flowChart = useMemo(() => flowOption(rangedSeries), [rangedSeries]);
  const industryChart = useMemo(() => industryOption(industryEntries), [industryEntries]);

  const applyCustomRange = () => {
    if (start || end) setRange("all");
  };

  return (
    <div className="national-module">
      <div className="market-toolbar national-toolbar">
        <div className="toolbar-group"><label>分组</label><select value={group} onChange={(event) => setGroup(event.target.value)}><option value="ALL">全部覆盖 · {snapshot.etfs.length}</option>{groups.map((item) => <option key={item.name} value={item.name}>{item.name} · {item.count}</option>)}</select></div>
        <div className="range-picker"><label>观察区间</label><div className="range-buttons">{RANGE_OPTIONS.map((item) => <button type="button" className={range === item.key && !start && !end ? "active" : ""} key={item.key} onClick={() => { setRange(item.key); setStart(""); setEnd(""); }}>{item.label}</button>)}</div></div>
        <div className="custom-dates"><input type="date" value={start} onChange={(event) => setStart(event.target.value)} aria-label="开始日期" /><span>—</span><input type="date" value={end} onChange={(event) => setEnd(event.target.value)} aria-label="结束日期" /><button type="button" onClick={applyCustomRange}>应用</button></div>
        <span className="period-hint">{loading ? "正在更新公开数据" : `完整数据日 ${dateValue(snapshot.meta.latest_complete_market_date || snapshot.meta.latest_market_date)}`}</span>
      </div>
      {error && <div className="range-notice national-notice">{error}。当前显示本地公开基准；<button type="button" onClick={onRefresh}>重新读取</button></div>}

      <div className="national-layout">
        <aside className="national-rail">
          <div className="national-rail-title"><span>覆盖 ETF</span><em>{group === "ALL" ? `${visibleEtfs.length} + 合计` : `${visibleEtfs.length} + 合计 / ${snapshot.etfs.length}`}</em></div>
          <div className="national-rail-list">
            <button type="button" className={`national-rail-item national-aggregate ${code === GROUP_CODE ? "active" : ""}`} onClick={() => setCode(GROUP_CODE)}><span className="national-rail-name">{group === "ALL" ? "全部覆盖合计" : `${lastOf(group.split(" / "))}合计`}</span><span className="national-rail-foot"><span>{formatPercent(latestDisclosure?.ratio_pct)}</span><span className={tone(latestRow?.estimated_flow_yi)}>{formatSigned(latestRow?.estimated_flow_yi, 1)}亿</span></span></button>
            {visibleEtfs.map((item) => {
              const disclosure = lastOf(item.disclosures || []);
              const flow = lastOf(filterSeries(item.series || [], range, start, end, latestDate))?.estimated_flow_yi;
              return <button type="button" className={`national-rail-item ${item.code === code ? "active" : ""}`} key={item.code} onClick={() => setCode(item.code)}><span className="national-rail-name">{item.name}</span><span className="national-rail-code">{item.code} · {item.manager || "公开披露"}</span><span className="national-rail-foot"><span>{formatPercent(disclosure?.ratio_pct)}</span><span className={tone(flow)}>{formatSigned(flow, 1)}亿</span></span></button>;
            })}
          </div>
        </aside>

        <main className="national-main">
          <section className="national-section-intro"><div><div className="market-eyebrow light">{selectedGroupName}</div><h2>{selectedName}</h2><p>{selectedItem ? `${selectedItem.manager || "公开披露主体"} · ${selectedItem.data_source || "交易所规模 / 公开行情 / 定期报告"}` : `${visibleEtfs.length} 只 ETF · 中央汇金、汇金资管、证金、中国诚通及其公开披露关联主体`}</p></div><div className="national-scope-chip">跟踪边界<br /><span>{snapshot.meta.scope}</span></div></section>

          <section className="kpi-grid national-kpi-grid">
            <article className="market-card kpi-card"><span className="card-eyebrow">最新披露持仓比例</span><div className="kpi-value">{formatPercent(latestDisclosure?.ratio_pct)}</div><p>{latestDisclosure ? `披露期 ${dateValue(latestDisclosure.date)}` : "暂无公开持仓披露"}</p></article>
            <article className="market-card kpi-card"><span className="card-eyebrow">DISCLOSED VALUE</span><div className="kpi-value">{latestDisclosure?.value_yi == null ? "—" : <>{formatValue(latestDisclosure.value_yi)}<small>亿</small></>}</div><p>{latestDisclosure ? `公开披露 · ${dateValue(latestDisclosure.date)}` : "暂无公开金额"}</p></article>
            <article className={`market-card kpi-card ${tone(rangedSeries.reduce((sum, row) => sum + numeric(row.estimated_flow_yi), 0))}`}><span className="card-eyebrow">EST. FLOW / SELECTED WINDOW</span><div className="kpi-value">{formatSigned(rangedSeries.reduce((sum, row) => sum + numeric(row.estimated_flow_yi), 0), 1)}<small>亿</small></div><p>{rangeLabel(range, start, end)} · ETF 整体份额估算</p></article>
            <article className="market-card kpi-card"><span className="card-eyebrow">LATEST ETF SCALE</span><div className="kpi-value">{latestRow?.scale_yi == null ? "—" : <>{formatValue(latestRow.scale_yi)}<small>亿</small></>}</div><p>{latestRow ? `规模 ${dateValue(latestRow.date)}` : "暂无日度规模"}</p></article>
          </section>

          <div className="chart-grid national-chart-grid"><ChartCard title="份额估算轨迹" subtitle="以 ETF 规模 ÷ 复权收盘价换算，观察规模变化的连续性" unit="亿份" option={lineChart} /><ChartCard title="估算净申赎" subtitle="份额变化 × ETF 成交均价" unit="亿元" option={flowChart} /></div>

          {group === "ALL" && <ChartCard className="national-industry-card" title="按行业 / 主题看 ETF 份额变化" subtitle={`全覆盖 ETF 分组汇总 · ${rangeLabel(range, start, end)} · 正值代表份额增加`} unit="亿份" option={industryChart} height={480} />}

          <section className="market-card national-disclosure-card"><div className="national-card-head"><div><h3>公开披露时间轴</h3><p>国家队及关联主体合计持仓快照；不是每日交易明细</p></div><span>{latestDisclosure?.source_label || "公开定期披露"}</span></div><div className="national-disclosure-strip">{disclosures.slice(-5).map((row, index, rows) => { const previous = rows[index - 1]; const delta = previous?.ratio_pct != null && row.ratio_pct != null ? row.ratio_pct - previous.ratio_pct : null; return <article key={row.date} className="national-disclosure"><div>{dateValue(row.date)}</div><strong>{formatPercent(row.ratio_pct)}</strong><span>{row.value_yi == null ? "—" : `${formatValue(row.value_yi)} 亿`}</span><small className={tone(delta)}>{delta == null ? "首次可见披露" : `较上期 ${formatSigned(delta)} pct`}</small></article>; })}</div></section>

          <section className="market-card national-table-card"><div className="national-table-head"><div><h3>每日跟踪明细</h3><p>展示 {rangeLabel(range, start, end)} · 共 {tableRows.length} 行明细 · 每页 20 条</p></div><span>复权口径</span><div className="national-table-actions"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索 ETF / 代码 / 主题" /><button type="button" onClick={onRefresh} title="重新读取公开数据"><RefreshCw size={14} /></button></div></div><div className="table-scroll"><table><thead><tr><th>日期</th><th>复权收盘</th><th>ETF规模（亿元）</th><th>份额估算（亿份）</th><th>份额变动</th><th>估算净申赎</th></tr></thead><tbody>{pageRows.map((row) => <tr key={row.date}><td>{dateValue(row.date)}</td><td>{formatValue(row.price, 3)}</td><td>{formatValue(row.scale_yi)}</td><td>{formatValue(row.units_yi)}</td><td className={tone(row.delta_units_yi)}>{formatSigned(row.delta_units_yi, 4)}</td><td className={tone(row.estimated_flow_yi)}>{formatSigned(row.estimated_flow_yi)} 亿</td></tr>)}</tbody></table>{!pageRows.length && <div className="empty-state">暂无可用日度数据</div>}</div>{tableRows.length > pageSize && <div className="national-pagination"><button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>上一页</button><span>{page} / {totalPages}</span><button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>下一页</button></div>}</section>
        </main>
      </div>
    </div>
  );
}
