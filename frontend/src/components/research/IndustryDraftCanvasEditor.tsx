import type { IndustryDraftCanvasCard, IndustryDraftCanvasTab } from "@/lib/api";
import { cn } from "@/lib/utils";

function EditorInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={cn("w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary/50", className)}
    />
  );
}

function EditorTextarea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={3}
      className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary/50"
    />
  );
}

function SummaryHeroEditor({
  card,
  onChange,
}: {
  card: IndustryDraftCanvasCard;
  onChange: (card: IndustryDraftCanvasCard) => void;
}) {
  const headline = String(card.content.headline || "");
  const bullets = Array.isArray(card.content.bullets) ? card.content.bullets.map(String) : [];
  const tags = Array.isArray(card.content.tags) ? card.content.tags.map(String) : [];
  return (
    <div className="space-y-3">
      <EditorInput
        value={headline}
        placeholder="核心结论"
        onChange={(value) => onChange({ ...card, content: { ...card.content, headline: value } })}
      />
      <div className="space-y-2">
        {bullets.map((item, index) => (
          <EditorTextarea
            key={`${card.id}-bullet-${index}`}
            value={item}
            placeholder={`要点 ${index + 1}`}
            onChange={(value) => {
              const next = [...bullets];
              next[index] = value;
              onChange({ ...card, content: { ...card.content, bullets: next } });
            }}
          />
        ))}
      </div>
      <EditorInput
        value={tags.join(" / ")}
        placeholder="标签，使用 / 分隔"
        onChange={(value) => onChange({ ...card, content: { ...card.content, tags: value.split("/").map((item) => item.trim()).filter(Boolean) } })}
      />
    </div>
  );
}

function MetricGridEditor({
  card,
  onChange,
}: {
  card: IndustryDraftCanvasCard;
  onChange: (card: IndustryDraftCanvasCard) => void;
}) {
  const items = Array.isArray(card.content.items) ? card.content.items : [];
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={`${card.id}-metric-${index}`} className="grid gap-2 md:grid-cols-3">
          <EditorInput
            value={String(item?.label || "")}
            placeholder="指标名"
            onChange={(value) => {
              const next = [...items];
              next[index] = { ...(next[index] || {}), label: value };
              onChange({ ...card, content: { ...card.content, items: next } });
            }}
          />
          <EditorInput
            value={String(item?.value || "")}
            placeholder="指标值"
            onChange={(value) => {
              const next = [...items];
              next[index] = { ...(next[index] || {}), value };
              onChange({ ...card, content: { ...card.content, items: next } });
            }}
          />
          <EditorInput
            value={String(item?.note || "")}
            placeholder="补充说明"
            onChange={(value) => {
              const next = [...items];
              next[index] = { ...(next[index] || {}), note: value };
              onChange({ ...card, content: { ...card.content, items: next } });
            }}
          />
        </div>
      ))}
    </div>
  );
}

function RangeBandEditor({
  card,
  onChange,
}: {
  card: IndustryDraftCanvasCard;
  onChange: (card: IndustryDraftCanvasCard) => void;
}) {
  const segments = Array.isArray(card.content.segments) ? card.content.segments : [];
  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-2">
        <EditorInput
          value={String(card.content.current_label || "")}
          placeholder="当前位置标签"
          onChange={(value) => onChange({ ...card, content: { ...card.content, current_label: value } })}
        />
        <EditorInput
          value={String(card.content.current_value || "")}
          placeholder="当前位置值"
          onChange={(value) => onChange({ ...card, content: { ...card.content, current_value: value } })}
        />
      </div>
      {segments.map((item, index) => (
        <div key={`${card.id}-segment-${index}`} className="grid gap-2 md:grid-cols-3">
          <EditorInput
            value={String(item?.label || "")}
            placeholder="区间名"
            onChange={(value) => {
              const next = [...segments];
              next[index] = { ...(next[index] || {}), label: value };
              onChange({ ...card, content: { ...card.content, segments: next } });
            }}
          />
          <EditorInput
            value={String(item?.weight || "")}
            placeholder="权重"
            onChange={(value) => {
              const next = [...segments];
              next[index] = { ...(next[index] || {}), weight: Number(value || 0) };
              onChange({ ...card, content: { ...card.content, segments: next } });
            }}
          />
          <EditorInput
            value={String(item?.note || "")}
            placeholder="说明"
            onChange={(value) => {
              const next = [...segments];
              next[index] = { ...(next[index] || {}), note: value };
              onChange({ ...card, content: { ...card.content, segments: next } });
            }}
          />
        </div>
      ))}
    </div>
  );
}

function ComparisonCardsEditor({
  card,
  onChange,
}: {
  card: IndustryDraftCanvasCard;
  onChange: (card: IndustryDraftCanvasCard) => void;
}) {
  const items = Array.isArray(card.content.items) ? card.content.items : [];
  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={`${card.id}-compare-${index}`} className="grid gap-2 md:grid-cols-2">
          <EditorInput
            value={String(item?.name || "")}
            placeholder="对象"
            onChange={(value) => {
              const next = [...items];
              next[index] = { ...(next[index] || {}), name: value };
              onChange({ ...card, content: { ...card.content, items: next } });
            }}
          />
          <EditorInput
            value={String(item?.tag || item?.role || "")}
            placeholder="标签"
            onChange={(value) => {
              const next = [...items];
              next[index] = { ...(next[index] || {}), tag: value };
              onChange({ ...card, content: { ...card.content, items: next } });
            }}
          />
          <EditorTextarea
            value={String(item?.headline || item?.edge || "")}
            placeholder="主结论"
            onChange={(value) => {
              const next = [...items];
              next[index] = { ...(next[index] || {}), headline: value };
              onChange({ ...card, content: { ...card.content, items: next } });
            }}
          />
          <EditorTextarea
            value={String(item?.detail || item?.mapping || "")}
            placeholder="补充说明"
            onChange={(value) => {
              const next = [...items];
              next[index] = { ...(next[index] || {}), detail: value };
              onChange({ ...card, content: { ...card.content, items: next } });
            }}
          />
        </div>
      ))}
    </div>
  );
}

