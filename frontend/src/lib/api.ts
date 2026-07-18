// Vibe-Research 后端 API 客户端。/api → vite 代理到本地 FastAPI（默认 8900）。
// 后端未启动或数据源异常时抛 ApiError，页面据此优雅降级。

import { APP_CONFIG } from "./app-config";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

// 后端访问密钥（对应后端部署时的 VR_API_KEY，公网部署防蹭用）。只存本地浏览器。
const ACCESS_KEY = "vr-access-key";

export function loadAccessKey(): string {
  try {
    return localStorage.getItem(ACCESS_KEY) || "";
  } catch {
    return "";
  }
}

export function saveAccessKey(key: string) {
  try {
    if (key) localStorage.setItem(ACCESS_KEY, key);
    else localStorage.removeItem(ACCESS_KEY);
  } catch {
    /* 隐私模式等场景 localStorage 不可用 */
  }
}

export function authHeaders(): Record<string, string> {
  const k = loadAccessKey();
  return k ? { Authorization: `Bearer ${k}` } : {};
}

export interface MyReport {
  id: string; name: string; industry: string; size: number; ext: string; ts: number;
}

// 下载/预览研报：带鉴权头 fetch → blob → 触发浏览器下载（<a download> 无法带 Authorization，故走 blob）。
export async function downloadReport(id: string, name: string): Promise<void> {
  const resp = await fetch(`/api/myreports/file/${id}`, { headers: authHeaders() });
  if (!resp.ok) throw new ApiError(`下载失败 HTTP ${resp.status}`, resp.status);
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function request<T>(
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  body?: unknown,
  init?: RequestInit,
): Promise<T> {
  let resp: Response;
  const headers: Record<string, string> = { ...authHeaders() };
  const opts: RequestInit = { method, ...init };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const extraHeaders = (init?.headers || {}) as Record<string, string>;
  const mergedHeaders = { ...extraHeaders, ...headers };
  if (Object.keys(mergedHeaders).length > 0) opts.headers = mergedHeaders;
  try {
    resp = await fetch(`/api${path}`, opts);
  } catch {
    throw new ApiError(`连接不到后端，请先启动 backend（uvicorn app:app --port ${APP_CONFIG.backendPort}）`, 0);
  }
  let payload: any = null;
  try {
    payload = await resp.json();
  } catch {
    /* 非 JSON 响应 */
  }
  if (!resp.ok) {
    if (resp.status === 401) {
      throw new ApiError("后端开启了访问鉴权（VR_API_KEY）：请在「接入 AI」页底部填写后端访问密钥", 401);
    }
    throw new ApiError(payload?.detail || `HTTP ${resp.status}`, resp.status);
  }
  return (payload?.data ?? payload) as T;
}

const get = <T>(path: string, init?: RequestInit) => request<T>(path, "GET", undefined, init);

export interface Quote {
  name: string; price: number; last_close: number; change_pct: number;
  pe_ttm: number; pb: number; mcap_yi: number; turnover_pct: number;
  limit_up: number; limit_down: number;
}

export interface Valuation {
  name: string; code: string; price: number; mcap_yi: number;
  pe_ttm: number; pb: number;
  eps_26e: number | null; eps_27e: number | null; pe_26e: number | null;
  cagr_pct: number | null; peg: number | null; digest_years: number | null;
  analyst_count: number; forecast_note?: string;
}

export interface Report {
  title: string; publishDate: string; orgSName: string;
  emRatingName?: string; indvInduName?: string; pdfUrl?: string | null;
}

export interface ValMetric {
  current: number; percentile: number; min: number; max: number;
  p20: number; p50: number; p80: number; n: number;
}
export interface ValPercentile {
  period: string; metrics: { pe_ttm?: ValMetric; pb?: ValMetric };
}

export interface Announcement {
  date: string; title: string; type: string; url: string;
}

export interface Financials {
  period: string | null;
  revenue: string | null; revenue_yoy: string | null;
  net_profit: string | null; net_profit_yoy: string | null;
  eps: string | null; bvps: string | null; roe: string | null;
  gross_margin: string | null; net_margin: string | null; op_cf_ps: string | null;
}

export interface NewsItem {
  新闻标题?: string; 发布时间?: string; 文章来源?: string; 新闻链接?: string;
}

export interface IndexQuote {
  name: string; price: number; change_pct: number; change_amt: number;
}

export interface MarketSentiment {
  up: number; down: number; flat: number; zt: number; zt_real: number; dt: number; dt_real: number;
  active: string; breadth: string; speculation: string; date: string;
}
export interface SectorFlow {
  name: string; pct: number; net: number; inflow: number; outflow: number; firms: number;
}
export interface MarketOverview {
  sentiment: MarketSentiment; sectors: SectorFlow[]; updated: string;
}

// 短线情绪：连板梯队 / 最高连板 / 炸板率 / 封板率 / 晋级率 / 涨跌停家数 + 连板股清单（客观公开榜单）
export interface EmotionTier { boards: number; count: number; plus: boolean }
export interface LianbanStock {
  code: string; name: string; boards: number;
  price: number; pct: number; amount: number | null; float_cap: number | null; industry: string;
}
export interface ShortTermEmotion {
  date: string;
  zt_count: number; dt_count: number; zb_count: number;
  max_boards: number; lianban_count: number;
  ladder: EmotionTier[];
  lianban_stocks: LianbanStock[];
  seal_rate: number | null; break_rate: number | null; promotion_rate: number | null;
  yzt_count: number;
}

// 全市场成交额榜（客观公开榜单）
export interface TurnoverStock {
  code: string; name: string;
  price: number | null; pct: number | null;
  amount: number | null; mcap: number | null; float_cap: number | null; industry: string;
}
export interface TurnoverTop { stocks: TurnoverStock[]; updated: string }

export interface RadarItem {
  title: string; url: string; time: string; source: string; summary?: string; zh?: string;
}
export interface Industry {
  key: string; name: string; accent: string; total: number; items: RadarItem[];
}

export interface NewsRadarIndustryConfig {
  key: string;
  name: string;
  accent: string;
  module: "tech" | "macro" | "industry" | "stock" | "geopolitics";
}

export interface NewsRadarSourceConfig {
  name: string;
  hint: string;
  type: string;
  url: string;
}

export interface NewsRadarConfig {
  fetch: { per_source: number; timeout: number; recent_days: number };
  redline_keywords: string[];
  industries: NewsRadarIndustryConfig[];
  sources: NewsRadarSourceConfig[];
}
export interface RadarData {
  generated_at: string | null; recent_days: number; industries: Industry[];
  stats: { industries: number; total_sources: number; failed_sources?: number };
}

export interface Holding {
  code: string; name: string; price: number; shares: number; cost: number;
  market_value: number; pnl: number; pnl_pct: number;
}
export interface ClosedPosition {
  code: string; name: string; date: string; price: number; shares: number; cost: number;
  pnl: number; pnl_pct: number;
}
export interface PortfolioData {
  holdings: Holding[];
  totals: { market_value: number; cost: number; pnl: number; pnl_pct: number };
  closed: ClosedPosition[];
  realized_pnl: number;
  updated: string; last_refresh: string | null;
}

// 资金面 / 筹码 / 信号（v3.3 并入，均为「用户查的那只股」的公开数据）
export interface MarginRow { date: string; rzye: number; rzmre: number; rzche: number; rqye: number; rqmcl: number; rzrqye: number }
export interface BlockTradeRow { date: string; price: number; close: number; premium_pct: number; vol: number; amount: number; buyer: string; seller: string }
export interface HolderRow { date: string; holder_num: number; change_ratio: number; avg_shares: number }
export interface DividendRow { date: string; bonus_rmb: number; transfer_ratio: number; bonus_ratio: number | null; plan: string }
export interface FundFlowRow { date: string; main_net: number; small_net: number; mid_net: number; large_net: number; super_net: number }
export interface DtSeat { name: string; buy_amt: number; sell_amt: number; net: number }
export interface DragonTiger {
  records: { date: string; reason: string; net_buy: number; turnover: number }[];
  seats: { buy: DtSeat[]; sell: DtSeat[] };
  institution: { buy_amt: number; sell_amt: number; net_amt: number };
}
export interface LockupRow { date: string; type: string; shares: number; able_shares: number; ratio: number }
export interface Lockup { history: LockupRow[]; upcoming: LockupRow[] }
export interface Board { name: string; code: string; change_pct: number | string; lead_stock: string }
export interface Blocks { total: number; boards: Board[]; concept_tags: string[] }
export interface HotConcept { concept: string; bk: string; hit: number }
export interface QaRow { company: string; question: string; answer: string | null; answerer: string; ask_time: string }
export interface IndustryRow { rank: number; name: string; change_pct: number; code: string; up_count: number; down_count: number }
export interface IndustryData { top: IndustryRow[]; bottom: IndustryRow[]; total: number }

// 全球市场（美股 / 港股，移植自 global-stock-data · 东财域内源）
export interface GlobalIndex {
  key: string; name: string; region: string;
  price: number | null; change_pct: number | null;
}
export interface GlobalQuote {
  code: string; name: string;
  price: number | null; open: number | null; high: number | null; low: number | null;
  prev_close: number | null; amount: number | null; mcap: number | null; change_pct: number | null;
}
export interface GlobalMetrics {
  report_date: string;
  revenue: number | null; revenue_yoy: number | null; net_profit: number | null;
  eps: number | null; roe: number | null; gross_margin: number | null;
  net_margin: number | null; debt_ratio: number | null;
}
export interface GlobalStock {
  code: string; name: string; market: string;
  quote: GlobalQuote; metrics: GlobalMetrics | null;
}

export interface KnowledgeEntry {
  id: string;
  title: string;
  date: string;
  type: string;
  tags: string[];
  related_sectors: string[];
  related_stocks: string[];
  summary_status: string;
  image_artifact_status: string;
  summary_text?: string;
  investment_view?: "bullish" | "neutral" | "bearish" | "";
  artifact_request?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  content?: string;
  content_preview?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  category: string;
  importance: string;
  source: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface WatchStock {
  code: string;
  market: string;
  name: string;
  group: string;
  sort_order: number;
  asset_type?: string;
}

export interface WatchIndicator {
  key: string;
  label: string;
  category: string;
  value: string;
  note?: string;
  sort_order?: number;
  asset_type?: string;
}

export interface StockSearchResult {
  code: string;
  market: string;
  name: string;
  pinyin: string;
  security_type: string;
  display: string;
}

export interface StockIndustryResult {
  industry: string;
  sw_l1: string;
  sw_l2: string;
  sw_l3: string;
  source: string;
}

export interface WatchlistData {
  stocks: WatchStock[];
  indicators: WatchIndicator[];
  updated_at: string;
}

export interface EventProbabilitySummary {
  title: string;
  description: string;
  updated_at: string;
}

export interface EventProbabilityModule {
  key: string;
  label: string;
  description: string;
  status: string;
}

export interface EventProbabilityItem {
  key: string;
  title: string;
  category: string;
  status: string;
  note: string;
  probability_label: string;
  judgment: string;
}

export interface EventProbabilitySource {
  key: string;
  label: string;
  provider: string;
  status: string;
  note: string;
}

export interface ResearchHubData {
  generated_at: string;
  fundamental: {
    source_interfaces: {
      industry_expert_notes: {
        active_provider: string;
        fallback_provider: string;
        dataset_key: string;
      };
    stock_expert_notes: {
        active_provider: string;
        fallback_provider: string;
        dataset_key: string;
      };
    };
    news_source_config: NewsRadarConfig;
    global_tech_headlines: {
      industry_key: string;
      industry_name: string;
      title: string;
      source: string;
      time: string;
      url: string;
      summary: string;
      ts: number;
    }[];
    macro_events: Industry[];
    industry_dynamics: Industry[];
    stock_topics: Industry[];
    stock_dynamics: { ticker: string; name: string; highlights: string[] }[];
    geopolitics: {
      title: string;
      groups: Industry[];
      items: {
        industry_key?: string;
        industry_name?: string;
        title: string;
        summary: string;
        source?: string;
        time?: string;
        url?: string;
      }[];
    };
    hiring_radar: {
      title: string;
      summary: string;
      updated_at: string;
      companies: string[];
      source: string;
      items: {
        company: string;
        title: string;
        location: string;
        time: string;
        url: string;
        summary: string;
        source: string;
        department?: string;
        salary?: string;
        remote?: string;
      }[];
    };
  };
  liquidity: {
    daily_review: { summary: string; etf_placeholder: string };
    indicators: { key: string; label: string; insight: string }[];
    commodities: { key: string; label: string; insight: string }[];
  };
  event_probability: {
    summary: EventProbabilitySummary;
    planned_modules: EventProbabilityModule[];
    priority_events: EventProbabilityItem[];
    source_interfaces: EventProbabilitySource[];
  };
  framework: {
    sector_focus: KnowledgeEntry[];
    stock_focus: { ticker: string; name: string; group: string }[];
    weekly_reviews: KnowledgeEntry[];
  };
}

export interface MacroOverviewData {
  provider: string;
  provider_status: ProviderStatusData;
  overview_rows: { label: string; freq: string; values: string[] }[];
  heatmap: {
    title: string;
    columns: string[];
    rows: { label: string; values: number[] }[];
  };
  trend: {
    title: string;
    x: string[];
    series: { name: string; values: number[] }[];
  };
  commentary: string;
}

export interface ProviderStatusData {
  providers: Record<string, {
    enabled: boolean;
    ready: boolean;
    label: string;
    notes: string;
    mode?: string;
    sdk_module?: string;
    has_token?: boolean;
    has_dsn?: boolean;
  }>;
  china_macro_overview: ProviderDatasetStatus;
  stock_data?: ProviderDatasetStatus;
  [dataset: string]: unknown;
}

export interface ProviderDatasetStatus {
    active_provider: string;
    fallback_provider: string;
    dataset_key: string;
}

export interface IfindStatus {
  enabled: boolean;
  ready: boolean;
  mode: string;
  sdk_module: string;
  has_token: boolean;
  has_dsn: boolean;
  reason: string;
}

export interface StockCenterData {
  ticker: string;
  company: { name: string; group: string };
  public_info: Record<string, string>;
  announcements: Announcement[];
  news: NewsItem[];
  research_notes: KnowledgeEntry[];
  tracking_comments: KnowledgeEntry[];
  attachments: KnowledgeEntry[];
}

export interface MarketReportIngestResult {
  requested: number;
  created: number;
  skipped: number;
  items: {
    ticker: string;
    title: string;
    org: string;
    date: string;
    rating: string;
    industry: string;
    pdfUrl: string;
    entry_id: string;
    status: "created" | "skipped";
  }[];
  errors: { ticker: string; message: string }[];
}

export interface SectorReportIngestResult {
  sector: string;
  keywords: string[];
  created: number;
  skipped: number;
  items: {
    sector: string;
    title: string;
    org: string;
    date: string;
    rating: string;
    industry: string;
    pdfUrl: string;
    entry_id: string;
    status: "created" | "skipped";
  }[];
  errors: { sector: string; message: string }[];
}

export interface PremiumNoteIngestResult {
  entry: KnowledgeEntry;
  scope: "industry" | "stock";
  source_name: string;
  source_type: string;
}

export interface OverviewSourceInterface {
  id: string;
  label: string;
  provider: string;
  note: string;
  enabled: boolean;
  removable?: boolean;
}

export interface OverviewBuildResult {
  scope: "sector" | "stock";
  target: string;
  sources_count: number;
  modules: SectorModule[] | StockModule[];
  draft_theme_schema?: HBMDraftDashboardData;
}

export interface HBMDraftMetric {
  label: string;
  value: string;
  tone?: string;
}

export interface HBMDraftPanel {
  title: string;
  items: string[];
  tone?: string;
}

export interface HBMGenerationStep {
  label: string;
  caption: string;
  active?: boolean;
}

export interface HBMCostStackItem {
  label: string;
  weight: number;
  note?: string;
}

export interface HBMDraftTab {
  key: "overview" | "generation" | "cost_bottleneck" | "leaders" | "cycle_meter";
  title: string;
  headline?: string;
  summary: string[];
  metrics: HBMDraftMetric[];
  panels: HBMDraftPanel[];
  sources?: string[];
  empty_state?: string;
  generation_steps?: HBMGenerationStep[];
  cost_stack?: HBMCostStackItem[];
}

export interface HBMDraftDashboardData {
  kind: "hbm_draft_dashboard";
  tabs: HBMDraftTab[];
  generated_at?: string;
}

export interface OverviewChartBlock {
  type: string;
  title?: string;
  spec?: Record<string, unknown>;
}

export interface OverviewImageBlock {
  id: string;
  title?: string;
  image_url: string;
  caption?: string;
  source_label?: string;
}

export interface OverviewSourceBlock {
  id: string;
  label: string;
  url?: string;
  note?: string;
}

export interface StructuredRenderBlock {
  id: string;
  type:
    | "section"
    | "paragraph"
    | "bullet_list"
    | "quote"
    | "table"
    | "metric_grid"
    | "timeline"
    | "process_flow"
    | "industry_chain"
    | "comparison_cards"
    | "image"
    | "chart_spec"
    | "source_ref";
  title: string;
  section_key: string;
  content: string;
  items: string[];
  table: Record<string, unknown>;
  image: Record<string, unknown>;
  chart_spec: Record<string, unknown>;
  source_refs: Array<Record<string, unknown>>;
  children: StructuredRenderBlock[];
  render_hint: Record<string, unknown>;
}

export interface OverviewContentBlock {
  id: string;
  type: "section" | "text" | "image" | "chart" | "source";
  title?: string;
  text?: string;
  image_url?: string;
  caption?: string;
  source_label?: string;
  url?: string;
  note?: string;
  spec?: Record<string, unknown>;
  children?: OverviewContentBlock[];
}

export interface OverviewDeepCard {
  id: string;
  title: string;
  body: string;
  preview_text?: string;
  content_blocks?: OverviewContentBlock[];
  image_blocks?: OverviewImageBlock[];
  chart_blocks?: OverviewChartBlock[];
  source_blocks?: OverviewSourceBlock[];
  status?: string;
  sources?: Record<string, unknown>[];
  updated_at?: string;
}

export interface OverviewCandidate {
  id: string;
  source_type: "report" | "attachment" | "note" | "expert_call";
  title: string;
  summary?: string;
  source_title?: string;
  source_url?: string;
  matched_card_id?: string;
  target_block?: "body" | "image" | "chart" | "source";
  proposed_patch?: string;
  source_entry_id?: string;
  structured_blocks?: StructuredRenderBlock[];
  render_recipe?: Record<string, unknown>;
  diff_preview?: Record<string, unknown>;
  status?: "pending" | "accepted" | "ignored" | "later";
  created_at?: string;
  updated_at?: string;
}

export interface OverviewVersion {
  version_id: string;
  card_id: string;
  action_type: "replace" | "append" | "partial" | "ignore" | string;
  source_type: "report" | "attachment" | "note" | "expert_call" | string;
  source_title: string;
  before_snapshot: Record<string, unknown>;
  after_snapshot: Record<string, unknown>;
  change_summary?: string;
  created_at: string;
}

export interface OverviewWorkbench {
  scope_type: "sector" | "stock";
  scope_id: string;
  draft: {
    summary?: string;
    modules: SectorModule[] | StockModule[];
    sources: OverviewSourceInterface[];
    keywords?: string[];
    updated_at?: string;
  };
  deep_cards: OverviewDeepCard[];
  draft_structured_blocks?: StructuredRenderBlock[];
  deep_structured_blocks?: StructuredRenderBlock[];
  draft_theme_schema?: HBMDraftDashboardData;
  candidates: OverviewCandidate[];
  versions: OverviewVersion[];
  editor_binding?: OverviewEditorBinding;
  updated_at?: string;
}

export interface OverviewEditorBinding {
  provider: string;
  file_id: string;
  title: string;
  parent_id?: string;
  content?: string;
  preview?: string;
  updated_at?: string;
  last_synced_at?: string;
  message?: string;
}

export interface YoudaoNoteCandidate {
  file_id: string;
  title: string;
}

export interface StructuredOverviewImportResult {
  blocks: StructuredRenderBlock[];
  workbench: OverviewWorkbench;
}

export interface MacroRegistryData {
  title: string;
  groups: {
    key: string;
    label: string;
    items: {
      key: string;
      label: string;
      freq: string;
      public_key: string;
      ifind_code: string;
    }[];
  }[];
}

export interface DatabaseModuleRegistry {
  modules: {
    key: string;
    label: string;
    status: "sample_ready" | "skeleton";
    description: string;
    filters: { key: string; label: string; options: string[] }[];
    containers: { key: string; title: string; kind: string }[];
  }[];
  container_contract: Record<string, { empty_state: string }>;
}

export interface SectorTreeNode {
  id: string;
  name: string;
  parent_id: string;
  level: number;
  sort_order: number;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface SectorTreeData {
  nodes: SectorTreeNode[];
  updated_at: string;
}

export interface SectorIndicator {
  id: string;
  sector: string;
  name: string;
  freq: string;
  chart_kind: string;
  viewpoint: string;
  data_source: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface SectorIndicatorData {
  items: SectorIndicator[];
  updated_at: string;
}

export interface SectorModule {
  id: string;
  sector: string;
  title: string;
  category: string;
  content: string;
  data_source: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface SectorModuleData {
  items: SectorModule[];
  updated_at: string;
}

export interface StockModule {
  id: string;
  ticker: string;
  title: string;
  category: string;
  content: string;
  data_source: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface StockModuleData {
  items: StockModule[];
  updated_at: string;
}

export interface IntelDigestResult {
  kind: "tech" | "macro" | "industry" | "stock" | "geopolitics" | "hiring";
  title: string;
  summary_text: string;
  generated_at: string;
}

export interface IntelImageArtifact {
  kind: "tech" | "macro" | "industry" | "stock" | "geopolitics" | "hiring";
  title: string;
  summary_text: string;
  artifact_type: string;
  skill_interface: string;
  suggested_skill: string;
  requested_at: string;
  status: string;
  path: string;
}

export const api = {
  health: () => get<{ ok: boolean }>("/health"),
  indices: () => get<IndexQuote[]>("/indices"),
  marketOverview: () => get<MarketOverview>("/market/overview"),
  emotion: () => get<ShortTermEmotion>("/market/emotion"),
  turnoverTop: () => get<TurnoverTop>("/market/turnover-top"),
  globalIndices: () => get<GlobalIndex[]>("/global/indices"),
  globalStock: (symbol: string) => get<GlobalStock>(`/global/stock?symbol=${encodeURIComponent(symbol)}`),
  radar: () => get<RadarData>("/radar"),
  radarRefresh: () => request<RadarData>("/radar/refresh", "POST"),
  hiringRadarRefresh: () => request<ResearchHubData["fundamental"]["hiring_radar"]>("/research/hiring-radar/refresh", "POST"),
  portfolio: () => get<PortfolioData>("/portfolio"),
  addHolding: (code: string, shares: number, cost: number) => request<PortfolioData>("/portfolio/holding", "POST", { code, shares, cost }),
  removeHolding: (code: string) => request<PortfolioData>(`/portfolio/holding?code=${code}`, "DELETE"),
  refreshPortfolio: () => request<PortfolioData>("/portfolio/refresh", "POST"),
  closePosition: (code: string, date: string, price: number, shares: number, cost: number) =>
    request<PortfolioData>("/portfolio/close", "POST", { code, date, price, shares, cost }),
  removeClosed: (index: number) => request<PortfolioData>(`/portfolio/close?index=${index}`, "DELETE"),
  valuation: (code: string) => get<Valuation>(`/valuation?code=${code}`),
  percentile: (code: string) => get<ValPercentile>(`/valuation/percentile?code=${code}`),
  financials: (code: string) => get<Financials>(`/financials?code=${code}`),
  announcements: (code: string) => get<Announcement[]>(`/announcements?code=${code}`),
  quote: (codes: string) => get<Record<string, Quote>>(`/quote?codes=${codes}`),
  stockSearch: (q: string, limit = 10) => get<StockSearchResult[]>(`/stock/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  stockIndustry: (code: string) => get<StockIndustryResult>(`/stock/industry?code=${encodeURIComponent(code)}`),
  reports: (code: string) => get<Report[]>(`/reports?code=${code}`),
  news: (code: string) => get<NewsItem[]>(`/news?code=${code}`),
  margin: (code: string) => get<MarginRow[]>(`/margin?code=${code}`),
  blockTrade: (code: string) => get<BlockTradeRow[]>(`/block-trade?code=${code}`),
  holders: (code: string) => get<HolderRow[]>(`/holders?code=${code}`),
  dividend: (code: string) => get<DividendRow[]>(`/dividend?code=${code}`),
  fundFlow: (code: string) => get<FundFlowRow[]>(`/fund-flow?code=${code}`),
  dragonTiger: (code: string) => get<DragonTiger>(`/dragon-tiger?code=${code}`),
  lockup: (code: string) => get<Lockup>(`/lockup?code=${code}`),
  blocks: (code: string) => get<Blocks>(`/blocks?code=${code}`),
  hotConcepts: (code: string) => get<HotConcept[]>(`/hot-concepts?code=${code}`),
  investorQa: (code: string) => get<QaRow[]>(`/investor-qa?code=${code}`),
  industry: (top = 20) => get<IndustryData>(`/industry?top=${top}`),
  myReports: () => get<MyReport[]>("/myreports"),
  uploadReport: (name: string, contentB64: string) =>
    request<MyReport>("/myreports", "POST", { name, content_b64: contentB64 }),
  deleteReport: (id: string) => request<{ ok: boolean }>(`/myreports/${id}`, "DELETE"),
  knowledgeEntries: (params?: { kind?: string; sector?: string; stock?: string }) => {
    const query = new URLSearchParams();
    if (params?.kind) query.set("kind", params.kind);
    if (params?.sector) query.set("sector", params.sector);
    if (params?.stock) query.set("stock", params.stock);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return get<KnowledgeEntry[]>(`/knowledge/entries${suffix}`);
  },
  knowledgeEntry: (id: string) => get<KnowledgeEntry>(`/knowledge/entries/${id}`),
  createKnowledgeEntry: (payload: {
    title: string;
    type: string;
    content: string;
    date?: string;
    tags?: string[];
    related_sectors?: string[];
    related_stocks?: string[];
    investment_view?: "bullish" | "neutral" | "bearish" | "";
  }) => request<KnowledgeEntry>("/knowledge/entries", "POST", payload),
  updateKnowledgeEntry: (id: string, payload: {
    title?: string;
    content?: string;
    date?: string;
    tags?: string[];
    related_sectors?: string[];
    related_stocks?: string[];
    investment_view?: "bullish" | "neutral" | "bearish" | "";
  }) => request<KnowledgeEntry>(`/knowledge/entries/${id}`, "PUT", payload),
  saveKnowledgeEntryOrder: (payload: { kind: string; ids: string[] }) =>
    request<KnowledgeEntry[]>("/knowledge/entries/order", "PUT", payload),
  deleteKnowledgeEntry: (id: string) => request<{ ok: boolean }>(`/knowledge/entries/${id}`, "DELETE"),
  searchKnowledgeEntries: (q: string) => get<KnowledgeEntry[]>(`/knowledge/search?q=${encodeURIComponent(q)}`),
  generateEntrySummary: (id: string) => request<KnowledgeEntry>(`/knowledge/entries/${id}/summary`, "POST"),
  generateEntryImageArtifact: (id: string) => request<KnowledgeEntry>(`/knowledge/entries/${id}/image-artifact`, "POST"),
  calendarEvents: (params?: { view?: string; importance?: string }) => {
    const query = new URLSearchParams();
    if (params?.view) query.set("view", params.view);
    if (params?.importance) query.set("importance", params.importance);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return get<CalendarEvent[]>(`/calendar/events${suffix}`);
  },
  upsertCalendarEvent: (payload: {
    id?: string;
    title: string;
    date: string;
    category: string;
    importance: string;
    source: string;
    notes: string;
  }) => request<CalendarEvent>("/calendar/events", "POST", payload),
  watchlist: () => get<WatchlistData>("/watchlist"),
  saveWatchlist: (payload: { stocks: WatchStock[]; indicators: WatchIndicator[] }) =>
    request<WatchlistData>("/watchlist", "PUT", payload),
  sectorTree: () => get<SectorTreeData>("/framework/sector-tree"),
  saveSectorTreeOrder: (ids: string[]) => request<SectorTreeData>("/framework/sector-tree/order", "PUT", { ids }),
  upsertSectorNode: (payload: { id?: string; name: string; parent_id?: string; description?: string; sort_order?: number }) =>
    request<SectorTreeNode>("/framework/sector-tree/nodes", "POST", payload),
  deleteSectorNode: (id: string) => request<SectorTreeData>(`/framework/sector-tree/nodes/${encodeURIComponent(id)}`, "DELETE"),
  sectorIndicators: (sector?: string) => get<SectorIndicatorData>(`/framework/sector-indicators${sector ? `?sector=${encodeURIComponent(sector)}` : ""}`),
  upsertSectorIndicator: (payload: {
    id?: string;
    sector: string;
    name: string;
    freq?: string;
    chart_kind?: string;
    viewpoint?: string;
    data_source?: string;
    sort_order?: number;
  }) => request<SectorIndicator>("/framework/sector-indicators", "POST", payload),
  saveSectorIndicatorOrder: (payload: { sector: string; ids: string[] }) =>
    request<SectorIndicatorData>("/framework/sector-indicators/order", "PUT", payload),
  sectorModules: (sector?: string) => get<SectorModuleData>(`/framework/sector-modules${sector ? `?sector=${encodeURIComponent(sector)}` : ""}`),
  upsertSectorModule: (payload: {
    id?: string;
    sector: string;
    title: string;
    category?: string;
    content?: string;
    data_source?: string;
    sort_order?: number;
  }) => request<SectorModule>("/framework/sector-modules", "POST", payload),
  saveSectorModuleOrder: (payload: { sector: string; ids: string[] }) =>
    request<SectorModuleData>("/framework/sector-modules/order", "PUT", payload),
  stockModules: (ticker?: string) => get<StockModuleData>(`/framework/stock-modules${ticker ? `?ticker=${encodeURIComponent(ticker)}` : ""}`),
  upsertStockModule: (payload: {
    id?: string;
    ticker: string;
    title: string;
    category?: string;
    content?: string;
    data_source?: string;
    sort_order?: number;
  }) => request<StockModule>("/framework/stock-modules", "POST", payload),
  saveStockModuleOrder: (payload: { ticker: string; ids: string[] }) =>
    request<StockModuleData>("/framework/stock-modules/order", "PUT", payload),
  researchHub: () => get<ResearchHubData>("/research/hub"),
  newsSourcesConfig: () => get<NewsRadarConfig>("/research/news-sources-config"),
  saveNewsSourcesConfig: (payload: NewsRadarConfig) => request<NewsRadarConfig>("/research/news-sources-config", "PUT", payload),
  stockCenter: (ticker: string) => get<StockCenterData>(`/research/stock-center?ticker=${encodeURIComponent(ticker)}`),
  ingestMarketReports: (payload: { tickers?: string[]; pages?: number; max_reports_per_stock?: number }) =>
    request<MarketReportIngestResult>("/research/market-reports/ingest", "POST", payload),
  ingestSectorReports: (payload: { sector: string; days?: number; max_pages?: number; max_reports?: number }) =>
    request<SectorReportIngestResult>("/research/sector-reports/ingest", "POST", payload),
  ingestPremiumNote: (payload: {
    title: string;
    content: string;
    sector?: string;
    ticker?: string;
    source_name?: string;
    source_type?: string;
    note_kind?: string;
    date?: string;
    tags?: string[];
    summary_text?: string;
  }) => request<PremiumNoteIngestResult>("/research/premium-notes", "POST", payload),
  overviewWorkbench: (scopeType: "sector" | "stock", scopeId: string) =>
    get<OverviewWorkbench>(
      `/research/overview-workbench?scope_type=${encodeURIComponent(scopeType)}&scope_id=${encodeURIComponent(scopeId)}`,
      { cache: "no-store" },
    ),
  saveOverviewDraft: (payload: {
    scope_type: "sector" | "stock";
    scope_id: string;
    draft: OverviewWorkbench["draft"];
  }) => request<OverviewWorkbench>("/research/overview-workbench/draft", "POST", payload),
  saveOverviewDeepCards: (payload: {
    scope_type: "sector" | "stock";
    scope_id: string;
    cards: OverviewDeepCard[];
  }) => request<OverviewDeepCard[]>("/research/overview-workbench/deep-cards", "POST", payload),
  saveOverviewStructuredPreview: (payload: {
    scope_type: "sector" | "stock";
    scope_id: string;
    draft_blocks: StructuredRenderBlock[];
    deep_blocks: StructuredRenderBlock[];
  }) => request<OverviewWorkbench>("/research/overview-workbench/structured-preview", "POST", payload),
  appendOverviewCandidates: (payload: {
    scope_type: "sector" | "stock";
    scope_id: string;
    source_type: "report" | "attachment" | "note" | "expert_call";
    candidates: OverviewCandidate[];
  }) => request<OverviewWorkbench>("/research/overview-workbench/candidates", "POST", payload),
  applyOverviewCandidate: (payload: {
    scope_type: "sector" | "stock";
    scope_id: string;
    candidate_id: string;
    action: "replace" | "append" | "partial" | "ignore";
    payload?: Record<string, unknown>;
  }) => request<{ candidate: OverviewCandidate; card: OverviewDeepCard | null; version: OverviewVersion | null }>("/research/overview-workbench/candidates/apply", "POST", payload),
  overviewVersions: (scopeType: "sector" | "stock", scopeId: string, cardId?: string) =>
    get<OverviewVersion[]>(`/research/overview-workbench/versions?scope_type=${encodeURIComponent(scopeType)}&scope_id=${encodeURIComponent(scopeId)}${cardId ? `&card_id=${encodeURIComponent(cardId)}` : ""}`),
  overviewEditorBinding: (scopeType: "sector" | "stock", scopeId: string) =>
    get<OverviewEditorBinding>(`/research/overview-workbench/editor?scope_type=${encodeURIComponent(scopeType)}&scope_id=${encodeURIComponent(scopeId)}`),
  bindOverviewEditor: (payload: {
    scope_type: "sector" | "stock";
    scope_id: string;
    provider: "youdao";
    file_id: string;
    title?: string;
    parent_id?: string;
    content?: string;
  }) => request<OverviewEditorBinding>("/research/overview-workbench/editor/bind", "POST", payload),
  createOverviewEditor: (payload: {
    scope_type: "sector" | "stock";
    scope_id: string;
    provider: "youdao";
    title?: string;
    parent_id?: string;
    content?: string;
  }) => request<OverviewEditorBinding>("/research/overview-workbench/editor/create", "POST", payload),
  syncOverviewEditor: (payload: {
    scope_type: "sector" | "stock";
    scope_id: string;
  }) => request<OverviewEditorBinding>("/research/overview-workbench/editor/sync", "POST", payload),
  pushOverviewEditor: (payload: {
    scope_type: "sector" | "stock";
    scope_id: string;
    provider: "youdao";
    file_id: string;
    title?: string;
    parent_id?: string;
    content?: string;
  }) => request<OverviewEditorBinding>("/research/overview-workbench/editor/push", "POST", payload),
  openYoudaoApp: (fileId?: string) =>
    request<{ ok: boolean; message: string }>("/research/overview-workbench/editor/open-app", "POST", { file_id: fileId || "" }),
  searchYoudaoNotes: (keyword: string) =>
    request<YoudaoNoteCandidate[]>("/research/overview-workbench/editor/search-notes", "POST", { keyword }),
  importYoudaoOverviewCandidate: (payload: {
    scope_type: "sector" | "stock";
    scope_id: string;
    file_id: string;
    title?: string;
  }) => request<OverviewWorkbench>("/research/overview-workbench/editor/import-note", "POST", payload),
  importPdfOverviewCandidate: (payload: {
    scope_type: "sector" | "stock";
    scope_id: string;
    file_path: string;
    title: string;
  }) => request<StructuredOverviewImportResult>("/research/overview-workbench/render/import-pdf", "POST", payload),
  importImageOverviewCandidate: (payload: {
    scope_type: "sector" | "stock";
    scope_id: string;
    file_path: string;
    title: string;
  }) => request<StructuredOverviewImportResult>("/research/overview-workbench/render/import-image", "POST", payload),
  importStoredReportOverviewCandidate: (payload: {
    scope_type: "sector" | "stock";
    scope_id: string;
    report_id: string;
    title?: string;
  }) => request<StructuredOverviewImportResult>("/research/overview-workbench/render/import-report", "POST", payload),
  importKnowledgeOverviewCandidate: (payload: {
    scope_type: "sector" | "stock";
    scope_id: string;
    entry_id: string;
    title?: string;
  }) => request<StructuredOverviewImportResult>("/research/overview-workbench/render/import-entry", "POST", payload),
  buildSectorOverview: (sector: string) =>
    request<OverviewBuildResult>("/research/sector-overview/build", "POST", { sector }),
  buildStockOverview: (ticker: string) =>
    request<OverviewBuildResult>("/research/stock-overview/build", "POST", { ticker }),
  generateIntelDigest: (kind: "tech" | "macro" | "industry" | "stock" | "geopolitics" | "hiring") =>
    request<IntelDigestResult>("/research/intel-digest", "POST", { kind }),
  generateIntelImageArtifact: (kind: "tech" | "macro" | "industry" | "stock" | "geopolitics" | "hiring") =>
    request<IntelImageArtifact>("/research/intel-image-artifact", "POST", { kind }),
  generateLearningPack: (payload: { source_entry_id: string; title?: string }) =>
    request<KnowledgeEntry>("/learning/packs/generate", "POST", payload),
  generateLearningHtml: (entryId: string) =>
    request<{ entry_id: string; artifact_type: string; path: string; url: string }>(`/learning/packs/${entryId}/interactive-html`, "POST"),
  databaseProviders: () => get<ProviderStatusData>("/database/providers"),
  databaseModules: () => get<DatabaseModuleRegistry>("/database/modules"),
  upsertDatabaseModule: (payload: { key?: string; label: string; description?: string }) =>
    request<DatabaseModuleRegistry["modules"][number]>("/database/modules/custom", "POST", payload),
  saveDatabaseModuleOrder: (keys: string[]) =>
    request<DatabaseModuleRegistry>("/database/modules/order", "PUT", { keys }),
  ifindStatus: () => get<IfindStatus>("/ifind/status"),
  chinaMacroRegistry: () => get<MacroRegistryData>("/database/china-macro-registry"),
  saveChinaMacroRegistry: (payload: MacroRegistryData) => request<MacroRegistryData>("/database/china-macro-registry", "PUT", payload),
  chinaMacroOverview: () => get<MacroOverviewData>("/database/china-macro-overview"),
};
