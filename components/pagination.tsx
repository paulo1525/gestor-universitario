"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useI18n } from "@/components/i18n-context";
import styles from "@/components/pagination.module.css";

type PaginationItem = number | "ellipsis-start" | "ellipsis-end";

function paginationItems(totalPages: number, currentPage: number): PaginationItem[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  if (currentPage <= 4) return [1, 2, 3, 4, 5, "ellipsis-end", totalPages];
  if (currentPage >= totalPages - 3) return [1, "ellipsis-start", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  return [1, "ellipsis-start", currentPage - 1, currentPage, currentPage + 1, "ellipsis-end", totalPages];
}

/** Clamp a page to the available range; use it to read the current page from state. */
export function clampPage(page: number, totalItems: number, pageSize: number) {
  return Math.min(Math.max(1, page), Math.max(1, Math.ceil(totalItems / pageSize)));
}

/* Shared list pagination: rendered at the bottom of a list panel, only when there is more than one page. */
export function Pagination({ page, totalItems, pageSize, onChange }: { page: number; totalItems: number; pageSize: number; onChange: (page: number) => void }) {
  const { t } = useI18n();
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const current = clampPage(page, totalItems, pageSize);
  if (totalPages <= 1) return null;
  const go = (next: number) => { onChange(next); window.scrollTo({ top: 0 }); };
  return (
    <nav className={styles.pagination} aria-label={t("announcements.pagination.aria")}>
      <button type="button" onClick={() => go(current - 1)} disabled={current === 1} aria-label={t("announcements.pagination.previous")}><ChevronLeft /></button>
      <div>
        {paginationItems(totalPages, current).map(item => typeof item === "number"
          ? <button type="button" key={item} className={item === current ? styles.active : ""} aria-current={item === current ? "page" : undefined} aria-label={t("announcements.pagination.page", { page: item })} onClick={() => go(item)}>{item}</button>
          : <span key={item} aria-hidden="true">…</span>)}
      </div>
      <button type="button" onClick={() => go(current + 1)} disabled={current === totalPages} aria-label={t("announcements.pagination.next")}><ChevronRight /></button>
    </nav>
  );
}
