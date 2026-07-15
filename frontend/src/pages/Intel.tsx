import { useEffect, useMemo, useState } from "react";
import { BarChart3, FileImage, Globe2, Lightbulb, Newspaper, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Disclaimer } from "@/components/ui/Disclaimer";
import { SectionTabs } from "@/components/ui/SectionTabs";
import { SaveNoteButton } from "@/components/ui/SaveNoteButton";
import { api, ApiError, type GlobalIndex, type IntelDigestResult, type MarketOverview, type ResearchHubData, type TurnoverTop } from "@/lib/api";
import { INTEL_TABS } from "@/lib/workspace";

export function Intel() {
  const [active, setActive] = useState("fundamental");
  const [hub, setHub] = useState<ResearchHubData | null>(null);
  const [marketOverview, setMarketOverview] = useState<MarketOverview | null>(null);
  const [globalIndices, setGlobalIndices] = useState<GlobalIndex[]>([]);
  const [turnoverTop, setTurnoverTop] = useState<TurnoverTop | null>(null);
  const [intelDigests, setIntelDigests] = useState<Partial<Record<"industry" | "stock", IntelDigestResult>>>({});
  const [busyKind, setBusyKind] = useState<"industry" | "stock" | "">("");

  const load = async () => {
    try {
      const [hubData, overview, globals, turnover] = await Promise.all([
        api.researchHub(),
        api.marketOverview().catch(() => null),
        api.globalIndices().catch(() => []),
        api.turnoverTop().catch(() => null),
      ]);
      setHub(hubData);
      setMarketOverview(overview);
      setGlobalIndices(globals);
      setTurnoverTop(turnover);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "资讯雷达加载失败");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const generateDigest = async (kind: "industry" | "stock") => {
    setBusyKind(kind);
    try {
      const digest = await api.generateIntelDigest(kind);
      setIntelDigests((prev) => ({ ...prev, [kind]: digest }));
      toast.success(`${digest.title}已生成`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "摘要生成失败");
    } finally {
      setBusyKind("");
    }
  };

  const generateImageArtifact = async (kind: "industry" | "stock") => {
    setBusyKind(kind);
    try {
      await api.generateIntelImageArtifact(kind);
      toast.success(kind === "industry" ? "行业动态图片请求已准备" : "个股动态图片请求已准备");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "图片请求生成失败");
    } finally {
      setBusyKind("");
    }
  };

  const aiDigest = useMemo(() => {
    if (!hub) return "";
    const lines = [
      "全球科技头条：" + hub.fundamental.global_tech_headlines.slice(0, 3).map((item) => `${item.industry_name}·${item.title}`).join("；"),
      "宏观事件：" + hub.fundamental.macro_events.flatMap((item) => item.items.slice(0, 1).map((row) => row.zh || row.title)).join("；"),
      "行业动态：" + hub.fundamental.industry_dynamics.slice(0, 3).map((item) => `${item.name} ${item.items.length}条`).join("；"),
      "个股动态：" + hub.fundamental.stock_dynamics.slice(0, 4).map((item) => `${item.name}(${item.ticker})`).join("；"),
      "地缘政治：" + hub.fundamental.geopolitics.items.map((item) => item.title).join("；"),
    ];
    return lines.join("\n");
  }, [hub]);

  return (
    <div>
      <PageHeader
        title="资讯雷达"
        subtitle="把基本面和流动性拆开管理，既能追踪最新信息，也能保留给 AI 做统一提炼。"
        actions={
          <button onClick={() => void load()} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
            <RefreshCw className="h-4 w-4" /> 刷新
          </button>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[220px_minmax(0,1fr)] xl:items-start">
        <GlassCard className="xl:sticky xl:top-6">
          <div className="mb-3">
            <p className="text-sm font-semibold">二级目录</p>
            <p className="mt-1 text-xs text-muted-foreground">左侧切换基本面与流动性，右侧展示对应工作区。</p>
          </div>
          <SectionTabs tabs={INTEL_TABS} active={active} onChange={setActive} orientation="vertical" />
        </GlassCard>

        {active === "fundamental" ? (
          <div className="space-y-4">
          <GlassCard glow>
            <div className="mb-2 flex items-center gap-2 text-primary"><Lightbulb className="h-4 w-4" /> AI 提炼要点</div>
            <p className="text-sm text-muted-foreground">这里保留给 AI 汇总四类基础面信息。当前用聚合后的工作台摘要做第一版沉淀。</p>
            {aiDigest && <div className="mt-3"><SaveNoteButton kind="今日要点" title="资讯雷达要点" content={aiDigest} /></div>}
          </GlassCard>

          <div className="grid gap-4 xl:grid-cols-2">
            <GlassCard>
              <h3 className="mb-3 flex items-center gap-2 font-semibold"><Globe2 className="h-4 w-4 text-primary" /> 全球科技头条</h3>
              <div className="space-y-2">
                {hub?.fundamental.global_tech_headlines.slice(0, 8).map((item) => (
                  <div key={`${item.industry_key}-${item.url || item.title}`} className="rounded-lg bg-muted/25 px-3 py-2 text-sm">
                    <p className="font-medium">{item.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.industry_name} · {item.source || "公开源"} · {item.time}</p>
                    {item.summary && <p className="mt-1 text-muted-foreground">{item.summary}</p>}
                  </div>
                ))}
              </div>
            </GlassCard>

            <GlassCard>
              <h3 className="mb-3 font-semibold">宏观事件</h3>
              <div className="space-y-2">
                {hub?.fundamental.macro_events.flatMap((sector) => sector.items.slice(0, 3)).map((item) => (
                  <div key={item.url} className="rounded-lg bg-muted/25 px-3 py-2 text-sm">
                    <p className="font-medium">{item.zh || item.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.source} · {item.time}</p>
                  </div>
                ))}
              </div>
            </GlassCard>

            <GlassCard>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">行业动态</h3>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  纪要接口：{hub?.fundamental.source_interfaces.industry_expert_notes.active_provider === "premium_notes" ? "已接高价值源" : "预留中"}
                </span>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => void generateDigest("industry")} disabled={busyKind === "industry"} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-primary disabled:opacity-60">
                    <Sparkles className="h-4 w-4" /> AI 总结
                  </button>
                  <button onClick={() => void generateImageArtifact("industry")} disabled={busyKind === "industry"} className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 px-3 py-1.5 text-sm text-primary hover:bg-primary/10 disabled:opacity-60">
                    <FileImage className="h-4 w-4" /> 生成图片请求
                  </button>
                </div>
              </div>
              {intelDigests.industry && <p className="mb-3 whitespace-pre-wrap rounded-lg bg-primary/5 px-3 py-2 text-sm text-muted-foreground">{intelDigests.industry.summary_text}</p>}
              <p className="mb-3 text-xs text-muted-foreground">已预留高价值纪要源接口，未来可接专家会议纪要、渠道会纪要等内容，并同步沉淀进行业中心。</p>
              <div className="space-y-2">
                {hub?.fundamental.industry_dynamics.slice(0, 6).map((item) => (
                  <div key={item.key} className="rounded-lg border border-border/40 px-3 py-3">
                    <p className="font-medium">{item.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.items[0]?.zh || item.items[0]?.title || "暂无摘要"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.items.length} 条更新</p>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <GlassCard>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 font-semibold"><Newspaper className="h-4 w-4 text-primary" /> 个股动态</h3>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  纪要接口：{hub?.fundamental.source_interfaces.stock_expert_notes.active_provider === "premium_notes" ? "已接高价值源" : "预留中"}
                </span>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => void generateDigest("stock")} disabled={busyKind === "stock"} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-primary disabled:opacity-60">
                    <Sparkles className="h-4 w-4" /> AI 总结
                  </button>
                  <button onClick={() => void generateImageArtifact("stock")} disabled={busyKind === "stock"} className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 px-3 py-1.5 text-sm text-primary hover:bg-primary/10 disabled:opacity-60">
                    <FileImage className="h-4 w-4" /> 生成图片请求
                  </button>
                </div>
              </div>
              {intelDigests.stock && <p className="mb-3 whitespace-pre-wrap rounded-lg bg-primary/5 px-3 py-2 text-sm text-muted-foreground">{intelDigests.stock.summary_text}</p>}
              <p className="mb-3 text-xs text-muted-foreground">已预留高价值纪要源接口，未来可接专家纪要、会议纪要和渠道反馈，并同步沉淀进个股中心。</p>
              <div className="space-y-2">
                {hub?.fundamental.stock_dynamics.map((item) => (
                  <div key={item.ticker} className="rounded-lg bg-muted/25 px-3 py-2 text-sm">
                    <p className="font-medium">{item.name} <span className="font-mono text-xs text-muted-foreground">{item.ticker}</span></p>
                    <p className="mt-1 text-muted-foreground">{item.highlights.join("；")}</p>
                  </div>
                ))}
              </div>
            </GlassCard>

            <GlassCard>
              <h3 className="mb-3 flex items-center gap-2 font-semibold"><Globe2 className="h-4 w-4 text-primary" /> 地缘政治</h3>
              <div className="space-y-2">
                {hub?.fundamental.geopolitics.items.map((item) => (
                  <div key={item.title} className="rounded-lg bg-muted/25 px-3 py-2 text-sm">
                    <p className="font-medium">{item.title}</p>
                    <p className="mt-1 text-muted-foreground">{item.summary}</p>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>
          </div>
        ) : (
          <div className="space-y-4">
          <GlassCard>
            <h3 className="mb-3 font-semibold">每日复盘</h3>
            <p className="mb-4 text-sm text-muted-foreground">{hub?.liquidity.daily_review.summary}</p>
            <div className="grid gap-3 md:grid-cols-5">
              {globalIndices.map((item) => (
                <div key={item.key} className="rounded-lg bg-muted/25 px-3 py-3">
                  <p className="text-xs text-muted-foreground">{item.region}</p>
                  <p className="font-medium">{item.name}</p>
                  <p className="mt-1 font-mono text-sm">{item.price ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{item.change_pct == null ? "—" : `${item.change_pct > 0 ? "+" : ""}${item.change_pct}%`}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-4 xl:grid-cols-3">
              <div className="rounded-xl border border-border/40 p-4">
                <p className="text-sm font-medium">A 股涨跌家数</p>
                <p className="mt-2 text-2xl font-bold text-primary">{marketOverview?.sentiment.up ?? "—"} / {marketOverview?.sentiment.down ?? "—"}</p>
                <p className="text-xs text-muted-foreground">上涨 / 下跌</p>
              </div>
              <div className="rounded-xl border border-border/40 p-4">
                <p className="text-sm font-medium">行业资金流</p>
                <p className="mt-2 text-sm text-muted-foreground">{marketOverview?.sectors.slice(0, 3).map((item) => `${item.name}${item.pct > 0 ? "+" : ""}${item.pct}%`).join(" · ") || "待更新"}</p>
              </div>
              <div className="rounded-xl border border-border/40 p-4">
                <p className="text-sm font-medium">国家队 ETF</p>
                <p className="mt-2 text-sm text-muted-foreground">{hub?.liquidity.daily_review.etf_placeholder}</p>
              </div>
            </div>
            <div className="mt-4">
              <p className="mb-2 flex items-center gap-2 text-sm font-medium"><BarChart3 className="h-4 w-4 text-primary" /> Top20 成交额</p>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {turnoverTop?.stocks.slice(0, 8).map((item) => (
                  <div key={item.code} className="rounded-lg bg-muted/25 px-3 py-2 text-sm">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.code} · {item.industry || "未知行业"}</p>
                  </div>
                ))}
              </div>
            </div>
          </GlassCard>

          <div className="grid gap-4 xl:grid-cols-2">
            <GlassCard>
              <h3 className="mb-3 font-semibold">关键流动性指标</h3>
              <div className="space-y-2">
                {hub?.liquidity.indicators.map((item) => (
                  <div key={item.key} className="rounded-lg border border-border/40 px-3 py-3">
                    <p className="font-medium">{item.label}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.insight}</p>
                  </div>
                ))}
              </div>
            </GlassCard>

            <GlassCard>
              <h3 className="mb-3 font-semibold">核心大宗商品</h3>
              <div className="space-y-2">
                {hub?.liquidity.commodities.map((item) => (
                  <div key={item.key} className="rounded-lg border border-border/40 px-3 py-3">
                    <p className="font-medium">{item.label}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.insight}</p>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>
          </div>
        )}
      </div>

      <Disclaimer />
    </div>
  );
}
