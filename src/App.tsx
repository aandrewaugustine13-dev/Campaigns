import { useState, useCallback, useEffect, useRef } from "react";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface Resources {
  [key: string]: number;
}

interface Outcome {
  weight: number;
  effects: Resources;
  result: string;
  earlyEnd?: boolean;
}

interface Choice {
  text: string;
  effects?: Resources;
  result?: string;
  outcomes?: Outcome[];
  earlyEnd?: boolean;
}

interface GameEvent {
  id: string;
  phase_min: number;
  phase_max: number;
  weight: number;
  title: string;
  text: string;
  choices: Choice[];
}

interface Decision {
  event: string;
  choice: string;
  day: number;
}

interface GameState {
  day: number;
  turn: number;
  resources: Resources;
  phase: "intro" | "sailing" | "event" | "result" | "end";
  pace: string;
  distance: number;
  currentEvent: GameEvent | null;
  resultText: string;
  decisions: Decision[];
  gameOver: boolean;
  survived: boolean;
  earlySale: boolean;
}

// ═══════════════════════════════════════════════════════════════
// PIXEL ART FACE SYSTEM — 16x16 character grids → canvas
// ═══════════════════════════════════════════════════════════════

const FACE_CHARS: Record<string, string> = {
  ".": "transparent",
  s: "#e8b796", d: "#c4896b", w: "#a0654d",
  H: "#5c3a1e", h: "#7a5230", B: "#d4a843",
  e: "#1a1a2e", W: "#f0e8dc", r: "#3d2512",
  m: "#8b3a3a", M: "#5c1e1e",
  g: "#4a6741", G: "#364d30",
  b: "#8b2020", n: "#6b1515",
  c: "#c9a84c", C: "#a08530",
  f: "#5c3a1e", F: "#3d2512",
  x: "#7a5570", k: "#8b3a3a",
  D: "#c4a882", t: "#b8d4e8",
};

const BOSS_HEALTHY =
  "....HHHHHH....." +
  "...HhHHHHhH...." +
  "..HhHHHHHHhH..." +
  "..BBBBBBBBBB..." +
  "...sssssssss..." +
  "..sssssssssss.." +
  "..sWesssseWs..." +
  "..ssesssssess.." +
  "..ssssddsssss.." +
  "..ssssddsssss.." +
  "..sfssmmssfs..." +
  "..sffssmssff..." +
  "...sssssssss..." +
  "...dsssssssd..." +
  "....ggggggg...." +
  "...gGgggggGg...";

const BOSS_TIRED =
  "....HHHHHH....." +
  "...HhHHHHhH...." +
  "..HhHHHHHHhH..." +
  "..BBBBBBBBBB..." +
  "...ddsssssdd..." +
  "..sssssssssss.." +
  "..dWesssseWd..." +
  "..ssesssssess.." +
  "..ssssddsssss.." +
  "..ssssddsssss.." +
  "..sfssmmssfs..." +
  "..sffsssssff..." +
  "...sssssssss..." +
  "...dsssssssd..." +
  "....ggggggg...." +
  "...gGgggggGg...";

const BOSS_WORRIED =
  "....HHHHHH....." +
  "...HhHHHHhH...." +
  "..HhHHHHHHhH..." +
  "..BBBBBBBBBB..." +
  "...ddsssssdd..." +
  "..ddsssssssdd.." +
  "..dWesssseWd..." +
  "..ssesssssess.." +
  "..xsssddsssxs.." +
  "..ssssddsssss.." +
  "..sfsMMMssfs..." +
  "..sffsssssff..." +
  "...sssssssss..." +
  "...wssssssswt.." +
  "....ggggggg...." +
  "...gGgggggGg...";

const BOSS_DESPERATE =
  "....HHHHHH....." +
  "...HhHHHHhH...." +
  "..HhHHHHHHhH..." +
  "..BBBBBBBBBB..." +
  "...xxsssssxx..." +
  "..xxsssssssxx.." +
  "..xWesssseWx..." +
  "..ssesssssess.." +
  "..xkssddssskx.." +
  "..ssssddsssss.." +
  "..sfMMMMMsfs..." +
  "..sFfsssssFs..." +
  "...wswswswsw..." +
  "...wssssssswt.." +
  "....ggggggg...." +
  "...gGgggggGg...";

const SCOUT_HEALTHY =
  "................" +
  "....rrrrrrr....." +
  "...rrrrrrrrr...." +
  "..rrrsssssrrr..." +
  "..rrsssssssrr..." +
  "..ssssssssssss.." +
  "..sWesssseWs..." +
  "..ssesssssess.." +
  "..sssssssssss.." +
  "..ssssddsssss.." +
  "..ssssmmsssss.." +
  "..ssssssssss..." +
  "...bbbbbbbbb..." +
  "...bnbbbbbbn..." +
  "....ggggggg...." +
  "...gGgggggGg...";

const SCOUT_TIRED =
  "................" +
  "....rrrrrrr....." +
  "...rrrrrrrrr...." +
  "..rrrsssssrrr..." +
  "..rrsssssssrr..." +
  "..ddsssssssdd.." +
  "..dWesssseWd..." +
  "..ssesssssess.." +
  "..sssssssssss.." +
  "..ssssddsssss.." +
  "..ssssmmsssss.." +
  "..ssssssssss..." +
  "...bbbbbbbbb..." +
  "...bnbbbbbbn..." +
  "....ggggggg...." +
  "...gGgggggGg...";

const SCOUT_WORRIED =
  "................" +
  "....rrrrrrr....." +
  "...rrrrrrrrr...." +
  "..rrrsssssrrr..." +
  "..rrdsssssdrrr.." +
  "..ddsssssssdd.." +
  "..dWesssseWd..." +
  "..ssesssssess.." +
  "..xssssssssxs.." +
  "..ssssddsssss.." +
  "..sssMMMsssss.." +
  "..ssssssssss..." +
  "...bbbbbbbbb..." +
  "...bnbbbbbbn..." +
  "....ggggggg...." +
  "...gGgggggGg...";

const SCOUT_DESPERATE =
  "................" +
  "....rrrrrrr....." +
  "...rrrrrrrrr...." +
  "..rrrxsssxrrr..." +
  "..rrxsssssxrr..." +
  "..xxsssssssxx.." +
  "..xWesssseWx..." +
  "..ssesssssess.." +
  "..xkssssssskx.." +
  "..ssssddsssss.." +
  "..ssMMMMMssss.." +
  "..wsswssswss..." +
  "...bbbbbbbbb..." +
  "...bnbbbbbbn..." +
  "....ggggggg...." +
  "...gGgggggGg...";

const COOK_HEALTHY =
  "................" +
  "....HHHHHH....." +
  "...HHHHHHHH...." +
  "..HHHHHHHHHH..." +
  "...sssssssss..." +
  "..sssssssssss.." +
  "..sWesssseWs..." +
  "..ssesssssess.." +
  "..ssssddsssss.." +
  "..sssssssssss.." +
  "..ssssmmsssss.." +
  "..sssssssssss.." +
  "...ccccccccc..." +
  "...cCcccccCc..." +
  "....ccccccc...." +
  "...cCcccccCc...";

const COOK_TIRED =
  "................" +
  "....HHHHHH....." +
  "...HHHHHHHH...." +
  "..HHHHHHHHHH..." +
  "...ddsssssdd..." +
  "..sssssssssss.." +
  "..dWesssseWd..." +
  "..ssesssssess.." +
  "..ssssddsssss.." +
  "..sssssssssss.." +
  "..ssssmmsssss.." +
  "..sssssssssss.." +
  "...ccccccccc..." +
  "...cCcccccCc..." +
  "....ccccccc...." +
  "...cCcccccCc...";

const COOK_WORRIED =
  "................" +
  "....HHHHHH....." +
  "...HHHHHHHH...." +
  "..HHHHHHHHHH..." +
  "...ddsssssdd..." +
  "..ddsssssssdd.." +
  "..dWesssseWd..." +
  "..ssesssssess.." +
  "..xsssddsssxs.." +
  "..sssssssssss.." +
  "..ssMMMMMssss.." +
  "..sssssssssss.." +
  "...ccccccccc..." +
  "...cCcccccCc..." +
  "....ccccccc...." +
  "...cCcccccCc...";

