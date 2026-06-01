// ════════════════════════════════════════════════════════════════
// Step 1 of the character-mode PAYOFF: the two fixed relationship tracks.
//
// Every CHARACTER campaign carries the SAME pair of numeric (track) flags —
// not generator-invented per topic, a fixed pair:
//
//   family    → how those closest to you come to regard you
//   community → how the wider people around you come to regard you
//
// They are INDEPENDENT, accumulating moral-weight tracks (numeric flags,
// Steps 1-3): choices nudge them up or down via flagWrites deltas, the engine
// accumulates+clamps to [min,max], and at the end a reckoning reads each into
// tiered text. They are NEVER a visible HUD meter (the no-score law in
// validate.ts already forbids a numeric flag from being a resource).
//
// Like the fault line, the DECLARATIONS are fixed and injected in code
// (deterministic — no model needed to invent them), spliced into the parsed
// campaign beside applyFaultLine and gated on the SAME faultLine presence, so
// the systems path is byte-for-byte untouched. No prompt, no API, no engine
// changes live here.
// ════════════════════════════════════════════════════════════════

import type { FlagDecl } from "./schema.js";
import type { FaultLineSpec } from "./faultline.js";
import { SCORE_RE } from "./validate.js";

// Bounds chosen so a relationship swings meaningfully over a campaign of small
// ±1..±3 nudges without any single choice maxing it (validator enforces sane
// deltas). initial 0 = "as-yet unproven," the honest pre-play state.
const TRACK_MIN = -10;
const TRACK_MAX = 10;

export const FAMILY_FLAG: FlagDecl = {
  id: "family",
  type: "numeric",
  initial: 0,
  min: TRACK_MIN,
  max: TRACK_MAX,
  label: "How those closest to you come to regard you",
};

export const COMMUNITY_FLAG: FlagDecl = {
  id: "community",
  type: "numeric",
  initial: 0,
  min: TRACK_MIN,
  max: TRACK_MAX,
  label: "How the wider community comes to regard you",
};

// The fixed pair, in declaration order.
export const RELATIONSHIP_TRACKS: readonly FlagDecl[] = [FAMILY_FLAG, COMMUNITY_FLAG];

// The reserved ids no other flag (model-emitted or fault-line) may occupy.
export const RELATIONSHIP_TRACK_IDS: ReadonlySet<string> = new Set(
  RELATIONSHIP_TRACKS.map((t) => t.id),
);

// Splice the two relationship-track declarations into a parsed campaign.
// STRICT NO-OP when faultLine is absent — character campaigns are the only
// ones that compile a fault line, so this rides that exact gate and the
// systems path stays byte-identical.
//
// The tracks are PREPENDED. Any pre-existing flag carrying a reserved track id
// (a re-run, or a model that emitted one despite instructions) is dropped so
// the canonical decl wins and ids never duplicate. The fault-line flag has a
// distinct, content-derived id, so it is preserved alongside the tracks; a
// (theoretical) id collision is left for validate.ts to surface, not silently
// resolved here.
export function applyRelationshipTracks(
  data: Record<string, unknown>,
  faultLine?: FaultLineSpec,
): void {
  if (!faultLine) return;
  const existing = Array.isArray(data.flags) ? (data.flags as FlagDecl[]) : [];
  const kept = existing.filter((f) => f && !RELATIONSHIP_TRACK_IDS.has(f.id));
  data.flags = [...RELATIONSHIP_TRACKS, ...kept];
}

// ════════════════════════════════════════════════════════════════
// validateRelationshipTracks — the acceptance battery (mirrors
// generator/faultline.ts's validateFaultLine). Run on a GENERATED character
// campaign to prove the two tracks are honest. These are the STRICT checks
// that must NOT live in the universal validate() (a track-less character
// campaign like Joseph must still pass universal validate); they belong here,
// at generation acceptance.
// ════════════════════════════════════════════════════════════════

export interface RelationshipFinding {
  level: "error" | "warn";
  field: string;
  message: string;
}

