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
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Sparkles,
  AlertCircle,
  BookOpen,
  Map,
  Focus,
  Users,
  UserRound,
  Search,
  Feather,
  type LucideIcon,
} from "lucide-react";
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
  StudioSpinner,
  StudioHeader,
  studio,
} from "./components/studio";

/** Warm choice tile for Story Shape / Reading experience — icon + feeling, not insurance radio. */
function FeelingChoice({
  selected,
  onClick,
  title,
  feeling,
  icon: Icon,
  "aria-label": ariaLabel,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  feeling: string;
  icon: LucideIcon;
  "aria-label"?: string;
}) {
  return (
    <SelectableCard selected={selected} onClick={onClick} aria-label={ariaLabel ?? title}>
      <div className="flex items-start gap-3.5">
        <div
          className={[
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors",
            selected
              ? "bg-violet-600 text-white shadow-md shadow-violet-900/20"
              : "bg-[#F3EDE5] text-stone-600",
          ].join(" ")}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-stone-900">{title}</span>
            {selected && (
              <motion.span
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-600 text-white"
              >
                <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
              </motion.span>
            )}
          </div>
          <p className="mt-1 text-sm font-medium text-stone-600 leading-snug">{feeling}</p>
        </div>
      </div>
    </SelectableCard>
  );
}

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
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-stone-500 hover:text-violet-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/30 rounded-md px-1 py-0.5 -ml-1"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                Home
              </button>
            ) : (
              <span />
            )}
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-700/80">
              <Sparkles className="h-3.5 w-3.5 text-violet-600" aria-hidden />
              Crafting a story
            </span>
          </div>
          <Stepper steps={PREVIEW_STEPS} currentIndex={stepIndex} />
        </div>
      }
    >
      <AnimatePresence mode="wait">
        <StudioPanel key="preview-form" className="space-y-8">
          <StudioHeader
            eyebrow="For your classroom"
            title="Where will students step into history?"
            description="Pick a moment, connect it to your standards, and shape how the story feels. You can tweak and re-preview anytime — nothing is locked in yet."
          />

          {/* ── 1. Topic: creative starting point ── */}
          <StudioCard className={`space-y-4 ${studio.cardHover}`}>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                <BookOpen className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <StudioCardTitle className="!mb-0.5 !text-base !text-stone-900">What chapter of history?</StudioCardTitle>
                <p className="text-sm font-medium text-stone-500 leading-snug">
                  Name the moment you want students to live through — not a textbook title, a world they can stand inside.
                </p>
              </div>
            </div>
            <StudioInput
              id="topic"
              value={topic}
              onChange={(e) => onEdit(setTopic)(e.target.value)}
              placeholder="Try: the Dust Bowl, the March on Washington, the Texas Revolution…"
              autoComplete="off"
              aria-label="Historical topic"
            />
          </StudioCard>

          {/* ── 2. TEKS: helpful, exploratory ── */}
          <StudioCard className={`space-y-5 ${studio.cardHover}`}>
            <div>
              <StudioCardTitle className="!text-base !text-stone-900">Connect to your standards</StudioCardTitle>
              <p className="text-sm font-medium text-stone-500 mt-0.5">
                Search for the TEKS this story should teach. Add as many as you need — we&apos;ll weave them into the narrative.
              </p>
            </div>

            <div>
              <p className="text-sm font-bold text-stone-700 mb-2">Grade level</p>
              <div className="flex flex-wrap gap-2">
                {["All", "6", "7", "8", "9", "High School"].map((grade) => {
                  const isActive = selectedGrades.includes(grade);
                  const label =
                    grade === "All"
                      ? "All grades"
                      : grade === "High School"
                        ? "High School"
                        : grade === "9"
                          ? "9th · World Geo"
                          : `${grade}th`;
                  return (
                    <button
                      key={grade}
                      type="button"
                      onClick={() => toggleGrade(grade)}
                      className={[
                        "text-sm px-3.5 py-1.5 rounded-full font-bold transition-all",
                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/30",
                        isActive
                          ? "bg-violet-700 text-white shadow-md shadow-violet-900/15"
                          : "bg-[#F3EDE5] text-stone-600 hover:bg-[#EBE4D9] hover:text-stone-800",
                      ].join(" ")}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-sm font-bold text-stone-700 mb-2">Find standards</p>
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 pointer-events-none" aria-hidden />
                <StudioInput
                  value={teksSearch}
                  onChange={(e) => setTeksSearch(e.target.value)}
                  placeholder="Type a person, event, or idea — e.g. constitution, civil rights…"
                  aria-label="Search TEKS standards"
                  className="!pl-10"
                />
              </div>

              {selectedTEKS.length > 0 && (
                <div className="mt-3">
                  <div className="text-sm font-bold text-stone-600 mb-2">
                    In this story ({selectedTEKS.length})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedTEKS.map((t) => (
                      <span
                        key={t.code}
                        className="inline-flex items-center gap-1.5 bg-violet-100 text-violet-900 text-sm px-3 py-1.5 rounded-full font-semibold shadow-sm shadow-violet-900/5"
                      >
                        <span className="font-mono text-violet-800">{t.code}</span>
                        <button
                          type="button"
                          onClick={() => removeTEKS(t.code)}
                          className="text-violet-500 hover:text-rose-600 leading-none rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40 ml-0.5"
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
                <div className="mt-2 max-h-48 overflow-auto rounded-2xl bg-white p-1.5 shadow-lg shadow-stone-900/8 ring-1 ring-stone-900/[0.05]">
                  {teksMatches.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-stone-500">
                      Nothing matched yet. Try a broader word — like &quot;revolution,&quot; &quot;civil rights,&quot; or a figure&apos;s name.
                    </div>
                  ) : (
                    teksMatches.map((t) => (
                      <button
                        key={t.code}
                        type="button"
                        onClick={() => addTEKS(t)}
                        className="w-full text-left px-3 py-2.5 hover:bg-violet-50 cursor-pointer flex justify-between items-start gap-2 rounded-xl text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/20"
                        title={t.description}
                      >
                        <div className="min-w-0">
                          <span className="font-mono font-bold text-violet-700">{t.code}</span>{" "}
                          <span className="text-stone-600 font-medium">{t.description}</span>
                        </div>
                        <span className="text-violet-700 text-sm font-bold flex-shrink-0">Add</span>
                      </button>
                    ))
                  )}
                </div>
              )}
              {!teksSearch.trim() && selectedTEKS.length === 0 && (
                <p className="text-sm text-stone-400 mt-2">Start typing to explore standards that fit your topic.</p>
              )}
            </div>

            <div className="pt-1">
              <Field
                label="Moments you care about most"
                htmlFor="must-cover"
                hint="Optional — scenes or ideas you want the story to include, in plain language."
              >
                <StudioTextarea
                  id="must-cover"
                  value={mustCover}
                  onChange={(e) => onEdit(setMustCover)(e.target.value)}
                  rows={2}
                  placeholder="e.g. why families left the farms, and the long road to California"
                />
              </Field>
            </div>
          </StudioCard>

          {/* ── 3. Story Shape: creative heart ── */}
          <motion.div
            layout
            className="rounded-2xl bg-gradient-to-br from-violet-100/80 via-amber-50/50 to-[#FBF7F2] p-5 sm:p-6 shadow-[0_8px_32px_-8px_rgba(91,33,182,0.12)] ring-1 ring-violet-900/[0.06] space-y-6"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-md shadow-violet-900/20">
                <Sparkles className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <h2 className="text-base font-bold text-stone-900 tracking-tight">Shape the experience</h2>
                <p className="text-sm font-medium text-stone-600 mt-0.5 leading-snug">
                  This is the creative heart of the story — how far students travel, and who they might meet along the way.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2.5">
                <p className="text-sm font-bold text-violet-900/80 px-0.5">How far does the journey go?</p>
                <FeelingChoice
                  selected={scope === "span"}
                  onClick={() => onEdit(setScope)("span")}
                  title="Across the arc"
                  feeling="Students move through a movement, war, or long journey — many places, many phases. The big picture comes alive."
                  icon={Map}
                />
                <FeelingChoice
                  selected={scope === "depth"}
                  onClick={() => onEdit(setScope)("depth")}
                  title="One powerful moment"
                  feeling="Stay inside a single day or decision. Branches go deep — every choice feels close and consequential."
                  icon={Focus}
                />
              </div>
              <div className="space-y-2.5">
                <p className="text-sm font-bold text-violet-900/80 px-0.5">Who might they meet?</p>
                <FeelingChoice
                  selected={gumpIntensity === "off"}
                  onClick={() => onEdit(setGumpIntensity)("off")}
                  title="Ordinary people"
                  feeling="Live the history through neighbors, workers, and everyday participants. Intimate and grounded — often the right fit."
                  icon={UserRound}
                />
                <FeelingChoice
                  selected={gumpIntensity === "high"}
                  onClick={() => onEdit(setGumpIntensity)("high")}
                  title="Meet the famous figures"
                  feeling="Improbable, memorable encounters with marquee leaders and turning points — high drama, high stakes."
                  icon={Users}
                />
              </div>
            </div>
          </motion.div>

          {/* ── 4. Reading experience ── */}
          <StudioCard className={`space-y-5 ${studio.cardHover}`}>
            <div>
              <StudioCardTitle className="!text-base !text-stone-900">How should it read?</StudioCardTitle>
              <p className="text-sm font-medium text-stone-500 mt-0.5">
                Match the honesty and the language to your students — two separate dials, not one compromise.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2.5">
                <p className="text-sm font-bold text-stone-700 px-0.5">Honesty about hard history</p>
                {([
                  { value: "mature", title: "Fully honest", feeling: "Fear, violence, and moral complexity are named clearly — trusted with the truth." },
                  { value: "moderate", title: "Balanced", feeling: "Difficult truths stay present, with some softening for the age group." },
                  { value: "gentle", title: "Gentler", feeling: "Softer framing for younger or more sensitive readers, without erasing the stakes." },
                ]).map((opt) => (
                  <FeelingChoice
                    key={opt.value}
                    selected={contentMaturity === opt.value}
                    onClick={() => onEdit(setContentMaturity)(opt.value)}
                    title={opt.title}
                    feeling={opt.feeling}
                    icon={Feather}
                  />
                ))}
              </div>
              <div className="space-y-2.5">
                <p className="text-sm font-bold text-stone-700 px-0.5">Language style</p>
                {([
                  { value: "direct", title: "Clear & direct", feeling: "Short sentences, everyday words. Widest access — great for mixed reading levels." },
                  { value: "balanced", title: "Balanced prose", feeling: "A mix of sentence lengths; clear but still descriptive." },
                  { value: "literary", title: "Richer prose", feeling: "More vocabulary and rhythm — rewarding for stronger readers." },
                ]).map((opt) => (
                  <FeelingChoice
                    key={opt.value}
                    selected={proseRegister === opt.value}
                    onClick={() => onEdit(setProseRegister)(opt.value)}
                    title={opt.title}
                    feeling={opt.feeling}
                    icon={BookOpen}
                  />
                ))}
              </div>
            </div>
          </StudioCard>

          {/* ── Language + visual theme (quieter settings) ── */}
          <StudioCard className="space-y-5 !bg-[#F8F4EE]/80 !shadow-none ring-1 ring-stone-900/[0.04]">
            <p className="text-sm font-bold text-stone-700">Finishing touches</p>
            <Field
              label="Language for the story"
              htmlFor="output-language"
              hint="Passages, questions, and the summary will all be written in this language."
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
              label="Look & feel in the player"
              htmlFor="visual-theme"
              hint="Paper, type, and ornaments students see while reading. Auto usually nails the era."
            >
              <StudioSelect
                id="visual-theme"
                value={visualTheme}
                onChange={(e) => onVisualThemeChange(e.target.value as ThemeId | "auto")}
              >
                <option value="auto">Choose for me from the topic</option>
                {THEME_IDS.map((id) => (
                  <option key={id} value={id} title={THEME_USE_WHEN[id]}>
                    {themeLabel(id)}
                  </option>
                ))}
              </StudioSelect>
            </Field>
          </StudioCard>

          {/* Preview action */}
          <div className="space-y-3 pt-1">
            <StudioButton
              size="lg"
              fullWidth
              onClick={runPreview}
              disabled={!canPreview}
              loading={status === "loading"}
            >
              {status === "loading"
                ? "Sketching your outline…"
                : preview
                  ? (previewStale ? "Refresh the preview" : "Preview again")
                  : "See a quick preview"}
              {status !== "loading" && <ArrowRight className="h-4 w-4" aria-hidden />}
            </StudioButton>
            {status === "loading" && (
              <p className="text-sm text-violet-700 text-center font-semibold">
                Building a short outline and checking your standards — hang tight.
              </p>
            )}
            {!canPreview && status !== "loading" && (
              <p className="text-sm text-stone-500 text-center font-medium">
                Add a topic and at least one standard, then we can preview.
              </p>
            )}
          </div>

          {status === "error" && (
            <div className="rounded-2xl bg-rose-50 px-4 py-4 shadow-sm">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" aria-hidden />
                <div>
                  <p className="text-sm font-bold text-rose-900">We couldn&apos;t sketch a preview just now.</p>
                  <p className="text-sm text-rose-800/80 mt-1 font-medium">
                    Often temporary — or the topic/standards pair is very narrow. Try again in a moment, or widen the search a bit.
                  </p>
                  <p className="text-xs text-rose-600/70 mt-2 font-mono break-words">Details: {error}</p>
                </div>
              </div>
            </div>
          )}

          {preview && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <StudioCard accent className="space-y-5 !p-6">
                {(status === "loading" || previewStale) && (
                  <div className="text-sm font-semibold bg-amber-50 rounded-xl px-3.5 py-2.5 text-amber-900">
                    {status === "loading"
                      ? "Updating the preview with your latest choices…"
                      : "You changed something — refresh the preview before approving."}
                  </div>
                )}

                <div>
                  <p className="text-sm font-bold text-violet-800 mb-1">Students will walk as</p>
                  <p className="text-xl font-bold text-stone-900 leading-snug">{preview.protagonist}</p>
                </div>

                <div>
                  <p className="text-sm font-bold text-violet-800 mb-1">The arc in a nutshell</p>
                  <p className="text-base font-medium text-stone-700 leading-relaxed">{preview.summary}</p>
                </div>

                <div>
                  <p className="text-sm font-bold text-violet-800 mb-2">What this story covers</p>
                  <ul className="space-y-2.5">
                    {preview.coverage.map((c, i) => (
                      <li key={i} className="text-sm font-medium text-stone-700 flex gap-2.5 items-start">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                          <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                        </span>
                        <span className="leading-relaxed">{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {approved ? (
                  <div className="rounded-xl bg-emerald-50 px-4 py-3.5 text-sm font-semibold text-emerald-900">
                    You&apos;re in. Writing the full interactive story now — branches, encounters, and a short quiz. About a minute.
                  </div>
                ) : (
                  <div className="space-y-2.5 pt-1">
                    <StudioButton
                      size="lg"
                      fullWidth
                      onClick={approve}
                      disabled={previewStale || status === "loading"}
                    >
                      Looks good — write the full story
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </StudioButton>
                    <p className="text-sm text-stone-500 text-center font-medium leading-relaxed">
                      Not quite right? Edit anything above, then refresh the preview. Your last outline stays visible so you can compare.
                    </p>
                  </div>
                )}
              </StudioCard>
            </motion.div>
          )}

          {status === "loading" && !preview && (
            <StudioSpinner
              label="Sketching a story outline…"
              sublabel="Checking how your standards show up in the arc"
            />
          )}
        </StudioPanel>
      </AnimatePresence>
    </StudioShell>
  );
}
