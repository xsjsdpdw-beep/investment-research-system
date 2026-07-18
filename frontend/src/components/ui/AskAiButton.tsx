import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, X, Settings, Send, Loader2, Wrench, AlertCircle, Bot, Square } from "lucide-react";
import { getModelById } from "@/lib/ai-models";
import { cn } from "@/lib/utils";
import { chatStream, hasLlm, loadLlm, type ChatMsg } from "@/lib/llm";
import { ApiError } from "@/lib/api";
import {
  cancelTradingAgentsRun,
  hasTradingAgentsConfig,
  startTradingAgentsRun,
  streamTradingAgentsRun,
  type TradingAgentsEvent,
  type TradingAgentsResult,
} from "@/lib/tradingagents";
import { SaveNoteButton } from "@/components/ui/SaveNoteButton";

interface Props {
  context: string;
  suggestions?: string[];
  label?: string;
  mode?: "chat" | "tradingagents";
  stockCode?: string;
  stockName?: string;
}

const TOOL_LABEL: Record<string, string> = {
  query_quote: "查行情",
  query_valuation: "查估值",
  query_reports: "查研报",
  query_news: "查新闻",
};

const argStr = (a: Record<string, unknown>): string => {
  if (Array.isArray(a.codes)) return (a.codes as unknown[]).join(",");
  if (typeof a.code === "string") return a.code;
  return "";
};

interface ToolUse {
  name: string;
  arg: string;
}

