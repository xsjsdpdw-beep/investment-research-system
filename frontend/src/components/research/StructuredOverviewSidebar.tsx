import type { StructuredRenderBlock } from "@/lib/api";
import { cn } from "@/lib/utils";

interface OutlineItem {
  id: string;
  title: string;
  level: number;
}

function collectOutline(blocks: StructuredRenderBlock[], level = 1): OutlineItem[] {
  const out: OutlineItem[] = [];
  for (const block of blocks) {
    if (block.type === "section" && block.title) {
      out.push({ id: block.id, title: block.title, level });
      out.push(...collectOutline(block.children || [], level + 1));
    }
  }
  return out;
}

export function StructuredOverviewSidebar({
  blocks,
  activeId,
  onJump,
  title = "目录",
}: {
  blocks: StructuredRenderBlock[];
  activeId?: string;
  onJump: (id: string) => void;
  title?: string;
}) {
  const outline = collectOutline(blocks);
  if (!outline.length) return null;
  return (
    <div className="rounded-xl border border-border/20 bg-black/12 p-2.5 lg:sticky lg:top-3 lg:self-start">
      <div className="mb-2 border-b border-border/20 px-1 pb-2">
        <p className="text-sm font-medium">{title}</p>
      </div>
      <div className="max-h-[520px] overflow-y-auto pr-1">
        {outline.map((item) => (
          <button
            key={item.id}
            onClick={() => onJump(item.id)}
            className={cn(
              "flex w-full items-center rounded-md px-2 py-1.5 text-left transition-colors",
              activeId === item.id ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
            )}
            style={{ paddingLeft: `${8 + (item.level - 1) * 14}px` }}
          >
            <span className={cn("truncate", item.level === 1 ? "text-[13px] font-medium" : item.level === 2 ? "text-[12px]" : "text-[11px]")}>
              {item.title}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
