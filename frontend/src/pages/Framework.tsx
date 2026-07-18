import { useEffect, useMemo, useRef, useState, type ReactNode, type TextareaHTMLAttributes } from "react";
import { useSearchParams } from "react-router-dom";
import { AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, Bold, BookOpenCheck, ChevronDown, ChevronUp, Eraser, ExternalLink, FileImage, FileSearch, Flame, GripVertical, Heading2, Heading3, Image as ImageIcon, Italic, Link2, List, ListOrdered, Minus, Newspaper, Pilcrow, Plus, Presentation, RefreshCw, Sparkles, Strikethrough, Trash2, Underline, Upload, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Disclaimer } from "@/components/ui/Disclaimer";
import { SectionTabs } from "@/components/ui/SectionTabs";
import { AskAiButton } from "@/components/ui/AskAiButton";
import { StructuredOverviewRenderer } from "@/components/research/StructuredOverviewRenderer";
import { StructuredOverviewSidebar } from "@/components/research/StructuredOverviewSidebar";
import { HBMDraftDashboard } from "@/components/research/HBMDraftDashboard";
import { IndustryDraftCanvas } from "@/components/research/IndustryDraftCanvas";
import { shouldUseIndustryDraftCanvas } from "@/components/research/industry-draft-canvas";
import { shouldUseHBMDraftDashboard } from "@/components/research/hbm-draft-dashboard";
import { api, ApiError, type KnowledgeEntry, type OverviewCandidate, type OverviewContentBlock, type OverviewDeepCard, type OverviewEditorBinding, type OverviewWorkbench, type SectorIndicator, type SectorModule, type SectorTreeNode, type StockCenterData, type StockModule, type StructuredRenderBlock, type WatchIndicator, type WatchStock, type YoudaoNoteCandidate } from "@/lib/api";
import { FRAMEWORK_TABS } from "@/lib/workspace";
import { cn } from "@/lib/utils";
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

function AutoResizeTextarea({ className, value, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      {...props}
      ref={ref}
      value={value}
      rows={1}
      className={cn("min-h-[44px] resize-none overflow-hidden", className)}
    />
  );
}

function stripHtmlTags(value: string) {
  return (value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type OverviewPreviewMode = "markdown" | "enhanced-note";

function flattenHeadingNodes(nodes: NotebookHeadingNode[]): NotebookHeadingNode[] {
  return nodes.flatMap((node) => [node, ...flattenHeadingNodes(node.children || [])]);
}

function extractMdNodeText(node: any): string {
  if (!node) return "";
  if (typeof node.value === "string") return node.value;
  if (Array.isArray(node.children)) return node.children.map((child: any) => extractMdNodeText(child)).join(" ").replace(/\s+/g, " ").trim();
  return "";
}

function looksLikeYoudaoNote(title: string, raw: string) {
  const text = (raw || "").trim();
  if (!text) return false;
  if ((title || "").toLowerCase().endsWith(".note")) return true;
  if (/请务必参阅正文后面的信息披露和法律声明/.test(text)) return true;
  if ((text.match(/\b\d+\s*\/\s*\d+\b/g) || []).length >= 2) return true;
  if ((text.match(/\.{8,}|…{4,}|·{6,}/g) || []).length >= 2) return true;
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const markdownHeadingsCount = lines.filter((line) => /^#{1,4}\s+/.test(line)).length;
  const longPlainLines = lines.filter((line) => line.length > 48 && !/^[-*]\s+/.test(line)).length;
  return markdownHeadingsCount === 0 && longPlainLines >= 6;
}

function isYoudaoNoiseLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^请务必参阅正文后面的信息披露和法律声明/.test(trimmed)) return true;
  if (/^[第 ]?\d+\s*\/\s*\d+$/.test(trimmed)) return true;
  if (/^(目录|目\s*录)$/.test(trimmed)) return true;
  if (/\.{8,}|…{4,}|·{6,}/.test(trimmed)) return true;
  if (/^[\-_—=~·•.]{6,}$/.test(trimmed)) return true;
  return false;
}

function detectNoteHeading(line: string): { level: number; text: string } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (/^(核心结论|关键证据|跟踪重点|来源|来源索引|迭代说明|投资建议|风险提示|投资逻辑|问题清单|管理|业务|财务|复盘|关键数据|盈利预测与估值|股价复盘|附录)$/.test(trimmed)) {
    return { level: 2, text: trimmed };
  }
  const chineseMatch = trimmed.match(/^([一二三四五六七八九十]+)[、.]\s*(.+)$/);
  if (chineseMatch) return { level: 2, text: chineseMatch[2].trim() || trimmed };
  const numericMatch = trimmed.match(/^(\d+(?:\.\d+){0,3})[、.]?\s+(.+)$/);
  if (numericMatch && !/%|¥|\$/.test(trimmed)) {
    const depth = numericMatch[1].split(".").length;
    return { level: Math.min(4, depth + 1), text: numericMatch[2].trim() || trimmed };
  }
  return null;
}

function parseTableColumns(line: string) {
  const raw = line.trim();
  if (!raw) return [];
  if (raw.includes("\t")) return raw.split("\t").map((cell) => cell.trim()).filter(Boolean);
  const bySpaces = raw.split(/\s{2,}/).map((cell) => cell.trim()).filter(Boolean);
  return bySpaces.length >= 3 ? bySpaces : [];
}

function consumeNoteTable(lines: string[], startIndex: number) {
  const first = parseTableColumns(lines[startIndex] || "");
  if (first.length < 3) return null;
  const rows: string[][] = [first];
  let index = startIndex + 1;
  while (index < lines.length) {
    const next = parseTableColumns(lines[index] || "");
    if (next.length !== first.length) break;
    rows.push(next);
    index += 1;
  }
  if (rows.length < 2) return null;
  const headerLikely = rows[0].every((cell) => cell.length <= 16 && !/^\d+([.%]|$)/.test(cell) && !/[¥$]/.test(cell));
  const headers = headerLikely ? rows[0] : rows[0].map((_, cellIndex) => `列${cellIndex + 1}`);
  const bodyRows = headerLikely ? rows.slice(1) : rows;
  const markdown = [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...bodyRows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
  return { markdown, nextIndex: index };
}

function splitReadableParagraph(paragraph: string) {
  const normalized = paragraph
    .replace(/\s+/g, " ")
    .replace(/\s+([，。！？；：])/g, "$1")
    .trim();
  if (!normalized) return [];
  const sentences = normalized
    .split(/(?<=[。！？；])/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (sentences.length <= 2 || normalized.length <= 180) return [normalized];
  const chunks: string[] = [];
  for (let index = 0; index < sentences.length; index += 2) {
    chunks.push(sentences.slice(index, index + 2).join(""));
  }
  return chunks;
}

function draftBlocksToPreviewMarkdown(blocks: OverviewBlock[]) {
  return blocks
    .map((block) => {
      const body = (block.body || "").trim();
      return [`## ${block.title}`, body || "待补充内容。"].join("\n\n");
    })
    .join("\n\n");
}

function normalizeOverviewPreviewContent(raw: string, title: string): { markdown: string; mode: OverviewPreviewMode } {
  const original = (raw || "").replace(/\r/g, "").trim();
  if (!original) return { markdown: "", mode: "markdown" };
  if (!looksLikeYoudaoNote(title, original)) return { markdown: original, mode: "markdown" };

  const cleanedLines = original
    .split("\n")
    .map((line) => line.replace(/\u00a0/g, " ").replace(/[ \t]+$/g, ""))
    .filter((line) => {
      if (!line.trim()) return true;
      return !isYoudaoNoiseLine(line.trim());
    });

  const blocks: string[] = [];
  let paragraphBuffer: string[] = [];
  const flushParagraph = () => {
    if (!paragraphBuffer.length) return;
    const paragraph = paragraphBuffer
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" ")
      .trim();
    splitReadableParagraph(paragraph).forEach((item) => blocks.push(item));
    paragraphBuffer = [];
  };

  for (let index = 0; index < cleanedLines.length; ) {
    const rawLine = cleanedLines[index];
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      index += 1;
      continue;
    }
    const tableBlock = consumeNoteTable(cleanedLines, index);
    if (tableBlock) {
      flushParagraph();
      blocks.push(tableBlock.markdown);
      index = tableBlock.nextIndex;
      continue;
    }

    const heading = detectNoteHeading(line);
    if (heading) {
      flushParagraph();
      blocks.push(`${"#".repeat(heading.level)} ${heading.text}`);
      index += 1;
      continue;
    }

    if (/^[-*•]\s*/.test(line)) {
      flushParagraph();
      blocks.push(`- ${line.replace(/^[-*•]\s*/, "").trim()}`);
      index += 1;
      continue;
    }

    if (line.length <= 28 && /[:：]$/.test(line)) {
      flushParagraph();
      blocks.push(`> ${line}`);
      index += 1;
      continue;
    }

    paragraphBuffer.push(line);
    index += 1;
  }

  flushParagraph();
  const markdown = blocks.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  return markdown ? { markdown, mode: "enhanced-note" } : { markdown: original, mode: "markdown" };
}

function buildBarTone(index: number) {
  const tones = [
    "from-fuchsia-500 via-violet-400 to-purple-300",
    "from-sky-500 via-blue-400 to-cyan-300",
    "from-emerald-500 via-teal-400 to-green-300",
    "from-amber-500 via-orange-400 to-yellow-300",
    "from-pink-500 via-rose-400 to-fuchsia-300",
    "from-slate-400 via-zinc-300 to-stone-200",
  ];
  return tones[index % tones.length];
}

function OverviewMarkdownRenderer({
  markdown,
  mode,
  headingTree,
  compact = false,
}: {
  markdown: string;
  mode: OverviewPreviewMode;
  headingTree: NotebookHeadingNode[];
  compact?: boolean;
}) {
  const flatHeadings = flattenHeadingNodes(headingTree);
  let headingRenderIndex = 0;

  return (
    <div className={cn(
      "max-w-none rounded-2xl border border-border/20 bg-black/10",
      compact ? "px-4 py-3" : "px-5 py-4",
      mode === "enhanced-note" ? "shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" : "",
    )}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }: any) => {
            const heading = flatHeadings[headingRenderIndex++];
            return <h1 id={heading?.id} className="mb-4 mt-2 text-2xl font-semibold tracking-tight text-foreground">{children}</h1>;
          },
          h2: ({ children }: any) => {
            const heading = flatHeadings[headingRenderIndex++];
            return <h2 id={heading?.id} className="mt-7 border-l-4 border-primary/45 pl-3 text-xl font-semibold text-primary">{children}</h2>;
          },
          h3: ({ children }: any) => {
            const heading = flatHeadings[headingRenderIndex++];
            return <h3 id={heading?.id} className="mt-6 border-l-2 border-primary/30 pl-3 text-lg font-medium text-foreground">{children}</h3>;
          },
          h4: ({ children }: any) => <h4 className="mt-5 text-base font-medium text-foreground">{children}</h4>,
          p: ({ children }: any) => <p className={cn("my-3 whitespace-pre-wrap text-foreground/92", compact ? "text-[14px] leading-6" : "text-[15px] leading-7")}>{children}</p>,
          ul: ({ children, node }: any) => {
            const items = (node?.children || [])
              .filter((child: any) => child.type === "listItem")
              .map((child: any) => extractMdNodeText(child).trim())
              .filter(Boolean);
            const flowList = items.length >= 3 && items.length <= 10 && items.every((item: string) => item.length <= 30);
            if (flowList) {
              return (
                <div className="my-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((item: string, index: number) => (
                    <div key={`${item}-${index}`} className="rounded-2xl border border-primary/15 bg-primary/5 px-3 py-3 text-sm text-foreground/92 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                      <div className="mb-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary/15 px-2 text-[11px] font-medium text-primary">
                        {index + 1}
                      </div>
                      <div className="leading-6">{item}</div>
                    </div>
                  ))}
                </div>
              );
            }
            return <ul className={cn("my-3 pl-5 text-foreground/92", compact ? "space-y-1.5 text-[14px]" : "space-y-2 text-[15px]")}>{children}</ul>;
          },
          ol: ({ children, node }: any) => {
            const items = (node?.children || [])
              .filter((child: any) => child.type === "listItem")
              .map((child: any) => extractMdNodeText(child).trim())
              .filter(Boolean);
            const flowList = items.length >= 3 && items.length <= 12 && items.every((item: string) => item.length <= 36);
            if (flowList) {
              return (
                <div className="my-4 flex flex-wrap gap-3">
                  {items.map((item: string, index: number) => (
                    <div key={`${item}-${index}`} className="group flex min-w-[180px] flex-1 items-stretch gap-2 rounded-2xl border border-white/6 bg-white/[0.02] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                      <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-r text-sm font-semibold text-white", buildBarTone(index))}>
                        {index + 1}
                      </div>
                      <div className="min-w-0 text-sm leading-6 text-foreground/92">{item}</div>
                    </div>
                  ))}
                </div>
              );
            }
            return <ol className={cn("my-3 pl-5 text-foreground/92", compact ? "space-y-1.5 text-[14px]" : "space-y-2 text-[15px]")}>{children}</ol>;
          },
          li: ({ children }: any) => <li className="marker:text-primary">{children}</li>,
          blockquote: ({ children }: any) => (
            <blockquote className="my-4 rounded-xl border border-emerald-400/20 bg-emerald-500/5 px-4 py-3 text-sm text-foreground/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              {children}
            </blockquote>
          ),
          hr: () => <div className="my-6 h-px bg-gradient-to-r from-transparent via-border/60 to-transparent" />,
          table: ({ node }: any) => {
            const rows = (node?.children || [])
              .filter((child: any) => child.type === "tableRow")
              .map((row: any) => (row.children || []).map((cell: any) => extractMdNodeText(cell)));
            if (!rows.length) return null;
            const headers: string[] = rows[0] || [];
            const body: string[][] = rows.slice(1);
            const percentageColumn = headers.findIndex((_: string, colIndex: number) => body.some((row: string[]) => /\d{1,3}%/.test(row[colIndex] || "")));
            const valueColumn = headers.findIndex((_: string, colIndex: number) => body.some((row: string[]) => /[¥$~亿万kK]/.test(row[colIndex] || "")));
            return (
              <div className="my-5 space-y-2 rounded-2xl border border-border/30 bg-black/15 p-3">
                <div className="grid gap-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground" style={{ gridTemplateColumns: `repeat(${Math.max(headers.length, 1)}, minmax(0, 1fr))` }}>
                  {headers.map((header: string, index: number) => (
                    <div key={`${header}-${index}`} className="px-2">{header}</div>
                  ))}
                </div>
                {body.map((row: string[], rowIndex: number) => {
                  const percent = percentageColumn >= 0 ? Number((row[percentageColumn] || "").replace(/[^\d.]/g, "")) || 0 : 0;
                  return (
                    <div key={`row-${rowIndex}`} className="relative overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02]">
                      {percentageColumn >= 0 && percent > 0 && (
                        <div
                          className={cn("absolute inset-y-0 left-0 rounded-r-2xl bg-gradient-to-r opacity-85", buildBarTone(rowIndex))}
                          style={{ width: `${Math.min(percent, 100)}%` }}
                        />
                      )}
                      <div className="relative grid gap-3 px-3 py-3 text-sm" style={{ gridTemplateColumns: `repeat(${Math.max(headers.length, 1)}, minmax(0, 1fr))` }}>
                        {row.map((cell: string, cellIndex: number) => (
                          <div key={`${rowIndex}-${cellIndex}`} className={cn(
                            "min-w-0 whitespace-pre-wrap break-words",
                            cellIndex === 0 ? "font-medium text-foreground" : "text-foreground/90",
                            cellIndex === percentageColumn && "font-semibold text-white",
                            cellIndex === valueColumn && "text-right text-muted-foreground",
                          )}>
                            {cell}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          },
          strong: ({ children }: any) => <strong className="font-semibold text-primary">{children}</strong>,
          code: ({ children }: any) => <code className="rounded bg-white/5 px-1.5 py-0.5 text-[13px] text-orange-200">{children}</code>,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = 240,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  minHeight?: number;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const element = editorRef.current;
    if (!element) return;
    if (element.innerHTML !== value) element.innerHTML = value || "";
  }, [value]);

  const focusEditor = () => {
    editorRef.current?.focus();
  };

  const toDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const syncValue = () => {
    onChange(editorRef.current?.innerHTML || "");
  };

  const runCommand = (command: string, commandValue?: string) => {
    focusEditor();
    document.execCommand(command, false, commandValue);
    syncValue();
  };

  const insertHtmlAtCursor = (html: string) => {
    focusEditor();
    document.execCommand("insertHTML", false, html);
    syncValue();
  };

  const insertImageFile = async (file: File) => {
    const dataUrl = await toDataUrl(file);
    insertHtmlAtCursor(`<p><img src="${dataUrl}" alt="${escapeHtml(file.name || "图片")}" /></p>`);
  };

  const toolbarButtonClass = "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/5 hover:text-primary";
  const dividerClass = "mx-1 h-5 w-px bg-border/40";

  return (
    <div className="rounded-xl border border-border/20 bg-black/10">
      <div className="flex flex-wrap items-center gap-1 border-b border-border/20 px-2 py-1.5">
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("formatBlock", "p")} className={toolbarButtonClass} title="正文">
          <Pilcrow className="h-4 w-4" />
        </button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("formatBlock", "h2")} className={toolbarButtonClass} title="二级标题">
          <Heading2 className="h-4 w-4" />
        </button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("formatBlock", "h3")} className={toolbarButtonClass} title="三级标题">
          <Heading3 className="h-4 w-4" />
        </button>
        <span className={dividerClass} />
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("bold")} className={toolbarButtonClass} title="加粗">
          <Bold className="h-4 w-4" />
        </button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("italic")} className={toolbarButtonClass} title="斜体">
          <Italic className="h-4 w-4" />
        </button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("underline")} className={toolbarButtonClass} title="下划线">
          <Underline className="h-4 w-4" />
        </button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("strikeThrough")} className={toolbarButtonClass} title="删除线">
          <Strikethrough className="h-4 w-4" />
        </button>
        <span className={dividerClass} />
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("insertUnorderedList")} className={toolbarButtonClass} title="无序列表">
          <List className="h-4 w-4" />
        </button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("insertOrderedList")} className={toolbarButtonClass} title="有序列表">
          <ListOrdered className="h-4 w-4" />
        </button>
        <span className={dividerClass} />
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("justifyLeft")} className={toolbarButtonClass} title="左对齐">
          <AlignLeft className="h-4 w-4" />
        </button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("justifyCenter")} className={toolbarButtonClass} title="居中">
          <AlignCenter className="h-4 w-4" />
        </button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("justifyRight")} className={toolbarButtonClass} title="右对齐">
          <AlignRight className="h-4 w-4" />
        </button>
        <span className={dividerClass} />
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            const url = window.prompt("输入链接地址");
            if (!url) return;
            runCommand("createLink", url);
          }}
          className={toolbarButtonClass}
          title="插入链接"
        >
          <Link2 className="h-4 w-4" />
        </button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => fileInputRef.current?.click()} className={toolbarButtonClass} title="插入图片/图表">
          <ImageIcon className="h-4 w-4" />
        </button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("removeFormat")} className={toolbarButtonClass} title="清除格式">
          <Eraser className="h-4 w-4" />
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          void insertImageFile(file);
          event.currentTarget.value = "";
        }}
      />
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={syncValue}
        onBlur={syncValue}
        onPaste={(event) => {
          const items = Array.from(event.clipboardData?.items || []);
          const imageItem = items.find((item) => item.type.startsWith("image/"));
          if (!imageItem) return;
          const file = imageItem.getAsFile();
          if (!file) return;
          event.preventDefault();
          void insertImageFile(file);
        }}
        data-placeholder={placeholder || ""}
        className="whitespace-pre-wrap px-3 py-3 text-sm outline-none [&_h1]:mb-3 [&_h1]:mt-6 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-lg [&_h3]:font-medium [&_img]:my-3 [&_img]:max-w-full [&_img]:rounded-lg [&_li]:my-1 [&_ol]:my-2 [&_p]:my-2 [&_ul]:my-2 [&:empty:before]:pointer-events-none [&:empty:before]:text-muted-foreground/45 [&:empty:before]:content-[attr(data-placeholder)]"
        style={{ minHeight }}
      />
    </div>
  );
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

function readStoredJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 隐私模式等场景 localStorage 不可用 */
  }
}

function defaultStockFocusBucketDefs(): StockFocusBucketDef[] {
  return [
    { id: "focus", label: "重点", tone: STOCK_BUCKET_TONES[0] },
    { id: "watch", label: "关注", tone: STOCK_BUCKET_TONES[1] },
    { id: "track", label: "跟踪", tone: STOCK_BUCKET_TONES[2] },
    { id: "other", label: "其他", tone: STOCK_BUCKET_TONES[3] },
  ];
}

function loadStockFocusBucketDefs(): StockFocusBucketDef[] {
  const saved = readStoredJson<StockFocusBucketDef[]>("framework-stock-focus-buckets", []);
  if (!Array.isArray(saved) || saved.length === 0) return defaultStockFocusBucketDefs();
  return saved.map((item, index) => ({
    id: item.id || `bucket-${index + 1}`,
    label: item.label || `分组${index + 1}`,
    tone: item.tone || STOCK_BUCKET_TONES[index % STOCK_BUCKET_TONES.length],
  }));
}

function loadStockFocusMap(bucketDefs: StockFocusBucketDef[]): Record<string, string> {
  const saved = readStoredJson<Record<string, string>>("framework-stock-focus-map", {});
  const labelToId = new Map(bucketDefs.map((item) => [item.label, item.id]));
  const firstId = bucketDefs[0]?.id || "focus";
  return Object.fromEntries(
    Object.entries(saved).map(([ticker, bucket]) => [ticker, labelToId.get(bucket) || bucket || firstId]),
  );
}

function loadStockFocusOrders(bucketDefs: StockFocusBucketDef[]): Record<string, string[]> {
  const saved = readStoredJson<Record<string, string[]>>("framework-stock-focus-orders", {});
  const labelToId = new Map(bucketDefs.map((item) => [item.label, item.id]));
  const next: Record<string, string[]> = {};
  for (const bucket of bucketDefs) {
    next[bucket.id] = [];
  }
  for (const [key, ids] of Object.entries(saved)) {
    const target = labelToId.get(key) || key;
    if (!next[target]) next[target] = [];
    next[target] = Array.isArray(ids) ? ids.filter((item): item is string => typeof item === "string") : [];
  }
  return next;
}

function loadStockFocusExpanded(bucketDefs: StockFocusBucketDef[]): Record<string, boolean> {
  const saved = readStoredJson<Record<string, boolean>>("framework-stock-focus-expanded", {});
  const labelToId = new Map(bucketDefs.map((item) => [item.label, item.id]));
  const next: Record<string, boolean> = {};
  for (const bucket of bucketDefs) next[bucket.id] = false;
  for (const [key, value] of Object.entries(saved)) {
    const target = labelToId.get(key) || key;
    next[target] = Boolean(value);
  }
  return next;
}

interface InsightSource {
  label: string;
  text: string;
}

interface OverviewSourceInterface {
  id: string;
  label: string;
  provider: string;
  note: string;
  enabled: boolean;
  removable?: boolean;
}

interface OverviewSourceDraft {
  label: string;
  provider: string;
  note: string;
}

interface OverviewBlock {
  title: string;
  body: string;
}

const OVERVIEW_WORKBENCH_TABS = [
  { key: "draft", label: "初稿" },
  { key: "deep", label: "深度" },
  { key: "candidates", label: "待吸收" },
  { key: "more", label: "更多" },
] as const;

type OverviewWorkbenchTab = typeof OVERVIEW_WORKBENCH_TABS[number]["key"];

function overviewCandidateSourceLabel(sourceType?: string) {
  if (sourceType === "report") return "研报";
  if (sourceType === "attachment") return "附件";
  if (sourceType === "note") return "纪要";
  if (sourceType === "expert_call") return "专家会";
  return sourceType || "候选";
}

