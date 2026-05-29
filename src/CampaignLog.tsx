import { useMemo, useState } from "react";

// ════════════════════════════════════════════════════════════════
// CampaignLog — a read-only record of the run the player just took.
//
// Purpose: a disengaged player who clicked through events and trivia
// can come back here to FIND the answers they skipped. Every entry can
// expand to reveal the beat's narrative (`text`) and its educational
// payload (`detail` — the outcome, the "did you know" fact, or a sage/
// trivia question's correct answer + explanation).
//
// This component never mutates game state. It only displays.
//
// Reused by Chisholm (App.tsx, stone styling), GeneratedCampaign
// (themed styling), and the FinalExam review step.
// ════════════════════════════════════════════════════════════════

export interface CampaignLogEntry {
  day: number;
  event: string;
  choice: string;
  text?: string;
  detail?: string;
}

interface CampaignLogProps {
  entries: CampaignLogEntry[];
  /** Use theme-* classes (generated campaigns) instead of stone utilities. */
  themed?: boolean;
  title?: string;
  subtitle?: string;
  /** When provided, renders a close button in the header. */
  onClose?: () => void;
}

interface DayGroup {
  day: number;
  entries: { entry: CampaignLogEntry; idx: number }[];
}

function groupByDay(entries: CampaignLogEntry[]): DayGroup[] {
  const groups: DayGroup[] = [];
  entries.forEach((entry, idx) => {
    const last = groups[groups.length - 1];
    if (last && last.day === entry.day) {
      last.entries.push({ entry, idx });
    } else {
      groups.push({ day: entry.day, entries: [{ entry, idx }] });
    }
  });
  return groups;
}

export default function CampaignLog({
  entries,
  themed = false,
  title = "Campaign Log",
  subtitle = "Every decision you made. Expand any entry to review what happened — and the answers you may have skipped.",
  onClose,
}: CampaignLogProps) {
  const groups = useMemo(() => groupByDay(entries), [entries]);
  const [open, setOpen] = useState<Record<number, boolean>>({});

  const toggle = (idx: number) => setOpen((o) => ({ ...o, [idx]: !o[idx] }));

  const ui = themed
    ? {
        card: "theme-bg-card theme-border",
        inner: "theme-bg-card-inner theme-divider",
        text: "theme-text",
        muted: "theme-text-muted",
        accent: "theme-text-accent",
        row: "theme-dialogue-accent",
        btn: "theme-btn-action",
      }
    : {
        card: "bg-stone-800 border-stone-700",
        inner: "bg-stone-900/60 border-stone-700",
        text: "text-stone-100",
        muted: "text-stone-300",
        accent: "text-amber-400",
        row: "bg-stone-700 hover:bg-stone-600 border-stone-600 text-stone-100",
        btn: "bg-amber-700 hover:bg-amber-600 text-white",
      };

  return (
    <div className={`border rounded-lg p-4 space-y-4 ${ui.card}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className={`text-lg font-bold ${ui.accent}`}>{title}</h2>
          <p className={`text-xs ${ui.muted}`}>{subtitle}</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close campaign log"
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border-2 ${ui.row}`}
          >
            Close
          </button>
        )}
      </div>

      {groups.length === 0 ? (
        <p className={`text-xs ${ui.muted}`}>No decisions recorded yet.</p>
      ) : (
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {groups.map((group) => (
            <div key={group.day} className="space-y-1.5">
              <p className={`text-xs font-bold uppercase tracking-wider ${ui.muted}`}>
                Day {group.day}
              </p>
              {group.entries.map(({ entry, idx }) => {
                const expandable = Boolean(entry.text || entry.detail);
                const isOpen = !!open[idx];
                return (
                  <div key={idx} className={`border rounded-lg overflow-hidden ${ui.inner}`}>
                    <button
                      onClick={() => expandable && toggle(idx)}
                      className={`w-full text-left px-3 py-2.5 transition-colors ${expandable ? "cursor-pointer" : "cursor-default"} ${ui.row}`}
                      aria-expanded={isOpen}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm font-bold ${ui.text}`}>{entry.event}</span>
                        {expandable && (
                          <span className={`text-xs ${ui.muted}`}>{isOpen ? "▲" : "▼"}</span>
                        )}
                      </div>
                      <p className={`text-xs mt-0.5 ${ui.muted}`}>{entry.choice}</p>
                    </button>
                    {expandable && isOpen && (
                      <div className={`px-3 pb-3 pt-1 space-y-2 border-t ${themed ? "theme-divider" : "border-stone-700"}`}>
                        {entry.text && (
                          <p className={`text-xs leading-relaxed whitespace-pre-line ${ui.text}`}>{entry.text}</p>
                        )}
                        {entry.detail && (
                          <p className={`text-xs leading-relaxed whitespace-pre-line ${ui.muted}`}>{entry.detail}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Convenience overlay wrapper: centers the log over a dimmed backdrop.
// Call sites toggle visibility; clicking the backdrop closes.
export function CampaignLogModal(props: CampaignLogProps & { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center p-4 sm:p-8 bg-black/70 overflow-y-auto"
      onClick={props.onClose}
    >
      <div className="w-full max-w-2xl my-auto" onClick={(e) => e.stopPropagation()}>
        <CampaignLog {...props} />
      </div>
    </div>
  );
}