function TimelineEditor({
  card,
  onChange,
}: {
  card: IndustryDraftCanvasCard;
  onChange: (card: IndustryDraftCanvasCard) => void;
}) {
  const steps = Array.isArray(card.content.steps) ? card.content.steps : [];
  return (
    <div className="space-y-2">
      {steps.map((step, index) => (
        <div key={`${card.id}-step-${index}`} className="grid gap-2 md:grid-cols-[1fr_2fr_auto]">
          <EditorInput
            value={String(step?.label || "")}
            placeholder="阶段"
            onChange={(value) => {
              const next = [...steps];
              next[index] = { ...(next[index] || {}), label: value };
              onChange({ ...card, content: { ...card.content, steps: next } });
            }}
          />
          <EditorInput
            value={String(step?.caption || "")}
            placeholder="说明"
            onChange={(value) => {
              const next = [...steps];
              next[index] = { ...(next[index] || {}), caption: value };
              onChange({ ...card, content: { ...card.content, steps: next } });
            }}
          />
          <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={Boolean(step?.active)}
              onChange={(event) => {
                const next = [...steps];
                next[index] = { ...(next[index] || {}), active: event.target.checked };
                onChange({ ...card, content: { ...card.content, steps: next } });
              }}
            />
            高亮
          </label>
        </div>
      ))}
    </div>
  );
}

function CardContentEditor({
  card,
  onChange,
}: {
  card: IndustryDraftCanvasCard;
  onChange: (card: IndustryDraftCanvasCard) => void;
}) {
  if (card.type === "summary_hero") return <SummaryHeroEditor card={card} onChange={onChange} />;
  if (card.type === "metric_grid") return <MetricGridEditor card={card} onChange={onChange} />;
  if (card.type === "range_band") return <RangeBandEditor card={card} onChange={onChange} />;
  if (card.type === "comparison_cards") return <ComparisonCardsEditor card={card} onChange={onChange} />;
  if (card.type === "timeline") return <TimelineEditor card={card} onChange={onChange} />;
  return null;
}

export function IndustryDraftCanvasEditor({
  tab,
  expandedCardId,
  onSetExpandedCardId,
  onRenameTab,
  onAddCard,
  onMoveCard,
  onDeleteCard,
  onUpdateCard,
}: {
  tab: IndustryDraftCanvasTab;
  expandedCardId: string | null;
  onSetExpandedCardId: (cardId: string | null) => void;
  onRenameTab: (title: string) => void;
  onAddCard: (type: IndustryDraftCanvasCard["type"]) => void;
  onMoveCard: (index: number, delta: number) => void;
  onDeleteCard: (index: number) => void;
  onUpdateCard: (index: number, card: IndustryDraftCanvasCard) => void;
}) {
  return (
    <section className="space-y-4 rounded-[24px] border border-primary/20 bg-primary/5 p-4">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.16em] text-primary/80">Tab 工具条</p>
        <EditorInput value={tab.title} onChange={onRenameTab} placeholder="栏目名称" />
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onAddCard("summary_hero")} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-200">新增速览卡</button>
          <button type="button" onClick={() => onAddCard("metric_grid")} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-200">新增指标卡</button>
          <button type="button" onClick={() => onAddCard("range_band")} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-200">新增分位条</button>
          <button type="button" onClick={() => onAddCard("comparison_cards")} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-200">新增对比卡</button>
          <button type="button" onClick={() => onAddCard("timeline")} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-200">新增时间线</button>
        </div>

        <div className="space-y-3">
          {tab.cards.map((card, index) => {
            const expanded = expandedCardId === card.id;
            return (
              <div key={card.id} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[11px] uppercase tracking-[0.14em] text-primary">
                    {card.type}
                  </span>
                  <div className="min-w-[220px] flex-1">
                    <EditorInput
                      value={card.title || ""}
                      placeholder="卡片标题"
                      onChange={(value) => onUpdateCard(index, { ...card, title: value })}
                    />
                  </div>
                  <button type="button" onClick={() => onMoveCard(index, -1)} className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-300">上移</button>
                  <button type="button" onClick={() => onMoveCard(index, 1)} className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-300">下移</button>
                  <button type="button" onClick={() => onSetExpandedCardId(expanded ? null : card.id)} className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-300">
                    {expanded ? "收起" : "编辑"}
                  </button>
                  <button type="button" onClick={() => onDeleteCard(index)} className="rounded-lg border border-red-500/25 bg-red-500/10 px-2 py-1 text-xs text-red-200">删除</button>
                </div>
                {expanded ? (
                  <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
                    <CardContentEditor card={card} onChange={(nextCard) => onUpdateCard(index, nextCard)} />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
