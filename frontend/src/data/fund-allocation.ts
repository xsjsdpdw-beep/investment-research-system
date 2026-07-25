export type EtfDirection = "增持" | "减持" | "不变" | "新晋";

export interface EtfHoldingRow {
  holder: string;
  holderGroup: "中央汇金投资" | "中央汇金资管" | "汇金资管单一资管计划";
  category: "宽基" | "行业主题" | "跨境/战略";
  code: string;
  name: string;
  indexOrTheme: string;
  currentSharesWan: number;
  previousSharesWan: number;
  changePct: number | null;
  ownershipPct: number;
  direction: EtfDirection;
  asOf: string;
}

export interface EtfUniverseRow {
  category: "宽基" | "行业主题" | "跨境/战略";
  description: string;
  nationalVisibleCount: number;
  visibleShare: string;
  status: "已接入" | "待补齐";
}

export interface ActiveFundSectorRow {
  sector: string;
  q1Weight: number;
  q2Weight: number;
  q4Weight?: number | null;
  q3Weight?: number | null;
  weightChange: number;
  lowQ1: number;
  lowQ2: number;
  lowChange: number;
  relativeChange: number;
  absoluteChange: number;
  northboundChina: number;
  northboundTrading: number;
  northboundAllocation: number;
  history?: Record<string, ActiveFundQuarterSnapshot>;
}

export interface ActiveFundQuarterSnapshot {
  weight: number | null;
  low: number | null;
}

export interface FundAllocationSource {
  label: string;
  kind: "公开披露";
  asOf: string;
  url?: string;
  note: string;
}

export interface FundAllocationSnapshot {
  schemaVersion: 1;
  generatedAt: string;
  etfAsOf: string;
  activeFundAsOf: string;
  etfRows: EtfHoldingRow[];
  etfUniverse: EtfUniverseRow[];
  activeFundRows: ActiveFundSectorRow[];
  sources: FundAllocationSource[];
}

const centralHuijin = "中央汇金投资有限责任公司";
const huijinAsset = "中央汇金资产管理有限责任公司";
const huijinPlan = "汇金资管单一资管计划";

