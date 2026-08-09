"use client";

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { LoaderCircle, Trash2, TriangleAlert, X } from "lucide-react";
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

export function ConfirmationDialog({ open, title, description, subject, subjectLabel = "Registo selecionado", warning, confirmLabel, cancelLabel = "Cancelar", eyebrow = "Eliminação definitiva", busy = false, tone = "danger", icon, onClose, onConfirm }: ConfirmationDialogProps) {
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
  if (!open) return null;
  return <div className={styles.backdrop} role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) dismiss(); }}>
    <section ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} aria-busy={busy || undefined} onKeyDown={keepFocusInside}>
      <header className={styles.header}>
        <span className={`${styles.icon} ${tone === "primary" ? styles.primaryIcon : ""}`} aria-hidden="true">{icon ?? <Trash2 />}</span>
        <div className={styles.copy}><span className={styles.eyebrow}>{eyebrow}</span><h2 id={titleId}>{title}</h2><p id={descriptionId}>{description}</p></div>
        <button ref={closeRef} className={styles.close} type="button" disabled={busy} onClick={dismiss} aria-label="Fechar confirmação"><X /></button>
      </header>
      {(subject || warning) && <div className={styles.body}>{subject && <div className={styles.subject}><span>{subjectLabel}</span><strong>{subject}</strong></div>}{warning && <div className={styles.warning}><TriangleAlert aria-hidden="true" /><p>{warning}</p></div>}</div>}
      <footer className={styles.footer}><button className={styles.cancel} type="button" disabled={busy} onClick={dismiss}>{cancelLabel}</button><button className={`${styles.confirm} ${tone === "primary" ? styles.primaryConfirm : ""}`} type="button" disabled={busy} onClick={onConfirm}>{busy ? <LoaderCircle className={styles.spin} /> : (icon ?? <Trash2 />)}{confirmLabel}</button></footer>
    </section>
  </div>;
}
