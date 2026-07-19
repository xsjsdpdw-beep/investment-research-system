import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowRightLeft, Loader2, Radar, RefreshCw, ShieldAlert, Target } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { api, ApiError, type CompanyContext, type DecisionCockpitData, type DecisionFrameworkNode, type DecisionQuestion, type FrameworkRevisionProposal, type IndustryContext, type StockDecisionCard } from "@/lib/api";

type EngineTabKey = "strategy" | "sector" | "stock";

const ENGINE_TABS: { key: EngineTabKey; label: string; description: string }[] = [
  { key: "strategy", label: "策略引擎", description: "现在该投什么、不该投什么" },
  { key: "sector", label: "行业引擎", description: "行业顺风、逆风和逻辑变化" },
  { key: "stock", label: "个股引擎", description: "持仓和自选股动作建议" },
];

function FactorTree({ nodes }: { nodes: DecisionFrameworkNode[] }) {
  const grouped = useMemo(() => {
    const byParent = new Map<string, DecisionFrameworkNode[]>();
    for (const node of nodes) {
      const key = node.parent_id || "__root__";
      const current = byParent.get(key) ?? [];
      current.push(node);
      byParent.set(key, current.sort((left, right) => left.sort_order - right.sort_order));
    }
    return byParent;
  }, [nodes]);

  const renderBranch = (parentId = "__root__", depth = 0) => {
    const items = grouped.get(parentId) ?? [];
    return items.map((node) => (
      <div key={node.node_id} className={depth > 0 ? "border-l border-border/30 pl-4" : ""}>
        <div className="rounded-xl border border-border/40 bg-muted/15 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{node.label}</p>
            <span className="rounded-full border border-border/40 px-2 py-0.5 text-[11px] text-muted-foreground">{node.thesis_role}</span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{node.judgment}</span>
          </div>
          {node.description && <p className="mt-2 text-sm text-muted-foreground">{node.description}</p>}
          {node.indicator_rows.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="pb-2 pr-3 font-medium">指标</th>
                    <th className="pb-2 pr-3 font-medium">频率</th>
                    <th className="pb-2 pr-3 font-medium">危险线</th>
                    <th className="pb-2 pr-3 font-medium">安全线</th>
                    <th className="pb-2 pr-3 font-medium">当前值</th>
                    <th className="pb-2 pr-3 font-medium">结论</th>
                  </tr>
                </thead>
                <tbody>
                  {node.indicator_rows.map((row) => (
                    <tr key={`${node.node_id}-${row.label}`} className="border-t border-border/20">
                      <td className="py-2 pr-3">{row.label}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{row.frequency || "—"}</td>
                      <td className="py-2 pr-3 text-destructive/80">{row.danger_line || "—"}</td>
                      <td className="py-2 pr-3 text-emerald-300">{row.safety_line || "—"}</td>
                      <td className="py-2 pr-3">{row.current_value || "—"}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{row.conclusion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {node.next_watchpoint && <p className="mt-3 text-xs text-muted-foreground">下个观察点：{node.next_watchpoint}</p>}
        </div>
        <div className="mt-3 space-y-3">{renderBranch(node.node_id, depth + 1)}</div>
      </div>
    ));
  };

  return <div className="space-y-3">{renderBranch()}</div>;
}

function QuestionList({
  questions,
  updatingKey,
  onStatusChange,
}: {
  questions: DecisionQuestion[];
  updatingKey?: string;
  onStatusChange?: (question: DecisionQuestion, status: "验证中" | "已解决") => void;
}) {
  return (
    <div className="space-y-3">
      {questions.map((question) => (
        <div key={`${question.applies_to}-${question.question}`} className="rounded-xl border border-border/40 bg-muted/15 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{question.question}</p>
            <span className="rounded-full border border-border/40 px-2 py-0.5 text-[11px] text-muted-foreground">{question.priority}</span>
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200">{question.uncertainty_type}</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{question.why_it_matters}</p>
          <p className="mt-2 text-xs text-muted-foreground">验证路径：{question.validation_path}</p>
          <p className="mt-1 text-xs text-muted-foreground">信息源：{question.source_targets.join(" / ")}</p>
          <p className="mt-1 text-xs text-muted-foreground">时间窗：{question.due_window} · 状态：{question.status}</p>
          {question.resolution_impact && (
            <p className="mt-1 text-xs text-primary">解决影响：{question.resolution_impact}</p>
          )}
          {onStatusChange && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => onStatusChange(question, "验证中")}
                disabled={updatingKey === `${question.applies_to}-${question.question}`}
                className="rounded-lg border border-border/40 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                标记验证中
              </button>
              <button
                onClick={() => onStatusChange(question, "已解决")}
                disabled={updatingKey === `${question.applies_to}-${question.question}`}
                className="rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs text-primary transition-colors hover:bg-primary/15 disabled:opacity-50"
              >
                标记已解决
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function FrameworkRevisionQueue({
  engine,
  proposals,
  updatingKey,
  onStatusChange,
}: {
  engine: "sector_engine" | "stock_engine";
  proposals: FrameworkRevisionProposal[];
  updatingKey?: string;
  onStatusChange: (engine: "sector_engine" | "stock_engine", proposal: FrameworkRevisionProposal, approvalState: "已批准" | "已废弃") => void;
}) {
  if (proposals.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无框架修订提案。</p>;
  }
  return (
    <div className="space-y-3">
      {proposals.map((proposal) => {
        const key = `${engine}-${proposal.title}`;
        return (
          <div key={key} className="rounded-xl border border-border/40 bg-muted/15 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">{proposal.title}</p>
              <span className="rounded-full border border-border/40 px-2 py-0.5 text-[11px] text-muted-foreground">{proposal.approval_state}</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{proposal.reason}</p>
            {proposal.review_note && <p className="mt-2 text-xs text-primary">审核备注：{proposal.review_note}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => onStatusChange(engine, proposal, "已批准")}
                disabled={updatingKey === key}
                className="rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs text-primary transition-colors hover:bg-primary/15 disabled:opacity-50"
              >
                批准生效
              </button>
              <button
                onClick={() => onStatusChange(engine, proposal, "已废弃")}
                disabled={updatingKey === key}
                className="rounded-lg border border-border/40 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                废弃提案
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function IndustryContextView({ context }: { context: IndustryContext }) {
  return (
    <div className="rounded-lg border border-border/30 bg-muted/10 p-3">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/70">行业上下文</p>
      <p className="mt-2 text-sm font-medium">{context.sector} · {context.action}</p>
      <p className="mt-1 text-sm text-muted-foreground">{context.judgment}</p>
      <p className="mt-2 text-xs text-muted-foreground">{context.transmission}</p>
    </div>
  );
}

function CompanyContextView({ context }: { context: CompanyContext }) {
  return (
    <div className="rounded-lg border border-border/30 bg-muted/10 p-3">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/70">公司上下文</p>
      <p className="mt-2 text-sm font-medium">{context.ticker}</p>
      <p className="mt-1 text-sm text-muted-foreground">{context.latest_comment}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        跟踪点评：{context.has_tracking_comment ? "有" : "缺失"} · 自定义模块：{context.has_custom_modules ? "有" : "缺失"}
      </p>
    </div>
  );
}

function StockDecisionCardView({ card }: { card: StockDecisionCard }) {
  return (
    <div className="rounded-xl border border-border/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">{card.name}</p>
        <span className="rounded-full border border-border/40 px-2 py-0.5 text-[11px] text-muted-foreground">{card.ticker}</span>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{card.action}</span>
        <span className="rounded-full border border-border/40 px-2 py-0.5 text-[11px] text-muted-foreground">{card.confidence}</span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{card.one_line_judgment}</p>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <IndustryContextView context={card.industry_context} />
        <CompanyContextView context={card.company_context} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
        {card.factor_changes.map((item) => (
          <span key={item} className="rounded-full border border-border/40 px-2 py-0.5">{item}</span>
        ))}
      </div>
    </div>
  );
}

export function DecisionCockpit() {
  const [data, setData] = useState<DecisionCockpitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingQuestionKey, setUpdatingQuestionKey] = useState<string | undefined>();
  const [updatingRevisionKey, setUpdatingRevisionKey] = useState<string | undefined>();
  const [activeEngineTab, setActiveEngineTab] = useState<EngineTabKey>("strategy");
  const [error, setError] = useState<string | null>(null);

  const load = async (manual = false) => {
    if (manual) setRefreshing(true);
    if (!manual) setLoading(true);
    try {
      const next = await api.decisionCockpit();
      setData(next);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "决策驾驶舱加载失败");
    } finally {
      if (manual) setRefreshing(false);
      else setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const updateQuestionStatus = async (question: DecisionQuestion, status: "验证中" | "已解决") => {
    const key = `${question.applies_to}-${question.question}`;
    setUpdatingQuestionKey(key);
    try {
      await api.updateDecisionQuestionStatus({
        applies_to: question.applies_to,
        question: question.question,
        status,
        resolution_impact: status === "已解决"
          ? "问题已解决，后续会回填因子、逻辑和决策演化记录。"
          : "已进入优先跟踪队列，等待新信息匹配验证。",
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "未解决问题状态更新失败");
    } finally {
      setUpdatingQuestionKey(undefined);
    }
  };

  const updateFrameworkRevisionStatus = async (
    engine: "sector_engine" | "stock_engine",
    proposal: FrameworkRevisionProposal,
    approvalState: "已批准" | "已废弃",
  ) => {
    const key = `${engine}-${proposal.title}`;
    setUpdatingRevisionKey(key);
    try {
      await api.updateFrameworkRevisionStatus({
        engine,
        title: proposal.title,
        approval_state: approvalState,
        review_note: approvalState === "已批准"
          ? "已批准进入正式框架迭代队列，后续触发因子和决策重算。"
          : "已废弃，本次不进入正式框架。",
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "框架修订提案状态更新失败");
    } finally {
      setUpdatingRevisionKey(undefined);
    }
  };

  return (
    <div>
      <PageHeader
        title="决策驾驶舱"
        subtitle="今日决策总览：把信息变化快速映射到策略、行业和个股逻辑，再推动动作更新。"
        actions={(
          <button
            onClick={() => void load(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            刷新
          </button>
        )}
      />
      <GlassCard className="mb-6 border border-border/40 bg-muted/15 p-4">
        <p className="text-sm text-muted-foreground">
          决策驾驶舱 会把新信息映射到框架、因子、逻辑和动作建议，但它仍然是辅助判断系统，不会自动替你交易。
        </p>
      </GlassCard>

      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading || !data ? (
        <GlassCard className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">正在构建决策驾驶舱...</p>
        </GlassCard>
      ) : (
        <div className="space-y-6">
          <GlassCard glow>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">{data.summary.title}</p>
                <p className="mt-2 text-sm text-muted-foreground">{data.summary.one_line_view}</p>
              </div>
              <span className="text-xs text-muted-foreground">更新于 {data.summary.updated_at}</span>
            </div>
          </GlassCard>

          <GlassCard className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              {ENGINE_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  aria-pressed={activeEngineTab === tab.key}
                  onClick={() => setActiveEngineTab(tab.key)}
                  className={`rounded-2xl border p-4 text-left transition-colors ${
                    activeEngineTab === tab.key
                      ? "border-primary/40 bg-primary/10 text-foreground"
                      : "border-border/40 bg-muted/10 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <p className="text-sm font-semibold">{tab.label}</p>
                  <p className="mt-1 text-xs">{tab.description}</p>
                </button>
              ))}
            </div>

            {activeEngineTab === "strategy" && (
              <section className="space-y-4">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">策略引擎</h2>
              </div>
              <p className="text-sm text-muted-foreground">{data.strategy_engine.summary.one_line_view}</p>
              <div className="rounded-xl border border-primary/25 bg-primary/10 p-4">
                <p className="text-sm font-medium">今日策略观点</p>
                <div className="mt-3 grid gap-3 lg:grid-cols-3">
                  <div className="rounded-lg border border-primary/20 bg-background/20 p-3">
                    <p className="text-xs text-muted-foreground">当前市场风格</p>
                    <p className="mt-2 text-sm font-semibold">{data.strategy_engine.current_strategy_view.market_style}</p>
                  </div>
                  <div className="rounded-lg border border-primary/20 bg-background/20 p-3">
                    <p className="text-xs text-muted-foreground">看多板块</p>
                    <p className="mt-2 text-sm font-semibold">{data.strategy_engine.current_strategy_view.bullish_sectors.join(" / ")}</p>
                  </div>
                  <div className="rounded-lg border border-primary/20 bg-background/20 p-3">
                    <p className="text-xs text-muted-foreground">组合动作</p>
                    <p className="mt-2 text-sm font-semibold">{data.strategy_engine.current_strategy_view.positioning_advice}</p>
                  </div>
                </div>
                <div className="mt-3 rounded-lg border border-primary/20 bg-background/20 p-3">
                  <p className="text-xs text-muted-foreground">核心理由</p>
                  <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {data.strategy_engine.current_strategy_view.why.map((reason) => (
                      <p key={reason}>{reason}</p>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-border/40 bg-muted/15 p-4">
                  <p className="text-sm font-medium">框架来源</p>
                  <div className="mt-3 space-y-3">
                    {data.strategy_engine.framework_sources.map((source) => (
                      <div key={source.institution} className="rounded-lg border border-border/30 bg-background/20 p-3">
                        <p className="text-sm font-medium">{source.institution}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{source.framework}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-border/40 bg-muted/15 p-4">
                  <p className="text-sm font-medium">全市场机会地图</p>
                  <div className="mt-3 space-y-3">
                    {data.strategy_engine.sector_opportunity_map.map((item) => (
                      <div key={item.sector} className="rounded-lg border border-border/30 bg-background/20 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{item.sector}</p>
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{item.stance}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{item.framework_driver}</p>
                        <p className="mt-2 text-xs text-muted-foreground">{item.why}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">来源映射：{item.source_refs.join(" / ")}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-border/40 bg-muted/15 p-4">
                <p className="text-sm font-medium">策略框架</p>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  {data.strategy_engine.strategy_framework.map((layer) => (
                    <div key={layer.key} className="rounded-xl border border-border/40 bg-background/20 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">{layer.label}</p>
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{layer.status}</span>
                        <span className="rounded-full border border-border/40 px-2 py-0.5 text-[11px] text-muted-foreground">{layer.logic_state}</span>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{layer.summary}</p>
                      <p className="mt-3 text-xs text-muted-foreground">关键论据：{layer.evidence.join(" / ")}</p>
                      <p className="mt-1 text-xs text-muted-foreground">观察窗口：{layer.watchpoints.join(" / ")}</p>
                      <p className="mt-2 text-xs text-primary">配置含义：{layer.decision_implication}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border/30 bg-muted/10 p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/70">市场温度</p>
                  <p className="mt-2 text-sm">宏观：{data.strategy_engine.market_temperature.macro_judgment}</p>
                  <p className="mt-1 text-sm">大盘：{data.strategy_engine.market_temperature.index_judgment}</p>
                  <p className="mt-1 text-sm">风格：{data.strategy_engine.market_temperature.style_judgment}</p>
                </div>
                <div className="rounded-lg border border-border/30 bg-muted/10 p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/70">配置建议</p>
                  <p className="mt-2 text-sm">{data.strategy_engine.allocation_view.should_focus}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{data.strategy_engine.allocation_view.should_avoid}</p>
                </div>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-border/40 bg-muted/15 p-4">
                  <p className="text-sm font-medium">主流机构观点映射</p>
                  <div className="mt-3 space-y-3">
                    {data.strategy_engine.institution_viewpoints.map((viewpoint) => (
                      <div key={`${viewpoint.source}-${viewpoint.title}`} className="rounded-lg border border-border/30 bg-background/20 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{viewpoint.title}</p>
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{viewpoint.stance}</span>
                          <span className="rounded-full border border-border/40 px-2 py-0.5 text-[11px] text-muted-foreground">{viewpoint.mapped_layer}</span>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">{viewpoint.summary}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">{viewpoint.source} · {viewpoint.evidence_date || "日期待补"}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-border/40 bg-muted/15 p-4">
                  <p className="text-sm font-medium">每日迭代机制</p>
                  <p className="mt-2 text-sm text-muted-foreground">{data.strategy_engine.daily_iteration.mapping_rule}</p>
                  <p className="mt-3 text-xs text-muted-foreground">频率：{data.strategy_engine.daily_iteration.refresh_cadence}</p>
                  <p className="mt-1 text-xs text-muted-foreground">来源：{data.strategy_engine.daily_iteration.source_scope.join(" / ")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">下次刷新：{data.strategy_engine.daily_iteration.next_refresh}</p>
                </div>
              </div>
              <div className="rounded-xl border border-border/40 bg-muted/15 p-4">
                <p className="text-sm font-medium">建议矩阵</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border border-border/30 bg-background/20 p-3 text-xs text-muted-foreground">
                    <p className="mb-2 font-medium text-foreground">可加大研究/配置</p>
                    {data.strategy_engine.recommendation_matrix.increase.join(" / ")}
                  </div>
                  <div className="rounded-lg border border-border/30 bg-background/20 p-3 text-xs text-muted-foreground">
                    <p className="mb-2 font-medium text-foreground">应降低暴露</p>
                    {data.strategy_engine.recommendation_matrix.reduce.join(" / ")}
                  </div>
                  <div className="rounded-lg border border-border/30 bg-background/20 p-3 text-xs text-muted-foreground">
                    <p className="mb-2 font-medium text-foreground">重点观察</p>
                    {data.strategy_engine.recommendation_matrix.observe.join(" / ")}
                  </div>
                  <div className="rounded-lg border border-border/30 bg-background/20 p-3 text-xs text-muted-foreground">
                    <p className="mb-2 font-medium text-foreground">暂不买</p>
                    {data.strategy_engine.recommendation_matrix.do_not_buy.join(" / ")}
                  </div>
                </div>
              </div>
              <FactorTree nodes={data.strategy_engine.factor_tree} />
              <div className="rounded-xl border border-border/40 bg-muted/15 p-4">
                <p className="text-sm font-medium">未解决问题</p>
                <div className="mt-3">
                  <QuestionList questions={data.strategy_engine.open_questions} updatingKey={updatingQuestionKey} onStatusChange={updateQuestionStatus} />
                </div>
              </div>
              </section>
            )}

            {activeEngineTab === "sector" && (
              <section className="space-y-4">
              <div className="flex items-center gap-2">
                <Radar className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">行业引擎</h2>
              </div>
              <p className="text-sm text-muted-foreground">{data.sector_engine.summary.one_line_view}</p>
              <div className="grid gap-3 lg:grid-cols-2">
                {data.sector_engine.sector_cards.map((card) => (
                  <div key={card.sector} className="rounded-xl border border-border/40 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{card.sector}</p>
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{card.action}</span>
                      <span className="rounded-full border border-border/40 px-2 py-0.5 text-[11px] text-muted-foreground">{card.confidence}</span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{card.one_line_judgment}</p>
                  </div>
                ))}
              </div>
              <FactorTree nodes={data.sector_engine.factor_tree} />
              <div className="rounded-xl border border-border/40 bg-muted/15 p-4">
                <p className="text-sm font-medium">框架修订提案</p>
                <div className="mt-3">
                  <FrameworkRevisionQueue
                    engine="sector_engine"
                    proposals={data.sector_engine.framework_revision_queue}
                    updatingKey={updatingRevisionKey}
                    onStatusChange={updateFrameworkRevisionStatus}
                  />
                </div>
              </div>
              <div className="rounded-xl border border-border/40 bg-muted/15 p-4">
                <p className="text-sm font-medium">未解决问题</p>
                <div className="mt-3">
                  <QuestionList questions={data.sector_engine.open_questions} updatingKey={updatingQuestionKey} onStatusChange={updateQuestionStatus} />
                </div>
              </div>
              </section>
            )}

            {activeEngineTab === "stock" && (
              <section className="space-y-4">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">个股引擎</h2>
              </div>
              <p className="text-sm text-muted-foreground">{data.stock_engine.summary.one_line_view}</p>
              <div className="grid gap-3 lg:grid-cols-2">
                {data.stock_engine.decision_cards.map((card) => (
                  <StockDecisionCardView key={card.ticker} card={card} />
                ))}
              </div>
              <div className="rounded-xl border border-border/40 bg-muted/15 p-4">
                <p className="text-sm font-medium">框架修订提案</p>
                <div className="mt-3">
                  <FrameworkRevisionQueue
                    engine="stock_engine"
                    proposals={data.stock_engine.framework_revision_queue}
                    updatingKey={updatingRevisionKey}
                    onStatusChange={updateFrameworkRevisionStatus}
                  />
                </div>
              </div>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-200" />
                  <p className="text-sm font-medium">未解决问题</p>
                </div>
                <div className="mt-3">
                  <QuestionList questions={data.stock_engine.open_questions} updatingKey={updatingQuestionKey} onStatusChange={updateQuestionStatus} />
                </div>
              </div>
              </section>
            )}
          </GlassCard>
        </div>
      )}
    </div>
  );
}
