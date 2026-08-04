import { type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { type LucideIcon, ArrowUpRight, BarChart3, ChevronDown, ChevronUp, FileImage, Globe2, GripVertical, Lightbulb, Newspaper, Plus, RefreshCw, Sparkles, X } from "lucide-react";
import { useLocation, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AskAiButton } from "@/components/ui/AskAiButton";
import { CurrentModelHint } from "@/components/ui/CurrentModelHint";
import { GlassCard } from "@/components/ui/GlassCard";
import { Disclaimer } from "@/components/ui/Disclaimer";
import { PageHeader } from "@/components/ui/PageHeader";
import { SaveNoteButton } from "@/components/ui/SaveNoteButton";
import { SectionTabs } from "@/components/ui/SectionTabs";
import { api, ApiError, type Announcement, type GlobalIndex, type IntelDigestResult, type MarketOverview, type NewsItem, type NewsRadarConfig, type ResearchHubData, type SourceTier, type TurnoverTop } from "@/lib/api";
import { countMacroItems, filterDeskMacroGroups, type MacroFeedMode, type MacroScoreBreakdown, type ScoredMacroItem } from "@/lib/intel-macro-filter";
import { formatIntelAutoRefreshNotice } from "@/lib/intel-auto-refresh-notice";
import { buildIntelContentSignature } from "@/lib/intel-content-signature";
import { type DropIndicator, type DropPosition, getDropPosition, reorderWithDropPosition } from "@/lib/drag-sort";
import { runIntelRefresh } from "@/lib/intel-refresh";
import { chat } from "@/lib/llm";
import { cn } from "@/lib/utils";
import { INTEL_TABS } from "@/lib/workspace";

const FUNDAMENTAL_VIEW_TABS = [
  { key: "overview", label: "要点总览" },
  { key: "tech", label: "全球科技头条" },
  { key: "macro", label: "宏观事件" },
  { key: "industry", label: "行业动态" },
  { key: "stock", label: "个股动态" },
  { key: "geopolitics", label: "地缘政治" },
  { key: "hiring", label: "招聘雷达" },
];

const DESK_FUNDAMENTAL_VIEW_TABS = [
  ...FUNDAMENTAL_VIEW_TABS,
  { key: "sources", label: "信息源" },
];

const LIQUIDITY_VIEW_TABS = [
  { key: "daily", label: "每日复盘" },
  { key: "indicators", label: "关键流动性指标" },
  { key: "commodities", label: "核心大宗商品" },
];

const EVENT_PROBABILITY_VIEW_TABS = [
  { key: "overview", label: "总览" },
  { key: "priority-events", label: "重点事件" },
  { key: "sources", label: "数据接口" },
];

const EVENT_PROBABILITY_SORT_OPTIONS = [
  { key: "rank", label: "综合优先级" },
  { key: "window", label: "近端窗口" },
  { key: "probability", label: "概率强度" },
  { key: "category", label: "按类别看" },
] as const;

const EVENT_PROBABILITY_QUEUE_OPTIONS = [
  { key: "todo", label: "待跟进" },
  { key: "all", label: "全部事件" },
  { key: "verified", label: "已验证" },
] as const;

const FUNDAMENTAL_MODULES: Array<{ key: IntelKind; label: string; icon: LucideIcon }> = [
  { key: "tech", label: "全球科技头条", icon: Globe2 },
  { key: "macro", label: "宏观事件", icon: Lightbulb },
  { key: "industry", label: "行业动态", icon: BarChart3 },
  { key: "stock", label: "个股动态", icon: Newspaper },
  { key: "geopolitics", label: "地缘政治", icon: Globe2 },
  { key: "hiring", label: "招聘雷达", icon: Globe2 },
];

type IntelKind = "tech" | "macro" | "industry" | "stock" | "geopolitics" | "hiring";
type EventPrioritySortKey = (typeof EVENT_PROBABILITY_SORT_OPTIONS)[number]["key"];
type EventQueueViewKey = (typeof EVENT_PROBABILITY_QUEUE_OPTIONS)[number]["key"];

type ModuleSource = {
  id: string;
  label: string;
  provider: string;
  note: string;
  enabled: boolean;
  tier?: SourceTier;
  removable?: boolean;
};

type ModuleSourceDraft = {
  label: string;
  provider: string;
  note: string;
  topicKey: string;
  tier: SourceTier;
};

type SourceRecord = Record<IntelKind, ModuleSource[]>;
type SourceDraftRecord = Record<IntelKind, ModuleSourceDraft>;
type FocusRecord = Record<"industry" | "stock", string[]>;
type FocusDraftRecord = Record<"industry" | "stock", string>;
type SourcePanelRecord = Record<IntelKind, boolean>;
type TopicDraftRecord = Record<IntelKind, string>;

type StockFeedItem = {
  ticker: string;
  name: string;
  group: string;
  announcements: Announcement[];
  news: NewsItem[];
  highlights: string[];
};

type NewsFrontItem = {
  id: string;
  time: string;
  title: string;
  subtitle?: string;
  source?: string;
  topic?: string;
  url?: string;
  score?: number;
  scoreLabel?: string;
  sourceCount?: number;
  clusterSize?: number;
  scoreReason?: string;
  scoreBreakdown?: MacroScoreBreakdown;
  relatedItems?: Array<{ title: string; url?: string; source?: string }>;
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore localStorage failures */
  }
}

