import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowUp, BookOpenCheck, ChevronDown, ChevronUp, ExternalLink, FileImage, FileSearch, Flame, GripVertical, Image as ImageIcon, Minus, Newspaper, Presentation, RefreshCw, Sparkles, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Disclaimer } from "@/components/ui/Disclaimer";
import { SectionTabs } from "@/components/ui/SectionTabs";
import { AskAiButton } from "@/components/ui/AskAiButton";
import { api, ApiError, type KnowledgeEntry, type SectorIndicator, type SectorModule, type SectorTreeNode, type StockCenterData, type StockModule, type WatchIndicator, type WatchStock } from "@/lib/api";
import { FRAMEWORK_TABS } from "@/lib/workspace";
import sectorsData from "@/data/sectors.json";

function tags(raw: string) {
  return raw.split(/[，,\s]+/).map((item) => item.trim()).filter(Boolean);
}

function entryTypeLabel(type: string) {
  if (type === "memo") return "备忘";
  if (type === "research_note") return "纪要";
  if (type === "tracking_comment") return "点评";
  if (type === "weekly_review") return "周复盘";
  if (type === "attachment_link") return "附件";
  if (type === "sector_profile") return "行业卡片";
  if (type === "stock_profile") return "个股卡片";
  return type;
}

function InvestmentViewBadge({ view }: { view?: string }) {
  if (view === "bullish") {
    return <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] text-red-300"><ArrowUp className="h-3 w-3" /> 看多</span>;
  }
  if (view === "bearish") {
    return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300"><ArrowDown className="h-3 w-3" /> 看空</span>;
  }
  if (view === "neutral") {
    return <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/15 px-2 py-0.5 text-[11px] text-slate-300"><Minus className="h-3 w-3" /> 中性</span>;
  }
  return null;
}

function buildTimeline(entries: KnowledgeEntry[]) {
  const deduped = Array.from(new Map(entries.map((item) => [item.id, item])).values());
  return deduped.sort((a, b) => {
    const left = `${b.date || ""}${b.updated_at || ""}`;
    const right = `${a.date || ""}${a.updated_at || ""}`;
    return left.localeCompare(right);
  });
}

function buildWeeklyMarkdown(rows: {
  ticker: string;
  name: string;
  group: string;
  change: string;
  note: string;
}[], actionAdvice: string, sectorViews: string, keyEvents: string) {
  const picked = rows.filter((item) => item.change.trim() || item.note.trim());
  const grouped = new Map<string, typeof picked>();
  for (const item of picked) {
    const group = item.group || "未分组";
    grouped.set(group, [...(grouped.get(group) || []), item]);
  }
  const sections: string[] = ["## 核心个股周涨跌"];
  if (picked.length === 0) {
    sections.push("本周暂未录入核心个股涨跌。");
  } else {
    for (const [group, items] of grouped.entries()) {
      sections.push(`### ${group}`);
      sections.push("| 个股 | 代码 | 周涨跌 | 备注 |");
      sections.push("| --- | --- | --- | --- |");
      for (const item of items) {
        sections.push(`| ${item.name} | ${item.ticker} | ${item.change || "-"} | ${item.note || "-"} |`);
      }
    }
  }
  sections.push("");
  sections.push("## 行动建议");
  sections.push(actionAdvice.trim() || "本周行动建议待补充。");
  sections.push("");
  sections.push("## 行业观点");
  sections.push(sectorViews.trim() || "本周行业观点待补充。");
  if (keyEvents.trim()) {
    sections.push("");
    sections.push("## 重点事件");
    sections.push(keyEvents.trim());
  }
  return sections.join("\n");
}

interface LearningPackContent {
  title?: string;
  modes?: { key: string; label: string; description: string }[];
  challenge?: {
    stages?: {
      id: string;
      title: string;
      objective: string;
      cards: { label: string; text: string }[];
      quiz: { question: string; options: string[]; answer: string };
    }[];
  };
  deck?: {
    slides?: { title: string; bullets: string[] }[];
  };
  simulation?: {
    decision?: string;
    branches?: { case: string; prompt: string }[];
  };
}

function parseLearningPack(entry: KnowledgeEntry): LearningPackContent | null {
  try {
    return JSON.parse(entry.content || entry.content_preview || "{}") as LearningPackContent;
  } catch {
    return null;
  }
}

function todayDate() {
  return new Date().toLocaleDateString("sv-SE");
}

function readStoredIds(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writeStoredIds(key: string, ids: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    /* 隐私模式等场景 localStorage 不可用 */
  }
}

interface InsightSource {
  label: string;
  text: string;
}

interface OverviewBlock {
  title: string;
  body: string;
}

interface VisualPreviewConfig {
  title: string;
  subtitle?: string;
  chartKind?: string;
  image?: string | null;
}

