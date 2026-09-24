"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  Mail,
  Search,
  Users,
  X,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AppToast } from "@/components/app-toast";
import { AuthGuard } from "@/components/auth-guard";
import { ModuleGuard } from "@/components/module-guard";
import { FilterBar, FilterSearch, FilterSegmented } from "@/components/filter-bar";
import { SurfaceHeader } from "@/components/surface-header";
import { useI18n } from "@/components/i18n-context";
import { useModuleEnabled } from "@/components/use-module-enabled";
import styles from "@/components/commission-directory.module.css";
import list from "@/components/record-list.module.css";
import { RecordSkeleton, recordHref, useHashRecord } from "@/components/record-list";

type ApiMember = {
  id: string | number;
  email: string;
  fullName?: string;
  full_name?: string;
  commissionPositionLabel?: string | null;
  commission_position_label?: string | null;
  commissionPosition?: string | null;
  commission_position?: string | null;
  commissionDepartment?: string | null;
  commission_department?: string | null;
  representedClass?: number | null;
  represented_class?: number | null;
  units?: Array<{ id: string | number; code?: string; name?: string }>;
  curricularUnits?: Array<{ id: string | number; code?: string; name?: string }>;
};

type Member = {
  id: string;
  email: string;
  name: string;
  position: string;
  department: string;
  representedClass: number | null;
  units: Array<{ id: string; code: string; name: string }>;
};

const departmentLabelKeys = {
  management: "community.directory.department.management",
  studies: "community.directory.department.studies",
  curricular_units: "community.directory.department.curricularUnits",
  recreation_image: "community.directory.department.recreationImage",
  students: "community.directory.department.students",
  faculty: "community.directory.department.faculty",
  commission: "community.directory.department.commission",
} as const;

