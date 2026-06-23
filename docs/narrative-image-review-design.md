# Part 2 — Human-in-the-loop image approval (DESIGN ONLY)

Status: design for review. No build. Follows the image-pipeline structural fix
(Part 1, commit 2d3e40d).

## Why query fixes alone can't close it

Part 1 gave the spine beats real, dated queries + an era guard, and it works: the
1812 spine now resolves distinct period engravings/paintings instead of repeating
the backdrop. But two residuals from that very run prove the ceiling:

- **PIN 4 "Treaty of Ghent signing 1814" → (no hit)** → falls back to the backdrop.
  The corpus may simply not contain a good depiction; a perfect query can't conjure one.
- **PIN 1 "Henry Clay portrait 1810" → `Cassius_Marcellus_Clay.jpg`** — the *wrong Clay*.
  Right era (the era guard correctly passed it), wrong *subject*. No string check and
  no era guard can catch a subject mismatch; only something that can SEE the image can.

These events also **predate photography**, so even a flawless query can return a
wrong-era or wrong-subject file. The durable answer is a human (and optionally a
vision model) in the loop — folded into the teacher review surface that already
exists for beats.

## Reuse the proven beat-review pattern

The plan-review surface is already exactly the right shape (`src/StoryPlanReview.tsx`
+ pure `src/storyPlanReview.ts`): list items, a per-item teacher action, a pure
state module that returns a NEW plan (never mutates), `reviewStatus()` gating, and a
Confirm. Image approval is the **same move, one axis over**: instead of include/exclude
a beat, approve/swap/reject its image.

### 1. The surface — candidate strip per beat

For each beat (pinned event), show the currently-chosen image plus a horizontal
strip of ranked **alternates**, with three teacher actions mirroring the checkbox:

```
▸ PIN 1  The Warhawks Speak        query: "Henry Clay portrait 1810"
   ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
   │ chosen ✓│  │  alt 1  │  │  alt 2  │  │ ✕ none  │   ← reject → imageless (backdrop)
   │ C.M.Clay│  │ H.Clay  │  │ Congress│  │         │
   └─────────┘  └─────────┘  └─────────┘  └─────────┘
   [Approve]      ↑ click an alternate to SWAP        [Reject → backdrop]
```

- **Approve**: keep the chosen image (the default; no action needed).
- **Swap**: click an alternate → it becomes `event.image`.
- **Reject**: mark imageless → the beat falls back to the backdrop (honest "no good
  image" beats a wrong one). Optionally a "re-query" field to fetch fresh candidates.

Same ergonomics as unchecking a beat: glance, judge, one click.

### 2. Where it sits + the data flow

The critical sequencing fact: **beat-review is PRE-generation (it edits the plan);
images don't exist until generation runs.** So image-review is a **distinct,
POST-generation checkpoint** on the produced `CampaignData` — not the same step as
the beat checklist, but the same pattern and ideally the next screen in the studio
(`Stage1Studio.tsx`): plan-review → generate → **image-review** → publish.

- **Candidates fetched when:** at generation time, for free. `searchCommonsFileRanked`
  already returns a *ranked, era-guarded list*; today `enrichEventImages` keeps only
  the best. Change it to retain the top-K (≈4) per beat.
- **Stored where:** a new additive field on the event, `imageCandidates?: CommonsImage[]`
  (the era-guarded ranked pool). `event.image` stays the default pick (candidate 0).
  Absent ⇒ no review strip (byte-identical for anything not generating candidates).
- **Written back how:** a pure module `imageReview.ts` mirroring `storyPlanReview.ts`:
  `setEventImage(data, beatId, candidateIndex | null) → new CampaignData` (never
  mutates). Reject = `null` → drop `event.image`. A `reviewStatus`-style summary
  ("3 of 5 beats have an approved image; 1 rejected → backdrop").
- **Relative to existing logic:** orthogonal to `included`/`reviewStatus` (those gate
  the arc pre-gen). Image-review never changes beats, only their `image`. It reuses
  the studio's step scaffolding and the Confirm→publish flow.

This keeps generation deterministic (candidates are authored once, no live fetch in
the UI) and the review pure and testable (state transitions, not pixels).

### 3. Optional: the VISION-GRADER — the only "test" that can see an image

A multimodal model that LOOKS at a resolved image alongside the beat context (title,
scene, year, subject) and judges **era fit** and **subject fit** — catching exactly
what strings can't: the wrong-Clay, a reenactment photo, a cowboy in 1812. Two roles:

- **Pre-filter (generation time):** judge the top-K candidates per beat, drop the
  ones that fail era/subject, and re-rank so the teacher's strip leads with verified
  images (and `event.image` defaults to a *seen-correct* one). This means the cowboy
  is caught by the harness, not just the teacher's eye — the human becomes a fast
  confirm, not the first line of defense.
- **Eval dimension `image-fit` (post-hoc):** the scorekeeper that can finally SEE the
  shipped images — judges each `event.image` against its beat and reports era/subject
  mismatches across topics. This is the dimension the whole "agent is blind to images"
  problem has been missing; it slots beside `ending-recites-choices`/`narrative-coherence`
  as a Tier-2 (model-graded) check, but multimodal.

**Honest cost:** this is the most expensive check in the system. It needs the image
BYTES (fetch each candidate thumb) + a multimodal call per image. Pre-filtering top-4
candidates across ~5 beats ≈ 20 vision calls per campaign — real money and latency,
paid at generation time. Mitigations: judge only the top-K (not the full pool), cache
by thumbUrl, and make it opt-in (a `--vision` flag) so the cheap string+era pipeline
stays the default and vision is the quality tier. **Worth it?** Yes for the pre-filter
— it's the only thing that closes the subject-mismatch gap the era guard structurally
can't — but stage it last, behind a flag, after the human surface proves the data flow.

## Reuse vs. build

**Reuses:** the `storyPlanReview` pattern (pure state + React surface + Confirm), the
ranked era-guarded output of `searchCommonsFileRanked` (already produces candidates),
the era guard, the `CommonsImage` schema, the `Stage1Studio` step scaffolding, and
the eval-harness dimension framework.

**Builds new:** `imageCandidates` storage (+ retain top-K in enrich), the pure
`imageReview.ts` (`setEventImage`/reject/status), the post-gen image-review surface,
and — for the vision tier — the multimodal grader + the `image-fit` dimension.

## Staged build plan (each isolated; images judged by human/vision, not unit tests)

1. **Candidates at generation (data only).** Retain top-K era-guarded candidates per
   beat in `event.imageCandidates`; default `event.image` = candidate 0. *Test:*
   candidates present, era-guarded, deduped; default still chosen. No UI.
2. **Pure image-review state.** `imageReview.ts`: `setEventImage`/reject/status,
   never-mutates. *Test:* swap writes the right candidate; reject drops the image;
   status counts. Deterministic.
3. **The review surface (post-gen).** The candidate-strip screen in the studio,
   wired after generation, before publish. Manual judgment (the human is the loop).
4. **Vision-grader (last, behind a flag).** Pre-filter at generation + the `image-fit`
   eval dimension. *Test:* the grader's PLUMBING (it runs, parses, re-ranks) on a
   planted pass/fail — but the visual judgment is the grader's job, not a unit test's.

Each commit separate. UI (step 3) gated on the manual-review pattern already in use;
vision (step 4) gated on its own cost review.
