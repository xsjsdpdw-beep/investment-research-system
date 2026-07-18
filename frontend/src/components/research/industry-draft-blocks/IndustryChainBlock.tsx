import type { IndustryDraftBlock } from "@/lib/api";

type ChainColumn = { title: string; nodes: string[] };

function readColumns(spec: Record<string, unknown>): ChainColumn[] {
  if (Array.isArray(spec.columns)) return spec.columns.map((column, index) => {
    const value = column && typeof column === "object" ? column as Record<string, unknown> : {};
    return { title: String(value.title || value.label || `环节 ${index + 1}`), nodes: Array.isArray(value.nodes) ? value.nodes.map(String) : [] };
  });
  if (!Array.isArray(spec.nodes)) return [];
  return spec.nodes.map((node, index) => {
    const value = node && typeof node === "object" ? node as Record<string, unknown> : {};
    const label = String(value.label || value.name || node || "");
    const detail = String(value.detail || value.value || value.note || "");
    return { title: label || `环节 ${index + 1}`, nodes: detail ? [detail] : [] };
  });
}

export function IndustryChainBlock({ block }: { block: IndustryDraftBlock }) {
  const columns = readColumns(block.spec);
  return (
    <section className="rounded-[24px] border border-white/10 bg-[#0b1320] p-4">
      {block.title ? <h4 className="text-sm font-semibold text-slate-100">{block.title}</h4> : null}
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {columns.map((column, index) => <article key={`${column.title}-${index}`} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <h5 className="text-sm font-medium text-slate-100">{column.title}</h5>
          <div className="mt-3 space-y-2">{column.nodes.map((node, nodeIndex) => <p key={`${node}-${nodeIndex}`} className="rounded-lg bg-black/20 px-2.5 py-2 text-xs text-slate-300">{node}</p>)}</div>
        </article>)}
      </div>
    </section>
  );
}
