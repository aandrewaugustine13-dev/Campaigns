import { useState } from "react";
import DoomHUD from "./DoomHUD";
import SageEncounterV2 from "./SageEncounterV2";
import { CrusadesCampaign, CRUSADES_INITIAL_FLAGS } from "./campaigns/crusades/index";
import { getNextSage, type Sage } from "./campaigns/crusades/sageEncounters";
import { EVENTS } from "./campaigns/crusades/events";
import CrusadesParallaxBackground from "./campaigns/crusades/parallax";

// ═══════════════════════════════════════════════════════════════
// THIRD CRUSADE — top-level campaign wrapper
//
// Opening sequence is a motion-comic click-through:
//   opening (4 panels) → banner (two-button choice) → goodbye →
//   firstEvent → sageEncounter
//
// Banner choice sets `coerced` and routes to one of two goodbyes.
// `coerced` persists across the session so downstream narration
// can read it. The game does not branch on `coerced` — it only
// flavours later beats.
// ═══════════════════════════════════════════════════════════════

type Phase =
  | "opening"           // 4 narrative panels, tap-to-advance
  | "banner"            // panel 5: two-button choice, NOT tap-to-advance
  | "goodbyeWilling"    // post-accept goodbye, tap-to-advance
  | "goodbyeCoerced"    // post-refuse goodbye, tap-to-advance
  | "firstEvent"        // empty first event with HUD wired
  | "sageEncounter";    // active sage encounter (any sage from SAGES)

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

export default function Crusades({ onBack }: CrusadesProps) {
  const [phase, setPhase] = useState<Phase>("opening");
  const [coerced, setCoerced] = useState<boolean>(CRUSADES_INITIAL_FLAGS.coerced);
  // Panel cursor for the click-through phases. Reset on phase entry.
  const [panelIndex, setPanelIndex] = useState<number>(0);

  // ── Sage encounter state (persists across all sages) ───────
  const [streak, setStreak] = useState<number>(0);
  const [sagePoints, setSagePoints] = useState<number>(0);
  const [completedSageIds, setCompletedSageIds] = useState<Set<string>>(() => new Set());
  const [activeSage, setActiveSage] = useState<Sage | null>(null);

  const partyMembers = CrusadesCampaign.getPartyMembers(CrusadesCampaign.initialResources);
  const firstEvent = EVENTS[0];
  // DEV: no real progress engine yet — pass 1.0 so any uncompleted sage is
  // eligible. Real engine wiring will pass actual journey progress.
  const nextSage = getNextSage(1.0, completedSageIds);

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
              if (isLast) { setPanelIndex(0); setPhase("firstEvent"); }
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
              setPhase("firstEvent");
            }}
          />
          <button onClick={onBack} className="block mx-auto text-xs text-stone-500 hover:text-stone-300 transition-colors mt-2">← Back to Campaigns</button>
        </div>
      </div>
    );
  }

  // ── First event (placeholder) with DoomHUD wired ───────────
  return (
    <div className="h-screen bg-stone-900 text-stone-100 flex flex-col" style={{ fontFamily: "'Georgia', serif" }}>
      <div className="flex-shrink-0">
        <CrusadesParallaxBackground progress={2} pace="normal" height={150} />
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-amber-400">{firstEvent.title}</h1>
            <span className="text-[10px] text-stone-500 uppercase tracking-wider">
              coerced: {coerced ? "true" : "false"}
            </span>
          </div>

          <div className="bg-stone-800 border border-stone-700 rounded p-4 space-y-3">
            <p className="text-stone-300 text-sm leading-relaxed">{firstEvent.text}</p>
            {/* TODO[content]: replace placeholder choices with the real opening event flow. */}
            <div className="space-y-2 pt-1">
              {firstEvent.choices?.map((c, i) => (
                <button
                  key={i}
                  onClick={() => { /* TODO[engine]: resolve choice effects/results once engine is wired */ }}
                  className="w-full text-left px-3 py-2 bg-stone-700 hover:bg-stone-600 rounded text-sm transition-colors"
                >
                  {c.text}
                </button>
              ))}
            </div>
          </div>

          {/* DEV trigger + observability. Real trigger will come from the progress engine. */}
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
              streak: {streak} · points: {sagePoints} · completed: {completedSageIds.size === 0 ? "none" : Array.from(completedSageIds).join(", ")}
            </p>
          </div>

          <button onClick={onBack} className="block mx-auto text-xs text-stone-500 hover:text-stone-300 transition-colors">← Back to Campaigns</button>
        </div>
      </div>

      <DoomHUD members={partyMembers} />
    </div>
  );
}
