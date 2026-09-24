"use client";

import {
  Apple,
  CalendarPlus,
  Check,
  Clipboard,
  ExternalLink,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useEscapeKey } from "@/components/use-escape-key";
import { useScrollLock } from "@/components/use-scroll-lock";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { FormCloseButton } from "@/components/form-actions";
import { useI18n } from "@/components/i18n-context";
import styles from "@/components/calendar-subscription.module.css";
import { RecordSkeleton } from "@/components/record-list";

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
  const [revokeTarget, setRevokeTarget] = useState<Subscription | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  useScrollLock(open);
  useEscapeKey(open, () => setOpen(false));

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
      setRevokeTarget(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("calendar.subscription.revokeError"));
    } finally {
      setBusy("");
      setRevokeTarget(null);
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

  return <>
    <button
      className={styles.trigger}
      type="button"
      onClick={() => setOpen(true)}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls="calendar-subscription-panel"
    >
      <CalendarPlus aria-hidden="true" />
      {t("calendar.subscription.open")}
    </button>

    {open && <div className="app-modal-backdrop" data-app-modal-backdrop role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) setOpen(false); }}>
      <section id="calendar-subscription-panel" data-app-modal="modal" data-app-modal-size="compact" role="dialog" aria-modal="true" aria-labelledby="calendar-subscription-title">
        <header className="app-modal-header" data-app-modal-header>
          <h2 id="calendar-subscription-title">{t("calendar.subscription.title")}</h2>
          <FormCloseButton onClick={() => setOpen(false)} label={t("calendar.subscription.close")} />
        </header>

        <div className={styles.dialogBody} data-app-modal-body>
          <section className={styles.setup}>
            {!created ? <form id="calendar-subscription-form" className={styles.form} onSubmit={create}>
              <label className={styles.field}>
                <span>{t("calendar.subscription.label")}</span>
                <input maxLength={80} value={label} onChange={event => setLabel(event.target.value)} placeholder={t("calendar.subscription.labelPlaceholder")} />
              </label>
              {units.length > 0 && <fieldset className={styles.field}>
                <legend>{t("calendar.subscription.units")}</legend>
                <div className={styles.unitList}>{units.map(unit => <label key={unit.id}>
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
            </form> : <div className={styles.created}>
              <p className={styles.success}><Check />{t("calendar.subscription.createdTitle")}</p>
              <div className={styles.external}>
                <a href={google} target="_blank" rel="noreferrer"><span>{t("calendar.subscription.google")}</span><ExternalLink /></a>
                <a href={webcal}><span>{t("calendar.subscription.apple")}</span><Apple /></a>
                <a href={outlook} target="_blank" rel="noreferrer"><span>{t("calendar.subscription.outlook")}</span><ExternalLink /></a>
              </div>
              <div className={styles.field}>
                <span>{t("calendar.subscription.otherApp")}</span>
                <div className={styles.url}>
                  <input readOnly value={created.feedUrl} aria-label={t("calendar.subscription.copy")} onFocus={event => event.currentTarget.select()} />
                  <button type="button" onClick={() => void copy()}>{copied ? <Check /> : <Clipboard />}{t(copied ? "calendar.subscription.copied" : "calendar.subscription.copy")}</button>
                </div>
              </div>
            </div>}
          </section>

          <section className={styles.management} aria-labelledby="calendar-subscription-active">
            <h3 id="calendar-subscription-active">{t("calendar.subscription.active")}{items.length > 0 && <b>{items.length}</b>}</h3>
            <div className={styles.list}>
              {loading ? <RecordSkeleton label={t("calendar.subscription.active")} rows={2} /> : items.length ? items.map(item => <article key={item.id}>
                <div>
                  <strong>{item.label}</strong>
                  <small>{item.lastUsedAt
                    ? t("calendar.subscription.lastUsed", { date: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(item.lastUsedAt) })
                    : t("calendar.subscription.neverUsed")}</small>
                </div>
                <button type="button" disabled={busy === item.id} onClick={() => setRevokeTarget(item)}>
                  <Trash2 />{t(busy === item.id ? "calendar.subscription.revoking" : "calendar.subscription.revoke")}
                </button>
              </article>) : <p className={styles.empty}>{t("calendar.subscription.none")}</p>}
            </div>
          </section>

          {error && <div className={styles.error}><RefreshCw />{error}</div>}
        </div>

        <footer data-app-modal-footer>
          <button type="button" className="button button--secondary" data-app-modal-action="secondary" onClick={() => setOpen(false)} disabled={saving}>{created ? t("calendar.subscription.close") : t("common.cancel")}</button>
          {!created && <button type="submit" form="calendar-subscription-form" className="button button--primary" data-app-modal-action="primary" disabled={saving}>{t(saving ? "calendar.subscription.generating" : "calendar.subscription.generate")}</button>}
        </footer>
      </section>
    </div>}

    <ConfirmationDialog
      open={Boolean(revokeTarget)}
      eyebrow={locale === "en" ? "Private calendar link" : "Ligação privada"}
      title={locale === "en" ? "Revoke this calendar link?" : "Revogar esta ligação ao calendário?"}
      description={t("calendar.subscription.revokeConfirm")}
      subject={revokeTarget?.label}
      subjectLabel={locale === "en" ? "Calendar" : "Calendário"}
      warning={locale === "en" ? "Applications using this link will stop receiving updates." : "As aplicações que usam esta ligação deixam de receber atualizações."}
      confirmLabel={t(busy ? "calendar.subscription.revoking" : "calendar.subscription.revoke")}
      cancelLabel={locale === "en" ? "Cancel" : "Cancelar"}
      busy={Boolean(busy)}
      onClose={() => setRevokeTarget(null)}
      onConfirm={() => { if (revokeTarget) void revoke(revokeTarget); }}
    />
  </>;
}
