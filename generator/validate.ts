import type { CampaignData } from "./schema.js";

interface Finding {
  level: "error" | "warn";
  field: string;
  message: string;
}

export interface ValidationReport {
  findings: Finding[];
  passed: number;
  failed: number;
  warnings: number;
}

// Scorekeeping vocabulary — a numeric (track) flag must read as a reckoning,
// not a game score the player optimizes (same spirit as faultline's no-reward
// law). Exported so the relationship-track battery scans with the SAME regex.
export const SCORE_RE = /\b(score|points?|leaderboard|high[- ]?score|rating)\b/i;

function err(field: string, message: string): Finding {
  return { level: "error", field, message };
}
function warn(field: string, message: string): Finding {
  return { level: "warn", field, message };
}

export function validate(data: unknown): ValidationReport {
  const findings: Finding[] = [];
  let passed = 0;

  function check(field: string, ok: boolean, message: string, level: "error" | "warn" = "error") {
    if (ok) {
      passed++;
    } else {
      findings.push(level === "error" ? err(field, message) : warn(field, message));
    }
  }

  if (typeof data !== "object" || data === null) {
    findings.push(err("root", "Data is not an object"));
    return { findings, passed: 0, failed: 1, warnings: 0 };
  }

  const d = data as Record<string, unknown>;

  // ── Progression mode ─────────────────────────────────────────
  // Gates the journey-only structural checks below. Absent ⇒ "journey"
  // so every pre-existing campaign keeps the original check set.
  const mode: "journey" | "project" =
    d.progressionMode === "project" ? "project" : "journey";
  if (
    d.progressionMode !== undefined &&
    d.progressionMode !== "journey" &&
    d.progressionMode !== "project"
  ) {
    findings.push(err("progressionMode", 'progressionMode must be "journey" or "project" if present'));
  }

  // ── Identity fields ──────────────────────────────────────────
  for (const key of ["id", "title", "subtitle", "introBody", "trailFeedOpener", "primaryResourceKey", "historicalContext"] as const) {
    check(key, typeof d[key] === "string" && (d[key] as string).length > 0, `Missing or empty string: ${key}`);
  }

  // distanceUnit and mapImage are journey-only: the distance unit and the trail
  // map exist only when the run advances by distance. Character/project
  // campaigns have no trail map (mapImage left empty), so requiring it in the
  // universal identity loop above spuriously BLOCKED them — gate it like the
  // other trail-only fields (paces, trailPath, trailStops, herdOptions).
  if (mode === "journey") {
    check("distanceUnit", typeof d.distanceUnit === "string" && (d.distanceUnit as string).length > 0,
      "Missing or empty string: distanceUnit");
    check("mapImage", typeof d.mapImage === "string" && (d.mapImage as string).length > 0,
      "Missing or empty string: mapImage");
  }

  if (d.theme !== undefined) {
    check("theme", typeof d.theme === "string", "theme must be a string");
  }

  if (d.isPublished !== undefined) {
    check("isPublished", typeof d.isPublished === "boolean", "isPublished must be a boolean");
  }

  // ── Numeric fields ───────────────────────────────────────────
  for (const key of ["totalDays", "daysPerTurn", "totalDistance", "primaryResourceStart", "revenuePerUnit"] as const) {
    check(key, typeof d[key] === "number" && isFinite(d[key] as number), `Missing or non-numeric: ${key}`);
  }

  // Project mode advances by time, so the time span must be real.
  if (mode === "project") {
    check("totalDays", typeof d.totalDays === "number" && (d.totalDays as number) > 0,
      "totalDays must be > 0 in project mode (drives phase progression)");
    check("daysPerTurn", typeof d.daysPerTurn === "number" && (d.daysPerTurn as number) > 0,
      "daysPerTurn must be > 0 in project mode (drives phase progression)");
  }

  // ── Resources consistency ────────────────────────────────────
  const initialResources = d.initialResources as Record<string, number> | undefined;
  const resourceCaps = d.resourceCaps as Record<string, number> | undefined;
  const resourceLabels = d.resourceLabels as Record<string, string> | undefined;

  check("initialResources", typeof initialResources === "object" && initialResources !== null, "Missing initialResources");
  check("resourceCaps", typeof resourceCaps === "object" && resourceCaps !== null, "Missing resourceCaps");
  check("resourceLabels", typeof resourceLabels === "object" && resourceLabels !== null, "Missing resourceLabels");

  const initKeys = initialResources ? new Set(Object.keys(initialResources)) : new Set<string>();

  if (resourceCaps) {
    for (const k of Object.keys(resourceCaps)) {
      check("resourceCaps", initKeys.has(k), `resourceCaps key "${k}" not in initialResources`, "warn");
    }
  }
  if (resourceLabels) {
    for (const k of initKeys) {
      check("resourceLabels", k in resourceLabels, `initialResources key "${k}" missing from resourceLabels`);
    }
  }

  // ── primaryResourceKey must exist in initialResources ────────
  if (typeof d.primaryResourceKey === "string" && initKeys.size > 0) {
    check("primaryResourceKey", initKeys.has(d.primaryResourceKey as string),
      `primaryResourceKey "${d.primaryResourceKey}" not found in initialResources`);
  }

  // ── Flags (declarations) ─────────────────────────────────────
  // Optional & additive: absent ⇒ no flag system, so existing
  // campaigns reference no flags and this whole block is a no-op.
  type FlagType = "boolean" | "tristate" | "numeric";
  const declaredFlags = new Map<string, FlagType>();
  const numericBounds = new Map<string, { min?: number; max?: number }>();
  const writtenFlags = new Set<string>();
  const readFlags = new Set<string>();

  // A value is legal for a flag iff: tristate allows null|false|true, boolean
  // allows only false|true, numeric allows any finite number (a set initial or
  // a write delta).
  function flagValueLegal(type: FlagType, v: unknown): boolean {
    if (type === "numeric") return typeof v === "number" && isFinite(v);
    if (type === "tristate") return v === null || v === true || v === false;
    return v === true || v === false;
  }

  const flagsDecl = d.flags;
  if (flagsDecl !== undefined) {
    check("flags", Array.isArray(flagsDecl), "flags must be an array if present");
    if (Array.isArray(flagsDecl)) {
      for (let i = 0; i < flagsDecl.length; i++) {
        const f = flagsDecl[i] as Record<string, unknown>;
        const fp = `flags[${i}]`;
        const idOk = typeof f.id === "string" && (f.id as string).length > 0;
        check(`${fp}.id`, idOk, "Flag missing id");
        const typeOk = f.type === "boolean" || f.type === "tristate" || f.type === "numeric";
        check(`${fp}.type`, typeOk, 'Flag type must be "boolean", "tristate", or "numeric"');
        if (idOk && typeOk) {
          const fid = f.id as string;
          const ftype = f.type as FlagType;
          check(`${fp}.id`, !declaredFlags.has(fid), `Duplicate flag id: "${fid}"`);
          declaredFlags.set(fid, ftype);

          if (ftype === "numeric") {
            // numeric (track) flag: number initial, optional [min,max] clamp.
            const min = typeof f.min === "number" ? (f.min as number) : undefined;
            const max = typeof f.max === "number" ? (f.max as number) : undefined;
            numericBounds.set(fid, { min, max });
            check(`${fp}.initial`, typeof f.initial === "number" && isFinite(f.initial as number),
              "numeric flag initial must be a number");
            if (f.min !== undefined)
              check(`${fp}.min`, typeof f.min === "number", "numeric flag min must be a number");
            if (f.max !== undefined)
              check(`${fp}.max`, typeof f.max === "number", "numeric flag max must be a number");
            if (min !== undefined && max !== undefined) {
              check(`${fp}.min`, min <= max, `numeric flag min (${min}) must be <= max (${max})`);
              if (typeof f.initial === "number")
                check(`${fp}.initial`, (f.initial as number) >= min && (f.initial as number) <= max,
                  `numeric flag initial ${f.initial} must be within [${min}, ${max}]`);
            } else {
              check(`${fp}`, false,
                `numeric flag "${fid}" has no min/max bounds; accumulation and reader tiers are unbounded`, "warn");
            }
            // NO-SCORE LAW: a track is a reckoning, never a visible meter. It
            // must NOT collide with a resource key (that would render it as a
            // HUD stat / score). This is an ERROR, not a warning.
            check(`${fp}.id`, !initKeys.has(fid),
              `numeric flag "${fid}" collides with a resource key — a moral track must never be a visible resource/score`);
            if (typeof f.label === "string")
              check(`${fp}.label`, !SCORE_RE.test(f.label as string),
                `numeric flag label "${f.label}" reads like a score; a track is a reckoning, not points`, "warn");
          } else {
            check(`${fp}.initial`, flagValueLegal(ftype, f.initial),
              ftype === "tristate"
                ? "tristate flag initial must be null, false, or true"
                : "boolean flag initial must be false or true");
            if (f.min !== undefined || f.max !== undefined)
              check(`${fp}`, false, `min/max are only valid on numeric flags (flag "${fid}" is ${ftype})`, "warn");
          }
        }
      }
    }
  }

  // ── Relationship tracks: reserved ids + paired-if-present ────────
  // Additive: fires ONLY when a reserved track id appears. Systems campaigns
  // and track-less character campaigns (e.g. hand-built Joseph) declare
  // neither "family" nor "community", so this whole block is a no-op for them.
  // Resource-key collision is already covered by the numeric no-score check
  // above; here we guard the reserved ids against a NON-numeric flag (e.g. a
  // fault-line boolean) squatting on them, and enforce the pair.
  for (const tid of ["family", "community"] as const) {
    const tt = declaredFlags.get(tid);
    if (tt !== undefined && tt !== "numeric")
      check(`flags.${tid}`, false,
        `"${tid}" is a reserved relationship-track id and must be a numeric track, not a ${tt} flag`);
  }
  const hasFamily = declaredFlags.has("family");
  const hasCommunity = declaredFlags.has("community");
  if (hasFamily !== hasCommunity)
    check("flags\u2192relationship", false,
      `relationship tracks must be declared as a pair — found ${hasFamily ? "family" : "community"} but not ${hasFamily ? "community" : "family"}`);

  // Collect all resource keys referenced in events for cross-check
  const eventResourceKeys = new Set<string>();

  // ── Events ───────────────────────────────────────────────────
  const events = d.events;
  check("events", Array.isArray(events) && (events as unknown[]).length > 0, "events must be a non-empty array");

  if (Array.isArray(events)) {
    const eventIds = new Set<string>();
    for (let i = 0; i < events.length; i++) {
      const ev = events[i] as Record<string, unknown>;
      const prefix = `events[${i}]`;
      check(`${prefix}.id`, typeof ev.id === "string" && (ev.id as string).length > 0, "Missing event id");
      if (typeof ev.id === "string") {
        check(`${prefix}.id`, !eventIds.has(ev.id), `Duplicate event id: "${ev.id}"`);
        eventIds.add(ev.id);
      }
      check(`${prefix}.title`, typeof ev.title === "string", "Missing event title");

      // text may be a plain string (unchanged) OR a flag-keyed FlagText
      // object { default, variants }. The object form is what the reader
      // resolves at render time; we validate its variants here.
      const txt = ev.text;
      if (typeof txt === "string") {
        check(`${prefix}.text`, true, "Missing event text");
      } else if (txt !== null && typeof txt === "object" && !Array.isArray(txt)) {
        const ft = txt as Record<string, unknown>;
        check(`${prefix}.text.default`, typeof ft.default === "string",
          "FlagText must have a string `default`");
        check(`${prefix}.text.variants`, Array.isArray(ft.variants),
          "FlagText must have a `variants` array");
        if (Array.isArray(ft.variants)) {
          for (let vi = 0; vi < ft.variants.length; vi++) {
            const vr = ft.variants[vi] as Record<string, unknown>;
            const vp = `${prefix}.text.variants[${vi}]`;
            check(`${vp}.text`, typeof vr.text === "string", "Variant missing text");
            if (typeof vr.whenFlag === "string") {
              const wf = vr.whenFlag;
              readFlags.add(wf);
              const wtype = declaredFlags.get(wf);
              check(`${vp}.whenFlag`, wtype !== undefined,
                `Variant references undeclared flag "${wf}"`);
              if (wtype === "numeric") {
                // numeric: an inclusive threshold band, never `equals`.
                const hasBand = vr.whenAtLeast !== undefined || vr.whenAtMost !== undefined;
                check(`${vp}.equals`, vr.equals === undefined,
                  `numeric flag "${wf}" variant must use whenAtLeast/whenAtMost, not equals`);
                check(`${vp}.whenAtLeast`, hasBand,
                  `numeric flag "${wf}" variant needs whenAtLeast and/or whenAtMost`);
                const bounds = numericBounds.get(wf);
                for (const b of ["whenAtLeast", "whenAtMost"] as const) {
                  if (vr[b] !== undefined) {
                    const num = typeof vr[b] === "number" && isFinite(vr[b] as number);
                    check(`${vp}.${b}`, num, `${b} must be a number`);
                    if (num && bounds && bounds.min !== undefined && bounds.max !== undefined) {
                      const val = vr[b] as number;
                      check(`${vp}.${b}`, val >= bounds.min && val <= bounds.max,
                        `${b} ${val} is outside flag "${wf}" range [${bounds.min}, ${bounds.max}]`, "warn");
                    }
                  }
                }
              } else if (wtype !== undefined) {
                // boolean / tristate: exact equals only, never a threshold band.
                check(`${vp}.equals`, flagValueLegal(wtype, vr.equals),
                  `Variant equals value is not legal for ${wtype} flag "${wf}"`);
                check(`${vp}.whenAtLeast`, vr.whenAtLeast === undefined && vr.whenAtMost === undefined,
                  `whenAtLeast/whenAtMost are only valid on numeric flags (flag "${wf}" is ${wtype})`);
              }
            } else {
              check(`${vp}.whenFlag`, false, "Variant missing whenFlag");
            }
          }
        }
      } else {
        check(`${prefix}.text`, false, "Event text must be a string or a FlagText object");
      }
      check(`${prefix}.phase_min`, typeof ev.phase_min === "number", "Missing phase_min");
      check(`${prefix}.phase_max`, typeof ev.phase_max === "number", "Missing phase_max");
      check(`${prefix}.weight`, typeof ev.weight === "number" && (ev.weight as number) > 0, "Missing or zero weight");

      if (ev.type === "push_luck") {
        check(`${prefix}.attempts`, Array.isArray(ev.attempts) && (ev.attempts as unknown[]).length > 0,
          "push_luck event must have non-empty attempts array");
        if (Array.isArray(ev.attempts)) {
          for (const att of ev.attempts as Record<string, unknown>[]) {
            for (const k of Object.keys(att.rewards as Record<string, number> || {})) eventResourceKeys.add(k);
            for (const k of Object.keys(att.penalties as Record<string, number> || {})) eventResourceKeys.add(k);
          }
        }
      } else {
        check(`${prefix}.choices`, Array.isArray(ev.choices) && (ev.choices as unknown[]).length > 0,
          "Standard event must have non-empty choices array");
        if (Array.isArray(ev.choices)) {
          for (const ch of ev.choices as Record<string, unknown>[]) {
            if (ch.effects) {
              for (const k of Object.keys(ch.effects as Record<string, number>)) eventResourceKeys.add(k);
            }
            if (ch.flagWrites && typeof ch.flagWrites === "object") {
              for (const [fk, fv] of Object.entries(ch.flagWrites as Record<string, unknown>)) {
                writtenFlags.add(fk);
                const wtype = declaredFlags.get(fk);
                check(`${prefix}.choices.flagWrites`, wtype !== undefined,
                  `Choice writes undeclared flag "${fk}"`);
                if (wtype !== undefined) {
                  // numeric writes are DELTAs (a finite number); boolean/tristate
                  // writes SET a legal value. Both go through flagValueLegal.
                  check(`${prefix}.choices.flagWrites`, flagValueLegal(wtype, fv),
                    `flagWrites value for ${wtype} flag "${fk}" is not legal`);
                  if (wtype === "numeric" && typeof fv === "number") {
                    const bounds = numericBounds.get(fk);
                    if (bounds && bounds.min !== undefined && bounds.max !== undefined) {
                      const span = bounds.max - bounds.min;
                      check(`${prefix}.choices.flagWrites`, Math.abs(fv) <= span,
                        `numeric delta ${fv} for "${fk}" exceeds the track's full range ${span}; a single choice shouldn't max the track`, "warn");
                    }
                  }
                }
              }
            }
            if (Array.isArray(ch.outcomes)) {
              for (const o of ch.outcomes as Record<string, unknown>[]) {
                if (o.effects) {
                  for (const k of Object.keys(o.effects as Record<string, number>)) eventResourceKeys.add(k);
                }
              }
            }
            // moralTag (verdict system): OPTIONAL — untagged choices are valid
            // (tactical/logistics options carry no moral weight). When present it
            // must be one of the three allowed values. We do NOT judge whether a
            // tag is the morally "correct" call — that is verified by human read.
            if (ch.moralTag !== undefined) {
              check(`${prefix}.choices.moralTag`,
                ch.moralTag === "principled" || ch.moralTag === "self-serving" || ch.moralTag === "obvious",
                `moralTag "${String(ch.moralTag)}" is not one of "principled" | "self-serving" | "obvious"`);
            }
            // NO INERT OPTION: in a multi-option event every choice must carry a
            // felt consequence of SOME kind — a resource effect, a flag write, a
            // branching outcome, or an early end. A plain `result` string is not
            // a consequence (every choice has one). Single-option events are
            // narration "continue" screens (e.g. the fault-line readers' "Go on.")
            // and are intentionally exempt.
            if ((ev.choices as unknown[]).length > 1) {
              const hasEffect = !!ch.effects && typeof ch.effects === "object" && Object.keys(ch.effects as object).length > 0;
              const hasFlagWrite = !!ch.flagWrites && typeof ch.flagWrites === "object" && Object.keys(ch.flagWrites as object).length > 0;
              const hasOutcomes = Array.isArray(ch.outcomes) && (ch.outcomes as unknown[]).length > 0;
              const hasEarlyEnd = ch.earlyEnd === true;
              check(`${prefix}.choices`, hasEffect || hasFlagWrite || hasOutcomes || hasEarlyEnd,
                `a choice writes nothing (no effects, flagWrites, outcomes, or earlyEnd); every option in a multi-option event must have a felt consequence`);
            }
          }
        }
      }

      // Trivia gate references
      if (ev.triviaGate && Array.isArray(ev.trivia)) {
        // We'll validate these IDs against eventTrivia below
      }
    }
  }

  // Check that event resource keys are known
  for (const k of eventResourceKeys) {
    check("events→resources", initKeys.has(k),
      `Events reference resource key "${k}" not found in initialResources`);
  }

  // NO-SCORE LAW (cont.): a numeric track must never be wired into resource
  // effects — that would make it a spendable/visible meter, not a reckoning.
  for (const [fid, ftype] of declaredFlags) {
    if (ftype === "numeric")
      check("flags→effects", !eventResourceKeys.has(fid),
        `numeric flag "${fid}" is referenced in resource effects; a moral track must not be a resource/score`);
  }

  // ── Flag usage warnings ──────────────────────────────────────
  // A declared flag with no writer can never change; one with no
  // reader can never be observed. Both are warnings, not errors.
  for (const [id] of declaredFlags) {
    check("flags→writes", writtenFlags.has(id),
      `Flag "${id}" is declared but never written by any choice`, "warn");
    check("flags→reads", readFlags.has(id),
      `Flag "${id}" is declared but never read by any variant`, "warn");
  }

  // ── Pace resource keys ───────────────────────────────────────
  const paces = d.paces;
  if (mode === "journey") {
    check("paces", Array.isArray(paces) && (paces as unknown[]).length > 0, "paces must be a non-empty array");
  }
  if (Array.isArray(paces)) {
    for (let i = 0; i < paces.length; i++) {
      const p = paces[i] as Record<string, unknown>;
      check(`paces[${i}].fx`, typeof p.fx === "object" && p.fx !== null, "Pace missing fx object");
      if (typeof p.fx === "object" && p.fx !== null) {
        for (const k of Object.keys(p.fx as Record<string, number>)) {
          check(`paces[${i}].fx`, initKeys.has(k),
            `Pace fx references unknown resource key "${k}"`, "warn");
        }
      }
    }
  }

  // ── Sages ────────────────────────────────────────────────────
  const sages = d.sages;
  check("sages", Array.isArray(sages) && (sages as unknown[]).length > 0, "sages must be a non-empty array");
  if (Array.isArray(sages)) {
    const sageIds = new Set<string>();
    for (let i = 0; i < sages.length; i++) {
      const s = sages[i] as Record<string, unknown>;
      const prefix = `sages[${i}]`;
      check(`${prefix}.id`, typeof s.id === "string", "Missing sage id");
      if (typeof s.id === "string") {
        check(`${prefix}.id`, !sageIds.has(s.id), `Duplicate sage id: "${s.id}"`);
        sageIds.add(s.id);
      }
      check(`${prefix}.name`, typeof s.name === "string", "Missing sage name");
      check(`${prefix}.threshold`, typeof s.threshold === "number", "Missing sage threshold");
      check(`${prefix}.question`, typeof s.question === "object" && s.question !== null, "Missing sage question");
      if (typeof s.question === "object" && s.question !== null) {
        const q = s.question as Record<string, unknown>;
        check(`${prefix}.question.choices`, Array.isArray(q.choices) && (q.choices as unknown[]).length >= 2,
          "Sage question must have at least 2 choices");
        check(`${prefix}.question.correctIndex`,
          typeof q.correctIndex === "number" && Array.isArray(q.choices) &&
          (q.correctIndex as number) >= 0 && (q.correctIndex as number) < (q.choices as unknown[]).length,
          "correctIndex out of range");
        check(`${prefix}.question.teksRef`, typeof q.teksRef === "string" && (q.teksRef as string).length > 0,
          "Missing teksRef on sage question");
      }

      // Sage reward resource keys
      if (typeof s.reward === "object" && s.reward !== null) {
        const rew = s.reward as Record<string, unknown>;
        for (const bucket of ["correct", "wrong"] as const) {
          if (typeof rew[bucket] === "object" && rew[bucket] !== null) {
            for (const k of Object.keys(rew[bucket] as Record<string, number>)) {
              check(`${prefix}.reward.${bucket}`, initKeys.has(k),
                `Sage reward references unknown resource key "${k}"`, "warn");
            }
          }
        }
      }
    }
  }

  // ── Route coherence ──────────────────────────────────────────
  const route = d.route;
  check("route", Array.isArray(route) && (route as unknown[]).length > 0, "route must be a non-empty array");
  if (Array.isArray(route)) {
    const routeIds = new Set<string>();
    for (const node of route as Record<string, unknown>[]) {
      if (typeof node.id === "string") routeIds.add(node.id);
    }
    check("route", routeIds.has("start"), 'Route must contain a node with id "start"');

    for (let i = 0; i < route.length; i++) {
      const node = route[i] as Record<string, unknown>;
      if (Array.isArray(node.edges)) {
        for (const edge of node.edges as Record<string, unknown>[]) {
          check(`route[${i}].edges`, typeof edge.to === "string" && routeIds.has(edge.to as string),
            `Route edge references unknown node "${edge.to}"`);
        }
      }
    }

    // Check there's at least one terminal node (empty edges)
    const hasTerminal = (route as Record<string, unknown>[]).some(
      n => Array.isArray(n.edges) && (n.edges as unknown[]).length === 0
    );
    check("route", hasTerminal, "Route has no terminal node (node with empty edges)", "warn");
  }

  // ── Event trivia ─────────────────────────────────────────────
  const eventTrivia = d.eventTrivia;
  check("eventTrivia", Array.isArray(eventTrivia) && (eventTrivia as unknown[]).length > 0, "eventTrivia must be a non-empty array");
  if (Array.isArray(eventTrivia)) {
    for (let i = 0; i < eventTrivia.length; i++) {
      const q = eventTrivia[i] as Record<string, unknown>;
      check(`eventTrivia[${i}].id`, typeof q.id === "string", "Missing trivia id");
      check(`eventTrivia[${i}].choices`, Array.isArray(q.choices) && (q.choices as unknown[]).length >= 2,
        "Trivia question must have at least 2 choices");
      check(`eventTrivia[${i}].correctIndex`,
        typeof q.correctIndex === "number" && Array.isArray(q.choices) &&
        (q.correctIndex as number) >= 0 && (q.correctIndex as number) < (q.choices as unknown[]).length,
        "correctIndex out of range");
    }
  }

  // ── Trail stops ──────────────────────────────────────────────
  const trailStops = d.trailStops;
  if (mode === "journey") {
    check("trailStops", Array.isArray(trailStops) && (trailStops as unknown[]).length >= 2,
      "trailStops must have at least 2 entries (start and end)");
  }

  const trailPath = d.trailPath;
  if (mode === "journey") {
    check("trailPath", Array.isArray(trailPath) && (trailPath as unknown[]).length >= 2,
      "trailPath must have at least 2 coordinate pairs");
  }

  if (Array.isArray(trailPath)) {
    for (let i = 0; i < trailPath.length; i++) {
      const pt = trailPath[i];
      check(`trailPath[${i}]`, Array.isArray(pt) && (pt as unknown[]).length === 2 &&
        typeof (pt as unknown[])[0] === "number" && typeof (pt as unknown[])[1] === "number",
        "Each trailPath entry must be [number, number]");
    }
  }

  // ── Outfit config ────────────────────────────────────────────
  const oc = d.outfitConfig as Record<string, unknown> | undefined;
  check("outfitConfig", typeof oc === "object" && oc !== null, "Missing outfitConfig");
  if (typeof oc === "object" && oc !== null) {
    check("outfitConfig.budget", typeof oc.budget === "number", "Missing outfitConfig.budget");
    check("outfitConfig.costs", typeof oc.costs === "object" && oc.costs !== null, "Missing outfitConfig.costs");
    // herdOptions is a CATTLE-DRIVE-specific field (how many cattle to drive),
    // not a journey-universal one — Lewis & Clark, the Oregon Trail, a military
    // march, or any project campaign are all herd-less. So it is no longer
    // required by mode: validate its SHAPE only when present (cf.
    // theme/isPublished/flags above), and accept an EMPTY array as the honest
    // herd-less value (project mode is explicitly instructed to emit []).
    // Absent ⇒ skipped. A non-array is still malformed. Chisholm emits a
    // non-empty array ⇒ validates exactly as before.
    if (oc.herdOptions !== undefined) {
      check("outfitConfig.herdOptions", Array.isArray(oc.herdOptions),
        "outfitConfig.herdOptions must be an array if present");
    }
  }

  // ── Pixel faces ──────────────────────────────────────────────
  check("pixelColors", typeof d.pixelColors === "object" && d.pixelColors !== null, "Missing pixelColors");
  check("pixelFaces", typeof d.pixelFaces === "object" && d.pixelFaces !== null, "Missing pixelFaces");

  const failed = findings.filter(f => f.level === "error").length;
  const warnings = findings.filter(f => f.level === "warn").length;
  return { findings, passed, failed, warnings };
}

export function printReport(report: ValidationReport): void {
  const { findings, passed, failed, warnings } = report;

  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║           CAMPAIGN DATA VALIDATION REPORT           ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  if (findings.length === 0) {
    console.log(`  ✓ All ${passed} checks passed.\n`);
    return;
  }

  const errors = findings.filter(f => f.level === "error");
  const warns = findings.filter(f => f.level === "warn");

  if (errors.length > 0) {
    console.log("  ERRORS (will break the engine):");
    for (const f of errors) {
      console.log(`    ✗ [${f.field}] ${f.message}`);
    }
    console.log();
  }

  if (warns.length > 0) {
    console.log("  WARNINGS (may cause issues):");
    for (const f of warns) {
      console.log(`    ⚠ [${f.field}] ${f.message}`);
    }
    console.log();
  }

  console.log(`  Summary: ${passed} passed, ${failed} errors, ${warnings} warnings\n`);
}
