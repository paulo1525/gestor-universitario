"use client";

import { FormEvent, KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  CircleAlert,
  FileText,
  GraduationCap,
  LoaderCircle,
  Megaphone,
  MessageSquareText,
  Search,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";

type ApiResult = {
  id: string | number;
  type?: string;
  title?: string;
  name?: string;
  description?: string;
  excerpt?: string;
  href?: string;
  url?: string;
  meta?: string;
  createdAt?: string;
};

type SearchResult = {
  id: string;
  type: string;
  title: string;
  description: string;
  href: string;
};

const typeLabels: Record<string, string> = {
  announcement: "Comunicado",
  curricular_unit: "Unidade curricular",
  document: "Documento",
  material: "Material",
  member: "Membro",
  event: "Evento",
  poll: "Inquérito",
  request: "Pedido",
};

function normalize(item: ApiResult): SearchResult {
  return {
    id: String(item.id),
    type: item.type ?? "content",
    title: item.title ?? item.name ?? "Resultado",
    description: item.description ?? item.excerpt ?? item.meta ?? item.createdAt ?? "Conteúdo da aplicação",
    href: item.href ?? item.url ?? "/pesquisa",
  };
}

function groupLabel(type: string) {
  if (type.includes("announcement")) return "Comunicados";
  if (type.includes("unit")) return "Unidades curriculares";
  if (type.includes("document") || type.includes("material")) return "Recursos";
  if (type.includes("member") || type.includes("user")) return "Pessoas";
  if (type.includes("event")) return "Eventos";
  if (type.includes("poll") || type.includes("request")) return "Participação";
  return "Outros resultados";
}

function resultIcon(type: string) {
  if (type.includes("announcement")) return <Megaphone />;
  if (type.includes("unit")) return <BookOpen />;
  if (type.includes("member") || type.includes("user")) return <Users />;
  if (type.includes("event")) return <CalendarDays />;
  if (type.includes("poll")) return <BarChart3 />;
  if (type.includes("request")) return <MessageSquareText />;
  if (type.includes("material")) return <GraduationCap />;
  return <FileText />;
}

export function TopbarGlobalSearch() {
  const router = useRouter();
  const listboxId = useId();
  const rootRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const focusSearch = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.matches("input, textarea, select, [contenteditable='true']");
      if ((event.key === "/" && !isTyping) || (event.key.toLocaleLowerCase() === "k" && (event.ctrlKey || event.metaKey))) {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        if (query.trim()) setOpen(true);
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, [query]);

  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) return;

    let controller: AbortController | undefined;
    const timeout = window.setTimeout(async () => {
      const requestController = new AbortController();
      controller = requestController;
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(value)}`, {
          cache: "no-store",
          signal: requestController.signal,
        });
        const data = await response.json() as { results?: ApiResult[]; items?: ApiResult[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Não foi possível pesquisar.");
        setResults((data.results ?? data.items ?? []).map(normalize).slice(0, 8));
      } catch (reason) {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setResults([]);
          setError(reason instanceof Error ? reason.message : "Não foi possível pesquisar.");
        }
      } finally {
        if (!requestController.signal.aborted) setLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller?.abort();
    };
  }, [query]);

  const groups = useMemo(() => {
    const grouped = new Map<string, Array<SearchResult & { index: number }>>();
    results.forEach((result, index) => {
      const label = groupLabel(result.type);
      grouped.set(label, [...(grouped.get(label) ?? []), { ...result, index }]);
    });
    return Array.from(grouped, ([label, items]) => ({ label, items }));
  }, [results]);

  const searchUrl = () => {
    const value = query.trim();
    return value ? `/pesquisa?q=${encodeURIComponent(value)}` : "/pesquisa";
  };

  const openFullSearch = () => {
    setOpen(false);
    setActiveIndex(-1);
    router.push(searchUrl());
  };

  const openResult = (result: SearchResult) => {
    setOpen(false);
    setActiveIndex(-1);
    router.push(result.href);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    openFullSearch();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      if (open) event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (!results.length) return;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex(current => current < 0 ? (direction > 0 ? 0 : results.length - 1) : (current + direction + results.length) % results.length);
      return;
    }
    if (event.key === "Enter" && activeIndex >= 0 && results[activeIndex]) {
      event.preventDefault();
      openResult(results[activeIndex]);
    }
  };

  const value = query.trim();
  const panelVisible = open && value.length > 0;

  return <form ref={rootRef} className="topbar-global-search" role="search" aria-label="Pesquisa global" onSubmit={submit}>
    <Search aria-hidden="true" />
    <input
      ref={inputRef}
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={panelVisible}
      aria-controls={listboxId}
      aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
      value={query}
      onChange={event => {
        const nextQuery = event.target.value;
        setQuery(nextQuery);
        setOpen(Boolean(nextQuery.trim()));
        setActiveIndex(-1);
        setError("");
        setResults([]);
        setLoading(nextQuery.trim().length >= 2);
      }}
      onFocus={() => { if (query.trim()) setOpen(true); }}
      onKeyDown={handleKeyDown}
      placeholder="Pesquisar em toda a aplicação…"
      maxLength={160}
      aria-label="Pesquisar em toda a aplicação"
    />
    <kbd>Ctrl K</kbd>
    <button type="submit" aria-label="Abrir pesquisa completa"><Search /></button>

    {panelVisible && <div className="topbar-search-popover" onPointerDown={event => event.preventDefault()}>
      <div className="topbar-search-results" id={listboxId} role="listbox" aria-label="Sugestões de pesquisa">
        {value.length < 2 ? <div className="topbar-search-state"><Search /><span>Escreve pelo menos 2 caracteres.</span></div>
          : loading ? <div className="topbar-search-state" role="status"><LoaderCircle className="spin" /><span>A pesquisar…</span></div>
          : error ? <div className="topbar-search-state topbar-search-state--error" role="status"><CircleAlert /><span>{error}</span></div>
          : results.length === 0 ? <div className="topbar-search-state"><Search /><span>Sem resultados para “{value}”.</span></div>
          : groups.map((group, groupIndex) => <section className="topbar-search-group" role="group" aria-labelledby={`${listboxId}-group-${groupIndex}`} key={group.label}>
            <h3 id={`${listboxId}-group-${groupIndex}`}>{group.label}</h3>
            {group.items.map(result => <button
              className={`topbar-search-option${activeIndex === result.index ? " is-active" : ""}`}
              id={`${listboxId}-option-${result.index}`}
              type="button"
              role="option"
              aria-selected={activeIndex === result.index}
              key={`${result.type}-${result.id}`}
              onMouseEnter={() => setActiveIndex(result.index)}
              onClick={() => openResult(result)}
            >
              <span className="topbar-search-option__icon">{resultIcon(result.type)}</span>
              <span className="topbar-search-option__copy"><strong>{result.title}</strong><small>{result.description}</small></span>
              <span className="topbar-search-option__type" data-result-type={result.type}>{typeLabels[result.type] ?? result.type.replaceAll("_", " ")}</span>
            </button>)}
          </section>)}
      </div>
      {value.length >= 2 && <button className="topbar-search-all" type="button" onClick={openFullSearch}>
        <span>Ver todos os resultados para “{value}”</span><ArrowRight />
      </button>}
    </div>}
  </form>;
}
