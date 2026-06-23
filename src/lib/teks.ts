import teksData from '../../data/teks-history.json';

export interface TEKSStandard {
  code: string;
  gradeLevel: string;
  description: string;
  keywords: string[];
  category?: string;
}

export const teksStandards: TEKSStandard[] = teksData as TEKSStandard[];

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
    // Search in code
    if (standard.code.toLowerCase().includes(lowerQuery)) return true;

    // Search in description
    if (standard.description.toLowerCase().includes(lowerQuery)) return true;

    // Search in category
    if (standard.category && standard.category.toLowerCase().includes(lowerQuery)) return true;

    // Search in keywords
    if (standard.keywords.some((keyword) => keyword.toLowerCase().includes(lowerQuery))) {
      return true;
    }

    return false;
  });
}

/**
 * Get all TEKS standards for a specific grade level (e.g. "8" or "High School").
 */
export function getTEKSByGradeLevel(gradeLevel: string): TEKSStandard[] {
  const normalized = gradeLevel.toLowerCase().trim();
  return teksStandards.filter(
    (standard) => standard.gradeLevel.toLowerCase() === normalized || 
                  standard.gradeLevel.toLowerCase().includes(normalized)
  );
}