function normalize(item: ApiMember, defaultPosition: string, defaultUnit: string): Member {
  return {
    id: String(item.id),
    email: item.email,
    name: item.fullName ?? item.full_name ?? item.email,
    position:
      item.commissionPositionLabel ??
      item.commission_position_label ??
      item.commissionPosition ??
      item.commission_position ??
      defaultPosition,
    department: item.commissionDepartment ?? item.commission_department ?? "commission",
    representedClass: item.representedClass ?? item.represented_class ?? null,
    units: (item.units ?? item.curricularUnits ?? []).map((unit) => ({
      id: String(unit.id),
      code: unit.code ?? "UC",
      name: unit.name ?? defaultUnit,
    })),
  };
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function CommissionDirectory() {
  const { locale, t } = useI18n();
  const classesEnabled = useModuleEnabled("classes");
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("all");
  const [openId, openMember] = useHashRecord("membro");

  const departmentLabel = useCallback(
    (value: string) => {
      const key = departmentLabelKeys[value as keyof typeof departmentLabelKeys];
      return key
        ? t(key)
        : value.replaceAll("_", " ").replace(/^./, (letter) => letter.toLocaleUpperCase(locale));
    },
    [locale, t],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/commission-directory", { cache: "no-store" });
      const data = (await response.json()) as {
        members?: ApiMember[];
        representatives?: ApiMember[];
        error?: string;
      };

      if (!response.ok) throw new Error(data.error || t("community.directory.loadError"));
      setMembers(
        (data.members ?? data.representatives ?? []).map((item) =>
          normalize(item, t("community.directory.defaultPosition"), t("community.common.curricularUnit")),
        ),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("community.directory.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const departments = useMemo(
    () =>
      Array.from(new Set(members.map((member) => member.department))).sort((a, b) =>
        departmentLabel(a).localeCompare(departmentLabel(b), locale),
      ),
    [departmentLabel, locale, members],
  );
  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase(locale);
    return members.filter(
      (member) =>
        (department === "all" || member.department === department) &&
        (!term ||
          [
            member.name,
            member.email,
            member.position,
            departmentLabel(member.department),
            ...member.units.flatMap((unit) => [unit.code, unit.name]),
          ].some((value) => value.toLocaleLowerCase(locale).includes(term))),
    );
  }, [department, departmentLabel, locale, members, query]);

  const openItem = openId ? members.find((member) => member.id === openId) ?? null : null;
  const filtersActive = query.trim().length > 0 || department !== "all";
  const clearFilters = () => {
    setQuery("");
    setDepartment("all");
  };

  return (
    <AuthGuard>
      <ModuleGuard moduleKey="directory.members">
        <AppShell active="directory" breadcrumb={t("community.directory.breadcrumb")}>
          <div className={styles.page}>
            <SurfaceHeader
              standalone
              headingLevel="h1"
              icon={<Users />}
              eyebrow={t("community.directory.eyebrow")}
              title={t("community.directory.breadcrumb")}
            />

            {error && <AppToast kind="error" message={error} duration={0} onDismiss={() => setError("")} />}

            {!openId ? <section className={`panel ${list.listPanel}`} aria-busy={loading}>
              <FilterBar label={t("community.directory.filter")}>
                <FilterSearch label={t("community.directory.search")} value={query} onChange={setQuery} placeholder={t("community.directory.searchPlaceholder")} />
                <FilterSegmented label={t("community.directory.filter")} value={department} onChange={setDepartment} options={[{ value: "all" as typeof department, label: t("community.directory.all") }, ...departments.map((value) => ({ value, label: departmentLabel(value) }))]} />
              </FilterBar>
              {loading ? <RecordSkeleton label={t("community.directory.loading")} /> : visible.length === 0 ? <div className={list.empty}>
                <Search />
                <strong>{t("community.directory.empty")}</strong>
                {filtersActive && <button className={styles.emptyAction} type="button" onClick={clearFilters}><X aria-hidden="true" />{t("community.directory.clear")}</button>}
              </div> : <ul className={list.rows}>
                {visible.map((member) => <li className={list.row} key={member.id}>
                  <span className={list.avatar} aria-hidden="true">{initials(member.name)}</span>
                  <div className={list.rowMain}>
                    <h3><a className={`link-quiet ${list.titleLink}`} href={recordHref("membro", member.id)} onClick={(event) => { event.preventDefault(); openMember(member.id); }}>{member.name}</a></h3>
                    <p className={list.rowMeta}>{[member.position, departmentLabel(member.department), member.units.map((unit) => unit.code).join(", ")].filter(Boolean).join(" · ")}</p>
                  </div>
                  {classesEnabled && member.representedClass !== null ? <span className={list.statusPill} data-tone="info">{t("community.directory.classRepresentative", { class: member.representedClass })}</span> : <span />}
                </li>)}
              </ul>}
            </section> : <>
              <button className={list.back} type="button" onClick={() => openMember(null)}><ChevronLeft aria-hidden="true" />{t("community.directory.back")}</button>
              <article className={`panel ${list.reading}`} aria-busy={loading}>
                {loading ? <RecordSkeleton label={t("community.directory.loading")} rows={2} /> : !openItem ? <div className={list.empty}><Search /><strong>{t("community.directory.empty")}</strong></div> : <>
                  <header className={list.byline}>
                    <span className={list.avatar} aria-hidden="true">{initials(openItem.name)}</span>
                    <div>
                      <p className={list.bylineName}>{openItem.position}</p>
                      <p className={list.bylineMeta}>{departmentLabel(openItem.department)}</p>
                    </div>
                    {classesEnabled && openItem.representedClass !== null && <span className={list.statusPill} data-tone="info">{t("community.directory.classRepresentative", { class: openItem.representedClass })}</span>}
                  </header>
                  <h2 className={list.readingTitle}>{openItem.name}</h2>
                  <span className={list.readingRule} aria-hidden="true" />
                  <section className={list.readingSection}>
                    <h3>{t("community.directory.followedUnits")}</h3>
                    {openItem.units.length ? <ul className={styles.unitList}>{openItem.units.map((unit) => <li key={unit.id}><b>{unit.code}</b><span>{unit.name}</span></li>)}</ul> : <p className={styles.noUnit}>{t("community.directory.noUnit")}</p>}
                  </section>
                  <footer className={list.manageArea}>
                    <a className={`button button--secondary button--compact ${styles.mailLink}`} href={`mailto:${openItem.email}`}><Mail aria-hidden="true" /><span>{openItem.email}</span></a>
                  </footer>
                </>}
              </article>
            </>}
          </div>
        </AppShell>
      </ModuleGuard>
    </AuthGuard>
  );
}
