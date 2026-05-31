import type { CampaignData, FlagDecl, FlagValue, FlagWrites } from "../generator/schema";

// Clamp a numeric (track) flag to its declared [min,max]. Bounds are optional;
// an unbounded track is left as-is.
export function clampFlag(decl: FlagDecl, v: number): number {
  let r = v;
  if (typeof decl.min === "number") r = Math.max(decl.min, r);
  if (typeof decl.max === "number") r = Math.min(decl.max, r);
  return r;
}

// Apply a choice's flagWrites, dispatching on each flag's DECLARED type:
//   • numeric ⇒ ACCUMULATE — the written value is a delta added to the current
//     value (defaulting to the decl's initial), then clamped to [min,max].
//     Tracks accumulate silently; they never touch the resource/float pipeline.
//   • boolean / tristate (and any undeclared key) ⇒ SET — the value replaces
//     the current one. This is the identical `{ ...flags, ...writes }` path the
//     engine has always used, so boolean writes are byte-for-byte unchanged.
export function applyFlagWrites(
  data: CampaignData,
  current: Record<string, FlagValue>,
  writes: FlagWrites,
): Record<string, FlagValue> {
  const decls = data.flags;
  if (!decls || !decls.length) return { ...current, ...writes };
  const byId = new Map(decls.map(d => [d.id, d]));
  const next = { ...current };
  for (const [k, v] of Object.entries(writes)) {
    const decl = byId.get(k);
    if (decl && decl.type === "numeric" && typeof v === "number") {
      const cur = typeof next[k] === "number"
        ? (next[k] as number)
        : (typeof decl.initial === "number" ? decl.initial : 0);
      next[k] = clampFlag(decl, cur + v);
    } else {
      next[k] = v;
    }
  }
  return next;
}
