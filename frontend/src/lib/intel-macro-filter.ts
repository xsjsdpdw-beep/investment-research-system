import type { Industry, RadarItem, SourceTier } from "@/lib/api";

// Desk-only filter: keep the selection formula deterministic and inspectable.
// The current runtime does not call an LLM or an embedding service; the
// token/actor cluster below is an explicit fallback until a local vector index
// is introduced. Raw items remain available through the “全部” view.

export type MacroFeedMode = "focused" | "all";
export type InvestmentSignalLevel = "critical" | "important" | "relevant";

export type MacroScoreBreakdown = {
  impact: number;
  relevance: number;
  evidence: number;
  novelty: number;
  actionability: number;
};

export interface ScoredMacroItem extends RadarItem {
  investmentScore: number;
  signalLevel: InvestmentSignalLevel;
  scoreReasons: string[];
  clusterId: string;
  clusterSize: number;
  sourceCount: number;
  scoreBreakdown: MacroScoreBreakdown;
  relatedItems: RadarItem[];
  clusterMethod: "semantic-fallback";
}

type SignalRule = {
  key: string;
  label: string;
  impact: number;
  pattern: RegExp;
};

type Candidate = {
  item: RadarItem;
  group: Industry;
  index: number;
  baseScore: number;
  axes: SignalRule[];
  actors: string[];
  reasons: string[];
  scoreBreakdown: MacroScoreBreakdown;
  hardNoise: boolean;
  highImpactEvidence: boolean;
};

const SIGNAL_RULES: SignalRule[] = [
  { key: "monetary", label: "货币政策", impact: 34, pattern: /央行|美联储|联储|FOMC|降息|加息|货币政策|Federal Reserve|\bFed\b|central bank|rate cut|rate hike|monetary policy/i },
  { key: "rates", label: "利率与债券", impact: 31, pattern: /利率|国债|债券收益率|流动性|interest rates?|treasur(?:y|ies)|bond yields?|liquidity/i },
  { key: "inflation", label: "通胀数据", impact: 32, pattern: /通胀|CPI|PPI|物价|inflation|consumer prices?|producer prices?/i },
  { key: "labor", label: "就业数据", impact: 30, pattern: /非农|就业|失业率|初请|payroll|employment|unemployment|jobless claims?/i },
  { key: "growth", label: "经济增长", impact: 29, pattern: /GDP|PMI|经济增长|经济衰退|经济数据|国家统计局|增长模型|\bGDP\b|\bPMI\b|economic growth|growth model|recession|economic data/i },
  { key: "fiscal", label: "财政政策", impact: 28, pattern: /财政|预算|政府支出|赤字|债务上限|fiscal|budget|government spending|debt ceiling/i },
  { key: "trade", label: "贸易政策", impact: 27, pattern: /关税|贸易战|出口管制|进口限制|tariffs?|trade war|export controls?|import restrictions?/i },
  { key: "fx", label: "汇率", impact: 24, pattern: /汇率|人民币|美元指数|外汇|currency|\byuan\b|dollar index|foreign exchange/i },
  { key: "energy", label: "能源价格", impact: 24, pattern: /原油|油价|天然气|OPEC|crude|\boil\b|natural gas|\bOPEC\b/i },
  { key: "metals", label: "贵金属", impact: 18, pattern: /黄金|金价|白银|gold|silver/i },
  { key: "sanctions", label: "制裁与冲突", impact: 25, pattern: /制裁|冲突|停火|战争|军事打击|sanctions?|conflict|hostilities|ceasefire|war\b|military strike/i },
];

const INTRADAY_NOISE = [
  /快速(?:上涨|下跌|反弹|跳水)/i,
  /盘中(?:涨幅|跌幅|异动)/i,
  /打开(?:涨停|跌停)/i,
  /触及(?:涨停|跌停)/i,
  /(?:涨停|跌停)快照/i,
  /5分钟内/i,
  /分盘口异动快照/i,
  /换手率/i,
  /现报.{0,18}成交/i,
];

