import { useState, useEffect, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, Sparkles, AlertCircle, BookOpen, Users, Scale } from "lucide-react";
import type { CampaignData } from "../generator/schema";
import type { ProposedFrame, PlayerPerspective, CampaignType } from "../generator/frame";
import type { SystemsEconomy } from "../generator/economy";
import type { ProposedCast } from "../generator/cast";
import type { FaultLineSpec } from "../generator/faultline";
import type { PersonalEconomy } from "../generator/personalEconomy";
import type { NarrativePlan } from "../generator/storyPlan";
import { generateCampaignJob } from "./generateClient";
import StoryPlanReview from "./StoryPlanReview";
import {
  Stepper,
  type StepDef,
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
  StudioBadge,
  StudioSpinner,
  StudioHeader,
  SegmentedControl,
  DetailRow,
} from "./components/studio";

// ═══════════════════════════════════════════════════════════════
// Stage 1 Studio — the teacher-facing flow that turns a single TEKS
// standard into a verified, playable campaign. It runs the four Stage-1
// proposers (frame → perspective → economy + cast) as screens the teacher
// reviews and chooses from, then locks those inputs into full generation.
//
// UI: light SaaS setup shell (warm off-white, indigo accent). All generation
// logic below is unchanged from the original studio flow.
// ═══════════════════════════════════════════════════════════════

type Step = "input" | "frame" | "build" | "plan" | "generating" | "error";

interface Inputs {
  standard: string;
  topic: string;
  grade: string;
  difficulty: string;
  length: number;
  numQuestions: number;
  numSages: number;
}

const GRADES = ["4th grade", "5th grade", "6th grade", "7th grade", "8th grade"];

// Humane, teacher-facing labels for the campaignType axis (the architecture
// terms "character"/"systems" never reach the teacher).
const TYPE_OPTIONS: { type: CampaignType; label: string; subtitle: string }[] = [
  { type: "character", label: "Play as a person", subtitle: "a conscience and relationships" },
  { type: "systems", label: "Run the system", subtitle: "resources and constraints" },
];

/** Wizard steps shown in the progress indicator (excludes generating/error). */
const WIZARD_STEPS: StepDef[] = [
  { id: "input", label: "Basics", shortLabel: "Basics" },
  { id: "frame", label: "Structure", shortLabel: "Structure" },
  { id: "build", label: "Review", shortLabel: "Review" },
  { id: "plan", label: "Story arc", shortLabel: "Story arc" },
];

function wizardIndex(step: Step): number {
  const map: Partial<Record<Step, number>> = {
    input: 0,
    frame: 1,
    build: 2,
    plan: 3,
    generating: 3,
    error: 0,
  };
  return map[step] ?? 0;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `Server returned ${res.status}`);
  }
  // /api/generate streams whitespace then a 200 body that may carry { error }
  // (its headers are flushed before the outcome is known). Treat that as a
  // failure rather than handing back a payload with no data.
  const payload = (await res.json()) as T & { error?: string };
  if (payload && typeof payload === "object" && payload.error) {
    throw new Error(payload.error);
  }
  return payload;
}

