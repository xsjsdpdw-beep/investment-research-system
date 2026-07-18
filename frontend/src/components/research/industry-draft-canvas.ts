import type {
  HBMDraftDashboardData,
  IndustryDraftCanvasCard,
  IndustryDraftCanvasSchema,
  IndustryDraftCanvasTab,
  OverviewWorkbench,
} from "@/lib/api";

export function adaptLegacyHBMDashboardToCanvas(data: HBMDraftDashboardData): IndustryDraftCanvasSchema {
  return {
    kind: "industry_draft_canvas",
    version: "v1",
    scope: "HBM",
    tabs: (data.tabs || []).map((tab, index) => {
      const cards: IndustryDraftCanvasCard[] = [
        {
          id: `${tab.key || `tab-${index}`}-hero`,
          type: "summary_hero",
          title: tab.title || "",
          layout: "hero",
          content: {
            headline: tab.headline || "",
            bullets: tab.summary || [],
            tags: (tab.metrics || []).map((metric) => metric.value).filter(Boolean),
          },
          sources: tab.sources || [],
        },
      ];

      if (tab.metrics?.length) {
        cards.push({
          id: `${tab.key}-metrics`,
          type: "metric_grid",
          title: "关键指标",
          layout: "grid",
          content: {
            items: tab.metrics.map((metric) => ({
              label: metric.label,
              value: metric.value,
              note: metric.tone || "",
            })),
          },
        });
      }

      if (tab.generation_steps?.length) {
        cards.push({
          id: `${tab.key}-timeline`,
          type: "timeline",
          title: "技术代际",
          layout: "timeline",
          content: { steps: tab.generation_steps },
        });
      }

      if (tab.cost_stack?.length) {
        cards.push({
          id: `${tab.key}-band`,
          type: "range_band",
          title: "成本与卡口",
          layout: "band",
          content: {
            current_label: "核心约束",
            current_value: tab.metrics?.[0]?.value || "",
            segments: tab.cost_stack,
          },
        });
      }

      if (tab.leader_cards?.length) {
        cards.push({
          id: `${tab.key}-comparison`,
          type: "comparison_cards",
          title: "龙头对比",
          layout: "comparison",
          content: { items: tab.leader_cards },
        });
      }

      return {
        id: `tab-${tab.key || index}`,
        title: tab.title || "未命名栏目",
        cards,
      };
    }),
    meta: {
      generated_at: data.generated_at || "",
      source_mode: "auto",
    },
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

export function createEmptyCanvasTab(): IndustryDraftCanvasTab {
  return {
    id: uniqueId("tab"),
    title: "未命名栏目",
    cards: [],
  };
}

export function createCanvasCard(type: IndustryDraftCanvasCard["type"]): IndustryDraftCanvasCard {
  if (type === "metric_grid") {
    return {
      id: uniqueId("card"),
      type,
      title: "关键指标",
      layout: "grid",
      content: {
        items: [{ label: "指标", value: "—", note: "" }],
      },
    };
  }
  if (type === "range_band") {
    return {
      id: uniqueId("card"),
      type,
      title: "区间带",
      layout: "band",
      content: {
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
      layout: "comparison",
      content: {
        items: [{ name: "对象", headline: "", detail: "", tag: "" }],
      },
    };
  }
  if (type === "timeline") {
    return {
      id: uniqueId("card"),
      type,
      title: "时间线",
      layout: "timeline",
      content: {
        steps: [{ label: "阶段", caption: "", active: false }],
      },
    };
  }
  return {
    id: uniqueId("card"),
    type: "summary_hero",
    title: "速览卡",
    layout: "hero",
    content: {
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
