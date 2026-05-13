import { useState } from "react";
import DoomHUD from "./DoomHUD";
import SageEncounter from "./SageEncounter";
import { CrusadesCampaign, CRUSADES_INITIAL_FLAGS } from "./campaigns/crusades/index";
import { SAGES } from "./campaigns/crusades/sages";
import { EVENTS } from "./campaigns/crusades/events";
import CrusadesParallaxBackground from "./campaigns/crusades/parallax";

// ═══════════════════════════════════════════════════════════════
// THIRD CRUSADE — top-level campaign wrapper
//
// SCAFFOLD ONLY. Mirrors the SilkRoad.tsx self-contained pattern.
// Real engine wiring (resource updates, day ticks, route walking,
// event resolution, end screen) lands in a later commit.
//
// This commit boots the campaign end-to-end:
//   prologue → (Take the cross | Refuse → cinematic) → first event
// with DoomHUD and the Eleanor sage slot wired.
// ═══════════════════════════════════════════════════════════════

type Phase =
  | "prologue"            // cold-open: Hugh in his hall
  | "refusalCinematic"    // coerced=true short cinematic stub
  | "firstEvent"          // empty first event with HUD wired
  | "sageEleanor";        // Eleanor sage stub (~15% threshold)

interface CrusadesProps { onBack: () => void; }

