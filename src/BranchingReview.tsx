import { useState, useEffect, useRef } from "react";
import type { BranchingStory, BranchingPassage } from "../generator/branchingStory";
import { ArrowLeft, ArrowRight, AlertTriangle, ImageIcon, BookOpen } from "lucide-react";
import { StudioButton, StudioBadge, studio } from "./components/studio";

// Client wrapper around the server-side /api/branching-images.
// The server uses the project's real searchCommonsFileRanked (with proper
// token scoring, license filtering, and ranking). We always pass the full
// story topic as context so results stay relevant even if passage text is
// very story-like / narrative. Multiple fallback queries on the server help
// when direct text match is weak (e.g. "photo of the actual fort").
async function searchHistoricalImages(params: {
  topic?: string;
  standard?: string;
  passageText: string;
  /** thumbUrls already shown in this session — the server skips them so each
   * passage's candidates stay unique across the whole campaign. */
  excludeUrls?: string[];
}): Promise<Array<{ thumbUrl: string; label: string; sourceUrl?: string; artist?: string; license?: string }>> {
  try {
    const res = await fetch('/api/branching-images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // The REAL historical subject (the teacher's topic/standard from the gate)
        // is the query source — NOT the fictional story title/protagonist/prose,
        // which return zero Commons hits (first-person fiction has no searchable
        // nouns). The passage text is still sent for real place/event extraction.
        topic: params.topic,
        standard: params.standard,
        text: params.passageText,
        excludeUrls: params.excludeUrls || [],
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.images || []).map((img: any) => ({
      thumbUrl: img.thumbUrl,
      label: img.label || (img.searchQuery ? img.searchQuery.slice(0, 60) : 'Historical image'),
      sourceUrl: img.sourceUrl,
      artist: img.artist,
      license: img.license, // carry the REAL Commons license (mixed pool: PD/CC0/CC-BY/CC-BY-SA)
    }));
  } catch {
    return [];
  }
}

interface BranchingReviewProps {
  story: BranchingStory;
  /** The REAL historical subject the teacher entered at the gate — the source of
   * the image search query (the story's own title/protagonist are fiction and
   * return nothing from Commons). */
  topic?: string;
  standard?: string;
  /** Teacher-visible warnings carried from generation (e.g. the history could
   * not be fact-checked). Shown as a banner the teacher sees before publishing. */
  notices?: string[];
  /** Receives the validated story with the teacher's image choices applied —
   * text is never modified here (the graph is validated at generation time). */
  onConfirm: (curated: BranchingStory) => void;
  onBack?: () => void;
}

function endingBadge(state?: string) {
  if (!state) return <StudioBadge tone="neutral">Ending</StudioBadge>;
  if (state === "triumphant") return <StudioBadge tone="emerald">Triumphant</StudioBadge>;
  if (state === "broken") return <StudioBadge tone="rose">Broken</StudioBadge>;
  return <StudioBadge tone="neutral">Indifferent</StudioBadge>;
}

