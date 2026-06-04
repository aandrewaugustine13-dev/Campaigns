import { useState, type CSSProperties } from "react";
import type { CampaignImageTreatment } from "../campaigns/treatments";
import { truncateCredit } from "../lib/attribution";

// ════════════════════════════════════════════════════════════════
// CampaignImage — the per-campaign visual treatment layer.
//
// Every sourced / public-domain image in a campaign should render
// through this component so a campaign's heterogeneous art reads as
// one designed game instead of a scrapbook. It applies framing and
// treatment ONLY (grade/tint, frame, grain, vignette, crop, caption)
// and NEVER alters the underlying image content.
//
// Pass `treated={false}` to bypass all treatment and render the raw,
// legacy image — used for trivial raw-vs-treated A/B comparison.
//
// TODO[delegate]: VisualNovelEngine still renders event "scene"
// images itself (a backgroundImage cover div plus its own
// attribution caption). It should be migrated to delegate to
// CampaignImage too — passing the event's CommonsImage as `meta` and
// the active campaign's treatment — so VN event cards pick up the
// same framed/toned look. Left out of this change to keep the diff
// scoped to the Crusade panels.
// ════════════════════════════════════════════════════════════════

export interface CampaignImageMeta {
  /** Source/license metadata for the attribution caption. */
  artist?: string;
  license?: string;
  sourceUrl?: string;
  title?: string;
}

interface CampaignImageProps {
  /** Raw image source (unchanged; content is never modified). */
  src: string;
  /** Campaign treatment config describing the look. */
  treatment: CampaignImageTreatment;
  /** Source/license metadata rendered as an attribution caption. */
  meta?: CampaignImageMeta;
  alt?: string;
  /** Toggle the treatment off to compare raw vs treated. Default true. */
  treated?: boolean;
  className?: string;
}

// Inline fractal-noise grain so the treatment is self-contained and
// needs no extra asset or global CSS.
const GRAIN_DATA_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

// Shared dashed "missing art" fallback so a missing asset is obvious,
// not silently hidden. Reused in both raw and treated modes.
function MissingArt({ src, fill }: { src: string; fill?: boolean }) {
  return (
    <div
      className={
        fill
          ? "absolute inset-0 flex items-center justify-center bg-stone-800"
          : "w-full h-48 rounded border-2 border-dashed border-stone-600 bg-stone-800 flex items-center justify-center"
      }
    >
      <div className="text-center px-3">
        <div className="text-stone-400 text-xs font-bold uppercase tracking-wider">Missing art</div>
        <div className="text-stone-500 text-[10px] font-mono mt-1 break-all">{src}</div>
      </div>
    </div>
  );
}

function Caption({ meta, treatment }: { meta: CampaignImageMeta; treatment: CampaignImageTreatment }) {
  const { align = "left", muted = "#a8a29e", link = "#d6d3d1" } = treatment.caption;
  const parts: string[] = [];
  if (meta.artist) parts.push(truncateCredit(meta.artist));
  if (meta.license) parts.push(meta.license);
  return (
    <figcaption
      className="leading-tight mt-1 px-0.5"
      style={{ fontSize: "11px", color: muted, textAlign: align }}
    >
      {parts.join(" · ")}
      {meta.sourceUrl && (
        <>
          {parts.length > 0 ? " · " : ""}
          <a
            href={meta.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
            style={{ color: link }}
          >
            Source
          </a>
        </>
      )}
    </figcaption>
  );
}

export default function CampaignImage({
  src,
  treatment,
  meta,
  alt = "",
  treated = true,
  className,
}: CampaignImageProps) {
  const [failed, setFailed] = useState(false);
  const hasCaption = !!(meta && (meta.artist || meta.license || meta.sourceUrl));

  // ── Raw mode: reproduce the legacy plain image exactly so the A/B
  // toggle compares treatment-only differences. ───────────────────
  if (!treated) {
    return (
      <figure className={className} style={{ margin: 0 }}>
        {failed ? (
          <MissingArt src={src} />
        ) : (
          <img
            src={src}
            alt={alt}
            onError={() => setFailed(true)}
            className="w-full h-48 object-cover rounded border border-stone-700 bg-stone-950"
          />
        )}
        {hasCaption && <Caption meta={meta!} treatment={treatment} />}
      </figure>
    );
  }

  // ── Treated mode ────────────────────────────────────────────────
  const { grade, frame, texture, crop } = treatment;

  const frameStyle: CSSProperties = {
    background: frame.background ?? "transparent",
    padding: frame.padding ?? 0,
    borderWidth: frame.borderWidth ?? 0,
    borderColor: frame.borderColor,
    borderStyle: frame.borderStyle ?? "solid",
    borderRadius: frame.radius ?? 0,
    boxShadow: frame.boxShadow,
  };

  const cropStyle: CSSProperties = {
    position: "relative",
    overflow: "hidden",
    borderRadius: Math.max((frame.radius ?? 0) - 1, 0),
    boxShadow: frame.innerLine ? `inset 0 0 0 1px ${frame.innerLine}` : undefined,
    ...(crop.aspectRatio
      ? { aspectRatio: crop.aspectRatio }
      : { height: crop.heightPx ?? 192 }),
  };

  const imgStyle: CSSProperties = {
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: crop.objectPosition ?? "center",
    filter: grade.filter && grade.filter !== "none" ? grade.filter : undefined,
  };

  const tint = grade.tint;
  const tintStyle: CSSProperties | null = tint
    ? {
        position: "absolute",
        inset: 0,
        background: `linear-gradient(${tint.angle ?? 160}deg, ${tint.highlight}, ${tint.shadow})`,
        mixBlendMode: (tint.blendMode ?? "soft-light") as CSSProperties["mixBlendMode"],
        opacity: tint.opacity ?? 0.6,
        pointerEvents: "none",
      }
    : null;

  const grainStyle: CSSProperties | null =
    texture.grain && texture.grain > 0
      ? {
          position: "absolute",
          inset: 0,
          backgroundImage: GRAIN_DATA_URI,
          backgroundRepeat: "repeat",
          mixBlendMode: "overlay",
          opacity: texture.grain,
          pointerEvents: "none",
        }
      : null;

  const vignetteStyle: CSSProperties | null =
    texture.vignette && texture.vignette > 0
      ? {
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,${texture.vignette}) 100%)`,
          pointerEvents: "none",
        }
      : null;

  return (
    <figure className={className} style={{ margin: 0 }}>
      <div style={frameStyle}>
        <div style={cropStyle}>
          {failed ? (
            <MissingArt src={src} fill />
          ) : (
            <>
              <img src={src} alt={alt} onError={() => setFailed(true)} style={imgStyle} />
              {tintStyle && <div style={tintStyle} />}
              {grainStyle && <div style={grainStyle} />}
              {vignetteStyle && <div style={vignetteStyle} />}
            </>
          )}
        </div>
      </div>
      {hasCaption && <Caption meta={meta!} treatment={treatment} />}
    </figure>
  );
}
