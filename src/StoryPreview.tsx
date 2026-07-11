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
//
// UI: light SaaS studio shell (shared with CreateBranching generating/error).
// ════════════════════════════════════════════════════════════════
import { useState, useCallback, useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Sparkles, AlertCircle } from "lucide-react";
import type { StoryPreview, PreviewFinding } from "../generator/storyPreview";
import { searchTEKS, type TEKSStandard } from "./lib/teks";
import { THEME_IDS, THEME_USE_WHEN, resolveTheme, type ThemeId } from "./themes";
import {
  Stepper,
  StudioShell,
  StudioPanel,
  StudioCard,
  StudioCardTitle,
  Field,
  StudioInput,
  StudioTextarea,
  StudioSelect,
  StudioButton,
  SelectableCard,
  RadioDot,
  StudioSpinner,
  StudioHeader,
} from "./components/studio";

/** Humanize a kebab-case ThemeId into a teacher-facing label, e.g.
 * "ww1-fieldpost" → "Ww1 Fieldpost". Kept tiny — the authoritative
 * "use when" guidance lives in THEME_USE_WHEN (shown as the option title). */
function themeLabel(id: ThemeId): string {
  if (id === "default") return "Default (no strong era match)";
  return id
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

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
  outputLanguage: string;
  /** Resolved period ThemeId for the branching player (data-theme); see src/themes.ts.
   * Resolved at approve time from the manual pick or the topic/TEKS heuristic.
   * Stored on the final story and passed to <BranchingPlayer>. */
  era?: ThemeId;
  preview: StoryPreview;
}

interface StoryPreviewScreenProps {
  onBack?: () => void;
  /** Called when the teacher approves the previewed inputs. The parent runs the
   * full generation from here — this is the only entrance to it. */
  onApprove?: (approval: PreviewApproval) => void;
}

const PREVIEW_STEPS = [
  { id: "inputs", label: "Inputs", shortLabel: "Inputs" },
  { id: "preview", label: "Preview", shortLabel: "Preview" },
  { id: "generate", label: "Generate", shortLabel: "Generate" },
];

