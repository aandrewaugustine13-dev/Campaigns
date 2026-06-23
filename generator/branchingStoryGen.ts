// ════════════════════════════════════════════════════════════════
// BRANCHING-STORY GENERATOR — the callable module (foundation).
//
// Promotes the proof script's prompt into a real generateBranchingStory(inputs)
// that returns a VALIDATED BranchingStory. The craft prompt is REUSED VERBATIM
// (the one that produced Caleb / Tessa / Lottie) — not redesigned. The
// load-bearing part is robustness: every model output runs through validateStory
// (generator/branchingStory.ts), and a malformed graph (dangling next, loop trap,
// no reachable ending, missing start) triggers sighted re-generation, capped at
// N attempts. A broken story is NEVER returned — on exhaustion the result is a
// clear failure (ok:false), not a broken graph.
//
// SDK side only (the @anthropic-ai/sdk import). Mirrors storyPlanGen.ts.
// ════════════════════════════════════════════════════════════════
import Anthropic from "@anthropic-ai/sdk";
import { parseModelJson } from "./json.js";
import { validateStory, type BranchingStory, type StoryValidation } from "./branchingStory.js";
import { runFactGate, type FactGateResult } from "./factGate.js";

const MODEL = "claude-opus-4-8"; // the writer that produced the proven stories

