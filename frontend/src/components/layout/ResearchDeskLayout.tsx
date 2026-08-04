import { Link, Outlet, useLocation } from "react-router-dom";
import { BookOpenText, CircleCheck, Layers3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_CONFIG } from "@/lib/app-config";
import { SIDEBAR_MODULES } from "@/lib/workspace";

const NAV_GROUPS = [
  { label: "日常工作", modules: SIDEBAR_MODULES.slice(0, 4) },
  { label: "研究决策", modules: SIDEBAR_MODULES.slice(4, 9) },
  { label: "资产与系统", modules: SIDEBAR_MODULES.slice(9) },
];

export function ResearchDeskLayout() {
  const { pathname, search } = useLocation();
  const modulePath = pathname.replace(/^\/desk/, "") || "/calendar";
  const currentSub = new URLSearchParams(search).get("sub") || "";
  const activeModule = SIDEBAR_MODULES.find(({ to }) => (
    modulePath === to || (to === "/sectors" && modulePath.startsWith("/sectors/"))
  )) || SIDEBAR_MODULES[0];

  return (
    <div className="research-desk flex min-h-screen">
      <aside className="research-desk-sidebar flex w-full shrink-0 flex-col md:sticky md:top-0 md:h-screen md:w-[272px]">
        <Link to="/desk/calendar" className="research-desk-brand flex items-center gap-3 px-7 py-7 md:min-h-[150px]">
          <span className="research-desk-monogram flex h-12 w-12 shrink-0 items-center justify-center">
            <BookOpenText className="h-6 w-6" />
          </span>
          <span className="min-w-0">
            <span className="block font-serif text-[21px] font-semibold tracking-[0.02em] text-[#f1eee6]">
              投研体系
            </span>
            <span className="mt-1 block text-[10px] uppercase tracking-[0.24em] text-[#b6c2c1]">
              Research OS
            </span>
          </span>
        </Link>

        <nav className="research-desk-nav flex-1 overflow-y-auto px-4 pb-5">
          {NAV_GROUPS.map((group) => (
            <section key={group.label} className="mb-5">
              <div className="px-3 pb-2 pt-3 text-[10px] font-medium tracking-[0.2em] text-[#768e94]">
                {group.label}
              </div>
              <div className="space-y-1">
                {group.modules.map(({ to, icon: Icon, label, children }) => {
                  const active = modulePath === to || (to === "/sectors" && modulePath.startsWith("/sectors/"));
                  return (
                    <div key={to}>
                      <Link
                        to={`/desk${to}`}
                        className={cn(
                          "research-desk-nav-item flex items-center gap-3 px-3 py-2.5 text-sm",
                          active && "is-active",
                        )}
                      >
                        <Icon className="h-[17px] w-[17px] shrink-0" strokeWidth={1.7} />
                        <span>{label}</span>
                      </Link>
                      {active && children?.length ? (
                        <div className="ml-[34px] mt-1 border-l border-[#2b4653] py-1 pl-3">
                          {children.map((child) => {
                            const childActive = currentSub === child.key || (!currentSub && child.key === children[0]?.key);
                            return (
                              <Link
                                key={child.key}
                                to={`/desk${to}?sub=${child.key}`}
                                className={cn(
                                  "block py-1.5 text-xs text-[#9fb1b3] transition-colors hover:text-[#f1eee6]",
                                  childActive && "font-medium text-[#5dd7cd]",
                                )}
                              >
                                {child.label}
                              </Link>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>

        <div className="research-desk-sidebar-footer mx-5 border-t border-[#29404b] py-5 text-xs text-[#8ea1a4]">
          <div className="mb-2 flex items-center gap-2 text-[#d4dddb]">
            <CircleCheck className="h-4 w-4 text-[#5dd7cd]" />
            <span>本地工作区已接入</span>
          </div>
          <p className="leading-5">{APP_CONFIG.productSubtitle}</p>
        </div>
      </aside>

      <main className="research-desk-main min-w-0 flex-1">
        <header className="research-desk-topbar border-b">
          <div className="mx-auto flex min-h-[150px] max-w-[1600px] flex-wrap items-center justify-between gap-5 px-6 py-5 lg:px-10">
            <div>
              <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#5dd7cd]">
                <Layers3 className="h-3.5 w-3.5" />
                Continuous research desk
              </div>
              <h1 className="font-serif text-[30px] font-semibold tracking-[-0.025em] text-[#f1eee6]">
                {activeModule.label}
              </h1>
              <p className="mt-1 text-sm text-[#b6c2c1]">{activeModule.description}</p>
            </div>
            <div
              id="research-desk-page-actions"
              className="flex flex-wrap items-center justify-end gap-2"
            />
          </div>
        </header>

        <div className="research-desk-content mx-auto max-w-[1600px] px-6 py-7 lg:px-10 lg:py-9">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
