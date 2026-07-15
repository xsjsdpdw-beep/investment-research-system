import { useEffect, useMemo, useState } from "react";
import { BookmarkPlus, Search, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Disclaimer } from "@/components/ui/Disclaimer";
import { api, ApiError, type KnowledgeEntry } from "@/lib/api";

function tagsFrom(raw: string) {
  return raw.split(/[，,\s]+/).map((item) => item.trim()).filter(Boolean);
}

export function Notes() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [relatedSectors, setRelatedSectors] = useState("");
  const [relatedStocks, setRelatedStocks] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = async (keyword?: string) => {
    setLoading(true);
    try {
      const rows = keyword ? await api.searchKnowledgeEntries(keyword) : await api.knowledgeEntries({ kind: "memo" });
      setEntries(rows.filter((entry) => entry.type === "memo"));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "加载备忘失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const groupedHint = useMemo(() => {
    const sectorSet = new Set(entries.flatMap((entry) => entry.related_sectors));
    return `${entries.length} 条备忘 · ${sectorSet.size} 个关联行业`;
  }, [entries]);

  const submit = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error("标题和内容都要填一下");
      return;
    }
    setSaving(true);
    try {
      await api.createKnowledgeEntry({
        title: title.trim(),
        type: "memo",
        content: content.trim(),
        tags: tagsFrom(tags),
        related_sectors: tagsFrom(relatedSectors),
        related_stocks: tagsFrom(relatedStocks),
      });
      setTitle("");
      setContent("");
      setTags("");
      setRelatedSectors("");
      setRelatedStocks("");
      toast.success("备忘已写入本地知识库");
      await load(query.trim() || undefined);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    await api.deleteKnowledgeEntry(id);
    toast.success("已删除这条备忘");
    await load(query.trim() || undefined);
  };

  return (
    <div>
      <PageHeader
        title="投资备忘"
        subtitle="用日记式条目沉淀观点、跟踪变化，并把内容挂到行业或个股中心。"
        actions={<span className="text-xs text-muted-foreground">{groupedHint}</span>}
      />

      <GlassCard className="mb-5 space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="标题，如：工程机械周观点"
            className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
          />
          <div className="flex gap-2">
            <div className="flex flex-1 items-center rounded-lg border border-border bg-black/20 px-3">
              <Search className="mr-2 h-4 w-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && void load(query.trim() || undefined)}
                placeholder="搜索标题、正文、标签"
                className="w-full bg-transparent py-2 text-sm outline-none"
              />
            </div>
            <button
              onClick={() => void load(query.trim() || undefined)}
              className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              搜索
            </button>
          </div>
        </div>
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={7}
          placeholder="写下这次的观点、证据、后续验证点。"
          className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
        />
        <div className="grid gap-3 md:grid-cols-3">
          <input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="标签：景气度, 周观点"
            className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
          />
          <input
            value={relatedSectors}
            onChange={(event) => setRelatedSectors(event.target.value)}
            placeholder="关联行业：工程机械"
            className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
          />
          <input
            value={relatedStocks}
            onChange={(event) => setRelatedStocks(event.target.value)}
            placeholder="关联个股：000425.SZ"
            className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
          />
        </div>
        <div className="flex justify-end">
          <button
            onClick={() => void submit()}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-4 py-2 text-sm font-medium text-primary shadow-glow hover:bg-primary/25 disabled:opacity-60"
          >
            <BookmarkPlus className="h-4 w-4" />
            {saving ? "保存中…" : "新增备忘"}
          </button>
        </div>
      </GlassCard>

      <div className="space-y-3">
        {loading ? (
          <GlassCard>正在读取本地备忘…</GlassCard>
        ) : entries.length === 0 ? (
          <GlassCard>还没有备忘。先写下第一条观点，后面它会自动进入你的知识沉淀。</GlassCard>
        ) : (
          entries.map((entry) => {
            const open = openId === entry.id;
            return (
              <GlassCard key={entry.id} className="!p-0 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <button onClick={() => setOpenId(open ? null : entry.id)} className="flex-1 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{entry.title}</span>
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{entry.date}</span>
                      {entry.related_sectors.map((item) => (
                        <span key={item} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{item}</span>
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {entry.tags.join(" · ") || "未打标签"} {entry.summary_status === "ready" ? "· 已有 AI 摘要" : ""}
                    </p>
                  </button>
                  <button
                    onClick={() => void remove(entry.id)}
                    className="text-muted-foreground hover:text-destructive"
                    title="删除"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {open && (
                  <div className="border-t border-border/40 px-4 py-3">
                    <div className="prose prose-sm prose-invert max-w-none text-foreground">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.content || entry.content_preview || ""}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </GlassCard>
            );
          })
        )}
      </div>

      <Disclaimer />
    </div>
  );
}
