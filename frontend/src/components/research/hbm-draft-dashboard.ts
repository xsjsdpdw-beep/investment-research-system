import type { HBMDraftDashboardData, HBMDraftTab, IndustryDraftBlock, IndustryDraftCanvasSchema, OverviewWorkbench } from "@/lib/api";
import { adaptLegacyHBMDashboardToCanvas } from "./industry-draft-canvas.ts";

type LegacyHbmSection = Record<string, unknown>;
type LegacyHbmTab = Partial<HBMDraftTab> & { label?: string; sections?: LegacyHbmSection[] };
type LegacyHbmDashboardData = Omit<HBMDraftDashboardData, "tabs"> & { tabs?: LegacyHbmTab[] };

function mapLegacySectionToBlock(section: LegacyHbmSection, blockIndex: number): IndustryDraftBlock {
  const typeMap: Record<string, IndustryDraftBlock["type"]> = {
    hero: "summary_hero",
    summary_hero: "summary_hero",
    metric_grid: "metric_grid",
    range_band: "range_band",
    comparison_cards: "comparison_cards",
    timeline: "timeline",
    flow_map: "flow_map",
    industry_chain: "industry_chain",
    comparison_table: "comparison_table",
    chart_spec: "chart_spec",
    evidence_table: "evidence_table",
  };
  const type = typeMap[String(section.type || "")] || "summary_hero";
  const rawSpec = section.spec && typeof section.spec === "object" && !Array.isArray(section.spec)
    ? section.spec as Record<string, unknown>
    : {};
  return {
    id: String(section.id || `block-${blockIndex + 1}`),
    type,
    title: String(section.title || ""),
    spec: {
      ...rawSpec,
      ...(type === "summary_hero" ? {
        headline: rawSpec.headline || section.headline || section.title || "",
        bullets: rawSpec.bullets || section.bullets || section.summary || [],
      } : {}),
    },
    sources: Array.isArray(section.sources) ? section.sources.map(String) : [],
  };
}

export function mapLegacyHbmDashboardToCanvas(data: LegacyHbmDashboardData): IndustryDraftCanvasSchema {
  if (!(data.tabs || []).some((tab) => tab.sections?.length)) {
    return adaptLegacyHBMDashboardToCanvas(data as HBMDraftDashboardData);
  }
  return {
    kind: "industry_draft_canvas",
    version: "v2",
    scope: "HBM",
    tabs: (data.tabs || []).map((tab, tabIndex) => {
      const sections = tab.sections || [];
      const blocks: IndustryDraftBlock[] = sections.map(mapLegacySectionToBlock);

      return { id: `tab-${tab.key || tabIndex + 1}`, title: tab.title || tab.label || "未命名栏目", blocks };
    }),
    meta: { generated_at: data.generated_at || "", source_mode: "auto" },
  };
}

export const HBM_DRAFT_TAB_ORDER: HBMDraftTab["key"][] = [
  "overview",
  "generation",
  "cost_bottleneck",
  "leaders",
  "cycle_meter",
];

export function getHBMDraftActiveTab(
  data: HBMDraftDashboardData,
  activeKey?: HBMDraftTab["key"] | string | null,
): HBMDraftTab | null {
  if (!data?.tabs?.length) return null;
  const found = activeKey ? data.tabs.find((tab) => tab.key === activeKey) : null;
  return found || data.tabs[0] || null;
}

export function shouldUseHBMDraftDashboard(
  selectedSector: string,
  workbench?: Pick<OverviewWorkbench, "draft_theme_schema"> | null,
): workbench is Pick<OverviewWorkbench, "draft_theme_schema"> & { draft_theme_schema: HBMDraftDashboardData } {
  return selectedSector === "HBM" && workbench?.draft_theme_schema?.kind === "hbm_draft_dashboard";
}

export function getHBMDraftTabSummary(tab: HBMDraftTab): string[] {
  if (tab.summary?.length) return tab.summary;
  return [tab.empty_state || "资料不足"];
}