const BROAD_MARKET_MOVE = /(?:创业板|沪指|深成指|恒生指数|恒科指|日经|韩股|A股|港股|全球市场).*(?:涨|跌|熔断)/i;
const LOW_VALUE_CONTENT = /我该怎么办|是否应该买|值得买入|stock (?:a )?buy|what should i do|portfolio|snacking|mind sharp|网红|influencer|便民快巴|开通|预售|新车型/i;
const COMPANY_SPECIFIC = /财报|业绩|营收|每股收益|回购|减持|收购|融资|估值|新车型|成立新公司|\bEPS\b|revenue|earnings|valuation|acquire|acquisition|buyback/i;
const EVIDENCE_MARKER = /\d+(?:\.\d+)?(?:%|万|亿|人|家|点|美元)|同比|环比|基点|万亿|亿美元|公布|决议|报告|指数|\bbps\b|decision|report|index/i;
const SURPRISE_MARKER = /超预期|低于预期|意外|创纪录|新高|新低|突破|骤降|飙升|unexpected|surprise|record|plunge|soar|breakthrough/i;
const MACRO_MARKET_MOVE = /上涨|下跌|升至|降至|走高|走低|gains?|losses|rises?|falls?|higher|lower/i;
const EVENT_SIGNATURES = [
  /决议|公布|decision|rate (?:cut|hike)/i,
  /CPI|PPI|通胀|inflation|consumer prices?|producer prices?/i,
  /PMI|GDP|增长模型|economic growth|recession/i,
  /非农|就业|payroll|employment|unemployment/i,
  /关税|贸易战|tariffs?|trade war/i,
  /制裁|冲突|停火|战争|sanctions?|conflict|hostilities|ceasefire|war\b/i,
  /财报|业绩|earnings|revenue|EPS/i,
];

const OFFICIAL_SOURCES = new Set([
  "Federal Reserve",
  "国家统计局",
  "中国人民银行",
  "美国劳工统计局",
  "U.S. Bureau of Labor Statistics",
  "SEC",
]);

const TIER_ONE_SOURCES = new Set([
  "Reuters",
  "Bloomberg",
  "Financial Times",
  "The Wall Street Journal",
  "WSJ Markets",
  "CNBC",
  "MarketWatch",
  "华尔街见闻",
]);

const SOURCE_DEFAULT_AXIS: Record<string, string> = {
  "Federal Reserve": "monetary",
  "中国人民银行": "monetary",
  "国家统计局": "growth",
  "美国劳工统计局": "labor",
  "U.S. Bureau of Labor Statistics": "labor",
};

const ACTOR_RULES: Array<[string, RegExp]> = [
  ["fed", /美联储|联储|FOMC|Federal Reserve|\bFed\b/i],
  ["china", /中国|国内|人民币|国家统计局|China|\byuan\b/i],
  ["us", /美国|美债|美元|U\.S\.|United States|Treasur(?:y|ies)/i],
  ["eu", /欧盟|欧洲|欧元区|\bEU\b|Europe|eurozone/i],
  ["iran", /伊朗|Iran/i],
  ["russia", /俄罗斯|俄气|Russia|Russian/i],
  ["japan", /日本|日央行|Japan|BOJ/i],
  ["opec", /OPEC|欧佩克/i],
];

function displayTitle(item: RadarItem) {
  return String(item.zh || item.title || "").trim();
}

function normalizedTitle(item: RadarItem) {
  return displayTitle(item)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[，。！？、；：,.!?;:'"“”‘’（）()[\]【】\-—_]/g, "");
}

function titleTokens(item: RadarItem) {
  const title = displayTitle(item).toLowerCase();
  const latin = title.match(/[a-z][a-z0-9-]{2,}/g) ?? [];
  const chinese = (title.match(/[\u4e00-\u9fff]{2,}/g) ?? [])
    .flatMap((chunk) => Array.from({ length: Math.max(0, chunk.length - 1) }, (_, index) => chunk.slice(index, index + 2)));
  return new Set([...latin, ...chinese]);
}

function tokenSimilarity(left: RadarItem, right: RadarItem) {
  const leftTokens = titleTokens(left);
  const rightTokens = titleTokens(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let intersection = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) intersection += 1;
  });
  return intersection / Math.min(leftTokens.size, rightTokens.size);
}

