import type { IndustryDraftBlock } from "@/lib/api";

function readRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object") : [];
}

export function ComparisonTableBlock({ block }: { block: IndustryDraftBlock }) {
  const rawRows = readRows(block.spec.rows);
  const cellRows = rawRows.filter((row) => Array.isArray(row.cells));
  const cellHeader = cellRows.find((row) => row.kind === "header")?.cells as unknown[] | undefined;
  const headers = cellHeader?.map(String) || (Array.isArray(block.spec.headers) ? block.spec.headers.map(String) : [...new Set(rawRows.flatMap(Object.keys).filter((key) => key !== "cells" && key !== "kind"))]);
  const rows = cellRows.length
    ? cellRows.filter((row) => row.kind !== "header").map((row) => Object.fromEntries(headers.map((header, index) => [header, Array.isArray(row.cells) ? row.cells[index] : ""])))
    : rawRows;
  return (
    <section className="overflow-hidden rounded-[24px] border border-white/10 bg-[#0b1320]">
      {block.title ? <h4 className="px-4 pt-4 text-sm font-semibold text-slate-100">{block.title}</h4> : null}
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[420px] text-left text-sm">
        {headers.length ? <thead className="border-y border-white/8 bg-white/[0.03]"><tr>{headers.map((header) => <th key={header} className="px-4 py-3 font-medium text-slate-400">{header}</th>)}</tr></thead> : null}
        <tbody>{rows.map((row, index) => <tr key={index} className="border-b border-white/[0.06] last:border-0">{headers.map((header) => <td key={header} className="px-4 py-3 text-slate-200">{String(row[header] || "")}</td>)}</tr>)}</tbody>
      </table></div>
    </section>
  );
}
