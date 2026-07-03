-- ════════════════════════════════════════════════════════════════
-- ATTEMPTS — the first persistence layer. A student playthrough produces an
-- ATTEMPT record that lives SEPARATELY from the campaign and points at it.
--
-- Shape decisions (the foundation the save/library/publish layers build on):
--   • ONE ROW per (student, campaign, version), UPSERTED per attempt:
--     `score` is the latest attempt's recorded score, `attempt_number` how many
--     attempts are used (1 or 2), `best_score` the best across attempts AFTER
--     the attempt-2 cap. The quiz rules (max 2 attempts, retake capped at 90,
--     best-of) are enforced in the player; the CHECKs here are the backstop.
--   • student_id is the KEY, minted per player for now (a browser-local uuid).
--     It becomes an email/Google id later WITHOUT restructuring — nothing
--     matches on the name. student_name is a free-text label the kid types:
--     DISPLAY ONLY, never used for matching or logic.
--   • campaign_id is a bare uuid — NOT a foreign key yet, because campaigns
--     themselves aren't persisted (that's the save/library layer, deferred).
--     Until a host passes a real id, the player derives a deterministic
--     fingerprint uuid from the frozen cartridge. Add the FK when the
--     campaigns table lands.
--   • campaign_version stamps WHICH published version was played, so scores
--     survive campaign edits: an edit bumps the version, old attempts keep
--     pointing at the version they were actually scored against.
-- ════════════════════════════════════════════════════════════════

create table if not exists public.attempts (
  attempt_id       uuid primary key default gen_random_uuid(),
  student_id       uuid not null,
  student_name     text not null default '',
  campaign_id      uuid not null,
  campaign_version int  not null default 1,
  score            int  not null check (score between 0 and 100),
  attempt_number   int  not null check (attempt_number in (1, 2)),
  best_score       int  not null check (best_score between 0 and 100),
  created_at       timestamptz not null default now(),

  -- One row per student per campaign-version; the write path upserts on this.
  unique (student_id, campaign_id, campaign_version)
);

-- The read path: "given a campaign, list its attempts."
create index if not exists attempts_campaign_idx
  on public.attempts (campaign_id, campaign_version);

-- PROTOTYPE access: the player writes with the anon key (no auth layer yet),
-- so RLS is enabled with permissive policies. TIGHTEN THESE when auth lands —
-- students should only ever touch their own row.
alter table public.attempts enable row level security;

create policy "attempts_anon_insert" on public.attempts
  for insert to anon with check (true);
create policy "attempts_anon_update" on public.attempts
  for update to anon using (true) with check (true);
create policy "attempts_anon_select" on public.attempts
  for select to anon using (true);
