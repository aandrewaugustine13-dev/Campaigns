import { useState, useEffect, useRef } from "react";
import type { BranchingStory, BranchingPassage } from "../generator/branchingStory";

// Client wrapper around the server-side /api/branching-images.
// The server uses the project's real searchCommonsFileRanked (with proper
// token scoring, license filtering, and ranking). We always pass the full
// story topic as context so results stay relevant even if passage text is
// very story-like / narrative. Multiple fallback queries on the server help
// when direct text match is weak (e.g. "photo of the actual fort").
async function searchHistoricalImages(params: {
  title: string;
  protagonist?: string;
  passageText: string;
  storyContext?: string;
}): Promise<Array<{ thumbUrl: string; label: string; sourceUrl?: string; artist?: string; license?: string }>> {
  try {
    const res = await fetch('/api/branching-images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: params.title,
        protagonist: params.protagonist,
        text: params.passageText,
        context: params.storyContext,
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
  /** Teacher-visible warnings carried from generation (e.g. the history could
   * not be fact-checked). Shown as a banner the teacher sees before publishing. */
  notices?: string[];
  onConfirm: (edited: BranchingStory) => void;
  onBack?: () => void;
}

export default function BranchingReview({ story, notices = [], onConfirm, onBack }: BranchingReviewProps) {
  // Work on a deep copy so we never mutate the generated original
  const [edited, setEdited] = useState<BranchingStory>(() =>
    JSON.parse(JSON.stringify(story))
  );
  const [selectedId, setSelectedId] = useState<string>(story.start);

  // Per-passage historical image candidates fetched from Wikimedia
  const [imageCandidates, setImageCandidates] = useState<Record<string, any[]>>({});
  const [loadingImages, setLoadingImages] = useState<Record<string, boolean>>({});
  const fetchedRef = useRef(new Set<string>()); // avoids re-fetching the same passage
  const [imageReloadKey, setImageReloadKey] = useState(0); // bump to force re-search on "search again"

  const selected = edited.passages.find((p) => p.id === selectedId) || edited.passages[0];
  const hasImage = !!selected?.image?.thumbUrl;

  // Fetch relevant historical images (lazy, when a passage is first viewed)
  useEffect(() => {
    if (!selectedId || fetchedRef.current.has(selectedId) || loadingImages[selectedId]) return;

    const load = async () => {
      fetchedRef.current.add(selectedId);
      setLoadingImages((prev) => ({ ...prev, [selectedId]: true }));
      try {
        const cands = await searchHistoricalImages({
    title: story.title,
    protagonist: story.protagonist,
    passageText: selected?.text || "",
    // send a bit more full context so searches can be story-wide instead of single-sentence
    storyContext: `${story.title}. ${story.protagonist ? story.protagonist + '.' : ''} ${edited.passages.slice(0,3).map(p => p.text).join(' ')}`.slice(0, 400),
  });
        setImageCandidates((prev) => ({ ...prev, [selectedId]: cands }));
      } catch {
        setImageCandidates((prev) => ({ ...prev, [selectedId]: [] }));
      } finally {
        setLoadingImages((prev) => ({ ...prev, [selectedId]: false }));
      }
    };
    load();
  }, [selectedId, selected?.text, story.title, imageReloadKey]); // reloadKey forces re-search

  const updateText = (id: string, text: string) => {
    setEdited((prev) => ({
      ...prev,
      passages: prev.passages.map((p) =>
        p.id === id ? { ...p, text } : p
      ),
    }));
  };

  const setPassageImage = (id: string, img: { thumbUrl: string; label?: string; sourceUrl?: string; artist?: string; license?: string } | null) => {
    setEdited((prev) => ({
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
  const displayPassages: BranchingPassage[] = [...edited.passages];
  const startIdx = displayPassages.findIndex((p) => p.id === edited.start);
  if (startIdx > 0) {
    const startP = displayPassages.splice(startIdx, 1)[0];
    displayPassages.unshift(startP);
  }

  const selectedIdx = displayPassages.findIndex((p) => p.id === selected?.id);

  const chosenCount = edited.passages.filter((p) => p.image?.thumbUrl).length;

  return (
    <div className="h-screen bg-stone-900 text-stone-100 flex flex-col" style={{ fontFamily: "'Georgia', serif" }}>
      {/* Generation warnings (e.g. the fact-gate could not verify the history) —
          the teacher MUST see this before publishing an unverified story. */}
      {notices.length > 0 && (
        <div className="flex-shrink-0 bg-amber-950/80 border-b border-amber-700 px-4 py-2">
          <div className="max-w-6xl mx-auto">
            {notices.map((n, i) => (
              <p key={i} className="text-xs text-amber-200">
                ⚠️ {n} — review the history yourself before publishing.
              </p>
            ))}
          </div>
        </div>
      )}
      <div className="flex-shrink-0 border-b border-stone-700 bg-stone-950 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-sky-400">Review &amp; Curate Story</h1>
            <p className="text-xs text-stone-400">
              {edited.title} — {edited.passages.length} passages • {chosenCount} with images
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onBack}
              className="px-3 py-1.5 text-xs rounded border border-stone-700 hover:bg-stone-800"
            >
              ← Back to form
            </button>
            <button
              onClick={() => onConfirm(edited)}
              className="px-4 py-1.5 rounded bg-sky-700 hover:bg-sky-600 font-bold text-sm"
            >
              Save &amp; Play this version →
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden max-w-6xl mx-auto w-full">
        {/* Passages list (left) */}
        <div className="w-80 border-r border-stone-700 overflow-y-auto p-3 bg-stone-950">
          <div className="text-[10px] uppercase tracking-widest text-stone-500 mb-2 px-1">
            Passages (click to edit)
          </div>
          <div className="space-y-1">
            {displayPassages.map((p, i) => {
              const isSel = p.id === selected?.id;
              const short = p.text.length > 90 ? p.text.slice(0, 87) + "…" : p.text;
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={`w-full text-left p-2 rounded border text-sm transition-colors ${
                    isSel
                      ? "bg-stone-800 border-sky-600"
                      : "bg-stone-900 border-stone-700 hover:border-stone-500"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="font-mono text-[10px] text-stone-500 mt-0.5 shrink-0">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[10px] text-sky-400/80 truncate">{p.id}</div>
                      <div className="text-stone-200 leading-snug text-xs line-clamp-2">{short}</div>
                      {p.image?.thumbUrl && (
                        <img
                          src={p.image.thumbUrl}
                          alt=""
                          className="mt-1.5 h-8 w-20 object-cover rounded border border-stone-600"
                        />
                      )}
                      {p.ending && <span className="text-[9px] text-amber-400">· ENDING</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-3 text-[10px] text-stone-500 px-1">
            Edit text freely. Images are purely for presentation.
          </div>
        </div>

        {/* Detail / Edit panel (right) */}
        <div className="flex-1 overflow-y-auto p-4">
          {!selected ? (
            <div className="text-stone-500">No passage selected</div>
          ) : (
            <div className="max-w-3xl">
              <div className="flex items-baseline gap-3 mb-2">
                <div className="text-xs font-mono text-stone-500">{selected.id}</div>
                {selected.ending && (
                  <span className="text-xs px-1.5 py-0.5 bg-amber-900/60 text-amber-300 rounded">ENDING</span>
                )}
                <div className="text-xs text-stone-400">
                  {selectedIdx + 1} / {displayPassages.length}
                </div>
              </div>

              {/* Live text editor */}
              <label className="block text-xs uppercase tracking-widest text-stone-400 mb-1">
                Passage text (editable)
              </label>
              <textarea
                value={selected.text}
                onChange={(e) => updateText(selected.id, e.target.value)}
                className="w-full bg-stone-800 border border-stone-700 rounded p-3 text-stone-100 text-base leading-relaxed font-serif min-h-[160px] focus:outline-none focus:border-sky-600"
                placeholder="Passage prose..."
              />

              {/* Current image preview */}
              <div className="mt-6">
                <div className="text-xs uppercase tracking-widest text-stone-400 mb-1.5">Visual for this passage</div>

                {hasImage ? (
                  <div className="mb-3">
                    <img
                      src={selected.image!.thumbUrl}
                      alt=""
                      className="w-full max-w-[520px] rounded border border-stone-700 shadow"
                    />
                    <div className="text-[10px] text-stone-500 mt-1">
                      Selected • {selected.image!.artist || "Curated image"}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-stone-500 italic mb-3">No image selected (will use text only)</div>
                )}

                {/* Prezi-style picker: real historical images fetched on-demand from Wikimedia Commons */}
                <div className="flex items-center gap-2 mb-1">
                  <div className="text-[10px] text-stone-400">Historical image options (curated from passage + story text)</div>
                  {loadingImages[selectedId] && <div className="text-[10px] text-sky-400">searching…</div>}
                </div>

                <div className="flex gap-2 overflow-x-auto pb-2">
                  {(() => {
                    const cands = imageCandidates[selectedId] || [];
                    if (loadingImages[selectedId]) {
                      return <div className="text-xs text-stone-500 italic px-2 py-1">Searching Wikimedia Commons for lithographs, engravings & period art…</div>;
                    }
                    if (cands.length === 0) {
                      return (
                        <div className="text-xs text-stone-500 italic px-2 py-1">
                          No good historical matches. The search now uses the full story title + protagonist + surrounding passages (not just this one personal moment). Try "Search again", edit text to mention places/events, or use "No image" for now.
                        </div>
                      );
                    }
                    return cands.map((opt, idx) => {
                      const isChosen = selected.image?.thumbUrl === opt.thumbUrl;
                      return (
                        <button
                          key={idx}
                          onClick={() => setPassageImage(selected.id, opt)}
                          className={`shrink-0 w-36 rounded overflow-hidden border-2 text-left transition-all ${
                            isChosen ? "border-sky-500 scale-[1.02]" : "border-stone-700 hover:border-stone-500"
                          }`}
                          title={opt.label}
                        >
                          <img src={opt.thumbUrl} alt="" className="w-full h-20 object-cover block" />
                          <div className="bg-stone-800 text-[10px] px-1.5 py-1 text-stone-300 truncate leading-tight">
                            {opt.label} {isChosen && "✓"}
                          </div>
                        </button>
                      );
                    });
                  })()}

                  <button
                    onClick={() => setPassageImage(selected.id, null)}
                    className={`shrink-0 w-24 rounded border-2 text-xs p-2 flex items-center justify-center transition-all ${
                      !hasImage ? "border-sky-500 bg-stone-800" : "border-stone-700 hover:border-stone-500"
                    }`}
                  >
                    No image
                  </button>
                </div>

                <div className="flex gap-2 text-[10px]">
                  <button
                    onClick={() => {
                      fetchedRef.current.delete(selectedId);
                      setImageCandidates((prev) => {
                        const c = { ...prev };
                        delete c[selectedId];
                        return c;
                      });
                      setImageReloadKey(k => k + 1);
                    }}
                    className="text-stone-400 hover:text-stone-200 underline"
                  >
                    Search again
                  </button>
                  <span className="text-stone-600">• Real historical images from Wikimedia Commons (mixed licenses — each image’s actual artist + license is carried through and shown)</span>
                </div>
              </div>

              <div className="mt-8 text-xs text-stone-500">
                Changes are kept only for this play session. Regenerate if you want a fresh draft.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
