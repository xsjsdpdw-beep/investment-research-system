import { useEffect, useMemo, useState } from "react";
import { CalendarPlus2, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Disclaimer } from "@/components/ui/Disclaimer";
import { SectionTabs } from "@/components/ui/SectionTabs";
import { api, ApiError, type CalendarEvent } from "@/lib/api";

type CalendarView = "day" | "week" | "month";

const VIEW_TABS = [
  { key: "day", label: "日度" },
  { key: "week", label: "周度" },
  { key: "month", label: "月度" },
];

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

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
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(date, diff);
}

function startOfMonthGrid(date: Date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  return startOfWeek(first);
}

function formatHeader(date: Date, view: CalendarView) {
  if (view === "day") return toKey(date);
  if (view === "week") {
    const start = startOfWeek(date);
    const end = addDays(start, 6);
    return `${toKey(start)} - ${toKey(end)}`;
  }
  return `${date.getFullYear()}年${String(date.getMonth() + 1).padStart(2, "0")}月`;
}

function eventTone(item: CalendarEvent) {
  if (item.importance === "high") return "border-primary/40 bg-primary/12 text-foreground";
  if (item.category === "earnings" || item.category === "conference_call") return "border-sky-400/30 bg-sky-400/10 text-foreground";
  return "border-border/40 bg-black/15 text-foreground";
}

