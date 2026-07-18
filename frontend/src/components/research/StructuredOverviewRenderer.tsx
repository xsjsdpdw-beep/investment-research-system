import { useEffect, useMemo, useState } from "react";
import type { StructuredRenderBlock } from "@/lib/api";
import { cn } from "@/lib/utils";

function updateStructuredBlockTree(
  blocks: StructuredRenderBlock[],
  blockId: string,
  updater: (block: StructuredRenderBlock) => StructuredRenderBlock,
): StructuredRenderBlock[] {
  return blocks.map((block) => {
    if (block.id === blockId) return updater(block);
    if (!block.children?.length) return block;
    return { ...block, children: updateStructuredBlockTree(block.children, blockId, updater) };
  });
}

function EditorTextarea({
  value,
  onChange,
  placeholder,
  minHeight = 120,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl border border-border/25 bg-black/15 px-3 py-2 text-[15px] leading-7 text-foreground/92 outline-none focus:border-primary/50"
      style={{ minHeight }}
    />
  );
}

function StructuredTable({ block, editable, setBlock }: {
  block: StructuredRenderBlock;
  editable: boolean;
  setBlock: (updater: (current: StructuredRenderBlock) => StructuredRenderBlock) => void;
}) {
  const headers = Array.isArray(block.table?.headers) ? (block.table.headers as string[]) : [];
  const rows = Array.isArray(block.table?.rows) ? (block.table.rows as string[][]) : [];
  if (editable) {
    const lines = [
      headers.join(" | "),
      ...rows.map((row) => row.join(" | ")),
    ].join("\n").trim();
    return (
      <EditorTextarea
        value={lines}
        placeholder="表格每行一行，列用 | 分隔"
        minHeight={160}
        onChange={(next) => {
          const parsed = next.split("\n").map((line) => line.split("|").map((cell) => cell.trim())).filter((row) => row.some(Boolean));
          setBlock((current) => ({
            ...current,
            table: {
              headers: parsed[0] || [],
              rows: parsed.slice(1),
            },
          }));
        }}
      />
    );
  }
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

function StructuredItems({
  block,
  tone = "default",
  editable,
  setBlock,
}: {
  block: StructuredRenderBlock;
  tone?: "default" | "flow";
  editable: boolean;
  setBlock: (updater: (current: StructuredRenderBlock) => StructuredRenderBlock) => void;
}) {
  const items = block.items || [];
  if (editable) {
    return (
      <EditorTextarea
        value={items.join("\n")}
        placeholder="每行一个要点"
        minHeight={140}
        onChange={(next) => setBlock((current) => ({
          ...current,
          items: next.split("\n").map((item) => item.trim()).filter(Boolean),
        }))}
      />
    );
  }
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
  blocks,
  density,
  editable,
  onBlocksChange,
  onOpenImage,
  depth = 0,
}: {
  block: StructuredRenderBlock;
  blocks: StructuredRenderBlock[];
  density: "draft" | "deep";
  editable: boolean;
  onBlocksChange?: (blocks: StructuredRenderBlock[]) => void;
  onOpenImage: (image: { url: string; alt: string }) => void;
  depth?: number;
}) {
  const setBlock = (updater: (current: StructuredRenderBlock) => StructuredRenderBlock) => {
    if (!editable || !onBlocksChange) return;
    onBlocksChange(updateStructuredBlockTree(blocks, block.id, updater));
  };

  const sectionShellClass = depth === 0
    ? "rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/5 via-black/5 to-black/10 px-4 py-4"
    : "rounded-xl border border-border/15 bg-black/10 px-3 py-3";

  if (block.type === "section") {
    return (
      <section id={block.id} className={cn("space-y-3", sectionShellClass)}>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[11px] text-primary">
            {depth === 0 ? "主章节" : `层级 ${depth + 1}`}
          </span>
        </div>
        {editable ? (
          <input
            value={block.title || ""}
            onChange={(event) => setBlock((current) => ({ ...current, title: event.target.value }))}
            placeholder="章节标题"
            className={cn(
              "w-full rounded-xl border border-border/25 bg-black/15 px-3 py-2 font-semibold text-primary outline-none focus:border-primary/50",
              density === "deep" ? "text-xl" : "text-lg",
            )}
          />
        ) : (
          block.title && (
            <h2 className={cn(
              "border-l-4 border-primary/45 pl-3 font-semibold text-primary",
              density === "deep" ? "text-xl" : "text-lg",
            )}>
              {block.title}
            </h2>
          )
        )}
        {editable ? (
          <EditorTextarea
            value={block.content || ""}
            placeholder="章节引导语或摘要"
            minHeight={block.content ? 120 : 88}
            onChange={(next) => setBlock((current) => ({ ...current, content: next }))}
          />
        ) : (
          block.content ? <p className="whitespace-pre-wrap text-[15px] leading-7 text-foreground/92">{block.content}</p> : null
        )}
        <div className="space-y-3">
          {block.children.map((child) => (
            <StructuredBlockView
              key={child.id}
              block={child}
              blocks={blocks}
              density={density}
              editable={editable}
              onBlocksChange={onBlocksChange}
              onOpenImage={onOpenImage}
              depth={depth + 1}
            />
          ))}
        </div>
      </section>
    );
  }

  if (block.type === "paragraph") {
    return editable ? (
      <EditorTextarea
        value={block.content || ""}
        placeholder="正文"
        onChange={(next) => setBlock((current) => ({ ...current, content: next }))}
      />
    ) : (
      <p id={block.id} className="whitespace-pre-wrap rounded-xl bg-black/10 px-4 py-3 text-[15px] leading-7 text-foreground/92">{block.content}</p>
    );
  }

  if (block.type === "quote") {
    return editable ? (
      <EditorTextarea
        value={block.content || ""}
        placeholder="引用"
        minHeight={100}
        onChange={(next) => setBlock((current) => ({ ...current, content: next }))}
      />
    ) : (
      <blockquote id={block.id} className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 px-4 py-3 text-sm text-foreground/90">
        {block.content}
      </blockquote>
    );
  }

  if (block.type === "table") {
    return <div id={block.id}><StructuredTable block={block} editable={editable} setBlock={setBlock} /></div>;
  }

  if (block.type === "bullet_list") {
    return <div id={block.id}><StructuredItems block={block} editable={editable} setBlock={setBlock} /></div>;
  }

  if (block.type === "timeline" || block.type === "process_flow" || block.type === "industry_chain" || block.type === "comparison_cards" || block.type === "metric_grid") {
    return (
      <div id={block.id} className="space-y-2 rounded-xl border border-border/15 bg-black/10 px-4 py-3">
        {editable ? (
          <>
            <input
              value={block.title || ""}
              onChange={(event) => setBlock((current) => ({ ...current, title: event.target.value }))}
              placeholder="模块标题"
              className="w-full rounded-lg border border-border/20 bg-black/15 px-3 py-2 text-sm font-medium text-foreground outline-none focus:border-primary/50"
            />
            <EditorTextarea
              value={block.content || ""}
              placeholder="模块说明"
              minHeight={90}
              onChange={(next) => setBlock((current) => ({ ...current, content: next }))}
            />
            <StructuredItems block={block} tone="flow" editable={editable} setBlock={setBlock} />
          </>
        ) : (
          <>
            {block.title && <p className="text-sm font-medium text-foreground">{block.title}</p>}
            {block.content ? <p className="whitespace-pre-wrap text-[14px] leading-6 text-foreground/88">{block.content}</p> : null}
            <StructuredItems block={block} tone="flow" editable={editable} setBlock={setBlock} />
          </>
        )}
      </div>
    );
  }

  if (block.type === "image") {
    const imageUrl = String((block.image || {}).url || (block.image || {}).image_url || "");
    const caption = String((block.image || {}).caption || block.content || "");
    const hideAutoImageTitle = /^图片\d+$/.test((block.title || "").trim());
    return (
      <div id={block.id} className="space-y-3 rounded-xl border border-border/15 bg-black/10 px-4 py-3">
        {editable ? (
          <>
            <input
              value={block.title || ""}
              onChange={(event) => setBlock((current) => ({ ...current, title: event.target.value }))}
              placeholder="图片标题"
              className="w-full rounded-lg border border-border/20 bg-black/15 px-3 py-2 text-sm font-medium text-foreground outline-none focus:border-primary/50"
            />
            <input
              value={imageUrl}
              onChange={(event) => setBlock((current) => ({
                ...current,
                image: { ...(current.image || {}), url: event.target.value },
              }))}
              placeholder="图片地址"
              className="w-full rounded-lg border border-border/20 bg-black/15 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
            />
            <EditorTextarea
              value={caption}
              placeholder="图片说明"
              minHeight={90}
              onChange={(next) => setBlock((current) => ({
                ...current,
                content: next,
                image: { ...(current.image || {}), caption: next },
              }))}
            />
          </>
        ) : (
          !hideAutoImageTitle && block.title && <p className="text-sm font-medium text-foreground">{block.title}</p>
        )}
        <button
          type="button"
          aria-label="放大查看图片"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!imageUrl) return;
            onOpenImage({ url: imageUrl, alt: block.title || "图片" });
          }}
          className="block w-full overflow-hidden rounded-xl border border-border/20 bg-black/20 p-2 text-left transition hover:border-primary/40"
        >
          {imageUrl ? <img src={imageUrl} alt={block.title || "图片"} className="w-full rounded-md object-contain" /> : <div className="px-3 py-10 text-center text-xs text-muted-foreground">图片待补充</div>}
        </button>
        {!editable && caption && <p className="text-xs text-muted-foreground">{caption}</p>}
      </div>
    );
  }

  if (block.type === "source_ref") {
    const source = (block.source_refs || [])[0] || {};
    if (editable) {
      return (
        <div id={block.id} className="space-y-2 rounded-xl border border-border/15 bg-black/10 px-4 py-3">
          <input
            value={block.title || ""}
            onChange={(event) => setBlock((current) => ({ ...current, title: event.target.value }))}
            placeholder="来源标题"
            className="w-full rounded-lg border border-border/20 bg-black/15 px-3 py-2 text-sm font-medium text-foreground outline-none focus:border-primary/50"
          />
          <input
            value={String(source.url || "")}
            onChange={(event) => setBlock((current) => ({
              ...current,
              source_refs: [{ ...(current.source_refs?.[0] || {}), url: event.target.value }],
            }))}
            placeholder="来源链接"
            className="w-full rounded-lg border border-border/20 bg-black/15 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
          />
          <EditorTextarea
            value={block.content || ""}
            placeholder="来源备注"
            minHeight={90}
            onChange={(next) => setBlock((current) => ({ ...current, content: next }))}
          />
        </div>
      );
    }
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

  return editable ? (
    <EditorTextarea
      value={block.content || ""}
      placeholder="内容"
      minHeight={100}
      onChange={(next) => setBlock((current) => ({ ...current, content: next }))}
    />
  ) : (
    <div id={block.id} className="space-y-1">
      {block.title && <p className="text-sm font-medium text-foreground">{block.title}</p>}
      {block.content && <p className="whitespace-pre-wrap text-[15px] leading-7 text-foreground/92">{block.content}</p>}
    </div>
  );
}

