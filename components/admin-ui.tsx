import Link from "next/link";
import { Children, type ReactNode } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { FilterBar } from "@/components/filter-bar";
import { SurfaceHeader } from "@/components/surface-header";
import styles from "@/components/admin-ui.module.css";

export function AdminPage({ children }: { children: ReactNode }) {
  return <div className={styles.page}>{children}</div>;
}

export function AdminPageHeader({
  icon,
  eyebrow,
  title,
  actions,
}: {
  icon?: ReactNode;
  eyebrow: string;
  title: string;
  actions?: ReactNode;
}) {
  return <SurfaceHeader
    standalone
    headingLevel="h1"
    icon={icon ?? <ShieldCheck />}
    eyebrow={eyebrow}
    title={title}
    actions={actions && <div className={styles.pageActions}>{actions}</div>}
  />;
}

export function AdminMetricGrid({ label, children }: { label: string; children: ReactNode }) {
  return <section className={styles.metricGrid} data-count={Children.count(children)} aria-label={label}>{children}</section>;
}

export function AdminMetric({
  icon,
  label,
  value,
  detail,
  tone = "neutral",
  loading = false,
  loadingLabel = "A carregar",
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  detail?: string;
  tone?: "neutral" | "accent" | "success" | "warning";
  loading?: boolean;
  loadingLabel?: string;
}) {
  return <article className={styles.metric} data-platform-surface="metric" data-tone={tone} aria-busy={loading || undefined}>
    <span className={styles.metricIcon} aria-hidden="true">{icon}</span>
    <span className={styles.metricCopy}>
      <small>{label}</small>
      <strong>{loading ? <span className={styles.loadingValue} aria-label={loadingLabel} /> : value}</strong>
      {detail && <span>{detail}</span>}
    </span>
  </article>;
}

export function AdminSection({
  icon,
  eyebrow,
  title,
  actions,
  children,
  className,
}: {
  icon?: ReactNode;
  eyebrow?: string;
  title: string;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return <section className={`${styles.section}${className ? ` ${className}` : ""}`} data-platform-surface="section" data-content={children ? "true" : "false"}>
    <SurfaceHeader
      icon={icon ?? <ShieldCheck />}
      eyebrow={eyebrow}
      title={title}
      actions={actions && <div className={styles.sectionActions}>{actions}</div>}
    />
    {children}
  </section>;
}

export function AdminNavigationList({ label, children }: { label: string; children: ReactNode }) {
  return <nav className={styles.navigationList} aria-label={label}>{children}</nav>;
}

export function AdminNavigationItem({
  href,
  icon,
  title,
  meta,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  meta?: string;
}) {
  return <Link className={styles.navigationItem} data-platform-surface="navigation" href={href}>
    <span className={styles.navigationIcon} aria-hidden="true">{icon}</span>
    <span className={styles.navigationCopy}>
      <strong>{title}</strong>
    </span>
    {meta && <span className={styles.navigationMeta}>{meta}</span>}
    <ArrowRight className={styles.navigationArrow} aria-hidden="true" />
  </Link>;
}

export function AdminSectionGrid({ children }: { children: ReactNode }) {
  return <div className={styles.sectionGrid}>{children}</div>;
}

/** Search and filters for an administrative collection; shares the platform filter anatomy. */
export function AdminToolbar({ children, className, label, standalone = false }: { children: ReactNode; className?: string; label: string; standalone?: boolean }) {
  return <FilterBar className={className} label={label} standalone={standalone}>{children}</FilterBar>;
}

export function AdminDataRegion({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return <div className={`${styles.dataRegion}${className ? ` ${className}` : ""}`} aria-label={label}>{children}</div>;
}

export function AdminFormGrid({ children }: { children: ReactNode }) {
  return <div className={styles.formGrid}>{children}</div>;
}

export function AdminEmptyState({ icon, title, action, className }: {
  icon: ReactNode;
  title: string;
  action?: ReactNode;
  className?: string;
}) {
  return <div className={`${styles.emptyState}${className ? ` ${className}` : ""}`}>
    <span aria-hidden="true">{icon}</span>
    <strong>{title}</strong>
    {action}
  </div>;
}
