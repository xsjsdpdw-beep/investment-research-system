import { type ReactNode, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: Props) {
  const [deskActionsHost, setDeskActionsHost] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setDeskActionsHost(document.getElementById("research-desk-page-actions"));
  }, []);

  const actionContent = actions && (
    <div className="page-header-actions flex items-center gap-2">{actions}</div>
  );

  return (
    <>
      <div className={`page-header mb-6 flex flex-wrap items-end justify-between gap-3${actions ? " has-actions" : ""}`}>
        <div className="page-header-copy">
          <h1 className="text-2xl font-extrabold tracking-tight text-glow">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {!deskActionsHost && actionContent}
      </div>
      {deskActionsHost && actionContent ? createPortal(actionContent, deskActionsHost) : null}
    </>
  );
}
