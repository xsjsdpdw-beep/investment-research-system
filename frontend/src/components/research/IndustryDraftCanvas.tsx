import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { api, ApiError, type IndustryDraftCanvasCard, type IndustryDraftCanvasSchema } from "@/lib/api";
import { cn } from "@/lib/utils";

import { IndustryDraftCardRenderer } from "./IndustryDraftCardRenderer";
import { IndustryDraftCanvasEditor } from "./IndustryDraftCanvasEditor";
import { createCanvasCard, createEmptyCanvasTab, getIndustryDraftActiveTab, moveItem } from "./industry-draft-canvas";

export function IndustryDraftCanvas({
  data,
  scopeType = "sector",
  scopeId = "HBM",
  initialActiveTabId,
}: {
  data: IndustryDraftCanvasSchema;
  scopeType?: "sector" | "stock";
  scopeId?: string;
  initialActiveTabId?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(data);
  const [activeTabId, setActiveTabId] = useState(initialActiveTabId || data.tabs[0]?.id || "");
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const activeTab = useMemo(() => getIndustryDraftActiveTab(draft, activeTabId), [activeTabId, draft]);

  useEffect(() => {
    setDraft(data);
    setActiveTabId((current) => current || data.tabs[0]?.id || "");
  }, [data]);

  if (!activeTab) {
    return null;
  }

  function updateCurrentTab(mutator: (cards: IndustryDraftCanvasCard[]) => IndustryDraftCanvasCard[]) {
    setDraft((current) => ({
      ...current,
      tabs: current.tabs.map((tab) => (
        tab.id === activeTabId
          ? { ...tab, cards: mutator(tab.cards || []) }
          : tab
      )),
    }));
  }

  async function saveCanvas() {
    try {
      setSaving(true);
      const saved = await api.saveOverviewDraftThemeSchema({
        scope_type: scopeType,
        scope_id: scopeId,
        schema: draft,
      });
      const next = (saved.draft_theme_schema as IndustryDraftCanvasSchema) || draft;
      setDraft(next);
      setEditing(false);
      setExpandedCardId(null);
      toast.success("初稿画布已保存");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "初稿画布保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-[28px] border border-[#ff8b2a]/18 bg-[linear-gradient(180deg,#08111f,#020617)] p-4 text-slate-100 shadow-[0_18px_50px_rgba(249,115,22,0.12)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {draft.tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={tab.id === activeTab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition",
                tab.id === activeTab.id
                  ? "border-[#ff8b2a]/60 bg-[#ff8b2a]/18 text-[#ffd3aa]"
                  : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]",
              )}
            >
              {tab.title}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              if (editing) {
                setDraft(data);
                setEditing(false);
                setExpandedCardId(null);
                return;
              }
              setEditing(true);
            }}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm transition",
              editing
                ? "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
                : "border-[#ff8b2a]/40 bg-[#ff8b2a]/12 text-[#ffd3aa]",
            )}
          >
            {editing ? "取消编辑" : "编辑初稿"}
          </button>
          {editing ? (
            <button
              type="button"
              onClick={() => void saveCanvas()}
              disabled={saving}
              className="rounded-full border border-emerald-400/35 bg-emerald-400/12 px-3 py-1.5 text-sm text-emerald-200 disabled:opacity-50"
            >
              {saving ? "保存中..." : "保存画布"}
            </button>
          ) : null}
        </div>
      </div>

      <div role="tabpanel" className="mt-4 space-y-4">
        {editing ? (
          <div className="space-y-4">
            <section className="flex flex-wrap gap-2 rounded-[24px] border border-primary/20 bg-primary/5 p-3">
              <button
                type="button"
                onClick={() => {
                  const next = createEmptyCanvasTab();
                  setDraft((current) => ({ ...current, tabs: [...current.tabs, next] }));
                  setActiveTabId(next.id);
                }}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-200"
              >
                新增 Tab
              </button>
              <button
                type="button"
                onClick={() => {
                  const fallback = createEmptyCanvasTab();
                  setDraft((current) => {
                    const nextTabs = current.tabs.filter((tab) => tab.id !== activeTabId);
                    const resolvedTabs = nextTabs.length ? nextTabs : [fallback];
                    setActiveTabId(resolvedTabs[0].id);
                    return { ...current, tabs: resolvedTabs };
                  });
                }}
                className="rounded-full border border-red-500/25 bg-red-500/10 px-3 py-1.5 text-xs text-red-200"
              >
                删除当前 Tab
              </button>
              <button
                type="button"
                onClick={() => {
                  const index = draft.tabs.findIndex((tab) => tab.id === activeTab.id);
                  setDraft((current) => ({ ...current, tabs: moveItem(current.tabs, index, -1) }));
                }}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-200"
              >
                Tab 左移
              </button>
              <button
                type="button"
                onClick={() => {
                  const index = draft.tabs.findIndex((tab) => tab.id === activeTab.id);
                  setDraft((current) => ({ ...current, tabs: moveItem(current.tabs, index, 1) }));
                }}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-200"
              >
                Tab 右移
              </button>
            </section>
            <IndustryDraftCanvasEditor
              tab={activeTab}
              expandedCardId={expandedCardId}
              onSetExpandedCardId={setExpandedCardId}
              onRenameTab={(title) => setDraft((current) => ({
                ...current,
                tabs: current.tabs.map((tab) => (tab.id === activeTab.id ? { ...tab, title } : tab)),
              }))}
              onAddCard={(type) => updateCurrentTab((cards) => [...cards, createCanvasCard(type)])}
              onMoveCard={(index, delta) => updateCurrentTab((cards) => moveItem(cards, index, delta))}
              onDeleteCard={(index) => updateCurrentTab((cards) => cards.filter((_, cardIndex) => cardIndex !== index))}
              onUpdateCard={(index, card) => updateCurrentTab((cards) => cards.map((item, cardIndex) => (cardIndex === index ? card : item)))}
            />
          </div>
        ) : (
          activeTab.cards.map((card) => (
            <IndustryDraftCardRenderer key={card.id} card={card} />
          ))
        )}
      </div>
    </section>
  );
}
