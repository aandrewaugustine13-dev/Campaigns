import { useState, useEffect, useRef } from "react";
import type { BranchingStory, BranchingPassage } from "../generator/branchingStory";
import { PageContainer, SectionHeader, Button, BackButton } from "./components/ui";

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
  onConfirm: (edited: BranchingStory) => void;
  onBack?: () => void;
}

export default function BranchingReview({ story, topic, standard, notices = [], onConfirm, onBack }: BranchingReviewProps) {
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
  const [genLoading, setGenLoading] = useState(false); // a Gemini illustration is in flight for the selected passage
  const [genError, setGenError] = useState("");
  // Two pages: "text" = read/edit prose (truth-checking, factGate notices live here);
  // "images" = curate Commons/AI images (text read-only). dirtyText tracks passages
  // edited since the last lock, so ONLY those re-fetch when re-entering page 2.
  const [page, setPage] = useState<"text" | "images">("text");
  const [dirtyText, setDirtyText] = useState<Set<string>>(() => new Set());

  const selected = edited.passages.find((p) => p.id === selectedId) || edited.passages[0];
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
        body: JSON.stringify({ topic: story.title, scene: selected.text }),
      });
      const data = await res.json();
      if (!data?.image) { setGenError(data?.error || "Generation failed — text-only stays available."); return; }
      setImageCandidates((prev) => ({ ...prev, [selectedId]: [data.image, ...(prev[selectedId] || [])] }));
    } catch {
      setGenError("Image service unavailable — text-only stays available.");
    } finally {
      setGenLoading(false);
    }
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
        });
        setImageCandidates((prev) => ({ ...prev, [selectedId]: cands }));
      } catch {
        setImageCandidates((prev) => ({ ...prev, [selectedId]: [] }));
      } finally {
        setLoadingImages((prev) => ({ ...prev, [selectedId]: false }));
      }
    };
    load();
  }, [page, selectedId, selected?.text, topic, standard, imageReloadKey]); // reloadKey forces re-search

  const updateText = (id: string, text: string) => {
    setDirtyText((prev) => new Set(prev).add(id)); // mark for image re-fetch on next lock
    setEdited((prev) => ({
      ...prev,
      passages: prev.passages.map((p) =>
        p.id === id ? { ...p, text } : p
      ),
    }));
  };

  // PAGE 1 → PAGE 2: freeze text, advance. Invalidate the image cache for ONLY
  // the passages whose text changed since the last lock, so re-entering page 2
  // lazily re-fetches just those (the per-passage fetchedRef + candidate cache
  // make this surgical; the fetch logic itself is untouched).
  const lockAndContinue = () => {
    if (dirtyText.size > 0) {
      dirtyText.forEach((id) => fetchedRef.current.delete(id));
      setImageCandidates((prev) => {
        const c = { ...prev };
        dirtyText.forEach((id) => { delete c[id]; });
        return c;
      });
      setDirtyText(new Set());
    }
    setPage("images");
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

  // Shared left list — both pages select the same passage.
  const passageList = (
    <div className="w-80 border-r border-[#3a3630] overflow-y-auto p-3 bg-[#211e1a]">
      <SectionHeader className="text-left mb-2 px-1 tracking-[3px]">
        Passages (click to {page === "text" ? "read & edit" : "curate"})
      </SectionHeader>
      <div className="space-y-1">
        {displayPassages.map((p, i) => {
          const isSel = p.id === selected?.id;
          const short = p.text.length > 90 ? p.text.slice(0, 87) + "…" : p.text;
          return (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={`w-full text-left p-2 rounded border text-sm transition-colors ${
                isSel ? "bg-[#2a2723] border-[#c9a36b]" : "bg-[#24211d] border-[#3a3630] hover:border-[#5a5548]"
              }`}
            >
              <div className="flex items-start gap-2">
                <span className="font-mono text-[10px] text-[#8a7f6a] mt-0.5 shrink-0">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[10px] text-[#c9a36b]/80 truncate">{p.id}</div>
                  <div className="text-[#c5b8a0] leading-snug text-xs line-clamp-2">{short}</div>
                  {page === "images" && p.image?.thumbUrl && (
                    <img src={p.image.thumbUrl} alt="" className="mt-1.5 h-8 w-20 object-cover rounded border border-[#3a3630]" />
                  )}
                  {p.ending && <span className="text-[9px] text-[#c9a36b]">· ENDING</span>}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <PageContainer className="p-0 items-start justify-start overflow-hidden" maxWidth="max-w-none">
      <div className="min-h-screen text-[#c5b8a0] flex flex-col w-full" style={{ fontFamily: "'Georgia', serif" }}>
        {/* ═══════════ PAGE 1 — TEXT REVIEW (read-for-truth) ═══════════ */}
        {page === "text" && (
          <>
            {/* factGate notices live HERE — this is the truth-checking surface. */}
            {notices.length > 0 && (
              <div className="flex-shrink-0 bg-[#3a2f1f] border-b border-[#5c4a2a] px-4 py-2">
                <div className="max-w-6xl mx-auto">
                  {notices.map((n, i) => (
                    <p key={i} className="text-xs text-[#c9a36b]">⚠️ {n} — review the history yourself before publishing.</p>
                  ))}
                </div>
              </div>
            )}
            <div className="flex-shrink-0 border-b border-[#3a3630] bg-[#211e1a] px-4 py-3">
              <div className="max-w-6xl mx-auto flex items-center justify-between">
                <div>
                  <SectionHeader className="text-left mb-0.5 tracking-[3px]">1 · Review text</SectionHeader>
                  <p className="text-xs text-[#8a7f6a]">{edited.title} — {edited.passages.length} passages · read &amp; edit every passage for truth</p>
                </div>
                <div className="flex gap-2">
                  {onBack && <BackButton onClick={onBack} label="← Back to form" className="text-xs" />}
                  <Button variant="primary" label="Lock &amp; continue to images →" onClick={lockAndContinue} className="text-sm py-1.5" />
                </div>
              </div>
            </div>
            <div className="flex-1 flex overflow-hidden max-w-6xl mx-auto w-full">
              {passageList}
              <div className="flex-1 overflow-y-auto p-4">
                {!selected ? (
                  <div className="text-[#8a7f6a]">No passage selected</div>
                ) : (
                  <div className="max-w-3xl">
                    <div className="flex items-baseline gap-3 mb-2">
                      <div className="text-xs font-mono text-[#8a7f6a]">{selected.id}</div>
                      {selected.ending && <span className="text-xs px-1.5 py-0.5 bg-[#3a2f1f] text-[#c9a36b] rounded">ENDING</span>}
                      <div className="text-xs text-[#8a7f6a]">{selectedIdx + 1} / {displayPassages.length}</div>
                    </div>
                    <label className="block text-[#b89d6e] text-[10px] font-medium tracking-[3px] uppercase mb-1.5">Passage text (editable)</label>
                    <textarea
                      value={selected.text}
                      onChange={(e) => updateText(selected.id, e.target.value)}
                      className="w-full bg-[#24211d] border border-[#3a3630] rounded-lg p-3 text-[#e8dcc8] text-base leading-relaxed font-serif min-h-[160px] focus:outline-none focus:border-[#c9a36b]/60"
                      placeholder="Passage prose..."
                    />
                    <div className="mt-6 text-xs text-[#8a7f6a]">Read each passage for historical truth. When the text is right, “Lock &amp; continue to images.”</div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ═══════════ PAGE 2 — IMAGE CURATION (text read-only) ═══════════ */}
        {page === "images" && (
          <>
            <div className="flex-shrink-0 border-b border-[#3a3630] bg-[#211e1a] px-4 py-3">
              <div className="max-w-6xl mx-auto flex items-center justify-between">
                <div>
                  <SectionHeader className="text-left mb-0.5 tracking-[3px]">2 · Curate images</SectionHeader>
                  <p className="text-xs text-[#8a7f6a]">{edited.title} — {chosenCount} of {edited.passages.length} passages with images · text is locked</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" label="← Back to text editing" onClick={() => setPage("text")} className="text-sm py-1.5" />
                  <Button variant="warm" label="Save &amp; Play this version →" onClick={() => onConfirm(edited)} className="text-sm py-1.5" />
                </div>
              </div>
            </div>
            <div className="flex-1 flex overflow-hidden max-w-6xl mx-auto w-full">
              {passageList}
              <div className="flex-1 overflow-y-auto p-4">
                {!selected ? (
                  <div className="text-[#8a7f6a]">No passage selected</div>
                ) : (
                  <div className="max-w-3xl">
                    <div className="flex items-baseline gap-3 mb-2">
                      <div className="text-xs font-mono text-[#8a7f6a]">{selected.id}</div>
                      {selected.ending && <span className="text-xs px-1.5 py-0.5 bg-[#3a2f1f] text-[#c9a36b] rounded">ENDING</span>}
                      <div className="text-xs text-[#8a7f6a]">{selectedIdx + 1} / {displayPassages.length}</div>
                    </div>

                    {/* Read-only prose — text is locked on the image page. */}
                    <div className="text-[#b89d6e] text-[10px] font-medium tracking-[3px] uppercase mb-1.5">Passage text (locked)</div>
                    <p className="w-full bg-[#211e1a] border border-[#3a3630] rounded-lg p-3 text-[#a69a80] text-base leading-relaxed font-serif whitespace-pre-line">{selected.text}</p>

                    {/* ── IMAGE MACHINERY (unchanged — only moved here) ── */}
                    <div className="mt-6">
                      <div className="text-[#b89d6e] text-[10px] font-medium tracking-[3px] uppercase mb-1.5">Visual for this passage</div>

                      {hasImage ? (
                        <div className="mb-3">
                          <img src={selected.image!.thumbUrl} alt="" className="w-full max-w-[520px] rounded border border-[#3a3630] shadow" />
                          <div className="text-[10px] text-[#8a7f6a] mt-1">Selected • {selected.image!.artist || "Curated image"}</div>
                        </div>
                      ) : (
                        <div className="text-xs text-[#8a7f6a] italic mb-3">No image selected (will use text only)</div>
                      )}

                      <div className="flex items-center gap-2 mb-1">
                        <div className="text-[10px] text-[#8a7f6a]">Historical image options (curated from passage + story text)</div>
                        {loadingImages[selectedId] && <div className="text-[10px] text-[#c9a36b]">searching…</div>}
                      </div>

                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {(() => {
                          const cands = imageCandidates[selectedId] || [];
                          if (loadingImages[selectedId]) {
                            return <div className="text-xs text-[#8a7f6a] italic px-2 py-1">Searching Wikimedia Commons for lithographs, engravings & period art…</div>;
                          }
                          if (cands.length === 0) {
                            return (
                              <div className="text-xs text-[#8a7f6a] italic px-2 py-1">
                                No good historical matches. The search uses the topic/standard plus this passage's real place/event nouns. Try "Search again", or "No image" for now.
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
                                  isChosen ? "border-[#c9a36b] scale-[1.02]" : "border-[#3a3630] hover:border-[#5a5548]"
                                }`}
                                title={opt.label}
                              >
                                <div className="relative">
                                  <img src={opt.thumbUrl} alt="" className="w-full h-20 object-cover block" />
                                  {opt.aiGenerated && <span className="absolute top-1 left-1 bg-[#5c3a7a] text-white text-[8px] px-1 rounded font-bold tracking-wide">AI</span>}
                                </div>
                                <div className="bg-[#24211d] text-[10px] px-1.5 py-1 text-[#a69a80] truncate leading-tight">{opt.label} {isChosen && "✓"}</div>
                              </button>
                            );
                          });
                        })()}

                        <button
                          onClick={() => setPassageImage(selected.id, null)}
                          className={`shrink-0 w-24 rounded border-2 text-xs p-2 flex items-center justify-center transition-all ${
                            !hasImage ? "border-[#c9a36b] bg-[#24211d]" : "border-[#3a3630] hover:border-[#5a5548]"
                          }`}
                        >
                          No image
                        </button>
                      </div>

                      <div className="flex gap-2 text-[10px]">
                        <button
                          onClick={() => {
                            fetchedRef.current.delete(selectedId);
                            setImageCandidates((prev) => { const c = { ...prev }; delete c[selectedId]; return c; });
                            setImageReloadKey((k) => k + 1);
                          }}
                          className="text-[#8a7f6a] hover:text-[#c5b8a0] underline"
                        >
                          Search again
                        </button>
                        <button onClick={generateImage} disabled={genLoading} className="text-[#a68a5c] hover:text-[#c9a36b] underline disabled:opacity-50">
                          {genLoading ? "✨ Generating…" : "✨ Generate AI illustration"}
                        </button>
                        <span className="text-[#6a6358]">• Wikimedia = real historical images (actual license shown). ✨ AI = a synthesized illustration, labeled “AI-generated” — NOT a historical source; check it for anachronisms before publishing.</span>
                      </div>
                      {genError && <div className="text-[10px] text-[#c9a36b] mt-1">{genError}</div>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </PageContainer>
  );
}
