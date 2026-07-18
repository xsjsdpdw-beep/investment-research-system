import type { IndustryDraftBlock } from "@/lib/api";

function readItems(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
}

export function RangeBandBlock({ block }: { block: IndustryDraftBlock }) {
  const segments = readItems(block.spec.segments);
  const maxWeight = Math.max(1, ...segments.map((item) => Number(item.weight || 0)).filter(Number.isFinite));

  return (
    <section className="rounded-[24px] border border-white/10 bg-[#080f1c] p-4">
      {block.title ? <h4 className="text-sm font-semibold text-slate-100">{block.title}</h4> : null}
      {(block.spec.current_label || block.spec.current_value) ? <p className="mt-2 text-sm text-slate-400">{String(block.spec.current_label || "")}{block.spec.current_label ? "：" : ""}<span className="font-medium text-slate-100">{String(block.spec.current_value || "")}</span></p> : null}
      <div className="mt-4 space-y-3">
        {segments.map((item, index) => {
          const label = String(item.label || "");
          const weight = Number(item.weight || 0);
          const note = String(item.note || "");
          const width = `${Math.max(24, Math.round((weight / maxWeight) * 100))}%`;
          return <div key={`${label}-${index}`} className="space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-sm"><span className="text-slate-200">{label}</span><span className="text-slate-400">{weight}</span></div>
            <div className="h-2.5 rounded-full bg-white/[0.06]"><div className="h-2.5 rounded-full bg-[linear-gradient(90deg,#f97316,#facc15)]" style={{ width }} /></div>
            {note ? <p className="text-xs leading-5 text-slate-500">{note}</p> : null}
          </div>;
        })}
      </div>
    </section>
  );
}
