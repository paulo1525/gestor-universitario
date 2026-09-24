"use client";

import { FormEvent, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { CancelButton, FormCloseButton, SubmitButton } from "@/components/form-actions";
import { useEscapeKey } from "@/components/use-escape-key";
import { useScrollLock } from "@/components/use-scroll-lock";
import { useI18n } from "@/components/i18n-context";
import styles from "@/components/useful-links-tree.module.css";

export const USEFUL_LINK_CATEGORIES = ["academic", "platform", "curricular_unit", "support", "association", "other"] as const;

export type UsefulLinkDraft = {
  title: string;
  url: string;
  description: string;
  category: string;
  requiresLogin: boolean;
  ccOnly: boolean;
  highlight: boolean;
};

export const EMPTY_USEFUL_LINK_DRAFT: UsefulLinkDraft = { title: "", url: "https://", description: "", category: "academic", requiresLogin: false, ccOnly: false, highlight: false };

type Props = {
  open: boolean;
  editing: boolean;
  initial: UsefulLinkDraft;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (draft: UsefulLinkDraft) => void;
};

/* Light add/edit modal of the global modal family ([data-app-modal]), like the cookie
   preferences and ConfirmationDialog: fields, labels, checkboxes and buttons are styled
   globally; the module only lays them out. Escape closes; focus stays inside. */
export function UsefulLinkEditor({ open, editing, initial, busy, error, onClose, onSubmit }: Props) {
  const { t } = useI18n();
  const titleId = useId();
  const fieldId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<UsefulLinkDraft>(initial);
  const dismiss = () => { if (!busy) onClose(); };
  useScrollLock(open);
  useEscapeKey(open, dismiss);
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    requestAnimationFrame(() => firstFieldRef.current?.focus());
    return () => previousFocus?.focus();
  }, [open]);
  const keepFocusInside = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") return;
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])];
    if (!focusable.length) return;
    const first = focusable[0], last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  const set = <K extends keyof UsefulLinkDraft>(key: K, value: UsefulLinkDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const submit = (event: FormEvent) => { event.preventDefault(); if (!busy) onSubmit(draft); };
  if (!open) return null;
  return (
    <div className="app-modal-backdrop" data-app-modal-backdrop role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) dismiss(); }}>
      <section ref={dialogRef} data-app-modal="modal" data-app-modal-size="compact" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy || undefined} onKeyDown={keepFocusInside}>
        <header className="app-modal-header" data-app-modal-header><h2 id={titleId}>{t(editing ? "links.edit" : "links.add")}</h2><FormCloseButton onClick={dismiss} label={t("common.close")} disabled={busy} /></header>
        <form className={styles.dialogForm} onSubmit={submit}>
          <div className={styles.dialogBody} data-app-modal-body>
            <label className={styles.field} htmlFor={`${fieldId}-title`}><span>{t("links.field.title")}</span><input ref={firstFieldRef} id={`${fieldId}-title`} value={draft.title} onChange={(event) => set("title", event.target.value)} minLength={3} maxLength={160} required /></label>
            <label className={styles.field} htmlFor={`${fieldId}-url`}><span>{t("links.field.link")}</span><input id={`${fieldId}-url`} type="url" inputMode="url" value={draft.url} onChange={(event) => set("url", event.target.value)} maxLength={1500} pattern="https://.*" required /></label>
            <label className={styles.field} htmlFor={`${fieldId}-description`}><span>{t("links.field.description")}</span><input id={`${fieldId}-description`} value={draft.description} onChange={(event) => set("description", event.target.value)} maxLength={160} /></label>
            <label className={styles.field} htmlFor={`${fieldId}-category`}><span>{t("links.field.category")}</span><select id={`${fieldId}-category`} value={draft.category} onChange={(event) => set("category", event.target.value)}>{USEFUL_LINK_CATEGORIES.map((value) => <option key={value} value={value}>{t(`links.category.${value}`)}</option>)}</select></label>
            <div className={styles.checks}>
              <label className={styles.check}><input type="checkbox" checked={draft.ccOnly || draft.requiresLogin} disabled={draft.ccOnly} onChange={(event) => set("requiresLogin", event.target.checked)} /><span>{t("links.field.requiresLogin")}</span></label>
              <label className={styles.check}><input type="checkbox" checked={draft.ccOnly} onChange={(event) => set("ccOnly", event.target.checked)} /><span>{t("links.field.ccOnly")}</span></label>
              <label className={styles.check}><input type="checkbox" checked={draft.highlight} onChange={(event) => set("highlight", event.target.checked)} /><span>{t("links.field.highlight")}</span></label>
            </div>
            {error && <p className={styles.dialogError} role="alert">{error}</p>}
          </div>
          <footer data-app-modal-footer>
            <CancelButton onClick={dismiss} disabled={busy}>{t("links.cancel")}</CancelButton>
            <SubmitButton busy={busy}>{t(busy ? "links.saving" : "links.saveShort")}</SubmitButton>
          </footer>
        </form>
      </section>
    </div>
  );
}
