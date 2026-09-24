/* eslint-disable @next/next/no-img-element */
import { BookOpen } from "lucide-react";
import { resolveMaterialCompendiumUnit } from "@/lib/material-compendium-units";
import list from "@/components/record-list.module.css";

/**
 * Leading visual of a curricular unit in lists and headers: the prepared course
 * cover as a light WebP thumbnail, or the book icon when the unit has none.
 */
export function UnitThumb({ id, code, name, size = "row" }: { id?: string | null; code?: string | null; name?: string | null; size?: "row" | "large" }) {
  const unit = resolveMaterialCompendiumUnit(id) || resolveMaterialCompendiumUnit(code) || resolveMaterialCompendiumUnit(name);
  if (!unit) return <span className={list.thumb} data-size={size} data-empty aria-hidden="true"><BookOpen /></span>;
  return <span className={list.thumb} data-size={size} aria-hidden="true"><img src={unit.thumbUrl} alt="" width={240} height={339} loading="lazy" decoding="async" /></span>;
}