export default function Crusades({ onBack }: CrusadesProps) {
  const [phase, setPhase] = useState<Phase>("prologue");
  // `coerced` flag lives on the campaign state, defaulting to false.
  // The cold-open prologue sets it. Later narration substitutions
  // will read from it. Today it does not branch content.
  const [coerced, setCoerced] = useState<boolean>(CRUSADES_INITIAL_FLAGS.coerced);

  const partyMembers = CrusadesCampaign.getPartyMembers(CrusadesCampaign.initialResources);
  const eleanor = SAGES.find((s) => s.id === "eleanor")!;
  const firstEvent = EVENTS[0];

  // ── Cold-open prologue ─────────────────────────────────────
  if (phase === "prologue") {
    return (
      <div className="h-screen bg-stone-900 text-stone-100 overflow-y-auto" style={{ fontFamily: "'Georgia', serif" }}>
        <div className="max-w-2xl mx-auto p-6 space-y-4">
          <h1 className="text-2xl font-bold text-amber-400">{CrusadesCampaign.title}</h1>
          <p className="text-stone-400 text-sm italic">{CrusadesCampaign.subtitle}</p>

          {/* TODO[art]: hero/prologue still at /backgrounds/crusades/prologue_hall.png */}
          <div
            className="w-full h-48 rounded border border-stone-700 flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #2a1f15, #1a1208)",
              backgroundImage: "url(/backgrounds/crusades/prologue_hall.png)",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <span className="text-stone-500 text-xs">{/* TODO[art]: prologue hall scene */}</span>
          </div>

          <div className="bg-stone-800 border border-stone-700 rounded p-4 space-y-3">
            <h2 className="text-amber-300 font-bold uppercase tracking-wide text-sm">The Hall at Warwick</h2>
            {/* TODO[content]: real prologue text — Hugh in his hall when the news arrives. */}
            <p className="text-stone-300 text-sm leading-relaxed">
              The fire is low. The wine is poor. A rider from the south arrives muddy to the
              knees with news that has already crossed half the kingdom: Baron de Beaumont has
              taken the cross with King Richard, and every household sworn to him is expected
              to follow.
            </p>
            <p className="text-stone-400 text-sm leading-relaxed italic">
              {/* TODO[content]: Hugh's wife's name, the children, the harvest — establishing detail. */}
              Your wife is somewhere in the house. The dogs are asleep. The rider waits for an answer.
            </p>
          </div>

          <div className="space-y-2 pt-1">
            <button
              onClick={() => { setCoerced(false); setPhase("firstEvent"); }}
              className="w-full py-3 bg-amber-800 hover:bg-amber-700 rounded font-bold transition-colors text-left px-4"
            >
              Take the cross.
              <div className="text-xs font-normal text-amber-300 mt-1">
                You go willingly. The household rides at first light.
              </div>
            </button>
            <button
              onClick={() => { setCoerced(true); setPhase("refusalCinematic"); }}
              className="w-full py-3 bg-stone-700 hover:bg-stone-600 rounded font-bold transition-colors text-left px-4"
            >
              Refuse.
              <div className="text-xs font-normal text-stone-300 mt-1">
                Beaumont will not take refusal. {/* TODO[content]: hint of consequence */}
              </div>
            </button>
            <button onClick={onBack} className="block w-full text-stone-500 hover:text-stone-300 text-xs mt-3">← Back to Campaigns</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Forced-recruitment cinematic stub (coerced=true) ───────
  if (phase === "refusalCinematic") {
    return (
      <div className="h-screen bg-stone-900 text-stone-100 overflow-y-auto" style={{ fontFamily: "'Georgia', serif" }}>
        <div className="max-w-2xl mx-auto p-6 space-y-4">
          <h1 className="text-xl font-bold text-red-400">The Baron's Men</h1>

          {/* TODO[art]: cinematic still at /backgrounds/crusades/forced_recruitment.png */}
          <div
            className="w-full h-48 rounded border border-stone-700 flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #2a1208, #1a0a05)",
              backgroundImage: "url(/backgrounds/crusades/forced_recruitment.png)",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <span className="text-stone-500 text-xs">{/* TODO[art]: forced recruitment cinematic */}</span>
          </div>

          <div className="bg-stone-800 border border-stone-700 rounded p-4 space-y-3">
            {/* TODO[content]: write the real cinematic. Three or four beats — the door, the
                seal, the road. Quiet, not melodramatic. Establish that Hugh is going either way. */}
            <p className="text-stone-300 text-sm leading-relaxed">
              They come at dawn. Not many — they do not need many. Beaumont's seal is shown.
              Your wife is told to be brave. The horses are saddled by men who are not yours.
            </p>
            <p className="text-stone-300 text-sm leading-relaxed">
              By midday you are on the road south with your household, your banner, and a guard
              from the baron riding at your shoulder. The cross is sewn to your surcoat by
              someone else's hand.
            </p>
            <p className="text-stone-500 text-xs italic">
              You are going to Jerusalem. The question of whether you wanted to is no longer being asked.
            </p>
          </div>

          <button
            onClick={() => setPhase("firstEvent")}
            className="w-full py-3 bg-amber-800 hover:bg-amber-700 rounded font-bold transition-colors"
          >
            South to Vézelay.
          </button>
        </div>
      </div>
    );
  }

  // ── Eleanor sage stub ──────────────────────────────────────
  if (phase === "sageEleanor") {
    return (
      <div className="h-screen bg-stone-900 text-stone-100 overflow-y-auto" style={{ fontFamily: "'Georgia', serif" }}>
        <div className="max-w-2xl mx-auto p-4 space-y-3">
          <p className="text-xs text-amber-400 uppercase tracking-wider">Sage Encounter · ~15% · before the fleet sails</p>
          <SageEncounter
            sage={eleanor}
            onComplete={() => setPhase("firstEvent")}
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

          <button
            onClick={() => setPhase("sageEleanor")}
            className="w-full py-2 bg-amber-900 hover:bg-amber-800 rounded text-sm font-bold transition-colors"
          >
            {/* DEV ONLY: jump to Eleanor sage slot. Real trigger will fire at ~15% progress. */}
            DEV · trigger Eleanor sage stub
          </button>

          <button onClick={onBack} className="block mx-auto text-xs text-stone-500 hover:text-stone-300 transition-colors">← Back to Campaigns</button>
        </div>
      </div>

      <DoomHUD members={partyMembers} />
    </div>
  );
}
