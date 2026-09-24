import { LoaderCircle, X } from "lucide-react";
import { type ReactNode } from "react";

/* One anatomy for every form on the platform:
   - the close control is an icon-only ✕ in the form header;
   - the footer holds Cancelar (quiet) and a single primary action on the right,
     with optional context (counter, destructive action) on the left. */

export function FormCloseButton({ onClick, label, disabled }: { onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button className="form-close" type="button" onClick={onClick} aria-label={label} title={label} disabled={disabled}>
      <X aria-hidden="true" />
    </button>
  );
}

export function FormActions({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <footer className="form-actions">
      {aside && <div className="form-actions__aside">{aside}</div>}
      <div className="form-actions__buttons">{children}</div>
    </footer>
  );
}

export function CancelButton({ onClick, children, disabled }: { onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return <button className="button button--ghost" type="button" onClick={onClick} disabled={disabled}>{children}</button>;
}

export function SubmitButton({ busy, children, disabled, form, onClick }: { busy?: boolean; children: ReactNode; disabled?: boolean; form?: string; onClick?: () => void }) {
  return (
    <button className="button button--primary" type={onClick ? "button" : "submit"} form={form} onClick={onClick} disabled={disabled || busy} aria-busy={busy || undefined}>
      {busy && <LoaderCircle className="form-actions__spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}
