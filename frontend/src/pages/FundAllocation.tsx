import { useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Database,
  Download,
  ExternalLink,
  FileUp,
  Info,
  Layers3,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  FUND_ALLOCATION_SNAPSHOT,
  type ActiveFundSectorRow,
  type EtfHoldingRow,
  type FundAllocationSnapshot,
} from "@/data/fund-allocation";
import { cn } from "@/lib/utils";

type SectionKey = "etf" | "active";
type EtfCategory = "全部" | "宽基" | "行业主题" | "跨境/战略";
type ActiveSort = "截图顺序" | "Q2配置" | "季度变动";

const STORAGE_KEY = "fund-allocation-snapshot-v1";
const ETF_CATEGORIES: EtfCategory[] = ["全部", "宽基", "行业主题", "跨境/战略"];

function readStoredSnapshot(): FundAllocationSnapshot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return FUND_ALLOCATION_SNAPSHOT;
    const candidate: unknown = JSON.parse(raw);
    if (isSnapshot(candidate)) return candidate;
  } catch {
    /* 本地快照损坏时回落到版本化基线 */
  }
  return FUND_ALLOCATION_SNAPSHOT;
}

function isSnapshot(value: unknown): value is FundAllocationSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FundAllocationSnapshot>;
  return candidate.schemaVersion === 1
    && typeof candidate.generatedAt === "string"
    && typeof candidate.etfAsOf === "string"
    && typeof candidate.activeFundAsOf === "string"
    && Array.isArray(candidate.etfRows)
    && Array.isArray(candidate.etfUniverse)
    && Array.isArray(candidate.activeFundRows)
    && Array.isArray(candidate.sources);
}