export default function Stage1Studio({
  onPlay,
  onBack,
  onQuickForm,
}: {
  onPlay: (data: CampaignData) => void;
  onBack: () => void;
  onQuickForm?: () => void;
}) {
  const [step, setStep] = useState<Step>("input");
  const [busy, setBusy] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const retryRef = useRef<(() => void) | null>(null);

  const [inputs, setInputs] = useState<Inputs>({
    standard: "",
    topic: "",
    grade: "5th grade",
    difficulty: "medium",
    length: 6,
    numQuestions: 4,
    numSages: 3,
  });

  const [frame, setFrame] = useState<ProposedFrame | null>(null);
  // The generator's original campaignType recommendation, captured once on the
  // first proposal so the "recommended" marker stays pinned to it even after a
  // teacher overrides the type (which changes frame.campaignType).
  const [recommendedType, setRecommendedType] = useState<CampaignType | null>(null);
  // Non-null while a type-override re-proposal is in flight (drives the inline
  // busy text and disables the selector).
  const [switchingType, setSwitchingType] = useState<CampaignType | null>(null);
  const [perspectiveIdx, setPerspectiveIdx] = useState(0);
  const [economy, setEconomy] = useState<SystemsEconomy | null>(null);
  // Character campaigns only: the small concrete PERSONAL economy (money +
  // 1–2 resources) proposed in place of the systems macro-meters. Null for
  // systems campaigns.
  const [personalEconomy, setPersonalEconomy] = useState<PersonalEconomy | null>(null);
  const [cast, setCast] = useState<ProposedCast | null>(null);
  // Character campaigns only: the moral fault line proposed for the chosen
  // perspective. Null for systems campaigns (and reset whenever we re-propose).
  const [faultLine, setFaultLine] = useState<FaultLineSpec | null>(null);
  // The narrative-spine plan (both modes): an ordered arc the teacher reviews
  // and toggles in the "plan" step before generation. Reset whenever we
  // re-propose, since a type/perspective change invalidates the prior arc.
  const [storyPlan, setStoryPlan] = useState<NarrativePlan | null>(null);
  // True while re-proposing just the story plan from the review step (the
  // "regenerate" path for a plan with a content error editing can't fix).
  const [planBusy, setPlanBusy] = useState(false);

  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const set = (patch: Partial<Inputs>) => setInputs(prev => ({ ...prev, ...patch }));

  const perspectives: PlayerPerspective[] = frame
    ? [frame.recommendedPerspective, ...frame.alternativePerspectives]
    : [];

  const fail = (action: () => void, e: unknown) => {
    retryRef.current = action;
    setErrorMsg(e instanceof Error ? e.message : String(e));
    setBusy(null);
    setStep("error");
  };

  // ── Step 1 → propose the structural frame ──────────────────────
  const proposeFrame = async () => {
    if (!inputs.standard.trim() || !inputs.topic.trim()) return;
    setBusy("Reading the standard and proposing a structure…");
    try {
      const { data } = await postJson<{ data: ProposedFrame }>("/api/frame", { standard: inputs.standard, topic: inputs.topic.trim() });
      setFrame(data);
      setRecommendedType(data.campaignType);
      setPerspectiveIdx(0);
      setBusy(null);
      setStep("frame");
    } catch (e) {
      fail(proposeFrame, e);
    }
  };

  // ── Type override → regenerate the frame pinned to the chosen type ──
  // Switching campaignType is NOT cosmetic: the frame prose, perspectives, and
  // any proposed economy/cast/fault line belonged to the prior type. So we
  // re-propose the frame with forceType and CLEAR the downstream artifacts.
  // Re-confirming the same type (or a locked-out systems pick) is a no-op — no
  // API call, nothing cleared.
  const switchType = async (target: CampaignType) => {
    if (!frame || target === frame.campaignType) return;
    if (frame.typeLocked && target === "systems") return;
    setSwitchingType(target);
    try {
      const { data } = await postJson<{ data: ProposedFrame }>("/api/frame", {
        standard: inputs.standard,
        topic: inputs.topic.trim(),
        forceType: target,
      });
      setFrame(data);
      setPerspectiveIdx(0);
      setEconomy(null);
      setPersonalEconomy(null);
      setCast(null);
      setFaultLine(null);
      setStoryPlan(null);
      setSwitchingType(null);
    } catch (e) {
      setSwitchingType(null);
      fail(() => switchType(target), e);
    }
  };

  // ── Step 2 → propose the economy + cast (+ fault line for character) ──
  // For a CHARACTER campaign we also propose the moral fault line, using the
  // chosen perspective (the fault line depends on whose eyes). It is locked
  // into the generate payload as `faultLine`; core.ts compiles it.
  const proposeEconomyAndCast = async () => {
    if (!frame) return;
    const isCharacter = frame.campaignType === "character";
    const persp = perspectives[perspectiveIdx] ?? frame.recommendedPerspective;
    setBusy(
      isCharacter
        ? "Proposing the economy, cast, and the moral fault line…"
        : "Proposing the resource economy and historical cast…",
    );
    try {
      const topic = inputs.topic.trim();
      const perspective = `${persp.role} — ${persp.description}`;
      // Character campaigns get a small concrete PERSONAL economy (money +
      // 1–2 resources) for the chosen perspective; systems campaigns get the
      // abstract macro-meter economy. Exactly one is proposed.
      const sysEcoP = isCharacter
        ? Promise.resolve(null)
        : postJson<{ data: SystemsEconomy }>("/api/economy", { standard: inputs.standard, topic });
      const persEcoP: Promise<{ data: PersonalEconomy } | null> = isCharacter
        ? postJson<{ data: PersonalEconomy }>("/api/personal-economy", { standard: inputs.standard, topic, perspective })
        : Promise.resolve(null);
      const castP = postJson<{ data: ProposedCast }>("/api/cast", { standard: inputs.standard, topic });
      const flP: Promise<{ data: FaultLineSpec } | null> = isCharacter
        ? postJson<{ data: FaultLineSpec }>("/api/faultline", { standard: inputs.standard, topic, perspective })
        : Promise.resolve(null);
      // The narrative-spine plan (both modes) — proposed in parallel so it's
      // ready for the teacher's review step right after build.
      const spP = postJson<{ data: NarrativePlan }>("/api/storyplan", {
        standard: inputs.standard, topic, perspective,
        campaignType: frame.campaignType, progressionMode: frame.progressionMode,
      });
      const [sysEco, persEco, cst, fl, sp] = await Promise.all([sysEcoP, persEcoP, castP, flP, spP]);
      setEconomy(sysEco ? sysEco.data : null);
      setPersonalEconomy(persEco ? persEco.data : null);
      setCast(cst.data);
      setFaultLine(fl ? fl.data : null);
      setStoryPlan(sp.data);
      setBusy(null);
      setStep("build");
    } catch (e) {
      fail(proposeEconomyAndCast, e);
    }
  };

  // Re-propose ONLY the story plan (the review step's regenerate path). The
  // server self-repairs malformed plans; this is the backstop when one slips
  // through with a content error the teacher can't fix by toggling beats.
  const regenPlan = async () => {
    if (!frame) return;
    const persp = perspectives[perspectiveIdx] ?? frame.recommendedPerspective;
    const perspective = `${persp.role} — ${persp.description}`;
    setPlanBusy(true);
    try {
      const { data } = await postJson<{ data: NarrativePlan }>("/api/storyplan", {
        standard: inputs.standard, topic: inputs.topic.trim(), perspective,
        campaignType: frame.campaignType, progressionMode: frame.progressionMode,
      });
      setStoryPlan(data);
    } catch (e) {
      fail(regenPlan, e);
    } finally {
      setPlanBusy(false);
    }
  };

  // ── Step 3 → lock everything (incl. the reviewed story plan) and generate ──
  // `plan` is the teacher-confirmed narrative plan from the review step (its
  // included beats become pinned events; its meaning becomes storyMeaning).
  const generate = async (plan: NarrativePlan | null = storyPlan) => {
    if (!frame) return;
    const persp = perspectives[perspectiveIdx] ?? frame.recommendedPerspective;
    setStep("generating");
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed(t => t + 1), 1000);
    try {
      const payload = {
        topic: inputs.topic.trim() || persp.role,
        standard: inputs.standard,
        grade: inputs.grade,
        length: inputs.length,
        numQuestions: inputs.numQuestions,
        numSages: inputs.numSages,
        difficulty: inputs.difficulty,
        // Locked Stage-1 constraints — core.ts treats these as ground truth.
        frame: frame.frame,
        playerRole: `${persp.role} — ${persp.description}`,
        cast: cast?.cast,
        economy: economy ?? undefined,
        // Character campaigns: the small personal economy (money + 1–2) in
        // place of the systems macro-meters. Mutually exclusive with economy.
        personalEconomy: personalEconomy ?? undefined,
        // Character campaigns only: the compiled fault line core.ts splices in.
        faultLine: faultLine ?? undefined,
        // The teacher-reviewed narrative spine — core.ts compiles its included
        // beats into pinned events and sets storyMeaning.
        storyPlan: plan ?? undefined,
      };
      const result = await generateCampaignJob(payload);
      if (timerRef.current) clearInterval(timerRef.current);
      onPlay(result.data as CampaignData);
    } catch (e) {
      if (timerRef.current) clearInterval(timerRef.current);
      fail(() => generate(plan), e);
    }
  };

  // Shared chrome: header with stepper (hidden on terminal generating/error
  // states so those screens feel like full-page moments).
  const showStepper = step !== "generating" && step !== "error" && step !== "plan";
  const shell = (children: React.ReactNode, opts?: { bare?: boolean }) => (
    <StudioShell
      header={
        opts?.bare ? undefined : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-stone-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30 rounded-md px-1 py-0.5 -ml-1"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                Campaigns
              </button>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-stone-400">
                <Sparkles className="h-3.5 w-3.5 text-indigo-500" aria-hidden />
                Guided setup
              </span>
            </div>
            {showStepper && (
              <Stepper steps={WIZARD_STEPS} currentIndex={wizardIndex(step)} />
            )}
          </div>
        )
      }
    >
      <AnimatePresence mode="wait">{children}</AnimatePresence>
    </StudioShell>
  );

  // ── Generating ──
  if (step === "generating") {
    return shell(
      <StudioPanel key="generating">
        <div className="pt-6 sm:pt-12">
          <StudioCard className="text-center !py-12">
            <StudioSpinner
              label="Building your campaign…"
              sublabel={`${elapsed}s elapsed · assembling events, sages, trivia, and map from your locked inputs`}
            />
            <p className="text-xs text-stone-400 mt-2 max-w-sm mx-auto leading-relaxed">
              This usually takes 3–5 minutes. Leave this tab open — it keeps working in the background.
            </p>
            <div className="mt-6 mx-auto max-w-xs">
              <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-indigo-500/80 transition-all duration-1000 ease-out"
                  style={{ width: `${Math.min(92, 8 + elapsed * 1.4)}%` }}
                />
              </div>
              <p className="text-[11px] text-stone-400 mt-2">Progress is estimated — generation finishes when the content is ready.</p>
            </div>
          </StudioCard>
        </div>
      </StudioPanel>,
      { bare: true },
    );
  }

  // ── Error ──
  if (step === "error") {
    return shell(
      <StudioPanel key="error">
        <div className="pt-6 sm:pt-12 max-w-md mx-auto">
          <StudioCard className="text-center space-y-4 !py-10">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 ring-1 ring-rose-100">
              <AlertCircle className="h-6 w-6 text-rose-600" aria-hidden />
            </div>
            <div className="space-y-1">
              <h1 className="text-xl font-semibold text-stone-900">We couldn&apos;t build the campaign</h1>
              <p className="text-sm text-stone-500">Something went wrong while preparing content. You can safely try again.</p>
            </div>
            <div className="rounded-lg border border-rose-100 bg-rose-50/80 px-3.5 py-3 text-left">
              <p className="text-sm text-rose-800 break-words leading-relaxed">
                {errorMsg || "A temporary problem occurred during generation."}
              </p>
              <p className="text-xs text-rose-600/80 mt-2">Try again shortly, or go back and adjust your inputs.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 justify-center pt-1">
              <StudioButton onClick={() => retryRef.current?.()}>
                Try again
              </StudioButton>
              <StudioButton variant="secondary" onClick={onBack}>
                Back to Campaigns
              </StudioButton>
            </div>
          </StudioCard>
        </div>
      </StudioPanel>,
      { bare: true },
    );
  }

  // ── Step 1: the standard ──
  if (step === "input") {
    return shell(
      <StudioPanel key="input">
        <StudioHeader
          eyebrow="Step 1 of 4"
          title="Campaign basics"
          description="Tell us the historical subject and the standard you're aligning to. We'll propose a structure you can review before anything is generated."
        />

        <StudioCard className="space-y-5">
          <Field
            label="What is this campaign about?"
            htmlFor="topic"
            required
            hint="The historical subject of the campaign. Be specific — this drives what gets generated."
          >
            <StudioInput
              id="topic"
              type="text"
              value={inputs.topic}
              onChange={e => set({ topic: e.target.value })}
              placeholder="e.g. The Erie Canal and the opening of westward trade"
              autoComplete="off"
            />
          </Field>

          <Field
            label="Standard"
            htmlFor="standard"
            required
            hint="The standard you're aligning to. A bare code works once the subject above leads."
          >
            <StudioTextarea
              id="standard"
              value={inputs.standard}
              onChange={e => set({ standard: e.target.value })}
              rows={2}
              placeholder="e.g. TEKS 5.1(A) — or paste the full standard text"
            />
          </Field>

          <Field label="Grade level" htmlFor="grade">
            <StudioSelect
              id="grade"
              value={inputs.grade}
              onChange={e => set({ grade: e.target.value })}
            >
              {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
            </StudioSelect>
          </Field>

          <div className="grid grid-cols-3 gap-3">
            {([["Events", "length", 3, 15], ["Questions", "numQuestions", 3, 10], ["Sages", "numSages", 2, 5]] as const).map(([label, key, min, max]) => (
              <Field key={key} label={label} htmlFor={key}>
                <StudioInput
                  id={key}
                  type="number"
                  min={min}
                  max={max}
                  value={inputs[key] as number}
                  onChange={e => set({ [key]: Math.max(min, Math.min(max, +e.target.value)) } as Partial<Inputs>)}
                />
              </Field>
            ))}
          </div>

          <Field label="Difficulty">
            <SegmentedControl
              aria-label="Difficulty"
              value={inputs.difficulty}
              onChange={(d) => set({ difficulty: d })}
              options={[
                { value: "low", label: "Low" },
                { value: "medium", label: "Medium" },
                { value: "high", label: "High" },
              ]}
            />
          </Field>
        </StudioCard>

        {/* Visual theme is chosen by the generator from the topic's era
            (core.ts era-matching rule) — no user-facing style picker. */}

        {busy ? (
          <StudioSpinner label={busy} />
        ) : (
          <StudioButton
            size="lg"
            fullWidth
            onClick={proposeFrame}
            disabled={!inputs.standard.trim() || !inputs.topic.trim()}
          >
            Propose structure
            <ArrowRight className="h-4 w-4" aria-hidden />
          </StudioButton>
        )}

        <div className="flex flex-col items-center gap-2 pt-1">
          {onQuickForm && (
            <StudioButton variant="ghost" size="sm" onClick={onQuickForm}>
              Skip guided steps — use the quick form
            </StudioButton>
          )}
        </div>
      </StudioPanel>,
    );
  }

  // ── Step 2: review frame + pick perspective ──
  if (step === "frame" && frame) {
    return shell(
      <StudioPanel key="frame">
        <StudioHeader
          eyebrow="Step 2 of 4"
          title="Proposed structure"
          description="Review the frame, then choose whose eyes the class plays through. You can switch campaign type if the recommendation doesn't fit."
        />

        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {TYPE_OPTIONS.map((opt) => {
              const selected = frame.campaignType === opt.type;
              const lockedOut = frame.typeLocked && opt.type === "systems";
              const disabled = lockedOut || switchingType !== null;
              return (
                <SelectableCard
                  key={opt.type}
                  selected={selected}
                  disabled={disabled}
                  onClick={() => switchType(opt.type)}
                  aria-label={opt.label}
                >
                  <div className="flex items-start gap-3">
                    <RadioDot selected={selected} />
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-stone-900">{opt.label}</span>
                        {recommendedType === opt.type && <StudioBadge tone="emerald">Recommended</StudioBadge>}
                        {lockedOut && <StudioBadge tone="neutral">Locked</StudioBadge>}
                      </div>
                      <p className="text-xs text-stone-500 leading-relaxed">{opt.subtitle}</p>
                    </div>
                  </div>
                </SelectableCard>
              );
            })}
          </div>

          {switchingType && (
            <p className="text-xs text-indigo-600 text-center font-medium animate-pulse">
              Re-proposing the structure as {switchingType === "systems" ? "a system" : "a person"}…
            </p>
          )}

          {frame.typeLocked && frame.lockReason && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/90 px-3.5 py-2.5">
              <p className="text-xs text-amber-900 leading-relaxed">{frame.lockReason}</p>
            </div>
          )}

          <div className="flex justify-center">
            <StudioBadge tone="indigo">{frame.progressionMode} progression</StudioBadge>
          </div>
        </div>

        <StudioCard>
          <StudioCardTitle>
            <span className="inline-flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5" aria-hidden />
              The frame
            </span>
          </StudioCardTitle>
          <p className="text-sm text-stone-700 leading-relaxed">{frame.frame}</p>
        </StudioCard>

        <StudioCard className="!bg-stone-50/80 !shadow-none">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 mb-1.5">Why this shape</h2>
          <p className="text-xs text-stone-600 leading-relaxed">{frame.rationale}</p>
        </StudioCard>

        <div className="space-y-2.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 px-0.5">
            Whose eyes? — pick the player&apos;s perspective
          </h2>
          {perspectives.map((p, i) => (
            <SelectableCard
              key={`${p.role}-${i}`}
              selected={perspectiveIdx === i}
              onClick={() => setPerspectiveIdx(i)}
              aria-label={p.role}
            >
              <div className="flex items-start gap-3">
                <RadioDot selected={perspectiveIdx === i} />
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-stone-900">{p.role}</span>
                    {i === 0 && <StudioBadge tone="emerald">Recommended</StudioBadge>}
                  </div>
                  <p className="text-xs text-stone-500 leading-relaxed">{p.description}</p>
                </div>
              </div>
            </SelectableCard>
          ))}
        </div>

        {busy ? (
          <StudioSpinner label={busy} />
        ) : (
          <div className="flex flex-col-reverse sm:flex-row gap-2.5">
            <StudioButton variant="secondary" onClick={() => setStep("input")}>
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Edit basics
            </StudioButton>
            <StudioButton
              className="flex-1"
              onClick={proposeEconomyAndCast}
              disabled={switchingType !== null}
            >
              Continue — economy & cast
              <ArrowRight className="h-4 w-4" aria-hidden />
            </StudioButton>
          </div>
        )}
      </StudioPanel>,
    );
  }

  // ── Step 3: review economy + cast, then generate ──
  if (step === "build" && frame) {
    const persp = perspectives[perspectiveIdx] ?? frame.recommendedPerspective;
    return shell(
      <StudioPanel key="build">
        <StudioHeader
          eyebrow="Step 3 of 4"
          title="Review locked inputs"
          description="These choices drive the full campaign. Confirm they look right, then review the story arc."
        />

        <StudioCard accent>
          <StudioCardTitle>Playing as</StudioCardTitle>
          <p className="text-sm font-semibold text-stone-900">{persp.role}</p>
          <p className="text-xs text-stone-500 mt-1 leading-relaxed">{persp.description}</p>
        </StudioCard>

        {economy && (
          <StudioCard className="space-y-3">
            <StudioCardTitle>Economy</StudioCardTitle>
            <p className="text-xs text-stone-500 italic leading-relaxed">{economy.learningObjective}</p>
            <div className="space-y-2">
              {economy.resources.map((r) => (
                <DetailRow
                  key={r.name}
                  title={r.playerFacing}
                  meta={r.startsAt}
                  description={r.description}
                />
              ))}
            </div>
          </StudioCard>
        )}

        {personalEconomy && (
          <StudioCard className="space-y-3">
            <StudioCardTitle>Personal economy</StudioCardTitle>
            <p className="text-xs text-stone-500 italic leading-relaxed">{personalEconomy.premise}</p>
            <div className="space-y-2">
              {personalEconomy.resources.map((r) => (
                <DetailRow
                  key={r.name}
                  title={r.playerFacing}
                  meta={r.startsAt}
                  description={r.description}
                  badge={r.isMoney ? <StudioBadge tone="emerald">Money</StudioBadge> : undefined}
                />
              ))}
            </div>
          </StudioCard>
        )}

        {cast && (
          <StudioCard className="space-y-3">
            <StudioCardTitle>
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" aria-hidden />
                Cast ({cast.cast.length})
              </span>
            </StudioCardTitle>
            <div className="space-y-2">
              {cast.cast.map((c, i) => (
                <DetailRow
                  key={`${c.name}-${i}`}
                  title={
                    <span>
                      {c.name}
                      <span className="font-normal text-stone-400"> · {c.role}</span>
                    </span>
                  }
                  description={c.significance}
                  badge={!c.realPerson ? <StudioBadge tone="indigo">Representative</StudioBadge> : undefined}
                />
              ))}
            </div>
          </StudioCard>
        )}

        {faultLine && (
          <StudioCard className="space-y-3 !bg-gradient-to-br !from-white !to-amber-50/50 !border-amber-200/70">
            <StudioCardTitle className="!text-amber-700">
              <span className="inline-flex items-center gap-1.5">
                <Scale className="h-3.5 w-3.5" aria-hidden />
                The moral fault line
              </span>
            </StudioCardTitle>
            <p className="text-sm text-stone-800 leading-relaxed">{faultLine.dilemma}</p>
            <p className="text-xs text-stone-500 italic leading-relaxed">{faultLine.whyNoCleanAnswer}</p>
            <div className="rounded-lg border border-amber-100 bg-white/70 px-3 py-2.5">
              <p className="text-xs font-semibold text-stone-700">
                Defining choice — <span className="text-amber-800">{faultLine.setter.beat}</span>
              </p>
              <ul className="text-xs text-stone-500 mt-1.5 space-y-1 list-disc list-inside">
                {faultLine.setter.options.map((o, i) => (
                  <li key={i}>{o.choiceText}</li>
                ))}
              </ul>
            </div>
            <p className="text-[11px] text-stone-400 leading-relaxed">
              Persistent flag <code className="font-mono text-stone-600 bg-stone-100 px-1 py-0.5 rounded text-[10px]">{faultLine.flag.id}</code>
              {" · "}later scenes that remember it:{" "}
              {[...new Set(faultLine.readers.map((r) => r.beat))].join(" · ")}
            </p>
          </StudioCard>
        )}

        <div className="flex flex-col-reverse sm:flex-row gap-2.5">
          <StudioButton variant="secondary" onClick={() => setStep("frame")}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back
          </StudioButton>
          <StudioButton
            size="lg"
            className="flex-1"
            onClick={() => setStep(storyPlan ? "plan" : "build")}
            disabled={!storyPlan}
          >
            Review the story arc
            <ArrowRight className="h-4 w-4" aria-hidden />
          </StudioButton>
        </div>
      </StudioPanel>,
    );
  }

  // ── Step 3: review the narrative arc, then generate ──
  // The plan-review checklist is full-screen (its own shell), so it renders
  // directly rather than through `shell`.
  if (step === "plan" && storyPlan) {
    return (
      <StoryPlanReview
        plan={storyPlan}
        onConfirm={(edited) => { setStoryPlan(edited); generate(edited); }}
        onBack={() => setStep("build")}
        onRegenerate={regenPlan}
        regenerating={planBusy}
      />
    );
  }

  return null;
}
