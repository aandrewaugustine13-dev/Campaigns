import type { GameEvent } from "../types";

// ═══════════════════════════════════════════════════════════════
// THIRD CRUSADE — events
// TODO[content]: all real event writing pending. The single stub
// below exists so the engine has *something* to land on when the
// cold-open prologue resolves and the campaign boots.
// ═══════════════════════════════════════════════════════════════

export const EVENTS: GameEvent[] = [
  {
    id: "first_road_south",
    phase_min: 0,
    phase_max: 0.2,
    weight: 5,
    title: "The Road South",
    // TODO[content]: replace placeholder text with real opening event.
    text: "The household column finds the road south of Vézelay. Dust, mud, and a thousand other crusaders moving in the same direction. Decisions will come soon.",
    choices: [
      {
        text: "Keep pace with the main host.",
        effects: { supplies: -2, water: -2 },
        result: "The column moves at the king's pace. Nothing remarkable today.",
      },
      {
        text: "Drop back to spare the horses.",
        effects: { morale: 1, supplies: -2 },
        result: "A slower march. The horses are still fresh by nightfall.",
      },
    ],
  },
];
