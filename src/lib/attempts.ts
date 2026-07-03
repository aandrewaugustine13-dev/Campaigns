// ════════════════════════════════════════════════════════════════
// ATTEMPTS — client for the first persistence layer (Supabase).
//
// A campaign is a frozen, immutable cartridge; a student playthrough produces
// an ATTEMPT record that lives separately and points at it (campaign_id +
// campaign_version). ONE ROW per (student, campaign, version), upserted per
// attempt — `score` is the latest attempt's recorded score, `best_score` the
// best across attempts AFTER the attempt-2 cap. The quiz rules themselves
// (max 2 attempts, retake capped at 90, best-of) live in BranchingPlayer;
// this module only ships the numbers it is handed.
//
// IDENTITY: student_id is a browser-local minted uuid — the KEY. It becomes an
// email/Google id later without restructuring. student_name is a free-text
// label the kid types: DISPLAY ONLY, never used for matching.
//
// UNCONFIGURED = NO-OP: without VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY the
// module warns once and does nothing — play (and the local quiz lock) is never
// blocked by missing persistence.
// ════════════════════════════════════════════════════════════════
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { BranchingStory } from "../../generator/branchingStory";

export interface AttemptUpsert {
  studentId: string;
  /** Display label only — never matched on. */
  studentName: string;
  campaignId: string;
  campaignVersion: number;
  /** Which attempt this was (1 or 2). */
  attemptNumber: number;
  /** This attempt's RECORDED score (attempt-2 cap already applied by the player). */
  score: number;
  /** Best recorded score across the student's attempts so far. */
  bestScore: number;
}

export interface AttemptRow {
  student_name: string;
  campaign_id: string;
  campaign_version: number;
  score: number;
  attempt_number: number;
  best_score: number;
  created_at: string;
}

let warned = false;
function client(): SupabaseClient | null {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    if (!warned) {
      warned = true;
      console.warn("[attempts] Supabase not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) — attempts will not persist");
    }
    return null;
  }
  return createClient(url, key);
}

// ── local identity (until real auth lands) ────────────────────────
const STUDENT_ID_KEY = "campaigns-student-id";
const STUDENT_NAME_KEY = "campaigns-student-name";

function storage(): Storage | null {
  return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
}

/** The minted per-player id — the KEY for attempts. Stable per browser. */
export function getStudentId(): string {
  const s = storage();
  const existing = s?.getItem(STUDENT_ID_KEY);
  if (existing) return existing;
  const minted = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, "0").slice(-12)}`;
  try { s?.setItem(STUDENT_ID_KEY, minted); } catch { /* session-only id */ }
  return minted;
}

export function getStoredStudentName(): string {
  return storage()?.getItem(STUDENT_NAME_KEY) ?? "";
}
export function storeStudentName(name: string): void {
  try { storage()?.setItem(STUDENT_NAME_KEY, name); } catch { /* non-fatal */ }
}

// ── campaign identity (until the save/library layer mints real ids) ──
// Deterministic fingerprint uuid from the frozen cartridge, so the same story
// always lands under the same campaign_id without any host wiring. Replaced by
// a real persisted id (passed as a prop) when the library layer exists.
function fnv1a(s: string, seed: number): number {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function storyFingerprint(story: BranchingStory): string {
  const basis = `${story.title}|${story.start}|${story.passages.length}|${story.passages.map((p) => p.id).join(",")}`;
  const hex = [0, 1, 2, 3].map((seed) => fnv1a(basis, seed).toString(16).padStart(8, "0")).join("");
  // Shape the 128 hash bits into a syntactically valid uuid (version/variant nibbles pinned).
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// ── write path ────────────────────────────────────────────────────
/** Upsert the student's attempt row (keyed on student+campaign+version, NEVER
 *  on name). Fire-and-forget from the player: failures warn, never throw. */
export async function recordAttempt(a: AttemptUpsert): Promise<void> {
  if (a.attemptNumber < 1 || a.attemptNumber > 2) {
    console.warn(`[attempts] refusing attempt_number ${a.attemptNumber} (max 2 attempts)`);
    return;
  }
  const db = client();
  if (!db) return;
  const { error } = await db.from("attempts").upsert(
    {
      student_id: a.studentId,
      student_name: a.studentName,
      campaign_id: a.campaignId,
      campaign_version: a.campaignVersion,
      score: a.score,
      attempt_number: a.attemptNumber,
      best_score: a.bestScore,
    },
    { onConflict: "student_id,campaign_id,campaign_version" },
  );
  if (error) console.warn("[attempts] write failed:", error.message);
}

// ── read path (dead simple, for watching scores land) ─────────────
/** All attempts for a campaign — or, with no id, the most recent across all
 *  campaigns (handy for discovering fingerprint ids). */
export async function listAttempts(campaignId?: string): Promise<AttemptRow[]> {
  const db = client();
  if (!db) return [];
  let q = db
    .from("attempts")
    .select("student_name, campaign_id, campaign_version, score, attempt_number, best_score, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (campaignId) q = q.eq("campaign_id", campaignId);
  const { data, error } = await q;
  if (error) {
    console.warn("[attempts] read failed:", error.message);
    return [];
  }
  return (data ?? []) as AttemptRow[];
}
