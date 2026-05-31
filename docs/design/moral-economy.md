# Design Note: The Moral Economy (character-mode town stops)

**Status: CAPTURED, NOT SCHEDULED.** Do not build during the current polish pass or
before the networking events. This is the marquee character-mode feature to build
_after_ the character experience is clean and demo-ready. Written down so the design
isn't lost.

## The idea

Character-mode town stops become recurring **moral weigh stations**, not shops. At each
stop the player faces a small money-vs-conscience choice with no clean answer, e.g.:
"You have $20. Buy provisions for your family, or give a fellow traveler $2 so he can
feed his." Over the journey these choices **compound**, and at the end the family (or
the relevant people) regard the player differently — good or bad — based on the
accumulated weight. It's the Crusade's accumulating moral arc, generalized.

## Why it's bigger than "town stops"

It is actually **three mechanics in tension**:

1. A **scarce, depleting resource** — money. Finite. You cannot help everyone. Spending
   to do good costs your family.
2. An **accumulating moral-weight flag** — goes up/down with each choice, carries a
   running tally. NOTE: this is a **new flag type**. The current flag schema is
   boolean/tristate only; "numeric/counter flags" were explicitly **deferred** in the
   original flag-data-shape design. This feature requires extending the schema to a
   graded/numeric flag.
3. A **reveal** that reads accumulated moral weight into how the player is regarded —
   the Crusade's `computeHomecomingTier` pattern, applied to family/community regard.

The **design tension is the point**: money depletes, moral weight accumulates, and they
pull against each other. That opposition is what makes each stop a genuine
no-clean-answer dilemma (same bar as the central fault line: no scorekeeping, no
"correct" choice).

## The pieces this needs (rough)

- **Schema:** a numeric/graded flag type (accumulating moral weight) — currently
  unsupported; deferred in the original flag design.
- A character-appropriate **scarce resource** (money) that depletes — distinct from the
  systems resource meters.
- **Engine:** character-mode town stops that present a money-vs-morality choice and
  write to BOTH the resource (deplete) and the moral-weight flag (accumulate). (We
  already GATED the systems shop out of character town stops — that cleared the ground;
  this fills it.)
- **Reveal:** a closing beat that reads accumulated moral weight → how the
  family/people regard you (tiered, like `computeHomecomingTier`). Overlaps with the
  separately-noted "homecoming reveal" character feature — likely the SAME reveal
  system reading this flag.

## The open question that must be decided before building

**Where do the town-stop choices come from?** Three options, decide deliberately:

- **Generator** produces them per topic (most powerful, most scalable, biggest build —
  "recurring small fault lines," with the same validation discipline as `faultline.ts`).
- **Derived** from the central fault-line flag (smaller, reuses machinery, but stops all
  relate to the one central choice rather than being independent moments).
- A hand-authored **library** of generic money-vs-conscience dilemmas, topic-flavored
  lightly (fastest, most generic, least bespoke).

## Relationship to existing work

- The `isCharacterMode` town-stop gate (already shipped) cleared the systems shop out —
  this feature is what fills that now-empty pause point.
- The fault-line flag system (shipped) is the boolean precursor; this needs the
  accumulating/numeric extension.
- The "homecoming reveal" character feature (noted separately) is likely the same
  reveal mechanism reading this moral-weight flag — design them together.

## When to build

After: the current polish pass is done, the character experience is clean, and the
demo is locked for the networking events. This is the next **major** feature, not a
polish item. It deserves real design time on the content-source question above.
