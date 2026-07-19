"use client";

import {
  Apple,
  CalendarPlus,
  Check,
  ChevronDown,
  Clipboard,
  ExternalLink,
  Link2,
  LoaderCircle,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-context";
import styles from "@/components/calendar-subscription.module.css";

type Unit = { id: string; name: string; code: string };
type Subscription = {
  id: string;
  label: string;
  unitIds: string[];
  createdAt: number;
  lastUsedAt: number | null;
  active: boolean;
};
type CreatedSubscription = Subscription & { feedUrl: string };

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function CalendarSubscription({ units }: { units: Unit[] }) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Subscription[]>([]);
  const [created, setCreated] = useState<CreatedSubscription | null>(null);
  const [label, setLabel] = useState("");
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/calendar-subscription", { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) throw new Error(String(payload.error || t("calendar.subscription.loadError")));
      const raw = Array.isArray(payload.subscriptions) ? payload.subscriptions : [];
      setItems(raw.map(value => {
        const item = record(value);
        return {
          id: String(item.id || ""),
          label: String(item.label || ""),
          unitIds: Array.isArray(item.unitIds) ? item.unitIds.map(String) : [],
          createdAt: Number(item.createdAt || 0),
          lastUsedAt: item.lastUsedAt == null ? null : Number(item.lastUsedAt),
          active: item.active !== false && item.revokedAt == null,
        };
      }).filter(item => item.id && item.active));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("calendar.subscription.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (open) void Promise.resolve().then(load);
  }, [load, open]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/calendar-subscription", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: label.trim() || t("calendar.subscription.labelPlaceholder"), unitIds }),
      });
      const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) throw new Error(String(payload.error || t("calendar.subscription.createError")));
      const next: CreatedSubscription = {
        id: String(payload.id),
        label: String(payload.label),
        unitIds: Array.isArray(payload.unitIds) ? payload.unitIds.map(String) : [],
        createdAt: Number(payload.createdAt),
        lastUsedAt: null,
        active: true,
        feedUrl: String(payload.feedUrl),
      };
      setCreated(next);
      setItems(current => [next, ...current]);
      setLabel("");
      setUnitIds([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("calendar.subscription.createError"));
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (item: Subscription) => {
    if (!window.confirm(t("calendar.subscription.revokeConfirm"))) return;
    setBusy(item.id);
    setError("");
    try {
      const response = await fetch("/api/calendar-subscription", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
      const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) throw new Error(String(payload.error || t("calendar.subscription.revokeError")));
      setItems(current => current.filter(candidate => candidate.id !== item.id));
      if (created?.id === item.id) setCreated(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("calendar.subscription.revokeError"));
    } finally {
      setBusy("");
    }
  };

  const copy = async () => {
    if (!created) return;
    await navigator.clipboard.writeText(created.feedUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  };

  const webcal = created?.feedUrl.replace(/^https:/, "webcal:") || "";
  const google = created
    ? `https://calendar.google.com/calendar/u/0/r/settings/addbyurl?cid=${encodeURIComponent(created.feedUrl)}`
    : "";
  const outlook = created
    ? `https://outlook.live.com/calendar/0/addcalendar?url=${encodeURIComponent(created.feedUrl)}&name=${encodeURIComponent(created.label)}`
    : "";

  return <section className={styles.shell}>
    <div className={styles.summary}>
      <span className={styles.summaryIcon} aria-hidden="true"><CalendarPlus /></span>
      <div className={styles.summaryCopy}>
        <h2>{t("calendar.subscription.title")}</h2>
        <p>{t("calendar.subscription.description")}</p>
        <span><RefreshCw />{t("calendar.subscription.autoSync")}</span>
      </div>
      <button className={styles.toggle} type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls="calendar-subscription-panel">
        {open ? <X aria-hidden="true" /> : <Settings2 aria-hidden="true" />}
        {t(open ? "calendar.subscription.close" : "calendar.subscription.open")}
      </button>
    </div>

    {open && <div className={styles.body} id="calendar-subscription-panel">
      <div className={styles.setup}>
        <div className={styles.explainer} aria-label={t("calendar.subscription.howTitle")}>
          <div className={styles.explainerHeading}>
            <strong>{t("calendar.subscription.howTitle")}</strong>
            <span>{t("calendar.subscription.howDescription")}</span>
          </div>
          <ol>
            <li><span>1</span><div><strong>{t("calendar.subscription.stepLink")}</strong><small>{t("calendar.subscription.stepLinkHelp")}</small></div></li>
            <li><span>2</span><div><strong>{t("calendar.subscription.stepApp")}</strong><small>{t("calendar.subscription.stepAppHelp")}</small></div></li>
            <li><span>3</span><div><strong>{t("calendar.subscription.stepSync")}</strong><small>{t("calendar.subscription.stepSyncHelp")}</small></div></li>
          </ol>
        </div>

        {!created ? <form className={styles.form} onSubmit={create}>
        <div className={styles.formHeading}>
          <div><strong>{t("calendar.subscription.createTitle")}</strong><span>{t("calendar.subscription.createHelp")}</span></div>
          <ShieldCheck />
        </div>

        <details className={styles.customise}>
          <summary><Settings2 />{t("calendar.subscription.customise")}<ChevronDown /></summary>
          <div className={styles.customiseBody}>
            <label>
              <strong>{t("calendar.subscription.label")}</strong>
              <input maxLength={80} value={label} onChange={event => setLabel(event.target.value)} placeholder={t("calendar.subscription.labelPlaceholder")} />
            </label>
            {units.length > 0 && <fieldset>
              <legend>{t("calendar.subscription.units")}</legend>
              <small>{t("calendar.subscription.unitsHelp")}</small>
              <div className={styles.unitGrid}>{units.map(unit => <label key={unit.id}>
                <input
                  type="checkbox"
                  checked={unitIds.includes(unit.id)}
                  onChange={event => setUnitIds(current => event.target.checked
                    ? [...current, unit.id]
                    : current.filter(id => id !== unit.id))}
                />
                <span>{unit.code ? <b>{unit.code}</b> : null}{unit.name}</span>
              </label>)}</div>
            </fieldset>}
          </div>
        </details>

        <div className={styles.actionRow}>
          <button className={styles.primary} disabled={saving}>
            {saving ? <LoaderCircle className={styles.spin} /> : <Link2 />}
            {t(saving ? "calendar.subscription.generating" : "calendar.subscription.generate")}
          </button>
          <p className={styles.revokeHint}><ShieldCheck />{t("calendar.subscription.revokeHint")}</p>
        </div>
      </form> : <div className={styles.created}>
        <header><span><Check /></span><div><strong>{t("calendar.subscription.createdTitle")}</strong><p>{t("calendar.subscription.created")}</p></div></header>
        <div className={styles.external}>
          <a className={styles.recommended} href={google} target="_blank" rel="noreferrer"><ExternalLink />{t("calendar.subscription.google")}</a>
          <a href={webcal}><Apple />{t("calendar.subscription.apple")}</a>
          <a href={outlook} target="_blank" rel="noreferrer"><ExternalLink />{t("calendar.subscription.outlook")}</a>
        </div>
        <details className={styles.manual}>
          <summary>{t("calendar.subscription.otherApp")}<ChevronDown /></summary>
          <div className={styles.url}>
            <input readOnly value={created.feedUrl} aria-label={t("calendar.subscription.copy")} />
            <button type="button" onClick={() => void copy()}>{copied ? <Check /> : <Clipboard />}{t(copied ? "calendar.subscription.copied" : "calendar.subscription.copy")}</button>
          </div>
        </details>
        <p className={styles.syncNote}><RefreshCw />{t("calendar.subscription.syncNote")}</p>
      </div>}
      </div>

      <details className={styles.management}>
        <summary>
          <span><Settings2 /><strong>{t("calendar.subscription.active")}</strong>{items.length > 0 && <b>{items.length}</b>}</span>
          <ChevronDown />
        </summary>
        <div className={styles.list}>
          {loading ? <div className={styles.state}><LoaderCircle className={styles.spin} /></div> : items.length ? items.map(item => <article key={item.id}>
            <div>
              <strong>{item.label}</strong>
              <small>{item.lastUsedAt
                ? t("calendar.subscription.lastUsed", { date: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(item.lastUsedAt) })
                : t("calendar.subscription.neverUsed")}</small>
            </div>
            <button type="button" disabled={busy === item.id} onClick={() => void revoke(item)}>
              <Trash2 />{t(busy === item.id ? "calendar.subscription.revoking" : "calendar.subscription.revoke")}
            </button>
          </article>) : <p className={styles.empty}>{t("calendar.subscription.none")}</p>}
        </div>
      </details>

      {error && <div className={styles.error}><RefreshCw />{error}</div>}
    </div>}
  </section>;
}
