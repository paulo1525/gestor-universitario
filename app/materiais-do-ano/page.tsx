import type { Metadata } from "next";
import { PublicMaterials } from "@/components/public-materials";

export const metadata: Metadata = {
  title: "Materiais do ano | Comissão de Curso FMUP",
  description: "Sumários, resumos, bibliografia e Anki do ano, partilhados pela Comissão de Curso FMUP 2025–2031.",
};

export default function PublicMaterialsPage() {
  return <PublicMaterials />;
}
