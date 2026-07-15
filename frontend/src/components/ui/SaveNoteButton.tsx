import { useState } from "react";
import { Check, BookmarkPlus } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";

// 把一段 AI 结果存入本地知识库，默认记成一条 memo。
export function SaveNoteButton({ kind, title, content }: { kind: string; title: string; content: string }) {
  const [saved, setSaved] = useState(false);
  if (!content.trim()) return null;
  return (
    <button
      onClick={async () => {
        try {
          await api.createKnowledgeEntry({ title, type: "memo", content, tags: [kind] });
          setSaved(true);
          toast.success("已写入本地沉淀");
        } catch (error) {
          toast.error(error instanceof ApiError ? error.message : "保存失败");
        }
      }}
      disabled={saved}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-60"
    >
      {saved ? (<><Check className="h-3.5 w-3.5" /> 已存入沉淀</>) : (<><BookmarkPlus className="h-3.5 w-3.5" /> 存入沉淀</>)}
    </button>
  );
}
