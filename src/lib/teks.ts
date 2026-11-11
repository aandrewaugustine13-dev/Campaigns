import historyData from "../../data/teks-history.json";
import worldGeoData from "../../data/teks-world-geography.json";
import grade5Data from "../../data/teks-grade5-us-history.json";
import grade6Data from "../../data/teks-grade6-world-cultures.json";
import grade7Data from "../../data/teks-grade7-texas-history.json";
import grade8Data from "../../data/teks-grade8-us-history.json";
import hsUsHistoryData from "../../data/teks-hs-us-history.json";
import hsWorldHistoryData from "../../data/teks-hs-world-history.json";
import hsGovernmentData from "../../data/teks-hs-us-government.json";
import hsEconomicsData from "../../data/teks-hs-economics.json";

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
 * - History bank kept where the wording already matches the 2022 standards
 * - Grade 5 (§113.16), fuller grades 6–8 (§113.18–§113.20)
 * - High school U.S. History (§113.41), World History (§113.42),
 *   U.S. Government (§113.44), and Economics (§113.31)
 * - World Geography Studies (§113.43) for grade 9
 */
export const teksStandards: TEKSStandard[] = [
  ...(historyData as TEKSStandard[]),
  ...(worldGeoData as TEKSStandard[]),
  ...(grade5Data as TEKSStandard[]),
  ...(grade6Data as TEKSStandard[]),
  ...(grade7Data as TEKSStandard[]),
  ...(grade8Data as TEKSStandard[]),
  ...(hsUsHistoryData as TEKSStandard[]),
  ...(hsWorldHistoryData as TEKSStandard[]),
  ...(hsGovernmentData as TEKSStandard[]),
  ...(hsEconomicsData as TEKSStandard[]),
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
