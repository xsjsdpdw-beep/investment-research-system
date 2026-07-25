import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpenText,
  Check,
  CircleAlert,
  FileCheck2,
  Loader2,
  Mic,
  Plus,
  Save,
  Settings2,
  Square,
  Trash2,
  Upload,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Disclaimer } from "@/components/ui/Disclaimer";
import { ApiError, api, type FieldResearchTranscriptionStatus, type KnowledgeEntry } from "@/lib/api";
import {
  buildFieldResearchMarkdown,
  classifyFieldResearchText,
  createCustomFieldResearchModule,
  DEFAULT_FIELD_RESEARCH_MODULES,
  type FieldResearchModule,
  type FieldResearchSegment,
} from "@/lib/field-research";

interface BrowserSpeechResult {
  isFinal: boolean;
  0: { transcript: string };
}

interface BrowserSpeechEvent {
  resultIndex: number;
  results: ArrayLike<BrowserSpeechResult>;
}

interface BrowserSpeechErrorEvent {
  error: string;
}

interface BrowserSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: BrowserSpeechEvent) => void) | null;
  onerror: ((event: BrowserSpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface BrowserSpeechRecognitionConstructor {
  new (): BrowserSpeechRecognition;
}

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  }
}

function todayDate() {
  return new Date().toLocaleDateString("sv-SE");
}

function currentTime() {
  return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function readFieldResearchModules(): FieldResearchModule[] {
  try {
    const raw = localStorage.getItem("field-research-modules");
    const saved = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(saved)) return DEFAULT_FIELD_RESEARCH_MODULES;
    const custom = saved.filter(
      (item): item is FieldResearchModule => Boolean(item && typeof item.id === "string" && typeof item.label === "string" && !item.builtIn),
    );
    return [...DEFAULT_FIELD_RESEARCH_MODULES, ...custom];
  } catch {
    return DEFAULT_FIELD_RESEARCH_MODULES;
  }
}

