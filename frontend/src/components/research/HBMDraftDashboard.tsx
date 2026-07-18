import type { HBMDraftDashboardData } from "@/lib/api";

import { IndustryDraftCanvas } from "./IndustryDraftCanvas";

export function HBMDraftDashboard({
  data,
  scopeType = "sector",
  scopeId = "HBM",
}: {
  data: HBMDraftDashboardData;
  scopeType?: "sector" | "stock";
  scopeId?: string;
}) {
  return <IndustryDraftCanvas data={data} scopeType={scopeType} scopeId={scopeId} />;
}
