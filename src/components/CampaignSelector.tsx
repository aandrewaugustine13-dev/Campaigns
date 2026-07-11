import React from "react";
import { BookOpen, Sparkles } from "lucide-react";
import { PageContainer, MainTitle, SectionHeader, Button } from "./ui";

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
    <PageContainer>
      <MainTitle>CAMPAIGNS</MainTitle>

      <div className="flex flex-col">
        {/* PRODUCT — first-person narrative (the real game) */}
        <SectionHeader className="mb-2.5">First-Person Narrative</SectionHeader>

        {/* Light, elevated CTA — stands out from the dark PoC shell */}
        <button
          type="button"
          onClick={() => handleSelect("create-story")}
          className="group w-full rounded-2xl text-left mb-6 p-[1px] bg-gradient-to-br from-indigo-400/80 via-indigo-500 to-violet-600 shadow-[0_12px_32px_-8px_rgba(79,70,229,0.45)] transition-all active:scale-[0.985] hover:shadow-[0_16px_40px_-8px_rgba(79,70,229,0.55)] focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-400/30"
        >
          <div className="rounded-[15px] bg-white px-5 py-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
                <BookOpen className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[15px] font-semibold text-stone-900 tracking-tight">
                    Create a First-Person Story
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-700 ring-1 ring-indigo-100">
                    <Sparkles className="h-3 w-3" aria-hidden />
                    Product
                  </span>
                </div>
                <p className="mt-1 text-[12.5px] text-stone-500 leading-snug">
                  Generate a choose-your-path history story for students
                </p>
              </div>
            </div>
          </div>
        </button>

        {/* LEGACY & DEMOS SECTION — proof of concept only */}
        <SectionHeader className="mb-2.5 mt-1">Legacy &amp; Demos</SectionHeader>
        <p className="text-[10px] text-[#8a7f6a] mb-3 -mt-1 leading-snug">
          Proof-of-concept campaigns and the systems generator. Not the main product path.
        </p>

        <Button
          variant="secondary"
          label="+ Create a Campaign"
          description="Systems-mode generator (legacy)"
          onClick={() => handleSelect("create-campaign")}
          className="mb-3"
        />

        <Button
          variant="warm"
          label="Chisholm Trail — 1867"
          description="San Antonio to Abilene"
          onClick={() => handleSelect("chisholm")}
          className="mb-3"
        />

        <Button
          variant="alternative"
          label="Silk Road — 130 BCE"
          description="Chang'an to Constantinople"
          onClick={() => handleSelect("silkroad")}
          className="mb-3"
        />

        <Button
          variant="danger"
          label="Third Crusade — 1190"
          description="Warwick to Jerusalem"
          onClick={() => handleSelect("crusades")}
        />
      </div>
    </PageContainer>
  );
};
