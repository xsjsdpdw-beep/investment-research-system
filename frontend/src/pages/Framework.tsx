import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpenCheck, ExternalLink, FileImage, FileSearch, Flame, Newspaper, Presentation, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Disclaimer } from "@/components/ui/Disclaimer";
import { SectionTabs } from "@/components/ui/SectionTabs";
import { AskAiButton } from "@/components/ui/AskAiButton";
import { api, ApiError, type KnowledgeEntry, type SectorIndicator, type SectorModule, type SectorTreeNode, type StockCenterData, type StockModule, type WatchStock } from "@/lib/api";
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

const SECTOR_VIEW_TABS = [
  { key: "overview", label: "行业概览" },
  { key: "tree", label: "行业树" },
  { key: "indicators", label: "跟踪指标" },
  { key: "notes", label: "行业纪要" },
  { key: "attachments", label: "附件链接" },
];

const STOCK_VIEW_TABS = [
  { key: "overview", label: "公司概览" },
  { key: "public", label: "公开信息" },
  { key: "notes", label: "调研纪要" },
  { key: "comments", label: "跟踪点评" },
  { key: "timeline", label: "时间线" },
  { key: "attachments", label: "附件链接" },
];

const LEARNING_VIEW_TABS = [
  { key: "overview", label: "学习概览" },
  { key: "challenge", label: "闯关模式" },
  { key: "deck", label: "路演模式" },
  { key: "simulation", label: "推演模式" },
  { key: "html", label: "互动网页" },
];

