import { useState, useEffect, useRef, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════
// FLOATING NUMBERS — pop off stats when they change
// ═══════════════════════════════════════════════════════════════

interface FloatingNum {
  id: number;
  value: number;
  label: string;
  x: number;   // rough pixel offset for positioning
  y: number;
}

let _floatId = 0;

export function useFloatingNumbers() {
  const [floats, setFloats] = useState<FloatingNum[]>([]);

  const spawn = useCallback((value: number, label: string, x = 0, y = 0) => {
    if (value === 0) return;
    const id = ++_floatId;
    setFloats(prev => [...prev, { id, value, label, x, y }]);
    setTimeout(() => {
      setFloats(prev => prev.filter(f => f.id !== id));
    }, 1200);
  }, []);

  return { floats, spawn };
}

export function FloatingNumbers({ floats }: { floats: FloatingNum[] }) {
  return (
    <>
      {floats.map(f => (
        <div
          key={f.id}
          className="juice-float pointer-events-none absolute z-50"
          style={{
            left: f.x,
            top: f.y,
            fontFamily: "'Georgia', serif",
          }}
        >
          <span
            className="font-black text-lg drop-shadow-lg"
            style={{
              color: f.value > 0 ? "#4ade80" : "#ef4444",
              textShadow: f.value > 0
                ? "0 0 8px rgba(74,222,128,0.6), 0 2px 4px rgba(0,0,0,0.8)"
                : "0 0 8px rgba(239,68,68,0.6), 0 2px 4px rgba(0,0,0,0.8)",
            }}
          >
            {f.value > 0 ? "+" : ""}{f.value} {f.label}
          </span>
        </div>
      ))}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// SCREEN SHAKE — viewport jolts on big hits
// ═══════════════════════════════════════════════════════════════

export function useScreenShake() {
  const [shakeClass, setShakeClass] = useState("");

  const shake = useCallback((intensity: "light" | "medium" | "heavy" = "medium") => {
    const cls =
      intensity === "heavy" ? "juice-shake-heavy" :
      intensity === "light" ? "juice-shake-light" :
      "juice-shake-medium";
    setShakeClass(cls);
    setTimeout(() => setShakeClass(""), intensity === "heavy" ? 500 : 300);
  }, []);

  return { shakeClass, shake };
}

// ═══════════════════════════════════════════════════════════════
// STAT PULSE — flash stat boxes on change
// ═══════════════════════════════════════════════════════════════

export function useStatPulse() {
  const [pulses, setPulses] = useState<Record<string, "gain" | "loss" | "">>({});

  const pulse = useCallback((key: string, direction: "gain" | "loss") => {
    setPulses(prev => ({ ...prev, [key]: direction }));
    setTimeout(() => {
      setPulses(prev => ({ ...prev, [key]: "" }));
    }, 600);
  }, []);

  return { pulses, pulse };
}

// ═══════════════════════════════════════════════════════════════
// RESOURCE DELTA TRACKER — compares old/new and fires effects
// ═══════════════════════════════════════════════════════════════

interface Resources { [key: string]: number }

interface DeltaCallbacks {
  onDelta: (key: string, delta: number) => void;
  onBigHit: (totalLoss: number) => void;
}

export function useResourceTracker(resources: Resources, callbacks: DeltaCallbacks) {
  const prevRef = useRef<Resources | null>(null);

  useEffect(() => {
    if (prevRef.current === null) {
      prevRef.current = { ...resources };
      return;
    }

    const prev = prevRef.current;
    let totalLoss = 0;

    for (const key of Object.keys(resources)) {
      const delta = resources[key] - (prev[key] ?? resources[key]);
      if (delta !== 0) {
        callbacks.onDelta(key, delta);
        if (delta < 0) totalLoss += Math.abs(delta);
      }
    }

    if (totalLoss > 30) {
      callbacks.onBigHit(totalLoss);
    }

    prevRef.current = { ...resources };
  }, [resources]); // intentionally omit callbacks - they're stable via useCallback
}

// ═══════════════════════════════════════════════════════════════
// STAT BOX — enhanced resource display with pulse + float
// ═══════════════════════════════════════════════════════════════

export function StatBox({
  icon,
  label,
  value,
  pulseState,
}: {
  icon: string;
  label: string;
  value: string | number;
  pulseState: "gain" | "loss" | "";
}) {
  const borderColor =
    pulseState === "gain" ? "border-emerald-400" :
    pulseState === "loss" ? "border-red-500" :
    "border-transparent";

  const bgFlash =
    pulseState === "gain" ? "juice-flash-gain" :
    pulseState === "loss" ? "juice-flash-loss" :
    "";

  return (
    <div
      className={`bg-stone-700 rounded p-1.5 text-center relative overflow-hidden border-2 transition-colors duration-150 ${borderColor} ${bgFlash}`}
    >
      <div className="text-stone-400 text-xs">{icon} {label}</div>
      <div
        className={`font-bold transition-all duration-200 ${
          pulseState === "gain" ? "text-emerald-300 scale-110" :
          pulseState === "loss" ? "text-red-400 scale-110" :
          "text-amber-400"
        }`}
        style={{ transform: pulseState ? "scale(1.15)" : "scale(1)" }}
      >
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// RESOURCE BAR — enhanced with flash on change
// ═══════════════════════════════════════════════════════════════

export function ResourceBar({
  label,
  value,
  color,
  pulseState,
}: {
  label: string;
  value: number;
  color: string;
  pulseState: "gain" | "loss" | "";
}) {
  return (
    <div className={`flex items-center gap-2 ${pulseState === "loss" ? "juice-flash-loss" : pulseState === "gain" ? "juice-flash-gain" : ""}`}>
      <span className="w-20 text-stone-400 text-xs">{label}</span>
      <div className="flex-1 bg-stone-700 rounded-full h-2 overflow-hidden">
        <div
          className={`${color} h-2 rounded-full transition-all duration-500`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className={`text-xs w-6 text-right font-bold transition-colors duration-200 ${
        pulseState === "loss" ? "text-red-400" :
        pulseState === "gain" ? "text-emerald-300" :
        "text-stone-500"
      }`}>
        {value}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// STREAK FLASH — trivia streak celebration
// ═══════════════════════════════════════════════════════════════

export function StreakFlash({ streak }: { streak: number }) {
  const [visible, setVisible] = useState(false);
  const prevStreak = useRef(0);

  useEffect(() => {
    if (streak > prevStreak.current && streak >= 2) {
      setVisible(true);
      setTimeout(() => setVisible(false), 1500);
    }
    prevStreak.current = streak;
  }, [streak]);

  if (!visible || streak < 2) return null;

  const tier =
    streak >= 5 ? { text: "LEGENDARY STREAK", color: "#fbbf24", glow: "0 0 30px rgba(251,191,36,0.8)" } :
    streak >= 3 ? { text: "STREAK!", color: "#f97316", glow: "0 0 20px rgba(249,115,22,0.6)" } :
    { text: "x" + streak, color: "#a3e635", glow: "0 0 12px rgba(163,230,53,0.5)" };

  return (
    <div className="juice-streak-flash fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
      <div
        className="text-4xl font-black tracking-wider"
        style={{
          color: tier.color,
          textShadow: `${tier.glow}, 0 4px 8px rgba(0,0,0,0.9)`,
          fontFamily: "'Georgia', serif",
        }}
      >
        {tier.text}
      </div>
    </div>
  );
}
