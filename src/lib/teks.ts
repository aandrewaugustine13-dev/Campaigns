import historyData from "../../data/teks-history.json";
import worldGeoData from "../../data/teks-world-geography.json";

export interface TEKSStandard {
  code: string;
  gradeLevel: string;
  description: string;
  keywords: string[];
  category?: string;
}

/** Drop documentation / meta rows that are not real student expectations. */
function isRealStandard(s: TEKSStandard): boolean {
  if (!s?.code || s.code.startsWith("_")) return false;
  if (s.category === "_meta") return false;
  return true;
}

/**
 * All searchable TEKS available in the app:
 * - History / social studies bank (grades 6–8 + high school samples)
 * - World Geography Studies (§113.43) for grade 9
 */
export const teksStandards: TEKSStandard[] = [
  ...(historyData as TEKSStandard[]),
  ...(worldGeoData as TEKSStandard[]),
].filter(isRealStandard);

/**
 * Search TEKS standards by keyword (case-insensitive, partial match).
 * Returns all standards whose keywords, code, description, or category contain the search term.
 */
export function searchTEKS(query: string): TEKSStandard[] {
  if (!query || query.trim().length === 0) {
    return [];
  }

  const lowerQuery = query.toLowerCase().trim();

  return teksStandards.filter((standard) => {
    if (standard.code.toLowerCase().includes(lowerQuery)) return true;
    if (standard.description.toLowerCase().includes(lowerQuery)) return true;
    if (standard.category && standard.category.toLowerCase().includes(lowerQuery)) return true;
    if (standard.keywords.some((keyword) => keyword.toLowerCase().includes(lowerQuery))) {
      return true;
    }
    // Friendly aliases for the World Geography bank (don't over-match plain "geography")
    if (
      (lowerQuery.includes("world geo") ||
        lowerQuery === "wg" ||
        lowerQuery === "world geography" ||
        lowerQuery.includes("113.43")) &&
      standard.code.startsWith("WG.")
    ) {
      return true;
    }
    return false;
  });
}

/**
 * Get all TEKS standards for a specific grade level (e.g. "8", "9", or "High School").
 * "9" and aliases like "9th" match World Geography grade 9 standards.
 */
export function getTEKSByGradeLevel(gradeLevel: string): TEKSStandard[] {
  const normalized = gradeLevel.toLowerCase().trim();
  // Normalize "9th" / "grade 9" → match gradeLevel "9"
  const asDigit = normalized.replace(/^grade\s*/, "").replace(/th$/, "").trim();

  return teksStandards.filter((standard) => {
    const g = standard.gradeLevel.toLowerCase();
    if (g === normalized || g.includes(normalized)) return true;
    if (asDigit && (g === asDigit || g.includes(asDigit))) return true;
    return false;
  });
}

/** Convenience: all World Geography (WG.*) standards. */
export function getWorldGeographyTEKS(): TEKSStandard[] {
  return teksStandards.filter((s) => s.code.startsWith("WG."));
}
