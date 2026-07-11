import React from "react";
import {
  BookOpen,
  Sparkles,
  Layers,
  Map,
  Compass,
  Swords,
  ChevronRight,
} from "lucide-react";
import { studio, StudioBadge } from "./studio";

interface CampaignSelectorProps {
  onSelect?: (key: string) => void;
}

/** Menu row for legacy / demo entries — same weight language as studio SelectableCards. */
function MenuRow({
  title,
  description,
  onClick,
  icon: Icon,
  badge,
}: {
  title: string;
  description: string;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "group w-full text-left rounded-xl border border-stone-200 bg-white p-4",
        "shadow-sm shadow-stone-200/40 transition-all duration-150",
        "hover:border-stone-300 hover:shadow-md hover:shadow-stone-200/50",
        "focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/15",
        "active:scale-[0.99]",
      ].join(" ")}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-600 ring-1 ring-stone-200/80 group-hover:bg-stone-50">
          <Icon className="h-5 w-5" aria-hidden={true} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-bold text-stone-900 tracking-tight">{title}</span>
            {badge && <StudioBadge tone="neutral">{badge}</StudioBadge>}
          </div>
          <p className="mt-0.5 text-sm font-medium text-stone-600 leading-snug">{description}</p>
        </div>
        <ChevronRight
          className="h-5 w-5 shrink-0 text-stone-300 group-hover:text-stone-500 transition-colors"
          aria-hidden
        />
      </div>
    </button>
  );
}

export const CampaignSelector: React.FC<CampaignSelectorProps> = ({ onSelect }) => {
  const handleSelect = (key: string) => {
    if (onSelect) onSelect(key);
  };

  return (
    <div className={`${studio.page} ${studio.font} flex flex-col min-h-screen`}>
      <div className="flex-1 flex flex-col items-center justify-center px-5 sm:px-6 py-12 sm:py-16">
        <div className="w-full max-w-md space-y-8">
          {/* Brand header */}
          <div className="text-center space-y-3">
            <p className="text-xs font-bold tracking-wide text-violet-700">
              Educational history
            </p>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-stone-900">
              Campaigns
            </h1>
            <p className="text-base font-medium text-stone-600 leading-relaxed max-w-sm mx-auto">
              Build interactive first-person history stories your students will actually want to finish — or try a classic demo.
            </p>
          </div>

          {/* Primary product */}
          <div className="space-y-2.5">
            <p className="text-xs font-bold uppercase tracking-wider text-stone-500 px-0.5">
              First-person narrative
            </p>

            <button
              type="button"
              onClick={() => handleSelect("create-story")}
              className={[
                "group w-full rounded-2xl text-left p-[1.5px]",
                "bg-gradient-to-br from-violet-500 via-violet-600 to-amber-600/80",
                "shadow-[0_12px_32px_-8px_rgba(91,33,182,0.35)]",
                "transition-all active:scale-[0.985]",
                "hover:shadow-[0_16px_40px_-8px_rgba(91,33,182,0.45)]",
                "focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-400/30",
              ].join(" ")}
            >
              <div className="rounded-[14px] bg-white px-5 py-5">
                <div className="flex items-start gap-3.5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                    <BookOpen className="h-5 w-5" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-lg font-bold text-stone-900 tracking-tight">
                        Create a First-Person Story
                      </span>
                      <StudioBadge tone="indigo">
                        <span className="inline-flex items-center gap-1">
                          <Sparkles className="h-3 w-3" aria-hidden />
                          Product
                        </span>
                      </StudioBadge>
                    </div>
                    <p className="mt-1.5 text-sm font-medium text-stone-600 leading-snug">
                      Generate a choose-your-path history story aligned to your TEKS standards
                    </p>
                  </div>
                  <ChevronRight
                    className="h-5 w-5 shrink-0 text-violet-300 group-hover:text-violet-600 transition-colors mt-1"
                    aria-hidden
                  />
                </div>
              </div>
            </button>
          </div>

          {/* Legacy / demos */}
          <div className="space-y-2.5">
            <div className="px-0.5">
              <p className="text-xs font-bold uppercase tracking-wider text-stone-500">
                Legacy &amp; demos
              </p>
              <p className="text-sm font-medium text-stone-500 mt-1 leading-snug">
                Proof-of-concept campaigns and the systems generator — not the main product path.
              </p>
            </div>

            <div className="space-y-2.5">
              <MenuRow
                icon={Layers}
                title="Create a Campaign"
                description="Systems-mode generator (legacy)"
                badge="Legacy"
                onClick={() => handleSelect("create-campaign")}
              />
              <MenuRow
                icon={Map}
                title="Chisholm Trail — 1867"
                description="San Antonio to Abilene"
                onClick={() => handleSelect("chisholm")}
              />
              <MenuRow
                icon={Compass}
                title="Silk Road — 130 BCE"
                description="Chang'an to Constantinople"
                onClick={() => handleSelect("silkroad")}
              />
              <MenuRow
                icon={Swords}
                title="Third Crusade — 1190"
                description="Warwick to Jerusalem"
                onClick={() => handleSelect("crusades")}
              />
            </div>
          </div>

          <p className="text-center text-xs font-medium text-stone-400 pt-2">
            Built for classrooms · historically grounded · standards-aligned
          </p>
        </div>
      </div>
    </div>
  );
};
