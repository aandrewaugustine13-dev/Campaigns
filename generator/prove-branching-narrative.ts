#!/usr/bin/env npx tsx
// ════════════════════════════════════════════════════════════════
// CONTENT BET PROOF — one branching narrative, no engine, no UI.
//
// The pivot: instead of assembling pinned beats, the generator writes ONE
// continuous, branching STORY — flowing prose passages, 6th-grade reading level,
// real choices that change what the player reads next, TWO earned endings, length
// driven by the story. No day-counts, no resource bars. Just story + choices.
//
// This proves CONTENT only: generate one branching narrative as plain JSON,
// sanity-check that the branches connect, write it to a file, print the whole
// thing to READ. The SAME craft prompt across topics — only the story subject
// changes — so it doubles as a GENERALIZATION check: does it write this well when
// the topic doesn't hand it a tidy hero + battlefield arc?
//
// ONE generation per run.  Usage:  npm run prove:narrative [topicKey]
//   topicKey ∈ { 1812 (default), reconstruction, suffrage }
// ════════════════════════════════════════════════════════════════
import { config as loadEnv } from "dotenv";
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import { parseModelJson } from "./json.js";
import { validateStory, passageMap, type BranchingStory } from "./branchingStory.js";

const __root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: resolve(__root, ".env.local") });
const __dirname = dirname(fileURLToPath(import.meta.url));

const MODEL = "claude-opus-4-8"; // the most capable writer — prove the ceiling

// Craft rules are IDENTICAL across topics. Only "THE STORY" subject (the user
// message) changes — that is the whole point of the generalization check.
const SYSTEM_PROMPT = `You are a gifted children's author writing an interactive, branching historical story — a choose-your-own-path adventure — for 11-to-12-year-olds (6th grade) to read on a tablet. You output ONLY a single JSON object. No prose outside the JSON, no markdown, no code fences.

YOUR ONE JOB: write a STORY a kid cannot put down. Not a textbook. Not a summary. Not a list of facts or "beats." A real story with a real person, real feelings, and real stakes, told so simply and so vividly that a struggling reader keeps tapping "next" because they have to know what happens. The history is delivered THROUGH the story — never as a lecture.

READING LEVEL — 6TH GRADE, TABLET-READ (non-negotiable):
- Short, simple sentences. Most under 12 words. Vary the rhythm, but keep it easy.
- Plain, everyday words a 6th grader knows. If you must use a hard word, make its meaning clear from the scene.
- Active voice. Concrete things you can see, hear, smell, and feel. Almost no abstraction.
- Second person, past tense: "You" are the character. Pull the reader inside the moment.
- A struggling reader must read it easily AND want to keep going. If a sentence is hard to read aloud, rewrite it.

THE PERSON AND THE HISTORY:
- Invent ONE ordinary young person living through this history — not a famous leader, a regular kid or young person caught up in it. Give them a name and a home, fast, in the first passage.
- Ground everything in the REAL history of the topic: real events, real conditions, real choices people faced. Do not invent fake history. Weave the real, testable facts of the topic INTO the scenes so a reader learns them by living them.
- Let the reader FEEL the meaning of this history through what happens to your character. NEVER state it as a lesson or a moral. Let them feel it.

BRANCHING — the choices must MATTER:
- This is a tree of passages. Each passage is one moment of the story: 3 to 6 flowing sentences, a real scene, not a headline.
- At choice points, give 2 or 3 choices. Each choice leads to a DIFFERENT passage where something genuinely different happens next — a different path, a different scene, a different fate. A choice that just leads to the same place is a fake choice; do not write fake choices.
- Real forks with real consequences. Some paths can rejoin a shared thread later, but there must be true divergence. End on EXACTLY TWO different endings, each EARNED by the path taken — one is not simply "good" and the other "bad"; both are true to the history, and an honest choice can cost something.
- Endings land with weight: a quiet, real, emotional close — never a "GAME OVER," never a moral spelled out.

SHAPE AND SIZE:
- Aim for about 20 to 30 passages. Long enough to be a real story with real branches; short enough that every passage earns its place. TRIM anything that does not carry the story or the feeling. Never pad, never repeat, never stall.
- NO game machinery of any kind: no numbers, no health, no scores, no day counts, no inventory, no stats. Only story and choices.

OUTPUT SHAPE (TypeScript for reference — output JSON only):
interface Choice { text: string; next: string; }   // next = the id of the passage this choice leads to
interface Passage { id: string; text: string; choices?: Choice[]; ending?: boolean; }  // ending passages have ending:true and NO choices
interface BranchingStory { title: string; protagonist: string; start: string; passages: Passage[]; }

RULES: ids are short kebab-case and unique. "start" is the id of the first passage. EVERY choice's "next" must be the id of a real passage in the list. Every passage either has 2-3 choices OR ending:true (never both, never neither). Exactly TWO passages are endings. No passage is unreachable from start. Output ONLY the JSON object conforming to BranchingStory.`;

interface TopicSpec { key: string; label: string; brief: string }