function cleanSnippet(value: string, limit = 180) {
  const normalized = (value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

function formatSourceLines(sources: InsightSource[], fallback: string, limit = 3) {
  const lines = sources
    .filter((item) => item.text.trim())
    .slice(0, limit)
    .map((item) => `• ${item.label}：${cleanSnippet(item.text)}`);
  return lines.length > 0 ? lines.join("\n") : fallback;
}

function pickSourcesByKeywords(sources: InsightSource[], keywords: string[], limit = 3) {
  return sources.filter((item) => keywords.some((keyword) => item.label.includes(keyword) || item.text.includes(keyword))).slice(0, limit);
}

function extractImageSources(text: string) {
  const results = new Set<string>();
  const markdownMatches = text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g);
  for (const match of markdownMatches) {
    if (match[1]) results.add(match[1].trim());
  }
  const urlMatches = text.matchAll(/((?:https?:\/\/|\/)[^\s]+?\.(?:png|jpg|jpeg|webp|gif))/gi);
  for (const match of urlMatches) {
    if (match[1]) results.add(match[1].trim());
  }
  return Array.from(results);
}

function extractFirstUrl(text: string) {
  return (text || "").match(/https?:\/\/[^\s]+/)?.[0] || "";
}

function isAutomaticSource(entry: KnowledgeEntry) {
  const text = `${entry.title}\n${entry.content || ""}\n${entry.content_preview || ""}\n${entry.tags.join(" ")}`.toLowerCase();
  return text.includes("eastmoney-report:")
    || text.includes("eastmoney-industry-report:")
    || text.includes("premium-note:alpha")
    || text.includes("alphaengine")
    || text.includes("alpha engine");
}

function numericDateValue(value: string) {
  return Number((value || "").split("-").join("")) || 0;
}

function sortByStoredOrder<T>(items: T[], getId: (item: T) => string, storedOrder: string[], fallbackValue: (item: T, index: number) => number) {
  const rank = new Map(storedOrder.map((id, index) => [id, index]));
  return [...items].sort((left, right) => {
    const leftId = getId(left);
    const rightId = getId(right);
    const leftRank = rank.get(leftId);
    const rightRank = rank.get(rightId);
    if (leftRank != null && rightRank != null) return leftRank - rightRank;
    if (leftRank != null) return -1;
    if (rightRank != null) return 1;
    return fallbackValue(left, items.indexOf(left)) - fallbackValue(right, items.indexOf(right));
  });
}

const SECTOR_VIEW_TABS = [
  { key: "overview", label: "行业概览" },
  { key: "tree", label: "行业树" },
  { key: "indicators", label: "跟踪指标" },
  { key: "modules", label: "自定义模块" },
  { key: "notes", label: "调研纪要" },
  { key: "comments", label: "行业点评" },
  { key: "attachments", label: "附件链接" },
];

const STOCK_VIEW_TABS = [
  { key: "overview", label: "公司概览" },
  { key: "indicators", label: "跟踪指标" },
  { key: "public", label: "公开信息" },
  { key: "modules", label: "自定义模块" },
  { key: "notes", label: "调研纪要" },
  { key: "comments", label: "跟踪点评" },
  { key: "timeline", label: "时间线" },
  { key: "attachments", label: "附件链接" },
];

const SECTOR_CENTER_TABS = [
  { key: "center", label: "行业中心" },
  { key: "entry", label: "新增条目" },
];

const STOCK_CENTER_TABS = [
  { key: "center", label: "个股中心" },
  { key: "entry", label: "新增条目" },
];

const LEARNING_VIEW_TABS = [
  { key: "overview", label: "学习概览" },
  { key: "challenge", label: "闯关模式" },
  { key: "deck", label: "路演模式" },
  { key: "simulation", label: "推演模式" },
  { key: "html", label: "互动网页" },
];

function VisualPreview({ title, subtitle, chartKind = "line", image }: VisualPreviewConfig) {
  if (image) {
    return (
      <div className="mt-3 overflow-hidden rounded-xl border border-border/40 bg-black/10">
        <img src={image} alt={title} className="h-44 w-full object-cover" />
        <div className="border-t border-border/30 px-3 py-2 text-xs text-muted-foreground">{subtitle || "已挂接图片/图表资料"}</div>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-dashed border-border/50 bg-black/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <ImageIcon className="h-4 w-4 text-primary" />
          {title}
        </div>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{chartKind}</span>
      </div>
      <div className="mt-3 grid grid-cols-5 items-end gap-2">
        {[48, 78, 58, 92, 70].map((height, index) => (
          <div key={`${title}-${index}`} className="rounded-t-md bg-primary/25" style={{ height }} />
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{subtitle || "这里可以承接公开源抓取、你手动补录的数据，或你贴进来的研报截图/图表图片。"}</p>
    </div>
  );
}

export function Framework() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [active, setActive] = useState("sectors");
  const [sectorEntries, setSectorEntries] = useState<KnowledgeEntry[]>([]);
  const [sectorTree, setSectorTree] = useState<SectorTreeNode[]>([]);
  const [sectorIndicators, setSectorIndicators] = useState<SectorIndicator[]>([]);
  const [sectorModules, setSectorModules] = useState<SectorModule[]>([]);
  const [memoEntries, setMemoEntries] = useState<KnowledgeEntry[]>([]);
  const [attachmentEntries, setAttachmentEntries] = useState<KnowledgeEntry[]>([]);
  const [stockEntries, setStockEntries] = useState<KnowledgeEntry[]>([]);
  const [stockModules, setStockModules] = useState<StockModule[]>([]);
  const [weeklyEntries, setWeeklyEntries] = useState<KnowledgeEntry[]>([]);
  const [learningEntries, setLearningEntries] = useState<KnowledgeEntry[]>([]);
  const [learningSources, setLearningSources] = useState<KnowledgeEntry[]>([]);
  const [watchStocks, setWatchStocks] = useState<WatchStock[]>([]);
  const [watchIndicators, setWatchIndicators] = useState<WatchIndicator[]>([]);
  const [selectedSector, setSelectedSector] = useState("");
  const [selectedTicker, setSelectedTicker] = useState("");
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [selectedLearningEntryId, setSelectedLearningEntryId] = useState("");
  const [selectedWeeklyEntryId, setSelectedWeeklyEntryId] = useState("");
  const [weeklyYearView, setWeeklyYearView] = useState("");
  const [sectorCenterTab, setSectorCenterTab] = useState("center");
  const [stockCenterTab, setStockCenterTab] = useState("center");
  const [sectorView, setSectorView] = useState("overview");
  const [stockView, setStockView] = useState("overview");
  const [learningView, setLearningView] = useState("overview");
  const [sectorObjectPanelOpen, setSectorObjectPanelOpen] = useState(false);
  const [sectorObjectQuery, setSectorObjectQuery] = useState("");
  const [sectorRenameForm, setSectorRenameForm] = useState({ name: "", description: "" });
  const [stockObjectPanelOpen, setStockObjectPanelOpen] = useState(false);
  const [learningTargetSector, setLearningTargetSector] = useState("");
  const [learningTargetStock, setLearningTargetStock] = useState("");
  const [stockCenter, setStockCenter] = useState<StockCenterData | null>(null);
  const [form, setForm] = useState({ title: "", content: "", related: "", tags: "", investment_view: "" as "" | "bullish" | "neutral" | "bearish" });
  const [attachmentForm, setAttachmentForm] = useState({ title: "", url: "", notes: "", tags: "" });
  const [sectorForm, setSectorForm] = useState({ name: "", parent_id: "", description: "" });
  const [indicatorForm, setIndicatorForm] = useState({ sector: "", name: "", freq: "月度", chart_kind: "line", viewpoint: "" });
  const [sectorModuleForm, setSectorModuleForm] = useState({ title: "", category: "行业框架", content: "" });
  const [stockModuleForm, setStockModuleForm] = useState({ title: "", category: "公开信息", content: "" });
  const [premiumNoteForm, setPremiumNoteForm] = useState({ title: "", source_name: "premium_notes_placeholder", content: "" });
  const [weeklyForm, setWeeklyForm] = useState({ title: "", date: todayDate(), sectors: "", actionAdvice: "", sectorViews: "", keyEvents: "" });
  const [weeklyStocks, setWeeklyStocks] = useState<Record<string, { change: string; note: string }>>({});
  const [sectorKind, setSectorKind] = useState<"sector_profile" | "research_note" | "tracking_comment" | "attachment_link">("sector_profile");
  const [stockKind, setStockKind] = useState<"research_note" | "tracking_comment" | "attachment_link">("research_note");
  const [ingestingReports, setIngestingReports] = useState(false);
  const [buildingOverview, setBuildingOverview] = useState<"" | "sector" | "stock">("");
  const [generatingPack, setGeneratingPack] = useState(false);
  const [importingSectorKey, setImportingSectorKey] = useState("");
  const [draggingSectorModuleId, setDraggingSectorModuleId] = useState("");
  const [dragOverSectorModuleId, setDragOverSectorModuleId] = useState("");
  const [draggingSectorIndicatorId, setDraggingSectorIndicatorId] = useState("");
  const [dragOverSectorIndicatorId, setDragOverSectorIndicatorId] = useState("");
  const [draggingStockModuleId, setDraggingStockModuleId] = useState("");
  const [dragOverStockModuleId, setDragOverStockModuleId] = useState("");
  const [draggingStockPublicKey, setDraggingStockPublicKey] = useState("");
  const [dragOverStockPublicKey, setDragOverStockPublicKey] = useState("");
  const [draggingFrameworkNavId, setDraggingFrameworkNavId] = useState("");
  const [dragOverFrameworkNavId, setDragOverFrameworkNavId] = useState("");
  const [sectorNavOrder, setSectorNavOrder] = useState<string[]>(() => readStoredIds("framework-sector-nav-order"));
  const [stockNavOrder, setStockNavOrder] = useState<string[]>(() => readStoredIds("framework-stock-nav-order"));
  const [weeklyNavOrder, setWeeklyNavOrder] = useState<string[]>(() => readStoredIds("framework-weekly-nav-order"));
  const [learningNavOrder, setLearningNavOrder] = useState<string[]>(() => readStoredIds("framework-learning-nav-order"));
  const reportInputRef = useRef<HTMLInputElement>(null);
  const attachmentFileInputRef = useRef<HTMLInputElement>(null);

  const fileToB64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const load = async () => {
    try {
      const [sectors, tree, indicators, modules, stockProfiles, researchNotes, trackingComments, attachments, memos, weekly, learning, watchlist] = await Promise.all([
        api.knowledgeEntries({ kind: "sector_profile" }),
        api.sectorTree(),
        api.sectorIndicators(),
        api.sectorModules(),
        api.knowledgeEntries({ kind: "stock_profile" }),
        api.knowledgeEntries({ kind: "research_note" }),
        api.knowledgeEntries({ kind: "tracking_comment" }),
        api.knowledgeEntries({ kind: "attachment_link" }),
        api.knowledgeEntries({ kind: "memo" }),
        api.knowledgeEntries({ kind: "weekly_review" }),
        api.knowledgeEntries({ kind: "learning_pack" }),
        api.watchlist(),
      ]);
      const fullLearning = await Promise.all(learning.map((item) => api.knowledgeEntry(item.id).catch(() => item)));
      setSectorEntries(sectors);
      setSectorTree(tree.nodes);
      setSectorIndicators(indicators.items);
      setSectorModules(modules.items);
      setMemoEntries(memos);
      setAttachmentEntries(attachments);
      setStockEntries([...stockProfiles, ...researchNotes, ...trackingComments, ...attachments]);
      setWeeklyEntries(weekly);
      setLearningEntries(fullLearning);
      setLearningSources([...attachments, ...researchNotes, ...trackingComments, ...memos, ...weekly]);
      setSelectedSourceId((current) => current || attachments[0]?.id || researchNotes[0]?.id || trackingComments[0]?.id || memos[0]?.id || weekly[0]?.id || "");
      setSelectedLearningEntryId((current) => current || fullLearning[0]?.id || "");
      setSelectedWeeklyEntryId((current) => current || weekly[0]?.id || "");
      setSelectedSector((current) => current || tree.nodes[0]?.name || sectors[0]?.related_sectors[0] || "");
      setWatchStocks(watchlist.stocks);
      setWatchIndicators(watchlist.indicators);
      const firstTicker = watchlist.stocks[0] ? `${watchlist.stocks[0].code}.${watchlist.stocks[0].market}` : "";
      const nextTicker = selectedTicker || firstTicker;
      if (nextTicker && active === "stocks") {
        const [center, modules] = await Promise.all([api.stockCenter(selectedTicker || nextTicker), api.stockModules(selectedTicker || nextTicker)]);
        setSelectedTicker(nextTicker);
        setStockCenter(center);
        setStockModules(modules.items);
      }
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "框架沉淀加载失败");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const sub = searchParams.get("sub");
    if (sub && FRAMEWORK_TABS.some((tab) => tab.key === sub) && sub !== active) {
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

  useEffect(() => {
    if (active === "stocks" && selectedTicker) {
      void loadStockCenter(selectedTicker);
    } else if (active === "stocks" && !selectedTicker && watchStocks.length > 0) {
      void loadStockCenter(`${watchStocks[0].code}.${watchStocks[0].market}`);
    }
  }, [active, selectedTicker, watchStocks]);

  useEffect(() => {
    setWeeklyStocks((current) => {
      const next = { ...current };
      for (const item of watchStocks) {
        const ticker = `${item.code}.${item.market}`;
        next[ticker] = next[ticker] || { change: "", note: "" };
      }
      return next;
    });
  }, [watchStocks]);

  const summaryTargets = useMemo(() => {
    return [...stockEntries, ...learningEntries].filter((item) => item.summary_status !== "ready");
  }, [stockEntries, learningEntries]);

  const submit = async () => {
    const type = active === "sectors" ? sectorKind : active === "stocks" ? stockKind : "weekly_review";
    const payload = {
      title: form.title.trim(),
      type,
      content: form.content.trim(),
      tags: tags(form.tags),
      related_sectors: active === "sectors" || active === "weekly" ? tags(form.related) : [],
      related_stocks: active === "stocks" || active === "weekly" ? tags(form.related) : [],
      investment_view: type === "tracking_comment" ? form.investment_view : "",
    };
    const created = await api.createKnowledgeEntry(payload);
    const shouldAutoGenerate = type === "research_note" || type === "tracking_comment";
    if (shouldAutoGenerate) {
      await api.generateEntrySummary(created.id).catch(() => null);
      await api.generateEntryImageArtifact(created.id).catch(() => null);
    }
    setForm({ title: "", content: "", related: "", tags: "", investment_view: "" });
    toast.success(shouldAutoGenerate ? "内容已沉淀，并自动生成 AI 摘要与图片请求" : "内容已沉淀进本地知识库");
    await load();
    if (active === "stocks" && selectedTicker) await loadStockCenter(selectedTicker);
  };

  const addSectorNode = async () => {
    if (!sectorForm.name.trim()) {
      toast.error("行业名称要填");
      return;
    }
    try {
      await api.upsertSectorNode({
        name: sectorForm.name.trim(),
        parent_id: sectorForm.parent_id,
        description: sectorForm.description.trim(),
      });
      setSectorForm({ name: "", parent_id: "", description: "" });
      toast.success("行业节点已加入行业树");
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "行业节点保存失败");
    }
  };

  const addSectorIndicator = async () => {
    if (!indicatorForm.sector.trim() || !indicatorForm.name.trim()) {
      toast.error("行业和指标名称都要填");
      return;
    }
    try {
      await api.upsertSectorIndicator({
        sector: indicatorForm.sector.trim(),
        name: indicatorForm.name.trim(),
        freq: indicatorForm.freq,
        chart_kind: indicatorForm.chart_kind,
        viewpoint: indicatorForm.viewpoint.trim(),
      });
      setIndicatorForm((prev) => ({ ...prev, name: "", viewpoint: "" }));
      toast.success("行业跟踪指标已保存");
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "指标保存失败");
    }
  };

  const addStockModule = async () => {
    if (!selectedTicker) {
      toast.error("先选择一个个股中心");
      return;
    }
    if (!stockModuleForm.title.trim()) {
      toast.error("模块标题要填");
      return;
    }
    try {
      await api.upsertStockModule({
        ticker: selectedTicker,
        title: stockModuleForm.title.trim(),
        category: stockModuleForm.category.trim() || "自定义",
        content: stockModuleForm.content.trim(),
      });
      setStockModuleForm({ title: "", category: "公开信息", content: "" });
      toast.success("个股自定义模块已保存");
      await loadStockCenter(selectedTicker);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "个股模块保存失败");
    }
  };

  const addSectorModule = async () => {
    if (!selectedSector) {
      toast.error("先选择一个行业中心");
      return;
    }
    if (!sectorModuleForm.title.trim()) {
      toast.error("模块标题要填");
      return;
    }
    try {
      await api.upsertSectorModule({
        sector: selectedSector,
        title: sectorModuleForm.title.trim(),
        category: sectorModuleForm.category.trim() || "自定义",
        content: sectorModuleForm.content.trim(),
      });
      setSectorModuleForm({ title: "", category: "行业框架", content: "" });
      toast.success("行业自定义模块已保存");
      const modules = await api.sectorModules(selectedSector);
      setSectorModules((prev) => {
        const rest = prev.filter((item) => item.sector !== selectedSector);
        return [...rest, ...modules.items];
      });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "行业模块保存失败");
    }
  };

  const ingestPremiumNote = async (scope: "industry" | "stock") => {
    if (!premiumNoteForm.title.trim() || !premiumNoteForm.content.trim()) {
      toast.error("纪要标题和内容都要填");
      return;
    }
    if (scope === "industry" && !selectedSector) {
      toast.error("先选择一个行业中心");
      return;
    }
    if (scope === "stock" && !selectedTicker) {
      toast.error("先选择一个个股中心");
      return;
    }
    try {
      const result = await api.ingestPremiumNote({
        title: premiumNoteForm.title.trim(),
        content: premiumNoteForm.content.trim(),
        source_name: premiumNoteForm.source_name.trim() || "premium_notes_placeholder",
        source_type: "expert_transcript",
        note_kind: "research_note",
        sector: scope === "industry" ? selectedSector : undefined,
        ticker: scope === "stock" ? selectedTicker : undefined,
      });
      await api.generateEntrySummary(result.entry.id).catch(() => null);
      await api.generateEntryImageArtifact(result.entry.id).catch(() => null);
      setPremiumNoteForm({ title: "", source_name: "premium_notes_placeholder", content: "" });
      toast.success(scope === "industry" ? "高价值纪要已沉淀进行业中心，并自动生成 AI 摘要与图片请求" : "高价值纪要已沉淀进个股中心，并自动生成 AI 摘要与图片请求");
      await load();
      if (scope === "stock" && selectedTicker) await loadStockCenter(selectedTicker);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "高价值纪要沉淀失败");
    }
  };

  const importBuiltInSector = async (sector: typeof sectorsData.sectors[number]) => {
    setImportingSectorKey(sector.key);
    try {
      await api.upsertSectorNode({
        id: sector.key,
        name: sector.label,
        description: sector.tagline,
      });
      for (let index = 0; index < sector.nodes.length; index += 1) {
        await api.upsertSectorNode({
          id: `${sector.key}-${index}`,
          name: sector.nodes[index],
          parent_id: sector.key,
          description: `${sector.label}核心环节`,
          sort_order: index,
        });
      }
      toast.success(`${sector.label}已加入行业中心`);
      await load();
      setSelectedSector(sector.label);
      setIndicatorForm((prev) => ({ ...prev, sector: sector.label }));
      setForm((prev) => ({ ...prev, related: sector.label }));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "行业导入失败");
    } finally {
      setImportingSectorKey("");
    }
  };

  const importAllBuiltInSectors = async () => {
    for (const sector of sectorsData.sectors.filter((item) => !sectorTree.some((node) => node.name === item.label))) {
      await importBuiltInSector(sector);
    }
  };

  const submitWeeklyReview = async () => {
    if (!weeklyForm.title.trim()) {
      toast.error("先写本周复盘标题");
      return;
    }
    const rows = orderedWatchStocks.map((item) => {
      const ticker = `${item.code}.${item.market}`;
      const row = weeklyStocks[ticker] || { change: "", note: "" };
      return {
        ticker,
        name: item.name,
        group: item.group,
        change: row.change,
        note: row.note,
      };
    });
    const content = buildWeeklyMarkdown(rows, weeklyForm.actionAdvice, weeklyForm.sectorViews, weeklyForm.keyEvents);
    const relatedStocks = rows.filter((item) => item.change.trim() || item.note.trim()).map((item) => item.ticker);
    const created = await api.createKnowledgeEntry({
      title: weeklyForm.title.trim(),
      type: "weekly_review",
      content,
      date: weeklyForm.date || todayDate(),
      tags: ["周度复盘", ...tags(weeklyForm.sectors)],
      related_sectors: tags(weeklyForm.sectors),
      related_stocks: relatedStocks,
    });
    setWeeklyForm({ title: "", date: todayDate(), sectors: "", actionAdvice: "", sectorViews: "", keyEvents: "" });
    setWeeklyStocks((current) => {
      const reset: Record<string, { change: string; note: string }> = {};
      for (const key of Object.keys(current)) reset[key] = { change: "", note: "" };
      return reset;
    });
    setSelectedWeeklyEntryId(created.id);
    toast.success("周度复盘已沉淀");
    await load();
  };

  const triggerSummary = async (entry: KnowledgeEntry) => {
    await api.generateEntrySummary(entry.id);
    toast.success("AI 摘要已生成");
    await load();
  };

  const triggerImage = async (entry: KnowledgeEntry) => {
    await api.generateEntryImageArtifact(entry.id);
    toast.success("已准备好固定图片生成请求");
    await load();
  };

  const deleteSectorNode = async (nodeId: string, name: string) => {
    const confirmed = window.confirm(`确认删除行业“${name}”吗？该行业会从行业中心对象池里移除。`);
    if (!confirmed) return;
    try {
      const result = await api.deleteSectorNode(nodeId);
      setSectorTree(result.nodes);
      if (selectedSector === name) {
        setSelectedSector(result.nodes[0]?.name || "");
      }
      toast.success("行业对象已移除");
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "行业删除失败");
    }
  };

  const renameSectorNode = async () => {
    const selectedNode = orderedSectorTree.find((item) => item.name === selectedSector);
    if (!selectedNode) {
      toast.error("先选择一个行业对象");
      return;
    }
    if (!sectorRenameForm.name.trim()) {
      toast.error("行业名称不能为空");
      return;
    }
    try {
      await api.upsertSectorNode({
        id: selectedNode.id,
        name: sectorRenameForm.name.trim(),
        parent_id: selectedNode.parent_id,
        description: sectorRenameForm.description.trim(),
        sort_order: selectedNode.sort_order,
      });
      setSelectedSector(sectorRenameForm.name.trim());
      toast.success("行业名称已更新");
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "行业重命名失败");
    }
  };

  const uploadAndAttachReport = async (file: File) => {
    const isSectorScope = active === "sectors";
    if (isSectorScope && !selectedSector) {
      toast.error("先选择一个行业中心");
      return;
    }
    if (!isSectorScope && !selectedTicker) {
      toast.error("先选择一个个股中心");
      return;
    }
    try {
      const report = await api.uploadReport(file.name, await fileToB64(file));
      await api.createKnowledgeEntry({
        title: `研报：${report.name}`,
        type: "attachment_link",
        content: `report:${report.id}\n${report.name}\n行业：${report.industry}`,
        tags: ["研报", report.industry],
        related_sectors: isSectorScope ? [selectedSector] : [],
        related_stocks: isSectorScope ? [] : [selectedTicker],
      });
      toast.success(isSectorScope ? "研报已归档并挂到当前行业" : "研报已归档并挂到当前个股");
      await load();
      if (!isSectorScope) await loadStockCenter(selectedTicker);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "研报挂接失败");
    }
  };

  const addAttachmentLink = async (scope: "sector" | "stock") => {
    if (scope === "sector" && !selectedSector) {
      toast.error("先选择一个行业中心");
      return;
    }
    if (scope === "stock" && !selectedTicker) {
      toast.error("先选择一个个股中心");
      return;
    }
    if (!attachmentForm.url.trim() && !attachmentForm.notes.trim()) {
      toast.error("先粘贴链接或填写资料说明");
      return;
    }
    const url = attachmentForm.url.trim();
    const title = attachmentForm.title.trim() || (url ? `附件链接：${url.replace(/^https?:\/\//, "").slice(0, 48)}` : "附件资料");
    const content = [url, attachmentForm.notes.trim()].filter(Boolean).join("\n");
    try {
      await api.createKnowledgeEntry({
        title,
        type: "attachment_link",
        content,
        tags: ["附件", ...tags(attachmentForm.tags)],
        related_sectors: scope === "sector" ? [selectedSector] : [],
        related_stocks: scope === "stock" ? [selectedTicker] : [],
      });
      setAttachmentForm({ title: "", url: "", notes: "", tags: "" });
      toast.success(scope === "sector" ? "附件链接已挂到当前行业" : "附件链接已挂到当前个股");
      await load();
      if (scope === "stock") await loadStockCenter(selectedTicker);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "附件链接保存失败");
    }
  };

  const buildSectorOverview = async () => {
    if (!selectedSector) {
      toast.error("先选择一个行业中心");
      return;
    }
    setBuildingOverview("sector");
    try {
      const result = await api.buildSectorOverview(selectedSector);
      const modules = await api.sectorModules(selectedSector);
      setSectorModules((prev) => [...prev.filter((item) => item.sector !== selectedSector), ...modules.items]);
      toast.success(`行业概览已更新：读取 ${result.sources_count} 条资料，生成 ${result.modules.length} 个框架模块`);
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "行业概览更新失败");
    } finally {
      setBuildingOverview("");
    }
  };

  const ingestSectorReports = async () => {
    if (!selectedSector) {
      toast.error("先选择一个行业中心");
      return;
    }
    setIngestingReports(true);
    try {
      const result = await api.ingestSectorReports({
        sector: selectedSector,
        days: 365,
        max_pages: 5,
        max_reports: 12,
      });
      if (result.errors.length > 0 && result.created === 0) {
        toast.error(`行业研报源暂时不可用：${result.errors[0].message}`);
      } else {
        toast.success(`行业研报已提取：新增 ${result.created} 篇，跳过 ${result.skipped} 篇；关键词：${result.keywords.join("、")}`);
      }
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "行业研报提取失败");
    } finally {
      setIngestingReports(false);
    }
  };

  const buildStockOverview = async () => {
    if (!selectedTicker) {
      toast.error("先选择一个个股中心");
      return;
    }
    setBuildingOverview("stock");
    try {
      const result = await api.buildStockOverview(selectedTicker);
      const modules = await api.stockModules(selectedTicker);
      setStockModules(modules.items);
      toast.success(`个股概览已更新：读取 ${result.sources_count} 条资料，生成 ${result.modules.length} 个框架模块`);
      await load();
      await loadStockCenter(selectedTicker);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "个股概览更新失败");
    } finally {
      setBuildingOverview("");
    }
  };

  const ingestMarketReports = async () => {
    if (!selectedTicker) {
      toast.error("先选择一个个股中心");
      return;
    }
    setIngestingReports(true);
    try {
      const result = await api.ingestMarketReports({
        tickers: [selectedTicker],
        pages: 1,
        max_reports_per_stock: 8,
      });
      if (result.errors.length > 0 && result.created === 0) {
        toast.error(`研报源暂时不可用：${result.errors[0].message}`);
      } else {
        toast.success(`市场研报已提取：新增 ${result.created} 篇，跳过 ${result.skipped} 篇`);
      }
      await load();
      await loadStockCenter(selectedTicker);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "市场研报提取失败");
    } finally {
      setIngestingReports(false);
    }
  };

  const generateLearningPack = async () => {
    if (!selectedSourceId) {
      toast.error("先选择一份资料");
      return;
    }
    const source = learningSources.find((item) => item.id === selectedSourceId);
    setGeneratingPack(true);
    try {
      await api.generateLearningPack({
        source_entry_id: selectedSourceId,
        title: source ? `学习包：${source.title}` : undefined,
      });
      toast.success("学习包已生成");
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "学习包生成失败");
    } finally {
      setGeneratingPack(false);
    }
  };

  const promoteLearningToCenter = async (scope: "sector" | "stock") => {
    const source = selectedLearningEntry || currentLearningSource;
    if (!source) {
      toast.error("先选一份学习资料或学习包");
      return;
    }
    if (scope === "sector" && !learningTargetSector) {
      toast.error("先选一个行业中心");
      return;
    }
    if (scope === "stock" && !learningTargetStock) {
      toast.error("先选一个个股中心");
      return;
    }

    const content = source.summary_text || source.content || source.content_preview || "";
    try {
      if (scope === "sector") {
        await api.createKnowledgeEntry({
          title: `学习转沉淀：${source.title}`,
          type: "sector_profile",
          content: `# ${learningTargetSector}\n\n## 来源资料\n${source.title}\n\n## AI/学习拆解\n${content}\n\n## 后续建议\n- 补市场规模\n- 补产业链\n- 补竞争格局\n- 补跟踪指标`,
          related_sectors: [learningTargetSector],
          tags: ["学习工坊", "行业概览"],
        });
        await api.upsertSectorModule({
          sector: learningTargetSector,
          title: `学习拆解 / ${source.title}`,
          category: "AI框架",
          content,
          data_source: "learning_workshop",
        });
        setSelectedSector(learningTargetSector);
        toast.success("已一键加入行业中心");
      } else {
        await api.createKnowledgeEntry({
          title: `学习转沉淀：${source.title}`,
          type: "stock_profile",
          content: `# ${learningTargetStock}\n\n## 来源资料\n${source.title}\n\n## AI/学习拆解\n${content}\n\n## 后续建议\n- 补业务结构\n- 补竞争格局\n- 补跟踪指标\n- 补风险点`,
          related_stocks: [learningTargetStock],
          tags: ["学习工坊", "个股概览"],
        });
        await api.upsertStockModule({
          ticker: learningTargetStock,
          title: `学习拆解 / ${source.title}`,
          category: "AI框架",
          content,
          data_source: "learning_workshop",
        });
        setSelectedTicker(learningTargetStock);
        toast.success("已一键加入个股中心");
      }
      await load();
      if (scope === "stock") await loadStockCenter(learningTargetStock);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "学习工坊沉淀失败");
    }
  };

  const loadStockCenter = async (ticker: string) => {
    setSelectedTicker(ticker);
    try {
      const [center, modules] = await Promise.all([api.stockCenter(ticker), api.stockModules(ticker)]);
      setStockCenter(center);
      setStockModules(modules.items);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "个股中心加载失败");
    }
  };

  const saveSectorModuleOrder = async (orderedIds: string[]) => {
    if (!selectedSector) return;
    try {
      const result = await api.saveSectorModuleOrder({ sector: selectedSector, ids: orderedIds });
      setSectorModules((prev) => {
        const rest = prev.filter((item) => item.sector !== selectedSector);
        return [...rest, ...result.items];
      });
      toast.success("行业模块顺序已保存");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "行业模块排序保存失败");
      const modules = await api.sectorModules(selectedSector);
      setSectorModules((prev) => {
        const rest = prev.filter((item) => item.sector !== selectedSector);
        return [...rest, ...modules.items];
      });
    }
  };

  const saveSectorIndicatorOrder = async (orderedIds: string[]) => {
    if (!selectedSector) return;
    try {
      const result = await api.saveSectorIndicatorOrder({ sector: selectedSector, ids: orderedIds });
      setSectorIndicators((prev) => {
        const rest = prev.filter((item) => item.sector !== selectedSector);
        return [...rest, ...result.items];
      });
      toast.success("行业指标顺序已保存");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "行业指标排序保存失败");
      const indicators = await api.sectorIndicators(selectedSector);
      setSectorIndicators((prev) => {
        const rest = prev.filter((item) => item.sector !== selectedSector);
        return [...rest, ...indicators.items];
      });
    }
  };

  const saveStockModuleOrder = async (orderedIds: string[]) => {
    if (!selectedTicker) return;
    try {
      const result = await api.saveStockModuleOrder({ ticker: selectedTicker, ids: orderedIds });
      setStockModules(result.items);
      toast.success("个股模块顺序已保存");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "个股模块排序保存失败");
      const modules = await api.stockModules(selectedTicker);
      setStockModules(modules.items);
    }
  };

  const handleSectorModuleDrop = async (targetId: string) => {
    if (!selectedSector || !draggingSectorModuleId || draggingSectorModuleId === targetId) {
      setDraggingSectorModuleId("");
      setDragOverSectorModuleId("");
      return;
    }
    const modules = [...selectedSectorModules];
    const fromIndex = modules.findIndex((item) => item.id === draggingSectorModuleId);
    const toIndex = modules.findIndex((item) => item.id === targetId);
    if (fromIndex < 0 || toIndex < 0) {
      setDraggingSectorModuleId("");
      setDragOverSectorModuleId("");
      return;
    }
    const [moved] = modules.splice(fromIndex, 1);
    modules.splice(toIndex, 0, moved);
    setSectorModules((prev) => {
      const rest = prev.filter((item) => item.sector !== selectedSector);
      return [...rest, ...modules.map((item, index) => ({ ...item, sort_order: index }))];
    });
    setDraggingSectorModuleId("");
    setDragOverSectorModuleId("");
    await saveSectorModuleOrder(modules.map((item) => item.id));
  };

  const handleSectorIndicatorDrop = async (targetId: string) => {
    if (!selectedSector || !draggingSectorIndicatorId || draggingSectorIndicatorId === targetId) {
      setDraggingSectorIndicatorId("");
      setDragOverSectorIndicatorId("");
      return;
    }
    const indicators = [...selectedSectorIndicators];
    const fromIndex = indicators.findIndex((item) => item.id === draggingSectorIndicatorId);
    const toIndex = indicators.findIndex((item) => item.id === targetId);
    if (fromIndex < 0 || toIndex < 0) {
      setDraggingSectorIndicatorId("");
      setDragOverSectorIndicatorId("");
      return;
    }
    const [moved] = indicators.splice(fromIndex, 1);
    indicators.splice(toIndex, 0, moved);
    setSectorIndicators((prev) => {
      const rest = prev.filter((item) => item.sector !== selectedSector);
      return [...rest, ...indicators.map((item, index) => ({ ...item, sort_order: index }))];
    });
    setDraggingSectorIndicatorId("");
    setDragOverSectorIndicatorId("");
    await saveSectorIndicatorOrder(indicators.map((item) => item.id));
  };

  const handleStockModuleDrop = async (targetId: string) => {
    if (!selectedTicker || !draggingStockModuleId || draggingStockModuleId === targetId) {
      setDraggingStockModuleId("");
      setDragOverStockModuleId("");
      return;
    }
    const modules = [...stockModules];
    const fromIndex = modules.findIndex((item) => item.id === draggingStockModuleId);
    const toIndex = modules.findIndex((item) => item.id === targetId);
    if (fromIndex < 0 || toIndex < 0) {
      setDraggingStockModuleId("");
      setDragOverStockModuleId("");
      return;
    }
    const [moved] = modules.splice(fromIndex, 1);
    modules.splice(toIndex, 0, moved);
    setStockModules(modules.map((item, index) => ({ ...item, sort_order: index })));
    setDraggingStockModuleId("");
    setDragOverStockModuleId("");
    await saveStockModuleOrder(modules.map((item) => item.id));
  };

  const currentEntries = active === "sectors"
    ? (selectedSector ? sectorEntries.filter((entry) => entry.related_sectors.includes(selectedSector)) : sectorEntries)
    : active === "stocks"
      ? (selectedTicker ? stockEntries.filter((entry) => entry.related_stocks.includes(selectedTicker)) : stockEntries)
      : active === "learning"
        ? learningEntries
        : weeklyEntries;
  const selectedSectorIndicators = selectedSector ? sectorIndicators.filter((item) => item.sector === selectedSector) : sectorIndicators;
  const selectedSectorModules = selectedSector ? sectorModules.filter((item) => item.sector === selectedSector) : [];
  const orderedSectorTree = useMemo(
    () => sortByStoredOrder(sectorTree, (item) => item.id, sectorNavOrder, (item, index) => item.sort_order * 1000 + index),
    [sectorTree, sectorNavOrder],
  );
  const orderedWatchStocks = useMemo(
    () => sortByStoredOrder(watchStocks, (item) => `${item.code}.${item.market}`, stockNavOrder, (item, index) => item.sort_order * 1000 + index),
    [stockNavOrder, watchStocks],
  );
  const orderedLearningEntries = useMemo(
    () => sortByStoredOrder(learningEntries, (item) => item.id, learningNavOrder, (item, index) => -numericDateValue(item.date || "") * 1000 + index),
    [learningEntries, learningNavOrder],
  );
  const orderedWeeklyEntries = useMemo(
    () => sortByStoredOrder(weeklyEntries, (item) => item.id, weeklyNavOrder, (item, index) => -numericDateValue(item.date || "") * 1000 + index),
    [weeklyEntries, weeklyNavOrder],
  );
  const sectorObjectOptions = useMemo(
    () => orderedSectorTree.map((node) => ({
      key: node.name,
      label: `${node.level > 0 ? `${"·".repeat(node.level)} ` : ""}${node.name}`,
    })),
    [orderedSectorTree],
  );
  const filteredSectorObjectOptions = useMemo(() => {
    const keyword = sectorObjectQuery.trim().toLowerCase();
    if (!keyword) return sectorObjectOptions;
    return sectorObjectOptions.filter((item) => item.label.toLowerCase().includes(keyword) || item.key.toLowerCase().includes(keyword));
  }, [sectorObjectOptions, sectorObjectQuery]);
  useEffect(() => {
    const selectedNode = orderedSectorTree.find((item) => item.name === selectedSector);
    setSectorRenameForm({
      name: selectedNode?.name || "",
      description: selectedNode?.description || "",
    });
  }, [orderedSectorTree, selectedSector]);
  const sectorResearchNotes = selectedSector ? stockEntries.filter((entry) => entry.type === "research_note" && entry.related_sectors.includes(selectedSector)) : [];
  const sectorMemos = selectedSector ? memoEntries.filter((entry) => entry.related_sectors.includes(selectedSector)) : [];
  const sectorWeekly = selectedSector ? weeklyEntries.filter((entry) => entry.related_sectors.includes(selectedSector)) : [];
  const sectorAttachments = selectedSector ? attachmentEntries.filter((entry) => entry.related_sectors.includes(selectedSector)) : [];
  const sectorTrackingComments = selectedSector ? stockEntries.filter((entry) => entry.type === "tracking_comment" && entry.related_sectors.includes(selectedSector)) : [];
  const sectorAutomaticSources = useMemo(
    () => [...sectorAttachments, ...sectorResearchNotes, ...sectorTrackingComments].filter(isAutomaticSource),
    [sectorAttachments, sectorResearchNotes, sectorTrackingComments],
  );
  const builtInSector = useMemo(
    () => sectorsData.sectors.find((item) => item.label === selectedSector) || null,
    [selectedSector],
  );
  const missingBuiltInSectors = useMemo(
    () => sectorsData.sectors.filter((item) => !sectorTree.some((node) => node.name === item.label)),
    [sectorTree],
  );
  const weeklyRows = orderedWatchStocks.map((item) => {
    const ticker = `${item.code}.${item.market}`;
    return {
      ticker,
      name: item.name,
      group: item.group,
      change: weeklyStocks[ticker]?.change || "",
      note: weeklyStocks[ticker]?.note || "",
    };
  });
  const sectorTimeline = buildTimeline([
    ...currentEntries,
    ...sectorMemos,
    ...sectorWeekly,
    ...sectorResearchNotes,
    ...sectorTrackingComments,
    ...sectorAttachments,
  ]);
  const sectorNoteTimeline = useMemo(() => buildTimeline(sectorResearchNotes), [sectorResearchNotes]);
  const sectorCommentTimeline = useMemo(() => buildTimeline(sectorTrackingComments), [sectorTrackingComments]);
  const stockMemos = selectedTicker ? memoEntries.filter((entry) => entry.related_stocks.includes(selectedTicker)) : [];
  const stockWeekly = selectedTicker ? weeklyEntries.filter((entry) => entry.related_stocks.includes(selectedTicker)) : [];
  const stockProfiles = selectedTicker ? stockEntries.filter((entry) => entry.type === "stock_profile" && entry.related_stocks.includes(selectedTicker)) : [];
  const stockNoteTimeline = useMemo(() => buildTimeline(stockCenter?.research_notes || []), [stockCenter]);
  const stockCommentTimeline = useMemo(() => buildTimeline(stockCenter?.tracking_comments || []), [stockCenter]);
  const stockTimeline = buildTimeline([
    ...stockProfiles,
    ...(stockCenter?.research_notes || []),
    ...(stockCenter?.tracking_comments || []),
    ...(stockCenter?.attachments || []),
    ...stockMemos,
    ...stockWeekly,
  ]);
  const stockAutomaticSources = useMemo(
    () => [
      ...(stockCenter?.attachments || []),
      ...(stockCenter?.research_notes || []),
      ...(stockCenter?.tracking_comments || []),
    ].filter(isAutomaticSource),
    [stockCenter],
  );
  const orderedStockPublicInfo = useMemo(() => {
    if (!stockCenter) return [] as [string, string][];
    const entries = Object.entries(stockCenter.public_info);
    return sortByStoredOrder(entries, (item) => item[0], readStoredIds(`framework-stock-public-order-${stockCenter.ticker}`), (_item, index) => index);
  }, [stockCenter]);
  const stockIndicatorModules = useMemo(
    () => stockModules.filter((item) => item.category.includes("跟踪指标") || item.title.includes("指标")),
    [stockModules],
  );
  const stockFrameworkModules = useMemo(
    () => stockModules.filter((item) => !stockIndicatorModules.some((indicator) => indicator.id === item.id)),
    [stockIndicatorModules, stockModules],
  );
  const currentLearningSource = useMemo(
    () => learningSources.find((item) => item.id === selectedSourceId) || null,
    [learningSources, selectedSourceId],
  );
  const sectorInsightSources = useMemo<InsightSource[]>(() => {
    const sources: InsightSource[] = [];
    if (builtInSector) {
      sources.push({
        label: "原板块中心",
        text: [builtInSector.tagline, builtInSector.nodes.length > 0 ? `核心环节：${builtInSector.nodes.join("、")}` : ""].filter(Boolean).join("；"),
      });
    }
    currentEntries.forEach((item) => {
      sources.push({ label: `行业条目/${item.title}`, text: item.summary_text || item.content || item.content_preview || "" });
    });
    selectedSectorModules.forEach((item) => {
      sources.push({ label: `自定义模块/${item.title}`, text: `${item.category} ${item.content || ""}`.trim() });
    });
    sectorResearchNotes.forEach((item) => {
      sources.push({ label: `行业纪要/${item.title}`, text: item.summary_text || item.content_preview || item.content || "" });
    });
    sectorAttachments.forEach((item) => {
      sources.push({ label: `附件资料/${item.title}`, text: item.content_preview || item.content || "" });
    });
    sectorTrackingComments.forEach((item) => {
      sources.push({ label: `跟踪点评/${item.title}`, text: item.summary_text || item.content_preview || item.content || "" });
    });
    return sources.filter((item) => item.text.trim());
  }, [builtInSector, currentEntries, sectorAttachments, sectorResearchNotes, sectorTrackingComments, selectedSectorModules]);
  const sectorOverviewBlocks = useMemo<OverviewBlock[]>(() => {
    const generatedModules = selectedSectorModules
      .filter((item) => item.data_source === "auto_overview_builder" || item.category === "行业概览")
      .sort((left, right) => left.sort_order - right.sort_order);
    if (generatedModules.length > 0) {
      return generatedModules.map((item) => ({
        title: item.title,
        body: item.content || "这个模块已经生成，但正文为空。可以重新点击“更新行业概览”。",
      }));
    }
    const chainText = builtInSector?.nodes.length ? `已沉淀的核心环节：${builtInSector.nodes.join("、")}` : "";
    const indicatorText = selectedSectorIndicators.length > 0
      ? selectedSectorIndicators.slice(0, 4).map((item) => `${item.name}（${item.freq}）：${item.viewpoint || "观点待补充"}`).join("\n")
      : "还没有行业跟踪指标，后续可以持续补销量、开工率、价格、库存等关键变量。";
    return [
      {
        title: "市场规模与需求",
        body: formatSourceLines(
          pickSourcesByKeywords(sectorInsightSources, ["市场规模", "需求", "销量", "景气", "渗透率", "空间", "总量"]),
          "这里会沉淀行业市场规模、需求驱动、景气周期和增长空间。你投喂研报/纪要后，AI 可以持续补全这部分。",
        ),
      },
      {
        title: "产业链与关键环节",
        body: [chainText, formatSourceLines(pickSourcesByKeywords(sectorInsightSources, ["产业链", "环节", "上游", "中游", "下游", "链条"]), "这里会沉淀产业链分层、关键卡点与价值分布。")].filter(Boolean).join("\n"),
      },
      {
        title: "技术路线与产品迭代",
        body: formatSourceLines(
          pickSourcesByKeywords(sectorInsightSources, ["技术路线", "工艺", "迭代", "产品", "规格", "性能", "良率", "制程"]),
          "这里会沉淀技术路线、产品代际变化、关键工艺、良率和性能指标。",
        ),
      },
      {
        title: "竞争格局与龙头",
        body: formatSourceLines(
          pickSourcesByKeywords(sectorInsightSources, ["竞争格局", "市占率", "龙头", "份额", "CR", "格局"]),
          "这里会沉淀龙头公司、份额变化、CR3/CR5 以及竞争壁垒。",
        ),
      },
      {
        title: "核心公司与 A 股映射",
        body: formatSourceLines(
          pickSourcesByKeywords(sectorInsightSources, ["公司", "标的", "龙头", "A股", "上市公司", "受益", "映射", "建议关注"]),
          "这里会沉淀产业链核心公司、A 股映射标的、海外可比公司和受益环节。",
        ),
      },
      {
        title: "商业模式与盈利驱动",
        body: formatSourceLines(
          pickSourcesByKeywords(sectorInsightSources, ["商业模式", "盈利", "毛利率", "净利率", "价格", "成本", "利润", "弹性"]),
          "这里会沉淀行业如何赚钱、价格/成本/规模对利润的影响，以及盈利弹性来源。",
        ),
      },
      {
        title: "供需、价格与库存周期",
        body: formatSourceLines(
          pickSourcesByKeywords(sectorInsightSources, ["供给", "需求", "价格", "涨价", "降价", "库存", "周期", "缺口"]),
          "这里会沉淀供需缺口、涨价/降价、库存周期和行业景气位置。",
        ),
      },
      {
        title: "政策、地缘与产业安全",
        body: formatSourceLines(
          pickSourcesByKeywords(sectorInsightSources, ["政策", "国产替代", "制裁", "出口管制", "地缘", "安全", "自主可控"]),
          "这里会沉淀政策支持、地缘限制、国产替代和产业安全约束。",
        ),
      },
      {
        title: "海外映射与全球龙头",
        body: formatSourceLines(
          pickSourcesByKeywords(sectorInsightSources, ["海外", "全球", "Samsung", "SK", "Micron", "英伟达", "台积电", "海外龙头"]),
          "这里会沉淀海外产业链、全球龙头、海外股价映射和跨市场验证线索。",
        ),
      },
      {
        title: "核心跟踪变量",
        body: indicatorText,
      },
      {
        title: "催化事件与验证节点",
        body: formatSourceLines(
          [...pickSourcesByKeywords(sectorInsightSources, ["催化", "事件", "财报", "电话会", "发布", "IPO", "扩产", "验证"]), ...sectorTimeline.slice(0, 2).map((item) => ({ label: `最新更新/${item.title}`, text: item.summary_text || item.content_preview || item.content || "" }))],
          "这里会沉淀未来催化、关键公告、财报电话会、扩产节点和验证指标。",
        ),
      },
      {
        title: "估值、预期与市场分歧",
        body: formatSourceLines(
          pickSourcesByKeywords(sectorInsightSources, ["估值", "PE", "PB", "预期", "分歧", "一致预期", "交易", "股价"]),
          "这里会沉淀估值位置、市场预期、交易分歧和风险收益比。",
        ),
      },
      {
        title: "风险与变化",
        body: formatSourceLines(
          [...pickSourcesByKeywords(sectorInsightSources, ["风险", "压力", "扰动", "政策", "波动", "拐点"]), ...sectorTimeline.slice(0, 2).map((item) => ({ label: `最新更新/${item.title}`, text: item.summary_text || item.content_preview || item.content || "" }))],
          "这里会沉淀政策风险、价格波动、供需变化和预期差来源。",
        ),
      },
      {
        title: "资料基座与更新",
        body: `已沉淀 ${currentEntries.length} 条行业条目、${selectedSectorModules.length} 个自定义模块、${sectorResearchNotes.length} 条纪要、${sectorAttachments.length} 条附件、${sectorTimeline.length} 条时间线记录。\n自定义模块就是你长期扩展这套行业框架的地方，比如“市场规模”“竞争格局”“政策框架”“海外映射”等栏目都可以单独维护。`,
      },
    ];
  }, [builtInSector, currentEntries.length, sectorAttachments.length, sectorInsightSources, sectorResearchNotes.length, sectorTimeline, selectedSectorIndicators, selectedSectorModules]);
  const sectorReportContext = useMemo(() => {
    if (!selectedSector) return "";
    return [
      `行业：${selectedSector}`,
      ...sectorOverviewBlocks.map((item) => `${item.title}\n${item.body}`),
      "最近时间线",
      ...sectorTimeline.slice(0, 6).map((item) => `${item.date} ${item.title}：${cleanSnippet(item.summary_text || item.content_preview || item.content || "", 120)}`),
    ].join("\n\n");
  }, [sectorOverviewBlocks, sectorTimeline, selectedSector]);
  const sectorVisualImages = useMemo(
    () => sectorInsightSources.flatMap((item) => extractImageSources(item.text)).slice(0, 12),
    [sectorInsightSources],
  );
  const stockInsightSources = useMemo<InsightSource[]>(() => {
    const sources: InsightSource[] = [];
    orderedStockPublicInfo.forEach(([key, value]) => {
      sources.push({ label: `公开信息/${key}`, text: value });
    });
    stockModules.forEach((item) => {
      sources.push({ label: `自定义模块/${item.title}`, text: `${item.category} ${item.content || ""}`.trim() });
    });
    (stockCenter?.research_notes || []).forEach((item) => {
      sources.push({ label: `调研纪要/${item.title}`, text: item.summary_text || item.content_preview || item.content || "" });
    });
    (stockCenter?.tracking_comments || []).forEach((item) => {
      sources.push({ label: `跟踪点评/${item.title}`, text: item.summary_text || item.content_preview || item.content || "" });
    });
    (stockCenter?.attachments || []).forEach((item) => {
      sources.push({ label: `附件资料/${item.title}`, text: item.content_preview || item.content || "" });
    });
    stockMemos.forEach((item) => {
      sources.push({ label: `备忘/${item.title}`, text: item.summary_text || item.content_preview || item.content || "" });
    });
    return sources.filter((item) => item.text.trim());
  }, [orderedStockPublicInfo, stockCenter, stockMemos, stockModules]);
  const stockOverviewBlocks = useMemo<OverviewBlock[]>(() => {
    const generatedModules = stockModules
      .filter((item) => item.data_source === "auto_overview_builder" || item.category === "公司概览")
      .sort((left, right) => left.sort_order - right.sort_order);
    if (generatedModules.length > 0) {
      return generatedModules.map((item) => ({
        title: item.title,
        body: item.content || "这个模块已经生成，但正文为空。可以重新点击“更新个股概览”。",
      }));
    }
    const baseInfo = orderedStockPublicInfo.slice(0, 6).map(([key, value]) => `${key}：${value}`).join("\n");
    return [
      {
        title: "公司定位与业务结构",
        body: [baseInfo, formatSourceLines(pickSourcesByKeywords(stockInsightSources, ["业务", "产品", "定位", "收入", "结构", "客户"]), "这里会沉淀公司做什么、业务结构、核心产品和客户画像。")].filter(Boolean).join("\n"),
      },
      {
        title: "行业位置与竞争格局",
        body: formatSourceLines(
          pickSourcesByKeywords(stockInsightSources, ["竞争格局", "份额", "龙头", "壁垒", "优势", "同业"]),
          "这里会沉淀公司在行业里的位置、份额、竞争壁垒和相对优势。",
        ),
      },
      {
        title: "产品、技术与产能",
        body: formatSourceLines(
          pickSourcesByKeywords(stockInsightSources, ["产品", "技术", "工艺", "产能", "良率", "规格", "迭代", "研发"]),
          "这里会沉淀核心产品、技术路线、产能规划、良率变化和研发迭代。",
        ),
      },
      {
        title: "客户结构与订单验证",
        body: formatSourceLines(
          pickSourcesByKeywords(stockInsightSources, ["客户", "订单", "验证", "导入", "定点", "出货", "渠道", "合同"]),
          "这里会沉淀客户结构、订单可见度、导入验证进度和渠道反馈。",
        ),
      },
      {
        title: "财务质量与盈利驱动",
        body: formatSourceLines(
          pickSourcesByKeywords(stockInsightSources, ["收入", "利润", "毛利率", "费用", "现金流", "ROE", "盈利", "弹性"]),
          "这里会沉淀收入利润结构、毛利率、费用率、现金流和利润弹性来源。",
        ),
      },
      {
        title: "管理层、股权与资本动作",
        body: formatSourceLines(
          pickSourcesByKeywords(stockInsightSources, ["股权", "管理层", "回购", "激励", "增持", "减持"]),
          "这里会沉淀股权结构、管理层、回购、激励和其他资本动作。",
        ),
      },
      {
        title: "跟踪指标与催化",
        body: formatSourceLines(
          pickSourcesByKeywords(stockInsightSources, ["订单", "产能", "销量", "财报", "电话会", "催化", "指引"]),
          "这里会沉淀订单、产能、销量、财报、电话会和未来催化。",
        ),
      },
      {
        title: "估值、预期与交易结构",
        body: formatSourceLines(
          pickSourcesByKeywords(stockInsightSources, ["估值", "PE", "PB", "市值", "预期", "一致预期", "持仓", "交易"]),
          "这里会沉淀估值区间、市场预期、机构持仓、交易拥挤度和风险收益比。",
        ),
      },
      {
        title: "风险与观点更新",
        body: formatSourceLines(
          [...pickSourcesByKeywords(stockInsightSources, ["风险", "压力", "波动", "扰动", "预期差"]), ...stockTimeline.slice(0, 3).map((item) => ({ label: `最近更新/${item.title}`, text: item.summary_text || item.content_preview || item.content || "" }))],
          "这里会沉淀关键风险、预期差、跟踪点评和观点迭代。",
        ),
      },
      {
        title: "资料基座与更新",
        body: `已沉淀 ${stockModules.length} 个自定义模块、${(stockCenter?.research_notes || []).length} 条调研纪要、${(stockCenter?.tracking_comments || []).length} 条跟踪点评、${(stockCenter?.attachments || []).length} 条附件、${stockTimeline.length} 条时间线记录。\n自定义模块就是你长期扩展个股框架的地方，比如“商业模式”“股权结构”“管理层”“回购”“海外拓展”等都可以拆成单独栏目。`,
      },
    ];
  }, [orderedStockPublicInfo, stockCenter, stockInsightSources, stockModules, stockTimeline]);
  const stockReportContext = useMemo(() => {
    if (!stockCenter) return "";
    return [
      `个股：${stockCenter.company.name} (${stockCenter.ticker})`,
      `行业分组：${stockCenter.company.group}`,
      ...stockOverviewBlocks.map((item) => `${item.title}\n${item.body}`),
      "最近时间线",
      ...stockTimeline.slice(0, 6).map((item) => `${item.date} ${item.title}：${cleanSnippet(item.summary_text || item.content_preview || item.content || "", 120)}`),
    ].join("\n\n");
  }, [stockCenter, stockOverviewBlocks, stockTimeline]);
  const stockVisualImages = useMemo(
    () => stockInsightSources.flatMap((item) => extractImageSources(item.text)).slice(0, 12),
    [stockInsightSources],
  );
  const selectedLearningEntry = selectedLearningEntryId ? learningEntries.find((entry) => entry.id === selectedLearningEntryId) || null : orderedLearningEntries[0] || null;
  const learningPack = selectedLearningEntry ? parseLearningPack(selectedLearningEntry) : null;
  const selectedWeeklyEntry = selectedWeeklyEntryId ? weeklyEntries.find((entry) => entry.id === selectedWeeklyEntryId) || null : null;
  const weeklyEntriesByYear = useMemo(() => {
    const grouped = new Map<string, KnowledgeEntry[]>();
    for (const entry of orderedWeeklyEntries) {
      const year = (entry.date || "").slice(0, 4) || "未分年";
      grouped.set(year, [...(grouped.get(year) || []), entry]);
    }
    return Array.from(grouped.entries())
      .map(([year, entries]) => ({
        year,
        entries,
      }));
  }, [orderedWeeklyEntries]);
  const activeWeeklyYear = selectedWeeklyEntry
    ? (selectedWeeklyEntry.date || "").slice(0, 4) || weeklyYearView || weeklyEntriesByYear[0]?.year || ""
    : weeklyYearView || weeklyEntriesByYear[0]?.year || "";
  const visibleWeeklyEntries = useMemo(
    () => weeklyEntriesByYear.find((group) => group.year === activeWeeklyYear)?.entries || [],
    [activeWeeklyYear, weeklyEntriesByYear],
  );

  useEffect(() => {
    if (active !== "sectors" || selectedSector) return;
    const fallbackSector = sectorObjectOptions[0]?.key || "";
    if (!fallbackSector) return;
    setSelectedSector(fallbackSector);
    setIndicatorForm((prev) => ({ ...prev, sector: prev.sector || fallbackSector }));
    setForm((prev) => ({ ...prev, related: prev.related || fallbackSector }));
  }, [active, sectorObjectOptions, selectedSector]);

  useEffect(() => {
    if (!learningTargetSector && sectorObjectOptions[0]?.key) {
      setLearningTargetSector(sectorObjectOptions[0].key);
    }
  }, [learningTargetSector, sectorObjectOptions]);

  useEffect(() => {
    if (!learningTargetStock && orderedWatchStocks[0]) {
      setLearningTargetStock(`${orderedWatchStocks[0].code}.${orderedWatchStocks[0].market}`);
    }
  }, [learningTargetStock, orderedWatchStocks]);

  const handleStockPublicDrop = (targetKey: string) => {
    if (!stockCenter || !draggingStockPublicKey || draggingStockPublicKey === targetKey) {
      setDraggingStockPublicKey("");
      setDragOverStockPublicKey("");
      return;
    }
    const keys = orderedStockPublicInfo.map(([key]) => key);
    const fromIndex = keys.findIndex((key) => key === draggingStockPublicKey);
    const toIndex = keys.findIndex((key) => key === targetKey);
    if (fromIndex < 0 || toIndex < 0) {
      setDraggingStockPublicKey("");
      setDragOverStockPublicKey("");
      return;
    }
    const next = [...keys];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    writeStoredIds(`framework-stock-public-order-${stockCenter.ticker}`, next);
    setDraggingStockPublicKey("");
    setDragOverStockPublicKey("");
    setStockCenter((prev) => prev ? { ...prev, public_info: Object.fromEntries(sortByStoredOrder(Object.entries(prev.public_info), (item) => item[0], next, (_item, index) => index)) } : prev);
    toast.success("公开信息顺序已记住");
  };

  const persistFrameworkNavOrder = (storageKey: string, ids: string[]) => {
    writeStoredIds(storageKey, ids);
  };

  const handleFrameworkNavDrop = async (targetId: string) => {
    if (!draggingFrameworkNavId || draggingFrameworkNavId === targetId) {
      setDraggingFrameworkNavId("");
      setDragOverFrameworkNavId("");
      return;
    }

    const reorderIds = (ids: string[]) => {
      const fromIndex = ids.findIndex((id) => id === draggingFrameworkNavId);
      const toIndex = ids.findIndex((id) => id === targetId);
      if (fromIndex < 0 || toIndex < 0) return ids;
      const next = [...ids];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    };

    try {
      if (active === "sectors") {
        const next = reorderIds(orderedSectorTree.map((item) => item.id));
        setSectorNavOrder(next);
        persistFrameworkNavOrder("framework-sector-nav-order", next);
        const result = await api.saveSectorTreeOrder(next);
        setSectorTree(result.nodes);
        toast.success("行业列表顺序已保存");
      } else if (active === "stocks") {
        const next = reorderIds(orderedWatchStocks.map((item) => `${item.code}.${item.market}`));
        setStockNavOrder(next);
        persistFrameworkNavOrder("framework-stock-nav-order", next);
        const rank = new Map(next.map((id, index) => [id, index]));
        const stocks = watchStocks
          .map((item) => ({ ...item, sort_order: rank.get(`${item.code}.${item.market}`) ?? item.sort_order }))
          .sort((left, right) => left.sort_order - right.sort_order);
        setWatchStocks(stocks);
        await api.saveWatchlist({ stocks, indicators: watchIndicators });
        toast.success("个股列表顺序已保存");
      } else if (active === "weekly") {
        const next = reorderIds(orderedWeeklyEntries.map((item) => item.id));
        setWeeklyNavOrder(next);
        persistFrameworkNavOrder("framework-weekly-nav-order", next);
        const result = await api.saveKnowledgeEntryOrder({ kind: "weekly_review", ids: next });
        setWeeklyEntries(result);
        toast.success("周复盘列表顺序已保存");
      } else if (active === "learning") {
        const next = reorderIds(orderedLearningEntries.map((item) => item.id));
        setLearningNavOrder(next);
        persistFrameworkNavOrder("framework-learning-nav-order", next);
        const result = await api.saveKnowledgeEntryOrder({ kind: "learning_pack", ids: next });
        setLearningEntries(result);
        toast.success("学习包列表顺序已保存");
      }
    } finally {
      setDraggingFrameworkNavId("");
      setDragOverFrameworkNavId("");
    }
  };

  return (
    <div>
      <PageHeader
        title="框架沉淀"
        subtitle="以行业中心、个股中心和周度复盘为主轴，把资料、纪要、点评与行动建议持续积累下来。"
        actions={<span className="text-xs text-muted-foreground">{summaryTargets.length} 条内容还没生成摘要</span>}
      />
      <div className="space-y-4">
        {active === "sectors" && (
          <SectionTabs
            tabs={SECTOR_CENTER_TABS}
            active={sectorCenterTab}
            onChange={setSectorCenterTab}
            draggableStorageKey="framework-sector-center-tabs"
          />
        )}
        {active === "stocks" && (
          <SectionTabs
            tabs={STOCK_CENTER_TABS}
            active={stockCenterTab}
            onChange={setStockCenterTab}
            draggableStorageKey="framework-stock-center-tabs"
          />
        )}

        {(active === "weekly" || active === "learning" || (active === "sectors" && sectorCenterTab === "entry") || (active === "stocks" && stockCenterTab === "entry")) && (
        <GlassCard className="space-y-3">
          <h3 className="font-semibold">{active === "sectors" ? "新增行业中心条目" : active === "stocks" ? "新增调研纪要 / 跟踪点评" : active === "learning" ? "生成互动学习包" : "新增周度复盘"}</h3>
          {active === "learning" ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">选择一份已沉淀的研报、纪要、点评或备忘，一键生成“闯关模式 + 路演模式 + 推演模式”。</p>
              <select
                value={selectedSourceId}
                onChange={(event) => setSelectedSourceId(event.target.value)}
                className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
              >
                <option value="">选择资料</option>
                {learningSources.map((item) => (
                  <option key={item.id} value={item.id}>{item.title}（{item.type}）</option>
                ))}
              </select>
              <button
                onClick={() => void generateLearningPack()}
                disabled={generatingPack || !selectedSourceId}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary/15 px-4 py-2 text-sm font-medium text-primary shadow-glow hover:bg-primary/25 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <BookOpenCheck className="h-4 w-4" /> {generatingPack ? "正在生成学习包..." : "生成互动学习包"}
              </button>
              <div className="grid gap-2 text-sm text-muted-foreground">
                <div className="rounded-lg bg-muted/25 p-3">闯关模式：把资料拆成“主线、业务、指标、风险、观点”。</div>
                <div className="rounded-lg bg-muted/25 p-3">路演模式：生成可翻页讲解的展示稿骨架。</div>
                <div className="rounded-lg bg-muted/25 p-3">推演模式：围绕核心变量训练观点更新。</div>
              </div>
              <div className="space-y-3 rounded-xl border border-border/50 bg-black/10 p-3">
                <p className="text-sm font-medium">一键沉淀到中心</p>
                <p className="text-xs text-muted-foreground">如果某个行业或个股值得长期跟踪，可以直接把当前学习资料转成行业中心/个股中心的框架条目。</p>
                <select
                  value={learningTargetSector}
                  onChange={(event) => setLearningTargetSector(event.target.value)}
                  className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
                >
                  <option value="">选择行业中心</option>
                  {sectorObjectOptions.map((item) => (
                    <option key={item.key} value={item.key}>{item.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => void promoteLearningToCenter("sector")}
                  disabled={!selectedSourceId && !selectedLearningEntry}
                  className="w-full rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary hover:bg-primary/15 disabled:opacity-60"
                >
                  一键加入行业中心
                </button>
                <select
                  value={learningTargetStock}
                  onChange={(event) => setLearningTargetStock(event.target.value)}
                  className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
                >
                  <option value="">选择个股中心</option>
                  {orderedWatchStocks.map((item) => {
                    const ticker = `${item.code}.${item.market}`;
                    return <option key={ticker} value={ticker}>{item.name}（{ticker}）</option>;
                  })}
                </select>
                <button
                  onClick={() => void promoteLearningToCenter("stock")}
                  disabled={orderedWatchStocks.length === 0 || (!selectedSourceId && !selectedLearningEntry)}
                  className="w-full rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary hover:bg-primary/15 disabled:opacity-60"
                >
                  一键加入个股中心
                </button>
              </div>
            </div>
          ) : active === "weekly" ? (
            <div className="space-y-3">
              <input value={weeklyForm.title} onChange={(event) => setWeeklyForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="标题：2026W29 周度复盘" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">复盘日期</span>
                <input
                  type="date"
                  value={weeklyForm.date}
                  onChange={(event) => setWeeklyForm((prev) => ({ ...prev, date: event.target.value }))}
                  className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
                />
              </label>
              <input value={weeklyForm.sectors} onChange={(event) => setWeeklyForm((prev) => ({ ...prev, sectors: event.target.value }))} placeholder="关联行业：工程机械, 电网设备, 出海链" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
              <div className="rounded-xl border border-border/50 bg-black/10 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">核心个股周涨跌</p>
                  <span className="text-xs text-muted-foreground">{weeklyRows.length} 只关注股</span>
                </div>
                <div className="space-y-2">
                  {weeklyRows.length === 0 ? (
                    <p className="rounded-lg bg-muted/25 px-3 py-3 text-sm text-muted-foreground">关注列表还没有股票，先去“关注列表”补你的核心跟踪池。</p>
                  ) : (
                    weeklyRows.map((item) => (
                      <div key={item.ticker} className="grid gap-2 rounded-lg border border-border/40 bg-muted/20 p-3 md:grid-cols-[1.2fr_0.8fr_1fr]">
                        <div>
                          <p className="text-sm font-medium">{item.name}</p>
                          <p className="text-xs text-muted-foreground">{item.group} · {item.ticker}</p>
                        </div>
                        <input
                          value={item.change}
                          onChange={(event) => setWeeklyStocks((prev) => ({ ...prev, [item.ticker]: { ...(prev[item.ticker] || { change: "", note: "" }), change: event.target.value } }))}
                          placeholder="+5.4%"
                          className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
                        />
                        <input
                          value={item.note}
                          onChange={(event) => setWeeklyStocks((prev) => ({ ...prev, [item.ticker]: { ...(prev[item.ticker] || { change: "", note: "" }), note: event.target.value } }))}
                          placeholder="备注：财报预期上修 / 公告催化"
                          className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
                        />
                      </div>
                    ))
                  )}
                </div>
              </div>
              <textarea value={weeklyForm.actionAdvice} onChange={(event) => setWeeklyForm((prev) => ({ ...prev, actionAdvice: event.target.value }))} rows={6} placeholder="行动建议：重点持仓怎么应对，本周准备增减哪些标的，推荐观点如何更新。" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
              <textarea value={weeklyForm.sectorViews} onChange={(event) => setWeeklyForm((prev) => ({ ...prev, sectorViews: event.target.value }))} rows={6} placeholder="行业观点：本周重点覆盖行业的事件、景气变化、龙头反馈和后续跟踪重点。" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
              <textarea value={weeklyForm.keyEvents} onChange={(event) => setWeeklyForm((prev) => ({ ...prev, keyEvents: event.target.value }))} rows={4} placeholder="重点事件：可选，补充本周关键公告、电话会、调研、政策和市场分歧点。" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
              <button onClick={() => void submitWeeklyReview()} className="w-full rounded-lg bg-primary/15 px-4 py-2 text-sm font-medium text-primary shadow-glow hover:bg-primary/25">生成并写入周度复盘</button>
            </div>
          ) : (
            <>
          {active === "sectors" && (
            <>
              <div className="space-y-2 rounded-xl border border-border/50 bg-black/10 p-3">
                <p className="text-sm font-medium">当前行业中心</p>
                <select value={selectedSector} onChange={(event) => {
                  setSelectedSector(event.target.value);
                  setIndicatorForm((prev) => ({ ...prev, sector: event.target.value }));
                  setForm((prev) => ({ ...prev, related: event.target.value }));
                }} className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50">
                  <option value="">选择行业</option>
                  {orderedSectorTree.map((node) => <option key={node.id} value={node.name}>{"　".repeat(node.level)}{node.name}</option>)}
                </select>
                <p className="text-xs text-muted-foreground">选中后，右侧会展示该行业的跟踪指标、相关备忘、周复盘和资料入口。</p>
              </div>
              <div className="space-y-2 rounded-xl border border-border/50 bg-black/10 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">原板块中心行业库</p>
                  <button
                    onClick={() => void importAllBuiltInSectors()}
                    disabled={missingBuiltInSectors.length === 0 || !!importingSectorKey}
                    className="rounded-lg border border-primary/40 px-3 py-1.5 text-xs text-primary hover:bg-primary/10 disabled:opacity-50"
                  >
                    全部导入
                  </button>
                </div>
                <div className="max-h-48 space-y-2 overflow-auto pr-1">
                  {sectorsData.sectors.map((item) => {
                    const exists = sectorTree.some((node) => node.name === item.label);
                    return (
                      <div key={item.key} className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{item.label}</p>
                              {item.hot && <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary"><Flame className="h-3 w-3" /> 热门</span>}
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.tagline}</p>
                          </div>
                          <button
                            onClick={() => {
                              setSelectedSector(item.label);
                              if (!exists) void importBuiltInSector(item);
                            }}
                            disabled={importingSectorKey === item.key}
                            className="shrink-0 rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground hover:text-primary disabled:opacity-50"
                          >
                            {exists ? "查看" : importingSectorKey === item.key ? "导入中..." : "导入"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2 rounded-xl border border-border/50 bg-black/10 p-3">
                <p className="text-sm font-medium">行业树节点</p>
                <input value={sectorForm.name} onChange={(event) => setSectorForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="行业名称：工程机械" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <select value={sectorForm.parent_id} onChange={(event) => setSectorForm((prev) => ({ ...prev, parent_id: event.target.value }))} className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50">
                  <option value="">作为一级行业</option>
                  {orderedSectorTree.map((node) => <option key={node.id} value={node.id}>{"　".repeat(node.level)}{node.name}</option>)}
                </select>
                <input value={sectorForm.description} onChange={(event) => setSectorForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="说明：核心跟踪挖机销量、开工小时数" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <button onClick={() => void addSectorNode()} className="w-full rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary hover:bg-primary/15">加入行业树</button>
              </div>
              <div className="space-y-2 rounded-xl border border-border/50 bg-black/10 p-3">
                <p className="text-sm font-medium">行业跟踪指标</p>
                <select value={indicatorForm.sector} onChange={(event) => setIndicatorForm((prev) => ({ ...prev, sector: event.target.value }))} className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50">
                  <option value="">选择行业</option>
                  {orderedSectorTree.map((node) => <option key={node.id} value={node.name}>{"　".repeat(node.level)}{node.name}</option>)}
                </select>
                <input value={indicatorForm.name} onChange={(event) => setIndicatorForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="指标名称：挖掘机月度销量" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <div className="grid grid-cols-2 gap-2">
                  <select value={indicatorForm.freq} onChange={(event) => setIndicatorForm((prev) => ({ ...prev, freq: event.target.value }))} className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50">
                    <option>月度</option>
                    <option>季度</option>
                    <option>年度</option>
                  </select>
                  <select value={indicatorForm.chart_kind} onChange={(event) => setIndicatorForm((prev) => ({ ...prev, chart_kind: event.target.value }))} className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50">
                    <option value="line">折线图</option>
                    <option value="bar">柱状图</option>
                    <option value="heatmap">热力表</option>
                  </select>
                </div>
                <textarea value={indicatorForm.viewpoint} onChange={(event) => setIndicatorForm((prev) => ({ ...prev, viewpoint: event.target.value }))} rows={3} placeholder="观点：同比和出口占比是景气判断核心。" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <button onClick={() => void addSectorIndicator()} className="w-full rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary hover:bg-primary/15">保存跟踪指标</button>
              </div>
              <div className="space-y-2 rounded-xl border border-border/50 bg-black/10 p-3">
                <p className="text-sm font-medium">行业自定义模块</p>
                <input value={sectorModuleForm.title} onChange={(event) => setSectorModuleForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="模块标题：竞争格局 / 政策框架 / 产业链图谱" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <input value={sectorModuleForm.category} onChange={(event) => setSectorModuleForm((prev) => ({ ...prev, category: event.target.value }))} placeholder="分类：行业框架 / 政策 / 跟踪要点" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <textarea value={sectorModuleForm.content} onChange={(event) => setSectorModuleForm((prev) => ({ ...prev, content: event.target.value }))} rows={3} placeholder="说明：记录这个行业最值得长期反复更新的一类框架内容。" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <button onClick={() => void addSectorModule()} className="w-full rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary hover:bg-primary/15">保存行业模块</button>
              </div>
              <div className="space-y-2 rounded-xl border border-border/50 bg-black/10 p-3">
                <p className="text-sm font-medium">高价值纪要接入口</p>
                <input value={premiumNoteForm.title} onChange={(event) => setPremiumNoteForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="纪要标题：工程机械专家会纪要 / 渠道会纪要" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <input value={premiumNoteForm.source_name} onChange={(event) => setPremiumNoteForm((prev) => ({ ...prev, source_name: event.target.value }))} placeholder="来源标识：alphaengine / expert_network / 渠道库" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <textarea value={premiumNoteForm.content} onChange={(event) => setPremiumNoteForm((prev) => ({ ...prev, content: event.target.value }))} rows={4} placeholder="未来这里可以直接接专家会议纪要、渠道会纪要等高价值接口；当前也支持先手动贴入正文沉淀。" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <button onClick={() => void ingestPremiumNote("industry")} className="w-full rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary hover:bg-primary/15">沉淀进行业中心</button>
              </div>
              <button
                onClick={() => reportInputRef.current?.click()}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-primary"
              >
                <Upload className="h-4 w-4" /> 上传研报并挂到当前行业
              </button>
            </>
          )}
          <input value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="标题" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
          {active === "sectors" && (
            <div className="grid gap-2 md:grid-cols-2">
              <button
                onClick={() => setSectorKind("sector_profile")}
                className={`rounded-lg border px-3 py-2 text-sm ${sectorKind === "sector_profile" ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"}`}
              >
                行业概览
              </button>
              <button
                onClick={() => setSectorKind("research_note")}
                className={`rounded-lg border px-3 py-2 text-sm ${sectorKind === "research_note" ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"}`}
              >
                调研纪要
              </button>
              <button
                onClick={() => setSectorKind("tracking_comment")}
                className={`rounded-lg border px-3 py-2 text-sm ${sectorKind === "tracking_comment" ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"}`}
              >
                行业点评
              </button>
              <button
                onClick={() => setSectorKind("attachment_link")}
                className={`rounded-lg border px-3 py-2 text-sm ${sectorKind === "attachment_link" ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"}`}
              >
                附件链接
              </button>
            </div>
          )}
          {active === "stocks" && (
            <div className="grid gap-2 md:grid-cols-3">
              <button
                onClick={() => setStockKind("research_note")}
                className={`rounded-lg border px-3 py-2 text-sm ${stockKind === "research_note" ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"}`}
              >
                调研纪要
              </button>
              <button
                onClick={() => setStockKind("tracking_comment")}
                className={`rounded-lg border px-3 py-2 text-sm ${stockKind === "tracking_comment" ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"}`}
              >
                跟踪点评
              </button>
              <button
                onClick={() => setStockKind("attachment_link")}
                className={`rounded-lg border px-3 py-2 text-sm ${stockKind === "attachment_link" ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"}`}
              >
                附件链接
              </button>
            </div>
          )}
          <textarea value={form.content} onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))} rows={8} placeholder={active === "stocks" && stockKind === "attachment_link" ? "第一行贴链接，下一行开始写说明或备注。" : active === "sectors" && sectorKind === "attachment_link" ? "第一行贴链接，下一行开始写研报、纪要或外部资料说明。" : "写下正文内容，后面可以手动生成 AI 摘要和固定图片请求。"} className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
          {((active === "stocks" && stockKind === "tracking_comment") || (active === "sectors" && sectorKind === "tracking_comment")) && (
            <div className="space-y-2">
              <p className="text-sm font-medium">投资建议</p>
              <div className="grid gap-2 md:grid-cols-3">
                <button
                  onClick={() => setForm((prev) => ({ ...prev, investment_view: "bullish" }))}
                  className={`rounded-lg border px-3 py-2 text-sm ${form.investment_view === "bullish" ? "border-red-400 bg-red-500/15 text-red-200" : "border-border text-muted-foreground"}`}
                >
                  看多
                </button>
                <button
                  onClick={() => setForm((prev) => ({ ...prev, investment_view: "neutral" }))}
                  className={`rounded-lg border px-3 py-2 text-sm ${form.investment_view === "neutral" ? "border-slate-400 bg-slate-500/15 text-slate-200" : "border-border text-muted-foreground"}`}
                >
                  中性
                </button>
                <button
                  onClick={() => setForm((prev) => ({ ...prev, investment_view: "bearish" }))}
                  className={`rounded-lg border px-3 py-2 text-sm ${form.investment_view === "bearish" ? "border-emerald-400 bg-emerald-500/15 text-emerald-200" : "border-border text-muted-foreground"}`}
                >
                  看空
                </button>
              </div>
              <p className="text-xs text-muted-foreground">这个结论会和点评一起沉淀进时间线，方便你后续复盘判断准确率。</p>
            </div>
          )}
          <input value={form.related} onChange={(event) => setForm((prev) => ({ ...prev, related: event.target.value }))} placeholder={active === "stocks" ? "关联个股：000425.SZ" : "关联行业：工程机械"} className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
          <input value={form.tags} onChange={(event) => setForm((prev) => ({ ...prev, tags: event.target.value }))} placeholder="标签：调研纪要, 景气度, 周复盘" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
          {active === "stocks" && watchStocks.length > 0 && (
            <div className="space-y-2">
              <select
                value={selectedTicker}
                onChange={(event) => void loadStockCenter(event.target.value)}
                className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
              >
                <option value="">选择个股中心</option>
                {orderedWatchStocks.map((item) => {
                  const ticker = `${item.code}.${item.market}`;
                  return <option key={ticker} value={ticker}>{item.name}（{ticker}）</option>;
                })}
              </select>
              <div className="rounded-lg bg-muted/25 p-3 text-sm text-muted-foreground">
                当前关注个股：{orderedWatchStocks.map((item) => `${item.name}(${item.code}.${item.market})`).join(" · ")}
              </div>
              <div className="space-y-2 rounded-xl border border-border/50 bg-black/10 p-3">
                <p className="text-sm font-medium">个股自定义模块</p>
                <input value={stockModuleForm.title} onChange={(event) => setStockModuleForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="模块标题：股权结构 / 管理层 / 回购" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <input value={stockModuleForm.category} onChange={(event) => setStockModuleForm((prev) => ({ ...prev, category: event.target.value }))} placeholder="分类：公开信息 / 主观跟踪 / 自动抽取" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <textarea value={stockModuleForm.content} onChange={(event) => setStockModuleForm((prev) => ({ ...prev, content: event.target.value }))} rows={3} placeholder="说明：未来这里可接公开信息自动抽取，也可以先手动记录关键观察。" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <button onClick={() => void addStockModule()} className="w-full rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary hover:bg-primary/15">保存个股模块</button>
              </div>
              <div className="space-y-2 rounded-xl border border-border/50 bg-black/10 p-3">
                <p className="text-sm font-medium">高价值纪要接入口</p>
                <input value={premiumNoteForm.title} onChange={(event) => setPremiumNoteForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="纪要标题：公司专家会 / 渠道反馈 / 电话会补充" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <input value={premiumNoteForm.source_name} onChange={(event) => setPremiumNoteForm((prev) => ({ ...prev, source_name: event.target.value }))} placeholder="来源标识：alphaengine / expert_network / 买方纪要库" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <textarea value={premiumNoteForm.content} onChange={(event) => setPremiumNoteForm((prev) => ({ ...prev, content: event.target.value }))} rows={4} placeholder="未来这里可以直接接专家纪要、会议纪要和渠道反馈接口；当前也支持先手动贴入正文沉淀。" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <button onClick={() => void ingestPremiumNote("stock")} className="w-full rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary hover:bg-primary/15">沉淀进个股中心</button>
              </div>
              <button
                onClick={() => reportInputRef.current?.click()}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-primary"
              >
                <Upload className="h-4 w-4" /> 上传研报并挂到当前个股
              </button>
              <button
                onClick={() => void ingestMarketReports()}
                disabled={ingestingReports}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FileSearch className="h-4 w-4" /> {ingestingReports ? "正在提取市场研报..." : "提取市场研报"}
              </button>
            </div>
          )}
          <input
            ref={reportInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt,.md,.markdown,.csv,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadAndAttachReport(file);
              event.target.value = "";
            }}
          />
          <button onClick={() => void submit()} className="w-full rounded-lg bg-primary/15 px-4 py-2 text-sm font-medium text-primary shadow-glow hover:bg-primary/25">写入沉淀</button>
            </>
          )}
        </GlassCard>
        )}

        <div className="space-y-4">
          {active === "sectors" && sectorCenterTab === "center" && (
            <GlassCard className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">行业中心对象</p>
                <span className="text-xs text-muted-foreground">{orderedSectorTree.length} 个自定义行业</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/40 bg-muted/20 px-3 py-3">
                <div>
                  <p className="text-sm font-medium">{selectedSector || "暂未选择行业"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">行业太多时默认折叠，需要时再展开切换。</p>
                </div>
                <button
                  onClick={() => setSectorObjectPanelOpen((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-primary"
                >
                  {sectorObjectPanelOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {sectorObjectPanelOpen ? "收起行业库" : "展开行业库"}
                </button>
              </div>
              {sectorObjectPanelOpen && (
                <div className="space-y-3">
                  <div className="space-y-2 rounded-xl border border-border/40 bg-black/10 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">新增自定义行业</p>
                      <span className="text-xs text-muted-foreground">这里新增后，会直接进入你的行业中心对象池</span>
                    </div>
                    <input
                      value={sectorForm.name}
                      onChange={(event) => setSectorForm((prev) => ({ ...prev, name: event.target.value }))}
                      placeholder="行业名称：工程机械 / IDC 温控 / 民爆"
                      className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
                    />
                    <select
                      value={sectorForm.parent_id}
                      onChange={(event) => setSectorForm((prev) => ({ ...prev, parent_id: event.target.value }))}
                      className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
                    >
                      <option value="">作为一级行业</option>
                      {orderedSectorTree.map((node) => <option key={node.id} value={node.id}>{"　".repeat(node.level)}{node.name}</option>)}
                    </select>
                    <input
                      value={sectorForm.description}
                      onChange={(event) => setSectorForm((prev) => ({ ...prev, description: event.target.value }))}
                      placeholder="说明：写一句你为什么要长期跟踪它"
                      className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
                    />
                    <button
                      onClick={() => void addSectorNode()}
                      className="w-full rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary hover:bg-primary/15"
                    >
                      加入行业中心对象池
                    </button>
                  </div>
                  {selectedSector && (
                    <div className="space-y-2 rounded-xl border border-border/40 bg-black/10 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">重命名当前行业</p>
                        <span className="text-xs text-muted-foreground">你导入的参考行业也可以改成你自己的命名方式</span>
                      </div>
                      <input
                        value={sectorRenameForm.name}
                        onChange={(event) => setSectorRenameForm((prev) => ({ ...prev, name: event.target.value }))}
                        placeholder="新的行业名称"
                        className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
                      />
                      <input
                        value={sectorRenameForm.description}
                        onChange={(event) => setSectorRenameForm((prev) => ({ ...prev, description: event.target.value }))}
                        placeholder="行业说明"
                        className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
                      />
                      <button
                        onClick={() => void renameSectorNode()}
                        className="w-full rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary hover:bg-primary/15"
                      >
                        保存行业名称
                      </button>
                    </div>
                  )}
                  <input
                    value={sectorObjectQuery}
                    onChange={(event) => setSectorObjectQuery(event.target.value)}
                    placeholder="搜索行业，如：工程机械 / 电网设备"
                    className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
                  />
                  {orderedSectorTree.length === 0 ? (
                    <div className="rounded-xl bg-muted/20 px-3 py-3 text-sm text-muted-foreground">行业中心对象池现在完全按你自己维护。先去“新增条目”里新增行业或从原板块中心行业库按需导入。</div>
                  ) : (
                    <div className="space-y-2">
                      <SectionTabs
                        tabs={filteredSectorObjectOptions}
                        active={selectedSector}
                        onChange={(value) => {
                          setSelectedSector(value);
                          setSectorView("overview");
                          setIndicatorForm((prev) => ({ ...prev, sector: value }));
                          setForm((prev) => ({ ...prev, related: value }));
                          setSectorObjectPanelOpen(false);
                        }}
                        draggableStorageKey="framework-sector-object-order"
                      />
                      {selectedSector && orderedSectorTree.find((item) => item.name === selectedSector) && (
                        <button
                          onClick={() => {
                            const node = orderedSectorTree.find((item) => item.name === selectedSector);
                            if (node) void deleteSectorNode(node.id, node.name);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:text-primary"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> 删除当前行业对象
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </GlassCard>
          )}
          {active === "stocks" && stockCenterTab === "center" && (
            <GlassCard className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">个股中心对象</p>
                <span className="text-xs text-muted-foreground">{orderedWatchStocks.length} 只个股</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/40 bg-muted/20 px-3 py-3">
                <div>
                  <p className="text-sm font-medium">{selectedTicker ? orderedWatchStocks.find((item) => `${item.code}.${item.market}` === selectedTicker)?.name || selectedTicker : "暂未选择个股"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">默认折叠个股池，需要时再展开切换。</p>
                </div>
                <button
                  onClick={() => setStockObjectPanelOpen((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-primary"
                >
                  {stockObjectPanelOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {stockObjectPanelOpen ? "收起个股池" : "展开个股池"}
                </button>
              </div>
              {stockObjectPanelOpen && (orderedWatchStocks.length === 0 ? (
                <div className="rounded-xl bg-muted/20 px-3 py-3 text-sm text-muted-foreground">先去关注列表补充核心个股，这里会形成右侧个股切换页。</div>
              ) : (
                <SectionTabs
                  tabs={orderedWatchStocks.map((item) => ({
                    key: `${item.code}.${item.market}`,
                    label: `${item.name} · ${item.group}`,
                  }))}
                  active={selectedTicker}
                  onChange={(value) => {
                    setStockView("overview");
                    setStockObjectPanelOpen(false);
                    void loadStockCenter(value);
                  }}
                  draggableStorageKey="framework-stock-object-order"
                />
              ))}
            </GlassCard>
          )}
          {active === "weekly" && (
            <GlassCard className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">周度复盘切换</p>
                <span className="text-xs text-muted-foreground">{orderedWeeklyEntries.length} 条记录</span>
              </div>
              <SectionTabs
                tabs={[
                  { key: "__new__", label: "新建周复盘" },
                  ...weeklyEntriesByYear.map((group) => ({ key: group.year, label: `${group.year} 年` })),
                ]}
                active={selectedWeeklyEntryId || weeklyYearView ? activeWeeklyYear : "__new__"}
                onChange={(value) => {
                  if (value === "__new__") {
                    setWeeklyYearView("");
                    setSelectedWeeklyEntryId("");
                    return;
                  }
                  setWeeklyYearView(value);
                  setSelectedWeeklyEntryId("");
                }}
                draggableStorageKey="framework-weekly-year-order"
              />
              {selectedWeeklyEntryId === "" && weeklyEntriesByYear.length === 0 ? (
                <div className="rounded-xl bg-muted/20 px-3 py-3 text-sm text-muted-foreground">这里会先按年度归档，再在年度下面沉淀每一周的复盘记录。</div>
              ) : selectedWeeklyEntryId === "" ? null : null}
              {selectedWeeklyEntryId !== "" || visibleWeeklyEntries.length > 0 ? (
                <SectionTabs
                  tabs={visibleWeeklyEntries.map((entry) => ({
                    key: entry.id,
                    label: `${entry.date} · ${entry.title}`,
                  }))}
                  active={selectedWeeklyEntryId}
                  onChange={setSelectedWeeklyEntryId}
                  draggableStorageKey={`framework-weekly-entry-order-${activeWeeklyYear || "all"}`}
                />
              ) : null}
            </GlassCard>
          )}
          {active === "learning" && (
            <GlassCard className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">学习工坊对象</p>
                <span className="text-xs text-muted-foreground">{orderedLearningEntries.length} 个学习包</span>
              </div>
              {orderedLearningEntries.length === 0 ? (
                <div className="rounded-xl bg-muted/20 px-3 py-3 text-sm text-muted-foreground">先生成学习包，这里会形成右侧学习专题切换页。</div>
              ) : (
                <SectionTabs
                  tabs={orderedLearningEntries.map((entry) => ({
                    key: entry.id,
                    label: `${entry.date} · ${entry.title}`,
                  }))}
                  active={selectedLearningEntryId}
                  onChange={(value) => {
                    setSelectedLearningEntryId(value);
                    setLearningView("overview");
                  }}
                  draggableStorageKey="framework-learning-object-order"
                />
              )}
            </GlassCard>
          )}
          {active === "sectors" && sectorCenterTab === "center" && selectedSector && (
            <SectionTabs tabs={SECTOR_VIEW_TABS} active={sectorView} onChange={setSectorView} draggableStorageKey="framework-sector-view-order" />
          )}
          {active === "stocks" && stockCenterTab === "center" && stockCenter && (
            <SectionTabs tabs={STOCK_VIEW_TABS} active={stockView} onChange={setStockView} draggableStorageKey="framework-stock-view-order" />
          )}
          {active === "learning" && selectedLearningEntry && (
            <SectionTabs tabs={LEARNING_VIEW_TABS} active={learningView} onChange={setLearningView} draggableStorageKey="framework-learning-view-order" />
          )}

          {active === "sectors" && sectorCenterTab === "center" && sectorView === "tree" && (
            <GlassCard className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">行业树</h3>
                <span className="text-xs text-muted-foreground">{sectorTree.length} 个节点</span>
              </div>
              {sectorTree.length === 0 ? (
                <p className="rounded-lg bg-muted/25 px-3 py-3 text-sm text-muted-foreground">还没有行业节点。先从左侧加入一个一级行业，比如“工程机械”。</p>
              ) : (
                <div className="space-y-2">
                  {orderedSectorTree.map((node) => (
                    <div
                      key={node.id}
                      draggable
                      onDragStart={() => {
                        setDraggingFrameworkNavId(node.id);
                        setDragOverFrameworkNavId(node.id);
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (dragOverFrameworkNavId !== node.id) setDragOverFrameworkNavId(node.id);
                      }}
                      onDragLeave={() => {
                        if (dragOverFrameworkNavId === node.id) setDragOverFrameworkNavId("");
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        void handleFrameworkNavDrop(node.id);
                      }}
                      onDragEnd={() => {
                        setDraggingFrameworkNavId("");
                        setDragOverFrameworkNavId("");
                      }}
                      className={`rounded-lg border bg-muted/20 px-3 py-2 text-sm ${
                        dragOverFrameworkNavId === node.id && draggingFrameworkNavId !== node.id ? "border-primary/70 ring-1 ring-primary/40" : "border-border/40"
                      } ${draggingFrameworkNavId === node.id ? "opacity-60" : ""}`}
                      style={{ marginLeft: `${node.level * 18}px` }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                        <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing" />
                        <span className="font-medium">{node.name}</span>
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">L{node.level + 1}</span>
                        {node.parent_id && <span className="text-xs text-muted-foreground">上级：{node.parent_id}</span>}
                        </div>
                        <button
                          onClick={() => void deleteSectorNode(node.id, node.name)}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-primary"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> 删除
                        </button>
                      </div>
                      {node.description && <p className="mt-1 text-xs text-muted-foreground">{node.description}</p>}
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          )}
          {active === "sectors" && sectorCenterTab === "center" && sectorView === "indicators" && (
            <GlassCard className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">{selectedSector || "行业"}跟踪指标</h3>
                <span className="text-xs text-muted-foreground">{selectedSectorIndicators.length} 个指标</span>
              </div>
              {selectedSectorIndicators.length === 0 ? (
                <p className="rounded-lg bg-muted/25 px-3 py-3 text-sm text-muted-foreground">还没有跟踪指标。可以先为工程机械添加“挖掘机月度销量”。</p>
              ) : (
                <div className="space-y-3">
                  {selectedSectorIndicators.map((item) => (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={() => {
                        setDraggingSectorIndicatorId(item.id);
                        setDragOverSectorIndicatorId(item.id);
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (dragOverSectorIndicatorId !== item.id) setDragOverSectorIndicatorId(item.id);
                      }}
                      onDragLeave={() => {
                        if (dragOverSectorIndicatorId === item.id) setDragOverSectorIndicatorId("");
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        void handleSectorIndicatorDrop(item.id);
                      }}
                      onDragEnd={() => {
                        setDraggingSectorIndicatorId("");
                        setDragOverSectorIndicatorId("");
                      }}
                      className={`rounded-xl border bg-muted/20 p-3 transition-colors ${
                        dragOverSectorIndicatorId === item.id && draggingSectorIndicatorId !== item.id ? "border-primary/70 ring-1 ring-primary/40" : "border-border/40"
                      } ${draggingSectorIndicatorId === item.id ? "opacity-60" : ""}`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5 cursor-grab text-muted-foreground active:cursor-grabbing">
                          <GripVertical className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{item.name}</p>
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{item.sector}</span>
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{item.freq}</span>
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">{item.viewpoint || "观点待补充"}</p>
                          <VisualPreview
                            title={item.name}
                            subtitle={`数据源：${item.data_source || "可接协会/公众号/公开网页抓取，也支持你手动补图。"}`}
                            chartKind={item.chart_kind}
                            image={extractImageSources(item.viewpoint)[0] || null}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          )}
          {active === "sectors" && sectorCenterTab === "center" && selectedSector && sectorView === "overview" && (
            <GlassCard className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold">{selectedSector}</h3>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">行业中心</span>
                    {builtInSector?.hot && <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary"><Flame className="h-3 w-3" /> 热门赛道</span>}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    行业概览现在是这条赛道的总框架页。你投喂的研报、纪要、附件和自定义模块都会不断沉淀进来，AI 也会基于这套材料持续更新。
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => void ingestSectorReports()}
                    disabled={ingestingReports}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <FileSearch className="h-4 w-4" />
                    {ingestingReports ? "提取中..." : "提取行业研报"}
                  </button>
                  <button
                    onClick={() => void buildSectorOverview()}
                    disabled={buildingOverview === "sector"}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RefreshCw className={`h-4 w-4 ${buildingOverview === "sector" ? "animate-spin" : ""}`} />
                    {buildingOverview === "sector" ? "更新中..." : "更新行业概览"}
                  </button>
                  <AskAiButton
                    context={sectorReportContext}
                    label="生成行业报告"
                    suggestions={["生成一篇高质量行业深度报告", "基于这些材料重建行业框架", "提炼市场规模、产业链和竞争格局", "指出还缺哪些关键资料"]}
                  />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-border/40 px-3 py-3 text-sm">
                  <p className="text-xs text-muted-foreground">行业条目</p>
                  <p className="mt-1 font-medium">{currentEntries.length} 条</p>
                </div>
                <div className="rounded-lg border border-border/40 px-3 py-3 text-sm">
                  <p className="text-xs text-muted-foreground">自定义模块</p>
                  <p className="mt-1 font-medium">{selectedSectorModules.length} 个</p>
                </div>
                <div className="rounded-lg border border-border/40 px-3 py-3 text-sm">
                  <p className="text-xs text-muted-foreground">纪要/点评/附件</p>
                  <p className="mt-1 font-medium">{sectorResearchNotes.length + sectorTrackingComments.length + sectorAttachments.length} 条</p>
                </div>
                <div className="rounded-lg border border-border/40 px-3 py-3 text-sm">
                  <p className="text-xs text-muted-foreground">时间线更新</p>
                  <p className="mt-1 font-medium">{sectorTimeline.length} 条</p>
                </div>
              </div>
              <div className="space-y-3">
                {sectorOverviewBlocks.map((block, index) => (
                  <div key={block.title} className="rounded-xl border border-border/40 bg-muted/20 p-4">
                    <p className="text-sm font-medium">{block.title}</p>
                    <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{block.body}</p>
                    <VisualPreview
                      title={`${block.title}图表/图片位`}
                      subtitle="可接公开信息抓取、手动补录数据，或直接粘贴研报图表图片路径。"
                      chartKind={index % 2 === 0 ? "bar" : "line"}
                      image={sectorVisualImages[index] || null}
                    />
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-border/50 bg-black/10 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">自动信息源</p>
                    <p className="mt-1 text-xs text-muted-foreground">这里只展示系统自动接入的来源，例如东财公开研报、未来 alphaengine 专家纪要接口。你手动投喂的资料仍放在“附件链接”。</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{sectorAutomaticSources.length} 个自动源</span>
                </div>
                <div className="mt-3 space-y-2">
                  {sectorAutomaticSources.length === 0 ? (
                    <div className="rounded-lg bg-muted/25 px-3 py-3 text-sm text-muted-foreground">还没有自动信息源。可以点击“提取行业研报”；手动资料请到“附件链接”页新增。</div>
                  ) : (
                    sectorAutomaticSources.slice(0, 8).map((item) => (
                      <div key={item.id} className="rounded-lg bg-muted/25 px-3 py-2 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{item.title}</p>
                          <span className="text-xs text-muted-foreground">{item.date}</span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.content_preview || item.content || "已沉淀，等待补充说明。"}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">最近更新</p>
                  <span className="text-xs text-muted-foreground">{sectorTimeline.length} 条记录</span>
                </div>
                <div className="space-y-2">
                  {sectorTimeline.length === 0 ? (
                    <div className="rounded-lg bg-muted/25 px-3 py-3 text-sm text-muted-foreground">这个行业还没有沉淀内容。后面无论是备忘、纪要、点评、附件还是周复盘，都会在这里按时间串起来。</div>
                  ) : (
                    sectorTimeline.slice(0, 6).map((item) => (
                      <div key={item.id} className="rounded-xl border border-border/40 bg-muted/20 p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{item.title}</p>
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{entryTypeLabel(item.type)}</span>
                          {item.type === "tracking_comment" && <InvestmentViewBadge view={item.investment_view} />}
                          <span className="text-xs text-muted-foreground">{item.date}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{item.summary_text || item.content_preview || item.content || "已沉淀，等待补充内容。"}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </GlassCard>
          )}
          {active === "sectors" && sectorCenterTab === "center" && selectedSector && sectorView === "modules" && (
            <GlassCard className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">{selectedSector}自定义模块</h3>
                <span className="text-xs text-muted-foreground">{selectedSectorModules.length} 个模块</span>
              </div>
              {selectedSectorModules.length === 0 ? (
                <div className="rounded-lg bg-muted/25 px-3 py-3 text-sm text-muted-foreground">还没有行业自定义模块。可以先加“竞争格局、政策框架、产业链图谱、核心变量”等栏目。</div>
              ) : (
                <div className="space-y-3">
                  {selectedSectorModules.map((item) => (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={() => {
                        setDraggingSectorModuleId(item.id);
                        setDragOverSectorModuleId(item.id);
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (dragOverSectorModuleId !== item.id) setDragOverSectorModuleId(item.id);
                      }}
                      onDragLeave={() => {
                        if (dragOverSectorModuleId === item.id) setDragOverSectorModuleId("");
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        void handleSectorModuleDrop(item.id);
                      }}
                      onDragEnd={() => {
                        setDraggingSectorModuleId("");
                        setDragOverSectorModuleId("");
                      }}
                      className={`rounded-xl border bg-muted/20 p-3 text-sm transition-colors ${
                        dragOverSectorModuleId === item.id && draggingSectorModuleId !== item.id ? "border-primary/70 ring-1 ring-primary/40" : "border-border/40"
                      } ${draggingSectorModuleId === item.id ? "opacity-60" : ""}`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5 cursor-grab text-muted-foreground active:cursor-grabbing">
                          <GripVertical className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{item.title}</p>
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{item.category}</span>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{item.content || "等待补充，后续可接公开资料与自定义框架。"}</p>
                          <p className="mt-2 text-xs text-muted-foreground">数据源：{item.data_source}</p>
                          <VisualPreview
                            title={item.title}
                            subtitle="支持公开信息抓取、手动补录数据、研报截图或图片路径。"
                            chartKind={item.category.includes("图谱") ? "bar" : "line"}
                            image={extractImageSources(item.content)[0] || null}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          )}
          {active === "sectors" && sectorCenterTab === "center" && selectedSector && sectorView === "notes" && (
            <GlassCard className="space-y-4">
              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">行业调研纪要时间线</p>
                  <span className="text-xs text-muted-foreground">累计 {sectorNoteTimeline.length} 次</span>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-border/40 px-3 py-3 text-sm">
                    <p className="text-xs text-muted-foreground">调研/纪要次数</p>
                    <p className="mt-1 font-medium">{sectorNoteTimeline.length} 次</p>
                  </div>
                  <div className="rounded-lg border border-border/40 px-3 py-3 text-sm">
                    <p className="text-xs text-muted-foreground">最近一次</p>
                    <p className="mt-1 font-medium">{sectorNoteTimeline[0]?.date || "暂无"}</p>
                  </div>
                  <div className="rounded-lg border border-border/40 px-3 py-3 text-sm">
                    <p className="text-xs text-muted-foreground">可追溯</p>
                    <p className="mt-1 font-medium">按时间留痕</p>
                  </div>
                </div>
                <div className="mt-3 space-y-3">
                  {sectorNoteTimeline.length === 0 ? (
                    <div className="rounded-lg bg-muted/25 px-3 py-3 text-sm text-muted-foreground">还没有行业调研纪要。你后续每新增一次纪要，这里都会形成一条按日期排序的留痕记录。</div>
                  ) : (
                    sectorNoteTimeline.map((item, index) => (
                      <div key={item.id} className="rounded-xl border border-border/40 bg-muted/20 p-4 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">第 {sectorNoteTimeline.length - index} 次</span>
                            <p className="font-medium">{item.title}</p>
                          </div>
                          <span className="text-xs text-muted-foreground">{item.date}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{item.summary_text || item.content_preview || item.content || ""}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button onClick={() => void triggerSummary(item)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-primary">
                            <Sparkles className="h-3.5 w-3.5" /> {item.summary_status === "ready" ? "重生成摘要" : "生成摘要"}
                          </button>
                          <button onClick={() => void triggerImage(item)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-primary">
                            <FileImage className="h-3.5 w-3.5" /> {item.image_artifact_status === "prepared" ? "重建图片请求" : "生成固定图片请求"}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </GlassCard>
          )}
          {active === "sectors" && sectorCenterTab === "center" && selectedSector && sectorView === "comments" && (
            <GlassCard className="space-y-4">
              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">行业点评时间线</p>
                  <span className="text-xs text-muted-foreground">累计 {sectorCommentTimeline.length} 次</span>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-border/40 px-3 py-3 text-sm">
                    <p className="text-xs text-muted-foreground">点评次数</p>
                    <p className="mt-1 font-medium">{sectorCommentTimeline.length} 次</p>
                  </div>
                  <div className="rounded-lg border border-border/40 px-3 py-3 text-sm">
                    <p className="text-xs text-muted-foreground">最近一次</p>
                    <p className="mt-1 font-medium">{sectorCommentTimeline[0]?.date || "暂无"}</p>
                  </div>
                  <div className="rounded-lg border border-border/40 px-3 py-3 text-sm">
                    <p className="text-xs text-muted-foreground">记录方式</p>
                    <p className="mt-1 font-medium">事件后持续留痕</p>
                  </div>
                </div>
                <div className="mt-3 space-y-3">
                  {sectorCommentTimeline.length === 0 ? (
                    <div className="rounded-lg bg-muted/25 px-3 py-3 text-sm text-muted-foreground">还没有行业点评。后续每新增一条行业点评，这里都会自动沉淀成时间线。</div>
                  ) : (
                    sectorCommentTimeline.map((item, index) => (
                      <div key={item.id} className="rounded-xl border border-border/40 bg-muted/20 p-4 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">第 {sectorCommentTimeline.length - index} 次</span>
                            <p className="font-medium">{item.title}</p>
                            <InvestmentViewBadge view={item.investment_view} />
                          </div>
                          <span className="text-xs text-muted-foreground">{item.date}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{item.summary_text || item.content_preview || item.content || ""}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button onClick={() => void triggerSummary(item)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-primary">
                            <Sparkles className="h-3.5 w-3.5" /> {item.summary_status === "ready" ? "重生成摘要" : "生成摘要"}
                          </button>
                          <button onClick={() => void triggerImage(item)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-primary">
                            <FileImage className="h-3.5 w-3.5" /> {item.image_artifact_status === "prepared" ? "重建图片请求" : "生成固定图片请求"}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </GlassCard>
          )}
          {active === "sectors" && sectorCenterTab === "center" && selectedSector && sectorView === "attachments" && (
            <GlassCard className="space-y-4">
              <div className="rounded-xl border border-border/50 bg-black/10 p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">新增行业附件</p>
                  <span className="text-xs text-muted-foreground">粘贴链接或上传文件，都会挂到 {selectedSector}</span>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <input value={attachmentForm.title} onChange={(event) => setAttachmentForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="资料标题：HBM产业链深度 / 专家会纪要" className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                  <input value={attachmentForm.url} onChange={(event) => setAttachmentForm((prev) => ({ ...prev, url: event.target.value }))} placeholder="粘贴链接：研报、飞书、网页、公众号文章等" className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                </div>
                <textarea value={attachmentForm.notes} onChange={(event) => setAttachmentForm((prev) => ({ ...prev, notes: event.target.value }))} rows={3} placeholder="补充说明：这份资料解决什么问题、有哪些重要图表、后续希望 AI 提取哪些内容。" className="mt-2 w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <input value={attachmentForm.tags} onChange={(event) => setAttachmentForm((prev) => ({ ...prev, tags: event.target.value }))} placeholder="标签：研报, 产业链, HBM" className="mt-2 w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <button onClick={() => void addAttachmentLink("sector")} className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary hover:bg-primary/15">保存附件链接</button>
                  <button onClick={() => attachmentFileInputRef.current?.click()} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-primary">
                    <Upload className="h-4 w-4" /> 上传本地文件
                  </button>
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">附件 / 研报 / 笔记链接</p>
                <div className="space-y-2">
                  {sectorAttachments.length === 0 ? (
                    <div className="rounded-lg bg-muted/25 px-3 py-3 text-sm text-muted-foreground">还没有行业附件。可以在上方粘贴链接，或上传研报、会议纪要、图片和表格。</div>
                  ) : (
                    sectorAttachments.slice(0, 6).map((item) => (
                      <div key={item.id} className="rounded-lg bg-muted/25 px-3 py-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{item.title}</p>
                          {extractFirstUrl(item.content_preview || item.content || "") && (
                            <a href={extractFirstUrl(item.content_preview || item.content || "")} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                              <ExternalLink className="h-3.5 w-3.5" /> 打开链接
                            </a>
                          )}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{item.content_preview || item.content || ""}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </GlassCard>
          )}
          {active === "stocks" && stockCenterTab === "center" && stockCenter && stockView === "overview" && (
            <GlassCard className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold">{stockCenter.company.name}</h3>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{stockCenter.ticker}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{stockCenter.company.group}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    公司概览现在是这只股票的总框架页。公开信息、调研纪要、跟踪点评、附件和自定义模块都会持续汇总到这里，方便 AI 和你一起迭代认知。
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => void buildStockOverview()}
                    disabled={buildingOverview === "stock"}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RefreshCw className={`h-4 w-4 ${buildingOverview === "stock" ? "animate-spin" : ""}`} />
                    {buildingOverview === "stock" ? "更新中..." : "更新个股概览"}
                  </button>
                  <AskAiButton
                    context={stockReportContext}
                    label="生成个股报告"
                    suggestions={["生成一篇高质量个股深度报告", "拆解这家公司的业务和竞争格局", "提炼管理层、股权和资本动作", "指出当前还缺哪些关键信息"]}
                  />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-border/40 px-3 py-3 text-sm">
                  <p className="text-xs text-muted-foreground">公开信息</p>
                  <p className="mt-1 font-medium">{orderedStockPublicInfo.length} 项</p>
                </div>
                <div className="rounded-lg border border-border/40 px-3 py-3 text-sm">
                  <p className="text-xs text-muted-foreground">自定义模块</p>
                  <p className="mt-1 font-medium">{stockModules.length} 个</p>
                </div>
                <div className="rounded-lg border border-border/40 px-3 py-3 text-sm">
                  <p className="text-xs text-muted-foreground">纪要/点评/附件</p>
                  <p className="mt-1 font-medium">{(stockCenter.research_notes || []).length + (stockCenter.tracking_comments || []).length + (stockCenter.attachments || []).length} 条</p>
                </div>
                <div className="rounded-lg border border-border/40 px-3 py-3 text-sm">
                  <p className="text-xs text-muted-foreground">时间线更新</p>
                  <p className="mt-1 font-medium">{stockTimeline.length} 条</p>
                </div>
              </div>
              <div className="space-y-3">
                {stockOverviewBlocks.map((block, index) => (
                  <div key={block.title} className="rounded-xl border border-border/40 bg-muted/20 p-4">
                    <p className="text-sm font-medium">{block.title}</p>
                    <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{block.body}</p>
                    <VisualPreview
                      title={`${block.title}图表/图片位`}
                      subtitle="可接公告、公开数据、研报截图或你手动补录的图表。"
                      chartKind={index % 2 === 0 ? "line" : "bar"}
                      image={stockVisualImages[index] || null}
                    />
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-border/50 bg-black/10 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">自动信息源</p>
                    <p className="mt-1 text-xs text-muted-foreground">这里只展示系统自动接入的来源，例如东财个股研报、公告新闻、未来 alphaengine 专家纪要接口。你手动投喂的资料仍放在“附件链接”。</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{stockAutomaticSources.length} 个自动源</span>
                </div>
                <div className="mt-3 space-y-2">
                  {stockAutomaticSources.length === 0 ? (
                    <div className="rounded-lg bg-muted/25 px-3 py-3 text-sm text-muted-foreground">还没有自动信息源。个股研报提取和未来 alphaengine 接口会显示在这里；手动资料请到“附件链接”页新增。</div>
                  ) : (
                    stockAutomaticSources.slice(0, 8).map((item) => (
                      <div key={item.id} className="rounded-lg bg-muted/25 px-3 py-2 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{item.title}</p>
                          <span className="text-xs text-muted-foreground">{item.date}</span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.content_preview || item.content || "已沉淀，等待补充说明。"}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                <div>
                  <p className="mb-2 flex items-center gap-2 text-sm font-medium"><Newspaper className="h-4 w-4 text-primary" /> 最新公告</p>
                  <div className="space-y-2">
                    {stockCenter.announcements.slice(0, 4).map((item) => (
                      <div key={`${item.date}-${item.title}`} className="rounded-lg bg-muted/25 px-3 py-2 text-sm">
                        <p className="font-medium">{item.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{item.date} · {item.type}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 flex items-center gap-2 text-sm font-medium"><Newspaper className="h-4 w-4 text-primary" /> 最新新闻</p>
                  <div className="space-y-2">
                    {stockCenter.news.slice(0, 4).map((item) => (
                      <div key={`${item.发布时间}-${item.新闻标题}`} className="rounded-lg bg-muted/25 px-3 py-2 text-sm">
                        <p className="font-medium">{item.新闻标题}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{item.发布时间}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">最近更新</p>
                  <span className="text-xs text-muted-foreground">{stockTimeline.length} 条记录</span>
                </div>
                <div className="space-y-2">
                  {stockTimeline.length === 0 ? (
                    <div className="rounded-lg bg-muted/25 px-3 py-3 text-sm text-muted-foreground">这个个股中心还没有沉淀内容。后面无论是纪要、点评、附件、备忘还是周复盘，都会在这里按时间串起来。</div>
                  ) : (
                    stockTimeline.slice(0, 6).map((item) => (
                      <div key={item.id} className="rounded-xl border border-border/40 bg-muted/20 p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{item.title}</p>
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{entryTypeLabel(item.type)}</span>
                          {item.type === "tracking_comment" && <InvestmentViewBadge view={item.investment_view} />}
                          <span className="text-xs text-muted-foreground">{item.date}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{item.summary_text || item.content_preview || item.content || "已沉淀，等待补充内容。"}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </GlassCard>
          )}
          {active === "stocks" && stockCenterTab === "center" && stockCenter && stockView === "public" && (
            <GlassCard className="space-y-4">
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">公开信息</p>
                  <span className="text-xs text-muted-foreground">{orderedStockPublicInfo.length} 项</span>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  {orderedStockPublicInfo.map(([key, value]) => (
                    <div
                      key={key}
                      draggable
                      onDragStart={() => {
                        setDraggingStockPublicKey(key);
                        setDragOverStockPublicKey(key);
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (dragOverStockPublicKey !== key) setDragOverStockPublicKey(key);
                      }}
                      onDragLeave={() => {
                        if (dragOverStockPublicKey === key) setDragOverStockPublicKey("");
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        handleStockPublicDrop(key);
                      }}
                      onDragEnd={() => {
                        setDraggingStockPublicKey("");
                        setDragOverStockPublicKey("");
                      }}
                      className={`rounded-lg border px-3 py-3 text-sm ${
                        dragOverStockPublicKey === key && draggingStockPublicKey !== key ? "border-primary/70 ring-1 ring-primary/40" : "border-border/40"
                      } ${draggingStockPublicKey === key ? "opacity-60" : ""}`}
                    >
                      <div className="flex items-start gap-2">
                        <GripVertical className="mt-0.5 h-4 w-4 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-muted-foreground">{key}</p>
                          <p className="mt-1 font-medium">{value}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </GlassCard>
          )}
          {active === "stocks" && stockCenterTab === "center" && stockCenter && stockView === "indicators" && (
            <GlassCard className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">{stockCenter.company.name}跟踪指标</h3>
                <span className="text-xs text-muted-foreground">{stockIndicatorModules.length} 个指标模块</span>
              </div>
              {stockIndicatorModules.length === 0 ? (
                <div className="rounded-lg bg-muted/25 px-3 py-3 text-sm text-muted-foreground">当前还没有个股跟踪指标。你可以在左侧把个股自定义模块的分类写成“跟踪指标”，比如“订单节奏”“产能释放”“销量月报”“回购进度”等，这里就会自动汇总。</div>
              ) : (
                <div className="space-y-3">
                  {stockIndicatorModules.map((item) => (
                    <div key={item.id} className="rounded-xl border border-border/40 bg-muted/20 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{item.title}</p>
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{item.category}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{item.content || "等待补充内容。"}</p>
                      <VisualPreview
                        title={item.title}
                        subtitle={`数据源：${item.data_source || "支持公告、公开网页、研报图表或手动补录。"}`}
                        chartKind="line"
                        image={extractImageSources(item.content)[0] || null}
                      />
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          )}
          {active === "stocks" && stockCenterTab === "center" && stockCenter && stockView === "modules" && (
            <GlassCard className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">{stockCenter.company.name}自定义模块</h3>
                <span className="text-xs text-muted-foreground">{stockFrameworkModules.length} 个模块</span>
              </div>
              {stockFrameworkModules.length === 0 ? (
                <div className="rounded-lg bg-muted/25 px-3 py-3 text-sm text-muted-foreground">还没有自定义模块。可以先加“股权结构、管理层、回购、竞争格局”等栏目。</div>
              ) : (
                <div className="space-y-3">
                  {stockFrameworkModules.map((item) => (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={() => {
                        setDraggingStockModuleId(item.id);
                        setDragOverStockModuleId(item.id);
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (dragOverStockModuleId !== item.id) setDragOverStockModuleId(item.id);
                      }}
                      onDragLeave={() => {
                        if (dragOverStockModuleId === item.id) setDragOverStockModuleId("");
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        void handleStockModuleDrop(item.id);
                      }}
                      onDragEnd={() => {
                        setDraggingStockModuleId("");
                        setDragOverStockModuleId("");
                      }}
                      className={`rounded-xl border bg-muted/20 p-3 text-sm transition-colors ${
                        dragOverStockModuleId === item.id && draggingStockModuleId !== item.id ? "border-primary/70 ring-1 ring-primary/40" : "border-border/40"
                      } ${draggingStockModuleId === item.id ? "opacity-60" : ""}`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5 cursor-grab text-muted-foreground active:cursor-grabbing">
                          <GripVertical className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{item.title}</p>
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{item.category}</span>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{item.content || "等待补充，后续可接公开信息自动抽取。"}</p>
                          <p className="mt-2 text-xs text-muted-foreground">数据源：{item.data_source}</p>
                          <VisualPreview
                            title={item.title}
                            subtitle="支持公告、公开网页、研报截图和你自己的图片资料。"
                            chartKind={item.category.includes("回购") ? "bar" : "line"}
                            image={extractImageSources(item.content)[0] || null}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          )}
          {active === "stocks" && stockCenterTab === "center" && stockCenter && stockView === "notes" && (
            <GlassCard className="space-y-4">
              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">调研纪要时间线</p>
                  <span className="text-xs text-muted-foreground">累计 {stockNoteTimeline.length} 次</span>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-border/40 px-3 py-3 text-sm">
                    <p className="text-xs text-muted-foreground">调研/纪要次数</p>
                    <p className="mt-1 font-medium">{stockNoteTimeline.length} 次</p>
                  </div>
                  <div className="rounded-lg border border-border/40 px-3 py-3 text-sm">
                    <p className="text-xs text-muted-foreground">最近一次</p>
                    <p className="mt-1 font-medium">{stockNoteTimeline[0]?.date || "暂无"}</p>
                  </div>
                  <div className="rounded-lg border border-border/40 px-3 py-3 text-sm">
                    <p className="text-xs text-muted-foreground">记录方式</p>
                    <p className="mt-1 font-medium">按时间线留痕</p>
                  </div>
                </div>
                <div className="mt-3 space-y-3">
                  {stockNoteTimeline.length === 0 ? (
                    <div className="rounded-lg bg-muted/25 px-3 py-3 text-sm text-muted-foreground">还没有调研纪要。你后续每新增一次调研纪要，这里都会形成一条按日期排序的留痕记录。</div>
                  ) : (
                    stockNoteTimeline.map((item, index) => (
                      <div key={item.id} className="rounded-xl border border-border/40 bg-muted/20 p-4 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">第 {stockNoteTimeline.length - index} 次</span>
                            <p className="font-medium">{item.title}</p>
                          </div>
                          <span className="text-xs text-muted-foreground">{item.date}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{item.summary_text || item.content_preview || item.content || ""}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button onClick={() => void triggerSummary(item)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-primary">
                            <Sparkles className="h-3.5 w-3.5" /> {item.summary_status === "ready" ? "重生成摘要" : "生成摘要"}
                          </button>
                          <button onClick={() => void triggerImage(item)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-primary">
                            <FileImage className="h-3.5 w-3.5" /> {item.image_artifact_status === "prepared" ? "重建图片请求" : "生成固定图片请求"}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </GlassCard>
          )}
          {active === "stocks" && stockCenterTab === "center" && stockCenter && stockView === "comments" && (
            <GlassCard className="space-y-4">
              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">跟踪点评时间线</p>
                  <span className="text-xs text-muted-foreground">累计 {stockCommentTimeline.length} 次</span>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-border/40 px-3 py-3 text-sm">
                    <p className="text-xs text-muted-foreground">点评次数</p>
                    <p className="mt-1 font-medium">{stockCommentTimeline.length} 次</p>
                  </div>
                  <div className="rounded-lg border border-border/40 px-3 py-3 text-sm">
                    <p className="text-xs text-muted-foreground">最近一次</p>
                    <p className="mt-1 font-medium">{stockCommentTimeline[0]?.date || "暂无"}</p>
                  </div>
                  <div className="rounded-lg border border-border/40 px-3 py-3 text-sm">
                    <p className="text-xs text-muted-foreground">用途</p>
                    <p className="mt-1 font-medium">公告/事件后更新观点</p>
                  </div>
                </div>
                <div className="mt-3 space-y-3">
                  {stockCommentTimeline.length === 0 ? (
                    <div className="rounded-lg bg-muted/25 px-3 py-3 text-sm text-muted-foreground">还没有跟踪点评。后面重大公告、事件后的主观看法会沉淀成这里的时间线。</div>
                  ) : (
                    stockCommentTimeline.map((item, index) => (
                      <div key={item.id} className="rounded-xl border border-border/40 bg-muted/20 p-4 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">第 {stockCommentTimeline.length - index} 次</span>
                            <p className="font-medium">{item.title}</p>
                            <InvestmentViewBadge view={item.investment_view} />
                          </div>
                          <span className="text-xs text-muted-foreground">{item.date}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{item.summary_text || item.content_preview || item.content || ""}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button onClick={() => void triggerSummary(item)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-primary">
                            <Sparkles className="h-3.5 w-3.5" /> {item.summary_status === "ready" ? "重生成摘要" : "生成摘要"}
                          </button>
                          <button onClick={() => void triggerImage(item)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-primary">
                            <FileImage className="h-3.5 w-3.5" /> {item.image_artifact_status === "prepared" ? "重建图片请求" : "生成固定图片请求"}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </GlassCard>
          )}
          {active === "stocks" && stockCenterTab === "center" && stockCenter && stockView === "timeline" && (
            <GlassCard className="space-y-4">
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">统一时间线</p>
                  <span className="text-xs text-muted-foreground">{stockTimeline.length} 条记录</span>
                </div>
                <div className="space-y-2">
                  {stockTimeline.length === 0 ? (
                    <div className="rounded-lg bg-muted/25 px-3 py-3 text-sm text-muted-foreground">这个个股中心还没有沉淀内容。后面无论是纪要、点评、附件、备忘还是周复盘，都会在这里按时间串起来。</div>
                  ) : (
                    stockTimeline.slice(0, 12).map((item) => (
                      <div key={item.id} className="rounded-xl border border-border/40 bg-muted/20 p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{item.title}</p>
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{entryTypeLabel(item.type)}</span>
                          {item.type === "tracking_comment" && <InvestmentViewBadge view={item.investment_view} />}
                          <span className="text-xs text-muted-foreground">{item.date}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{item.summary_text || item.content_preview || item.content || "已沉淀，等待补充内容。"}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </GlassCard>
          )}
          {active === "stocks" && stockCenterTab === "center" && stockCenter && stockView === "attachments" && (
            <GlassCard className="space-y-4">
              <div className="rounded-xl border border-border/50 bg-black/10 p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">新增个股附件</p>
                  <span className="text-xs text-muted-foreground">粘贴链接或上传文件，都会挂到 {stockCenter.company.name}</span>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <input value={attachmentForm.title} onChange={(event) => setAttachmentForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="资料标题：调研纪要 / 公司深度 / 公告点评底稿" className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                  <input value={attachmentForm.url} onChange={(event) => setAttachmentForm((prev) => ({ ...prev, url: event.target.value }))} placeholder="粘贴链接：研报、飞书、网页、公告等" className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                </div>
                <textarea value={attachmentForm.notes} onChange={(event) => setAttachmentForm((prev) => ({ ...prev, notes: event.target.value }))} rows={3} placeholder="补充说明：这份资料解决什么问题、有哪些关键图表、后续希望 AI 提取哪些内容。" className="mt-2 w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <input value={attachmentForm.tags} onChange={(event) => setAttachmentForm((prev) => ({ ...prev, tags: event.target.value }))} placeholder="标签：研报, 调研纪要, 公告" className="mt-2 w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <button onClick={() => void addAttachmentLink("stock")} className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary hover:bg-primary/15">保存附件链接</button>
                  <button onClick={() => attachmentFileInputRef.current?.click()} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-primary">
                    <Upload className="h-4 w-4" /> 上传本地文件
                  </button>
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">附件 / 研报 / 笔记链接</p>
                <div className="space-y-2">
                  {stockCenter.attachments.length === 0 ? (
                    <div className="rounded-lg bg-muted/25 px-3 py-3 text-sm text-muted-foreground">还没有附件链接。可以在上方粘贴链接，或上传研报、纪要、图片和表格。</div>
                  ) : (
                    stockCenter.attachments.map((item) => (
                      <div key={item.id} className="rounded-lg bg-muted/25 px-3 py-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{item.title}</p>
                          {extractFirstUrl(item.content_preview || item.content || "") && (
                            <a href={extractFirstUrl(item.content_preview || item.content || "")} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                              <ExternalLink className="h-3.5 w-3.5" /> 打开链接
                            </a>
                          )}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{item.content_preview || item.content || ""}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </GlassCard>
          )}
          {active === "weekly" && (
            selectedWeeklyEntry ? (
              <GlassCard className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{selectedWeeklyEntry.title}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{selectedWeeklyEntry.date}</p>
                  </div>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">历史周度复盘</span>
                </div>
                {selectedWeeklyEntry.summary_text && (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
                    {selectedWeeklyEntry.summary_text}
                  </div>
                )}
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-border/40 px-3 py-3 text-sm">
                    <p className="text-xs text-muted-foreground">关联行业</p>
                    <p className="mt-1 font-medium">{selectedWeeklyEntry.related_sectors.join("、") || "未填写"}</p>
                  </div>
                  <div className="rounded-lg border border-border/40 px-3 py-3 text-sm">
                    <p className="text-xs text-muted-foreground">关联个股</p>
                    <p className="mt-1 font-medium">{selectedWeeklyEntry.related_stocks.length || 0} 只</p>
                  </div>
                  <div className="rounded-lg border border-border/40 px-3 py-3 text-sm">
                    <p className="text-xs text-muted-foreground">标签</p>
                    <p className="mt-1 font-medium">{selectedWeeklyEntry.tags.join("、") || "未填写"}</p>
                  </div>
                </div>
                <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
                  <p className="mb-3 text-sm font-medium">复盘正文</p>
                  <div className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {selectedWeeklyEntry.content || selectedWeeklyEntry.content_preview || "这条周度复盘还没有正文。"}
                  </div>
                </div>
              </GlassCard>
            ) : (
              <GlassCard className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">本周草稿预览</h3>
                  <span className="text-xs text-muted-foreground">
                    {weeklyRows.filter((item) => item.change.trim() || item.note.trim()).length} 只个股已录入
                  </span>
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-lg border border-border/40 px-3 py-3 text-sm">
                    <p className="text-xs text-muted-foreground">标题</p>
                    <p className="mt-1 font-medium">{weeklyForm.title || "等待填写"}</p>
                  </div>
                  <div className="rounded-lg border border-border/40 px-3 py-3 text-sm">
                    <p className="text-xs text-muted-foreground">复盘日期</p>
                    <p className="mt-1 font-medium">{weeklyForm.date || "等待选择"}</p>
                  </div>
                  <div className="rounded-lg border border-border/40 px-3 py-3 text-sm">
                    <p className="text-xs text-muted-foreground">关联行业</p>
                    <p className="mt-1 font-medium">{weeklyForm.sectors || "等待填写"}</p>
                  </div>
                  <div className="rounded-lg border border-border/40 px-3 py-3 text-sm">
                    <p className="text-xs text-muted-foreground">周度结构</p>
                    <p className="mt-1 font-medium">个股表 + 行动建议 + 行业观点</p>
                  </div>
                </div>
                <div className="rounded-xl border border-border/40 bg-muted/20 p-3">
                  <p className="text-sm font-medium">行动建议预览</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{weeklyForm.actionAdvice || "这里会展示你本周的仓位、推荐与调整建议。"}</p>
                </div>
                <div className="rounded-xl border border-border/40 bg-muted/20 p-3">
                  <p className="text-sm font-medium">行业观点预览</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{weeklyForm.sectorViews || "这里会展示你本周重点行业的核心判断与后续跟踪方向。"}</p>
                </div>
              </GlassCard>
            )
          )}
          {active === "learning" && learningEntries.length === 0 && (
            <GlassCard className="space-y-2">
              <p className="font-medium">还没有学习包</p>
              <p className="text-sm text-muted-foreground">先选择一份资料生成。之后这里会出现闯关卡片、路演页和推演问题。</p>
            </GlassCard>
          )}
          {active === "learning" && selectedLearningEntry && (
            <GlassCard className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold">{selectedLearningEntry.title}</h3>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{selectedLearningEntry.date}</span>
              </div>
              {selectedLearningEntry.summary_text && <p className="rounded-lg bg-primary/5 px-3 py-2 text-sm text-muted-foreground">{selectedLearningEntry.summary_text}</p>}
              <LearningPackView entry={selectedLearningEntry} activeSection={learningView} pack={learningPack} />
            </GlassCard>
          )}
        </div>
      </div>

      <input
        ref={attachmentFileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt,.md,.markdown,.csv,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void uploadAndAttachReport(file);
          event.target.value = "";
        }}
      />
      <Disclaimer />
    </div>
  );
}

function LearningPackView({ entry, activeSection, pack: parsedPack }: { entry: KnowledgeEntry; activeSection?: string; pack?: LearningPackContent | null }) {
  const pack = parsedPack ?? parseLearningPack(entry);
  const [opening, setOpening] = useState(false);
  const openInteractiveHtml = async () => {
    setOpening(true);
    try {
      const artifact = await api.generateLearningHtml(entry.id);
      window.open(artifact.url, "_blank", "noopener,noreferrer");
      toast.success("互动网页已生成");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "互动网页生成失败");
    } finally {
      setOpening(false);
    }
  };
  if (!pack) {
    return <p className="text-sm text-muted-foreground">{entry.content_preview || "学习包内容暂时无法解析。"}</p>;
  }
  const stages = pack.challenge?.stages || [];
  const slides = pack.deck?.slides || [];
  const branches = pack.simulation?.branches || [];
  return (
    <div className="space-y-4">
      {(activeSection === "html" || activeSection === "overview" || !activeSection) && (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
        <div>
          <p className="text-sm font-medium">独立互动网页</p>
          <p className="text-xs text-muted-foreground">生成一个可单独打开的闯关式学习页面。</p>
        </div>
        <button
          onClick={() => void openInteractiveHtml()}
          disabled={opening}
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 px-3 py-1.5 text-sm text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ExternalLink className="h-4 w-4" /> {opening ? "生成中..." : "打开互动网页"}
        </button>
      </div>
      )}
      {(activeSection === "overview" || !activeSection) && (
      <div className="grid gap-2 md:grid-cols-3">
        {(activeSection === "overview" || !activeSection) && (pack.modes || []).map((mode) => (
          <div key={mode.key} className="rounded-xl border border-border/50 bg-black/20 p-3">
            <p className="text-sm font-medium">{mode.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{mode.description}</p>
          </div>
        ))}
      </div>
      )}
      {(activeSection === "challenge" || activeSection === "overview" || !activeSection) && (
      <div>
        <p className="mb-2 flex items-center gap-2 text-sm font-medium"><BookOpenCheck className="h-4 w-4 text-primary" /> 闯关模式</p>
        <div className="grid gap-3 md:grid-cols-2">
          {stages.map((stage, index) => (
            <div key={stage.id} className="rounded-xl bg-muted/25 p-3 text-sm">
              <p className="font-medium">第 {index + 1} 关 · {stage.title}</p>
              <p className="mt-1 text-muted-foreground">{stage.objective}</p>
              <div className="mt-2 space-y-1">
                {stage.cards.map((card) => (
                  <p key={card.label} className="rounded-lg bg-black/20 px-2 py-1 text-xs text-muted-foreground">{card.label}：{card.text}</p>
                ))}
              </div>
              <p className="mt-2 text-xs text-primary">{stage.quiz.question} 答案参考：{stage.quiz.answer}</p>
            </div>
          ))}
        </div>
      </div>
      )}
      {(activeSection === "deck" || activeSection === "overview" || !activeSection) && (
      <div>
        <p className="mb-2 flex items-center gap-2 text-sm font-medium"><Presentation className="h-4 w-4 text-primary" /> 路演模式</p>
        <div className="grid gap-3 md:grid-cols-3">
          {slides.map((slide, index) => (
            <div key={`${slide.title}-${index}`} className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
              <p className="font-medium">{index + 1}. {slide.title}</p>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {slide.bullets.map((bullet) => <li key={bullet}>· {bullet}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </div>
      )}
      {(activeSection === "simulation" || activeSection === "overview" || !activeSection) && (
      <div className="rounded-xl border border-border/50 p-3">
        <p className="text-sm font-medium">推演模式</p>
        <p className="mt-1 text-sm text-muted-foreground">{pack.simulation?.decision}</p>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {branches.map((branch) => (
            <div key={branch.case} className="rounded-lg bg-muted/25 p-3 text-xs">
              <p className="font-medium">{branch.case}</p>
              <p className="mt-1 text-muted-foreground">{branch.prompt}</p>
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  );
}
