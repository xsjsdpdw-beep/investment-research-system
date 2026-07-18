import type { HBMDraftDashboardData, HBMDraftTab, OverviewWorkbench } from "@/lib/api";

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
