export type ObjectiveType = "morale" | "supplies" | "distance" | "crew";

export interface ObjectiveReward {
  insight: number;
  resources?: Record<string, number>;
}

export interface Objective {
  id: string;
  title: string;
  description: string;
  type: ObjectiveType;
  target: number;
  progress: number;
  completed: boolean;
  expiresInTurns: number;
  reward: ObjectiveReward;
}

export interface RouteEdge {
  to: string;
  tag: "SAFE" | "FAST" | "PROFIT";
  label: string;
}

export interface RouteNode {
  id: string;
  title: string;
  description: string;
  edges: RouteEdge[];
}

export interface RouteState {
  currentNodeId: string;
}

export interface EventGateQuestion {
  id: string;
  question: string;
  choices: string[];
  correctIndex: number;
  fact: string;
}