function cardsFromBlocks(blocks: OverviewBlock[]): OverviewDeepCard[] {
  return blocks.map((block, index) => ({
    id: `card-${index + 1}`,
    title: block.title,
    body: block.body,
    preview_text: block.body.split("\n").slice(0, 3).join("\n"),
    image_blocks: [],
    chart_blocks: [],
    source_blocks: [],
    status: "active",
  }));
}

function blocksFromDraftModules(modules: (SectorModule | StockModule)[] | undefined): OverviewBlock[] {
  return (modules || []).map((item) => ({
    title: item.title,
    body: item.content || "该模块已经生成，但正文为空。",
  }));
}

function makeStructuredBlock(
  type: StructuredRenderBlock["type"],
  index: number,
  seed: Partial<StructuredRenderBlock> = {},
): StructuredRenderBlock {
  return {
    id: seed.id || `structured-${type}-${index + 1}`,
    type,
    title: seed.title || "",
    section_key: seed.section_key || "",
    content: seed.content || "",
    items: seed.items || [],
    table: seed.table || {},
    image: seed.image || {},
    chart_spec: seed.chart_spec || {},
    source_refs: seed.source_refs || [],
    children: seed.children || [],
    render_hint: seed.render_hint || {},
  };
}

function overviewBlocksToStructuredBlocks(scopeLabel: string, blocks: OverviewBlock[]): StructuredRenderBlock[] {
  const root = makeStructuredBlock("section", 0, {
    id: `overview-${scopeLabel}`,
    title: `${scopeLabel}概览`,
    children: blocks.map((block, index) =>
      makeStructuredBlock("section", index + 1, {
        id: `overview-${scopeLabel}-${index + 1}`,
        title: block.title,
        children: [
          makeStructuredBlock("paragraph", index + 1, {
            id: `overview-${scopeLabel}-${index + 1}-paragraph`,
            content: block.body || "该模块已经生成，但正文为空。",
          }),
        ],
      }),
    ),
  });
  return [root];
}

function contentBlockToStructuredBlock(block: OverviewContentBlock, index = 0): StructuredRenderBlock {
  if (block.type === "section") {
    return makeStructuredBlock("section", index, {
      id: block.id,
      title: block.title || "新章节",
      children: (block.children || []).map((child, childIndex) => contentBlockToStructuredBlock(child, childIndex)),
    });
  }
  if (block.type === "image") {
    return makeStructuredBlock("image", index, {
      id: block.id,
      title: block.title || "",
      content: block.caption || "",
      image: {
        url: block.image_url || "",
        caption: block.caption || "",
        source_label: block.source_label || "",
      },
    });
  }
  if (block.type === "chart") {
    return makeStructuredBlock("chart_spec", index, {
      id: block.id,
      title: block.title || "图表",
      content: block.note || "",
      chart_spec: block.spec || {},
    });
  }
  if (block.type === "source") {
    return makeStructuredBlock("source_ref", index, {
      id: block.id,
      title: block.title || "来源",
      content: block.note || "",
      source_refs: [{ label: block.source_label || block.title || "来源", url: block.url || "" }],
    });
  }
  return makeStructuredBlock("paragraph", index, {
    id: block.id,
    title: block.title || "",
    content: block.text || "",
  });
}

function deepCardsToStructuredBlocks(scopeLabel: string, cards: OverviewDeepCard[]): StructuredRenderBlock[] {
  return [
    makeStructuredBlock("section", 0, {
      id: `deep-${scopeLabel}`,
      title: `${scopeLabel}深度`,
      children: cards.map((card, index) => {
        const contentBlocks = (card.content_blocks && card.content_blocks.length > 0)
          ? card.content_blocks
          : legacyBlocksToContentBlocks(card);
        return makeStructuredBlock("section", index + 1, {
          id: card.id,
          title: card.title,
          children: contentBlocks.map((block, blockIndex) => contentBlockToStructuredBlock(block, blockIndex)),
        });
      }),
    }),
  ];
}

type DeepCardEditDraft = {
  title: string;
  preview_text: string;
  body: string;
  document_html?: string;
  content_blocks: OverviewContentBlock[];
  image_blocks: NonNullable<OverviewDeepCard["image_blocks"]>;
  chart_blocks: NonNullable<OverviewDeepCard["chart_blocks"]>;
  source_blocks: NonNullable<OverviewDeepCard["source_blocks"]>;
};

type UnclassifiedAssignment = {
  cardId: string;
  targetBlock: "body" | "image" | "chart" | "source";
};

type OutlineAnchor = {
  id: string;
  label: string;
  kind: "section" | "block";
};

function compactPreview(text?: string, max = 140) {
  const normalized = (text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "暂无摘要。";
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function overviewCardsToMarkdown(scopeLabel: string, cards: OverviewDeepCard[]) {
  const parts = [`# ${scopeLabel}概览`];
  cards.forEach((card) => {
    parts.push(`\n## ${card.title}`);
    if (card.body?.trim()) parts.push(`\n${card.body.trim()}`);
  });
  return parts.join("\n");
}

function markdownHeadings(markdown: string): NotebookHeadingNode[] {
  const lines = (markdown || "").split(/\r?\n/);
  const headings: NotebookHeading[] = [];
  let currentH1 = "";
  let currentH2 = "";
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const match = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (!match) return;
    const level = match[1].length as 1 | 2 | 3;
    const id = `md-heading-${index + 1}`;
    const text = match[2].trim();
    if (level === 1) {
      currentH1 = id;
      currentH2 = "";
      headings.push({ id, text, level });
    } else if (level === 2) {
      currentH2 = id;
      headings.push({ id, text, level, parentId: currentH1 || undefined });
    } else {
      headings.push({ id, text, level, parentId: currentH2 || currentH1 || undefined });
    }
  });
  return buildNotebookHeadingTree(headings);
}

