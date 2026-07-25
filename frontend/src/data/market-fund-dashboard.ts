import type { ActiveFundSectorRow } from "./fund-allocation";

export interface MarketGroupSummary {
  name: string;
  count: number;
  latestAmountYi: number;
  latestScaleYi: number;
  scaleChangeYi: number;
  avgChangePct: number;
  gainers: number;
  losers: number;
}

export interface MarketEtfRow {
  code: string;
  name: string;
  market: "沪市" | "深市";
  group: string;
  price: number | null;
  changePct: number | null;
  changeAmount: number | null;
  volumeWan: number | null;
  amountYi: number | null;
  scaleYi: number | null;
  scaleChangeYi: number | null;
  amplitudePct: number | null;
  turnoverPct: number | null;
  quoteTimestamp: number | null;
}

export interface MarketEtfMeta {
  generatedAt: string;
  latestMarketDate: string;
  etfCount: number;
  groupCount: number;
  amountYi: number;
  gainers: number;
  losers: number;
  source: string;
}

export interface MarketEtfSnapshot {
  meta: MarketEtfMeta;
  groups: MarketGroupSummary[];
  rows: MarketEtfRow[];
}

interface ThsTaxonomyItem {
  name: string;
  code: string;
}

interface ThsEtfTaxonomy {
  industries: ThsTaxonomyItem[];
  concepts: ThsTaxonomyItem[];
  source: string;
}

export const EMPTY_MARKET_SNAPSHOT: MarketEtfSnapshot = {
  meta: {
    generatedAt: "",
    latestMarketDate: "",
    etfCount: 0,
    groupCount: 0,
    amountYi: 0,
    gainers: 0,
    losers: 0,
    source: "东方财富公开行情 + 同花顺行业 / 概念板块目录",
  },
  groups: [],
  rows: [],
};

const ETF_API = "/api/market-etf";
const THS_TAXONOMY_API = "/api/ths-etf-taxonomy";
const ACTIVE_FUND_API = "/api/active-fund-allocation";
const ETF_BOARD_FILTERS = ["MK0021", "MK0022", "MK0023", "MK0024", "MK0827"];
const PAGE_SIZE = 100;

type EastmoneyRow = Record<string, string | number | null>;

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || value === "-") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRows(value: unknown): EastmoneyRow[] {
  if (Array.isArray(value)) return value as EastmoneyRow[];
  if (value && typeof value === "object") return Object.values(value) as EastmoneyRow[];
  return [];
}

const FALLBACK_THS_TAXONOMY: ThsEtfTaxonomy = {
  source: "同花顺公开目录回退核心项",
  industries: [
    "半导体", "通信设备", "通信服务", "计算机设备", "软件开发", "电力", "电网设备", "电池", "光伏设备",
    "汽车整车", "汽车零部件", "银行", "证券", "保险", "房地产", "建筑材料", "建筑装饰", "医药商业", "医疗器械",
    "化学制品", "工业金属", "贵金属", "钢铁", "煤炭开采加工", "食品加工制造", "饮料制造", "白酒", "文化传媒", "游戏",
  ].map((name) => ({ name, code: "" })),
  concepts: [
    "人工智能", "芯片概念", "存储芯片", "云计算", "数据中心(AIDC)", "机器人概念", "人形机器人", "算力租赁", "储能",
    "光伏概念", "锂电池概念", "固态电池", "创新药", "消费电子概念", "军工", "网络游戏", "黄金概念", "智能电网",
  ].map((name) => ({ name, code: "" })),
};

