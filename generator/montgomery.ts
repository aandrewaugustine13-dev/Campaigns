/**
 * Montgomery bottleneck graph. Pure topology: no SDK, no player.
 *
 * A campaign is four chapter diamonds plus one climax tier.
 * Each diamond is a bottleneck, three immediate divergences, a red ending,
 * a yellow ending, one lateral warp, and three funnel nodes. Surviving
 * funnels meet at the next bottleneck. Chapter 4 funnels meet at the climax.
 *
 * The bottleneck scene does not name the branch that arrived. The choice
 * that enters it carries bridgeText. The player renders
 * bridgeText + a blank line + the bottleneck narrative.
 *
 * This is not the systems phase campaign and not the cowboy branching story.
 * Early red and yellow endings are allowed to end the run.
 */

export const CHAPTERS = [1, 2, 3, 4] as const;
export type ChapterNumber = (typeof CHAPTERS)[number];
export const BRANCH_LETTERS = ["a", "b", "c"] as const;
export type BranchLetter = (typeof BRANCH_LETTERS)[number];

export type MontgomeryRole =
  | "bottleneck"
  | "divergence"
  | "funnel"
  | "warp"
  | "red"
  | "yellow"
  | "green";

export type MontgomeryEnding = "red" | "yellow" | "green";

export interface MontgomeryChoice {
  id: string;
  text: string;
  targetNodeId: string;
  /** One or two sentences. Required on every choice that enters a bottleneck. */
  bridgeText?: string;
}

export interface MontgomeryNode {
  id: string;
  chapter: ChapterNumber;
  role: MontgomeryRole;
  title: string;
  narrative: string;
  choices?: MontgomeryChoice[];
  ending?: MontgomeryEnding;
  /** Why a red or yellow ending matches the historical record. */
  historicalWhy?: string;
}

export interface BottleneckSpec {
  chapter: ChapterNumber;
  title: string;
  date: string;
  concept: string;
  summary: string;
}

export interface ChapterSpec {
  chapter: ChapterNumber;
  /** Bold, diplomatic, then cautious. */
  branches: [string, string, string];
  redBlunder: string;
  yellowTrap: string;
  warp: string;
}

export interface MontgomeryBlueprint {
  title: string;
  protagonist: string;
  topic: string;
  gradeLevel: string;
  standard: string;
  bottlenecks: BottleneckSpec[];
  chapters: ChapterSpec[];
  climax: { green: string; yellow: string; red: string };
}

export interface MontgomeryCampaign {
  title: string;
  protagonist: string;
  topic: string;
  gradeLevel: string;
  standard: string;
  start: "ch1_bottleneck";
  blueprint: MontgomeryBlueprint;
  nodes: MontgomeryNode[];
}

export interface MontgomeryFinding {
  level: "error" | "warn";
  code:
    | "dangling"
    | "orphan"
    | "missing-node"
    | "missing-ending"
    | "leaf-target"
    | "bridge"
    | "warp"
    | "choice-count"
    | "trap"
    | "introspection"
    | "short";
  message: string;
}

export interface MontgomeryReport {
  ok: boolean;
  findings: MontgomeryFinding[];
  repairs: string[];
}

export const CLIMAX_IDS = ["climax_green", "climax_yellow", "climax_red"] as const;
export type ClimaxId = (typeof CLIMAX_IDS)[number];

export const FALLBACK_BRIDGE =
  "You reach the next historical turning point carrying the cost of the road you already chose.";

const INTROSPECTION = /^(if you (feel|are worried|worry|wonder)|you (feel|wonder|think about|hesitate))\b/i;

export function bottleneckId(chapter: number): string {
  return `ch${chapter}_bottleneck`;
}
export function t1Id(chapter: number, letter: BranchLetter): string {
  return `ch${chapter}_t1_${letter}`;
}
export function t2Id(chapter: number, letter: BranchLetter): string {
  return `ch${chapter}_t2_${letter}`;
}
export function warpId(chapter: number): string {
  return `ch${chapter}_warp`;
}
export function endRedId(chapter: number): string {
  return `ch${chapter}_end_red`;
}
export function endYellowId(chapter: number): string {
  return `ch${chapter}_end_yellow`;
}

