import { type DragEvent, useEffect, useMemo, useState } from "react";
import { type LucideIcon, ArrowUpRight, BarChart3, ChevronDown, ChevronUp, FileImage, Globe2, GripVertical, Lightbulb, Newspaper, Plus, RefreshCw, Sparkles, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AskAiButton } from "@/components/ui/AskAiButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { Disclaimer } from "@/components/ui/Disclaimer";
import { PageHeader } from "@/components/ui/PageHeader";
import { SaveNoteButton } from "@/components/ui/SaveNoteButton";
import { SectionTabs } from "@/components/ui/SectionTabs";
import { api, ApiError, type Announcement, type GlobalIndex, type IntelDigestResult, type MarketOverview, type NewsItem, type NewsRadarConfig, type ResearchHubData, type TurnoverTop } from "@/lib/api";
import { type DropIndicator, type DropPosition, getDropPosition, reorderWithDropPosition } from "@/lib/drag-sort";
import { runIntelRefresh } from "@/lib/intel-refresh";
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

const FUNDAMENTAL_MODULES: Array<{ key: IntelKind; label: string; icon: LucideIcon }> = [
  { key: "tech", label: "全球科技头条", icon: Globe2 },
  { key: "macro", label: "宏观事件", icon: Lightbulb },
  { key: "industry", label: "行业动态", icon: BarChart3 },
  { key: "stock", label: "个股动态", icon: Newspaper },
  { key: "geopolitics", label: "地缘政治", icon: Globe2 },
  { key: "hiring", label: "招聘雷达", icon: Globe2 },
];

type IntelKind = "tech" | "macro" | "industry" | "stock" | "geopolitics" | "hiring";

type ModuleSource = {
  id: string;
  label: string;
  provider: string;
  note: string;
  enabled: boolean;
  removable?: boolean;
};

