"use client";

import { useId } from "react";
import type { PersonDisplay } from "@/lib/person-display";

export function PersonName({ person, className }: { person: PersonDisplay; className?: string }) {
  const tooltipId = useId();
  if (!person.title) return <span className={className} aria-label={person.ariaLabel}>{person.name}</span>;
  return <span className={`preference-help-wrap person-name-tooltip${className ? ` ${className}` : ""}`} tabIndex={0} aria-label={person.ariaLabel} aria-describedby={tooltipId}>
    <span>{person.name}</span>
    <span className="preference-help-tooltip" id={tooltipId} role="tooltip">{person.title}</span>
  </span>;
}