export function chapterNodeIds(chapter: number): string[] {
  return [
    bottleneckId(chapter),
    ...BRANCH_LETTERS.map((letter) => t1Id(chapter, letter)),
    endRedId(chapter),
    endYellowId(chapter),
    warpId(chapter),
    ...BRANCH_LETTERS.map((letter) => t2Id(chapter, letter)),
  ];
}

export function allNodeIds(): string[] {
  return [...CHAPTERS.flatMap((chapter) => chapterNodeIds(chapter)), ...CLIMAX_IDS];
}

export function branchLetter(id: string): BranchLetter | undefined {
  const match = id.match(/_([abc])$/);
  if (match?.[1] === "a" || match?.[1] === "b" || match?.[1] === "c") return match[1];
  return undefined;
}

export function chapterOf(id: string): ChapterNumber | undefined {
  const match = id.match(/^ch([1-4])_/);
  const chapter = Number(match?.[1]);
  if (chapter === 1 || chapter === 2 || chapter === 3 || chapter === 4) return chapter;
  return undefined;
}

export function isBottleneckId(id: string): boolean {
  return /^ch[1-4]_bottleneck$/.test(id);
}

export function isClimaxId(id: string): id is ClimaxId {
  return (CLIMAX_IDS as readonly string[]).includes(id);
}

export function isEndingId(id: string): boolean {
  return /_end_red$|_end_yellow$/.test(id) || isClimaxId(id);
}

export function nextBottleneckId(chapter: number): string | undefined {
  return chapter < 4 ? bottleneckId(chapter + 1) : undefined;
}

/** Where a surviving leaf in this chapter is allowed to go. */
export function legalSinks(chapter: number): string[] {
  if (chapter < 4) return [bottleneckId(chapter + 1)];
  return [...CLIMAX_IDS];
}

export function bridgeWordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function bridgeIsUsable(text: string | undefined): boolean {
  if (!text?.trim()) return false;
  const words = bridgeWordCount(text);
  return words >= 8 && words <= 60;
}

/**
 * Text the player shows on arrival. Bottlenecks and climax endings prepend
 * the bridge from the choice that entered them. Other nodes show narrative only.
 */
export function arrivalProse(choice: MontgomeryChoice | undefined, node: MontgomeryNode): string {
  const bridge = choice?.bridgeText?.trim();
  const shared = node.role === "bottleneck" || isClimaxId(node.id);
  if (shared && bridge) return `${bridge}\n\n${node.narrative}`;
  return node.narrative;
}

function sentence(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const text = value.replace(/\s+/g, " ").trim();
  return text || fallback;
}

function asChapter(value: unknown, fallback: ChapterNumber): ChapterNumber {
  const n = typeof value === "number" ? value : Number(value);
  if (n === 1 || n === 2 || n === 3 || n === 4) return n;
  return fallback;
}

