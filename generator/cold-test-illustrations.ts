#!/usr/bin/env npx tsx
// ════════════════════════════════════════════════════════════════
// COLD TEST — does Claude's era brief generalize, and does its checklist
// predict its own model's drift?
//
// Three topics NOT used to tune the image prompt and NOT War of 1812. For each:
//   1. Claude writes {brief, checklist} from {topic, standard}  (eraBrief.ts)
//   2. brief feeds buildImagePrompt's era slot                  (imageGen.ts)
//   3. Gemini renders one image                                 (imageGen.ts)
// Prints the brief, the checklist, the LITERAL prompt sent, and the PNG path.
// ~$0.12 total (3 images + 3 short Claude calls). Image lane only.
//
//   npx tsx generator/cold-test-illustrations.ts
// ════════════════════════════════════════════════════════════════
import { config as loadEnv } from "dotenv";
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { generateEraBrief } from "./eraBrief.js";
import { generateIllustration } from "./imageGen.js";

const __root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: resolve(__root, ".env.local") });
const __dirname = dirname(fileURLToPath(import.meta.url));

const geminiKey = process.env.GEMINI_API_KEY;
if (!geminiKey) { console.error("GEMINI_API_KEY missing in .env.local"); process.exit(1); }

// Cold cases — periods NOT used to tune the prompt. Suffrage/Reconstruction scenes
// are the real proven story openings (never used to tune the IMAGE prompt); Dust
// Bowl is a fresh scene with no existing story.
const CASES = [
  {
    slug: "suffrage",
    topic: "Women's suffrage and the fight for the vote, around 1913",
    standard: "The women's suffrage movement: parades and marches, picketing, the long campaign for the 19th Amendment.",
    scene: "Your name is Lottie Mercer. You are fifteen, and you live above your father's print shop in Washington. A woman in a white dress comes in carrying folded cloth. She wants a banner printed for a suffrage parade tomorrow, and asks if you will come watch the women march for the vote.",
  },
  {
    slug: "reconstruction",
    topic: "Reconstruction in the South after the Civil War, around 1868",
    standard: "Reconstruction: emancipation, freedpeople rebuilding their lives, the Freedmen's Bureau, the rural postwar South.",
    scene: "Your name is Tessa. You are twelve, born on the Greer place in South Carolina in a one-room cabin with a dirt floor. One hot June morning a Union soldier on a tired horse rides up the lane and reads from a paper. The war is over. You are free. The whole quarter goes still.",
  },
  {
    slug: "dustbowl",
    topic: "The Dust Bowl on the Great Plains, around 1935",
    standard: "Causes and effects of the Dust Bowl: drought, dust storms, failed farms, and families forced to leave.",
    scene: "Your name is Ada. You are thirteen, and you live on a wheat farm in the Oklahoma panhandle. For three years no rain has come. One afternoon the sky to the north turns black — not rain, but a wall of dust. The wind howls and grit stings your face. Your mother screams for you to get inside before it swallows the house.",
  },
];

(async () => {
  for (const c of CASES) {
    console.log("\n" + "═".repeat(72));
    console.log(`TOPIC: ${c.topic}`);
    console.log("═".repeat(72));

    const eb = await generateEraBrief(c.topic, c.standard, geminiKey);
    console.log("\n--- (a) CLAUDE'S ERA BRIEF (feeds the image prompt) ---\n" + (eb.brief || "(empty)"));
    console.log("\n--- (b) CLAUDE'S TEACHER CHECKLIST (what to verify) ---");
    eb.checklist.forEach((item, i) => console.log(`  ${i + 1}. ${item}`));

    const result = await generateIllustration({ topic: c.topic, scene: c.scene, era: eb.brief }, geminiKey);
    if (!result) {
      console.log(`\n  IMAGE: generation FAILED (text-only fallback). Skipping ${c.slug}.`);
      continue;
    }
    const outPath = resolve(__dirname, `cold-test-${c.slug}.png`);
    writeFileSync(outPath, Buffer.from(result.dataUrl.split(",")[1] ?? "", "base64"));
    console.log("\n--- LITERAL IMAGE PROMPT SENT ---\n" + result.prompt);
    console.log(`\n  IMAGE: ${result.ms}ms · ~${(result.bytes / 1024).toFixed(0)} KB · SAVED ${outPath}`);
  }
  console.log("\n" + "═".repeat(72));
  console.log("Open the three PNGs. Judge: (1) is each period-correct, and");
  console.log("(2) did Claude's checklist name the things that are actually wrong?");
})();
