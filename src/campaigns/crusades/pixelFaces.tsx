import { useRef, useEffect } from "react";
import type { FaceLevel } from "../types";

// ═══════════════════════════════════════════════════════════════
// THIRD CRUSADE — placeholder pixel face palette + sprites
// TODO: real palette and per-role sprite sheets pending art pass.
// Sprites here re-use the Chisholm grid shape so the HUD renders
// during scaffold; replace with crusade-specific sprite strings
// when art lands.
// ═══════════════════════════════════════════════════════════════

export const FC: Record<string, string> = {
  ".": "transparent", s: "#e8c7a8", d: "#b58963", w: "#7a4d33",
  H: "#3a2a1c", h: "#5a3a24", B: "#8b7355", e: "#1a1a2e", W: "#f0e8dc",
  r: "#2d1810", m: "#7a1f1f", M: "#4d1010", g: "#3a4a2a", G: "#243018",
  // crusader-flavoured accents (mail grey, surcoat red, cross-white)
  L: "#9a9a9a", l: "#6b6b6b", X: "#c83232", x: "#7a1818", c: "#e8e8e8",
  C: "#bdbdbd", f: "#2d1810", F: "#1a0d08", t: "#b8d4e8", D: "#c4a882",
  b: "#3a2418", n: "#1f120a", k: "#5c2020",
};

// TODO[art]: replace sprite strings with crusader-specific 16x16 dithered
// portraits. The strings below intentionally mirror the Chisholm grid
// so the DoomHUD renders something during scaffold.
const PLACEHOLDER_HEALTHY =
  "....HHHHHH....." + "...HhHHHHhH...." + "..HhHHHHHHhH..." + "..BBBBBBBBBB..." +
  "...sssssssss..." + "..sssssssssss.." + "..sWesssseWs..." + "..ssesssssess.." +
  "..ssssddsssss.." + "..ssssddsssss.." + "..sfssmmssfs..." + "..sffssmssff..." +
  "...sssssssss..." + "...XsssXsssXs..." + "....LLLLLLL...." + "...lLLLLLLLl...";
const PLACEHOLDER_TIRED =
  "....HHHHHH....." + "...HhHHHHhH...." + "..HhHHHHHHhH..." + "..BBBBBBBBBB..." +
  "...ddsssssdd..." + "..sssssssssss.." + "..dWesssseWd..." + "..ssesssssess.." +
  "..ssssddsssss.." + "..ssssddsssss.." + "..sfssmmssfs..." + "..sffsssssff..." +
  "...sssssssss..." + "...XsssXsssXs..." + "....LLLLLLL...." + "...lLLLLLLLl...";
const PLACEHOLDER_HURT =
  "....HHHHHH....." + "...HhHHHHhH...." + "..HhHHHHHHhH..." + "..BBBBBBBBBB..." +
  "...ddsssssdd..." + "..ddsssssssdd.." + "..dWesssseWd..." + "..ssesssssess.." +
  "..xsssddsssxs.." + "..ssssddsssss.." + "..sfsMMMssfs..." + "..sffsssssff..." +
  "...sssssssss..." + "...wssssssswt.." + "....llllLll...." + "...lllllllll...";
const PLACEHOLDER_CRITICAL =
  "....HHHHHH....." + "...HhHHHHhH...." + "..HhHHHHHHhH..." + "..BBBBBBBBBB..." +
  "...xxsssssxx..." + "..xxsssssssxx.." + "..xWesssseWx..." + "..ssesssssess.." +
  "..xkssddssskx.." + "..ssssddsssss.." + "..sfMMMMMsfs..." + "..sFfsssssFs..." +
  "...wswswswsw..." + "...wssssssswt.." + "....lllllll...." + "...lllllllll...";

const PLACEHOLDER_SET: FaceLevel[] = [
  { threshold: 70, sprite: PLACEHOLDER_HEALTHY, label: "Steady" },
  { threshold: 45, sprite: PLACEHOLDER_TIRED, label: "Weary" },
  { threshold: 20, sprite: PLACEHOLDER_HURT, label: "Wounded" },
  { threshold: 0, sprite: PLACEHOLDER_CRITICAL, label: "Failing" },
];

// Six DoomHUD party members for Sir Hugh of Warwick's household.
export const FACES: Record<string, FaceLevel[]> = {
  captain: PLACEHOLDER_SET,     // Sir Hugh of Warwick
  sergeant: PLACEHOLDER_SET,    // veteran serjeant
  manAtArms: PLACEHOLDER_SET,   // mailed man-at-arms
  archer: PLACEHOLDER_SET,      // English longbowman
  squire: PLACEHOLDER_SET,      // young squire
  chaplain: PLACEHOLDER_SET,    // household chaplain
};

export function gf(set: FaceLevel[], v: number): FaceLevel {
  for (const f of set) { if (v >= f.threshold) return f; }
  return set[set.length - 1];
}

export function PixelFace({ spriteData, size = 48 }: { spriteData: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return; const ctx = c.getContext("2d")!; const px = size / 16;
    ctx.clearRect(0, 0, size, size);
    for (let i = 0; i < spriteData.length; i++) {
      const ch = spriteData[i]; if (ch === "." || ch === " ") continue;
      const color = FC[ch]; if (!color || color === "transparent") continue;
      ctx.fillStyle = color; ctx.fillRect((i % 16) * px, Math.floor(i / 16) * px, px, px);
    }
  }, [spriteData, size]);
  return <canvas ref={ref} width={size} height={size} style={{ imageRendering: "pixelated", width: size, height: size }} />;
}
