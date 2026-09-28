"use client";

import { Children, isValidElement, type ChangeEvent, type ReactNode, type SelectHTMLAttributes, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import styles from "./searchable-select.module.css";

type Option = { value: string; label: string; disabled: boolean };

function labelText(value: ReactNode): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(labelText).join("");
  if (isValidElement<{ children?: ReactNode }>(value)) return labelText(value.props.children);
  return "";
}

function optionsFrom(children: ReactNode): Option[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<{ value?: string | number; disabled?: boolean; children?: ReactNode }>(child)) return [];
    if (child.type === "option") return [{ value: String(child.props.value ?? labelText(child.props.children)), label: labelText(child.props.children), disabled: Boolean(child.props.disabled) }];
    return optionsFrom(child.props.children);
  });
}

type Props = SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode; rootClassName?: string };

export function SearchableSelect({ children, value, defaultValue, onChange, id, name, className, rootClassName, disabled, required, style, "aria-label": ariaLabel, "aria-invalid": ariaInvalid, "aria-describedby": ariaDescribedBy }: Props) {
  const generatedId = useId();
  const inputId = id || `searchable-select-${generatedId}`;
  const listId = `${inputId}-options`;
  const options = useMemo(() => optionsFrom(children), [children]);
  const [uncontrolled, setUncontrolled] = useState(String(defaultValue ?? options[0]?.value ?? ""));
  const selectedValue = String(value ?? uncontrolled);
  const selected = options.find(option => option.value === selectedValue);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: 260 });
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.setCustomValidity(required && !selectedValue ? "Seleciona uma opção da lista." : "");
  }, [required, selectedValue]);

  const matches = useMemo(() => options.filter(option => option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [options, query]);
  const displayValue = selectedValue ? selected?.label ?? "" : "";
  const updatePosition = useCallback(() => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom;
    const above = rect.top;
    const listHeight = Math.min(260, Math.max(44, matches.length * 40 + 8));
    const placeBelow = below >= listHeight || below >= above;
    const maxHeight = Math.max(44, Math.min(260, (placeBelow ? below : above) - 8));
    setPosition({ left: rect.left, top: placeBelow ? rect.bottom + 4 : Math.max(4, rect.top - Math.min(listHeight, maxHeight) - 4), width: rect.width, maxHeight });
  }, [matches.length]);

  useEffect(() => { if (open) updatePosition(); }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node) || listRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      setQuery("");
    };
    const reposition = () => updatePosition();
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => { document.removeEventListener("pointerdown", closeOutside); window.removeEventListener("resize", reposition); window.removeEventListener("scroll", reposition, true); };
  }, [open, updatePosition]);

  const show = () => { if (disabled) return; setQuery(""); setActive(Math.max(0, options.findIndex(option => option.value === selectedValue))); updatePosition(); setOpen(true); };
  const choose = (option: Option) => {
    if (option.disabled) return;
    if (value === undefined) setUncontrolled(option.value);
    onChange?.({ target: { value: option.value, name }, currentTarget: { value: option.value, name } } as ChangeEvent<HTMLSelectElement>);
    setOpen(false);
    setQuery("");
    inputRef.current?.focus();
  };

  return <div ref={rootRef} className={`${styles.root}${rootClassName ? ` ${rootClassName}` : ""}`} style={style}>
    <input ref={inputRef} id={inputId} className={`${styles.input}${className ? ` ${className}` : ""}`} type="text" role="combobox" aria-label={ariaLabel} aria-invalid={ariaInvalid} aria-describedby={ariaDescribedBy} aria-autocomplete="list" aria-expanded={open} aria-controls={open ? listId : undefined} aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined} value={open ? query : displayValue} placeholder={selected?.label} disabled={disabled} autoComplete="off"
      required={required && !selectedValue} onFocus={() => { if (!open) show(); }} onClick={() => { if (!open) show(); }} onChange={event => { setQuery(event.target.value); setActive(0); if (!open) { updatePosition(); setOpen(true); } }} onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); setOpen(false); setQuery(""); }
        else if (event.key === "ArrowDown") { event.preventDefault(); if (!open) show(); else setActive(current => Math.min(matches.length - 1, current + 1)); }
        else if (event.key === "ArrowUp") { event.preventDefault(); if (!open) show(); else setActive(current => Math.max(0, current - 1)); }
        else if (event.key === "Enter" && open) { event.preventDefault(); if (matches[active]) choose(matches[active]); }
        else if (event.key === "Tab") { setOpen(false); setQuery(""); }
      }} />
    <select hidden name={name} value={selectedValue} disabled={disabled} tabIndex={-1} aria-hidden="true" className={styles.native} onChange={onChange}>{children}</select>
    <ChevronDown aria-hidden="true" className={styles.chevron} />
    {open && typeof document !== "undefined" && createPortal(<div ref={listRef} id={listId} role="listbox" className={styles.list} style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight }}>
      {matches.length ? matches.map((option, index) => <button id={`${listId}-${index}`} key={`${option.value}-${index}`} type="button" role="option" aria-selected={option.value === selectedValue} disabled={option.disabled} className={`${styles.option}${index === active ? ` ${styles.active}` : ""}`} onMouseDown={event => event.preventDefault()} onClick={() => choose(option)} onMouseEnter={() => setActive(index)}>{option.label}</button>) : <div className={styles.empty}>Sem resultados</div>}
    </div>, document.body)}
  </div>;
}