export function normalizeBlueprint(raw: unknown, topic: string, gradeLevel: string, standard: string): MontgomeryBlueprint {
  const obj = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const bottlenecks = new Map<number, BottleneckSpec>();
  if (Array.isArray(obj.bottlenecks)) {
    for (const item of obj.bottlenecks) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const chapter = asChapter(row.chapter, 1);
      bottlenecks.set(chapter, {
        chapter,
        title: sentence(row.title, `Chapter ${chapter} crisis`),
        date: sentence(row.date, "the historical date"),
        concept: sentence(row.concept, "the curriculum event"),
        summary: sentence(row.summary, `The historical crisis of chapter ${chapter} begins.`),
      });
    }
  }
  const chapters = new Map<number, ChapterSpec>();
  if (Array.isArray(obj.chapters)) {
    for (const item of obj.chapters) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const chapter = asChapter(row.chapter, 1);
      const branches = Array.isArray(row.branches) ? row.branches : [];
      chapters.set(chapter, {
        chapter,
        branches: [
          sentence(branches[0], `A bold action in chapter ${chapter} spends a resource the next crisis still needs.`),
          sentence(branches[1], `A diplomatic bargain in chapter ${chapter} buys time and costs an ally.`),
          sentence(branches[2], `A cautious delay in chapter ${chapter} saves the group and loses the opening.`),
        ],
        redBlunder: sentence(row.redBlunder, `A fatal historical blunder ends chapter ${chapter}.`),
        yellowTrap: sentence(row.yellowTrap, `Waiting for permission sidelines the player in chapter ${chapter}.`),
        warp: sentence(row.warp, `A lateral road joins another branch in chapter ${chapter}.`),
      });
    }
  }
  const climaxRaw = obj.climax && typeof obj.climax === "object" ? obj.climax as Record<string, unknown> : {};
  for (const chapter of CHAPTERS) {
    if (!bottlenecks.has(chapter)) {
      bottlenecks.set(chapter, {
        chapter,
        title: `Chapter ${chapter} crisis`,
        date: "the historical date",
        concept: "the curriculum event",
        summary: `The historical crisis of chapter ${chapter} begins.`,
      });
    }
    if (!chapters.has(chapter)) {
      chapters.set(chapter, {
        chapter,
        branches: [
          `A bold action in chapter ${chapter} spends a resource the next crisis still needs.`,
          `A diplomatic bargain in chapter ${chapter} buys time and costs an ally.`,
          `A cautious delay in chapter ${chapter} saves the group and loses the opening.`,
        ],
        redBlunder: `A fatal historical blunder ends chapter ${chapter}.`,
        yellowTrap: `Waiting for permission sidelines the player in chapter ${chapter}.`,
        warp: `A lateral road joins another branch in chapter ${chapter}.`,
      });
    }
  }
  return {
    title: sentence(obj.title, topic),
    protagonist: sentence(obj.protagonist, "a young participant in the events"),
    topic,
    gradeLevel,
    standard,
    bottlenecks: CHAPTERS.map((chapter) => bottlenecks.get(chapter)!),
    chapters: CHAPTERS.map((chapter) => chapters.get(chapter)!),
    climax: {
      green: sentence(climaxRaw.green, "You reach the end of the history still able to carry what it cost."),
      yellow: sentence(climaxRaw.yellow, "You last to the end by staying out of the final decision."),
      red: sentence(climaxRaw.red, "The last historical mistake ends the campaign."),
    },
  };
}

function choice(id: string, text: string, targetNodeId: string, bridgeText?: string): MontgomeryChoice {
  return bridgeText ? { id, text, targetNodeId, bridgeText } : { id, text, targetNodeId };
}

function sinkBridge(chapter: number, letter: BranchLetter, blueprint: MontgomeryBlueprint): string {
  if (chapter >= 4) {
    return `The ${letter} road brings you to the last historical decision with its losses already paid.`;
  }
  const next = blueprint.bottlenecks.find((item) => item.chapter === chapter + 1);
  const title = next?.title ?? "the next crisis";
  return `The ${letter} road brings you to ${title} with the cost of this chapter already paid.`;
}

