import type { IndustryDraftBlock } from "@/lib/api";

export function FlowMapBlock({ block }: { block: IndustryDraftBlock }) {
  const steps = Array.isArray(block.spec.steps) ? block.spec.steps : [];
  return (
    <section className="rounded-[24px] border border-white/10 bg-[#0b1320] p-4">
      {block.title ? <h4 className="text-sm font-semibold text-slate-100">{block.title}</h4> : null}
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {steps.map((step, index) => {
          const item = step && typeof step === "object" ? step as Record<string, unknown> : {};
          const label = String(item.label || item.name || step || "");
          const caption = String(item.caption || item.note || "");
          return <article key={`${label}-${index}`} className="relative rounded-2xl border border-white/8 bg-white/[0.03] p-4">
            <span className="text-[11px] tracking-[0.16em] text-[#ffb169]">{`0${index + 1}`}</span>
            <h5 className="mt-2 font-medium text-slate-100">{label}</h5>
            {caption ? <p className="mt-2 text-xs leading-5 text-slate-400">{caption}</p> : null}
          </article>;
        })}
      </div>
    </section>
  );
}