function uniqueById(items: ModuleSource[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function topicKeyFromName(value: string) {
  const normalized = value.trim().toLowerCase()
    .replace(/[\s/]+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || `topic-${Date.now()}`;
}

function moduleAccent(kind: IntelKind) {
  if (kind === "tech") return "#3b82f6";
  if (kind === "macro") return "#eab308";
  if (kind === "industry") return "#14b8a6";
  if (kind === "stock") return "#fb7185";
  if (kind === "hiring") return "#f97316";
  return "#ef4444";
}

function eventProbabilityStatusLabel(status: string) {
  if (status === "active") return "已接入";
  if (status === "watching") return "观察中";
  return "待补充";
}

function eventProbabilitySourceCoverage(key: string) {
  if (key === "macro-calendar-live") return "覆盖宏观窗口";
  if (key === "industry-catalyst-knowledge") return "覆盖行业催化";
  if (key === "stock-catalyst-watchlist") return "覆盖个股催化";
  return "覆盖范围待补充";
}

function eventProbabilityCategoryRank(category: string) {
  if (category === "宏观窗口") return 0;
  if (category === "行业催化") return 1;
  if (category === "个股催化") return 2;
  return 9;
}

function eventProbabilityCategoryDescription(category: string) {
  if (category === "宏观窗口") return "先看政策、会议和跨市场宏观事件。";
  if (category === "行业催化") return "集中看景气验证、政策催化和产业变化。";
  if (category === "个股催化") return "最后落到个股公告、订单和电话会信号。";
  return "按当前类别分组展示。";
}

function eventProbabilityJudgmentPreview(text: string) {
  const normalized = String(text || "").trim();
  if (normalized.length <= 34) return normalized;
  return `${normalized.slice(0, 34)}...`;
}

function eventPrioritySortLabel(sort: EventPrioritySortKey) {
  return EVENT_PROBABILITY_SORT_OPTIONS.find((item) => item.key === sort)?.label || "综合优先级";
}

function eventProbabilityVerificationLabel(status: string) {
  if (status === "验证中") return "验证中";
  if (status === "已验证") return "已验证";
  return "待验证";
}

function eventQueueViewLabel(view: EventQueueViewKey) {
  return EVENT_PROBABILITY_QUEUE_OPTIONS.find((item) => item.key === view)?.label || "待跟进";
}

function buildDefaultSources(hub: ResearchHubData | null): SourceRecord {
  const industryProvider = hub?.fundamental.source_interfaces.industry_expert_notes.active_provider || "investment_news";
  const stockProvider = hub?.fundamental.source_interfaces.stock_expert_notes.active_provider || "watchlist_news";
  const macroSources = Array.from(new Set((hub?.fundamental.macro_events ?? []).flatMap((group) => (group.items ?? []).map((item) => item.source)).filter(Boolean)));
  const techSources = Array.from(new Set((hub?.fundamental.global_tech_headlines ?? []).map((item) => item.source).filter(Boolean)));

  return {
    tech: uniqueById([
      { id: "tech-public-headlines", label: "全球科技头条公开源", provider: "public_web", note: techSources.join(" / ") || "公开科技资讯源", enabled: true },
    ]),
    macro: uniqueById([
      { id: "macro-calendar-public", label: "宏观事件公开源", provider: "public_calendar", note: macroSources.join(" / ") || "公开宏观、政策与会议日历", enabled: true },
      { id: "macro-ifind-placeholder", label: "iFind 宏观事件接口", provider: "ifind_placeholder", note: "后续可切主数据源，承接重点会议、政策、发布日历。", enabled: true },
    ]),
    industry: uniqueById([
      { id: "industry-investment-news", label: "Investment News 行业动态", provider: "investment_news", note: "承接模板里的 investment-news 和公开行业资讯。", enabled: true },
      { id: `industry-${industryProvider}`, label: "高价值行业纪要接口", provider: industryProvider, note: "未来可接 AlphaEngine、专家会、渠道会纪要等高价值源。", enabled: true },
    ]),
    stock: uniqueById([
      { id: "stock-watchlist-news", label: "关注列表联动个股动态", provider: "watchlist_linked", note: "只围绕你在关注列表里维护的个股池展示。", enabled: true },
      { id: `stock-${stockProvider}`, label: "高价值个股纪要接口", provider: stockProvider, note: "未来可接电话会纪要、专家访谈、渠道反馈等内容。", enabled: true },
    ]),
    geopolitics: uniqueById([
      { id: "geopolitics-public-feed", label: "地缘政治公开源", provider: "public_news", note: "承接公开地缘事件、区域冲突、政策博弈等信息流。", enabled: true },
    ]),
    hiring: uniqueById([
      { id: "hiring-radar-upstream", label: "Hiring-Radar 官方脚本", provider: "official_upstream", note: "优先调用本地仓库，缺失时回退到官方脚本抓取全球招聘信号。", enabled: true },
    ]),
  };
}

function buildDigestPreview(kind: IntelKind, hub: ResearchHubData | null) {
  if (!hub) return "";
  if (kind === "tech") {
    return (hub.fundamental.global_tech_headlines ?? [])
      .slice(0, 3)
      .map((item) => `${item.industry_name}：${item.title}`)
      .join("；");
  }
  if (kind === "macro") {
    return (hub.fundamental.macro_events ?? [])
      .flatMap((group) => (group.items ?? []).slice(0, 3).map((item) => item.zh || item.title))
      .slice(0, 4)
      .join("；");
  }
  if (kind === "industry") {
    return (hub.fundamental.industry_dynamics ?? [])
      .slice(0, 4)
      .map((item) => `${item.name}：${item.items?.[0]?.zh || item.items?.[0]?.title || "有新动态"}`)
      .join("；");
  }
  if (kind === "stock") {
    return (hub.fundamental.stock_dynamics ?? [])
      .slice(0, 4)
      .map((item) => `${item.name}：${(item.highlights ?? []).slice(0, 1).join("；") || "有新动态"}`)
      .join("；");
  }
  if (kind === "hiring") {
    return (hub.fundamental.hiring_radar?.items ?? [])
      .slice(0, 4)
      .map((item) => `${item.company}：${item.title}`)
      .join("；");
  }
  return (hub.fundamental.geopolitics.items ?? [])
    .slice(0, 4)
    .map((item) => `${item.title}：${item.summary}`)
    .join("；");
}

function formatRadarUpdatedAt(value: string | null) {
  if (!value) return "资讯更新时间未知";
  const normalized = value.includes("T") ? value.replace("T", " ") : value;
  return `资讯更新于 ${normalized.slice(0, 16)}`;
}

function buildIntelDigestContext(kind: IntelKind, hub: ResearchHubData | null) {
  if (!hub) return "暂无投研资讯数据，请先刷新页面。";
  if (kind === "tech") {
    return (hub.fundamental.global_tech_headlines ?? [])
      .slice(0, 8)
      .map((item) => `${item.industry_name || "科技"}：${item.summary || item.title || "暂无摘要"}`)
      .join("\n") || "暂无全球科技头条。";
  }
  if (kind === "macro") {
    return (hub.fundamental.macro_events ?? [])
      .flatMap((group) => (group.items ?? []).slice(0, 2).map((item) => `${item.source || "公开源"}：${item.zh || item.title || "暂无摘要"}`))
      .join("\n") || "暂无宏观事件。";
  }
  if (kind === "industry") {
    return (hub.fundamental.industry_dynamics ?? [])
      .slice(0, 6)
      .map((item) => {
        const first = item.items?.[0] || {};
        return `${item.name}：${first.zh || first.title || "暂无摘要"}`;
      })
      .join("\n") || "暂无行业动态。";
  }
  if (kind === "stock") {
    const stockLines = (hub.fundamental.stock_dynamics ?? [])
      .slice(0, 8)
      .map((item) => `${item.name}(${item.ticker})：${(item.highlights ?? []).join("；") || "暂无摘要"}`);
    const topicLines = (hub.fundamental.stock_topics ?? [])
      .slice(0, 4)
      .map((item) => {
        const first = item.items?.[0] || {};
        return `${item.name}：${first.zh || first.title || "暂无摘要"}`;
      });
    return [...stockLines, ...topicLines].join("\n") || "暂无个股动态。";
  }
  if (kind === "hiring") {
    return (hub.fundamental.hiring_radar?.items ?? [])
      .slice(0, 8)
      .map((item) => `${item.company || "未知公司"}：${item.title || "未命名岗位"}（${item.location || "未知地点"}）`)
      .join("\n") || "暂无招聘信号。";
  }
  return (hub.fundamental.geopolitics.items ?? [])
    .slice(0, 8)
    .map((item) => `${item.industry_name || item.title || "事件"}：${item.summary || item.title || "暂无摘要"}`)
    .join("\n") || "暂无地缘政治事件。";
}

function buildIntelDigestPrompt(kind: IntelKind) {
  const label = FUNDAMENTAL_MODULES.find((item) => item.key === kind)?.label || "投研资讯";
  return [
    `以下是「${label}」模块的最新资讯摘要，请提炼成一段适合投研工作台展示的中文要点。`,
    "要求：",
    "1. 只基于给定内容提炼，不编造事实。",
    "2. 先给一句总判断，再给 3-5 条高信息密度要点。",
    "3. 重点写变化、催化、风险，不写空话。",
    "4. 不给投资建议，不预测涨跌。",
  ].join("\n");
}

export function Intel({ deskMode = false }: { deskMode?: boolean }) {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [active, setActive] = useState("fundamental");
  const [fundamentalView, setFundamentalView] = useState("overview");
  const [liquidityView, setLiquidityView] = useState("daily");
  const [eventProbabilityView, setEventProbabilityView] = useState("overview");
  const [eventPrioritySort, setEventPrioritySort] = useState<EventPrioritySortKey>(() => readJson<EventPrioritySortKey>("intel-event-priority-sort", "rank"));
  const [eventQueueView, setEventQueueView] = useState<EventQueueViewKey>(() => readJson<EventQueueViewKey>("intel-event-queue-view", "todo"));
  const [expandedEventCards, setExpandedEventCards] = useState<string[]>(() => readJson<string[]>("intel-event-priority-expanded", []));
  const [eventArchiveExpanded, setEventArchiveExpanded] = useState<boolean>(() => readJson<boolean>("intel-event-archive-expanded", false));
  const [completedEventTaskKeys, setCompletedEventTaskKeys] = useState<string[]>(() => readJson<string[]>("intel-event-completed-keys", []));
  const [hub, setHub] = useState<ResearchHubData | null>(null);
  const [marketOverview, setMarketOverview] = useState<MarketOverview | null>(null);
  const [globalIndices, setGlobalIndices] = useState<GlobalIndex[]>([]);
  const [turnoverTop, setTurnoverTop] = useState<TurnoverTop | null>(null);
  const [intelDigests, setIntelDigests] = useState<Partial<Record<IntelKind, IntelDigestResult>>>({});
  const [busyKind, setBusyKind] = useState<IntelKind | "">("");
  const [overviewBusy, setOverviewBusy] = useState<"" | "digest" | "artifact">("");
  const [refreshState, setRefreshState] = useState<"" | "loading" | "success">("");
  const [radarUpdatedAt, setRadarUpdatedAt] = useState<string | null>(null);
  const [contentSignature, setContentSignature] = useState("");
  const [autoRefreshNotice, setAutoRefreshNotice] = useState("");
  const [refreshFallbackMessage, setRefreshFallbackMessage] = useState("");
  const [macroFeedMode, setMacroFeedMode] = useState<MacroFeedMode>(() => readJson<MacroFeedMode>("desk-intel-macro-feed-mode", "focused"));
  const [draggingModule, setDraggingModule] = useState<IntelKind | "">("");
  const [moduleDropIndicator, setModuleDropIndicator] = useState<DropIndicator<IntelKind>>(null);
  const [stockFeedItems, setStockFeedItems] = useState<StockFeedItem[]>([]);
  const [radarConfig, setRadarConfig] = useState<NewsRadarConfig | null>(null);
  const [configSaving, setConfigSaving] = useState(false);
  const [moduleOrder, setModuleOrder] = useState<IntelKind[]>(() => {
    const stored = readJson<IntelKind[]>("intel-fundamental-module-order", []);
    const fallback = FUNDAMENTAL_MODULES.map((item) => item.key);
    return [...stored.filter((item) => fallback.includes(item)), ...fallback.filter((item) => !stored.includes(item))];
  });
  const [sourcePanels, setSourcePanels] = useState<SourcePanelRecord>(() => readJson<SourcePanelRecord>("intel-source-panels", {
    tech: false,
    macro: false,
    industry: true,
    stock: true,
    geopolitics: false,
    hiring: false,
  }));
  const [deskSourcePanels, setDeskSourcePanels] = useState<SourcePanelRecord>(() => readJson<SourcePanelRecord>("desk-intel-source-panels", {
    tech: false,
    macro: false,
    industry: false,
    stock: false,
    geopolitics: false,
    hiring: false,
  }));
  const [sourceDrafts, setSourceDrafts] = useState<SourceDraftRecord>({
    tech: { label: "", provider: "rss", note: "", topicKey: "", tier: "T2" },
    macro: { label: "", provider: "rss", note: "", topicKey: "", tier: "T2" },
    industry: { label: "", provider: "rss", note: "", topicKey: "", tier: "T2" },
    stock: { label: "", provider: "rss", note: "", topicKey: "", tier: "T2" },
    geopolitics: { label: "", provider: "rss", note: "", topicKey: "", tier: "T2" },
    hiring: { label: "", provider: "manual", note: "", topicKey: "", tier: "T2" },
  });
  const [topicDrafts, setTopicDrafts] = useState<TopicDraftRecord>({
    tech: "",
    macro: "",
    industry: "",
    stock: "",
    geopolitics: "",
    hiring: "",
  });
  const [focuses, setFocuses] = useState<FocusRecord>(() => readJson<FocusRecord>("intel-focuses", {
    industry: [],
    stock: [],
  }));
  const [focusDrafts, setFocusDrafts] = useState<FocusDraftRecord>({
    industry: "",
    stock: "",
  });
  const autoRefreshInFlightRef = useRef(false);
  const autoRefreshNoticeTimerRef = useRef<number | null>(null);

  const load = async (options?: { silent?: boolean; suppressErrorToast?: boolean; forceRefresh?: boolean }) => {
    const silent = options?.silent ?? false;
    const suppressErrorToast = options?.suppressErrorToast ?? silent;
    const forceRefresh = options?.forceRefresh ?? !silent;
    if (!silent) setRefreshState("loading");
    try {
      const {
        hubData,
        overview,
        globals,
        turnover,
        configData,
        stockFeeds,
        radarGeneratedAt,
        refreshError,
      } = await runIntelRefresh({
        forceRadarRefresh: forceRefresh,
        refreshRadar: async () => {
          return await api.radarRefresh();
        },
        refreshHiringRadar: async () => {
          return await api.hiringRadarRefresh();
        },
        loadRadar: () => api.radar().catch(() => ({ generated_at: null, recent_days: 7, industries: [], stats: { industries: 0, total_sources: 0 } })),
        loadHub: () => api.researchHub(),
        loadMarketOverview: () => api.marketOverview().catch(() => null),
        loadGlobalIndices: () => api.globalIndices().catch(() => []),
        loadTurnoverTop: () => api.turnoverTop().catch(() => null),
        loadWatchlist: () => api.watchlist().catch(() => ({ stocks: [], indicators: [], updated_at: "" })),
        loadNewsSourcesConfig: () => api.newsSourcesConfig().catch(() => null),
        loadAnnouncements: (code) => api.announcements(code).catch(() => []),
        loadNews: (code) => api.news(code).catch(() => []),
      });
      setHub(hubData);
      setMarketOverview(overview);
      setGlobalIndices(globals);
      setTurnoverTop(turnover);
      setStockFeedItems(stockFeeds as StockFeedItem[]);
      setRadarUpdatedAt(radarGeneratedAt);
      setContentSignature(buildIntelContentSignature(hubData));
      setRadarConfig(configData || hubData.fundamental.news_source_config);
      setRefreshFallbackMessage(refreshError ? `强制刷新失败，当前展示的是最近一次缓存内容。${refreshError}` : "");
      if (!silent && refreshError) {
        toast.error(`强制刷新失败，已回退到缓存内容：${refreshError}`);
      }
      if (!silent) {
        setRefreshState("success");
        window.setTimeout(() => {
          setRefreshState((current) => current === "success" ? "" : current);
        }, 1500);
      }
    } catch (error) {
      if (!silent) setRefreshState("");
      if (!suppressErrorToast) {
        toast.error(error instanceof ApiError ? error.message : "投研资讯加载失败");
      }
    } finally {
      if (!silent) {
        setRefreshState((current) => current === "loading" ? "" : current);
      }
    }
  };

  useEffect(() => {
    void load({ silent: true, suppressErrorToast: true, forceRefresh: false });
  }, []);

  useEffect(() => {
    if (location.pathname !== "/intel" || !hub) return;

    let cancelled = false;
    const timer = window.setInterval(() => {
      void (async () => {
        if (cancelled || refreshState === "loading" || autoRefreshInFlightRef.current) return;

        autoRefreshInFlightRef.current = true;
        try {
          const radar = await api.radar();
          if (cancelled || !radar.generated_at || radar.generated_at === radarUpdatedAt) return;

          const latestHub = await api.researchHub();
          if (cancelled) return;

          const nextSignature = buildIntelContentSignature(latestHub);
          if (nextSignature === contentSignature) {
            setRadarUpdatedAt(radar.generated_at);
            return;
          }

          await load({ silent: true, suppressErrorToast: true, forceRefresh: false });
          setAutoRefreshNotice(formatIntelAutoRefreshNotice(radar.generated_at));
          if (autoRefreshNoticeTimerRef.current) {
            window.clearTimeout(autoRefreshNoticeTimerRef.current);
          }
          autoRefreshNoticeTimerRef.current = window.setTimeout(() => {
            setAutoRefreshNotice("");
            autoRefreshNoticeTimerRef.current = null;
          }, 4000);
        } catch {
          // Keep auto-detection silent; the next cycle can retry.
        } finally {
          autoRefreshInFlightRef.current = false;
        }
      })();
    }, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [contentSignature, hub, location.pathname, radarUpdatedAt, refreshState]);

  useEffect(() => () => {
    if (autoRefreshNoticeTimerRef.current) {
      window.clearTimeout(autoRefreshNoticeTimerRef.current);
    }
  }, []);

  useEffect(() => {
    const sub = searchParams.get("sub");
    if (sub && INTEL_TABS.some((tab) => tab.key === sub) && sub !== active) {
      setActive(sub);
      return;
    }
    if (!sub) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("sub", active);
        return next;
      }, { replace: true });
    }
  }, [active, searchParams, setSearchParams]);

  useEffect(() => {
    writeJson("intel-fundamental-module-order", moduleOrder);
  }, [moduleOrder]);

  useEffect(() => {
    writeJson("intel-source-panels", sourcePanels);
  }, [sourcePanels]);

  useEffect(() => {
    if (deskMode) writeJson("desk-intel-source-panels", deskSourcePanels);
  }, [deskMode, deskSourcePanels]);

  useEffect(() => {
    writeJson("intel-focuses", focuses);
  }, [focuses]);

  useEffect(() => {
    writeJson("intel-event-priority-sort", eventPrioritySort);
  }, [eventPrioritySort]);

  useEffect(() => {
    writeJson("intel-event-queue-view", eventQueueView);
  }, [eventQueueView]);

  useEffect(() => {
    writeJson("intel-event-priority-expanded", expandedEventCards);
  }, [expandedEventCards]);

  useEffect(() => {
    writeJson("intel-event-archive-expanded", eventArchiveExpanded);
  }, [eventArchiveExpanded]);

  useEffect(() => {
    writeJson("intel-event-completed-keys", completedEventTaskKeys);
  }, [completedEventTaskKeys]);

  useEffect(() => {
    if (deskMode) writeJson("desk-intel-macro-feed-mode", macroFeedMode);
  }, [deskMode, macroFeedMode]);

  const techHeadlines = hub?.fundamental.global_tech_headlines ?? [];
  const rawMacroEvents = hub?.fundamental.macro_events ?? [];
  const focusedMacroEvents = useMemo(() => filterDeskMacroGroups(rawMacroEvents), [rawMacroEvents]);
  const macroEvents = deskMode && macroFeedMode === "focused" ? focusedMacroEvents : rawMacroEvents;
  const rawMacroCount = countMacroItems(rawMacroEvents);
  const focusedMacroCount = countMacroItems(focusedMacroEvents);
  const industryDynamics = hub?.fundamental.industry_dynamics ?? [];
  const stockDynamics = hub?.fundamental.stock_dynamics ?? [];
  const stockTopics = hub?.fundamental.stock_topics ?? [];
  const geopoliticalItems = hub?.fundamental.geopolitics.items ?? [];
  const geopoliticalGroups = hub?.fundamental.geopolitics.groups ?? [];
  const hiringRadar = hub?.fundamental.hiring_radar ?? { title: "招聘雷达", summary: "", updated_at: "", companies: [], source: "Hiring-Radar", items: [] };
  const liquidityIndicators = hub?.liquidity.indicators ?? [];
  const liquidityCommodities = hub?.liquidity.commodities ?? [];
  const eventProbability = hub?.event_probability ?? {
    summary: { title: "事件概率体系入口", description: "当前先接结构化骨架。", updated_at: "" },
    scenario_snapshot: {
      base_case: { label: "基准情景", summary: "当前先保留事件概率的观察骨架。" },
      upside_case: { label: "上行情景", summary: "后续有更多催化验证时，在这里承接上行判断。" },
      downside_case: { label: "下行情景", summary: "后续有关键变量走弱时，在这里承接下行情景。" },
      active_count: 0,
      watching_count: 0,
    },
    planned_modules: [],
    priority_events: [],
    source_interfaces: [],
  };
  const eventProbabilityCategoryCounts = {
    macro: eventProbability.priority_events.filter((item) => item.category === "宏观窗口").length,
    industry: eventProbability.priority_events.filter((item) => item.category === "行业催化").length,
    stock: eventProbability.priority_events.filter((item) => item.category === "个股催化").length,
  };
  const eventProbabilityActiveSourceCount = eventProbability.source_interfaces.filter((item) => item.status === "active").length;
  const eventProbabilityWatchingModuleCount = eventProbability.planned_modules.filter((item) => item.status === "watching").length;
  const sortedEventProbabilityEvents = useMemo(() => {
    const rows = [...eventProbability.priority_events];
    if (eventPrioritySort === "window") {
      return rows.sort((left, right) => (
        right.rank_breakdown.status_score - left.rank_breakdown.status_score
        || right.rank_score - left.rank_score
        || left.title.localeCompare(right.title, "zh-CN")
      ));
    }
    if (eventPrioritySort === "probability") {
      return rows.sort((left, right) => (
        right.rank_breakdown.probability_score - left.rank_breakdown.probability_score
        || right.rank_score - left.rank_score
        || left.title.localeCompare(right.title, "zh-CN")
      ));
    }
    if (eventPrioritySort === "category") {
      return rows.sort((left, right) => (
        eventProbabilityCategoryRank(left.category) - eventProbabilityCategoryRank(right.category)
        || right.rank_score - left.rank_score
        || left.title.localeCompare(right.title, "zh-CN")
      ));
    }
    return rows.sort((left, right) => (
      (left.rank_order ?? 99) - (right.rank_order ?? 99)
      || right.rank_score - left.rank_score
      || left.title.localeCompare(right.title, "zh-CN")
    ));
  }, [eventPrioritySort, eventProbability.priority_events]);
  const archivedEventTaskKeySet = useMemo(
    () => new Set(completedEventTaskKeys),
    [completedEventTaskKeys],
  );
  const isArchivedEventTask = (key: string, verificationStatus: string) => (
    verificationStatus === "已验证" || archivedEventTaskKeySet.has(key)
  );
  const queuedEventProbabilityEvents = useMemo(() => {
    if (eventQueueView === "verified") {
      return sortedEventProbabilityEvents.filter((item) => isArchivedEventTask(item.key, item.verification_status));
    }
    if (eventQueueView === "all") {
      return sortedEventProbabilityEvents;
    }
    return sortedEventProbabilityEvents.filter((item) => !isArchivedEventTask(item.key, item.verification_status));
  }, [eventQueueView, sortedEventProbabilityEvents, archivedEventTaskKeySet]);
  const queuedEventProbabilityCategoryGroups = useMemo(() => {
    if (eventPrioritySort !== "category") return [];
    const groups = new Map<string, typeof queuedEventProbabilityEvents>();
    for (const item of queuedEventProbabilityEvents) {
      const current = groups.get(item.category) ?? [];
      current.push(item);
      groups.set(item.category, current);
    }
    return Array.from(groups.entries()).map(([category, items]) => ({ category, items }));
  }, [eventPrioritySort, queuedEventProbabilityEvents]);
  const archivedEventProbabilityEvents = useMemo(
    () => sortedEventProbabilityEvents.filter((item) => isArchivedEventTask(item.key, item.verification_status)),
    [sortedEventProbabilityEvents, archivedEventTaskKeySet],
  );
  const eventQueueCounts = {
    todo: sortedEventProbabilityEvents.filter((item) => !isArchivedEventTask(item.key, item.verification_status)).length,
    all: sortedEventProbabilityEvents.length,
    verified: archivedEventProbabilityEvents.length,
  };
  const pinnedEventProbabilityTask = useMemo(
    () => queuedEventProbabilityEvents[0] ?? null,
    [queuedEventProbabilityEvents],
  );
  const nextEventProbabilityTask = useMemo(
    () => queuedEventProbabilityEvents[1] ?? null,
    [queuedEventProbabilityEvents],
  );
  const eventPrioritySummary = useMemo(() => {
    if (!queuedEventProbabilityEvents.length) {
      return "当前还没有进入事件流的重点事件，后续接入后这里会自动生成摘要。";
    }
    const first = queuedEventProbabilityEvents[0];
    const topTitles = queuedEventProbabilityEvents.slice(0, 3).map((item) => item.title).join("、");
    const nextActions = queuedEventProbabilityEvents.slice(0, 2).map((item) => `${item.title}：${item.follow_up}`).join("；");
    if (eventPrioritySort === "window") {
      const activeCount = queuedEventProbabilityEvents.filter((item) => item.trigger_window === "近端窗口").length;
      return `当前按近端窗口优先，排在前面的核心是 ${topTitles}；其中有 ${activeCount} 条已经进入近端交易窗口。优先动作：${nextActions}`;
    }
    if (eventPrioritySort === "probability") {
      const strongCount = queuedEventProbabilityEvents.filter((item) => item.probability_label === "高" || item.probability_label === "中高").length;
      return `当前按概率强度优先，最值得先看的包括 ${topTitles}；其中 ${strongCount} 条已经落在高或中高概率判断区间。优先动作：${nextActions}`;
    }
    if (eventPrioritySort === "category") {
      return `当前按类别分组展示，优先从 ${first.category} 开始扫读；最前面的事件包括 ${topTitles}。优先动作：${nextActions}`;
    }
    return `当前按综合优先级排序，排在前面的重点事件包括 ${topTitles}；排名第一的是 ${first.title}。优先动作：${nextActions}`;
  }, [eventPrioritySort, queuedEventProbabilityEvents]);
  const eventPriorityRiskSummary = useMemo(() => {
    if (!queuedEventProbabilityEvents.length) {
      return "当前暂无重点事件进入队列，暂时没有需要额外防守的近端扰动。";
    }
    const plannedCount = queuedEventProbabilityEvents.filter((item) => item.trigger_window === "远期窗口").length;
    const mediumCount = queuedEventProbabilityEvents.filter((item) => item.probability_label === "中").length;
    const first = queuedEventProbabilityEvents[0];
    if (eventPrioritySort === "window") {
      return `近端视角下要防止“只盯近端、忽略兑现质量”的误判；尤其要留意 ${first.title} 后续是否真的出现公告、政策或数据验证。`;
    }
    if (eventPrioritySort === "probability") {
      return `概率视角下要防止高概率叙事被反复交易；当前仍有 ${mediumCount} 条只处于中等判断区间，不能把它们当成已兑现结论。`;
    }
    if (eventPrioritySort === "category") {
      return `类别视角下要防止分组阅读后忽略跨类别联动；尤其要留意宏观、行业、个股三层信号是否互相验证。`;
    }
    return `综合排序下要防止总分掩盖远期不确定性；当前还有 ${plannedCount} 条远期窗口事件，需要和排在前面的近端催化区分对待。`;
  }, [eventPrioritySort, queuedEventProbabilityEvents]);
  const toggleExpandedEventCard = (key: string) => {
    setExpandedEventCards((current) => (
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    ));
  };
  const markEventTaskComplete = (key: string) => {
    setCompletedEventTaskKeys((current) => (current.includes(key) ? current : [...current, key]));
    setExpandedEventCards((current) => current.filter((item) => item !== key));
  };
  const restoreEventTask = (key: string) => {
    setCompletedEventTaskKeys((current) => current.filter((item) => item !== key));
  };
  const defaultSources = useMemo(() => buildDefaultSources(hub), [hub]);
  const moduleTopics = useMemo(() => ({
    tech: (radarConfig?.industries ?? []).filter((item) => item.module === "tech"),
    macro: (radarConfig?.industries ?? []).filter((item) => item.module === "macro"),
    industry: (radarConfig?.industries ?? []).filter((item) => item.module === "industry"),
    stock: (radarConfig?.industries ?? []).filter((item) => item.module === "stock"),
    geopolitics: (radarConfig?.industries ?? []).filter((item) => item.module === "geopolitics"),
    hiring: [],
  }), [radarConfig]);
  const availableIndustryNames = useMemo(() => industryDynamics.map((item) => item.name), [industryDynamics]);
  const availableStockNames = useMemo(() => (
    stockFeedItems.length > 0
      ? stockFeedItems.map((item) => `${item.name} (${item.ticker})`)
      : stockDynamics.map((item) => `${item.name} (${item.ticker})`)
  ), [stockDynamics, stockFeedItems]);
  const liquidityDailyAiContext = useMemo(() => {
    const summary = hub?.liquidity.daily_review.summary || "今日复盘摘要待更新";
    const etf = hub?.liquidity.daily_review.etf_placeholder || "国家队 ETF 线索待更新";
    const globals = globalIndices.length
      ? globalIndices.map((item) => `${item.name} ${item.price ?? "—"}（${item.change_pct == null ? "—" : `${item.change_pct > 0 ? "+" : ""}${item.change_pct}%`}）`).join("；")
      : "暂无全球市场数据";
    const breadth = `A股涨跌家数：${marketOverview?.sentiment.up ?? "—"} / ${marketOverview?.sentiment.down ?? "—"}`;
    const sectors = marketOverview?.sectors?.slice(0, 3).map((item) => `${item.name}${item.pct > 0 ? "+" : ""}${item.pct}%`).join("；") || "暂无行业资金流数据";
    const turnover = turnoverTop?.stocks?.slice(0, 8).map((item) => `${item.name}(${item.code})`).join("；") || "暂无成交额榜单";
    return [
      `今日复盘摘要：${summary}`,
      `全球市场：${globals}`,
      breadth,
      `行业资金流：${sectors}`,
      `国家队ETF：${etf}`,
      `Top20成交额样本：${turnover}`,
    ].join("\n");
  }, [globalIndices, hub?.liquidity.daily_review.etf_placeholder, hub?.liquidity.daily_review.summary, marketOverview?.sectors, marketOverview?.sentiment.down, marketOverview?.sentiment.up, turnoverTop?.stocks]);

  useEffect(() => {
    if (availableIndustryNames.length === 0) return;
    setFocuses((current) => current.industry.length > 0 ? current : { ...current, industry: availableIndustryNames.slice(0, 6) });
  }, [availableIndustryNames]);

  useEffect(() => {
    if (availableStockNames.length === 0) return;
    setFocuses((current) => current.stock.length > 0 ? current : { ...current, stock: availableStockNames.slice(0, 8) });
  }, [availableStockNames]);

  const orderedModules = useMemo(() => {
    const rank = new Map(moduleOrder.map((item, index) => [item, index]));
    return [...FUNDAMENTAL_MODULES].sort((left, right) => (rank.get(left.key) ?? 99) - (rank.get(right.key) ?? 99));
  }, [moduleOrder]);

  const filteredIndustryDynamics = useMemo(() => {
    if (focuses.industry.length === 0) return industryDynamics;
    return industryDynamics.filter((item) => focuses.industry.some((focus) => item.name === focus || `${item.name} ${item.key}`.toLowerCase().includes(focus.toLowerCase())));
  }, [focuses.industry, industryDynamics]);

  const resolvedStockDynamics = useMemo(() => {
    if (stockFeedItems.length > 0) {
      return stockFeedItems.map((item) => ({
        ticker: item.ticker,
        name: item.name,
        group: item.group,
        highlights: item.highlights,
        announcements: item.announcements,
        news: item.news,
      }));
    }
    return stockDynamics.map((item) => ({
      ticker: item.ticker,
      name: item.name,
      group: "",
      highlights: item.highlights,
      announcements: [] as Announcement[],
      news: [] as NewsItem[],
    }));
  }, [stockDynamics, stockFeedItems]);

  const filteredStockDynamics = useMemo(() => {
    if (focuses.stock.length === 0) return resolvedStockDynamics;
    return resolvedStockDynamics.filter((item) => focuses.stock.some((focus) => focus === `${item.name} (${item.ticker})` || `${item.name} ${item.ticker} ${(item.highlights ?? []).join(" ")}`.toLowerCase().includes(focus.toLowerCase())));
  }, [focuses.stock, resolvedStockDynamics]);

  const digestHub = useMemo(() => {
    if (!hub || !deskMode || macroFeedMode === "all") return hub;
    return {
      ...hub,
      fundamental: {
        ...hub.fundamental,
        macro_events: macroEvents,
      },
    };
  }, [deskMode, hub, macroEvents, macroFeedMode]);

  const aiDigest = useMemo(() => orderedModules.map((item) => `${item.label}：${buildDigestPreview(item.key, digestHub) || "等待生成 AI 要点"}`).join("\n"), [digestHub, orderedModules]);

  const saveConfig = async (next: NewsRadarConfig, successMessage?: string) => {
    setConfigSaving(true);
    try {
      const saved = await api.saveNewsSourcesConfig(next);
      setRadarConfig(saved);
      void load();
      if (successMessage) toast.success(successMessage);
      return saved;
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "信息源配置保存失败");
      return null;
    } finally {
      setConfigSaving(false);
    }
  };

  const generateDigest = async (kind: IntelKind) => {
    setBusyKind(kind);
    try {
      const result = await chat(
        [{ role: "user", content: buildIntelDigestPrompt(kind) }],
        buildIntelDigestContext(kind, digestHub),
      );
      const digest = {
        kind,
        title: `${FUNDAMENTAL_MODULES.find((item) => item.key === kind)?.label || "模块"}摘要`,
        summary_text: result.content,
        generated_at: new Date().toISOString(),
      } satisfies IntelDigestResult;
      setIntelDigests((prev) => ({ ...prev, [kind]: digest }));
      toast.success(`${FUNDAMENTAL_MODULES.find((item) => item.key === kind)?.label || "模块"}要点已生成`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "摘要生成失败");
    } finally {
      setBusyKind("");
    }
  };

  const generateImageArtifact = async (kind: IntelKind) => {
    setBusyKind(kind);
    try {
      await api.generateIntelImageArtifact(kind);
      toast.success("图片请求已准备");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "图片请求生成失败");
    } finally {
      setBusyKind("");
    }
  };

  const generateOverviewDigests = async () => {
    setOverviewBusy("digest");
    try {
      const next: Partial<Record<IntelKind, IntelDigestResult>> = {};
      for (const item of FUNDAMENTAL_MODULES) {
        const digest = await chat(
          [{ role: "user", content: buildIntelDigestPrompt(item.key) }],
          buildIntelDigestContext(item.key, digestHub),
        );
        next[item.key] = {
          kind: item.key,
          title: `${item.label}摘要`,
          summary_text: digest.content,
          generated_at: new Date().toISOString(),
        };
      }
      setIntelDigests((prev) => ({ ...prev, ...next }));
      toast.success("六类基本面要点已一键提炼");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "总览提炼失败");
    } finally {
      setOverviewBusy("");
    }
  };

  const generateOverviewArtifacts = async () => {
    setOverviewBusy("artifact");
    try {
      for (const item of FUNDAMENTAL_MODULES) {
        await api.generateIntelImageArtifact(item.key);
      }
      toast.success("六类基本面图片请求已生成");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "总览图片请求生成失败");
    } finally {
      setOverviewBusy("");
    }
  };

  const moveModule = (target: IntelKind, position: DropPosition) => {
    if (!draggingModule || draggingModule === target) return;
    setModuleOrder((current) => reorderWithDropPosition(current, draggingModule, target, position));
  };

  const addSource = async (kind: IntelKind) => {
    if (kind === "hiring") return;
    if (!radarConfig) return;
    const draft = sourceDrafts[kind];
    if (!draft.label.trim()) {
      toast.error("先填一个信息源名称");
      return;
    }
    const sourceType = draft.provider.trim() || "rss";
    const sourceUrl = draft.note.trim();
    if (sourceType === "rss" && !/^https?:\/\//i.test(sourceUrl)) {
      toast.error("RSS 信息源需要填写 http(s) 链接");
      return;
    }
    const topicKey = draft.topicKey || moduleTopics[kind][0]?.key;
    if (!topicKey) {
      toast.error("请先给这个模块新增一个主题");
      return;
    }
    const saved = await saveConfig({
      ...radarConfig,
      sources: [...radarConfig.sources, {
        name: draft.label.trim(),
        hint: topicKey,
        type: sourceType,
        url: sourceUrl,
        tier: draft.tier,
      }],
    }, "信息源接口已加入");
    if (saved) {
      setSourceDrafts((prev) => ({ ...prev, [kind]: { label: "", provider: "rss", note: "", topicKey, tier: "T2" } }));
      setSourcePanels((prev) => ({ ...prev, [kind]: true }));
    }
  };

  const removeSource = (kind: IntelKind, id: string) => {
    if (!radarConfig) return;
    void saveConfig({
      ...radarConfig,
      sources: radarConfig.sources.filter((item) => `${item.hint}-${item.name}-${item.url}` !== id),
    }, `${FUNDAMENTAL_MODULES.find((item) => item.key === kind)?.label || "模块"}信息源已删除`);
  };

  const addTopic = (kind: IntelKind) => {
    if (kind === "hiring") return;
    if (!radarConfig) return;
    const value = topicDrafts[kind].trim();
    if (!value) {
      toast.error("先填一个主题名称");
      return;
    }
    const keyBase = topicKeyFromName(value);
    const nextKey = (radarConfig.industries.some((item) => item.key === keyBase))
      ? `${keyBase}-${Date.now().toString().slice(-4)}`
      : keyBase;
    void saveConfig({
      ...radarConfig,
      industries: [...radarConfig.industries, {
        key: nextKey,
        name: value,
        accent: moduleAccent(kind),
        module: kind,
      }],
    }, "主题已加入资讯底座");
    setTopicDrafts((prev) => ({ ...prev, [kind]: "" }));
    setSourceDrafts((prev) => ({ ...prev, [kind]: { ...prev[kind], topicKey: nextKey } }));
  };

  const removeTopic = (kind: IntelKind, key: string) => {
    if (!radarConfig) return;
    void saveConfig({
      ...radarConfig,
      industries: radarConfig.industries.filter((item) => item.key !== key),
      sources: radarConfig.sources.filter((item) => item.hint !== key),
    }, `${FUNDAMENTAL_MODULES.find((item) => item.key === kind)?.label || "模块"}主题已删除`);
  };

  const addFocus = (kind: "industry" | "stock") => {
    const value = focusDrafts[kind].trim();
    if (!value) return;
    setFocuses((prev) => ({ ...prev, [kind]: Array.from(new Set([...prev[kind], value])) }));
    setFocusDrafts((prev) => ({ ...prev, [kind]: "" }));
  };

  const removeFocus = (kind: "industry" | "stock", value: string) => {
    setFocuses((prev) => ({ ...prev, [kind]: prev[kind].filter((item) => item !== value) }));
  };

  const addAvailableFocus = (kind: "industry" | "stock", value: string) => {
    if (!value) return;
    setFocuses((prev) => ({ ...prev, [kind]: Array.from(new Set([...prev[kind], value])) }));
  };

  const buildRuntimeSources = (kind: IntelKind): ModuleSource[] => {
    if (kind === "tech") {
      const grouped = Array.from(new Set(techHeadlines.map((item) => item.source).filter(Boolean)));
      return grouped.map((source, index) => ({
        id: `runtime-tech-${index}`,
        label: source,
        provider: "runtime_feed",
        note: "当前全球科技头条正在使用的信息源",
        enabled: true,
      }));
    }
    if (kind === "macro") {
      const grouped = Array.from(new Set(macroEvents.flatMap((group) => (group.items ?? []).map((item) => item.source)).filter(Boolean)));
      return grouped.map((source, index) => ({
        id: `runtime-macro-${index}`,
        label: source,
        provider: "runtime_feed",
        note: "当前宏观事件流中的实际来源",
        enabled: true,
      }));
    }
    if (kind === "industry") {
      const grouped = Array.from(new Set(industryDynamics.flatMap((group) => (group.items ?? []).map((item) => item.source)).filter(Boolean)));
      return grouped.map((source, index) => ({
        id: `runtime-industry-${index}`,
        label: source,
        provider: "runtime_feed",
        note: "当前行业动态流中的实际来源",
        enabled: true,
      }));
    }
    if (kind === "stock") {
      const items = Array.from(new Set([
        "关注列表绑定标的",
        ...(stockFeedItems.some((item) => item.announcements.length > 0) ? ["个股公告抓取"] : []),
        ...(stockFeedItems.some((item) => item.news.length > 0) ? ["个股新闻抓取"] : []),
      ]));
      return items.map((source, index) => ({
        id: `runtime-stock-${index}`,
        label: source,
        provider: "runtime_feed",
        note: "当前个股动态正在使用的客观来源",
        enabled: true,
      }));
    }
    if (kind === "hiring") {
      return (hiringRadar.companies ?? []).map((company, index) => ({
        id: `runtime-hiring-${index}`,
        label: company,
        provider: hiringRadar.source || "Hiring-Radar",
        note: "当前招聘雷达跟踪的公司池",
        enabled: true,
      }));
    }
    const grouped = Array.from(new Set(geopoliticalItems.map((item) => item.source).filter((item): item is string => Boolean(item))));
    return grouped.map((source, index) => ({
      id: `runtime-geopolitics-${index}`,
      label: source,
      provider: "runtime_feed",
      note: "当前地缘政治模块的信息来源",
      enabled: true,
    }));
  };

  const buildConfiguredSources = (kind: IntelKind, showTier = false): ModuleSource[] => {
    if (kind === "hiring") return [];
    const topicMap = new Map(moduleTopics[kind].map((item) => [item.key, item.name]));
    return (radarConfig?.sources ?? [])
      .filter((item) => topicMap.has(item.hint))
      .map((item) => ({
        id: `${item.hint}-${item.name}-${item.url}`,
        label: item.name,
        provider: `${item.type} · ${topicMap.get(item.hint) || item.hint}${showTier ? ` · ${item.tier || "T2"}` : ""}`,
        note: item.url,
        enabled: true,
        tier: item.tier,
        removable: true,
      }));
  };

  const renderNewsFrontPage = (title: string, items: NewsFrontItem[]) => (
    <div className="overflow-hidden rounded-xl border border-border/40 bg-black/10">
      <div className="flex items-center justify-between border-b border-border/30 px-4 py-3">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{items.length} 条新闻</p>
        </div>
        <Newspaper className="h-4 w-4 text-primary" />
      </div>
      <div className="divide-y divide-border/25">
        {items.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">暂无新闻，刷新投研资讯后会显示在这里。</div>
        )}
        {items.map((item) => {
          const titleNode = item.url ? (
            <a href={item.url} target="_blank" rel="noreferrer" className="group inline-flex max-w-full items-start gap-1.5 font-medium text-foreground hover:text-primary">
              <span className="min-w-0">{item.title}</span>
              <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-50 transition-opacity group-hover:opacity-100" />
            </a>
          ) : (
            <span className="font-medium text-foreground">{item.title}</span>
          );

          return (
            <div key={item.id} className="grid gap-3 px-4 py-3 transition-colors hover:bg-muted/20 md:grid-cols-[96px_minmax(0,1fr)]">
              <div className="font-mono text-xs text-muted-foreground md:pt-0.5">{item.time || "—"}</div>
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-3">
                  {titleNode}
                  {typeof item.score === "number" && (
                    <span className="shrink-0 rounded-md border border-primary/25 bg-primary/10 px-2 py-1 font-mono text-xs text-primary">
                      {item.score} · {item.scoreLabel}
                    </span>
                  )}
                </div>
                {item.subtitle && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.subtitle}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {item.source && <span className="rounded-md bg-primary/10 px-2 py-0.5 text-primary">{item.source}</span>}
                  {item.topic && <span>{item.topic}</span>}
                  {(item.sourceCount ?? 0) > 1 && <span>{item.sourceCount} 个独立来源确认</span>}
                  {(item.clusterSize ?? 0) > 1 && <span>已合并 {item.clusterSize} 条同事件报道</span>}
                </div>
                {item.scoreReason && <p className="mt-2 text-xs text-muted-foreground/80">入选依据：{item.scoreReason}</p>}
                {item.scoreBreakdown && (
                  <p className="mt-1 text-[11px] text-muted-foreground/70">
                    五维评分 · 影响 {item.scoreBreakdown.impact} · 相关 {item.scoreBreakdown.relevance} · 证据 {item.scoreBreakdown.evidence} · 新颖 {item.scoreBreakdown.novelty} · 可操作 {item.scoreBreakdown.actionability}
                  </p>
                )}
                {(item.relatedItems?.length ?? 0) > 0 && (
                  <details className="mt-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer hover:text-primary">查看 {item.relatedItems?.length} 条相关报道</summary>
                    <div className="mt-1 space-y-1 border-l border-border/40 pl-3">
                      {item.relatedItems?.map((related, index) => (
                        <div key={`${related.url || related.title}-${index}`}>
                          {related.url ? <a href={related.url} target="_blank" rel="noreferrer" className="hover:text-primary">{related.title}</a> : <span>{related.title}</span>}
                          {related.source && <span className="ml-2 opacity-70">· {related.source}</span>}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderInfoList = (kind: IntelKind) => {
    if (kind === "tech") {
      return renderNewsFrontPage("新闻头版", techHeadlines.slice(0, 16).map((item) => ({
        id: `${item.industry_key}-${item.url || item.title}`,
        time: item.time,
        title: item.title,
        subtitle: item.summary,
        source: item.source || "公开源",
        topic: item.industry_name,
        url: item.url,
      })));
    }
    if (kind === "macro") {
      return (
        <div className="space-y-3">
          {deskMode && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/40 bg-black/10 px-4 py-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">宏观信号降噪</span>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    精选 {focusedMacroCount} / 原始 {rawMacroCount}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">先过投资相关性门槛，再按影响、相关性、证据、新颖性和可操作性五维评分；来源层级与多源确认由代码加权，同一事件只保留一条代表报道。</p>
              </div>
              <div className="inline-flex rounded-lg border border-border/50 bg-black/20 p-1">
                <button
                  onClick={() => setMacroFeedMode("focused")}
                  className={cn("rounded-md px-3 py-1.5 text-xs transition-colors", macroFeedMode === "focused" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}
                >
                  精选
                </button>
                <button
                  onClick={() => setMacroFeedMode("all")}
                  className={cn("rounded-md px-3 py-1.5 text-xs transition-colors", macroFeedMode === "all" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}
                >
                  全部
                </button>
              </div>
            </div>
          )}
          {renderNewsFrontPage(
            macroFeedMode === "focused" && deskMode ? "宏观精选" : "新闻头版",
            macroEvents.flatMap((group) => {
              const items = deskMode ? (group.items ?? []) : (group.items ?? []).slice(0, 6);
              return items.map((item) => {
                const scored = item as ScoredMacroItem;
                const scoreLabel = scored.signalLevel === "critical" ? "关键"
                  : scored.signalLevel === "important" ? "重要"
                    : "相关";
                return {
                  id: `${group.key}-${item.url || item.title}-${item.time}`,
                  time: item.time,
                  title: item.zh || item.title,
                  subtitle: item.zh ? item.title : item.summary,
                  source: item.source,
                  topic: group.name,
                  url: item.url,
                  score: deskMode && macroFeedMode === "focused" ? scored.investmentScore : undefined,
                  scoreLabel,
                  sourceCount: scored.sourceCount,
                  clusterSize: scored.clusterSize,
                  scoreReason: scored.scoreReasons?.join(" · "),
                  scoreBreakdown: deskMode && macroFeedMode === "focused" ? scored.scoreBreakdown : undefined,
                  relatedItems: deskMode && macroFeedMode === "focused" ? scored.relatedItems : undefined,
                };
              });
            }),
          )}
        </div>
      );
    }
    if (kind === "industry") {
      return (
        <div className="space-y-3">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">已跟踪行业，可手动增减</p>
            <div className="flex flex-wrap gap-2">
              {focuses.industry.map((item) => (
                <span key={item} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
                  {item}
                  <button onClick={() => removeFocus("industry", item)} className="text-primary/80 hover:text-primary"><X className="h-3 w-3" /></button>
                </span>
              ))}
              <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-border/40 bg-black/10 px-3 py-2">
                <input
                  value={focusDrafts.industry}
                  onChange={(event) => setFocusDrafts((prev) => ({ ...prev, industry: event.target.value }))}
                  placeholder="新增行业主题：工程机械 / 军工 / 出海链"
                  className="w-full bg-transparent text-sm outline-none"
                />
                <button onClick={() => addFocus("industry")} className="text-primary hover:text-primary/80"><Plus className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {availableIndustryNames.filter((item) => !focuses.industry.includes(item)).map((item) => (
                <button
                  key={item}
                  onClick={() => addAvailableFocus("industry", item)}
                  className="rounded-full border border-border/40 px-2 py-1 text-xs text-muted-foreground hover:text-primary"
                >
                  + {item}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            {filteredIndustryDynamics.slice(0, 8).map((item) => (
              <div key={item.key} className="rounded-lg border border-border/40 px-3 py-3">
                <p className="font-medium">{item.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{item.items?.[0]?.zh || item.items?.[0]?.title || "暂无摘要"}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.items?.length ?? 0} 条更新</p>
              </div>
            ))}
          </div>
        </div>
      );
    }
    if (kind === "stock") {
      return (
        <div className="space-y-3">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">已跟踪个股，可手动增减</p>
            <div className="flex flex-wrap gap-2">
              {focuses.stock.map((item) => (
                <span key={item} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
                  {item}
                  <button onClick={() => removeFocus("stock", item)} className="text-primary/80 hover:text-primary"><X className="h-3 w-3" /></button>
                </span>
              ))}
              <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-border/40 bg-black/10 px-3 py-2">
                <input
                  value={focusDrafts.stock}
                  onChange={(event) => setFocusDrafts((prev) => ({ ...prev, stock: event.target.value }))}
                  placeholder="新增个股：三一重工 / 600031.SH"
                  className="w-full bg-transparent text-sm outline-none"
                />
                <button onClick={() => addFocus("stock")} className="text-primary hover:text-primary/80"><Plus className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {availableStockNames.filter((item) => !focuses.stock.includes(item)).map((item) => (
                <button
                  key={item}
                  onClick={() => addAvailableFocus("stock", item)}
                  className="rounded-full border border-border/40 px-2 py-1 text-xs text-muted-foreground hover:text-primary"
                >
                  + {item}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            {filteredStockDynamics.map((item) => (
              <div key={item.ticker} className="rounded-lg bg-muted/25 px-3 py-2 text-sm">
                <p className="font-medium">{item.name} <span className="font-mono text-xs text-muted-foreground">{item.ticker}</span></p>
                <p className="mt-1 text-muted-foreground">{(item.highlights ?? []).join("；") || "暂无重点摘录"}</p>
                {item.announcements.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {item.announcements.slice(0, 2).map((announcement) => (
                      <p key={`${announcement.date}-${announcement.title}`} className="text-xs text-muted-foreground">公告 · {announcement.date} · {announcement.title}</p>
                    ))}
                  </div>
                )}
                {item.news.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {item.news.slice(0, 1).map((news) => (
                      <p key={`${news.发布时间}-${news.新闻标题}`} className="text-xs text-muted-foreground">新闻 · {news.发布时间} · {news.新闻标题}</p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          {stockTopics.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">底座抓取主题信号</p>
              {stockTopics.map((item) => (
                <div key={item.key} className="rounded-lg border border-border/40 px-3 py-3">
                  <p className="font-medium">{item.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.items?.[0]?.zh || item.items?.[0]?.title || "暂无摘要"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.items?.length ?? 0} 条更新</p>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
    if (kind === "hiring") {
      return renderNewsFrontPage(hiringRadar.title || "招聘雷达", (hiringRadar.items ?? []).map((item) => ({
        id: `${item.company}-${item.url || item.title}-${item.time}`,
        time: item.time,
        title: `${item.company} · ${item.title}`,
        subtitle: item.summary || item.location,
        source: item.source || hiringRadar.source,
        topic: item.location,
        url: item.url,
      })));
    }
    return (
      <div className="space-y-3">
        {geopoliticalGroups.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {geopoliticalGroups.map((item) => (
              <span key={item.key} className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">{item.name}</span>
            ))}
          </div>
        )}
        {renderNewsFrontPage("新闻头版", geopoliticalItems.map((item) => ({
          id: `${item.industry_key || item.title}-${item.url || item.time || item.title}`,
          time: item.time || "—",
          title: item.title,
          subtitle: item.summary,
          source: item.source || "公开源",
          topic: item.industry_name || "地缘事件",
          url: item.url,
        })))}
      </div>
    );
  };

  const renderSourcePanel = (kind: IntelKind, centralized = false) => {
    const sources = centralized
      ? uniqueById([...buildConfiguredSources(kind, true), ...defaultSources[kind]])
      : uniqueById([...buildRuntimeSources(kind), ...buildConfiguredSources(kind), ...defaultSources[kind]]);
    const moduleLabel = FUNDAMENTAL_MODULES.find((item) => item.key === kind)?.label || "信息源";
    const panelOpen = centralized ? deskSourcePanels[kind] : sourcePanels[kind];
    const togglePanel = () => {
      if (centralized) {
        setDeskSourcePanels((prev) => ({ ...prev, [kind]: !prev[kind] }));
      } else {
        setSourcePanels((prev) => ({ ...prev, [kind]: !prev[kind] }));
      }
    };
    if (kind === "hiring") {
      return (
        <div className="rounded-xl border border-border/40 bg-black/10">
          <button
            onClick={togglePanel}
            className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left"
          >
            <div>
              <p className="text-sm font-medium">{centralized ? moduleLabel : "信息源接口"}</p>
              <p className="mt-1 text-xs text-muted-foreground">当前版本直接复用 Hiring-Radar，先不在页面内维护主题和 RSS。</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {sources.length} 个
              {panelOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </button>
          {panelOpen && (
            <div className="space-y-2 border-t border-border/30 px-3 py-3">
              {sources.map((item) => (
                <div key={item.id} className="rounded-lg border border-border/30 bg-muted/20 px-3 py-3 text-sm">
                  <p className="font-medium">{item.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.provider}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{item.note}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-border/40 bg-black/10">
        <button
          onClick={togglePanel}
          className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left"
        >
          <div>
            <p className="text-sm font-medium">{centralized ? moduleLabel : "信息源接口"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {centralized ? `${moduleTopics[kind].length} 个主题 · 可新增 RSS、API 或手动来源` : "平时不想看可以折叠，展开后可查看并补充接口。"}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {sources.length} 个
            {panelOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </button>
        {panelOpen && (
          <div className="space-y-3 border-t border-border/30 px-3 py-3">
            <div className="space-y-2 rounded-lg border border-border/30 bg-muted/10 p-3">
              <p className="text-xs text-muted-foreground">新增信息源</p>
              <div className={cn("grid gap-2", centralized ? "md:grid-cols-5" : "md:grid-cols-4")}>
                <input
                  value={sourceDrafts[kind].label}
                  onChange={(event) => setSourceDrafts((prev) => ({ ...prev, [kind]: { ...prev[kind], label: event.target.value } }))}
                  placeholder="新增信息源名称"
                  className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
                />
                <select
                  value={sourceDrafts[kind].topicKey}
                  onChange={(event) => setSourceDrafts((prev) => ({ ...prev, [kind]: { ...prev[kind], topicKey: event.target.value } }))}
                  className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
                >
                  <option value="">选择归属主题</option>
                  {moduleTopics[kind].map((item) => (
                    <option key={item.key} value={item.key}>{item.name}</option>
                  ))}
                </select>
                <select
                  value={sourceDrafts[kind].provider}
                  onChange={(event) => setSourceDrafts((prev) => ({ ...prev, [kind]: { ...prev[kind], provider: event.target.value } }))}
                  className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
                >
                  <option value="rss">RSS 抓取源</option>
                  <option value="api">API 接口占位</option>
                  <option value="manual">手动/纪要源占位</option>
                </select>
                {centralized && (
                  <select
                    value={sourceDrafts[kind].tier}
                    onChange={(event) => setSourceDrafts((prev) => ({ ...prev, [kind]: { ...prev[kind], tier: event.target.value as SourceTier } }))}
                    className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
                    title="来源层级会影响精选评分，不代表内容一定入选"
                  >
                    <option value="T1">T1 官方一手</option>
                    <option value="T1.5">T1.5 官方社媒/高可信</option>
                    <option value="T2">T2 其他公开源</option>
                  </select>
                )}
                <button onClick={() => void addSource(kind)} disabled={configSaving} className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary hover:bg-primary/15 disabled:opacity-60">
                  新增信息源接口
                </button>
              </div>
              <textarea
                value={sourceDrafts[kind].note}
                onChange={(event) => setSourceDrafts((prev) => ({ ...prev, [kind]: { ...prev[kind], note: event.target.value } }))}
                rows={2}
                placeholder={sourceDrafts[kind].provider === "rss" ? "填写 RSS 链接，例如 https://example.com/feed.xml" : "填写后续接口地址、平台名称或接入备注，可先留空。"}
                className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
              />
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">当前主题</p>
              <div className="flex flex-wrap gap-2">
                {moduleTopics[kind].map((item) => (
                  <span key={item.key} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
                    {item.name}
                    <button onClick={() => removeTopic(kind, item.key)} className="text-primary/80 hover:text-primary">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={topicDrafts[kind]}
                  onChange={(event) => setTopicDrafts((prev) => ({ ...prev, [kind]: event.target.value }))}
                  placeholder="新增主题：工程机械 / HBM / 中东局势"
                  className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
                />
                <button onClick={() => addTopic(kind)} disabled={configSaving} className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary hover:bg-primary/15 disabled:opacity-60">
                  新增主题
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {sources.map((item) => (
                <div key={item.id} className="rounded-lg border border-border/30 bg-muted/20 px-3 py-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{item.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.provider}</p>
                      <p className="mt-2 break-all text-xs text-muted-foreground">{item.note || "待接入"}</p>
                    </div>
                    {item.removable && (
                      <button onClick={() => removeSource(kind, item.id)} className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-primary">
                        删除
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderSourcesWorkspace = () => {
    const configuredSourceCount = radarConfig?.sources.length ?? 0;
    return (
      <div className="space-y-4">
        <GlassCard glow>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-primary">Source control</p>
              <h3 className="mt-2 text-lg font-semibold">信息源管理</h3>
              <p className="mt-1 text-sm text-muted-foreground">所有基本面来源集中在这里维护，内容模块不再重复显示接口配置。</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-border/50 bg-black/20 px-3 py-1.5 text-xs text-muted-foreground">
                {FUNDAMENTAL_MODULES.length} 类
              </span>
              <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs text-primary">
                {configuredSourceCount} 个底座来源
              </span>
              <span className="rounded-full border border-border/50 bg-black/20 px-3 py-1.5 text-xs text-muted-foreground">
                精选展示 · 全量留存
              </span>
            </div>
          </div>
        </GlassCard>
        <div className="grid gap-3 xl:grid-cols-2">
          {FUNDAMENTAL_MODULES.map((item) => (
            <div key={item.key} className={cn(deskSourcePanels[item.key] && "xl:col-span-2")}>
              {renderSourcePanel(item.key, true)}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderFundamentalCard = (kind: IntelKind, compact = false) => {
    const meta = FUNDAMENTAL_MODULES.find((item) => item.key === kind);
    if (!meta) return null;
    const Icon = meta.icon;
    const digestText = intelDigests[kind]?.summary_text || buildDigestPreview(kind, digestHub) || "这里保留给 AI 提炼要点，你也可以点击按钮生成固定格式图片请求。";
    const isDropBefore = compact && moduleDropIndicator?.targetKey === kind && moduleDropIndicator.position === "before" && draggingModule !== kind;
    const isDropAfter = compact && moduleDropIndicator?.targetKey === kind && moduleDropIndicator.position === "after" && draggingModule !== kind;

    return (
      <div
        key={kind}
        draggable={compact}
        onDragStart={() => {
          if (!compact) return;
          setDraggingModule(kind);
          setModuleDropIndicator(null);
        }}
        onDragOver={(event: DragEvent<HTMLDivElement>) => {
          if (!compact) return;
          event.preventDefault();
          const position = getDropPosition({
            axis: "y",
            clientX: event.clientX,
            clientY: event.clientY,
            rect: event.currentTarget.getBoundingClientRect(),
          });
          setModuleDropIndicator({ targetKey: kind, position });
        }}
        onDragLeave={() => {
          if (!compact) return;
          if (moduleDropIndicator?.targetKey === kind) setModuleDropIndicator(null);
        }}
        onDrop={(event: DragEvent<HTMLDivElement>) => {
          if (!compact || !moduleDropIndicator || moduleDropIndicator.targetKey !== kind) return;
          event.preventDefault();
          moveModule(kind, moduleDropIndicator.position);
          setModuleDropIndicator(null);
          setDraggingModule("");
        }}
        onDragEnd={() => {
          setDraggingModule("");
          setModuleDropIndicator(null);
        }}
        className={cn(
          compact && "relative cursor-default transition-[opacity,transform] duration-150",
          draggingModule === kind && "scale-[0.985] opacity-60",
          isDropBefore && "before:absolute before:-top-2 before:left-4 before:right-4 before:h-1 before:rounded-full before:bg-primary before:shadow-glow",
          isDropAfter && "after:absolute after:-bottom-2 after:left-4 after:right-4 after:h-1 after:rounded-full after:bg-primary after:shadow-glow",
        )}
      >
        <GlassCard>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {compact && <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground active:cursor-grabbing" />}
            <h3 className="flex items-center gap-2 font-semibold"><Icon className="h-4 w-4 text-primary" /> {meta.label}</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <CurrentModelHint />
            <button onClick={() => void generateDigest(kind)} disabled={busyKind === kind} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-primary disabled:opacity-60">
              <Sparkles className="h-4 w-4" /> AI 提炼要点
            </button>
            <button onClick={() => void generateImageArtifact(kind)} disabled={busyKind === kind} className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 px-3 py-1.5 text-sm text-primary hover:bg-primary/10 disabled:opacity-60">
              <FileImage className="h-4 w-4" /> 生成图片请求
            </button>
          </div>
        </div>
        <div className="rounded-xl bg-primary/5 px-3 py-3 text-sm text-muted-foreground">
          {digestText}
        </div>
        {!compact && (
          <div className="mt-4 space-y-4">
            {renderInfoList(kind)}
            {!deskMode && renderSourcePanel(kind)}
          </div>
        )}
        </GlassCard>
      </div>
    );
  };

  const selectedFundamentalModule = FUNDAMENTAL_MODULES.find((item) => item.key === fundamentalView);

  return (
    <div>
      <PageHeader
        title="投研资讯"
        subtitle="把基本面、流动性和事件概率拆开管理，既能追踪最新信息，也能给后续 AI 研判留出独立入口。"
        actions={
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{formatRadarUpdatedAt(radarUpdatedAt)}</span>
            <button
              onClick={() => void load()}
              disabled={refreshState === "loading"}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-70"
            >
              <RefreshCw className={cn("h-4 w-4", refreshState === "loading" && "animate-spin", refreshState === "success" && "text-primary")} />
              {refreshState === "loading" ? "刷新中..." : refreshState === "success" ? "刚刚更新" : "刷新"}
            </button>
          </div>
        }
      />
      <div className="space-y-4">
        {autoRefreshNotice && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {autoRefreshNotice}
          </div>
        )}
        {refreshFallbackMessage && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {refreshFallbackMessage}
          </div>
        )}
        {active === "fundamental" ? (
          <div className="space-y-4">
            <SectionTabs tabs={deskMode ? DESK_FUNDAMENTAL_VIEW_TABS : FUNDAMENTAL_VIEW_TABS} active={fundamentalView} onChange={setFundamentalView} draggableStorageKey={deskMode ? "desk-intel-fundamental-view-order" : "intel-fundamental-view-order"} />
            {fundamentalView === "overview" && (
              <>
                <GlassCard glow>
                  <div className="mb-2 flex items-center gap-2 text-primary"><Lightbulb className="h-4 w-4" /> 要点总览</div>
                  <p className="text-sm text-muted-foreground">这一页保留六类基本面的统一要点入口，可以一键提炼后面 6 个模块的要点，并统一生成图片请求。</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <CurrentModelHint />
                    <button onClick={() => void generateOverviewDigests()} disabled={overviewBusy !== ""} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-primary disabled:opacity-60">
                      <Sparkles className="h-4 w-4" /> {overviewBusy === "digest" ? "提炼中..." : "一键提炼 6 类要点"}
                    </button>
                    <button onClick={() => void generateOverviewArtifacts()} disabled={overviewBusy !== ""} className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 px-3 py-1.5 text-sm text-primary hover:bg-primary/10 disabled:opacity-60">
                      <FileImage className="h-4 w-4" /> {overviewBusy === "artifact" ? "生成中..." : "一键生成图片请求"}
                    </button>
                  </div>
                  {aiDigest && <div className="mt-3"><SaveNoteButton kind="今日要点" title="投研资讯要点" content={aiDigest} /></div>}
                </GlassCard>
                <div className="space-y-4">
                  {orderedModules.map((item) => renderFundamentalCard(item.key, true))}
                </div>
              </>
            )}
            {deskMode && fundamentalView === "sources" && renderSourcesWorkspace()}
            {fundamentalView !== "overview" && selectedFundamentalModule && renderFundamentalCard(selectedFundamentalModule.key)}
          </div>
        ) : active === "liquidity" ? (
          <div className="space-y-4">
            <SectionTabs tabs={LIQUIDITY_VIEW_TABS} active={liquidityView} onChange={setLiquidityView} draggableStorageKey="intel-liquidity-view-order" />
            {(liquidityView === "daily") && (
              <GlassCard>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">每日复盘</h3>
                  <AskAiButton
                    context={liquidityDailyAiContext}
                    label="问 AI"
                    suggestions={["今天市场情绪怎么样", "资金主要流向了哪些方向", "今天复盘最值得关注的信号是什么"]}
                  />
                </div>
                <p className="mb-4 text-sm text-muted-foreground">{hub?.liquidity.daily_review.summary || "今日复盘摘要加载后会显示在这里。"}</p>
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
                    <p className="mt-2 text-sm text-muted-foreground">{marketOverview?.sectors?.slice(0, 3).map((item) => `${item.name}${item.pct > 0 ? "+" : ""}${item.pct}%`).join(" · ") || "待更新"}</p>
                  </div>
                  <div className="rounded-xl border border-border/40 p-4">
                    <p className="text-sm font-medium">国家队 ETF</p>
                    <p className="mt-2 text-sm text-muted-foreground">{hub?.liquidity.daily_review.etf_placeholder}</p>
                  </div>
                </div>
                <div className="mt-4">
                  <p className="mb-2 flex items-center gap-2 text-sm font-medium"><BarChart3 className="h-4 w-4 text-primary" /> Top20 成交额</p>
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                    {turnoverTop?.stocks?.slice(0, 8).map((item) => (
                      <div key={item.code} className="rounded-lg bg-muted/25 px-3 py-2 text-sm">
                        <p className="font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.code} · {item.industry || "未知行业"}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </GlassCard>
            )}

            {(liquidityView === "indicators" || liquidityView === "commodities") && (
              <div className="grid gap-4 xl:grid-cols-2">
                {liquidityView === "indicators" && (
                  <GlassCard>
                    <h3 className="mb-3 font-semibold">关键流动性指标</h3>
                    <div className="space-y-2">
                      {liquidityIndicators.map((item) => (
                        <div key={item.key} className="rounded-lg border border-border/40 px-3 py-3">
                          <p className="font-medium">{item.label}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{item.insight}</p>
                        </div>
                      ))}
                    </div>
                  </GlassCard>
                )}

                {liquidityView === "commodities" && (
                  <GlassCard>
                    <h3 className="mb-3 font-semibold">核心大宗商品</h3>
                    <div className="space-y-2">
                      {liquidityCommodities.map((item) => (
                        <div key={item.key} className="rounded-lg border border-border/40 px-3 py-3">
                          <p className="font-medium">{item.label}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{item.insight}</p>
                        </div>
                      ))}
                    </div>
                  </GlassCard>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <SectionTabs
              tabs={EVENT_PROBABILITY_VIEW_TABS}
              active={eventProbabilityView}
              onChange={setEventProbabilityView}
              draggableStorageKey="intel-event-probability-view-order"
            />
            {eventProbabilityView === "overview" && (
              <GlassCard glow>
                <div className="mb-2 flex items-center gap-2 text-primary"><Lightbulb className="h-4 w-4" /> {eventProbability.summary.title}</div>
                <p className="text-sm text-muted-foreground">{eventProbability.summary.description}</p>
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <div className="rounded-xl border border-border/40 p-4">
                    <p className="text-xs text-muted-foreground">重点事件总数</p>
                    <p className="mt-2 text-2xl font-semibold">{eventProbability.priority_events.length}</p>
                    <p className="mt-1 text-xs text-muted-foreground">当前混合事件流已纳入的事件条目</p>
                  </div>
                  <div className="rounded-xl border border-border/40 p-4">
                    <p className="text-xs text-muted-foreground">宏观 / 行业 / 个股</p>
                    <p className="mt-2 text-2xl font-semibold">{eventProbabilityCategoryCounts.macro} / {eventProbabilityCategoryCounts.industry} / {eventProbabilityCategoryCounts.stock}</p>
                    <p className="mt-1 text-xs text-muted-foreground">三类事件的当前覆盖数量</p>
                  </div>
                  <div className="rounded-xl border border-border/40 p-4">
                    <p className="text-xs text-muted-foreground">已激活数据接口</p>
                    <p className="mt-2 text-2xl font-semibold">{eventProbabilityActiveSourceCount}</p>
                    <p className="mt-1 text-xs text-muted-foreground">已真正参与当前事件流的上游接口</p>
                  </div>
                  <div className="rounded-xl border border-border/40 p-4">
                    <p className="text-xs text-muted-foreground">观察中模块</p>
                    <p className="mt-2 text-2xl font-semibold">{eventProbabilityWatchingModuleCount}</p>
                    <p className="mt-1 text-xs text-muted-foreground">已进入跟踪、但仍待情景化沉淀的能力</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {[eventProbability.scenario_snapshot.base_case, eventProbability.scenario_snapshot.upside_case, eventProbability.scenario_snapshot.downside_case].map((item) => (
                    <div key={item.label} className="rounded-xl border border-border/40 p-4">
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="mt-2 text-sm text-muted-foreground">{item.summary}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full border border-border/50 px-2 py-1">活跃事件 {eventProbability.scenario_snapshot.active_count}</span>
                  <span className="rounded-full border border-border/50 px-2 py-1">观察事件 {eventProbability.scenario_snapshot.watching_count}</span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {eventProbability.planned_modules.map((item) => (
                    <div key={item.key} className="rounded-xl border border-border/40 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">{item.label}</p>
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{eventProbabilityStatusLabel(item.status)}</span>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}
            {eventProbabilityView === "priority-events" && (
              <GlassCard>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">重点事件</h3>
                    <p className="mt-1 text-sm text-muted-foreground">同一批事件支持从不同视角重排，方便先看近端、先看高概率，或先按类别扫一遍。</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap gap-2">
                      {EVENT_PROBABILITY_QUEUE_OPTIONS.map((option) => (
                        <button
                          key={option.key}
                          onClick={() => setEventQueueView(option.key)}
                          className={cn(
                            "rounded-full border px-3 py-1 text-xs transition-colors",
                            eventQueueView === option.key
                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                              : "border-border/50 text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {option.label} ({eventQueueCounts[option.key]})
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {EVENT_PROBABILITY_SORT_OPTIONS.map((option) => (
                        <button
                          key={option.key}
                          onClick={() => setEventPrioritySort(option.key)}
                          className={cn(
                            "rounded-full border px-3 py-1 text-xs transition-colors",
                            eventPrioritySort === option.key
                              ? "border-primary/50 bg-primary/10 text-primary"
                              : "border-border/50 text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mb-3 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
                    <p className="text-sm font-medium">{eventQueueViewLabel(eventQueueView)} · {eventPrioritySortLabel(eventPrioritySort)}扫读摘要</p>
                    <p className="mt-1 text-sm text-muted-foreground">{eventPrioritySummary}</p>
                  </div>
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                    <p className="text-sm font-medium">风险提示</p>
                    <p className="mt-1 text-sm text-muted-foreground">{eventPriorityRiskSummary}</p>
                  </div>
                </div>
                {eventQueueView !== "verified" && pinnedEventProbabilityTask && (
                  <div className="mb-3 rounded-xl border border-primary/30 bg-primary/10 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-primary">当前首要任务</p>
                        <p className="mt-1 font-medium">{pinnedEventProbabilityTask.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {pinnedEventProbabilityTask.category} · {pinnedEventProbabilityTask.trigger_window} · {eventProbabilityVerificationLabel(pinnedEventProbabilityTask.verification_status)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => markEventTaskComplete(pinnedEventProbabilityTask.key)}
                          className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200 transition hover:bg-emerald-500/20"
                        >
                          标记已跟进
                        </button>
                        <span className="rounded-full border border-border/50 px-2 py-0.5 text-[11px] text-muted-foreground">评分 {pinnedEventProbabilityTask.rank_score}</span>
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{pinnedEventProbabilityTask.probability_label}</span>
                      </div>
                    </div>
                    <p className="mt-3 text-sm">{pinnedEventProbabilityTask.judgment}</p>
                    <p className="mt-2 text-sm text-muted-foreground">今天先做：{pinnedEventProbabilityTask.follow_up}</p>
                    {nextEventProbabilityTask && (
                      <div className="mt-3 rounded-lg border border-border/40 bg-background/30 px-3 py-3">
                        <p className="text-xs text-muted-foreground">下一顺位</p>
                        <p className="mt-1 text-sm font-medium">{nextEventProbabilityTask.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {nextEventProbabilityTask.category} · {nextEventProbabilityTask.trigger_window} · {eventProbabilityVerificationLabel(nextEventProbabilityTask.verification_status)}
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">随后跟进：{nextEventProbabilityTask.follow_up}</p>
                      </div>
                    )}
                  </div>
                )}
                {eventQueueView === "todo" && archivedEventProbabilityEvents.length > 0 && (
                  <div className="mb-3 rounded-xl border border-border/40 bg-muted/15 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">已验证归档</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          当前有 {archivedEventProbabilityEvents.length} 条事件已归入已验证队列，默认不占用待跟进视野。
                        </p>
                      </div>
                      <button
                        onClick={() => setEventArchiveExpanded((current) => !current)}
                        className="text-xs text-primary hover:underline"
                      >
                        {eventArchiveExpanded ? "收起归档" : "展开归档"}
                      </button>
                    </div>
                    {eventArchiveExpanded && (
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        {archivedEventProbabilityEvents.map((item) => (
                          <div key={item.key} className="rounded-lg border border-border/40 px-3 py-3 opacity-70">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium">{item.title}</p>
                              <div className="flex items-center gap-2">
                                {completedEventTaskKeys.includes(item.key) && (
                                  <button
                                    onClick={() => restoreEventTask(item.key)}
                                    className="rounded-full border border-border/50 px-2 py-0.5 text-[11px] text-muted-foreground transition hover:text-foreground"
                                  >
                                    恢复待跟进
                                  </button>
                                )}
                                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/5 px-2 py-0.5 text-[11px] text-emerald-200">
                                  {eventProbabilityVerificationLabel(item.verification_status)}
                                </span>
                              </div>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">{item.category} · {item.trigger_window}</p>
                            <p className="mt-2 text-sm text-muted-foreground">{eventProbabilityJudgmentPreview(item.judgment)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="space-y-3">
                  {!queuedEventProbabilityEvents.length && (
                    <div className="rounded-xl border border-dashed border-border/50 p-4 text-sm text-muted-foreground">
                      当前视图下还没有可展示的重点事件，等宏观日历、行业条目或关注列表催化进入事件流后会自动出现在这里。
                    </div>
                  )}
                  {eventPrioritySort === "category" ? queuedEventProbabilityCategoryGroups.map((group) => (
                    <div key={group.category} className="space-y-3">
                      <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
                        <p className="text-sm font-medium">{group.category}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{eventProbabilityCategoryDescription(group.category)}</p>
                      </div>
                      {group.items.map((item) => (
                        <div key={item.key} className={cn("rounded-xl border border-border/40 p-4", isArchivedEventTask(item.key, item.verification_status) && "opacity-60")}>
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-medium">{item.title}</p>
                              <p className="mt-1 text-xs text-muted-foreground">优先级 #{item.rank_order ?? "—"} · {item.trigger_window}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="rounded-full border border-border/50 px-2 py-0.5 text-[11px] text-muted-foreground">评分 {item.rank_score}</span>
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{item.probability_label}</span>
                              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/5 px-2 py-0.5 text-[11px] text-emerald-200">{eventProbabilityVerificationLabel(item.verification_status)}</span>
                              {!isArchivedEventTask(item.key, item.verification_status) && (
                                <button
                                  onClick={() => markEventTaskComplete(item.key)}
                                  className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200 transition hover:bg-emerald-500/20"
                                >
                                  标记已跟进
                                </button>
                              )}
                              <span className="text-xs text-primary">{eventProbabilityStatusLabel(item.status)}</span>
                            </div>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{item.category}</p>
                          <p className="mt-2 text-sm">{eventProbabilityJudgmentPreview(item.judgment)}</p>
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs text-muted-foreground">{item.rank_reason}</p>
                            <button
                              onClick={() => toggleExpandedEventCard(item.key)}
                              className="text-xs text-primary hover:underline"
                            >
                              {expandedEventCards.includes(item.key) ? "收起详情" : "展开详情"}
                            </button>
                          </div>
                          {expandedEventCards.includes(item.key) && (
                            <div className="mt-3 space-y-3 border-t border-border/40 pt-3">
                              <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                                <span className="rounded-full border border-border/50 px-2 py-0.5">状态分 {item.rank_breakdown.status_score}</span>
                                <span className="rounded-full border border-border/50 px-2 py-0.5">概率分 {item.rank_breakdown.probability_score}</span>
                                <span className="rounded-full border border-border/50 px-2 py-0.5">类别分 {item.rank_breakdown.category_score}</span>
                              </div>
                              <p className="text-sm text-muted-foreground">下一步：{item.follow_up}</p>
                              <p className="text-sm">{item.judgment}</p>
                              <p className="text-sm text-muted-foreground">{item.note}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )) : queuedEventProbabilityEvents.map((item) => (
                    <div key={item.key} className={cn("rounded-xl border border-border/40 p-4", isArchivedEventTask(item.key, item.verification_status) && "opacity-60")}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">{item.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">优先级 #{item.rank_order ?? "—"} · {item.trigger_window}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full border border-border/50 px-2 py-0.5 text-[11px] text-muted-foreground">评分 {item.rank_score}</span>
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{item.probability_label}</span>
                          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/5 px-2 py-0.5 text-[11px] text-emerald-200">{eventProbabilityVerificationLabel(item.verification_status)}</span>
                          {!isArchivedEventTask(item.key, item.verification_status) && (
                            <button
                              onClick={() => markEventTaskComplete(item.key)}
                              className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200 transition hover:bg-emerald-500/20"
                            >
                              标记已跟进
                            </button>
                          )}
                          <span className="text-xs text-primary">{eventProbabilityStatusLabel(item.status)}</span>
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{item.category}</p>
                      <p className="mt-2 text-sm">{eventProbabilityJudgmentPreview(item.judgment)}</p>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">{item.rank_reason}</p>
                        <button
                          onClick={() => toggleExpandedEventCard(item.key)}
                          className="text-xs text-primary hover:underline"
                        >
                          {expandedEventCards.includes(item.key) ? "收起详情" : "展开详情"}
                        </button>
                      </div>
                      {expandedEventCards.includes(item.key) && (
                        <div className="mt-3 space-y-3 border-t border-border/40 pt-3">
                          <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                            <span className="rounded-full border border-border/50 px-2 py-0.5">状态分 {item.rank_breakdown.status_score}</span>
                            <span className="rounded-full border border-border/50 px-2 py-0.5">概率分 {item.rank_breakdown.probability_score}</span>
                            <span className="rounded-full border border-border/50 px-2 py-0.5">类别分 {item.rank_breakdown.category_score}</span>
                          </div>
                          <p className="text-sm text-muted-foreground">下一步：{item.follow_up}</p>
                          <p className="text-sm">{item.judgment}</p>
                          <p className="text-sm text-muted-foreground">{item.note}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}
            {eventProbabilityView === "sources" && (
              <GlassCard>
                <h3 className="mb-3 font-semibold">数据接口</h3>
                <div className="space-y-3">
                  <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
                    <p className="text-sm font-medium">接口接入概览</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      当前共接入 {eventProbability.source_interfaces.length} 路接口，其中 {eventProbabilityActiveSourceCount} 路已在本轮事件流中激活。
                    </p>
                  </div>
                  {!eventProbability.source_interfaces.length && (
                    <div className="rounded-xl border border-dashed border-border/50 p-4 text-sm text-muted-foreground">
                      当前还没有登记数据接口，后续接入的事件源会统一出现在这里。
                    </div>
                  )}
                  {eventProbability.source_interfaces.map((item) => (
                    <div key={item.key} className="rounded-xl border border-border/40 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium">{item.label}</p>
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{eventProbabilityStatusLabel(item.status)}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                        <span className="rounded-full border border-border/50 px-2 py-0.5">{item.provider}</span>
                        <span className="rounded-full border border-border/50 px-2 py-0.5">{eventProbabilitySourceCoverage(item.key)}</span>
                        <span className="rounded-full border border-border/50 px-2 py-0.5">已覆盖 {item.coverage_count} 条</span>
                      </div>
                      {item.latest_signal && <p className="mt-2 text-sm">最新信号：{item.latest_signal}</p>}
                      <p className="mt-2 text-sm text-muted-foreground">{item.note}</p>
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}
          </div>
        )}
      </div>

      <Disclaimer />
    </div>
  );
}
