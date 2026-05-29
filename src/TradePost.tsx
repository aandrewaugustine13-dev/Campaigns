// ════════════════════════════════════════════════════════════════
// TradePost — the decision the player makes at every town.
//
// A town is no longer a pile of fixed "buy" buttons. It is a barter
// stop: spend money for what you need, OR trade surplus inventory you
// no longer need (extra horses, spare parts, cattle) for cash or food.
// Each offer is a concrete give → get. Resolving one or leaving is the
// decision that moves the journey forward.
//
// Shared by Chisholm (App.tsx, stone styling) and the generic
// GeneratedCampaign engine (themed styling).
// ════════════════════════════════════════════════════════════════

export interface TradeOffer {
  id: string;
  label: string;
  give: Record<string, number>;
  get: Record<string, number>;
  /** Caller-computed: true when the player lacks the goods to trade. */
  disabled?: boolean;
}

interface TradePostProps {
  townName: string;
  resources: Record<string, number>;
  labels: Record<string, string>;
  /** Resource keys to show in the "your goods" strip (in order). */
  showKeys: string[];
  /** A resource rendered as currency ($) rather than "n label". */
  moneyKey?: string;
  offers: TradeOffer[];
  themed?: boolean;
  onTrade: (offer: TradeOffer) => void;
  onLeave: () => void;
}

export default function TradePost({
  townName,
  resources,
  labels,
  showKeys,
  moneyKey,
  offers,
  themed = false,
  onTrade,
  onLeave,
}: TradePostProps) {
  const ui = themed
    ? {
        card: "theme-bg-card theme-border",
        inner: "theme-bg-card-inner theme-divider",
        text: "theme-text",
        muted: "theme-text-muted",
        accent: "theme-text-accent",
        offer: "theme-dialogue-accent",
        leave: "theme-btn-action",
      }
    : {
        card: "bg-amber-950/30 border-amber-800",
        inner: "bg-stone-900/50 border-stone-700",
        text: "text-stone-100",
        muted: "text-stone-400",
        accent: "text-amber-300",
        offer: "bg-stone-700 hover:bg-stone-600 border-stone-600 text-stone-100",
        leave: "bg-amber-800 hover:bg-amber-700 text-white",
      };

  const fmt = (m: Record<string, number>, sign: "−" | "+") =>
    Object.entries(m)
      .map(([k, v]) =>
        k === moneyKey ? `${sign}$${v}` : `${sign}${v} ${labels[k] ?? k}`,
      )
      .join(", ");

  return (
    <div className={`border rounded-lg p-3 space-y-3 ${ui.card}`}>
      <div>
        <h3 className={`text-sm font-bold ${ui.accent}`}>🏪 Trading Post — {townName}</h3>
        <p className={`text-[11px] ${ui.muted}`}>
          Spend coin, barter goods you no longer need, or move the outfit on.
        </p>
      </div>

      {/* Your goods on hand */}
      <div className={`border rounded p-2 ${ui.inner}`}>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
          {showKeys.map((k) => (
            <span key={k} className={ui.muted}>
              <span className={`font-bold ${ui.text}`}>
                {k === moneyKey ? `$${Math.round(resources[k] ?? 0)}` : Math.round(resources[k] ?? 0)}
              </span>{" "}
              {k === moneyKey ? "cash" : labels[k] ?? k}
            </span>
          ))}
        </div>
      </div>

      {/* Offers */}
      <div className="space-y-1.5">
        {offers.map((offer) => (
          <button
            key={offer.id}
            onClick={() => !offer.disabled && onTrade(offer)}
            disabled={offer.disabled}
            className={`w-full text-left text-xs px-3 py-2 rounded border-2 font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${ui.offer}`}
          >
            <div>{offer.label}</div>
            <div className={`text-[10px] font-normal mt-0.5 ${ui.muted}`}>
              {fmt(offer.give, "−")} → {fmt(offer.get, "+")}
            </div>
          </button>
        ))}
      </div>

      <button
        onClick={onLeave}
        className={`w-full py-2 rounded text-sm font-bold transition-colors ${ui.leave}`}
      >
        Leave {townName} & press on →
      </button>
    </div>
  );
}
