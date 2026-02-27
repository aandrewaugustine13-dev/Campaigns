import { useState, useRef, useEffect } from "react";

const CHISHOLM_TRAIL = {
  id: "chisholm",
  title: "THE CHISHOLM TRAIL",
  subtitle: "San Antonio to Abilene, 1867",
  startingCash: 500,
  totalDays: 70,
  daysPerTurn: 5,
  totalDistance: 800,
  resources: [],
  paceOptions: [],
  passiveDrains: [],
  attrition: [],
  endConditions: [],
  grading: (_state: any) => "C", // fixed unused parameter
  historicalResult: { title: "", stats: [], summary: "" },
  crewFaces: [],
  events: [],
};

const PALETTE = {
  skin: "#C9A07E", darkSkin: "#A67B5E",
  hat: "#3F2A1E", eye: "#1C2526",
  horn: "#E8D5B8", ground: "#8B6F47", sky: "#B8A68F",
};

function PixelCrewFace({ crewId, value }: { crewId: string; value: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d", { alpha: true })!;
    canvas.width = 32; canvas.height = 32;

    const animate = () => {
      ctx.clearRect(0, 0, 32, 32);
      const bob = Math.sin(frameRef.current / 8) * 1.5;
      const s = Math.floor(value / 25);

      ctx.fillStyle = PALETTE.hat; ctx.fillRect(4, 2 + bob, 24, 12);
      ctx.fillStyle = PALETTE.skin; ctx.fillRect(8, 8 + bob, 16, 16);
      ctx.fillStyle = PALETTE.eye;
      ctx.fillRect(11, 12 + bob, 3, 3); ctx.fillRect(18, 12 + bob, 3, 3);
      ctx.fillStyle = PALETTE.darkSkin;
      ctx.fillRect(12, 18 + bob + (s > 1 ? 1 : 0), 8, 1);

      frameRef.current++;
      requestAnimationFrame(animate);
    };
    animate();
  }, [value]);

  return <canvas ref={canvasRef} className="w-12 h-12 border border-amber-800 rounded image-pixelated" />;
}

function HorizonHerd({ pace }: { pace: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const posRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    canvas.width = 620; canvas.height = 48;
    const speed = pace === "push" ? 3 : 1.5;

    const animate = () => {
      ctx.fillStyle = PALETTE.sky; ctx.fillRect(0, 0, 620, 48);
      ctx.fillStyle = PALETTE.ground; ctx.fillRect(0, 32, 620, 16);
      posRef.current = (posRef.current + speed) % 650;
      requestAnimationFrame(animate);
    };
    animate();
  }, [pace]);

  return <canvas ref={canvasRef} className="w-full h-12 image-pixelated border-b border-amber-800" />;
}

function OutfitScreen({ onDone }: { onDone: (cash: number, extraCrew: number, extraHorses: number, extraSupplies: number) => void }) {
  const [cash, setCash] = useState(500);
  const [extraCrew, setExtraCrew] = useState(0);
  const [extraHorses, setExtraHorses] = useState(0);
  const [extraSupplies, setExtraSupplies] = useState(0);

  const update = () => setCash(Math.max(0, 500 - extraCrew*60 - extraHorses*35 - extraSupplies));

  useEffect(update, [extraCrew, extraHorses, extraSupplies]);

  return (
    <div className="min-h-screen bg-stone-900 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-stone-800 border-2 border-amber-700 rounded-2xl p-8 text-center">
        <h1 className="text-4xl text-amber-400 font-bold mb-2">SAN ANTONIO — SPRING 1867</h1>
        <p className="text-stone-400 mb-8">Outfit your cattle drive</p>
        
        <div className="space-y-6 text-left">
          <div>Cowboys ($60 ea) <input type="range" min="0" max="4" value={extraCrew} onChange={e => setExtraCrew(+e.target.value)} className="w-full accent-amber-500" /></div>
          <div>Horses ($35 ea) <input type="range" min="0" max="20" value={extraHorses} onChange={e => setExtraHorses(+e.target.value)} className="w-full accent-amber-500" /></div>
          <div>Supplies ($1 ea) <input type="range" min="0" max="40" value={extraSupplies} onChange={e => setExtraSupplies(+e.target.value)} className="w-full accent-amber-500" /></div>
        </div>

        <div className="mt-8 text-3xl font-mono text-amber-400">💵 ${cash}</div>
        <button onClick={() => onDone(cash, extraCrew, extraHorses, extraSupplies)} className="mt-6 w-full py-4 bg-amber-600 hover:bg-amber-500 text-xl font-bold rounded-xl">
          HIT THE TRAIL
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [phase, setPhase] = useState<"outfit" | "game">("outfit");

  const handleOutfitDone = (cash: number, extraCrew: number, extraHorses: number, extraSupplies: number) => {
    console.log("Outfitted!", { cash, extraCrew, extraHorses, extraSupplies });
    setPhase("game");
  };

  if (phase === "outfit") return <OutfitScreen onDone={handleOutfitDone} />;

  return (
    <div className="min-h-screen bg-stone-900 text-white p-8">
      <h1 className="text-4xl text-amber-400">CHISHOLM TRAIL</h1>
      <p className="text-stone-400 mt-4">Game loaded successfully!</p>
      <HorizonHerd pace="normal" />
      <div className="mt-8">Full game logic coming next — this builds ✅</div>
    </div>
  );
}
