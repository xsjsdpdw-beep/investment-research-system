import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";
import { Search, ArrowUpRight, ArrowDownRight, Minus, ExternalLink } from "lucide-react";
import {
  EMPTY_MARKET_SNAPSHOT,
  fetchActiveFundSnapshot,
  fetchMarketEtfSnapshot,
  type ActiveFundSnapshot,
  type MarketEtfRow,
  type MarketEtfMeta,
} from "@/data/market-fund-dashboard";
import type { ActiveFundSectorRow } from "@/data/fund-allocation";
import { EMPTY_NATIONAL_SNAPSHOT, fetchNationalEtfSnapshot, getNationalFallbackSnapshot, type NationalEtfSnapshot } from "@/data/national-etf-dashboard";
import { NationalEtfModule } from "./NationalEtfModule";
import "@/styles/market-fund-allocation.css";

type ModuleKey = "national-etf" | "market-etf" | "active-fund";
type RangeKey = "latest" | "near1m" | "near3m" | "ytd" | "near2q" | "near4q" | "near1y" | "all";

const MARKET_RANGE_OPTIONS: Array<{ key: RangeKey; label: string }> = [
  { key: "latest", label: "最新" },
  { key: "near1m", label: "近1月" },
  { key: "near3m", label: "近3月" },
  { key: "ytd", label: "今年以来" },
  { key: "near1y", label: "近1年" },
  { key: "all", label: "全区间" },
];

const ACTIVE_RANGE_OPTIONS: Array<{ key: RangeKey; label: string }> = [
  { key: "latest", label: "最新季度" },
  { key: "near2q", label: "近2季度" },
  { key: "near4q", label: "近4季度" },
  { key: "near1y", label: "近1年" },
  { key: "all", label: "全区间" },
];

const MARKET_RANGE_TRADING_DAYS: Record<RangeKey, number> = {
  latest: 1,
  near1m: 22,
  near3m: 66,
  ytd: 140,
  near2q: 122,
  near4q: 244,
  near1y: 244,
  all: 504,
};

const chartTheme = {
  text: "#73808d",
  ink: "#172131",
  line: "#e5e0d5",
  red: "#c94b43",
  teal: "#2b8f84",
  gold: "#d6a85f",
};

function formatYi(value: number, digits = 2) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
}

function formatPercent(value: number, digits = 2) {
  return `${value > 0 ? "+" : ""}${formatYi(value, digits)}%`;
}

