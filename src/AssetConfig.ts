// ═══════════════════════════════════════════════════════════════
// ASSET CONFIG — placeholder generators until real sprites exist
// Drop real PNGs into /public/assets/ and update paths here
// ═══════════════════════════════════════════════════════════════

// Face color palettes per role
const FACE_PALETTES: Record<string, { hat: string; skin: string; shirt: string; accent: string }> = {
  boss:     { hat: "#5c3a1e", skin: "#e8b796", shirt: "#4a6741", accent: "#d4a843" },
  scout:    { hat: "#3d2512", skin: "#c4896b", shirt: "#8b2020", accent: "#6b1515" },
  cook:     { hat: "#5c3a1e", skin: "#e8b796", shirt: "#c9a84c", accent: "#a08530" },
  wrangler: { hat: "#7a5230", skin: "#e8b796", shirt: "#4a6741", accent: "#d4a843" },
  point:    { hat: "#5c3a1e", skin: "#c4896b", shirt: "#8b2020", accent: "#6b1515" },
  hand:     { hat: "#5c3a1e", skin: "#e8b796", shirt: "#4a6741", accent: "#364d30" },
};

// Generate a simple pixel face as a data URL
function generateFace(roleId: string, health: number): string {
  const p = FACE_PALETTES[roleId] || FACE_PALETTES.boss;
  const s = 48;
  const px = 3; // pixel size (48/16 = 3px per logical pixel)

  // Determine expression based on health
  let mouthColor = "#8b3a3a"; // neutral
  let eyeStyle: "normal" | "worried" | "dead" = "normal";
  let mouthStyle: "smile" | "neutral" | "frown" | "grimace" = "neutral";
  
  if (health > 70) { mouthStyle = "smile"; }
  else if (health > 45) { mouthStyle = "neutral"; eyeStyle = "normal"; }
  else if (health > 20) { mouthStyle = "frown"; eyeStyle = "worried"; }
  else { mouthStyle = "grimace"; eyeStyle = "dead"; mouthColor = "#5c1e1e"; }

  // Build SVG pixel art
  const rects: string[] = [];
  const put = (x: number, y: number, color: string) => {
    rects.push(`<rect x="${x * px}" y="${y * px}" width="${px}" height="${px}" fill="${color}"/>`);
  };

  // Hat (rows 0-3)
  for (let x = 4; x <= 11; x++) put(x, 0, p.hat);
  for (let x = 3; x <= 12; x++) put(x, 1, p.hat);
  for (let x = 2; x <= 13; x++) put(x, 2, p.hat);
  for (let x = 2; x <= 13; x++) put(x, 3, p.hat);

  // Face (rows 4-11)
  for (let y = 4; y <= 11; y++) {
    for (let x = 3; x <= 12; x++) put(x, y, p.skin);
  }

  // Eyes (row 6-7)
  if (eyeStyle === "dead") {
    // X eyes
    put(5, 6, "#1a1a2e"); put(6, 7, "#1a1a2e"); put(6, 6, "#1a1a2e"); put(5, 7, "#1a1a2e");
    put(9, 6, "#1a1a2e"); put(10, 7, "#1a1a2e"); put(10, 6, "#1a1a2e"); put(9, 7, "#1a1a2e");
  } else if (eyeStyle === "worried") {
    // Wide eyes
    put(5, 6, "#f0e8dc"); put(6, 6, "#1a1a2e"); put(5, 7, "#1a1a2e");
    put(9, 6, "#f0e8dc"); put(10, 6, "#1a1a2e"); put(10, 7, "#1a1a2e");
    // Worry lines
    put(4, 5, "#c4896b"); put(11, 5, "#c4896b");
  } else {
    // Normal eyes
    put(5, 6, "#f0e8dc"); put(6, 6, "#1a1a2e");
    put(9, 6, "#f0e8dc"); put(10, 6, "#1a1a2e");
  }

  // Nose (row 8-9)
  put(7, 8, "#c4896b"); put(8, 8, "#c4896b");
  put(7, 9, "#c4896b"); put(8, 9, "#c4896b");

  // Mouth (row 10-11)
  if (mouthStyle === "smile") {
    put(6, 10, mouthColor); put(7, 10, mouthColor); put(8, 10, mouthColor); put(9, 10, mouthColor);
    put(5, 10, p.skin); put(10, 10, p.skin);
    put(6, 11, p.skin); put(9, 11, p.skin);
  } else if (mouthStyle === "frown") {
    put(6, 11, mouthColor); put(7, 11, mouthColor); put(8, 11, mouthColor); put(9, 11, mouthColor);
    put(6, 10, p.skin); put(9, 10, p.skin);
  } else if (mouthStyle === "grimace") {
    for (let x = 5; x <= 10; x++) put(x, 10, mouthColor);
    for (let x = 5; x <= 10; x++) put(x, 11, "#5c1e1e");
  } else {
    put(6, 10, mouthColor); put(7, 10, mouthColor); put(8, 10, mouthColor); put(9, 10, mouthColor);
  }

  // Shirt (rows 12-15)
  for (let y = 12; y <= 15; y++) {
    for (let x = 3; x <= 12; x++) put(x, y, p.shirt);
  }
  // Shirt accent
  put(4, 13, p.accent); put(11, 13, p.accent);
  put(4, 14, p.accent); put(11, 14, p.accent);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">${rects.join("")}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Cache generated faces
const faceCache: Record<string, string> = {};

export function getDoomFace(roleId: string, health: number): string {
  // Quantize health to avoid regenerating every frame
  const bucket = health > 70 ? 80 : health > 45 ? 55 : health > 20 ? 30 : 10;
  const key = `${roleId}_${bucket}`;
  if (!faceCache[key]) {
    faceCache[key] = generateFace(roleId, bucket);
  }
  return faceCache[key];
}

// Event background palettes
const EVENT_BG_COLORS: Record<string, { sky: string; ground: string; accent: string }> = {
  river_crossing_early: { sky: "#c4604a", ground: "#5a6640", accent: "#4a88aa" },
  river_red:            { sky: "#cc5533", ground: "#6b5e2a", accent: "#884444" },
  stampede_night:       { sky: "#1a1a3e", ground: "#2a2a1e", accent: "#ffcc44" },
  tornado:              { sky: "#4a6a30", ground: "#5a5a30", accent: "#8aaa44" },
  prairie_fire:         { sky: "#cc5533", ground: "#4a3020", accent: "#ff6622" },
  water_scarce:         { sky: "#e8a060", ground: "#c4a060", accent: "#ffcc44" },
  good_grass:           { sky: "#3a6a9e", ground: "#4a7030", accent: "#7ab4d4" },
  default:              { sky: "#4a2a5c", ground: "#6b5e2a", accent: "#e8a060" },
};

export function getBackgroundForEvent(eventId: string): string {
  const colors = EVENT_BG_COLORS[eventId] || EVENT_BG_COLORS.default;
  const w = 480;
  const h = 320;
  
  // Generate a simple gradient background with terrain silhouette
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${colors.sky}"/>
        <stop offset="100%" stop-color="${colors.accent}"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#sky)"/>
    <rect y="${h * 0.6}" width="${w}" height="${h * 0.4}" fill="${colors.ground}"/>
    <path d="M0,${h * 0.55} Q${w * 0.2},${h * 0.45} ${w * 0.4},${h * 0.55} Q${w * 0.6},${h * 0.48} ${w * 0.8},${h * 0.52} L${w},${h * 0.58} L${w},${h * 0.6} L0,${h * 0.6} Z" fill="${colors.ground}" opacity="0.7"/>
  </svg>`;
  
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
