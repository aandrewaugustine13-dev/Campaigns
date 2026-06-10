import { useState, useEffect, useRef } from "react";
import type { CampaignData } from "../generator/schema";
import type { ProposedFrame, PlayerPerspective, CampaignType } from "../generator/frame";
import type { SystemsEconomy } from "../generator/economy";
import type { ProposedCast } from "../generator/cast";
import type { FaultLineSpec } from "../generator/faultline";
import type { PersonalEconomy } from "../generator/personalEconomy";
import { generateCampaignJob } from "./generateClient";

// ═══════════════════════════════════════════════════════════════
// Stage 1 Studio — the teacher-facing flow that turns a single TEKS
// standard into a verified, playable campaign. It runs the four Stage-1
// proposers (frame → perspective → economy + cast) as screens the teacher
// reviews and chooses from, then locks those inputs into full generation.
// ═══════════════════════════════════════════════════════════════

type Step = "input" | "frame" | "build" | "generating" | "error";

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

function Badge({ children, tone }: { children: React.ReactNode; tone: "amber" | "indigo" }) {
  const cls = tone === "amber"
    ? "bg-amber-900/50 text-amber-300 border-amber-700"
    : "bg-indigo-900/50 text-indigo-300 border-indigo-700";
  return (
    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border ${cls}`}>
      {children}
    </span>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8">
      <div className="w-10 h-10 border-4 border-amber-700 border-t-amber-400 rounded-full animate-spin" />
      <p className="text-stone-400 text-sm">{label}</p>
    </div>
  );
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
      const [sysEco, persEco, cst, fl] = await Promise.all([sysEcoP, persEcoP, castP, flP]);
      setEconomy(sysEco ? sysEco.data : null);
      setPersonalEconomy(persEco ? persEco.data : null);
      setCast(cst.data);
      setFaultLine(fl ? fl.data : null);
      setBusy(null);
      setStep("build");
    } catch (e) {
      fail(proposeEconomyAndCast, e);
    }
  };

  // ── Step 3 → lock everything and generate a playable campaign ───
  const generate = async () => {
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
      };
      const result = await generateCampaignJob(payload);
      if (timerRef.current) clearInterval(timerRef.current);
      onPlay(result.data as CampaignData);
    } catch (e) {
      if (timerRef.current) clearInterval(timerRef.current);
      fail(generate, e);
    }
  };

  const shell = (children: React.ReactNode) => (
    <div className="h-screen bg-stone-900 text-stone-100 flex flex-col overflow-hidden" style={{ fontFamily: "'Georgia', serif" }}>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-6 space-y-5">{children}</div>
      </div>
    </div>
  );

  // ── Generating ──
  if (step === "generating") {
    return shell(
      <div className="text-center space-y-6 pt-16">
        <h1 className="text-2xl font-bold text-amber-400">Building Your Campaign…</h1>
        <Spinner label={`${elapsed}s — assembling events, sages, trivia, and map from your locked inputs`} />
        <p className="text-stone-600 text-xs">This usually takes 3–5 minutes. You can leave this tab open; it keeps working in the background.</p>
      </div>,
    );
  }

  // ── Error ──
  if (step === "error") {
    return shell(
      <div className="text-center space-y-4 pt-16">
        <h1 className="text-2xl font-bold text-red-400">Something Failed</h1>
        <div className="bg-red-950/40 border border-red-800 rounded p-3">
          <p className="text-red-300 text-sm break-words">{errorMsg}</p>
        </div>
        <div className="space-y-2">
          <button onClick={() => retryRef.current?.()} className="px-6 py-2 bg-amber-700 hover:bg-amber-600 rounded font-bold transition-colors">
            Try Again
          </button>
          <br />
          <button onClick={onBack} className="text-xs text-stone-500 hover:text-stone-300 transition-colors">
            ← Back to Campaigns
          </button>
        </div>
      </div>,
    );
  }

  // ── Step 1: the standard ──
  if (step === "input") {
    return shell(
      <>
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-amber-400">Guided Setup</h1>
          <p className="text-stone-500 text-sm">
            Enter a standard. The studio proposes the campaign's structure, perspective,
            economy, and cast for you to review before generating.
          </p>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-stone-400 uppercase tracking-wide">What is this campaign about? *</label>
          <input
            type="text"
            value={inputs.topic}
            onChange={e => set({ topic: e.target.value })}
            placeholder="e.g. The Erie Canal and the opening of westward trade"
            className="w-full bg-stone-800 border border-stone-700 rounded px-3 py-2 text-sm text-stone-100 placeholder-stone-600 focus:border-amber-600 focus:outline-none"
          />
          <p className="text-[11px] text-stone-500">The historical subject of the campaign. This drives what gets generated — be specific.</p>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-stone-400 uppercase tracking-wide">Standard *</label>
          <textarea
            value={inputs.standard}
            onChange={e => set({ standard: e.target.value })}
            rows={2}
            placeholder="e.g. TEKS 5.1(A) — or paste the full standard text"
            className="w-full bg-stone-800 border border-stone-700 rounded px-3 py-2 text-sm text-stone-100 placeholder-stone-600 focus:border-amber-600 focus:outline-none resize-none"
          />
          <p className="text-[11px] text-stone-500">The standard you're aligning to. A bare code works now that the subject above leads.</p>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-stone-400 uppercase tracking-wide">Grade Level</label>
          <select
            value={inputs.grade}
            onChange={e => set({ grade: e.target.value })}
            className="w-full bg-stone-800 border border-stone-700 rounded px-3 py-2 text-sm text-stone-100 focus:border-amber-600 focus:outline-none"
          >
            {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {([["Events", "length", 3, 15], ["Questions", "numQuestions", 3, 10], ["Sages", "numSages", 2, 5]] as const).map(([label, key, min, max]) => (
            <div key={key} className="space-y-1">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-wide">{label}</label>
              <input
                type="number"
                min={min}
                max={max}
                value={inputs[key] as number}
                onChange={e => set({ [key]: Math.max(min, Math.min(max, +e.target.value)) } as Partial<Inputs>)}
                className="w-full bg-stone-800 border border-stone-700 rounded px-3 py-2 text-sm text-stone-100 focus:border-amber-600 focus:outline-none"
              />
            </div>
          ))}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-stone-400 uppercase tracking-wide">Difficulty</label>
          <div className="flex gap-2">
            {["low", "medium", "high"].map(d => (
              <button
                key={d}
                onClick={() => set({ difficulty: d })}
                className={`flex-1 py-2 rounded text-sm font-bold transition-colors ${
                  inputs.difficulty === d ? "bg-amber-700 text-stone-100" : "bg-stone-800 border border-stone-700 text-stone-400 hover:border-stone-600"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* Visual theme is chosen by the generator from the topic's era
            (core.ts era-matching rule) — no user-facing style picker. */}

        {busy ? <Spinner label={busy} /> : (
          <button
            onClick={proposeFrame}
            disabled={!inputs.standard.trim() || !inputs.topic.trim()}
            className="w-full py-3 bg-amber-700 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed rounded font-bold text-lg transition-colors"
          >
            Propose Structure →
          </button>
        )}

        <div className="flex flex-col items-center gap-1">
          {onQuickForm && (
            <button onClick={onQuickForm} className="text-xs text-stone-500 hover:text-amber-400 transition-colors">
              Skip the guided steps — use the quick form
            </button>
          )}
          <button onClick={onBack} className="text-xs text-stone-500 hover:text-stone-300 transition-colors">
            ← Back to Campaigns
          </button>
        </div>
      </>,
    );
  }

  // ── Step 2: review frame + pick perspective ──
  if (step === "frame" && frame) {
    return shell(
      <>
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-amber-400">Proposed Structure</h1>
          <p className="text-stone-500 text-sm">Review the frame, then choose whose eyes the class plays through.</p>
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {TYPE_OPTIONS.map((opt) => {
              const selected = frame.campaignType === opt.type;
              const lockedOut = frame.typeLocked && opt.type === "systems";
              const disabled = lockedOut || switchingType !== null;
              return (
                <button
                  key={opt.type}
                  onClick={() => switchType(opt.type)}
                  disabled={disabled}
                  className={`text-left rounded border p-3 transition-colors ${
                    selected
                      ? "bg-amber-950/40 border-amber-600"
                      : lockedOut
                        ? "bg-stone-900 border-stone-800 opacity-40 cursor-not-allowed"
                        : disabled
                          ? "bg-stone-800 border-stone-700 opacity-60 cursor-wait"
                          : "bg-stone-800 border-stone-700 hover:border-stone-600"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${selected ? "border-amber-400 bg-amber-400" : "border-stone-500"}`} />
                    <span className="text-sm font-bold text-stone-100">{opt.label}</span>
                    {recommendedType === opt.type && <span className="text-[10px] text-emerald-400 font-bold uppercase">recommended</span>}
                    {lockedOut && <span className="text-[10px] text-stone-500 font-bold uppercase">locked</span>}
                  </div>
                  <p className="text-xs text-stone-400 mt-1 ml-5">{opt.subtitle}</p>
                </button>
              );
            })}
          </div>

          {switchingType && (
            <p className="text-[11px] text-amber-400 text-center">
              Re-proposing the structure as {switchingType === "systems" ? "a system" : "a person"}…
            </p>
          )}

          {frame.typeLocked && frame.lockReason && (
            <p className="text-[11px] text-amber-300/90 leading-relaxed border border-amber-800/60 rounded px-2 py-1.5">
              {frame.lockReason}
            </p>
          )}

          <div className="flex justify-center">
            <Badge tone="indigo">{frame.progressionMode}</Badge>
          </div>
        </div>

        <div className="bg-stone-800 border border-stone-700 rounded p-4 space-y-2">
          <h2 className="text-xs font-bold text-amber-300 uppercase tracking-wide">The Frame</h2>
          <p className="text-stone-200 text-sm leading-relaxed">{frame.frame}</p>
        </div>

        <div className="bg-stone-800/60 border border-stone-700 rounded p-3">
          <h2 className="text-xs font-bold text-stone-400 uppercase tracking-wide mb-1">Why this shape</h2>
          <p className="text-stone-400 text-xs leading-relaxed">{frame.rationale}</p>
        </div>

        <div className="space-y-2">
          <h2 className="text-xs font-bold text-amber-300 uppercase tracking-wide">Whose eyes? — pick the player's perspective</h2>
          {perspectives.map((p, i) => (
            <button
              key={`${p.role}-${i}`}
              onClick={() => setPerspectiveIdx(i)}
              className={`w-full text-left rounded border p-3 transition-colors ${
                perspectiveIdx === i ? "bg-amber-950/40 border-amber-600" : "bg-stone-800 border-stone-700 hover:border-stone-600"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${perspectiveIdx === i ? "border-amber-400 bg-amber-400" : "border-stone-500"}`} />
                <span className="text-sm font-bold text-stone-100">{p.role}</span>
                {i === 0 && <span className="text-[10px] text-emerald-400 font-bold uppercase">recommended</span>}
              </div>
              <p className="text-xs text-stone-400 mt-1 ml-5">{p.description}</p>
            </button>
          ))}
        </div>

        {busy ? <Spinner label={busy} /> : (
          <div className="flex gap-2">
            <button onClick={() => setStep("input")} className="px-4 py-2.5 bg-stone-800 border border-stone-700 hover:border-stone-600 rounded text-sm text-stone-300 transition-colors">
              ← Edit standard
            </button>
            <button onClick={proposeEconomyAndCast} disabled={switchingType !== null} className="flex-1 py-2.5 bg-amber-700 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed rounded font-bold transition-colors">
              Continue → propose economy & cast
            </button>
          </div>
        )}
      </>,
    );
  }

  // ── Step 3: review economy + cast, then generate ──
  if (step === "build" && frame) {
    const persp = perspectives[perspectiveIdx] ?? frame.recommendedPerspective;
    return shell(
      <>
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-amber-400">Review & Generate</h1>
          <p className="text-stone-500 text-sm">These locked inputs will drive the full campaign.</p>
        </div>

        <div className="bg-amber-950/30 border border-amber-800 rounded p-3">
          <h2 className="text-xs font-bold text-amber-300 uppercase tracking-wide">Playing as</h2>
          <p className="text-sm font-bold text-stone-100 mt-0.5">{persp.role}</p>
          <p className="text-xs text-stone-400">{persp.description}</p>
        </div>

        {economy && (
          <div className="bg-stone-800 border border-stone-700 rounded p-4 space-y-2">
            <h2 className="text-xs font-bold text-amber-300 uppercase tracking-wide">Economy</h2>
            <p className="text-xs text-stone-400 italic">{economy.learningObjective}</p>
            <div className="space-y-1.5">
              {economy.resources.map((r) => (
                <div key={r.name} className="border border-stone-700 rounded px-2 py-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-stone-200">{r.playerFacing}</span>
                    <span className="text-[10px] text-stone-500 uppercase">{r.startsAt}</span>
                  </div>
                  <p className="text-[11px] text-stone-400 mt-0.5">{r.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {personalEconomy && (
          <div className="bg-stone-800 border border-stone-700 rounded p-4 space-y-2">
            <h2 className="text-xs font-bold text-amber-300 uppercase tracking-wide">Personal Economy</h2>
            <p className="text-xs text-stone-400 italic">{personalEconomy.premise}</p>
            <div className="space-y-1.5">
              {personalEconomy.resources.map((r) => (
                <div key={r.name} className="border border-stone-700 rounded px-2 py-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-stone-200">
                      {r.playerFacing}
                      {r.isMoney && <span className="ml-1.5 text-[9px] text-emerald-400 uppercase font-bold">money</span>}
                    </span>
                    <span className="text-[10px] text-stone-500 uppercase">{r.startsAt}</span>
                  </div>
                  <p className="text-[11px] text-stone-400 mt-0.5">{r.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {cast && (
          <div className="bg-stone-800 border border-stone-700 rounded p-4 space-y-2">
            <h2 className="text-xs font-bold text-amber-300 uppercase tracking-wide">Cast ({cast.cast.length})</h2>
            <div className="space-y-1.5">
              {cast.cast.map((c, i) => (
                <div key={`${c.name}-${i}`} className="border border-stone-700 rounded px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-stone-200">{c.name}</span>
                    <span className="text-[10px] text-stone-500">· {c.role}</span>
                    {!c.realPerson && <span className="text-[9px] text-indigo-400 uppercase font-bold">representative</span>}
                  </div>
                  <p className="text-[11px] text-stone-400 mt-0.5">{c.significance}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {faultLine && (
          <div className="bg-amber-950/20 border border-amber-800 rounded p-4 space-y-2">
            <h2 className="text-xs font-bold text-amber-300 uppercase tracking-wide">The Moral Fault Line</h2>
            <p className="text-sm text-stone-200 leading-relaxed">{faultLine.dilemma}</p>
            <p className="text-[11px] text-stone-400 italic leading-relaxed">{faultLine.whyNoCleanAnswer}</p>
            <div className="border border-stone-700 rounded px-2 py-1.5">
              <p className="text-[11px] font-bold text-stone-300">
                Defining choice — <span className="text-amber-300">{faultLine.setter.beat}</span>
              </p>
              <ul className="text-[11px] text-stone-400 mt-0.5 list-disc list-inside">
                {faultLine.setter.options.map((o, i) => (
                  <li key={i}>{o.choiceText}</li>
                ))}
              </ul>
            </div>
            <p className="text-[11px] text-stone-500">
              Persistent flag <span className="font-mono text-stone-300">{faultLine.flag.id}</span> · later scenes that remember it:{" "}
              {[...new Set(faultLine.readers.map((r) => r.beat))].join(" · ")}
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={() => setStep("frame")} className="px-4 py-2.5 bg-stone-800 border border-stone-700 hover:border-stone-600 rounded text-sm text-stone-300 transition-colors">
            ← Back
          </button>
          <button onClick={generate} className="flex-1 py-2.5 bg-amber-700 hover:bg-amber-600 rounded font-bold text-lg transition-colors">
            Generate Playable Campaign →
          </button>
        </div>

        <button onClick={onBack} className="block w-full text-xs text-stone-500 hover:text-stone-300 text-center transition-colors">
          ← Back to Campaigns
        </button>
      </>,
    );
  }

  return null;
}