export function StructuredOverviewRenderer({
  blocks,
  density,
  editable = false,
  onBlocksChange,
}: {
  blocks: StructuredRenderBlock[];
  density: "draft" | "deep";
  editable?: boolean;
  onBlocksChange?: (blocks: StructuredRenderBlock[]) => void;
}) {
  const [zoomedImage, setZoomedImage] = useState<{ url: string; alt: string } | null>(null);
  const normalizedBlocks = useMemo(() => blocks || [], [blocks]);

  useEffect(() => {
    if (!zoomedImage) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setZoomedImage(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [zoomedImage]);

  return (
    <>
      <div className="space-y-5 rounded-2xl border border-border/20 bg-black/10 px-5 py-4">
        {normalizedBlocks.map((block) => (
          <StructuredBlockView
            key={block.id}
            block={block}
            blocks={normalizedBlocks}
            density={density}
            editable={editable}
            onBlocksChange={onBlocksChange}
            onOpenImage={setZoomedImage}
          />
        ))}
      </div>
      {zoomedImage && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/88 p-6"
          onClick={() => setZoomedImage(null)}
        >
          <div className="flex max-h-full max-w-full flex-col gap-3">
            <button
              type="button"
              className="self-end rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white"
              onClick={(event) => {
                event.stopPropagation();
                setZoomedImage(null);
              }}
            >
              关闭
            </button>
            <img
              src={zoomedImage.url}
              alt={zoomedImage.alt}
              className="max-h-[85vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            />
          </div>
        </div>
      )}
    </>
  );
}