export function Calendar() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [importance, setImportance] = useState("");
  const [view, setView] = useState<CalendarView>("month");
  const [anchorDate, setAnchorDate] = useState(todayKey());
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: "",
    date: todayKey(),
    category: "manual",
    importance: "medium",
    source: "manual",
    notes: "",
  });

  const load = async (level?: string) => {
    try {
      setEvents(await api.calendarEvents({ view: "upcoming", importance: level || undefined }));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "加载投资日历失败");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const eventsByDate = useMemo(() => {
    return events.reduce<Record<string, CalendarEvent[]>>((acc, item) => {
      acc[item.date] = acc[item.date] || [];
      acc[item.date].push(item);
      return acc;
    }, {});
  }, [events]);

  const selectedEvents = eventsByDate[selectedDate] || [];
  const anchor = toDate(anchorDate);
  const selected = toDate(selectedDate);

  const dayCells = useMemo(() => {
    if (view === "day") return [anchor];
    if (view === "week") {
      const start = startOfWeek(anchor);
      return Array.from({ length: 7 }, (_, index) => addDays(start, index));
    }
    const start = startOfMonthGrid(anchor);
    return Array.from({ length: 42 }, (_, index) => addDays(start, index));
  }, [anchor, view]);

  const submit = async () => {
    if (!form.title.trim()) {
      toast.error("先写一个事件标题");
      return;
    }
    try {
      await api.upsertCalendarEvent(form);
      toast.success("日历事件已加入");
      setForm((prev) => ({ ...prev, title: "", notes: "" }));
      setShowForm(false);
      setSelectedDate(form.date);
      setAnchorDate(form.date);
      await load(importance || undefined);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "保存日历事件失败");
    }
  };

  const shiftRange = (direction: -1 | 1) => {
    const next = new Date(anchor);
    if (view === "day") next.setDate(next.getDate() + direction);
    if (view === "week") next.setDate(next.getDate() + direction * 7);
    if (view === "month") next.setMonth(next.getMonth() + direction);
    const key = toKey(next);
    setAnchorDate(key);
    setSelectedDate(key);
  };

  return (
    <div>
      <PageHeader
        title="投资日历"
        subtitle="以日历形式管理宏观事件、重点行业与个股财报/电话会，以及你自己的调研安排。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={importance}
              onChange={(event) => {
                const next = event.target.value;
                setImportance(next);
                void load(next || undefined);
              }}
              className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none"
            >
              <option value="">全部重要度</option>
              <option value="high">仅高优先级</option>
              <option value="medium">中优先级</option>
              <option value="low">低优先级</option>
            </select>
            <button
              onClick={() => {
                const today = todayKey();
                setAnchorDate(today);
                setSelectedDate(today);
              }}
              className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              今天
            </button>
            <button
              onClick={() => setShowForm((prev) => !prev)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-3 py-2 text-sm font-medium text-primary shadow-glow hover:bg-primary/25"
            >
              <CalendarPlus2 className="h-4 w-4" />
              新增事件
            </button>
          </div>
        }
      />

      <div className="space-y-4">
        {showForm && (
          <GlassCard className="space-y-3">
            <h3 className="flex items-center gap-1.5 font-semibold">
              <CalendarPlus2 className="h-4 w-4 text-primary" />
              新增事件
            </h3>
            <input
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="如：宁德时代业绩电话会 / 7月政治局会议"
              className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
            />
            <div className="grid gap-2 md:grid-cols-4">
              <input
                type="date"
                value={form.date}
                onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
                className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
              />
              <input
                value={form.category}
                onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
                placeholder="macro / earnings / conference_call / trip"
                className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
              />
              <select
                value={form.importance}
                onChange={(event) => setForm((prev) => ({ ...prev, importance: event.target.value }))}
                className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
              >
                <option value="high">高优先级</option>
                <option value="medium">中优先级</option>
                <option value="low">低优先级</option>
              </select>
              <select
                value={form.source}
                onChange={(event) => setForm((prev) => ({ ...prev, source: event.target.value }))}
                className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
              >
                <option value="manual">手动录入</option>
                <option value="ifind-ready">iFind预留</option>
                <option value="public-source">公开源</option>
              </select>
            </div>
            <textarea
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              rows={4}
              placeholder="写下这次事件的重要性、准备点、需要跟踪的变量。"
              className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
            />
            <div className="flex justify-end">
              <button onClick={() => void submit()} className="rounded-lg bg-primary/15 px-4 py-2 text-sm font-medium text-primary shadow-glow hover:bg-primary/25">
                加入日历
              </button>
            </div>
          </GlassCard>
        )}

        <GlassCard className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionTabs tabs={VIEW_TABS} active={view} onChange={(next) => setView(next as CalendarView)} />
            <div className="flex items-center gap-2">
              <button onClick={() => shiftRange(-1)} className="rounded-lg border border-border px-2.5 py-2 text-muted-foreground hover:text-foreground">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="min-w-[180px] text-center text-sm font-medium text-foreground">{formatHeader(anchor, view)}</div>
              <button onClick={() => shiftRange(1)} className="rounded-lg border border-border px-2.5 py-2 text-muted-foreground hover:text-foreground">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {view !== "day" && (
            <div className={`grid gap-3 ${view === "week" ? "grid-cols-7" : "grid-cols-7"}`}>
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} className="px-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  周{label}
                </div>
              ))}
              {dayCells.map((date) => {
                const key = toKey(date);
                const dayEvents = eventsByDate[key] || [];
                const isSelected = key === selectedDate;
                const isToday = key === todayKey();
                const inMonth = date.getMonth() === anchor.getMonth();
                return (
                  <button
                    key={key}
                    onClick={() => {
                      setSelectedDate(key);
                      setAnchorDate(key);
                    }}
                    className={`min-h-[136px] rounded-2xl border p-3 text-left transition ${
                      isSelected ? "border-primary/60 bg-primary/10 shadow-glow" : "border-border/40 bg-black/10 hover:border-primary/30 hover:bg-primary/5"
                    } ${!inMonth && view === "month" ? "opacity-45" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm font-medium ${isToday ? "text-primary" : "text-foreground"}`}>{date.getDate()}</span>
                      <span className="text-[11px] text-muted-foreground">{dayEvents.length}项</span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {dayEvents.slice(0, view === "week" ? 3 : 4).map((item) => (
                        <div key={item.id} className={`rounded-lg border px-2 py-1.5 text-[11px] leading-4 ${eventTone(item)}`}>
                          <div className="truncate font-medium">{item.title}</div>
                          <div className="mt-0.5 truncate text-muted-foreground">{item.category}</div>
                        </div>
                      ))}
                      {dayEvents.length > (view === "week" ? 3 : 4) && (
                        <div className="text-[11px] text-muted-foreground">还有 {dayEvents.length - (view === "week" ? 3 : 4)} 项…</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {view === "day" && (
            <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
              <div className="rounded-2xl border border-primary/40 bg-primary/10 p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-primary/80">选中日期</p>
                <p className="mt-3 text-2xl font-semibold text-foreground">{selected.getDate()}</p>
                <p className="mt-1 text-sm text-muted-foreground">{selectedDate}</p>
              </div>
              <div className="rounded-2xl border border-border/40 bg-black/10 p-4">
                <p className="mb-3 text-sm font-medium">当日事件</p>
                <div className="space-y-3">
                  {selectedEvents.length === 0 ? (
                    <div className="rounded-xl bg-muted/20 px-3 py-4 text-sm text-muted-foreground">这一天还没有事件。可以直接新增，或等待自动抓取的财报/电话会/宏观事件更新进来。</div>
                  ) : (
                    selectedEvents.map((item) => (
                      <div key={item.id} className={`rounded-xl border px-4 py-3 ${eventTone(item)}`}>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{item.title}</p>
                          <span className="rounded-full bg-black/15 px-2 py-0.5 text-[11px] text-muted-foreground">{item.category}</span>
                          <span className="rounded-full bg-black/15 px-2 py-0.5 text-[11px] text-muted-foreground">{item.source}</span>
                        </div>
                        {item.notes && <p className="mt-2 text-sm text-muted-foreground">{item.notes}</p>}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </GlassCard>

        <GlassCard className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">选中日期事件</h3>
            <span className="text-xs text-muted-foreground">{selectedDate}</span>
          </div>
          {selectedEvents.length === 0 ? (
            <div className="rounded-xl bg-muted/20 px-3 py-4 text-sm text-muted-foreground">当前日期没有事件。自动抓取的宏观、重点行业、个股财报和电话会时间会继续进来，你也可以手动补充。</div>
          ) : (
            <div className="space-y-3">
              {selectedEvents.map((item) => (
                <div key={item.id} className="rounded-xl border border-border/40 bg-muted/20 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{item.title}</p>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{item.category}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{item.importance}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{item.source}</span>
                  </div>
                  {item.notes && <p className="mt-2 text-sm text-muted-foreground">{item.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>

      <Disclaimer />
    </div>
  );
}
