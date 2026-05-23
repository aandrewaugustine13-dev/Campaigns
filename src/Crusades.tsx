import { useMemo, useState } from "react";
import SageEncounterV2, { shuffleChoices } from "./SageEncounterV2";
import { CrusadesCampaign, CRUSADES_INITIAL_FLAGS } from "./campaigns/crusades/index";
import { getNextSage, type Sage } from "./campaigns/crusades/sageEncounters";
import { useFloatingNumbers, useScreenShake, FloatingNumbers } from "./GameJuice";

// ═══════════════════════════════════════════════════════════════
// THIRD CRUSADE — top-level campaign wrapper
//
// Flow:
//   opening (4 panels) → banner (choice) → goodbye →
//   quota (decide → [history → forcedChoice?] → outcome) →
//   sageEncounter → interlude → …
//
// `coerced` set by the banner choice; persists for downstream
// narration. competence/honor/favor are the moral meters the
// quota event (and future events) move. CrusadesCampaign and
// the existing sage system are unchanged.
// ═══════════════════════════════════════════════════════════════

type Phase =
  | "opening"           // 4 narrative panels, tap-to-advance
  | "banner"            // panel 5: two-button choice, NOT tap-to-advance
  | "goodbyeWilling"    // post-accept goodbye, tap-to-advance
  | "goodbyeCoerced"    // post-refuse goodbye, tap-to-advance
  | "quota"             // The Quota — three-path moral decision
  | "sageEncounter"     // active sage encounter (any sage from SAGES)
  | "interlude";        // placeholder between events (post-sage)

interface CrusadesProps { onBack: () => void; }

// ── Panel content. Text is locked — do not paraphrase. ────────
const OPENING_PANELS: { src: string; text: string }[] = [
  {
    src: "/backgrounds/crusades/opening/panel_01.png",
    text: "The year of our Lord 1187. Jerusalem has fallen. The Holy City — taken in the First Crusade with rivers of blood, held for eighty-eight years — is gone. Saladin's banners fly over its walls. Word of it crosses the sea like a sickness, and everywhere it lands, the same silence falls.",
  },
  {
    src: "/backgrounds/crusades/opening/panel_02.png",
    text: "In Rome, one man already knows the answer he will give them. He will not tell them it was politics, or poor generalship. He will tell them it was sin. Their sin. And that the only road back to grace runs through the desert, sword in hand.",
  },
  {
    src: "/backgrounds/crusades/opening/panel_03.png",
    text: "Children of Christ. The Holy City weeps. The tomb of our Lord is held by those who deny Him — and I ask you: how, but that we earned it? We grew soft. We turned our blades on each other. The loss of Jerusalem is not God's failure. It is ours. But our God is merciful. To every man who takes the cross, I promise this: every sin of your life, washed away. And to those who would stay home while Christ's tomb lies in heathen hands? Ask what answer you will give, on the last day, when He asks where you were.",
  },
  {
    src: "/backgrounds/crusades/opening/panel_04.png",
    text: "He lets it land. He has given them heaven, and he has given them dread, and he knows — as he has always known — which of the two will fill the ships. Far from Rome, the call rolls downhill. Past the great houses. Down to the small men who have always known: when great men speak of holy war, it is the low men who fill the graves. In a crowd, a hedge knight stands very still. He holds no land. He has a sword, a horse, and three reasons asleep at home he has never wished to leave. He does not yet know they are already coming for him.",
  },
];

const GOODBYE_WILLING_PANELS: { src: string; text: string }[] = [
  {
    src: "/backgrounds/crusades/opening/goodbye_willing_01.png",
    text: "[Final dawn farewell. His wife Alyse, cold, says aloud:] \"Look at them. Look at your children. And tell me which one of them is worth less to you than a city you have never seen.\"",
  },
  {
    src: "/backgrounds/crusades/opening/goodbye_willing_02.png",
    text: "[Hugh says nothing — the truth would only frighten her.] \"I cannot defend this house, Hugh. When winter comes and the stores run thin and there is no man at this door, it will be me and three small children and whatever mercy the world decides to show us. You are not going to save Jerusalem. You are leaving us to save yourself a worse goodbye.\"",
  },
  {
    src: "/backgrounds/crusades/opening/goodbye_willing_03.png",
    text: "[His daughter reaches for him. His wife does not. He goes anyway.]",
  },
];