// The EXACT craft prompt from the proof — reading level, person+history, real
// branching, exactly two earned endings, no game machinery. DO NOT redesign.
// Exported so the (throwaway) proof CLI shares this single source.
export const SYSTEM_PROMPT = `You are a gifted author writing an interactive, branching historical story — a choose-your-own-path adventure — to read on a tablet. The story's CONTENT MATURITY and PROSE REGISTER are specified per-story in the instructions below; obey them exactly. You output ONLY a single JSON object. No prose outside the JSON, no markdown, no code fences.

YOUR ONE JOB: write a STORY a kid cannot put down. Not a textbook. Not a summary. Not a list of facts or "beats." A real story with a real person, real feelings, and real stakes, told so simply and so vividly that a struggling reader keeps tapping "next" because they have to know what happens. The history is delivered THROUGH the story — never as a lecture.

VOICE (the AUDIENCE block in the instructions sets sentence style and how mature the content is — obey it):
- Second person, past tense: "You" are the character. Pull the reader inside the moment.
- Active voice. Concrete things you can see, hear, smell, and feel. Show what happens; do not summarize or lecture.
- CONTENT MATURITY and PROSE REGISTER are SEPARATE and INDEPENDENT. CONTENT MATURITY controls honesty about fear/violence/death/moral complexity (mature=fully honest; moderate=balanced with some softening; gentle=softer portrayal). PROSE REGISTER controls language style independently (direct=short concrete sentences; balanced=mix of lengths and description; literary=richer vocab and varied sentences). Never soften the history to match plain language, and never ornament the language to match mature content. Obey the exact values passed in the AUDIENCE block.

THE PERSON AND THE HISTORY:
- Invent ONE ordinary young person who is a PARTICIPANT in this history — not a famous leader, but someone with a ROLE that positions them where the real, documented events are proximate and visible: a militiaman, a powder boy, a message runner, a mill worker, a marcher, a nurse's helper. NOT a bystander hearing about events secondhand. Their role must put real, nameable events, places, and things directly into the scenes they live. Give them a name, a home, and that role, fast, in the first passage.
- Ground everything in the REAL history of the topic: real events, real conditions, real choices people faced. Do not invent fake history. Weave the real, testable facts of the topic INTO the scenes so a reader learns them by living them.
- NOUN-DENSE: in EVERY passage, name real, findable history — real places, events, dates, objects, and figures, the way a museum label would. This keeps the world concrete AND gives the image search something true to find. Avoid vague interiority with no nameable anchor.
- Let the reader FEEL the meaning of this history through what happens to your character. NEVER state it as a lesson or a moral. Let them feel it.

BRANCHING — STANCE, not route:
- This is a tree of passages. Each passage is one real, noun-dense moment — 3 to 6 flowing sentences, a scene, not a headline.
- The historical ROUTE is largely FIXED: the event happened in an order, and you honor that order — the spine of the story is mostly linear, one real phase after the next. What BRANCHES is the character's STANCE (what they do, refuse, risk, or feel at a hard moment) and the COST it carries — NOT the history itself. Never write counterfactuals; the war/fire/march still happens either way.
- A FEW LOAD-BEARING choices (about three) fall at the hardest moments. Each offers stances that lean toward different terminal states (broken / indifferent / triumphant). These choices MAY CONVERGE back to the same next scene — that is NOT a fake choice, because what diverges is who the character is becoming. The prose right after a load-bearing choice must honor the lean just taken and carry it forward.
- The FINAL load-bearing choice, at the climax, forks to the THREE different endings. Smaller "texture" choices elsewhere are allowed but must converge back to the spine. Never write a choice that changes NEITHER the scene NOR the character's stance.
- THE PROTAGONIST ALWAYS SURVIVES TO THE AFTERMATH. Death, peril, and horror happen AROUND them — to others nearby, threatening them — but your character lives to reach an ending and carry what happened. DEATH IS NEVER AN ENDING. A choice may cost them dearly; it must not kill them.
- Every ending is ONE of exactly THREE terminal states — each a SURVIVAL AT A COST, each EARNED by the path taken, true to the history, a quiet emotional close (never a "GAME OVER," never a moral spelled out). Make all three reachable across the branches, and TAG each ending passage with its state ("endingState"):
  - "triumphant": they come through changed but whole — the cost was real, but they hold onto something worth holding.
  - "indifferent": they survive by keeping their head down and coasting — they pass through without it costing them, or teaching them, much.
  - "broken": they survive, but pay a heavy price — something in them or their world is lost for good.

SHAPE AND SIZE:
- The story's SCOPE is set in the instructions below ("span" or "depth") — it governs the length and the shape; follow it. Either way, every passage must earn its place: TRIM anything that does not carry the story or the feeling. Never pad, never repeat, never stall.
- NO game machinery of any kind: no numbers, no health, no scores, no day counts, no inventory, no stats. Only story and choices.

GUMP INTENSITY AND FIGURE ENCOUNTERS + SAGE-STYLE QUESTIONS (HIGHEST PRIORITY WHEN HIGH — READ THIS FIRST AND PLAN AROUND IT):

This is the most important rule for GUMP=HIGH. Follow exactly. Do NOT treat questions as optional add-ons.

PRE-PLANNING STEP (do this in your mind before writing the story):
- Identify 5–7 MOST IMPORTANT historical figures and turning-point moments for the topic (the ones a student MUST understand).
- These will be your "sage moments".
- Structure the story's MAIN SPINE (the mostly-linear path the protagonist follows across the arc) so that these key sage moments are ENCOUNTERED ON THE SPINE, with branches for stance/choice that CONVERGE BACK to the spine before or after each key moment. This guarantees reliable content coverage — no matter which choices the player makes at load-bearing points, they will hit the core historical material via the sage questions.
- Do not hide key content only on obscure branches.

FOR EACH SAGE MOMENT (when GUMP=HIGH):
- Create a distinct "sage question moment" passage for the major figure or turning point.
- The passage text should feel like a special encounter: the protagonist comes face-to-face with the real figure or is present at the exact turning point. Write it in a way that gives the moment weight — the figure "speaks to the moment" or the event "poses the question to history". Make it feel like the original sage encounters: educational, coming from the historical context/figure, not just a random trivia.
- EVERY such sage passage MUST contain EXACTLY ONE high-quality MCQ question.
- The question tests REAL, meaningful historical understanding of THAT specific figure or moment (not generic).
- Question format EXACT:
  "question": {
    "question": "clear specific question about the figure's role/action/words/significance in this exact moment",
    "choices": ["the verifiably correct documented fact", "plausible distractor 1 (common mix-up)", "plausible distractor 2", "plausible distractor 3"],
    "correctIndex": 0,
    "explanation": "one sentence with the accurate historical fact"
  }
- 4 choices, one clearly correct, three good but wrong distractors.
- Sage question moments are distinct: the question is presented as part of a reflective/sage-like moment with the figure/event.
- Regular story passages NEVER get a question. Only these planned sage encounters do. Exactly one per major encounter.

COVERAGE RULE:
- The key sage questions must cover the most important material for the topic/standard.
- Because of spine + convergence, players on different paths will still encounter most or all core sage questions.

FINAL QUIZ / EXAM:
- At the end of the story (before or leading into the three endings), include logic for a final assessment.
- In the JSON, also output at the top level:
  "coreSageQuestions": [ array of the 5-7 planned ones, each with passageId, figure, moment, and the full question object ]
  "finalQuiz": {
    "title": "Final Exam: What You Learned on the Journey",
    "instructions": "Review the key moments and questions from the historical figures you encountered. Then answer these questions to check your understanding.",
    "questions": [ the list of core questions, optionally with "context" summary of the moment ]
  }
- The final quiz pulls directly from the sage-style questions the player would have encountered.
- Make sure the story gives a sense of review opportunity before the assessment (e.g. a passage that reflects on the journey and the figures met).

This replicates the original sage + final exam: distinct educational moments with figures, reliable coverage of core history via questions, and a culminating quiz for understanding.

OUTPUT SHAPE (TypeScript for reference — output JSON only):
interface Choice { text: string; next: string; }   // next = the id of the passage this choice leads to
interface Passage { id: string; text: string; choices?: Choice[]; ending?: boolean; endingState?: "broken" | "indifferent" | "triumphant"; question?: { question: string; choices: string[]; correctIndex: number; explanation: string }; }  // "question" ONLY on sage-style figure-encounter passages when GUMP HIGH; these are distinct moments
interface BranchingStory { 
  title: string; 
  protagonist: string; 
  start: string; 
  passages: Passage[]; 
  // When GUMP HIGH:
  coreSageQuestions?: Array<{ passageId: string; figure: string; moment: string; question: {question: string; choices: string[]; correctIndex: number; explanation: string} }>;
  finalQuiz?: { title: string; instructions: string; questions: Array<{question: string; choices: string[]; correctIndex: number; explanation: string; context?: string}> };
}

RULES: ids are short kebab-case and unique. "start" is the id of the first passage. EVERY choice's "next" must be the id of a real passage in the list. Every passage either has 2-3 choices OR ending:true (never both, never neither). EVERY ending passage has an "endingState" of "broken", "indifferent", or "triumphant" — never death; the protagonist always survives to the aftermath. All three states are reachable from start. No passage is unreachable from start. "question" appears ONLY on sage figure-encounter passages (GUMP HIGH). Include coreSageQuestions and finalQuiz at top level for reliable coverage and end assessment. Output ONLY the JSON object conforming to BranchingStory.`;