function splitManualTranscript(text: string) {
  return text
    .split(/\n+|(?<=[。！？!?；;])/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatAudioTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function sourceLabel(source: FieldResearchSegment["source"]) {
  if (source === "audio_upload") return "音频转写";
  if (source === "manual") return "粘贴转写";
  return "实时转写";
}

export function FieldResearch({ standalone = false }: { standalone?: boolean }) {
  const [modules, setModules] = useState<FieldResearchModule[]>(readFieldResearchModules);
  const [segments, setSegments] = useState<FieldResearchSegment[]>([]);
  const [subject, setSubject] = useState("");
  const [speaker, setSpeaker] = useState("公司管理层 / 对方");
  const [ticker, setTicker] = useState("");
  const [sector, setSector] = useState("");
  const [date, setDate] = useState(todayDate());
  const [draftTitle, setDraftTitle] = useState("");
  const [manualText, setManualText] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState("");
  const [audioBusy, setAudioBusy] = useState(false);
  const [audioError, setAudioError] = useState("");
  const [audioEngineStatus, setAudioEngineStatus] = useState<FieldResearchTranscriptionStatus | null>(null);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [recording, setRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [speechError, setSpeechError] = useState("");
  const [saving, setSaving] = useState(false);
  const [newModuleLabel, setNewModuleLabel] = useState("");
  const [savedNotes, setSavedNotes] = useState<KnowledgeEntry[]>([]);
  const [historyError, setHistoryError] = useState("");

  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const recordingRef = useRef(false);
  const moduleRef = useRef(modules);
  const segmentCounterRef = useRef(0);
  const startedAtRef = useRef<number | null>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const speechSupported = typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    moduleRef.current = modules;
    try {
      localStorage.setItem("field-research-modules", JSON.stringify(modules.filter((module) => !module.builtIn)));
    } catch {
      /* localStorage 不可用时仍保留本次会话的模块。 */
    }
  }, [modules]);

  useEffect(() => {
    if (!recording) return undefined;
    const timer = window.setInterval(() => {
      if (startedAtRef.current) setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    let active = true;
    void api.knowledgeEntries({ kind: "research_note" }).then((rows) => {
      if (!active) return;
      setSavedNotes(rows.filter((entry) => entry.tags.includes("现场调研")));
    }).catch((error) => {
      if (active) setHistoryError(error instanceof ApiError ? error.message : "历史纪要暂时无法读取");
    });
    return () => {
      active = false;
      recordingRef.current = false;
      recognitionRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    let active = true;
    void api.fieldResearchTranscriptionStatus().then((status) => {
      if (active) setAudioEngineStatus(status);
    }).catch(() => {
      if (active) setAudioEngineStatus(null);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    };
  }, [audioPreviewUrl]);

  const appendSegment = (text: string, capturedAt = currentTime(), source: FieldResearchSegment["source"] = "live") => {
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean) return;
    const classification = classifyFieldResearchText(clean, moduleRef.current);
    segmentCounterRef.current += 1;
    setSegments((current) => [
      ...current,
      {
        id: `field-segment-${Date.now()}-${segmentCounterRef.current}`,
        text: clean,
        ...classification,
        capturedAt,
        source,
      },
    ]);
  };

  const stopRecording = () => {
    recordingRef.current = false;
    setRecording(false);
    setInterimTranscript("");
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  };

  const startRecording = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setSpeechError("当前浏览器不支持实时语音识别。可以把其他录音转写结果粘贴到下方继续整理。");
      return;
    }

    setSpeechError("");
    const recognition = new Recognition();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript || "";
        if (result.isFinal) appendSegment(transcript, currentTime(), "live");
        else interim += transcript;
      }
      setInterimTranscript(interim.trim());
    };
    recognition.onerror = (event) => {
      const message = event.error === "not-allowed" || event.error === "service-not-allowed"
        ? "麦克风权限未开启，请允许当前页面使用麦克风。"
        : `语音识别提示：${event.error}`;
      setSpeechError(message);
      if (event.error === "not-allowed" || event.error === "service-not-allowed") stopRecording();
    };
    recognition.onend = () => {
      if (!recordingRef.current) return;
      window.setTimeout(() => {
        if (!recordingRef.current) return;
        try {
          recognition.start();
        } catch {
          /* 浏览器在重启间隔内拒绝 start 时，下一次 onend 会再次尝试。 */
        }
      }, 180);
    };
    recognitionRef.current = recognition;
    recordingRef.current = true;
    startedAtRef.current = Date.now();
    setElapsedSeconds(0);
    setRecording(true);
    try {
      recognition.start();
    } catch {
      recordingRef.current = false;
      setRecording(false);
      setSpeechError("无法启动麦克风，请检查浏览器权限后重试。");
    }
  };

  const addManualTranscript = () => {
    const chunks = splitManualTranscript(manualText);
    if (!chunks.length) {
      toast.error("先粘贴一段转写文字");
      return;
    }
    chunks.forEach((chunk) => appendSegment(chunk, currentTime(), "manual"));
    setManualText("");
    toast.success(`已加入 ${chunks.length} 段转写，并完成模块归类`);
  };

  const selectAudioFile = (file: File | null) => {
    if (!file) return;
    const supported = file.type.startsWith("audio/") || /\.(aac|flac|m4a|mp3|mp4|ogg|wav|webm)$/i.test(file.name);
    if (!supported) {
      setAudioError("请选择 m4a、mp3、wav、webm、ogg、flac、aac 或 mp4 音频文件。");
      return;
    }
    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    setAudioFile(file);
    setAudioPreviewUrl(URL.createObjectURL(file));
    setAudioError("");
  };

  const transcribeUploadedAudio = async () => {
    if (!audioFile) {
      setAudioError("先选择一段音频");
      return;
    }
    setAudioBusy(true);
    setAudioError("");
    try {
      const result = await api.transcribeFieldResearchAudio(audioFile);
      result.segments.forEach((segment) => appendSegment(segment.text, formatAudioTime(segment.start), "audio_upload"));
      if (!result.segments.length) {
        setAudioError("音频没有识别出可用语句，请换一段更清晰的录音。");
      } else {
        toast.success(`音频转写完成，已加入 ${result.segments.length} 段内容`);
      }
    } catch (error) {
      setAudioError(error instanceof ApiError ? error.message : "音频转写失败");
    } finally {
      setAudioBusy(false);
    }
  };

  const updateSegment = (id: string, patch: Partial<Pick<FieldResearchSegment, "text" | "moduleId">>) => {
    setSegments((current) => current.map((segment) => segment.id === id ? { ...segment, ...patch } : segment));
  };

  const removeSegment = (id: string) => {
    setSegments((current) => current.filter((segment) => segment.id !== id));
  };

  const addModule = () => {
    const module = createCustomFieldResearchModule(newModuleLabel);
    if (!module) {
      toast.error("模块名称不能为空");
      return;
    }
    if (modules.some((item) => item.label === module.label || item.id === module.id)) {
      toast.info("这个模块已经存在");
      return;
    }
    setModules((current) => [...current, module]);
    setNewModuleLabel("");
    toast.success(`已新增模块「${module.label}」`);
  };

  const removeModule = (moduleId: string) => {
    const module = modules.find((item) => item.id === moduleId);
    if (!module || module.builtIn) return;
    setModules((current) => current.filter((item) => item.id !== moduleId));
    setSegments((current) => current.map((segment) => segment.moduleId === moduleId ? { ...segment, moduleId: "other" } : segment));
  };

  const clearDraft = () => {
    if (segments.length && !window.confirm("清空当前现场转写草稿？已保存的纪要不会受影响。")) return;
    stopRecording();
    setSegments([]);
    setInterimTranscript("");
    setElapsedSeconds(0);
  };

  const saveNote = async () => {
    if (!segments.length) {
      toast.error("还没有可保存的转写内容");
      return;
    }
    setSaving(true);
    const title = draftTitle.trim() || `现场调研 · ${subject.trim() || date}`;
    const content = buildFieldResearchMarkdown({ date, subject, speaker, ticker, sector, segments, modules });
    try {
      const created = await api.createKnowledgeEntry({
        title,
        type: "research_note",
        content,
        date,
        tags: ["现场调研", ...modules.filter((module) => segments.some((segment) => segment.moduleId === module.id)).map((module) => module.label)],
        related_sectors: sector.trim() ? [sector.trim()] : [],
        related_stocks: ticker.trim() ? [ticker.trim()] : [],
      });
      setSavedNotes((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      toast.success("现场调研纪要已保存到研究记录");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "保存现场调研纪要失败");
    } finally {
      setSaving(false);
    }
  };

  const moduleCounts = useMemo(() => {
    return new Map(modules.map((module) => [module.id, segments.filter((segment) => segment.moduleId === module.id).length]));
  }, [modules, segments]);

  const formattedElapsed = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:${String(elapsedSeconds % 60).padStart(2, "0")}`;

  return (
    <div>
      {!standalone && (
        <PageHeader
          title="现场调研"
          subtitle="边对话边转写，自动归入管理、业务、财务等大模块；保存时观点先行，再列事实 1、事实 2、事实 3。"
          actions={(
            <button onClick={clearDraft} className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground">
              <Trash2 className="h-3.5 w-3.5" />
              清空草稿
            </button>
          )}
        />
      )}

      {standalone && (
        <div className="mb-4 flex justify-end">
          <button onClick={clearDraft} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-[#a5adb9] hover:border-[#ff9b5c]/40 hover:text-[#f7f2eb]">
            <Trash2 className="h-3.5 w-3.5" />
            清空草稿
          </button>
        </div>
      )}

      <div className="space-y-4">
        <GlassCard className="space-y-4" glow={recording}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Mic className="h-5 w-5 text-primary" />
                <h2 className="font-semibold">开始现场记录</h2>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                实时识别在浏览器内工作，不保存音频；每句完成后立即归档到下面的模块。首次使用需要允许麦克风权限。
              </p>
            </div>
            <div className={`rounded-full border px-3 py-1.5 text-xs ${recording ? "border-rose-400/40 bg-rose-400/10 text-rose-300" : "border-border/60 text-muted-foreground"}`}>
              {recording ? `录音中 · ${formattedElapsed}` : "未开始"}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="调研对象 / 公司" className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50 xl:col-span-2" />
            <input value={speaker} onChange={(event) => setSpeaker(event.target.value)} placeholder="对方身份" className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
            <input value={ticker} onChange={(event) => setTicker(event.target.value)} placeholder="股票代码（可选）" className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
            <input value={sector} onChange={(event) => setSector(event.target.value)} placeholder="行业（可选）" className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
          </div>
          <div className="grid gap-3 md:grid-cols-[160px_minmax(0,1fr)]">
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
            <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="纪要标题可选，不填则按对象和日期自动命名" className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={recording ? stopRecording : startRecording}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-glow ${recording ? "bg-rose-500/15 text-rose-300 hover:bg-rose-500/25" : "bg-primary/15 text-primary hover:bg-primary/25"}`}
            >
              {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              {recording ? "停止转写" : "开始实时转写"}
            </button>
            {!speechSupported && <span className="text-xs text-amber-300">当前浏览器没有实时语音识别，可使用下方粘贴入口。</span>}
            {speechError && <span className="inline-flex items-center gap-1 text-xs text-rose-300"><CircleAlert className="h-3.5 w-3.5" />{speechError}</span>}
          </div>
          {interimTranscript && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary/80">
              <span className="mr-2 text-[11px] uppercase tracking-[0.15em] text-primary/60">正在听</span>{interimTranscript}
            </div>
          )}
        </GlassCard>

        <GlassCard className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-primary" />
              <div>
                <h2 className="font-semibold">上传语音文件</h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">上传已有录音，转写后沿用同一套模块归类；音频文件只用于本次转写，转写文字会写入纪要。</p>
              </div>
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-[10px] ${audioEngineStatus?.available ? "border-emerald-400/30 bg-emerald-400/5 text-emerald-300" : "border-amber-400/30 bg-amber-400/5 text-amber-300"}`}>
              {audioEngineStatus ? (audioEngineStatus.available ? `本地 ${audioEngineStatus.engine} · ${audioEngineStatus.model}` : "本地转写引擎未安装") : "正在检查转写引擎"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input ref={audioInputRef} type="file" accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg,.flac,.aac,.mp4" className="hidden" onChange={(event) => { selectAudioFile(event.target.files?.[0] || null); event.target.value = ""; }} />
            <button onClick={() => audioInputRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20">
              <Upload className="h-3.5 w-3.5" />选择音频
            </button>
            {audioFile && <span className="max-w-full truncate text-xs text-foreground">{audioFile.name} · {(audioFile.size / 1024 / 1024).toFixed(1)}MB</span>}
            {audioFile && <button onClick={() => void transcribeUploadedAudio()} disabled={audioBusy} className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-3 py-2 text-xs font-medium text-primary shadow-glow hover:bg-primary/25 disabled:opacity-50">{audioBusy ? "转写中…" : "上传并转写"}</button>}
          </div>
          {audioPreviewUrl && <audio controls src={audioPreviewUrl} className="h-9 w-full max-w-xl" />}
          {audioEngineStatus && !audioEngineStatus.available && <p className="text-xs text-amber-300">{audioEngineStatus.message}当前仍可使用实时转写或粘贴文字。</p>}
          {audioError && <p className="text-xs text-rose-300">{audioError}</p>}
        </GlassCard>

        <GlassCard className="space-y-3">
          <div className="flex items-center gap-2">
            <WandSparkles className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">补充转写文字</h2>
            <span className="text-xs text-muted-foreground">浏览器不支持或需要整理外部录音时使用</span>
          </div>
          <textarea value={manualText} onChange={(event) => setManualText(event.target.value)} rows={3} placeholder="粘贴一段转写文字；按句号、问号、分号或换行拆分后自动归类。" className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50" />
          <div className="flex justify-end">
            <button onClick={addManualTranscript} className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20">
              <Plus className="h-3.5 w-3.5" />加入纪要
            </button>
          </div>
        </GlassCard>

        <GlassCard className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-primary" />
              <div>
                <h2 className="font-semibold">纪要模块</h2>
                <p className="mt-1 text-xs text-muted-foreground">管理、业务、财务和其他是起点，可新增模块；自动归类后仍可调整所属模块。</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input value={newModuleLabel} onChange={(event) => setNewModuleLabel(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addModule(); }} placeholder="新增模块名称" className="w-36 rounded-lg border border-border bg-black/20 px-3 py-2 text-xs outline-none focus:border-primary/50" />
              <button onClick={addModule} className="inline-flex items-center gap-1 rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground"><Plus className="h-3.5 w-3.5" />新增</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {modules.map((module) => (
              <span key={module.id} className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-black/10 px-2.5 py-1 text-[11px] text-muted-foreground">
                {module.label} · {moduleCounts.get(module.id) || 0}
                {!module.builtIn && <button onClick={() => removeModule(module.id)} className="ml-0.5 text-muted-foreground hover:text-destructive" title={`删除${module.label}`}><Trash2 className="h-3 w-3" /></button>}
              </span>
            ))}
          </div>
        </GlassCard>

        <div className="grid gap-4 xl:grid-cols-3">
          {modules.map((module) => {
            const moduleSegments = segments.filter((segment) => segment.moduleId === module.id);
            return (
              <GlassCard key={module.id} className="space-y-3">
                <div className="flex items-center justify-between gap-2 border-b border-border/30 pb-3">
                  <div>
                    <h2 className="font-semibold">{module.label}</h2>
                    <p className="mt-1 text-[11px] text-muted-foreground">{moduleSegments.length} 段 · 自动归类可手动修正</p>
                  </div>
                  <FileCheck2 className="h-4 w-4 text-primary/70" />
                </div>
                {!moduleSegments.length ? (
                  <div className="rounded-xl bg-muted/15 px-3 py-8 text-center text-xs text-muted-foreground">对话开始后，相关内容会自动出现在这里。</div>
                ) : (
                  <div className="space-y-3">
                    {moduleSegments.map((segment) => (
                      <div key={segment.id} className="space-y-2 rounded-xl border border-border/40 bg-black/10 p-3">
                        <textarea value={segment.text} onChange={(event) => updateSegment(segment.id, { text: event.target.value })} rows={3} className="w-full resize-y rounded-lg border border-border/40 bg-black/15 px-2.5 py-2 text-sm leading-relaxed outline-none focus:border-primary/50" />
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-muted-foreground/70">{segment.capturedAt} · {sourceLabel(segment.source)} · 自动归类</span>
                          <button onClick={() => removeSegment(segment.id)} className="text-muted-foreground hover:text-destructive" title="移除这段"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                        <select value={segment.moduleId} onChange={(event) => updateSegment(segment.id, { moduleId: event.target.value })} className="w-full rounded-md border border-border/40 bg-black/20 px-2 py-1.5 text-[11px] text-muted-foreground outline-none focus:border-primary/50">
                          {modules.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </GlassCard>
            );
          })}
        </div>

        <GlassCard className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Save className="h-4 w-4 text-primary" />
              <div>
                <h2 className="font-semibold">保存为正式纪要</h2>
                <p className="mt-1 text-xs text-muted-foreground">保存后进入研究记录：每个模块先列观点，再按事实 1、事实 2、事实 3 编号；文末保留原始转写。</p>
              </div>
            </div>
            <button onClick={() => void saveNote()} disabled={saving || !segments.length} className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-4 py-2 text-sm font-medium text-primary shadow-glow hover:bg-primary/25 disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "保存中…" : "保存现场调研纪要"}
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-sky-400/20 bg-sky-400/5 px-3 py-3"><p className="text-xs font-medium text-sky-300">观点先行</p><p className="mt-1 text-[11px] text-muted-foreground">系统根据“预计、计划、我们认为”等表达自动提取到每个模块开头。</p></div>
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-3 py-3"><p className="text-xs font-medium text-emerald-300">事实自动编号</p><p className="mt-1 text-[11px] text-muted-foreground">其他内容依次生成事实 1、事实 2、事实 3；数字仍建议回听或外部复核。</p></div>
          </div>
        </GlassCard>

        <GlassCard className="space-y-3">
          <div className="flex items-center gap-2"><BookOpenText className="h-4 w-4 text-primary" /><h2 className="font-semibold">已保存的现场纪要</h2><span className="text-xs text-muted-foreground">{savedNotes.length} 条</span></div>
          {historyError ? <p className="text-xs text-muted-foreground">历史纪要暂不可读：{historyError}</p> : null}
          {!savedNotes.length && !historyError ? <p className="rounded-xl bg-muted/15 px-3 py-5 text-center text-xs text-muted-foreground">本地还没有保存过现场调研纪要。</p> : null}
          {savedNotes.length ? (
            <div className="grid gap-2 md:grid-cols-2">
              {savedNotes.slice(0, 8).map((entry) => (
                <div key={entry.id} className="rounded-xl border border-border/40 bg-black/10 px-3 py-3">
                  <div className="flex items-start justify-between gap-2"><p className="text-sm font-medium">{entry.title}</p><Check className="h-4 w-4 shrink-0 text-emerald-300" /></div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{entry.date || "未设置日期"} · {entry.tags.filter((tag) => tag !== "现场调研").join(" / ") || "已结构化"}</p>
                  <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{entry.content_preview || entry.summary_text || "已保存，打开研究记录查看完整内容。"}</p>
                </div>
              ))}
            </div>
          ) : null}
        </GlassCard>
      </div>

      {!standalone && <Disclaimer />}
    </div>
  );
}
