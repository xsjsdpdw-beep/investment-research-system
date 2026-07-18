import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FileSpreadsheet, LayoutPanelTop, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Disclaimer } from "@/components/ui/Disclaimer";
import { SectionTabs } from "@/components/ui/SectionTabs";
import { TEMPLATE_TABS } from "@/lib/workspace";

const TEMPLATE_PANEL_COPY = {
  "key-database": {
    title: "关键数据库模板",
    icon: FileSpreadsheet,
    summary: "把你高频更新的个股关键数据库固化成标准模板，后面只要替换股票代码和基础信息，就能生成同结构的新版本。",
    bullets: [
      "预留财报更新后的核心字段区，比如经营数据、盈利预测、估值和跟踪备注。",
      "预留模板输入区，后续可接你提供的 Excel 样式、页签结构和字段说明。",
      "预留生成入口位，后续可扩成选择股票代码后一键产出新模板。",
    ],
    nextStep: "下一步你把想复刻的关键数据库样例给我，我们就按这个入口把真实模板接进来。",
  },
  ppt: {
    title: "PPT 模板",
    icon: LayoutPanelTop,
    summary: "把常用汇报页的版式、页面顺序和固定模块先占住，后续可以沉淀成按个股、行业或主题复用的演示模板。",
    bullets: [
      "预留封面、核心结论、财务对比、催化与风险等常见页面结构。",
      "预留视觉规范位，后续可补标题层级、配色和图表样式要求。",
      "预留生成链路位，后续可接内容填充后直接产出同风格 PPT。",
    ],
    nextStep: "等你给我一份希望固化的 PPT 样板后，这里就可以升级成真实模板中心。",
  },
} as const;

type TemplateTabKey = keyof typeof TEMPLATE_PANEL_COPY;

export function Template() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [active, setActive] = useState<TemplateTabKey>("key-database");

  useEffect(() => {
    const sub = searchParams.get("sub");
    if (sub && TEMPLATE_TABS.some((tab) => tab.key === sub) && sub !== active) {
      setActive(sub as TemplateTabKey);
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

  const panel = TEMPLATE_PANEL_COPY[active];
  const Icon = panel.icon;

  return (
    <div>
      <PageHeader
        title="模板"
        subtitle="先把高频复用模板的入口搭起来，后续承接关键数据库和 PPT 的一键生成。"
      />
      <div className="space-y-4">
        <SectionTabs tabs={TEMPLATE_TABS} active={active} onChange={(key) => setActive(key as TemplateTabKey)} draggableStorageKey="template-tab-order" />

        <GlassCard>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="rounded-xl bg-primary/15 p-2 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{panel.title}</h3>
                  <p className="text-sm text-muted-foreground">{panel.summary}</p>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {panel.bullets.map((item) => (
                  <div key={item} className="rounded-2xl border border-border/40 bg-black/10 p-4 text-sm text-muted-foreground">
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div className="min-w-[220px] rounded-2xl border border-primary/20 bg-primary/8 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <Sparkles className="h-4 w-4" />
                未来生成入口
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                这里后续可以接模板上传、字段映射、股票代码切换和一键生成动作。
              </p>
            </div>
          </div>
        </GlassCard>

        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <GlassCard>
            <h3 className="mb-3 font-semibold">当前占位结构</h3>
            <div className="space-y-3 text-sm text-muted-foreground">
              <div className="rounded-2xl border border-border/40 p-4">
                <p className="font-medium text-foreground">模板定义</p>
                <p className="mt-1">存放模板名称、适用场景、固定字段、页面结构和后续生成规则。</p>
              </div>
              <div className="rounded-2xl border border-border/40 p-4">
                <p className="font-medium text-foreground">样例输入</p>
                <p className="mt-1">后续可上传你现有的 Excel / PPT 样板，作为固化模板的源文件。</p>
              </div>
              <div className="rounded-2xl border border-border/40 p-4">
                <p className="font-medium text-foreground">生成结果</p>
                <p className="mt-1">后续展示按新股票代码或新主题生成出的模板文件与预览。</p>
              </div>
            </div>
          </GlassCard>

          <GlassCard>
            <h3 className="mb-3 font-semibold">下一步接入方式</h3>
            <div className="space-y-3 text-sm text-muted-foreground">
              <div className="rounded-2xl border border-dashed border-border/50 p-4">
                1. 给我一份你想固化的真实模板样例。
              </div>
              <div className="rounded-2xl border border-dashed border-border/50 p-4">
                2. 我来拆字段、页签和固定格式，沉淀成可复用模板。
              </div>
              <div className="rounded-2xl border border-dashed border-border/50 p-4">
                3. 再把“换股票代码后一键生成”的动作接到这里。
              </div>
              <p>{panel.nextStep}</p>
            </div>
          </GlassCard>
        </div>
      </div>

      <Disclaimer />
    </div>
  );
}