export interface BranchingInputs {
  /** What the story is about (authoritative). */
  topic: string;
  /** The curriculum standard (TEKS) the story must teach, woven in as story. */
  standard: string;
  /** Optional teacher free-text: plain-language content the story MUST cover.
   * Accepted now even though the authoring UI comes later. */
  mustCover?: string;
  /** AUDIENCE — two INDEPENDENT dials, threaded from the gate (like topic/standard).
   * Do not collapse them. */
  /** How honestly to depict fear, violence, death, moral complexity.
   * "mature" = fully honest/unsanitized; "moderate" = balanced with some softening; "gentle" = softer portrayal.
   * Defaults to "mature". */
  contentMaturity?: string;
  /** Prose style constraint (independent of maturity).
   * "direct" = short declarative, concrete words; "balanced" = mix of lengths/variety; "literary" = richer vocab, descriptive flow.
   * Defaults to "direct". */
  proseRegister?: string;
  /** SCOPE dial (the "Gump toggle"), threaded from the gate like maturity/register.
   * "span"  = participant carried across the WHOLE arc — multiple phases, places,
   *           elapsed time (events with a journey: wars, movements, migrations).
   * "depth" = branching density within ONE compressed moment (a fire, a single day).
   * The teacher picks per topic. Defaults to "span". */
  scope?: "span" | "depth";
  /** GUMP INTENSITY dial — engineer improbable encounters with the topic's REAL
   * marquee figures and turning points (the "Forrest Gump" device), threaded from
   * the gate like the other dials. "high" = engineer collisions; "off" = no forced
   * encounters. NOT hardcoded on — the topic decides: a celebrity-rich war or
   * movement wants "high"; a cast-poor/compressed event (a single factory fire)
   * wants "off", or the device manufactures forced, fabrication-prone encounters.
   * Defaults to "off". */
  gumpIntensity?: "high" | "off";
}

