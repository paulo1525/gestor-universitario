"use client";

import { useEffect, useMemo, useRef } from "react";
import { Bold, Italic, Link2, List, ListOrdered, Underline } from "lucide-react";
import { richTextDisplayHtml, richTextPlainText, sanitizeRichTextHtml } from "@/lib/announcement-content";
import styles from "@/components/rich-text-editor.module.css";

type RichTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  minHeight?: "compact" | "regular";
  onInvalidLink?: () => void;
};

type RichTextContentProps = { value: string; className?: string };

export function RichTextContent({ value, className = "" }: RichTextContentProps) {
  const html = useMemo(() => {
    const sanitized = sanitizeRichTextHtml(value);
    return /<\/?(?:div|p|br|strong|b|em|i|u|ul|ol|li|a)\b/i.test(sanitized) ? richTextDisplayHtml(sanitized) : `<p>${sanitized}</p>`;
  }, [value]);
  return <div className={`${styles.content} ${className}`.trim()} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function RichTextEditor({ value, onChange, ariaLabel, placeholder = "Escreve aqui…", maxLength, disabled = false, minHeight = "regular", onInvalidLink }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const plainLength = richTextPlainText(value).length;

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || document.activeElement === editor) return;
    const safeValue = sanitizeRichTextHtml(value);
    if (editor.innerHTML !== safeValue) editor.innerHTML = safeValue;
  }, [value]);

  const emit = () => onChange(sanitizeRichTextHtml(editorRef.current?.innerHTML ?? ""));

  const format = (command: string) => {
    if (disabled) return;
    editorRef.current?.focus();
    document.execCommand(command, false);
    emit();
  };

  const addLink = () => {
    if (disabled) return;
    const value = window.prompt("Indica o endereço completo da ligação (https://…)");
    if (!value) return;
    try {
      const url = new URL(value);
      if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) throw new Error();
      editorRef.current?.focus();
      document.execCommand("createLink", false, value);
      emit();
    } catch {
      onInvalidLink?.();
    }
  };

  return <div className={`${styles.editor} ${styles[minHeight]} ${disabled ? styles.disabled : ""}`}>
    <div className={styles.toolbar} role="toolbar" aria-label={`Formatação: ${ariaLabel}`}>
      <button type="button" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => format("bold")} aria-label="Negrito" title="Negrito"><Bold /></button>
      <button type="button" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => format("italic")} aria-label="Itálico" title="Itálico"><Italic /></button>
      <button type="button" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => format("underline")} aria-label="Sublinhado" title="Sublinhado"><Underline /></button>
      <span aria-hidden="true" />
      <button type="button" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => format("insertUnorderedList")} aria-label="Lista com marcas" title="Lista com marcas"><List /></button>
      <button type="button" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => format("insertOrderedList")} aria-label="Lista numerada" title="Lista numerada"><ListOrdered /></button>
      <button type="button" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={addLink} aria-label="Adicionar ligação" title="Adicionar ligação"><Link2 /></button>
    </div>
    <div ref={editorRef} className={styles.editable} contentEditable={!disabled} role="textbox" aria-label={ariaLabel} aria-multiline="true" aria-disabled={disabled} data-placeholder={placeholder} onInput={emit} onBlur={() => { const safeValue = sanitizeRichTextHtml(editorRef.current?.innerHTML ?? ""); if (editorRef.current) editorRef.current.innerHTML = safeValue; onChange(safeValue); }} onPaste={(event) => { event.preventDefault(); document.execCommand("insertText", false, event.clipboardData.getData("text/plain")); emit(); }} suppressContentEditableWarning />
    {maxLength != null && <div className={`${styles.counter} ${plainLength > maxLength ? styles.counterOver : ""}`} aria-live="polite">{plainLength}/{maxLength}</div>}
  </div>;
}