type ModuleSourceDraft = {
  label: string;
  provider: string;
  note: string;
  topicKey: string;
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

export function Intel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [active, setActive] = useState("fundamental");
  const [fundamentalView, setFundamentalView] = useState("overview");
  const [liquidityView, setLiquidityView] = useState("daily");
  const [eventProbabilityView, setEventProbabilityView] = useState("overview");
  const [hub, setHub] = useState<ResearchHubData | null>(null);
  const [marketOverview, setMarketOverview] = useState<MarketOverview | null>(null);
  const [globalIndices, setGlobalIndices] = useState<GlobalIndex[]>([]);
  const [turnoverTop, setTurnoverTop] = useState<TurnoverTop | null>(null);
  const [intelDigests, setIntelDigests] = useState<Partial<Record<IntelKind, IntelDigestResult>>>({});
  const [busyKind, setBusyKind] = useState<IntelKind | "">("");
  const [overviewBusy, setOverviewBusy] = useState<"" | "digest" | "artifact">("");
  const [refreshState, setRefreshState] = useState<"" | "loading" | "success">("");
  const [radarUpdatedAt, setRadarUpdatedAt] = useState<string | null>(null);
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
  const [sourceDrafts, setSourceDrafts] = useState<SourceDraftRecord>({
    tech: { label: "", provider: "rss", note: "", topicKey: "" },
    macro: { label: "", provider: "rss", note: "", topicKey: "" },
    industry: { label: "", provider: "rss", note: "", topicKey: "" },
    stock: { label: "", provider: "rss", note: "", topicKey: "" },
    geopolitics: { label: "", provider: "rss", note: "", topicKey: "" },
    hiring: { label: "", provider: "manual", note: "", topicKey: "" },
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

  const load = async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
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
      } = await runIntelRefresh({
        forceRadarRefresh: !silent,
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
      setRadarConfig(configData || hubData.fundamental.news_source_config);
      if (!silent) {
        setRefreshState("success");
        window.setTimeout(() => {
          setRefreshState((current) => current === "success" ? "" : current);
        }, 1500);
      }
    } catch (error) {
      if (!silent) setRefreshState("");
      toast.error(error instanceof ApiError ? error.message : "投研资讯加载失败");
    } finally {
      if (!silent) {
        setRefreshState((current) => current === "loading" ? "" : current);
      }
    }
  };

  useEffect(() => {
    void load({ silent: true });
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
    writeJson("intel-focuses", focuses);
  }, [focuses]);

  const techHeadlines = hub?.fundamental.global_tech_headlines ?? [];
  const macroEvents = hub?.fundamental.macro_events ?? [];
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
    planned_modules: [],
    priority_events: [],
    source_interfaces: [],
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

  const aiDigest = useMemo(() => orderedModules.map((item) => `${item.label}：${buildDigestPreview(item.key, hub) || "等待生成 AI 要点"}`).join("\n"), [hub, orderedModules]);

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
      const digest = await api.generateIntelDigest(kind);
      setIntelDigests((prev) => ({ ...prev, [kind]: digest }));
      toast.success(`${digest.title}已生成`);
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
        next[item.key] = await api.generateIntelDigest(item.key);
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
      }],
    }, "信息源接口已加入");
    if (saved) {
      setSourceDrafts((prev) => ({ ...prev, [kind]: { label: "", provider: "rss", note: "", topicKey } }));
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

  const buildConfiguredSources = (kind: IntelKind): ModuleSource[] => {
    if (kind === "hiring") return [];
    const topicMap = new Map(moduleTopics[kind].map((item) => [item.key, item.name]));
    return (radarConfig?.sources ?? [])
      .filter((item) => topicMap.has(item.hint))
      .map((item) => ({
        id: `${item.hint}-${item.name}-${item.url}`,
        label: item.name,
        provider: `${item.type} · ${topicMap.get(item.hint) || item.hint}`,
        note: item.url,
        enabled: true,
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
                {titleNode}
                {item.subtitle && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.subtitle}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {item.source && <span className="rounded-md bg-primary/10 px-2 py-0.5 text-primary">{item.source}</span>}
                  {item.topic && <span>{item.topic}</span>}
                </div>
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
      return renderNewsFrontPage("新闻头版", macroEvents.flatMap((group) => (group.items ?? []).slice(0, 6).map((item) => ({
        id: `${group.key}-${item.url || item.title}-${item.time}`,
        time: item.time,
        title: item.zh || item.title,
        subtitle: item.zh ? item.title : item.summary,
        source: item.source,
        topic: group.name,
        url: item.url,
      }))));
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

  const renderSourcePanel = (kind: IntelKind) => {
    const sources = uniqueById([...buildRuntimeSources(kind), ...buildConfiguredSources(kind), ...defaultSources[kind]]);
    if (kind === "hiring") {
      return (
        <div className="rounded-xl border border-border/40 bg-black/10">
          <button
            onClick={() => setSourcePanels((prev) => ({ ...prev, [kind]: !prev[kind] }))}
            className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left"
          >
            <div>
              <p className="text-sm font-medium">信息源接口</p>
              <p className="mt-1 text-xs text-muted-foreground">当前版本直接复用 Hiring-Radar，先不在页面内维护主题和 RSS。</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {sources.length} 个
              {sourcePanels[kind] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </button>
          {sourcePanels[kind] && (
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
          onClick={() => setSourcePanels((prev) => ({ ...prev, [kind]: !prev[kind] }))}
          className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left"
        >
          <div>
            <p className="text-sm font-medium">信息源接口</p>
            <p className="mt-1 text-xs text-muted-foreground">平时不想看可以折叠，展开后可查看并补充接口。</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {sources.length} 个
            {sourcePanels[kind] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </button>
        {sourcePanels[kind] && (
          <div className="space-y-3 border-t border-border/30 px-3 py-3">
            <div className="space-y-2 rounded-lg border border-border/30 bg-muted/10 p-3">
              <p className="text-xs text-muted-foreground">新增信息源</p>
              <div className="grid gap-2 md:grid-cols-4">
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

  const renderFundamentalCard = (kind: IntelKind, compact = false) => {
    const meta = FUNDAMENTAL_MODULES.find((item) => item.key === kind);
    if (!meta) return null;
    const Icon = meta.icon;
    const digestText = intelDigests[kind]?.summary_text || buildDigestPreview(kind, hub) || "这里保留给 AI 提炼要点，你也可以点击按钮生成固定格式图片请求。";
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
            {renderSourcePanel(kind)}
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
        {active === "fundamental" ? (
          <div className="space-y-4">
            <SectionTabs tabs={FUNDAMENTAL_VIEW_TABS} active={fundamentalView} onChange={setFundamentalView} draggableStorageKey="intel-fundamental-view-order" />
            {fundamentalView === "overview" && (
              <>
                <GlassCard glow>
                  <div className="mb-2 flex items-center gap-2 text-primary"><Lightbulb className="h-4 w-4" /> 要点总览</div>
                  <p className="text-sm text-muted-foreground">这一页保留六类基本面的统一要点入口，可以一键提炼后面 6 个模块的要点，并统一生成图片请求。</p>
                  <div className="mt-3 flex flex-wrap gap-2">
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
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {eventProbability.planned_modules.map((item) => (
                    <div key={item.key} className="rounded-xl border border-border/40 p-4">
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="mt-1 text-xs text-primary">{item.status}</p>
                      <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}
            {eventProbabilityView === "priority-events" && (
              <GlassCard>
                <h3 className="mb-3 font-semibold">重点事件</h3>
                <div className="space-y-3">
                  {eventProbability.priority_events.map((item) => (
                    <div key={item.key} className="rounded-xl border border-border/40 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium">{item.title}</p>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{item.probability_label}</span>
                          <span className="text-xs text-primary">{item.status}</span>
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{item.category}</p>
                      <p className="mt-2 text-sm">{item.judgment}</p>
                      <p className="mt-2 text-sm text-muted-foreground">{item.note}</p>
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}
            {eventProbabilityView === "sources" && (
              <GlassCard>
                <h3 className="mb-3 font-semibold">数据接口</h3>
                <div className="space-y-3">
                  {eventProbability.source_interfaces.map((item) => (
                    <div key={item.key} className="rounded-xl border border-border/40 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium">{item.label}</p>
                        <span className="text-xs text-primary">{item.status}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{item.provider}</p>
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
