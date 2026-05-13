import type { RouteNode } from "../../gameModels";

// ═══════════════════════════════════════════════════════════════
// THIRD CRUSADE — branching route
// Tags mirror Chisholm / Silk Road: SAFE / FAST / PROFIT.
// In Crusade flavour: Cautious / Forced March / Plunder.
// TODO[content]: real geography + final node copy.
// ═══════════════════════════════════════════════════════════════

export const CRUSADES_ROUTE: RouteNode[] = [
  {
    id: "start",
    title: "Vézelay Muster",
    description: "Richard's host assembles in Burgundy before marching south.",
    edges: [
      { to: "rhone_road",  tag: "SAFE",   label: "March down the Rhône with the column" },
      { to: "alpine_pass", tag: "FAST",   label: "Forced march over the Alpine passes" },
    ],
  },
  {
    id: "rhone_road",
    title: "Rhône Road",
    description: "Slow river road, well-supplied but exposed to local lords.",
    edges: [
      { to: "marseilles", tag: "SAFE",   label: "Cautious approach to Marseilles" },
      { to: "lombardy",   tag: "PROFIT", label: "Detour into Lombardy for plunder" },
    ],
  },
  {
    id: "alpine_pass",
    title: "Alpine Pass",
    description: "Quick miles, but the cold and the bandits both take their share.",
    edges: [
      { to: "marseilles", tag: "FAST",   label: "Push hard to the coast" },
      { to: "lombardy",   tag: "PROFIT", label: "Drop into Lombardy" },
    ],
  },
  {
    id: "marseilles",
    title: "Marseilles Harbour",
    description: "The fleet waits. Sicily next, then the Levant.",
    edges: [{ to: "sicily", tag: "SAFE", label: "Embark with the main host" }],
  },
  {
    id: "lombardy",
    title: "Lombard Towns",
    description: "Italian towns rich enough to bribe — or to bleed.",
    edges: [{ to: "sicily", tag: "PROFIT", label: "Cross to Sicily heavier-laden" }],
  },
  {
    id: "sicily",
    title: "Messina",
    description: "Richard winters here, quarrelling with Tancred and Philip.",
    edges: [
      { to: "cyprus", tag: "FAST",   label: "Sail east at first wind" },
      { to: "acre",   tag: "SAFE",   label: "Wait for the full fleet before sailing" },
    ],
  },
  {
    id: "cyprus",
    title: "Cyprus",
    description: "An unplanned conquest. Useful base, dangerous distraction.",
    edges: [{ to: "acre", tag: "PROFIT", label: "Cross to Acre with Cypriot loot" }],
  },
  {
    id: "acre",
    title: "Siege of Acre",
    description: "The host before the walls. Disease, hunger, glory.",
    edges: [
      { to: "jaffa_road", tag: "SAFE",   label: "March south in disciplined column" },
      { to: "jaffa_road", tag: "FAST",   label: "Press the coast road hard" },
    ],
  },
  {
    id: "jaffa_road",
    title: "Coast Road to Jaffa",
    description: "Saladin's harassers on every ridge. Discipline keeps you alive.",
    edges: [{ to: "finish", tag: "SAFE", label: "Hold to the sea and the screen" }],
  },
  {
    id: "finish",
    title: "Within Sight of Jerusalem",
    description: "The Holy City is close. The decision is not yours alone.",
    edges: [],
  },
];
