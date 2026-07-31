/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CircleAlert,
  ShieldCheck,
  UserRoundSearch,
} from "lucide-react";
import { useI18n } from "@/components/i18n-context";
import { classDataLabel } from "@/lib/i18n-classes";

const editorIssueCodes = new Set([
  "PREFERENCIAS_EM_FALTA",
  "DESTINO_INVALIDO",
  "ORDEM_PREFERENCIAS_INVALIDA",
  "INFORMACAO_POR_VALIDAR",
  "INFORMACAO_VALIDAR_POSTERIORMENTE",
  "INFORMACAO_VALIDADA_SEM_PONTOS",
]);

export type PreflightIssue = {
  severity: "blocker" | "warning";
  code: string;
  message: string;
  classId?: number;
  studentId?: string;
  studentName?: string;
  studentNumber?: string;
};

export type PreflightCheck = {
  key: string;
  label: string;
  description: string;
  status: "passed" | "blocked" | "warning";
  count: number;
};

export type DistributionPreflightResult = {
  ready: boolean;
  checkedAt: number;
  summary: {
    classes: number;
    students: number;
    blockers: number;
    warnings: number;
    automaticStays: number;
    exceptionalPending: number;
  };
  checks: PreflightCheck[];
  issues: PreflightIssue[];
  simulation?: {
    possible: boolean;
    moved: number;
    manualReviews: number;
    randomized?: number;
    tieBreaks?: number;
    tieBreakStudents?: number;
    classCounts: Record<string, number>;
    competition?: Array<{
      classId: number;
      candidates: number;
      placed: number;
      notPlaced: number;
      finalSize: number;
      maximumSize: number;
      originSize?: number;
      firstChoiceCandidates?: number;
      otherChoiceCandidates?: number;
      firstChoicePlaced?: number;
      candidateCapacity?: number;
    }>;
  } | null;
};

