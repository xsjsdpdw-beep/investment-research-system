import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Plus, Wrench, LayoutPanelTop } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { AskAiButton } from "@/components/ui/AskAiButton";
import { Disclaimer } from "@/components/ui/Disclaimer";
import { IndustryDraftCanvas } from "@/components/research/IndustryDraftCanvas";
import { api, ApiError, type IndustryDraftCanvasSchema } from "@/lib/api";
import sectorsData from "@/data/sectors.json";

export function SectorDetail() {
  const { key } = useParams();
  const sector = sectorsData.sectors.find((s) => s.key === key);
  const [draftSchema, setDraftSchema] = useState<IndustryDraftCanvasSchema | null>(null);
  const [draftError, setDraftError] = useState("");
  const [selectedOverviewTabId, setSelectedOverviewTabId] = useState("");

  useEffect(() => {
    if (!sector) return;
    let cancelled = false;
    setDraftError("");
    setDraftSchema(null);
    setSelectedOverviewTabId("");

    void api.overviewWorkbench("sector", sector.label)
      .then((workbench) => {
        if (cancelled) return;
        const schema = workbench.draft_theme_schema;
        if (schema?.kind === "industry_draft_canvas" && Array.isArray(schema.tabs)) {
          setDraftSchema(schema);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 0) {
          setDraftError("后端未启动，研究栏目暂时无法读取。");
          return;
        }
        setDraftError("研究栏目读取失败，请稍后再试。");
      });

    return () => {
      cancelled = true;
    };
  }, [sector]);

  if (!sector) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        未找到该板块。<Link to="/sectors" className="text-primary">返回板块中心</Link>
      </div>
    );
  }

  const aiContext =
    `板块：${sector.label}\n定位：${sector.tagline}\n产业链环节：` +
    (sector.nodes.length ? sector.nodes.join("、") : "（环节梳理中）");

  return (
    <div>
      <Link to="/sectors" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> 板块中心
      </Link>

      <PageHeader
        title={sector.label}
        subtitle={sector.tagline}
        actions={
          <AskAiButton
            context={aiContext}
            label="让 AI 拆这个板块"
            suggestions={["按七维框架拆解", "这个板块的产业链地图", "哪个环节卡脖子", "有什么风险信号"]}
          />
        }
      />

      {sector.verified ? (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">核心环节（{sector.nodes.length}）</h3>
          <div className="flex flex-wrap gap-2.5">
            {sector.nodes.map((n) => (
              <span key={n} className="rounded-full border border-primary/40 bg-primary/15 px-3.5 py-1.5 text-sm font-medium text-foreground shadow-glow transition-colors hover:bg-primary/25">
                {n}
              </span>
            ))}
          </div>
          <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Plus className="h-3.5 w-3.5" /> 想在某个环节挂上自己关注的标的？数据存在你本地，不会上传、不进仓库。
          </p>
        </div>
      ) : (
        <GlassCard>
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Wrench className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              该板块的环节骨架尚在<b className="text-foreground">实时核实</b>补全中（不靠模型记忆）——已核实的板块见左侧。
            </p>
            <p className="max-w-md text-xs text-muted-foreground/70">
              也可以点右上角「让 AI 拆这个板块」，用你自己的 AI 按七维框架当场梳理它的产业链。
            </p>
          </div>
        </GlassCard>
      )}

      <GlassCard className="mt-6">
        <div className="flex items-center gap-2">
          <LayoutPanelTop className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">研究栏目框架</h3>
        </div>
        {draftSchema?.tabs?.length ? (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {draftSchema.tabs.map((tab, index) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedOverviewTabId(tab.id)}
                className="rounded-2xl border border-border/60 bg-background/40 p-4 text-left transition hover:border-primary/40 hover:bg-primary/5"
              >
                <p className="text-xs text-muted-foreground">Tag {index + 1}</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{tab.title}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {tab.blocks.length ? `已放入 ${tab.blocks.length} 个内容块` : "当前为空，等待逐页填充"}
                </p>
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            {draftError || "该板块的研究栏目尚未初始化。"}
          </p>
        )}
      </GlassCard>

      {draftSchema?.tabs?.length ? (
        <div className="mt-6">
          <IndustryDraftCanvas key={selectedOverviewTabId || "default"} data={draftSchema} scopeType="sector" scopeId={sector.label} initialActiveTabId={selectedOverviewTabId || undefined} isInitialDraftCanvas />
        </div>
      ) : null}

      <Disclaimer />
    </div>
  );
}
