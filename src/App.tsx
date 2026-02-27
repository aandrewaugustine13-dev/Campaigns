import { useState, useRef, useEffect } from "react";

export default function App() {
  const [phase, setPhase] = useState<"outfit" | "game">("outfit");

  const handleOutfitDone = (cash: number, extraCrew: number, extraHorses: number, extraSupplies: number) => {
    console.log("Drive started with:", { cash, extraCrew, extraHorses, extraSupplies });
    setPhase("game");
  };

  if (phase === "outfit") {
    return (
      <div className="min-h-screen bg-stone-900 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-stone-800 border-2 border-amber-700 rounded-2xl p-8 text-center">
          <h1 className="text-4xl text-amber-400 font-bold mb-2">SAN ANTONIO — SPRING 1867</h1>
          <p className="text-stone-400 mb-8">Outfit your cattle drive</p>
          <div className="space-y-6 text-left">
            <div>Cowboys ($60 ea) <input type="range" min="0" max="4" defaultValue="0" className="w-full accent-amber-500" /></div>
            <div>Horses ($35 ea) <input type="range" min="0" max="20" defaultValue="0" className="w-full accent-amber-500" /></div>
            <div>Supplies ($1 ea) <input type="range" min="0" max="40" defaultValue="0" className="w-full accent-amber-500" /></div>
          </div>
          <button 
            onClick={() => handleOutfitDone(500, 0, 0, 0)}
            className="mt-8 w-full py-4 bg-amber-600 hover:bg-amber-500 text-xl font-bold rounded-xl"
          >
            HIT THE TRAIL
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-900 text-white flex flex-col items-center justify-center">
      <h1 className="text-5xl text-amber-400 font-bold">CHISHOLM TRAIL</h1>
      <p className="text-stone-400 mt-4 text-xl">✅ Game loaded successfully!</p>
      <p className="mt-8 text-emerald-400">Full game + pixel faces + hunting coming in next update</p>
    </div>
  );
}
