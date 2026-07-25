import { AudioLines, CircleDot, ShieldCheck } from "lucide-react";
import { FieldResearch } from "@/pages/FieldResearch";

export function StandaloneFieldResearch() {
  return (
    <div className="min-h-screen bg-[#0c0f14] text-foreground">
      <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <header className="mb-7 flex flex-col gap-5 border-b border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#ff9b5c]/30 bg-[#ff9b5c]/10 text-[#ffae73] shadow-[0_0_34px_rgba(255,155,92,0.12)]">
              <AudioLines className="h-6 w-6" />
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#ffae73]/80">Field note / capture</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[#f7f2eb] sm:text-4xl">现场调研工作台</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#a5adb9]">
                把注意力留给对话，把听到的内容留给证据整理。先捕捉，再确认，不让对方口径悄悄变成事实。
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#8f99a8]">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#8ae6ff]/20 bg-[#8ae6ff]/5 px-3 py-1.5 text-[#8ae6ff]">
              <CircleDot className="h-3 w-3" /> 独立原型
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5">
              <ShieldCheck className="h-3 w-3" /> 证据优先
            </span>
          </div>
        </header>

        <div className="mb-6 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#ffae73]">01 / Capture</p>
            <p className="mt-1 text-sm text-[#e7e2dc]">实时语音或外部转写</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#8ae6ff]">02 / Sort</p>
            <p className="mt-1 text-sm text-[#e7e2dc]">自动进入对应模块</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#9fe3b1]">03 / Output</p>
            <p className="mt-1 text-sm text-[#e7e2dc]">观点先行，事实自动编号</p>
          </div>
        </div>

        <FieldResearch standalone />
      </div>
    </div>
  );
}
