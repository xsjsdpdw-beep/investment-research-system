import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Activity, AlertTriangle, BrainCircuit, CheckCircle2, Loader2, Play, Settings, Square, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Disclaimer } from "@/components/ui/Disclaimer";
import { api, ApiError, type WatchStock } from "@/lib/api";
import {
  cancelTradingAgentsRun,
  resolveTradingAgentsConfig,
  startTradingAgentsRun,
  streamTradingAgentsRun,
  type TradingAgentsEvent,
  type TradingAgentsResult,
} from "@/lib/tradingagents";
import { cn } from "@/lib/utils";

const A_SHARE_MARKETS = new Set(["SH", "SZ", "BJ"]);

const STAGE_LABELS: Record<string, string> = {
  market_report: "技术分析",
  sentiment_report: "市场情绪",
  news_report: "新闻舆情",
  fundamentals_report: "基本面",
  policy_report: "政策分析",
  hot_money_report: "游资追踪",
  lockup_report: "解禁减持",
  bull_researcher: "多方研究",
  bear_researcher: "空方研究",
  research_manager: "研究经理",
  trader: "交易决策",
  risk_management: "风控评估",
  portfolio_manager: "组合经理",
};

const defaultContext = "请结合最新公开数据、基本面、政策、新闻舆情、技术面和风险因素，输出可复盘的深度分析。";

function normalizeAStockCode(value: string) {
  return value.replace(/[^\d]/g, "").slice(0, 6);
}

function eventTone(event: TradingAgentsEvent) {
  if (event.type === "error") return "border-danger/40 bg-danger/10 text-danger";
  if (event.type === "result" || event.type === "stage_completed") return "border-success/35 bg-success/10 text-success";
  if (event.type === "stage_started" || event.type === "task_started") return "border-primary/35 bg-primary/10 text-primary";
  return "border-border/50 bg-muted/20 text-muted-foreground";
}

function statusLabel(event: TradingAgentsEvent) {
  if (event.stage && STAGE_LABELS[event.stage]) return STAGE_LABELS[event.stage];
  if (event.stage) return event.stage;
  if (event.type === "task_started") return "任务启动";
  if (event.type === "result") return "生成报告";
  if (event.type === "cancelled") return "已取消";
  if (event.type === "error") return "运行失败";
  return "运行日志";
}

