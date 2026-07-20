import { ApiError, authHeaders } from "./api";
import { isCliProvider, normalizeModelId } from "./ai-models";
import { loadLlm } from "./llm";

export interface TradingAgentsConfig {
  enabled: boolean;
  provider: string;
  baseURL: string;
  apiKey: string;
  deepModel: string;
  quickModel: string;
}

export interface TradingAgentsRunInput {
  code: string;
  name: string;
  context: string;
}

export interface TradingAgentsResult {
  summary: string;
  analyst_sections: Array<{ title: string; content: string }>;
  debate_summary: string;
  risk_summary: string;
  full_report: string;
  raw_decision: string;
}

export interface TradingAgentsEvent {
  type: "task_started" | "stage_started" | "stage_completed" | "log" | "result" | "error" | "cancelled";
  taskId: string;
  stage?: string;
  message?: string;
  result?: TradingAgentsResult;
  code?: string;
}

export interface TradingAgentsStreamHandlers {
  onEvent?: (event: TradingAgentsEvent) => void;
}

const KEY = "vr-tradingagents";

export function loadTradingAgentsConfig(): TradingAgentsConfig | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TradingAgentsConfig;
    const cfg = {
      ...parsed,
      deepModel: normalizeModelId(parsed.deepModel),
      quickModel: normalizeModelId(parsed.quickModel),
    };
    if (!cfg.enabled) return null;
    if (!cfg.provider || !cfg.baseURL || !cfg.apiKey || !cfg.deepModel || !cfg.quickModel) return null;
    return cfg;
  } catch {
    return null;
  }
}

export function resolveTradingAgentsConfig(): TradingAgentsConfig | null {
  const explicit = loadTradingAgentsConfig();
  if (explicit) return explicit;

  const llm = loadLlm();
  if (!llm || isCliProvider(llm.provider)) return null;

  return {
    enabled: true,
    provider: llm.provider,
    baseURL: llm.baseURL,
    apiKey: llm.apiKey,
    deepModel: llm.model,
    quickModel: llm.model,
  };
}

export function saveTradingAgentsConfig(cfg: TradingAgentsConfig) {
  localStorage.setItem(KEY, JSON.stringify({
    ...cfg,
    deepModel: normalizeModelId(cfg.deepModel),
    quickModel: normalizeModelId(cfg.quickModel),
  }));
}

export function clearTradingAgentsConfig() {
  localStorage.removeItem(KEY);
}

export function hasTradingAgentsConfig(): boolean {
  return resolveTradingAgentsConfig() !== null;
}

export async function startTradingAgentsRun(input: TradingAgentsRunInput): Promise<{ taskId: string }> {
  const cfg = resolveTradingAgentsConfig();
  if (!cfg) throw new ApiError("尚未配置 TradingAgents 深度分析。请先填写独立 API 配置，或先在上方完成默认 API 接入。", 400);

  let resp: Response;
  try {
    resp = await fetch("/api/tradingagents/run", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ ...input, config: cfg }),
    });
  } catch {
    throw new ApiError("连接不到后端，请先启动 backend 服务", 0);
  }

  let body: any = null;
  try { body = await resp.json(); } catch { /* ignore */ }
  if (!resp.ok) {
    if (resp.status === 401) {
      throw new ApiError("后端开启了访问鉴权（VR_API_KEY）：请在「接入 AI」页底部填写后端访问密钥", 401);
    }
    throw new ApiError(body?.detail || `HTTP ${resp.status}`, resp.status);
  }

  return body;
}

export async function streamTradingAgentsRun(
  taskId: string,
  handlers: TradingAgentsStreamHandlers = {},
  signal?: AbortSignal,
): Promise<void> {
  let resp: Response;
  try {
    resp = await fetch(`/api/tradingagents/stream/${taskId}`, {
      method: "GET",
      headers: { ...authHeaders() },
      signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError("连接不到后端，无法接收 TradingAgents 进度", 0);
  }

  if (!resp.ok) {
    let body: any = null;
    try { body = await resp.json(); } catch { /* ignore */ }
    throw new ApiError(body?.detail || `HTTP ${resp.status}`, resp.status);
  }
  if (!resp.body) throw new ApiError("后端无 TradingAgents 进度流", 502);

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let errMsg: string | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      let ev: TradingAgentsEvent;
      try { ev = JSON.parse(t) as TradingAgentsEvent; } catch { continue; }
      handlers.onEvent?.(ev);
      if (ev.type === "error") errMsg = ev.message || "TradingAgents 运行失败";
    }
  }

  if (errMsg) throw new ApiError(errMsg, 502);
}

export async function cancelTradingAgentsRun(taskId: string): Promise<void> {
  let resp: Response;
  try {
    resp = await fetch(`/api/tradingagents/cancel/${taskId}`, {
      method: "POST",
      headers: { ...authHeaders() },
    });
  } catch {
    throw new ApiError("取消 TradingAgents 任务失败，后端不可达", 0);
  }

  if (!resp.ok) {
    let body: any = null;
    try { body = await resp.json(); } catch { /* ignore */ }
    throw new ApiError(body?.detail || `HTTP ${resp.status}`, resp.status);
  }
}
