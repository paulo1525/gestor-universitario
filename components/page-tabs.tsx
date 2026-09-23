import Link from "next/link";
import { type ReactNode } from "react";

/* Secondary navigation between the views of one area (e.g. Testes). It sits
   below the page header, so page headers never carry buttons. */
export type PageTab = { id: string; label: string; icon?: ReactNode; href?: string; onClick?: () => void };

export function PageTabs({ label, tabs, active }: { label: string; tabs: PageTab[]; active: string }) {
  return (
    <nav className="page-tabs" aria-label={label}>
      {tabs.map(tab => {
        const current = tab.id === active;
        const content = <>{tab.icon}{tab.label}</>;
        if (tab.href && !current) return <Link key={tab.id} href={tab.href}>{content}</Link>;
        return (
          <button key={tab.id} type="button" className={current ? "is-active" : undefined} aria-current={current ? "page" : undefined} onClick={current ? undefined : tab.onClick}>
            {content}
          </button>
        );
      })}
    </nav>
  );
}
