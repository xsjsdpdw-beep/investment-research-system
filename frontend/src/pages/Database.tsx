import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BarChart3, DatabaseZap, FileSpreadsheet, Filter, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Disclaimer } from "@/components/ui/Disclaimer";
import { SectionTabs } from "@/components/ui/SectionTabs";
import { api, ApiError, type DatabaseModuleRegistry, type MacroOverviewData, type MacroRegistryData, type ProviderStatusData } from "@/lib/api";
import { StockData } from "@/pages/StockData";
import { DATABASE_TABS } from "@/lib/workspace";

const CHINA_MACRO_TABS = [
  { key: "providers", label: "数据源" },
  { key: "registry", label: "指标注册" },
  { key: "overview", label: "总览表" },
  { key: "heatmap", label: "结构热力表" },
  { key: "trend", label: "核心项走势" },
];

const DATABASE_STATIC_META: Record<string, { label: string; description: string; status: "sample_ready" | "skeleton" }> = {
  "stock-data": {
    label: "个股数据",
    description: "复用原系统的单票客观数据工作台，覆盖行情、估值、财务、公告、研报、资金面与美港股数据。",
    status: "sample_ready",
  },
  "china-macro": {
    label: "中国宏观数据库",
    description: "用总览表、结构热力表和核心项走势承接宏观样板页，并预留 iFind 适配接口。",
    status: "sample_ready",
  },
  registry: {
    label: "模块注册骨架",
    description: "数据库骨架和后续扩展入口，用于注册你自己的行业图谱、业绩跟踪、中观数据库等页面。",
    status: "skeleton",
  },
};

