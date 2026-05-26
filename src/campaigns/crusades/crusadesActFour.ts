// ═══════════════════════════════════════════════════════════════
// THIRD CRUSADE — Act Four: Homecoming & Historical Context
// ═══════════════════════════════════════════════════════════════

export interface HomecomingEnding {
  tapestry: string;
  text: string;
  exposition: string;
}

export function getHomecomingEnding(honor: number, competence: number, favor: number): HomecomingEnding {
  // High Honor (> 5)
  if (honor > 5) {
    return {
      tapestry: "homecoming-moral.webp",
      text: "You stand at the threshold of your own door, the same one you were dragged from — or walked from — three years ago. Your children are older, your wife's face is lined with the years you were gone. But as you step into the light, you realize you kept your soul.",
      exposition: "Your family is thrilled to have you home. You did not return with wagons of plundered silver, and the winter will be hard, but you returned as the man they loved. In a war that stripped men of their humanity, you held onto yours. They respect you not for the war you fought, but for the one you refused to fight."
    };
  }

  // Low Honor (< 2), High Competence (> 4)
  if (honor < 2 && competence > 4) {
    return {
      tapestry: "homecoming-feared.webp",
      text: "You stand at the threshold of a grand house, built with the gold you won in the desert. Your family wears fine wool and eats well. But as you enter, you see your children shrinking back.",
      exposition: "Your family fears you. You brought back wealth and secured their comfort for a generation, but the cost is written in your eyes and the cruelty of your hands. They obey you because you are a capable, dangerous lord. But the father and husband who left them is dead."
    };
  }

  // Low Honor (< 2), Low Competence (< 2) OR Default fallback
  return {
    tapestry: "homecoming-disrespected.webp",
    text: "You stand at the threshold of a rotting door. They look at you with nothing but pity and contempt.",
    exposition: "Your family does not respect you. You survived, but only through cowardice and fumbling incompetence. You bring back no wealth to secure their future, and no honor to secure their pride. You are a broken man who hid while others fought, and they see it."
  };
}

export const crusadeSummaryText = "The Third Crusade (1189–1192) ended not in total victory, but in a pragmatic truce. King Richard the Lionheart and Sultan Saladin fought to a standstill. Jerusalem remained under Muslim control, but unarmed Christian pilgrims were guaranteed safe passage. The massive armies dissolved, leaving behind a legacy of immense bloodshed, but also deep cultural and economic diffusion between the East and West.";

export const finalCheckQuestion = {
  prompt: "Ultimately, what was the most significant historical outcome of the Third Crusade?",
  choices: [
    "It established a pragmatic truce allowing pilgrim access and sparked massive cultural diffusion between East and West.",
    "King Richard permanently conquered Jerusalem and expanded the English Empire into the Middle East.",
    "Saladin destroyed the entire Crusader army, ending European presence in the region forever.",
    "It forced the Pope to completely ban all future holy wars."
  ],
  correctIndex: 0
};