export function DistributionPreflight({
  result,
  onReviewStudent,
  compact = false,
}: {
  result: DistributionPreflightResult;
  onReviewStudent: (studentId: string) => void;
  compact?: boolean;
}) {
  const { locale, t } = useI18n();
  const [severity, setSeverity] = useState<"all" | "blocker" | "warning">("all");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const categories = useMemo(
    () => [...new Set(result.issues.map((issue) => issue.code))],
    [result.issues],
  );
  const filtered = useMemo(
    () =>
      result.issues
        .filter(
          (issue) =>
            (severity === "all" || issue.severity === severity) &&
            (category === "all" || issue.code === category),
        )
        .sort((a, b) => Number(b.severity === "blocker") - Number(a.severity === "blocker")),
    [result.issues, severity, category],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const start = (currentPage - 1) * pageSize;
  const shown = filtered.slice(start, start + pageSize);
  const groups = Object.entries(
    shown.reduce<Record<string, PreflightIssue[]>>(
      (all, issue) => ({ ...all, [issue.code]: [...(all[issue.code] || []), issue] }),
      {},
    ),
  );
  const tieBreakCount =
    result.simulation?.tieBreakStudents ??
    result.simulation?.tieBreaks ??
    result.simulation?.randomized ??
    0;
  const competition = (result.simulation?.competition || [])
    .map((item) => {
      const originSize = item.originSize ?? Math.max(0, item.finalSize - item.placed);
      const firstChoice = item.firstChoiceCandidates ?? item.candidates;
      const otherChoices = item.otherChoiceCandidates ?? Math.max(0, item.candidates - firstChoice);
      const maximumVacancies =
        item.candidateCapacity ?? Math.max(0, item.maximumSize - originSize);
      const firstChoiceCollisions =
        item.firstChoicePlaced == null
          ? Math.max(0, item.notPlaced)
          : Math.max(0, firstChoice - item.firstChoicePlaced);
      return {
        ...item,
        originSize,
        firstChoice,
        otherChoices,
        maximumVacancies,
        firstChoiceCollisions,
      };
    })
    .sort(
      (a, b) =>
        b.firstChoiceCollisions - a.firstChoiceCollisions ||
        b.firstChoice - a.firstChoice ||
        a.classId - b.classId,
    );
  const firstChoiceCollisions = competition.reduce(
    (total, item) => total + item.firstChoiceCollisions,
    0,
  );
  const checkedAt = new Date(result.checkedAt);
  const hasBlockingState = !result.ready || result.summary.blockers > 0;
  const blockerLabel =
    result.summary.blockers === 1
      ? t("classes.preflight.blockerOne")
      : t("classes.preflight.blockerMany");
  const blockerMessage = t("classes.preflight.blockers", {
    count: result.summary.blockers,
    label: blockerLabel,
  });
  const issueGuidance = (code: string) => {
    if (code === "DISTRIBUICAO_ATIVA") {
      return locale === "en"
        ? "Finish the current cycle or remove its publication using the main action on this page."
        : "Conclui o ciclo atual ou retira a publicação através da ação principal desta página.";
    }
    if (code === "DISTRIBUICAO_IMPOSSIVEL") {
      return locale === "en"
        ? "Review class balance and use the exceptional calculation only when the rule of three is impossible."
        : "Revê o equilíbrio das turmas e usa o cálculo excecional apenas se a regra dos três for impossível.";
    }
    return locale === "en"
      ? "Correct the indicated source data and refresh the preflight check."
      : "Corrige os dados de origem indicados e atualiza a pré-validação.";
  };
  const issueActionLabel = (code: string) => {
    if (code === "INFORMACAO_POR_VALIDAR" || code === "INFORMACAO_VALIDAR_POSTERIORMENTE") {
      return locale === "en" ? "Validate information" : "Validar informação";
    }
    if (code === "INFORMACAO_VALIDADA_SEM_PONTOS") {
      return locale === "en" ? "Confirm scoring" : "Confirmar pontuação";
    }
    return locale === "en" ? "Correct preferences" : "Corrigir preferências";
  };

  useEffect(() => {
    setPage(1);
  }, [severity, category, pageSize]);
  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [page, pages]);

  const issueList = (
    <>
      <div className="preflight-results__toolbar">
        <div>
          <strong>{t("classes.preflight.reviewCases")}</strong>
          <span>
            {filtered.length
              ? `${start + 1}–${Math.min(start + pageSize, filtered.length)} ${t("classes.common.of")} ${filtered.length}`
              : t("classes.preflight.casesZero")}
          </span>
        </div>
        <label>
          {t("classes.preflight.priority")}
          <select
            aria-label={t("classes.preflight.priorityAria")}
            value={severity}
            onChange={(event) => setSeverity(event.target.value as typeof severity)}
          >
            <option value="all">{t("classes.preflight.allFeminine")}</option>
            <option value="blocker">{t("classes.preflight.blockersOption")}</option>
            <option value="warning">{t("classes.preflight.warnings")}</option>
          </select>
        </label>
        <label>
          {t("classes.preflight.category")}
          <select
            aria-label={t("classes.preflight.categoryAria")}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="all">{t("classes.preflight.allFeminine")}</option>
            {categories.map((code) => (
              <option key={code} value={code}>
                {classDataLabel(locale, "preflightGroup", code) || code.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("classes.preflight.perPage")}
          <select
            aria-label={t("classes.preflight.perPageAria")}
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
          >
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
          </select>
        </label>
      </div>

      {groups.length > 0 ? (
        <div className="placement-preflight__issues" id="placement-review-cases-list">
          {groups.map(([code, issues]) => (
            <section key={code} className={`preflight-group is-${issues[0].severity}`}>
              <header>
                <div>
                  <strong>
                    {classDataLabel(locale, "preflightGroup", code) || code.replaceAll("_", " ")}
                  </strong>
                  <span>{t("classes.preflight.onPage", { count: issues.length })}</span>
                </div>
              </header>
              <div>
                {issues.map((issue, index) => (
                  <article
                    key={`${issue.studentId || issue.classId || index}-${index}`}
                    id={issue === shown[0] ? "placement-review-first-case" : undefined}
                  >
                    <div>
                      <strong>{issue.studentName || issue.message}</strong>
                      {issue.studentNumber && <span>{issue.studentNumber}</span>}
                      <small>
                        {issue.studentName
                          ? issue.message
                          : issue.classId
                            ? t("classes.common.class", { number: issue.classId })
                            : issue.code}
                      </small>
                    </div>
                    {issue.studentId && editorIssueCodes.has(issue.code) ? (
                      <button type="button" onClick={() => onReviewStudent(issue.studentId!)}>
                        <UserRoundSearch aria-hidden="true" />
                        {issueActionLabel(issue.code)}
                      </button>
                    ) : issue.classId ? (
                      <Link href={`/turmas/${issue.classId}`}>
                        {t("classes.preflight.openClass", { number: issue.classId })}
                        <ArrowRight aria-hidden="true" />
                      </Link>
                    ) : issue.code === "JANELAS_PREFERENCIAS_ABERTAS" ? (
                      <Link href="/admin">
                        {locale === "en" ? "Open calendar" : "Abrir calendário"}
                        <ArrowRight aria-hidden="true" />
                      </Link>
                    ) : issue.code === "SEM_TURMAS" || issue.code === "SEM_ESTUDANTES" ? (
                      <Link href="/turmas">
                        {locale === "en" ? "Manage classes" : "Gerir turmas"}
                        <ArrowRight aria-hidden="true" />
                      </Link>
                    ) : (
                      <span className="preflight-group__guidance">{issueGuidance(issue.code)}</span>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="empty-state" role="status">
          {t("classes.preflight.noCases")}
        </div>
      )}

      {filtered.length > 0 && (
        <nav className="placement-pagination" aria-label={t("classes.preflight.paginationAria")}>
          <span>
            {t("classes.common.page")} <strong>{currentPage}</strong> {t("classes.common.of")}{" "}
            <strong>{pages}</strong>
          </span>
          <div>
            <button
              type="button"
              aria-label={t("classes.preflight.firstCasesPage")}
              disabled={currentPage === 1}
              onClick={() => setPage(1)}
            >
              <ChevronsLeft aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={t("classes.preflight.previousCasesPage")}
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={t("classes.preflight.nextCasesPage")}
              disabled={currentPage === pages}
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={t("classes.preflight.lastCasesPage")}
              disabled={currentPage === pages}
              onClick={() => setPage(pages)}
            >
              <ChevronsRight aria-hidden="true" />
            </button>
          </div>
        </nav>
      )}
    </>
  );

  return (
    <section
      className={`panel placement-preflight ${result.ready ? "is-ready" : "is-blocked"}${compact ? " is-compact" : ""}`}
      aria-labelledby="preflight-title"
    >
      <header className="panel__header placement-preflight__header">
        <span className="placement-preflight__status" aria-hidden="true">
          {result.ready ? <ShieldCheck /> : <CircleAlert />}
        </span>
        <div>
          <span className="eyebrow">
            {hasBlockingState
              ? locale === "en"
                ? "What needs correcting"
                : "O que falta corrigir"
              : t("classes.preflight.eyebrow")}
          </span>
          <h2 id="preflight-title">
            {result.ready ? t("classes.preflight.ready") : t("classes.preflight.blocked")}
          </h2>
          <p>
            {result.ready
              ? locale === "en"
                ? "No impediments were found. The private proposal can now be calculated."
                : "Não foram encontrados impedimentos. Já podes calcular a proposta privada."
              : blockerMessage}
          </p>
        </div>
        <div className="placement-preflight__status-detail">
          <div
            className="placement-preflight__status-counts"
            aria-label={result.ready ? t("classes.preflight.ready") : blockerMessage}
          >
            <span className={result.summary.blockers > 0 ? "is-blocker" : "is-clear"}>
              <strong>{result.summary.blockers}</strong>
              {t("classes.preflight.blockersOption")}
            </span>
            {result.summary.warnings > 0 && (
              <span className="is-warning">
                <strong>{result.summary.warnings}</strong>
                {t("classes.preflight.warnings")}
              </span>
            )}
          </div>
          <time dateTime={checkedAt.toISOString()}>
            {t("classes.preflight.checkedAt", {
              date: checkedAt.toLocaleString(locale === "en" ? "en-GB" : "pt-PT"),
            })}
          </time>
        </div>
      </header>

      {hasBlockingState ? (
        <section
          id="placement-review-cases"
          className="preflight-results is-required"
          aria-labelledby="placement-review-cases-title"
        >
          <header className="preflight-results__summary preflight-results__summary--locked">
            <span>
              <strong id="placement-review-cases-title">{t("classes.preflight.reviewCases")}</strong>
              <small>{blockerMessage}</small>
            </span>
            <span className="preflight-results__summary-count">{result.issues.length}</span>
            <CircleAlert aria-hidden="true" />
          </header>
          {issueList}
        </section>
      ) : (
        result.issues.length > 0 && (
          <details id="placement-review-cases" className="preflight-results">
            <summary className="preflight-results__summary">
              <span>
                <strong>{t("classes.preflight.reviewCases")}</strong>
                <small>{t("classes.preflight.ready")}</small>
              </span>
              <span className="preflight-results__summary-count">{result.issues.length}</span>
              <ChevronDown aria-hidden="true" />
            </summary>
            {issueList}
          </details>
        )
      )}

      {result.simulation?.possible && (
        <div className="placement-preflight__simulation">
          <div className="placement-preflight__simulation-summary">
            <div>
              <span className="eyebrow">{t("classes.preflight.previewEyebrow")}</span>
              <strong>{t("classes.preflight.previewTitle")}</strong>
              {result.simulation.manualReviews > 0 && (
                <small>
                  {t(
                    result.simulation.manualReviews === 1
                      ? "classes.preflight.manualReviewOne"
                      : "classes.preflight.manualReviewMany",
                    { count: result.simulation.manualReviews },
                  )}
                </small>
              )}
            </div>
            <div className="placement-preflight__simulation-kpis">
              <span>
                <strong>{result.simulation.moved}</strong>
                <small>{t("classes.preflight.moves")}</small>
              </span>
              <span>
                <strong>{result.summary.classes}</strong>
                <small>{t("classes.preflight.classes")}</small>
              </span>
              <span className={firstChoiceCollisions > 0 ? "is-warning" : ""}>
                <strong>{firstChoiceCollisions}</strong>
                <small>{t("classes.preflight.collisions")}</small>
              </span>
              <span>
                <strong>{tieBreakCount}</strong>
                <small>{t("classes.preflight.tiebreaks")}</small>
              </span>
            </div>
          </div>
          {competition.length ? (
            <details className="placement-preflight__competition-details">
              <summary>
                <span>
                  <strong>{t("classes.preflight.tableAria")}</strong>
                  <small>
                    {competition.length}{" "}
                    {t("classes.preflight.classes").toLocaleLowerCase(
                      locale === "en" ? "en-GB" : "pt-PT",
                    )}
                  </small>
                </span>
                <ChevronDown aria-hidden="true" />
              </summary>
              <div className="placement-preflight__competition">
                <div className="placement-preflight__competition-table-wrap">
                  <table
                    className="placement-preflight__competition-table"
                    aria-label={t("classes.preflight.tableAria")}
                  >
                    <thead>
                      <tr>
                        <th>{t("classes.common.class", { number: "" }).trim()}</th>
                        <th title={t("classes.preflight.currentTitle")}>
                          {t("classes.preflight.current")}
                        </th>
                        <th title={t("classes.preflight.firstChoiceTitle")}>
                          {t("classes.preflight.firstChoice")}
                        </th>
                        <th title={t("classes.preflight.otherChoicesTitle")}>
                          {t("classes.preflight.otherChoices")}
                        </th>
                        <th title={t("classes.preflight.maxVacanciesTitle")}>
                          {t("classes.preflight.maxVacancies")}
                        </th>
                        <th title={t("classes.preflight.expectedTitle")}>
                          {t("classes.preflight.expected")}
                        </th>
                        <th title={t("classes.preflight.collisionTitle")}>
                          {t("classes.preflight.collisionColumn")}
                        </th>
                        <th>{t("classes.preflight.capacity")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {competition.map((item) => (
                        <tr
                          key={item.classId}
                          className={item.firstChoiceCollisions > 0 ? "is-contested" : ""}
                        >
                          <td>
                            <strong>{t("classes.common.class", { number: item.classId })}</strong>
                          </td>
                          <td>{item.originSize}</td>
                          <td>{item.firstChoice}</td>
                          <td>{item.otherChoices}</td>
                          <td>{item.maximumVacancies}</td>
                          <td>{item.placed}</td>
                          <td>
                            <span className={item.firstChoiceCollisions > 0 ? "is-collision" : ""}>
                              {item.firstChoiceCollisions}
                            </span>
                          </td>
                          <td>
                            <strong>
                              {item.finalSize}/{item.maximumSize}
                            </strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="placement-preflight__competition-legend">
                  <span>
                    <strong>{t("classes.preflight.maxVacancies")}</strong>{" "}
                    {t("classes.preflight.vacanciesLegend")}
                  </span>
                  <span>
                    <strong>{t("classes.preflight.collisions")}</strong>{" "}
                    {t("classes.preflight.collisionsLegend")}
                  </span>
                </p>
              </div>
            </details>
          ) : (
            <div className="placement-preflight__competition-fallback">
              {Object.entries(result.simulation.classCounts).map(([classId, count]) => (
                <span key={classId}>
                  {t("classes.common.class", { number: classId })}
                  <strong>{count}</strong>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