export function Database() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [active, setActive] = useState("china-macro");
  const [macroView, setMacroView] = useState("overview");
  const [macro, setMacro] = useState<MacroOverviewData | null>(null);
  const [providers, setProviders] = useState<ProviderStatusData | null>(null);
  const [registry, setRegistry] = useState<MacroRegistryData | null>(null);
  const [moduleRegistry, setModuleRegistry] = useState<DatabaseModuleRegistry | null>(null);
  const [moduleForm, setModuleForm] = useState({ key: "", label: "", description: "" });
  const [indicatorForm, setIndicatorForm] = useState({
    groupKey: "overview",
    key: "",
    label: "",
    freq: "月度",
    public_key: "",
    ifind_code: "",
  });

  useEffect(() => {
    void Promise.all([api.chinaMacroOverview(), api.databaseProviders(), api.chinaMacroRegistry(), api.databaseModules()]).then(([macroData, providerData, registryData, modulesData]) => {
      setMacro(macroData);
      setProviders(providerData);
      setRegistry(registryData);
      setModuleRegistry(modulesData);
    }).catch((error) => {
      toast.error(error instanceof ApiError ? error.message : "数据库样板加载失败");
    });
  }, []);

  useEffect(() => {
    const sub = searchParams.get("sub");
    if (sub && sub !== active) {
      setActive(sub);
      return;
    }
    if (!sub) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("sub", active);
        return next;
      }, { replace: true });
    }
  }, [active, searchParams, setSearchParams]);

  const heatRange = useMemo(() => {
    const values = macro?.heatmap.rows.flatMap((row) => row.values) || [0];
    return { min: Math.min(...values), max: Math.max(...values) };
  }, [macro]);

  const colorOf = (value: number) => {
    const ratio = (value - heatRange.min) / Math.max(heatRange.max - heatRange.min, 0.001);
    const alpha = 0.15 + ratio * 0.45;
    return `rgba(243, 93, 43, ${alpha.toFixed(3)})`;
  };

  const addIndicator = () => {
    if (!registry || !indicatorForm.key.trim() || !indicatorForm.label.trim()) {
      toast.error("指标 key 和名称都要填");
      return;
    }
    const next = {
      ...registry,
      groups: registry.groups.map((group) => group.key === indicatorForm.groupKey
        ? {
            ...group,
            items: [...group.items, {
              key: indicatorForm.key.trim(),
              label: indicatorForm.label.trim(),
              freq: indicatorForm.freq.trim(),
              public_key: indicatorForm.public_key.trim() || indicatorForm.key.trim(),
              ifind_code: indicatorForm.ifind_code.trim(),
            }],
          }
        : group),
    };
    setRegistry(next);
    setIndicatorForm((prev) => ({ ...prev, key: "", label: "", public_key: "", ifind_code: "" }));
  };

  const saveRegistry = async () => {
    if (!registry) return;
    try {
      setRegistry(await api.saveChinaMacroRegistry(registry));
      toast.success("指标注册表已保存");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "保存注册表失败");
    }
  };

  const reloadModules = async () => {
    setModuleRegistry(await api.databaseModules());
  };

  const addCustomModule = async () => {
    if (!moduleForm.label.trim()) {
      toast.error("模块名称要填");
      return;
    }
    try {
      const module = await api.upsertDatabaseModule({
        key: moduleForm.key.trim(),
        label: moduleForm.label.trim(),
        description: moduleForm.description.trim(),
      });
      await reloadModules();
      setActive(module.key);
      setModuleForm({ key: "", label: "", description: "" });
      toast.success("自定义子模块已新增");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "新增子模块失败");
    }
  };

  const activeModule = moduleRegistry?.modules.find((item) => item.key === active)
    || (DATABASE_STATIC_META[active]
      ? {
          key: active,
          label: DATABASE_STATIC_META[active].label,
          status: DATABASE_STATIC_META[active].status,
          description: DATABASE_STATIC_META[active].description,
          filters: [],
          containers: [],
        }
      : undefined);

  const databaseTabs = useMemo(() => {
    const customTabs = (moduleRegistry?.modules || [])
      .filter((item) => !DATABASE_TABS.some((tab) => tab.key === item.key))
      .map((item) => ({ key: item.key, label: item.label }));
    return [...DATABASE_TABS, ...customTabs];
  }, [moduleRegistry]);

  return (
    <div>
      <PageHeader
        title="数据库"
        subtitle="一期把数据库七个子模块入口、筛选条、图表容器、表格容器和数据源适配位置搭起来。"
      />
      <div className="space-y-4">
        <SectionTabs tabs={databaseTabs} active={active} onChange={setActive} draggableStorageKey="database-module-order" />
        <div>
      {activeModule && (
        <GlassCard className="mb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold">{activeModule.label}</h3>
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${activeModule.status === "sample_ready" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {activeModule.status === "sample_ready" ? "已有样板" : "骨架占位"}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{activeModule.description}</p>
            </div>
            <div className="rounded-lg border border-border/40 px-3 py-2 text-xs text-muted-foreground">
              数据源：{active === "china-macro" ? macro?.provider || "public" : "placeholder / iFind 预留"}
            </div>
          </div>
        </GlassCard>
      )}

      <GlassCard className="mb-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold">新增自定义子模块</h3>
            <p className="mt-1 text-sm text-muted-foreground">用于预留你自己的数据库页面，例如“海外流动性”“工程机械中观指标”“政策事件库”。</p>
          </div>
          <button onClick={() => void addCustomModule()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/25">
            <Plus className="h-4 w-4" /> 新增模块
          </button>
        </div>
        <div className="grid gap-2 md:grid-cols-[0.8fr_1fr_2fr]">
          <input
            value={moduleForm.key}
            onChange={(event) => setModuleForm((prev) => ({ ...prev, key: event.target.value }))}
            placeholder="模块 key：global-liquidity"
            className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none"
          />
          <input
            value={moduleForm.label}
            onChange={(event) => setModuleForm((prev) => ({ ...prev, label: event.target.value }))}
            placeholder="模块名称：海外流动性数据库"
            className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none"
          />
          <input
            value={moduleForm.description}
            onChange={(event) => setModuleForm((prev) => ({ ...prev, description: event.target.value }))}
            placeholder="用途说明：跟踪美元流动性、海外利率和主要央行资产负债表"
            className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none"
          />
        </div>
      </GlassCard>

      {active === "stock-data" ? (
        <StockData />
      ) : active === "china-macro" ? (
        <div className="space-y-4">
          <SectionTabs tabs={CHINA_MACRO_TABS} active={macroView} onChange={setMacroView} draggableStorageKey="database-china-macro-view-order" />
          {macroView === "providers" && (
          <GlassCard>
            <h3 className="mb-3 font-semibold">数据源状态</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {providers && Object.entries(providers.providers).map(([key, item]) => (
                <div key={key} className="rounded-lg border border-border/40 px-3 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{item.label}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${item.ready ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {item.ready ? "已就绪" : item.enabled ? "待配置" : "未启用"}
                    </span>
                  </div>
                  <p className="mt-2 text-muted-foreground">{item.notes}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              当前 `china_macro_overview` 使用 `{macro?.provider || providers?.china_macro_overview.active_provider || "public"}`，未就绪时自动回退到公开源样板。
            </p>
          </GlassCard>
          )}

          {macroView === "registry" && (
          <GlassCard>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">指标注册表</h3>
              <button onClick={() => void saveRegistry()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/25">
                <Save className="h-4 w-4" /> 保存
              </button>
            </div>
            <div className="mb-4 grid gap-2 md:grid-cols-6">
              <select value={indicatorForm.groupKey} onChange={(event) => setIndicatorForm((prev) => ({ ...prev, groupKey: event.target.value }))} className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none">
                {registry?.groups.map((group) => <option key={group.key} value={group.key}>{group.label}</option>)}
              </select>
              <input value={indicatorForm.key} onChange={(event) => setIndicatorForm((prev) => ({ ...prev, key: event.target.value }))} placeholder="key" className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none" />
              <input value={indicatorForm.label} onChange={(event) => setIndicatorForm((prev) => ({ ...prev, label: event.target.value }))} placeholder="指标名称" className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none" />
              <input value={indicatorForm.freq} onChange={(event) => setIndicatorForm((prev) => ({ ...prev, freq: event.target.value }))} placeholder="频率" className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none" />
              <input value={indicatorForm.ifind_code} onChange={(event) => setIndicatorForm((prev) => ({ ...prev, ifind_code: event.target.value }))} placeholder="iFind编码" className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none" />
              <button onClick={addIndicator} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-primary">
                <Plus className="h-4 w-4" /> 新增
              </button>
            </div>
            <div className="space-y-4">
              {registry?.groups.map((group) => (
                <div key={group.key}>
                  <p className="mb-2 text-sm font-medium text-primary">{group.label}</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground">
                          <th className="px-3 py-2">指标</th>
                          <th className="px-3 py-2">频率</th>
                          <th className="px-3 py-2">公开源Key</th>
                          <th className="px-3 py-2">iFind编码</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map((item) => (
                          <tr key={item.key} className="border-t border-border/20">
                            <td className="px-3 py-2 font-medium">{item.label}</td>
                            <td className="px-3 py-2">{item.freq}</td>
                            <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{item.public_key}</td>
                            <td className="px-3 py-2 font-mono text-xs text-primary">{item.ifind_code}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
          )}

          {macroView === "overview" && (
          <GlassCard>
            <h3 className="mb-3 flex items-center gap-2 font-semibold"><DatabaseZap className="h-4 w-4 text-primary" /> 总览</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2">指标</th>
                    <th className="px-3 py-2">频率</th>
                    {macro?.heatmap.columns.map((item) => <th key={item} className="px-3 py-2">{item}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {macro?.overview_rows.map((row) => (
                    <tr key={row.label} className="border-t border-border/30">
                      <td className="px-3 py-2 font-medium">{row.label}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.freq}</td>
                      {row.values.map((value, index) => <td key={`${row.label}-${index}`} className="px-3 py-2 font-mono">{value}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
          )}

          {macroView === "heatmap" && (
          <GlassCard>
            <h3 className="mb-3 font-semibold">{macro?.heatmap.title}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2">分项</th>
                    {macro?.heatmap.columns.map((item) => <th key={item} className="px-3 py-2">{item}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {macro?.heatmap.rows.map((row) => (
                    <tr key={row.label} className="border-t border-border/20">
                      <td className="px-3 py-2 font-medium">{row.label}</td>
                      {row.values.map((value, index) => (
                        <td key={`${row.label}-${index}`} className="px-3 py-2 font-mono" style={{ background: colorOf(value) }}>
                          {value}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
          )}

          {macroView === "trend" && (
          <GlassCard>
            <h3 className="mb-3 font-semibold">{macro?.trend.title}</h3>
            <div className="space-y-3">
              {macro?.trend.series.map((series) => {
                const max = Math.max(...series.values, 1);
                return (
                  <div key={series.name}>
                    <p className="mb-2 text-sm font-medium">{series.name}</p>
                    <div className="flex items-end gap-2">
                      {series.values.map((value, index) => (
                        <div key={`${series.name}-${index}`} className="flex-1">
                          <div className="rounded-t bg-primary/70" style={{ height: `${Math.max((value / max) * 120, 6)}px` }} />
                          <p className="mt-1 text-center text-[10px] text-muted-foreground">{macro.trend.x[index]}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 text-sm text-muted-foreground">{macro?.commentary}</p>
          </GlassCard>
          )}
        </div>
      ) : (
        activeModule && <DatabaseModuleSkeleton module={activeModule} contract={moduleRegistry?.container_contract || {}} />
      )}
        </div>
      </div>

      <Disclaimer />
    </div>
  );
}

function DatabaseModuleSkeleton({ module, contract }: {
  module: DatabaseModuleRegistry["modules"][number];
  contract: DatabaseModuleRegistry["container_contract"];
}) {
  return (
    <div className="space-y-4">
      <GlassCard>
        <h3 className="mb-3 flex items-center gap-2 font-semibold"><Filter className="h-4 w-4 text-primary" /> 标准筛选条</h3>
        <div className="grid gap-3 md:grid-cols-3">
          {module.filters.map((filter) => (
            <div key={filter.key} className="rounded-lg border border-border/40 p-3">
              <p className="mb-2 text-sm font-medium">{filter.label}</p>
              <select className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none">
                {filter.options.map((option) => <option key={option}>{option}</option>)}
              </select>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{contract.filter_bar?.empty_state}</p>
      </GlassCard>

      <div className="grid gap-4 xl:grid-cols-2">
        {module.containers.map((container) => (
          <GlassCard key={container.key} className="min-h-[220px]">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 font-semibold">
                {container.kind === "table" ? <FileSpreadsheet className="h-4 w-4 text-primary" /> : <BarChart3 className="h-4 w-4 text-primary" />}
                {container.title}
              </h3>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{container.kind}</span>
            </div>
            <div className="flex min-h-[150px] items-center justify-center rounded-xl border border-dashed border-border/60 bg-black/10 p-6 text-center text-sm text-muted-foreground">
              {container.kind === "table" ? contract.table?.empty_state : contract.chart?.empty_state}
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
