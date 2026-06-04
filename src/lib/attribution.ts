// Wikimedia/LoC attribution strings can be paragraph-length (e.g. a portrait
// credit: "attributed to Owen Staples (1866–1949), based on the engraving
// published by Benson John Lossing[1]"). Rendered in a caption — especially a
// narrow column — they wrap into a tall stack that breaks the card layout.
// Truncate the visible credit to a sane length; the FULL credit stays reachable
// via the caption's "Source" link to the original file page.
export function truncateCredit(s: string, max = 60): string {
  const t = s.trim();
  return t.length > max ? t.slice(0, max).trimEnd() + "\u2026" : t;
}
