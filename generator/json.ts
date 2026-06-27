// Strip any Markdown code fences a model may leak despite a JSON responseMimeType
// (e.g. ```json ... ```). Removes every fence marker anywhere in the string, not
// just a surrounding pair, so a stray opening/closing fence can't survive into
// JSON.parse.
export const sanitizeJsonString = (raw: string): string => {
  return raw.replace(/```json\n?|```/g, "").trim();
};

// Robustly extract the single JSON object/array from a model response.
// Despite "output ONLY JSON" instructions, models occasionally wrap output in
// ``` fences or prepend prose ("I need to..."), which makes a naive
// JSON.parse throw "Unexpected token". This slices to the outermost JSON
// braces and parses that, and raises a readable error when there is no JSON
// at all (e.g. a refusal) instead of a cryptic parser message.
export function parseModelJson<T = unknown>(rawText: string): T {
  // First pass: strip any leaked code fences (defensive against responseMimeType
  // not being honored). This handles fences anywhere, including stray markers.
  let s = sanitizeJsonString(rawText);

  // If prose surrounds the JSON, slice from the first opening bracket to the
  // matching last closing bracket of the same kind.
  if (!s.startsWith("{") && !s.startsWith("[")) {
    const firstObj = s.indexOf("{");
    const firstArr = s.indexOf("[");
    const start =
      firstArr === -1 ? firstObj : firstObj === -1 ? firstArr : Math.min(firstObj, firstArr);
    if (start === -1) {
      throw new Error(`Model returned no JSON object. Response began: "${s.slice(0, 200)}"`);
    }
    const close = s[start] === "{" ? "}" : "]";
    const end = s.lastIndexOf(close);
    if (end <= start) {
      throw new Error(`Model returned malformed JSON. Response began: "${s.slice(0, 200)}"`);
    }
    s = s.slice(start, end + 1);
  }

  return JSON.parse(s) as T;
}
