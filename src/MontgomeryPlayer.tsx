// Player for a Montgomery bottleneck campaign.
// Bottlenecks and climax endings render the entering choice's bridgeText,
// a blank line, then the node narrative. The narrative itself stays branch-neutral.
import { useState } from "react";
import {
  arrivalProse,
  type MontgomeryCampaign,
  type MontgomeryChoice,
} from "../generator/montgomery";

interface MontgomeryPlayerProps {
  campaign: MontgomeryCampaign;
  onBack?: () => void;
}

export default function MontgomeryPlayer({ campaign, onBack }: MontgomeryPlayerProps) {
  const nodes = new Map(campaign.nodes.map((node) => [node.id, node]));
  const [currentId, setCurrentId] = useState<string>(campaign.start);
  const [bridge, setBridge] = useState<MontgomeryChoice | undefined>(undefined);
  const node = nodes.get(currentId);

  if (!node) {
    return (
      <div className="min-h-screen bg-[var(--player-bg)] text-[var(--player-text)] p-6">
        <p>This chapter is missing.</p>
        {onBack ? <button type="button" onClick={onBack} className="mt-4 underline">Back</button> : null}
      </div>
    );
  }

  const prose = arrivalProse(bridge, node);
  const ended = Boolean(node.ending) || !node.choices?.length;

  return (
    <div className="min-h-screen bg-[var(--player-bg)] text-[var(--player-text)] font-[var(--player-font-serif)] p-4 sm:p-8">
      <article className="max-w-xl mx-auto space-y-4">
        <p className="text-xs tracking-wide uppercase opacity-70">{node.title}</p>
        {prose.split("\n\n").map((paragraph, index) => (
          <p key={`${node.id}-${index}`} className="leading-relaxed whitespace-pre-wrap">{paragraph}</p>
        ))}
        {ended ? (
          <p className="text-sm opacity-80">
            {node.ending === "red" ? "This road ends here." : node.ending === "yellow" ? "History moves on without you." : "The campaign is over."}
          </p>
        ) : (
          <div className="space-y-2">
            {node.choices?.map((item) => (
              <button
                key={item.id}
                type="button"
                className="block w-full text-left border border-[var(--player-border)] bg-[var(--player-bg-card)] rounded px-3 py-2"
                onClick={() => {
                  setBridge(item);
                  setCurrentId(item.targetNodeId);
                }}
              >
                {item.text}
              </button>
            ))}
          </div>
        )}
        {onBack ? (
          <button type="button" onClick={onBack} className="text-sm underline opacity-80">Back</button>
        ) : null}
      </article>
    </div>
  );
}
