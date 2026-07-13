"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  FileText,
  GraduationCap,
  LoaderCircle,
  Mail,
  Megaphone,
  Search,
  UserRound,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AppToast } from "@/components/app-toast";
import { AuthGuard } from "@/components/auth-guard";
import { ModuleGuard } from "@/components/module-guard";
import styles from "@/components/community-suite.module.css";

type ApiUnit = {
  id: string | number;
  code?: string;
  name?: string;
  description?: string | null;
  ects?: number;
  credits?: number;
  year?: number;
  studyYear?: number;
  study_year?: number;
  semester?: number;
  representative?: {
    id?: string | number;
    fullName?: string;
    full_name?: string;
    email?: string;
    position?: string;
    commissionPositionLabel?: string;
  };
  representativeName?: string;
  representative_name?: string;
  representativeEmail?: string;
  representative_email?: string;
};
type Unit = {
  id: string;
  code: string;
  name: string;
  description: string;
  ects: number;
  year: number;
  semester: number;
  representative: { name: string; email: string; position: string } | null;
};
type Detail = {
  unit: Unit;
  announcements: Array<{ id: string; title: string; publishedAt: string }>;
  documents: Array<{
    id: string;
    title: string;
    url?: string;
    type?: string;
    category?: never;
  }>;
  events: Array<{ id: string; title: string; startsAt: string; kind?: string }>;
  materials: Array<{
    id: string;
    title: string;
    url?: string;
    category?: string;
    type?: never;
  }>;
};
function unit(item: ApiUnit): Unit {
  const representative = item.representative;
  const name =
    representative?.fullName ??
    representative?.full_name ??
    item.representativeName ??
    item.representative_name;
  return {
    id: String(item.id),
    code: item.code ?? "UC",
    name: item.name ?? "Unidade curricular",
    description: item.description ?? "",
    ects: Number(item.ects ?? item.credits ?? 0),
    year: Number(item.year ?? item.studyYear ?? item.study_year ?? 1),
    semester: Number(item.semester ?? 1),
    representative: name
      ? {
          name,
          email:
            representative?.email ??
            item.representativeEmail ??
            item.representative_email ??
            "",
          position:
            representative?.position ??
            representative?.commissionPositionLabel ??
            "Representante da CC",
        }
      : null,
  };
}
async function readUnits() {
  let response = await fetch("/api/curricular-units", { cache: "no-store" });
  if (response.status === 404 || response.status === 405)
    response = await fetch("/api/admin/curricular-units", {
      cache: "no-store",
    });
  const data = (await response.json()) as { units?: ApiUnit[]; error?: string };
  if (!response.ok)
    throw new Error(
      data.error || "Não foi possível carregar as unidades curriculares.",
    );
  return (data.units ?? []).map(unit);
}
function date(value: string) {
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Lisbon",
  }).format(new Date(value));
}

