// ════════════════════════════════════════════════════════════════
// EVAL DIMENSION (deterministic) — "ending-recites-choices" (Product 2).
//
// The scorekeeper for the RESPONSIVE ending: does the deterministically-assembled
// ending actually read the player's choices back? Run on a PRODUCED campaign (a
// real generation), not a fixture — this is what catches fragment-DROP across
// topics in the eval, the detector extended to the scorekeeper (same role as
// narrative-coherence). n/a-pass for a non-narrative product, exactly as
// timeline-coherence is n/a for systems mode.
//
// Pure (no model call, no SDK): split out of eval-harness.ts so it is importable
// and unit-testable on its own — the harness CLI runs main() on import, so the
// checker cannot live there if a test is to exercise it directly.
//
// Three deterministic checks: (1) every decision-beat option carries a non-empty
// endingFragment; (2) the constant coda is present; (3) two DIVERGENT choice-
// vectors, assembled by the real assembleEnding over the real choice-memory the
// engine would record, recite their OWN chosen fragments, DIFFER from each other,
// and SHARE the identical coda.
// ════════════════════════════════════════════════════════════════

import { assembleEnding, pinnedChoiceEntry, type ChoiceMemoryEntry } from "./endingAssemble.js";

export interface EndingDimensionResult {
  status: "pass" | "warn" | "fail";
  detail: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function checkEndingRecitesChoices(d: any): EndingDimensionResult {
  const isNarrative = d?.productType === "narrative" ||
    (d?.endingFrame && typeof d.endingFrame === "object");
  if (!isNarrative)
    return { status: "pass", detail: "n/a — not a narrative product (no assembled ending)" };

  const events: any[] = Array.isArray(d?.events) ? d.events : [];
  const pinned = events.filter((e) => e?.pinned === true);
  // Decision beats: pinned, with a real decision (≥2 choices), in arc order.
  const decisionBeats = pinned
    .filter((e) => (e.choices?.length ?? 0) >= 2)
    .sort((a, b) => (a.pinSeq ?? 0) - (b.pinSeq ?? 0));

  const problems: string[] = [];
  if (decisionBeats.length === 0)
    problems.push("no pinned decision beat — the ending has no choices to recite");

  // (1) Authoring completeness — the fragment-drop detector.
  let missingFrag = 0;
  for (const e of decisionBeats)
    for (const c of e.choices)
      if (typeof c.endingFragment !== "string" || !c.endingFragment.trim()) missingFrag++;
  if (missingFrag) problems.push(`${missingFrag} decision-beat option(s) missing an endingFragment`);

  // (2) The constant coda.
  const coda = typeof d?.endingFrame?.coda === "string" ? d.endingFrame.coda : d?.storyMeaning;
  if (typeof coda !== "string" || !coda.trim())
    problems.push("missing endingFrame.coda / storyMeaning (the constant synthesis)");

  // (3) Responsiveness — only meaningful once (1) and (2) hold.
  let recited = 0;
  if (decisionBeats.length > 0 && missingFrag === 0 && typeof coda === "string" && coda.trim()) {
    const vector = (pick: (e: any) => number): ChoiceMemoryEntry[] =>
      decisionBeats.map((e) => pinnedChoiceEntry(e, pick(e))).filter((x): x is ChoiceMemoryEntry => x !== null);
    // Vector A: first option everywhere. Vector B: a DIFFERENT option (index 1,
    // which every ≥2-choice beat has).
    const endA = assembleEnding(d, vector(() => 0));
    const endB = assembleEnding(d, vector(() => 1));

    // Each vector recites its OWN chosen fragments verbatim.
    const recites = (end: string, pick: number) =>
      decisionBeats.every((e) => end.includes(e.choices[pick].endingFragment));
    if (!recites(endA, 0) || !recites(endB, 1))
      problems.push("an assembled ending does not recite its chosen fragments verbatim");
    else recited = decisionBeats.length;

    // Responsive: the two endings differ…
    if (endA === endB)
      problems.push("two different choice-vectors produced the SAME ending — not responsive to choices");
    // …but END on the identical constant coda.
    const lastA = endA.split("\n\n").pop();
    const lastB = endB.split("\n\n").pop();
    if (lastA !== lastB || lastA !== coda.trim())
      problems.push("the two endings do not share the identical constant coda");
  }

  if (problems.length) return { status: "fail", detail: problems.join("; ") };
  return { status: "pass", detail: `ending recites ${recited} chosen fragment(s); two vectors differ in the slots and share the coda` };
}