const THS_ALIAS_RULES: Array<{ target: string; keywords: string[] }> = [
  { target: "存储芯片", keywords: ["存储芯片", "存储器", "DRAM", "NAND"] },
  { target: "芯片概念", keywords: ["芯片", "集成电路", "晶圆", "光刻"] },
  { target: "人工智能", keywords: ["人工智能", "AI"] },
  { target: "人形机器人", keywords: ["人形机器人"] },
  { target: "机器人概念", keywords: ["机器人"] },
  { target: "数据中心(AIDC)", keywords: ["数据中心", "AIDC", "IDC"] },
  { target: "云计算", keywords: ["云计算"] },
  { target: "算力租赁", keywords: ["算力"] },
  { target: "消费电子概念", keywords: ["消费电子"] },
  { target: "固态电池", keywords: ["固态电池"] },
  { target: "锂电池概念", keywords: ["锂电", "锂电池"] },
  { target: "光伏概念", keywords: ["光伏"] },
  { target: "储能", keywords: ["储能"] },
  { target: "创新药", keywords: ["创新药"] },
  { target: "网络游戏", keywords: ["游戏"] },
  { target: "黄金概念", keywords: ["黄金"] },
  { target: "智能电网", keywords: ["智能电网"] },
  { target: "通信设备", keywords: ["通信ETF", "光模块", "光通信"] },
  { target: "工业金属", keywords: ["有色金属", "有色ETF", "稀有金属", "工业有色"] },
  { target: "稀土永磁", keywords: ["稀土"] },
  { target: "证券", keywords: ["券商", "证券"] },
  { target: "白酒", keywords: ["白酒", "酒ETF"] },
  { target: "医疗器械", keywords: ["医疗ETF", "医疗器械"] },
  { target: "化学制药", keywords: ["医药ETF", "医药"] },
  { target: "生物制品", keywords: ["生物医药"] },
  { target: "软件开发", keywords: ["软件ETF", "软件"] },
  { target: "文化传媒", keywords: ["传媒ETF", "传媒"] },
  { target: "商业航天", keywords: ["航天ETF", "航空航天", "商业航天"] },
  { target: "卫星导航", keywords: ["卫星ETF", "卫星导航"] },
  { target: "军工", keywords: ["国防ETF", "军工"] },
  { target: "新能源汽车", keywords: ["新能源车", "新能源汽车"] },
  { target: "电池", keywords: ["新能源ETF", "绿电ETF"] },
  { target: "计算机设备", keywords: ["计算机ETF", "计算机"] },
  { target: "食品加工制造", keywords: ["食品饮料ETF", "食品ETF"] },
  { target: "建筑材料", keywords: ["建材ETF", "建材"] },
  { target: "石油加工贸易", keywords: ["石化ETF", "石油ETF"] },
  { target: "种植业与林业", keywords: ["农业ETF"] },
];

const BROAD_INDEX_RULES: Array<{ target: string; keywords: string[] }> = [
  { target: "中证A500", keywords: ["中证A500", "A500"] },
  { target: "沪深300", keywords: ["沪深300"] },
  { target: "中证500", keywords: ["中证500"] },
  { target: "中证1000", keywords: ["中证1000"] },
  { target: "中证2000", keywords: ["中证2000"] },
  { target: "中证800", keywords: ["中证800"] },
  { target: "中证100", keywords: ["中证100"] },
  { target: "上证50", keywords: ["上证50"] },
  { target: "科创50", keywords: ["科创50"] },
  { target: "科创100", keywords: ["科创100"] },
  { target: "创业板50", keywords: ["创业板50"] },
  { target: "创业板指", keywords: ["创业板指", "创业板ETF", "创业板"] },
  { target: "深证100", keywords: ["深证100"] },
  { target: "北证50", keywords: ["北证50"] },
  { target: "中证红利", keywords: ["中证红利"] },
  { target: "红利低波", keywords: ["红利低波"] },
  { target: "国证红利", keywords: ["国证红利"] },
  { target: "中国A50", keywords: ["中国A50", "MSCI中国A50", "富时中国A50"] },
  { target: "央企指数", keywords: ["央企"] },
  { target: "国企指数", keywords: ["国企"] },
];

const BROAD_INDEX_GROUPS = new Set(BROAD_INDEX_RULES.map((rule) => rule.target).concat("其他宽基指数"));

function compactName(value: string) {
  return value.toLowerCase().replace(/[\s·/\-（）()]/g, "");
}

function findTaxonomyItem(items: ThsTaxonomyItem[], target: string) {
  return items.find((item) => item.name === target);
}

function isBroadIndexGroup(group: string) {
  return BROAD_INDEX_GROUPS.has(group);
}