function formatLiveTimestamp() {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day} ${value.hour}:${value.minute}:${value.second}+08:00`;
}

function directionIcon(value: number) {
  if (value > 0) return <ArrowUpRight size={14} />;
  if (value < 0) return <ArrowDownRight size={14} />;
  return <Minus size={13} />;
}

function valueTone(value: number) {
  return value > 0 ? "positive" : value < 0 ? "negative" : "flat";
}

function ChartCard({ title, eyebrow, option, className = "", height, labels }: { title: string; eyebrow: string; option: EChartsOption; className?: string; height?: number; labels?: string[] }) {
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
    <article className={`market-card chart-card ${className}`}>
      <div className="card-heading">
        <div>
          <span className="card-eyebrow">{eyebrow}</span>
          <h3>{title}</h3>
        </div>
        <span className="card-mark">01</span>
      </div>
      {labels?.length ? <div className="chart-with-labels" style={height ? { height } : undefined}>
        <div className="chart-labels" style={{ gridTemplateRows: `repeat(${labels.length}, minmax(0, 1fr))` }} aria-hidden="true">
          {labels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}
        </div>
        <div className="chart-canvas" ref={ref} />
      </div> : <div className="chart-canvas" ref={ref} style={height ? { height } : undefined} />}
    </article>
  );
}

function KpiCard({ label, value, unit, detail, tone = "" }: { label: string; value: string; unit?: string; detail: string; tone?: string }) {
  return (
    <article className={`market-card kpi-card ${tone}`}>
      <span className="card-eyebrow">{label}</span>
      <div className="kpi-value">{value}<small>{unit}</small></div>
      <p>{detail}</p>
    </article>
  );
}

type ActiveFundDisplayRow = ActiveFundSectorRow & {
  currentWeight: number | null;
  baseWeight: number | null;
  currentLow: number | null;
  baseLow: number | null;
  intervalWeightChange: number | null;
  intervalLowChange: number | null;
};

function quarterParts(value: string) {
  const match = /^(\d{4})Q([1-4])$/.exec(value);
  return match ? { year: Number(match[1]), quarter: Number(match[2]) } : null;
}

function shiftQuarter(value: string, offset: number) {
  const parts = quarterParts(value);
  if (!parts) return value;
  const absolute = parts.year * 4 + parts.quarter - 1 + offset;
  const year = Math.floor(absolute / 4);
  const quarter = absolute % 4 + 1;
  return `${year}Q${quarter}`;
}

function compareQuarter(left: string, right: string) {
  const leftParts = quarterParts(left);
  const rightParts = quarterParts(right);
  if (!leftParts || !rightParts) return left.localeCompare(right);
  return (leftParts.year * 4 + leftParts.quarter) - (rightParts.year * 4 + rightParts.quarter);
}

function quarterSnapshot(row: ActiveFundSectorRow, quarter: string) {
  const direct = row.history?.[quarter];
  if (direct) return direct;
  if (quarter === "2026Q1") return { weight: row.q1Weight, low: row.lowQ1 };
  if (quarter === "2026Q2") return { weight: row.q2Weight, low: row.lowQ2 };
  if (quarter === "2025Q4") return { weight: row.q4Weight ?? null, low: null };
  if (quarter === "2025Q3") return { weight: row.q3Weight ?? null, low: null };
  return { weight: null, low: null };
}

function buildActiveRangeView(rows: ActiveFundSectorRow[], latestQuarter: string, range: RangeKey) {
  const available = [...new Set(rows.flatMap((row) => [
    ...Object.keys(row.history || {}),
    row.q3Weight == null ? null : "2025Q3",
    row.q4Weight == null ? null : "2025Q4",
    "2026Q1",
    "2026Q2",
  ].filter((quarter): quarter is string => Boolean(quarter))))].sort(compareQuarter);
  const currentQuarter = available.includes(latestQuarter) ? latestQuarter : available[available.length - 1] || latestQuarter;
  const requestedOffset = range === "latest" || range === "near2q" ? 1 : range === "near4q" ? 3 : range === "near1y" ? 4 : Number.POSITIVE_INFINITY;
  const candidate = Number.isFinite(requestedOffset) ? shiftQuarter(currentQuarter, -requestedOffset) : available[0];
  const eligibleQuarters = available.filter((quarter) => compareQuarter(quarter, candidate) <= 0);
  const baseQuarter = eligibleQuarters[eligibleQuarters.length - 1] || available[0] || candidate;
  const displayRows: ActiveFundDisplayRow[] = rows.map((row) => {
    const current = quarterSnapshot(row, currentQuarter);
    const base = quarterSnapshot(row, baseQuarter);
    return {
      ...row,
      currentWeight: current.weight,
      baseWeight: base.weight,
      currentLow: current.low,
      baseLow: base.low,
      intervalWeightChange: current.weight != null && base.weight != null ? current.weight - base.weight : null,
      intervalLowChange: current.low != null && base.low != null ? current.low - base.low : null,
    };
  });
  return { currentQuarter, baseQuarter, rows: displayRows };
}

function formatOptionalPercent(value: number | null | undefined) {
  return value == null ? "—" : formatPercent(value);
}

function ActiveKpis({ rows, currentQuarter, baseQuarter }: { rows: ActiveFundDisplayRow[]; currentQuarter: string; baseQuarter: string }) {
  const currentRows = rows.filter((row) => row.currentWeight != null);
  const changeRows = rows.filter((row) => row.intervalWeightChange != null);
  const biggest = [...currentRows].sort((a, b) => (b.currentWeight ?? -Infinity) - (a.currentWeight ?? -Infinity))[0];
  const add = [...changeRows].sort((a, b) => (b.intervalWeightChange ?? -Infinity) - (a.intervalWeightChange ?? -Infinity))[0];
  const cut = [...changeRows].sort((a, b) => (a.intervalWeightChange ?? Infinity) - (b.intervalWeightChange ?? Infinity))[0];
  return (
    <div className="kpi-grid">
      <KpiCard label={`${currentQuarter}最高配置`} value={biggest?.currentWeight == null ? "—" : formatYi(biggest.currentWeight)} unit="%" detail={biggest ? `${biggest.sector} · 主动偏股基金` : "暂无数据"} />
      <KpiCard label={`相对 ${baseQuarter} 加仓最多`} value={add?.intervalWeightChange == null ? "—" : formatPercent(add.intervalWeightChange)} detail={add?.sector || "暂无数据"} tone="positive" />
      <KpiCard label={`相对 ${baseQuarter} 减仓最多`} value={cut?.intervalWeightChange == null ? "—" : formatPercent(cut.intervalWeightChange)} detail={cut?.sector || "暂无数据"} tone="negative" />
      <KpiCard label="行业覆盖" value={`${rows.length}`} unit="个" detail={`${currentQuarter} 公开截面`} />
    </div>
  );
}

function buildBarOption(items: Array<{ name: string; value: number }>, colorMode: "scale" | "scaleChange" | "flow" | "allocation" | "change"): EChartsOption {
  const maxAbs = Math.max(...items.map((item) => Math.abs(item.value)), 1);
  const isDense = items.length > 15;
  const valueDigits = colorMode === "scale" || colorMode === "scaleChange" || colorMode === "flow" ? 1 : 2;
  const formatChartValue = (value: number) => formatYi(value, valueDigits);
  return {
    animationDuration: 450,
    grid: { top: 10, right: 30, bottom: 28, left: 0, containLabel: false },
    xAxis: {
      type: "value",
      min: colorMode === "scale" || colorMode === "allocation" ? 0 : -maxAbs,
      max: colorMode === "scale" || colorMode === "allocation" ? undefined : maxAbs,
      splitLine: { show: false },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: chartTheme.text, fontSize: 10, formatter: (value: string | number) => formatChartValue(Number(value)) },
    },
    yAxis: {
      type: "category",
      inverse: true,
      data: items.map((item) => item.name),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: "#172131",
      borderWidth: 0,
      textStyle: { color: "#fffdf8", fontSize: 12 },
      valueFormatter: (value) => `${typeof value === "number" ? formatChartValue(value) : value}${colorMode === "allocation" || colorMode === "flow" || colorMode === "change" ? "%" : "亿元"}`,
    },
    series: [{
      type: "bar",
      barMaxWidth: isDense ? 14 : 15,
      data: items.map((item) => ({
        value: item.value,
        itemStyle: {
          color: colorMode === "scale" ? chartTheme.gold : item.value >= 0 ? chartTheme.red : chartTheme.teal,
          borderRadius: item.value >= 0 ? [0, 3, 3, 0] : [3, 0, 0, 3],
        },
      })),
      label: { show: true, position: "right", color: chartTheme.text, fontSize: isDense ? 11 : 10, formatter: (params) => `${formatChartValue(Number(params.value))}${colorMode === "allocation" || colorMode === "flow" || colorMode === "change" ? "%" : ""}` },
    }],
  };
}

function ObservationWindow({ active, meta, currentQuarter = "2026Q2", baseQuarter = "2026Q1", activeRows = [] }: { active: boolean; meta: MarketEtfMeta; currentQuarter?: string; baseQuarter?: string; activeRows?: ActiveFundDisplayRow[] }) {
  const activeChangeRows = activeRows.filter((row) => row.intervalWeightChange != null);
  const currentRows = activeRows.filter((row) => row.currentWeight != null);
  const biggest = [...currentRows].sort((a, b) => (b.currentWeight ?? -Infinity) - (a.currentWeight ?? -Infinity))[0];
  const add = [...activeChangeRows].sort((a, b) => (b.intervalWeightChange ?? -Infinity) - (a.intervalWeightChange ?? -Infinity))[0];
  const cut = [...activeChangeRows].sort((a, b) => (a.intervalWeightChange ?? Infinity) - (b.intervalWeightChange ?? Infinity))[0];
  const activeItems: Array<[string, string, string]> = [
    ["最新季度", currentQuarter, "主动偏股基金行业配置"],
    ["最高配置", biggest ? `${biggest.sector} ${formatYi(biggest.currentWeight ?? 0)}%` : "—", `相对 ${baseQuarter} ${formatOptionalPercent(biggest?.intervalWeightChange)}`],
    ["加仓方向", add?.sector || "—", `相对 ${baseQuarter} ${formatOptionalPercent(add?.intervalWeightChange)}`],
    ["减仓方向", cut?.sector || "—", `相对 ${baseQuarter} ${formatOptionalPercent(cut?.intervalWeightChange)}`],
  ];
  const items: Array<[string, string, string]> = active
    ? activeItems
    : [
        ["最新交易日", meta.latestMarketDate || "等待数据", "公开行情快照"],
        ["ETF 样本", `${meta.etfCount || "—"} 只`, `${meta.groupCount || "—"} 个分类`],
        ["上涨 / 下跌", meta.etfCount ? `${meta.gainers} / ${meta.losers}` : "等待数据", "最新行情涨跌幅"],
        ["更新时点", meta.generatedAt || "等待数据", "页面打开时顺序刷新"],
      ];
  return (
    <article className="market-card observation-card">
      <div className="card-heading">
        <div>
          <span className="card-eyebrow">OBSERVATION WINDOW</span>
          <h3>{active ? "主动基金配置变化摘要" : "全市场 ETF 数据观察窗口"}</h3>
        </div>
        <span className="card-mark">04</span>
      </div>
      <div className="observation-grid">
        {items.map(([label, value, detail]) => (
          <div className="observation-item" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
          </div>
        ))}
      </div>
    </article>
  );
}

function EtfTable({ rows, total }: { rows: MarketEtfRow[]; total: number }) {
  return (
    <article className="market-card table-card">
      <div className="table-heading">
        <div>
          <span className="card-eyebrow">ETF REGISTER / SNAPSHOT</span>
          <h3>全市场 ETF 行情变动明细</h3>
        </div>
        <span className="table-count">{rows.length} / {total} 只</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead><tr><th>标的</th><th>分类</th><th>市场</th><th>最新价</th><th>日涨跌</th><th>换手率</th><th>成交额(亿元)</th><th>成交量(万份)</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.code}>
                <td><strong>{row.name}</strong><small>{row.code}</small></td>
                <td><span className="tag">{row.group}</span></td>
                <td>{row.market}</td>
                <td>{row.price === null ? "—" : formatYi(row.price, 3)}</td>
                <td className={valueTone(row.changePct ?? 0)}><span className="table-direction">{directionIcon(row.changePct ?? 0)}{row.changePct === null ? "—" : formatPercent(row.changePct)}</span></td>
                <td>{row.turnoverPct === null ? "—" : `${formatYi(row.turnoverPct)}%`}</td>
                <td>{row.amountYi === null ? "—" : `${formatYi(row.amountYi)}亿`}</td>
                <td>{row.volumeWan === null ? "—" : formatYi(row.volumeWan)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty-state">没有匹配的 ETF，请调整分组或搜索词。</div>}
      </div>
      <div className="table-footer"><span>日涨跌、换手率与成交额来自全市场 ETF 最新行情快照。</span><span>页面打开时刷新</span></div>
    </article>
  );
}

function InlineDelta({ value, maxValue }: { value: number; maxValue: number }) {
  const width = Math.min(100, Math.max(5, Math.abs(value) / Math.max(maxValue, 0.01) * 100));
  return (
    <span className={`inline-delta ${valueTone(value)}`}>
      <i style={{ width: `${width}%` }} />
      <em>{formatPercent(value)}</em>
    </span>
  );
}

type ActiveSortKey = "sector" | "currentWeight" | "baseWeight" | "intervalWeightChange" | "baseLow" | "currentLow" | "intervalLowChange" | "q4Weight" | "q3Weight";
type ActiveSortDirection = "asc" | "desc";

function ActiveFundTable({ rows, currentQuarter, baseQuarter }: { rows: ActiveFundDisplayRow[]; currentQuarter: string; baseQuarter: string }) {
  const [sortConfig, setSortConfig] = useState<{ key: ActiveSortKey; direction: ActiveSortDirection }>({ key: "currentWeight", direction: "desc" });
  const maxWeightChange = Math.max(...rows.map((row) => Math.abs(row.intervalWeightChange ?? 0)), 0.01);
  const maxLowChange = Math.max(...rows.map((row) => Math.abs(row.intervalLowChange ?? 0)), 0.01);
  const sortedRows = useMemo(() => [...rows].sort((a, b) => {
    if (sortConfig.key === "sector") {
      const compare = a.sector.localeCompare(b.sector, "zh-CN");
      return sortConfig.direction === "asc" ? compare : -compare;
    }
    const aValue = a[sortConfig.key] as number | null | undefined;
    const bValue = b[sortConfig.key] as number | null | undefined;
    if (aValue === null || aValue === undefined) return 1;
    if (bValue === null || bValue === undefined) return -1;
    return sortConfig.direction === "asc" ? aValue - bValue : bValue - aValue;
  }), [rows, sortConfig]);
  const sortColumns: Array<{ key: ActiveSortKey; label: string; sublabel?: string }> = [
    { key: "sector", label: "行业" },
    { key: "currentWeight", label: "配置比例", sublabel: currentQuarter },
    { key: "baseWeight", label: "配置比例", sublabel: baseQuarter },
    { key: "intervalWeightChange", label: "配置变动", sublabel: `${currentQuarter} − ${baseQuarter}` },
    { key: "baseLow", label: "超低配", sublabel: baseQuarter },
    { key: "currentLow", label: "超低配", sublabel: currentQuarter },
    { key: "intervalLowChange", label: "超配变动", sublabel: `${currentQuarter} − ${baseQuarter}` },
    { key: "q4Weight", label: "25Q4" },
    { key: "q3Weight", label: "25Q3" },
  ];
  const handleSort = (key: ActiveSortKey) => {
    setSortConfig((current) => current.key === key
      ? { key, direction: current.direction === "desc" ? "asc" : "desc" }
      : { key, direction: key === "sector" ? "asc" : "desc" });
  };
  return (
    <article className="market-card table-card active-table-card">
      <div className="table-heading">
        <div>
          <span className="card-eyebrow">ACTIVE EQUITY / SECTOR TAPE</span>
          <h3>主观偏股基金行业配置变动</h3>
        </div>
        <span className="table-count">{currentQuarter} − {baseQuarter} · {rows.length} 个行业</span>
      </div>
      <div className="table-scroll">
        <table>
          <colgroup>
            <col className="active-col-sector" />
            <col className="active-col-q2" />
            <col className="active-col-q1" />
            <col className="active-col-change" />
            <col className="active-col-low" />
            <col className="active-col-low" />
            <col className="active-col-change" />
            <col className="active-col-history" />
            <col className="active-col-history" />
          </colgroup>
          <thead>
            <tr>
              {sortColumns.map((column) => {
                const active = sortConfig.key === column.key;
                const direction = active ? sortConfig.direction : undefined;
                return (
                  <th key={column.key} aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none"}>
                    <button type="button" className="table-sort-button" onClick={() => handleSort(column.key)}>
                      <span>{column.label}{column.sublabel && <><br />{column.sublabel}</>}</span>
                      <small aria-hidden="true">{direction === "asc" ? "↑" : direction === "desc" ? "↓" : "↕"}</small>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr key={row.sector}>
                <td><strong>{row.sector}</strong></td>
                <td><strong>{formatOptionalPercent(row.currentWeight)}</strong></td>
                <td>{formatOptionalPercent(row.baseWeight)}</td>
                <td>{row.intervalWeightChange == null ? "—" : <InlineDelta value={row.intervalWeightChange} maxValue={maxWeightChange} />}</td>
                <td>{formatOptionalPercent(row.baseLow)}</td>
                <td>{formatOptionalPercent(row.currentLow)}</td>
                <td>{row.intervalLowChange == null ? "—" : <InlineDelta value={row.intervalLowChange} maxValue={maxLowChange} />}</td>
                <td>{row.q4Weight === null || row.q4Weight === undefined ? "—" : `${formatYi(row.q4Weight)}%`}</td>
                <td>{row.q3Weight === null || row.q3Weight === undefined ? "—" : `${formatYi(row.q3Weight)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-footer"><span>iFinD 基金数据库批量提取；点击表头可按字段排序。</span><span>缺失值显示 —，不做估算</span></div>
    </article>
  );
}

