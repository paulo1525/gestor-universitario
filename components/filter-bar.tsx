"use client";

import { ChevronDown, RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-context";

/* Shared filter primitives.
   Every list page composes the same anatomy: a search field, secondary select
   filters, removable chips for the active criteria and a single "clear" action.
   On narrow screens the secondary filters collapse behind one toggle so the
   results remain visible without scrolling past the form. */

type ActiveFilter = { id: string; label: string; value: string; order: number };
type FilterRegistry = {
  register: (entry: ActiveFilter | null, id: string, clear?: () => void) => void;
  registerSecondary: (id: string, present: boolean) => void;
};

const FilterContext = createContext<FilterRegistry | null>(null);

export type FilterOption = { value: string; label: string };

export function FilterBar({
  label,
  children,
  standalone = false,
  className,
  onClearAll,
}: {
  label: string;
  children: ReactNode;
  standalone?: boolean;
  className?: string;
  /** Optional extra reset, e.g. to also reset pagination. Individual filters are always cleared. */
  onClearAll?: () => void;
}) {
  const { t } = useI18n();
  const [active, setActive] = useState<Record<string, ActiveFilter>>({});
  const [secondary, setSecondary] = useState<Record<string, true>>({});
  const [expanded, setExpanded] = useState(false);
  const clearers = useRef(new Map<string, () => void>());
  const panelId = useId();

  const register = useCallback((entry: ActiveFilter | null, id: string, clear?: () => void) => {
    if (clear) clearers.current.set(id, clear);
    setActive(current => {
      const previous = current[id];
      if (!entry) {
        if (!previous) return current;
        const next = { ...current };
        delete next[id];
        return next;
      }
      if (previous && previous.label === entry.label && previous.value === entry.value) return current;
      return { ...current, [id]: entry };
    });
  }, []);

  const registerSecondary = useCallback((id: string, present: boolean) => {
    setSecondary(current => {
      if (present === Boolean(current[id])) return current;
      const next = { ...current };
      if (present) next[id] = true; else delete next[id];
      return next;
    });
  }, []);

  const registry = useMemo(() => ({ register, registerSecondary }), [register, registerSecondary]);
  const activeFilters = Object.values(active).sort((a, b) => a.order - b.order);
  const secondaryCount = Object.keys(secondary).length;
  const activeSecondary = activeFilters.filter(item => secondary[item.id]).length;
  const collapsible = secondaryCount >= 2;

  const clearAll = () => {
    for (const item of activeFilters) clearers.current.get(item.id)?.();
    onClearAll?.();
  };

  return (
    <FilterContext.Provider value={registry}>
      <div
        className={`filter-bar${standalone ? " filter-bar--standalone" : ""}${collapsible ? " filter-bar--collapsible" : ""}${expanded ? " is-expanded" : ""}${className ? ` ${className}` : ""}`}
        role="search"
        aria-label={label}
      >
        <div className="filter-bar__controls" id={panelId}>
          {children}
          {collapsible && (
            <button
              className="filter-bar__toggle"
              type="button"
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={() => setExpanded(value => !value)}
            >
              <SlidersHorizontal aria-hidden="true" />
              {t("filters.toggle")}
              {activeSecondary > 0 && <span className="filter-bar__count">{activeSecondary}</span>}
              <ChevronDown className="filter-bar__chevron" aria-hidden="true" />
            </button>
          )}
        </div>
        {activeFilters.length > 0 && (
          <div className="filter-bar__active" aria-label={t("filters.active")}>
            {activeFilters.map(item => (
              <button
                className="filter-chip"
                type="button"
                key={item.id}
                onClick={() => clearers.current.get(item.id)?.()}
                aria-label={t("filters.remove", { label: [item.label, item.value].filter(Boolean).join(" ") })}
              >
                {item.label && <span className="filter-chip__label">{item.label}:</span>}
                <span className="filter-chip__value">{item.value}</span>
                <X aria-hidden="true" />
              </button>
            ))}
            <button className="filter-bar__clear" type="button" onClick={clearAll}>
              <RotateCcw aria-hidden="true" />
              {t("filters.clear")}
            </button>
          </div>
        )}
      </div>
    </FilterContext.Provider>
  );
}

function useFilterRegistration(id: string, entry: ActiveFilter | null, clear: () => void, secondary: boolean) {
  const registry = useContext(FilterContext);
  const clearRef = useRef(clear);
  useEffect(() => { clearRef.current = clear; });
  const stableClear = useCallback(() => clearRef.current(), []);
  const label = entry?.label;
  const value = entry?.value;
  const order = entry?.order ?? 0;

  useEffect(() => {
    if (!registry) return;
    registry.register(label !== undefined && value !== undefined ? { id, label, value, order } : null, id, stableClear);
  }, [registry, id, label, value, order, stableClear]);

  useEffect(() => {
    if (!registry) return;
    registry.registerSecondary(id, secondary);
    return () => {
      registry.registerSecondary(id, false);
      registry.register(null, id);
    };
  }, [registry, id, secondary]);
}

let orderSeed = 0;
function useOrder() {
  const [order] = useState(() => ++orderSeed);
  return order;
}

export function FilterSearch({
  label,
  value,
  onChange,
  placeholder,
  chipLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Label used by the active-filter chip; defaults to "Pesquisa". */
  chipLabel?: string;
}) {
  const { t } = useI18n();
  const id = useId();
  const order = useOrder();
  const trimmed = value.trim();
  useFilterRegistration(id, trimmed ? { id, label: chipLabel || t("filters.search"), value: `“${trimmed}”`, order } : null, () => onChange(""), false);

  return (
    <div className="filter-field filter-field--search">
      <label className="filter-field__label" htmlFor={id}>{label}</label>
      <div className="filter-field__control">
        <Search className="filter-field__icon" aria-hidden="true" />
        <input id={id} type="search" value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} />
        {value && (
          <button className="filter-field__reset" type="button" onClick={() => onChange("")} aria-label={t("filters.remove", { label })}>
            <X aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  defaultValue = "all",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  /** The value that means "no filter"; chips and the active state ignore it. */
  defaultValue?: string;
}) {
  const id = useId();
  const order = useOrder();
  const isActive = value !== defaultValue;
  const selected = options.find(option => option.value === value);
  useFilterRegistration(id, isActive && selected ? { id, label, value: selected.label, order } : null, () => onChange(defaultValue), true);

  return (
    <div className={`filter-field filter-field--secondary${isActive ? " is-active" : ""}`}>
      <label className="filter-field__label" htmlFor={id}>{label}</label>
      <div className="filter-field__control">
        <select id={id} value={value} onChange={event => onChange(event.target.value)}>
          {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <ChevronDown className="filter-field__chevron" aria-hidden="true" />
      </div>
    </div>
  );
}

export function FilterCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  const order = useOrder();
  useFilterRegistration(id, checked ? { id, label: "", value: label, order } : null, () => onChange(false), true);

  return (
    <div className={`filter-field filter-field--secondary filter-field--checkbox${checked ? " is-active" : ""}`}>
      <label className="filter-check" htmlFor={id}>
        <input id={id} type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
        <span>{label}</span>
      </label>
    </div>
  );
}

export function FilterSegmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; count?: number }[];
}) {
  const id = useId();
  return (
    <div className="filter-field filter-field--segmented">
      <span className="filter-field__label" id={id}>{label}</span>
      <div className="filter-segmented" role="group" aria-labelledby={id}>
        {options.map(option => (
          <button
            type="button"
            key={option.value}
            className={option.value === value ? "is-active" : ""}
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
            {option.count !== undefined && option.count > 0 && <span className="filter-segmented__count">{option.count}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
