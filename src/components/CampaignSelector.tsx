import React from "react";

interface CampaignSelectorProps {
  onSelect?: (key: string) => void;
}

export const CampaignSelector: React.FC<CampaignSelectorProps> = ({ onSelect }) => {
  const handleSelect = (key: string) => {
    if (onSelect) {
      onSelect(key);
    }
  };

  return (
    <div className="min-h-screen bg-[#18140f] bg-[radial-gradient(at_50%_15%,#221f1a_0%,transparent_55%)] flex flex-col items-center justify-center px-6 py-12">
      {/* Elegant serif title */}
      <h1 className="text-[#c9a36b] text-5xl font-serif tracking-[1.5px] mb-12 text-center select-none">
        CAMPAIGNS
      </h1>

      <div className="w-full max-w-[310px] flex flex-col">
        {/* FIRST-PERSON NARRATIVE SECTION */}
        <div className="mb-2.5 flex justify-center">
          <div className="text-[#b89d6e] text-[10px] font-medium tracking-[4px] uppercase">
            First-Person Narrative
          </div>
        </div>

        {/* Button 1: Create a First-Person Story */}
        <button
          onClick={() => handleSelect("create-story")}
          className="w-full rounded-2xl bg-gradient-to-br from-[#1f2a45] to-[#121a33] px-6 py-[19px] text-left shadow-[0_8px_24px_-6px_rgb(0,0,0,0.5)] transition-all active:scale-[0.985] hover:brightness-[1.08] border border-white/5 mb-6"
        >
          <div className="text-[15px] font-semibold text-white tracking-[-0.1px] leading-tight">
            Create a First-Person Story
          </div>
          <div className="mt-[3px] text-[12.5px] text-[#a69a80] leading-tight">
            Generate a choose-your-path history story
          </div>
        </button>

        {/* LEGACY & DEMOS SECTION */}
        <div className="mb-2.5 flex justify-center">
          <div className="text-[#b89d6e] text-[10px] font-medium tracking-[4px] uppercase">
            Legacy &amp; Demos
          </div>
        </div>

        {/* Button 2: + Create a Campaign */}
        <button
          onClick={() => handleSelect("create-campaign")}
          className="w-full rounded-2xl bg-gradient-to-br from-[#2c2a27] to-[#211f1c] px-6 py-[19px] text-left shadow-[0_8px_24px_-6px_rgb(0,0,0,0.5)] transition-all active:scale-[0.985] hover:brightness-[1.08] border border-white/5 mb-3"
        >
          <div className="text-[15px] font-semibold text-white tracking-[-0.1px] leading-tight">
            + Create a Campaign
          </div>
          <div className="mt-[3px] text-[12.5px] text-[#a69a80] leading-tight">
            Systems-mode generator (legacy)
          </div>
        </button>

        {/* Button 3: Chisholm Trail */}
        <button
          onClick={() => handleSelect("chisholm")}
          className="w-full rounded-2xl bg-gradient-to-br from-[#463426] to-[#32251b] px-6 py-[19px] text-left shadow-[0_8px_24px_-6px_rgb(0,0,0,0.5)] transition-all active:scale-[0.985] hover:brightness-[1.08] border border-white/5 mb-3"
        >
          <div className="text-[15px] font-semibold text-white tracking-[-0.1px] leading-tight">
            Chisholm Trail — 1867
          </div>
          <div className="mt-[3px] text-[12.5px] text-[#a69a80] leading-tight">
            San Antonio to Abilene
          </div>
        </button>

        {/* Button 4: Silk Road */}
        <button
          onClick={() => handleSelect("silkroad")}
          className="w-full rounded-2xl bg-gradient-to-br from-[#1c263f] to-[#131d32] px-6 py-[19px] text-left shadow-[0_8px_24px_-6px_rgb(0,0,0,0.5)] transition-all active:scale-[0.985] hover:brightness-[1.08] border border-white/5 mb-3"
        >
          <div className="text-[15px] font-semibold text-white tracking-[-0.1px] leading-tight">
            Silk Road — 130 BCE
          </div>
          <div className="mt-[3px] text-[12.5px] text-[#a69a80] leading-tight">
            Chang'an to Constantinople
          </div>
        </button>

        {/* Button 5: Third Crusade */}
        <button
          onClick={() => handleSelect("crusades")}
          className="w-full rounded-2xl bg-gradient-to-br from-[#3f2525] to-[#2a1919] px-6 py-[19px] text-left shadow-[0_8px_24px_-6px_rgb(0,0,0,0.5)] transition-all active:scale-[0.985] hover:brightness-[1.08] border border-white/5"
        >
          <div className="text-[15px] font-semibold text-white tracking-[-0.1px] leading-tight">
            Third Crusade — 1190
          </div>
          <div className="mt-[3px] text-[12.5px] text-[#a69a80] leading-tight">
            Warwick to Jerusalem
          </div>
        </button>
      </div>
    </div>
  );
};
