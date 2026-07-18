import type { HBMDraftDashboardData } from "@/lib/api";

import { IndustryDraftCanvas } from "./IndustryDraftCanvas";
import { mapLegacyHbmDashboardToCanvas } from "./hbm-draft-dashboard";

export function HBMDraftDashboard({
  data,
  scopeType = "sector",
  scopeId = "HBM",
}: {
  data: HBMDraftDashboardData;
  scopeType?: "sector" | "stock";
  scopeId?: string;
}) {
  return <IndustryDraftCanvas data={mapLegacyHbmDashboardToCanvas(data)} scopeType={scopeType} scopeId={scopeId} />;
}