export interface BranchingGenResult {
  /** True only when a VALIDATED, playable story is present. */
  ok: boolean;
  /** Present iff ok — guaranteed to pass validateStory (no broken graph ever returned). */
  story?: BranchingStory;
  /** The final attempt's validation (errors explain an ok:false). */
  validation: StoryValidation;
  attempts: number;
  /** The last raw model output (for inspection on failure). */
  raw: string;
  /** The history fact-check result for the returned story (absent if the fact
   * gate was disabled or no story was produced). status "clean" means it shipped
   * with no uncorrected fabrications. */
  factGate?: FactGateResult;
}

function buildUserMessage(inputs: BranchingInputs, priorErrors?: string[], priorFactErrors?: string[]): string {
  const mustCover = inputs.mustCover && inputs.mustCover.trim()
    ? `\nMUST COVER (the teacher's required content — weave these naturally into the story, never as a list): ${inputs.mustCover.trim()}`
    : "";

  // AUDIENCE — two INDEPENDENT dials, threaded like topic/standard. The semantics
  // are fixed (what "mature"/"direct" demand); only the dial VALUES come from the gate.
  const maturity = (inputs.contentMaturity && inputs.contentMaturity.trim()) || "mature";
  const register = (inputs.proseRegister && inputs.proseRegister.trim()) || "direct";

  let maturityBlock = "";
  if (maturity === "gentle") {
    maturityBlock = `CONTENT MATURITY (gentle): depict the historical fear, violence, death, and moral complexity with sensitivity and some softening. Focus on emotional impact and consequences rather than graphic details. The protagonist and young readers should not be overwhelmed; imply hardship and danger without explicit gore or horror. The protagonist survives to reflect on the aftermath.`;
  } else if (maturity === "moderate") {
    maturityBlock = `CONTENT MATURITY (moderate): depict the historical fear, violence, death, and moral complexity honestly but with balance. Show the realities of the time without gratuitous detail — include the emotional weight and consequences for those around the protagonist. Avoid excessive graphic descriptions while not sanitizing the truth. The protagonist survives.`;
  } else {
    maturityBlock = `CONTENT MATURITY (mature): depict the historical fear, violence, death, and moral complexity of this topic HONESTLY — do NOT sanitize it. The reader can handle hard truth told plainly. Death and horror happen AROUND the protagonist — to others, near them, threatening them — and you must not look away from it or soften it into comfort. But the protagonist THEMSELVES survives to the aftermath; their death is never an ending. Do not add gratuitous gore.`;
  }

  let registerBlock = "";
  if (register === "literary") {
    registerBlock = `PROSE REGISTER (literary) — a HARD constraint: richer vocabulary, more varied and flowing sentence structures, descriptive language that evokes atmosphere and emotion. Longer, more complex sentences are allowed for depth and immersion. Still grounded in the historical era, but with a more polished, narrative literary quality while remaining accessible.`;
  } else if (register === "balanced") {
    registerBlock = `PROSE REGISTER (balanced) — a HARD constraint: mix of sentence lengths for natural flow — some short and direct, others with more description and variety. Clear, concrete vocabulary with some evocative words. Avoid both overly simplistic and overly ornate styles.`;
  } else {
    registerBlock = `PROSE REGISTER (direct) — a HARD constraint, not a tone: short, declarative sentences; common, concrete words; sensory and specific, never abstract; minimal idiom; no metaphor-stacking; no flowery or literary flourish. Spare and visceral, not ornate. This register serves a reading-support and emergent-bilingual audience — accessibility comes from CONCRETENESS, never from softened or simplified subject matter. Maturity stays high; only the language is plain.`;
  }

  const audience = `
${maturityBlock}
${registerBlock}`;

  // SCOPE — the "Gump toggle", threaded like the audience dials. Default span.
  const scope = inputs.scope === "depth" ? "depth" : "span";
  const scopeBlock = scope === "span"
    ? `
SCOPE — SPAN (carry the participant across the WHOLE arc): follow the event through its real phases, places, and the passage of time — from the start through to the aftermath, NOT one day or one battle. Build a mostly-linear, noun-dense SPINE of those real phases in order. Place about THREE LOAD-BEARING stance choices at the hardest moments: the early ones converge back to the spine (the lean is carried in the prose), and the FINAL one forks to the three tagged endings. The three endings differ by what the character CARRIED HOME, not by whether they lived. Aim for roughly 18 to 26 passages so the arc has room to breathe.`
    : `
SCOPE — DEPTH (compress to ONE intense moment): a single place and a short span of time (a fire, a day, an hour). Branch DENSELY within that window — many real forks of stance and fate inside the same compressed moment — converging to the three tagged endings. Aim for a tighter, deeper tree (roughly 15 to 25 passages) where the branching, not elapsed time, carries the story.`;

  // GUMP INTENSITY — the improbable-encounter device, threaded like the other
  // dials. Default OFF (no forced encounters) — the topic decides at the gate.
  const gump = inputs.gumpIntensity === "high" ? "high" : "off";
  const gumpBlock = gump === "high"
    ? `
GUMP INTENSITY — HIGH (MANDATORY — PLAN FIRST, EXECUTE FULLY):

You must follow the GUMP HIGH rules from the system prompt exactly:
- Pre-plan the 5-7 key figures/turning points that will receive sage-style questions.
- Put them on the main story spine with converging branches so coverage is reliable across paths.
- For each, create a distinct sage-style question moment passage (feels like meeting the figure or the moment posing the question, educational weight like a sage encounter).
- Attach EXACTLY ONE question per such passage in the exact format.
- At the end of the JSON include "coreSageQuestions" and "finalQuiz" as specified in the system prompt (use the planned questions).
- Never put questions on non-sage passages.
- Make the questions substantive, tied to real history of that specific encounter.`

    : "";

  const base = `Write the complete branching story now for THIS topic.

TOPIC (what the story is about): ${inputs.topic}
STANDARD (the curriculum standard it must teach, delivered AS story, never lectured): ${inputs.standard}${mustCover}
${audience}
${scopeBlock}${gumpBlock}

Begin at "start" by placing the character fast — their name, home, and their ROLE in these events — then the moment the history reaches them. Real feeling, real choices that change what happens next. The protagonist SURVIVES to the aftermath — death happens around them, never to them; every ending is a survival at a cost tagged "broken", "indifferent", or "triumphant", and all three are reachable across the branches. Obey the CONTENT MATURITY and PROSE REGISTER above. Output ONLY the JSON object conforming to BranchingStory.`;

  const blocks: string[] = [];
  // Sighted re-generation (graph): the prior output was an UNPLAYABLE graph.
  if (priorErrors && priorErrors.length > 0) {
    blocks.push(`YOUR PREVIOUS ATTEMPT PRODUCED AN UNPLAYABLE STORY GRAPH — these problems would crash the player or strand a reader. Write the whole story again and make ABSOLUTELY SURE: the "start" id is a real passage; EVERY choice's "next" is the id of a real passage; from EVERY passage a reader can always reach an ending (no loops with no exit); every ending passage is tagged "broken", "indifferent", or "triumphant", and all three are reachable. Problems found:
${priorErrors.map((e) => `- ${e}`).join("\n")}`);
  }
  // Sighted re-generation (history): the prior output stated false/invented facts.
  if (priorFactErrors && priorFactErrors.length > 0) {
    blocks.push(`YOUR PREVIOUS ATTEMPT CONTAINED HISTORICAL ERRORS — false or invented facts. A kids' history tool must never teach a wrong fact. Write the whole story again and keep EVERY historical detail (dates, numbers, named real people, places, events, causes) accurate; weave the corrected facts in naturally. Errors found:
${priorFactErrors.map((e) => `- ${e}`).join("\n")}`);
  }
  if (blocks.length === 0) return base;
  return `${base}\n\n${blocks.join("\n\n")}`;
}