export const FUND_ALLOCATION_SNAPSHOT: FundAllocationSnapshot = {
  schemaVersion: 1,
  generatedAt: "2026-07-23",
  etfAsOf: "2025-12-31",
  activeFundAsOf: "2026Q2",
  etfUniverse: [
    {
      category: "宽基",
      description: "上证50、沪深300、中证500、中证1000、科创50、创业板等核心指数",
      nationalVisibleCount: 17,
      visibleShare: "主力持仓",
      status: "已接入",
    },
    {
      category: "行业主题",
      description: "软件、芯片、光伏、军工、有色、医药、医疗、黄金股、消费等",
      nationalVisibleCount: 10,
      visibleShare: "资管计划为主",
      status: "已接入",
    },
    {
      category: "跨境/战略",
      description: "中概互联、5G，以及央企科技、央企红利等战略主题目录",
      nationalVisibleCount: 2,
      visibleShare: "少量披露",
      status: "待补齐",
    },
  ],
  etfRows: [
    { holder: centralHuijin, holderGroup: "中央汇金投资", category: "宽基", code: "510050", name: "50ETF", indexOrTheme: "上证50", currentSharesWan: 2879151.39, previousSharesWan: 2879151.39, changePct: 0, ownershipPct: 50.81, direction: "不变", asOf: "2025-12-31" },
    { holder: centralHuijin, holderGroup: "中央汇金投资", category: "宽基", code: "510300", name: "300ETF", indexOrTheme: "沪深300", currentSharesWan: 3565459.89, previousSharesWan: 3565459.89, changePct: 0, ownershipPct: 40.14, direction: "不变", asOf: "2025-12-31" },
    { holder: centralHuijin, holderGroup: "中央汇金投资", category: "宽基", code: "510500", name: "500ETF", indexOrTheme: "中证500", currentSharesWan: 823510.16, previousSharesWan: 823510.16, changePct: 0, ownershipPct: 43.2, direction: "不变", asOf: "2025-12-31" },
    { holder: centralHuijin, holderGroup: "中央汇金投资", category: "宽基", code: "512100", name: "1000ETF", indexOrTheme: "中证1000", currentSharesWan: 895669.23, previousSharesWan: 895669.23, changePct: 0, ownershipPct: 34.92, direction: "不变", asOf: "2025-12-31" },
    { holder: centralHuijin, holderGroup: "中央汇金投资", category: "宽基", code: "560010", name: "1000基金", indexOrTheme: "中证1000", currentSharesWan: 379991.52, previousSharesWan: 379991.52, changePct: 0, ownershipPct: 33.09, direction: "不变", asOf: "2025-12-31" },
    { holder: centralHuijin, holderGroup: "中央汇金投资", category: "宽基", code: "588080", name: "科创板50", indexOrTheme: "科创50", currentSharesWan: 1180656.46, previousSharesWan: 1180656.46, changePct: 0, ownershipPct: 22.92, direction: "不变", asOf: "2025-12-31" },
    { holder: centralHuijin, holderGroup: "中央汇金投资", category: "宽基", code: "159915", name: "创业板ETF易方达", indexOrTheme: "创业板指", currentSharesWan: 1136296.29, previousSharesWan: 1136296.29, changePct: 0, ownershipPct: 36.07, direction: "不变", asOf: "2025-12-31" },
    { holder: centralHuijin, holderGroup: "中央汇金投资", category: "宽基", code: "159977", name: "创业板ETF天弘", indexOrTheme: "创业板指", currentSharesWan: 46201.24, previousSharesWan: 23100.62, changePct: 100, ownershipPct: 8.94, direction: "增持", asOf: "2025-12-31" },
    { holder: centralHuijin, holderGroup: "中央汇金投资", category: "宽基", code: "510180", name: "180ETF", indexOrTheme: "上证180", currentSharesWan: 523157.1, previousSharesWan: 523157.1, changePct: 0, ownershipPct: 91.93, direction: "不变", asOf: "2025-12-31" },
    { holder: centralHuijin, holderGroup: "中央汇金投资", category: "宽基", code: "510330", name: "华夏300", indexOrTheme: "沪深300", currentSharesWan: 2093723.06, previousSharesWan: 2093723.06, changePct: 0, ownershipPct: 44.15, direction: "不变", asOf: "2025-12-31" },
    { holder: centralHuijin, holderGroup: "中央汇金投资", category: "宽基", code: "159919", name: "沪深300ETF嘉实", indexOrTheme: "沪深300", currentSharesWan: 1954368.69, previousSharesWan: 1954368.69, changePct: 0, ownershipPct: 47.88, direction: "不变", asOf: "2025-12-31" },
    { holder: huijinAsset, holderGroup: "中央汇金资管", category: "宽基", code: "510300", name: "300ETF", indexOrTheme: "沪深300", currentSharesWan: 3785847.5, previousSharesWan: 3785847.5, changePct: 0, ownershipPct: 42.62, direction: "不变", asOf: "2025-12-31" },
    { holder: huijinAsset, holderGroup: "中央汇金资管", category: "宽基", code: "560010", name: "1000基金", indexOrTheme: "中证1000", currentSharesWan: 674991.5, previousSharesWan: 674991.5, changePct: 0, ownershipPct: 58.77, direction: "不变", asOf: "2025-12-31" },
    { holder: huijinAsset, holderGroup: "中央汇金资管", category: "宽基", code: "510500", name: "500ETF", indexOrTheme: "中证500", currentSharesWan: 598197.75, previousSharesWan: 598197.75, changePct: 0, ownershipPct: 31.38, direction: "不变", asOf: "2025-12-31" },
    { holder: huijinAsset, holderGroup: "中央汇金资管", category: "宽基", code: "510330", name: "华夏300", indexOrTheme: "沪深300", currentSharesWan: 2109079.17, previousSharesWan: 2109079.17, changePct: 0, ownershipPct: 44.47, direction: "不变", asOf: "2025-12-31" },
    { holder: huijinAsset, holderGroup: "中央汇金资管", category: "宽基", code: "159915", name: "创业板ETF易方达", indexOrTheme: "创业板指", currentSharesWan: 565682.13, previousSharesWan: 565682.13, changePct: 0, ownershipPct: 17.96, direction: "不变", asOf: "2025-12-31" },
    { holder: huijinAsset, holderGroup: "中央汇金资管", category: "宽基", code: "512100", name: "1000ETF", indexOrTheme: "中证1000", currentSharesWan: 1321218.68, previousSharesWan: 1321218.68, changePct: 0, ownershipPct: 51.51, direction: "不变", asOf: "2025-12-31" },
    { holder: huijinPlan, holderGroup: "汇金资管单一资管计划", category: "行业主题", code: "159852", name: "软件ETF", indexOrTheme: "软件", currentSharesWan: 12212.55, previousSharesWan: 5672.57, changePct: 115.29, ownershipPct: 1.75, direction: "增持", asOf: "2025-12-31" },
    { holder: huijinPlan, holderGroup: "汇金资管单一资管计划", category: "行业主题", code: "159865", name: "养殖ETF", indexOrTheme: "农牧养殖", currentSharesWan: 12869.1, previousSharesWan: 8355.26, changePct: 54.02, ownershipPct: 1.37, direction: "增持", asOf: "2025-12-31" },
    { holder: huijinPlan, holderGroup: "汇金资管单一资管计划", category: "行业主题", code: "159870", name: "化工ETF", indexOrTheme: "基础化工", currentSharesWan: 22018.5, previousSharesWan: 24806.23, changePct: -11.24, ownershipPct: 1.07, direction: "减持", asOf: "2025-12-31" },
    { holder: huijinPlan, holderGroup: "汇金资管单一资管计划", category: "行业主题", code: "159995", name: "芯片ETF", indexOrTheme: "半导体芯片", currentSharesWan: 28016.71, previousSharesWan: 35491.04, changePct: -21.06, ownershipPct: 1.92, direction: "减持", asOf: "2025-12-31" },
    { holder: huijinPlan, holderGroup: "汇金资管单一资管计划", category: "行业主题", code: "515790", name: "光伏ETF", indexOrTheme: "光伏", currentSharesWan: 7509.17, previousSharesWan: 0, changePct: null, ownershipPct: 0.64, direction: "新晋", asOf: "2025-12-31" },
    { holder: huijinPlan, holderGroup: "汇金资管单一资管计划", category: "行业主题", code: "512660", name: "军工ETF", indexOrTheme: "国防军工", currentSharesWan: 11856.49, previousSharesWan: 16768.13, changePct: -29.29, ownershipPct: 1.53, direction: "减持", asOf: "2025-12-31" },
    { holder: huijinPlan, holderGroup: "汇金资管单一资管计划", category: "行业主题", code: "512400", name: "有色ETF", indexOrTheme: "有色金属", currentSharesWan: 22507.67, previousSharesWan: 20394.05, changePct: 10.36, ownershipPct: 2.11, direction: "增持", asOf: "2025-12-31" },
    { holder: huijinPlan, holderGroup: "汇金资管单一资管计划", category: "行业主题", code: "512170", name: "医疗ETF", indexOrTheme: "医疗", currentSharesWan: 22970.16, previousSharesWan: 22970.16, changePct: 0, ownershipPct: 0.31, direction: "不变", asOf: "2025-12-31" },
    { holder: huijinPlan, holderGroup: "汇金资管单一资管计划", category: "行业主题", code: "512010", name: "医药ETF", indexOrTheme: "医药", currentSharesWan: 89327.37, previousSharesWan: 89327.37, changePct: 0, ownershipPct: 1.99, direction: "不变", asOf: "2025-12-31" },
    { holder: huijinPlan, holderGroup: "汇金资管单一资管计划", category: "行业主题", code: "159562", name: "黄金股ETF", indexOrTheme: "黄金股", currentSharesWan: 9299.97, previousSharesWan: 3634.34, changePct: 155.89, ownershipPct: 6.86, direction: "增持", asOf: "2025-12-31" },
    { holder: huijinPlan, holderGroup: "汇金资管单一资管计划", category: "跨境/战略", code: "515050", name: "5GETF", indexOrTheme: "5G通信", currentSharesWan: 20000, previousSharesWan: 20000, changePct: 0, ownershipPct: 5.83, direction: "不变", asOf: "2025-12-31" },
    { holder: huijinPlan, holderGroup: "汇金资管单一资管计划", category: "行业主题", code: "512690", name: "酒ETF", indexOrTheme: "食品饮料", currentSharesWan: 58100, previousSharesWan: 58100, changePct: 0, ownershipPct: 1.65, direction: "不变", asOf: "2025-12-31" },
    { holder: huijinPlan, holderGroup: "汇金资管单一资管计划", category: "跨境/战略", code: "513050", name: "中概互联", indexOrTheme: "中国互联网", currentSharesWan: 97000, previousSharesWan: 97000, changePct: 0, ownershipPct: 3.59, direction: "不变", asOf: "2025-12-31" },
  ],
  activeFundRows: [
    { sector: "电子", q1Weight: 21.8, q2Weight: 43.23, weightChange: 21.44, lowQ1: 8.07, lowQ2: 19.82, lowChange: 11.76, relativeChange: 9.19, absoluteChange: 4.66, northboundChina: 0.03, northboundTrading: 0.11, northboundAllocation: 0.36 },
    { sector: "通信", q1Weight: 13.54, q2Weight: 17.84, weightChange: 4.3, lowQ1: 8.49, lowQ2: 10.59, lowChange: 2.09, relativeChange: -1.1, absoluteChange: -1.6, northboundChina: 0.01, northboundTrading: -0.34, northboundAllocation: 0.52 },
    { sector: "建材", q1Weight: 0.85, q2Weight: 1.49, weightChange: 0.63, lowQ1: -0.13, lowQ2: 0.33, lowChange: 0.46, relativeChange: 0.57, absoluteChange: 0.52, northboundChina: 0.04, northboundTrading: 0.19, northboundAllocation: -0.26 },
    { sector: "计算机", q1Weight: 1.7, q2Weight: 1.62, weightChange: -0.08, lowQ1: -3.85, lowQ2: -3.4, lowChange: 0.45, relativeChange: 0.03, absoluteChange: -0.05, northboundChina: 0.02, northboundTrading: -0.01, northboundAllocation: 0.01 },
    { sector: "电力及公用事业", q1Weight: 0.61, q2Weight: 0.33, weightChange: -0.28, lowQ1: -2.35, lowQ2: -2.12, lowChange: 0.23, relativeChange: -0.07, absoluteChange: -0.09, northboundChina: -0.02, northboundTrading: -0.01, northboundAllocation: 0.38 },
    { sector: "银行", q1Weight: 1.99, q2Weight: 1.11, weightChange: -0.88, lowQ1: -3.71, lowQ2: -3.54, lowChange: 0.17, relativeChange: -0.22, absoluteChange: -0.28, northboundChina: 0, northboundTrading: -0.45, northboundAllocation: 0.18 },
    { sector: "商贸零售", q1Weight: 0.18, q2Weight: 0.05, weightChange: -0.12, lowQ1: -0.67, lowQ2: -0.55, lowChange: 0.11, relativeChange: -0.05, absoluteChange: -0.06, northboundChina: -0.03, northboundTrading: -0.45, northboundAllocation: -0.82 },
    { sector: "综合", q1Weight: 0.02, q2Weight: 0.01, weightChange: -0.01, lowQ1: -0.35, lowQ2: -0.25, lowChange: 0.1, relativeChange: 0, absoluteChange: 0, northboundChina: 0, northboundTrading: -0.02, northboundAllocation: -0.07 },
    { sector: "建筑", q1Weight: 0.53, q2Weight: 0.19, weightChange: -0.34, lowQ1: -1.19, lowQ2: -1.14, lowChange: 0.04, relativeChange: -0.19, absoluteChange: -0.2, northboundChina: 0.02, northboundTrading: -0.15, northboundAllocation: -0.03 },
    { sector: "纺织服装", q1Weight: 0.19, q2Weight: 0.13, weightChange: -0.06, lowQ1: -0.33, lowQ2: -0.29, lowChange: 0.04, relativeChange: 0.01, absoluteChange: 0.01, northboundChina: 0, northboundTrading: 0.36, northboundAllocation: 0.42 },
    { sector: "房地产", q1Weight: 0.46, q2Weight: 0.27, weightChange: -0.19, lowQ1: -0.68, lowQ2: -0.65, lowChange: 0.03, relativeChange: -0.01, absoluteChange: -0.02, northboundChina: 0.02, northboundTrading: 0.19, northboundAllocation: -0.02 },
    { sector: "综合金融", q1Weight: 0, q2Weight: 0, weightChange: 0, lowQ1: -0.1, lowQ2: -0.08, lowChange: 0.03, relativeChange: 0, absoluteChange: 0, northboundChina: -0.03, northboundTrading: -0.19, northboundAllocation: 0.12 },
    { sector: "非银行金融", q1Weight: 1.48, q2Weight: 0.89, weightChange: -0.59, lowQ1: -3.15, lowQ2: -3.19, lowChange: -0.04, relativeChange: -0.09, absoluteChange: -0.13, northboundChina: 0.03, northboundTrading: -0.11, northboundAllocation: 0.32 },
    { sector: "轻工制造", q1Weight: 0.54, q2Weight: 0.28, weightChange: -0.26, lowQ1: -0.46, lowQ2: -0.51, lowChange: -0.05, relativeChange: -0.06, absoluteChange: -0.08, northboundChina: 0.01, northboundTrading: 0.14, northboundAllocation: -0.1 },
    { sector: "煤炭", q1Weight: 0.67, q2Weight: 0.36, weightChange: -0.3, lowQ1: -0.39, lowQ2: -0.45, lowChange: -0.06, relativeChange: -0.08, absoluteChange: -0.1, northboundChina: 0.01, northboundTrading: 0.26, northboundAllocation: -0.04 },
    { sector: "农林牧渔", q1Weight: 1.04, q2Weight: 0.52, weightChange: -0.52, lowQ1: -0.22, lowQ2: -0.34, lowChange: -0.12, relativeChange: -0.12, absoluteChange: -0.15, northboundChina: 0.02, northboundTrading: -0.12, northboundAllocation: -0.14 },
    { sector: "家电", q1Weight: 1.95, q2Weight: 1.63, weightChange: -0.32, lowQ1: -0.13, lowQ2: -0.26, lowChange: -0.13, relativeChange: 0.1, absoluteChange: 0.02, northboundChina: 0.03, northboundTrading: 0.08, northboundAllocation: -0.27 },
    { sector: "消费者服务", q1Weight: 0.34, q2Weight: 0.05, weightChange: -0.29, lowQ1: -0.12, lowQ2: -0.27, lowChange: -0.16, relativeChange: -0.14, absoluteChange: -0.14, northboundChina: 0.03, northboundTrading: -0.06, northboundAllocation: 0.01 },
    { sector: "传媒", q1Weight: 0.97, q2Weight: 0.26, weightChange: -0.7, lowQ1: -1.14, lowQ2: -1.3, lowChange: -0.16, relativeChange: -0.3, absoluteChange: -0.33, northboundChina: 0, northboundTrading: -0.24, northboundAllocation: -0.15 },
    { sector: "交通运输", q1Weight: 1.6, q2Weight: 0.82, weightChange: -0.78, lowQ1: -0.69, lowQ2: -0.98, lowChange: -0.28, relativeChange: -0.25, absoluteChange: -0.3, northboundChina: 0.01, northboundTrading: -0.26, northboundAllocation: 0.03 },
    { sector: "钢铁", q1Weight: 0.74, q2Weight: 0.22, weightChange: -0.53, lowQ1: -0.16, lowQ2: -0.44, lowChange: -0.29, relativeChange: -0.21, absoluteChange: -0.23, northboundChina: 0.01, northboundTrading: -0.08, northboundAllocation: 0.24 },
    { sector: "石油石化", q1Weight: 1.27, q2Weight: 0.61, weightChange: -0.67, lowQ1: -0.09, lowQ2: -0.4, lowChange: -0.31, relativeChange: -0.2, absoluteChange: -0.24, northboundChina: -0.02, northboundTrading: 0.02, northboundAllocation: 0.57 },
    { sector: "国防军工", q1Weight: 1.95, q2Weight: 1.05, weightChange: -0.9, lowQ1: -0.61, lowQ2: -1.11, lowChange: -0.49, relativeChange: -0.31, absoluteChange: -0.37, northboundChina: -0.02, northboundTrading: 0.18, northboundAllocation: -0.01 },
    { sector: "机械", q1Weight: 6.26, q2Weight: 5.48, weightChange: -0.79, lowQ1: -0.6, lowQ2: -1.31, lowChange: -0.72, relativeChange: -0.39, absoluteChange: -0.63, northboundChina: 0.01, northboundTrading: -0.28, northboundAllocation: 0.31 },
    { sector: "汽车", q1Weight: 3.72, q2Weight: 1.68, weightChange: -2.05, lowQ1: -0.05, lowQ2: -1.25, lowChange: -1.21, relativeChange: -0.87, absoluteChange: -0.97, northboundChina: -0.05, northboundTrading: -0.4, northboundAllocation: 0.61 },
    { sector: "食品饮料", q1Weight: 4.2, q2Weight: 1.51, weightChange: -2.69, lowQ1: 0.35, lowQ2: -1.24, lowChange: -1.59, relativeChange: -0.93, absoluteChange: -1.02, northboundChina: 0, northboundTrading: -0.12, northboundAllocation: -0.66 },
    { sector: "医药", q1Weight: 8.58, q2Weight: 5.56, weightChange: -3.02, lowQ1: 1.93, lowQ2: 0.21, lowChange: -1.73, relativeChange: -0.57, absoluteChange: -0.81, northboundChina: 0, northboundTrading: -0.12, northboundAllocation: 0.11 },
    { sector: "基础化工", q1Weight: 6.3, q2Weight: 4.07, weightChange: -2.23, lowQ1: 0.04, lowQ2: -2.18, lowChange: -2.22, relativeChange: -1.1, absoluteChange: -1.27, northboundChina: -0.01, northboundTrading: 0.12, northboundAllocation: -0.08 },
    { sector: "有色金属", q1Weight: 6.63, q2Weight: 3.37, weightChange: -3.27, lowQ1: 1.01, lowQ2: -1.45, lowChange: -2.46, relativeChange: -0.84, absoluteChange: -0.99, northboundChina: 0.04, northboundTrading: -0.1, northboundAllocation: -0.41 },
    { sector: "电力设备及新能源", q1Weight: 9.88, q2Weight: 5.35, weightChange: -4.53, lowQ1: 1.29, lowQ2: -2.23, lowChange: -3.52, relativeChange: -1.8, absoluteChange: -1.98, northboundChina: -0.01, northboundTrading: 0.03, northboundAllocation: 1.19 },
  ],
  sources: [
    {
      label: "中央汇金2025年度报告",
      kind: "公开披露",
      asOf: "2025-12-31",
      url: "https://www.chinamoney.com.cn/chinese/cwbg/20260630/3368368.html",
      note: "官方公告入口；ETF逐只持有人行采用公开披露整理稿核验。",
    },
    {
      label: "中央汇金2025年报ETF持仓分析",
      kind: "公开披露",
      asOf: "2025-12-31",
      url: "https://fund.10jqka.com.cn/20260423/c676225397.shtml",
      note: "披露持有人、持有份额、上市份额比例及环比方向。",
    },
    {
      label: "国家队ETF持仓曝光",
      kind: "公开披露",
      asOf: "2025-12-31",
      url: "https://www.21jingji.com/article/20260408/herald/125273ef3d7c60edfd32e5becfee94ad.html",
      note: "Wind口径的国家队范围和规模摘要，作为机构分组校验。",
    },
    {
      label: "主动权益基金2026年二季报公开解析",
      kind: "公开披露",
      asOf: "2026Q2",
      url: "https://finance.sina.com.cn/wm/2026-07-22/doc-iniirwqk8046244.shtml",
      note: "公开二季报解析入口；作为主观偏股基金季度行业数据自动刷新来源。",
    },
    {
      label: "主动权益基金2026年一季报公开解析",
      kind: "公开披露",
      asOf: "2026Q1",
      url: "https://www.fxbaogao.com/detail/5373715",
      note: "公开一季报解析入口；用于历史季度行业分类与配置字段。",
    },
    {
      label: "主动权益基金2025年四季报公开解析",
      kind: "公开披露",
      asOf: "2025Q4",
      url: "https://www.fxbaogao.com/detail/5238780",
      note: "公开四季报解析入口；用于历史季度列，缺失值保留为空。",
    },
  ],
};