const GOODBYE_COERCED_PANELS: { src: string; text: string }[] = [
  {
    src: "/backgrounds/crusades/opening/goodbye_coerced_01.png",
    text: "[He said no. Before dawn, the door comes off its hinges. The King's men take him from his bed. Alyse screaming, the children awake, his son making a sound he'll hear forever. No goodbye — that's what they steal. One look back: Alyse in the doorway, candlelit, white with terror and rage, arm flung toward him. The dark swallows his daughter calling his name.]",
  },
  {
    src: "/backgrounds/crusades/opening/goodbye_coerced_02.png",
    text: "Whatever else this war makes of you, it began like this: with you telling the truth, and the truth meaning nothing at all.",
  },
];

// ═══════════════════════════════════════════════════════════════
// "THE QUOTA" — France, 1190 (first heavy decision)
// All deltas, narration, and shake intensities are tunable below.
// ═══════════════════════════════════════════════════════════════

type MeterDeltas = { competence?: number; honor?: number; favor?: number };

const QUOTA_DELTAS: Record<
  "refuse" | "comply" | "elderRight" | "elderWrongInit" | "elderHardball" | "elderWalkAway",
  MeterDeltas
> = {
  refuse:         { honor:  3, favor: -3, competence:  0 },
  comply:         { honor: -3, favor:  2, competence:  2 },
  elderRight:     { honor:  2, favor:  2, competence:  2 },
  elderWrongInit: {                       competence: -2 }, // applied on landing in forcedChoice
  elderHardball:  { honor: -3, favor:  2                  }, // stacks on top of elderWrongInit
  elderWalkAway: {             favor: -2, competence: -2  }, // stacks on top of elderWrongInit
};

// Heavier shake on the cruel paths; restrained on moral/clean ones.
const QUOTA_SHAKE: Record<
  "refuse" | "comply" | "elderRight" | "elderWrongInit" | "elderHardball" | "elderWalkAway",
  "light" | "medium" | "heavy"
> = {
  refuse:         "light",
  comply:         "heavy",
  elderRight:     "light",
  elderWrongInit: "light",
  elderHardball:  "heavy",
  elderWalkAway:  "medium",
};

// The recurring marshal — unnamed-but-consistent figure who reads
// Hugh's standing back to him after every assignment.
const MARSHAL_LINES = {
  pleased:   "Five men, and no fuss worth hearing about. The King values a man who delivers.",
  cold:      "Empty-handed. I'll remember that, hedge knight. So will the men above me.",
  surprised: "Five, and the village didn't even riot. You've a head on you, for a hedge knight.",
} as const;

type OutcomeId = "refuse" | "comply" | "elderRight" | "elderHardball" | "elderWalkAway";

const QUOTA_OUTCOMES: Record<OutcomeId, { narration: string; marshal: keyof typeof MARSHAL_LINES }> = {
  refuse: {
    narration:
      "You ride out empty-handed. Word reaches Richard's officers that the hedge knight would not fill his quota. You have made an enemy of the men who keep the King's favor — and you do not yet know how long that memory will last. But you can still look at your own hands.",
    marshal: "cold",
  },
  comply: {
    narration:
      "You take the strong ones. A woman claws at your stirrup; you ride through her. Five men, roped at the wrists, stumble behind your horse as the village wails. The quota is met. Richard's officers will hear you are dependable. You try not to think of a doorway, and a candle, and an arm flung out toward you.",
    marshal: "pleased",
  },
  elderRight: {
    narration:
      "The elder studies you, then nods slowly. \"You understand.\" Together you find them — a blacksmith's restless second son, a man drowning in debt, two youths who have dreamed of nothing but the Holy Land. They come willingly. No family is broken. You ride out with five men who chose this, the village unbowed behind you, and a quota met clean. You did not know a man could do this job without leaving wreckage. Today you learned he can — if he knows what he's doing.",
    marshal: "surprised",
  },
  elderHardball: {
    narration:
      "You do the ugly thing, and you do it badly — grabbing men at random, the town now openly hostile because you came as a friend and turned. Richard's officers get their five. They will not hear how it went, only that it was done. But you will remember that you tried to be better, and weren't sharp enough to manage it.",
    marshal: "pleased",
  },
  elderWalkAway: {
    narration:
      "You leave with nothing. No men, no goodwill, no quota — just a village that watched you fail and a long ride to explain yourself. Richard's officers do not forgive a man who comes back empty and foolish both.",
    marshal: "cold",
  },
};

