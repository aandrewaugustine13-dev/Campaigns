// ════════════════════════════════════════════════════════════════
// CAMPAIGN VISUAL TREATMENTS
//
// A treatment is a plain data object that describes how a single
// campaign's images should be framed and toned so its heterogeneous
// public-domain art reads as one designed game. A new campaign look
// is a new config here — not new component code. Treatments control
// framing/treatment ONLY and never touch image content.
//
// Consumed by <CampaignImage>, which interprets these fields into
// CSS. Keep everything here serialisable (no functions / JSX).
// ════════════════════════════════════════════════════════════════

export interface CampaignImageTreatment {
  /** Stable id, e.g. "crusade". */
  id: string;
  /** Human label for debug / config pickers. */
  label: string;

  /** Color grade: a raw image filter plus an optional duotone wash. */
  grade: {
    /** CSS filter applied directly to the <img> (e.g. sepia/contrast). */
    filter?: string;
    /** Duotone / wash overlay toned to the era and culture. */
    tint?: {
      /** Color mapped onto the light tones. */
      highlight: string;
      /** Color mapped onto the dark tones. */
      shadow: string;
      /** Blend mode for the wash. Default "soft-light". */
      blendMode?: string;
      /** 0..1 strength of the wash. */
      opacity?: number;
      /** Gradient angle in degrees. */
      angle?: number;
    };
  };

  /** Frame / border treatment around the image plate. */
  frame: {
    /** Matte color shown in the padding between frame and image. */
    background?: string;
    /** Matte width in px (passe-partout). */
    padding?: number;
    borderWidth?: number;
    borderColor?: string;
    borderStyle?: string;
    radius?: number;
    /** Optional inner hairline (e.g. an illuminated gold rule). */
    innerLine?: string;
    boxShadow?: string;
  };

  /** Grain and vignette intensities (0..1). */
  texture: {
    grain?: number;
    vignette?: number;
  };

  /** Default crop / aspect for the plate. */
  crop: {
    /** CSS aspect-ratio string, e.g. "3 / 2". Wins over heightPx. */
    aspectRatio?: string;
    /** Fixed plate height in px when no aspect ratio is set. */
    heightPx?: number;
    objectPosition?: string;
  };

  /** Where the source + license caption sits, and its colors. */
  caption: {
    position?: "below" | "overlay";
    align?: "left" | "center" | "right";
    muted?: string;
    link?: string;
  };
}

// ── Neutral default — close to a plain framed image. The baseline a
// campaign starts from before it gets its own era treatment. ───────
export const NEUTRAL_TREATMENT: CampaignImageTreatment = {
  id: "neutral",
  label: "Neutral default",
  grade: {
    filter: "none",
  },
  frame: {
    background: "transparent",
    padding: 0,
    borderWidth: 1,
    borderColor: "#57534e",
    borderStyle: "solid",
    radius: 6,
    boxShadow: "none",
  },
  texture: {
    grain: 0,
    vignette: 0.18,
  },
  crop: {
    aspectRatio: "3 / 2",
    objectPosition: "center",
  },
  caption: {
    position: "below",
    align: "left",
    muted: "#a8a29e",
    link: "#d6d3d1",
  },
};

// ── Crusade — Third Crusade, Levantine: a manuscript-and-stone
// palette. Warm parchment/gold highlights against cold iron-stone
// shadows, aged-bronze frame with an illuminated inner rule, soft
// grain and a heavy vignette like a plate in an old chronicle. ─────
export const CRUSADE_TREATMENT: CampaignImageTreatment = {
  id: "crusade",
  label: "Third Crusade — manuscript & stone",
  grade: {
    filter: "sepia(0.42) saturate(0.78) contrast(1.06) brightness(0.95)",
    tint: {
      highlight: "#e7d2a0", // parchment / gold leaf
      shadow: "#23303a", // cold Levantine iron-stone
      blendMode: "soft-light",
      opacity: 0.7,
      angle: 160,
    },
  },
  frame: {
    background: "#1a140d", // dark matte behind the plate
    padding: 7,
    borderWidth: 3,
    borderColor: "#7c5c33", // aged bronze
    borderStyle: "solid",
    radius: 3,
    innerLine: "rgba(220,184,120,0.45)", // illuminated gold rule
    boxShadow: "0 6px 18px rgba(0,0,0,0.5)",
  },
  texture: {
    grain: 0.14,
    vignette: 0.5,
  },
  crop: {
    aspectRatio: "3 / 2",
    objectPosition: "center",
  },
  caption: {
    position: "below",
    align: "left",
    muted: "#b79b6d",
    link: "#e0b24d",
  },
};

export const TREATMENTS: Record<string, CampaignImageTreatment> = {
  neutral: NEUTRAL_TREATMENT,
  crusade: CRUSADE_TREATMENT,
};
