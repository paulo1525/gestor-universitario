"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";

export function TopbarGlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.matches("input, textarea, select, [contenteditable='true']");
      if ((event.key === "/" && !isTyping) || (event.key.toLocaleLowerCase() === "k" && (event.ctrlKey || event.metaKey))) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = query.trim();
    router.push(value ? `/pesquisa?q=${encodeURIComponent(value)}` : "/pesquisa");
  };

  return <form className="topbar-global-search" role="search" aria-label="Pesquisa global" onSubmit={submit}>
    <Search aria-hidden="true" />
    <input ref={inputRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="Pesquisar em toda a aplicação…" maxLength={160} aria-label="Pesquisar em toda a aplicação" />
    <kbd>Ctrl K</kbd>
    <button type="submit" aria-label="Pesquisar"><Search /></button>
  </form>;
}