const TOPICS: Record<string, TopicSpec> = {
  "1812": {
    key: "1812",
    label: "War of 1812 — an ordinary militiaman",
    brief: `TOPIC: the War of 1812, lived by ONE ordinary young American militiaman (a farm kid, not a general) who volunteers when the war begins.
Ground it in the REAL war as an ordinary soldier lived it: the rush to enlist, untrained volunteers, the boredom and sickness of camp, the failed miserable invasions toward Canada (and the militia who legally refused to cross the border), fear and chaos in a real fight, the British burning Washington, the rout at Bladensburg, the stand at Baltimore and the flag over Fort McHenry, and the strange bitter news that peace was signed at Ghent before the last big battle.
Let the reader feel the hard truth: on paper the war settled almost nothing, yet it made a shaky young country feel, for the first time, like a nation — felt through the character, never stated.`,
  },
  reconstruction: {
    key: "reconstruction",
    label: "Reconstruction — a freedman's first free year",
    brief: `TOPIC: Reconstruction after the Civil War, lived by ONE ordinary young person who was enslaved and is now FREE — their first year of freedom (1865-1866) in the American South. There is no battlefield and no tidy climax; the drama is the meaning and the danger of freedom itself.
Ground it in the REAL history: the day freedom comes and the strange weight of it; the search for family members sold away (the "Information Wanted" notices, walking for miles to find a mother, a wife, a child); the Freedmen's Bureau; learning to READ at last (reading was forbidden under slavery); signing a labor contract or sharecropping for a white landowner who may cheat you; the Black Codes that try to bind freedom back down; the threat of night riders and violence; the fragile hope of land, schooling, and one day the vote.
Let the reader feel the hard truth: freedom was real but poor, unsafe, and unfinished — a beginning, not an ending — felt through the character, never stated.`,
  },
  suffrage: {
    key: "suffrage",
    label: "Women's suffrage — a young woman in the movement",
    brief: `TOPIC: the fight for women's right to vote, lived by ONE ordinary young woman (a teenager, not a famous leader) who is drawn into the movement. This is the HARD case: there is no battlefield, no geographic journey, and the "climax" is a law — so the journey must be moral and personal, built from real events.
Ground it in the REAL history: a great suffrage parade (the 1913 march in Washington where crowds jeered and shoved the women); making banners and speaking on street corners; the split between patient lobbying and bolder action; the "Silent Sentinels" picketing the White House gates in 1917, called unpatriotic during the World War; arrest and jail at the Occoquan Workhouse; the "Night of Terror" and the hunger strikes met with force-feeding; and at last the 19th Amendment in 1920 and the first ballot cast.
Let the reader feel the hard truth: the vote was not given but WON — by ordinary women who marched, were mocked, and went to jail for it — felt through the character, never stated.`,
  },
};

function fkGrade(text: string): number {
  const sentences = (text.match(/[.!?]+/g) ?? []).length || 1;
  const words = text.split(/\s+/).filter(Boolean);
  const syll = words.reduce((n, w) => {
    const m = w.toLowerCase().replace(/[^a-z]/g, "").replace(/e$/, "").match(/[aeiouy]+/g);
    return n + Math.max(1, m ? m.length : 1);
  }, 0);
  return 0.39 * (words.length / sentences) + 11.8 * (syll / Math.max(1, words.length)) - 15.59;
}

function wrap(s: string, w: number): string[] {
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > w) { lines.push(line.trim()); line = word; }
    else line += " " + word;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { console.error("Set ANTHROPIC_API_KEY in .env.local"); process.exit(1); }

  const key = (process.argv[2] || "1812").toLowerCase();
  const topic = TOPICS[key];
  if (!topic) { console.error(`Unknown topic "${key}". Choose: ${Object.keys(TOPICS).join(", ")}`); process.exit(1); }

  console.log(`Generating ONE branching narrative — ${topic.label} — with ${MODEL} …\n`);
  const client = new Anthropic({ apiKey, timeout: 10 * 60_000, maxRetries: 1 });
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `${topic.brief}\n\nWrite the complete branching story now, beginning at "start" with the character's name and home and the moment the history reaches them. Simple words, short sentences, real feeling, real choices that change what happens next, exactly two earned endings. Output ONLY the JSON object conforming to BranchingStory.` }],
  });
  let raw = "";
  stream.on("text", (t) => { raw += t; });
  await stream.finalMessage();

  const story = parseModelJson<BranchingStory>(raw);
  const outPath = resolve(__dirname, `branching-narrative-${topic.key}.json`);
  writeFileSync(outPath, JSON.stringify(story, null, 2), "utf-8");

  const { findings, playable } = validateStory(story);
  const byId = passageMap(story);
  const endings = story.passages.filter((p) => p.ending);
  const allText = story.passages.map((p) => p.text).join(" ");

  console.log("═".repeat(74));
  console.log(`  TITLE: ${story.title}`);
  console.log(`  protagonist: ${story.protagonist}`);
  console.log(`  passages: ${story.passages.length} | endings: ${endings.length} | start: ${story.start}`);
  console.log(`  est. reading grade (Flesch-Kincaid): ${fkGrade(allText).toFixed(1)}`);
  console.log(`  structure: ${playable ? "✓ playable — all branches connect, every path reaches an ending" : "NOT PLAYABLE"}`);
  for (const f of findings) console.log(`     ${f.level === "error" ? "✗" : "⚠"} [${f.code}] ${f.message}`);
  console.log(`  saved: ${outPath}`);
  console.log("═".repeat(74));
  console.log();

  const order: string[] = [];
  const seen = new Set<string>();
  const queue = [story.start];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id) || !byId.has(id)) continue;
    seen.add(id); order.push(id);
    for (const c of byId.get(id)!.choices ?? []) queue.push(c.next);
  }
  for (const p of story.passages) if (!seen.has(p.id)) order.push(p.id);

  for (const id of order) {
    const p = byId.get(id)!;
    console.log(`┌─ ${id}${id === story.start ? "  (START)" : ""}${p.ending ? "  (ENDING)" : ""}`);
    for (const line of wrap(p.text, 70)) console.log(`│  ${line}`);
    if (p.choices?.length) {
      console.log("│");
      for (const c of p.choices) console.log(`│   → ${c.text}   [${c.next}]`);
    }
    console.log("");
  }
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