/** A topologically legal campaign. Stage 2 overwrites the prose and choices. */
export function scaffoldCampaign(blueprint: MontgomeryBlueprint): MontgomeryNode[] {
  const nodes: MontgomeryNode[] = [];
  for (const chapter of CHAPTERS) {
    const spec = blueprint.chapters.find((item) => item.chapter === chapter)!;
    const bottleneck = blueprint.bottlenecks.find((item) => item.chapter === chapter)!;
    const sinks = legalSinks(chapter);
    nodes.push({
      id: bottleneckId(chapter),
      chapter,
      role: "bottleneck",
      title: bottleneck.title,
      narrative: `${bottleneck.date}. ${bottleneck.summary} The question in front of everyone is ${bottleneck.concept}.`,
      choices: BRANCH_LETTERS.map((letter, index) => choice(
        `${bottleneckId(chapter)}_${letter}`,
        index === 0 ? "Push the bold action now." : index === 1 ? "Bargain for time with the people who can still refuse." : "Hold the line and refuse the first opening.",
        t1Id(chapter, letter),
      )),
    });
    BRANCH_LETTERS.forEach((letter, index) => {
      const ownFunnel = t2Id(chapter, letter);
      const adjacent = t2Id(chapter, letter === "a" ? "b" : "a");
      const choices: MontgomeryChoice[] = [];
      if (letter === "a") {
        choices.push(choice(`${t1Id(chapter, letter)}_red`, "Spend the last reserve on one charge.", endRedId(chapter)));
        choices.push(choice(`${t1Id(chapter, letter)}_warp`, "Cut across to the other road.", warpId(chapter)));
      } else if (letter === "b") {
        choices.push(choice(`${t1Id(chapter, letter)}_yellow`, "Wait for written permission before moving.", endYellowId(chapter)));
        choices.push(choice(`${t1Id(chapter, letter)}_on`, "Keep the bargain and move the people you still have.", ownFunnel));
      } else {
        choices.push(choice(`${t1Id(chapter, letter)}_on`, "Slip the column through while the road is still open.", ownFunnel));
        choices.push(choice(`${t1Id(chapter, letter)}_across`, "Send the runners onto the other branch's road.", adjacent));
      }
      nodes.push({
        id: t1Id(chapter, letter),
        chapter,
        role: "divergence",
        title: `${bottleneck.title}: ${letter.toUpperCase()}`,
        narrative: spec.branches[index],
        choices,
      });
    });
    nodes.push({
      id: endRedId(chapter),
      chapter,
      role: "red",
      title: `Lost: ${bottleneck.title}`,
      narrative: spec.redBlunder,
      ending: "red",
      historicalWhy: spec.redBlunder,
    });
    nodes.push({
      id: endYellowId(chapter),
      chapter,
      role: "yellow",
      title: `Sidelined: ${bottleneck.title}`,
      narrative: spec.yellowTrap,
      ending: "yellow",
      historicalWhy: spec.yellowTrap,
    });
    nodes.push({
      id: warpId(chapter),
      chapter,
      role: "warp",
      title: `The other road`,
      narrative: spec.warp,
      choices: [choice(`${warpId(chapter)}_land`, "Join the column that took the other road.", t2Id(chapter, "b"))],
    });
    for (const letter of BRANCH_LETTERS) {
      const target = chapter < 4 ? sinks[0] : sinks[letter === "a" ? 0 : letter === "b" ? 1 : 2];
      nodes.push({
        id: t2Id(chapter, letter),
        chapter,
        role: "funnel",
        title: `${bottleneck.title} settles`,
        narrative: `The ${letter} road finishes its local consequence and turns toward what history does next.`,
        choices: [choice(
          `${t2Id(chapter, letter)}_next`,
          chapter < 4 ? "Go on to the next historical crisis." : "Face the last decision.",
          target,
          sinkBridge(chapter, letter, blueprint),
        )],
      });
    }
  }
  const climaxRole: Record<ClimaxId, MontgomeryRole> = {
    climax_green: "green",
    climax_yellow: "yellow",
    climax_red: "red",
  };
  const climaxEnding: Record<ClimaxId, MontgomeryEnding> = {
    climax_green: "green",
    climax_yellow: "yellow",
    climax_red: "red",
  };
  for (const id of CLIMAX_IDS) {
    const key = id.replace("climax_", "") as "green" | "yellow" | "red";
    nodes.push({
      id,
      chapter: 4,
      role: climaxRole[id],
      title: key === "green" ? "The historical end" : key === "yellow" ? "Left aside at the end" : "The last mistake",
      narrative: blueprint.climax[key],
      ending: climaxEnding[id],
      historicalWhy: blueprint.climax[key],
    });
  }
  return nodes;
}

function asChoice(raw: unknown, nodeId: string, index: number): MontgomeryChoice | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const row = raw as Record<string, unknown>;
  const text = typeof row.text === "string" ? row.text.replace(/\s+/g, " ").trim() : "";
  const target = typeof row.targetNodeId === "string"
    ? row.targetNodeId.trim()
    : typeof row.next === "string" ? row.next.trim() : "";
  if (!text || !target) return undefined;
  const bridge = typeof row.bridgeText === "string" ? row.bridgeText.replace(/\s+/g, " ").trim() : "";
  return {
    id: typeof row.id === "string" && row.id.trim() ? row.id.trim() : `${nodeId}_${index + 1}`,
    text,
    targetNodeId: target,
    ...(bridge ? { bridgeText: bridge } : {}),
  };
}

