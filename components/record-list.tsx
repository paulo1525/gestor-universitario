"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "@/components/record-list.module.css";

/* Shared plumbing for the list → reading-card model (see requests-center.tsx):
   the open item lives in #<prefix>-<id> so it can be linked and Back works. */

function idFromHash(prefix: string) {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  const start = `#${prefix}-`;
  return hash.startsWith(start) && hash.length > start.length ? decodeURIComponent(hash.slice(start.length)) : null;
}

export function recordHref(prefix: string, id: string) {
  return `#${prefix}-${encodeURIComponent(id)}`;
}

export function useHashRecord(prefix: string, { scroll = true }: { scroll?: boolean } = {}): [string | null, (id: string | null) => void] {
  const [openId, setOpenId] = useState<string | null>(() => idFromHash(prefix));
  useEffect(() => {
    const sync = () => setOpenId(idFromHash(prefix));
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  }, [prefix]);
  const open = useCallback((id: string | null) => {
    const url = new URL(window.location.href);
    url.hash = id ? `${prefix}-${id}` : "";
    window.history.pushState(null, "", url);
    setOpenId(id);
    if (scroll) window.scrollTo({ top: 0 });
  }, [prefix, scroll]);
  return [openId, open];
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}

/** Static placeholder rows; the status text is for screen readers only. */
export function RecordSkeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return <div className={styles.skeleton} aria-busy="true">
    <span className="sr-only" role="status">{label}</span>
    {Array.from({ length: rows }, (_, index) => <div key={index} className={styles.skeletonRow}><span /><span /></div>)}
  </div>;
}
