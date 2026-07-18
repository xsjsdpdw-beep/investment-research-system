import type { HBMDraftDashboardData } from "@/lib/api";

import { IndustryDraftCanvas } from "./IndustryDraftCanvas";
import { adaptLegacyHBMDashboardToCanvas } from "./industry-draft-canvas";

export function HBMDraftDashboard({
  data,
  scopeType = "sector",
  scopeId = "HBM",
}: {
  data: HBMDraftDashboardData;
  scopeType?: "sector" | "stock";
  scopeId?: string;
}) {
  return <IndustryDraftCanvas data={adaptLegacyHBMDashboardToCanvas(data)} scopeType={scopeType} scopeId={scopeId} />;
}
