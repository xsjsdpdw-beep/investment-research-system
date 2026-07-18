import { useMemo, useState } from "react";
import type { HBMDraftDashboardData, HBMDraftTab } from "@/lib/api";
import { cn } from "@/lib/utils";
import { getHBMDraftActiveTab, getHBMDraftTabSummary } from "./hbm-draft-dashboard";

function TabMetrics({ tab }: { tab: HBMDraftTab }) {
  if (!tab.metrics.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tab.metrics.map((metric) => (
        <article
          key={`${metric.label}-${metric.value}`}
          className="rounded-2xl border border-white/10 bg-white/[0.05] p-3 shadow-[0_12px_40px_rgba(15,23,42,0.28)]"
        >
          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">{metric.label}</p>
          <p className="mt-2 text-lg font-semibold text-slate-50">{metric.value}</p>
        </article>
      ))}
    </div>
  );
}

function TabPanels({ tab }: { tab: HBMDraftTab }) {
  if (!tab.panels.length) return null;
  const columns = tab.panels.length >= 3 ? "xl:grid-cols-3" : "xl:grid-cols-2";
  return (
    <div className={cn("grid gap-4 md:grid-cols-2", columns)}>
      {tab.panels.map((panel) => (
        <section
          key={panel.title}
          className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.94),rgba(2,6,23,0.88))] p-4"
        >
          <h4 className="text-sm font-semibold text-slate-100">{panel.title}</h4>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
            {panel.items.map((item) => (
              <li key={item} className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
                {item}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function HBMDraftDashboard({
  data,
  initialActiveKey,
}: {
  data: HBMDraftDashboardData;
  initialActiveKey?: HBMDraftTab["key"];
}) {
  const defaultKey = initialActiveKey || data.tabs[0]?.key || "overview";
  const [activeKey, setActiveKey] = useState<HBMDraftTab["key"]>(defaultKey);
  const activeTab = useMemo(() => getHBMDraftActiveTab(data, activeKey), [activeKey, data]);

  if (!activeTab) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-[28px] border border-[#ff8b2a]/20 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.16),transparent_35%),linear-gradient(180deg,#08111f,#020617)] p-4 text-slate-100 shadow-[0_22px_70px_rgba(2,6,23,0.42)]">
      <div className="flex flex-wrap gap-2">
        {data.tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={tab.key === activeTab.key}
            onClick={() => setActiveKey(tab.key)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm transition",
              tab.key === activeTab.key
                ? "border-[#ff8b2a]/60 bg-[#ff8b2a]/18 text-[#ffd3aa]"
                : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]",
            )}
          >
            {tab.title}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="mt-4 space-y-4">
        <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-[#ffb169]">{activeTab.title}</p>
              {activeTab.headline ? <h3 className="mt-2 text-2xl font-semibold text-slate-50">{activeTab.headline}</h3> : null}
            </div>
            {activeTab.sources?.length ? (
              <div className="max-w-sm text-right text-xs leading-5 text-slate-400">
                来源：{activeTab.sources.join(" / ")}
              </div>
            ) : null}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {getHBMDraftTabSummary(activeTab).map((item) => (
              <div key={item} className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-sm leading-6 text-slate-200">
                {item}
              </div>
            ))}
          </div>
        </div>

        <TabMetrics tab={activeTab} />
        <TabPanels tab={activeTab} />
      </div>
    </section>
  );
}
