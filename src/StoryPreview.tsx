// ════════════════════════════════════════════════════════════════
// TEACHER PREVIEW SCREEN — the cheap confidence gate (authoring flow, slice 1).
//
// A teacher enters topic + standard + an optional plain-language "must-cover"
// note, hits Preview, and gets a cheap/fast story SUMMARY + TEKS COVERAGE
// checklist to eyeball against their standard — BEFORE paying for a full story
// generation. They can revise and re-preview freely (it's cheap), then Approve.
//
// This screen IS the required front door (Plan A): "Approve & Generate" hands
// the approved inputs to onApprove, and the parent (CreateBranching) runs the
// full generateBranchingStory. This gate is the ONLY entrance to that expensive
// call — there is no path to generation that skips the preview.
// ════════════════════════════════════════════════════════════════
import { useState, useCallback, useMemo } from "react";
import type { StoryPreview, PreviewFinding } from "../generator/storyPreview";
import { PageContainer, MainTitle, SectionHeader, Button, BackButton } from "./components/ui";
import { searchTEKS, type TEKSStandard } from "./lib/teks";

export interface PreviewApproval {
  topic: string;
  standard: string; // joined codes for compatibility
  teks?: string[]; // NEW: selected TEKS codes e.g. ["8.4(A)", "113.41(c)(2)(A)"]
  mustCover?: string;
  /** Two INDEPENDENT audience dials, threaded to generation like topic/standard.
   * contentMaturity = how honestly to depict the history; proseRegister = how
   * plain the language is. They do not collapse into one. */
  contentMaturity: string;
  proseRegister: string;
  /** SCOPE dial (the "Gump toggle"): "span" = carried across the whole arc
   * (wars/journeys/movements); "depth" = branch densely within one moment
   * (a fire, a day). Threaded to generation like the audience dials. */
  scope: "span" | "depth";
  /** GUMP INTENSITY dial: "high" = engineer improbable encounters with the
   * topic's real marquee figures and turning points; "off" = no forced
   * encounters (the right default for cast-poor/compressed topics). */
  gumpIntensity: "high" | "off";
  preview: StoryPreview;
}

interface StoryPreviewScreenProps {
  onBack?: () => void;
  /** Called when the teacher approves the previewed inputs. The parent runs the
   * full generation from here — this is the only entrance to it. */
  onApprove?: (approval: PreviewApproval) => void;
}

