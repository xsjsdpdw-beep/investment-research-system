import { useMemo, useState } from "react";

import type { IndustryDraftCanvasSchema } from "@/lib/api";
import { cn } from "@/lib/utils";

import { IndustryDraftCardRenderer } from "./IndustryDraftCardRenderer";
import { getIndustryDraftActiveTab } from "./industry-draft-canvas";

export function IndustryDraftCanvas({
  data,
  initialActiveTabId,
}: {
  data: IndustryDraftCanvasSchema;
  initialActiveTabId?: string;
}) {
  const [activeTabId, setActiveTabId] = useState(initialActiveTabId || data.tabs[0]?.id || "");
  const activeTab = useMemo(() => getIndustryDraftActiveTab(data, activeTabId), [activeTabId, data]);

  if (!activeTab) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-[28px] border border-[#ff8b2a]/18 bg-[linear-gradient(180deg,#08111f,#020617)] p-4 text-slate-100 shadow-[0_18px_50px_rgba(249,115,22,0.12)]">
      <div className="flex flex-wrap gap-2">
        {data.tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === activeTab.id}
            onClick={() => setActiveTabId(tab.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm transition",
              tab.id === activeTab.id
                ? "border-[#ff8b2a]/60 bg-[#ff8b2a]/18 text-[#ffd3aa]"
                : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]",
            )}
          >
            {tab.title}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="mt-4 space-y-4">
        {activeTab.cards.map((card) => (
          <IndustryDraftCardRenderer key={card.id} card={card} />
        ))}
      </div>
    </section>
  );
}
