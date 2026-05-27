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

  // ── Identity fields ──────────────────────────────────────────
  for (const key of ["id", "title", "subtitle", "introBody", "trailFeedOpener", "distanceUnit", "mapImage", "primaryResourceKey", "historicalContext"] as const) {
    check(key, typeof d[key] === "string" && (d[key] as string).length > 0, `Missing or empty string: ${key}`);
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
      check(`${prefix}.text`, typeof ev.text === "string", "Missing event text");
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
            if (Array.isArray(ch.outcomes)) {
              for (const o of ch.outcomes as Record<string, unknown>[]) {
                if (o.effects) {
                  for (const k of Object.keys(o.effects as Record<string, number>)) eventResourceKeys.add(k);
                }
              }
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

  // ── Pace resource keys ───────────────────────────────────────
  const paces = d.paces;
  check("paces", Array.isArray(paces) && (paces as unknown[]).length > 0, "paces must be a non-empty array");
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
  check("trailStops", Array.isArray(trailStops) && (trailStops as unknown[]).length >= 2,
    "trailStops must have at least 2 entries (start and end)");

  const trailPath = d.trailPath;
  check("trailPath", Array.isArray(trailPath) && (trailPath as unknown[]).length >= 2,
    "trailPath must have at least 2 coordinate pairs");

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
    check("outfitConfig.herdOptions", Array.isArray(oc.herdOptions) && (oc.herdOptions as unknown[]).length > 0,
      "Missing or empty outfitConfig.herdOptions");
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
