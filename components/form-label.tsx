import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type FormLabelProps = {
  children: ReactNode;
  icon: LucideIcon;
  optional?: boolean;
};

export function FormLabel({ children, icon: Icon, optional = false }: FormLabelProps) {
  return <span className="form-label">
    <Icon aria-hidden="true" focusable="false" />
    <span>{children}</span>
    {optional && <small>Opcional</small>}
  </span>;
}