async function postPreview(body: { topic: string; standard: string; mustCover?: string; outputLanguage?: string }): Promise<{ data: StoryPreview; findings: PreviewFinding[] }> {
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
  const [outputLanguage, setOutputLanguage] = useState("English");
  // Visual theme for player: 'auto' uses keyword detection on topic+standard at approve time.
  // Manual lets teacher force a specific historical visual identity.
  const [visualTheme, setVisualTheme] = useState<ThemeId | "auto">("auto");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [preview, setPreview] = useState<StoryPreview | null>(null);
  const [error, setError] = useState("");
  const [approved, setApproved] = useState(false);
  // Keep the preview summary visible while editing so teachers can tweak without losing context.
  const [previewStale, setPreviewStale] = useState(false);

  const teksMatches = useMemo(() => {
    let results = searchTEKS(teksSearch);
    if (!selectedGrades.includes("All")) {
      results = results.filter((s) => selectedGrades.includes(s.gradeLevel));
    }
    return results.slice(0, 6);
  }, [teksSearch, selectedGrades]);

  const clearPreviewOnChange = () => {
    if (preview) {
      setPreviewStale(true);
      setApproved(false);
    }
    if (status === "done") setStatus("idle");
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
    setStatus("loading"); setError(""); setApproved(false);
    try {
      const teksStr = selectedTEKS.map(t => t.code).join(", ");
      const { data } = await postPreview({ topic: topic.trim(), standard: teksStr, mustCover: mustCover.trim() || undefined, outputLanguage });
      setPreview(data);
      setPreviewStale(false);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, [topic, selectedTEKS, mustCover, outputLanguage]);

  const approve = useCallback(() => {
    if (!preview) return;
    setApproved(true);
    const teksStr = selectedTEKS.map(t => t.code).join(", ");
    // Resolution order (themes.ts): manual override > classifier > heuristic.
    // "auto" leaves the override empty so the model's classifier pick (the
    // gate's `theme` field) decides, falling back to the topic/TEKS heuristic;
    // a manual pick is passed as the override and always wins.
    const era = resolveTheme({
      override: visualTheme === "auto" ? null : visualTheme,
      classifier: preview.theme ?? null,
      topic: topic.trim(),
      teks: teksStr,
    });
    onApprove?.({
      topic: topic.trim(),
      standard: teksStr,
      teks: selectedTEKS.map(t => t.code),
      mustCover: mustCover.trim() || undefined,
      contentMaturity: contentMaturity || "mature",
      proseRegister: proseRegister || "direct",
      scope,
      gumpIntensity,
      outputLanguage,
      era,
      preview,
    });
  }, [preview, topic, selectedTEKS, mustCover, contentMaturity, proseRegister, scope, gumpIntensity, outputLanguage, visualTheme, onApprove]);

  // Editing any input after a preview marks it stale. We keep the previous preview visible
  // (reduces friction when iterating) but require a fresh preview before approving.
  const onEdit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    if (preview) {
      setPreviewStale(true);
      setApproved(false);
    }
    if (status === "done") setStatus("idle");
  };

  // Language change also invalidates preview
  const onLanguageChange = (lang: string) => {
    setOutputLanguage(lang);
    if (preview) {
      setPreviewStale(true);
      setApproved(false);
    }
    if (status === "done") setStatus("idle");
  };

  // Visual theme change (manual or switching to/from auto) also marks stale
  const onVisualThemeChange = (v: ThemeId | "auto") => {
    setVisualTheme(v);
    if (preview) {
      setPreviewStale(true);
      setApproved(false);
    }
    if (status === "done") setStatus("idle");
  };

  const stepIndex = approved ? 2 : preview && !previewStale ? 1 : 0;

  return (
    <StudioShell
      header={
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-stone-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30 rounded-md px-1 py-0.5 -ml-1"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                Campaigns
              </button>
            ) : (
              <span />
            )}
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-stone-400">
              <Sparkles className="h-3.5 w-3.5 text-indigo-500" aria-hidden />
              First-person story
            </span>
          </div>
          <Stepper steps={PREVIEW_STEPS} currentIndex={stepIndex} />
        </div>
      }
    >
      <AnimatePresence mode="wait">
        <StudioPanel key="preview-form" className="space-y-6">
          <StudioHeader
            eyebrow="Create a first-person narrative"
            title="Design the story"
            description="Describe the history, align TEKS, choose shape and tone, then preview the arc. Preview is fast — re-run freely while you iterate."
          />

          {/* 1. Topic & Focus */}
          <StudioCard className="space-y-5">
            <div>
              <StudioCardTitle>1 · Topic & focus</StudioCardTitle>
              <p className="text-xs text-stone-500 mb-3">What historical moment or event should students live through?</p>
              <Field label="Topic" htmlFor="topic" required>
                <StudioInput
                  id="topic"
                  value={topic}
                  onChange={(e) => onEdit(setTopic)(e.target.value)}
                  placeholder="e.g. the Dust Bowl, the March on Washington, the Texas Revolution"
                  autoComplete="off"
                />
              </Field>
            </div>

            {/* 2. TEKS Alignment */}
            <div>
              <StudioCardTitle>2 · TEKS alignment</StudioCardTitle>
              <p className="text-xs text-stone-500 mb-3">Select the exact standards this story must address. You can add several.</p>

              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                <span className="text-[11px] font-medium text-stone-400 mr-1">Grade:</span>
                {["All", "6", "7", "8", "High School"].map((grade) => {
                  const isActive = selectedGrades.includes(grade);
                  const label = grade === "All" ? "All grades" : grade + (grade !== "High School" ? "th" : "");
                  return (
                    <button
                      key={grade}
                      type="button"
                      onClick={() => toggleGrade(grade)}
                      className={[
                        "text-[11px] px-2.5 py-1 rounded-full border font-medium transition-all",
                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30",
                        isActive
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                          : "bg-white border-stone-200 text-stone-600 hover:border-stone-300",
                      ].join(" ")}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <StudioInput
                value={teksSearch}
                onChange={(e) => setTeksSearch(e.target.value)}
                placeholder="Search keywords (e.g. washington, revolution, constitution, civil war)"
                aria-label="Search TEKS standards"
              />

              {selectedTEKS.length > 0 && (
                <div className="mt-2.5">
                  <div className="text-[11px] font-medium text-stone-400 mb-1.5">Selected ({selectedTEKS.length}):</div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedTEKS.map((t) => (
                      <span
                        key={t.code}
                        className="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 text-xs px-2.5 py-1 rounded-full text-stone-700"
                      >
                        <span className="font-mono text-indigo-700 font-medium">{t.code}</span>
                        <button
                          type="button"
                          onClick={() => removeTEKS(t.code)}
                          className="text-stone-400 hover:text-rose-600 leading-none rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40"
                          title="Remove"
                          aria-label={`Remove ${t.code}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {teksSearch.trim() && (
                <div className="mt-2 max-h-48 overflow-auto border border-stone-200 bg-white rounded-xl shadow-sm p-1 text-sm">
                  {teksMatches.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-stone-500">
                      No matching standards found. Try broader keywords such as &quot;civil rights&quot;, &quot;revolution&quot;, or a key figure&apos;s name.
                    </div>
                  ) : (
                    teksMatches.map((t) => (
                      <button
                        key={t.code}
                        type="button"
                        onClick={() => addTEKS(t)}
                        className="w-full text-left px-3 py-2 hover:bg-stone-50 cursor-pointer flex justify-between items-start gap-2 rounded-lg text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/20"
                        title={t.description}
                      >
                        <div className="min-w-0">
                          <span className="font-mono text-indigo-600 font-medium">{t.code}</span>{" "}
                          <span className="text-stone-600">{t.description}</span>
                        </div>
                        <span className="text-indigo-600 text-[11px] font-bold flex-shrink-0">+ Add</span>
                      </button>
                    ))
                  )}
                </div>
              )}
              {!teksSearch.trim() && selectedTEKS.length === 0 && (
                <p className="text-[12px] text-stone-400 mt-1.5">Search by topic or person and add the standards this story must cover.</p>
              )}
            </div>

            <Field
              label="Must cover (optional)"
              htmlFor="must-cover"
              hint="Specific ideas or scenes you want guaranteed in the story."
            >
              <StudioTextarea
                id="must-cover"
                value={mustCover}
                onChange={(e) => onEdit(setMustCover)(e.target.value)}
                rows={2}
                placeholder="e.g. show why families left their farms, and the trip to California"
              />
            </Field>
          </StudioCard>

          {/* 3. Story Shape */}
          <StudioCard className="space-y-4">
            <div>
              <StudioCardTitle>3 · Story shape</StudioCardTitle>
              <p className="text-xs text-stone-500">How broad should the story feel, and should students meet real famous figures?</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Story breadth</span>
                {([
                  { value: "span" as const, title: "Span", desc: "Travels across a movement, war, or long journey. Broader arc with multiple locations or phases." },
                  { value: "depth" as const, title: "Depth", desc: "Stays inside one powerful moment or short time. Rich branches in a tight frame." },
                ]).map((opt) => (
                  <SelectableCard
                    key={opt.value}
                    selected={scope === opt.value}
                    onClick={() => onEdit(setScope)(opt.value)}
                    aria-label={opt.title}
                  >
                    <div className="flex items-start gap-3">
                      <RadioDot selected={scope === opt.value} />
                      <div>
                        <div className="text-sm font-bold text-stone-900">{opt.title}</div>
                        <div className="text-[12px] text-stone-500 leading-snug mt-0.5">{opt.desc}</div>
                      </div>
                    </div>
                  </SelectableCard>
                ))}
              </div>
              <div className="space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Famous figure encounters</span>
                {([
                  { value: "off" as const, title: "Off (recommended for many topics)", desc: "No forced meetings. Students experience events through ordinary people. Clean for focused or lesser-known stories." },
                  { value: "high" as const, title: "High — meet the real figures", desc: "The protagonist crosses paths with marquee historical figures at turning points." },
                ]).map((opt) => (
                  <SelectableCard
                    key={opt.value}
                    selected={gumpIntensity === opt.value}
                    onClick={() => onEdit(setGumpIntensity)(opt.value)}
                    aria-label={opt.title}
                  >
                    <div className="flex items-start gap-3">
                      <RadioDot selected={gumpIntensity === opt.value} />
                      <div>
                        <div className="text-sm font-bold text-stone-900">{opt.title}</div>
                        <div className="text-[12px] text-stone-500 leading-snug mt-0.5">{opt.desc}</div>
                      </div>
                    </div>
                  </SelectableCard>
                ))}
              </div>
            </div>
          </StudioCard>

          {/* 4. Reading experience */}
          <StudioCard className="space-y-4">
            <div>
              <StudioCardTitle>4 · Reading experience</StudioCardTitle>
              <p className="text-xs text-stone-500">How honestly should the story portray hard realities, and how accessible should the language be?</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Content maturity</span>
                {([
                  { value: "mature", title: "Mature", desc: "Direct and honest about fear, violence, death, and moral complexity." },
                  { value: "moderate", title: "Moderate", desc: "Balanced honesty — difficult truths are present but softened where appropriate." },
                  { value: "gentle", title: "Gentle", desc: "Softer portrayal suitable for younger or more sensitive readers." },
                ]).map((opt) => (
                  <SelectableCard
                    key={opt.value}
                    selected={contentMaturity === opt.value}
                    onClick={() => onEdit(setContentMaturity)(opt.value)}
                    aria-label={opt.title}
                  >
                    <div className="flex items-start gap-3">
                      <RadioDot selected={contentMaturity === opt.value} />
                      <div>
                        <div className="text-sm font-bold text-stone-900">{opt.title}</div>
                        <div className="text-[12px] text-stone-500 leading-snug mt-0.5">{opt.desc}</div>
                      </div>
                    </div>
                  </SelectableCard>
                ))}
              </div>
              <div className="space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Prose register</span>
                {([
                  { value: "direct", title: "Direct", desc: "Short sentences, plain concrete words. Best for broad access and bilingual support." },
                  { value: "balanced", title: "Balanced", desc: "Mix of sentence lengths with clear but descriptive language." },
                  { value: "literary", title: "Literary", desc: "Richer vocabulary and varied sentences for stronger readers." },
                ]).map((opt) => (
                  <SelectableCard
                    key={opt.value}
                    selected={proseRegister === opt.value}
                    onClick={() => onEdit(setProseRegister)(opt.value)}
                    aria-label={opt.title}
                  >
                    <div className="flex items-start gap-3">
                      <RadioDot selected={proseRegister === opt.value} />
                      <div>
                        <div className="text-sm font-bold text-stone-900">{opt.title}</div>
                        <div className="text-[12px] text-stone-500 leading-snug mt-0.5">{opt.desc}</div>
                      </div>
                    </div>
                  </SelectableCard>
                ))}
              </div>
            </div>
          </StudioCard>

          {/* Language + visual theme */}
          <StudioCard className="space-y-5">
            <Field
              label="Output language"
              htmlFor="output-language"
              hint="The story, questions, and summary will be generated in this language."
            >
              <StudioSelect
                id="output-language"
                value={outputLanguage}
                onChange={(e) => onLanguageChange(e.target.value)}
              >
                {["English", "Spanish", "Chinese (Mandarin)", "Hindi", "Tagalog", "Vietnamese", "Arabic", "Korean", "Russian", "French", "Portuguese"].map((lang) => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </StudioSelect>
            </Field>

            <Field
              label="Visual theme (player)"
              htmlFor="visual-theme"
              hint="Sets period paper, typography, and ornaments in the student player. Auto matches the era from the topic and TEKS."
            >
              <StudioSelect
                id="visual-theme"
                value={visualTheme}
                onChange={(e) => onVisualThemeChange(e.target.value as ThemeId | "auto")}
              >
                <option value="auto">Auto-detect from topic (recommended)</option>
                {THEME_IDS.map((id) => (
                  <option key={id} value={id} title={THEME_USE_WHEN[id]}>
                    {themeLabel(id)}
                  </option>
                ))}
              </StudioSelect>
            </Field>
          </StudioCard>

          {/* Preview action */}
          <div className="space-y-2">
            <StudioButton
              size="lg"
              fullWidth
              onClick={runPreview}
              disabled={!canPreview}
              loading={status === "loading"}
            >
              {status === "loading"
                ? "Previewing…"
                : preview
                  ? (previewStale ? "Update preview with changes" : "Re-preview")
                  : "Preview story arc"}
              {status !== "loading" && <ArrowRight className="h-4 w-4" aria-hidden />}
            </StudioButton>
            {status === "loading" && (
              <p className="text-xs text-indigo-600 text-center font-medium">
                Generating a fast outline and TEKS coverage check…
              </p>
            )}
            {!canPreview && status !== "loading" && (
              <p className="text-xs text-stone-400 text-center">
                Add a topic and at least one TEKS standard to preview.
              </p>
            )}
          </div>

          {status === "error" && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3.5 space-y-1">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" aria-hidden />
                <div>
                  <p className="text-sm font-medium text-rose-800">We couldn&apos;t generate a preview right now.</p>
                  <p className="text-xs text-rose-700/80 mt-1">
                    This is often temporary, or an unusually narrow topic/TEKS combination.
                  </p>
                  <p className="text-xs text-rose-600/70 mt-1.5 font-mono break-words">Details: {error}</p>
                </div>
              </div>
            </div>
          )}

          {preview && (
            <StudioCard accent className="space-y-5 !p-6">
              {(status === "loading" || previewStale) && (
                <div className="text-xs bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-amber-800">
                  {status === "loading"
                    ? "Updating preview for your current inputs…"
                    : "Inputs changed — update the preview before approving."}
                </div>
              )}

              <div>
                <StudioCardTitle>The story will follow</StudioCardTitle>
                <p className="text-lg font-bold text-stone-900">{preview.protagonist}</p>
              </div>

              <div>
                <StudioCardTitle>Summary</StudioCardTitle>
                <p className="text-sm text-stone-700 leading-relaxed">{preview.summary}</p>
              </div>

              <div>
                <StudioCardTitle>Covers (check against your standard)</StudioCardTitle>
                <ul className="space-y-2">
                  {preview.coverage.map((c, i) => (
                    <li key={i} className="text-sm text-stone-700 flex gap-2.5 items-start">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
                        <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                      </span>
                      <span className="leading-relaxed">{c}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {approved ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  Approved. Generating the full interactive story (branches, encounters, and quiz). This takes about a minute.
                </div>
              ) : (
                <div className="space-y-2 pt-1">
                  <StudioButton
                    size="lg"
                    fullWidth
                    onClick={approve}
                    disabled={previewStale || status === "loading"}
                  >
                    Approve & generate
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </StudioButton>
                  <p className="text-xs text-stone-500 text-center leading-relaxed">
                    Not right? Edit any field above — the preview stays visible — then click &quot;Update preview with changes.&quot;
                  </p>
                </div>
              )}
            </StudioCard>
          )}

          {status === "loading" && !preview && (
            <StudioSpinner
              label="Building a story outline…"
              sublabel="Checking TEKS coverage against your selected standards"
            />
          )}
        </StudioPanel>
      </AnimatePresence>
    </StudioShell>
  );
}
