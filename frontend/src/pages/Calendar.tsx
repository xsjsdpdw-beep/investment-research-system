import { useEffect, useMemo, useState } from "react";
import { CalendarPlus2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Disclaimer } from "@/components/ui/Disclaimer";
import { api, ApiError, type CalendarEvent } from "@/lib/api";

export function Calendar() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [importance, setImportance] = useState("");
  const [form, setForm] = useState({
    title: "",
    date: new Date().toISOString().slice(0, 10),
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

  const grouped = useMemo(() => {
    return events.reduce<Record<string, CalendarEvent[]>>((acc, item) => {
      acc[item.date] = acc[item.date] || [];
      acc[item.date].push(item);
      return acc;
    }, {});
  }, [events]);

  const submit = async () => {
    if (!form.title.trim()) {
      toast.error("先写一个事件标题");
      return;
    }
    await api.upsertCalendarEvent(form);
    toast.success("日历事件已加入");
    setForm((prev) => ({ ...prev, title: "", notes: "" }));
    await load(importance || undefined);
  };

  return (
    <div>
      <PageHeader
        title="投资日历"
        subtitle="把未来宏观、政策、财报、电话会和你的调研行程放在一条时间线上。"
        actions={
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
        }
      />

      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <GlassCard className="space-y-3">
          <h3 className="flex items-center gap-1.5 font-semibold"><CalendarPlus2 className="h-4 w-4 text-primary" /> 新增事件</h3>
          <input value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="如：7月政治局会议" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
          <div className="grid gap-2 md:grid-cols-2">
            <input type="date" value={form.date} onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))} className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
            <input value={form.category} onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))} placeholder="macro / policy / earnings / trip" className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <select value={form.importance} onChange={(event) => setForm((prev) => ({ ...prev, importance: event.target.value }))} className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50">
              <option value="high">高优先级</option>
              <option value="medium">中优先级</option>
              <option value="low">低优先级</option>
            </select>
            <select value={form.source} onChange={(event) => setForm((prev) => ({ ...prev, source: event.target.value }))} className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50">
              <option value="manual">手动录入</option>
              <option value="ifind-ready">iFind预留</option>
              <option value="public-source">公开源</option>
            </select>
          </div>
          <textarea value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} rows={5} placeholder="写下这次事件想验证什么、需要准备什么。" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
          <button onClick={() => void submit()} className="w-full rounded-lg bg-primary/15 px-4 py-2 text-sm font-medium text-primary shadow-glow hover:bg-primary/25">加入日历</button>
        </GlassCard>

        <div className="space-y-4">
          <GlassCard>
            <h3 className="mb-3 font-semibold">近期清单</h3>
            <div className="space-y-2">
              {events.map((item) => (
                <div key={item.id} className="rounded-xl border border-border/40 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{item.title}</span>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{item.category}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{item.importance}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{item.date} · {item.source}</p>
                  {item.notes && <p className="mt-2 text-sm text-muted-foreground">{item.notes}</p>}
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard>
            <h3 className="mb-3 font-semibold">按天分组</h3>
            <div className="space-y-3">
              {Object.entries(grouped).map(([date, items]) => (
                <div key={date}>
                  <p className="mb-2 text-sm font-medium text-primary">{date}</p>
                  <div className="space-y-2">
                    {items.map((item) => (
                      <div key={item.id} className="rounded-lg bg-muted/25 px-3 py-2 text-sm">
                        <span className="font-medium">{item.title}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{item.category}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>

      <Disclaimer />
    </div>
  );
}
