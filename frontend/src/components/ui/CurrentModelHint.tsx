import { getModelById } from "@/lib/ai-models";
import { DEFAULT_MODEL_HINT_CLASSNAME } from "@/lib/current-model-hint";
import { loadLlm } from "@/lib/llm";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

function currentModelLabel() {
  const llm = loadLlm();
  if (!llm) return "";
  const mode = llm.provider.startsWith("cli-") ? "订阅接入" : "API 接入";
  return `${getModelById(llm.model)?.name || llm.model} · ${mode}`;
}

export function CurrentModelHint({ className }: Props) {
  const label = currentModelLabel();
  if (!label) return null;
  return (
    <span className={cn(DEFAULT_MODEL_HINT_CLASSNAME, className)}>
      当前模型：<b className="font-medium text-muted-foreground/80">{label}</b>
    </span>
  );
}
