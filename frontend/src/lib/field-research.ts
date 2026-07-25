export interface FieldResearchModule {
  id: string;
  label: string;
  builtIn?: boolean;
}

export interface FieldResearchSegment {
  id: string;
  text: string;
  moduleId: string;
  capturedAt: string;
  source: "live" | "manual" | "audio_upload";
}

export interface FieldResearchMarkdownInput {
  date: string;
  subject: string;
  speaker: string;
  ticker: string;
  sector: string;
  segments: FieldResearchSegment[];
  modules: FieldResearchModule[];
}

export const DEFAULT_FIELD_RESEARCH_MODULES: FieldResearchModule[] = [
  { id: "management", label: "管理相关", builtIn: true },
  { id: "business", label: "业务相关", builtIn: true },
  { id: "finance", label: "财务相关", builtIn: true },
  { id: "other", label: "其他", builtIn: true },
];

const MANAGEMENT_KEYWORDS = [
  "管理层", "董事长", "总经理", "高管", "组织", "人才", "激励", "股权", "治理", "团队", "招聘", "文化",
];
const BUSINESS_KEYWORDS = [
  "业务", "订单", "客户", "产品", "产能", "出货", "收入", "销量", "市场", "渠道", "项目", "毛利", "价格", "库存", "研发",
];
const FINANCE_KEYWORDS = [
  "财务", "利润", "净利", "现金流", "应收", "应付", "回款", "费用", "成本", "资产负债", "账期", "税", "审计",
];
const SPEAKER_VIEW_CUES = [
  "我们认为", "我们判断", "预计", "目标是", "计划", "希望", "将会", "有望", "可能", "应该", "看好", "判断", "倾向于", "争取",
];

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function slugifyModule(label: string) {
  return `custom-${label.trim().toLowerCase().replace(/[^\w\u4e00-\u9fff]+/g, "-") || "module"}`;
}

export function classifyFieldResearchText(
  text: string,
  modules: FieldResearchModule[] = DEFAULT_FIELD_RESEARCH_MODULES,
): Pick<FieldResearchSegment, "moduleId"> {
  const normalized = text.trim();
  const management = modules.find((module) => module.id === "management");
  const business = modules.find((module) => module.id === "business");
  const finance = modules.find((module) => module.id === "finance");
  const other = modules.find((module) => module.id === "other") || modules[modules.length - 1];
  const customMatch = modules.find(
    (module) => !module.builtIn && module.label.length > 1 && normalized.includes(module.label),
  );

  let moduleId = customMatch?.id || other?.id || "other";
  if (management && includesAny(normalized, MANAGEMENT_KEYWORDS)) moduleId = management.id;
  else if (business && includesAny(normalized, BUSINESS_KEYWORDS)) moduleId = business.id;
  else if (finance && includesAny(normalized, FINANCE_KEYWORDS)) moduleId = finance.id;

  return { moduleId };
}

function isLikelyOpinion(text: string) {
  return includesAny(text.trim(), SPEAKER_VIEW_CUES);
}

export function createCustomFieldResearchModule(label: string): FieldResearchModule | null {
  const clean = label.trim();
  if (!clean) return null;
  return { id: slugifyModule(clean), label: clean };
}

export function buildFieldResearchMarkdown(input: FieldResearchMarkdownInput) {
  const moduleById = new Map(input.modules.map((module) => [module.id, module]));
  const lines = [
    "# 现场调研纪要",
    "",
    `- 调研日期：${input.date || "未填写"}`,
    `- 调研对象：${input.subject || "未填写"}`,
    `- 对方身份：${input.speaker || "未填写"}`,
    `- 关联行业：${input.sector || "未填写"}`,
    `- 关联股票：${input.ticker || "未填写"}`,
    "",
    "> 归类说明：观点按现场表达自动排在前面，其他内容按事实 1、事实 2、事实 3 编号。数字和经营口径仍是现场原话，需回听或用公告、财报、合同、第三方数据等复核。",
    "",
  ];

  for (const module of input.modules) {
    const moduleSegments = input.segments.filter((segment) => segment.moduleId === module.id);
    lines.push(`## ${module.label}`, "");
    const opinions = moduleSegments.filter((segment) => isLikelyOpinion(segment.text));
    const facts = moduleSegments.filter((segment) => !isLikelyOpinion(segment.text));
    lines.push("### 观点", "");
    if (!opinions.length) lines.push("- 暂未识别明显观点", "");
    opinions.forEach((segment) => lines.push(`- ${segment.text}`));
    if (opinions.length) lines.push("");
    if (!facts.length) lines.push("### 事实", "", "- 暂无", "");
    facts.forEach((segment, index) => {
      lines.push(`### 事实 ${index + 1}`, "", `- ${segment.text}`, "");
    });
  }

  lines.push("## 原始转写", "", "> 以下内容保留实时转写顺序，便于回听和复核。", "");
  if (!input.segments.length) lines.push("- 暂无", "");
  input.segments.forEach((segment) => {
    const moduleLabel = moduleById.get(segment.moduleId)?.label || "未分类";
    const sourceLabel = segment.source === "audio_upload" ? "音频转写" : segment.source === "manual" ? "粘贴转写" : "实时转写";
    lines.push(`- [${segment.capturedAt}] [${sourceLabel} · ${moduleLabel}] ${segment.text}`);
  });
  return lines.join("\n").trim();
}
