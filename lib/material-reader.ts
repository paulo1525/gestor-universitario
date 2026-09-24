/** Address of the annotator page for one catalogue material. */
export function materialReaderHref(id: string) {
  return `/materiais/ler/?id=${encodeURIComponent(id)}`;
}
