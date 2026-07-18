import type {
  HBMDraftDashboardData,
  IndustryDraftBlock,
  IndustryDraftCanvasSchema,
  IndustryDraftCanvasTab,
  OverviewWorkbench,
} from "@/lib/api";

type LegacyIndustryDraftCanvasSchema = Omit<IndustryDraftCanvasSchema, "tabs"> & {
  tabs?: Array<{
    id?: string;
    title?: string;
    blocks?: IndustryDraftBlock[];
    cards?: Array<Record<string, unknown>>;
  }>;
};

export type IndustryDraftCanvasInput = IndustryDraftCanvasSchema | LegacyIndustryDraftCanvasSchema | HBMDraftDashboardData;

const INDUSTRY_DRAFT_BLOCK_TYPES = new Set<IndustryDraftBlock["type"]>([
  "summary_hero",
  "metric_grid",
  "range_band",
  "comparison_cards",
  "timeline",
  "flow_map",
  "industry_chain",
  "comparison_table",
  "chart_spec",
  "evidence_table",
]);
const INDUSTRY_DRAFT_CHART_TYPES = new Set(["bar", "stacked_bar", "line", "area"]);

function readLegacyField(item: Record<string, unknown> | IndustryDraftBlock, key: string) {
  if (key in item) {
    return item[key as keyof typeof item];
  }
  return undefined;
}

function normalizeIndustryDraftBlock(item: Record<string, unknown> | IndustryDraftBlock, blockIndex: number): IndustryDraftBlock {
  const rawType = String(readLegacyField(item, "type") || "summary_hero");
  const type = INDUSTRY_DRAFT_BLOCK_TYPES.has(rawType as IndustryDraftBlock["type"])
    ? rawType as IndustryDraftBlock["type"]
    : "summary_hero";
  const rawSpec = readLegacyField(item, "spec") || readLegacyField(item, "content") || {};
  const spec = rawSpec && typeof rawSpec === "object" && !Array.isArray(rawSpec)
    ? { ...rawSpec as Record<string, unknown> }
    : {};
  if (type === "chart_spec") {
    const rawChartType = String(spec.chart_type || spec.type || "bar");
    const chartType = INDUSTRY_DRAFT_CHART_TYPES.has(rawChartType) ? rawChartType : "bar";
    spec.chart_type = chartType;
    if ("type" in spec) spec.type = chartType;
  }
  return {
    id: String(readLegacyField(item, "id") || `block-${blockIndex + 1}`),
    type,
    title: String(readLegacyField(item, "title") || ""),
    subtitle: String(readLegacyField(item, "subtitle") || ""),
    spec,
    sources: Array.isArray(readLegacyField(item, "sources")) ? (readLegacyField(item, "sources") as string[]) : [],
    footnote: String(readLegacyField(item, "footnote") || ""),
    style_variant: String(readLegacyField(item, "style_variant") || "dark-report"),
  };
}

export function migrateCanvasCardsToBlocks(
  schema: LegacyIndustryDraftCanvasSchema | IndustryDraftCanvasSchema | null | undefined,
): IndustryDraftCanvasSchema | null {
  if (!schema || schema.kind !== "industry_draft_canvas") return null;
  return {
    ...schema,
    version: schema.version || "v2",
    tabs: (schema.tabs || []).map((tab, tabIndex) => ({
      id: tab.id || `tab-${tabIndex + 1}`,
      title: tab.title || "未命名栏目",
      blocks: (tab.blocks || tab.cards || []).map(normalizeIndustryDraftBlock),
    })),
  } as IndustryDraftCanvasSchema;
}

export function normalizeIndustryDraftCanvasInput(data: IndustryDraftCanvasInput): IndustryDraftCanvasSchema {
  const canvas = data.kind === "hbm_draft_dashboard" ? adaptLegacyHBMDashboardToCanvas(data) : data;
  const normalized = migrateCanvasCardsToBlocks(canvas);
  if (normalized) return normalized;
  return {
    kind: "industry_draft_canvas",
    version: "v2",
    scope: "",
    tabs: [],
  };
}

export function adaptLegacyHBMDashboardToCanvas(data: HBMDraftDashboardData): IndustryDraftCanvasSchema {
  return {
    kind: "industry_draft_canvas",
    version: "v2",
    scope: "HBM",
    tabs: (data.tabs || []).map((tab, index) => {
      const blocks: IndustryDraftBlock[] = [
        {
          id: `${tab.key || `tab-${index}`}-hero`,
          type: "summary_hero",
          title: tab.title || "",
          spec: {
            headline: tab.headline || "",
            bullets: tab.summary || [],
            tags: (tab.metrics || []).map((metric) => metric.value).filter(Boolean),
          },
          sources: tab.sources || [],
        },
      ];

      if (tab.metrics?.length) blocks.push({ id: `${tab.key}-metrics`, type: "metric_grid", title: "关键指标", spec: { items: tab.metrics.map((metric) => ({ label: metric.label, value: metric.value, note: metric.tone || "" })) } });
      if (tab.generation_steps?.length) blocks.push({ id: `${tab.key}-timeline`, type: "timeline", title: "技术代际", spec: { steps: tab.generation_steps } });
      if (tab.cost_stack?.length) blocks.push({ id: `${tab.key}-band`, type: "range_band", title: "成本与卡口", spec: { current_label: "核心约束", current_value: tab.metrics?.[0]?.value || "", segments: tab.cost_stack } });
      if (tab.chain_nodes?.length) blocks.push({ id: `${tab.key}-chain`, type: "industry_chain", title: "产业链", spec: { nodes: tab.chain_nodes } });
      if (tab.leader_cards?.length) blocks.push({ id: `${tab.key}-comparison`, type: "comparison_cards", title: "龙头对比", spec: { items: tab.leader_cards } });
      if (tab.panels?.length) blocks.push({ id: `${tab.key}-evidence`, type: "evidence_table", title: "补充信息", spec: { items: tab.panels } });

      return { id: `tab-${tab.key || index}`, title: tab.title || "未命名栏目", blocks };
    }),
    meta: { generated_at: data.generated_at || "", source_mode: "auto" },
  };
}

