import {
  Bot,
  CalendarRange,
  Database,
  LayoutGrid,
  LayoutTemplate,
  LineChart,
  NotebookPen,
  Radar,
  Settings,
  Star,
  Wallet,
  Waypoints,
} from "lucide-react";

export interface SidebarModuleConfig {
  to: string;
  label: string;
  icon: typeof CalendarRange;
  description: string;
  children?: { key: string; label: string }[];
}

export interface SubtabConfig {
  key: string;
  label: string;
  description?: string;
  children?: string[];
}

export interface KnowledgeEntryMeta {
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
  artifact_request?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  category: string;
  importance: string;
  source: string;
  notes: string;
}

export interface WatchStock {
  code: string;
  market: string;
  name: string;
  group: string;
  sort_order: number;
}

export interface WatchIndicator {
  key: string;
  label: string;
  category: string;
  value: string;
  note?: string;
}

export interface WatchItem {
  stocks: WatchStock[];
  indicators: WatchIndicator[];
  updated_at: string;
}

export interface InsightBlock {
  key: string;
  label: string;
  insight: string;
}

export interface ChartBlockConfig {
  title: string;
  kind: "overview" | "heatmap" | "line";
  note?: string;
}

export const SIDEBAR_MODULES: SidebarModuleConfig[] = [
  {
    to: "/calendar",
    label: "投资日历",
    icon: CalendarRange,
    description: "跟踪未来事件与调研安排",
  },
  {
    to: "/memos",
    label: "投资备忘",
    icon: NotebookPen,
    description: "按日期沉淀观点与思考",
  },
  {
    to: "/watchlist",
    label: "关注列表",
    icon: Star,
    description: "管理重点个股与指标",
  },
  {
    to: "/intel",
    label: "投研资讯",
    icon: Radar,
    description: "把高频信息收拢成一屏",
    children: [
      { key: "fundamental", label: "基本面" },
      { key: "liquidity", label: "流动性" },
      { key: "event-probability", label: "事件概率" },
    ],
  },
  {
    to: "/decision-cockpit",
    label: "决策驾驶舱",
    icon: LineChart,
    description: "把框架、因子和动作建议收敛成闭环",
  },
  {
    to: "/sectors",
    label: "板块中心",
    icon: LayoutGrid,
    description: "Simon 原版板块骨架与热门赛道",
  },
  {
    to: "/framework",
    label: "框架沉淀",
    icon: Waypoints,
    description: "行业中心、个股中心、周度复盘",
    children: [
      { key: "sectors", label: "行业中心" },
      { key: "stocks", label: "个股中心" },
      { key: "weekly", label: "周度复盘" },
      { key: "learning", label: "学习工坊" },
    ],
  },
  {
    to: "/database",
    label: "数据库",
    icon: Database,
    description: "数据库样板与后续扩展入口",
    children: [
      { key: "stock-data", label: "个股数据" },
      { key: "china-macro", label: "中国宏观数据库" },
      { key: "registry", label: "模块注册骨架" },
    ],
  },
  {
    to: "/templates",
    label: "模板",
    icon: LayoutTemplate,
    description: "沉淀可复用的关键数据库与演示模板",
    children: [
      { key: "key-database", label: "关键数据库" },
      { key: "ppt", label: "PPT模板" },
    ],
  },
  { to: "/portfolio", label: "我的持仓", icon: Wallet, description: "本地维护持仓与盈亏跟踪" },
  { to: "/tradingagents", label: "TradingAgents", icon: Bot, description: "A 股多 Agent 深度分析工作台" },
  { to: "/settings", label: "接入 AI", icon: Settings, description: "配置你自己的模型与访问密钥" },
];

export const INTEL_TABS: SubtabConfig[] = [
  { key: "fundamental", label: "基本面", description: "宏观、行业、个股、地缘" },
  { key: "liquidity", label: "流动性", description: "复盘、利率、商品" },
  { key: "event-probability", label: "事件概率", description: "事件观察、催化清单、数据接口" },
];

export const FRAMEWORK_TABS: SubtabConfig[] = [
  { key: "sectors", label: "行业中心", description: "按行业沉淀框架、指标、纪要和附件" },
  { key: "stocks", label: "个股中心", description: "按个股沉淀公开信息、纪要、点评和研报" },
  { key: "weekly", label: "周度复盘", description: "按年度和周度记录观点留痕" },
  { key: "learning", label: "学习工坊", description: "把资料转成互动学习包" },
];

export const DATABASE_TABS: SubtabConfig[] = [
  { key: "stock-data", label: "个股数据" },
  { key: "china-macro", label: "中国宏观数据库" },
  { key: "registry", label: "模块注册骨架" },
];

export const TEMPLATE_TABS: SubtabConfig[] = [
  { key: "key-database", label: "关键数据库", description: "固化单票高频跟踪数据库的结构与字段" },
  { key: "ppt", label: "PPT模板", description: "固化汇报页版式，后续按个股或主题一键生成" },
];
