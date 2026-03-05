import type { Objective, RouteNode } from "./gameModels";

interface ObjectiveContext {
  turn: number;
  day: number;
  distance: number;
  resources: Record<string, number>;
}

function uid(prefix: string, turn: number) {
  return `${prefix}_${turn}`;
}

export function generateObjective(ctx: ObjectiveContext): Objective {
  const pick = ctx.turn % 4;
  if (pick === 0) {
    return {
      id: uid("obj_morale", ctx.turn),
      title: "Keep Spirits High",
      description: "Keep morale at 50 or more for 2 turns.",
      type: "morale",
      target: 2,
      progress: 0,
      completed: false,
      expiresInTurns: 3,
      reward: { insight: 1, resources: { morale: 4 } },
    };
  }
  if (pick === 1) {
    return {
      id: uid("obj_food", ctx.turn),
      title: "Save Supplies",
      description: "End turns with supplies at 25 or more.",
      type: "supplies",
      target: 2,
      progress: 0,
      completed: false,
      expiresInTurns: 3,
      reward: { insight: 1, resources: { supplies: 4 } },
    };
  }
  if (pick === 2) {
    return {
      id: uid("obj_distance", ctx.turn),
      title: "Reach the Next Marker",
      description: "Travel 120 miles before this quest expires.",
      type: "distance",
      target: 120,
      progress: 0,
      completed: false,
      expiresInTurns: 3,
      reward: { insight: 1, resources: { morale: 2 } },
    };
  }
  return {
    id: uid("obj_crew", ctx.turn),
    title: "Protect the Crew",
    description: "Keep crew at 6 or more for 2 turns.",
    type: "crew",
    target: 2,
    progress: 0,
    completed: false,
    expiresInTurns: 3,
    reward: { insight: 1, resources: { crew: 1 } },
  };
}

export function tickObjectives(
  objectives: Objective[],
  prev: ObjectiveContext,
  next: ObjectiveContext,
): { active: Objective[]; completedNow: Objective[] } {
  const completedNow: Objective[] = [];
  const updated = objectives
    .map((o) => {
      const obj: Objective = { ...o, expiresInTurns: o.expiresInTurns - 1 };

      if (obj.type === "morale") {
        obj.progress = next.resources.morale >= 50 ? Math.min(obj.target, obj.progress + 1) : 0;
      } else if (obj.type === "supplies") {
        obj.progress = next.resources.supplies >= 25 ? Math.min(obj.target, obj.progress + 1) : obj.progress;
      } else if (obj.type === "distance") {
        obj.progress = Math.min(obj.target, obj.progress + Math.max(0, next.distance - prev.distance));
      } else if (obj.type === "crew") {
        obj.progress = next.resources.crew >= 6 ? Math.min(obj.target, obj.progress + 1) : 0;
      }

      if (!obj.completed && obj.progress >= obj.target) {
        obj.completed = true;
        completedNow.push(obj);
      }
      return obj;
    })
    .filter((o) => !o.completed && o.expiresInTurns > 0);

  return { active: updated, completedNow };
}

export function findNode(nodes: RouteNode[], id: string): RouteNode | undefined {
  return nodes.find((n) => n.id === id);
}

export function routeTag(nodes: RouteNode[], id: string): "SAFE" | "FAST" | "PROFIT" {
  const node = findNode(nodes, id);
  if (!node || node.edges.length === 0) return "SAFE";
  return node.edges[0].tag;
}
