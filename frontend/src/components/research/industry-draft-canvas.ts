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

export function shouldUseIndustryDraftCanvas(
  selectedSector: string,
  workbench?: Pick<OverviewWorkbench, "draft_theme_schema"> | null,
): workbench is Pick<OverviewWorkbench, "draft_theme_schema"> & { draft_theme_schema: IndustryDraftCanvasSchema } {
  return selectedSector === "HBM" && workbench?.draft_theme_schema?.kind === "industry_draft_canvas";
}
