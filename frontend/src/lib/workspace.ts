import {
  CalendarRange,
  Database,
  NotebookPen,
  Radar,
  Settings,
  Star,
  Waypoints,
} from "lucide-react";

export interface SidebarModuleConfig {
  to: string;
  label: string;
  icon: typeof CalendarRange;
  description: string;
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
  { to: "/calendar", label: "投资日历", icon: CalendarRange, description: "跟踪未来事件与调研安排" },
  { to: "/memos", label: "投资备忘", icon: NotebookPen, description: "按日期沉淀观点与思考" },
  { to: "/watchlist", label: "关注列表", icon: Star, description: "管理重点个股与指标" },
  { to: "/intel", label: "资讯雷达", icon: Radar, description: "把高频信息收拢成一屏" },
  { to: "/framework", label: "框架沉淀", icon: Waypoints, description: "行业中心、个股中心、周度复盘" },
  { to: "/database", label: "数据库", icon: Database, description: "数据库样板与后续扩展入口" },
  { to: "/settings", label: "接入 AI", icon: Settings, description: "配置你自己的模型与访问密钥" },
];

export const INTEL_TABS: SubtabConfig[] = [
  { key: "fundamental", label: "基本面", description: "宏观、行业、个股、地缘" },
  { key: "liquidity", label: "流动性", description: "复盘、利率、商品" },
];

export const FRAMEWORK_TABS: SubtabConfig[] = [
  {
    key: "sectors",
    label: "行业中心",
    description: "以行业为主线沉淀框架、指标、纪要和附件",
    children: ["行业树", "跟踪指标", "行业纪要", "附件链接"],
  },
  {
    key: "stocks",
    label: "个股中心",
    description: "以个股为主线沉淀公开信息、纪要、点评和研报",
    children: ["公开信息", "调研纪要", "跟踪点评", "研报附件"],
  },
  {
    key: "weekly",
    label: "周度复盘",
    description: "用周维度给观点、动作和结论留痕",
    children: ["周涨跌表", "行动建议", "行业观点", "重点事件"],
  },
  {
    key: "learning",
    label: "学习工坊",
    description: "把研报、纪要和资料转成更容易吸收的学习模式",
    children: ["闯关模式", "路演模式", "推演模式", "互动网页"],
  },
];

export const DATABASE_TABS: SubtabConfig[] = [
  { key: "china-macro", label: "中国宏观数据库" },
  { key: "registry", label: "模块注册骨架" },
];