function sharedEventSignature(left: RadarItem, right: RadarItem) {
  const leftTitle = displayTitle(left);
  const rightTitle = displayTitle(right);
  return EVENT_SIGNATURES.some((signature) => signature.test(leftTitle) && signature.test(rightTitle));
}

function sourceScore(source: string, tier?: SourceTier) {
  if (tier === "T1" || OFFICIAL_SOURCES.has(source)) return { score: 28, reason: "T1 官方一手来源" };
  if (tier === "T1.5" || TIER_ONE_SOURCES.has(source)) return { score: 18, reason: "T1.5 高可信财经来源" };
  return { score: 10, reason: "一般公开来源" };
}

function scoreCandidate(item: RadarItem, group: Industry, index: number): Candidate {
  const title = displayTitle(item);
  const fullText = `${title} ${item.summary || ""}`;
  const axes = SIGNAL_RULES.filter((rule) => rule.pattern.test(title));
  const defaultAxis = SOURCE_DEFAULT_AXIS[item.source];
  if (axes.length === 0 && defaultAxis) {
    const sourceAxis = SIGNAL_RULES.find((rule) => rule.key === defaultAxis);
    if (sourceAxis) axes.push(sourceAxis);
  }
  const actors = ACTOR_RULES.filter(([, pattern]) => pattern.test(title)).map(([key]) => key);
  const hardNoise = item.source === "东方财富股票"
    || INTRADAY_NOISE.some((pattern) => pattern.test(fullText))
    || LOW_VALUE_CONTENT.test(title)
    || BROAD_MARKET_MOVE.test(title)
    || axes.length === 0;

  if (hardNoise) {
    return {
      item,
      group,
      index,
      baseScore: 0,
      axes,
      actors,
      reasons: ["未通过投资相关性门槛"],
      scoreBreakdown: { impact: 0, relevance: 0, evidence: 0, novelty: 0, actionability: 0 },
      hardNoise: true,
      highImpactEvidence: false,
    };
  }

  const source = sourceScore(item.source, item.tier);
  const primaryImpact = axes.reduce((maximum, rule) => Math.max(maximum, rule.impact), 0);
  const reasons = [source.reason];
  if (axes.length > 0) reasons.push(axes.slice(0, 2).map((rule) => rule.label).join("、"));

  const hasEvidence = EVIDENCE_MARKER.test(fullText);
  const hasSurprise = SURPRISE_MARKER.test(title);
  const hasMarketMove = axes.some((axis) => ["rates", "fx", "energy", "metals"].includes(axis.key))
    && MACRO_MARKET_MOVE.test(title);
  const hasStrongMacroAxis = axes.some((axis) => ["monetary", "rates", "inflation", "labor", "growth", "fiscal", "trade", "fx"].includes(axis.key));
  const hasAction = /公布|决议|报告|制裁|谈判|停火|上调|下调|发布|生效|decision|report|sanction|talks?|ceasefire|effective/i.test(fullText);
  const scoreBreakdown: MacroScoreBreakdown = {
    impact: Math.min(22, Math.round(primaryImpact / 34 * 22)),
    relevance: Math.min(18, (hasStrongMacroAxis ? (hasEvidence || hasAction ? 16 : 10) : 12) + (actors.length > 0 ? 2 : 0)),
    evidence: hasEvidence ? 14 : 0,
    novelty: hasSurprise ? 10 : 2,
    actionability: hasAction ? 8 : (hasMarketMove ? 9 : 0),
  };
  let score = source.score + Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0);
  if (hasEvidence) {
    reasons.push("含明确数据或政策动作");
  }
  if (hasSurprise) {
    reasons.push("存在超预期或幅度信号");
  }
  if (hasMarketMove) {
    reasons.push("关键宏观资产出现价格变化");
  }

  if (COMPANY_SPECIFIC.test(title) && !hasStrongMacroAxis) {
    score -= 24;
    reasons.push("公司层面事件降权");
  }

  return {
    item,
    group,
    index,
    baseScore: Math.max(0, Math.min(100, score)),
    axes,
    actors,
    reasons,
    scoreBreakdown,
    hardNoise: false,
    highImpactEvidence: hasEvidence
      && axes.some((axis) => ["monetary", "rates", "inflation", "labor", "growth", "fiscal", "trade"].includes(axis.key)),
  };
}

