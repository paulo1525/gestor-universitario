export type MaterialCompendiumUnit = {
  id: string;
  code: string;
  title: string;
  shortTitle: string;
  coverUrl: string;
  fileStem: string;
};

/** Covers prepared for the eleven second-year curricular units. */
export const MATERIAL_COMPENDIUM_UNITS: readonly MaterialCompendiumUnit[] = [
  { id: "curricular-mi247", code: "DECIDES I", title: "DECIDES I: Decisão, Dados e Estatística em Saúde", shortTitle: "DECIDES I", coverUrl: "/decides-i-compendio-cover-v2.png", fileStem: "DECIDES_I" },
  { id: "curricular-mi248", code: "MP", title: "Medicina Preventiva", shortTitle: "Medicina Preventiva", coverUrl: "/medicina-preventiva-compendio-cover-v2.png", fileStem: "Medicina_Preventiva" },
  { id: "curricular-mi249", code: "AR", title: "Anatomia Radiológica", shortTitle: "Anatomia Radiológica", coverUrl: "/anatomia-radiologica-compendio-cover-v2.png", fileStem: "Anatomia_Radiologica" },
  { id: "curricular-mi244", code: "FIS1", title: "Fisiologia I", shortTitle: "Fisiologia I", coverUrl: "/fisiologia-i-compendio-cover-v2.png", fileStem: "Fisiologia_I" },
  { id: "curricular-mi245", code: "HIST1", title: "Histologia I", shortTitle: "Histologia I", coverUrl: "/histologia-i-compendio-cover-v2.png", fileStem: "Histologia_I" },
  { id: "curricular-mi246", code: "NEURO", title: "Neuroanatomia", shortTitle: "Neuroanatomia", coverUrl: "/neuroanatomia-compendio-cover-v2.png", fileStem: "Neuroanatomia" },
  { id: "curricular-mi250", code: "FIS2", title: "Fisiologia II", shortTitle: "Fisiologia II", coverUrl: "/fisiologia-ii-compendio-cover-v2.png", fileStem: "Fisiologia_II" },
  { id: "curricular-mi253", code: "DECIDES II", title: "DECIDES II: Decisão, Dados e Evidência em Saúde", shortTitle: "DECIDES II", coverUrl: "/decides-ii-compendio-cover-v2.png", fileStem: "DECIDES_II" },
  { id: "curricular-mi251", code: "HIST2", title: "Histologia II. Embriologia", shortTitle: "Histologia II. Embriologia", coverUrl: "/histologia-ii-embriologia-compendio-cover-v2.png", fileStem: "Histologia_II_Embriologia" },
  { id: "curricular-mi252", code: "IMUNO BAS", title: "Imunologia Básica", shortTitle: "Imunologia Básica", coverUrl: "/imunologia-basica-compendio-cover-v2.png", fileStem: "Imunologia_Basica" },
  { id: "curricular-mi254", code: "PG", title: "Propedêutica Geral", shortTitle: "Propedêutica Geral", coverUrl: "/propedeutica-geral-compendio-cover-v2.png", fileStem: "Propedeutica_Geral" },
] as const;

function normalizeUnitValue(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("pt-PT")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/** Resolves a unit from an API code, stable id, name or generated title. */
export function resolveMaterialCompendiumUnit(value: string | null | undefined): MaterialCompendiumUnit | undefined {
  const normalized = normalizeUnitValue(value);
  if (!normalized) return undefined;
  return MATERIAL_COMPENDIUM_UNITS.find((unit) => {
    const candidates = [unit.id, unit.code, unit.title, unit.shortTitle].map(normalizeUnitValue);
    return candidates.some((candidate) => normalized === candidate || normalized.startsWith(`${candidate} `));
  });
}
