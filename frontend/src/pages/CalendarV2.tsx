import { useEffect, useMemo, useState } from "react";
import {
  CalendarPlus2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Disclaimer } from "@/components/ui/Disclaimer";
import { SectionTabs } from "@/components/ui/SectionTabs";
import { api, ApiError, type CalendarV2Event } from "@/lib/api";

type CalendarView = "day" | "week" | "month";
type CalendarCategory = "macro" | "major_event" | "earnings" | "conference_call" | "manual";
type CalendarFilter = "all" | CalendarCategory;

const VIEW_TABS = [
  { key: "day", label: "日历" },
  { key: "week", label: "周历" },
  { key: "month", label: "月历" },
];

const CATEGORY_META: Record<CalendarCategory, {
  label: string;
  card: string;
  badge: string;
  dot: string;
}> = {
  macro: {
    label: "宏观",
    card: "border-rose-400/25 bg-rose-400/[0.055]",
    badge: "bg-rose-400/10 text-rose-200",
    dot: "bg-rose-400",
  },
  major_event: {
    label: "大事",
    card: "border-orange-400/25 bg-orange-400/[0.055]",
    badge: "bg-orange-400/10 text-orange-100",
    dot: "bg-orange-400",
  },
  earnings: {
    label: "财报",
    card: "border-sky-400/25 bg-sky-400/[0.055]",
    badge: "bg-sky-400/10 text-sky-200",
    dot: "bg-sky-400",
  },
  conference_call: {
    label: "电话会",
    card: "border-indigo-400/25 bg-indigo-400/[0.055]",
    badge: "bg-indigo-400/10 text-indigo-200",
    dot: "bg-indigo-400",
  },
  manual: {
    label: "自定义",
    card: "border-amber-300/70 bg-amber-300/[0.14] shadow-[inset_3px_0_0_rgb(252_211_77_/_0.9),0_0_0_1px_rgb(252_211_77_/_0.12)]",
    badge: "bg-amber-300 text-amber-950",
    dot: "bg-amber-300",
  },
};

function todayKey() {
  return new Date().toLocaleDateString("sv-SE");
}

function toDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function toKey(date: Date) {
  return date.toLocaleDateString("sv-SE");
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(date: Date) {
  const weekday = date.getDay();
  return addDays(date, weekday === 0 ? -6 : 1 - weekday);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function visibleRange(anchor: Date, view: CalendarView) {
  if (view === "day") return { start: anchor, end: anchor };
  if (view === "week") {
    const start = startOfWeek(anchor);
    return { start, end: addDays(start, 6) };
  }
  return {
    start: new Date(anchor.getFullYear(), anchor.getMonth(), 1),
    end: endOfMonth(anchor),
  };
}

function rangeDates(start: Date, end: Date) {
  const dates: Date[] = [];
  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
    dates.push(cursor);
  }
  return dates;
}

function formatRangeHeader(anchor: Date, view: CalendarView) {
  const { start, end } = visibleRange(anchor, view);
  if (view === "day") return `${anchor.getFullYear()}年${anchor.getMonth() + 1}月${anchor.getDate()}日`;
  if (view === "week") {
    return `${start.getMonth() + 1}月${start.getDate()}日 — ${end.getMonth() + 1}月${end.getDate()}日`;
  }
  return `${anchor.getFullYear()}年${String(anchor.getMonth() + 1).padStart(2, "0")}月`;
}

function categoryOf(item: CalendarV2Event): CalendarCategory {
  if (item.category === "manual" || item.category === "custom") return "manual";
  if (item.category === "major_event") return "major_event";
  if (item.category === "earnings") return "earnings";
  if (item.category === "conference_call") return "conference_call";
  return "macro";
}

function starsOf(item: CalendarV2Event) {
  if (item.stars) return Math.max(1, Math.min(3, item.stars));
  if (item.importance === "high") return 3;
  if (item.importance === "medium") return 2;
  return 1;
}

function eventTimeRank(value?: string) {
  if (!value) return "98:00";
  if (/^\d{2}:\d{2}$/.test(value)) return value;
  if (value === "盘前") return "07:00";
  if (value === "盘后") return "23:00";
  return "99:00";
}

function isManual(item: CalendarV2Event) {
  return item.source === "manual" || item.category === "manual" || item.category === "custom";
}

function meetsSourceThreshold(item: CalendarV2Event) {
  if (isManual(item)) return true;
  return starsOf(item) >= (item.source.includes("金十") ? 3 : 2);
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

const EMPTY_FORM = {
  title: "",
  date: todayKey(),
  time: "",
  category: "manual" as CalendarCategory,
  importance: "high",
  notes: "",
};

export function CalendarV2() {
  const [events, setEvents] = useState<CalendarV2Event[]>([]);
  const [view, setView] = useState<CalendarView>("week");
  const [anchorDate, setAnchorDate] = useState(todayKey());
  const [activeCategory, setActiveCategory] = useState<CalendarFilter>("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [expandedMonthDates, setExpandedMonthDates] = useState<string[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CalendarV2Event | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const anchor = toDate(anchorDate);
  const range = useMemo(() => visibleRange(anchor, view), [anchorDate, view]);
  const dates = useMemo(() => rangeDates(range.start, range.end), [range.start.getTime(), range.end.getTime()]);

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      setEvents(await api.calendarV2Events({
        start: toKey(range.start),
        end: toKey(range.end),
      }));
    } catch (error) {
      const message = errorMessage(error, "加载投资日历失败");
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setExpandedMonthDates([]);
    void load();
  }, [anchorDate, view]);

  const categoryCounts = useMemo(() => {
    const counts: Record<CalendarCategory, number> = {
      macro: 0,
      major_event: 0,
      earnings: 0,
      conference_call: 0,
      manual: 0,
    };
    events.filter(meetsSourceThreshold).forEach((item) => {
      counts[categoryOf(item)] += 1;
    });
    return counts;
  }, [events]);

  const visibleEvents = useMemo(() => {
    return events
      .filter(meetsSourceThreshold)
      .filter((item) => activeCategory === "all" || categoryOf(item) === activeCategory)
      .sort((left, right) => {
        const dateDiff = left.date.localeCompare(right.date);
        if (dateDiff) return dateDiff;
        return eventTimeRank(left.time).localeCompare(eventTimeRank(right.time)) || left.title.localeCompare(right.title);
      });
  }, [activeCategory, events]);

  const eventsByDate = useMemo(() => {
    return visibleEvents.reduce<Record<string, CalendarV2Event[]>>((acc, item) => {
      (acc[item.date] ||= []).push(item);
      return acc;
    }, {});
  }, [visibleEvents]);

  const shiftRange = (direction: -1 | 1) => {
    const next = new Date(anchor);
    if (view === "day") next.setDate(next.getDate() + direction);
    if (view === "week") next.setDate(next.getDate() + direction * 7);
    if (view === "month") next.setMonth(next.getMonth() + direction);
    setAnchorDate(toKey(next));
  };

  const openCreate = (date = anchorDate) => {
    setEditingEventId("");
    setForm({ ...EMPTY_FORM, date });
    setFormOpen(true);
  };

  const openEdit = (item: CalendarV2Event) => {
    if (!isManual(item)) return;
    setEditingEventId(item.id);
    setForm({
      title: item.title,
      date: item.date,
      time: item.time || "",
      category: categoryOf(item),
      importance: item.importance || "medium",
      notes: item.notes || "",
    });
    setFormOpen(true);
  };

  const submit = async () => {
    if (!form.title.trim()) {
      toast.error("先写一个事件标题");
      return;
    }
    setSaving(true);
    try {
      await api.upsertCalendarV2Event({
        id: editingEventId || undefined,
        title: form.title.trim(),
        date: form.date,
        time: form.time,
        category: form.category,
        importance: form.importance,
        source: "manual",
        notes: form.notes.trim(),
      });
      toast.success(editingEventId ? "事件已更新" : "事件已加入日历");
      setFormOpen(false);
      setEditingEventId("");
      setAnchorDate(form.date);
      await load();
    } catch (error) {
      toast.error(errorMessage(error, "保存日历事件失败"));
    } finally {
      setSaving(false);
    }
  };

  const requestRemove = (item: CalendarV2Event) => {
    if (!isManual(item)) return;
    setDeleteTarget(item);
  };

  const confirmRemove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteCalendarV2Event(deleteTarget.id);
      setEvents((current) => current.filter((event) => event.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success("事件已删除");
    } catch (error) {
      toast.error(errorMessage(error, "删除事件失败"));
    } finally {
      setDeleting(false);
    }
  };

  const monthPreview = (items: CalendarV2Event[]) => {
    const priority = (item: CalendarV2Event) => {
      const category = categoryOf(item);
      if (item.watchlist_match || isManual(item)) return 0;
      if (category === "earnings" || category === "conference_call") return 1;
      return 5 - starsOf(item);
    };
    return [...items]
      .sort((left, right) => priority(left) - priority(right) || eventTimeRank(left.time).localeCompare(eventTimeRank(right.time)))
      .slice(0, 3)
      .sort((left, right) => eventTimeRank(left.time).localeCompare(eventTimeRank(right.time)));
  };

  return (
    <div>
      <PageHeader
        title="投资日历"
        subtitle="宏观、重要财报、电话会和自定义安排，按日期轴集中查看。"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => void load()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              刷新
            </button>
            <button
              onClick={() => openCreate(anchorDate)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-3 py-2 text-sm font-medium text-primary shadow-glow transition hover:bg-primary/25"
            >
              <Plus className="h-4 w-4" />
              新增事项
            </button>
          </div>
        }
      />

      <div className="space-y-4">
        <GlassCard className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionTabs tabs={VIEW_TABS} active={view} onChange={(next) => setView(next as CalendarView)} />
            <div className="flex items-center gap-2">
              <button
                onClick={() => shiftRange(-1)}
                aria-label="上一个日期范围"
                className="rounded-lg border border-border p-2 text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setAnchorDate(todayKey())}
                className="min-w-[190px] rounded-lg px-3 py-2 text-center text-sm font-medium text-foreground transition hover:bg-white/5"
              >
                {formatRangeHeader(anchor, view)}
              </button>
              <button
                onClick={() => shiftRange(1)}
                aria-label="下一个日期范围"
                className="rounded-lg border border-border p-2 text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border/45 pt-4">
            <button
              onClick={() => setActiveCategory("all")}
              aria-pressed={activeCategory === "all"}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition ${
                activeCategory === "all"
                  ? "border-primary/35 bg-primary/10 text-foreground"
                  : "border-border/35 bg-transparent text-muted-foreground/70"
              }`}
            >
              全部
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {Object.values(categoryCounts).reduce((sum, count) => sum + count, 0)}
              </span>
            </button>
            {(Object.keys(CATEGORY_META) as CalendarCategory[]).map((category) => {
              const meta = CATEGORY_META[category];
              const active = activeCategory === category;
              return (
                <button
                  key={category}
                  onClick={() => setActiveCategory(category)}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition ${
                    active
                      ? "border-primary/35 bg-primary/10 text-foreground"
                      : "border-border/35 bg-transparent text-muted-foreground/70"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${active ? meta.dot : "bg-current"}`} />
                  {meta.label}
                  <span className="text-[10px] tabular-nums text-muted-foreground">{categoryCounts[category]}</span>
                </button>
              );
            })}
            <div className="ml-auto rounded-full border border-border/45 px-3 py-1.5 text-[11px] text-muted-foreground">
              华尔街见闻 ≥ 2 星 · 金十 ≥ 3 星（授权后启用）
            </div>
          </div>
        </GlassCard>

        <GlassCard className="overflow-hidden p-0">
          {loadError && (
            <div className="flex items-center justify-between gap-3 border-b border-rose-400/20 bg-rose-400/5 px-5 py-3 text-sm text-rose-200">
              <span>{loadError}</span>
              <button onClick={() => void load()} className="shrink-0 rounded-lg border border-rose-300/20 px-2.5 py-1 text-xs hover:bg-rose-300/10">
                重试
              </button>
            </div>
          )}

          {loading ? (
            <div className="divide-y divide-border/45 px-5">
              {Array.from({ length: view === "day" ? 1 : 5 }, (_, index) => (
                <div key={index} className="grid grid-cols-[72px_minmax(0,1fr)] gap-4 py-5">
                  <div className="space-y-2">
                    <div className="h-7 w-12 animate-pulse rounded bg-white/8" />
                    <div className="h-3 w-14 animate-pulse rounded bg-white/5" />
                  </div>
                  <div className="h-24 animate-pulse rounded-xl border border-border/35 bg-white/[0.025]" />
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-border/55 px-4 sm:px-5">
              {dates.map((date) => {
                const key = toKey(date);
                const dayEvents = eventsByDate[key] || [];
                const isMonthExpanded = expandedMonthDates.includes(key);
                const displayedEvents = view === "month" && !isMonthExpanded ? monthPreview(dayEvents) : dayEvents;
                const hiddenCount = dayEvents.length - displayedEvents.length;
                const isToday = key === todayKey();
                return (
                  <section key={key} className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 py-4 sm:grid-cols-[76px_minmax(0,1fr)] sm:gap-4 sm:py-5">
                    <div className="relative border-r border-border/70 pr-3 sm:pr-4">
                      <div className={`text-xl font-semibold leading-none tabular-nums sm:text-2xl ${isToday ? "text-primary" : "text-foreground"}`}>
                        {date.getDate()}日
                      </div>
                      <div className="mt-2 text-[11px] text-muted-foreground">
                        {date.getMonth() + 1}/{date.getDate()} 周{["日", "一", "二", "三", "四", "五", "六"][date.getDay()]}
                      </div>
                      <div className="mt-1 text-[10px] tabular-nums text-muted-foreground/70">{dayEvents.length} 项</div>
                      <button
                        onClick={() => openCreate(key)}
                        aria-label={`在 ${key} 新增事项`}
                        className="mt-3 inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition hover:border-primary/40 hover:text-primary"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="relative min-w-0">
                      {dayEvents.length === 0 ? (
                        <button
                          onClick={() => openCreate(key)}
                          className="flex min-h-[78px] w-full items-center justify-center rounded-xl border border-dashed border-border/55 bg-black/[0.06] px-4 text-sm text-muted-foreground/75 transition hover:border-primary/35 hover:bg-primary/[0.035] hover:text-foreground"
                        >
                          暂无事项 · 点击添加
                        </button>
                      ) : (
                        <div className="relative space-y-3">
                          <span className="pointer-events-none absolute bottom-3 left-[70px] top-3 w-px bg-cyan-300/20 sm:left-[96px]" />
                          {displayedEvents.map((item) => {
                            const category = categoryOf(item);
                            const meta = CATEGORY_META[category];
                            const stars = starsOf(item);
                            const manual = isManual(item);
                            return (
                              <div key={item.id} className="relative grid grid-cols-[52px_20px_minmax(0,1fr)] items-start gap-2 sm:grid-cols-[72px_24px_minmax(0,1fr)] sm:gap-3">
                                <div className="pt-3 text-right">
                                  <div className="text-xs font-semibold tabular-nums text-foreground/80">{item.time || "全天"}</div>
                                </div>
                                <div className="relative flex justify-center pt-3">
                                  <span className={`relative z-10 flex h-4 w-4 items-center justify-center rounded-full border-2 bg-background ${manual ? "border-amber-300" : "border-cyan-300/70"}`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${manual ? "bg-amber-300" : "bg-cyan-300"}`} />
                                  </span>
                                </div>
                                <article
                                  className={`group relative min-h-[96px] overflow-hidden rounded-xl border px-4 py-3 transition ${
                                    manual
                                      ? CATEGORY_META.manual.card
                                      : `hover:border-white/20 hover:bg-white/[0.045] ${meta.card}`
                                  }`}
                                >
                                  <span className={`absolute inset-y-0 left-0 ${manual ? "w-1 bg-amber-300" : `w-[3px] ${meta.dot}`}`} />
                                  <div className="flex items-start gap-3">
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                                        {item.country && <span>{item.country}</span>}
                                        {item.ticker && <span className="font-mono text-[10px]">{item.ticker}</span>}
                                        {manual && (
                                          <span className="rounded-md bg-amber-300 px-2 py-0.5 text-[10px] font-bold text-amber-950">我的自定义</span>
                                        )}
                                        <span className={`rounded-md px-2 py-0.5 text-[10px] ${meta.badge}`}>{meta.label}</span>
                                        {item.watchlist_match && (
                                          <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] text-primary">我的自选</span>
                                        )}
                                        {item.important_us && !item.watchlist_match && (
                                          <span className="rounded-md bg-white/[0.07] px-2 py-0.5 text-[10px] text-muted-foreground">重要美股</span>
                                        )}
                                        <span className="rounded-md bg-white/[0.055] px-2 py-0.5 text-[10px] text-muted-foreground">{item.source}</span>
                                      </div>
                                      <h3 className="mt-1.5 pr-16 text-sm font-semibold leading-6 text-foreground sm:text-[15px]">{item.title}</h3>
                                      {item.notes && <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.notes}</p>}
                                    </div>

                                    <div className="absolute right-3 top-3 flex items-center gap-1.5">
                                      <div className="flex items-center gap-0.5 rounded-md bg-black/20 px-1.5 py-1" aria-label={`${stars}星重要性`}>
                                        {Array.from({ length: 3 }, (_, index) => (
                                          <Star
                                            key={index}
                                            className={`h-2.5 w-2.5 ${index < stars ? "fill-primary text-primary" : "text-muted-foreground/25"}`}
                                          />
                                        ))}
                                      </div>
                                      {manual ? (
                                        <div className="flex items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                                          <button
                                            onClick={() => openEdit(item)}
                                            aria-label={`编辑 ${item.title}`}
                                            className="rounded-md border border-border/70 bg-background/80 p-1.5 text-muted-foreground hover:text-foreground"
                                          >
                                            <Pencil className="h-3 w-3" />
                                          </button>
                                          <button
                                            onClick={() => requestRemove(item)}
                                            aria-label={`删除 ${item.title}`}
                                            className="rounded-md border border-border/70 bg-background/80 p-1.5 text-muted-foreground hover:border-rose-400/30 hover:text-rose-300"
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </button>
                                        </div>
                                      ) : item.source_url ? (
                                        <a
                                          href={item.source_url}
                                          target="_blank"
                                          rel="noreferrer"
                                          aria-label={`打开 ${item.title} 来源`}
                                          className="rounded-md border border-border/70 bg-background/80 p-1.5 text-muted-foreground opacity-100 transition hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                                        >
                                          <ExternalLink className="h-3 w-3" />
                                        </a>
                                      ) : null}
                                    </div>
                                  </div>
                                </article>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {view === "month" && dayEvents.length > 3 && (
                        <button
                          onClick={() => setExpandedMonthDates((current) => (
                            current.includes(key) ? current.filter((dateKey) => dateKey !== key) : [...current, key]
                          ))}
                          className="mt-3 w-full rounded-lg border border-border/45 bg-black/[0.06] px-3 py-2 text-xs text-muted-foreground transition hover:border-primary/30 hover:text-foreground"
                        >
                          {isMonthExpanded ? "收起当天" : `展开当天其余 ${hiddenCount} 项`}
                        </button>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </GlassCard>
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setFormOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-form-title"
            className="w-full max-w-xl rounded-2xl border border-border bg-background/95 p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between gap-3">
              <h3 id="calendar-form-title" className="flex items-center gap-2 font-semibold">
                <CalendarPlus2 className="h-4 w-4 text-primary" />
                {editingEventId ? "编辑日历事项" : "新增日历事项"}
              </h3>
              <button
                onClick={() => setFormOpen(false)}
                aria-label="关闭"
                className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <label className="block space-y-2">
                <span className="text-xs font-medium text-foreground">事项名称</span>
                <input
                  autoFocus
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="如：三一重工业绩电话会"
                  className="w-full rounded-lg border border-border bg-black/20 px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-xs font-medium text-foreground">日期</span>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
                    className="w-full rounded-lg border border-border bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-primary/50"
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-xs font-medium text-foreground">时间（可不填）</span>
                  <input
                    type="time"
                    value={form.time}
                    onChange={(event) => setForm((current) => ({ ...current, time: event.target.value }))}
                    className="w-full rounded-lg border border-border bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-primary/50"
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-xs font-medium text-foreground">分类</span>
                  <select
                    value={form.category}
                    onChange={(event) => setForm((current) => ({ ...current, category: event.target.value as CalendarCategory }))}
                    className="w-full rounded-lg border border-border bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-primary/50"
                  >
                    <option value="manual">自定义</option>
                    <option value="macro">宏观</option>
                    <option value="major_event">大事</option>
                    <option value="earnings">财报</option>
                    <option value="conference_call">电话会</option>
                  </select>
                </label>
                <label className="block space-y-2">
                  <span className="text-xs font-medium text-foreground">重要性</span>
                  <select
                    value={form.importance}
                    onChange={(event) => setForm((current) => ({ ...current, importance: event.target.value }))}
                    className="w-full rounded-lg border border-border bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-primary/50"
                  >
                    <option value="high">3星</option>
                    <option value="medium">2星</option>
                    <option value="low">1星</option>
                  </select>
                </label>
              </div>

              <label className="block space-y-2">
                <span className="text-xs font-medium text-foreground">备注（可不填）</span>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="记录关注重点、参会链接或待办。"
                  className="w-full resize-none rounded-lg border border-border bg-black/20 px-3 py-2.5 text-sm leading-6 outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setFormOpen(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition hover:text-foreground"
              >
                取消
              </button>
              <button
                onClick={() => void submit()}
                disabled={saving}
                className="inline-flex min-w-[96px] items-center justify-center gap-1.5 rounded-lg bg-primary/15 px-4 py-2 text-sm font-medium text-primary shadow-glow transition hover:bg-primary/25 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {editingEventId ? "保存修改" : "加入日历"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => !deleting && setDeleteTarget(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-delete-title"
            className="w-full max-w-md rounded-2xl border border-border bg-background/95 p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-rose-400/10 p-2 text-rose-300">
                <Trash2 className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h3 id="calendar-delete-title" className="font-semibold">删除日历事项</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  确定删除“<span className="font-medium text-foreground">{deleteTarget.title}</span>”吗？删除后无法恢复。
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
              >
                取消
              </button>
              <button
                onClick={() => void confirmRemove()}
                disabled={deleting}
                className="inline-flex min-w-[88px] items-center justify-center gap-1.5 rounded-lg bg-rose-400/15 px-4 py-2 text-sm font-medium text-rose-200 transition hover:bg-rose-400/25 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      <Disclaimer />
    </div>
  );
}