export default function BranchingReview({ story, topic, standard, notices = [], onConfirm, onBack }: BranchingReviewProps) {
  // Story text is read-only in review — only image choices are teacher-editable.
  // Deep copy so image curation never mutates the generated original.
  const [curated, setCurated] = useState<BranchingStory>(() =>
    JSON.parse(JSON.stringify(story))
  );
  const [selectedId, setSelectedId] = useState<string>(story.start);

  // Per-passage historical image candidates fetched from Wikimedia
  const [imageCandidates, setImageCandidates] = useState<Record<string, any[]>>({});
  const [loadingImages, setLoadingImages] = useState<Record<string, boolean>>({});
  const fetchedRef = useRef(new Set<string>()); // avoids re-fetching the same passage
  const shownUrlsRef = useRef(new Set<string>()); // every Commons thumbUrl shown this session (cross-passage dedup)
  const [imageReloadKey, setImageReloadKey] = useState(0); // bump to force re-search on "search again"
  const [genLoading, setGenLoading] = useState(false); // a Gemini illustration is in flight for the selected passage
  const [genError, setGenError] = useState("");
  // Batch AI generation for remaining passages without images
  const [batchGenLoading, setBatchGenLoading] = useState(false);
  const [batchGenProgress, setBatchGenProgress] = useState({ done: 0, total: 0 });
  // Two pages: "text" = read prose (truth-checking, factGate notices live here);
  // "images" = curate Commons/AI images. Text is read-only on both.
  const [page, setPage] = useState<"text" | "images">("text");

  const selected = curated.passages.find((p) => p.id === selectedId) || curated.passages[0];
  const hasImage = !!selected?.image?.thumbUrl;

  // AI illustration (Gemini) — a SECOND candidate SOURCE feeding the SAME picker.
  // On success the synthesized image is prepended to this passage's candidates,
  // already stamped (artist/license) as AI-generated so it can never pose as a
  // real historical source. On any failure it sets a note and leaves text-only
  // intact — the image lane's blast radius is images only.
  const generateImage = async () => {
    if (!selected) return;
    setGenLoading(true); setGenError("");
    try {
      const res = await fetch("/api/branching-image-gen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: story.title, scene: selected.text, themeId: story.era }),
      });
      const data = await res.json();
      if (!data?.image) { setGenError(data?.error || "AI illustration generation didn't succeed. The text passage is complete — try again or use text only."); return; }
      setImageCandidates((prev) => ({ ...prev, [selectedId]: [data.image, ...(prev[selectedId] || [])] }));
    } catch {
      setGenError("AI illustration service is temporarily unavailable. Your passage text is intact — try again later or continue with text only.");
    } finally {
      setGenLoading(false);
    }
  };

  // Batch generate AI images for all passages that currently have none selected.
  // Does not touch passages that already have a (manually or previously) chosen image.
  const autoGenerateAIImages = async () => {
    const targets = curated.passages.filter((p) => !p.image?.thumbUrl);
    if (targets.length === 0) return;

    setBatchGenLoading(true);
    setBatchGenProgress({ done: 0, total: targets.length });

    let completed = 0;

    await Promise.all(
      targets.map(async (p) => {
        try {
          const res = await fetch("/api/branching-image-gen", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ topic: story.title, scene: p.text, themeId: story.era }),
          });
          const data = await res.json();
          if (data?.image) {
            const img = data.image;
            // Auto-select for this passage
            setCurated((prev) => ({
              ...prev,
              passages: prev.passages.map((pp) =>
                pp.id === p.id
                  ? {
                      ...pp,
                      image: {
                        thumbUrl: img.thumbUrl,
                        artist: img.artist || "Unknown",
                        license: img.license || "Unknown",
                        sourceUrl: img.sourceUrl,
                      },
                    }
                  : pp
              ),
            }));
            // Also add to candidates list so user can re-choose later if wanted
            setImageCandidates((prev) => ({
              ...prev,
              [p.id]: [img, ...(prev[p.id] || [])],
            }));
          }
        } catch {
          // per-item failure is silent; we just skip
        } finally {
          completed += 1;
          setBatchGenProgress({ done: completed, total: targets.length });
        }
      })
    );

    setBatchGenLoading(false);
    // brief reset of progress UI
    setTimeout(() => setBatchGenProgress({ done: 0, total: 0 }), 600);
  };

  // Fetch relevant historical images (lazy, when a passage is first viewed).
  // Lives on PAGE 2 only — never fetches while the teacher is editing text.
  useEffect(() => {
    if (page !== "images") return;
    if (!selectedId || fetchedRef.current.has(selectedId) || loadingImages[selectedId]) return;

    const load = async () => {
      fetchedRef.current.add(selectedId);
      setLoadingImages((prev) => ({ ...prev, [selectedId]: true }));
      try {
        const cands = await searchHistoricalImages({
          topic,
          standard,
          passageText: selected?.text || "",
          excludeUrls: Array.from(shownUrlsRef.current),
        });
        // Record what we just showed so later passages (and "Search again")
        // pull fresh, unique images instead of repeating these.
        for (const c of cands) if (c.thumbUrl) shownUrlsRef.current.add(c.thumbUrl);
        setImageCandidates((prev) => ({ ...prev, [selectedId]: cands }));
      } catch {
        setImageCandidates((prev) => ({ ...prev, [selectedId]: [] }));
      } finally {
        setLoadingImages((prev) => ({ ...prev, [selectedId]: false }));
      }
    };
    load();
  }, [page, selectedId, selected?.text, topic, standard, imageReloadKey]); // reloadKey forces re-search

  const setPassageImage = (id: string, img: { thumbUrl: string; label?: string; sourceUrl?: string; artist?: string; license?: string } | null) => {
    setCurated((prev) => ({
      ...prev,
      passages: prev.passages.map((p) =>
        p.id === id
          ? {
              ...p,
              image: img
                ? {
                    thumbUrl: img.thumbUrl,
                    // Carry the candidate's ACTUAL attribution + license. Commons is a
                    // mixed-license pool (PD/CC0/CC-BY/CC-BY-SA) — never assert "public
                    // domain" for all of it. "Unknown" is the honest fallback when the
                    // file carries no Artist/LicenseShortName metadata.
                    artist: img.artist || "Unknown",
                    license: img.license || "Unknown",
                    sourceUrl: img.sourceUrl,
                  }
                : undefined,
            }
          : p
      ),
    }));
  };

  // Simple order for teacher view (as-provided + start first if possible)
  const displayPassages: BranchingPassage[] = [...curated.passages];
  const startIdx = displayPassages.findIndex((p) => p.id === curated.start);
  if (startIdx > 0) {
    const startP = displayPassages.splice(startIdx, 1)[0];
    displayPassages.unshift(startP);
  }

  const selectedIdx = displayPassages.findIndex((p) => p.id === selected?.id);

  const chosenCount = curated.passages.filter((p) => p.image?.thumbUrl).length;

  // Shared left list — both pages select the same passage.
  const passageList = (
    <div className="w-72 sm:w-80 border-r border-stone-200 overflow-y-auto p-3 sm:p-4 bg-white">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 mb-2 px-1">
        Passages (click to {page === "text" ? "read" : "curate"})
      </p>
      <div className="space-y-1">
        {displayPassages.map((p, i) => {
          const isSel = p.id === selected?.id;
          const short = p.text.length > 90 ? p.text.slice(0, 87) + "…" : p.text;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedId(p.id)}
              className={[
                "w-full text-left p-3 rounded-xl border text-sm transition-all",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/25",
                isSel
                  ? "bg-indigo-50/80 border-indigo-300 shadow-sm ring-1 ring-indigo-100"
                  : "bg-stone-50/50 border-stone-150 border-stone-200 hover:border-stone-300 hover:bg-white",
              ].join(" ")}
            >
              <div className="flex items-start gap-2">
                <span className="font-mono text-[10px] text-stone-400 mt-0.5 shrink-0">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[10px] text-indigo-600/80 truncate">{p.id}</div>
                  <div className="text-stone-700 leading-snug text-xs line-clamp-2">{short}</div>
                  {page === "images" && p.image?.thumbUrl && (
                    <img src={p.image.thumbUrl} alt="" className="mt-1.5 h-8 w-20 object-cover rounded-md border border-stone-200" />
                  )}
                  {p.ending && (
                    <div className="mt-1.5">{endingBadge(p.endingState)}</div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className={`${studio.page} ${studio.font} min-h-screen text-stone-800 flex flex-col w-full overflow-hidden`}>
      {/* ═══════════ PAGE 1 — TEXT REVIEW (read-for-truth) ═══════════ */}
      {page === "text" && (
        <>
          {/* factGate notices live HERE — this is the truth-checking surface. */}
          {notices.length > 0 && (
            <div className="flex-shrink-0 bg-amber-50 border-b border-amber-200 px-4 py-2.5">
              <div className="max-w-6xl mx-auto space-y-1">
                {notices.map((n, i) => (
                  <p key={i} className="text-xs text-amber-900 flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" aria-hidden />
                    <span>{n} — review the history yourself before publishing.</span>
                  </p>
                ))}
              </div>
            </div>
          )}
          <div className="flex-shrink-0 border-b border-stone-200 bg-white/90 backdrop-blur-md px-4 py-3">
            <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <BookOpen className="h-4 w-4 text-indigo-600" aria-hidden />
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600">1 · Review text</p>
                </div>
                <p className="text-xs text-stone-500">
                  <span className="font-medium text-stone-700">{curated.title}</span>
                  {" — "}{curated.passages.length} passages · read every passage for truth
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                {onBack && (
                  <StudioButton variant="secondary" size="sm" onClick={onBack}>
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                    Back to form
                  </StudioButton>
                )}
                <StudioButton size="sm" onClick={() => setPage("images")}>
                  Continue to images
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </StudioButton>
              </div>
            </div>
          </div>
          <div className="flex-1 flex overflow-hidden max-w-6xl mx-auto w-full min-h-0">
            {passageList}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#F7F6F3]">
              {!selected ? (
                <div className="text-stone-500 text-sm">Select a passage from the list to review it.</div>
              ) : (
                <div className="max-w-3xl">
                  <div className="flex items-center gap-3 mb-3 flex-wrap">
                    <div className="text-xs font-mono text-stone-400">{selected.id}</div>
                    {selected.ending && endingBadge(selected.endingState)}
                    <div className="text-xs text-stone-400">{selectedIdx + 1} / {displayPassages.length}</div>
                  </div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 mb-2">Passage text (locked)</p>
                  <div className="bg-white border border-stone-200 rounded-xl p-5 text-stone-800 text-base leading-relaxed shadow-sm whitespace-pre-line">
                    {selected.text}
                  </div>
                  <p className="mt-5 text-xs text-stone-500 leading-relaxed">
                    Read each passage for historical truth. Text was validated at generation time and can&apos;t be edited here — when you&apos;re ready, continue to images.
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ═══════════ PAGE 2 — IMAGE CURATION (text read-only) ═══════════ */}
      {page === "images" && (
        <>
          <div className="flex-shrink-0 border-b border-stone-200 bg-white/90 backdrop-blur-md px-4 py-3">
            <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <ImageIcon className="h-4 w-4 text-indigo-600" aria-hidden />
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600">2 · Curate images</p>
                </div>
                <p className="text-xs text-stone-500">
                  <span className="font-medium text-stone-700">{curated.title}</span>
                  {" — "}{chosenCount} of {curated.passages.length} passages with images · text is locked
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                {chosenCount < curated.passages.length && (
                  <StudioButton
                    variant="secondary"
                    size="sm"
                    onClick={autoGenerateAIImages}
                    disabled={batchGenLoading}
                    loading={batchGenLoading}
                  >
                    {batchGenLoading
                      ? `Auto-generating… (${batchGenProgress.done}/${batchGenProgress.total})`
                      : "Auto-generate AI for remaining"}
                  </StudioButton>
                )}
                <StudioButton variant="secondary" size="sm" onClick={() => setPage("text")}>
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                  Back to text
                </StudioButton>
                <StudioButton size="sm" onClick={() => onConfirm(curated)}>
                  Save & play
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </StudioButton>
              </div>
            </div>
          </div>
          <div className="flex-1 flex overflow-hidden max-w-6xl mx-auto w-full min-h-0">
            {passageList}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#F7F6F3]">
              {!selected ? (
                <div className="text-stone-500 text-sm">Select a passage from the list to review it.</div>
              ) : (
                <div className="max-w-3xl">
                  <div className="flex items-center gap-3 mb-3 flex-wrap">
                    <div className="text-xs font-mono text-stone-400">{selected.id}</div>
                    {selected.ending && endingBadge(selected.endingState)}
                    <div className="text-xs text-stone-400">{selectedIdx + 1} / {displayPassages.length}</div>
                  </div>

                  {/* Read-only prose — text is locked on the image page. */}
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 mb-2">Passage text (locked)</p>
                  <div className="bg-white/70 border border-stone-200 rounded-xl p-4 text-stone-600 text-sm leading-relaxed whitespace-pre-line">
                    {selected.text}
                  </div>

                  {/* ── IMAGE MACHINERY (unchanged — only moved here) ── */}
                  <div className="mt-6">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 mb-2">Visual for this passage</p>

                    {hasImage ? (
                      <div className="mb-3">
                        <img src={selected.image!.thumbUrl} alt="" className="w-full max-w-[520px] rounded-xl border border-stone-200 shadow-sm" />
                        <div className="text-[11px] text-stone-500 mt-1.5">Selected · {selected.image!.artist || "Curated image"}</div>
                      </div>
                    ) : (
                      <div className="text-xs text-stone-500 italic mb-3">No image selected for this passage. Text-only works well for many stories.</div>
                    )}

                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="text-[11px] text-stone-500">Historical image options</div>
                      {loadingImages[selectedId] && <div className="text-[11px] text-indigo-600 font-medium">searching…</div>}
                    </div>

                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {(() => {
                        const cands = imageCandidates[selectedId] || [];
                        if (loadingImages[selectedId]) {
                          return <div className="text-xs text-stone-500 italic px-2 py-1">Searching Wikimedia Commons for lithographs, engravings & period art…</div>;
                        }
                        if (cands.length === 0) {
                          return (
                            <div className="text-xs text-stone-500 px-2 py-1 leading-snug max-w-md">
                              No historical images matched this passage. Wikimedia searches rely on specific places, events, or figures from the era.{" "}
                              Try &quot;Search again&quot;, generate an AI illustration, or keep text-only.
                            </div>
                          );
                        }
                        return cands.map((opt, idx) => {
                          const isChosen = selected.image?.thumbUrl === opt.thumbUrl;
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setPassageImage(selected.id, opt)}
                              className={`shrink-0 w-36 rounded-xl overflow-hidden border text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30 ${
                                isChosen ? "border-indigo-400 ring-2 ring-indigo-200 scale-[1.02]" : "border-stone-200 hover:border-stone-300 shadow-sm"
                              }`}
                              title={opt.label}
                            >
                              <div className="relative">
                                <img src={opt.thumbUrl} alt="" className="w-full h-20 object-cover block" />
                                {opt.aiGenerated && (
                                  <span className="absolute top-1 left-1 bg-violet-600 text-white text-[8px] px-1.5 py-0.5 rounded font-bold tracking-wide">AI</span>
                                )}
                              </div>
                              <div className="bg-white text-[10px] px-1.5 py-1.5 text-stone-600 truncate leading-tight border-t border-stone-100">
                                {opt.label} {isChosen && "✓"}
                              </div>
                            </button>
                          );
                        });
                      })()}

                      <button
                        type="button"
                        onClick={() => setPassageImage(selected.id, null)}
                        className={`shrink-0 w-24 rounded-xl border text-xs p-2 flex items-center justify-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30 ${
                          !hasImage ? "border-indigo-400 bg-indigo-50 text-indigo-800 font-medium" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
                        }`}
                      >
                        No image
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-3 text-[11px] mt-2">
                      <button
                        type="button"
                        onClick={() => {
                          fetchedRef.current.delete(selectedId);
                          setImageCandidates((prev) => { const c = { ...prev }; delete c[selectedId]; return c; });
                          setImageReloadKey((k) => k + 1);
                        }}
                        className="text-stone-500 hover:text-indigo-600 underline underline-offset-2 font-medium"
                      >
                        Search again
                      </button>
                      <button
                        type="button"
                        onClick={generateImage}
                        disabled={genLoading}
                        className="text-violet-600 hover:text-violet-700 underline underline-offset-2 font-medium disabled:opacity-50"
                      >
                        {genLoading ? "Generating…" : "Generate AI illustration"}
                      </button>
                    </div>
                    <p className="text-[10px] text-stone-400 mt-2 leading-relaxed max-w-xl">
                      Wikimedia = real historical images (actual license shown). AI = a synthesized illustration, labeled &quot;AI-generated&quot; — not a historical source; check it for anachronisms before publishing.
                    </p>
                    {genError && (
                      <div className="mt-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                        {genError}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
