import { Baby, Bone, BookOpen, Brain, ChartColumn, Dna, FlaskConical, HeartPulse, Microscope, Pill, ScanSearch, ShieldCheck, ShieldPlus, Stethoscope, type LucideIcon } from "lucide-react";
import list from "@/components/record-list.module.css";

// First match wins: more specific subjects (Anatomia Radiológica) come before broader ones (Anatomia).
const SUBJECT_ICONS: Array<[RegExp, LucideIcon]> = [
  [/neuro/, Brain],
  [/radiolog|imagiolog/, ScanSearch],
  [/embriolog/, Baby],
  [/histolog/, Microscope],
  [/anatom/, Bone],
  [/fisiolog/, HeartPulse],
  [/imunolog/, ShieldCheck],
  [/preventiva|saude publica|epidemiolog/, ShieldPlus],
  [/decides|estatistic|dados/, ChartColumn],
  [/propedeutica|semiolog|clinica/, Stethoscope],
  [/bioquimic|quimic/, FlaskConical],
  [/genetic|biologia (celular|molecular)/, Dna],
  [/farmacolog/, Pill],
];

function normalize(value?: string | null) {
  return (value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-PT");
}

/** Icon for a curricular unit, chosen from its name (or code) so every unit gets one. */
export function unitIcon(code?: string | null, name?: string | null): LucideIcon {
  const text = `${normalize(name)} ${normalize(code)}`;
  return SUBJECT_ICONS.find(([pattern]) => pattern.test(text))?.[1] ?? BookOpen;
}

/** Leading visual of a curricular unit in lists and headers: an icon for the subject. */
export function UnitThumb({ code, name, size = "row" }: { id?: string | null; code?: string | null; name?: string | null; size?: "row" | "large" }) {
  const Icon = unitIcon(code, name);
  return <span className={list.thumb} data-size={size} aria-hidden="true"><Icon /></span>;
}