const COOK_DESPERATE =
  "................" +
  "....HHHHHH....." +
  "...HHHHHHHH...." +
  "..HHHHHHHHHH..." +
  "...xxsssssxx..." +
  "..xxsssssssxx.." +
  "..xWesssseWx..." +
  "..ssesssssess.." +
  "..xkssddssskx.." +
  "..sssssssssss.." +
  "..sMMMMMMMsss.." +
  "..wswswswsww..." +
  "...ccccccccc..." +
  "...cCcccccCc..." +
  "....ccccccc...." +
  "...cCcccccCc...";

const WRANGLER_HEALTHY =
  "...HHHHHHHHH..." +
  "..HhHHHHHHhH..." +
  "..HhHHHHHHhH..." +
  "..BBBBBBBBBB..." +
  "...sssssssss..." +
  "..sssssssssss.." +
  "..sWesssseWs..." +
  "..ssesssssess.." +
  "..ssssddsssss.." +
  "..sssssssssss.." +
  "..ssssmmsssss.." +
  "..sssssssssss.." +
  "...sssssssss..." +
  "...dsssssssd..." +
  "....ggggggg...." +
  "...gGgggggGg...";

const WRANGLER_TIRED =
  "...HHHHHHHHH..." +
  "..HhHHHHHHhH..." +
  "..HhHHHHHHhH..." +
  "..BBBBBBBBBB..." +
  "...ddsssssdd..." +
  "..sssssssssss.." +
  "..dWesssseWd..." +
  "..ssesssssess.." +
  "..ssssddsssss.." +
  "..sssssssssss.." +
  "..ssssmmsssss.." +
  "..sssssssssss.." +
  "...sssssssss..." +
  "...dsssssssd..." +
  "....ggggggg...." +
  "...gGgggggGg...";

const WRANGLER_WORRIED =
  "...HHHHHHHHH..." +
  "..HhHHHHHHhH..." +
  "..HhHHHHHHhH..." +
  "..BBBBBBBBBB..." +
  "...ddsssssdd..." +
  "..ddsssssssdd.." +
  "..dWesssseWd..." +
  "..ssesssssess.." +
  "..xsssddsssxs.." +
  "..sssssssssss.." +
  "..sssMMMsssss.." +
  "..sssssssssss.." +
  "...sssssssss..." +
  "...wssssssswt.." +
  "....ggggggg...." +
  "...gGgggggGg...";

const WRANGLER_DESPERATE =
  "...HHHHHHHHH..." +
  "..HhHHHHHHhH..." +
  "..HhHHHHHHhH..." +
  "..BBBBBBBBBB..." +
  "...xxsssssxx..." +
  "..xxsssssssxx.." +
  "..xWesssseWx..." +
  "..ssesssssess.." +
  "..xkssddssskx.." +
  "..sssssssssss.." +
  "..sMMMMMMMsss.." +
  "..wswswswsww..." +
  "...wswswswsw..." +
  "...wssssssswt.." +
  "....ggggggg...." +
  "...gGgggggGg...";

const POINT_HEALTHY =
  "....HHHHHH....." +
  "...HhHHHHhH...." +
  "..HHHHHHHHHH..." +
  "..BBBBBBBBBB..." +
  "...sssssssss..." +
  "..sssssssssss.." +
  "..sWesssseWs..." +
  "..ssesssssess.." +
  "..ssssddsssss.." +
  "..sssssssssss.." +
  "..ssssmmsssss.." +
  "...sssssssss..." +
  "...bbbbbbbbb..." +
  "...bnbbbbbbn..." +
  "....ggggggg...." +
  "...gGgggggGg...";

const POINT_TIRED =
  "....HHHHHH....." +
  "...HhHHHHhH...." +
  "..HHHHHHHHHH..." +
  "..BBBBBBBBBB..." +
  "...DDsssssDD..." +
  "..DDsssssssDD.." +
  "..DWesssseWD..." +
  "..ssesssssess.." +
  "..ssssddsssss.." +
  "..sssssssssss.." +
  "..ssssmmsssss.." +
  "...sssssssss..." +
  "...bbbbbbbbb..." +
  "...bnbbbbbbn..." +
  "....ggggggg...." +
  "...gGgggggGg...";

const POINT_WORRIED =
  "....HHHHHH....." +
  "...HhHHHHhH...." +
  "..HHHHHHHHHH..." +
  "..BBBBBBBBBB..." +
  "...DDdsssdDD..." +
  "..DDdsssssdDD.." +
  "..DWesssseWD..." +
  "..ssesssssess.." +
  "..bbbbbbbbbbb.." +
  "..bnbbbbbbbbn.." +
  "..bbbbbbbbbbb.." +
  "...bbbbbbbbb..." +
  "...bbbbbbbbb..." +
  "...bnbbbbbbn..." +
  "....ggggggg...." +
  "...gGgggggGg...";

const POINT_DESPERATE =
  "....HHHHHH....." +
  "...HhHHHHhH...." +
  "..HHHHHHHHHH..." +
  "..BBBBBBBBBB..." +
  "...xxdsssdxx..." +
  "..xxdsssssdxx.." +
  "..xWesssseWx..." +
  "..ssesssssess.." +
  "..bbbbbbbbbbb.." +
  "..bnbbbbbbbbn.." +
  "..bbbbbbbbbbb.." +
  "...bbbbbbbbb..." +
  "...bbbbbbbbb..." +
  "...bnbbbbbbn..." +
  "....ggggggg...." +
  "...gGgggggGg...";

const HAND_HEALTHY =
  "................" +
  "....HHHHHH....." +
  "...HHHHHHHH...." +
  "..BBBBBBBBBB..." +
  "...sssssssss..." +
  "..sssssssssss.." +
  "..sWesssseWs..." +
  "..ssesssssess.." +
  "..ssssddsssss.." +
  "..sssssssssss.." +
  "..ssssmmsssss.." +
  "...sssssssss..." +
  "...sssssssss..." +
  "...dsssssssd..." +
  "....ggggggg...." +
  "...gGgggggGg...";

const HAND_SHORT =
  "................" +
  "....HHHHHH....." +
  "...HHHHHHHH...." +
  "..BBBBBBBBBB..." +
  "...ddsssssdd..." +
  "..sssssssssss.." +
  "..dWesssseWd..." +
  "..ssesssssess.." +
  "..ssssddsssss.." +
  "..sssssssssss.." +
  "..ssssmmsssss.." +
  "...sssssssss..." +
  "...sssssssss..." +
  "...dsssssssd..." +
  "....ggggggg...." +
  "...gGgggggGg...";

const HAND_SKELETON =
  "................" +
  "....HHHHHH....." +
  "...HHHHHHHH...." +
  "..BBBBBBBBBB..." +
  "...ddsssssdd..." +
  "..ddsssssssdd.." +
  "..dWesssseWd..." +
  "..ssesssssess.." +
  "..xsssddsssxs.." +
  "..sssssssssss.." +
  "..sssMMMsssss.." +
  "...wsswsswss..." +
  "...sssssssss..." +
  "...wssssssswt.." +
  "....ggggggg...." +
  "...gGgggggGg...";

const HAND_GONE =
  "................" +
  "....HHHHHH....." +
  "...HHHHHHHH...." +
  "..BBBBBBBBBB..." +
  "...xxsssssxx..." +
  "..xxwssssswxx.." +
  "..xWesssseWx..." +
  "..ssesssssess.." +
  "..xkwsddsxkxs.." +
  "..wsssssssssw.." +
  "..wMMMMMMMwww.." +
  "...wswswswsw..." +
  "...wswswswsw..." +
  "...wssssssswt.." +
  "....ggggggg...." +
  "...gGgggggGg...";

interface FaceLevel {
  threshold: number;
  sprite: string;
  label: string;
}