export async function generateBranchingStory(
  inputs: BranchingInputs,
  apiKey: string,
  opts: { maxAttempts?: number; factGate?: boolean } = {},
): Promise<BranchingGenResult> {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
  const useFactGate = opts.factGate !== false; // default ON
  const client = new Anthropic({ apiKey, timeout: 10 * 60_000, maxRetries: 1 });

  let last: BranchingGenResult = {
    ok: false,
    validation: { findings: [{ level: "error", code: "root", message: "no attempt completed" }], playable: false },
    attempts: 0,
    raw: "",
  };
  let priorErrors: string[] = [];
  let priorFactErrors: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(inputs, attempt > 1 ? priorErrors : undefined, attempt > 1 ? priorFactErrors : undefined) }],
    });
    let raw = "";
    stream.on("text", (t) => { raw += t; });
    await stream.finalMessage();

    // Parse failure is just another invalid attempt — feed it back and retry.
    let parsed: unknown;
    try {
      parsed = parseModelJson<BranchingStory>(raw);
    } catch {
      const validation: StoryValidation = {
        findings: [{ level: "error", code: "root", message: "model output did not parse as JSON" }],
        playable: false,
      };
      last = { ok: false, validation, attempts: attempt, raw };
      priorErrors = ["the output did not parse as JSON — return ONLY the single JSON object, nothing else"];
      console.warn(`[branching] attempt ${attempt}/${maxAttempts}: parse failed — retrying`);
      continue;
    }

    const validation = validateStory(parsed);
    if (validation.playable) {
      const story = parsed as BranchingStory;

      // === SAGE QUESTIONS + FINAL QUIZ LOGIC (for gump high) ===
      // Collect all sage-style questions from passages. This ensures the final quiz
      // can be presented from encountered (or all core) questions, replicating original
      // sage + final exam flow. The prompt already instructed the model to plan coverage.
      if (inputs.gumpIntensity === "high") {
        const encounteredQuestions: Array<BranchingQuestion & { fromPassageId: string }> = [];
        const coreSage: any[] = [];
        for (const p of story.passages) {
          if (p.question) {
            const q = { ...p.question, fromPassageId: p.id };
            encounteredQuestions.push(q);
            // try to infer figure/moment from nearby text or id (model should have provided in core too)
            // Infer figure from context or passage; model is instructed to make encounters clear
            const figMatch = p.text.match(/ (Paul Revere|George Washington|Thomas Jefferson|Lafayette|King|Revere|Washington|Jefferson) /i);
            const figure = figMatch ? figMatch[1] : "the figure in this moment";
            coreSage.push({
              passageId: p.id,
              figure,
              moment: p.text.substring(0, 160).replace(/\s+/g, " ") + "...",
              question: p.question
            });
          }
        }
        if (encounteredQuestions.length > 0) {
          if (!story.coreSageQuestions || story.coreSageQuestions.length === 0) {
            story.coreSageQuestions = coreSage;
          }
          if (!story.finalQuiz) {
            story.finalQuiz = {
              title: "Final Exam — Lessons from the Journey",
              instructions: "You have walked alongside these historical figures and witnessed the turning points. Review the key questions from your encounters. Then take this quiz to check your understanding of the real history.",
              questions: encounteredQuestions.map(q => ({
                ...q,
                context: `From the moment at passage ${q.fromPassageId}`
              }))
            };
          }
        }
      }

      // The graph is playable — now the HISTORY must hold up. A kids' history
      // tool must never teach a fabricated date, number, person, or event, so we
      // fact-check the prose with the project's factGate (detect → correct in
      // place → re-verify). Only a CLEAN result ships; uncorrected fabrications
      // trigger a re-generation, exactly like a broken graph does.
      if (!useFactGate) {
        return { ok: true, story, validation, attempts: attempt, raw };
      }
      const gate = await runStoryFactGate(story, inputs.topic, apiKey);
      if (gate.status === "clean") {
        return { ok: true, story, validation, attempts: attempt, raw, factGate: gate };
      }
      if (gate.status === "gate-error") {
        // The CHECK itself failed (API/parse), NOT a detected fabrication — don't
        // loop on infrastructure. Ship, but never silently: attach a warning.
        const warned: StoryValidation = {
          ...validation,
          findings: [...validation.findings, { level: "warn", code: "fact-gate", message: "history could not be fact-checked (gate error) — shipping unverified" }],
        };
        return { ok: true, story, validation: warned, attempts: attempt, raw, factGate: gate };
      }
      // Residual fabrications the gate could not fully correct: a failed attempt.
      // Feed the exact historical errors back and re-generate.
      last = { ok: false, validation, attempts: attempt, raw, factGate: gate };
      priorErrors = [];
      priorFactErrors = gate.residual.map((c) => `"${c.quote}" — ${c.why} (correct: ${c.correct})`);
      console.warn(`[branching] attempt ${attempt}/${maxAttempts}: ${gate.residual.length} uncorrected historical error(s) — re-generating`);
      continue;
    }

    // Unplayable: record, feed the exact errors back, try again.
    last = { ok: false, validation, attempts: attempt, raw };
    priorErrors = validation.findings.filter((f) => f.level === "error").map((f) => `[${f.code}] ${f.message}`);
    priorFactErrors = [];
    console.warn(`[branching] attempt ${attempt}/${maxAttempts}: ${priorErrors.length} validation error(s) — re-generating:`);
    for (const e of priorErrors) console.warn(`[branching]    ✗ ${e}`);
  }

  // Exhausted: return the failure (ok:false). NEVER a broken story.
  return last;
}