function pct(value: number | null, digits = 2) {
  return value === null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function number(value: number, digits = 2) {
  return value.toLocaleString("zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function changeTone(value: number | null) {
  if (value === null || value === 0) return "text-muted-foreground";
  return value > 0 ? "text-danger" : "text-success";
}

function directionTone(direction: EtfHoldingRow["direction"]) {
  if (direction === "增持" || direction === "新晋") return "border-danger/30 bg-danger/10 text-danger";
  if (direction === "减持") return "border-success/30 bg-success/10 text-success";
  return "border-border/40 bg-muted/20 text-muted-foreground";
}

function MetricCard({ label, value, note, tone = "text-foreground" }: { label: string; value: string; note: string; tone?: string }) {
  return (
    <GlassCard className="min-h-[104px] p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-2 font-mono text-2xl font-bold tracking-tight", tone)}>{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground/70">{note}</p>
    </GlassCard>
  );
}

function DeltaBar({ value, max, compact = false }: { value: number; max: number; compact?: boolean }) {
  const width = Math.min(100, Math.max(4, Math.abs(value) / max * 100));
  const positive = value >= 0;
  return (
    <div className={cn("flex items-center gap-2", compact ? "min-w-[112px]" : "min-w-[180px]")}>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted/50">
        <div
          className={cn("absolute inset-y-0 rounded-full", positive ? "right-1/2 bg-danger" : "left-1/2 bg-success")}
          style={{ width: `${width / 2}%` }}
        />
        <span className="absolute inset-y-0 left-1/2 w-px bg-border/80" />
      </div>
      <span className={cn("w-[54px] text-right font-mono text-xs", changeTone(value))}>{pct(value)}</span>
    </div>
  );
}

function EtfTable({ rows }: { rows: EtfHoldingRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border/40">
      <table className="min-w-[980px] w-full text-sm">
        <thead className="bg-muted/30 text-left text-xs text-muted-foreground">
          <tr>
            <th className="sticky left-0 z-10 bg-muted/90 px-3 py-3 font-medium">ETF / 代码</th>
            <th className="px-3 py-3 font-medium">口径</th>
            <th className="px-3 py-3 font-medium">国家队主体</th>
            <th className="px-3 py-3 text-right font-medium">当前持有<br />万份</th>
            <th className="px-3 py-3 text-right font-medium">上期持有<br />万份</th>
            <th className="px-3 py-3 font-medium">环比变动</th>
            <th className="px-3 py-3 text-right font-medium">占上市份额</th>
            <th className="px-3 py-3 font-medium">披露截止</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.holder}-${row.code}`} className="border-t border-border/30 transition-colors hover:bg-muted/20">
              <td className="sticky left-0 bg-background/95 px-3 py-3">
                <div className="font-medium">{row.name}</div>
                <div className="mt-0.5 font-mono text-[11px] text-muted-foreground/65">{row.code} · {row.indexOrTheme}</div>
              </td>
              <td className="px-3 py-3">
                <span className="rounded-full border border-border/40 bg-muted/20 px-2 py-1 text-[11px]">{row.category}</span>
              </td>
              <td className="max-w-[220px] px-3 py-3 text-xs text-muted-foreground">{row.holder}</td>
              <td className="px-3 py-3 text-right font-mono">{number(row.currentSharesWan)}</td>
              <td className="px-3 py-3 text-right font-mono text-muted-foreground">{number(row.previousSharesWan)}</td>
              <td className="px-3 py-3">
                <div className="flex items-center gap-2">
                  <span className={cn("rounded-full border px-2 py-1 text-[11px]", directionTone(row.direction))}>{row.direction}</span>
                  <span className={cn("font-mono text-xs", changeTone(row.changePct))}>{pct(row.changePct)}</span>
                </div>
              </td>
              <td className="px-3 py-3 text-right font-mono">{row.ownershipPct.toFixed(2)}%</td>
              <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">{row.asOf}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="px-4 py-10 text-center text-sm text-muted-foreground">没有符合条件的 ETF 行。</p>}
    </div>
  );
}

function ActiveHeatmap({ rows }: { rows: ActiveFundSectorRow[] }) {
  const max = Math.max(...rows.map((row) => Math.abs(row.weightChange)), 1);
  return (
    <div className="overflow-x-auto rounded-xl border border-border/40">
      <table className="min-w-[920px] w-full text-xs">
        <thead className="bg-muted/30 text-left text-muted-foreground">
          <tr>
            <th className="sticky left-0 z-10 bg-muted/90 px-3 py-3 font-medium">行业</th>
            <th className="px-3 py-3 font-medium">Q2 配置比例</th>
            <th className="px-3 py-3 font-medium">配置比例变动</th>
            <th className="px-3 py-3 font-medium">超低配 Q1 → Q2</th>
            <th className="px-3 py-3 font-medium">主动变动：相对</th>
            <th className="px-3 py-3 font-medium">主动变动：绝对</th>
            <th className="px-3 py-3 font-medium">北上中资 / 交易盘 / 配置盘</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.sector} className="border-t border-border/30 hover:bg-muted/20">
              <td className="sticky left-0 bg-background/95 px-3 py-2.5 font-medium">{row.sector}</td>
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-24 overflow-hidden rounded-full bg-muted/50">
                    <div className="h-full rounded-full bg-primary/80" style={{ width: `${Math.min(100, row.q2Weight / 45 * 100)}%` }} />
                  </div>
                  <span className="w-14 text-right font-mono">{row.q2Weight.toFixed(2)}%</span>
                </div>
              </td>
              <td className="px-3 py-2.5"><DeltaBar value={row.weightChange} max={max} compact /></td>
              <td className="px-3 py-2.5 font-mono text-muted-foreground">{row.lowQ1.toFixed(2)}% → {row.lowQ2.toFixed(2)}%</td>
              <td className={cn("px-3 py-2.5 font-mono", changeTone(row.relativeChange))}>{pct(row.relativeChange)}</td>
              <td className={cn("px-3 py-2.5 font-mono", changeTone(row.absoluteChange))}>{pct(row.absoluteChange)}</td>
              <td className="px-3 py-2.5 font-mono text-muted-foreground">
                <span className={changeTone(row.northboundChina)}>{pct(row.northboundChina)}</span>
                <span className="mx-1 text-border">/</span>
                <span className={changeTone(row.northboundTrading)}>{pct(row.northboundTrading)}</span>
                <span className="mx-1 text-border">/</span>
                <span className={changeTone(row.northboundAllocation)}>{pct(row.northboundAllocation)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SourceList({ snapshot }: { snapshot: FundAllocationSnapshot }) {
  return (
    <div className="space-y-2">
      {snapshot.sources.map((source) => (
        <div key={`${source.label}-${source.asOf}`} className="flex flex-wrap items-start gap-2 rounded-lg border border-border/30 bg-muted/10 p-3 text-xs">
          <span className={cn("rounded-full border px-2 py-0.5", "border-border/40 text-muted-foreground")}>{source.kind}</span>
          <div className="min-w-[180px] flex-1">
            <div className="flex flex-wrap items-center gap-2 font-medium">
              {source.label}
              <span className="font-mono text-[11px] text-muted-foreground/60">{source.asOf}</span>
              {source.url && <a href={source.url} target="_blank" rel="noreferrer" className="text-primary hover:underline" title="打开来源"><ExternalLink className="h-3.5 w-3.5" /></a>}
            </div>
            <p className="mt-1 text-muted-foreground">{source.note}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function FundAllocation() {
  const [snapshot, setSnapshot] = useState<FundAllocationSnapshot>(() => readStoredSnapshot());
  const [section, setSection] = useState<SectionKey>("etf");
  const [etfCategory, setEtfCategory] = useState<EtfCategory>("全部");
  const [etfSearch, setEtfSearch] = useState("");
  const [activeSort, setActiveSort] = useState<ActiveSort>("截图顺序");
  const [showSources, setShowSources] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredEtfRows = useMemo(() => {
    const query = etfSearch.trim().toLowerCase();
    return snapshot.etfRows.filter((row) => {
      const categoryMatch = etfCategory === "全部" || row.category === etfCategory;
      const queryMatch = !query || [row.code, row.name, row.holder, row.indexOrTheme].some((value) => value.toLowerCase().includes(query));
      return categoryMatch && queryMatch;
    });
  }, [etfCategory, etfSearch, snapshot.etfRows]);

  const sortedActiveRows = useMemo(() => {
    if (activeSort === "截图顺序") return snapshot.activeFundRows;
    return [...snapshot.activeFundRows].sort((left, right) => activeSort === "Q2配置" ? right.q2Weight - left.q2Weight : right.weightChange - left.weightChange);
  }, [activeSort, snapshot.activeFundRows]);

  const etfDistinct = new Set(filteredEtfRows.map((row) => row.code)).size;
  const etfIncreases = filteredEtfRows.filter((row) => row.direction === "增持" || row.direction === "新晋").length;
  const etfDecreases = filteredEtfRows.filter((row) => row.direction === "减持").length;
  const activeTopAdd = [...snapshot.activeFundRows].sort((left, right) => right.weightChange - left.weightChange)[0];
  const activeTopCut = [...snapshot.activeFundRows].sort((left, right) => left.weightChange - right.weightChange)[0];
  const activeQ2Top = [...snapshot.activeFundRows].sort((left, right) => right.q2Weight - left.q2Weight)[0];

  const importSnapshot = async (file: File) => {
    try {
      const candidate: unknown = JSON.parse(await file.text());
      if (!isSnapshot(candidate)) throw new Error("快照结构不完整");
      localStorage.setItem(STORAGE_KEY, JSON.stringify(candidate));
      setSnapshot(candidate);
      setNotice(`已导入快照：ETF ${candidate.etfAsOf} · 主动偏股 ${candidate.activeFundAsOf}`);
    } catch (error) {
      setNotice(error instanceof Error ? `导入失败：${error.message}` : "导入失败：请使用 schemaVersion=1 的 JSON 快照");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const exportSnapshot = () => {
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `fund-allocation-${snapshot.activeFundAsOf}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("当前快照已导出，可作为下一次更新的模板。");
  };

  const resetSnapshot = () => {
    localStorage.removeItem(STORAGE_KEY);
    setSnapshot(FUND_ALLOCATION_SNAPSHOT);
    setNotice("已恢复版本化基线快照。");
  };

  return (
    <div>
      <PageHeader
        title="资金配置"
        subtitle="国家队 ETF 镜像 · 全市场 ETF 观察池 · 主动偏股基金配置变动"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <input ref={inputRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importSnapshot(file);
            }} />
            <button onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
              <FileUp className="h-4 w-4" /> 导入更新
            </button>
            <button onClick={exportSnapshot} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
              <Download className="h-4 w-4" /> 导出快照
            </button>
          </div>
        }
      />

      <div className="mb-5 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="leading-relaxed">
            当前页面是“可验证快照”看板：ETF 使用最新已核验的国家队公开披露行，主动偏股基金使用公开季度研究资料提取的 2026Q2 快照。没有出现在前十大持有人披露里，不等于没有持仓；后续更新由公开来源接口自动刷新。
          </p>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-2 rounded-xl border border-border/40 bg-muted/10 p-1 sm:grid-cols-2">
        <button onClick={() => setSection("etf")} className={cn("flex items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors", section === "etf" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted/30 hover:text-foreground")}>
          <Layers3 className="h-5 w-5" />
          <span><span className="block text-sm font-medium">01 · 国家队 ETF 镜像</span><span className="mt-0.5 block text-xs opacity-75">全市场宽基、行业主题、跨境/战略分类</span></span>
        </button>
        <button onClick={() => setSection("active")} className={cn("flex items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors", section === "active" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted/30 hover:text-foreground")}>
          <BarChart3 className="h-5 w-5" />
          <span><span className="block text-sm font-medium">02 · 主动偏股基金变动</span><span className="mt-0.5 block text-xs opacity-75">配置比例、超低配、主动变动、北上资金</span></span>
        </button>
      </div>

      {notice && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-primary">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="text-primary/60 hover:text-primary">关闭</button>
        </div>
      )}

      {section === "etf" ? (
        <section className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard label="当前可识别 ETF" value={String(etfDistinct)} note={`筛选后 · ${snapshot.etfAsOf}`} />
            <MetricCard label="公开披露增持 / 新晋" value={String(etfIncreases)} note="含单一资管计划" tone="text-danger" />
            <MetricCard label="公开披露减持" value={String(etfDecreases)} note="不代表全市场完整变动" tone="text-success" />
            <MetricCard label="最大持有人比例" value={`${Math.max(...filteredEtfRows.map((row) => row.ownershipPct), 0).toFixed(2)}%`} note="单只 ETF 的上市份额占比" />
          </div>

          <GlassCard glow>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2"><Database className="h-4 w-4 text-primary" /><h2 className="text-base font-semibold">全市场 ETF 口径</h2></div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">先建立 A 股上市 ETF 的分类母表，再把公开披露的国家队持仓映射进去；下表的“可识别”是披露证据，不是国家队完整仓位估计。</p>
              </div>
              <span className="rounded-full border border-border/40 px-2.5 py-1 text-[11px] text-muted-foreground">ETF 截止 {snapshot.etfAsOf}</span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {snapshot.etfUniverse.map((item) => (
                <div key={item.category} className="rounded-xl border border-border/35 bg-muted/10 p-3">
                  <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">{item.category}</p><span className={cn("rounded-full px-2 py-0.5 text-[10px]", item.status === "已接入" ? "bg-success/10 text-success" : "bg-warning/10 text-warning")}>{item.status}</span></div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
                  <div className="mt-3 flex items-end justify-between"><span className="text-[11px] text-muted-foreground">当前快照可识别</span><span className="font-mono text-lg font-semibold">{item.nationalVisibleCount}<span className="ml-1 text-xs font-normal text-muted-foreground">行</span></span></div>
                  <p className="mt-1 text-[11px] text-muted-foreground/65">{item.visibleShare}</p>
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">国家队持仓镜像明细</h2>
                <p className="mt-1 text-xs text-muted-foreground">同一字段口径横向放入宽基与行业主题，后续可继续追加最新季度。</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input value={etfSearch} onChange={(event) => setEtfSearch(event.target.value)} placeholder="搜索代码 / ETF / 主题" className="w-48 rounded-lg border border-border bg-black/20 px-3 py-1.5 text-xs outline-none focus:border-primary/50" />
                <div className="flex rounded-lg border border-border/40 p-0.5">
                  {ETF_CATEGORIES.map((category) => <button key={category} onClick={() => setEtfCategory(category)} className={cn("rounded-md px-2.5 py-1 text-xs transition-colors", etfCategory === category ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}>{category}</button>)}
                </div>
              </div>
            </div>
            <div className="mt-4"><EtfTable rows={filteredEtfRows} /></div>
          </GlassCard>
        </section>
      ) : (
        <section className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard label="Q2 最大行业配置" value={`${activeQ2Top.q2Weight.toFixed(2)}%`} note={activeQ2Top.sector} />
            <MetricCard label="主动加仓最多" value={pct(activeTopAdd.weightChange)} note={activeTopAdd.sector} tone="text-danger" />
            <MetricCard label="主动减仓最多" value={pct(activeTopCut.weightChange)} note={activeTopCut.sector} tone="text-success" />
            <MetricCard label="行业样本数" value={String(snapshot.activeFundRows.length)} note={`2026Q1 → ${snapshot.activeFundAsOf}`} />
          </div>

          <GlassCard glow>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /><h2 className="text-base font-semibold">主观偏股基金配置变动</h2></div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">把“配置了什么”和“主动加减了什么”分开看：电子、通信是 Q2 权重主线；电力设备及新能源、有色金属、基础化工是主动减仓靠前的方向。</p>
              </div>
              <span className="rounded-full border border-border/40 px-2.5 py-1 text-[11px] text-muted-foreground">数据截止 {snapshot.activeFundAsOf}</span>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-border/35 bg-muted/10 p-4">
                <div className="mb-3 flex items-center justify-between"><p className="text-sm font-medium">Q2 配置比例 TOP10</p><span className="text-[11px] text-muted-foreground">% of active equity</span></div>
                <div className="space-y-2.5">
                  {[...snapshot.activeFundRows].sort((left, right) => right.q2Weight - left.q2Weight).slice(0, 10).map((row) => (
                    <div key={row.sector} className="grid grid-cols-[108px_1fr_54px] items-center gap-2 text-xs">
                      <span className="truncate text-muted-foreground">{row.sector}</span>
                      <div className="h-2 overflow-hidden rounded-full bg-muted/50"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, row.q2Weight / activeQ2Top.q2Weight * 100)}%` }} /></div>
                      <span className="text-right font-mono">{row.q2Weight.toFixed(2)}%</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-border/35 bg-muted/10 p-4">
                <div className="mb-3 flex items-center justify-between"><p className="text-sm font-medium">配置比例变动 TOP / BOTTOM</p><span className="text-[11px] text-muted-foreground">Q2 − Q1</span></div>
                <div className="space-y-2.5">
                  {[...snapshot.activeFundRows].sort((left, right) => Math.abs(right.weightChange) - Math.abs(left.weightChange)).slice(0, 8).map((row) => (
                    <div key={row.sector} className="flex items-center justify-between gap-3 text-xs"><span className="w-28 truncate text-muted-foreground">{row.sector}</span><DeltaBar value={row.weightChange} max={Math.max(...snapshot.activeFundRows.map((item) => Math.abs(item.weightChange)))} compact /></div>
                  ))}
                </div>
              </div>
            </div>
          </GlassCard>

          <GlassCard>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">行业配置与相对变动表</h2>
                <p className="mt-1 text-xs text-muted-foreground">红色代表增加，绿色代表减少；北上资金三列顺序为中资、交易盘、配置盘。</p>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">排序
                <select value={activeSort} onChange={(event) => setActiveSort(event.target.value as ActiveSort)} className="rounded-lg border border-border bg-black/20 px-2.5 py-1.5 text-xs text-foreground outline-none">
                  <option>截图顺序</option><option>Q2配置</option><option>季度变动</option>
                </select>
              </label>
            </div>
            <div className="mt-4"><ActiveHeatmap rows={sortedActiveRows} /></div>
          </GlassCard>
        </section>
      )}

      <GlassCard className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2"><Info className="h-4 w-4 text-primary" /><div><p className="text-sm font-medium">数据血缘与更新</p><p className="mt-0.5 text-xs text-muted-foreground">版本化基线 {snapshot.generatedAt} · ETF {snapshot.etfAsOf} · 主动偏股 {snapshot.activeFundAsOf}</p></div></div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setShowSources((value) => !value)} className="inline-flex items-center gap-1.5 rounded-lg border border-border/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"><ExternalLink className="h-3.5 w-3.5" /> {showSources ? "收起来源" : "查看来源"}</button>
            <button onClick={resetSnapshot} className="inline-flex items-center gap-1.5 rounded-lg border border-border/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"><RefreshCw className="h-3.5 w-3.5" /> 恢复基线</button>
          </div>
        </div>
        {showSources && <div className="mt-4"><SourceList snapshot={snapshot} /></div>}
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-warning/20 bg-warning/5 p-3 text-xs text-muted-foreground"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" /><p>导入更新只改变当前浏览器本地快照，不会改仓库文件；建议新季度发布后，把核验过的 JSON 作为快照留档，再继续更新。</p></div>
      </GlassCard>

      <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground/60">
        <span>资金配置 · 研究观察工具，不构成投资建议</span>
        <span className="inline-flex items-center gap-1"><ArrowUp className="h-3 w-3 text-danger" />增持 / <ArrowDown className="h-3 w-3 text-success" />减持</span>
      </div>
    </div>
  );
}
