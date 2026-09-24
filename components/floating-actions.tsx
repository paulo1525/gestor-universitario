"use client";

import { Cookie, Plus } from "lucide-react";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-context";
import { useEscapeKey } from "@/components/use-escape-key";

/* One floating button per screen. Tapping it reveals the page's own action
   (registered with useFloatingAction) and the cookie preferences. */

export type FloatingAction = { id: string; label: string; icon: ReactNode; onClick: () => void };

type Registry = { register: (action: FloatingAction) => () => void };

const FloatingActionsContext = createContext<Registry | null>(null);

export const OPEN_COOKIE_PREFERENCES = "gu:open-cookie-preferences";

export function useFloatingAction(action: FloatingAction | null) {
  const registry = useContext(FloatingActionsContext);
  const latest = useRef(action);
  useEffect(() => { latest.current = action; });
  const id = action?.id;
  const label = action?.label;
  const icon = action?.icon;
  useEffect(() => {
    if (!registry || !id || label === undefined) return;
    return registry.register({ id, label, icon, onClick: () => latest.current?.onClick() });
  }, [registry, id, label, icon]);
}

export function FloatingActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<FloatingAction[]>([]);
  const register = useCallback((action: FloatingAction) => {
    setActions(current => [...current.filter(item => item.id !== action.id), action]);
    return () => setActions(current => current.filter(item => item.id !== action.id));
  }, []);
  const registry = useMemo(() => ({ register }), [register]);
  return (
    <FloatingActionsContext.Provider value={registry}>
      {children}
      <FloatingActionsDial actions={actions} />
    </FloatingActionsContext.Provider>
  );
}

function FloatingActionsDial({ actions }: { actions: FloatingAction[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEscapeKey(open, () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const openCookies = () => window.dispatchEvent(new Event(OPEN_COOKIE_PREFERENCES));

  // Nothing to add on this page: the button is just the cookie preferences.
  if (actions.length === 0) {
    return (
      <div className="fab-dial">
        <button className="fab-dial__toggle fab-dial__toggle--quiet" type="button" onClick={openCookies} aria-label={t("cookies.open")} title={t("cookies.open")}><Cookie aria-hidden="true" /></button>
      </div>
    );
  }

  const items: FloatingAction[] = [
    ...actions,
    { id: "cookies", label: t("cookies.title"), icon: <Cookie />, onClick: openCookies },
  ];

  return (
    <div ref={root} className={`fab-dial${open ? " is-open" : ""}`}>
      {open && <ul className="fab-dial__items" id="fab-dial-items">
        {items.map(item => (
          <li key={item.id}>
            <button type="button" onClick={() => { setOpen(false); item.onClick(); }}>
              <span className="fab-dial__label">{item.label}</span>
              <span className="fab-dial__icon" aria-hidden="true">{item.icon}</span>
            </button>
          </li>
        ))}
      </ul>}
      <button className="fab-dial__toggle" type="button" onClick={() => setOpen(current => !current)} aria-expanded={open} aria-controls="fab-dial-items" aria-label={open ? t("common.close") : t("fab.open")} title={open ? t("common.close") : t("fab.open")}>
        <Plus aria-hidden="true" />
      </button>
    </div>
  );
}