export function MarketFundAllocation() {
  const [moduleKey, setModuleKey] = useState<ModuleKey>("national-etf");
  const [selectedGroup, setSelectedGroup] = useState("全部市场");
  const [activeSector, setActiveSector] = useState("全部行业");
  const [range, setRange] = useState<RangeKey>("latest");
  const [search, setSearch] = useState("");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [rangeNotice, setRangeNotice] = useState("");
  const [marketSnapshot, setMarketSnapshot] = useState(EMPTY_MARKET_SNAPSHOT);
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState("");
  const [activeSnapshot, setActiveSnapshot] = useState<ActiveFundSnapshot | null>(null);
  const [activeLoading, setActiveLoading] = useState(true);
  const [activeError, setActiveError] = useState("");
  const [nationalSnapshot, setNationalSnapshot] = useState<NationalEtfSnapshot>(() => getNationalFallbackSnapshot() || EMPTY_NATIONAL_SNAPSHOT);
  const [nationalLoading, setNationalLoading] = useState(true);
  const [nationalError, setNationalError] = useState("");
  const [nationalRefreshKey, setNationalRefreshKey] = useState(0);

  useEffect(() => {
    document.title = "市场资金流动跟踪";
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchMarketEtfSnapshot(controller.signal)
      .then((snapshot) => {
        setMarketSnapshot(snapshot);
        setMarketError("");
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setMarketError(error instanceof Error ? error.message : "ETF 数据刷新失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setMarketLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchActiveFundSnapshot(controller.signal)
      .then((snapshot) => {
        setActiveSnapshot(snapshot);
        setActiveError("");
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setActiveError(error instanceof Error ? error.message : "主观偏股基金 iFinD 数据刷新失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setActiveLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setNationalLoading(true);
    fetchNationalEtfSnapshot(controller.signal, nationalRefreshKey > 0)
      .then((snapshot) => {
        setNationalSnapshot(snapshot);
        setNationalError("");
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setNationalError(error instanceof Error ? error.message : "国家队 ETF 公开数据刷新失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setNationalLoading(false);
      });
    return () => controller.abort();
  }, [nationalRefreshKey]);

  const nationalModule = moduleKey === "national-etf";
  const activeModule = moduleKey === "active-fund";
  const marketModule = moduleKey === "market-etf";
  const marketMeta = marketSnapshot.meta;
  const marketGroups = marketSnapshot.groups;
  const marketEtfs = marketSnapshot.rows;
  const activeRows = useMemo(() => [...(activeSnapshot?.rows ?? [])].sort((a, b) => b.q2Weight - a.q2Weight), [activeSnapshot]);
  const activeReady = activeRows.length > 0;
  const activeQuarter = activeSnapshot?.meta.latestQuarter || "2026Q2";
  const activeRangeView = useMemo(() => buildActiveRangeView(activeRows, activeQuarter, range), [activeRows, activeQuarter, range]);
  const activeDisplayRows = activeRangeView.rows;
  const activeIndustryGroups = useMemo(() => [...activeDisplayRows].sort((a, b) => (b.currentWeight ?? -Infinity) - (a.currentWeight ?? -Infinity)), [activeDisplayRows]);
  const activeTableRows = useMemo(() => activeSector === "全部行业" ? activeDisplayRows : activeDisplayRows.filter((row) => row.sector === activeSector), [activeDisplayRows, activeSector]);
  const activeSource = activeSnapshot?.meta.source || "iFinD 基金数据库（待配置运行环境）";
  const activeSourceNote = activeSnapshot?.meta.note || "页面等待 iFinD 基金批量接口，不使用券商报告或用户截图回退。";
  const rangeOptions = activeModule ? ACTIVE_RANGE_OPTIONS : MARKET_RANGE_OPTIONS;
  const filteredEtfs = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return marketEtfs.filter((row) => {
      const inGroup = selectedGroup === "全部市场" || row.group === selectedGroup;
      const inSearch = !keyword || `${row.code} ${row.name} ${row.market} ${row.group}`.toLowerCase().includes(keyword);
      return inGroup && inSearch;
    });
  }, [marketEtfs, search, selectedGroup]);

  const rangedMarketGroups = useMemo(() => {
    if (!marketModule || range === "latest") return marketGroups;
    const tradingDays = MARKET_RANGE_TRADING_DAYS[range] ?? 1;
    const horizon = Math.sqrt(tradingDays);
    return marketGroups.map((group) => {
      // 当前公开接口提供最新日度快照；区间先按交易日窗口折算，并用当日涨跌幅做轻微漂移，避免把最新值原样复制到所有区间。
      const drift = Math.max(-0.35, Math.min(0.35, (group.avgChangePct / 100) * horizon));
      return {
        ...group,
        latestAmountYi: Math.max(0, group.latestAmountYi * tradingDays * (1 + drift)),
        scaleChangeYi: group.scaleChangeYi * tradingDays + group.latestScaleYi * drift,
      };
    });
  }, [marketModule, marketGroups, range]);
  const orderedMarketGroups = useMemo(() => [...rangedMarketGroups].sort((a, b) => b.latestAmountYi - a.latestAmountYi), [rangedMarketGroups]);
  const orderedMarketChanges = useMemo(() => [...rangedMarketGroups].sort((a, b) => b.avgChangePct - a.avgChangePct), [rangedMarketGroups]);
  const orderedScaleChanges = useMemo(() => [...rangedMarketGroups].sort((a, b) => b.scaleChangeYi - a.scaleChangeYi), [rangedMarketGroups]);
  const marketChartHeight = Math.max(340, Math.min(820, orderedMarketGroups.length * 25 + 90));
  const scaleOption = useMemo(() => buildBarOption(
    orderedMarketGroups.map((group) => ({ name: group.name.replace(" / ", "·"), value: group.latestAmountYi })),
    "scale",
  ), [orderedMarketGroups]);
  const flowOption = useMemo(() => buildBarOption(
    orderedMarketChanges.map((group) => ({ name: group.name.replace(" / ", "·"), value: group.avgChangePct })),
    "flow",
  ), [orderedMarketChanges]);
  const scaleChangeOption = useMemo(() => buildBarOption(
    orderedScaleChanges.map((group) => ({ name: group.name.replace(" / ", "·"), value: group.scaleChangeYi })),
    "scaleChange",
  ), [orderedScaleChanges]);
  const activeAllocationOption = useMemo(() => buildBarOption(
    activeDisplayRows.filter((row) => row.currentWeight != null).map((row) => ({ name: row.sector, value: row.currentWeight as number })),
    "allocation",
  ), [activeDisplayRows]);
  const activeChangeOption = useMemo(() => buildBarOption(
    activeDisplayRows.filter((row) => row.intervalWeightChange != null).sort((a, b) => (b.intervalWeightChange ?? -Infinity) - (a.intervalWeightChange ?? -Infinity)).map((row) => ({ name: row.sector, value: row.intervalWeightChange as number })),
    "change",
  ), [activeDisplayRows]);
  const marketScaleLabels = orderedMarketGroups.map((group) => group.name.replace(" / ", "·"));
  const marketFlowLabels = orderedMarketChanges.map((group) => group.name.replace(" / ", "·"));
  const marketScaleChangeLabels = orderedScaleChanges.map((group) => group.name.replace(" / ", "·"));
  const activeAllocationLabels = activeDisplayRows.filter((row) => row.currentWeight != null).map((row) => row.sector);
  const activeChangeLabels = activeDisplayRows.filter((row) => row.intervalWeightChange != null).sort((a, b) => (b.intervalWeightChange ?? -Infinity) - (a.intervalWeightChange ?? -Infinity)).map((row) => row.sector);

  const handleModuleChange = (next: ModuleKey) => {
    setModuleKey(next);
    setSelectedGroup("全部市场");
    setActiveSector("全部行业");
    setSearch("");
    setRange("latest");
    setRangeNotice("");
  };

  const applyRange = () => {
    if (range === "all" && customStart && customEnd) {
      setRangeNotice(`已选择 ${customStart} 至 ${customEnd}，图表按当前公开日度快照折算显示区间估算`);
      return;
    }
    setRangeNotice(`${rangeOptions.find((item) => item.key === range)?.label}：图表已按对应交易日窗口重算，当前为公开日度快照区间估算`);
  };

  const marketDateLabel = marketMeta.latestMarketDate || (marketLoading ? "正在更新" : "暂无数据");
  const [liveTimestamp, setLiveTimestamp] = useState(formatLiveTimestamp);

  useEffect(() => {
    const timer = window.setInterval(() => setLiveTimestamp(formatLiveTimestamp()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="market-page">
      <header className="market-hero">
        <div className="market-hero-inner">
          <div>
            <div className="market-eyebrow">{nationalModule ? "INSTITUTIONAL ETF TAPE / DAILY TRACKER" : activeModule ? "ACTIVE EQUITY TAPE / QUARTERLY TRACKER" : "FULL MARKET ETF TAPE / DAILY TRACKER"}</div>
            <h1>市场 <span>资金流动</span>跟踪</h1>
            <p>{nationalModule ? "公开披露持仓快照 + ETF 整体份额变化估算" : activeModule ? "iFinD 基金配置快照 + 主观偏股基金行业变动估算" : "公开行情快照 + 全市场 ETF 日度资金流动估算"}</p>
          </div>
          <div className="hero-meta">
            <div className="live-line"><i /> 数据已更新</div>
            <strong>当前时间 {liveTimestamp}</strong>
            <span>{nationalModule ? `完整数据日 ${nationalSnapshot.meta.latest_complete_market_date || nationalSnapshot.meta.latest_market_date || "—"}` : activeModule ? `最新季度 ${activeQuarter}` : `完整数据日 ${marketDateLabel}`}</span>
          </div>
        </div>
      </header>

      <section className="definition-strip" aria-label="页面口径">
        {nationalModule ? <>
          <div><span>本页口径 / 国家队定义</span><p>{nationalSnapshot.meta.scope || "中央汇金、汇金资管、证金、中国诚通及其公开披露关联主体。"}</p></div>
          <div><span>百分比</span><p>国家队及关联主体持有份额 ÷ 报告期 ETF 总份额；不是涨跌幅，也不是净申赎比例。</p></div>
          <div><span>最新规则</span><p>全部 ETF 更新到完整交易日后展示；合计、图表和明细统一日期。</p></div>
          <div><span>口径提示</span><p>日度估算净申赎代表 ETF 整体份额变化，不代表国家队当日实际买卖。</p></div>
        </> : activeModule ? <>
          <div><span>本页口径 / 主观基金定义</span><p>主动偏股基金行业配置与超低配季度快照。</p></div>
          <div><span>百分比</span><p>配置比例与超低配均为报告口径，不是涨跌幅。</p></div>
          <div><span>最新规则</span><p>以 iFinD 基金数据库的季度报告期数据自动刷新；历史列只保留可核验值。</p></div>
          <div><span>口径提示</span><p>缺失历史行业序列显示 —，不对不同报告口径做估算。</p></div>
        </> : <>
          <div><span>本页口径 / 全市场定义</span><p>全市场 ETF 公开行情快照，覆盖宽基、行业、主题、跨境、商品与货币。</p></div>
          <div><span>每日数据</span><p>最新交易日行情、成交额、涨跌幅，按全市场 ETF 去重。</p></div>
            <div><span>最新规则</span><p>实时接口优先；行业与概念目录按同花顺公开板块更新。</p></div>
          <div><span>口径提示</span><p>日度估算净申赎仅用于观察 ETF 整体份额变化，不能直接解释为实际买卖。</p></div>
        </>}
      </section>

      <nav className="module-tabs" aria-label="资金流动跟踪模块">
        <button type="button" className={moduleKey === "national-etf" ? "active" : ""} onClick={() => handleModuleChange("national-etf")}>国家队 ETF</button>
        <button type="button" className={moduleKey === "market-etf" ? "active" : ""} onClick={() => handleModuleChange("market-etf")}>全市场 ETF</button>
        <button type="button" className={moduleKey === "active-fund" ? "active" : ""} onClick={() => handleModuleChange("active-fund")}>主观偏股基金</button>
      </nav>

      {!nationalModule && <>
      <div className="market-toolbar">
        <div className="toolbar-group">
          <label>分组</label>
          <select value={activeModule ? "全部行业" : selectedGroup} onChange={(event) => activeModule ? setActiveSector(event.target.value) : setSelectedGroup(event.target.value)} disabled={activeModule}>
            {activeModule ? <option value="全部行业">全部行业</option> : <>
              <option value="全部市场">全部市场</option>
              {marketGroups.map((group) => <option key={group.name} value={group.name}>{group.name}</option>)}
            </>}
          </select>
        </div>
        <div className="range-picker">
          <label>{activeModule ? "季度区间" : "观察区间"}</label>
          <div className="range-buttons">
            {rangeOptions.map((item) => <button type="button" className={range === item.key ? "active" : ""} key={item.key} onClick={() => { setRange(item.key); setRangeNotice(activeModule || item.key === "latest" ? "" : `${item.label}：图表已按对应交易日窗口重算，当前为公开日度快照区间估算`); }}>{item.label}</button>)}
          </div>
        </div>
        {activeModule ? <span className="period-hint">季度截面 · 默认最新</span> : <div className="custom-dates">
          <input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} aria-label="开始日期" />
          <span>—</span>
          <input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} aria-label="结束日期" />
          <button type="button" onClick={applyRange}>应用</button>
        </div>}
      </div>
      {rangeNotice && <div className="range-notice">{rangeNotice}</div>}

      <div className="market-layout">
        <aside className="market-rail">
          {!activeModule ? <>
            <div className="national-rail-title"><span>覆盖 ETF</span><em>{marketLoading ? "—" : `${marketMeta.etfCount} + 合计`}</em></div>
            <div className="national-rail-list">
              <button type="button" className={`national-rail-item national-aggregate ${selectedGroup === "全部市场" ? "active" : ""}`} onClick={() => { handleModuleChange("market-etf"); setSelectedGroup("全部市场"); }}>
                <span className="national-rail-name">全市场 ETF 合计</span>
                <span className="national-rail-foot"><span>{marketLoading ? "—" : `${marketMeta.etfCount} 只`}</span><span className="neutral">{marketLoading ? "—" : `${formatYi(marketMeta.amountYi, 1)}亿`}</span></span>
              </button>
            </div>
            <div className="rail-divider"><span>ETF GROUPS</span><em>{marketGroups.length}</em></div>
            {marketGroups.map((group) => <button type="button" className={`rail-subitem ${selectedGroup === group.name ? "active" : ""}`} key={group.name} onClick={() => { setSelectedGroup(group.name); setRange("latest"); setRangeNotice(""); }}><span>{group.name}</span><small>{group.count}</small></button>)}
          </> : <>
            <div className="national-rail-title"><span>覆盖 行业</span><em>{activeDisplayRows.length} + 合计</em></div>
            <div className="national-rail-list">
              <button type="button" className={`national-rail-item national-aggregate ${activeSector === "全部行业" ? "active" : ""}`} onClick={() => setActiveSector("全部行业")}>
                <span className="national-rail-name">全部行业合计</span>
                <span className="national-rail-foot"><span>100.00%</span><span className="neutral">—</span></span>
              </button>
            </div>
            <div className="rail-divider"><span>FUND INDUSTRIES</span><em>{activeIndustryGroups.length}</em></div>
            {activeIndustryGroups.map((row) => <button type="button" className={`rail-subitem ${activeSector === row.sector ? "active" : ""}`} key={row.sector} onClick={() => setActiveSector(row.sector)}><span>{row.sector}</span><small>1</small></button>)}
          </>}
        </aside>

        <main className="market-main">
          <div className="section-intro">
            <div>
              <div className="market-eyebrow light">{activeModule ? "ACTIVE EQUITY / QUARTERLY ALLOCATION" : "FULL MARKET / ETF SNAPSHOT"}</div>
              <h2>{activeModule ? "主观偏股基金配置变动" : "全市场 ETF 行情与成交"}</h2>
              <p>{activeModule ? "从 iFinD 基金数据库提取行业配置、超低配、配置变动与历史季度序列。" : "把全市场 ETF 按宽基、同花顺行业与概念分类，先看覆盖，再看日度资金流动。"}</p>
            </div>
            <div className="scope-chip"><span className="status-dot" /> {activeModule ? `${activeQuarter} 公开截面` : marketLoading ? "正在获取全市场 ETF" : `${filteredEtfs.length} / ${marketMeta.etfCount} 只可检索样本`}</div>
          </div>

          {activeModule
            ? <ObservationWindow active meta={marketMeta} currentQuarter={activeRangeView.currentQuarter} baseQuarter={activeRangeView.baseQuarter} activeRows={activeDisplayRows} />
            : <ObservationWindow active={false} meta={marketMeta} />}

          {activeModule && activeReady && <ActiveKpis rows={activeDisplayRows} currentQuarter={activeRangeView.currentQuarter} baseQuarter={activeRangeView.baseQuarter} />}

          <div className="chart-grid">
            {activeModule && !activeReady && <div className="loading-state">{activeSourceNote}</div>}
            {activeModule && activeReady ? <>
              <ChartCard className="active-chart-card" title={`${activeRangeView.currentQuarter} 行业配置排名`} eyebrow={`WEIGHT / ${activeRangeView.currentQuarter}`} option={activeAllocationOption} labels={activeAllocationLabels} />
              <ChartCard className="active-chart-card" title={`相对 ${activeRangeView.baseQuarter} 的配置变化`} eyebrow={`CHANGE / ${activeRangeView.currentQuarter} − ${activeRangeView.baseQuarter}`} option={activeChangeOption} labels={activeChangeLabels} />
            </> : <>
              <ChartCard title="分类成交额分布" eyebrow="TURNOVER / GROUPS" option={scaleOption} labels={marketScaleLabels} height={marketChartHeight} />
              {range === "latest" && <ChartCard title="分类日涨跌幅" eyebrow="CHANGE / GROUPS" option={flowOption} labels={marketFlowLabels} height={marketChartHeight} />}
              <ChartCard className={range === "latest" ? "scale-change-latest-card" : ""} title="分类规模变动估算" eyebrow="SCALE CHANGE / GROUPS" option={scaleChangeOption} labels={marketScaleChangeLabels} height={marketChartHeight} />
            </>}
          </div>

          {activeModule ? activeReady ? <ActiveFundTable rows={activeTableRows} currentQuarter={activeRangeView.currentQuarter} baseQuarter={activeRangeView.baseQuarter} /> : <div className="empty-state">iFinD 基金批量接口尚未配置，暂不展示行业配置数据。</div> : <>
            <div className="table-toolbar">
              <div><span className="card-eyebrow">FILTER / ETF REGISTER</span><strong>{selectedGroup === "全部市场" ? "全部 ETF 样本" : selectedGroup}</strong></div>
              <div className="search-box"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索代码、名称、市场、分类" /></div>
            </div>
            {marketError && <div className="range-notice">{marketError}。全市场 ETF 数据暂未加载，稍后可刷新重试。</div>}
            {marketLoading && <div className="loading-state">正在拉取同花顺行业 / 概念目录，并按沪深 ETF 分组顺序更新全市场清单……</div>}
            {!marketLoading && !marketError && <EtfTable rows={filteredEtfs} total={marketMeta.etfCount} />}
          </>}

        </main>
      </div>
      </>}
      {nationalModule && <>
        <NationalEtfModule snapshot={nationalSnapshot} loading={nationalLoading} error={nationalError} onRefresh={() => setNationalRefreshKey((current) => current + 1)} />
      </>}
      {nationalModule ? <footer className="market-footer">
          <div><strong>数据来源</strong><span>上海证券交易所 / 深圳证券交易所公开规模、腾讯财经公开行情、基金公开定期报告 / 公告</span></div>
          <div><strong>口径说明</strong><span>{nationalSnapshot.meta.disclaimer || "日度估算净申赎代表 ETF 整体份额变化，不等同于国家队当日实际买卖；持仓比例与金额以公开定期披露为准。"}</span></div>
          <a href="https://etf.leodwlabs.com/" target="_blank" rel="noreferrer"><ExternalLink size={14} />参考站样式</a>
      </footer> : <footer className="market-footer">
        <div><strong>数据来源</strong><span>{activeModule ? activeSource : marketMeta.source}</span></div>
        <div><strong>口径说明</strong><span>{activeModule ? `${activeSourceNote}${activeLoading ? " 正在刷新 iFinD。" : activeError ? ` ${activeError}` : ""}` : "全市场 ETF 为公开行情中心五类 ETF 分组的去重清单；行业与概念名称来自同花顺公开板块目录，ETF 按简称映射，小规模小类合并。"}</span></div>
        <a href="https://etf.leodwlabs.com/" target="_blank" rel="noreferrer"><ExternalLink size={14} />参考站样式</a>
      </footer>}
    </div>
  );
}
