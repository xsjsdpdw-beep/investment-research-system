import { useEffect, useMemo, useState } from "react";
import { CalendarPlus2, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
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
  return addDays(date, day === 0 ? -6 : 1 - day);
}

function startOfMonthGrid(date: Date) {
  return startOfWeek(new Date(date.getFullYear(), date.getMonth(), 1));
}

function formatHeader(date: Date, view: CalendarView) {
  if (view === "day") return toKey(date);
  if (view === "week") {
    const start = startOfWeek(date);
    return `${toKey(start)} - ${toKey(addDays(start, 6))}`;
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
  const [quickFormOpen, setQuickFormOpen] = useState(false);
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

  useEffect(() => {
    setForm((prev) => ({ ...prev, date: selectedDate }));
  }, [selectedDate]);

  const eventsByDate = useMemo(() => {
    return events.reduce<Record<string, CalendarEvent[]>>((acc, item) => {
      acc[item.date] = acc[item.date] || [];
      acc[item.date].push(item);
      return acc;
    }, {});
  }, [events]);

  const anchor = toDate(anchorDate);
  const selected = toDate(selectedDate);
  const selectedEvents = eventsByDate[selectedDate] || [];

  const dayCells = useMemo(() => {
    if (view === "day") return [anchor];
    if (view === "week") {
      const start = startOfWeek(anchor);
      return Array.from({ length: 7 }, (_, index) => addDays(start, index));
    }
    const start = startOfMonthGrid(anchor);
    return Array.from({ length: 42 }, (_, index) => addDays(start, index));
  }, [anchor, view]);

  const selectDate = (key: string, openForm = false) => {
    setSelectedDate(key);
    setAnchorDate(key);
    if (openForm) setQuickFormOpen(true);
  };

  const shiftRange = (direction: -1 | 1) => {
    const next = new Date(anchor);
    if (view === "day") next.setDate(next.getDate() + direction);
    if (view === "week") next.setDate(next.getDate() + direction * 7);
    if (view === "month") next.setMonth(next.getMonth() + direction);
    selectDate(toKey(next));
  };

  const submit = async () => {
    if (!form.title.trim()) {
      toast.error("先写一个事件标题");
      return;
    }
    try {
      await api.upsertCalendarEvent({ ...form, date: selectedDate });
      toast.success("日历事件已加入");
      setForm((prev) => ({ ...prev, title: "", notes: "" }));
      setQuickFormOpen(false);
      await load(importance || undefined);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "保存日历事件失败");
    }
  };

  return (
    <div>
      <PageHeader
        title="投资日历"
        subtitle="日历化跟踪宏观事件、关注列表个股财报/电话会，以及你自己的调研安排。"
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
            <button onClick={() => selectDate(todayKey(), true)} className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
              今天
            </button>
          </div>
        }
      />

      <div className="space-y-4">
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
            <div className="grid grid-cols-7 gap-3">
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} className="px-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">周{label}</div>
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
                    onClick={() => selectDate(key, true)}
                    className={`min-h-[136px] rounded-2xl border p-3 text-left transition ${
                      isSelected ? "border-primary/60 bg-primary/10 shadow-glow" : "border-border/40 bg-black/10 hover:border-primary/30 hover:bg-primary/5"
                    } ${!inMonth && view === "month" ? "opacity-45" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm font-medium ${isToday ? "text-primary" : "text-foreground"}`}>{date.getDate()}</span>
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Plus className="h-3 w-3" />{dayEvents.length}项</span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {dayEvents.slice(0, view === "week" ? 3 : 4).map((item) => (
                        <div key={item.id} className={`rounded-lg border px-2 py-1.5 text-[11px] leading-4 ${eventTone(item)}`}>
                          <div className="truncate font-medium">{item.title}</div>
                          <div className="mt-0.5 truncate text-muted-foreground">{item.category}</div>
                        </div>
                      ))}
                      {dayEvents.length > (view === "week" ? 3 : 4) && (
                        <div className="text-[11px] text-muted-foreground">还有 {dayEvents.length - (view === "week" ? 3 : 4)} 项...</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {view === "day" && (
            <button onClick={() => setQuickFormOpen(true)} className="w-full rounded-2xl border border-primary/40 bg-primary/10 p-5 text-left transition hover:border-primary/70 hover:bg-primary/15">
              <p className="text-xs uppercase tracking-[0.2em] text-primary/80">选中日期</p>
              <p className="mt-3 text-2xl font-semibold text-foreground">{selected.getDate()}</p>
              <p className="mt-1 text-sm text-muted-foreground">{selectedDate} · 点击新增事件</p>
            </button>
          )}
        </GlassCard>

        <GlassCard className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">当日事件</h3>
            <span className="text-xs text-muted-foreground">{selectedDate}</span>
          </div>
          {selectedEvents.length === 0 ? (
            <button onClick={() => setQuickFormOpen(true)} className="w-full rounded-xl bg-muted/20 px-3 py-4 text-left text-sm text-muted-foreground transition hover:bg-primary/10 hover:text-foreground">
              这一天还没有事件。点击这里直接新增；关注列表个股财报/电话会和宏观事件会从 iFind/数据源接口自动合并进来。
            </button>
          ) : (
            <div className="space-y-3">
              {selectedEvents.map((item) => (
                <div key={item.id} className={`rounded-xl border px-4 py-3 ${eventTone(item)}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{item.title}</p>
                    <span className="rounded-full bg-black/15 px-2 py-0.5 text-[11px] text-muted-foreground">{item.category}</span>
                    <span className="rounded-full bg-black/15 px-2 py-0.5 text-[11px] text-muted-foreground">{item.importance}</span>
                    <span className="rounded-full bg-black/15 px-2 py-0.5 text-[11px] text-muted-foreground">{item.source}</span>
                  </div>
                  {item.notes && <p className="mt-2 text-sm text-muted-foreground">{item.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>

      {quickFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={() => setQuickFormOpen(false)}>
          <div className="w-full max-w-xl rounded-3xl border border-border bg-background/95 p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-1.5 font-semibold">
                <CalendarPlus2 className="h-4 w-4 text-primary" />
                在 {selectedDate} 新增事件
              </h3>
              <button onClick={() => setQuickFormOpen(false)} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="如：调研三一重工 / 美国 CPI / 业绩电话会"
              className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
            />
            <select
              value={form.importance}
              onChange={(event) => setForm((prev) => ({ ...prev, importance: event.target.value }))}
              className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
            >
              <option value="high">高优先级</option>
              <option value="medium">中优先级</option>
              <option value="low">低优先级</option>
            </select>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setQuickFormOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
                取消
              </button>
              <button onClick={() => void submit()} className="rounded-lg bg-primary/15 px-4 py-2 text-sm font-medium text-primary shadow-glow hover:bg-primary/25">
                加入当天日历
              </button>
            </div>
          </div>
        </div>
      )}

      <Disclaimer />
    </div>
  );
}
