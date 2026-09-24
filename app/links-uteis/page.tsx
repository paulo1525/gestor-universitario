import type { Metadata } from "next";
import { UsefulLinksTree } from "@/components/useful-links-tree";

export const metadata: Metadata = {
  title: "Links úteis | Comissão de Curso FMUP",
  description: "Links úteis da Comissão de Curso FMUP 2025–2031.",
};

export default function UsefulLinksPage() {
  return <UsefulLinksTree />;
}
