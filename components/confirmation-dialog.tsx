"use client";

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { useEscapeKey } from "@/components/use-escape-key";
import { useScrollLock } from "@/components/use-scroll-lock";
import styles from "@/components/confirmation-dialog.module.css";

type ConfirmationDialogProps = {
  open: boolean;
  title: string;
  description: string;
  subject?: string;
  subjectLabel?: string;
  warning?: string;
  confirmLabel: string;
  cancelLabel?: string;
  eyebrow?: string;
  busy?: boolean;
  tone?: "danger" | "primary";
  icon?: ReactNode;
  onClose: () => void;
  onConfirm: () => void;
};

export function ConfirmationDialog({ open, title, description, subject, subjectLabel = "Registo selecionado", warning, confirmLabel, cancelLabel = "Cancelar", busy = false, tone = "danger", onClose, onConfirm }: ConfirmationDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dismiss = () => { if (!busy) onClose(); };
  useScrollLock(open);
  useEscapeKey(open, dismiss);
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    requestAnimationFrame(() => closeRef.current?.focus());
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
  const compact = !subject && !warning;
  if (!open) return null;
  return <div className={styles.backdrop} data-app-modal-backdrop role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) dismiss(); }}>
    <section ref={dialogRef} className={`${styles.dialog} ${compact ? styles.compact : ""}`} data-app-modal="modal" data-app-modal-size="compact" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} aria-busy={busy || undefined} onKeyDown={keepFocusInside}>
      {/* Light confirmation: question, the item in bold, one short consequence line, two buttons. */}
      <header className={styles.header} data-app-modal-header>
        <h2 id={titleId}>{title}</h2>
        {description && <p id={descriptionId} className="sr-only">{description}</p>}
      </header>
      {(subject || warning) && <div className={styles.body} data-app-modal-body>
        {subject && <p className={styles.subject}><span className="sr-only">{subjectLabel}: </span>{subject}</p>}
        {warning && <p className={styles.warning}>{warning}</p>}
      </div>}
      <footer className={styles.footer} data-app-modal-footer>
        <button ref={closeRef} className={styles.cancel} data-app-modal-action="secondary" type="button" disabled={busy} onClick={dismiss}>{cancelLabel}</button>
        <button className={`${styles.confirm} ${tone === "primary" ? styles.primaryConfirm : ""}`} data-app-modal-action={tone === "primary" ? "primary" : "danger"} type="button" disabled={busy} onClick={onConfirm}>{busy && <LoaderCircle className={styles.spin} aria-hidden="true" />}{confirmLabel}</button>
      </footer>
    </section>
  </div>;
}
