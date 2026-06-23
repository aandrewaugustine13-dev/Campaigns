import React from "react";
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
        {/* FIRST-PERSON NARRATIVE SECTION */}
        <SectionHeader className="mb-2.5">First-Person Narrative</SectionHeader>

        <Button
          variant="primary"
          label="Create a First-Person Story"
          description="Generate a choose-your-path history story"
          onClick={() => handleSelect("create-story")}
          className="mb-6"
        />

        {/* LEGACY & DEMOS SECTION */}
        <SectionHeader className="mb-2.5 mt-1">Legacy &amp; Demos</SectionHeader>

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