export function Framework() {
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
  const [selectedSector, setSelectedSector] = useState("");
  const [selectedTicker, setSelectedTicker] = useState("");
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [selectedLearningEntryId, setSelectedLearningEntryId] = useState("");
  const [selectedWeeklyEntryId, setSelectedWeeklyEntryId] = useState("");
  const [sectorView, setSectorView] = useState("overview");
  const [stockView, setStockView] = useState("overview");
  const [learningView, setLearningView] = useState("overview");
  const [stockCenter, setStockCenter] = useState<StockCenterData | null>(null);
  const [form, setForm] = useState({ title: "", content: "", related: "", tags: "" });
  const [sectorForm, setSectorForm] = useState({ name: "", parent_id: "", description: "" });
  const [indicatorForm, setIndicatorForm] = useState({ sector: "", name: "", freq: "月度", chart_kind: "line", viewpoint: "" });
  const [sectorModuleForm, setSectorModuleForm] = useState({ title: "", category: "行业框架", content: "" });
  const [stockModuleForm, setStockModuleForm] = useState({ title: "", category: "公开信息", content: "" });
  const [premiumNoteForm, setPremiumNoteForm] = useState({ title: "", source_name: "premium_notes_placeholder", content: "" });
  const [weeklyForm, setWeeklyForm] = useState({ title: "", sectors: "", actionAdvice: "", sectorViews: "", keyEvents: "" });
  const [weeklyStocks, setWeeklyStocks] = useState<Record<string, { change: string; note: string }>>({});
  const [sectorKind, setSectorKind] = useState<"sector_profile" | "attachment_link">("sector_profile");
  const [stockKind, setStockKind] = useState<"research_note" | "tracking_comment" | "attachment_link">("research_note");
  const [ingestingReports, setIngestingReports] = useState(false);
  const [generatingPack, setGeneratingPack] = useState(false);
  const [importingSectorKey, setImportingSectorKey] = useState("");
  const reportInputRef = useRef<HTMLInputElement>(null);

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
    };
    await api.createKnowledgeEntry(payload);
    setForm({ title: "", content: "", related: "", tags: "" });
    toast.success("内容已沉淀进本地知识库");
    await load();
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
      await api.ingestPremiumNote({
        title: premiumNoteForm.title.trim(),
        content: premiumNoteForm.content.trim(),
        source_name: premiumNoteForm.source_name.trim() || "premium_notes_placeholder",
        source_type: "expert_transcript",
        note_kind: "research_note",
        sector: scope === "industry" ? selectedSector : undefined,
        ticker: scope === "stock" ? selectedTicker : undefined,
      });
      setPremiumNoteForm({ title: "", source_name: "premium_notes_placeholder", content: "" });
      toast.success(scope === "industry" ? "高价值纪要已沉淀进行业中心" : "高价值纪要已沉淀进个股中心");
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
    const rows = watchStocks.map((item) => {
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
    await api.createKnowledgeEntry({
      title: weeklyForm.title.trim(),
      type: "weekly_review",
      content,
      tags: ["周度复盘", ...tags(weeklyForm.sectors)],
      related_sectors: tags(weeklyForm.sectors),
      related_stocks: relatedStocks,
    });
    setWeeklyForm({ title: "", sectors: "", actionAdvice: "", sectorViews: "", keyEvents: "" });
    setWeeklyStocks((current) => {
      const reset: Record<string, { change: string; note: string }> = {};
      for (const key of Object.keys(current)) reset[key] = { change: "", note: "" };
      return reset;
    });
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

  const uploadAndAttachReport = async (file: File) => {
    if (!selectedTicker) {
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
        related_stocks: [selectedTicker],
      });
      toast.success("研报已归档并挂到当前个股");
      await load();
      await loadStockCenter(selectedTicker);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "研报挂接失败");
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

  const currentEntries = active === "sectors"
    ? (selectedSector ? sectorEntries.filter((entry) => entry.related_sectors.includes(selectedSector)) : sectorEntries)
    : active === "stocks"
      ? (selectedTicker ? stockEntries.filter((entry) => entry.related_stocks.includes(selectedTicker)) : stockEntries)
      : active === "learning"
        ? learningEntries
        : weeklyEntries;
  const selectedSectorIndicators = selectedSector ? sectorIndicators.filter((item) => item.sector === selectedSector) : sectorIndicators;
  const selectedSectorModules = selectedSector ? sectorModules.filter((item) => item.sector === selectedSector) : [];
  const sectorResearchNotes = selectedSector ? stockEntries.filter((entry) => entry.type === "research_note" && entry.related_sectors.includes(selectedSector)) : [];
  const sectorMemos = selectedSector ? memoEntries.filter((entry) => entry.related_sectors.includes(selectedSector)) : [];
  const sectorWeekly = selectedSector ? weeklyEntries.filter((entry) => entry.related_sectors.includes(selectedSector)) : [];
  const sectorAttachments = selectedSector ? attachmentEntries.filter((entry) => entry.related_sectors.includes(selectedSector)) : [];
  const sectorTrackingComments = selectedSector ? stockEntries.filter((entry) => entry.type === "tracking_comment" && entry.related_sectors.includes(selectedSector)) : [];
  const builtInSector = useMemo(
    () => sectorsData.sectors.find((item) => item.label === selectedSector) || null,
    [selectedSector],
  );
  const missingBuiltInSectors = useMemo(
    () => sectorsData.sectors.filter((item) => !sectorTree.some((node) => node.name === item.label)),
    [sectorTree],
  );
  const weeklyRows = watchStocks.map((item) => {
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
  const stockMemos = selectedTicker ? memoEntries.filter((entry) => entry.related_stocks.includes(selectedTicker)) : [];
  const stockWeekly = selectedTicker ? weeklyEntries.filter((entry) => entry.related_stocks.includes(selectedTicker)) : [];
  const stockProfiles = selectedTicker ? stockEntries.filter((entry) => entry.type === "stock_profile" && entry.related_stocks.includes(selectedTicker)) : [];
  const stockTimeline = buildTimeline([
    ...stockProfiles,
    ...(stockCenter?.research_notes || []),
    ...(stockCenter?.tracking_comments || []),
    ...(stockCenter?.attachments || []),
    ...stockMemos,
    ...stockWeekly,
  ]);
  const selectedLearningEntry = selectedLearningEntryId ? learningEntries.find((entry) => entry.id === selectedLearningEntryId) || null : learningEntries[0] || null;
  const learningPack = selectedLearningEntry ? parseLearningPack(selectedLearningEntry) : null;
  const selectedWeeklyEntry = selectedWeeklyEntryId ? weeklyEntries.find((entry) => entry.id === selectedWeeklyEntryId) || null : null;
  const weeklyEntriesByYear = useMemo(() => {
    const grouped = new Map<string, KnowledgeEntry[]>();
    for (const entry of weeklyEntries) {
      const year = (entry.date || "").slice(0, 4) || "未分年";
      grouped.set(year, [...(grouped.get(year) || []), entry]);
    }
    return Array.from(grouped.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([year, entries]) => ({
        year,
        entries: entries.sort((a, b) => `${b.date || ""}${b.updated_at || ""}`.localeCompare(`${a.date || ""}${a.updated_at || ""}`)),
      }));
  }, [weeklyEntries]);

  const showEntryForm = active !== "learning";

  return (
    <div>
      <PageHeader
        title="框架沉淀"
        subtitle="以行业中心、个股中心和周度复盘为主轴，把资料、纪要、点评与行动建议持续积累下来。"
        actions={<span className="text-xs text-muted-foreground">{summaryTargets.length} 条内容还没生成摘要</span>}
      />
      <div className="grid gap-5 xl:grid-cols-[220px_minmax(0,1fr)] xl:items-start">
        <GlassCard className="xl:sticky xl:top-6">
          <div className="mb-3">
            <p className="text-sm font-semibold">二级目录</p>
            <p className="mt-1 text-xs text-muted-foreground">左侧先选研究对象，右侧再看这个对象的不同内容页签。</p>
          </div>
          <SectionTabs tabs={FRAMEWORK_TABS} active={active} onChange={setActive} orientation="vertical" />
          <div className="mt-4 border-t border-border/40 pt-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              {active === "sectors" ? "我的行业" : active === "stocks" ? "我的个股" : active === "learning" ? "学习包" : "复盘记录"}
            </p>
            <div className="space-y-2">
              {active === "sectors" && (
                sectorTree.length === 0 ? (
                  <div className="rounded-xl bg-muted/20 px-3 py-3 text-xs text-muted-foreground">先在右侧把你要跟踪的行业加进来，这里就会形成行业列表。</div>
                ) : (
                  sectorTree.map((node) => (
                    <button
                      key={node.id}
                      onClick={() => {
                        setSelectedSector(node.name);
                        setSectorView("overview");
                        setIndicatorForm((prev) => ({ ...prev, sector: node.name }));
                        setForm((prev) => ({ ...prev, related: node.name }));
                      }}
                      className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${selectedSector === node.name ? "border-primary bg-primary/10 text-foreground" : "border-border bg-muted/15 text-muted-foreground"}`}
                      style={{ marginLeft: `${node.level * 10}px` }}
                    >
                      {node.name}
                    </button>
                  ))
                )
              )}
              {active === "stocks" && (
                watchStocks.length === 0 ? (
                  <div className="rounded-xl bg-muted/20 px-3 py-3 text-xs text-muted-foreground">先去关注列表补充核心个股，这里会自动形成个股中心列表。</div>
                ) : (
                  watchStocks.map((item) => {
                    const ticker = `${item.code}.${item.market}`;
                    return (
                      <button
                        key={ticker}
                        onClick={() => {
                          setStockView("overview");
                          void loadStockCenter(ticker);
                        }}
                        className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${selectedTicker === ticker ? "border-primary bg-primary/10 text-foreground" : "border-border bg-muted/15 text-muted-foreground"}`}
                      >
                        <div className="font-medium">{item.name}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{item.group} · {ticker}</div>
                      </button>
                    );
                  })
                )
              )}
              {active === "weekly" && (
                <div className="space-y-3">
                  <button
                    onClick={() => setSelectedWeeklyEntryId("")}
                    className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${selectedWeeklyEntryId === "" ? "border-primary bg-primary/10 text-foreground" : "border-border bg-muted/15 text-muted-foreground"}`}
                  >
                    <div className="font-medium">新建周度复盘</div>
                    <div className="mt-1 text-xs text-muted-foreground">在右侧继续写本周新草稿</div>
                  </button>
                  {weeklyEntriesByYear.length === 0 ? (
                    <div className="rounded-xl bg-muted/20 px-3 py-3 text-xs text-muted-foreground">这里会先按年度归档，再在年度下面沉淀每一周的复盘记录。</div>
                  ) : (
                    weeklyEntriesByYear.map((group) => (
                      <div key={group.year} className="space-y-2">
                        <div className="rounded-lg bg-muted/20 px-3 py-2 text-xs font-medium text-muted-foreground">
                          {group.year} 年
                        </div>
                        <div className="space-y-2">
                          {group.entries.map((entry) => (
                            <button
                              key={entry.id}
                              onClick={() => setSelectedWeeklyEntryId(entry.id)}
                              className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${selectedWeeklyEntryId === entry.id ? "border-primary bg-primary/10 text-foreground" : "border-border bg-muted/15 text-muted-foreground"}`}
                            >
                              <div className="font-medium">{entry.title}</div>
                              <div className="mt-1 text-xs text-muted-foreground">{entry.date}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
              {active === "learning" && (
                learningEntries.length === 0 ? (
                  <div className="rounded-xl bg-muted/20 px-3 py-3 text-xs text-muted-foreground">先生成学习包，这里会沉淀成你的学习专题列表。</div>
                ) : (
                  learningEntries.map((entry) => (
                    <button
                      key={entry.id}
                      onClick={() => {
                        setSelectedLearningEntryId(entry.id);
                        setLearningView("overview");
                      }}
                      className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${selectedLearningEntryId === entry.id ? "border-primary bg-primary/10 text-foreground" : "border-border bg-muted/15 text-muted-foreground"}`}
                    >
                      <div className="font-medium">{entry.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{entry.date}</div>
                    </button>
                  ))
                )
              )}
            </div>
          </div>
        </GlassCard>

        <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
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
            </div>
          ) : active === "weekly" ? (
            <div className="space-y-3">
              <input value={weeklyForm.title} onChange={(event) => setWeeklyForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="标题：2026W29 周度复盘" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
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
                  {sectorTree.map((node) => <option key={node.id} value={node.name}>{"　".repeat(node.level)}{node.name}</option>)}
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
                  {sectorTree.map((node) => <option key={node.id} value={node.id}>{"　".repeat(node.level)}{node.name}</option>)}
                </select>
                <input value={sectorForm.description} onChange={(event) => setSectorForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="说明：核心跟踪挖机销量、开工小时数" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <button onClick={() => void addSectorNode()} className="w-full rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary hover:bg-primary/15">加入行业树</button>
              </div>
              <div className="space-y-2 rounded-xl border border-border/50 bg-black/10 p-3">
                <p className="text-sm font-medium">行业跟踪指标</p>
                <select value={indicatorForm.sector} onChange={(event) => setIndicatorForm((prev) => ({ ...prev, sector: event.target.value }))} className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50">
                  <option value="">选择行业</option>
                  {sectorTree.map((node) => <option key={node.id} value={node.name}>{"　".repeat(node.level)}{node.name}</option>)}
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
                {watchStocks.map((item) => {
                  const ticker = `${item.code}.${item.market}`;
                  return <option key={ticker} value={ticker}>{item.name}（{ticker}）</option>;
                })}
              </select>
              <div className="rounded-lg bg-muted/25 p-3 text-sm text-muted-foreground">
                当前关注个股：{watchStocks.map((item) => `${item.name}(${item.code}.${item.market})`).join(" · ")}
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
            </div>
          )}
          <button onClick={() => void submit()} className="w-full rounded-lg bg-primary/15 px-4 py-2 text-sm font-medium text-primary shadow-glow hover:bg-primary/25">写入沉淀</button>
            </>
          )}
        </GlassCard>

        <div className="space-y-4">
          {active === "sectors" && selectedSector && (
            <SectionTabs tabs={SECTOR_VIEW_TABS} active={sectorView} onChange={setSectorView} />
          )}
          {active === "stocks" && stockCenter && (
            <SectionTabs tabs={STOCK_VIEW_TABS} active={stockView} onChange={setStockView} />
          )}
          {active === "learning" && selectedLearningEntry && (
            <SectionTabs tabs={LEARNING_VIEW_TABS} active={learningView} onChange={setLearningView} />
          )}

          {active === "sectors" && sectorView === "tree" && (
            <GlassCard className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">行业树</h3>
                <span className="text-xs text-muted-foreground">{sectorTree.length} 个节点</span>
              </div>
              {sectorTree.length === 0 ? (
                <p className="rounded-lg bg-muted/25 px-3 py-3 text-sm text-muted-foreground">还没有行业节点。先从左侧加入一个一级行业，比如“工程机械”。</p>
              ) : (
                <div className="space-y-2">
                  {sectorTree.map((node) => (
                    <div key={node.id} className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-sm" style={{ marginLeft: `${node.level * 18}px` }}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{node.name}</span>
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">L{node.level + 1}</span>
                        {node.parent_id && <span className="text-xs text-muted-foreground">上级：{node.parent_id}</span>}
                      </div>
                      {node.description && <p className="mt-1 text-xs text-muted-foreground">{node.description}</p>}
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          )}
          {active === "sectors" && sectorView === "indicators" && (
            <GlassCard className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">{selectedSector || "行业"}跟踪指标</h3>
                <span className="text-xs text-muted-foreground">{selectedSectorIndicators.length} 个指标</span>
              </div>
              {selectedSectorIndicators.length === 0 ? (
                <p className="rounded-lg bg-muted/25 px-3 py-3 text-sm text-muted-foreground">还没有跟踪指标。可以先为工程机械添加“挖掘机月度销量”。</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {selectedSectorIndicators.map((item) => (
                    <div key={item.id} className="rounded-xl border border-border/40 bg-muted/20 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{item.name}</p>
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{item.sector}</span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{item.freq}</span>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{item.viewpoint || "观点待补充"}</p>
                      <div className="mt-3 flex h-24 items-center justify-center rounded-lg border border-dashed border-border/50 bg-black/10 text-xs text-muted-foreground">
                        {item.chart_kind} 图表容器 · 数据源：{item.data_source}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          )}
          {active === "sectors" && selectedSector && sectorView === "overview" && (
            <GlassCard className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold">{selectedSector}</h3>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">行业中心</span>
                {builtInSector?.hot && <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary"><Flame className="h-3 w-3" /> 热门赛道</span>}
              </div>
              {builtInSector && (
                <div className="space-y-3 rounded-xl border border-border/40 bg-muted/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">原板块中心详情</p>
                      <p className="mt-1 text-sm text-muted-foreground">{builtInSector.tagline}</p>
                    </div>
                    <AskAiButton
                      context={`板块：${builtInSector.label}\n定位：${builtInSector.tagline}\n产业链环节：${builtInSector.nodes.length ? builtInSector.nodes.join("、") : "（环节梳理中）"}`}
                      label="让 AI 拆这个板块"
                      suggestions={["按七维框架拆解", "这个板块的产业链地图", "哪个环节卡脖子", "有什么风险信号"]}
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-medium">核心环节</p>
                    {builtInSector.nodes.length === 0 ? (
                      <div className="rounded-lg bg-black/10 px-3 py-3 text-sm text-muted-foreground">这个板块还没有现成环节骨架，后面可以在行业树里继续细化。</div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {builtInSector.nodes.map((node) => (
                          <span key={node} className="rounded-full border border-primary/40 bg-primary/15 px-3 py-1.5 text-sm font-medium text-foreground shadow-glow">
                            {node}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-border/40 px-3 py-3 text-sm">
                  <p className="text-xs text-muted-foreground">行业卡片</p>
                  <p className="mt-1 font-medium">{currentEntries.length} 条</p>
                </div>
                <div className="rounded-lg border border-border/40 px-3 py-3 text-sm">
                  <p className="text-xs text-muted-foreground">关联备忘</p>
                  <p className="mt-1 font-medium">{sectorMemos.length} 条</p>
                </div>
                <div className="rounded-lg border border-border/40 px-3 py-3 text-sm">
                  <p className="text-xs text-muted-foreground">周度复盘</p>
                  <p className="mt-1 font-medium">{sectorWeekly.length} 条</p>
                </div>
              </div>
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">自定义知识模块</p>
                  <span className="text-xs text-muted-foreground">{selectedSectorModules.length} 个模块</span>
                </div>
                {selectedSectorModules.length === 0 ? (
                  <div className="rounded-lg bg-muted/25 px-3 py-3 text-sm text-muted-foreground">还没有行业自定义模块。可以先加“竞争格局、政策框架、产业链图谱、核心变量”等栏目。</div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {selectedSectorModules.map((item) => (
                      <div key={item.id} className="rounded-xl border border-border/40 bg-muted/20 p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{item.title}</p>
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{item.category}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{item.content || "等待补充，后续可接公开资料与自定义框架。"}</p>
                        <p className="mt-2 text-xs text-muted-foreground">数据源：{item.data_source}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">统一时间线</p>
                  <span className="text-xs text-muted-foreground">{sectorTimeline.length} 条记录</span>
                </div>
                <div className="space-y-2">
                  {sectorTimeline.length === 0 ? (
                    <div className="rounded-lg bg-muted/25 px-3 py-3 text-sm text-muted-foreground">这个行业还没有沉淀内容。后面无论是备忘、纪要、点评、附件还是周复盘，都会在这里按时间串起来。</div>
                  ) : (
                    sectorTimeline.slice(0, 12).map((item) => (
                      <div key={item.id} className="rounded-xl border border-border/40 bg-muted/20 p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{item.title}</p>
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{entryTypeLabel(item.type)}</span>
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
          {active === "sectors" && selectedSector && sectorView === "notes" && (
            <GlassCard className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-medium">关联备忘时间线</p>
                <div className="space-y-2">
                  {sectorMemos.length === 0 ? (
                    <div className="rounded-lg bg-muted/25 px-3 py-3 text-sm text-muted-foreground">还没有关联备忘。后续你在“投资备忘”写内容并挂接这个行业，这里会自动汇总。</div>
                  ) : (
                    sectorMemos.slice(0, 5).map((item) => (
                      <div key={item.id} className="rounded-lg bg-muted/25 px-3 py-3 text-sm">
                        <p className="font-medium">{item.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{item.date}</p>
                        <p className="mt-2 text-muted-foreground">{item.content_preview || ""}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">关联周度复盘</p>
                <div className="space-y-2">
                  {sectorWeekly.length === 0 ? (
                    <div className="rounded-lg bg-muted/25 px-3 py-3 text-sm text-muted-foreground">还没有周复盘挂到这个行业。后面每周复盘写完后，这里会形成持续留痕。</div>
                  ) : (
                    sectorWeekly.slice(0, 5).map((item) => (
                      <div key={item.id} className="rounded-lg bg-muted/25 px-3 py-3 text-sm">
                        <p className="font-medium">{item.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{item.date}</p>
                        <p className="mt-2 text-muted-foreground">{item.content_preview || ""}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">高价值纪要 / 行业纪要</p>
                <div className="space-y-2">
                  {sectorResearchNotes.length === 0 ? (
                    <div className="rounded-lg bg-muted/25 px-3 py-3 text-sm text-muted-foreground">还没有纪要内容。未来接入专家纪要接口后，这里会自动沉淀对应内容。</div>
                  ) : (
                    sectorResearchNotes.slice(0, 6).map((item) => (
                      <div key={item.id} className="rounded-lg bg-muted/25 px-3 py-3 text-sm">
                        <p className="font-medium">{item.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{item.date} · {item.tags.join(" · ")}</p>
                        <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{item.content_preview || item.content || ""}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </GlassCard>
          )}
          {active === "sectors" && selectedSector && sectorView === "attachments" && (
            <GlassCard className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-medium">附件 / 研报 / 笔记链接</p>
                <div className="space-y-2">
                  {sectorAttachments.length === 0 ? (
                    <div className="rounded-lg bg-muted/25 px-3 py-3 text-sm text-muted-foreground">还没有行业附件。可以在左侧切到“附件链接”，把研报、会议纪要、飞书笔记或外部资料贴进来。</div>
                  ) : (
                    sectorAttachments.slice(0, 6).map((item) => (
                      <div key={item.id} className="rounded-lg bg-muted/25 px-3 py-3 text-sm">
                        <p className="font-medium">{item.title}</p>
                        <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{item.content_preview || item.content || ""}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </GlassCard>
          )}
          {active === "stocks" && stockCenter && stockView === "overview" && (
            <GlassCard className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold">{stockCenter.company.name}</h3>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{stockCenter.ticker}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{stockCenter.company.group}</span>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {Object.entries(stockCenter.public_info).slice(0, 6).map(([key, value]) => (
                  <div key={key} className="rounded-lg border border-border/40 px-3 py-3 text-sm">
                    <p className="text-xs text-muted-foreground">{key}</p>
                    <p className="mt-1 font-medium">{value}</p>
                  </div>
                ))}
              </div>
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">自定义信息模块</p>
                  <span className="text-xs text-muted-foreground">{stockModules.length} 个模块</span>
                </div>
                {stockModules.length === 0 ? (
                  <div className="rounded-lg bg-muted/25 px-3 py-3 text-sm text-muted-foreground">还没有自定义模块。可以先加“股权结构、管理层、回购、竞争格局”等栏目。</div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {stockModules.map((item) => (
                      <div key={item.id} className="rounded-xl border border-border/40 bg-muted/20 p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{item.title}</p>
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{item.category}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{item.content || "等待补充，后续可接公开信息自动抽取。"}</p>
                        <p className="mt-2 text-xs text-muted-foreground">数据源：{item.data_source}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                <div>
                  <p className="mb-2 flex items-center gap-2 text-sm font-medium"><Newspaper className="h-4 w-4 text-primary" /> 最新公告</p>
                  <div className="space-y-2">
                    {stockCenter.announcements.slice(0, 5).map((item) => (
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
                    {stockCenter.news.slice(0, 5).map((item) => (
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
          {active === "stocks" && stockCenter && stockView === "public" && (
            <GlassCard className="space-y-4">
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">公开信息模块</p>
                  <span className="text-xs text-muted-foreground">{stockModules.length} 个模块</span>
                </div>
                {stockModules.length === 0 ? (
                  <div className="rounded-lg bg-muted/25 px-3 py-3 text-sm text-muted-foreground">还没有自定义模块。可以先加“股权结构、管理层、回购、竞争格局”等栏目。</div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {stockModules.map((item) => (
                      <div key={item.id} className="rounded-xl border border-border/40 bg-muted/20 p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{item.title}</p>
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{item.category}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{item.content || "等待补充，后续可接公开信息自动抽取。"}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </GlassCard>
          )}
          {active === "stocks" && stockCenter && stockView === "notes" && (
            <GlassCard className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-medium">高价值纪要 / 调研纪要</p>
                <div className="space-y-2">
                  {stockCenter.research_notes.length === 0 ? (
                    <div className="rounded-lg bg-muted/25 px-3 py-3 text-sm text-muted-foreground">还没有纪要内容。未来接入专家纪要接口后，这里会自动沉淀对应内容。</div>
                  ) : (
                    stockCenter.research_notes.map((item) => (
                      <div key={item.id} className="rounded-lg bg-muted/25 px-3 py-3 text-sm">
                        <p className="font-medium">{item.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{item.date} · {item.tags.join(" · ")}</p>
                        <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{item.content_preview || item.content || ""}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </GlassCard>
          )}
          {active === "stocks" && stockCenter && stockView === "comments" && (
            <GlassCard className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-medium">跟踪点评</p>
                <div className="space-y-2">
                  {stockCenter.tracking_comments.length === 0 ? (
                    <div className="rounded-lg bg-muted/25 px-3 py-3 text-sm text-muted-foreground">还没有跟踪点评。后面重大公告、事件后的主观看法会沉淀在这里。</div>
                  ) : (
                    stockCenter.tracking_comments.map((item) => (
                      <div key={item.id} className="rounded-lg bg-muted/25 px-3 py-3 text-sm">
                        <p className="font-medium">{item.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{item.date} · {item.tags.join(" · ")}</p>
                        <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{item.content_preview || item.content || ""}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </GlassCard>
          )}
          {active === "stocks" && stockCenter && stockView === "timeline" && (
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
          {active === "stocks" && stockCenter && stockView === "attachments" && (
            <GlassCard className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-medium">附件 / 研报 / 笔记链接</p>
                <div className="space-y-2">
                  {stockCenter.attachments.length === 0 ? (
                    <div className="rounded-lg bg-muted/25 px-3 py-3 text-sm text-muted-foreground">还没有附件链接。可以用“attachment_link”条目把研报、飞书笔记、外部资料贴进来。</div>
                  ) : (
                    stockCenter.attachments.map((item) => (
                      <div key={item.id} className="rounded-lg bg-muted/25 px-3 py-3 text-sm">
                        <p className="font-medium">{item.title}</p>
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
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-border/40 px-3 py-3 text-sm">
                    <p className="text-xs text-muted-foreground">标题</p>
                    <p className="mt-1 font-medium">{weeklyForm.title || "等待填写"}</p>
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
          {active !== "learning" && currentEntries.map((entry) => (
            <GlassCard key={entry.id} className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold">{entry.title}</h3>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{entry.date}</span>
                {entry.related_sectors.concat(entry.related_stocks).map((item) => (
                  <span key={item} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{item}</span>
                ))}
              </div>
              {entry.summary_text && <p className="rounded-lg bg-primary/5 px-3 py-2 text-sm text-muted-foreground">{entry.summary_text}</p>}
              {active === "learning" ? (
                <LearningPackView entry={entry} />
              ) : (
                <p className="text-sm text-muted-foreground">{entry.content_preview || entry.content || "已保存，可点详情页继续扩展。"}</p>
              )}
              {active === "stocks" && showEntryForm && (
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => void triggerSummary(entry)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-primary">
                    <Sparkles className="h-4 w-4" /> {entry.summary_status === "ready" ? "重生成摘要" : "生成摘要"}
                  </button>
                  <button onClick={() => void triggerImage(entry)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-primary">
                    <FileImage className="h-4 w-4" /> {entry.image_artifact_status === "prepared" ? "重建图片请求" : "生成固定图片请求"}
                  </button>
                </div>
              )}
            </GlassCard>
          ))}
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
      </div>

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
      <div className="grid gap-2 md:grid-cols-3">
        {(activeSection === "overview" || !activeSection) && (pack.modes || []).map((mode) => (
          <div key={mode.key} className="rounded-xl border border-border/50 bg-black/20 p-3">
            <p className="text-sm font-medium">{mode.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{mode.description}</p>
          </div>
        ))}
      </div>
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
