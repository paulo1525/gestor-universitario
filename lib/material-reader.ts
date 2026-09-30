/** Address of the annotator page for one catalogue material. */
export function materialReaderHref(id: string, item?: { otherFormat?: string | null; viewUrl?: string | null }) {
  if (item?.otherFormat === "compendium" && item.viewUrl) return item.viewUrl;
  return `/materiais/ler/?id=${encodeURIComponent(id)}`;
}