const QUOTA_HOOK =
  "Your commander hands you a number. This village owes the King five men for the holy war, and it falls to you to choose them. The mothers already know why you have come. They watch you from their doorways.";

const QUOTA_DECIDE_BUTTONS: { id: "refuse" | "comply" | "elder"; label: string; line: string }[] = [
  {
    id: "refuse",
    label: "Refuse",
    line: "\"These are not soldiers. They are farmers, and fathers, and I will not do to them what was done to me.\"",
  },
  {
    id: "comply",
    label: "Comply without mercy",
    line: "\"The King commands it. I take the five strongest and I do not look back.\"",
  },
  {
    id: "elder",
    label: "Meet the elder",
    line: "\"Every village has men who would go gladly. Let me find them.\"",
  },
];

const QUOTA_HISTORY_QUESTION = {
  prompt:
    "The elder is wary. To win his trust, you must show you understand why men take the cross. He tests you — what truly drives men to this war?",
  choices: [
    "Younger sons with no land to inherit, men in debt seeking relief, and those promised their sins washed clean.",
    "Only the most devout, who care nothing for worldly reward.",
    "Men forced at swordpoint, as there is no other reason to go.",
    "Knights seeking glory in tournament and single combat.",
  ],
  correctIndex: 0,
} as const;

const QUOTA_FORCED_SETUP =
  "The elder's face closes. You have shown him nothing but ignorance, and he will not help a man who does not understand his own war. The five men must still come from somewhere.";

const QUOTA_FORCED_BUTTONS: { id: "hardball" | "walkAway"; label: string }[] = [
  { id: "hardball", label: "Hardball — take them anyway" },
  { id: "walkAway", label: "Walk away" },
];

type QuotaStep = "decide" | "history" | "forcedChoice" | "outcome";

// ── Opening panel: <img> with a visibly labeled gray fallback
// when the asset is missing. Designed so missing art is obvious,
// not silently hidden behind a gradient.
function OpeningPanel({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="w-full h-48 rounded border-2 border-dashed border-stone-600 bg-stone-800 flex items-center justify-center">
        <div className="text-center px-3">
          <div className="text-stone-400 text-xs font-bold uppercase tracking-wider">Missing art</div>
          <div className="text-stone-500 text-[10px] font-mono mt-1 break-all">{src}</div>
        </div>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      className="w-full h-48 object-cover rounded border border-stone-700 bg-stone-950"
    />
  );
}

// ── Compact meter readout. Used as a header on quota + interlude. ─
function MeterReadout({ competence, honor, favor }: { competence: number; honor: number; favor: number }) {
  const fmt = (v: number) => (v >= 0 ? `+${v}` : `${v}`);
  const tone = (v: number) =>
    v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-stone-400";
  return (
    <span className="font-mono text-xs">
      <span className="text-stone-500">comp </span><span className={tone(competence)}>{fmt(competence)}</span>
      <span className="text-stone-600"> · </span>
      <span className="text-stone-500">honor </span><span className={tone(honor)}>{fmt(honor)}</span>
      <span className="text-stone-600"> · </span>
      <span className="text-stone-500">favor </span><span className={tone(favor)}>{fmt(favor)}</span>
    </span>
  );
}