export function CurricularUnitCatalog() {
  const [units, setUnits] = useState<Unit[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [year, setYear] = useState("all");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setUnits(await readUnits());
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível carregar as unidades curriculares.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-PT");
    return units.filter(
      (item) =>
        (year === "all" || item.year === Number(year)) &&
        (!term ||
          `${item.code} ${item.name} ${item.representative?.name ?? ""}`
            .toLocaleLowerCase("pt-PT")
            .includes(term)),
    );
  }, [units, query, year]);
  return (
    <AuthGuard>
      <ModuleGuard moduleKey="curricular_units.catalog">
        <AppShell active="curricular_units" breadcrumb="Unidades curriculares">
          <div className={styles.page}>
            <header className={styles.hero}>
              <div className={styles.heroCopy}>
                <span className={styles.heroIcon}>
                  <BookOpen />
                </span>
                <div>
                  <span className="eyebrow">Plano curricular</span>
                  <h1>Unidades curriculares</h1>
                  <p>
                    Explora o plano de estudos, os representantes da Comissão de
                    Curso e toda a informação relevante de cada unidade
                    curricular.
                  </p>
                </div>
              </div>
            </header>
            {error && (
              <AppToast
                kind="error"
                message={error}
                duration={0}
                onDismiss={() => setError("")}
              />
            )}
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>Catálogo do curso</h2>
                  <p>Organizado por ano e semestre.</p>
                </div>
                {!loading && (
                  <span className={styles.count}>
                    {visible.length}{" "}
                    {visible.length === 1 ? "unidade" : "unidades"}
                  </span>
                )}
              </div>
              <div className={styles.toolbar}>
                <label className={styles.search}>
                  <Search />
                  <span className="sr-only">Pesquisar unidade curricular</span>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Pesquisar por nome, código ou representante…"
                  />
                </label>
                <label>
                  <span className="sr-only">Filtrar por ano</span>
                  <select
                    className={styles.select}
                    value={year}
                    onChange={(event) => setYear(event.target.value)}
                  >
                    <option value="all">Todos os anos</option>
                    {[1, 2, 3, 4, 5, 6].map((value) => (
                      <option value={value} key={value}>
                        {value}.º ano
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {loading ? (
                <div className={styles.state}>
                  <LoaderCircle className={styles.spin} />
                  <strong>A carregar plano curricular…</strong>
                </div>
              ) : visible.length === 0 ? (
                <div className={styles.state}>
                  <Search />
                  <strong>Não encontrámos unidades curriculares.</strong>
                </div>
              ) : (
                <div className={styles.grid}>
                  {visible.map((item) => (
                    <Link
                      className={styles.card}
                      href={`/unidades-curriculares/${encodeURIComponent(item.id)}`}
                      key={item.id}
                    >
                      <div className={styles.cardTop}>
                        <span className={styles.unitCode}>{item.code}</span>
                        <span className={styles.tag}>
                          {item.year}.º ano · {item.semester}.º semestre
                        </span>
                      </div>
                      <div>
                        <h3>{item.name}</h3>
                        {item.description && <p>{item.description}</p>}
                      </div>
                      <div className={styles.metrics}>
                        <div className={styles.metric}>
                          <span>Créditos</span>
                          <strong>
                            {item.ects.toLocaleString("pt-PT")} ECTS
                          </strong>
                        </div>
                        <div className={styles.metric}>
                          <span>Ano</span>
                          <strong>{item.year}.º</strong>
                        </div>
                        <div className={styles.metric}>
                          <span>Semestre</span>
                          <strong>{item.semester}.º</strong>
                        </div>
                      </div>
                      <div className={styles.metaRow}>
                        <UserRound />
                        <span>
                          {item.representative?.name ??
                            "Representante por atribuir"}
                        </span>
                      </div>
                      <span className={styles.linkHint}>
                        Ver área da unidade curricular <ArrowRight />
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        </AppShell>
      </ModuleGuard>
    </AuthGuard>
  );
}

export function CurricularUnitDetail({ id }: { id: string }) {
  const [data, setData] = useState<Detail | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/curricular-units/${encodeURIComponent(id)}`,
        { cache: "no-store" },
      );
      const raw = (await response.json()) as {
        unit?: ApiUnit;
        announcements?: Array<{
          id: string | number;
          title: string;
          publishedAt?: string;
          published_at?: string;
        }>;
        documents?: Array<{
          id: string | number;
          title: string;
          url?: string;
          type?: string;
          attachmentDataUrl?: string;
        }>;
        events?: Array<{
          id: string | number;
          title: string;
          startsAt?: string;
          starts_at?: string;
          kind?: string;
        }>;
        upcomingEvents?: Array<{
          id: string | number;
          title: string;
          startsAt?: string;
          starts_at?: string;
          kind?: string;
        }>;
        materials?: Array<{
          id: string | number;
          title: string;
          url?: string;
          category?: string;
          type?: string;
          attachmentDataUrl?: string;
        }>;
        error?: string;
      };
      if (!response.ok || !raw.unit)
        throw new Error(
          raw.error || "Não foi possível carregar esta unidade curricular.",
        );
      setData({
        unit: unit(raw.unit),
        announcements: (raw.announcements ?? []).map((item) => ({
          id: String(item.id),
          title: item.title,
          publishedAt:
            item.publishedAt ?? item.published_at ?? new Date().toISOString(),
        })),
        documents: (raw.documents ?? []).map((item) => ({
          id: String(item.id),
          title: item.title,
          type: item.type,
          url: item.url ?? item.attachmentDataUrl,
        })),
        events: (raw.events ?? raw.upcomingEvents ?? []).map((item) => ({
          id: String(item.id),
          title: item.title,
          startsAt: item.startsAt ?? item.starts_at ?? new Date().toISOString(),
          kind: item.kind,
        })),
        materials: (raw.materials ?? []).map((item) => ({
          id: String(item.id),
          title: item.title,
          category:
            item.category ??
            (item.type === "exam_photo"
              ? "Exame"
              : item.type === "summary"
                ? "Resumo"
                : item.type === "notes"
                  ? "Sebenta ou apontamentos"
                  : "Material"),
          url: item.url ?? item.attachmentDataUrl,
        })),
      });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível carregar esta unidade curricular.",
      );
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <AuthGuard>
      <ModuleGuard moduleKey="curricular_units.detail">
        <AppShell
          active="curricular_units"
          breadcrumb={data?.unit.name ?? "Unidade curricular"}
        >
          <div className={styles.page}>
            {error && (
              <AppToast
                kind="error"
                message={error}
                duration={0}
                onDismiss={() => setError("")}
              />
            )}{" "}
            {loading ? (
              <section className={styles.panel}>
                <div className={styles.state}>
                  <LoaderCircle className={styles.spin} />
                  <strong>A preparar a área da unidade curricular…</strong>
                </div>
              </section>
            ) : (
              data && (
                <>
                  <section className={`${styles.panel} ${styles.detailHero}`}>
                    <div>
                      <span className={styles.unitCode}>{data.unit.code}</span>
                      <h1>{data.unit.name}</h1>
                      <p>
                        {data.unit.description ||
                          "Informação, recursos e acompanhamento da Comissão de Curso para esta unidade curricular."}
                      </p>
                    </div>
                    <div className={styles.detailStats}>
                      <div className={styles.metric}>
                        <span>Créditos</span>
                        <strong>{data.unit.ects} ECTS</strong>
                      </div>
                      <div className={styles.metric}>
                        <span>Ano</span>
                        <strong>{data.unit.year}.º</strong>
                      </div>
                      <div className={styles.metric}>
                        <span>Semestre</span>
                        <strong>{data.unit.semester}.º</strong>
                      </div>
                    </div>
                  </section>
                  <div className={styles.columns}>
                    <div className={styles.page}>
                      <DetailSection
                        title="Próximos momentos"
                        description="Avaliações, entregas e eventos desta unidade."
                        empty="Ainda não existem datas associadas."
                      >
                        {data.events.map((item) => (
                          <div className={styles.listItem} key={item.id}>
                            <span className={styles.listIcon}>
                              <CalendarDays />
                            </span>
                            <span>
                              <strong>{item.title}</strong>
                              <small>
                                {date(item.startsAt)}
                                {item.kind ? ` · ${item.kind}` : ""}
                              </small>
                            </span>
                          </div>
                        ))}
                      </DetailSection>
                      <DetailSection
                        title="Avisos da unidade"
                        description="Comunicados relacionados com esta cadeira."
                        empty="Ainda não existem avisos associados."
                      >
                        {data.announcements.map((item) => (
                          <div className={styles.listItem} key={item.id}>
                            <span className={styles.listIcon}>
                              <Megaphone />
                            </span>
                            <span>
                              <strong>{item.title}</strong>
                              <small>{date(item.publishedAt)}</small>
                            </span>
                            <Link href="/avisos">Consultar</Link>
                          </div>
                        ))}
                      </DetailSection>
                    </div>
                    <div className={styles.page}>
                      <section className={styles.panel}>
                        <div className={styles.panelHeader}>
                          <div>
                            <h2>Representante da CC</h2>
                            <p>Acompanhamento desta unidade curricular.</p>
                          </div>
                        </div>
                        <div className={styles.sectionBody}>
                          {data.unit.representative ? (
                            <>
                              <div className={styles.cardTop}>
                                <span className={styles.avatar}>
                                  {data.unit.representative.name
                                    .split(/\s+/)
                                    .slice(0, 2)
                                    .map((part) => part[0])
                                    .join("")}
                                </span>
                                <span className={styles.tag}>
                                  {data.unit.representative.position}
                                </span>
                              </div>
                              <h3>{data.unit.representative.name}</h3>
                              {data.unit.representative.email && (
                                <div className={styles.metaRow}>
                                  <Mail />
                                  <span>{data.unit.representative.email}</span>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className={styles.state}>
                              <GraduationCap />
                              <strong>Representante por atribuir.</strong>
                            </div>
                          )}
                        </div>
                      </section>
                      <DetailSection
                        title="Documentos e materiais"
                        description="Recursos associados à unidade."
                        empty="Ainda não existem recursos disponíveis."
                      >
                        {[...data.documents, ...data.materials].map((item) => (
                          <div className={styles.listItem} key={item.id}>
                            <span className={styles.listIcon}>
                              <FileText />
                            </span>
                            <span>
                              <strong>{item.title}</strong>
                              <small>
                                {"type" in item ? item.type : item.category}
                              </small>
                            </span>
                            {item.url && (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Abrir
                              </a>
                            )}
                          </div>
                        ))}
                      </DetailSection>
                    </div>
                  </div>
                </>
              )
            )}
          </div>
        </AppShell>
      </ModuleGuard>
    </AuthGuard>
  );
}

function DetailSection({
  title,
  description,
  empty,
  children,
}: {
  title: string;
  description: string;
  empty: string;
  children: React.ReactNode;
}) {
  const count = Array.isArray(children) ? children.length : 1;
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      {count ? (
        <div className={styles.sectionBody}>{children}</div>
      ) : (
        <div className={styles.state}>
          <BookOpen />
          <strong>{empty}</strong>
        </div>
      )}
    </section>
  );
}
