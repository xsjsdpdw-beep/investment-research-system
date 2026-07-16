import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import {
  Moon, Sun, ChevronsLeft, ChevronsRight, LineChart, Github, UserRound, GripVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDarkMode } from "@/hooks/useDarkMode";
import { APP_CONFIG, APP_STORAGE_KEYS } from "@/lib/app-config";
import { SIDEBAR_MODULES } from "@/lib/workspace";

const APP_VERSION = "v0.1.3";
const REPO_URL = APP_CONFIG.upstreamRepoUrl;
const SITE_URL = APP_CONFIG.upstreamRepoUrl;

function readChildOrder(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function saveChildOrder(key: string, values: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(values));
  } catch {
    /* ignore localStorage failures */
  }
}

export function Layout() {
  const { pathname, search } = useLocation();
  const { dark, toggle } = useDarkMode();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(APP_STORAGE_KEYS.sidebar) === "collapsed");
  const currentSub = new URLSearchParams(search).get("sub") || "";
  const [draggingChild, setDraggingChild] = useState<{ moduleTo: string; key: string } | null>(null);
  const [dragOverChild, setDragOverChild] = useState<{ moduleTo: string; key: string } | null>(null);
  const [childOrders, setChildOrders] = useState<Record<string, string[]>>(() => {
    const next: Record<string, string[]> = {};
    for (const module of SIDEBAR_MODULES) {
      if (!module.children?.length) continue;
      next[module.to] = readChildOrder(`sidebar-children-order:${module.to}`);
    }
    return next;
  });

  useEffect(() => {
    localStorage.setItem(APP_STORAGE_KEYS.sidebar, collapsed ? "collapsed" : "expanded");
  }, [collapsed]);

  const orderedChildrenByModule = useMemo(() => {
    const next: Record<string, { key: string; label: string }[]> = {};
    for (const module of SIDEBAR_MODULES) {
      if (!module.children?.length) continue;
      const order = childOrders[module.to] || [];
      const rank = new Map(order.map((key, index) => [key, index]));
      next[module.to] = [...module.children].sort((left, right) => {
        const leftRank = rank.get(left.key) ?? module.children!.findIndex((item) => item.key === left.key) + 1000;
        const rightRank = rank.get(right.key) ?? module.children!.findIndex((item) => item.key === right.key) + 1000;
        return leftRank - rightRank;
      });
    }
    return next;
  }, [childOrders]);

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className={cn(
        "glass z-10 m-2 flex shrink-0 flex-col rounded-2xl transition-all duration-200",
        collapsed ? "w-14" : "w-60",
      )}>
        {/* Brand */}
        <div className={cn("border-b border-border/50", collapsed ? "flex justify-center p-3" : "p-4")}>
          <Link to="/calendar" aria-label="投研体系" className={cn("flex items-center", collapsed ? "justify-center" : "gap-2")}>
            <LineChart className="h-6 w-6 shrink-0 text-primary text-glow" />
            {!collapsed && (
              <span className="text-lg font-extrabold tracking-tight">
                投研<span className="text-primary">体系</span>
              </span>
            )}
          </Link>
          {!collapsed && <p className="mt-1 text-[11px] text-muted-foreground">{APP_CONFIG.productSubtitle}</p>}
        </div>

        {/* Nav */}
        <nav className={cn("flex-1 space-y-1 overflow-auto", collapsed ? "p-1.5" : "p-2.5")}>
          {SIDEBAR_MODULES.map(({ to, icon: Icon, label, description, children }) => {
            const active = pathname === to;
            return (
              <div key={to} className="space-y-1">
                <Link
                  to={to}
                  title={collapsed ? label : undefined}
                  className={cn(
                    "flex items-center rounded-lg text-sm transition-colors",
                    collapsed ? "justify-center p-2.5" : "gap-2.5 px-3 py-2.5",
                    active
                      ? "bg-primary/15 font-medium text-primary shadow-glow"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && (
                    <span className="flex min-w-0 flex-col">
                      <span>{label}</span>
                      <span className="truncate text-[11px] text-muted-foreground/70">{description}</span>
                    </span>
                  )}
                </Link>
                {!collapsed && active && children?.length ? (
                  <div className="ml-6 space-y-1 border-l border-border/40 pl-3">
                    {(orderedChildrenByModule[to] || children).map((child) => {
                      const childActive = currentSub === child.key || (!currentSub && child.key === children[0]?.key);
                      const dragActive = draggingChild?.moduleTo === to && draggingChild.key === child.key;
                      const dragOverActive = dragOverChild?.moduleTo === to && dragOverChild.key === child.key && !dragActive;
                      return (
                        <div
                          key={`${to}-${child.key}`}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
                            childActive
                              ? "bg-primary/10 font-medium text-primary"
                              : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                            dragOverActive && "ring-1 ring-primary/40",
                            dragActive && "opacity-60",
                          )}
                          draggable
                          onDragStart={() => {
                            setDraggingChild({ moduleTo: to, key: child.key });
                            setDragOverChild({ moduleTo: to, key: child.key });
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            if (dragOverChild?.moduleTo !== to || dragOverChild.key !== child.key) {
                              setDragOverChild({ moduleTo: to, key: child.key });
                            }
                          }}
                          onDragLeave={() => {
                            if (dragOverChild?.moduleTo === to && dragOverChild.key === child.key) setDragOverChild(null);
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            if (!draggingChild || draggingChild.moduleTo !== to || draggingChild.key === child.key) {
                              setDraggingChild(null);
                              setDragOverChild(null);
                              return;
                            }
                            const current = (orderedChildrenByModule[to] || children).map((item) => item.key);
                            const fromIndex = current.findIndex((key) => key === draggingChild.key);
                            const toIndex = current.findIndex((key) => key === child.key);
                            if (fromIndex < 0 || toIndex < 0) {
                              setDraggingChild(null);
                              setDragOverChild(null);
                              return;
                            }
                            const next = [...current];
                            const [moved] = next.splice(fromIndex, 1);
                            next.splice(toIndex, 0, moved);
                            setChildOrders((prev) => ({ ...prev, [to]: next }));
                            saveChildOrder(`sidebar-children-order:${to}`, next);
                            setDraggingChild(null);
                            setDragOverChild(null);
                          }}
                          onDragEnd={() => {
                            setDraggingChild(null);
                            setDragOverChild(null);
                          }}
                        >
                          <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing" />
                          <Link to={`${to}?sub=${child.key}`} className="min-w-0 flex-1">
                            {child.label}
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className={cn("border-t border-border/50", collapsed ? "flex flex-col items-center gap-2 p-2" : "space-y-2 p-3")}>
          {collapsed ? (
            <>
              <button onClick={toggle} className="rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground" title={dark ? "亮色" : "暗色"}>
                {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <a href={SITE_URL} target="_blank" rel="noreferrer" className="rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground" title="上游项目">
                <UserRound className="h-4 w-4" />
              </a>
              <button onClick={() => setCollapsed(false)} className="rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground" title="展开">
                <ChevronsRight className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <button onClick={toggle} className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
                  {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                  {dark ? "亮色" : "暗色"}
                </button>
                <div className="flex items-center gap-2">
                  <a href={SITE_URL} target="_blank" rel="noreferrer" className="text-muted-foreground transition-colors hover:text-foreground" title="上游项目">
                    <UserRound className="h-3.5 w-3.5" />
                  </a>
                  <a href={REPO_URL} target="_blank" rel="noreferrer" className="text-muted-foreground transition-colors hover:text-foreground" title="GitHub">
                    <Github className="h-3.5 w-3.5" />
                  </a>
                  <button onClick={() => setCollapsed(true)} className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground" title="收起">
                    <ChevronsLeft className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <a href={SITE_URL} target="_blank" rel="noreferrer" className="block text-[11px] text-primary/80 transition-colors hover:text-primary">
                {APP_CONFIG.upstreamLabel}
              </a>
              <p className="text-[11px] leading-relaxed text-muted-foreground/60">
                {APP_VERSION} · 不荐股 · 不预测 · 无倾向
              </p>
            </>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl px-6 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
