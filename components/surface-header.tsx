import { type ReactNode } from "react";

type HeadingLevel = "h1" | "h2" | "h3";

export function SurfaceHeader({
  icon,
  eyebrow,
  title,
  meta,
  actions,
  headingLevel = "h2",
  headingId,
  standalone = false,
  className,
}: {
  icon?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  headingLevel?: HeadingLevel;
  headingId?: string;
  standalone?: boolean;
  className?: string;
}) {
  const Heading = headingLevel;

  return (
    <header
      className={`surface-header${standalone ? " surface-header--standalone" : ""}${className ? ` ${className}` : ""}`}
      data-platform-surface-header
    >
      {icon && <span className="surface-header__icon" aria-hidden="true">{icon}</span>}
      <div className="surface-header__heading">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <Heading id={headingId}>{title}</Heading>
      </div>
      {(meta || actions) && (
        <div className="surface-header__aside">
          {meta && <span className="surface-header__meta">{meta}</span>}
          {actions}
        </div>
      )}
    </header>
  );
}
