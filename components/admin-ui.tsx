import Link from "next/link";
import { Children, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import styles from "@/components/admin-ui.module.css";

export function AdminPage({ children }: { children: ReactNode }) {
  return <div className={styles.page}>{children}</div>;
}

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return <header className={styles.pageHeader}>
    <div>
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
    {actions && <div className={styles.pageActions}>{actions}</div>}
  </header>;
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
  description,
  actions,
  children,
  className,
}: {
  icon?: ReactNode;
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return <section className={`${styles.section}${className ? ` ${className}` : ""}`} data-platform-surface="section" data-content={children ? "true" : "false"}>
    <header className={styles.sectionHeader} data-platform-surface-header>
      {icon && <span className={styles.sectionIcon} aria-hidden="true">{icon}</span>}
      <div className={styles.sectionHeading}>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className={styles.sectionActions}>{actions}</div>}
    </header>
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
  description,
  meta,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
  meta?: string;
}) {
  return <Link className={styles.navigationItem} data-platform-surface="navigation" href={href}>
    <span className={styles.navigationIcon} aria-hidden="true">{icon}</span>
    <span className={styles.navigationCopy}>
      <strong>{title}</strong>
      <small>{description}</small>
    </span>
    {meta && <span className={styles.navigationMeta}>{meta}</span>}
    <ArrowRight className={styles.navigationArrow} aria-hidden="true" />
  </Link>;
}

export function AdminSectionGrid({ children }: { children: ReactNode }) {
  return <div className={styles.sectionGrid}>{children}</div>;
}

export function AdminToolbar({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return <div className={`${styles.toolbar}${className ? ` ${className}` : ""}`} aria-label={label}>{children}</div>;
}

export function AdminDataRegion({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return <div className={`${styles.dataRegion}${className ? ` ${className}` : ""}`} aria-label={label}>{children}</div>;
}

export function AdminFormGrid({ children }: { children: ReactNode }) {
  return <div className={styles.formGrid}>{children}</div>;
}

export function AdminEmptyState({ icon, title, description, action, className }: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return <div className={`${styles.emptyState}${className ? ` ${className}` : ""}`}>
    <span aria-hidden="true">{icon}</span>
    <strong>{title}</strong>
    {description && <p>{description}</p>}
    {action}
  </div>;
}
