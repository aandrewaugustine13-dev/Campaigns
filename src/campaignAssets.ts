export interface HistoricalAsset {
  portrait: string;          // Path to local image
  bio?: string;              // Short historical blurb
  uiSkin?: string;           // Optional tailwind class override
}

export interface TopicAssets {
  characters: Record<string, HistoricalAsset>;
  uiTheme?: {
    skinClass?: string;
    fontFamily?: string;
  };
}

export const CAMPAIGN_ASSET_LIBRARY: Record<string, TopicAssets> = {
  'alamo': {
    characters: {
      "William B. Travis": {
        portrait: "/assets/images/alamo/travis.png",
        bio: "Commander of the Texian forces at the Alamo."
      },
      "James Bowie": {
        portrait: "/assets/images/alamo/bowie.png",
        bio: "Famous frontiersman and co-commander."
      },
      "Davy Crockett": {
        portrait: "/assets/images/alamo/crockett.png",
        bio: "Former Tennessee congressman and folk hero."
      },
      "Travis": {
        portrait: "/assets/images/alamo/travis.png",
      },
      "Bowie": {
        portrait: "/assets/images/alamo/bowie.png",
      },
      "Crockett": {
        portrait: "/assets/images/alamo/crockett.png",
      }
    },
    uiTheme: {
      skinClass: "theme-alamo"
    }
  },
  'chisholm': {
    characters: {
      "Jesse Chisholm": {
        portrait: "/assets/faces/sage_chisholm.png",
        bio: "The scout and merchant for whom the trail was named."
      },
      "Chisholm": {
        portrait: "/assets/faces/sage_chisholm.png",
      }
    }
  }
};

/**
 * Helper to find assets for a character within a campaign context
 */
export function getCharacterAsset(campaignId: string, name: string): HistoricalAsset | null {
  const topic = CAMPAIGN_ASSET_LIBRARY[campaignId];
  if (!topic) return null;
  
  // Try exact match
  if (topic.characters[name]) return topic.characters[name];
  
  // Try case-insensitive match
  const lowerName = name.toLowerCase();
  const found = Object.keys(topic.characters).find(k => k.toLowerCase() === lowerName);
  if (found) return topic.characters[found];

  return null;
}
