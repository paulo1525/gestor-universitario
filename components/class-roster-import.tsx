"use client";

import { useState } from "react";
import { Check, CircleHelp, Clipboard, FileSpreadsheet, LoaderCircle, Upload, X } from "lucide-react";
import { AppToast } from "@/components/app-toast";
import { FileUploadField } from "@/components/file-upload-field";
import { useI18n } from "@/components/i18n-context";
import { parseStudentCsv, type CsvStudent } from "@/lib/student-csv";
import { STUDENT_STATUS_OPTIONS, studentStatusLabel } from "@/lib/student-status";
import styles from "@/components/class-roster-import.module.css";

const AI_PROMPT = `Analisa o ficheiro Excel que te forneci e converte a pauta para um ficheiro CSV UTF-8 pronto a importar no Gestor Universitário.

Devolve apenas um bloco de código CSV, sem explicações antes ou depois. Usa exatamente este cabeçalho e esta ordem de colunas:
turma,nome,n_mecanografico,codigo_estatuto

Regras obrigatórias:
1. Cria uma linha por aluno e inclui alunos de todas as turmas existentes no Excel.
2. "turma" deve ser um número inteiro entre 1 e 20.
3. "nome" deve manter o nome completo tal como aparece no Excel.
4. "n_mecanografico" deve conter exatamente 9 algarismos. Preserva zeros à esquerda e remove prefixos como "up".
5. "codigo_estatuto" só pode usar um destes códigos: N = Nenhum; TE = Trabalhador-Estudante; A = Atleta; O = Outro.
6. Se o estatuto estiver vazio ou não existir no Excel, usa N. Não inventes um estatuto especial.
7. Aceita variações evidentes como "trabalhador estudante", "trabalhador-estudante" ou "TE" como TE.
8. Não alteres nomes, não inventes números mecanográficos e não cries alunos duplicados.
9. Se um valor obrigatório não puder ser determinado com segurança, não inventes: identifica a linha problemática em vez de produzir um CSV incorreto.
10. Coloca entre aspas qualquer nome que contenha vírgulas e escapa aspas internas duplicando-as.`;

export function ClassRosterImport({ onImported }: { onImported?: () => void | Promise<void> }) {
  const { locale, t } = useI18n();
  const [file, setFile] = useState<File | null>(null), [students, setStudents] = useState<CsvStudent[]>([]), [importing, setImporting] = useState(false), [notice, setNotice] = useState(""), [noticeError, setNoticeError] = useState(false), [showPrompt, setShowPrompt] = useState(false), [copied, setCopied] = useState(false);

  const clearFile = () => { setFile(null); setStudents([]); };
  const selectFile = async (selected: File | undefined) => {
    if (!selected) return;
    setNotice(""); setNoticeError(false);
    try {
      if (!selected.name.toLocaleLowerCase().endsWith(".csv") || selected.size > 1_000_000) throw new Error(t("classes.import.fileError"));
      const parsed = parseStudentCsv(await selected.text());
      setFile(selected); setStudents(parsed);
    } catch (error) {
      clearFile(); setNoticeError(true); setNotice(error instanceof Error ? error.message : t("classes.import.error"));
    }
  };
  const copyPrompt = async () => {
    await navigator.clipboard.writeText(AI_PROMPT);
    setCopied(true); window.setTimeout(() => setCopied(false), 2000);
  };
  const importCsv = async () => {
    if (!file || !students.length) return;
    setImporting(true); setNotice(""); setNoticeError(false);
    try {
      const response = await fetch("/api/classes/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ students }) }), data = await response.json() as { error?: string; imported?: number; classes?: number[] };
      if (!response.ok) throw new Error(data.error || t("classes.import.error"));
      const classCount = data.classes?.length || new Set(students.map((student) => student.turma)).size;
      setNotice(t("classes.import.success", { students: data.imported || students.length, classes: classCount })); clearFile();
      await onImported?.();
    } catch (error) { setNoticeError(true); setNotice(error instanceof Error ? error.message : t("classes.import.error")); }
    finally { setImporting(false); }
  };

  return <>
    {notice && <AppToast key={`${noticeError ? "error" : "success"}:${notice}`} kind={noticeError ? "error" : "success"} message={notice} onDismiss={() => setNotice("")} />}
    <section className={`panel ${styles.panel}`}>
      <header className={styles.header}>
        <span className={styles.icon}><Upload /></span>
        <div><span className="eyebrow">{t("classes.import.eyebrow")}</span><div className={styles.titleLine}><h2>{t("classes.import.title")}</h2><button type="button" className={styles.helpButton} onClick={() => setShowPrompt(true)} aria-label={t("classes.import.aiHelpAria")} title={t("classes.import.aiHelpAria")}><CircleHelp /></button></div><p>{t("classes.import.description")}</p></div>
      </header>
      <div className={styles.body}>
        <div className={styles.uploadColumn}>
          <FileUploadField accept=".csv,text/csv" emptyLabel={t("classes.import.emptyFile")} file={file} help={t("classes.import.fileHelp")} label={t("classes.import.fileLabel")} onChange={(event) => void selectFile(event.target.files?.[0])} onRemove={clearFile} />
          {students.length > 0 && <div className={styles.summary} aria-live="polite"><Check /><span><strong>{t("classes.import.ready", { count: students.length })}</strong><small>{t("classes.import.readyClasses", { count: new Set(students.map((student) => student.turma)).size })}</small></span></div>}
        </div>
        <aside className={styles.format}>
          <div className={styles.formatHeading}><FileSpreadsheet /><div><strong>{t("classes.import.formatTitle")}</strong><small>turma,nome,n_mecanografico,codigo_estatuto</small></div></div>
          <div className={styles.codes}>{STUDENT_STATUS_OPTIONS.map((option) => <span key={option.code}><b>{option.code}</b>{studentStatusLabel(option.value, locale)}</span>)}</div>
        </aside>
      </div>
      <footer className={styles.footer}><span>{importing ? <><LoaderCircle className={styles.spinner} />{t("classes.import.importing")}</> : t("classes.import.additive")}</span><button type="button" className="button button--primary button--compact" disabled={!file || !students.length || importing} onClick={() => void importCsv()}>{importing ? <LoaderCircle className={styles.spinner} /> : <Upload />}{importing ? t("classes.import.importingShort") : t("classes.import.action")}</button></footer>
    </section>
    {showPrompt && <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowPrompt(false); }}><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="csv-ai-prompt-title"><header><div><span className="eyebrow">{t("classes.import.aiEyebrow")}</span><h2 id="csv-ai-prompt-title">{t("classes.import.aiTitle")}</h2></div><button type="button" onClick={() => setShowPrompt(false)} aria-label={t("classes.import.close")}><X /></button></header><p>{t("classes.import.aiDescription")}</p><pre>{AI_PROMPT}</pre><footer><button type="button" className="button button--secondary" onClick={() => setShowPrompt(false)}>{t("classes.import.close")}</button><button type="button" className="button button--primary" onClick={() => void copyPrompt()}>{copied ? <Check /> : <Clipboard />}{copied ? t("classes.import.copied") : t("classes.import.copy")}</button></footer></section></div>}
  </>;
}