const FACE_SETS: Record<string, FaceLevel[]> = {
  boss: [
    { threshold: 70, sprite: BOSS_HEALTHY, label: "Confident" },
    { threshold: 45, sprite: BOSS_TIRED, label: "Wary" },
    { threshold: 20, sprite: BOSS_WORRIED, label: "Worried" },
    { threshold: 0, sprite: BOSS_DESPERATE, label: "Desperate" },
  ],
  scout: [
    { threshold: 70, sprite: SCOUT_HEALTHY, label: "Sharp" },
    { threshold: 45, sprite: SCOUT_TIRED, label: "Cautious" },
    { threshold: 20, sprite: SCOUT_WORRIED, label: "Rattled" },
    { threshold: 0, sprite: SCOUT_DESPERATE, label: "Gone" },
  ],
  cook: [
    { threshold: 60, sprite: COOK_HEALTHY, label: "Fed" },
    { threshold: 35, sprite: COOK_TIRED, label: "Scraping" },
    { threshold: 15, sprite: COOK_WORRIED, label: "Empty" },
    { threshold: 0, sprite: COOK_DESPERATE, label: "Nothing" },
  ],
  wrangler: [
    { threshold: 70, sprite: WRANGLER_HEALTHY, label: "Strong" },
    { threshold: 45, sprite: WRANGLER_TIRED, label: "Thin" },
    { threshold: 20, sprite: WRANGLER_WORRIED, label: "Lame" },
    { threshold: 0, sprite: WRANGLER_DESPERATE, label: "Afoot" },
  ],
  point: [
    { threshold: 70, sprite: POINT_HEALTHY, label: "Steady" },
    { threshold: 45, sprite: POINT_TIRED, label: "Dusty" },
    { threshold: 20, sprite: POINT_WORRIED, label: "Masked" },
    { threshold: 0, sprite: POINT_DESPERATE, label: "Losing" },
  ],
  hand: [
    { threshold: 80, sprite: HAND_HEALTHY, label: "Full crew" },
    { threshold: 55, sprite: HAND_SHORT, label: "Short" },
    { threshold: 30, sprite: HAND_SKELETON, label: "Skeleton" },
    { threshold: 0, sprite: HAND_GONE, label: "Bones" },
  ],
};

function getFaceState(set: FaceLevel[], val: number): FaceLevel {
  for (const f of set) {
    if (val >= f.threshold) return f;
  }
  return set[set.length - 1];
}

// ═══════════════════════════════════════════════════════════════
// CANVAS COMPONENTS
// ═══════════════════════════════════════════════════════════════

function PixelFace({ spriteData, size = 48 }: { spriteData: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const px = size / 16;
    ctx.clearRect(0, 0, size, size);
    for (let i = 0; i < spriteData.length; i++) {
      const ch = spriteData[i];
      if (ch === "." || ch === " ") continue;
      const color = FACE_CHARS[ch];
      if (!color || color === "transparent") continue;
      ctx.fillStyle = color;
      ctx.fillRect((i % 16) * px, Math.floor(i / 16) * px, px, px);
    }
  }, [spriteData, size]);
  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      style={{ imageRendering: "pixelated", width: size, height: size }}
    />
  );
}

function TrailMap({ progress }: { progress: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const w = c.width;
    const h = c.height;

    // Sky
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.55);
    sky.addColorStop(0, "#1e3a5f");
    sky.addColorStop(1, "#c4a060");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Ground
    const gY = h * 0.55;
    const gr = ctx.createLinearGradient(0, gY, 0, h);
    gr.addColorStop(0, "#8b7d3c");
    gr.addColorStop(0.3, "#6b5e2a");
    gr.addColorStop(1, "#4a4220");
    ctx.fillStyle = gr;
    ctx.fillRect(0, gY, w, h - gY);

    // Trail
    const tY = gY + 20;
    ctx.strokeStyle = "#5c4e28";
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(30, tY);
    ctx.lineTo(w - 30, tY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Labels
    ctx.fillStyle = "#d4a843";
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "center";
    ctx.fillText("SAN ANTONIO", 60, tY + 16);
    ctx.fillText("ABILENE", w - 50, tY + 16);

    // Landmarks
    const lm = [
      { p: 0.15, l: "Austin" },
      { p: 0.3, l: "Waco" },
      { p: 0.45, l: "Red River" },
      { p: 0.55, l: "Indian Terr." },
      { p: 0.75, l: "Wichita" },
    ];
    ctx.fillStyle = "#8b7d5c";
    ctx.font = "8px monospace";
    for (const m of lm) {
      const x = 30 + (w - 60) * m.p;
      ctx.fillRect(x - 1, tY - 4, 2, 8);
      ctx.fillText(m.l, x, tY - 8);
    }

    // Herd position
    const hX = 30 + (w - 60) * Math.min(progress / 100, 1);

    // Dust
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#c4a882";
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(
        hX - 8 - Math.random() * 20,
        tY - 2 + (Math.random() - 0.5) * 8,
        3 + Math.random() * 4,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Cattle cluster
    ctx.fillStyle = "#8b4513";
    const cowPos: [number, number][] = [
      [0, 0], [-3, -3], [3, -3], [-5, 1], [5, 1], [-2, 3], [2, 3], [0, -5],
    ];
    for (const [dx, dy] of cowPos) {
      ctx.fillRect(hX + dx - 1, tY + dy - 1, 3, 2);
    }
    // Lead steer
    ctx.fillStyle = "#a0522d";
    ctx.fillRect(hX + 7, tY - 2, 4, 3);
    ctx.fillStyle = "#d4c8a0";
    ctx.fillRect(hX + 6, tY - 4, 1, 2);
    ctx.fillRect(hX + 12, tY - 4, 1, 2);

    // Stars
    ctx.fillStyle = "#fff";
    ctx.globalAlpha = 0.4;
    for (let i = 0; i < 20; i++) {
      ctx.fillRect((42 * (i + 1) * 7) % w, (42 * (i + 1) * 3) % (gY - 10), 1, 1);
    }
    ctx.globalAlpha = 1;
  }, [progress]);

  return (
    <canvas
      ref={ref}
      width={400}
      height={100}
      className="w-full rounded border border-stone-700"
      style={{ imageRendering: "pixelated" }}
    />
  );
}

// ═══════════════════════════════════════════════════════════════
// ENGINE HELPERS
// ═══════════════════════════════════════════════════════════════