export function readNodes(raw: unknown): MontgomeryNode[] {
  const obj = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const list = Array.isArray(raw) ? raw : Array.isArray(obj.nodes) ? obj.nodes : [];
  const nodes: MontgomeryNode[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!id) continue;
    const chapter = chapterOf(id) ?? (isClimaxId(id) ? 4 : undefined);
    if (!chapter) continue;
    const narrative = sentence(row.narrative ?? row.text, "");
    const choices = Array.isArray(row.choices)
      ? row.choices.map((choiceItem, index) => asChoice(choiceItem, id, index)).filter((item): item is MontgomeryChoice => Boolean(item))
      : undefined;
    const ending = row.ending === "red" || row.ending === "yellow" || row.ending === "green" ? row.ending : undefined;
    nodes.push({
      id,
      chapter,
      role: roleFor(id),
      title: sentence(row.title, id),
      narrative,
      ...(choices && choices.length > 0 ? { choices } : {}),
      ...(ending || isEndingId(id) ? { ending: ending ?? endingFor(id) } : {}),
      ...(typeof row.historicalWhy === "string" && row.historicalWhy.trim() ? { historicalWhy: row.historicalWhy.trim() } : {}),
    });
  }
  return nodes;
}

function roleFor(id: string): MontgomeryRole {
  if (isBottleneckId(id)) return "bottleneck";
  if (/_t1_[abc]$/.test(id)) return "divergence";
  if (/_t2_[abc]$/.test(id)) return "funnel";
  if (/_warp$/.test(id)) return "warp";
  if (id === "climax_green") return "green";
  if (/_end_yellow$/.test(id) || id === "climax_yellow") return "yellow";
  if (/_end_red$/.test(id) || id === "climax_red") return "red";
  return "divergence";
}

function endingFor(id: string): MontgomeryEnding | undefined {
  if (/_end_red$/.test(id) || id === "climax_red") return "red";
  if (/_end_yellow$/.test(id) || id === "climax_yellow") return "yellow";
  if (id === "climax_green") return "green";
  return undefined;
}

/** Model nodes replace scaffold prose and choices. Missing ids stay scaffolded. */
export function overlayNodes(base: MontgomeryNode[], incoming: readonly MontgomeryNode[]): MontgomeryNode[] {
  const extra = new Map(incoming.map((node) => [node.id, node]));
  return base.map((node) => {
    const written = extra.get(node.id);
    if (!written) return node;
    const narrative = written.narrative.trim() ? written.narrative : node.narrative;
    const choices = written.choices && written.choices.length > 0 ? written.choices : node.choices;
    return {
      ...node,
      title: written.title.trim() ? written.title : node.title,
      narrative,
      ...(choices ? { choices } : {}),
      ...(written.historicalWhy ? { historicalWhy: written.historicalWhy } : {}),
      ...(node.ending ? { ending: written.ending ?? node.ending } : {}),
    };
  });
}

function cloneNodes(nodes: readonly MontgomeryNode[]): MontgomeryNode[] {
  return nodes.map((node) => ({
    ...node,
    ...(node.choices ? { choices: node.choices.map((item) => ({ ...item })) } : {}),
  }));
}

function byId(nodes: readonly MontgomeryNode[]): Map<string, MontgomeryNode> {
  return new Map(nodes.map((node) => [node.id, node]));
}

function hasTarget(node: MontgomeryNode, target: string): boolean {
  return (node.choices ?? []).some((item) => item.targetNodeId === target);
}

/**
 * Auto-route broken survival links and restore any diamond edge the model dropped.
 * Does not invent historical prose beyond the fallback bridge.
 */
