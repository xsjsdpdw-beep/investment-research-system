import { cn } from "@/lib/utils";
import type { SubtabConfig } from "@/lib/workspace";

export function SectionTabs({
  tabs,
  active,
  onChange,
  orientation = "horizontal",
  className,
}: {
  tabs: SubtabConfig[];
  active: string;
  onChange: (key: string) => void;
  orientation?: "horizontal" | "vertical";
  className?: string;
}) {
  if (orientation === "vertical") {
    return (
      <div className={cn("space-y-2", className)}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={cn(
              "w-full rounded-2xl border px-4 py-3 text-left transition-colors",
              active === tab.key
                ? "border-primary bg-primary/15 text-foreground shadow-glow"
                : "border-border bg-background/40 text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            <div className="text-sm font-medium">{tab.label}</div>
            {tab.description && (
              <div className="mt-1 text-xs text-muted-foreground">{tab.description}</div>
            )}
            {!!tab.children?.length && (
              <div className="mt-3 border-t border-border/40 pt-3">
                <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
                  包含
                </div>
                <div className="space-y-1.5">
                  {tab.children.map((child) => (
                    <div key={child} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        active === tab.key ? "bg-primary" : "bg-muted-foreground/50",
                      )} />
                      <span>{child}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("mb-5 flex flex-wrap gap-2", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm transition-colors",
            active === tab.key
              ? "border-primary bg-primary/15 font-medium text-primary shadow-glow"
              : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