export function getHBMDraftTabTheme(key: HBMDraftTab["key"]) {
  const map = {
    overview: {
      eyebrow: "景气总览",
      accent: "from-[#ff8b2a]/28 via-[#ff6b1a]/12 to-transparent",
      border: "border-[#ff8b2a]/30",
      glow: "shadow-[0_18px_50px_rgba(249,115,22,0.18)]",
    },
    generation: {
      eyebrow: "代际升级",
      accent: "from-[#38bdf8]/28 via-[#0ea5e9]/12 to-transparent",
      border: "border-[#38bdf8]/28",
      glow: "shadow-[0_18px_50px_rgba(56,189,248,0.16)]",
    },
    cost_bottleneck: {
      eyebrow: "成本卡口",
      accent: "from-[#f97316]/18 via-[#facc15]/10 to-transparent",
      border: "border-[#f97316]/24",
      glow: "shadow-[0_18px_50px_rgba(249,115,22,0.14)]",
    },
    leaders: {
      eyebrow: "龙头卡位",
      accent: "from-[#34d399]/20 via-[#10b981]/10 to-transparent",
      border: "border-[#34d399]/24",
      glow: "shadow-[0_18px_50px_rgba(52,211,153,0.14)]",
    },
    cycle_meter: {
      eyebrow: "温度计",
      accent: "from-[#fb7185]/20 via-[#f97316]/10 to-transparent",
      border: "border-[#fb7185]/24",
      glow: "shadow-[0_18px_50px_rgba(251,113,133,0.14)]",
    },
  } as const;
  return map[key];
}

export function getHBMDraftMetricRail(metrics: Array<{ label: string; value: string }>) {
  const widths = ["100%", "78%", "56%", "42%"];
  return metrics.map((metric, index) => ({
    ...metric,
    width: widths[index] || "36%",
  }));
}

export function getHBMGenerationLadder(tab: HBMDraftTab) {
  if (tab.generation_steps?.length) {
    return tab.generation_steps;
  }
  const text = [
    tab.headline || "",
    ...(tab.summary || []),
    ...(tab.panels || []).flatMap((panel) => panel.items || []),
  ].join(" ").toLowerCase();
  const activeMap = {
    HBM2E: text.includes("hbm2e"),
    HBM3: text.includes("hbm3") && !text.includes("hbm3e"),
    HBM3E: text.includes("hbm3e"),
    Next: text.includes("16hi") || text.includes("更高带宽") || text.includes("下一代"),
  };
  return [
    { label: "HBM2E", caption: "成熟导入", active: activeMap.HBM2E },
    { label: "HBM3", caption: "向高带宽过渡", active: activeMap.HBM3 || activeMap.HBM3E },
    { label: "HBM3E", caption: "当前主升级代际", active: activeMap.HBM3E },
    { label: "Next", caption: "16hi / 更高带宽", active: activeMap.Next },
  ];
}

export function getHBMCycleMeterModel(tab: HBMDraftTab) {
  const text = [
    tab.headline || "",
    ...(tab.summary || []),
    ...(tab.metrics || []).map((metric) => `${metric.label} ${metric.value}`),
  ].join(" ").toLowerCase();
  const activeIndex = text.includes("高") || text.includes("热") ? 2 : text.includes("中") || text.includes("warm") ? 1 : 0;
  const stops = [
    { label: "Cool", tone: "cool" },
    { label: "Warm", tone: "warm" },
    { label: "Hot", tone: "hot" },
  ];
  return {
    activeIndex,
    activeLabel: stops[activeIndex].label,
    stops,
  };
}

export function getHBMCostStackBars(
  costStack: Array<{ label: string; weight: number; note?: string }>,
) {
  const maxWeight = Math.max(...costStack.map((item) => item.weight), 1);
  return costStack.map((item) => ({
    ...item,
    width: `${Math.max(24, Math.round((item.weight / maxWeight) * 100))}%`,
  }));
}

export function getHBMOverviewChain(tab: HBMDraftTab) {
  if (tab.chain_nodes?.length) {
    return tab.chain_nodes;
  }
  return [
    { label: "AI GPU", tag: "需求源头", emphasis: "算力拉动" },
    { label: "先进封装", tag: "制造卡位", emphasis: "封装升级" },
    { label: "HBM", tag: "核心器件", emphasis: "带宽瓶颈" },
    { label: "服务器", tag: "终端承接", emphasis: "整机兑现" },
  ];
}

export function getHBMLeaderMatrix(tab: HBMDraftTab) {
  if (tab.leader_cards?.length) {
    return tab.leader_cards;
  }
  const text = [
    tab.headline || "",
    ...(tab.summary || []),
    ...(tab.panels || []).flatMap((panel) => panel.items || []),
  ].join(" ");
  return [
    { name: "海力士", role: "存储龙头", edge: text.includes("海力士") ? "HBM3E 领先" : "HBM 份额领先", segment: "原厂", mapping: "存储颗粒" },
    { name: "三星", role: "综合巨头", edge: text.includes("三星") ? "产能与客户覆盖" : "产能与验证推进", segment: "原厂", mapping: "高端客户验证" },
    { name: "美光", role: "追赶者", edge: text.includes("美光") ? "追赶高端份额" : "高端份额追赶", segment: "原厂", mapping: "高端份额追赶" },
  ];
}