export function repairMontgomery(nodes: readonly MontgomeryNode[], blueprint?: MontgomeryBlueprint): { nodes: MontgomeryNode[]; repairs: string[] } {
  const next = cloneNodes(nodes);
  const index = byId(next);
  const repairs: string[] = [];
  const note = (message: string) => repairs.push(message);

  for (const node of next) {
    if (node.ending || isEndingId(node.id)) {
      const forced = endingFor(node.id);
      if (forced && node.ending !== forced) {
        node.ending = forced;
        note(`${node.id}: restored ending ${forced}`);
      }
      if (node.choices?.length) {
        delete node.choices;
        note(`${node.id}: cleared choices on an ending`);
      }
      continue;
    }
    for (const item of node.choices ?? []) {
      if (index.has(item.targetNodeId)) continue;
      const sink = node.chapter < 4 ? bottleneckId(node.chapter + 1) : "climax_green";
      note(`${node.id}: retargeted broken link "${item.targetNodeId}" to ${sink}`);
      item.targetNodeId = sink;
      if ((isBottleneckId(sink) || isClimaxId(sink)) && !bridgeIsUsable(item.bridgeText)) {
        item.bridgeText = FALLBACK_BRIDGE;
      }
    }
  }

  for (const node of next) {
    for (const item of node.choices ?? []) {
      if (!isBottleneckId(item.targetNodeId) || bridgeIsUsable(item.bridgeText)) continue;
      item.bridgeText = FALLBACK_BRIDGE;
      note(`${node.id}: filled bridgeText into ${item.targetNodeId}`);
    }
  }

  for (const chapter of CHAPTERS) {
    const bottleneck = index.get(bottleneckId(chapter));
    if (bottleneck) {
      const kept = BRANCH_LETTERS.map((letter) => (bottleneck.choices ?? []).find((item) => item.targetNodeId === t1Id(chapter, letter)))
        .filter((item): item is MontgomeryChoice => Boolean(item));
      if (kept.length !== 3) {
        const titles = ["Push the bold action now.", "Bargain for time with the people who can still refuse.", "Hold the line and refuse the first opening."];
        bottleneck.choices = BRANCH_LETTERS.map((letter, letterIndex) => (
          kept.find((item) => item.targetNodeId === t1Id(chapter, letter))
          ?? choice(`${bottleneckId(chapter)}_${letter}`, titles[letterIndex], t1Id(chapter, letter))
        ));
        note(`${bottleneck.id}: restored the three divergence choices`);
      }
    }

    for (const letter of BRANCH_LETTERS) {
      const divergence = index.get(t1Id(chapter, letter));
      if (!divergence) continue;
      const progressing = (divergence.choices ?? []).some((item) => {
        const target = item.targetNodeId;
        return target === endRedId(chapter) || target === endYellowId(chapter) || target === warpId(chapter) || target.startsWith(`ch${chapter}_t2_`);
      });
      if (!progressing || (divergence.choices ?? []).length < 2) {
        const target = letter === "b" ? endYellowId(chapter) : t2Id(chapter, letter);
        divergence.choices = [
          ...(divergence.choices ?? []).slice(0, 2),
          choice(`${divergence.id}_repair`, "Take the road that still moves.", target),
        ].slice(0, 3);
        note(`${divergence.id}: added a choice that leaves the divergence`);
      }
    }

    if (!next.some((node) => hasTarget(node, endRedId(chapter)))) {
      const host = index.get(t1Id(chapter, "a"));
      if (host) {
        host.choices = [choice(`${host.id}_red`, "Spend the last reserve on one charge.", endRedId(chapter)), ...(host.choices ?? [])].slice(0, 3);
        note(`${host.id}: routed a choice to the red ending`);
      }
    }
    if (!next.some((node) => hasTarget(node, endYellowId(chapter)))) {
      const host = index.get(t1Id(chapter, "b"));
      if (host) {
        host.choices = [choice(`${host.id}_yellow`, "Wait for written permission before moving.", endYellowId(chapter)), ...(host.choices ?? [])].slice(0, 3);
        note(`${host.id}: routed a choice to the yellow ending`);
      }
    }

    const lateral = BRANCH_LETTERS.some((letter) => (
      (index.get(t1Id(chapter, letter))?.choices ?? []).some((item) => {
        if (item.targetNodeId === warpId(chapter)) return true;
        return item.targetNodeId.startsWith(`ch${chapter}_t2_`) && branchLetter(item.targetNodeId) !== letter;
      })
    ));
    if (!lateral) {
      const host = index.get(t1Id(chapter, "a"));
      if (host) {
        const kept = (host.choices ?? []).filter((item) => item.targetNodeId === endRedId(chapter) || item.targetNodeId === endYellowId(chapter));
        const rest = (host.choices ?? []).filter((item) => item.targetNodeId !== endRedId(chapter) && item.targetNodeId !== endYellowId(chapter));
        host.choices = [...kept, ...rest, choice(`${host.id}_warp`, "Cut across to the other road.", warpId(chapter))].slice(0, 3);
        if (!host.choices.some((item) => item.targetNodeId === warpId(chapter))) {
          host.choices = [...host.choices.slice(0, 2), choice(`${host.id}_warp`, "Cut across to the other road.", warpId(chapter))];
        }
        note(`${host.id}: added the lateral warp`);
      }
    }

    for (const letter of BRANCH_LETTERS) {
      const funnel = index.get(t2Id(chapter, letter));
      if (!funnel) continue;
      const sinks = new Set(legalSinks(chapter));
      const usable = (funnel.choices ?? []).filter((item) => sinks.has(item.targetNodeId));
      if (usable.length === 0) {
        const target = chapter < 4 ? bottleneckId(chapter + 1) : letter === "a" ? "climax_green" : letter === "b" ? "climax_yellow" : "climax_red";
        funnel.choices = [choice(
          `${funnel.id}_next`,
          chapter < 4 ? "Go on to the next historical crisis." : "Face the last decision.",
          target,
          sinkBridge(chapter, letter, blueprint ?? emptyBlueprint()),
        )];
        note(`${funnel.id}: routed the funnel to ${target}`);
      } else {
        funnel.choices = usable.map((item) => {
          if (chapter < 4 && !bridgeIsUsable(item.bridgeText)) {
            note(`${funnel.id}: filled the funnel bridge`);
            return { ...item, bridgeText: sinkBridge(chapter, letter, blueprint ?? emptyBlueprint()) };
          }
          return item;
        });
      }
    }
  }

  return { nodes: orderNodes(next), repairs };
}

