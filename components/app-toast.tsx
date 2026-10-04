"use client";

import { AlertTriangle, CheckCircle2, Info, ShieldAlert, X } from "lucide-react";
import { CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-context";

export type ToastKind = "success" | "error" | "warning" | "info";

type Props = {
  message: string;
  kind?: ToastKind;
  title?: string;
  duration?: number;
  onDismiss?: () => void;
};

const icons = {
  success: CheckCircle2,
  error: ShieldAlert,
  warning: AlertTriangle,
  info: Info,
};

export function AppToast(props: Props) {
  return <ToastMessage key={`${props.kind}:${props.title}:${props.message}:${props.duration}`} {...props} />;
}

function ToastMessage({ message, kind = "success", title, duration = 3000, onDismiss }: Props) {
  const { t } = useI18n();
  const [leaving, setLeaving] = useState(false);
  const exitTimer = useRef<number | null>(null);
  const onDismissRef = useRef(onDismiss);
  const canDismiss = Boolean(onDismiss);
  useEffect(() => { onDismissRef.current = onDismiss; }, [onDismiss]);
  const Icon = icons[kind];
  const dismiss = useCallback(() => {
    if (!onDismissRef.current || leaving) return;
    setLeaving(true);
    exitTimer.current = window.setTimeout(() => onDismissRef.current?.(), 180);
  }, [leaving]);

  useEffect(() => {
    if (!canDismiss || duration <= 0 || leaving) return;
    const timer = window.setTimeout(dismiss, duration);
    return () => window.clearTimeout(timer);
  }, [dismiss, duration, leaving, canDismiss]);

  useEffect(() => () => {
    if (exitTimer.current) window.clearTimeout(exitTimer.current);
  }, []);

  return <aside
    className={`app-toast app-toast--${kind}${leaving ? " is-leaving" : ""}`}
    role={kind === "error" ? "alert" : "status"}
    aria-live={kind === "error" ? "assertive" : "polite"}
    aria-atomic="true"
    style={{ "--toast-duration": `${duration}ms` } as CSSProperties}
  >
    <span className="app-toast__icon" aria-hidden="true"><Icon /></span>
    <span className="app-toast__copy"><strong>{title || t(`toast.${kind}`)}</strong><span>{message}</span></span>
    {onDismiss && <button type="button" className="app-toast__close" aria-label={t("toast.close")} onClick={dismiss}><X /></button>}
    {duration > 0 && onDismiss && <span className="app-toast__progress" aria-hidden="true" />}
  </aside>;
}