function clamp(v: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

function weightedPick<T extends { weight?: number }>(items: T[]): T {
  const total = items.reduce((s, i) => s + (i.weight || 1), 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight || 1;
    if (r <= 0) return item;
  }
  return items[0];
}

function resolveChoice(
  choice: Choice
): { effects?: Resources; result?: string; earlyEnd?: boolean } {
  if (choice.outcomes) return weightedPick(choice.outcomes);
  return { effects: choice.effects, result: choice.result, earlyEnd: choice.earlyEnd };
}

function pickEvent(
  day: number,
  totalDays: number,
  usedIds: Set<string>,
  events: GameEvent[]
): GameEvent | null {
  const pct = day / totalDays;
  const eligible = events.filter(
    (e) => pct >= e.phase_min && pct <= e.phase_max && !usedIds.has(e.id)
  );
  const pool =
    eligible.length > 0
      ? eligible
      : events.filter((e) => pct >= e.phase_min && pct <= e.phase_max);
  if (pool.length === 0) return null;
  return weightedPick(pool);
}

function clampResource(key: string, val: number): number {
  const maxes: Record<string, number> = { herd: 2500, crew: 12, horses: 60 };
  return clamp(val, 0, maxes[key] || 100);
}

// ═══════════════════════════════════════════════════════════════
// ALL 16 EVENTS
// ═══════════════════════════════════════════════════════════════

const EVENTS: GameEvent[] = [
  {
    id: "river_crossing_early", phase_min: 0, phase_max: 0.3, weight: 5,
    title: "River Crossing \u2014 The Brazos",
    text: "The Brazos is running high from spring rains. Brown water churning fast with debris. Your scout found two options: a wide shallow ford half a day east, or the narrow deep crossing right here.",
    choices: [
      { text: "Take the wide ford. Half a day lost but safer.", outcomes: [
        { weight: 6, effects: { herdCondition: -2 }, result: "The wide ford works. Water up to the cattle\u2019s bellies but they cross steady. Boring success \u2014 the best kind." },
        { weight: 4, effects: { herd: -30, herdCondition: -4, horses: -2 }, result: "The \u2018safe\u2019 ford has a sinkhole. Lead cattle drop into chest-deep water and panic. Thirty head drown. Two horses go down. The safe option wasn\u2019t." },
      ]},
      { text: "Cross here. Deep but narrow \u2014 fast.", outcomes: [
        { weight: 5, effects: { herd: -60, morale: -6, horses: -3 }, result: "Too deep. Current catches the middle of the herd. Sixty head gone. Three horses broke legs on the rocky bottom." },
        { weight: 5, effects: { herd: -8, morale: 4 }, result: "Your lead steer walks straight in and the herd follows like Moses parted it. Eight head swept away, rest safe." },
      ]},
      { text: "Wait a day. Let the river drop.", outcomes: [
        { weight: 5, effects: { supplies: -4, herdCondition: 3, herd: -5 }, result: "River drops overnight. Easy crossing. The herd grazed on good grass while you waited. Patience pays." },
        { weight: 5, effects: { supplies: -4, herd: -80, morale: -8 }, result: "It rains again. River rises. You wait another day. Cross in the worst conditions yet. Eighty head gone." },
      ]},
    ],
  },
  {
    id: "stampede_night", phase_min: 0, phase_max: 0.8, weight: 5,
    title: "Stampede \u2014 Lightning",
    text: "Thunder at 2 AM. A bolt hits close and 2,500 longhorns explode in every direction. Your night riders are already in the saddle.",
    choices: [
      { text: "Ride to the front. Turn the leaders.", outcomes: [
        { weight: 5, effects: { herd: -40, horses: -2, morale: -3 }, result: "You turn them into a wide circle by dawn. Forty head over a bluff. Two horses done. But the main herd holds." },
        { weight: 3, effects: { herd: -15, morale: 5, herdCondition: -3 }, result: "Your best rider turns the lead steer hard. The herd wheels like a school of fish. Fifteen head scattered. That kid just earned a bonus." },
        { weight: 2, effects: { herd: -20, crew: -1, morale: -10, horses: -1 }, result: "A horse hits a prairie dog hole at full gallop in the dark. Horse and rider go down in the path of the stampede. Nobody says his name yet." },
      ]},
      { text: "Hold position. Protect the camp and remuda.", effects: { herd: -150, morale: -5 }, result: "You let them run. Camp safe, horses safe. Two days gathering cattle across fifteen miles. A hundred fifty head just gone." },
      { text: "Get every rider out singing to calm them.", outcomes: [
        { weight: 4, effects: { herd: -20, morale: 3, herdCondition: -2 }, result: "Cowboys singing \u2018Lorena\u2019 in a thunderstorm. The lead cattle slow. Twenty head gone, but the herd settles fast." },
        { weight: 6, effects: { herd: -100, morale: -6, herdCondition: -5 }, result: "Too far gone. Singing doesn\u2019t stop a full stampede. Herd splits three ways. A hundred head scattered." },
      ]},
    ],
  },
  {
    id: "water_scarce", phase_min: 0.2, phase_max: 0.7, weight: 5,
    title: "Dry Country",
    text: "Last water was two days ago. Scout says dry creek beds for another day, maybe two. The cattle are bawling. Thirsty cattle are stupid cattle.",
    choices: [
      { text: "Push through fast.", outcomes: [
        { weight: 5, effects: { herd: -50, herdCondition: -8, morale: -4, horses: -3 }, result: "Cattle stagger. Calves drop. Three horses go lame. Hit a spring-fed pool late next day. Fifty head didn\u2019t make it." },
        { weight: 5, effects: { herd: -20, herdCondition: -4, morale: 3 }, result: "Longhorns find a gear you didn\u2019t know they had. Scout signals river ahead by evening. Twenty lost to heat. The rest drink." },
      ]},
      { text: "Slow down. Conserve strength, look for water.", outcomes: [
        { weight: 4, effects: { supplies: -6, herd: -30, herdCondition: -3, morale: -5 }, result: "Extra day in dry country means extra day of suffering. Thirty dead. Cook\u2019s furious about water rations." },
        { weight: 6, effects: { herdCondition: -2, supplies: -3, herd: -8, morale: 4 }, result: "Scout finds an underground seep. Not much, but enough. Eight head lost. The herd arrives at water in decent shape." },
      ]},
      { text: "Night drive. Move in the cool, rest in the heat.", outcomes: [
        { weight: 5, effects: { herd: -25, morale: -5, herdCondition: -3 }, result: "Driving at night through unknown country. Twenty-five walk off a cutbank in the dark. But cool air saves the rest." },
        { weight: 5, effects: { herd: -10, morale: 2, herdCondition: 1, horses: -1 }, result: "It works. Cool air calms the herd. One horse lame. By dawn you see trees \u2014 water. Cowboys grin through dust." },
      ]},
    ],
  },
  {
    id: "rustlers", phase_min: 0.3, phase_max: 0.8, weight: 4,
    title: "Riders on the Ridge",
    text: "Eight, maybe ten riders pacing your herd from a mile out. Could be another outfit. Could be Comancheros. They haven\u2019t approached but they haven\u2019t left.",
    choices: [
      { text: "Arm up and ride out. Show strength.", outcomes: [
        { weight: 5, effects: { morale: 5, herdCondition: -2 }, result: "Lost outfit, not rustlers. They tip their hats and move on. Show of strength unnecessary, but your crew feels ten feet tall." },
        { weight: 5, effects: { morale: -3, crew: -1, supplies: -2 }, result: "They scatter but one puts a rifle shot through your flank rider\u2019s shoulder. He\u2019ll live but he can\u2019t ride." },
      ]},
      { text: "Circle tight and post extra guards.", effects: { herdCondition: -4, morale: -3, supplies: -2 }, result: "They watch until sundown, then disappear. You\u2019ll never know what they were. Lost a day holding position." },
      { text: "Ignore them. Keep driving.", outcomes: [
        { weight: 4, effects: { herd: -200, morale: -12, horses: -4 }, result: "They hit at dawn. Six riders cut 200 head off the back. Your boys chase but they\u2019re outgunned. Gone." },
        { weight: 6, effects: { morale: 2 }, result: "They drift away by evening. Just ghosts of the prairie. The thing you feared just... didn\u2019t happen." },
      ]},
    ],
  },
  {
    id: "crew_quit", phase_min: 0.3, phase_max: 0.7, weight: 4,
    title: "Two Hands Give Notice",
    text: "Two cowboys say they\u2019re done. Not hostile \u2014 just honest. They heard there\u2019s ranch work in Wichita that doesn\u2019t involve sleeping in mud.",
    choices: [
      { text: "Let them go.", effects: { crew: -2, morale: -3 }, result: "They ride out at dawn. Everyone left is thinking: should I have gone too? But the men who stayed chose to stay." },
      { text: "Offer double wages.", outcomes: [
        { weight: 6, effects: { supplies: -5, morale: 3 }, result: "They shrug. Double pay keeps them. Supply budget takes a hit, but twelve hands is twelve hands." },
        { weight: 4, effects: { crew: -2, morale: -6 }, result: "\u2018It ain\u2019t about money, boss.\u2019 They ride out. The rest heard the offer AND the refusal." },
      ]},
      { text: "Remind them they signed a contract.", effects: { morale: -8 }, result: "They stay. They do the minimum. A man kept against his will works like one. Twelve bodies, ten cowboys." },
    ],
  },
  {
    id: "indian_territory", phase_min: 0.4, phase_max: 0.7, weight: 5,
    title: "Indian Territory",
    text: "A rider approaches. You\u2019re crossing Nations land. They charge ten cents a head \u2014 their legal right. Your crew doesn\u2019t see it that way.",
    choices: [
      { text: "Pay the toll. It\u2019s their land.", effects: { morale: -3, herdCondition: 2, herd: -250 }, result: "250 head equivalent. Nations riders escort you to the border with pro courtesy, good water crossings pointed out. The toll bought intelligence." },
      { text: "Negotiate. Offer five cents.", outcomes: [
        { weight: 5, effects: { morale: 1, herdCondition: 1, herd: -175 }, result: "Seven cents. 175 head. Fair. You saved 75 head and showed respect." },
        { weight: 5, effects: { morale: -5, herdCondition: -3, herd: -50, supplies: -4 }, result: "\u2018The price is the price.\u2019 No escort. Bad river crossing two days later. Fifty head lost. The toll was cheaper than ignorance." },
      ]},
      { text: "Refuse. Push through.", outcomes: [
        { weight: 3, effects: { morale: 4, herdCondition: -4 }, result: "Nothing happens. Maybe they\u2019re reporting you to territorial authorities. Your crew cheers like they won something. They didn\u2019t." },
        { weight: 7, effects: { herd: -300, morale: -8, horses: -5, crew: -1, herdCondition: -6 }, result: "Ambush at a river crossing. 300 head driven south. A cowboy takes an arrow. You lost more than the toll ten times over." },
      ]},
    ],
  },
  {
    id: "cook_wagon", phase_min: 0.1, phase_max: 0.6, weight: 4,
    title: "Busted Axle",
    text: "Chuck wagon\u2019s rear axle snaps. Supplies scatter. Without that wagon: no coffee, no beans, no hot food.",
    choices: [
      { text: "Full stop. Repair. Whole day.", effects: { supplies: -3, herdCondition: -3, morale: 1 }, result: "Cottonwood replacement axle. Rough but holds. Lost fifteen miles but the cook makes coffee and the crew forgives." },
      { text: "Rig a temporary fix. Keep moving.", outcomes: [
        { weight: 5, effects: { morale: -2, supplies: -2 }, result: "Holds for three days then fails in a creek. Half your flour ruined. Every temp fix is weaker." },
        { weight: 5, effects: { morale: 2 }, result: "Holds all the way to the next trading post. Sometimes the quick fix is the right fix." },
      ]},
      { text: "Abandon the wagon. Pack what you can on horses.", effects: { supplies: -15, morale: -10, horses: -3 }, result: "No hot food. No coffee. Cold jerky and creek water for every meal. Morale drops like a stone. This is survival now." },
    ],
  },
  {
    id: "good_grass", phase_min: 0.1, phase_max: 0.8, weight: 3,
    title: "Paradise Valley",
    text: "Scout found belly-high bluestem and a clean creek. Perfect grazing. Rest here and the herd fattens \u2014 but another outfit might beat you to Abilene.",
    choices: [
      { text: "Two days\u2019 rest.", effects: { herdCondition: 10, morale: 6, supplies: -5, horses: 2 }, result: "The closest thing to heaven. Herd grazes round. Cowboys wash clothes. Cook finds wild onions. Nobody\u2019s miserable." },
      { text: "One day. Split the difference.", effects: { herdCondition: 5, morale: 3, supplies: -3 }, result: "Not enough to fully recover, but enough to take the edge off. Everything looks a little better." },
      { text: "Keep moving.", outcomes: [
        { weight: 5, effects: { morale: -6, herdCondition: -2 }, result: "Crew watches it slide past. Some weep. Some curse you. You\u2019ll never know if stopping was the right call." },
        { weight: 5, effects: { morale: -3, herdCondition: -1 }, result: "An hour later there\u2019s a crossing to manage and they forget. The next problem erases the last complaint." },
      ]},
    ],
  },
  {
    id: "river_red", phase_min: 0.35, phase_max: 0.55, weight: 5,
    title: "The Red River",
    text: "The big one. Quarter mile wide and deep. This is where drives die. Every outfit has a story. Most are bad.",
    choices: [
      { text: "Scout downstream for better crossing.", outcomes: [
        { weight: 5, effects: { supplies: -4, herd: -15, herdCondition: -1 }, result: "Wider, shallower crossing found. Sandbars break the current. Fifteen lost. Patience paid." },
        { weight: 5, effects: { supplies: -6, morale: -3, herd: -40 }, result: "Nothing better downstream. River\u2019s now rising. Cross in worse conditions. Forty head gone." },
      ]},
      { text: "Cross here and now.", outcomes: [
        { weight: 4, effects: { herd: -80, morale: -6, horses: -4, crew: -1 }, result: "Chaos. Bodies in the current. One cowboy doesn\u2019t get free. Eighty head gone. The Red earned its name." },
        { weight: 6, effects: { herd: -25, morale: 4 }, result: "Lead steer swims straight. Herd follows. Twenty-five lost to current. Crew whoops on the far bank." },
      ]},
      { text: "Wait for another outfit to cross first. Watch and learn.", outcomes: [
        { weight: 5, effects: { supplies: -5, herd: -10, morale: 2 }, result: "Watch every mistake they make. Cross clean. Ten head lost \u2014 practically a miracle for the Red." },
        { weight: 5, effects: { supplies: -8, morale: -5, herdCondition: -3 }, result: "No other outfit comes. Two days wasted. Cross in the same conditions. Self-reliance is the first law." },
      ]},
    ],
  },
  {
    id: "snakebite", phase_min: 0, phase_max: 0.8, weight: 3,
    title: "Rattler",
    text: "Best roper is down \u2014 diamondback got his ankle. Leg swelling fast, turning purple. Cookie has whiskey and a knife. That\u2019s frontier medicine.",
    choices: [
      { text: "Cut and suck. All you\u2019ve got.", outcomes: [
        { weight: 5, effects: { morale: -3, crew: -1 }, result: "Not enough. Poison\u2019s in the blood. He dies quiet that night. One less hand. One less friend." },
        { weight: 5, effects: { morale: 2, herdCondition: -2 }, result: "Three days in the wagon with fever. Day four he sits up and asks for coffee. Cook pretends it was skill." },
      ]},
      { text: "Send a rider east for real medicine.", effects: { crew: -1, morale: -2, herdCondition: -3, supplies: -4 }, result: "Down two hands \u2014 one dying, one riding. Medicine arrives too late to matter either way. Right instinct, wrong math." },
      { text: "Tourniquet, whiskey, chuck wagon. Keep driving.", effects: { morale: -1, herdCondition: -2 }, result: "Practical. Cold. He rides in the wagon and either makes it or doesn\u2019t. He makes it. Barely. He\u2019ll tell this story for fifty years." },
    ],
  },
  {
    id: "tornado", phase_min: 0.2, phase_max: 0.7, weight: 3,
    title: "Green Sky",
    text: "Sky turns yellow-green. Your Kansas scout goes white. \u2018Twister weather.\u2019 You can see rotation in the clouds. Maybe fifteen minutes.",
    choices: [
      { text: "Scatter the herd. Spread the target.", outcomes: [
        { weight: 5, effects: { herd: -60, morale: -4, herdCondition: -5 }, result: "Twister hits where the herd was. Sixty head gone but the bulk survived because they weren\u2019t bunched." },
        { weight: 5, effects: { herd: -30, morale: 4 }, result: "Twister misses by a mile. Thirty head bolt. Rest stand confused. Close. Too close." },
      ]},
      { text: "Hold tight. Get to low ground together.", outcomes: [
        { weight: 4, effects: { herd: -200, crew: -1, horses: -6, morale: -12 }, result: "Direct hit on the bunched herd. 200 gone. A cowboy thrown. Six horses killed. You made them an easy target." },
        { weight: 6, effects: { herd: -20, morale: 2, herdCondition: -3 }, result: "Low ground saves you. Twister passes over. Twenty on the fringe caught. Core survives. Lucky everything." },
      ]},
      { text: "Ride south. Get out of its path.", effects: { herd: -40, herdCondition: -6, morale: -5, supplies: -3 }, result: "Cattle fight you every step. Forty scatter. But the twister passes north and you\u2019re alive." },
    ],
  },
  {
    id: "competition", phase_min: 0.3, phase_max: 0.8, weight: 3,
    title: "Competition",
    text: "Dust to the south. Bigger outfit \u2014 3,000 head \u2014 moving fast. They beat you to Abilene, price drops for everyone.",
    choices: [
      { text: "Push hard. Outpace them.", effects: { herdCondition: -8, morale: -3, supplies: -5, horses: -3 }, result: "Twenty-plus miles a day for a week. Cattle drop weight. Cowboys fall asleep in the saddle. But you pull ahead." },
      { text: "Hold pace. Your herd in good shape sells higher.", outcomes: [
        { weight: 6, effects: { morale: -2 }, result: "They pass you. Smug wave. But your cattle are fat. Condition matters as much as timing." },
        { weight: 4, effects: { morale: 3 }, result: "They push too hard. Three days later you pass them \u2014 stopped, gathering after a stampede. Tortoise and the hare." },
      ]},
      { text: "Send a rider ahead to lock in a price early.", effects: { crew: -1, morale: 2 }, result: "Sharpest man, fastest horse, letter of intent. Down a hand but if the advance sale works, you outsmarted a bigger outfit with pen and paper." },
    ],
  },
  {
    id: "prairie_fire", phase_min: 0.1, phase_max: 0.6, weight: 3,
    title: "Smoke on the Horizon",
    text: "Prairie fire \u2014 line of orange to the west, wind pushing it toward you. Miles out but fire on dry grass moves faster than cattle.",
    choices: [
      { text: "Set a backfire. Burn a firebreak.", outcomes: [
        { weight: 6, effects: { herd: -20, herdCondition: -3, morale: 2 }, result: "Scout burns a strip. Main fire dies at the edge. Twenty panic and bolt. Professional work." },
        { weight: 4, effects: { herd: -80, morale: -6, herdCondition: -5 }, result: "Backfire gets away from you. Fire on TWO sides. Eighty head gone. Your own fire almost as bad." },
      ]},
      { text: "Drive east. Outflank it.", effects: { herdCondition: -5, morale: -3, supplies: -3, herd: -15 }, result: "Fire slides past. Fifteen scatter in smoke. Two days lost. But alive and unburned." },
      { text: "Find water. Put the herd in a creek bed.", outcomes: [
        { weight: 4, effects: { herd: -5, morale: 5, herdCondition: 2 }, result: "Wide creek found. Herd stands belly-deep while the world burns. Five lost. Perfect." },
        { weight: 6, effects: { herd: -40, morale: -4, herdCondition: -4 }, result: "No creek. Twenty minutes wasted looking. Forty head lost in the smoke. The obvious play beats the clever play." },
      ]},
    ],
  },
  {
    id: "buyer", phase_min: 0.7, phase_max: 0.95, weight: 4,
    title: "A Buyer on the Trail",
    text: "Man in a clean coat from Abilene. $30 a head right now. Market is $40 but that\u2019s two weeks away. Markets fluctuate.",
    choices: [
      { text: "Take the deal. Done today.", effects: { morale: 8 }, result: "$30 a head. Crew cheers \u2014 they\u2019re done. You left $25,000 on the table. But you also left behind everything that could go wrong.", earlyEnd: true },
      { text: "Counter at $35.", outcomes: [
        { weight: 5, effects: { morale: 6 }, result: "\u2018$33.\u2019 You shake. Done today. Smart money is money in your pocket.", earlyEnd: true },
        { weight: 5, effects: { morale: -2 }, result: "He shakes his head. \u2018$30 is the offer. Three herds arrived last week.\u2019 He rides on. Was he bluffing?" },
      ]},
      { text: "Refuse. We didn\u2019t drive 600 miles to settle.", outcomes: [
        { weight: 5, effects: { morale: 4 }, result: "He nods. \u2018Your herd, your call.\u2019 Two weeks will tell." },
        { weight: 5, effects: { morale: -3 }, result: "That night a hand says Abilene prices dropped to $28. Rumor? If you\u2019d taken $30 you\u2019d be done." },
      ]},
    ],
  },
  {
    id: "horse_thief", phase_min: 0.2, phase_max: 0.6, weight: 3,
    title: "Missing Horses",
    text: "Morning count: eight horses gone. Tracks lead northeast. Six-hour head start.",
    choices: [
      { text: "Send riders after them.", outcomes: [
        { weight: 5, effects: { morale: 4, herdCondition: -3 }, result: "They find the horses and the thieves. Gunfire. Horses back. One cowboy shot in the arm \u2014 done riding." },
        { weight: 5, effects: { horses: -8, morale: -2, herdCondition: -4 }, result: "Lost the trail at a creek. Eight horses gone and you burned a day. Fifty-two for the rest of the drive." },
      ]},
      { text: "Let them go.", effects: { horses: -8, morale: -6 }, result: "A trail boss who won\u2019t fight for his remuda. They\u2019re right to question it. But sending men after armed thieves short-handed is a gamble." },
      { text: "Double the watch going forward.", effects: { horses: -8, morale: -4, herdCondition: -2 }, result: "Horses safer but cowboys wrecked from double watches. Traded one problem for another." },
    ],
  },
  {
    id: "fever", phase_min: 0.25, phase_max: 0.7, weight: 3,
    title: "Tick Fever",
    text: "Three dozen head stumbling, eyes glazed. Tick fever. It\u2019ll spread through the whole herd if you don\u2019t act. Healthy cattle and sick cattle can\u2019t share ground.",
    choices: [
      { text: "Cut the sick ones. Leave them behind.", effects: { herd: -36, morale: -2, herdCondition: 4 }, result: "Thirty-six head left standing in the grass. It\u2019s the right call. The fever stops spreading. Doesn\u2019t make it easier." },
      { text: "Slow the drive. Treat them on the move.", outcomes: [
        { weight: 5, effects: { herd: -100, herdCondition: -8, morale: -6, supplies: -4 }, result: "Fever spreads. A hundred head sick or dead. Should have cut them when you had the chance." },
        { weight: 5, effects: { herd: -15, herdCondition: -2, supplies: -4 }, result: "Cook mixes something foul from creek mud and whiskey. Half recover. Fifteen don\u2019t. Cook won\u2019t share the recipe." },
      ]},
      { text: "Push hard through it. Outrun the ticks.", effects: { herdCondition: -6, herd: -50, morale: -4, horses: -2 }, result: "You can\u2019t outrun ticks. Fifty head drop over three days. The healthy cattle are exhausted too." },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const TOTAL_DAYS = 70;
const DAYS_PER_TURN = 5;
const TOTAL_DISTANCE = 800;
const INIT_RESOURCES: Resources = {
  herd: 2500, crew: 12, horses: 60, supplies: 65, morale: 55, herdCondition: 60,
};

const PACE_OPTIONS = [
  { id: "easy", label: "Easy", desc: "10 mi/day \u00b7 Herd fattens", mpd: 10, fx: { herdCondition: 2, morale: 1, supplies: -3 } as Resources },
  { id: "normal", label: "Normal", desc: "15 mi/day \u00b7 Standard", mpd: 15, fx: { herdCondition: -1, morale: -1, supplies: -4 } as Resources },
  { id: "push", label: "Push", desc: "22 mi/day \u00b7 Brutal", mpd: 22, fx: { herdCondition: -5, morale: -4, supplies: -5 } as Resources },
];

function getPhrase(pct: number): string {
  if (pct < 0.15) return "Eight hundred miles of dust and trouble ahead.";
  if (pct < 0.3) return "Days blur. Dust, cattle, sky. Repeat.";
  if (pct < 0.5) return "Indian Territory looms. Crew gets quiet at night.";
  if (pct < 0.7) return "Past halfway. Kansas might be real.";
  if (pct < 0.85) return "Grass is changing. Shorter. Cooler nights.";
  if (pct < 0.95) return "Scout says he can smell Abilene. He\u2019s lying. Not by much.";
  return "The railhead is close. You can almost hear the train.";
}

function getGrade(herd: number, survived: boolean): string {
  if (!survived) return "F";
  const pct = herd / 2500;
  if (pct >= 0.95) return "A";
  if (pct >= 0.88) return "B";
  if (pct >= 0.80) return "C";
  if (pct >= 0.70) return "D";
  return "F";
}

const GRADE_COLORS: Record<string, string> = {
  A: "text-emerald-400", B: "text-blue-400", C: "text-yellow-400",
  D: "text-orange-400", F: "text-red-500",
};

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

const makeInit = (): GameState => ({
  day: 1, turn: 0, resources: { ...INIT_RESOURCES },
  phase: "intro", pace: "normal", distance: 0,
  currentEvent: null, resultText: "", decisions: [],
  gameOver: false, survived: false, earlySale: false,
});

export default function App() {
  const [state, setState] = useState<GameState>(makeInit());
  const [usedEvents, setUsedEvents] = useState<Set<string>>(new Set());

  const start = useCallback(() => {
    setState({ ...makeInit(), phase: "sailing" });
    setUsedEvents(new Set());
  }, []);

  const advanceTurn = useCallback(() => {
    setState((prev) => {
      const s: GameState = { ...prev, resources: { ...prev.resources } };
      s.turn += 1;
      const pace = PACE_OPTIONS.find((p) => p.id === s.pace)!;
      s.distance = Math.min(s.distance + pace.mpd * DAYS_PER_TURN, TOTAL_DISTANCE);
      s.day = Math.min(s.day + DAYS_PER_TURN, TOTAL_DAYS + 1);

      for (const [k, v] of Object.entries(pace.fx)) {
        s.resources[k] = clampResource(k, s.resources[k] + v);
      }
      s.resources.supplies = clamp(
        s.resources.supplies - (s.pace === "push" ? 2 : 1), 0, 100
      );

      // Attrition
      if (s.resources.herdCondition < 20) {
        s.resources.herd = Math.max(
          0, s.resources.herd - Math.ceil(Math.random() * 40) - 20
        );
      } else if (s.resources.herdCondition < 35 && Math.random() < 0.4) {
        s.resources.herd = Math.max(
          0, s.resources.herd - Math.ceil(Math.random() * 15)
        );
      }
      if (s.resources.morale < 15 && Math.random() < 0.3) {
        s.resources.crew = Math.max(0, s.resources.crew - 1);
      }

      // End checks
      if (s.resources.crew <= 2 || s.resources.herd <= 100 || s.resources.horses <= 5) {
        return { ...s, phase: "end" as const, gameOver: true, survived: false };
      }
      if (s.distance >= TOTAL_DISTANCE) {
        return { ...s, phase: "end" as const, gameOver: true, survived: true };
      }

      // Event
      const event = pickEvent(s.day, TOTAL_DAYS, usedEvents, EVENTS);
      if (event) {
        setUsedEvents((prev) => new Set(prev).add(event.id));
        s.currentEvent = event;
        s.phase = "event";
      }
      return s;
    });
  }, [usedEvents]);

  const handleChoice = useCallback((ci: number) => {
    setState((prev) => {
      if (!prev.currentEvent) return prev;
      const s: GameState = {
        ...prev,
        resources: { ...prev.resources },
        decisions: [...prev.decisions],
      };
      const choice = s.currentEvent!.choices[ci];
      const outcome = resolveChoice(choice);
      s.decisions.push({
        event: s.currentEvent!.title,
        choice: choice.text,
        day: s.day,
      });
      if (outcome.effects) {
        for (const [k, v] of Object.entries(outcome.effects)) {
          if (s.resources[k] !== undefined) {
            s.resources[k] = clampResource(k, s.resources[k] + v);
          }
        }
      }
      if (choice.earlyEnd || outcome.earlyEnd) s.earlySale = true;
      s.resultText = outcome.result || "";
      s.phase = "result";
      return s;
    });
  }, []);

  const continueGame = useCallback(() => {
    setState((prev) => {
      const s: GameState = { ...prev, currentEvent: null, resultText: "" };
      if (s.resources.crew <= 2 || s.resources.herd <= 100 || s.resources.horses <= 5) {
        return { ...s, phase: "end" as const, gameOver: true, survived: false };
      }
      if (s.distance >= TOTAL_DISTANCE || s.earlySale) {
        return { ...s, phase: "end" as const, gameOver: true, survived: true };
      }
      s.phase = "sailing";
      return s;
    });
  }, []);

  const r = state.resources;
  const progress = Math.min((state.distance / TOTAL_DISTANCE) * 100, 100);
  const avgStatus = Math.round((r.morale + r.herdCondition) / 2);

  // ── INTRO ──
  if (state.phase === "intro") {
    return (
      <div
        className="min-h-screen bg-stone-900 text-stone-100 flex flex-col items-center justify-center p-4"
        style={{ fontFamily: "'Georgia', serif" }}
      >
        <div className="max-w-md w-full text-center space-y-5">
          <div>
            <h1 className="text-3xl font-bold tracking-wider text-amber-400">
              CAMPAIGNS
            </h1>
            <p className="text-stone-500 text-xs tracking-[0.3em] uppercase mt-1">
              The Chisholm Trail &middot; 1867
            </p>
          </div>
          <TrailMap progress={0} />
          <div className="border border-stone-700 rounded p-4 bg-stone-800/80 text-left space-y-2.5 text-sm text-stone-300 leading-relaxed">
            <p>
              Spring 1867. You&rsquo;re trail boss for a drive from San Antonio
              to Abilene, Kansas &mdash; 800 miles of open prairie, river
              crossings, and Indian Territory.
            </p>
            <p>
              2,500 head of Texas longhorn. Twelve cowboys, a cook, a wrangler,
              and sixty horses. The cattle are worth $4 here. In Abilene, $40.
            </p>
            <p className="text-amber-300 font-bold">
              That&rsquo;s $100,000 at the end of the trail. If you get them
              there.
            </p>
          </div>
          <p className="text-xs text-stone-500 italic">
            Real drives lost 10-15% on average. Can you beat the average?
          </p>
          <button
            onClick={start}
            className="px-6 py-2.5 bg-amber-700 hover:bg-amber-600 text-white font-bold rounded transition-colors tracking-wide"
          >
            HIT THE TRAIL
          </button>
        </div>
      </div>
    );
  }

  // ── END ──
  if (state.phase === "end") {
    const grade = getGrade(r.herd, state.survived);
    const pct = Math.round((r.herd / 2500) * 100);
    return (
      <div
        className="min-h-screen bg-stone-900 text-stone-100 p-4 overflow-auto"
        style={{ fontFamily: "'Georgia', serif" }}
      >
        <div className="max-w-lg mx-auto space-y-5">
          <h1
            className={`text-2xl font-bold text-center ${
              state.survived ? "text-amber-400" : "text-red-500"
            }`}
          >
            {state.survived
              ? state.earlySale
                ? "SOLD ON THE TRAIL"
                : "ABILENE"
              : "THE TRAIL WINS"}
          </h1>
          <TrailMap progress={progress} />
          <p className="text-center text-stone-300 text-sm">
            {state.survived
              ? state.earlySale
                ? `Sold ${r.herd.toLocaleString()} head at $30. Total: $${(
                    r.herd * 30
                  ).toLocaleString()}.`
                : `Delivered ${r.herd.toLocaleString()} head (${pct}%) to Abilene. At $40/head: $${(
                    r.herd * 40
                  ).toLocaleString()}.`
              : "The herd scattered. The trail won."}
          </p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-stone-800 border border-stone-700 rounded p-3 space-y-1.5">
              <h2 className="text-amber-300 font-bold text-xs uppercase tracking-wide text-center">
                Your Drive
              </h2>
              {(
                [
                  ["Started", "2,500"],
                  ["Delivered", r.herd.toLocaleString()],
                  ["Lost", (2500 - r.herd).toLocaleString()],
                  ["Cowboys lost", String(12 - r.crew)],
                ] as [string, string][]
              ).map(([l, v]) => (
                <div key={l} className="flex justify-between text-stone-400">
                  <span>{l}</span>
                  <span className="text-stone-200">{v}</span>
                </div>
              ))}
            </div>
            <div className="bg-stone-800 border border-stone-700 rounded p-3 space-y-1.5">
              <h2 className="text-blue-300 font-bold text-xs uppercase tracking-wide text-center">
                Real Average
              </h2>
              {(
                [
                  ["Herd", "2,000-3,000"],
                  ["Avg loss", "10-15%"],
                  ["Duration", "2-3 months"],
                  ["Price", "$30-40/hd"],
                ] as [string, string][]
              ).map(([l, v]) => (
                <div key={l} className="flex justify-between text-stone-400">
                  <span>{l}</span>
                  <span className="text-stone-200">{v}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="text-center">
            <span className="text-stone-500 text-xs">GRADE </span>
            <span className={`text-4xl font-bold ${GRADE_COLORS[grade]}`}>
              {grade}
            </span>
          </div>
          <div className="bg-stone-800 border border-stone-700 rounded p-3">
            <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wide mb-1">
              The Real Chisholm Trail
            </h3>
            <p className="text-xs text-stone-500 leading-relaxed">
              Between 1867 and 1871, an estimated 1.5 million head were driven
              up the Chisholm Trail. The trail was roughly 800 miles, taking 2-3
              months. River crossings were the deadliest hazard. Cowboys earned
              $25-40/month for work that could kill them any Tuesday. The best
              trail bosses delivered over 90%. Jesse Chisholm himself never drove
              cattle &mdash; he was a trader who wore the path into the grass.
            </p>
          </div>
          {state.decisions.length > 0 && (
            <div className="bg-stone-800 border border-stone-700 rounded p-3 space-y-1">
              <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wide">
                Your Decisions
              </h3>
              {state.decisions.map((d, i) => (
                <p key={i} className="text-xs text-stone-500">
                  <span className="text-stone-600">Day {d.day}:</span>{" "}
                  <span className="text-stone-400">{d.event}</span> &mdash;{" "}
                  {d.choice}
                </p>
              ))}
            </div>
          )}
          <div className="text-center">
            <button
              onClick={() => {
                setState(makeInit());
                setUsedEvents(new Set());
              }}
              className="px-5 py-2 bg-amber-700 hover:bg-amber-600 text-white font-bold rounded transition-colors"
            >
              Ride Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── MAIN GAME ──
  return (
    <div
      className="min-h-screen bg-stone-900 text-stone-100 flex flex-col"
      style={{ fontFamily: "'Georgia', serif" }}
    >
      {/* Trail Map */}
      <div className="bg-stone-800 border-b border-stone-700 p-2">
        <div className="max-w-lg mx-auto">
          <TrailMap progress={progress} />
        </div>
      </div>

      {/* Resources */}
      <div className="bg-stone-800/90 border-b border-stone-700 px-3 py-2">
        <div className="max-w-lg mx-auto">
          <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
            {(
              [
                { icon: "\uD83D\uDC02", l: "Herd", v: r.herd, t: [2000, 1500] },
                { icon: "\uD83E\uDD20", l: "Crew", v: r.crew, t: [9, 6] },
                { icon: "\uD83D\uDC0E", l: "Horses", v: r.horses, t: [40, 20] },
              ] as { icon: string; l: string; v: number; t: number[] }[]
            ).map(({ icon, l, v, t }) => (
              <div key={l} className="flex items-center justify-between">
                <span className="text-stone-400">
                  {icon} {l}
                </span>
                <span
                  className={`font-mono ${
                    v > t[0]
                      ? "text-emerald-400"
                      : v > t[1]
                      ? "text-yellow-400"
                      : "text-red-400"
                  }`}
                >
                  {v > 99 ? v.toLocaleString() : v}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-1.5 space-y-1">
            {(
              [
                { l: "Supplies", v: r.supplies, i: "\uD83C\uDF56" },
                { l: "Morale", v: r.morale, i: "\uD83D\uDD25" },
                { l: "Herd Shape", v: r.herdCondition, i: "\uD83D\uDCAA" },
              ] as { l: string; v: number; i: string }[]
            ).map(({ l, v, i }) => (
              <div key={l} className="flex items-center gap-2 text-xs">
                <span className="w-4 text-center">{i}</span>
                <span className="w-16 text-stone-400">{l}</span>
                <div className="flex-1 bg-stone-700 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      v >= 60
                        ? "bg-emerald-500"
                        : v >= 40
                        ? "bg-yellow-500"
                        : v >= 20
                        ? "bg-orange-500"
                        : "bg-red-600"
                    }`}
                    style={{ width: `${v}%` }}
                  />
                </div>
                <span className="w-6 text-right text-stone-500 font-mono">
                  {v}
                </span>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs text-stone-500 mt-1">
            <span>Day {Math.min(state.day, TOTAL_DAYS)}</span>
            <span>
              {Math.round(state.distance)}/{TOTAL_DISTANCE} mi
            </span>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 p-3 overflow-auto">
        <div className="max-w-lg mx-auto">
          {state.phase === "sailing" && (
            <div className="space-y-3">
              <p className="text-center text-amber-200/80 italic text-sm py-2">
                {getPhrase(state.day / TOTAL_DAYS)}
              </p>
              <div className="flex gap-1.5">
                {PACE_OPTIONS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setState((s) => ({ ...s, pace: p.id }))}
                    className={`flex-1 p-2 rounded text-xs border transition-colors ${
                      state.pace === p.id
                        ? "bg-amber-700 border-amber-600 text-white"
                        : "bg-stone-800 border-stone-600 text-stone-300 hover:bg-stone-700"
                    }`}
                  >
                    <div className="font-bold">{p.label}</div>
                    <div className="opacity-60 mt-0.5" style={{ fontSize: 10 }}>
                      {p.desc}
                    </div>
                  </button>
                ))}
              </div>
              <button
                onClick={advanceTurn}
                className="w-full py-2.5 bg-amber-700 hover:bg-amber-600 text-white font-bold rounded transition-colors"
              >
                Drive On &mdash; {DAYS_PER_TURN} days
              </button>
            </div>
          )}

          {state.phase === "event" && state.currentEvent && (
            <div className="space-y-3">
              <div className="bg-stone-800 border border-amber-800/60 rounded p-3">
                <h2 className="text-amber-400 font-bold mb-2">
                  {state.currentEvent.title}
                </h2>
                <p className="text-stone-300 text-sm leading-relaxed">
                  {state.currentEvent.text}
                </p>
              </div>
              {state.currentEvent.choices.map((c, i) => (
                <button
                  key={i}
                  onClick={() => handleChoice(i)}
                  className="w-full text-left p-2.5 bg-stone-800 border border-stone-600 rounded hover:border-amber-500 transition-colors text-sm text-stone-200"
                >
                  {c.text}
                </button>
              ))}
            </div>
          )}

          {state.phase === "result" && (
            <div className="space-y-3">
              <div className="bg-stone-800 border border-stone-700 rounded p-3">
                <h2 className="text-amber-400 font-bold mb-2">
                  {state.currentEvent?.title}
                </h2>
                <p className="text-stone-300 text-sm leading-relaxed">
                  {state.resultText}
                </p>
              </div>
              <button
                onClick={continueGame}
                className="w-full py-2.5 bg-stone-700 hover:bg-stone-600 text-white font-bold rounded transition-colors"
              >
                Continue
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Crew Faces HUD */}
      <div className="bg-stone-800 border-t border-stone-700 p-2">
        <div className="max-w-lg mx-auto grid grid-cols-6 gap-1">
          {(
            [
              { set: "boss", label: "Boss", val: avgStatus },
              { set: "scout", label: "Scout", val: r.morale },
              { set: "cook", label: "Cookie", val: r.supplies },
              { set: "wrangler", label: "Wrangler", val: (r.horses / 60) * 100 },
              { set: "point", label: "Point", val: r.herdCondition },
              { set: "hand", label: "Crew", val: (r.crew / 12) * 100 },
            ] as { set: string; label: string; val: number }[]
          ).map(({ set, label, val }) => {
            const fs = getFaceState(FACE_SETS[set], val);
            return (
              <div key={set} className="flex flex-col items-center gap-0.5">
                <PixelFace spriteData={fs.sprite} size={48} />
                <span className="text-stone-400" style={{ fontSize: 9 }}>
                  {label}
                </span>
                <span className="text-stone-500" style={{ fontSize: 8 }}>
                  {fs.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
