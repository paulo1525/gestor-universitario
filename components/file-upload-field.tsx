/* eslint-disable @next/next/no-img-element */
"use client";

import { ChangeEvent, useId, useRef } from "react";
import { FileText, Image as ImageIcon, RefreshCw, Upload, X } from "lucide-react";
import styles from "@/components/file-upload-field.module.css";

type FileUploadFieldProps = {
  accept: string;
  emptyLabel: string;
  file: File | null;
  help: string;
  label?: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
  previewUrl?: string;
  required?: boolean;
};

export type SelectedUpload = { file: File; previewUrl?: string };

type MultiFileUploadFieldProps = {
  accept: string;
  emptyLabel: string;
  files: SelectedUpload[];
  help: string;
  label?: string;
  maxFiles: number;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemove: (index: number) => void;
};

function formatSize(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toLocaleString("pt-PT", { maximumFractionDigits: 1 })} MB`;
}

function readableType(file: File) {
  const extension = file.name.includes(".") ? file.name.split(".").pop()?.toUpperCase() : "";
  if (extension) return extension;
  return file.type || "Formato desconhecido";
}

export function FileUploadField({
  accept,
  emptyLabel,
  file,
  help,
  label = "Ficheiro",
  onChange,
  onRemove,
  previewUrl,
  required = false,
}: FileUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const labelId = `${inputId}-label`;
  const helpId = `${inputId}-help`;
  const imagePreview = Boolean(file?.type.startsWith("image/") && previewUrl);

  const openPicker = () => {
    if (inputRef.current) inputRef.current.value = "";
    inputRef.current?.click();
  };

  return (
    <div className={styles.field} role="group" aria-labelledby={labelId} aria-describedby={helpId}>
      <span className={styles.label} id={labelId}>{label}</span>
      <input
        ref={inputRef}
        className={styles.nativeInput}
        id={inputId}
        type="file"
        accept={accept}
        required={required}
        onChange={onChange}
        aria-describedby={helpId}
      />
      <div className={`${styles.picker} ${file ? styles.hasFile : ""}`}>
        <span className={styles.fileIcon} aria-hidden="true">
          {imagePreview ? <img src={previewUrl} alt="" /> : file?.type.startsWith("image/") ? <ImageIcon /> : file ? <FileText /> : <Upload />}
        </span>
        <span className={styles.fileCopy}>
          <strong>{file?.name || emptyLabel}</strong>
          {file ? <small>{readableType(file)} <span aria-hidden="true">·</span> {formatSize(file.size)}</small> : <small>Nenhum ficheiro selecionado</small>}
        </span>
        <span className={styles.actions}>
          <button className={styles.chooseButton} type="button" onClick={openPicker}>
            {file ? <RefreshCw /> : <Upload />}
            {file ? "Substituir" : "Escolher ficheiro"}
          </button>
          {file && (
            <button className={styles.removeButton} type="button" onClick={onRemove} aria-label={`Remover ${file.name}`} title="Remover ficheiro">
              <X />
            </button>
          )}
        </span>
      </div>
      <small className={styles.help} id={helpId}>{help}</small>
    </div>
  );
}

export function MultiFileUploadField({
  accept,
  emptyLabel,
  files,
  help,
  label = "Ficheiros",
  maxFiles,
  onChange,
  onRemove,
}: MultiFileUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const labelId = `${inputId}-label`;
  const helpId = `${inputId}-help`;
  const canAdd = files.length < maxFiles;
  const openPicker = () => {
    if (inputRef.current) inputRef.current.value = "";
    inputRef.current?.click();
  };

  return (
    <div className={styles.field} role="group" aria-labelledby={labelId} aria-describedby={helpId}>
      <span className={styles.label} id={labelId}>{label}</span>
      <input ref={inputRef} className={styles.nativeInput} id={inputId} type="file" accept={accept} multiple onChange={onChange} aria-describedby={helpId} />
      <div className={`${styles.multiPicker} ${files.length ? styles.hasFiles : ""}`}>
        <div className={styles.multiSummary}>
          <span className={styles.fileIcon} aria-hidden="true"><ImageIcon /></span>
          <span className={styles.fileCopy}>
            <strong>{files.length ? `${files.length} ${files.length === 1 ? "fotografia selecionada" : "fotografias selecionadas"}` : emptyLabel}</strong>
            <small>{files.length ? `Podes adicionar mais ${maxFiles - files.length}.` : "Nenhum ficheiro selecionado"}</small>
          </span>
          <button className={styles.chooseButton} type="button" onClick={openPicker} disabled={!canAdd}>
            <Upload />{files.length ? "Adicionar fotos" : "Escolher fotos"}
          </button>
        </div>
        {files.length > 0 && (
          <ol className={styles.fileList} aria-label="Fotografias selecionadas">
            {files.map((item, index) => (
              <li key={`${item.file.name}-${item.file.lastModified}-${index}`}>
                <span className={styles.listPreview} aria-hidden="true">
                  {item.previewUrl ? <img src={item.previewUrl} alt="" /> : <ImageIcon />}
                </span>
                <span className={styles.fileCopy}><strong>{item.file.name}</strong><small>{readableType(item.file)} <span aria-hidden="true">·</span> {formatSize(item.file.size)}</small></span>
                <button className={styles.removeButton} type="button" onClick={() => onRemove(index)} aria-label={`Remover ${item.file.name}`}><X /></button>
              </li>
            ))}
          </ol>
        )}
      </div>
      <small className={styles.help} id={helpId}>{help}</small>
    </div>
  );
}