const publicHistory: Record<string, { q4: number | null; q3: number | null }> = {
  电子: { q4: 23.7, q3: 25.6 },
  通信: { q4: 11.1, q3: 9.3 },
  医药: { q4: 8.1, q3: 9.7 },
  有色金属: { q4: 8, q3: 5.9 },
  "电力设备及新能源": { q4: 11.4, q3: 12.2 },
  基础化工: { q4: 3.2, q3: null },
  石油石化: { q4: 0.6, q3: null },
  交通运输: { q4: 1.3, q3: null },
  银行: { q4: 1.9, q3: null },
  计算机: { q4: 1.6, q3: null },
  机械: { q4: 4.8, q3: null },
  煤炭: { q4: 0.3, q3: null },
  房地产: { q4: 0.3, q3: null },
  建材: { q4: 0.7, q3: null },
  钢铁: { q4: 0.4, q3: null },
  商贸零售: { q4: 0.5, q3: null },
  农林牧渔: { q4: 1, q3: null },
  "消费者服务": { q4: 0.3, q3: null },
  "纺织服装": { q4: 0.2, q3: null },
  建筑: { q4: 0.4, q3: null },
  "国防军工": { q4: 2.6, q3: null },
  综合: { q4: 0.1, q3: null },
  环保: { q4: 0.3, q3: null },
  "轻工制造": { q4: 0.6, q3: null },
  "电力及公用事业": { q4: 0.3, q3: null },
  "非银行金融": { q4: 2.5, q3: null },
  "食品饮料": { q4: 4.5, q3: null },
  传媒: { q4: 1.3, q3: null },
  家电: { q4: 2.6, q3: null },
  汽车: { q4: 5.1, q3: null },
};

export const ACTIVE_FUND_ROWS_WITH_HISTORY: ActiveFundSectorRow[] = FUND_ALLOCATION_SNAPSHOT.activeFundRows.map((row) => ({
  ...row,
  q4Weight: publicHistory[row.sector]?.q4 ?? null,
  q3Weight: publicHistory[row.sector]?.q3 ?? null,
  history: {
    "2026Q1": { weight: row.q1Weight, low: row.lowQ1 },
    "2026Q2": { weight: row.q2Weight, low: row.lowQ2 },
    "2025Q4": { weight: publicHistory[row.sector]?.q4 ?? null, low: null },
    "2025Q3": { weight: publicHistory[row.sector]?.q3 ?? null, low: null },
  },
}));
