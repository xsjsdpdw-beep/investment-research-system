import { useEffect, useMemo, useState } from "react";
import { BookOpenText, BookmarkPlus, PenSquare, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Disclaimer } from "@/components/ui/Disclaimer";
import { api, ApiError, type KnowledgeEntry } from "@/lib/api";

function todayDate() {
  return new Date().toLocaleDateString("sv-SE");
}

function formatEntryDate(date: string) {
  if (!date) return "未设置日期";
  return date;
}

function fallbackTitle(date: string, index = 0) {
  return index === 0 ? `投资备忘 ${date}` : `投资备忘 ${date} #${index + 1}`;
}

export function Notes() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [expandedYears, setExpandedYears] = useState<Record<string, boolean>>({});
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});
  const [draftDate, setDraftDate] = useState(todayDate());
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const rows = await api.knowledgeEntries({ kind: "memo" });
      const memos = rows
        .filter((entry) => entry.type === "memo")
        .sort((left, right) => {
          const leftKey = `${right.date || ""}${right.created_at || ""}`;
          const rightKey = `${left.date || ""}${left.created_at || ""}`;
          return leftKey.localeCompare(rightKey);
        });
      setEntries(memos);
      setSelectedId((current) => current && memos.some((entry) => entry.id === current) ? current : memos[0]?.id || null);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "加载备忘失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.id === selectedId) || null,
    [entries, selectedId],
  );

  const groupedByDate = useMemo(() => {
    return entries.reduce<Record<string, KnowledgeEntry[]>>((acc, entry) => {
      const key = entry.date || "未设置日期";
      acc[key] = acc[key] || [];
      acc[key].push(entry);
      return acc;
    }, {});
  }, [entries]);

  const timelineTree = useMemo(() => {
    const years = new Map<string, Map<string, KnowledgeEntry[]>>();
    entries.forEach((entry) => {
      const date = entry.date || "未设置日期";
      const year = date.slice(0, 4) || "未分年";
      const month = date.length >= 7 ? date.slice(5, 7) : "未分月";
      if (!years.has(year)) years.set(year, new Map());
      const months = years.get(year)!;
      months.set(month, [...(months.get(month) || []), entry]);
    });
    return Array.from(years.entries()).map(([year, months]) => ({
      year,
      months: Array.from(months.entries()).map(([month, rows]) => ({
        month,
        key: `${year}-${month}`,
        rows,
      })),
    }));
  }, [entries]);

  useEffect(() => {
    setExpandedYears((current) => {
      const next = { ...current };
      timelineTree.forEach((group, index) => {
        if (!(group.year in next)) next[group.year] = index === 0;
      });
      Object.keys(next).forEach((year) => {
        if (!timelineTree.some((group) => group.year === year)) delete next[year];
      });
      return next;
    });
    setExpandedMonths((current) => {
      const next = { ...current };
      timelineTree.forEach((group, yearIndex) => {
        group.months.forEach((monthGroup, monthIndex) => {
          if (!(monthGroup.key in next)) next[monthGroup.key] = yearIndex === 0 && monthIndex === 0;
        });
      });
      Object.keys(next).forEach((key) => {
        if (!timelineTree.some((group) => group.months.some((monthGroup) => monthGroup.key === key))) delete next[key];
      });
      return next;
    });
  }, [timelineTree]);

  const createEntry = async () => {
    if (!draftContent.trim()) {
      toast.error("先写下这次的想法");
      return;
    }
    setSaving(true);
    try {
      const dayEntries = groupedByDate[draftDate] || [];
      const title = draftTitle.trim() || fallbackTitle(draftDate, dayEntries.length);
      const created = await api.createKnowledgeEntry({
        title,
        type: "memo",
        content: draftContent.trim(),
        date: draftDate,
      });
      toast.success("备忘已写入");
      setDraftTitle("");
      setDraftContent("");
      setSelectedId(created.id);
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await api.deleteKnowledgeEntry(id);
      toast.success("这条备忘已删除");
      if (selectedId === id) setSelectedId(null);
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "删除失败");
    }
  };

  return (
    <div>
      <PageHeader
        title="投资备忘"
        subtitle="像日记一样记下不定期的所思所想，按日期往下沉淀就好。"
        actions={<span className="text-xs text-muted-foreground">{entries.length} 条备忘</span>}
      />

      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <GlassCard className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">备忘时间线</p>
              <p className="mt-1 text-xs text-muted-foreground">左侧按年度、月度折叠回看，月度下面按 07-16 这种日度顺序查看备忘。</p>
            </div>
            <button
              onClick={() => setEditing((current) => !current)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium ${editing ? "bg-primary/20 text-primary" : "bg-primary/15 text-primary hover:bg-primary/25"}`}
            >
              <PenSquare className="h-4 w-4" />
              {editing ? "完成编辑" : "编辑"}
            </button>
          </div>

          {loading ? (
            <div className="rounded-xl bg-muted/20 px-3 py-3 text-sm text-muted-foreground">正在读取本地备忘…</div>
          ) : entries.length === 0 ? (
            <div className="rounded-xl bg-muted/20 px-3 py-3 text-sm text-muted-foreground">还没有备忘。先从右侧写下第一条想法。</div>
          ) : (
            <div className="space-y-4">
              {timelineTree.map(({ year, months }) => (
                <div key={year} className="space-y-2">
                  <button
                    onClick={() => setExpandedYears((current) => ({ ...current, [year]: !current[year] }))}
                    className="flex w-full items-center justify-between rounded-xl border border-border/40 bg-black/10 px-3 py-2 text-left"
                  >
                    <span className="text-xs font-medium uppercase tracking-[0.18em] text-primary/80">{year}</span>
                    <span className="text-[11px] text-muted-foreground">{expandedYears[year] ? "收起" : "展开"} · {months.reduce((sum, item) => sum + item.rows.length, 0)} 条</span>
                  </button>
                  {expandedYears[year] && (
                    <div className="space-y-2">
                      {months.map(({ month, key, rows }) => (
                        <div key={key} className="space-y-2 pl-3">
                          <button
                            onClick={() => setExpandedMonths((current) => ({ ...current, [key]: !current[key] }))}
                            className="flex w-full items-center justify-between rounded-lg border border-border/30 bg-black/10 px-3 py-2 text-left"
                          >
                            <span className="text-xs font-medium text-foreground">{month} 月</span>
                            <span className="text-[11px] text-muted-foreground">{expandedMonths[key] ? "收起" : "展开"} · {rows.length} 条</span>
                          </button>
                          {expandedMonths[key] && (
                            <div className="space-y-2 pl-3">
                              {rows.map((entry) => {
                                const active = entry.id === selectedId;
                                const dayLabel = (entry.date || "").slice(5, 10) || "未设置";
                                return (
                                  <div
                                    key={entry.id}
                                    className={`rounded-xl border px-3 py-3 transition ${active ? "border-primary/50 bg-primary/10 shadow-glow" : "border-border/40 bg-black/15 hover:border-primary/30 hover:bg-primary/5"}`}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <button onClick={() => setSelectedId(entry.id)} className="min-w-0 flex-1 text-left">
                                        <p className="text-[11px] font-medium text-primary/80">{dayLabel}</p>
                                        <p className="mt-1 text-sm font-medium text-foreground">{entry.title}</p>
                                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{entry.content_preview || entry.content || "点击查看全文"}</p>
                                      </button>
                                      {editing && (
                                        <button
                                          onClick={() => void remove(entry.id)}
                                          className="shrink-0 text-muted-foreground hover:text-destructive"
                                          title="删除这条备忘"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </GlassCard>

        <div className="space-y-4">
          <GlassCard className="space-y-4">
            <div className="flex items-center gap-2">
              <BookmarkPlus className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">新增备忘</h3>
            </div>
            <div className="grid gap-3 md:grid-cols-[160px_minmax(0,1fr)]">
              <input
                type="date"
                value={draftDate}
                onChange={(event) => setDraftDate(event.target.value)}
                className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
              />
              <input
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                placeholder="标题可选，不填就按日期自动命名"
                className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
              />
            </div>
            <textarea
              value={draftContent}
              onChange={(event) => setDraftContent(event.target.value)}
              rows={14}
              placeholder="今天看到了什么、想到了什么、之后准备怎么验证，都可以直接写在这里。"
              className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
            />
            <div className="flex justify-end">
              <button
                onClick={() => void createEntry()}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-4 py-2 text-sm font-medium text-primary shadow-glow hover:bg-primary/25 disabled:opacity-60"
              >
                <BookmarkPlus className="h-4 w-4" />
                {saving ? "保存中…" : "写入备忘"}
              </button>
            </div>
          </GlassCard>

          <GlassCard className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <BookOpenText className="h-4 w-4 text-primary" />
                <h3 className="font-semibold">备忘内容</h3>
              </div>
              {selectedEntry && editing && (
                <button
                  onClick={() => void remove(selectedEntry.id)}
                  className="text-muted-foreground hover:text-destructive"
                  title="删除"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>

            {!selectedEntry ? (
              <div className="rounded-xl bg-muted/20 px-4 py-8 text-sm text-muted-foreground">
                左侧选一条备忘查看，或者直接在上面写一条新的。
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-border/40 bg-black/10 px-4 py-3">
                  <p className="text-lg font-semibold text-foreground">{selectedEntry.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatEntryDate(selectedEntry.date)} · 创建于 {selectedEntry.created_at.slice(0, 10)}</p>
                </div>
                <div className="prose prose-sm prose-invert max-w-none rounded-xl border border-border/40 bg-black/10 px-4 py-4 text-foreground">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {selectedEntry.content || selectedEntry.content_preview || ""}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </GlassCard>
        </div>
      </div>

      <Disclaimer />
    </div>
  );
}
