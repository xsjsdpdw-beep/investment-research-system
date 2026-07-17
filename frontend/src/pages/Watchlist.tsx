import { useEffect, useMemo, useState } from "react";
import { GripVertical, Plus, RefreshCw, Search, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Disclaimer } from "@/components/ui/Disclaimer";
import { AskAiButton } from "@/components/ui/AskAiButton";
import { SectionTabs } from "@/components/ui/SectionTabs";
import { api, ApiError, type GlobalStock, type Quote, type StockSearchResult, type WatchIndicator, type WatchStock } from "@/lib/api";
import { cn } from "@/lib/utils";

type AssetRow =
  | { id: string; kind: "stock"; code: string; market: string; name: string; group: string; sort_order: number; source: WatchStock }
  | { id: string; kind: "indicator"; key: string; name: string; group: string; value: string; note: string; sort_order: number; source: WatchIndicator };

const ASSET_TYPES = [
  { key: "stock", label: "个股" },
  { key: "commodity", label: "大宗商品" },
  { key: "rate", label: "利率/债券" },
  { key: "macro", label: "宏观指标" },
  { key: "fx", label: "汇率" },
  { key: "custom", label: "自定义" },
];

const EQUITY_MARKETS = ["SZ", "SH", "BJ", "HK", "US"];

const color = (value: number | undefined | null) =>
  value == null ? "text-muted-foreground" : value > 0 ? "text-danger" : value < 0 ? "text-success" : "text-muted-foreground";

const marketLabel = (market: string) => {
  if (market === "HK") return "港股";
  if (market === "US" || market === "NASDAQ" || market === "NYSE") return "美股";
  if (market === "SH" || market === "SZ" || market === "BJ") return "A股";
  return market || "指标";
};

const primaryButtonClass = "inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButtonClass = "rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-primary";

function CompactNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border/30 bg-muted/15 px-2.5 py-1.5 text-[11px] leading-4.5 text-muted-foreground">
      {children}
    </div>
  );
}

