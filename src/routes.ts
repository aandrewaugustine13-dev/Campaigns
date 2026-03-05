import type { RouteNode } from "./gameModels";

export const CHISHOLM_ROUTE: RouteNode[] = [
  {
    id: "start",
    title: "Red River Camp",
    description: "You begin near the river camps.",
    edges: [
      { to: "crossings", tag: "SAFE", label: "Scout known crossings" },
      { to: "open_plains", tag: "FAST", label: "Ride hard across plains" },
    ],
  },
  {
    id: "crossings",
    title: "River Crossings",
    description: "Safer water routes, slower travel.",
    edges: [
      { to: "abilene_road", tag: "PROFIT", label: "Head to trade road" },
      { to: "high_grass", tag: "SAFE", label: "Stay with grass valleys" },
    ],
  },
  {
    id: "open_plains",
    title: "Open Plains",
    description: "Fast miles, rough weather.",
    edges: [
      { to: "abilene_road", tag: "FAST", label: "Push toward Abilene" },
      { to: "high_grass", tag: "SAFE", label: "Slow down near creeks" },
    ],
  },
  {
    id: "high_grass",
    title: "High Grass Belt",
    description: "Good grazing and steady pace.",
    edges: [{ to: "finish", tag: "SAFE", label: "Take the steady final leg" }],
  },
  {
    id: "abilene_road",
    title: "Abilene Road",
    description: "Busy trail with buyers nearby.",
    edges: [{ to: "finish", tag: "PROFIT", label: "Aim for the best market" }],
  },
  {
    id: "finish",
    title: "Final Stretch",
    description: "The last miles to market.",
    edges: [],
  },
];
