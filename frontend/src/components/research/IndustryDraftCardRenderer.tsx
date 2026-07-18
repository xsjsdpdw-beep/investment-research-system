import { cn } from "@/lib/utils";
import type { IndustryDraftBlock } from "@/lib/api";
import type { ReactNode } from "react";

function readSpecArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

const TASK_2_COMPATIBILITY_BLOCK_TYPES = new Set<IndustryDraftBlock["type"]>([
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

function compatibilityText(value: unknown): string {
  if (Array.isArray(value)) return value.map(compatibilityText).filter(Boolean).join(" · ");
  if (value && typeof value === "object") return Object.values(value).map(compatibilityText).filter(Boolean).join(" · ");
  return String(value || "");
}

function CompatibilityBlockCard({ card }: { card: IndustryDraftBlock }) {
  const items = Object.values(card.spec)
    .flatMap(readSpecArray)
    .map(compatibilityText)
    .filter(Boolean);

  return (
    <section className="rounded-[24px] border border-white/10 bg-[#0b1320] p-4">
      <h4 className="text-sm font-semibold text-slate-100">{card.title || card.type}</h4>
      {items.length ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {items.map((item, index) => <p key={`${item}-${index}`} className="rounded-xl bg-white/[0.05] px-3 py-2 text-sm text-slate-300">{item}</p>)}
        </div>
      ) : <p className="mt-2 text-sm text-slate-500">暂无结构化内容</p>}
      {card.sources?.length ? <p className="mt-3 text-xs text-slate-500">来源：{card.sources.join(" · ")}</p> : null}
    </section>
  );
}

function SummaryHeroCard({ card }: { card: IndustryDraftBlock }) {
  const headline = String(card.spec.headline || "");
  const bullets = readSpecArray(card.spec.bullets).map(String);
  const tags = readSpecArray(card.spec.tags).map(String).filter(Boolean);
  return (
    <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,#101926,#09111d)] p-5">
      {card.title ? <p className="text-[11px] uppercase tracking-[0.18em] text-[#ffb169]">{card.title}</p> : null}
      {headline ? <h3 className="mt-2 text-2xl font-semibold text-slate-50">{headline}</h3> : null}
      {bullets.length ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {bullets.map((item, index) => (
            <div key={`${item}-${index}`} className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-sm leading-6 text-slate-200">
              {item}
            </div>
          ))}
        </div>
      ) : null}
      {tags.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span key={tag} className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs text-primary">
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      {card.sources?.length ? <p className="mt-4 text-xs text-slate-500">来源：{card.sources.join(" · ")}</p> : null}
    </section>
  );
}

function MetricGridCard({ card }: { card: IndustryDraftBlock }) {
  const items = readSpecArray(card.spec.items);
  return (
    <section className="rounded-[24px] border border-white/10 bg-[#0b1320] p-4">
      {card.title ? <h4 className="text-sm font-semibold text-slate-100">{card.title}</h4> : null}
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item, index) => {
          const label = String(item?.label || "");
          const value = String(item?.value || "");
          const note = String(item?.note || "");
          return (
            <article key={`${label}-${value}-${index}`} className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 shadow-[0_12px_40px_rgba(15,23,42,0.28)]">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">{label}</p>
              <p className="mt-2 text-base font-semibold text-slate-50">{value}</p>
              {note ? <p className="mt-2 text-xs text-slate-500">{note}</p> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function RangeBandCard({ card }: { card: IndustryDraftBlock }) {
  const segments = readSpecArray(card.spec.segments);
  const maxWeight = Math.max(
    1,
    ...segments.map((item) => Number(item?.weight || 0)).filter((value) => Number.isFinite(value)),
  );
  return (
    <section className="rounded-[24px] border border-white/10 bg-[#080f1c] p-4">
      {card.title ? <h4 className="text-sm font-semibold text-slate-100">{card.title}</h4> : null}
      {(card.spec.current_label || card.spec.current_value) ? (
        <p className="mt-2 text-sm text-slate-400">
          {String(card.spec.current_label || "")}
          {card.spec.current_label ? "：" : ""}
          <span className="font-medium text-slate-100">{String(card.spec.current_value || "")}</span>
        </p>
      ) : null}
      <div className="mt-4 space-y-3">
        {segments.map((item, index) => {
          const label = String(item?.label || "");
          const weight = Number(item?.weight || 0);
          const note = String(item?.note || "");
          const width = `${Math.max(24, Math.round((weight / maxWeight) * 100))}%`;
          return (
            <div key={`${label}-${index}`} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-200">{label}</span>
                <span className="text-slate-400">{weight}</span>
              </div>
              <div className="h-2.5 rounded-full bg-white/[0.06]">
                <div className="h-2.5 rounded-full bg-[linear-gradient(90deg,#f97316,#facc15)]" style={{ width }} />
              </div>
              {note ? <p className="text-xs leading-5 text-slate-500">{note}</p> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ComparisonCards({ card }: { card: IndustryDraftBlock }) {
  const items = readSpecArray(card.spec.items);
  return (
    <section className="space-y-3">
      {card.title ? <h4 className="text-sm font-semibold text-slate-100">{card.title}</h4> : null}
      <div className="grid gap-3 md:grid-cols-3">
        {items.map((item, index) => {
          const name = String(item?.name || "");
          const headline = String(item?.headline || item?.edge || "");
          const detail = String(item?.detail || item?.mapping || "");
          const tag = String(item?.tag || item?.role || item?.segment || "");
          return (
            <article key={`${name}-${index}`} className="rounded-[24px] border border-white/10 bg-[#08131f] p-4">
              {tag ? <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{tag}</p> : null}
              <h4 className="mt-3 text-xl font-semibold text-slate-50">{name}</h4>
              {headline ? <p className="mt-2 text-sm leading-6 text-slate-300">{headline}</p> : null}
              {detail ? <p className="mt-3 text-xs leading-5 text-slate-500">{detail}</p> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function TimelineCard({ card }: { card: IndustryDraftBlock }) {
  const steps = readSpecArray(card.spec.steps);
  return (
    <section className="space-y-3">
      {card.title ? <h4 className="text-sm font-semibold text-slate-100">{card.title}</h4> : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {steps.map((step, index) => {
          const label = String(step?.label || "");
          const caption = String(step?.caption || "");
          const active = Boolean(step?.active);
          return (
            <article
              key={`${label}-${index}`}
              className={cn(
                "rounded-[24px] border p-4 transition",
                active ? "border-[#38bdf8]/35 bg-[#0b1b31]" : "border-white/8 bg-white/[0.03]",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{`0${index + 1}`}</span>
                <span className={cn("h-2.5 w-2.5 rounded-full", active ? "bg-[#38bdf8]" : "bg-slate-600")} />
              </div>
              <h4 className="mt-4 text-xl font-semibold text-slate-50">{label}</h4>
              {caption ? <p className="mt-2 text-sm leading-6 text-slate-300">{caption}</p> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

const INDUSTRY_DRAFT_BLOCK_COMPONENTS: Record<IndustryDraftBlock["type"], string> = {
  summary_hero: "SummaryHeroBlock",
  metric_grid: "MetricGridBlock",
  range_band: "RangeBandBlock",
  comparison_cards: "ComparisonCardsBlock",
  timeline: "TimelineBlock",
  flow_map: "FlowMapBlock",
  industry_chain: "IndustryChainBlock",
  comparison_table: "ComparisonTableBlock",
  chart_spec: "ChartSpecBlock",
  evidence_table: "EvidenceTableBlock",
};

export function getIndustryDraftBlockComponent(type: string) {
  return INDUSTRY_DRAFT_BLOCK_COMPONENTS[type as IndustryDraftBlock["type"]] || "GenericDraftBlock";
}

export function renderIndustryDraftBlock(block: IndustryDraftBlock): ReactNode {
  switch (getIndustryDraftBlockComponent(block.type)) {
    case "SummaryHeroBlock":
      return <SummaryHeroCard card={block} />;
    case "MetricGridBlock":
      return <MetricGridCard card={block} />;
    case "RangeBandBlock":
      return <RangeBandCard card={block} />;
    case "ComparisonCardsBlock":
      return <ComparisonCards card={block} />;
    case "TimelineBlock":
      return <TimelineCard card={block} />;
    default:
      if (TASK_2_COMPATIBILITY_BLOCK_TYPES.has(block.type)) {
        return <CompatibilityBlockCard card={block} />;
      }
      return <CompatibilityBlockCard card={block} />;
  }
}

export function IndustryDraftCardRenderer({ card }: { card: IndustryDraftBlock }) {
  return renderIndustryDraftBlock(card);
}
