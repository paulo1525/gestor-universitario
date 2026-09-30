/** Resource folders shared by both material browsers and the API. */
export const MATERIAL_RESOURCE_CATEGORIES = ["information", "theory", "tutorials", "practical", "support", "seminars", "assessment"] as const;
export type MaterialResourceCategory = typeof MATERIAL_RESOURCE_CATEGORIES[number];

export function materialResourceCategory(value: unknown): MaterialResourceCategory | null {
  return typeof value === "string" && (MATERIAL_RESOURCE_CATEGORIES as readonly string[]).includes(value)
    ? value as MaterialResourceCategory : null;
}