// Each track must be moved by at least this many choices so it actually
// accumulates a history rather than flipping on a single beat.
const MIN_TRACK_WRITES = 2;

export function validateRelationshipTracks(data: unknown): RelationshipFinding[] {
  const f: RelationshipFinding[] = [];
  const push = (level: "error" | "warn", field: string, message: string) =>
    f.push({ level, field, message });

  if (typeof data !== "object" || data === null) {
    push("error", "root", "campaign is not an object");
    return f;
  }
  const d = data as Record<string, unknown>;

  // ── Both tracks declared, numeric, bounded ──
  const flags = Array.isArray(d.flags) ? (d.flags as FlagDecl[]) : [];
  const byId = new Map(flags.filter((fl) => fl && typeof fl.id === "string").map((fl) => [fl.id, fl]));
  for (const t of RELATIONSHIP_TRACKS) {
    const decl = byId.get(t.id);
    if (!decl) {
      push("error", `flags.${t.id}`, `relationship track "${t.id}" is not declared`);
      continue;
    }
    if (decl.type !== "numeric")
      push("error", `flags.${t.id}`, `relationship track "${t.id}" must be numeric (got "${decl.type}")`);
    if (typeof decl.min !== "number" || typeof decl.max !== "number")
      push("error", `flags.${t.id}`, `relationship track "${t.id}" must declare numeric min and max bounds`);
    if (typeof decl.label === "string" && SCORE_RE.test(decl.label))
      push("warn", `flags.${t.id}.label`,
        `label reads like a score; a relationship is a reckoning, not points`);
  }

  // ── Collect every numeric delta written to each track across all choices ──
  // flagWrites live on the Choice (not on random outcomes / push-luck attempts).
  const deltas: Record<string, number[]> = { family: [], community: [] };
  const events = Array.isArray(d.events) ? (d.events as Record<string, unknown>[]) : [];
  for (const ev of events) {
    const choices = Array.isArray(ev.choices) ? (ev.choices as Record<string, unknown>[]) : [];
    for (const c of choices) {
      const fw = c.flagWrites;
      if (fw && typeof fw === "object") {
        for (const t of RELATIONSHIP_TRACKS) {
          const v = (fw as Record<string, unknown>)[t.id];
          if (typeof v === "number") deltas[t.id].push(v);
        }
      }
    }
  }

  for (const t of RELATIONSHIP_TRACKS) {
    const ds = deltas[t.id];
    // touched-by-≥N-choices: a relationship moved by one beat doesn't accumulate.
    if (ds.length < MIN_TRACK_WRITES)
      push("error", `events\u2192${t.id}`,
        `relationship track "${t.id}" is written by ${ds.length} choice(s); needs \u2265${MIN_TRACK_WRITES} so it accumulates over the campaign`);
    // NOT-ALL-POSITIVE (the honesty guardrail): a track that can only rise is a
    // score, not a relationship. At least one choice must lower it.
    if (ds.length > 0 && !ds.some((v) => v < 0))
      push("error", `events\u2192${t.id}`,
        `relationship track "${t.id}" is only ever increased — a relationship you can only improve is a score, not a relationship; at least one choice must cost it`);
  }

  // ── FRONTIER: the "DEVOTED to everyone" guard (the dodgeable-conflict honesty
  //    check). Conflict choices EXISTING isn't enough — they can be dodgeable
  //    (Joseph had 5 and still leaked). The honest test is ADVERSARIAL: enumerate
  //    every line of play (one choice per event) and ERROR if ANY of them reaches
  //    BOTH tracks at/above the DEVOTION band (+9).
  //
  //    Why +9, not +4: the cutoff is anchored to the reckoning's prose seam. The
  //    reckoning's 5 tiers put "high" at +4..+8 ("you did right by them, steadily,
  //    WITHOUT giving everything" — a legitimate human outcome) and reserve +9 for
  //    "single-minded DEVOTION that visibly COST this person." Rendered generated
  //    reckonings confirm the seam: +4 through +8 read as steady decency, and only
  //    +9 turns to "gave everything / a gift that cost the giver." The falsehood
  //    the feature exists to prevent is being DEVOTED to BOTH at once — not being
  //    decently-regarded by both. So the guard fires only where the prose itself
  //    turns to devotion (+9), never inside the "did-right-by-them" band.
  //
  //    This makes the frontier guard a RARE BACKSTOP by design: honest campaigns
  //    top out around +5 on the best both-line, so both-≥+9 almost never occurs.
  //    "You can't be good to everyone" is enforced PRIMARILY by the conflict floor
  //    (genuine family↑/community↓ tradeoffs must exist) and not-all-positive
  //    (a track can fall) below/above; the frontier guard's narrowed job is to
  //    catch the rare devoted-to-both outlier the other two would miss.
  //
  //    Single fire per event is CONSERVATIVE — the engine refires events up to
  //    2×, which only amplifies, so if single-fire pins both, live play is worse.
  const DEVOTION_BAND = 9; // reckoning extreme-high band (whenAtLeast: 9) — the devotion seam
  const famDecl = byId.get("family");
  const comDecl = byId.get("community");
  const fMax = typeof famDecl?.max === "number" ? famDecl.max : TRACK_MAX;
  const cMax = typeof comDecl?.max === "number" ? comDecl.max : TRACK_MAX;

  // per-event (family, community) delta pairs for each choice
  const eventPairs: { f: number; c: number }[][] = events.map((ev) => {
    const choices = Array.isArray(ev.choices) ? (ev.choices as Record<string, unknown>[]) : [];
    return choices.map((c) => {
      const fw = c.flagWrites && typeof c.flagWrites === "object" ? (c.flagWrites as Record<string, unknown>) : {};
      return {
        f: typeof fw.family === "number" ? (fw.family as number) : 0,
        c: typeof fw.community === "number" ? (fw.community as number) : 0,
      };
    });
  });

  // EXACT feasibility: is there ANY line of play (one choice per event) that
  // ends with BOTH tracks ≥ DEVOTION? A greedy "maximize family+community" policy
  // is itself dodgeable — a player chasing both maximizes the MINIMUM of the two,
  // reaching both-high on a point greedy (which favors lopsided high-sum totals)
  // never visits. So we enumerate exactly via DP: familySum → the MAX
  // communitySum reachable at that familySum. Clamping to [min,max] is
  // irrelevant to a "≥+DEVOTION" test (clamp only alters values past ±max, never a
  // +9 threshold below max), so we accumulate raw sums. State count is tiny
  // (bounded by Σ|delta|), so this is cheap for any realistic event bank.
  const maxCommunityByFamily = (): Map<number, number> => {
    let dp = new Map<number, number>([[0, 0]]);
    for (const pairs of eventPairs) {
      if (pairs.length === 0) continue;
      const next = new Map<number, number>();
      for (const [fs, cs] of dp) {
        for (const p of pairs) {
          const nf = fs + p.f;
          const nc = cs + p.c;
          const prev = next.get(nf);
          if (prev === undefined || nc > prev) next.set(nf, nc);
        }
      }
      dp = next;
    }
    return dp;
  };

  // Only meaningful once both tracks are actually exercised (the per-track
  // checks above already error if a track is under-written).
  if (deltas.family.length > 0 && deltas.community.length > 0) {
    const pairsFlat = eventPairs.flat();
    const famUpComDown = pairsFlat.some((p) => p.f > 0 && p.c < 0);
    const comUpFamDown = pairsFlat.some((p) => p.c > 0 && p.f < 0);
    // Structural floor: at least one genuine conflict choice in EACH direction.
    if (!famUpComDown || !comUpFamDown)
      push("error", "events\u2192conflict",
        `no genuine CONFLICT choice in ${!famUpComDown ? "the family\u2191/community\u2193" : "the community\u2191/family\u2193"} direction — every gain for one track is free for the other, so the tracks never force a choice between them`);

    // The teeth: does ANY line of play pin BOTH tracks into DEVOTION at once?
    const dp = maxCommunityByFamily();
    let winF = 0;
    let winC = 0;
    let doubleWin = false;
    for (const [fs, cs] of dp) {
      if (fs >= DEVOTION_BAND && cs >= DEVOTION_BAND) {
        doubleWin = true;
        winF = Math.min(fMax, fs);
        winC = Math.min(cMax, cs);
        break;
      }
    }
    if (doubleWin)
      push("error", "events\u2192frontier",
        `a single line of play can reach family +${winF} AND community +${winC} (both \u2265+${DEVOTION_BAND}) — the player can be DEVOTED to everyone, the exact falsehood the feature prevents. At +9 each track's reckoning reads as "gave everything / a gift that cost the giver"; no line of play should reach single-minded devotion to BOTH. The biggest gains for one track must COST the other. (Being decently-regarded by both — anywhere in the +4..+8 "did right by them" band — is fine and legitimate; only devotion-to-both is the lie.)`);
  }

  // ── Reckoning: REQUIRED, tiered, reads its own track, no scorekeeping ──
  // The closing payoff. Each track gets a FlagText whose numeric bands tier
  // the accumulated value into prose. (resolveFlagText reads these at the end.)
  const reckoning = d.reckoning;
  if (!reckoning || typeof reckoning !== "object") {
    push("error", "reckoning",
      "a character campaign must fill `reckoning` (the closing readout for family + community)");
  } else {
    const rk = reckoning as Record<string, unknown>;
    for (const t of RELATIONSHIP_TRACKS) {
      const min = (t.min as number) ?? -Infinity;
      const max = (t.max as number) ?? Infinity;
      const ft = rk[t.id];
      if (ft === undefined) {
        push("error", `reckoning.${t.id}`, `reckoning is missing the "${t.id}" readout`);
        continue;
      }
      const obj = ft as { default?: unknown; variants?: unknown };
      if (typeof ft !== "object" || ft === null || typeof obj.default !== "string" || !Array.isArray(obj.variants)) {
        push("error", `reckoning.${t.id}`,
          `reckoning.${t.id} must be a tiered FlagText { default, variants[] }, not a plain string`);
        continue;
      }
      const variants = obj.variants as Record<string, unknown>[];
      if (variants.length < 2)
        push("error", `reckoning.${t.id}`,
          `reckoning.${t.id} needs \u22652 tiers to read the track as bands (got ${variants.length})`);
      if (typeof obj.default === "string" && SCORE_RE.test(obj.default))
        push("warn", `reckoning.${t.id}.default`, `reckoning text reads like a score, not human memory`);

      let reachesTop = false;
      let reachesBottom = false;
      variants.forEach((v, i) => {
        const vp = `reckoning.${t.id}.variants[${i}]`;
        if (v.whenFlag !== t.id)
          push("error", `${vp}.whenFlag`,
            `tier must read its own track "${t.id}" (got whenFlag="${String(v.whenFlag)}")`);
        const hasBand = v.whenAtLeast !== undefined || v.whenAtMost !== undefined;
        if (v.equals !== undefined || !hasBand)
          push("error", `${vp}`, `tier must use whenAtLeast/whenAtMost (a numeric band), not equals`);
        for (const b of ["whenAtLeast", "whenAtMost"] as const) {
          const val = v[b];
          if (val !== undefined) {
            if (typeof val !== "number") push("error", `${vp}.${b}`, `${b} must be a number`);
            else if (val < min || val > max)
              push("warn", `${vp}.${b}`, `${b} ${val} is outside the track range [${min}, ${max}]`);
          }
        }
        if (typeof v.whenAtLeast === "number" && v.whenAtLeast > 0) reachesTop = true;
        if (typeof v.whenAtMost === "number" && v.whenAtMost < 0) reachesBottom = true;
        if (typeof v.text === "string" && SCORE_RE.test(v.text))
          push("warn", `${vp}`, `reckoning text reads like a score; describe how they remember this person, not points`);
      });
      if (!reachesTop || !reachesBottom)
        push("warn", `reckoning.${t.id}`,
          `tiers should cover both a high band (whenAtLeast>0) and a low band (whenAtMost<0) so both outcomes are reflected`);
    }
  }

  return f;
}