function markdownBlock(content: string) {
  if (!content.trim()) return <p className="text-sm text-muted-foreground">暂无内容。</p>;
  return (
    <div className="prose prose-sm prose-invert max-w-none prose-headings:text-foreground prose-p:leading-7 prose-li:leading-7 prose-strong:text-foreground">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

function AnalystSection({ title, content }: { title: string; content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border/50 bg-background/35">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="font-semibold text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">{open ? "收起" : "展开"}</span>
      </button>
      {open && <div className="border-t border-border/40 px-4 py-3">{markdownBlock(content)}</div>}
    </div>
  );
}

function ReportPanel({ result }: { result: TradingAgentsResult | null }) {
  if (!result) {
    return (
      <GlassCard className="space-y-3">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <BrainCircuit size={18} className="text-primary" />
          分析报告
        </div>
        <p className="text-sm text-muted-foreground">运行完成后，这里会展示最终建议、多 Agent 分析师报告、多空辩论和风控摘要。</p>
      </GlassCard>
    );
  }

  return (
    <GlassCard glow className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-foreground">分析报告</div>
          <p className="mt-1 text-xs text-muted-foreground">来自 TradingAgents-Astock 的结构化输出。</p>
        </div>
        <span className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs text-primary">已生成</span>
      </div>

      <div className="rounded-xl border border-primary/30 bg-primary/10 p-4">
        <div className="mb-2 text-sm font-semibold text-primary">最终摘要</div>
        {markdownBlock(result.summary || result.raw_decision || result.full_report)}
      </div>

      {result.analyst_sections.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-semibold text-foreground">分析师报告</div>
          {result.analyst_sections.map((section) => (
            <AnalystSection key={section.title} title={section.title} content={section.content} />
          ))}
        </div>
      )}

      {result.debate_summary && (
        <div className="rounded-xl border border-border/50 bg-muted/15 p-4">
          <div className="mb-2 text-sm font-semibold text-foreground">多空辩论</div>
          {markdownBlock(result.debate_summary)}
        </div>
      )}

      {result.risk_summary && (
        <div className="rounded-xl border border-border/50 bg-muted/15 p-4">
          <div className="mb-2 text-sm font-semibold text-foreground">风控评估</div>
          {markdownBlock(result.risk_summary)}
        </div>
      )}

      {result.full_report && (
        <div className="rounded-xl border border-border/50 bg-background/35 p-4">
          <div className="mb-2 text-sm font-semibold text-foreground">完整报告</div>
          {markdownBlock(result.full_report)}
        </div>
      )}
    </GlassCard>
  );
}

export function TradingAgents() {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [context, setContext] = useState(defaultContext);
  const [watchStocks, setWatchStocks] = useState<WatchStock[]>([]);
  const [events, setEvents] = useState<TradingAgentsEvent[]>([]);
  const [result, setResult] = useState<TradingAgentsResult | null>(null);
  const [taskId, setTaskId] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const cfg = resolveTradingAgentsConfig();
  const aShareWatchStocks = useMemo(
    () => watchStocks.filter((item) => A_SHARE_MARKETS.has((item.market || "").toUpperCase())).slice(0, 24),
    [watchStocks],
  );
  const completedStages = events.filter((event) => event.type === "stage_completed").length;
  const latestEvent = events[events.length - 1];

  useEffect(() => {
    let mounted = true;
    api.watchlist()
      .then((data) => {
        if (mounted) setWatchStocks(data.stocks || []);
      })
      .catch(() => {
        if (mounted) setWatchStocks([]);
      });
    return () => { mounted = false; };
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const chooseStock = (stock: WatchStock) => {
    setCode(normalizeAStockCode(stock.code));
    setName(stock.name);
  };

  const run = async () => {
    const normalized = normalizeAStockCode(code);
    if (!/^\d{6}$/.test(normalized)) {
      toast.error("TradingAgents-Astock 目前只支持 A 股 6 位代码");
      return;
    }
    setCode(normalized);
    setError("");
    setResult(null);
    setEvents([]);
    setRunning(true);
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const started = await startTradingAgentsRun({ code: normalized, name: name.trim(), context: context.trim() });
      setTaskId(started.taskId);
      await streamTradingAgentsRun(
        started.taskId,
        {
          onEvent: (event) => {
            setEvents((prev) => [...prev, event].slice(-80));
            if (event.type === "result" && event.result) setResult(event.result);
          },
        },
        abortRef.current.signal,
      );
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      const message = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "TradingAgents 运行失败";
      setError(message);
      toast.error(message);
    } finally {
      setRunning(false);
      setTaskId("");
      abortRef.current = null;
    }
  };

  const cancel = async () => {
    if (!taskId) return;
    try {
      await cancelTradingAgentsRun(taskId);
      abortRef.current?.abort();
      setEvents((prev) => [...prev, { type: "cancelled", taskId, message: "用户取消了当前 TradingAgents 分析。" }]);
      toast.success("已取消当前 TradingAgents 任务");
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "取消失败";
      toast.error(message);
    } finally {
      setRunning(false);
      setTaskId("");
    }
  };

  return (
    <div className="pb-10">
      <PageHeader
        title="TradingAgents"
        subtitle="把 simonlin1212/TradingAgents-astock 的 A 股多 Agent 深度分析独立成你的一级工作台。"
        actions={(
          <Link
            to="/settings"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-primary"
          >
            <Settings size={15} />
            配置模型
          </Link>
        )}
      />

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        {[
          { label: "运行状态", value: running ? "分析中" : result ? "已完成" : "待启动", icon: running ? Loader2 : Activity },
          { label: "完成阶段", value: `${completedStages} 个`, icon: CheckCircle2 },
          { label: "关注列表 A 股", value: `${aShareWatchStocks.length} 只`, icon: Zap },
          { label: "最新进度", value: latestEvent ? statusLabel(latestEvent) : "暂无", icon: BrainCircuit },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <GlassCard key={item.label} className="p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{item.label}</span>
                <Icon size={15} className={cn("text-primary", item.label === "运行状态" && running && "animate-spin")} />
              </div>
              <div className="mt-2 text-lg font-semibold text-foreground">{item.value}</div>
            </GlassCard>
          );
        })}
      </div>

      {!cfg && (
        <GlassCard className="mb-4 border-warning/30 bg-warning/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="mt-0.5 text-warning" />
            <div>
              <div className="font-semibold text-foreground">还没有可用的 TradingAgents API 配置</div>
              <p className="mt-1 text-sm text-muted-foreground">
                它只走 API 模式。你可以在「接入 AI」里配置独立 TradingAgents 模型，或先配置默认 API 模型后再回来运行。
              </p>
            </div>
          </div>
        </GlassCard>
      )}

      <div className="grid gap-4 xl:grid-cols-[430px_minmax(0,1fr)]">
        <div className="space-y-4">
          <GlassCard glow className="space-y-4">
            <div>
              <div className="text-lg font-semibold text-foreground">启动分析</div>
              <p className="mt-1 text-xs text-muted-foreground">输入 A 股 6 位代码，或从关注列表里点选。</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <label className="space-y-1.5">
                <span className="text-xs text-muted-foreground">股票代码</span>
                <input
                  value={code}
                  onChange={(e) => setCode(normalizeAStockCode(e.target.value))}
                  placeholder="例如 600519"
                  className="w-full rounded-xl border border-border bg-background/70 px-3 py-2 text-sm outline-none focus:border-primary/60"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs text-muted-foreground">股票名称</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如 贵州茅台"
                  className="w-full rounded-xl border border-border bg-background/70 px-3 py-2 text-sm outline-none focus:border-primary/60"
                />
              </label>
            </div>
            <label className="space-y-1.5">
              <span className="text-xs text-muted-foreground">分析上下文</span>
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                rows={5}
                className="w-full resize-y rounded-xl border border-border bg-background/70 px-3 py-2 text-sm leading-6 outline-none focus:border-primary/60"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={running || !cfg}
                onClick={() => void run()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary/45 bg-primary/10 px-3 py-2 text-sm text-primary hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {running ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                开始深度分析
              </button>
              <button
                type="button"
                disabled={!running || !taskId}
                onClick={() => void cancel()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Square size={14} />
                停止
              </button>
            </div>
          </GlassCard>

          <GlassCard className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="font-semibold text-foreground">关注列表快捷选择</div>
              <span className="text-xs text-muted-foreground">仅展示 A 股</span>
            </div>
            <div className="flex max-h-44 flex-wrap gap-2 overflow-auto pr-1">
              {aShareWatchStocks.length === 0 ? (
                <p className="text-sm text-muted-foreground">关注列表里还没有 A 股标的。</p>
              ) : aShareWatchStocks.map((stock) => (
                <button
                  key={`${stock.code}.${stock.market}`}
                  type="button"
                  onClick={() => chooseStock(stock)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs transition-colors",
                    normalizeAStockCode(stock.code) === code
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-border bg-muted/10 text-muted-foreground hover:text-primary",
                  )}
                >
                  {stock.name || stock.code}
                </button>
              ))}
            </div>
          </GlassCard>

          <GlassCard className="space-y-3">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <Activity size={17} className="text-primary" />
              运行进度
            </div>
            <div className="space-y-2">
              {events.length === 0 ? (
                <p className="text-sm text-muted-foreground">启动后会显示实时阶段、日志和错误信息。</p>
              ) : events.slice().reverse().map((event, idx) => (
                <div key={`${event.taskId}-${idx}-${event.type}-${event.stage || ""}`} className={cn("rounded-xl border px-3 py-2 text-xs", eventTone(event))}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{statusLabel(event)}</span>
                    <span className="uppercase opacity-70">{event.type}</span>
                  </div>
                  {event.message && <div className="mt-1 leading-5 text-muted-foreground">{event.message}</div>}
                </div>
              ))}
            </div>
          </GlassCard>
        </div>

        <div className="space-y-4">
          {error && (
            <GlassCard className="border-danger/30 bg-danger/10 p-4 text-sm text-danger">
              {error}
            </GlassCard>
          )}
          <ReportPanel result={result} />
          <Disclaimer />
        </div>
      </div>
    </div>
  );
}
