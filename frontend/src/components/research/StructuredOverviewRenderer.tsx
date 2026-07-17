import type { StructuredRenderBlock } from "@/lib/api";
import { cn } from "@/lib/utils";

function StructuredTable({ block }: { block: StructuredRenderBlock }) {
  const headers = Array.isArray(block.table?.headers) ? (block.table.headers as string[]) : [];
  const rows = Array.isArray(block.table?.rows) ? (block.table.rows as string[][]) : [];
  if (!headers.length && !rows.length) return null;
  return (
    <div className="my-4 space-y-2 rounded-2xl border border-border/30 bg-black/15 p-3">
      {headers.length > 0 && (
        <div
          className="grid gap-3 px-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground"
          style={{ gridTemplateColumns: `repeat(${Math.max(headers.length, 1)}, minmax(0, 1fr))` }}
        >
          {headers.map((header, index) => <div key={`${header}-${index}`}>{header}</div>)}
        </div>
      )}
      {rows.map((row, rowIndex) => (
        <div
          key={`row-${rowIndex}`}
          className="grid gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-3 text-sm"
          style={{ gridTemplateColumns: `repeat(${Math.max(headers.length || row.length, 1)}, minmax(0, 1fr))` }}
        >
          {row.map((cell, cellIndex) => (
            <div key={`${rowIndex}-${cellIndex}`} className={cn("whitespace-pre-wrap break-words", cellIndex === 0 ? "font-medium text-foreground" : "text-foreground/90")}>
              {cell}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function StructuredItems({ block, tone = "default" }: { block: StructuredRenderBlock; tone?: "default" | "flow" }) {
  const items = block.items || [];
  if (!items.length) return null;
  if (tone === "flow") {
    return (
      <div className="my-4 flex flex-wrap gap-3">
        {items.map((item, index) => (
          <div key={`${item}-${index}`} className="flex min-w-[180px] flex-1 items-start gap-3 rounded-2xl border border-white/6 bg-white/[0.02] px-3 py-3">
            <div className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
              {index + 1}
            </div>
            <div className="text-sm leading-6 text-foreground/92">{item}</div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <ul className="my-3 space-y-2 pl-5 text-[15px] text-foreground/92">
      {items.map((item, index) => <li key={`${item}-${index}`} className="marker:text-primary">{item}</li>)}
    </ul>
  );
}

function StructuredBlockView({
  block,
  density,
}: {
  block: StructuredRenderBlock;
  density: "draft" | "deep";
}) {
  if (block.type === "section") {
    return (
      <section id={block.id} className="space-y-3">
        {block.title && (
          <h2 className={cn(
            "border-l-4 border-primary/45 pl-3 font-semibold text-primary",
            density === "deep" ? "text-xl" : "text-lg",
          )}>
            {block.title}
          </h2>
        )}
        {block.content && <p className="whitespace-pre-wrap text-[15px] leading-7 text-foreground/92">{block.content}</p>}
        <div className="space-y-3">
          {block.children.map((child) => (
            <StructuredBlockView key={child.id} block={child} density={density} />
          ))}
        </div>
      </section>
    );
  }

  if (block.type === "paragraph") {
    return <p id={block.id} className="whitespace-pre-wrap text-[15px] leading-7 text-foreground/92">{block.content}</p>;
  }

  if (block.type === "quote") {
    return (
      <blockquote id={block.id} className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 px-4 py-3 text-sm text-foreground/90">
        {block.content}
      </blockquote>
    );
  }

  if (block.type === "table") {
    return <div id={block.id}><StructuredTable block={block} /></div>;
  }

  if (block.type === "bullet_list") {
    return <div id={block.id}><StructuredItems block={block} /></div>;
  }

  if (block.type === "timeline" || block.type === "process_flow" || block.type === "industry_chain" || block.type === "comparison_cards" || block.type === "metric_grid") {
    return (
      <div id={block.id} className="space-y-2">
        {block.title && <p className="text-sm font-medium text-foreground">{block.title}</p>}
        {block.content ? <p className="whitespace-pre-wrap text-[14px] leading-6 text-foreground/88">{block.content}</p> : null}
        <StructuredItems block={block} tone="flow" />
      </div>
    );
  }

  if (block.type === "image") {
    const imageUrl = String((block.image || {}).url || (block.image || {}).image_url || "");
    const caption = String((block.image || {}).caption || block.content || "");
    return (
      <div id={block.id} className="space-y-2">
        {block.title && <p className="text-sm font-medium text-foreground">{block.title}</p>}
        <div className="overflow-hidden rounded-xl border border-border/20 bg-black/20 p-2">
          {imageUrl ? <img src={imageUrl} alt={block.title || "图片"} className="w-full rounded-md object-contain" /> : <div className="px-3 py-10 text-center text-xs text-muted-foreground">图片待补充</div>}
        </div>
        {caption && <p className="text-xs text-muted-foreground">{caption}</p>}
      </div>
    );
  }

  if (block.type === "source_ref") {
    const source = (block.source_refs || [])[0] || {};
    return (
      <div id={block.id} className="rounded-lg bg-black/10 px-3 py-2.5 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">{block.title || "来源"}</p>
          {source.url ? <a href={String(source.url)} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">打开链接</a> : null}
        </div>
        {block.content && <p className="mt-1 text-xs text-muted-foreground">{block.content}</p>}
      </div>
    );
  }

  return (
    <div id={block.id} className="space-y-1">
      {block.title && <p className="text-sm font-medium text-foreground">{block.title}</p>}
      {block.content && <p className="whitespace-pre-wrap text-[15px] leading-7 text-foreground/92">{block.content}</p>}
    </div>
  );
}

export function StructuredOverviewRenderer({
  blocks,
  density,
}: {
  blocks: StructuredRenderBlock[];
  density: "draft" | "deep";
}) {
  return (
    <div className="space-y-5 rounded-2xl border border-border/20 bg-black/10 px-5 py-4">
      {blocks.map((block) => (
        <StructuredBlockView key={block.id} block={block} density={density} />
      ))}
    </div>
  );
}