export default function Crusades({ onBack }: CrusadesProps) {
  const [phase, setPhase] = useState<Phase>("opening");
  const [coerced, setCoerced] = useState<boolean>(CRUSADES_INITIAL_FLAGS.coerced);
  // Panel cursor for click-through phases. Reset on phase entry.
  const [panelIndex, setPanelIndex] = useState<number>(0);

  // ── Moral meters. Moved by quota; future events will also move them. ─
  const [competence, setCompetence] = useState<number>(0);
  const [honor, setHonor] = useState<number>(0);
  const [favor, setFavor] = useState<number>(0);

  // ── Quota event internal sub-state ─────────────────────────
  const [quotaStep, setQuotaStep] = useState<QuotaStep>("decide");
  const [outcomeId, setOutcomeId] = useState<OutcomeId | null>(null);

  // ── Sage encounter state (persists across all sages) ───────
  const [streak, setStreak] = useState<number>(0);
  const [sagePoints, setSagePoints] = useState<number>(0);
  const [completedSageIds, setCompletedSageIds] = useState<Set<string>>(() => new Set());
  const [activeSage, setActiveSage] = useState<Sage | null>(null);

  // ── Existing GameJuice: floating numbers + screen shake ────
  const { floats, spawn } = useFloatingNumbers();
  const { shakeClass, shake } = useScreenShake();

  // DEV: no real progress engine yet — pass 1.0 so any uncompleted sage is
  // eligible. Real engine wiring will pass actual journey progress.
  const nextSage = getNextSage(1.0, completedSageIds);

  // Shuffle the history question once per component mount.
  const shuffledHistory = useMemo(
    () => shuffleChoices([...QUOTA_HISTORY_QUESTION.choices], QUOTA_HISTORY_QUESTION.correctIndex),
    [],
  );

  // ── Apply a delta set + fire GameJuice (float per nonzero, shake). ─
  const applyMeters = (d: MeterDeltas, sh: "light" | "medium" | "heavy") => {
    if (d.competence) { setCompetence((v) => v + d.competence!); spawn(d.competence, "competence"); }
    if (d.honor)      { setHonor((v) => v + d.honor!);          spawn(d.honor,      "honor"); }
    if (d.favor)      { setFavor((v) => v + d.favor!);          spawn(d.favor,      "favor"); }
    shake(sh);
  };

  // ── Quota handlers ─────────────────────────────────────────
  const handleQuotaDecide = (id: "refuse" | "comply" | "elder") => {
    if (id === "refuse") {
      applyMeters(QUOTA_DELTAS.refuse, QUOTA_SHAKE.refuse);
      setOutcomeId("refuse"); setQuotaStep("outcome");
    } else if (id === "comply") {
      applyMeters(QUOTA_DELTAS.comply, QUOTA_SHAKE.comply);
      setOutcomeId("comply"); setQuotaStep("outcome");
    } else {
      setQuotaStep("history");
    }
  };

  const handleHistoryAnswer = (i: number) => {
    if (i === shuffledHistory.correctIndex) {
      applyMeters(QUOTA_DELTAS.elderRight, QUOTA_SHAKE.elderRight);
      setOutcomeId("elderRight"); setQuotaStep("outcome");
    } else {
      // Immediate competence dock; then forced second choice.
      applyMeters(QUOTA_DELTAS.elderWrongInit, QUOTA_SHAKE.elderWrongInit);
      setQuotaStep("forcedChoice");
    }
  };

  const handleForcedChoice = (id: "hardball" | "walkAway") => {
    if (id === "hardball") {
      applyMeters(QUOTA_DELTAS.elderHardball, QUOTA_SHAKE.elderHardball);
      setOutcomeId("elderHardball");
    } else {
      applyMeters(QUOTA_DELTAS.elderWalkAway, QUOTA_SHAKE.elderWalkAway);
      setOutcomeId("elderWalkAway");
    }
    setQuotaStep("outcome");
  };

  const handleQuotaContinue = () => {
    if (nextSage) {
      setActiveSage(nextSage);
      setPhase("sageEncounter");
    } else {
      setPhase("interlude");
    }
  };

  // ── Opening (panels 1–4, tap-to-advance) ───────────────────
  if (phase === "opening") {
    const panel = OPENING_PANELS[panelIndex];
    const isLast = panelIndex === OPENING_PANELS.length - 1;
    return (
      <div className="h-screen bg-stone-900 text-stone-100 overflow-y-auto" style={{ fontFamily: "'Georgia', serif" }}>
        <div className="max-w-2xl mx-auto p-6 space-y-4">
          <button
            type="button"
            onClick={() => {
              if (isLast) { setPanelIndex(0); setPhase("banner"); }
              else setPanelIndex((i) => i + 1);
            }}
            className="block w-full text-left space-y-3 focus:outline-none focus:ring-2 focus:ring-amber-700/40 rounded-lg p-1 -m-1"
          >
            <OpeningPanel src={panel.src} alt={`Opening panel ${panelIndex + 1}`} />
            <div className="border border-amber-800/40 rounded-lg p-3 bg-amber-950/20">
              <p className="text-stone-200 text-sm leading-relaxed italic">{panel.text}</p>
            </div>
            <p className="text-center text-stone-500 text-xs italic">
              tap to continue · {panelIndex + 1} / {OPENING_PANELS.length}
            </p>
          </button>
          <button onClick={onBack} className="block w-full text-stone-500 hover:text-stone-300 text-xs mt-3">← Back to Campaigns</button>
        </div>
      </div>
    );
  }

  // ── The Banner (panel 5; two-button choice, NOT tap-to-advance) ─
  if (phase === "banner") {
    return (
      <div className="h-screen bg-stone-900 text-stone-100 overflow-y-auto" style={{ fontFamily: "'Georgia', serif" }}>
        <div className="max-w-2xl mx-auto p-6 space-y-4">
          <h1 className="text-2xl font-bold text-amber-400">The Banner</h1>
          <OpeningPanel src="/backgrounds/crusades/opening/panel_05.png" alt="The Banner" />
          {/* Reused amber/stone two-button block from the original prologue.
              Tapping anywhere else on the screen does NOT advance — only these
              two buttons resolve the choice. */}
          <div className="space-y-2 pt-1">
            <button
              onClick={() => { setCoerced(false); setPanelIndex(0); setPhase("goodbyeWilling"); }}
              className="w-full py-3 bg-amber-800 hover:bg-amber-700 rounded font-bold transition-colors text-left px-4"
            >
              Take the cross.
              <div className="text-xs font-normal text-amber-300 mt-1">
                Hugh accepts, plainly, not begrudging.
              </div>
            </button>
            <button
              onClick={() => { setCoerced(true); setPanelIndex(0); setPhase("goodbyeCoerced"); }}
              className="w-full py-3 bg-stone-700 hover:bg-stone-600 rounded font-bold transition-colors text-left px-4"
            >
              Refuse.
              <div className="text-xs font-normal text-stone-300 mt-1">
                "I will not go."
              </div>
            </button>
            <button onClick={onBack} className="block w-full text-stone-500 hover:text-stone-300 text-xs mt-3">← Back to Campaigns</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Goodbye flows (tap-to-advance, either willing or coerced) ─
  if (phase === "goodbyeWilling" || phase === "goodbyeCoerced") {
    const panels = phase === "goodbyeWilling" ? GOODBYE_WILLING_PANELS : GOODBYE_COERCED_PANELS;
    const panel = panels[panelIndex];
    const isLast = panelIndex === panels.length - 1;
    return (
      <div className="h-screen bg-stone-900 text-stone-100 overflow-y-auto" style={{ fontFamily: "'Georgia', serif" }}>
        <div className="max-w-2xl mx-auto p-6 space-y-4">
          <button
            type="button"
            onClick={() => {
              if (isLast) { setPanelIndex(0); setPhase("quota"); }
              else setPanelIndex((i) => i + 1);
            }}
            className="block w-full text-left space-y-3 focus:outline-none focus:ring-2 focus:ring-amber-700/40 rounded-lg p-1 -m-1"
          >
            <OpeningPanel src={panel.src} alt={`Goodbye panel ${panelIndex + 1}`} />
            <div className="border border-amber-800/40 rounded-lg p-3 bg-amber-950/20">
              <p className="text-stone-200 text-sm leading-relaxed italic">{panel.text}</p>
            </div>
            <p className="text-center text-stone-500 text-xs italic">
              tap to continue · {panelIndex + 1} / {panels.length}
            </p>
          </button>
          <button onClick={onBack} className="block w-full text-stone-500 hover:text-stone-300 text-xs mt-3">← Back to Campaigns</button>
        </div>
      </div>
    );
  }

  // ── The Quota (decide → [history → forcedChoice?] → outcome) ─
  if (phase === "quota") {
    const outcome = outcomeId ? QUOTA_OUTCOMES[outcomeId] : null;
    return (
      <div
        className={`h-screen bg-stone-900 text-stone-100 overflow-y-auto ${shakeClass}`}
        style={{ fontFamily: "'Georgia', serif" }}
      >
        {/* Floating numbers overlay — fixed center, pointer-events-none, z-50. */}
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 pointer-events-none z-50">
          <FloatingNumbers floats={floats} />
        </div>

        <div className="max-w-2xl mx-auto p-4 space-y-3">
          {/* Header: location stamp + live meter readout */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-amber-400 uppercase tracking-wider">France, 1190 · The Quota</p>
            <MeterReadout competence={competence} honor={honor} favor={favor} />
          </div>

          {/* ── Decide step ── */}
          {quotaStep === "decide" && (
            <>
              <div className="border border-amber-800/40 rounded-lg p-3 bg-amber-950/20">
                <p className="text-stone-300 text-sm leading-relaxed italic">{QUOTA_HOOK}</p>
              </div>
              <div className="border border-indigo-700/60 rounded-lg p-3 bg-indigo-950/40 space-y-2">
                {QUOTA_DECIDE_BUTTONS.map((b, i) => (
                  <button
                    key={b.id}
                    onClick={() => handleQuotaDecide(b.id)}
                    className="w-full text-left text-sm px-3 py-2.5 rounded-lg border bg-indigo-900/60 hover:bg-indigo-800/80 border-indigo-700/40 hover:border-indigo-600/60 transition-all"
                    style={{ fontFamily: "'Georgia', serif" }}
                  >
                    <span className="text-indigo-300 font-bold mr-2">{String.fromCharCode(65 + i)}.</span>
                    <span className="font-bold text-stone-200">{b.label}</span>
                    <span className="block text-stone-400 italic mt-1 ml-5">{b.line}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ── History step (path C only) ── */}
          {quotaStep === "history" && (
            <>
              <div className="border border-amber-800/40 rounded-lg p-3 bg-amber-950/20">
                <p className="text-stone-300 text-sm leading-relaxed italic">{QUOTA_HISTORY_QUESTION.prompt}</p>
              </div>
              <div className="border border-indigo-700/60 rounded-lg p-3 bg-indigo-950/40">
                <p className="text-xs text-indigo-300 font-bold uppercase tracking-wider mb-3">📜 Recall</p>
                <div className="space-y-2">
                  {shuffledHistory.choices.map((c, i) => (
                    <button
                      key={i}
                      onClick={() => handleHistoryAnswer(i)}
                      className="w-full text-left text-sm px-3 py-2.5 rounded-lg border bg-indigo-900/60 hover:bg-indigo-800/80 border-indigo-700/40 hover:border-indigo-600/60 transition-all"
                      style={{ fontFamily: "'Georgia', serif" }}
                    >
                      <span className="text-indigo-300 font-bold mr-2">{String.fromCharCode(65 + i)}.</span>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── Forced-choice step (wrong history answer fallback) ── */}
          {quotaStep === "forcedChoice" && (
            <>
              <div className="border border-amber-800/40 rounded-lg p-3 bg-amber-950/20">
                <p className="text-stone-300 text-sm leading-relaxed italic">{QUOTA_FORCED_SETUP}</p>
              </div>
              <div className="border border-indigo-700/60 rounded-lg p-3 bg-indigo-950/40 space-y-2">
                {QUOTA_FORCED_BUTTONS.map((b, i) => (
                  <button
                    key={b.id}
                    onClick={() => handleForcedChoice(b.id)}
                    className="w-full text-left text-sm px-3 py-2.5 rounded-lg border bg-indigo-900/60 hover:bg-indigo-800/80 border-indigo-700/40 hover:border-indigo-600/60 transition-all"
                    style={{ fontFamily: "'Georgia', serif" }}
                  >
                    <span className="text-indigo-300 font-bold mr-2">{String.fromCharCode(65 + i)}.</span>
                    <span className="font-bold text-stone-200">{b.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ── Outcome step: narration beat + marshal's report-back ── */}
          {quotaStep === "outcome" && outcome && (
            <>
              <div className="border border-amber-800/40 rounded-lg p-3 bg-amber-950/20">
                <p className="text-stone-300 text-sm leading-relaxed italic">{outcome.narration}</p>
              </div>
              <div className="border border-stone-600 rounded-lg p-3 bg-stone-800/60">
                <p className="text-xs text-stone-400 font-bold uppercase tracking-wider mb-1">The King's Marshal</p>
                <p className="text-stone-200 text-sm leading-relaxed italic">"{MARSHAL_LINES[outcome.marshal]}"</p>
              </div>
              <button
                onClick={handleQuotaContinue}
                className="w-full py-2.5 bg-amber-800 hover:bg-amber-700 rounded-lg text-sm font-bold transition-colors"
                style={{ fontFamily: "'Georgia', serif" }}
              >
                Continue
              </button>
            </>
          )}

          <p className="text-[10px] text-stone-500 text-center font-mono">
            coerced: {coerced ? "true" : "false"} · campaign: {CrusadesCampaign.id}
          </p>
          <button onClick={onBack} className="block mx-auto text-xs text-stone-500 hover:text-stone-300 transition-colors mt-2">← Back to Campaigns</button>
        </div>
      </div>
    );
  }

  // ── Sage encounter (any sage from getNextSage) ─────────────
  if (phase === "sageEncounter" && activeSage) {
    const sageInFlight = activeSage; // local capture for closure-narrowed type
    return (
      <div className="h-screen bg-stone-900 text-stone-100 overflow-y-auto" style={{ fontFamily: "'Georgia', serif" }}>
        <div className="max-w-2xl mx-auto p-4 space-y-3">
          <p className="text-xs text-amber-400 uppercase tracking-wider">
            Sage Encounter · threshold {Math.round(sageInFlight.threshold * 100)}%
          </p>
          <SageEncounterV2
            sage={sageInFlight}
            currentStreak={streak}
            onComplete={(result) => {
              setStreak(result.newStreak);
              setSagePoints((p) => p + result.totalPoints);
              setCompletedSageIds((prev) => {
                const next = new Set(prev);
                next.add(sageInFlight.id);
                return next;
              });
              setActiveSage(null);
              setPhase("interlude");
            }}
          />
          <button onClick={onBack} className="block mx-auto text-xs text-stone-500 hover:text-stone-300 transition-colors mt-2">← Back to Campaigns</button>
        </div>
      </div>
    );
  }

  // ── Interlude (post-sage placeholder; next event lands here) ─
  return (
    <div className="h-screen bg-stone-900 text-stone-100 overflow-y-auto" style={{ fontFamily: "'Georgia', serif" }}>
      <div className="max-w-2xl mx-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-amber-400 uppercase tracking-wider">The Road Continues</p>
          <MeterReadout competence={competence} honor={honor} favor={favor} />
        </div>
        <div className="border border-amber-800/40 rounded-lg p-3 bg-amber-950/20">
          <p className="text-stone-400 text-sm leading-relaxed italic">
            The column moves on. Days pass without event worth recording.
          </p>
        </div>

        {/* DEV trigger + observability. Real engine will replace this. */}
        <div className="space-y-1.5">
          <button
            onClick={() => {
              if (nextSage) {
                setActiveSage(nextSage);
                setPhase("sageEncounter");
              }
            }}
            disabled={!nextSage}
            className="w-full py-2 bg-amber-900 hover:bg-amber-800 disabled:bg-stone-800 disabled:text-stone-500 disabled:cursor-not-allowed rounded text-sm font-bold transition-colors"
          >
            {nextSage ? `DEV · trigger next sage: ${nextSage.name}` : "DEV · all sages encountered"}
          </button>
          <p className="text-[10px] text-stone-500 text-center font-mono">
            streak: {streak} · sage points: {sagePoints} · coerced: {coerced ? "true" : "false"} · completed: {completedSageIds.size === 0 ? "none" : Array.from(completedSageIds).join(", ")}
          </p>
        </div>

        <button onClick={onBack} className="block mx-auto text-xs text-stone-500 hover:text-stone-300 transition-colors">← Back to Campaigns</button>
      </div>
    </div>
  );
}