// Fact-check a story's PROSE by reusing the project's factGate (generator/
// factGate.ts) — no second fact-checking engine. factGate reads a CampaignData-
// shaped dossier (title + events[].text + choice text); we hand it the passages
// AS the events array by REFERENCE, so the gate's in-place string corrections
// land directly on the real passages' .text (and choice text). The post-
// correction structural re-check is the branching graph validator, not the
// CampaignData one (string surgery can't move ids, but we verify regardless).
async function runStoryFactGate(story: BranchingStory, topic: string, apiKey: string): Promise<FactGateResult> {
  // Figure-encounter MCQs are fed as eventTrivia so factGate checks them at its
  // KEYED-ANSWER tier (the strictest: a fabricated keyed answer hard-rejects →
  // re-generates) — a kid must never be graded on a fabrication. The `choices`
  // arrays are shared by reference, so string-replace corrections land on the
  // real question; a residual keyed fabrication forces re-gen (the safe way).
  const eventTrivia = story.passages
    .filter((p) => p.question)
    .map((p) => ({ id: p.id, ...p.question! }));
  const dossier: { title: string; subtitle: string; events: BranchingStory["passages"]; eventTrivia: typeof eventTrivia } = {
    title: story.title,
    subtitle: story.protagonist ?? "",
    events: story.passages, // shared references — corrections mutate the real passages
    eventTrivia,            // figure-encounter MCQs — seen + keyed-checked by factGate
  };
  const gate = await runFactGate(apiKey, dossier, topic, {
    validateStructure: () => ({ failed: validateStory(story).playable ? 0 : 1 }),
  });
  // Passages were mutated in place; copy back the by-value top-level strings.
  story.title = dossier.title;
  if (dossier.subtitle) story.protagonist = dossier.subtitle;
  return gate;
}