function sameEvent(left: Candidate, right: Candidate) {
  if (normalizedTitle(left.item) === normalizedTitle(right.item)) return true;
  const leftPrimary = left.axes[0]?.key;
  const rightPrimary = right.axes[0]?.key;
  if (!leftPrimary || leftPrimary !== rightPrimary) return false;

  const actorOverlap = left.actors.some((actor) => right.actors.includes(actor));
  return tokenSimilarity(left.item, right.item) >= 0.42 || (actorOverlap && sharedEventSignature(left.item, right.item));
}

function signalLevel(score: number): InvestmentSignalLevel {
  if (score >= 82) return "critical";
  if (score >= 68) return "important";
  return "relevant";
}

export function countMacroItems(groups: Industry[]) {
  return groups.reduce((sum, group) => sum + (group.items?.length ?? 0), 0);
}

export function filterDeskMacroGroups(
  groups: Industry[],
  options: { threshold?: number; totalLimit?: number } = {},
) {
  const threshold = options.threshold ?? 55;
  const totalLimit = options.totalLimit ?? 18;
  const candidates = groups
    .flatMap((group) => (group.items ?? []).map((item, index) => scoreCandidate(item, group, index)))
    .filter((candidate) => !candidate.hardNoise);

  const clusters: Candidate[][] = [];
  candidates.forEach((candidate) => {
    const cluster = clusters.find((items) => items.some((item) => sameEvent(item, candidate)));
    if (cluster) cluster.push(candidate);
    else clusters.push([candidate]);
  });

  const selected = clusters
    .map((cluster, clusterIndex) => {
      const sourceCount = new Set(cluster.map((candidate) => candidate.item.source || "未知来源")).size;
      const confirmationBoost = Math.min(16, Math.max(0, sourceCount - 1) * 8);
      const representative = [...cluster].sort((left, right) => right.baseScore - left.baseScore || left.index - right.index)[0];
      const investmentScore = Math.min(100, representative.baseScore + confirmationBoost);
      const reasons = [...representative.reasons];
      if (sourceCount > 1) reasons.push(`${sourceCount} 个独立来源交叉确认`);
      const official = representative.item.tier === "T1" || OFFICIAL_SOURCES.has(representative.item.source);
      if (representative.highImpactEvidence && sourceCount === 1 && !official) {
        reasons.push("高影响事件，单源待二次核验");
      }

      return {
        representative,
        scoredItem: {
          ...representative.item,
          investmentScore,
          signalLevel: signalLevel(investmentScore),
          scoreReasons: reasons.slice(0, 4),
          clusterId: `${representative.axes[0]?.key || "macro"}-${representative.actors.join("-") || clusterIndex}`,
          clusterSize: cluster.length,
          sourceCount,
          scoreBreakdown: representative.scoreBreakdown,
          relatedItems: cluster.filter((candidate) => candidate !== representative).map((candidate) => candidate.item),
          clusterMethod: "semantic-fallback",
        } satisfies ScoredMacroItem,
        selected: investmentScore >= threshold
          || (official && representative.axes.length > 0)
          || representative.highImpactEvidence,
      };
    })
    .filter((event) => event.selected)
    .sort((left, right) => right.scoredItem.investmentScore - left.scoredItem.investmentScore || left.representative.index - right.representative.index)
    .slice(0, totalLimit);

  return groups
    .map((group) => {
      const items = selected
        .filter((event) => event.representative.group.key === group.key)
        .map((event) => event.scoredItem);
      return { ...group, total: items.length, items };
    })
    .filter((group) => group.items.length > 0);
}