export function getIndustryDraftActiveTab(
  data: IndustryDraftCanvasSchema,
  activeTabId?: string | null,
): IndustryDraftCanvasTab | null {
  if (!data?.tabs?.length) return null;
  const found = activeTabId ? data.tabs.find((tab) => tab.id === activeTabId) : null;
  return found || data.tabs[0] || null;
}

function uniqueId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function createEmptyIndustryDraftBlock(id: string, type: IndustryDraftBlock["type"]): IndustryDraftBlock {
  return {
    id,
    type,
    title: "",
    subtitle: "",
    spec: {},
    sources: [],
    footnote: "",
    style_variant: "dark-report",
  };
}

export function appendIndustryDraftBlock(
  canvas: IndustryDraftCanvasSchema,
  tabId: string,
  type: IndustryDraftBlock["type"],
): IndustryDraftCanvasSchema {
  return {
    ...canvas,
    tabs: canvas.tabs.map((tab) => (
      tab.id === tabId
        ? { ...tab, blocks: [...tab.blocks, createEmptyIndustryDraftBlock(`block-${tab.blocks.length + 1}`, type)] }
        : tab
    )),
  };
}

export function updateIndustryDraftBlock(
  canvas: IndustryDraftCanvasSchema,
  tabId: string,
  blockId: string,
  patch: Partial<IndustryDraftBlock>,
): IndustryDraftCanvasSchema {
  return {
    ...canvas,
    tabs: canvas.tabs.map((tab) => (
      tab.id === tabId
        ? { ...tab, blocks: tab.blocks.map((block) => (block.id === blockId ? { ...block, ...patch } : block)) }
        : tab
    )),
  };
}

export function removeIndustryDraftBlock(
  canvas: IndustryDraftCanvasSchema,
  tabId: string,
  blockId: string,
): IndustryDraftCanvasSchema {
  return {
    ...canvas,
    tabs: canvas.tabs.map((tab) => (
      tab.id === tabId ? { ...tab, blocks: tab.blocks.filter((block) => block.id !== blockId) } : tab
    )),
  };
}

export function createEmptyCanvasTab(): IndustryDraftCanvasTab {
  return {
    id: uniqueId("tab"),
    title: "未命名栏目",
    blocks: [],
  };
}

export function createCanvasCard(type: IndustryDraftBlock["type"]): IndustryDraftBlock {
  if (type === "metric_grid") {
    return {
      id: uniqueId("card"),
      type,
      title: "关键指标",
      spec: {
        items: [{ label: "指标", value: "—", note: "" }],
      },
    };
  }
  if (type === "range_band") {
    return {
      id: uniqueId("card"),
      type,
      title: "区间带",
      spec: {
        current_label: "当前位置",
        current_value: "—",
        segments: [{ label: "区间", weight: 50, note: "" }],
      },
    };
  }
  if (type === "comparison_cards") {
    return {
      id: uniqueId("card"),
      type,
      title: "对比卡",
      spec: {
        items: [{ name: "对象", headline: "", detail: "", tag: "" }],
      },
    };
  }
  if (type === "timeline") {
    return {
      id: uniqueId("card"),
      type,
      title: "时间线",
      spec: {
        steps: [{ label: "阶段", caption: "", active: false }],
      },
    };
  }
  return {
    id: uniqueId("card"),
    type: "summary_hero",
    title: "速览卡",
    spec: {
      headline: "",
      bullets: [""],
      tags: [],
    },
  };
}

export function moveItem<T>(items: T[], index: number, delta: number): T[] {
  const nextIndex = index + delta;
  if (index < 0 || index >= items.length || nextIndex < 0 || nextIndex >= items.length) {
    return items;
  }
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(nextIndex, 0, item);
  return next;
}

export function shouldUseIndustryDraftCanvas(
  selectedSector: string,
  workbench?: Pick<OverviewWorkbench, "draft_theme_schema"> | null,
): workbench is Pick<OverviewWorkbench, "draft_theme_schema"> & { draft_theme_schema: IndustryDraftCanvasSchema } {
  return selectedSector === "HBM" && workbench?.draft_theme_schema?.kind === "industry_draft_canvas";
}