function emptyBlueprint(): MontgomeryBlueprint {
  return normalizeBlueprint({}, "history", "", "");
}

function orderNodes(nodes: readonly MontgomeryNode[]): MontgomeryNode[] {
  const index = byId(nodes);
  const ordered: MontgomeryNode[] = [];
  for (const id of allNodeIds()) {
    const node = index.get(id);
    if (node) ordered.push(node);
  }
  for (const node of nodes) {
    if (!ordered.some((item) => item.id === node.id)) ordered.push(node);
  }
  return ordered;
}

export function reachableFrom(start: string, nodes: readonly MontgomeryNode[]): Set<string> {
  const index = byId(nodes);
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || seen.has(id) || !index.has(id)) continue;
    seen.add(id);
    for (const item of index.get(id)?.choices ?? []) stack.push(item.targetNodeId);
  }
  return seen;
}

function canReachEnding(id: string, nodes: readonly MontgomeryNode[]): boolean {
  const index = byId(nodes);
  const seen = new Set<string>();
  const stack = [id];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    const node = index.get(current);
    if (!node) continue;
    if (node.ending || isEndingId(node.id)) return true;
    for (const item of node.choices ?? []) stack.push(item.targetNodeId);
  }
  return false;
}

export function validateMontgomery(nodes: readonly MontgomeryNode[]): MontgomeryFinding[] {
  const findings: MontgomeryFinding[] = [];
  const err = (code: MontgomeryFinding["code"], message: string) => findings.push({ level: "error", code, message });
  const warn = (code: MontgomeryFinding["code"], message: string) => findings.push({ level: "warn", code, message });
  const index = byId(nodes);

  for (const id of allNodeIds()) {
    if (!index.has(id)) err("missing-node", `missing ${id}`);
  }

  for (const node of nodes) {
    if (!node.narrative.trim()) err("short", `${node.id}: narrative is empty`);
    else if (bridgeWordCount(node.narrative) < 8) warn("short", `${node.id}: narrative is under 8 words`);
    if (node.ending && node.choices?.length) err("choice-count", `${node.id}: an ending still has choices`);
    for (const item of node.choices ?? []) {
      if (!index.has(item.targetNodeId)) err("dangling", `${node.id}: choice → "${item.targetNodeId}"`);
      if (INTROSPECTION.test(item.text)) warn("introspection", `${node.id}: choice is interior ("${item.text}")`);
      if (isBottleneckId(item.targetNodeId) && !bridgeIsUsable(item.bridgeText)) {
        err("bridge", `${node.id}: choice into ${item.targetNodeId} needs a 1–2 sentence bridgeText`);
      }
    }
  }

  for (const chapter of CHAPTERS) {
    const red = index.get(endRedId(chapter));
    const yellow = index.get(endYellowId(chapter));
    if (!red?.ending) err("missing-ending", `${endRedId(chapter)}: chapter red ending is missing`);
    if (!yellow?.ending) err("missing-ending", `${endYellowId(chapter)}: chapter yellow ending is missing`);
    if (red && !nodes.some((node) => hasTarget(node, red.id))) err("missing-ending", `${red.id}: nothing routes to the red ending`);
    if (yellow && !nodes.some((node) => hasTarget(node, yellow.id))) err("missing-ending", `${yellow.id}: nothing routes to the yellow ending`);

    const lateral = BRANCH_LETTERS.some((letter) => (
      (index.get(t1Id(chapter, letter))?.choices ?? []).some((item) => {
        if (item.targetNodeId === warpId(chapter)) return true;
        return item.targetNodeId.startsWith(`ch${chapter}_t2_`) && branchLetter(item.targetNodeId) !== letter;
      })
    ));
    if (!lateral) err("warp", `chapter ${chapter}: no Tier-1 choice warps to another branch`);

    const bottleneck = index.get(bottleneckId(chapter));
    const bottleneckTargets = new Set((bottleneck?.choices ?? []).map((item) => item.targetNodeId));
    if ((bottleneck?.choices ?? []).length !== 3 || BRANCH_LETTERS.some((letter) => !bottleneckTargets.has(t1Id(chapter, letter)))) {
      err("choice-count", `${bottleneckId(chapter)}: needs exactly three choices, one to each Tier-1 node`);
    }
    for (const letter of BRANCH_LETTERS) {
      const count = index.get(t1Id(chapter, letter))?.choices?.length ?? 0;
      if (count < 2 || count > 3) err("choice-count", `${t1Id(chapter, letter)}: needs 2 or 3 choices`);
    }

    const inside = (id: string) => id.startsWith(`ch${chapter}_`);
    const sinks = new Set(legalSinks(chapter));
    for (const id of chapterNodeIds(chapter)) {
      const node = index.get(id);
      if (!node || node.ending || isEndingId(node.id)) continue;
      const choices = node.choices ?? [];
      if (choices.length === 0) {
        err("leaf-target", `${node.id}: non-ending node has no choices`);
        continue;
      }
      const leavesChapter = choices.every((item) => !inside(item.targetNodeId));
      if (!leavesChapter) continue;
      for (const item of choices) {
        if (!sinks.has(item.targetNodeId)) err("leaf-target", `${node.id}: leaf targets "${item.targetNodeId}" instead of ${[...sinks].join(" or ")}`);
      }
    }
  }

  if (index.has("ch1_bottleneck")) {
    const reach = reachableFrom("ch1_bottleneck", nodes);
    for (const id of allNodeIds()) {
      if (index.has(id) && !reach.has(id)) err("orphan", `${id}: unreachable from ch1_bottleneck`);
    }
    for (const id of reach) {
      if (!canReachEnding(id, nodes)) err("trap", `${id}: no ending is reachable from here`);
    }
  }

  return findings;
}

export function stitchMontgomery(
  blueprint: MontgomeryBlueprint,
  chapterNodes: readonly (readonly MontgomeryNode[])[],
): { campaign: MontgomeryCampaign; report: MontgomeryReport } {
  const overlaid = overlayNodes(scaffoldCampaign(blueprint), chapterNodes.flat());
  const repaired = repairMontgomery(overlaid, blueprint);
  const findings = validateMontgomery(repaired.nodes);
  return {
    campaign: {
      title: blueprint.title,
      protagonist: blueprint.protagonist,
      topic: blueprint.topic,
      gradeLevel: blueprint.gradeLevel,
      standard: blueprint.standard,
      start: "ch1_bottleneck",
      blueprint,
      nodes: repaired.nodes,
    },
    report: {
      ok: findings.every((finding) => finding.level !== "error"),
      findings,
      repairs: repaired.repairs,
    },
  };
}