export function AskAiButton({
  context,
  suggestions = [],
  label = "问 AI",
  mode = "chat",
  stockCode,
  stockName,
}: Props) {
  const isTradingAgents = mode === "tradingagents";
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [msgs, setMsgs] = useState<(ChatMsg & { tools?: ToolUse[] })[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [taEvents, setTaEvents] = useState<TradingAgentsEvent[]>([]);
  const [taResult, setTaResult] = useState<TradingAgentsResult | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const currentLlm = !isTradingAgents && open ? loadLlm() : null;
  const currentModelHint = currentLlm
    ? `${getModelById(currentLlm.model)?.name || currentLlm.model} · ${currentLlm.provider.startsWith("cli-") ? "订阅接入" : "API 接入"}`
    : "";

  useEffect(() => {
    if (!open) return;
    setConfigured(isTradingAgents ? hasTradingAgentsConfig() : hasLlm());
  }, [isTradingAgents, open]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const close = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (isTradingAgents && taskId) void cancelTradingAgentsRun(taskId).catch(() => {});
    setTaskId(null);
    setLoading(false);
    setOpen(false);
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, taEvents, taResult, loading]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;
    setInput("");
    setErr(null);
    const history: ChatMsg[] = [...msgs.map(({ role, content }) => ({ role, content })), { role: "user", content: q }];
    setMsgs((m) => [...m, { role: "user", content: q }, { role: "assistant", content: "", tools: [] }]);
    setLoading(true);
    const patchLast = (fn: (msg: ChatMsg & { tools?: ToolUse[] }) => ChatMsg & { tools?: ToolUse[] }) =>
      setMsgs((m) => m.map((msg, i) => (i === m.length - 1 && msg.role === "assistant" ? fn(msg) : msg)));
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const alive = () => abortRef.current === ac && !ac.signal.aborted;
    try {
      await chatStream(history, context, {
        onTool: (tool, args) => { if (alive()) patchLast((msg) => ({ ...msg, tools: [...(msg.tools || []), { name: tool, arg: argStr(args) }] })); },
        onDelta: (t) => { if (alive()) patchLast((msg) => ({ ...msg, content: msg.content + t })); },
      }, ac.signal);
    } catch (e) {
      setMsgs((m) => m.filter((msg, i) => !(i === m.length - 1 && msg.role === "assistant" && !msg.content)));
      if (!ac.signal.aborted) setErr(e instanceof ApiError ? e.message : "对话失败");
    } finally {
      if (abortRef.current === ac) {
        abortRef.current = null;
        setLoading(false);
      }
    }
  };

  const runTradingAgents = async () => {
    if (!stockCode || loading) return;
    setErr(null);
    setTaEvents([]);
    setTaResult(null);
    setLoading(true);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const started = await startTradingAgentsRun({
        code: stockCode,
        name: stockName || "",
        context,
      });
      if (abortRef.current !== ac) return;
      setTaskId(started.taskId);
      await streamTradingAgentsRun(started.taskId, {
        onEvent: (event) => {
          if (abortRef.current !== ac || ac.signal.aborted) return;
          setTaEvents((events) => [...events, event]);
          if (event.type === "result" && event.result) setTaResult(event.result);
          if (event.type === "error") setErr(event.message || "TradingAgents 运行失败");
        },
      }, ac.signal);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setErr(e instanceof ApiError ? e.message : "TradingAgents 运行失败");
      }
    } finally {
      if (abortRef.current === ac) {
        abortRef.current = null;
        setLoading(false);
      }
    }
  };

  const stopTradingAgents = async () => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (taskId) {
      try {
        await cancelTradingAgentsRun(taskId);
      } catch {
        /* ignore cancel UI failures */
      }
    }
    setLoading(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-3 py-1.5 text-sm font-medium text-primary shadow-glow transition-colors hover:bg-primary/25"
      >
        <Sparkles className="h-4 w-4" />
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={close} />
          <aside className="glass relative m-3 flex w-full max-w-md flex-col rounded-2xl">
            <div className="border-b border-border/60 p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-semibold text-glow">
                  <Sparkles className="h-4 w-4 text-primary" />
                  {isTradingAgents ? "TradingAgents 深度分析" : "问 AI · 本页上下文"}
                  {!isTradingAgents && currentModelHint && (
                    <span className="ml-2 text-[11px] text-muted-foreground/55">
                      当前模型：<b className="font-medium text-muted-foreground/80">{currentModelHint}</b>
                    </span>
                  )}
                </span>
                <button onClick={close} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {!configured ? (
              <div className="flex-1 space-y-4 overflow-auto p-4 text-sm">
                <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-muted-foreground">
                  {isTradingAgents ? (
                    <>
                      TradingAgents 会调用一条独立的多 Agent 深度分析链路，只支持 A 股 6 位代码，且必须使用
                      <b className="text-foreground"> API 模式配置</b>。
                    </>
                  ) : (
                    <>
                      分析结论由你自己配置的 AI 给出，本产品只负责把本页数据打包成上下文、并让 AI 能调数据工具，
                      <b className="text-foreground">不校准、不背书、不对结果负责</b>。
                    </>
                  )}
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                    {isTradingAgents ? "将随深度分析带上的本页上下文：" : "将随提问发给 AI 的本页上下文："}
                  </p>
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
{context}
                  </pre>
                </div>
                <Link to="/settings" className="flex items-center justify-center gap-2 rounded-lg bg-primary/15 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/25">
                  <Settings className="h-4 w-4" />
                  {isTradingAgents ? "先配置 TradingAgents 深度分析" : "先接入你的 AI（订阅 / API）"}
                </Link>
              </div>
            ) : isTradingAgents ? (
              <>
                <div ref={scrollRef} className="flex-1 space-y-3 overflow-auto p-4 text-sm">
                  {taEvents.length === 0 && !taResult && (
                    <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-muted-foreground">
                      TradingAgents 会按多分析师拆解、辩论、汇总再输出结论。它比普通问 AI 更慢，也会消耗更多模型调用。
                      <b className="text-foreground"> 结果仅供研究，不构成投资建议。</b>
                    </div>
                  )}

                  {taEvents.map((event, idx) => (
                    <div key={`${event.type}-${event.stage || "none"}-${idx}`} className="rounded-lg bg-muted/30 p-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <Bot className="h-4 w-4 text-primary" />
                        {event.stage || "TradingAgents"}
                        <span className="text-xs text-muted-foreground">
                          {event.type === "stage_started" ? "进行中" :
                           event.type === "stage_completed" ? "已完成" :
                           event.type === "cancelled" ? "已取消" :
                           event.type === "error" ? "失败" :
                           event.type === "result" ? "已产出结果" : "更新"}
                        </span>
                      </div>
                      {event.message && <p className="mt-1.5 whitespace-pre-wrap text-xs text-muted-foreground">{event.message}</p>}
                    </div>
                  ))}

                  {taResult && (
                    <div className="space-y-3 rounded-xl bg-muted/40 p-3">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">结论摘要</p>
                        <p className="mt-1 whitespace-pre-wrap leading-relaxed">{taResult.summary || "无"}</p>
                      </div>
                      {taResult.analyst_sections.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">七个分析师要点</p>
                          <div className="mt-2 space-y-2">
                            {taResult.analyst_sections.map((section) => (
                              <div key={section.title} className="rounded-lg bg-black/20 p-2.5">
                                <p className="text-xs font-medium text-foreground">{section.title}</p>
                                <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{section.content}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {(taResult.debate_summary || taResult.risk_summary) && (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="rounded-lg bg-black/20 p-2.5">
                            <p className="text-xs font-medium text-foreground">多空辩论结论</p>
                            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{taResult.debate_summary || "无"}</p>
                          </div>
                          <div className="rounded-lg bg-black/20 p-2.5">
                            <p className="text-xs font-medium text-foreground">交易与风险结论</p>
                            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{taResult.risk_summary || "无"}</p>
                          </div>
                        </div>
                      )}
                      {taResult.full_report && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">完整原始报告</p>
                          <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-[11px] leading-relaxed text-muted-foreground">
{taResult.full_report}
                          </pre>
                        </div>
                      )}
                      <SaveNoteButton
                        kind="问AI"
                        title={`TradingAgents · ${stockName || stockCode || "深度分析"}`}
                        content={taResult.full_report || taResult.summary || ""}
                      />
                    </div>
                  )}

                  {loading && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> TradingAgents 正在运行多 Agent 深度分析…
                    </div>
                  )}
                  {err && (
                    <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {err}
                    </div>
                  )}
                </div>

                <div className="border-t border-border/60 p-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => void runTradingAgents()}
                      disabled={loading || !stockCode}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary/15 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/25 disabled:opacity-40"
                    >
                      <Sparkles className="h-4 w-4" />
                      {taResult ? "重新运行深度分析" : "开始深度分析"}
                    </button>
                    {loading && (
                      <button
                        onClick={() => void stopTradingAgents()}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
                      >
                        <Square className="h-4 w-4" /> 停止
                      </button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div ref={scrollRef} className="flex-1 space-y-3 overflow-auto p-4 text-sm">
                  {msgs.length === 0 && (
                    <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-muted-foreground">
                      AI 可基于本页上下文、并自行调取 A股行情/估值/研报数据作答。结论由你的模型给出，
                      <b className="text-foreground">不构成投资建议</b>。
                    </div>
                  )}
                  {msgs.map((m, i) => (
                    <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                      <div className={cn(
                        "max-w-[85%] rounded-2xl px-3 py-2 leading-relaxed",
                        m.role === "user" ? "bg-primary/20 text-foreground" : "bg-muted/40 text-foreground",
                      )}>
                        {m.tools && m.tools.length > 0 && (
                          <div className="mb-1.5 flex flex-wrap items-center gap-1">
                            <span className="text-[10px] text-muted-foreground/70">数据来源</span>
                            {m.tools.map((t, j) => (
                              <span key={j} className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                                <Wrench className="h-2.5 w-2.5" /> {TOOL_LABEL[t.name] || t.name}{t.arg ? ` ${t.arg}` : ""}
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="whitespace-pre-wrap">{m.content}</p>
                        {m.role === "assistant" && m.content && !(loading && i === msgs.length - 1) && (
                          <div className="mt-1.5">
                            <SaveNoteButton kind="问AI" title={`问 AI · ${msgs[i - 1]?.content?.slice(0, 24) || "对话"}`} content={m.content} />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> AI 正在思考 / 调取数据…
                    </div>
                  )}
                  {err && (
                    <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {err}
                    </div>
                  )}
                  {msgs.length === 0 && suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {suggestions.map((s) => (
                        <button key={s} onClick={() => send(s)} className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs hover:border-primary/40 hover:text-primary">
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border-t border-border/60 p-3">
                  <div className="flex items-end gap-2">
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
                      rows={1}
                      placeholder="就本页内容提问…"
                      className="flex-1 resize-none rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
                    />
                    <button
                      onClick={() => send(input)}
                      disabled={loading || !input.trim()}
                      className="rounded-lg bg-primary/15 p-2 text-primary hover:bg-primary/25 disabled:opacity-40"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
