import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Disclaimer } from "@/components/ui/Disclaimer";
import { AskAiButton } from "@/components/ui/AskAiButton";
import { api, ApiError, type Quote, type WatchIndicator, type WatchStock } from "@/lib/api";
import { cn } from "@/lib/utils";

const color = (value: number | undefined) =>
  value == null ? "text-muted-foreground" : value > 0 ? "text-danger" : value < 0 ? "text-success" : "text-muted-foreground";

export function Watchlist() {
  const [stocks, setStocks] = useState<WatchStock[]>([]);
  const [indicators, setIndicators] = useState<WatchIndicator[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [stockInput, setStockInput] = useState({ code: "", market: "SZ", name: "", group: "" });
  const [indicatorInput, setIndicatorInput] = useState({ key: "", label: "", category: "", value: "", note: "" });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.watchlist();
      setStocks(data.stocks);
      setIndicators(data.indicators);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "加载关注列表失败");
    } finally {
      setLoading(false);
    }
  };

  const refreshQuotes = async (items: WatchStock[]) => {
    const codes = items.filter((item) => item.market === "SZ" || item.market === "SH").map((item) => item.code);
    if (!codes.length) {
      setQuotes({});
      return;
    }
    setRefreshing(true);
    try {
      setQuotes(await api.quote(codes.join(",")));
    } catch {
      toast.error("行情刷新失败");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (stocks.length) void refreshQuotes(stocks);
  }, [stocks]);

  const persist = async (nextStocks: WatchStock[], nextIndicators: WatchIndicator[]) => {
    const saved = await api.saveWatchlist({ stocks: nextStocks, indicators: nextIndicators });
    setStocks(saved.stocks);
    setIndicators(saved.indicators);
  };

  const addStock = async () => {
    if (!stockInput.code.trim()) return;
    const next = [...stocks, {
      code: stockInput.code.trim(),
      market: stockInput.market.trim().toUpperCase(),
      name: stockInput.name.trim() || stockInput.code.trim(),
      group: stockInput.group.trim() || "未分组",
      sort_order: stocks.length,
    }];
    await persist(next, indicators);
    setStockInput({ code: "", market: "SZ", name: "", group: "" });
    toast.success("已加入关注列表");
  };

  const addIndicator = async () => {
    if (!indicatorInput.key.trim() || !indicatorInput.label.trim()) return;
    const next = [...indicators, {
      key: indicatorInput.key.trim(),
      label: indicatorInput.label.trim(),
      category: indicatorInput.category.trim() || "自定义",
      value: indicatorInput.value.trim() || "待更新",
      note: indicatorInput.note.trim() || "",
    }];
    await persist(stocks, next);
    setIndicatorInput({ key: "", label: "", category: "", value: "", note: "" });
    toast.success("指标已加入关注列表");
  };

  const groupedStocks = useMemo(() => {
    return stocks.reduce<Record<string, WatchStock[]>>((acc, item) => {
      const group = item.group || "未分组";
      acc[group] = acc[group] || [];
      acc[group].push(item);
      return acc;
    }, {});
  }, [stocks]);

  const aiContext = stocks.length
    ? stocks.map((item) => {
        const quote = quotes[item.code];
        return `${item.name}(${item.code}.${item.market}) ${item.group} 现价${quote?.price ?? "—"} 涨跌${quote?.change_pct ?? "—"}%`;
      }).join("\n")
    : "还没有关注对象。";

  return (
    <div>
      <PageHeader
        title="关注列表"
        subtitle="把重点个股和关键指标集中维护，后续个股动态、周复盘和个股中心都直接引用这里。"
        actions={stocks.length > 0 ? <AskAiButton context={aiContext} label="让 AI 看关注列表" suggestions={["帮我按行业分组", "哪些标的需要重点跟踪", "这份列表还缺什么"]} /> : undefined}
      />

      <div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="space-y-4">
          <GlassCard className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 font-semibold"><Star className="h-4 w-4 text-primary" /> 重点个股</h3>
              <button onClick={() => void refreshQuotes(stocks)} className="text-muted-foreground hover:text-primary" title="刷新行情">
                <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
              </button>
            </div>
            <div className="grid gap-2 md:grid-cols-4">
              <input value={stockInput.code} onChange={(event) => setStockInput((prev) => ({ ...prev, code: event.target.value }))} placeholder="代码" className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
              <input value={stockInput.market} onChange={(event) => setStockInput((prev) => ({ ...prev, market: event.target.value }))} placeholder="市场 SH/SZ/HK/US" className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
              <input value={stockInput.name} onChange={(event) => setStockInput((prev) => ({ ...prev, name: event.target.value }))} placeholder="名称" className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
              <div className="flex gap-2">
                <input value={stockInput.group} onChange={(event) => setStockInput((prev) => ({ ...prev, group: event.target.value }))} placeholder="分组/行业" className="min-w-0 flex-1 rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <button onClick={() => void addStock()} className="rounded-lg bg-primary/15 px-3 py-2 text-primary hover:bg-primary/25"><Plus className="h-4 w-4" /></button>
              </div>
            </div>
            {loading ? (
              <p className="text-sm text-muted-foreground">正在读取关注列表…</p>
            ) : (
              Object.entries(groupedStocks).map(([group, items]) => (
                <div key={group} className="rounded-xl border border-border/40">
                  <div className="border-b border-border/40 px-3 py-2 text-sm font-medium">{group}</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground">
                          {["名称", "代码", "现价", "涨跌%", "PE", "PB", ""].map((header) => (
                            <th key={header} className="px-3 py-2 font-medium">{header}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => {
                          const quote = quotes[item.code];
                          return (
                            <tr key={`${item.code}.${item.market}`} className="border-t border-border/20">
                              <td className="px-3 py-2">{item.name}</td>
                              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{item.code}.{item.market}</td>
                              <td className={cn("px-3 py-2 font-mono", color(quote?.change_pct))}>{quote?.price ?? "—"}</td>
                              <td className={cn("px-3 py-2 font-mono", color(quote?.change_pct))}>{quote?.change_pct == null ? "—" : `${quote.change_pct > 0 ? "+" : ""}${quote.change_pct}%`}</td>
                              <td className="px-3 py-2 font-mono text-muted-foreground">{quote?.pe_ttm ?? "—"}</td>
                              <td className="px-3 py-2 font-mono text-muted-foreground">{quote?.pb ?? "—"}</td>
                              <td className="px-3 py-2">
                                <button
                                  onClick={() => void persist(stocks.filter((stock) => !(stock.code === item.code && stock.market === item.market)), indicators)}
                                  className="text-muted-foreground hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </GlassCard>
        </div>

        <div className="space-y-4">
          <GlassCard className="space-y-3">
            <h3 className="font-semibold">重点指标</h3>
            <div className="space-y-2">
              <input value={indicatorInput.key} onChange={(event) => setIndicatorInput((prev) => ({ ...prev, key: event.target.value }))} placeholder="key，如 cn_cpi" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
              <input value={indicatorInput.label} onChange={(event) => setIndicatorInput((prev) => ({ ...prev, label: event.target.value }))} placeholder="展示名称" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
              <input value={indicatorInput.category} onChange={(event) => setIndicatorInput((prev) => ({ ...prev, category: event.target.value }))} placeholder="分类" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
              <input value={indicatorInput.value} onChange={(event) => setIndicatorInput((prev) => ({ ...prev, value: event.target.value }))} placeholder="最新值" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
              <textarea value={indicatorInput.note} onChange={(event) => setIndicatorInput((prev) => ({ ...prev, note: event.target.value }))} rows={3} placeholder="备注 / 跟踪要点" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
              <button onClick={() => void addIndicator()} className="w-full rounded-lg bg-primary/15 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/25">新增指标</button>
            </div>
          </GlassCard>

          <div className="space-y-3">
            {indicators.map((item) => (
              <GlassCard key={item.key} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{item.label}</span>
                  <button onClick={() => void persist(stocks, indicators.filter((indicator) => indicator.key !== item.key))} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                </div>
                <p className="text-lg font-bold text-primary">{item.value}</p>
                <p className="text-xs text-muted-foreground">{item.category}</p>
                {item.note && <p className="text-sm text-muted-foreground">{item.note}</p>}
              </GlassCard>
            ))}
          </div>
        </div>
      </div>

      <Disclaimer />
    </div>
  );
}