function queryCategory(name: string, board: string, taxonomy: ThsEtfTaxonomy): string {
  if (board === "MK0022") return "货币 ETF";
  if (board === "MK0023") return "跨境 / 海外";
  if (board === "MK0024" || board === "MK0827") return "商品 ETF";

  const compact = compactName(name);
  for (const rule of BROAD_INDEX_RULES) {
    if (rule.keywords.some((keyword) => compact.includes(compactName(keyword)))) return rule.target;
  }

  for (const rule of THS_ALIAS_RULES) {
    const item = findTaxonomyItem(taxonomy.concepts, rule.target) ?? findTaxonomyItem(taxonomy.industries, rule.target);
    if (item && rule.keywords.some((keyword) => compact.includes(compactName(keyword)))) return item.name;
  }

  const industryMatch = [...taxonomy.industries]
    .sort((a, b) => b.name.length - a.name.length)
    .find((item) => item.name.length >= 2 && compact.includes(compactName(item.name)));
  if (industryMatch) return industryMatch.name;

  const conceptMatch = [...taxonomy.concepts]
    .sort((a, b) => b.name.length - a.name.length)
    .find((item) => {
      const terms = [item.name, item.name.replace(/概念|产业|主题|指数|精选/g, "")].filter((term) => term.length >= 2);
      return terms.some((term) => compact.includes(compactName(term)));
    });
  if (conceptMatch) return conceptMatch.name;

  if (/(红利|价值|成长|低波|央企|国企|全指|宽基|沪深|中证|上证|深证|创业板|科创|北证|MSCI|A50|1000|800|500|300|200|50ETF|180ETF)/i.test(name)) {
    return "其他宽基指数";
  }
  return "其他（同花顺未映射）";
}

function toMarketRow(raw: EastmoneyRow, board: string, taxonomy: ThsEtfTaxonomy): MarketEtfRow | null {
  const code = String(raw.f12 ?? "").padStart(6, "0");
  const name = String(raw.f14 ?? "").trim();
  if (!/^\d{6}$/.test(code) || !name) return null;

  const quoteTimestamp = asNumber(raw.f124);
  return {
    code,
    name,
    market: Number(raw.f13) === 1 ? "沪市" : "深市",
    group: queryCategory(name, board, taxonomy),
    price: asNumber(raw.f2),
    changePct: asNumber(raw.f3),
    changeAmount: asNumber(raw.f4),
    volumeWan: asNumber(raw.f5) === null ? null : Number(raw.f5) / 10000,
    amountYi: asNumber(raw.f6) === null ? null : Number(raw.f6) / 100000000,
    scaleYi: asNumber(raw.f38) === null ? null : Number(raw.f38) / 100000000,
    scaleChangeYi: asNumber(raw.f62) === null ? null : Number(raw.f62) / 100000000,
    amplitudePct: asNumber(raw.f7),
    turnoverPct: asNumber(raw.f8),
    quoteTimestamp,
  };
}

async function fetchThsTaxonomy(signal?: AbortSignal): Promise<ThsEtfTaxonomy> {
  const response = await fetch(THS_TAXONOMY_API, { signal });
  if (!response.ok) throw new Error(`同花顺分类目录请求失败：HTTP ${response.status}`);
  const payload = await response.json() as { data?: Partial<ThsEtfTaxonomy> };
  const industries = Array.isArray(payload.data?.industries) ? payload.data.industries : [];
  const concepts = Array.isArray(payload.data?.concepts) ? payload.data.concepts : [];
  if (!industries.length || !concepts.length) throw new Error("同花顺分类目录为空");
  return {
    industries: industries.filter((item): item is ThsTaxonomyItem => Boolean(item && item.name)),
    concepts: concepts.filter((item): item is ThsTaxonomyItem => Boolean(item && item.name)),
    source: payload.data?.source || "同花顺公开行业 / 概念板块目录",
  };
}

async function fetchPage(page: number, board: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ page: String(page), board });
  const response = await fetch(`${ETF_API}?${params.toString()}`, { signal });
  if (!response.ok) throw new Error(`ETF 数据请求失败：HTTP ${response.status}`);
  const payload = await response.json() as { data?: { total?: number; diff?: unknown } };
  return {
    total: Number(payload.data?.total ?? 0),
    rows: normalizeRows(payload.data?.diff),
  };
}

function formatDate(timestamp: number | null) {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(timestamp * 1000)).replace(/\//g, "-");
}

function formatGeneratedAt(timestamp: number | null) {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "short", timeStyle: "short", hour12: false })
    .format(new Date(timestamp * 1000)).replace(/\//g, "-");
}