async function postPreview(body: { topic: string; standard: string; mustCover?: string }): Promise<{ data: StoryPreview; findings: PreviewFinding[] }> {
  const res = await fetch("/api/story-preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || (payload && payload.error)) throw new Error(payload?.error || `Server returned ${res.status}`);
  return payload as { data: StoryPreview; findings: PreviewFinding[] };
}

export default function StoryPreviewScreen({ onBack, onApprove }: StoryPreviewScreenProps) {
  const [topic, setTopic] = useState("");
  const [teksSearch, setTeksSearch] = useState("");
  const [selectedTEKS, setSelectedTEKS] = useState<TEKSStandard[]>([]);
  const [selectedGrades, setSelectedGrades] = useState<string[]>(["All"]);
  const [mustCover, setMustCover] = useState("");
  // Two independent audience dials (defaults = the product posture). Plain-text
  // so a teacher can phrase them; not collapsed into one control.
  const [contentMaturity, setContentMaturity] = useState("mature");
  const [proseRegister, setProseRegister] = useState("direct");
  const [scope, setScope] = useState<"span" | "depth">("span");
  const [gumpIntensity, setGumpIntensity] = useState<"high" | "off">("off");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [preview, setPreview] = useState<StoryPreview | null>(null);
  const [error, setError] = useState("");
  const [approved, setApproved] = useState(false);

  const teksMatches = useMemo(() => {
    let results = searchTEKS(teksSearch);
    if (!selectedGrades.includes("All")) {
      results = results.filter((s) => selectedGrades.includes(s.gradeLevel));
    }
    return results.slice(0, 6);
  }, [teksSearch, selectedGrades]);

  const clearPreviewOnChange = () => {
    if (status === "done") {
      setStatus("idle");
      setApproved(false);
    }
  };

  const addTEKS = (teks: TEKSStandard) => {
    if (!selectedTEKS.some((s) => s.code === teks.code)) {
      setSelectedTEKS((prev) => [...prev, teks]);
      clearPreviewOnChange();
    }
    setTeksSearch(""); // clear search after adding
  };

  const removeTEKS = (code: string) => {
    setSelectedTEKS((prev) => prev.filter((s) => s.code !== code));
    clearPreviewOnChange();
  };

  const toggleGrade = (grade: string) => {
    let newGrades: string[];
    if (grade === "All") {
      newGrades = ["All"];
    } else {
      newGrades = selectedGrades.filter((g) => g !== "All");
      if (newGrades.includes(grade)) {
        newGrades = newGrades.filter((g) => g !== grade);
      } else {
        newGrades = [...newGrades, grade];
      }
      if (newGrades.length === 0) newGrades = ["All"];
    }
    setSelectedGrades(newGrades);
    if (teksSearch.trim()) {
      clearPreviewOnChange();
    }
  };

  const canPreview = topic.trim().length > 0 && selectedTEKS.length > 0 && status !== "loading";

  const runPreview = useCallback(async () => {
    setStatus("loading"); setError(""); setApproved(false); setPreview(null);
    try {
      const teksStr = selectedTEKS.map(t => t.code).join(", ");
      const { data } = await postPreview({ topic: topic.trim(), standard: teksStr, mustCover: mustCover.trim() || undefined });
      setPreview(data);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, [topic, selectedTEKS, mustCover]);

  const approve = useCallback(() => {
    if (!preview) return;
    setApproved(true);
    const teksStr = selectedTEKS.map(t => t.code).join(", ");
    onApprove?.({
      topic: topic.trim(),
      standard: teksStr,
      teks: selectedTEKS.map(t => t.code),
      mustCover: mustCover.trim() || undefined,
      contentMaturity: contentMaturity || "mature",
      proseRegister: proseRegister || "direct",
      scope,
      gumpIntensity,
      preview,
    });
  }, [preview, topic, selectedTEKS, mustCover, contentMaturity, proseRegister, scope, gumpIntensity, onApprove]);

  // Editing any input invalidates a shown preview (revise → re-preview).
  const onEdit = <T,>(set: (v: T) => void) => (v: T) => { set(v); if (status === "done") { setStatus("idle"); setApproved(false); } };

  return (
    <PageContainer maxWidth="max-w-2xl" className="items-start pt-10 pb-16">
      <MainTitle className="text-4xl mb-1">New Story — Preview</MainTitle>
      <p className="text-[#a69a80] text-sm text-center mb-8 max-w-md mx-auto">
        Confirm the story will cover your TEKS standards before generating it. Revising is cheap — preview as often as you like.
      </p>

      <div className="space-y-5">
        {/* Story Inputs */}
        <SectionHeader className="text-left mb-2 tracking-[3px]">Story Inputs</SectionHeader>

        <label className="block">
          <span className="text-[#b89d6e] text-[10px] font-medium tracking-[3px] uppercase block mb-1.5">Topic</span>
          <input
            value={topic}
            onChange={(e) => onEdit(setTopic)(e.target.value)}
            placeholder="e.g. the Dust Bowl"
            className="w-full bg-[#24211d] border border-[#3a3630] rounded-lg px-4 py-2.5 text-[#e8dcc8] placeholder-[#8a7f6a] focus:outline-none focus:border-[#c9a36b]/60 transition-colors"
          />
        </label>

        {/* TEKS Search & Multi-Select */}
        <div className="block">
          <span className="text-[#b89d6e] text-[10px] font-medium tracking-[3px] uppercase block mb-1.5">TEKS Standards</span>

          {/* Grade Level Filter */}
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            <span className="text-[#8a7f6a] text-[10px] mr-1">Grade:</span>
            {["All", "6", "7", "8", "High School"].map((grade) => {
              const isActive = selectedGrades.includes(grade);
              const label = grade === "All" ? "All Grades" : grade + (grade !== "High School" ? "th" : "");
              return (
                <button
                  key={grade}
                  onClick={() => toggleGrade(grade)}
                  className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                    isActive
                      ? "bg-[#c9a36b] text-[#18140f] border-[#c9a36b]"
                      : "bg-[#24211d] border-[#3a3630] text-[#a69a80] hover:border-[#c9a36b]"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <input
            value={teksSearch}
            onChange={(e) => setTeksSearch(e.target.value)}
            placeholder="Search keywords (e.g. washington, revolution, constitution, civil war)"
            className="w-full bg-[#24211d] border border-[#3a3630] rounded-lg px-4 py-2.5 text-[#e8dcc8] placeholder-[#8a7f6a] focus:outline-none focus:border-[#c9a36b]/60 transition-colors"
          />

          {/* Selected TEKS chips */}
          {selectedTEKS.length > 0 && (
            <div className="mt-2">
              <div className="text-[#8a7f6a] text-[10px] mb-1">Selected ({selectedTEKS.length}):</div>
              <div className="flex flex-wrap gap-1.5">
                {selectedTEKS.map((t) => (
                  <span
                    key={t.code}
                    className="inline-flex items-center gap-1 bg-[#211e1a] border border-[#3a3630] text-xs px-2 py-0.5 rounded-full text-[#c5b8a0]"
                  >
                    <span className="font-mono text-[#c9a36b]">{t.code}</span>
                    <button
                      onClick={() => removeTEKS(t.code)}
                      className="text-[#c9a36b] hover:text-red-400 ml-0.5 leading-none"
                      title="Remove"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Live search results */}
          {teksSearch.trim() && (
            <div className="mt-1.5 max-h-44 overflow-auto border border-[#3a3630] bg-[#1c1915] rounded-lg p-1 text-sm">
              {teksMatches.length === 0 ? (
                <div className="px-2 py-1 text-xs text-[#8a7f6a]">No matches. Try broader keywords like "washington" or "revolution".</div>
              ) : (
                teksMatches.map((t) => (
                  <div
                    key={t.code}
                    onClick={() => addTEKS(t)}
                    className="px-2 py-1.5 hover:bg-[#24211d] cursor-pointer flex justify-between items-start gap-2 rounded text-xs"
                    title={t.description}
                  >
                    <div className="min-w-0">
                      <span className="font-mono text-[#c9a36b]">{t.code}</span>{" "}
                      <span className="text-[#c5b8a0] truncate inline-block align-middle max-w-[calc(100%-80px)]">{t.description}</span>
                    </div>
                    <span className="text-[#c9a36b] text-[10px] flex-shrink-0">+ Add</span>
                  </div>
                ))
              )}
            </div>
          )}
          {!teksSearch.trim() && selectedTEKS.length === 0 && (
            <div className="text-[10px] text-[#8a7f6a] mt-1">Search and add relevant TEKS standards your story should align with (multiple OK).</div>
          )}
        </div>

        <label className="block">
          <span className="text-[#b89d6e] text-[10px] font-medium tracking-[3px] uppercase block mb-1.5">Must cover (optional, plain language)</span>
          <textarea
            value={mustCover}
            onChange={(e) => onEdit(setMustCover)(e.target.value)}
            rows={3}
            placeholder="e.g. show why families left their farms, and the trip to California"
            className="w-full bg-[#24211d] border border-[#3a3630] rounded-lg px-4 py-2.5 text-[#e8dcc8] placeholder-[#8a7f6a] focus:outline-none focus:border-[#c9a36b]/60 transition-colors resize-y"
          />
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-[#b89d6e] text-[10px] font-medium tracking-[3px] uppercase block mb-1.5">Scope</span>
            <select
              value={scope}
              onChange={(e) => onEdit(setScope)(e.target.value as "span" | "depth")}
              className="w-full bg-[#24211d] border border-[#3a3630] rounded-lg px-4 py-2.5 text-[#e8dcc8] focus:outline-none focus:border-[#c9a36b]/60 transition-colors"
            >
              <option value="span">Span — carried across the whole arc (wars, journeys, movements)</option>
              <option value="depth">Depth — branch densely within one moment (a fire, a single day)</option>
            </select>
          </label>

          <label className="block">
            <span className="text-[#b89d6e] text-[10px] font-medium tracking-[3px] uppercase block mb-1.5">Famous-figure encounters</span>
            <select
              value={gumpIntensity}
              onChange={(e) => onEdit(setGumpIntensity)(e.target.value as "high" | "off")}
              className="w-full bg-[#24211d] border border-[#3a3630] rounded-lg px-4 py-2.5 text-[#e8dcc8] focus:outline-none focus:border-[#c9a36b]/60 transition-colors"
            >
              <option value="off">Off — no forced meetings (best for one-place/cast-poor topics)</option>
              <option value="high">High — the kid crosses paths with the real famous figures &amp; turning points</option>
            </select>
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-[#b89d6e] text-[10px] font-medium tracking-[3px] uppercase block mb-1.5">Content maturity</span>
            <select
              value={contentMaturity}
              onChange={(e) => onEdit(setContentMaturity)(e.target.value)}
              className="w-full bg-[#24211d] border border-[#3a3630] rounded-lg px-4 py-2.5 text-[#e8dcc8] focus:outline-none focus:border-[#c9a36b]/60 transition-colors"
            >
              <option value="mature">Mature — honest, unsanitized depiction of fear, violence, death, and moral complexity</option>
              <option value="moderate">Moderate — balanced honesty with some softening of the hardest truths</option>
              <option value="gentle">Gentle — softer, less direct portrayal of difficult historical realities</option>
            </select>
            <span className="text-[10px] text-[#8a7f6a] mt-1 block">How honestly to show fear, violence, death — not sanitized.</span>
          </label>
          <label className="block">
            <span className="text-[#b89d6e] text-[10px] font-medium tracking-[3px] uppercase block mb-1.5">Prose register</span>
            <select
              value={proseRegister}
              onChange={(e) => onEdit(setProseRegister)(e.target.value)}
              className="w-full bg-[#24211d] border border-[#3a3630] rounded-lg px-4 py-2.5 text-[#e8dcc8] focus:outline-none focus:border-[#c9a36b]/60 transition-colors"
            >
              <option value="direct">Direct — short, declarative sentences; common concrete words; plain and accessible</option>
              <option value="balanced">Balanced — mix of sentence lengths; clear vocabulary with some descriptive flow</option>
              <option value="literary">Literary — richer vocabulary, more varied and descriptive sentences</option>
            </select>
            <span className="text-[10px] text-[#8a7f6a] mt-1 block">Plain, short, concrete sentences (reading-support / bilingual).</span>
          </label>
        </div>

        <Button
          variant="primary"
          label={status === "loading" ? "Previewing…" : preview ? "Re-preview" : "Preview"}
          onClick={runPreview}
          disabled={!canPreview}
          className="mt-2"
        />
      </div>

      {status === "error" && (
        <div className="mt-6 border border-[#5c2a2a] bg-[#2a1f1f] rounded-xl p-4 text-sm text-[#d88a8a]">
          Preview failed: {error}
        </div>
      )}

      {preview && status === "done" && (
        <div className="mt-8 border border-[#3a3630] bg-[#211e1a] rounded-2xl p-6 space-y-5">
          <div>
            <SectionHeader className="text-left mb-1 tracking-[3px]">The story will follow</SectionHeader>
            <p className="text-[#c5b8a0] text-lg font-medium">{preview.protagonist}</p>
          </div>

          <div>
            <SectionHeader className="text-left mb-1 tracking-[3px]">Summary</SectionHeader>
            <p className="text-[#c5b8a0] leading-relaxed">{preview.summary}</p>
          </div>

          <div>
            <SectionHeader className="text-left mb-2 tracking-[3px]">Covers (check against your standard)</SectionHeader>
            <ul className="space-y-1.5">
              {preview.coverage.map((c, i) => (
                <li key={i} className="text-[#c5b8a0] text-sm flex gap-2">
                  <span className="text-[#c9a36b] mt-0.5">✓</span>
                  {c}
                </li>
              ))}
            </ul>
          </div>

          {approved ? (
            <div className="border border-[#2a4a2a] bg-[#1f2a1f] rounded-xl p-4 text-sm text-[#8fc38f]">
              Approved — generating the full story now…
            </div>
          ) : (
            <div className="pt-2">
              <Button
                variant="warm"
                label="Approve &amp; Generate"
                onClick={approve}
                className="mb-3"
              />
              <p className="text-xs text-[#8a7f6a]">Not right? Edit the fields above and preview again.</p>
            </div>
          )}
        </div>
      )}

      {onBack && (
        <div className="mt-8">
          <BackButton onClick={onBack} />
        </div>
      )}
    </PageContainer>
  );
}
