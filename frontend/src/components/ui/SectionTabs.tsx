import { useEffect, useMemo, useState } from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SubtabConfig } from "@/lib/workspace";

function readStoredOrder(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function saveStoredOrder(key: string, values: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(values));
  } catch {
    /* 隐私模式等场景 localStorage 不可用 */
  }
}

export function SectionTabs({
  tabs,
  active,
  onChange,
  orientation = "horizontal",
  className,
  draggableStorageKey,
}: {
  tabs: SubtabConfig[];
  active: string;
  onChange: (key: string) => void;
  orientation?: "horizontal" | "vertical";
  className?: string;
  draggableStorageKey?: string;
}) {
  const [storedOrder, setStoredOrder] = useState<string[]>(() => draggableStorageKey ? readStoredOrder(draggableStorageKey) : []);
  const [draggingKey, setDraggingKey] = useState("");
  const [dragOverKey, setDragOverKey] = useState("");

  useEffect(() => {
    if (!draggableStorageKey) return;
    const known = new Set(tabs.map((tab) => tab.key));
    const next = storedOrder.filter((key) => known.has(key));
    for (const tab of tabs) {
      if (!next.includes(tab.key)) next.push(tab.key);
    }
    const changed = next.length !== storedOrder.length || next.some((key, index) => key !== storedOrder[index]);
    if (changed) {
      setStoredOrder(next);
      saveStoredOrder(draggableStorageKey, next);
    }
  }, [draggableStorageKey, storedOrder, tabs]);

  const orderedTabs = useMemo(() => {
    if (!draggableStorageKey) return tabs;
    const rank = new Map(storedOrder.map((key, index) => [key, index]));
    return [...tabs].sort((left, right) => {
      const leftRank = rank.get(left.key) ?? tabs.length + tabs.findIndex((tab) => tab.key === left.key);
      const rightRank = rank.get(right.key) ?? tabs.length + tabs.findIndex((tab) => tab.key === right.key);
      return leftRank - rightRank;
    });
  }, [draggableStorageKey, orientation, storedOrder, tabs]);

  const handleDrop = (targetKey: string) => {
    if (!draggableStorageKey || !draggingKey || draggingKey === targetKey) {
      setDraggingKey("");
      setDragOverKey("");
      return;
    }
    const next = orderedTabs.map((tab) => tab.key);
    const fromIndex = next.findIndex((key) => key === draggingKey);
    const toIndex = next.findIndex((key) => key === targetKey);
    if (fromIndex < 0 || toIndex < 0) {
      setDraggingKey("");
      setDragOverKey("");
      return;
    }
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setStoredOrder(next);
    saveStoredOrder(draggableStorageKey, next);
    setDraggingKey("");
    setDragOverKey("");
  };

  if (orientation === "vertical") {
    return (
      <div className={cn("space-y-2", className)}>
        {orderedTabs.map((tab) => (
          <div
            key={tab.key}
            draggable={!!draggableStorageKey}
            onDragStart={() => {
              if (!draggableStorageKey) return;
              setDraggingKey(tab.key);
              setDragOverKey(tab.key);
            }}
            onDragOver={(event) => {
              if (!draggableStorageKey) return;
              event.preventDefault();
              if (dragOverKey !== tab.key) setDragOverKey(tab.key);
            }}
            onDragLeave={() => {
              if (!draggableStorageKey) return;
              if (dragOverKey === tab.key) setDragOverKey("");
            }}
            onDrop={(event) => {
              if (!draggableStorageKey) return;
              event.preventDefault();
              handleDrop(tab.key);
            }}
            onDragEnd={() => {
              if (!draggableStorageKey) return;
              setDraggingKey("");
              setDragOverKey("");
            }}
            className={cn(
              "w-full rounded-2xl border px-4 py-3 text-left transition-colors",
              active === tab.key
                ? "border-primary bg-primary/15 text-foreground shadow-glow"
                : "border-border bg-background/40 text-muted-foreground hover:border-primary/40 hover:text-foreground",
              draggableStorageKey && dragOverKey === tab.key && draggingKey !== tab.key && "border-primary/70 ring-1 ring-primary/40",
              draggableStorageKey && draggingKey === tab.key && "opacity-60",
            )}
          >
            <div className="flex items-start gap-2">
              {draggableStorageKey && (
                <div className="mt-1 cursor-grab text-muted-foreground active:cursor-grabbing">
                  <GripVertical className="h-4 w-4" />
                </div>
              )}
              <button onClick={() => onChange(tab.key)} className="w-full text-left">
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
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("mb-5 flex flex-wrap gap-2", className)}>
      {orderedTabs.map((tab) => (
        <div
          key={tab.key}
          draggable={!!draggableStorageKey}
          onDragStart={() => {
            if (!draggableStorageKey) return;
            setDraggingKey(tab.key);
            setDragOverKey(tab.key);
          }}
          onDragOver={(event) => {
            if (!draggableStorageKey) return;
            event.preventDefault();
            if (dragOverKey !== tab.key) setDragOverKey(tab.key);
          }}
          onDragLeave={() => {
            if (!draggableStorageKey) return;
            if (dragOverKey === tab.key) setDragOverKey("");
          }}
          onDrop={(event) => {
            if (!draggableStorageKey) return;
            event.preventDefault();
            handleDrop(tab.key);
          }}
          onDragEnd={() => {
            if (!draggableStorageKey) return;
            setDraggingKey("");
            setDragOverKey("");
          }}
          className={cn(
            "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
            active === tab.key
              ? "border-primary bg-primary/15 font-medium text-primary shadow-glow"
              : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
            draggableStorageKey && dragOverKey === tab.key && draggingKey !== tab.key && "border-primary/70 ring-1 ring-primary/40",
            draggableStorageKey && draggingKey === tab.key && "opacity-60",
          )}
        >
          {draggableStorageKey && (
            <span className="cursor-grab text-muted-foreground active:cursor-grabbing">
              <GripVertical className="h-3.5 w-3.5" />
            </span>
          )}
          <button onClick={() => onChange(tab.key)}>
            {tab.label}
          </button>
        </div>
      ))}
    </div>
  );
}