export function SearchableMultiSelect({ options, value, onChange, label }: { options: Option[]; value: string[]; onChange: (value: string[]) => void; label: string }) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: 260 });
  const matches = options.filter(option => option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const selectedLabels = options.filter(option => value.includes(option.value)).map(option => option.label).join(", ");
  const updatePosition = useCallback(() => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom;
    const above = rect.top;
    const listHeight = Math.min(260, Math.max(44, matches.length * 40 + 8));
    const placeBelow = below >= listHeight || below >= above;
    const maxHeight = Math.max(44, Math.min(260, (placeBelow ? below : above) - 8));
    setPosition({ left: rect.left, top: placeBelow ? rect.bottom + 4 : Math.max(4, rect.top - Math.min(listHeight, maxHeight) - 4), width: rect.width, maxHeight });
  }, [matches.length]);
  useEffect(() => { if (open) updatePosition(); }, [open, updatePosition]);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node) || listRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      setQuery("");
    };
    const reposition = () => updatePosition();
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => { document.removeEventListener("pointerdown", closeOutside); window.removeEventListener("resize", reposition); window.removeEventListener("scroll", reposition, true); };
  }, [open, updatePosition]);
  const toggle = (option: Option) => onChange(value.includes(option.value) ? value.filter(item => item !== option.value) : [...value, option.value]);
  return <div ref={rootRef} className={styles.root}>
    <input ref={inputRef} className={styles.input} type="text" role="combobox" aria-label={label} aria-autocomplete="list" aria-expanded={open} aria-controls={open ? `${id}-options` : undefined} value={open ? query : selectedLabels} placeholder={value.length ? undefined : "Pesquisar e escolher"} autoComplete="off" onFocus={() => { updatePosition(); setOpen(true); }} onClick={() => { updatePosition(); setOpen(true); }} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Escape") { setOpen(false); setQuery(""); } else if (event.key === "ArrowDown") { event.preventDefault(); listRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus(); } else if (event.key === "Tab") { setOpen(false); setQuery(""); } }} />
    <ChevronDown aria-hidden="true" className={styles.chevron} />
    {open && typeof document !== "undefined" && createPortal(<div ref={listRef} id={`${id}-options`} role="listbox" aria-label={label} aria-multiselectable="true" className={styles.list} style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight }}>
      {matches.length ? matches.map(option => <button key={option.value} type="button" role="option" aria-selected={value.includes(option.value)} disabled={option.disabled} className={styles.option} onMouseDown={event => event.preventDefault()} onClick={() => { toggle(option); inputRef.current?.focus(); }} onKeyDown={event => { if (event.key === "Escape") { setOpen(false); inputRef.current?.focus(); } else if (event.key === "ArrowDown") { event.preventDefault(); (event.currentTarget.nextElementSibling as HTMLButtonElement | null)?.focus(); } else if (event.key === "ArrowUp") { event.preventDefault(); ((event.currentTarget.previousElementSibling as HTMLButtonElement | null) ?? inputRef.current)?.focus(); } }}><span className={styles.checkmark}>{value.includes(option.value) ? "✓" : ""}</span>{option.label}</button>) : <div className={styles.empty}>Sem resultados</div>}
    </div>, document.body)}
  </div>;
}