function StatsBar({ items }: { items: Array<{ label: string; value: string | number }> }) {
  return (
    <div className="rounded-lg border border-border/30 bg-muted/12 px-2.5 py-1.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
        {items.map((item) => (
          <div key={item.label} className="inline-flex items-center gap-1.5">
            <span>{item.label}</span>
            <span className="font-medium text-foreground">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Watchlist() {
  const [stocks, setStocks] = useState<WatchStock[]>([]);
  const [indicators, setIndicators] = useState<WatchIndicator[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [globalQuotes, setGlobalQuotes] = useState<Record<string, GlobalStock>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [draggingKey, setDraggingKey] = useState("");
  const [dragOverKey, setDragOverKey] = useState("");
  const [assetType, setAssetType] = useState("stock");
  const [stockInput, setStockInput] = useState({ code: "", market: "SZ", name: "", group: "" });
  const [assetInput, setAssetInput] = useState({ key: "", label: "", category: "大宗商品", value: "待更新", note: "" });
  const [stockSearchText, setStockSearchText] = useState("");
  const [stockSearchResults, setStockSearchResults] = useState<StockSearchResult[]>([]);
  const [stockSearching, setStockSearching] = useState(false);
  const [stockSearchOpen, setStockSearchOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.watchlist();
      setStocks(data.stocks || []);
      setIndicators(data.indicators || []);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "加载关注列表失败");
    } finally {
      setLoading(false);
    }
  };

  const persist = async (nextStocks: WatchStock[], nextIndicators: WatchIndicator[]) => {
    const saved = await api.saveWatchlist({ stocks: nextStocks, indicators: nextIndicators });
    setStocks(saved.stocks || []);
    setIndicators(saved.indicators || []);
  };

  const refreshQuotes = async (items: WatchStock[]) => {
    setRefreshing(true);
    try {
      const aStocks = items.filter((item) => ["SZ", "SH", "BJ"].includes(item.market)).map((item) => item.code);
      const globalStocks = items.filter((item) => !["SZ", "SH", "BJ"].includes(item.market));
      const [aQuoteMap, globalItems] = await Promise.all([
        aStocks.length ? api.quote(aStocks.join(",")) : Promise.resolve({} as Record<string, Quote>),
        Promise.all(globalStocks.map((item) => api.globalStock(item.code).catch(() => null))),
      ]);
      setQuotes(aQuoteMap);
      setGlobalQuotes(
        globalItems.reduce<Record<string, GlobalStock>>((acc, item) => {
          if (item?.code) acc[item.code] = item;
          return acc;
        }, {}),
      );
    } catch {
      toast.error("行情刷新失败，已保留列表本身");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (stocks.length) void refreshQuotes(stocks);
    else {
      setQuotes({});
      setGlobalQuotes({});
    }
  }, [stocks]);

  useEffect(() => {
    const keyword = stockSearchText.trim();
    if (keyword.length < 2 || !["SZ", "SH", "BJ"].includes(stockInput.market)) {
      setStockSearchResults([]);
      setStockSearching(false);
      return;
    }
    let cancelled = false;
    setStockSearching(true);
    const timer = window.setTimeout(() => {
      api.stockSearch(keyword, 8)
        .then((items) => {
          if (cancelled) return;
          setStockSearchResults(items);
          setStockSearchOpen(true);
        })
        .catch(() => {
          if (!cancelled) setStockSearchResults([]);
        })
        .finally(() => {
          if (!cancelled) setStockSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [stockInput.market, stockSearchText]);

  const rows = useMemo<AssetRow[]>(() => {
    const stockRows: AssetRow[] = stocks.map((item, index) => ({
      id: `${item.code}.${item.market}`,
      kind: "stock",
      code: item.code,
      market: item.market,
      name: item.name,
      group: item.group || marketLabel(item.market),
      sort_order: item.sort_order ?? index,
      source: item,
    }));
    const indicatorRows: AssetRow[] = indicators.map((item, index) => ({
      id: item.key,
      kind: "indicator",
      key: item.key,
      name: item.label,
      group: item.category || "自定义",
      value: item.value || "待更新",
      note: item.note || "",
      sort_order: item.sort_order ?? stocks.length + index,
      source: item,
    }));
    return [...stockRows, ...indicatorRows].sort((a, b) => a.sort_order - b.sort_order);
  }, [indicators, stocks]);

  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of rows) counts.set(item.group, (counts.get(item.group) || 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const visibleRows = useMemo(
    () => (selectedGroup ? rows.filter((item) => item.group === selectedGroup) : rows),
    [rows, selectedGroup],
  );

  const stockCount = stocks.length;
  const indicatorCount = indicators.length;
  const marketBreakdown = useMemo(() => ({
    a: stocks.filter((item) => ["SZ", "SH", "BJ"].includes(item.market)).length,
    hk: stocks.filter((item) => item.market === "HK").length,
    us: stocks.filter((item) => !["SZ", "SH", "BJ", "HK"].includes(item.market)).length,
  }), [stocks]);

  const aiContext = rows.length
    ? rows.map((item) => {
        if (item.kind === "stock") {
          const aQuote = quotes[item.code];
          const gQuote = globalQuotes[item.code]?.quote;
          return `${item.name}(${item.code}.${item.market}) ${item.group} 现价${aQuote?.price ?? gQuote?.price ?? "—"} 涨跌${aQuote?.change_pct ?? gQuote?.change_pct ?? "—"}%`;
        }
        return `${item.name}(${item.key}) ${item.group} 当前值${item.value} ${item.note}`;
      }).join("\n")
    : "还没有关注对象。";

  const selectStockSuggestion = async (item: StockSearchResult) => {
    setStockInput((prev) => ({ ...prev, code: item.code, market: item.market, name: item.name }));
    setStockSearchText(item.display);
    setStockSearchOpen(false);
    try {
      const industry = await api.stockIndustry(item.code);
      setStockInput((prev) => ({ ...prev, group: industry.sw_l3 || industry.industry || prev.group }));
    } catch {
      toast.error("行业自动识别失败，可以先手动填写分组");
    }
  };

  const addStock = async () => {
    const code = stockInput.code.trim().toUpperCase();
    const market = stockInput.market.trim().toUpperCase();
    if (!code) return;
    if (stocks.some((item) => item.code === code && item.market === market)) {
      toast.error("这个标的已经在关注列表里");
      return;
    }
    let name = stockInput.name.trim() || code;
    if (!["SZ", "SH", "BJ"].includes(market)) {
      const hit = await api.globalStock(code).catch(() => null);
      if (hit?.name) name = hit.name;
    }
    const next = [...stocks, {
      code,
      market,
      name,
      group: stockInput.group.trim() || marketLabel(market),
      sort_order: rows.length,
      asset_type: "stock",
    }];
    await persist(next, indicators);
    setStockInput({ code: "", market: "SZ", name: "", group: "" });
    setStockSearchText("");
    setStockSearchResults([]);
    toast.success("已加入关注列表");
  };

  const addIndicator = async () => {
    const key = assetInput.key.trim();
    const label = assetInput.label.trim();
    if (!key || !label) return;
    if (indicators.some((item) => item.key === key)) {
      toast.error("这个关注对象已经存在");
      return;
    }
    const next = [...indicators, {
      key,
      label,
      category: assetInput.category.trim() || ASSET_TYPES.find((item) => item.key === assetType)?.label || "自定义",
      value: assetInput.value.trim() || "待更新",
      note: assetInput.note.trim(),
      sort_order: rows.length,
      asset_type: assetType,
    }];
    await persist(stocks, next);
    setAssetInput({ key: "", label: "", category: assetInput.category, value: "待更新", note: "" });
    toast.success("已加入关注列表");
  };

  const deleteRow = async (row: AssetRow) => {
    if (row.kind === "stock") {
      await persist(stocks.filter((item) => !(item.code === row.code && item.market === row.market)), indicators);
    } else {
      await persist(stocks, indicators.filter((item) => item.key !== row.key));
    }
  };

  const reorderRows = async (targetKey: string) => {
    if (!draggingKey || draggingKey === targetKey) {
      setDraggingKey("");
      setDragOverKey("");
      return;
    }
    const fromIndex = rows.findIndex((item) => item.id === draggingKey);
    const toIndex = rows.findIndex((item) => item.id === targetKey);
    if (fromIndex < 0 || toIndex < 0) return;
    const next = [...rows];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    const rank = new Map(next.map((item, index) => [item.id, index]));
    await persist(
      stocks.map((item) => ({ ...item, sort_order: rank.get(`${item.code}.${item.market}`) ?? item.sort_order ?? 0 })),
      indicators.map((item) => ({ ...item, sort_order: rank.get(item.key) ?? item.sort_order ?? 0 })),
    );
    setDraggingKey("");
    setDragOverKey("");
    toast.success("关注列表顺序已保存");
  };

  return (
    <div>
      <PageHeader
        title="关注列表"
        subtitle="只维护一份重点关注池：A股、港股、美股、大宗商品、利率和宏观指标都在这里统一增减。"
        actions={rows.length > 0 ? <AskAiButton context={aiContext} label="让 AI 看关注列表" suggestions={["帮我按资产类别复盘", "哪些对象需要放入投资日历", "这份关注池还缺什么"]} /> : undefined}
      />

      <div className="space-y-3">
        <StatsBar
          items={[
            { label: "重点个股", value: stockCount },
            { label: "重点指标", value: indicatorCount },
            { label: "A股", value: marketBreakdown.a },
            { label: "港股", value: marketBreakdown.hk },
            { label: "美股", value: marketBreakdown.us },
          ]}
        />

        <GlassCard className="space-y-2.5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium">{selectedGroup ? `${selectedGroup} · 关注对象` : "全部重点个股与重点指标"}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">{visibleRows.length} 项</span>
              <button onClick={() => void refreshQuotes(stocks)} className={secondaryButtonClass} title="刷新行情">
                <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
              </button>
            </div>
          </div>

          <CompactNotice>
            这里只维护一份高频关注池。拖动即可调整顺序，分组页签也支持拖动重排。
          </CompactNotice>

          {groups.length > 0 && (
            <SectionTabs
              tabs={[{ key: "", label: "全部" }, ...groups.map(([group, count]) => ({ key: group, label: `${group} · ${count}` }))]}
              active={selectedGroup}
              onChange={setSelectedGroup}
              draggableStorageKey="watchlist-unified-group-order"
            />
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground">正在读取关注列表…</p>
          ) : visibleRows.length === 0 ? (
            <CompactNotice>还没有关注对象。可以在下方新增 A股、港股、美股、商品或利率指标。</CompactNotice>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    {["", "名称", "代码/Key", "类型/市场", "分组", "现价/值", "涨跌%", "备注", ""].map((header) => (
                      <th key={header} className="px-2.5 py-2 font-medium">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((item) => {
                    const aQuote = item.kind === "stock" ? quotes[item.code] : undefined;
                    const gQuote = item.kind === "stock" ? globalQuotes[item.code]?.quote : undefined;
                    const pct = aQuote?.change_pct ?? gQuote?.change_pct;
                    return (
                      <tr
                        key={item.id}
                        draggable
                        onDragStart={() => {
                          setDraggingKey(item.id);
                          setDragOverKey(item.id);
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                          if (dragOverKey !== item.id) setDragOverKey(item.id);
                        }}
                        onDragLeave={() => {
                          if (dragOverKey === item.id) setDragOverKey("");
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          void reorderRows(item.id);
                        }}
                        onDragEnd={() => {
                          setDraggingKey("");
                          setDragOverKey("");
                        }}
                        className={cn(
                          "border-t border-border/20",
                          dragOverKey === item.id && draggingKey !== item.id && "bg-primary/5",
                          draggingKey === item.id && "opacity-60",
                        )}
                      >
                        <td className="px-2.5 py-2 text-muted-foreground"><GripVertical className="h-4 w-4 cursor-grab active:cursor-grabbing" /></td>
                        <td className="px-2.5 py-2 font-medium">{item.name}</td>
                        <td className="px-2.5 py-2 font-mono text-xs text-muted-foreground">{item.kind === "stock" ? `${item.code}.${item.market}` : item.key}</td>
                        <td className="px-2.5 py-2 text-muted-foreground">{item.kind === "stock" ? marketLabel(item.market) : item.group}</td>
                        <td className="px-2.5 py-2 text-muted-foreground">{item.group}</td>
                        <td className={cn("px-2.5 py-2 font-mono", item.kind === "stock" ? color(pct) : "text-primary")}>{item.kind === "stock" ? aQuote?.price ?? gQuote?.price ?? "—" : item.value}</td>
                        <td className={cn("px-2.5 py-2 font-mono", color(pct))}>{item.kind === "stock" ? pct == null ? "—" : `${pct > 0 ? "+" : ""}${pct}%` : "—"}</td>
                        <td className="max-w-[220px] truncate px-2.5 py-2 text-muted-foreground">{item.kind === "indicator" ? item.note : ""}</td>
                        <td className="px-2.5 py-2">
                          <button onClick={() => void deleteRow(item)} className="text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>

        <GlassCard className="space-y-2.5 p-3">
          <h3 className="flex items-center gap-2 font-semibold"><Plus className="h-4 w-4 text-primary" />新增关注对象</h3>
          <CompactNotice>
            股票支持 A股名称搜索下拉选择；商品、利率、汇率等对象先以代码 / Key 方式加入，后面再逐步接自动行情。
          </CompactNotice>
          <SectionTabs
            tabs={ASSET_TYPES}
            active={assetType}
            onChange={(next) => {
              setAssetType(next);
              const label = ASSET_TYPES.find((item) => item.key === next)?.label || "自定义";
              setAssetInput((prev) => ({ ...prev, category: label }));
            }}
            draggableStorageKey="watchlist-asset-type-order"
          />

          {assetType === "stock" ? (
            <div className="space-y-3">
              <div className="grid gap-2 md:grid-cols-[160px_minmax(0,1fr)]">
                <select
                  value={stockInput.market}
                  onChange={(event) => setStockInput((prev) => ({ ...prev, market: event.target.value }))}
                  className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
                >
                  {EQUITY_MARKETS.map((market) => <option key={market} value={market}>{marketLabel(market)} · {market}</option>)}
                </select>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    value={stockSearchText}
                    onChange={(event) => {
                      setStockSearchText(event.target.value);
                      setStockInput((prev) => ({ ...prev, code: event.target.value }));
                      setStockSearchOpen(true);
                    }}
                    onFocus={() => setStockSearchOpen(stockSearchResults.length > 0)}
                    placeholder={["SZ", "SH", "BJ"].includes(stockInput.market) ? "输入名称/拼音/代码搜索，例如：三一重工" : "输入港股/美股代码，例如：00700 / AAPL / NVDA"}
                    className="w-full rounded-lg border border-border bg-black/20 py-2 pl-9 pr-3 text-sm outline-none focus:border-primary/50"
                  />
                  {stockSearchOpen && ["SZ", "SH", "BJ"].includes(stockInput.market) && (stockSearchResults.length > 0 || stockSearching) && (
                    <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-xl border border-border bg-background/95 shadow-xl backdrop-blur">
                      {stockSearching && stockSearchResults.length === 0 ? (
                        <div className="px-3 py-3 text-sm text-muted-foreground">正在搜索...</div>
                      ) : (
                        stockSearchResults.map((item) => (
                          <button
                            key={`${item.code}.${item.market}`}
                            type="button"
                            onClick={() => void selectStockSuggestion(item)}
                            className="flex w-full items-center justify-between gap-3 border-b border-border/20 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-primary/10"
                          >
                            <span>
                              <span className="font-medium">{item.name}</span>
                              <span className="ml-2 font-mono text-xs text-muted-foreground">{item.code}.{item.market}</span>
                            </span>
                            <span className="text-xs text-muted-foreground">{item.security_type || item.pinyin}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-4">
                <input value={stockInput.code} onChange={(event) => setStockInput((prev) => ({ ...prev, code: event.target.value }))} placeholder="代码" className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <input value={stockInput.name} onChange={(event) => setStockInput((prev) => ({ ...prev, name: event.target.value }))} placeholder="名称，港美股可留空自动解析" className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <input value={stockInput.group} onChange={(event) => setStockInput((prev) => ({ ...prev, group: event.target.value }))} placeholder="分组/行业，A股可自动补申万三级" className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <button onClick={() => void addStock()} className={primaryButtonClass}>
                  <Plus className="h-4 w-4" /> 加入关注
                </button>
              </div>
            </div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              <input value={assetInput.key} onChange={(event) => setAssetInput((prev) => ({ ...prev, key: event.target.value }))} placeholder="代码/Key，如 COMEX_GOLD、US10Y" className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
              <input value={assetInput.label} onChange={(event) => setAssetInput((prev) => ({ ...prev, label: event.target.value }))} placeholder="名称，如 黄金、美国十年期国债收益率" className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
              <input value={assetInput.category} onChange={(event) => setAssetInput((prev) => ({ ...prev, category: event.target.value }))} placeholder="分类" className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
              <input value={assetInput.value} onChange={(event) => setAssetInput((prev) => ({ ...prev, value: event.target.value }))} placeholder="当前值，iFind 接通后自动更新" className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
              <textarea value={assetInput.note} onChange={(event) => setAssetInput((prev) => ({ ...prev, note: event.target.value }))} rows={3} placeholder="备注 / 跟踪要点" className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50 md:col-span-2" />
              <button onClick={() => void addIndicator()} className={`${primaryButtonClass} md:col-span-2`}>加入关注</button>
            </div>
          )}
        </GlassCard>
      </div>

      <Disclaimer />
    </div>
  );
}