function escapeHtml(value: string) {
  return (value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type NotebookHeading = {
  id: string;
  text: string;
  level: 1 | 2 | 3;
  parentId?: string;
};

type NotebookHeadingNode = NotebookHeading & {
  children: NotebookHeadingNode[];
};


function cloneContentBlockWithFreshIds(block: OverviewContentBlock): OverviewContentBlock {
  const cloned = makeContentBlock(block.type, block.title || "");
  return {
    ...cloned,
    title: block.title,
    text: block.text,
    image_url: block.image_url,
    caption: block.caption,
    source_label: block.source_label,
    url: block.url,
    note: block.note,
    spec: block.spec ? { ...block.spec } : undefined,
    children: block.children?.map((child) => cloneContentBlockWithFreshIds(child)),
  };
}

function makeContentBlock(type: OverviewContentBlock["type"], seed = ""): OverviewContentBlock {
  const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (type === "section") return { id, type, title: seed || "新章节", children: [] };
  if (type === "text") return { id, type, text: "" };
  if (type === "image") return { id, type, title: "", image_url: "", caption: "", source_label: "" };
  if (type === "chart") return { id, type, title: "", note: "", spec: { metric_key: "", note: "" } };
  return { id, type, title: "", url: "", note: "" };
}

function legacyBlocksToContentBlocks(card: OverviewDeepCard): OverviewContentBlock[] {
  const children: OverviewContentBlock[] = [];
  if ((card.body || "").trim()) {
    children.push({ id: `${card.id}-text-1`, type: "text", text: card.body.trim() });
  }
  for (const block of card.image_blocks || []) {
    children.push({
      id: block.id,
      type: "image",
      title: block.title || "",
      image_url: block.image_url || "",
      caption: block.caption || "",
      source_label: block.source_label || "",
    });
  }
  for (const [index, block] of (card.chart_blocks || []).entries()) {
    children.push({
      id: `${card.id}-chart-${index + 1}`,
      type: "chart",
      title: block.title || "",
      note: String(block.spec?.note || ""),
      spec: { ...(block.spec || {}) },
    });
  }
  for (const block of card.source_blocks || []) {
    children.push({
      id: block.id,
      type: "source",
      title: block.label || "",
      url: block.url || "",
      note: block.note || "",
    });
  }
  return children.length ? [{ id: `${card.id}-section-1`, type: "section", title: "核心内容", children }] : [];
}

function contentBlocksToLegacy(blocks: OverviewContentBlock[]) {
  const bodyParts: string[] = [];
  const image_blocks: NonNullable<OverviewDeepCard["image_blocks"]> = [];
  const chart_blocks: NonNullable<OverviewDeepCard["chart_blocks"]> = [];
  const source_blocks: NonNullable<OverviewDeepCard["source_blocks"]> = [];

  const walk = (items: OverviewContentBlock[], prefix: number[]) => {
    let sectionIndex = 0;
    for (const block of items) {
      if (block.type === "section") {
        sectionIndex += 1;
        const number = [...prefix, sectionIndex].join(".");
        if ((block.title || "").trim()) bodyParts.push(`${number} ${block.title!.trim()}`);
        walk(block.children || [], [...prefix, sectionIndex]);
        continue;
      }
      if (block.type === "text") {
        const plainText = stripHtmlTags(block.text || "");
        if (plainText) bodyParts.push(plainText);
        continue;
      }
      if (block.type === "image") {
        image_blocks.push({
          id: block.id,
          title: block.title || "",
          image_url: block.image_url || "",
          caption: block.caption || "",
          source_label: block.source_label || "",
        });
        continue;
      }
      if (block.type === "chart") {
        chart_blocks.push({
          type: "line",
          title: block.title || "",
          spec: { ...(block.spec || {}), note: block.note || String(block.spec?.note || "") },
        });
        continue;
      }
      source_blocks.push({
        id: block.id,
        label: block.title || "",
        url: block.url || "",
        note: block.note || "",
      });
    }
  };

  walk(blocks, []);
  return {
    body: bodyParts.join("\n\n"),
    image_blocks,
    chart_blocks,
    source_blocks,
  };
}

function buildSectionNumber(path: number[]) {
  return path.join(".");
}

function previewFromContentBlocks(blocks: OverviewContentBlock[]): string {
  const previews: string[] = [];
  const walk = (items: OverviewContentBlock[], path: number[]) => {
    let sectionIndex = 0;
    for (const block of items) {
      if (block.type === "section") {
        sectionIndex += 1;
        const nextPath = [...path, sectionIndex];
        if ((block.title || "").trim()) previews.push(`${buildSectionNumber(nextPath)} ${block.title!.trim()}`);
        walk(block.children || [], nextPath);
      } else if (block.type === "text" && stripHtmlTags(block.text || "")) {
        previews.push(stripHtmlTags(block.text || ""));
      }
      if (previews.join("\n").length > 240) return;
    }
  };
  walk(blocks, []);
  return previews.join("\n").trim();
}

function updateContentBlockTree(
  blocks: OverviewContentBlock[],
  blockId: string,
  updater: (block: OverviewContentBlock) => OverviewContentBlock,
): OverviewContentBlock[] {
  return blocks.map((block) => {
    if (block.id === blockId) return updater(block);
    if (block.children?.length) {
      return { ...block, children: updateContentBlockTree(block.children, blockId, updater) };
    }
    return block;
  });
}

function removeContentBlockTree(blocks: OverviewContentBlock[], blockId: string): OverviewContentBlock[] {
  return blocks
    .filter((block) => block.id !== blockId)
    .map((block) => ({
      ...block,
      children: block.children ? removeContentBlockTree(block.children, blockId) : block.children,
    }));
}

function duplicateContentBlockTree(blocks: OverviewContentBlock[], blockId: string): OverviewContentBlock[] {
  const duplicateInList = (items: OverviewContentBlock[]): OverviewContentBlock[] => {
    const index = items.findIndex((item) => item.id === blockId);
    if (index >= 0) {
      const next = [...items];
      next.splice(index + 1, 0, cloneContentBlockWithFreshIds(items[index]));
      return next;
    }
    return items.map((item) => item.children?.length ? { ...item, children: duplicateInList(item.children) } : item);
  };
  return duplicateInList(blocks);
}

function appendChildContentBlock(
  blocks: OverviewContentBlock[],
  parentId: string,
  newBlock: OverviewContentBlock,
): OverviewContentBlock[] {
  return blocks.map((block) => {
    if (block.id === parentId && block.type === "section") {
      return { ...block, children: [...(block.children || []), newBlock] };
    }
    if (block.children?.length) {
      return { ...block, children: appendChildContentBlock(block.children, parentId, newBlock) };
    }
    return block;
  });
}

function moveContentBlockWithinTree(
  blocks: OverviewContentBlock[],
  blockId: string,
  direction: "up" | "down",
): OverviewContentBlock[] {
  const moveInList = (items: OverviewContentBlock[]): OverviewContentBlock[] => {
    const index = items.findIndex((item) => item.id === blockId);
    if (index >= 0) {
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= items.length) return items;
      const next = [...items];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    }
    return items.map((item) => item.children?.length ? { ...item, children: moveInList(item.children) } : item);
  };
  return moveInList(blocks);
}

function insertSiblingContentBlock(
  blocks: OverviewContentBlock[],
  targetId: string,
  position: "before" | "after",
  newBlock: OverviewContentBlock,
): OverviewContentBlock[] {
  const insertInList = (items: OverviewContentBlock[]): OverviewContentBlock[] => {
    const index = items.findIndex((item) => item.id === targetId);
    if (index >= 0) {
      const next = [...items];
      next.splice(position === "before" ? index : index + 1, 0, newBlock);
      return next;
    }
    return items.map((item) => item.children?.length ? { ...item, children: insertInList(item.children) } : item);
  };
  return insertInList(blocks);
}

function reorderContentBlockTree(
  blocks: OverviewContentBlock[],
  draggedId: string,
  targetId: string,
): OverviewContentBlock[] {
  const reorderInList = (items: OverviewContentBlock[]): OverviewContentBlock[] => {
    const fromIndex = items.findIndex((item) => item.id === draggedId);
    const toIndex = items.findIndex((item) => item.id === targetId);
    if (fromIndex >= 0 && toIndex >= 0) {
      const next = [...items];
      const [moved] = next.splice(fromIndex, 1);
      const insertIndex = fromIndex < toIndex ? toIndex : toIndex;
      next.splice(insertIndex, 0, moved);
      return next;
    }
    return items.map((item) => item.children?.length ? { ...item, children: reorderInList(item.children) } : item);
  };
  return reorderInList(blocks);
}

function flattenOutlineAnchors(blocks: OverviewContentBlock[], path: number[] = []): OutlineAnchor[] {
  const anchors: OutlineAnchor[] = [];
  let sectionIndex = 0;
  for (const block of blocks) {
    if (block.type === "section") {
      sectionIndex += 1;
      const nextPath = [...path, sectionIndex];
      anchors.push({
        id: block.id,
        kind: "section",
        label: `${buildSectionNumber(nextPath)} ${block.title || "未命名章节"}`,
      });
      anchors.push(...flattenOutlineAnchors(block.children || [], nextPath));
    } else {
      const labelMap = {
        text: "正文",
        image: "图片",
        chart: "图表",
        source: "来源",
      };
      anchors.push({
        id: block.id,
        kind: "block",
        label: `${path.length ? `${buildSectionNumber(path)} · ` : ""}${labelMap[block.type]}${block.title ? ` · ${block.title}` : ""}`,
      });
    }
  }
  return anchors;
}

function outlineDomId(blockId: string) {
  return `outline-anchor-${blockId}`;
}

function buildNotebookHeadingTree(headings: NotebookHeading[]): NotebookHeadingNode[] {
  const byId = new Map<string, NotebookHeadingNode>();
  const roots: NotebookHeadingNode[] = [];
  headings.forEach((heading) => {
    byId.set(heading.id, { ...heading, children: [] });
  });
  headings.forEach((heading) => {
    const current = byId.get(heading.id)!;
    if (heading.parentId && byId.has(heading.parentId)) byId.get(heading.parentId)!.children.push(current);
    else roots.push(current);
  });
  return roots;
}

function knowledgeEntryCandidateSource(entry: KnowledgeEntry): OverviewCandidate["source_type"] {
  if (entry.type === "attachment_link") {
    if (isUploadedAttachmentContent(entry.content || entry.content_preview || "") || isAutoReportAttachment(entry)) return "report";
    return "attachment";
  }
  if (entry.type === "research_note" || entry.type === "tracking_comment") return "note";
  return "attachment";
}

interface VisualPreviewConfig {
  title: string;
  subtitle?: string;
  chartKind?: string;
  image?: string | null;
}

const STOCK_BUCKET_TONES = [
  "border-red-400/35 bg-red-500/10 text-red-200",
  "border-primary/35 bg-primary/10 text-primary",
  "border-sky-400/35 bg-sky-500/10 text-sky-200",
  "border-border/35 bg-muted/15 text-muted-foreground",
  "border-emerald-400/35 bg-emerald-500/10 text-emerald-200",
  "border-amber-400/35 bg-amber-500/10 text-amber-200",
] as const;

interface StockFocusBucketDef {
  id: string;
  label: string;
  tone: string;
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

function isUploadedAttachmentContent(text: string) {
  return (text || "").trim().startsWith("report:");
}

function attachmentNotesText(text: string) {
  const raw = (text || "").trim();
  if (!raw) return "";
  if (isUploadedAttachmentContent(raw)) return raw.split("\n").slice(1).join("\n").trim();
  const url = extractFirstUrl(raw);
  return url ? raw.replace(url, "").trim() : raw;
}

function isAutoReportAttachment(entry: KnowledgeEntry) {
  const content = (entry.content || entry.content_preview || "").trim();
  return content.startsWith("eastmoney-industry-report:") || content.startsWith("eastmoney-report:");
}

function isManualLibraryAttachment(entry: KnowledgeEntry) {
  return entry.type === "attachment_link" && !isAutoReportAttachment(entry);
}

function attachmentMetaValue(entry: KnowledgeEntry, label: string) {
  const text = entry.content || entry.content_preview || "";
  const match = text.match(new RegExp(`^${label}：(.+)$`, "m"));
  return match?.[1]?.trim() || "";
}

function numericDateValue(value: string) {
  return Number((value || "").split("-").join("")) || 0;
}

const DEFAULT_OVERVIEW_SOURCES: Record<"sector" | "stock", OverviewSourceInterface[]> = {
  sector: [
    {
      id: "sector-eastmoney-reports",
      label: "东财公开行业研报接口",
      provider: "eastmoney_report",
      note: "用于自动提取公开行业研报，生成行业概览框架；具体研报沉淀到附件投喂。",
      enabled: true,
    },
    {
      id: "sector-alphaengine-placeholder",
      label: "AlphaEngine 行业专家纪要接口",
      provider: "alphaengine_placeholder",
      note: "未来接入专家会、电话会、渠道纪要等高价值行业源。",
      enabled: true,
    },
  ],
  stock: [
    {
      id: "stock-eastmoney-reports",
      label: "东财个股研报 / 公告新闻接口",
      provider: "eastmoney_stock",
      note: "用于自动提取个股研报、公告、新闻等公开源；具体资料沉淀到附件投喂或个股时间线。",
      enabled: true,
    },
    {
      id: "stock-alphaengine-placeholder",
      label: "AlphaEngine 个股专家纪要接口",
      provider: "alphaengine_placeholder",
      note: "未来接入公司电话会、专家访谈、渠道反馈等高价值个股源。",
      enabled: true,
    },
  ],
};

function mergeOverviewSources(scope: "sector" | "stock", saved: OverviewSourceInterface[]) {
  const byId = new Map<string, OverviewSourceInterface>();
  for (const item of DEFAULT_OVERVIEW_SOURCES[scope]) byId.set(item.id, item);
  for (const item of saved) byId.set(item.id, item);
  return Array.from(byId.values());
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
  { key: "attachments", label: "附件投喂" },
];

const STOCK_VIEW_TABS = [
  { key: "overview", label: "公司概览" },
  { key: "indicators", label: "跟踪指标" },
  { key: "public", label: "公开信息" },
  { key: "modules", label: "自定义模块" },
  { key: "notes", label: "调研纪要" },
  { key: "comments", label: "跟踪点评" },
  { key: "timeline", label: "时间线" },
  { key: "attachments", label: "附件投喂" },
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
  const [sectorOverviewTab, setSectorOverviewTab] = useState<OverviewWorkbenchTab>("draft");
  const [stockOverviewTab, setStockOverviewTab] = useState<OverviewWorkbenchTab>("draft");
  const [learningView, setLearningView] = useState("overview");
  const [sectorWorkbench, setSectorWorkbench] = useState<OverviewWorkbench | null>(null);
  const [stockWorkbench, setStockWorkbench] = useState<OverviewWorkbench | null>(null);
  const [structuredEditorDrafts, setStructuredEditorDrafts] = useState<Record<string, StructuredRenderBlock[]>>({});
  const [structuredEditorSaving, setStructuredEditorSaving] = useState<Record<string, boolean>>({});
  const [reportSources, setReportSources] = useState<Record<"sector" | "stock", "deep" | "deep_plus_candidates" | "draft_plus_deep">>({
    sector: "deep",
    stock: "deep",
  });
  const [compareState, setCompareState] = useState<{
    scope: "sector" | "stock" | "";
    candidate: OverviewCandidate | null;
    targetCardId: string;
    targetAnchorId: string;
  }>({ scope: "", candidate: null, targetCardId: "", targetAnchorId: "" });
  const [, setDeepCardEdits] = useState<Record<string, DeepCardEditDraft>>({});
  const [collapsedOutlineSections, setCollapsedOutlineSections] = useState<Record<string, boolean>>({});
  const [activeOutlineBlockId, setActiveOutlineBlockId] = useState("");
  const [draggingOutlineBlockId, setDraggingOutlineBlockId] = useState("");
  const [dragOverOutlineBlockId, setDragOverOutlineBlockId] = useState("");
  const outlineScrollSyncRef = useRef<Record<string, boolean>>({});
  const [deepWorkspaceView, setDeepWorkspaceView] = useState<Record<"sector" | "stock", "cards" | "review">>({ sector: "cards", stock: "cards" });
  const [importDialogScope, setImportDialogScope] = useState<"" | "sector" | "stock">("");
  const [overviewMoreDrawer, setOverviewMoreDrawer] = useState<"" | "sector" | "stock">("");
  const [candidatePanels, setCandidatePanels] = useState<Record<string, boolean>>({
    "sector:report": true,
    "sector:attachment": false,
    "sector:note": false,
    "sector:expert_call": false,
    "stock:report": true,
    "stock:attachment": false,
    "stock:note": false,
    "stock:expert_call": false,
  });
  const [importSelectionIds, setImportSelectionIds] = useState<string[]>([]);
  const [unclassifiedAssignments, setUnclassifiedAssignments] = useState<Record<string, UnclassifiedAssignment>>({});
  const [sectorCenterEditing, setSectorCenterEditing] = useState(false);
  const [stockCenterEditing, setStockCenterEditing] = useState(false);
  const [editingSectorNodeId, setEditingSectorNodeId] = useState("");
  const [sectorNameDraft, setSectorNameDraft] = useState("");
  const [editingStockTicker, setEditingStockTicker] = useState("");
  const [stockNameDraft, setStockNameDraft] = useState("");
  const [sectorObjectPanelOpen, setSectorObjectPanelOpen] = useState(false);
  const [sectorObjectQuery, setSectorObjectQuery] = useState("");
  const [sectorLibraryForm, setSectorLibraryForm] = useState({ name: "", kind: "primary" as "primary" | "secondary", parent_id: "" });
  const [stockFocusBucketDefs, setStockFocusBucketDefs] = useState<StockFocusBucketDef[]>(() => loadStockFocusBucketDefs());
  const [stockFocusMap, setStockFocusMap] = useState<Record<string, string>>(() => loadStockFocusMap(loadStockFocusBucketDefs()));
  const [stockFocusOrders, setStockFocusOrders] = useState<Record<string, string[]>>(() => loadStockFocusOrders(loadStockFocusBucketDefs()));
  const [stockFocusExpanded, setStockFocusExpanded] = useState<Record<string, boolean>>(() => loadStockFocusExpanded(loadStockFocusBucketDefs()));
  const [learningTargetSector, setLearningTargetSector] = useState("");
  const [learningTargetStock, setLearningTargetStock] = useState("");
  const [stockCenter, setStockCenter] = useState<StockCenterData | null>(null);
  const [form, setForm] = useState({ title: "", content: "", related: "", tags: "", investment_view: "" as "" | "bullish" | "neutral" | "bearish" });
  const [attachmentForm, setAttachmentForm] = useState({ title: "", url: "", notes: "", tags: "" });
  const [attachmentEditing, setAttachmentEditing] = useState<{ id: string; scope: "sector" | "stock" | ""; preserveContent: boolean }>({ id: "", scope: "", preserveContent: false });

  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-outline-section='true']"));
    if (sections.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (Object.values(outlineScrollSyncRef.current).some(Boolean)) return;
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => {
            const topDiff = Math.abs(left.boundingClientRect.top) - Math.abs(right.boundingClientRect.top);
            if (topDiff !== 0) return topDiff;
            return right.intersectionRatio - left.intersectionRatio;
          });
        const current = visible[0]?.target as HTMLElement | undefined;
        const sectionId = current?.dataset.outlineSectionId || "";
        if (sectionId) setActiveOutlineBlockId((prev) => (prev === sectionId ? prev : sectionId));
      },
      { rootMargin: "-18% 0px -62% 0px", threshold: [0.1, 0.35, 0.6] },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  });
  const [attachmentDeleteDialog, setAttachmentDeleteDialog] = useState<{ open: boolean; scope: "sector" | "stock" | ""; entry: KnowledgeEntry | null }>({
    open: false,
    scope: "",
    entry: null,
  });
  const [sectorForm, setSectorForm] = useState({ name: "", parent_id: "", description: "" });
  const [indicatorForm, setIndicatorForm] = useState({ sector: "", name: "", freq: "月度", chart_kind: "line", viewpoint: "" });
  const [sectorModuleForm, setSectorModuleForm] = useState({ title: "", category: "行业框架", content: "" });
  const [stockModuleForm, setStockModuleForm] = useState({ title: "", category: "公开信息", content: "" });
  const [premiumNoteForm, setPremiumNoteForm] = useState({ title: "", source_name: "premium_notes_placeholder", content: "" });
  const [overviewSources, setOverviewSources] = useState<Record<"sector" | "stock", OverviewSourceInterface[]>>(() => ({
    sector: mergeOverviewSources("sector", readStoredJson<OverviewSourceInterface[]>("framework-sector-overview-sources", [])),
    stock: mergeOverviewSources("stock", readStoredJson<OverviewSourceInterface[]>("framework-stock-overview-sources", [])),
  }));
  const [overviewSourcePanels, setOverviewSourcePanels] = useState<Record<"sector" | "stock", boolean>>(() => readStoredJson("framework-overview-source-panels", {
    sector: false,
    stock: false,
  }));
  const [overviewSourceDrafts, setOverviewSourceDrafts] = useState<Record<"sector" | "stock", OverviewSourceDraft>>({
    sector: { label: "", provider: "api", note: "" },
    stock: { label: "", provider: "api", note: "" },
  });
  const [youdaoBindAssistOpen, setYoudaoBindAssistOpen] = useState<Record<"sector" | "stock", boolean>>({ sector: false, stock: false });
  const [youdaoSearchDrafts, setYoudaoSearchDrafts] = useState<Record<"sector" | "stock", string>>({ sector: "", stock: "" });
  const [youdaoSearchLoading, setYoudaoSearchLoading] = useState<Record<"sector" | "stock", boolean>>({ sector: false, stock: false });
  const [youdaoSearchResults, setYoudaoSearchResults] = useState<Record<"sector" | "stock", YoudaoNoteCandidate[]>>({ sector: [], stock: [] });
  const [youdaoCandidateAssistOpen, setYoudaoCandidateAssistOpen] = useState<Record<"sector" | "stock", boolean>>({ sector: false, stock: false });
  const [youdaoCandidateDrafts, setYoudaoCandidateDrafts] = useState<Record<"sector" | "stock", string>>({ sector: "", stock: "" });
  const [youdaoCandidateLoading, setYoudaoCandidateLoading] = useState<Record<"sector" | "stock", boolean>>({ sector: false, stock: false });
  const [youdaoCandidateResults, setYoudaoCandidateResults] = useState<Record<"sector" | "stock", YoudaoNoteCandidate[]>>({ sector: [], stock: [] });
  const [youdaoCandidateImporting, setYoudaoCandidateImporting] = useState<Record<"sector" | "stock", string>>({ sector: "", stock: "" });
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
  const [draggingStockBucketId, setDraggingStockBucketId] = useState("");
  const [dragOverStockBucketId, setDragOverStockBucketId] = useState("");
  const [draggingSectorGroupId, setDraggingSectorGroupId] = useState("");
  const [dragOverSectorGroupId, setDragOverSectorGroupId] = useState("");
  const [draggingSectorChildId, setDraggingSectorChildId] = useState("");
  const [dragOverSectorChildId, setDragOverSectorChildId] = useState("");
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
    writeStoredJson("framework-sector-overview-sources", overviewSources.sector.filter((item) => !DEFAULT_OVERVIEW_SOURCES.sector.some((source) => source.id === item.id)));
    writeStoredJson("framework-stock-overview-sources", overviewSources.stock.filter((item) => !DEFAULT_OVERVIEW_SOURCES.stock.some((source) => source.id === item.id)));
  }, [overviewSources]);

  useEffect(() => {
    writeStoredJson("framework-overview-source-panels", overviewSourcePanels);
  }, [overviewSourcePanels]);

  useEffect(() => {
    writeStoredJson("framework-stock-focus-buckets", stockFocusBucketDefs);
  }, [stockFocusBucketDefs]);

  useEffect(() => {
    writeStoredJson("framework-stock-focus-map", stockFocusMap);
  }, [stockFocusMap]);

  useEffect(() => {
    writeStoredJson("framework-stock-focus-orders", stockFocusOrders);
  }, [stockFocusOrders]);

  useEffect(() => {
    writeStoredJson("framework-stock-focus-expanded", stockFocusExpanded);
  }, [stockFocusExpanded]);

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
    if (selectedSector) void loadSectorWorkbench(selectedSector);
  }, [selectedSector]);

  useEffect(() => {
    if (selectedTicker) void loadStockWorkbench(selectedTicker);
  }, [selectedTicker]);

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

  const addOverviewSource = (scope: "sector" | "stock") => {
    const draft = overviewSourceDrafts[scope];
    if (!draft.label.trim()) {
      toast.error("先填一个信息源名称");
      return;
    }
    const source: OverviewSourceInterface = {
      id: `${scope}-${Date.now()}`,
      label: draft.label.trim(),
      provider: draft.provider.trim() || "api",
      note: draft.note.trim(),
      enabled: true,
      removable: true,
    };
    setOverviewSources((current) => ({
      ...current,
      [scope]: [...current[scope], source],
    }));
    setOverviewSourceDrafts((current) => ({
      ...current,
      [scope]: { label: "", provider: "api", note: "" },
    }));
    setOverviewSourcePanels((current) => ({ ...current, [scope]: true }));
    toast.success("信息源接口已加入");
  };

  const removeOverviewSource = (scope: "sector" | "stock", id: string) => {
    setOverviewSources((current) => ({
      ...current,
      [scope]: current[scope].filter((item) => item.id !== id),
    }));
    toast.success("信息源接口已删除");
  };

  const toggleOverviewSource = (scope: "sector" | "stock", id: string) => {
    setOverviewSources((current) => ({
      ...current,
      [scope]: current[scope].map((item) => item.id === id ? { ...item, enabled: !item.enabled } : item),
    }));
  };

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
      if (active === "sectors" && selectedSector) {
        await api.appendOverviewCandidates({
          scope_type: "sector",
          scope_id: selectedSector,
          source_type: "note",
          candidates: [{
            id: `${created.id}-candidate`,
            source_type: "note",
            title: created.title,
            summary: form.content.trim().slice(0, 240),
            source_title: created.title,
            source_entry_id: created.id,
          }],
        }).catch(() => null);
        await loadSectorWorkbench(selectedSector).catch(() => null);
      }
      if (active === "stocks" && selectedTicker) {
        await api.appendOverviewCandidates({
          scope_type: "stock",
          scope_id: selectedTicker,
          source_type: "note",
          candidates: [{
            id: `${created.id}-candidate`,
            source_type: "note",
            title: created.title,
            summary: form.content.trim().slice(0, 240),
            source_title: created.title,
            source_entry_id: created.id,
          }],
        }).catch(() => null);
        await loadStockWorkbench(selectedTicker).catch(() => null);
      }
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

  const addSectorLibraryNode = async () => {
    const name = sectorLibraryForm.name.trim();
    if (!name) {
      toast.error("行业名称要填");
      return;
    }
    const parentId = sectorLibraryForm.kind === "secondary" ? sectorLibraryForm.parent_id.trim() : "";
    if (sectorLibraryForm.kind === "secondary" && !parentId) {
      toast.error("先选择要挂载的一级行业");
      return;
    }
    try {
      await api.upsertSectorNode({
        name,
        parent_id: parentId || undefined,
      });
      setSectorLibraryForm((current) => ({ ...current, name: "", parent_id: current.kind === "secondary" ? current.parent_id : "" }));
      toast.success(sectorLibraryForm.kind === "primary" ? "一级行业已加入行业中心" : "二级行业已挂到所选一级行业");
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "行业库更新失败");
    }
  };

  const beginSectorInlineRename = (node: SectorTreeNode) => {
    setEditingSectorNodeId(node.id);
    setSectorNameDraft(node.name);
  };

  const commitSectorInlineRename = async (node: SectorTreeNode) => {
    const trimmed = sectorNameDraft.trim();
    if (!trimmed) {
      toast.error("行业名称不能为空");
      return;
    }
    if (trimmed === node.name) {
      setEditingSectorNodeId("");
      setSectorNameDraft("");
      return;
    }
    try {
      await api.upsertSectorNode({
        id: node.id,
        name: trimmed,
        parent_id: node.parent_id || undefined,
        description: node.description,
        sort_order: node.sort_order,
      });
      if (selectedSector === node.name) {
        setSelectedSector(trimmed);
        setIndicatorForm((prev) => ({ ...prev, sector: trimmed }));
        setForm((prev) => ({ ...prev, related: trimmed }));
      }
      toast.success("行业名称已更新");
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "行业重命名失败");
    } finally {
      setEditingSectorNodeId("");
      setSectorNameDraft("");
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
      const scopeType = scope === "industry" ? "sector" : "stock";
      const scopeId = scope === "industry" ? selectedSector : selectedTicker;
      if (scopeId) {
        await api.appendOverviewCandidates({
          scope_type: scopeType,
          scope_id: scopeId,
          source_type: "expert_call",
          candidates: [{
            id: `${result.entry.id}-candidate`,
            source_type: "expert_call",
            title: result.entry.title,
            summary: premiumNoteForm.content.trim().slice(0, 240),
            source_title: result.entry.title,
            source_entry_id: result.entry.id,
          }],
        }).catch(() => null);
        if (scopeType === "sector") await loadSectorWorkbench(scopeId).catch(() => null);
        else await loadStockWorkbench(scopeId).catch(() => null);
      }
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
      const created = await api.createKnowledgeEntry({
        title: `研报：${report.name}`,
        type: "attachment_link",
        content: `report:${report.id}\n${report.name}\n行业：${report.industry}`,
        tags: ["研报", report.industry],
        related_sectors: isSectorScope ? [selectedSector] : [],
        related_stocks: isSectorScope ? [] : [selectedTicker],
      });
      const scopeType = isSectorScope ? "sector" : "stock";
      const scopeId = isSectorScope ? selectedSector : selectedTicker;
      const structuredExt = new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp", ".md", ".markdown", ".txt"]);
      if (structuredExt.has(report.ext || "")) {
        const imported = await api.importStoredReportOverviewCandidate({
          scope_type: scopeType,
          scope_id: scopeId,
          report_id: report.id,
          title: report.name,
        }).catch(() => null);
        if (imported?.workbench) {
          if (isSectorScope) setSectorWorkbench(imported.workbench);
          else setStockWorkbench(imported.workbench);
          setDeepWorkspaceView((current) => ({ ...current, [scopeType]: "review" }));
        }
      } else {
        await api.appendOverviewCandidates({
          scope_type: scopeType,
          scope_id: scopeId,
          source_type: "attachment",
          candidates: [{
            id: `${created.id}-candidate`,
            source_type: "attachment",
            title: created.title,
            summary: `${report.name} 已上传到附件资料库，后续可提炼后吸收进深度卡片。`,
            source_title: created.title,
            source_entry_id: created.id,
          }],
        }).catch(() => null);
      }
      toast.success(isSectorScope ? "研报已归档并接入当前行业概览候选池" : "研报已归档并接入当前个股概览候选池");
      await load();
      if (isSectorScope) await loadSectorWorkbench(selectedSector).catch(() => null);
      else await loadStockWorkbench(selectedTicker).catch(() => null);
      if (!isSectorScope) await loadStockCenter(selectedTicker);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "研报挂接失败");
    }
  };

  const toggleYoudaoFeedAssist = (scope: "sector" | "stock", scopeId: string) => {
    const nextOpen = !youdaoCandidateAssistOpen[scope];
    setYoudaoCandidateAssistOpen((current) => ({ ...current, [scope]: nextOpen }));
    if (nextOpen) {
      setYoudaoCandidateDrafts((current) => ({ ...current, [scope]: current[scope] || scopeId || "" }));
    }
  };

  const searchYoudaoFeedNotes = async (scope: "sector" | "stock", defaultKeyword: string) => {
    const q = (youdaoCandidateDrafts[scope] || defaultKeyword || "").trim();
    if (!q) {
      toast.error("请先输入笔记标题");
      return;
    }
    setYoudaoCandidateLoading((current) => ({ ...current, [scope]: true }));
    try {
      const items = await api.searchYoudaoNotes(q);
      setYoudaoCandidateResults((current) => ({ ...current, [scope]: items }));
      setYoudaoCandidateAssistOpen((current) => ({ ...current, [scope]: true }));
      if (items.length > 0) toast.success(`已找到 ${items.length} 条候选笔记`);
      else toast.error("还没有搜到候选笔记");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "搜索有道笔记失败");
    } finally {
      setYoudaoCandidateLoading((current) => ({ ...current, [scope]: false }));
    }
  };

  const importYoudaoFeedNote = async (scope: "sector" | "stock", scopeId: string, item: YoudaoNoteCandidate) => {
    if (!scopeId) return;
    setYoudaoCandidateImporting((current) => ({ ...current, [scope]: item.file_id }));
    try {
      const workbench = await api.importYoudaoOverviewCandidate({
        scope_type: scope,
        scope_id: scopeId,
        file_id: item.file_id,
        title: item.title,
      });
      if (scope === "sector") setSectorWorkbench(workbench);
      else setStockWorkbench(workbench);
      setDeepWorkspaceView((current) => ({ ...current, [scope]: "review" }));
      toast.success("已导入待吸收候选池，现已进入未分类检查页");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "导入有道笔记失败");
    } finally {
      setYoudaoCandidateImporting((current) => ({ ...current, [scope]: "" }));
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
    const editingCurrent = attachmentEditing.id && attachmentEditing.scope === scope;
    if (!editingCurrent && !attachmentForm.url.trim() && !attachmentForm.notes.trim()) {
      toast.error("先粘贴链接或填写资料说明");
      return;
    }
    const url = attachmentForm.url.trim();
    const title = attachmentForm.title.trim() || (url ? `附件投喂：${url.replace(/^https?:\/\//, "").slice(0, 48)}` : "附件资料");
    const content = attachmentEditing.preserveContent
      ? (scope === "sector"
        ? sectorAttachments.find((item) => item.id === attachmentEditing.id)?.content
        : stockCenter?.attachments.find((item) => item.id === attachmentEditing.id)?.content) || ""
      : [url, attachmentForm.notes.trim()].filter(Boolean).join("\n");
    try {
      let createdId = "";
      if (editingCurrent) {
        await api.updateKnowledgeEntry(attachmentEditing.id, {
          title,
          content,
          tags: ["附件", ...tags(attachmentForm.tags)],
          related_sectors: scope === "sector" ? [selectedSector] : [],
          related_stocks: scope === "stock" ? [selectedTicker] : [],
        });
      } else {
        const created = await api.createKnowledgeEntry({
          title,
          type: "attachment_link",
          content,
          tags: ["附件", ...tags(attachmentForm.tags)],
          related_sectors: scope === "sector" ? [selectedSector] : [],
          related_stocks: scope === "stock" ? [selectedTicker] : [],
        });
        createdId = created.id;
        await api.appendOverviewCandidates({
          scope_type: scope,
          scope_id: scope === "sector" ? selectedSector : selectedTicker,
          source_type: "attachment",
          candidates: [{
            id: `${created.id}-candidate`,
            source_type: "attachment",
            title: created.title,
            summary: attachmentForm.notes.trim().slice(0, 240) || attachmentForm.url.trim(),
            source_title: created.title,
            source_url: attachmentForm.url.trim(),
            source_entry_id: created.id,
          }],
        }).catch(() => null);
      }
      setAttachmentForm({ title: "", url: "", notes: "", tags: "" });
      setAttachmentEditing({ id: "", scope: "", preserveContent: false });
      toast.success(editingCurrent ? "附件记录已更新" : scope === "sector" ? "附件投喂已挂到当前行业" : "附件投喂已挂到当前个股");
      await load();
      if (scope === "sector" && selectedSector && createdId) await loadSectorWorkbench(selectedSector).catch(() => null);
      if (scope === "stock") {
        await loadStockCenter(selectedTicker);
        if (createdId) await loadStockWorkbench(selectedTicker).catch(() => null);
      }
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : editingCurrent ? "附件记录更新失败" : "附件投喂保存失败");
    }
  };

  const beginAttachmentEdit = (scope: "sector" | "stock", entry: KnowledgeEntry) => {
    const content = entry.content || entry.content_preview || "";
    setAttachmentEditing({
      id: entry.id,
      scope,
      preserveContent: isUploadedAttachmentContent(content),
    });
    setAttachmentForm({
      title: entry.title || "",
      url: isUploadedAttachmentContent(content) ? "" : extractFirstUrl(content),
      notes: attachmentNotesText(content),
      tags: (entry.tags || []).filter((item) => item !== "附件").join(", "),
    });
  };

  const cancelAttachmentEdit = () => {
    setAttachmentEditing({ id: "", scope: "", preserveContent: false });
    setAttachmentForm({ title: "", url: "", notes: "", tags: "" });
  };

  const requestAttachmentDelete = (scope: "sector" | "stock", entry: KnowledgeEntry) => {
    setAttachmentDeleteDialog({ open: true, scope, entry });
  };

  const confirmAttachmentDelete = async () => {
    const scope = attachmentDeleteDialog.scope;
    const entry = attachmentDeleteDialog.entry;
    if (!scope || !entry) return;
    try {
      await api.deleteKnowledgeEntry(entry.id);
      if (attachmentEditing.id === entry.id) cancelAttachmentEdit();
      setAttachmentDeleteDialog({ open: false, scope: "", entry: null });
      toast.success("附件记录已删除");
      await load();
      if (scope === "stock" && selectedTicker) await loadStockCenter(selectedTicker);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "附件记录删除失败");
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
      await api.saveOverviewDraft({
        scope_type: "sector",
        scope_id: selectedSector,
        draft: {
          summary: `最近一次自动提取读取 ${result.sources_count} 条资料，生成 ${result.modules.length} 个初稿模块。`,
          modules: result.modules,
          sources: overviewSources.sector,
          keywords: [],
        },
      });
      await syncOverviewStructuredPreview("sector", selectedSector, {
        ...(sectorWorkbench || {}),
        scope_type: "sector",
        scope_id: selectedSector,
        draft: {
          summary: `最近一次自动提取读取 ${result.sources_count} 条资料，生成 ${result.modules.length} 个初稿模块。`,
          modules: result.modules,
          sources: overviewSources.sector,
          keywords: [],
        },
        deep_cards: sectorWorkbench?.deep_cards || sectorDeepCards,
        candidates: sectorWorkbench?.candidates || [],
        versions: sectorWorkbench?.versions || [],
      } as OverviewWorkbench);
      setSectorOverviewTab("draft");
      toast.success(`行业概览已更新：读取 ${result.sources_count} 条资料，生成 ${result.modules.length} 个框架模块`);
      await load();
      await loadSectorWorkbench(selectedSector);
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
      await api.saveOverviewDraft({
        scope_type: "stock",
        scope_id: selectedTicker,
        draft: {
          summary: `最近一次自动提取读取 ${result.sources_count} 条资料，生成 ${result.modules.length} 个初稿模块。`,
          modules: result.modules,
          sources: overviewSources.stock,
          keywords: [],
        },
      });
      await syncOverviewStructuredPreview("stock", selectedTicker, {
        ...(stockWorkbench || {}),
        scope_type: "stock",
        scope_id: selectedTicker,
        draft: {
          summary: `最近一次自动提取读取 ${result.sources_count} 条资料，生成 ${result.modules.length} 个初稿模块。`,
          modules: result.modules,
          sources: overviewSources.stock,
          keywords: [],
        },
        deep_cards: stockWorkbench?.deep_cards || stockDeepCards,
        candidates: stockWorkbench?.candidates || [],
        versions: stockWorkbench?.versions || [],
      } as OverviewWorkbench);
      setStockOverviewTab("draft");
      toast.success(`个股概览已更新：读取 ${result.sources_count} 条资料，生成 ${result.modules.length} 个框架模块`);
      await load();
      await loadStockCenter(selectedTicker);
      await loadStockWorkbench(selectedTicker);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "个股概览更新失败");
    } finally {
      setBuildingOverview("");
    }
  };

  const syncOverviewStructuredPreview = async (
    scope: "sector" | "stock",
    scopeId: string,
    workbench?: OverviewWorkbench | null,
  ) => {
    const currentWorkbench = workbench || await api.overviewWorkbench(scope, scopeId);
    const refreshed = await api.saveOverviewStructuredPreview({
      scope_type: scope,
      scope_id: scopeId,
      draft_blocks: overviewBlocksToStructuredBlocks(scopeId, blocksFromDraftModules(currentWorkbench.draft.modules)),
      deep_blocks: deepCardsToStructuredBlocks(scopeId, currentWorkbench.deep_cards || []),
    });
    if (scope === "sector") setSectorWorkbench(refreshed);
    else setStockWorkbench(refreshed);
    return refreshed;
  };

  const saveDeepCards = async (scope: "sector" | "stock", cards: OverviewDeepCard[]) => {
    const scopeId = scope === "sector" ? selectedSector : selectedTicker;
    if (!scopeId) return;
    try {
      const saved = await api.saveOverviewDeepCards({
        scope_type: scope,
        scope_id: scopeId,
        cards,
      });
      if (scope === "sector") {
        setSectorWorkbench((current) => current ? { ...current, deep_cards: saved, updated_at: new Date().toISOString() } : current);
      } else {
        setStockWorkbench((current) => current ? { ...current, deep_cards: saved, updated_at: new Date().toISOString() } : current);
      }
      await syncOverviewStructuredPreview(scope, scopeId, {
        ...(scope === "sector" ? sectorWorkbench : stockWorkbench),
        scope_type: scope,
        scope_id: scopeId,
        draft: (scope === "sector" ? sectorWorkbench : stockWorkbench)?.draft || { summary: "", modules: [], sources: [], keywords: [] },
        deep_cards: saved,
        candidates: (scope === "sector" ? sectorWorkbench : stockWorkbench)?.candidates || [],
        versions: (scope === "sector" ? sectorWorkbench : stockWorkbench)?.versions || [],
      } as OverviewWorkbench);
      toast.success(scope === "sector" ? "行业深度卡片已保存" : "个股深度卡片已保存");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "深度卡片保存失败");
    }
  };

  const seedDeepCardsFromDraft = async (scope: "sector" | "stock") => {
    const cards = scope === "sector" ? cardsFromBlocks(sectorDraftBlocks) : cardsFromBlocks(stockDraftBlocks);
    await saveDeepCards(scope, cards);
  };

  const openCandidateCompare = (scope: "sector" | "stock", candidate: OverviewCandidate) => {
    const cards = scope === "sector" ? sectorDeepCards : stockDeepCards;
    const targetCard = cards.find((item) => item.id === candidate.matched_card_id) || cards[0] || null;
    setCompareState({
      scope,
      candidate,
      targetCardId: targetCard?.id || "",
      targetAnchorId: "",
    });
  };

  const applyCandidateDecisionWithContext = async (
    scope: "sector" | "stock",
    candidate: OverviewCandidate,
    action: "replace" | "append" | "partial" | "ignore",
    options?: { cardId?: string; anchorId?: string },
  ) => {
    const scopeId = scope === "sector" ? selectedSector : selectedTicker;
    if (!scopeId) return;
    const deepCards = scope === "sector" ? sectorDeepCards : stockDeepCards;
    const cardId = options?.cardId || compareState.targetCardId || candidate.matched_card_id || "";
    const targetCard = deepCards.find((item) => item.id === cardId) || deepCards.find((item) => item.id === candidate.matched_card_id) || deepCards[0] || null;
    try {
      await api.applyOverviewCandidate({
        scope_type: scope,
        scope_id: scopeId,
        candidate_id: candidate.id,
        action,
        payload: {
          card_id: targetCard?.id || "",
          target_anchor_id: options?.anchorId || compareState.targetAnchorId || "",
          target_block: candidate.target_block || "body",
          merged_body: targetCard ? [targetCard.body, candidate.proposed_patch || candidate.summary || ""].filter(Boolean).join("\n\n") : candidate.proposed_patch || candidate.summary || "",
          change_summary: `${overviewCandidateSourceLabel(candidate.source_type)}候选吸收到${targetCard?.title || "深度卡片"}`,
        },
      });
      await syncOverviewStructuredPreview(scope, scopeId);
      setCompareState({ scope: "", candidate: null, targetCardId: "", targetAnchorId: "" });
      if (scope === "sector") await loadSectorWorkbench(scopeId);
      else await loadStockWorkbench(scopeId);
      toast.success(action === "ignore" ? "候选项已忽略" : "候选项已吸收并留痕");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "候选项处理失败");
    }
  };

  const applyCandidateDecision = async (action: "replace" | "append" | "partial" | "ignore") => {
    const { scope, candidate } = compareState;
    if (!scope || !candidate) return;
    await applyCandidateDecisionWithContext(scope, candidate, action);
  };

  const quickApplyCandidate = async (scope: "sector" | "stock", candidate: OverviewCandidate, action: "append" | "ignore") => {
    await applyCandidateDecisionWithContext(scope, candidate, action, {
      cardId: candidate.matched_card_id || "",
      anchorId: "",
    });
  };

  const confirmImportToUnclassified = async () => {
    const scope = importDialogScope;
    const scopeId = scope === "sector" ? selectedSector : selectedTicker;
    if (!scope || !scopeId) return;
    const sourcePool = scope === "sector" ? sectorImportSources : stockImportSources;
    const picked = sourcePool.filter((item) => importSelectionIds.includes(item.id));
    if (picked.length === 0) {
      toast.error("先选择至少一条资料");
      return;
    }
    const bySource = {
      attachment: [] as OverviewCandidate[],
      note: [] as OverviewCandidate[],
      report: [] as OverviewCandidate[],
      expert_call: [] as OverviewCandidate[],
    };
    const fallbackEntries: KnowledgeEntry[] = [];
    for (const entry of picked) {
      try {
        await api.importKnowledgeOverviewCandidate({
          scope_type: scope,
          scope_id: scopeId,
          entry_id: entry.id,
          title: entry.title,
        });
        continue;
      } catch {
        fallbackEntries.push(entry);
      }
    }
    fallbackEntries.forEach((entry) => {
      const sourceType = knowledgeEntryCandidateSource(entry);
      bySource[sourceType].push({
        id: `${entry.id}-candidate`,
        source_type: sourceType,
        title: entry.title,
        summary: cleanSnippet(entry.summary_text || entry.content_preview || entry.content || "", 240),
        source_title: entry.title,
        source_url: extractFirstUrl(entry.content_preview || entry.content || ""),
        source_entry_id: entry.id,
        matched_card_id: "",
        target_block: "body",
        proposed_patch: entry.summary_text || entry.content_preview || entry.content || "",
      });
    });
    try {
      await Promise.all(
        (Object.entries(bySource) as Array<[OverviewCandidate["source_type"], OverviewCandidate[]]>)
          .filter(([, items]) => items.length > 0)
          .map(([sourceType, items]) => api.appendOverviewCandidates({
            scope_type: scope,
            scope_id: scopeId,
            source_type: sourceType,
            candidates: items,
          })),
      );
      setImportDialogScope("");
      setImportSelectionIds([]);
      setDeepWorkspaceView((current) => ({ ...current, [scope]: "review" }));
      if (scope === "sector") await loadSectorWorkbench(scopeId);
      else await loadStockWorkbench(scopeId);
      const importedCount = picked.length - fallbackEntries.length;
      if (fallbackEntries.length > 0 && importedCount > 0) {
        toast.success(`资料已加入未分类检查页：${importedCount} 条走结构化提取，${fallbackEntries.length} 条按普通候选导入`);
      } else if (fallbackEntries.length > 0) {
        toast.success("资料已加入未分类检查页");
      } else {
        toast.success(`资料已加入未分类检查页：${importedCount} 条已结构化导入`);
      }
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "资料导入失败");
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

  const loadSectorWorkbench = async (sector: string) => {
    if (!sector) {
      setSectorWorkbench(null);
      return;
    }
    try {
      const data = await api.overviewWorkbench("sector", sector);
      setSectorWorkbench(data);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "行业概览工作台加载失败");
    }
  };

  const loadStockWorkbench = async (ticker: string) => {
    if (!ticker) {
      setStockWorkbench(null);
      return;
    }
    try {
      const data = await api.overviewWorkbench("stock", ticker);
      setStockWorkbench(data);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "个股概览工作台加载失败");
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
  const stockCenterObjects = useMemo(
    () => orderedWatchStocks.filter((item) => ["SH", "SZ", "BJ", "HK", "US", "NASDAQ", "NYSE"].includes((item.market || "").toUpperCase())),
    [orderedWatchStocks],
  );
  const stockFocusBuckets = useMemo(
    () => stockFocusBucketDefs.map((bucket) => {
      const items = sortByStoredOrder(
        stockCenterObjects.filter((item) => (stockFocusMap[`${item.code}.${item.market}`] || stockFocusBucketDefs[0]?.id || "focus") === bucket.id),
        (item) => `${item.code}.${item.market}`,
        stockFocusOrders[bucket.id] || [],
        (item, index) => item.sort_order * 1000 + index,
      );
      return { ...bucket, items };
    }),
    [stockCenterObjects, stockFocusBucketDefs, stockFocusMap, stockFocusOrders],
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
  const selectedSectorNode = useMemo(
    () => orderedSectorTree.find((item) => item.name === selectedSector) || null,
    [orderedSectorTree, selectedSector],
  );
  const primarySectorGroups = useMemo(
    () => orderedSectorTree
      .filter((item) => !item.parent_id || item.level === 0)
      .map((item) => ({
        ...item,
        children: orderedSectorTree.filter((child) => child.parent_id === item.id),
      })),
    [orderedSectorTree],
  );
  const activePrimarySectorId = useMemo(() => {
    if (selectedSectorNode) return selectedSectorNode.parent_id || selectedSectorNode.id;
    return primarySectorGroups[0]?.id || "";
  }, [primarySectorGroups, selectedSectorNode]);
  const filteredPrimarySectorGroups = useMemo(() => {
    const keyword = sectorObjectQuery.trim().toLowerCase();
    if (!keyword) return primarySectorGroups;
    return primarySectorGroups
      .map((group) => {
        const primaryMatched = group.name.toLowerCase().includes(keyword);
        const children = primaryMatched
          ? group.children
          : group.children.filter((child) => child.name.toLowerCase().includes(keyword));
        if (primaryMatched || children.length > 0) return { ...group, children };
        return null;
      })
      .filter((item): item is (SectorTreeNode & { children: SectorTreeNode[] }) => Boolean(item));
  }, [primarySectorGroups, sectorObjectQuery]);
  const sectorResearchNotes = selectedSector ? stockEntries.filter((entry) => entry.type === "research_note" && entry.related_sectors.includes(selectedSector)) : [];
  const sectorMemos = selectedSector ? memoEntries.filter((entry) => entry.related_sectors.includes(selectedSector)) : [];
  const sectorWeekly = selectedSector ? weeklyEntries.filter((entry) => entry.related_sectors.includes(selectedSector)) : [];
  const sectorAttachments = selectedSector ? attachmentEntries.filter((entry) => entry.related_sectors.includes(selectedSector)) : [];
  const sectorManualAttachments = useMemo(() => sectorAttachments.filter(isManualLibraryAttachment), [sectorAttachments]);
  const sectorAutoReportUpdates = useMemo(() => buildTimeline(sectorAttachments.filter(isAutoReportAttachment)).slice(0, 6), [sectorAttachments]);
  const sectorTrackingComments = selectedSector ? stockEntries.filter((entry) => entry.type === "tracking_comment" && entry.related_sectors.includes(selectedSector)) : [];
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
  const stockManualAttachments = useMemo(() => (stockCenter?.attachments || []).filter(isManualLibraryAttachment), [stockCenter]);
  const stockAutoReportUpdates = useMemo(() => buildTimeline((stockCenter?.attachments || []).filter(isAutoReportAttachment)).slice(0, 6), [stockCenter]);
  const sectorImportSources = useMemo(
    () => buildTimeline([...sectorManualAttachments, ...sectorResearchNotes, ...sectorTrackingComments]),
    [sectorManualAttachments, sectorResearchNotes, sectorTrackingComments],
  );
  const stockImportSources = useMemo(
    () => buildTimeline([...(stockManualAttachments || []), ...(stockCenter?.research_notes || []), ...(stockCenter?.tracking_comments || [])]),
    [stockCenter, stockManualAttachments],
  );
  const stockTimeline = buildTimeline([
    ...stockProfiles,
    ...(stockCenter?.research_notes || []),
    ...(stockCenter?.tracking_comments || []),
    ...(stockCenter?.attachments || []),
    ...stockMemos,
    ...stockWeekly,
  ]);
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
  const sectorDraftBlocks = useMemo(
    () => (sectorWorkbench?.draft.modules?.length ? blocksFromDraftModules(sectorWorkbench.draft.modules as SectorModule[]) : sectorOverviewBlocks),
    [sectorOverviewBlocks, sectorWorkbench],
  );
  const stockDraftBlocks = useMemo(
    () => (stockWorkbench?.draft.modules?.length ? blocksFromDraftModules(stockWorkbench.draft.modules as StockModule[]) : stockOverviewBlocks),
    [stockOverviewBlocks, stockWorkbench],
  );
  const sectorDeepCards = useMemo(
    () => (sectorWorkbench?.deep_cards?.length ? sectorWorkbench.deep_cards : cardsFromBlocks(sectorOverviewBlocks)),
    [sectorOverviewBlocks, sectorWorkbench],
  );
  const stockDeepCards = useMemo(
    () => (stockWorkbench?.deep_cards?.length ? stockWorkbench.deep_cards : cardsFromBlocks(stockOverviewBlocks)),
    [stockOverviewBlocks, stockWorkbench],
  );
  const sectorCandidateGroups = useMemo(
    () => ({
      report: (sectorWorkbench?.candidates || []).filter((item) => item.source_type === "report"),
      attachment: (sectorWorkbench?.candidates || []).filter((item) => item.source_type === "attachment"),
      note: (sectorWorkbench?.candidates || []).filter((item) => item.source_type === "note"),
      expert_call: (sectorWorkbench?.candidates || []).filter((item) => item.source_type === "expert_call"),
    }),
    [sectorWorkbench],
  );
  const stockCandidateGroups = useMemo(
    () => ({
      report: (stockWorkbench?.candidates || []).filter((item) => item.source_type === "report"),
      attachment: (stockWorkbench?.candidates || []).filter((item) => item.source_type === "attachment"),
      note: (stockWorkbench?.candidates || []).filter((item) => item.source_type === "note"),
      expert_call: (stockWorkbench?.candidates || []).filter((item) => item.source_type === "expert_call"),
    }),
    [stockWorkbench],
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

  useEffect(() => {
    if (sectorCenterEditing) return;
    setEditingSectorNodeId("");
    setSectorNameDraft("");
  }, [sectorCenterEditing]);

  useEffect(() => {
    if (stockCenterEditing) return;
    setEditingStockTicker("");
    setStockNameDraft("");
  }, [stockCenterEditing]);

  const renderOverviewSourcePanel = (scope: "sector" | "stock") => {
    const sources = overviewSources[scope];
    const draft = overviewSourceDrafts[scope];
    const scopeLabel = scope === "sector" ? "行业概览" : "个股概览";
    return (
      <div className="rounded-xl border border-border/40 bg-black/10">
        <button
          onClick={() => setOverviewSourcePanels((current) => ({ ...current, [scope]: !current[scope] }))}
          className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left"
        >
          <div>
            <p className="text-sm font-medium">信息源接口</p>
            <p className="mt-1 text-xs text-muted-foreground">
              与投研资讯保持一致：这里只管理自动提取接口，不展示你手动投喂的资料；手动资料放在“附件投喂”。
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {sources.length} 个
            {overviewSourcePanels[scope] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </button>
        {overviewSourcePanels[scope] && (
          <div className="space-y-3 border-t border-border/30 px-3 py-3">
            <div className="space-y-2 rounded-lg border border-border/30 bg-muted/10 p-3">
              <p className="text-xs text-muted-foreground">新增信息源</p>
              <div className="grid gap-2 md:grid-cols-4">
                <input
                  value={draft.label}
                  onChange={(event) => setOverviewSourceDrafts((current) => ({ ...current, [scope]: { ...current[scope], label: event.target.value } }))}
                  placeholder="新增信息源名称"
                  className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
                />
                <select
                  value={draft.provider}
                  onChange={(event) => setOverviewSourceDrafts((current) => ({ ...current, [scope]: { ...current[scope], provider: event.target.value } }))}
                  className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
                >
                  <option value="api">API 接口占位</option>
                  <option value="eastmoney_report">东财研报接口</option>
                  <option value="alphaengine_placeholder">AlphaEngine 接口</option>
                  <option value="ifind_placeholder">iFind 接口占位</option>
                  <option value="rss">RSS 抓取源</option>
                </select>
                <input
                  value={draft.note}
                  onChange={(event) => setOverviewSourceDrafts((current) => ({ ...current, [scope]: { ...current[scope], note: event.target.value } }))}
                  placeholder="接口地址、平台名称或接入备注"
                  className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50 md:col-span-1"
                />
                <button onClick={() => addOverviewSource(scope)} className={primaryButtonClass}>
                  新增信息源接口
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">当前{scopeLabel}自动源</p>
              {sources.map((item) => (
                <div key={item.id} className="rounded-lg border border-border/30 bg-muted/20 px-3 py-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{item.label}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] ${item.enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                          {item.enabled ? "已启用" : "已停用"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{item.provider}</p>
                      <p className="mt-2 break-all text-xs text-muted-foreground">{item.note || "待接入"}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button onClick={() => toggleOverviewSource(scope, item.id)} className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-primary">
                        {item.enabled ? "停用" : "启用"}
                      </button>
                      {item.removable && (
                        <button onClick={() => removeOverviewSource(scope, item.id)} className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-primary">
                          删除
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderOverviewWorkbenchTabs = (
    tab: OverviewWorkbenchTab,
    setTab: (next: OverviewWorkbenchTab) => void,
    openMore: () => void,
  ) => (
    <div className="flex flex-wrap gap-2">
      {OVERVIEW_WORKBENCH_TABS.map((item) => (
        <button
          key={item.key}
          onClick={() => item.key === "more" ? openMore() : setTab(item.key)}
          className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${tab === item.key ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-primary"}`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );

  const renderOverviewMorePanel = (scope: "sector" | "stock", context: string) => {
    const isSector = scope === "sector";
    const title = isSector ? "行业概览更多操作" : "个股概览更多操作";
    const buildLoading = buildingOverview === scope;
    return (
      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">把低频动作收在这里，主界面只保留初稿、深度、待吸收三块高频内容。</p>
        </div>
        <div className="grid gap-2">
          <button
            onClick={() => void (isSector ? ingestSectorReports() : ingestMarketReports())}
            disabled={ingestingReports}
            className="flex items-center justify-between rounded-xl border border-border/40 bg-muted/20 px-4 py-3 text-left text-sm text-muted-foreground hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="inline-flex items-center gap-2">
              <FileSearch className="h-4 w-4" />
              提取研报
            </span>
            <span>{ingestingReports ? "提取中..." : "执行"}</span>
          </button>
          <button
            onClick={() => void (isSector ? buildSectorOverview() : buildStockOverview())}
            disabled={buildLoading}
            className={`${primaryButtonClass} flex items-center justify-between rounded-xl px-4 py-3 text-left`}
          >
            <span className="inline-flex items-center gap-2">
              <RefreshCw className={`h-4 w-4 ${buildLoading ? "animate-spin" : ""}`} />
              更新概览
            </span>
            <span>{buildLoading ? "更新中..." : "执行"}</span>
          </button>
          <button
            onClick={() => {
              setImportDialogScope(scope);
              setOverviewMoreDrawer("");
            }}
            className="flex items-center justify-between rounded-xl border border-border/40 bg-muted/20 px-4 py-3 text-left text-sm text-muted-foreground hover:text-primary"
          >
            <span>从多篇资料导入</span>
            <span>打开</span>
          </button>
          <button
            onClick={() => {
              if (scope === "sector") setSectorOverviewTab("deep");
              else setStockOverviewTab("deep");
              setDeepWorkspaceView((current) => ({ ...current, [scope]: "review" }));
              setOverviewMoreDrawer("");
            }}
            className="flex items-center justify-between rounded-xl border border-border/40 bg-muted/20 px-4 py-3 text-left text-sm text-muted-foreground hover:text-primary"
          >
            <span>未分类检查页</span>
            <span>打开</span>
          </button>
          <button
            onClick={() => void seedDeepCardsFromDraft(scope)}
            className="flex items-center justify-between rounded-xl border border-border/40 bg-muted/20 px-4 py-3 text-left text-sm text-muted-foreground hover:text-primary"
          >
            <span>从初稿生成深度卡片</span>
            <span>执行</span>
          </button>
        </div>
        <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
          <div className="mb-3">
            <p className="text-sm font-medium">生成报告</p>
            <p className="mt-1 text-xs text-muted-foreground">报告仍然保留，但不再单独占一个主 tab。</p>
          </div>
          {renderReportWorkbench(scope, context)}
        </div>
      </div>
    );
  };

  const renderOverviewStatsBar = (
    items: Array<{ label: string; value: string | number }>,
  ) => (
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

  const renderCompactNotice = (
    text: string,
    tone: "muted" | "primary" = "muted",
  ) => (
    <div className={`rounded-md border px-2.5 py-1.5 text-[11px] leading-4.5 ${
      tone === "primary"
        ? "border-primary/20 bg-primary/5 text-muted-foreground"
        : "border-border/30 bg-muted/15 text-muted-foreground"
    }`}>
      {text}
    </div>
  );

  const renderOverviewHintBar = (text: string) => renderCompactNotice(text);

  const primaryButtonClass = "rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60";
  const primaryButtonWideClass = "w-full rounded-lg bg-primary/15 px-4 py-2 text-sm font-medium text-primary shadow-glow hover:bg-primary/25 disabled:cursor-not-allowed disabled:opacity-60";
  const secondaryButtonClass = "rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-primary";
  const secondaryButtonWideClass = "inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-primary";
  const smallPrimaryButtonClass = "rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60";
  const smallSecondaryButtonClass = "rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-primary";
  const subtleTextButtonClass = "text-xs text-muted-foreground hover:text-primary";
  const destructiveTextButtonClass = "text-xs text-muted-foreground hover:text-destructive";

  const jumpToPreviewSection = (sectionId: string) => {
    setActiveOutlineBlockId(sectionId);
    requestAnimationFrame(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const structuredEditorKey = (scope: "sector" | "stock", density: "draft" | "deep") => `${scope}:${density}`;

  const openStructuredEdit = (scope: "sector" | "stock", density: "draft" | "deep", blocks: StructuredRenderBlock[]) => {
    const key = structuredEditorKey(scope, density);
    setStructuredEditorDrafts((current) => ({
      ...current,
      [key]: JSON.parse(JSON.stringify(blocks || [])) as StructuredRenderBlock[],
    }));
  };

  const cancelStructuredEdit = (scope: "sector" | "stock", density: "draft" | "deep") => {
    const key = structuredEditorKey(scope, density);
    setStructuredEditorDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const saveStructuredEdit = async (scope: "sector" | "stock", density: "draft" | "deep") => {
    const scopeId = scope === "sector" ? selectedSector : selectedTicker;
    const workbench = scope === "sector" ? sectorWorkbench : stockWorkbench;
    const key = structuredEditorKey(scope, density);
    const editedBlocks = structuredEditorDrafts[key] || [];
    if (!scopeId || !workbench) return;
    setStructuredEditorSaving((current) => ({ ...current, [key]: true }));
    try {
      const refreshed = await api.saveOverviewStructuredPreview({
        scope_type: scope,
        scope_id: scopeId,
        draft_blocks: density === "draft" ? editedBlocks : (workbench.draft_structured_blocks || []),
        deep_blocks: density === "deep" ? editedBlocks : (workbench.deep_structured_blocks || []),
      });
      if (scope === "sector") setSectorWorkbench(refreshed);
      else setStockWorkbench(refreshed);
      cancelStructuredEdit(scope, density);
      toast.success("正文已保存");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "正文保存失败");
    } finally {
      setStructuredEditorSaving((current) => ({ ...current, [key]: false }));
    }
  };

  const renderPreviewSectionDirectory = (nodes: NotebookHeadingNode[]): ReactNode => (
    <div className="space-y-0.5">
      {nodes.map((node) => {
        const collapsed = collapsedOutlineSections[node.id] ?? false;
        return (
          <div key={node.id} className="space-y-1">
            <button
              onClick={() => jumpToPreviewSection(node.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                activeOutlineBlockId === node.id ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
              )}
              style={{ paddingLeft: `${8 + (node.level - 1) * 14}px` }}
            >
              {node.level === 1 && node.children.length > 0 ? (
                <span
                  onClick={(event) => {
                    event.stopPropagation();
                    setCollapsedOutlineSections((current) => ({ ...current, [node.id]: !collapsed }));
                  }}
                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground"
                >
                  {collapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
                </span>
              ) : (
                <span className="inline-flex h-4 w-4 shrink-0" />
              )}
              <span className={cn("min-w-0 truncate", node.level === 1 ? "text-[13px] font-medium" : node.level === 2 ? "text-[12px]" : "text-[11px]")}>{node.text}</span>
            </button>
            {(!(node.level === 1 && collapsed)) && node.children.length > 0 && renderPreviewSectionDirectory(node.children)}
          </div>
        );
      })}
    </div>
  );

  const renderOverviewPreviewShell = (
    markdown: string,
    mode: OverviewPreviewMode,
    options?: {
      compact?: boolean;
      placeholder?: string;
      leftTitle?: string;
      rightTitle?: string;
      recentVersions?: OverviewWorkbench["versions"];
    },
  ) => {
    const headingTree = markdownHeadings(markdown);
    return (
      <div className="rounded-xl border border-border/30 bg-black/10 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">{options?.rightTitle || "核心内容预览"}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {mode === "enhanced-note" ? "已按笔记结构自动整理排版，保留目录和段落层次。" : "这里展示当前概览正文。"}
            </p>
          </div>
          {headingTree.length > 0 && (
            <span className="rounded-full border border-border/20 bg-black/10 px-2.5 py-1 text-[11px] text-muted-foreground">
              目录 {headingTree.length}
            </span>
          )}
        </div>
        <div className={cn("gap-3", headingTree.length > 0 ? "grid lg:grid-cols-[210px_minmax(0,1fr)]" : "block")}>
          {headingTree.length > 0 && (
            <div className="rounded-xl border border-border/20 bg-black/12 p-2.5 lg:sticky lg:top-3 lg:self-start">
              <div className="mb-2 flex items-center gap-2 border-b border-border/20 px-1 pb-2">
                <FileSearch className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">{options?.leftTitle || "目录"}</p>
              </div>
              <div className="max-h-[520px] overflow-y-auto pr-1">
                {renderPreviewSectionDirectory(headingTree)}
              </div>
            </div>
          )}
          <div className="space-y-3">
            {!markdown.trim() ? (
              renderCompactNotice(options?.placeholder || "当前还没有可展示内容。")
            ) : (
              <OverviewMarkdownRenderer
                markdown={markdown}
                mode={mode}
                headingTree={headingTree}
                compact={options?.compact}
              />
            )}
          </div>
        </div>
        {(options?.recentVersions || []).length > 0 && (
          <div className="mt-3 space-y-2 border-t border-border/20 pt-3">
            {(options?.recentVersions || []).slice(0, 3).map((item) => (
              <div key={item.version_id} className="rounded-lg bg-black/10 px-3 py-2 text-[11px] text-muted-foreground">
                {item.created_at.slice(0, 10)} · {overviewCandidateSourceLabel(item.source_type)} · {item.change_summary || item.source_title}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderStructuredOverviewShell = (
    blocks: StructuredRenderBlock[],
    options?: {
      scope: "sector" | "stock";
      density?: "draft" | "deep";
      placeholder?: string;
      leftTitle?: string;
      rightTitle?: string;
      recentVersions?: OverviewWorkbench["versions"];
    },
  ) => {
    const safeBlocks = (blocks || []).filter(Boolean);
    const scope = options?.scope || "stock";
    const density = options?.density || "deep";
    const editorKey = structuredEditorKey(scope, density);
    const editing = Array.isArray(structuredEditorDrafts[editorKey]);
    const displayBlocks = editing ? structuredEditorDrafts[editorKey] : safeBlocks;
    return (
      <div className="rounded-xl border border-border/30 bg-black/10 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">{options?.rightTitle || "结构化预览"}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">当前已优先展示结构化内容块，便于后续流程图、表格、产业链图统一渲染。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {displayBlocks.length > 0 && (
              <span className="rounded-full border border-border/20 bg-black/10 px-2.5 py-1 text-[11px] text-muted-foreground">
                结构块 {displayBlocks.length}
              </span>
            )}
            {safeBlocks.length > 0 && !editing && (
              <button onClick={() => openStructuredEdit(scope, density, safeBlocks)} className={smallSecondaryButtonClass}>编辑正文</button>
            )}
            {editing && (
              <>
                <button onClick={() => void saveStructuredEdit(scope, density)} disabled={structuredEditorSaving[editorKey]} className={smallPrimaryButtonClass}>
                  {structuredEditorSaving[editorKey] ? "保存中..." : "保存正文"}
                </button>
                <button onClick={() => cancelStructuredEdit(scope, density)} className={smallSecondaryButtonClass}>取消编辑</button>
              </>
            )}
          </div>
        </div>
        <div className={cn("gap-3", displayBlocks.length > 0 ? "grid lg:grid-cols-[210px_minmax(0,1fr)]" : "block")}>
          {displayBlocks.length > 0 && (
            <StructuredOverviewSidebar
              blocks={displayBlocks}
              activeId={activeOutlineBlockId}
              onJump={(id) => {
                setActiveOutlineBlockId(id);
                requestAnimationFrame(() => {
                  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                });
              }}
              title={options?.leftTitle || "目录"}
            />
          )}
          <div className="space-y-3">
            {displayBlocks.length === 0 ? (
              renderCompactNotice(options?.placeholder || "当前还没有可展示的结构化内容。")
            ) : (
              <StructuredOverviewRenderer
                blocks={displayBlocks}
                density={density}
                editable={editing}
                onBlocksChange={(nextBlocks) => setStructuredEditorDrafts((current) => ({ ...current, [editorKey]: nextBlocks }))}
              />
            )}
          </div>
        </div>
        {(options?.recentVersions || []).length > 0 && (
          <div className="mt-3 space-y-2 border-t border-border/20 pt-3">
            {(options?.recentVersions || []).slice(0, 3).map((item) => (
              <div key={item.version_id} className="rounded-lg bg-black/10 px-3 py-2 text-[11px] text-muted-foreground">
                {item.created_at.slice(0, 10)} · {overviewCandidateSourceLabel(item.source_type)} · {item.change_summary || item.source_title}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const updateDraftOutline = (
    draftKey: string,
    draft: DeepCardEditDraft,
    updater: (blocks: OverviewContentBlock[]) => OverviewContentBlock[],
  ) => {
    const nextBlocks = updater(draft.content_blocks || []);
    const legacy = contentBlocksToLegacy(nextBlocks);
    setDeepCardEdits((current) => ({
      ...current,
      [draftKey]: {
        ...draft,
        content_blocks: nextBlocks,
        body: legacy.body,
        image_blocks: legacy.image_blocks,
        chart_blocks: legacy.chart_blocks,
        source_blocks: legacy.source_blocks,
        preview_text: current[draftKey]?.preview_text || previewFromContentBlocks(nextBlocks),
      },
    }));
  };

  const renderOutlineBlock = (
    draftKey: string,
    draft: DeepCardEditDraft,
    block: OverviewContentBlock,
    path: number[],
    editable: boolean,
  ): ReactNode => {
    const blockTypeLabel = {
      section: "章节",
      text: "正文",
      image: "图片",
      chart: "图表",
      source: "来源",
    }[block.type];
    const sectionNumber = buildSectionNumber(path);
    const isSectionCollapsed = collapsedOutlineSections[block.id] ?? false;
    const isActive = editable && activeOutlineBlockId === block.id;
    const addChild = (type: OverviewContentBlock["type"]) => {
      updateDraftOutline(draftKey, draft, (items) => appendChildContentBlock(items, block.id, makeContentBlock(type)));
    };
    const editorTitleClass = "w-full border-0 bg-transparent px-0 py-1 text-base font-semibold outline-none placeholder:text-muted-foreground/50 focus:ring-0";
    const editorFieldClass = "w-full border-0 bg-transparent px-0 py-1 text-sm outline-none placeholder:text-muted-foreground/50 focus:ring-0";
    const editorTextareaClass = "w-full border-0 bg-transparent px-0 py-1 text-sm outline-none placeholder:text-muted-foreground/50 focus:ring-0";
    const insertSibling = (type: OverviewContentBlock["type"]) => {
      updateDraftOutline(draftKey, draft, (items) => insertSiblingContentBlock(items, block.id, "after", makeContentBlock(type)));
    };
    const insertOptions: Array<{ type: OverviewContentBlock["type"]; label: string }> = [
      { type: "section", label: "章节" },
      { type: "text", label: "正文" },
      { type: "image", label: "图片" },
      { type: "chart", label: "图表" },
      { type: "source", label: "来源" },
    ];
    return (
      <div
        id={outlineDomId(block.id)}
        key={block.id}
        data-outline-section={block.type === "section" ? "true" : "false"}
        data-outline-section-id={block.type === "section" ? block.id : undefined}
        draggable={editable}
        onClick={() => {
          if (!editable) return;
          setActiveOutlineBlockId(block.id);
        }}
        onDragStart={() => {
          if (!editable) return;
          setDraggingOutlineBlockId(block.id);
          setDragOverOutlineBlockId(block.id);
          setActiveOutlineBlockId(block.id);
        }}
        onDragOver={(event) => {
          if (!editable) return;
          event.preventDefault();
          if (dragOverOutlineBlockId !== block.id) setDragOverOutlineBlockId(block.id);
        }}
        onDragLeave={() => {
          if (!editable) return;
          if (dragOverOutlineBlockId === block.id) setDragOverOutlineBlockId("");
        }}
        onDrop={(event) => {
          if (!editable) return;
          event.preventDefault();
          if (!draggingOutlineBlockId || draggingOutlineBlockId === block.id) {
            setDraggingOutlineBlockId("");
            setDragOverOutlineBlockId("");
            return;
          }
          updateDraftOutline(draftKey, draft, (items) => reorderContentBlockTree(items, draggingOutlineBlockId, block.id));
          setDraggingOutlineBlockId("");
          setDragOverOutlineBlockId("");
        }}
        onDragEnd={() => {
          if (!editable) return;
          setDraggingOutlineBlockId("");
          setDragOverOutlineBlockId("");
        }}
        className={cn(
          editable
            ? "space-y-2 rounded-none border-0 bg-transparent px-0 py-1 transition-colors"
            : "space-y-2 rounded-lg border border-border/20 bg-black/10 p-3 transition-colors",
          editable && isActive && "border-l-2 border-l-primary bg-primary/4 pl-3",
          !editable && isActive && "border-primary/45 bg-primary/5",
          dragOverOutlineBlockId === block.id && draggingOutlineBlockId !== block.id && "border-primary/70 ring-1 ring-primary/40",
          draggingOutlineBlockId === block.id && "opacity-60",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {block.type === "section" && (
              <>
                <button
                  onClick={() => setCollapsedOutlineSections((current) => ({ ...current, [block.id]: !isSectionCollapsed }))}
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/40 text-muted-foreground hover:text-primary"
                >
                  {isSectionCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                </button>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{sectionNumber}</span>
              </>
            )}
            <span className="text-[11px] text-muted-foreground">{blockTypeLabel}</span>
          </div>
          {editable && isActive && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="cursor-grab text-muted-foreground active:cursor-grabbing">
                <GripVertical className="h-3.5 w-3.5" />
              </span>
              <button onClick={() => updateDraftOutline(draftKey, draft, (items) => duplicateContentBlockTree(items, block.id))} className={subtleTextButtonClass}>复制</button>
              <button onClick={() => updateDraftOutline(draftKey, draft, (items) => moveContentBlockWithinTree(items, block.id, "up"))} className={subtleTextButtonClass}>上移</button>
              <button onClick={() => updateDraftOutline(draftKey, draft, (items) => moveContentBlockWithinTree(items, block.id, "down"))} className={subtleTextButtonClass}>下移</button>
              <button onClick={() => updateDraftOutline(draftKey, draft, (items) => removeContentBlockTree(items, block.id))} className={destructiveTextButtonClass}>删除</button>
            </div>
          )}
        </div>

        {editable && isActive && (
          <div className="rounded-md border border-border/20 bg-black/10 px-2.5 py-2">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span>新增同级</span>
              {insertOptions.map((option) => (
                <button key={`after-${block.id}-${option.type}`} onClick={() => insertSibling(option.type)} className={subtleTextButtonClass}>
                  +{option.label}
                </button>
              ))}
            </div>
            {block.type === "section" && (
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span>新增子级</span>
                {insertOptions.map((option) => (
                  <button key={`child-${block.id}-${option.type}`} onClick={() => addChild(option.type)} className={subtleTextButtonClass}>
                    +{option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {block.type === "section" && (
          <>
            {editable ? (
              <input
                value={block.title || ""}
                onChange={(event) => updateDraftOutline(draftKey, draft, (items) => updateContentBlockTree(items, block.id, (current) => ({ ...current, title: event.target.value })))}
                placeholder="章节标题：市场规模与需求 / 竞争格局 / 供给约束"
                className={editorTitleClass}
              />
            ) : (
              <p className="text-sm font-medium text-foreground">{sectionNumber} {block.title || "未命名章节"}</p>
            )}
            {!isSectionCollapsed && (
              <div className={cn("space-y-2 pl-3", editable ? "border-l border-border/15" : "border-l border-border/30")}>
              {(block.children || []).length === 0 ? (
                renderCompactNotice("这个层级还没有内容。你可以直接在当前层级下插正文、图片、图表、来源，也可以继续新增子章节。")
              ) : (
                (() => {
                  let sectionIndex = 0;
                  return (block.children || []).map((child) => {
                    if (child.type === "section") {
                      sectionIndex += 1;
                      return renderOutlineBlock(draftKey, draft, child, [...path, sectionIndex], editable);
                    }
                    return renderOutlineBlock(draftKey, draft, child, path, editable);
                  });
                })()
              )}
              </div>
            )}
          </>
        )}

        {block.type === "text" && (editable ? (
          <RichTextEditor
            value={block.text || ""}
            onChange={(next) => updateDraftOutline(draftKey, draft, (items) => updateContentBlockTree(items, block.id, (current) => ({ ...current, text: next })))}
            placeholder="这里写正文。你可以在一个章节下连续插入多段正文，再穿插图片和图表。"
          />
        ) : (
          <div
            className="prose prose-invert max-w-none text-sm prose-headings:mb-2 prose-headings:mt-4 prose-p:my-2 prose-li:my-1 prose-ul:my-2 prose-ol:my-2 prose-a:text-primary"
            dangerouslySetInnerHTML={{ __html: (block.text || "").trim() || "<p class='text-muted-foreground'>这段正文还没有内容。</p>" }}
          />
        ))}

        {block.type === "image" && (
          <div className="space-y-2">
            {editable ? (
              <>
                <input value={block.title || ""} onChange={(event) => updateDraftOutline(draftKey, draft, (items) => updateContentBlockTree(items, block.id, (current) => ({ ...current, title: event.target.value })))} placeholder="图片标题" className={editorFieldClass} />
                <input value={block.image_url || ""} onChange={(event) => updateDraftOutline(draftKey, draft, (items) => updateContentBlockTree(items, block.id, (current) => ({ ...current, image_url: event.target.value })))} placeholder="图片地址或本地映射路径" className={editorFieldClass} />
                <AutoResizeTextarea value={block.caption || ""} onChange={(event) => updateDraftOutline(draftKey, draft, (items) => updateContentBlockTree(items, block.id, (current) => ({ ...current, caption: event.target.value })))} placeholder="图注或备注" className={editorTextareaClass} />
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    void fileToB64(file).then((dataUrl) => {
                      updateDraftOutline(draftKey, draft, (items) => updateContentBlockTree(items, block.id, (current) => ({ ...current, image_url: dataUrl })));
                    });
                    event.currentTarget.value = "";
                  }}
                  className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border/30 file:bg-black/10 file:px-3 file:py-2 file:text-xs file:text-muted-foreground"
                />
              </>
            ) : (
              <>
                {block.title && <p className="text-sm font-medium">{block.title}</p>}
                <div className="overflow-hidden rounded-lg border border-border/20 bg-black/20 p-2">
                  {block.image_url ? <img src={block.image_url} alt={block.title || "图片"} className="w-full rounded-md object-contain" /> : <div className="px-3 py-8 text-center text-xs text-muted-foreground">图片地址待补充</div>}
                </div>
                {block.caption && <p className="text-xs text-muted-foreground">{block.caption}</p>}
              </>
            )}
          </div>
        )}

        {block.type === "chart" && (
          editable ? (
            <div className="space-y-2">
              <input value={block.title || ""} onChange={(event) => updateDraftOutline(draftKey, draft, (items) => updateContentBlockTree(items, block.id, (current) => ({ ...current, title: event.target.value })))} placeholder="图表标题" className={editorFieldClass} />
              <input value={String(block.spec?.metric_key || "")} onChange={(event) => updateDraftOutline(draftKey, draft, (items) => updateContentBlockTree(items, block.id, (current) => ({ ...current, spec: { ...(current.spec || {}), metric_key: event.target.value } })))} placeholder="数据库指标 key / ifind 指标编码" className={editorFieldClass} />
              <AutoResizeTextarea value={block.note || String(block.spec?.note || "")} onChange={(event) => updateDraftOutline(draftKey, draft, (items) => updateContentBlockTree(items, block.id, (current) => ({ ...current, note: event.target.value, spec: { ...(current.spec || {}), note: event.target.value } })))} placeholder="图表说明 / 更新规则备注" className={editorTextareaClass} />
            </div>
          ) : (
            <VisualPreview
              title={block.title || "图表块"}
              subtitle={block.note || String(block.spec?.note || "后续这里会接数据库自动更新图表，并自动产生变更留痕。")}
              chartKind="line"
              image={null}
            />
          )
        )}

        {block.type === "source" && (
          editable ? (
            <div className="space-y-2">
              <input value={block.title || ""} onChange={(event) => updateDraftOutline(draftKey, draft, (items) => updateContentBlockTree(items, block.id, (current) => ({ ...current, title: event.target.value })))} placeholder="来源标题" className={editorFieldClass} />
              <input value={block.url || ""} onChange={(event) => updateDraftOutline(draftKey, draft, (items) => updateContentBlockTree(items, block.id, (current) => ({ ...current, url: event.target.value })))} placeholder="来源链接" className={editorFieldClass} />
              <AutoResizeTextarea value={block.note || ""} onChange={(event) => updateDraftOutline(draftKey, draft, (items) => updateContentBlockTree(items, block.id, (current) => ({ ...current, note: event.target.value })))} placeholder="来源备注" className={editorTextareaClass} />
            </div>
          ) : (
            <div className="rounded-lg bg-black/10 px-3 py-2.5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{block.title || "未命名来源"}</p>
                {block.url && <a href={block.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">打开链接</a>}
              </div>
              {block.note && <p className="mt-1 text-xs text-muted-foreground">{block.note}</p>}
            </div>
          )
        )}
      </div>
    );
  };

  const renderDeepCards = (
    scope: "sector" | "stock",
    cards: OverviewDeepCard[],
    versions: OverviewWorkbench["versions"],
    candidates: OverviewCandidate[],
  ) => {
    if (deepWorkspaceView[scope] === "review") {
      return (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">概览框架</p>
            <p className="mt-1 text-[11px] text-muted-foreground">前台已收口成单篇框架，待吸收资料仍先进入检查页和候选池。</p>
          </div>
          {renderUnclassifiedReview(scope, cards, scope === "sector" ? sectorWorkbench : stockWorkbench)}
        </div>
      );
    }
    const scopeId = scope === "sector" ? selectedSector : selectedTicker;
    const binding = (scope === "sector" ? sectorWorkbench?.editor_binding : stockWorkbench?.editor_binding) || {} as OverviewEditorBinding;
    const expectedYoudaoTitle = `${scopeId}${scope === "sector" ? " 行业概览.md" : " 个股概览.md"}`;
    const previewSource = binding.content || overviewCardsToMarkdown(scope === "sector" ? selectedSector || "行业" : selectedTicker || "个股", cards);
    const normalizedPreview = normalizeOverviewPreviewContent(previewSource, binding.title || "");
    const noteMarkdown = normalizedPreview.markdown;
    const pendingCount = candidates.filter((item) => item.status !== "accepted" && item.status !== "ignored").length;
    const recentVersions = versions.slice(0, 8);
    const statusBits = [
      binding.file_id ? `已绑定：${binding.title || binding.file_id}` : "未绑定有道框架",
      binding.last_synced_at ? `同步 ${binding.last_synced_at.slice(5, 16).replace("T", " ")}` : "",
      normalizedPreview.mode === "enhanced-note" ? "增强阅读" : "",
      pendingCount > 0 ? `待吸收 ${pendingCount}` : "",
      recentVersions.length > 0 ? `留痕 ${recentVersions.length}` : "",
    ].filter(Boolean);

    const bindOrCreateYoudao = async () => {
      if (!scopeId) return;
      const nextOpen = !youdaoBindAssistOpen[scope];
      setYoudaoBindAssistOpen((current) => ({ ...current, [scope]: nextOpen }));
      if (nextOpen) {
        setYoudaoSearchDrafts((current) => ({ ...current, [scope]: "" }));
      }
    };

    const searchYoudaoCandidates = async (keyword?: string) => {
      const q = (keyword ?? youdaoSearchDrafts[scope] ?? expectedYoudaoTitle).trim();
      if (!q) {
        toast.error("请先输入笔记标题");
        return;
      }
      setYoudaoSearchLoading((current) => ({ ...current, [scope]: true }));
      try {
        const items = await api.searchYoudaoNotes(q);
        const ranked = [...items].sort((a, b) => {
          const aExact = a.title === expectedYoudaoTitle ? 1 : 0;
          const bExact = b.title === expectedYoudaoTitle ? 1 : 0;
          return bExact - aExact;
        });
        setYoudaoSearchResults((current) => ({ ...current, [scope]: ranked }));
        setYoudaoBindAssistOpen((current) => ({ ...current, [scope]: true }));
        if (ranked.length > 0) toast.success(`已找到 ${ranked.length} 条候选笔记`);
        else toast.error("还没有搜到候选笔记，请先在有道里新建后再试");
      } catch (error) {
        toast.error(error instanceof ApiError ? error.message : "搜索有道笔记失败");
      } finally {
        setYoudaoSearchLoading((current) => ({ ...current, [scope]: false }));
      }
    };

    const bindYoudaoCandidate = async (item: YoudaoNoteCandidate) => {
      if (!scopeId) return;
      try {
        await api.bindOverviewEditor({
          scope_type: scope,
          scope_id: scopeId,
          provider: "youdao",
          file_id: item.file_id,
          title: item.title,
          parent_id: "",
          content: "",
        });
        const synced = await api.syncOverviewEditor({ scope_type: scope, scope_id: scopeId });
        if (scope === "sector") setSectorWorkbench((current) => current ? { ...current, editor_binding: synced } : current);
        else setStockWorkbench((current) => current ? { ...current, editor_binding: synced } : current);
        setYoudaoBindAssistOpen((current) => ({ ...current, [scope]: false }));
        toast.success("已绑定并从有道提取最新内容");
      } catch (error) {
        toast.error(error instanceof ApiError ? error.message : "绑定有道笔记失败");
      }
    };

    const syncFromYoudao = async () => {
      if (!scopeId) return;
      try {
        const synced = await api.syncOverviewEditor({ scope_type: scope, scope_id: scopeId });
        if (scope === "sector") setSectorWorkbench((current) => current ? { ...current, editor_binding: synced } : current);
        else setStockWorkbench((current) => current ? { ...current, editor_binding: synced } : current);
        if (!synced.file_id) toast.error(synced.message || "已检测到有道框架失效");
        else toast.success(synced.message || "已同步有道笔记最新内容");
      } catch (error) {
        toast.error(error instanceof ApiError ? error.message : "同步有道笔记失败");
      }
    };

    const pushToYoudao = async () => {
      if (!scopeId || !binding.file_id) return;
      try {
        const pushed = await api.pushOverviewEditor({
          scope_type: scope,
          scope_id: scopeId,
          provider: "youdao",
          file_id: binding.file_id,
          title: binding.title || `${scopeId}${scope === "sector" ? " 行业概览.md" : " 个股概览.md"}`,
          parent_id: binding.parent_id || "",
          content: previewSource,
        });
        if (scope === "sector") setSectorWorkbench((current) => current ? { ...current, editor_binding: pushed } : current);
        else setStockWorkbench((current) => current ? { ...current, editor_binding: pushed } : current);
        toast.success("已把当前核心内容推送到有道");
      } catch (error) {
        toast.error(error instanceof ApiError ? error.message : "推送到有道失败");
      }
    };

    const openYoudaoApp = async () => {
      try {
        const result = await api.openYoudaoApp(binding.file_id || "");
        toast.success(result.message || "已打开有道云笔记");
      } catch (error) {
        toast.error(error instanceof ApiError ? error.message : "打开有道云笔记失败");
      }
    };

    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-border/40 bg-muted/20 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{scope === "sector" ? `${selectedSector || "行业"}概览框架` : `${selectedTicker || "个股"}概览框架`}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                {statusBits.map((bit) => (
                  <span key={bit} className="rounded-full border border-border/20 bg-black/10 px-2.5 py-1">
                    {bit}
                  </span>
                ))}
              </div>
              {!binding.file_id && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  直接搜索并绑定你已经在有道云中创建好的笔记。
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {!binding.file_id ? (
                <button onClick={() => void bindOrCreateYoudao()} className={smallPrimaryButtonClass}>
                  {youdaoBindAssistOpen[scope] ? "收起搜索笔记" : "绑定有道框架"}
                </button>
              ) : (
                <>
                  <button onClick={() => void syncFromYoudao()} className={smallPrimaryButtonClass}>从有道提取</button>
                  <button onClick={() => void pushToYoudao()} className={smallSecondaryButtonClass}>推送至有道</button>
                  <button onClick={() => void openYoudaoApp()} className={smallSecondaryButtonClass}>打开有道云</button>
                  <button onClick={() => { void navigator.clipboard.writeText(binding.file_id || ""); toast.success("已复制有道 noteId"); }} className={smallSecondaryButtonClass}>复制 noteId</button>
                </>
              )}
            </div>
          </div>

          {!binding.file_id && youdaoBindAssistOpen[scope] && (
            <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">搜索笔记</p>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  value={youdaoSearchDrafts[scope] || ""}
                  onChange={(event) => setYoudaoSearchDrafts((current) => ({ ...current, [scope]: event.target.value }))}
                  placeholder="输入笔记标题关键词"
                  className="h-10 min-w-[280px] flex-1 rounded-full border border-border/30 bg-black/10 px-4 text-sm text-foreground outline-none placeholder:text-muted-foreground/45"
                />
                <button onClick={() => void searchYoudaoCandidates()} className={smallSecondaryButtonClass}>
                  {youdaoSearchLoading[scope] ? "搜索中..." : "搜索笔记"}
                </button>
              </div>
              <div className="mt-3 space-y-2">
                {(youdaoSearchResults[scope] || []).map((item) => (
                  <div key={item.file_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/20 bg-black/10 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{item.file_id}</p>
                    </div>
                    <button onClick={() => void bindYoudaoCandidate(item)} className={smallPrimaryButtonClass}>绑定这篇</button>
                  </div>
                ))}
                {!youdaoSearchLoading[scope] && (youdaoSearchResults[scope] || []).length === 0 && (
                  <div className="rounded-xl border border-dashed border-border/20 px-3 py-4 text-[11px] text-muted-foreground">
                    还没有搜索结果。你可以先去有道云新建笔记，再回来搜索绑定。
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="mt-3">
            {((scope === "sector" ? sectorWorkbench?.deep_structured_blocks : stockWorkbench?.deep_structured_blocks) || []).length > 0
              ? renderStructuredOverviewShell((scope === "sector" ? sectorWorkbench?.deep_structured_blocks : stockWorkbench?.deep_structured_blocks) || [], {
                  scope,
                  density: "deep",
                  leftTitle: "深度目录",
                  rightTitle: "深度预览",
                  placeholder: "这篇框架还没有结构化内容。",
                  recentVersions,
                })
              : renderOverviewPreviewShell(noteMarkdown, normalizedPreview.mode, {
                  placeholder: "这篇框架还没有内容。你可以先在有道里写，再回来提取。",
                  recentVersions,
                })}
          </div>
        </div>
      </div>
    );
  };

  const renderCandidateGroups = (scope: "sector" | "stock", groups: Record<"report" | "attachment" | "note" | "expert_call", OverviewCandidate[]>) => (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">待吸收候选池</p>
        <p className="mt-1 text-[11px] text-muted-foreground">先看摘要，再决定快速吸收或展开对比。</p>
      </div>
      {(["report", "attachment", "note", "expert_call"] as const).map((sourceType) => (
        <div key={sourceType} className="rounded-xl border border-border/40 bg-muted/20 p-3">
          <button
            onClick={() => setCandidatePanels((current) => ({ ...current, [`${scope}:${sourceType}`]: !current[`${scope}:${sourceType}`] }))}
            className="mb-2 flex w-full items-center justify-between gap-2 text-left"
          >
            <div className="flex items-center gap-2">
              <p className="font-medium">{overviewCandidateSourceLabel(sourceType)}</p>
              <span className="rounded-full bg-black/10 px-2 py-0.5 text-[11px] text-muted-foreground">{groups[sourceType].length} 条</span>
            </div>
            {candidatePanels[`${scope}:${sourceType}`] ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          {candidatePanels[`${scope}:${sourceType}`] && (
            <div className="space-y-2">
              {groups[sourceType].length === 0 ? (
                renderCompactNotice("当前还没有这类候选项。")
              ) : (
                groups[sourceType].map((item) => (
                  <div key={item.id} className="rounded-lg bg-black/10 px-3 py-2.5 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{item.title}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">命中卡片：{item.matched_card_id || "待匹配"} · 状态：{item.status || "pending"}</p>
                        <p className="mt-1.5 text-[11px] text-muted-foreground">{compactPreview(item.summary || item.proposed_patch)}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          onClick={() => void quickApplyCandidate(scope, item, "append")}
                          className={primaryButtonClass}
                        >
                          快速吸收
                        </button>
                        <button
                          onClick={() => openCandidateCompare(scope, item)}
                          className={secondaryButtonClass}
                        >
                          对比
                        </button>
                        <button
                          onClick={() => void quickApplyCandidate(scope, item, "ignore")}
                          className={subtleTextButtonClass}
                        >
                          忽略
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const renderUnclassifiedReview = (scope: "sector" | "stock", cards: OverviewDeepCard[], workbench: OverviewWorkbench | null) => {
    const items = (workbench?.candidates || []).filter((item) => !item.matched_card_id);
    const saveAssignments = async () => {
      const scopeId = scope === "sector" ? selectedSector : selectedTicker;
      if (!scopeId || items.length === 0) return;
      const updated = items.map((item) => {
        const assignment = unclassifiedAssignments[item.id] || { cardId: cards[0]?.id || "", targetBlock: "body" as const };
        return {
          ...item,
          matched_card_id: assignment.cardId,
          target_block: assignment.targetBlock,
        };
      });
      try {
        const bySource = {
          report: updated.filter((item) => item.source_type === "report"),
          attachment: updated.filter((item) => item.source_type === "attachment"),
          note: updated.filter((item) => item.source_type === "note"),
          expert_call: updated.filter((item) => item.source_type === "expert_call"),
        };
        await Promise.all(
          (Object.entries(bySource) as Array<[OverviewCandidate["source_type"], OverviewCandidate[]]>)
            .filter(([, candidates]) => candidates.length > 0)
            .map(([sourceType, candidates]) =>
              api.appendOverviewCandidates({
                scope_type: scope,
                scope_id: scopeId,
                source_type: sourceType,
                candidates,
              })),
        );
        setDeepWorkspaceView((current) => ({ ...current, [scope]: "cards" }));
        if (scope === "sector") await loadSectorWorkbench(scopeId);
        else await loadStockWorkbench(scopeId);
        toast.success("未分类资料已批量分发到对应卡片候选池");
      } catch (error) {
        toast.error(error instanceof ApiError ? error.message : "批量分发失败");
      }
    };
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">未分类检查页</p>
            <p className="mt-1 text-xs text-muted-foreground">先检查这批资料该挂到哪张深度卡片，再批量分发到对应候选池。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setDeepWorkspaceView((current) => ({ ...current, [scope]: "cards" }))} className={secondaryButtonClass}>返回深度卡片</button>
            <button onClick={() => void saveAssignments()} className={primaryButtonClass}>按当前设置批量分发</button>
          </div>
        </div>
          {items.length === 0 ? (
            renderCompactNotice("当前没有未分类候选。你可以先从附件、纪要、有道云笔记等资料里批量导入。")
          ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const assignment = unclassifiedAssignments[item.id] || { cardId: cards[0]?.id || "", targetBlock: "body" as const };
              return (
                <div key={item.id} className="rounded-xl border border-border/40 bg-muted/20 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{item.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{overviewCandidateSourceLabel(item.source_type)} · {item.source_title || "未命名来源"}</p>
                    </div>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{item.summary || item.proposed_patch || "暂无预览内容。"}</p>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <select
                      value={assignment.cardId}
                      onChange={(event) => setUnclassifiedAssignments((current) => ({ ...current, [item.id]: { ...assignment, cardId: event.target.value } }))}
                      className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
                    >
                      {cards.map((card) => <option key={card.id} value={card.id}>{card.title}</option>)}
                    </select>
                    <select
                      value={assignment.targetBlock}
                      onChange={(event) => setUnclassifiedAssignments((current) => ({ ...current, [item.id]: { ...assignment, targetBlock: event.target.value as UnclassifiedAssignment["targetBlock"] } }))}
                      className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
                    >
                      <option value="body">正文区</option>
                      <option value="image">图片区</option>
                      <option value="chart">图表区</option>
                      <option value="source">来源区</option>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderReportWorkbench = (scope: "sector" | "stock", context: string) => (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={reportSources[scope]}
          onChange={(event) => setReportSources((current) => ({ ...current, [scope]: event.target.value as typeof current[typeof scope] }))}
          className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
        >
          <option value="deep">仅深度</option>
          <option value="deep_plus_candidates">深度 + 待吸收</option>
          <option value="draft_plus_deep">初稿 + 深度</option>
        </select>
        <AskAiButton
          context={`${context}\n\n报告输入源：${reportSources[scope]}`}
          label={scope === "sector" ? "生成行业报告" : "生成个股报告"}
          suggestions={scope === "sector"
            ? ["生成一篇高质量行业深度报告", "基于深度卡片重建行业框架", "提炼市场规模、产业链和竞争格局", "指出还缺哪些关键资料"]
            : ["生成一篇高质量个股深度报告", "拆解这家公司的业务和竞争格局", "提炼管理层、股权和资本动作", "指出当前还缺哪些关键信息"]}
        />
      </div>
      {renderCompactNotice("当前报告默认以深度卡片为核心输入。若你选择带上待吸收候选，系统会把未正式吸收的增量信息一并纳入提示词。")}
    </div>
  );

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

  const renameStockFocusBucket = (bucketId: string, label: string) => {
    setStockFocusBucketDefs((current) => current.map((item) => item.id === bucketId ? { ...item, label: label || item.label } : item));
  };

  const addStockFocusBucket = () => {
    setStockFocusBucketDefs((current) => [
      ...current,
      {
        id: `bucket-${Date.now()}`,
        label: `新列${current.length + 1}`,
        tone: STOCK_BUCKET_TONES[current.length % STOCK_BUCKET_TONES.length],
      },
    ]);
  };

  const removeStockFocusBucket = (bucketId: string) => {
    if (stockFocusBucketDefs.length <= 1) {
      toast.error("至少保留一列");
      return;
    }
    const fallbackId = stockFocusBucketDefs.find((item) => item.id !== bucketId)?.id;
    if (!fallbackId) return;
    setStockFocusMap((current) =>
      Object.fromEntries(
        Object.entries(current).map(([ticker, value]) => [ticker, value === bucketId ? fallbackId : value]),
      ),
    );
    setStockFocusOrders((current) => {
      const moved = current[bucketId] || [];
      const next = { ...current };
      delete next[bucketId];
      next[fallbackId] = [...(next[fallbackId] || []), ...moved.filter((id) => !(next[fallbackId] || []).includes(id))];
      return next;
    });
    setStockFocusExpanded((current) => {
      const next = { ...current };
      delete next[bucketId];
      return next;
    });
    setStockFocusBucketDefs((current) => current.filter((item) => item.id !== bucketId));
  };

  const beginStockInlineRename = (ticker: string) => {
    const target = watchStocks.find((item) => `${item.code}.${item.market}` === ticker);
    if (!target) return;
    setEditingStockTicker(ticker);
    setStockNameDraft(target.name);
  };

  const commitStockInlineRename = async (ticker: string) => {
    const target = watchStocks.find((item) => `${item.code}.${item.market}` === ticker);
    if (!target) return;
    const trimmed = stockNameDraft.trim();
    if (!trimmed) {
      toast.error("个股名称不能为空");
      return;
    }
    if (trimmed === target.name) {
      setEditingStockTicker("");
      setStockNameDraft("");
      return;
    }
    const nextStocks = watchStocks.map((item) => `${item.code}.${item.market}` === ticker ? { ...item, name: trimmed } : item);
    setWatchStocks(nextStocks);
    if (selectedTicker === ticker) {
      setStockCenter((current) => current ? { ...current, company: { ...current.company, name: trimmed } } : current);
    }
    await api.saveWatchlist({ stocks: nextStocks, indicators: watchIndicators });
    toast.success("个股名称已更新");
    setEditingStockTicker("");
    setStockNameDraft("");
  };

  const removeWatchStock = async (ticker: string) => {
    const target = watchStocks.find((item) => `${item.code}.${item.market}` === ticker);
    if (!target) return;
    if (!window.confirm(`确认从个股中心移除“${target.name}”吗？`)) return;
    const nextStocks = watchStocks.filter((item) => `${item.code}.${item.market}` !== ticker);
    setWatchStocks(nextStocks);
    setStockFocusMap((current) => {
      const next = { ...current };
      delete next[ticker];
      return next;
    });
    setStockFocusOrders((current) =>
      Object.fromEntries(Object.entries(current).map(([bucketId, ids]) => [bucketId, ids.filter((id) => id !== ticker)])),
    );
    if (selectedTicker === ticker) {
      const fallback = nextStocks[0] ? `${nextStocks[0].code}.${nextStocks[0].market}` : "";
      setSelectedTicker(fallback);
      if (fallback) void loadStockCenter(fallback);
      else setStockCenter(null);
    }
    await api.saveWatchlist({ stocks: nextStocks, indicators: watchIndicators });
    toast.success("个股已移除");
  };

  const moveStockToBucket = (ticker: string, bucketId: string, targetTicker?: string) => {
    const sourceBucket = stockFocusMap[ticker] || stockFocusBucketDefs[0]?.id || "focus";
    const sourceIds = stockFocusBuckets.find((item) => item.id === sourceBucket)?.items.map((item) => `${item.code}.${item.market}`) || [];
    const targetIds = stockFocusBuckets.find((item) => item.id === bucketId)?.items.map((item) => `${item.code}.${item.market}`) || [];
    const nextSource = sourceIds.filter((id) => id !== ticker);
    const baseTarget = sourceBucket === bucketId ? nextSource : targetIds.filter((id) => id !== ticker);
    const insertIndex = targetTicker ? baseTarget.findIndex((id) => id === targetTicker) : -1;
    const nextTarget = [...baseTarget];
    if (insertIndex >= 0) nextTarget.splice(insertIndex, 0, ticker);
    else nextTarget.push(ticker);

    setStockFocusMap((current) => ({ ...current, [ticker]: bucketId }));
    setStockFocusOrders((current) => ({
      ...current,
      [sourceBucket]: sourceBucket === bucketId ? nextTarget : nextSource,
      [bucketId]: nextTarget,
    }));
  };

  const handleStockBucketDrop = (bucketId: string, targetTicker?: string) => {
    if (!draggingStockBucketId) {
      setDraggingStockBucketId("");
      setDragOverStockBucketId("");
      return;
    }
    moveStockToBucket(draggingStockBucketId, bucketId, targetTicker);
    setDraggingStockBucketId("");
    setDragOverStockBucketId("");
    const label = stockFocusBucketDefs.find((item) => item.id === bucketId)?.label || "该列";
    toast.success(`已移动到${label}`);
  };

  const handleSectorGroupDrop = async (targetId: string) => {
    if (!draggingSectorGroupId || draggingSectorGroupId === targetId) {
      setDraggingSectorGroupId("");
      setDragOverSectorGroupId("");
      return;
    }
    const primaryIds = primarySectorGroups.map((item) => item.id);
    const fromIndex = primaryIds.findIndex((id) => id === draggingSectorGroupId);
    const toIndex = primaryIds.findIndex((id) => id === targetId);
    if (fromIndex < 0 || toIndex < 0) {
      setDraggingSectorGroupId("");
      setDragOverSectorGroupId("");
      return;
    }
    const nextPrimaryIds = [...primaryIds];
    const [moved] = nextPrimaryIds.splice(fromIndex, 1);
    nextPrimaryIds.splice(toIndex, 0, moved);
    const childIds = orderedSectorTree.filter((item) => item.parent_id).map((item) => item.id);
    const next = [...nextPrimaryIds, ...childIds];
    try {
      setSectorNavOrder(next);
      persistFrameworkNavOrder("framework-sector-nav-order", next);
      const result = await api.saveSectorTreeOrder(next);
      setSectorTree(result.nodes);
      toast.success("一级行业顺序已保存");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "行业顺序保存失败");
    } finally {
      setDraggingSectorGroupId("");
      setDragOverSectorGroupId("");
    }
  };

  const handleSectorChildDrop = async (parentId: string, targetId?: string) => {
    if (!draggingSectorChildId || draggingSectorChildId === targetId) {
      setDraggingSectorChildId("");
      setDragOverSectorChildId("");
      return;
    }
    const primaryIds = primarySectorGroups.map((item) => item.id);
    const groupedChildren = new Map<string, string[]>();
    primarySectorGroups.forEach((group) => {
      groupedChildren.set(group.id, group.children.map((child) => child.id));
    });
    const sourceParentId = primarySectorGroups.find((group) => group.children.some((child) => child.id === draggingSectorChildId))?.id || "";
    const sourceIds = groupedChildren.get(sourceParentId) || [];
    const targetIds = groupedChildren.get(parentId) || [];
    const fromIndex = sourceIds.findIndex((id) => id === draggingSectorChildId);
    if (fromIndex < 0) {
      setDraggingSectorChildId("");
      setDragOverSectorChildId("");
      return;
    }
    const draggingNode = primarySectorGroups.flatMap((group) => group.children).find((child) => child.id === draggingSectorChildId);
    if (!draggingNode) {
      setDraggingSectorChildId("");
      setDragOverSectorChildId("");
      return;
    }
    const nextSourceIds = sourceIds.filter((id) => id !== draggingSectorChildId);
    const nextTargetIds = sourceParentId === parentId ? [...nextSourceIds] : targetIds.filter((id) => id !== draggingSectorChildId);
    const toIndex = targetId ? nextTargetIds.findIndex((id) => id === targetId) : -1;
    if (targetId && toIndex < 0) {
      setDraggingSectorChildId("");
      setDragOverSectorChildId("");
      return;
    }
    if (toIndex >= 0) nextTargetIds.splice(toIndex, 0, draggingSectorChildId);
    else nextTargetIds.push(draggingSectorChildId);
    groupedChildren.set(sourceParentId, sourceParentId === parentId ? nextTargetIds : nextSourceIds);
    groupedChildren.set(parentId, nextTargetIds);
    const next = [
      ...primaryIds,
      ...primaryIds.flatMap((id) => groupedChildren.get(id) || []),
    ];
    try {
      if (sourceParentId && sourceParentId !== parentId) {
        await api.upsertSectorNode({
          id: draggingNode.id,
          name: draggingNode.name,
          parent_id: parentId,
          description: draggingNode.description,
          sort_order: draggingNode.sort_order,
        });
      }
      setSectorNavOrder(next);
      persistFrameworkNavOrder("framework-sector-nav-order", next);
      const result = await api.saveSectorTreeOrder(next);
      setSectorTree(result.nodes);
      toast.success(sourceParentId && sourceParentId !== parentId ? "二级行业已移动到新的一级行业" : "二级行业顺序已保存");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "二级行业调整失败");
    } finally {
      setDraggingSectorChildId("");
      setDragOverSectorChildId("");
    }
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
                className={primaryButtonWideClass}
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
                  className={primaryButtonClass}
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
                  className={primaryButtonClass}
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
                    renderCompactNotice("关注列表还没有股票，先去“关注列表”补你的核心跟踪池。")
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
              <AutoResizeTextarea value={weeklyForm.actionAdvice} onChange={(event) => setWeeklyForm((prev) => ({ ...prev, actionAdvice: event.target.value }))} placeholder="行动建议：重点持仓怎么应对，本周准备增减哪些标的，推荐观点如何更新。" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
              <AutoResizeTextarea value={weeklyForm.sectorViews} onChange={(event) => setWeeklyForm((prev) => ({ ...prev, sectorViews: event.target.value }))} placeholder="行业观点：本周重点覆盖行业的事件、景气变化、龙头反馈和后续跟踪重点。" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
              <AutoResizeTextarea value={weeklyForm.keyEvents} onChange={(event) => setWeeklyForm((prev) => ({ ...prev, keyEvents: event.target.value }))} placeholder="重点事件：可选，补充本周关键公告、电话会、调研、政策和市场分歧点。" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
              <button onClick={() => void submitWeeklyReview()} className={primaryButtonWideClass}>生成并写入周度复盘</button>
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
                <button onClick={() => void addSectorNode()} className={primaryButtonClass}>加入行业树</button>
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
                <AutoResizeTextarea value={indicatorForm.viewpoint} onChange={(event) => setIndicatorForm((prev) => ({ ...prev, viewpoint: event.target.value }))} placeholder="观点：同比和出口占比是景气判断核心。" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <button onClick={() => void addSectorIndicator()} className={primaryButtonClass}>保存跟踪指标</button>
              </div>
              <div className="space-y-2 rounded-xl border border-border/50 bg-black/10 p-3">
                <p className="text-sm font-medium">行业自定义模块</p>
                <input value={sectorModuleForm.title} onChange={(event) => setSectorModuleForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="模块标题：竞争格局 / 政策框架 / 产业链图谱" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <input value={sectorModuleForm.category} onChange={(event) => setSectorModuleForm((prev) => ({ ...prev, category: event.target.value }))} placeholder="分类：行业框架 / 政策 / 跟踪要点" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <AutoResizeTextarea value={sectorModuleForm.content} onChange={(event) => setSectorModuleForm((prev) => ({ ...prev, content: event.target.value }))} placeholder="说明：记录这个行业最值得长期反复更新的一类框架内容。" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <button onClick={() => void addSectorModule()} className={primaryButtonClass}>保存行业模块</button>
              </div>
              <div className="space-y-2 rounded-xl border border-border/50 bg-black/10 p-3">
                <p className="text-sm font-medium">高价值纪要接入口</p>
                <input value={premiumNoteForm.title} onChange={(event) => setPremiumNoteForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="纪要标题：工程机械专家会纪要 / 渠道会纪要" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <input value={premiumNoteForm.source_name} onChange={(event) => setPremiumNoteForm((prev) => ({ ...prev, source_name: event.target.value }))} placeholder="来源标识：alphaengine / expert_network / 渠道库" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <AutoResizeTextarea value={premiumNoteForm.content} onChange={(event) => setPremiumNoteForm((prev) => ({ ...prev, content: event.target.value }))} placeholder="未来这里可以直接接专家会议纪要、渠道会纪要等高价值接口；当前也支持先手动贴入正文沉淀。" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <button onClick={() => void ingestPremiumNote("industry")} className={primaryButtonClass}>沉淀进行业中心</button>
              </div>
              <button
                onClick={() => reportInputRef.current?.click()}
                className={secondaryButtonWideClass}
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
                附件投喂
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
                附件投喂
              </button>
            </div>
          )}
          <AutoResizeTextarea value={form.content} onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))} placeholder={active === "stocks" && stockKind === "attachment_link" ? "第一行贴链接，下一行开始写说明或备注。" : active === "sectors" && sectorKind === "attachment_link" ? "第一行贴链接，下一行开始写研报、纪要或外部资料说明。" : "写下正文内容，后面可以手动生成 AI 摘要和固定图片请求。"} className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
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
                <AutoResizeTextarea value={stockModuleForm.content} onChange={(event) => setStockModuleForm((prev) => ({ ...prev, content: event.target.value }))} placeholder="说明：未来这里可接公开信息自动抽取，也可以先手动记录关键观察。" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <button onClick={() => void addStockModule()} className={primaryButtonClass}>保存个股模块</button>
              </div>
              <div className="space-y-2 rounded-xl border border-border/50 bg-black/10 p-3">
                <p className="text-sm font-medium">高价值纪要接入口</p>
                <input value={premiumNoteForm.title} onChange={(event) => setPremiumNoteForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="纪要标题：公司专家会 / 渠道反馈 / 电话会补充" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <input value={premiumNoteForm.source_name} onChange={(event) => setPremiumNoteForm((prev) => ({ ...prev, source_name: event.target.value }))} placeholder="来源标识：alphaengine / expert_network / 买方纪要库" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <AutoResizeTextarea value={premiumNoteForm.content} onChange={(event) => setPremiumNoteForm((prev) => ({ ...prev, content: event.target.value }))} placeholder="未来这里可以直接接专家纪要、会议纪要和渠道反馈接口；当前也支持先手动贴入正文沉淀。" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                <button onClick={() => void ingestPremiumNote("stock")} className={primaryButtonClass}>沉淀进个股中心</button>
              </div>
              <button
                onClick={() => reportInputRef.current?.click()}
                className={secondaryButtonWideClass}
              >
                <Upload className="h-4 w-4" /> 上传研报并挂到当前个股
              </button>
              <button
                onClick={() => void ingestMarketReports()}
                disabled={ingestingReports}
                className={`${primaryButtonClass} inline-flex w-full items-center justify-center gap-1.5`}
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
          <button onClick={() => void submit()} className={primaryButtonWideClass}>写入沉淀</button>
            </>
          )}
        </GlassCard>
        )}

        <div className="space-y-4">
          {active === "sectors" && sectorCenterTab === "center" && (
            <GlassCard className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  onClick={() => setSectorCenterEditing((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs ${sectorCenterEditing ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-primary"}`}
                >
                  {sectorCenterEditing ? "完成编辑" : "编辑"}
                </button>
                <button
                  onClick={() => setSectorObjectPanelOpen((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-primary"
                >
                  <Plus className="h-3.5 w-3.5" /> 新增行业库
                </button>
              </div>
              <div className="space-y-3">
                {sectorObjectPanelOpen && (
                  <>
                  <div className="space-y-2 rounded-xl border border-border/40 bg-black/10 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">行业库</p>
                      <span className="text-xs text-muted-foreground">只保留两栏：行业名称 + 一级/二级挂载方式</span>
                    </div>
                    <input
                      value={sectorLibraryForm.name}
                      onChange={(event) => setSectorLibraryForm((prev) => ({ ...prev, name: event.target.value }))}
                      placeholder="行业名称：科技 / 机械 / HBM / 光互联"
                      className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
                    />
                    <select
                      value={sectorLibraryForm.kind}
                      onChange={(event) => setSectorLibraryForm((prev) => ({
                        ...prev,
                        kind: event.target.value as "primary" | "secondary",
                        parent_id: event.target.value === "secondary" ? (prev.parent_id || activePrimarySectorId) : "",
                      }))}
                      className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
                    >
                      <option value="primary">作为一级行业</option>
                      <option value="secondary">作为二级行业</option>
                    </select>
                    {sectorLibraryForm.kind === "secondary" && (
                      <select
                        value={sectorLibraryForm.parent_id}
                        onChange={(event) => setSectorLibraryForm((prev) => ({ ...prev, parent_id: event.target.value }))}
                        className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
                      >
                        <option value="">选择挂载一级行业</option>
                        {primarySectorGroups.map((group) => (
                          <option key={group.id} value={group.id}>{group.name}</option>
                        ))}
                      </select>
                    )}
                    <button
                      onClick={() => void addSectorLibraryNode()}
                      className="w-full rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary hover:bg-primary/15"
                    >
                      加入行业库
                    </button>
                  </div>
                  <input
                    value={sectorObjectQuery}
                    onChange={(event) => setSectorObjectQuery(event.target.value)}
                    placeholder="搜索一级/二级行业，如：机械 / 光互联"
                    className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
                  />
                  </>
                )}
                {orderedSectorTree.length === 0 ? (
                  renderCompactNotice("行业中心对象池现在完全按你自己维护。先在行业库里补一个一级行业，再往下面挂二级行业。")
                ) : (
                  <div className="space-y-2">
                    {filteredPrimarySectorGroups.map((group) => (
                      <div key={group.id} className="rounded-xl border border-border/40 bg-black/10 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div
                            draggable={sectorCenterEditing}
                            onDragStart={() => {
                              if (!sectorCenterEditing) return;
                              setDraggingSectorGroupId(group.id);
                              setDragOverSectorGroupId(group.id);
                            }}
                            onDragOver={(event) => {
                              if (!sectorCenterEditing) return;
                              event.preventDefault();
                              if (dragOverSectorGroupId !== group.id) setDragOverSectorGroupId(group.id);
                            }}
                            onDragLeave={() => {
                              if (!sectorCenterEditing) return;
                              if (dragOverSectorGroupId === group.id) setDragOverSectorGroupId("");
                            }}
                            onDrop={(event) => {
                              if (!sectorCenterEditing) return;
                              event.preventDefault();
                              void handleSectorGroupDrop(group.id);
                            }}
                            onDragEnd={() => {
                              if (!sectorCenterEditing) return;
                              setDraggingSectorGroupId("");
                              setDragOverSectorGroupId("");
                            }}
                            className={cn(
                              "inline-flex items-center gap-2 rounded-lg border px-3 py-2",
                              dragOverSectorGroupId === group.id && draggingSectorGroupId !== group.id ? "border-primary/70 ring-1 ring-primary/40" : "border-border/40",
                              draggingSectorGroupId === group.id ? "opacity-60" : "",
                            )}
                          >
                            {sectorCenterEditing && <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing" />}
                            {editingSectorNodeId === group.id ? (
                              <input
                                autoFocus
                                value={sectorNameDraft}
                                onChange={(event) => setSectorNameDraft(event.target.value)}
                                onBlur={() => void commitSectorInlineRename(group)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") void commitSectorInlineRename(group);
                                  if (event.key === "Escape") {
                                    setEditingSectorNodeId("");
                                    setSectorNameDraft("");
                                  }
                                }}
                                className="min-w-[120px] rounded-md border border-primary/40 bg-black/20 px-2 py-1 text-sm font-semibold text-primary outline-none"
                              />
                            ) : (
                              <button
                                onClick={() => {
                                  setSelectedSector(group.name);
                                  setSectorView("overview");
                                  setIndicatorForm((prev) => ({ ...prev, sector: group.name }));
                                  setForm((prev) => ({ ...prev, related: group.name }));
                                }}
                                onDoubleClick={() => {
                                  if (sectorCenterEditing) beginSectorInlineRename(group);
                                }}
                                className={`text-sm font-semibold ${selectedSector === group.name ? "text-primary" : "text-foreground"}`}
                              >
                                {group.name}
                              </button>
                            )}
                          </div>
                          {sectorCenterEditing && (
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                onClick={() => void deleteSectorNode(group.id, group.name)}
                                className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground hover:text-primary"
                              >
                                <Trash2 className="h-3.5 w-3.5" /> 删除
                              </button>
                            </div>
                          )}
                        </div>
                        <div
                          onDragOver={(event) => {
                            if (!sectorCenterEditing) return;
                            event.preventDefault();
                            if (dragOverSectorChildId !== `group:${group.id}`) setDragOverSectorChildId(`group:${group.id}`);
                          }}
                          onDragLeave={() => {
                            if (!sectorCenterEditing) return;
                            if (dragOverSectorChildId === `group:${group.id}`) setDragOverSectorChildId("");
                          }}
                          onDrop={(event) => {
                            if (!sectorCenterEditing) return;
                            event.preventDefault();
                            void handleSectorChildDrop(group.id);
                          }}
                          className={cn(
                            "mt-3 flex flex-wrap gap-2 rounded-lg transition",
                            dragOverSectorChildId === `group:${group.id}` && draggingSectorChildId ? "ring-1 ring-primary/40" : "",
                          )}
                        >
                          {group.children.length === 0 ? (
                            <span className="text-xs text-muted-foreground">这个一级行业下还没有二级行业。</span>
                          ) : (
                            group.children.map((child) => (
                              <div
                                key={child.id}
                                draggable={sectorCenterEditing}
                                onDragStart={() => {
                                  if (!sectorCenterEditing) return;
                                  setDraggingSectorChildId(child.id);
                                  setDragOverSectorChildId(child.id);
                                }}
                                onDragOver={(event) => {
                                  if (!sectorCenterEditing) return;
                                  event.preventDefault();
                                  if (dragOverSectorChildId !== child.id) setDragOverSectorChildId(child.id);
                                }}
                                onDragLeave={() => {
                                  if (!sectorCenterEditing) return;
                                  if (dragOverSectorChildId === child.id) setDragOverSectorChildId("");
                                }}
                                onDrop={(event) => {
                                  if (!sectorCenterEditing) return;
                                  event.preventDefault();
                                  void handleSectorChildDrop(group.id, child.id);
                                }}
                                onDragEnd={() => {
                                  if (!sectorCenterEditing) return;
                                  setDraggingSectorChildId("");
                                  setDragOverSectorChildId("");
                                }}
                                className={cn(
                                  "inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-black/20 px-2 py-1",
                                  dragOverSectorChildId === child.id && draggingSectorChildId !== child.id ? "ring-1 ring-primary/40" : "",
                                  draggingSectorChildId === child.id ? "opacity-60" : "",
                                )}
                              >
                                {sectorCenterEditing && <GripVertical className="h-3 w-3 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing" />}
                                {editingSectorNodeId === child.id ? (
                                  <input
                                    autoFocus
                                    value={sectorNameDraft}
                                    onChange={(event) => setSectorNameDraft(event.target.value)}
                                    onBlur={() => void commitSectorInlineRename(child)}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") void commitSectorInlineRename(child);
                                      if (event.key === "Escape") {
                                        setEditingSectorNodeId("");
                                        setSectorNameDraft("");
                                      }
                                    }}
                                    className="min-w-[88px] rounded-md border border-primary/40 bg-black/20 px-2 py-0.5 text-xs font-medium text-primary outline-none"
                                  />
                                ) : (
                                  <button
                                    onClick={() => {
                                      setSelectedSector(child.name);
                                      setSectorView("overview");
                                      setIndicatorForm((prev) => ({ ...prev, sector: child.name }));
                                      setForm((prev) => ({ ...prev, related: child.name }));
                                      setSectorObjectPanelOpen(false);
                                    }}
                                    onDoubleClick={() => {
                                      if (sectorCenterEditing) beginSectorInlineRename(child);
                                    }}
                                    className={`text-xs font-medium ${selectedSector === child.name ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                                  >
                                    {child.name}
                                  </button>
                                )}
                                {sectorCenterEditing && (
                                  <>
                                    <button
                                      onClick={() => void deleteSectorNode(child.id, child.name)}
                                      className="text-[11px] text-muted-foreground hover:text-primary"
                                    >
                                      删除
                                    </button>
                                  </>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </GlassCard>
          )}
          {active === "stocks" && stockCenterTab === "center" && (
            <GlassCard className="space-y-3">
              {stockCenterObjects.length === 0 ? (
                renderCompactNotice("先去关注列表补充核心个股，这里只会接入个股，不会显示大宗、利率等其他对象。")
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      onClick={() => setStockCenterEditing((prev) => !prev)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs ${stockCenterEditing ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-primary"}`}
                    >
                      {stockCenterEditing ? "完成编辑" : "编辑"}
                    </button>
                    <button
                      onClick={addStockFocusBucket}
                      disabled={!stockCenterEditing}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-primary"
                    >
                      <Plus className="h-3.5 w-3.5" /> 新增分组列
                    </button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {stockFocusBuckets.map((bucket) => {
                    const expanded = stockFocusExpanded[bucket.id];
                    const visibleItems = expanded ? bucket.items : bucket.items.slice(0, 6);
                    return (
                      <div
                        key={bucket.id}
                        onDragOver={(event) => {
                          event.preventDefault();
                          if (dragOverStockBucketId !== bucket.id) setDragOverStockBucketId(bucket.id);
                        }}
                        onDragLeave={() => {
                          if (dragOverStockBucketId === bucket.id) setDragOverStockBucketId("");
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          handleStockBucketDrop(bucket.id);
                        }}
                        className={cn(
                          "h-full rounded-xl border border-border/40 bg-black/10 p-3 transition",
                          dragOverStockBucketId === bucket.id && draggingStockBucketId ? "ring-1 ring-primary/40" : "",
                        )}
                      >
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          {stockCenterEditing ? (
                            <input
                              value={bucket.label}
                              onChange={(event) => renameStockFocusBucket(bucket.id, event.target.value)}
                              className={`min-w-0 flex-1 rounded-full border px-2.5 py-1 text-xs font-medium outline-none ${bucket.tone}`}
                            />
                          ) : (
                            <div className={`min-w-0 flex-1 rounded-full border px-2.5 py-1 text-xs font-medium ${bucket.tone}`}>{bucket.label}</div>
                          )}
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{bucket.items.length} 只</span>
                            {stockCenterEditing && stockFocusBucketDefs.length > 1 && (
                              <button
                                onClick={() => removeStockFocusBucket(bucket.id)}
                                className="rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground hover:text-primary"
                              >
                                删除
                              </button>
                            )}
                          </div>
                          {bucket.items.length > 6 && (
                            <button
                              onClick={() => setStockFocusExpanded((current) => ({ ...current, [bucket.id]: !current[bucket.id] }))}
                              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-primary"
                            >
                              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              {expanded ? "收起" : `展开剩余 ${bucket.items.length - 6} 只`}
                            </button>
                          )}
                        </div>
                        {bucket.items.length === 0 ? (
                          <div className="rounded-lg bg-muted/20 px-3 py-2 text-xs text-muted-foreground">当前分组还没有个股。</div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {visibleItems.map((item) => {
                              const ticker = `${item.code}.${item.market}`;
                              const selected = ticker === selectedTicker;
                              return (
                                <div
                                  key={ticker}
                                  draggable={stockCenterEditing}
                                  onDragStart={() => {
                                    if (!stockCenterEditing) return;
                                    setDraggingStockBucketId(ticker);
                                    setDragOverStockBucketId(ticker);
                                  }}
                                  onDragOver={(event) => {
                                    if (!stockCenterEditing) return;
                                    event.preventDefault();
                                    if (dragOverStockBucketId !== ticker) setDragOverStockBucketId(ticker);
                                  }}
                                  onDragLeave={() => {
                                    if (!stockCenterEditing) return;
                                    if (dragOverStockBucketId === ticker) setDragOverStockBucketId("");
                                  }}
                                  onDrop={(event) => {
                                    if (!stockCenterEditing) return;
                                    event.preventDefault();
                                    handleStockBucketDrop(bucket.id, ticker);
                                  }}
                                  onDragEnd={() => {
                                    if (!stockCenterEditing) return;
                                    setDraggingStockBucketId("");
                                    setDragOverStockBucketId("");
                                  }}
                                  className={cn(
                                    "flex items-center gap-1.5 rounded-xl border px-2 py-2 transition",
                                    selected ? "border-primary/60 bg-primary/10 shadow-glow" : "border-border/40 bg-background/60",
                                    dragOverStockBucketId === ticker && draggingStockBucketId !== ticker ? "ring-1 ring-primary/40" : "",
                                    draggingStockBucketId === ticker ? "opacity-60" : "",
                                  )}
                                >
                                  {editingStockTicker === ticker ? (
                                    <input
                                      autoFocus
                                      value={stockNameDraft}
                                      onChange={(event) => setStockNameDraft(event.target.value)}
                                      onBlur={() => void commitStockInlineRename(ticker)}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") void commitStockInlineRename(ticker);
                                        if (event.key === "Escape") {
                                          setEditingStockTicker("");
                                          setStockNameDraft("");
                                        }
                                      }}
                                      className="min-w-[88px] rounded-md border border-primary/40 bg-black/20 px-2 py-0.5 text-sm font-medium text-primary outline-none"
                                    />
                                  ) : (
                                    <button
                                      onClick={() => {
                                        setStockView("overview");
                                        void loadStockCenter(ticker);
                                      }}
                                      onDoubleClick={() => {
                                        if (stockCenterEditing) beginStockInlineRename(ticker);
                                      }}
                                      className="text-sm font-medium text-foreground"
                                    >
                                      {item.name}
                                    </button>
                                  )}
                                  {stockCenterEditing && (
                                    <>
                                      <button
                                        onClick={() => void removeWatchStock(ticker)}
                                        className="text-[11px] text-muted-foreground hover:text-primary"
                                      >
                                        删除
                                      </button>
                                      <GripVertical className="h-3.5 w-3.5 cursor-grab text-muted-foreground active:cursor-grabbing" />
                                    </>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  </div>
                </div>
              )}
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
                renderCompactNotice("这里会先按年度归档，再在年度下面沉淀每一周的复盘记录。")
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
                renderCompactNotice("先生成学习包，这里会形成右侧学习专题切换页。")
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
                renderCompactNotice("还没有行业节点。先从左侧加入一个一级行业，比如“工程机械”。")
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
                renderCompactNotice("还没有跟踪指标。可以先为工程机械添加“挖掘机月度销量”。")
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
            <GlassCard className="space-y-3">
              <div className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold">{selectedSector}</h3>
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">行业中心</span>
                      {builtInSector?.hot && <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary"><Flame className="h-3 w-3" /> 热门赛道</span>}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      行业概览现在是这条赛道的总框架页。你投喂的研报、纪要、附件和自定义模块都会不断沉淀进来，AI 也会基于这套材料持续更新。
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {renderOverviewWorkbenchTabs(sectorOverviewTab, setSectorOverviewTab, () => setOverviewMoreDrawer("sector"))}
                </div>
              </div>
              {renderOverviewStatsBar([
                { label: "行业条目", value: `${currentEntries.length} 条` },
                { label: "自定义模块", value: `${selectedSectorModules.length} 个` },
                { label: "纪要/点评/附件", value: `${sectorResearchNotes.length + sectorTrackingComments.length + sectorAttachments.length} 条` },
                { label: "时间线更新", value: `${sectorTimeline.length} 条` },
              ])}
              {sectorOverviewTab === "draft" && (
                <>
                  {renderOverviewHintBar(
                    sectorWorkbench?.draft.summary || "这里承接自动提取研报后的第一版框架。后续即便有新研报进入，也只会更新初稿，不会覆盖你的深度版本。",
                  )}
                  {shouldUseIndustryDraftCanvas(selectedSector || "", sectorWorkbench)
                    ? <IndustryDraftCanvas data={sectorWorkbench.draft_theme_schema} />
                    : shouldUseHBMDraftDashboard(selectedSector || "", sectorWorkbench)
                    ? <HBMDraftDashboard data={sectorWorkbench.draft_theme_schema} />
                    : (sectorWorkbench?.draft_structured_blocks || []).length > 0
                    ? renderStructuredOverviewShell(sectorWorkbench?.draft_structured_blocks || [], {
                        scope: "sector",
                        density: "draft",
                        leftTitle: "初稿目录",
                        rightTitle: "初稿预览",
                        placeholder: "初稿还没有内容。你可以先提取研报，或手动补一版行业框架。",
                      })
                    : renderOverviewPreviewShell(
                        normalizeOverviewPreviewContent(
                          draftBlocksToPreviewMarkdown(sectorDraftBlocks),
                          `${selectedSector || "行业"} 初稿.note`,
                        ).markdown,
                        normalizeOverviewPreviewContent(
                          draftBlocksToPreviewMarkdown(sectorDraftBlocks),
                          `${selectedSector || "行业"} 初稿.note`,
                        ).mode,
                        {
                          leftTitle: "初稿目录",
                          rightTitle: "初稿预览",
                          placeholder: "初稿还没有内容。你可以先提取研报，或手动补一版行业框架。",
                        },
                      )}
                  {renderOverviewSourcePanel("sector")}
                  <div>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">最近更新研报</p>
                      <span className="text-xs text-muted-foreground">{sectorAutoReportUpdates.length} 条记录</span>
                    </div>
                    <div className="space-y-2">
                      {sectorAutoReportUpdates.length === 0 ? (
                        renderCompactNotice("这里会展示自动提取并纳入行业概览的最新行业研报记录。")
                      ) : (
                        sectorAutoReportUpdates.map((item) => (
                          <div key={item.id} className="rounded-xl border border-border/40 bg-muted/20 p-3 text-sm">
                            <p className="font-medium">行业研报：{item.title.replace(/^行业研报：/, "")}</p>
                            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                              <div className="flex flex-wrap items-center gap-3">
                                <span>机构：{attachmentMetaValue(item, "机构") || "-"}</span>
                                <span>日期：{attachmentMetaValue(item, "日期") || item.date || "-"}</span>
                              </div>
                              {extractFirstUrl(item.content_preview || item.content || "") && (
                                <a href={extractFirstUrl(item.content_preview || item.content || "")} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline">
                                  <ExternalLink className="h-3.5 w-3.5" /> 打开链接
                                </a>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
              {sectorOverviewTab === "deep" && renderDeepCards("sector", sectorDeepCards, sectorWorkbench?.versions || [], sectorWorkbench?.candidates || [])}
              {sectorOverviewTab === "candidates" && renderCandidateGroups("sector", sectorCandidateGroups)}
            </GlassCard>
          )}
          {active === "sectors" && sectorCenterTab === "center" && selectedSector && sectorView === "modules" && (
            <GlassCard className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">{selectedSector}自定义模块</h3>
                <span className="text-xs text-muted-foreground">{selectedSectorModules.length} 个模块</span>
              </div>
              {selectedSectorModules.length === 0 ? (
                renderCompactNotice("还没有行业自定义模块。可以先加“竞争格局、政策框架、产业链图谱、核心变量”等栏目。")
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
            <GlassCard className="space-y-3">
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
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
                    renderCompactNotice("还没有行业调研纪要。你后续每新增一次纪要，这里都会形成一条按日期排序的留痕记录。")
                  ) : (
                    sectorNoteTimeline.map((item, index) => (
                      <div key={item.id} className="rounded-xl border border-border/40 bg-muted/20 p-3 text-sm">
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
            <GlassCard className="space-y-3">
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
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
                    renderCompactNotice("还没有行业点评。后续每新增一条行业点评，这里都会自动沉淀成时间线。")
                  ) : (
                    sectorCommentTimeline.map((item, index) => (
                      <div key={item.id} className="rounded-xl border border-border/40 bg-muted/20 p-3 text-sm">
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
            <GlassCard className="space-y-3">
              <div className="rounded-xl border border-border/50 bg-black/10 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{attachmentEditing.scope === "sector" ? "编辑附件投喂" : "新增附件投喂"}</p>
                  <span className="text-xs text-muted-foreground">有道笔记、链接、PDF/图片/文档都会挂到 {selectedSector}</span>
                </div>
                {attachmentEditing.scope === "sector" ? (
                  <>
                    <div className="grid gap-2 md:grid-cols-2">
                      <input value={attachmentForm.title} onChange={(event) => setAttachmentForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="资料标题：HBM产业链深度 / 专家会纪要" className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                      <input value={attachmentForm.url} disabled={attachmentEditing.preserveContent} onChange={(event) => setAttachmentForm((prev) => ({ ...prev, url: event.target.value }))} placeholder="粘贴链接：研报、飞书、网页、公众号文章等" className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50 disabled:opacity-50" />
                    </div>
                    <AutoResizeTextarea value={attachmentForm.notes} disabled={attachmentEditing.preserveContent} onChange={(event) => setAttachmentForm((prev) => ({ ...prev, notes: event.target.value }))} placeholder="补充说明：这份资料解决什么问题、有哪些重要图表、后续希望 AI 提取哪些内容。" className="mt-2 w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50 disabled:opacity-50" />
                    <input value={attachmentForm.tags} onChange={(event) => setAttachmentForm((prev) => ({ ...prev, tags: event.target.value }))} placeholder="标签：研报, 产业链, HBM" className="mt-2 w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                    {attachmentEditing.preserveContent && (
                      <div className="mt-2 rounded-lg border border-dashed border-border/40 bg-black/10 px-3 py-2 text-xs text-muted-foreground">
                        这是上传文件生成的记录。当前支持改标题、标签或直接删除；原始文件内容保持不变，避免误改解析记录。
                      </div>
                    )}
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      <button onClick={() => void addAttachmentLink("sector")} className={primaryButtonClass}>保存投喂修改</button>
                      <button onClick={() => cancelAttachmentEdit()} className={secondaryButtonWideClass}>取消编辑</button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-[140px_minmax(0,1fr)] md:items-start">
                      <div className="rounded-xl border border-border/30 bg-black/10 px-4 py-3">
                        <p className="text-sm font-medium">上传文件</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">PDF、图片、Word、Excel、PPT 等。</p>
                      </div>
                      <div className="rounded-xl border border-border/30 bg-black/10 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <button onClick={() => attachmentFileInputRef.current?.click()} className={secondaryButtonWideClass}>
                            <Upload className="h-4 w-4" /> 上传 PDF/文件
                          </button>
                          <span className="text-[11px] text-muted-foreground">上传后会自动归档到当前行业，并进入待吸收链路。</span>
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-[140px_minmax(0,1fr)] md:items-start">
                      <div className="rounded-xl border border-border/30 bg-black/10 px-4 py-3">
                        <p className="text-sm font-medium">粘贴链接</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">网页、研报、飞书、公众号等。</p>
                      </div>
                      <div className="rounded-xl border border-border/30 bg-black/10 p-3">
                        <div className="grid gap-2 md:grid-cols-2">
                          <input value={attachmentForm.title} onChange={(event) => setAttachmentForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="资料标题：HBM产业链深度 / 专家会纪要" className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                          <input value={attachmentForm.url} onChange={(event) => setAttachmentForm((prev) => ({ ...prev, url: event.target.value }))} placeholder="粘贴链接：研报、飞书、网页、公众号文章等" className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                        </div>
                        <div className="mt-2 flex justify-end">
                          <button onClick={() => void addAttachmentLink("sector")} className={smallSecondaryButtonClass}>保存链接投喂</button>
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-[140px_minmax(0,1fr)] md:items-start">
                      <div className="rounded-xl border border-border/30 bg-black/10 px-4 py-3">
                        <p className="text-sm font-medium">有道云笔记</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">纪要、电话会、专家会笔记。</p>
                      </div>
                      <div className="rounded-xl border border-border/30 bg-black/10 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">搜索并导入</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">搜索后可把有道笔记直接送进待吸收检查页，再按卡片批量分发。</p>
                          </div>
                          <button onClick={() => toggleYoudaoFeedAssist("sector", selectedSector)} className={smallSecondaryButtonClass}>
                            {youdaoCandidateAssistOpen.sector ? "收起搜索笔记" : "搜索并导入"}
                          </button>
                        </div>
                        {youdaoCandidateAssistOpen.sector && (
                          <div className="mt-3 space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                value={youdaoCandidateDrafts.sector || ""}
                                onChange={(event) => setYoudaoCandidateDrafts((current) => ({ ...current, sector: event.target.value }))}
                                placeholder="搜索行业相关有道笔记关键词"
                                className="h-10 min-w-[280px] flex-1 rounded-full border border-border/30 bg-black/10 px-4 text-sm text-foreground outline-none placeholder:text-muted-foreground/45"
                              />
                              <button onClick={() => void searchYoudaoFeedNotes("sector", selectedSector)} className={smallSecondaryButtonClass}>
                                {youdaoCandidateLoading.sector ? "搜索中..." : "搜索笔记"}
                              </button>
                            </div>
                            <div className="space-y-2">
                              {(youdaoCandidateResults.sector || []).map((item) => (
                                <div key={item.file_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/20 bg-black/10 px-3 py-2">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                                    <p className="mt-1 text-[11px] text-muted-foreground">{item.file_id}</p>
                                  </div>
                                  <button
                                    onClick={() => void importYoudaoFeedNote("sector", selectedSector, item)}
                                    disabled={youdaoCandidateImporting.sector === item.file_id}
                                    className={smallPrimaryButtonClass}
                                  >
                                    {youdaoCandidateImporting.sector === item.file_id ? "导入中..." : "加入待吸收"}
                                  </button>
                                </div>
                              ))}
                              {!youdaoCandidateLoading.sector && (youdaoCandidateResults.sector || []).length === 0 && (
                                <div className="rounded-xl border border-dashed border-border/20 px-3 py-4 text-[11px] text-muted-foreground">
                                  先搜索笔记，再导入到待吸收。
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">附件投喂记录</p>
                <div className="space-y-2">
                  {sectorManualAttachments.length === 0 ? (
                    renderCompactNotice("还没有附件投喂记录。你可以在上方粘贴链接、上传 PDF/图片/文档，或从有道笔记导入。")
                  ) : (
                    sectorManualAttachments.slice(0, 6).map((item) => (
                      <div key={item.id} className="rounded-lg bg-muted/25 px-3 py-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{item.title}</p>
                          <div className="flex flex-wrap items-center gap-3">
                            <button onClick={() => beginAttachmentEdit("sector", item)} className={subtleTextButtonClass}>编辑</button>
                            <button onClick={() => requestAttachmentDelete("sector", item)} className={destructiveTextButtonClass}>删除</button>
                            {extractFirstUrl(item.content_preview || item.content || "") && (
                              <a href={extractFirstUrl(item.content_preview || item.content || "")} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                                <ExternalLink className="h-3.5 w-3.5" /> 打开链接
                              </a>
                            )}
                          </div>
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
            <GlassCard className="space-y-3">
              <div className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold">{stockCenter.company.name}</h3>
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{stockCenter.ticker}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{stockCenter.company.group}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      公司概览现在是这只股票的总框架页。公开信息、调研纪要、跟踪点评、附件和自定义模块都会持续汇总到这里，方便 AI 和你一起迭代认知。
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {renderOverviewWorkbenchTabs(stockOverviewTab, setStockOverviewTab, () => setOverviewMoreDrawer("stock"))}
                </div>
              </div>
              {renderOverviewStatsBar([
                { label: "公开信息", value: `${orderedStockPublicInfo.length} 项` },
                { label: "自定义模块", value: `${stockModules.length} 个` },
                { label: "纪要/点评/附件", value: `${(stockCenter.research_notes || []).length + (stockCenter.tracking_comments || []).length + (stockCenter.attachments || []).length} 条` },
                { label: "时间线更新", value: `${stockTimeline.length} 条` },
              ])}
              {stockOverviewTab === "draft" && (
                <>
                  {renderOverviewHintBar(
                    stockWorkbench?.draft.summary || "这里承接自动提取研报后的第一版个股框架。后续新增研报会先更新初稿，不会直接覆盖你的深度认知。",
                  )}
                  {(stockWorkbench?.draft_structured_blocks || []).length > 0
                    ? renderStructuredOverviewShell(stockWorkbench?.draft_structured_blocks || [], {
                        scope: "stock",
                        density: "draft",
                        leftTitle: "初稿目录",
                        rightTitle: "初稿预览",
                        placeholder: "初稿还没有内容。你可以先提取研报，或手动补一版个股框架。",
                      })
                    : renderOverviewPreviewShell(
                        normalizeOverviewPreviewContent(
                          draftBlocksToPreviewMarkdown(stockDraftBlocks),
                          `${selectedTicker || "个股"} 初稿.note`,
                        ).markdown,
                        normalizeOverviewPreviewContent(
                          draftBlocksToPreviewMarkdown(stockDraftBlocks),
                          `${selectedTicker || "个股"} 初稿.note`,
                        ).mode,
                        {
                          leftTitle: "初稿目录",
                          rightTitle: "初稿预览",
                          placeholder: "初稿还没有内容。你可以先提取研报，或手动补一版个股框架。",
                        },
                      )}
                  {renderOverviewSourcePanel("stock")}
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
                      <p className="text-sm font-medium">最近更新研报</p>
                      <span className="text-xs text-muted-foreground">{stockAutoReportUpdates.length} 条记录</span>
                    </div>
                    <div className="space-y-2">
                      {stockAutoReportUpdates.length === 0 ? (
                        renderCompactNotice("这里会展示自动提取并纳入个股概览的最新个股研报记录。")
                      ) : (
                        stockAutoReportUpdates.map((item) => (
                          <div key={item.id} className="rounded-xl border border-border/40 bg-muted/20 p-3 text-sm">
                            <p className="font-medium">个股研报：{item.title.replace(/^市场研报：/, "")}</p>
                            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                              <div className="flex flex-wrap items-center gap-3">
                                <span>机构：{attachmentMetaValue(item, "机构") || "-"}</span>
                                <span>日期：{attachmentMetaValue(item, "日期") || item.date || "-"}</span>
                              </div>
                              {extractFirstUrl(item.content_preview || item.content || "") && (
                                <a href={extractFirstUrl(item.content_preview || item.content || "")} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline">
                                  <ExternalLink className="h-3.5 w-3.5" /> 打开链接
                                </a>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
              {stockOverviewTab === "deep" && renderDeepCards("stock", stockDeepCards, stockWorkbench?.versions || [], stockWorkbench?.candidates || [])}
              {stockOverviewTab === "candidates" && renderCandidateGroups("stock", stockCandidateGroups)}
            </GlassCard>
          )}
          {active === "stocks" && stockCenterTab === "center" && stockCenter && stockView === "public" && (
            <GlassCard className="space-y-3">
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
            <GlassCard className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">{stockCenter.company.name}跟踪指标</h3>
                <span className="text-xs text-muted-foreground">{stockIndicatorModules.length} 个指标模块</span>
              </div>
              {stockIndicatorModules.length === 0 ? (
                renderCompactNotice("当前还没有个股跟踪指标。你可以在左侧把个股自定义模块的分类写成“跟踪指标”，比如“订单节奏”“产能释放”“销量月报”“回购进度”等，这里就会自动汇总。")
              ) : (
                <div className="space-y-3">
                  {stockIndicatorModules.map((item) => (
                    <div key={item.id} className="rounded-xl border border-border/40 bg-muted/20 p-3">
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
            <GlassCard className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">{stockCenter.company.name}自定义模块</h3>
                <span className="text-xs text-muted-foreground">{stockFrameworkModules.length} 个模块</span>
              </div>
              {stockFrameworkModules.length === 0 ? (
                renderCompactNotice("还没有自定义模块。可以先加“股权结构、管理层、回购、竞争格局”等栏目。")
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
            <GlassCard className="space-y-3">
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
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
                    renderCompactNotice("还没有调研纪要。你后续每新增一次调研纪要，这里都会形成一条按日期排序的留痕记录。")
                  ) : (
                    stockNoteTimeline.map((item, index) => (
                      <div key={item.id} className="rounded-xl border border-border/40 bg-muted/20 p-3 text-sm">
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
            <GlassCard className="space-y-3">
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
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
                    renderCompactNotice("还没有跟踪点评。后面重大公告、事件后的主观看法会沉淀成这里的时间线。")
                  ) : (
                    stockCommentTimeline.map((item, index) => (
                      <div key={item.id} className="rounded-xl border border-border/40 bg-muted/20 p-3 text-sm">
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
            <GlassCard className="space-y-3">
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
            <GlassCard className="space-y-3">
              <div className="rounded-xl border border-border/50 bg-black/10 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{attachmentEditing.scope === "stock" ? "编辑附件投喂" : "新增附件投喂"}</p>
                  <span className="text-xs text-muted-foreground">有道笔记、链接、PDF/图片/文档都会挂到 {stockCenter.company.name}</span>
                </div>
                {attachmentEditing.scope === "stock" ? (
                  <>
                    <div className="grid gap-2 md:grid-cols-2">
                      <input value={attachmentForm.title} onChange={(event) => setAttachmentForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="资料标题：调研纪要 / 公司深度 / 公告点评底稿" className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                      <input value={attachmentForm.url} disabled={attachmentEditing.preserveContent} onChange={(event) => setAttachmentForm((prev) => ({ ...prev, url: event.target.value }))} placeholder="粘贴链接：研报、飞书、网页、公告等" className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50 disabled:opacity-50" />
                    </div>
                    <AutoResizeTextarea value={attachmentForm.notes} disabled={attachmentEditing.preserveContent} onChange={(event) => setAttachmentForm((prev) => ({ ...prev, notes: event.target.value }))} placeholder="补充说明：这份资料解决什么问题、有哪些关键图表、后续希望 AI 提取哪些内容。" className="mt-2 w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50 disabled:opacity-50" />
                    <input value={attachmentForm.tags} onChange={(event) => setAttachmentForm((prev) => ({ ...prev, tags: event.target.value }))} placeholder="标签：研报, 调研纪要, 公告" className="mt-2 w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                    {attachmentEditing.preserveContent && (
                      <div className="mt-2 rounded-lg border border-dashed border-border/40 bg-black/10 px-3 py-2 text-xs text-muted-foreground">
                        这是上传文件生成的记录。当前支持改标题、标签或直接删除；原始文件内容保持不变，避免误改解析记录。
                      </div>
                    )}
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      <button onClick={() => void addAttachmentLink("stock")} className={primaryButtonClass}>保存投喂修改</button>
                      <button onClick={() => cancelAttachmentEdit()} className={secondaryButtonWideClass}>取消编辑</button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-[140px_minmax(0,1fr)] md:items-start">
                      <div className="rounded-xl border border-border/30 bg-black/10 px-4 py-3">
                        <p className="text-sm font-medium">上传文件</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">PDF、图片、Word、Excel、PPT 等。</p>
                      </div>
                      <div className="rounded-xl border border-border/30 bg-black/10 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <button onClick={() => attachmentFileInputRef.current?.click()} className={secondaryButtonWideClass}>
                            <Upload className="h-4 w-4" /> 上传 PDF/文件
                          </button>
                          <span className="text-[11px] text-muted-foreground">上传后会自动归档到当前个股，并进入待吸收链路。</span>
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-[140px_minmax(0,1fr)] md:items-start">
                      <div className="rounded-xl border border-border/30 bg-black/10 px-4 py-3">
                        <p className="text-sm font-medium">粘贴链接</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">网页、研报、飞书、公告等。</p>
                      </div>
                      <div className="rounded-xl border border-border/30 bg-black/10 p-3">
                        <div className="grid gap-2 md:grid-cols-2">
                          <input value={attachmentForm.title} onChange={(event) => setAttachmentForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="资料标题：调研纪要 / 公司深度 / 公告点评底稿" className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                          <input value={attachmentForm.url} onChange={(event) => setAttachmentForm((prev) => ({ ...prev, url: event.target.value }))} placeholder="粘贴链接：研报、飞书、网页、公告等" className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                        </div>
                        <div className="mt-2 flex justify-end">
                          <button onClick={() => void addAttachmentLink("stock")} className={smallSecondaryButtonClass}>保存链接投喂</button>
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-[140px_minmax(0,1fr)] md:items-start">
                      <div className="rounded-xl border border-border/30 bg-black/10 px-4 py-3">
                        <p className="text-sm font-medium">有道云笔记</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">纪要、电话会、专家会笔记。</p>
                      </div>
                      <div className="rounded-xl border border-border/30 bg-black/10 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">搜索并导入</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">搜索后可把有道笔记直接送进待吸收检查页，再按卡片批量分发。</p>
                          </div>
                          <button onClick={() => toggleYoudaoFeedAssist("stock", selectedTicker)} className={smallSecondaryButtonClass}>
                            {youdaoCandidateAssistOpen.stock ? "收起搜索笔记" : "搜索并导入"}
                          </button>
                        </div>
                        {youdaoCandidateAssistOpen.stock && (
                          <div className="mt-3 space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                value={youdaoCandidateDrafts.stock || ""}
                                onChange={(event) => setYoudaoCandidateDrafts((current) => ({ ...current, stock: event.target.value }))}
                                placeholder="搜索个股相关有道笔记关键词"
                                className="h-10 min-w-[280px] flex-1 rounded-full border border-border/30 bg-black/10 px-4 text-sm text-foreground outline-none placeholder:text-muted-foreground/45"
                              />
                              <button onClick={() => void searchYoudaoFeedNotes("stock", selectedTicker)} className={smallSecondaryButtonClass}>
                                {youdaoCandidateLoading.stock ? "搜索中..." : "搜索笔记"}
                              </button>
                            </div>
                            <div className="space-y-2">
                              {(youdaoCandidateResults.stock || []).map((item) => (
                                <div key={item.file_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/20 bg-black/10 px-3 py-2">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                                    <p className="mt-1 text-[11px] text-muted-foreground">{item.file_id}</p>
                                  </div>
                                  <button
                                    onClick={() => void importYoudaoFeedNote("stock", selectedTicker, item)}
                                    disabled={youdaoCandidateImporting.stock === item.file_id}
                                    className={smallPrimaryButtonClass}
                                  >
                                    {youdaoCandidateImporting.stock === item.file_id ? "导入中..." : "加入待吸收"}
                                  </button>
                                </div>
                              ))}
                              {!youdaoCandidateLoading.stock && (youdaoCandidateResults.stock || []).length === 0 && (
                                <div className="rounded-xl border border-dashed border-border/20 px-3 py-4 text-[11px] text-muted-foreground">
                                  先搜索笔记，再导入到待吸收。
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">附件投喂记录</p>
                <div className="space-y-2">
                  {stockManualAttachments.length === 0 ? (
                    renderCompactNotice("还没有附件投喂记录。你可以在上方粘贴链接、上传 PDF/图片/文档，或从有道笔记导入。")
                  ) : (
                    stockManualAttachments.map((item) => (
                      <div key={item.id} className="rounded-lg bg-muted/25 px-3 py-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{item.title}</p>
                          <div className="flex flex-wrap items-center gap-3">
                            <button onClick={() => beginAttachmentEdit("stock", item)} className={subtleTextButtonClass}>编辑</button>
                            <button onClick={() => requestAttachmentDelete("stock", item)} className={destructiveTextButtonClass}>删除</button>
                            {extractFirstUrl(item.content_preview || item.content || "") && (
                              <a href={extractFirstUrl(item.content_preview || item.content || "")} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                                <ExternalLink className="h-3.5 w-3.5" /> 打开链接
                              </a>
                            )}
                          </div>
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
              <GlassCard className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{selectedWeeklyEntry.title}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{selectedWeeklyEntry.date}</p>
                  </div>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">历史周度复盘</span>
                </div>
                {selectedWeeklyEntry.summary_text && renderCompactNotice(selectedWeeklyEntry.summary_text, "primary")}
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
                <div className="rounded-xl border border-border/40 bg-muted/20 p-3">
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
              {renderCompactNotice("先选择一份资料生成。之后这里会出现闯关卡片、路演页和推演问题。")}
            </GlassCard>
          )}
          {active === "learning" && selectedLearningEntry && (
            <GlassCard className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold">{selectedLearningEntry.title}</h3>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{selectedLearningEntry.date}</span>
              </div>
              {selectedLearningEntry.summary_text && renderCompactNotice(selectedLearningEntry.summary_text, "primary")}
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
      {importDialogScope && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={() => { setImportDialogScope(""); setImportSelectionIds([]); }}>
          <div className="w-full max-w-4xl rounded-3xl border border-border bg-background/95 p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">从多篇资料导入</h3>
                <p className="mt-1 text-xs text-muted-foreground">先选资料加入未分类检查页，再批量分发到对应深度卡片候选池。</p>
              </div>
              <button
                onClick={() => { setImportDialogScope(""); setImportSelectionIds([]); }}
                className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              {(importDialogScope === "sector" ? sectorImportSources : stockImportSources).length === 0 ? (
                renderCompactNotice("当前还没有可导入的附件、纪要或点评资料。")
              ) : (
                (importDialogScope === "sector" ? sectorImportSources : stockImportSources).map((item) => {
                  const checked = importSelectionIds.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      onClick={() => setImportSelectionIds((current) => checked ? current.filter((id) => id !== item.id) : [...current, item.id])}
                      className={`w-full rounded-xl border p-4 text-left transition-colors ${checked ? "border-primary/50 bg-primary/10" : "border-border/40 bg-muted/20"}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-medium">{item.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{entryTypeLabel(item.type)} · {item.date}</p>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] ${checked ? "bg-primary/15 text-primary" : "bg-black/10 text-muted-foreground"}`}>
                          {checked ? "已选中" : "点击选中"}
                        </span>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{cleanSnippet(item.summary_text || item.content_preview || item.content || "", 180)}</p>
                    </button>
                  );
                })
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => { setImportDialogScope(""); setImportSelectionIds([]); }}
                className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
              >
                取消
              </button>
              <button
                onClick={() => void confirmImportToUnclassified()}
                className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/15"
              >
                加入未分类检查页
              </button>
            </div>
          </div>
        </div>
      )}
      {compareState.candidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={() => setCompareState({ scope: "", candidate: null, targetCardId: "", targetAnchorId: "" })}>
          <div className="w-full max-w-5xl rounded-3xl border border-border bg-background/95 p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">候选变更对比</h3>
                <p className="mt-1 text-xs text-muted-foreground">{overviewCandidateSourceLabel(compareState.candidate.source_type)} · {compareState.candidate.title}</p>
              </div>
              <button
                onClick={() => setCompareState({ scope: "", candidate: null, targetCardId: "", targetAnchorId: "" })}
                className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {(() => {
              const cards = compareState.scope === "sector" ? sectorDeepCards : stockDeepCards;
              const selectedCard = cards.find((item) => item.id === compareState.targetCardId) || cards.find((item) => item.id === compareState.candidate?.matched_card_id) || cards[0];
              const anchors = selectedCard ? flattenOutlineAnchors(selectedCard.content_blocks || legacyBlocksToContentBlocks(selectedCard)) : [];
              return (
                <div className="mb-4 grid gap-3 md:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">吸收到哪张卡片</span>
                    <select
                      value={selectedCard?.id || ""}
                      onChange={(event) => setCompareState((current) => ({ ...current, targetCardId: event.target.value, targetAnchorId: "" }))}
                      className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
                    >
                      {cards.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">吸收到哪个章节/区块</span>
                    <select
                      value={compareState.targetAnchorId}
                      onChange={(event) => setCompareState((current) => ({ ...current, targetAnchorId: event.target.value }))}
                      className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
                    >
                      <option value="">先追加到卡片末尾</option>
                      {anchors.map((anchor) => <option key={anchor.id} value={anchor.id}>{anchor.kind === "section" ? `章节 · ${anchor.label}` : `区块 · ${anchor.label}`}</option>)}
                    </select>
                  </label>
                </div>
              );
            })()}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-border/40 bg-black/10 p-4">
                <p className="text-sm font-medium">原有版本</p>
                <div className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
                  {(() => {
                    const cards = compareState.scope === "sector" ? sectorDeepCards : stockDeepCards;
                    const target = cards.find((item) => item.id === compareState.targetCardId) || cards.find((item) => item.id === compareState.candidate?.matched_card_id) || cards[0];
                    return target?.body || "当前还没有命中的深度卡片，可先从初稿生成深度卡片。";
                  })()}
                </div>
              </div>
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                <p className="text-sm font-medium text-primary">候选新版本</p>
                <div className="mt-3">
                  {compareState.candidate.structured_blocks?.length ? (
                    <div className="overflow-hidden rounded-2xl border border-primary/20 bg-black/15">
                      <StructuredOverviewRenderer blocks={compareState.candidate.structured_blocks} density="draft" />
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap text-sm text-muted-foreground">
                      {compareState.candidate.proposed_patch || compareState.candidate.summary || "这条候选目前还没有提炼出正文。"}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button onClick={() => void applyCandidateDecision("ignore")} className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground">忽略</button>
              <button onClick={() => void applyCandidateDecision("append")} className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-primary">追加补充</button>
              <button onClick={() => void applyCandidateDecision("partial")} className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-primary">局部更新</button>
              <button onClick={() => void applyCandidateDecision("replace")} className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/15">替换原文</button>
            </div>
          </div>
        </div>
      )}
      {overviewMoreDrawer && (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm" onClick={() => setOverviewMoreDrawer("")}>
          <div
            className="absolute inset-y-0 right-0 w-full max-w-xl overflow-y-auto border-l border-border/50 bg-[#14111c] p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-foreground">{overviewMoreDrawer === "sector" ? "行业概览" : "个股概览"}更多操作</h3>
                <p className="mt-1 text-xs text-muted-foreground">把低频动作放进抽屉，主界面保持轻量。</p>
              </div>
              <button
                onClick={() => setOverviewMoreDrawer("")}
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-primary"
              >
                关闭
              </button>
            </div>
            {overviewMoreDrawer === "sector" ? renderOverviewMorePanel("sector", sectorReportContext) : renderOverviewMorePanel("stock", stockReportContext)}
          </div>
        </div>
      )}
      {attachmentDeleteDialog.open && attachmentDeleteDialog.entry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={() => setAttachmentDeleteDialog({ open: false, scope: "", entry: null })}>
          <div className="w-full max-w-md rounded-3xl border border-border bg-background/95 p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="font-semibold">确认删除附件</h3>
              <button
                onClick={() => setAttachmentDeleteDialog({ open: false, scope: "", entry: null })}
                className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="rounded-xl border border-border/40 bg-black/10 px-4 py-3 text-sm">
              <p className="font-medium text-foreground">{attachmentDeleteDialog.entry.title}</p>
              <p className="mt-2 text-muted-foreground">删除后这条附件记录会从当前{attachmentDeleteDialog.scope === "sector" ? "行业中心" : "个股中心"}移除。这个操作不可撤销。</p>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setAttachmentDeleteDialog({ open: false, scope: "", entry: null })}
                className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
              >
                取消
              </button>
              <button
                onClick={() => void confirmAttachmentDelete()}
                className="rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-200 hover:bg-red-500/15"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
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