export async function fetchMarketEtfSnapshot(signal?: AbortSignal): Promise<MarketEtfSnapshot> {
  let taxonomy = FALLBACK_THS_TAXONOMY;
  let taxonomySource = taxonomy.source;
  try {
    taxonomy = await fetchThsTaxonomy(signal);
    taxonomySource = taxonomy.source;
  } catch (error) {
    if (signal?.aborted) throw error;
  }
  const rawRows: Array<{ row: EastmoneyRow; board: string }> = [];
  let latestTimestamp: number | null = null;
  for (const board of ETF_BOARD_FILTERS) {
    const first = await fetchPage(1, board, signal);
    const pageCount = Math.ceil(first.total / PAGE_SIZE);
    for (const row of first.rows) rawRows.push({ row, board });
    for (let page = 2; page <= pageCount; page += 1) {
      for (const row of (await fetchPage(page, board, signal)).rows) rawRows.push({ row, board });
    }
  }

  const uniqueRows = new Map<string, MarketEtfRow>();
  for (const item of rawRows) {
    const row = toMarketRow(item.row, item.board, taxonomy);
    if (row) uniqueRows.set(row.code, row);
  }
  const initialRows = Array.from(uniqueRows.values());
  const initialSummaries = new Map<string, { count: number; amountYi: number }>();
  for (const row of initialRows) {
    const summary = initialSummaries.get(row.group) ?? { count: 0, amountYi: 0 };
    summary.count += 1;
    summary.amountYi += row.amountYi ?? 0;
    initialSummaries.set(row.group, summary);
  }
  const protectedGroups = new Set(["货币 ETF", "跨境 / 海外", "商品 ETF", "其他（同花顺未映射）"]);
  const rows = initialRows.map((row) => {
    const summary = initialSummaries.get(row.group);
    const isSmallIndustryGroup = summary && !protectedGroups.has(row.group) && !isBroadIndexGroup(row.group) && summary.count < 3 && summary.amountYi < 5;
    return isSmallIndustryGroup ? { ...row, group: "其他（同花顺小类合计）" } : row;
  });
  const validAmount = rows.filter((row) => row.amountYi !== null);
  const updatedRows = rows.filter((row) => row.quoteTimestamp !== null);
  latestTimestamp = updatedRows.reduce<number | null>((latest, row) => Math.max(latest ?? 0, row.quoteTimestamp ?? 0), null);
  const groups = Array.from(new Set(rows.map((row) => row.group))).map((name) => {
    const subset = rows.filter((row) => row.group === name);
    const changes = subset.map((row) => row.changePct).filter((value): value is number => value !== null);
    return {
      name,
      count: subset.length,
      latestAmountYi: subset.reduce((sum, row) => sum + (row.amountYi ?? 0), 0),
      latestScaleYi: subset.reduce((sum, row) => sum + (row.scaleYi ?? 0), 0),
      scaleChangeYi: subset.reduce((sum, row) => sum + (row.scaleChangeYi ?? 0), 0),
      avgChangePct: changes.length ? changes.reduce((sum, value) => sum + value, 0) / changes.length : 0,
      gainers: changes.filter((value) => value > 0).length,
      losers: changes.filter((value) => value < 0).length,
    };
  }).sort((a, b) => b.latestAmountYi - a.latestAmountYi);

  return {
    meta: {
      generatedAt: formatGeneratedAt(latestTimestamp),
      latestMarketDate: formatDate(latestTimestamp),
      etfCount: rows.length,
      groupCount: groups.length,
      amountYi: validAmount.reduce((sum, row) => sum + (row.amountYi ?? 0), 0),
      gainers: rows.filter((row) => (row.changePct ?? 0) > 0).length,
      losers: rows.filter((row) => (row.changePct ?? 0) < 0).length,
      source: `东方财富公开行情 + ${taxonomySource}；小规模同花顺小类合并至其他（同花顺小类合计）`,
    },
    groups,
    rows: rows.sort((a, b) => (b.amountYi ?? 0) - (a.amountYi ?? 0)),
  };
}

export interface ActiveFundSourceRecord {
  id: string;
  quarter: string;
  provider: string;
  url: string;
  reachable: boolean;
  title: string;
  publishedAt: string;
  extractedRows?: ActiveFundSectorRow[];
  error?: string;
}

export interface ActiveFundSnapshot {
  rows: ActiveFundSectorRow[];
  meta: {
    latestQuarter: string;
    source: string;
    updatedAt: string;
    mode: string;
    extractedRows: number;
    note: string;
  };
  sources: ActiveFundSourceRecord[];
}

export async function fetchActiveFundSnapshot(signal?: AbortSignal): Promise<ActiveFundSnapshot> {
  const response = await fetch(ACTIVE_FUND_API, { signal });
  if (!response.ok) throw new Error(`主动偏股基金公开来源刷新失败（HTTP ${response.status}）`);
  const payload = await response.json() as { data?: ActiveFundSnapshot };
  if (!payload.data) throw new Error("主动偏股基金公开来源返回为空");
  return payload.data;
}
