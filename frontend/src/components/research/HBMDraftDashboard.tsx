import type { HBMDraftDashboardData } from "@/lib/api";

import { IndustryDraftCanvas } from "./IndustryDraftCanvas";
import { adaptLegacyHBMDashboardToCanvas } from "./industry-draft-canvas";

export function HBMDraftDashboard({
  data,
}: {
  data: HBMDraftDashboardData;
}) {
  return <IndustryDraftCanvas data={adaptLegacyHBMDashboardToCanvas(data)} />;
}
