import { useState, useRef, useEffect } from "react";

// ==================== FULL CHISHOLM TRAIL CONFIG ====================
// Paste your complete CHISHOLM_TRAIL object here (the big one you originally had with all events)
// For now I'm leaving a short version — replace the whole block with yours
const CHISHOLM_TRAIL = {
  id: "chisholm",
  title: "THE CHISHOLM TRAIL",
  subtitle: "San Antonio to Abilene, 1867",
  startingCash: 500,
  totalDays: 70,
  daysPerTurn: 5,
  totalDistance: 800,
  resources: [ /* your full resources array */ ],
  paceOptions: [ /* your paceOptions */ ],
  passiveDrains: [ /* your passiveDrains */ ],
  attrition: [ /* your attrition */ ],
  endConditions: [ /* your endConditions */ ],
  grading: (state: any) => { /* your grading */ },
  historicalResult: { /* your historicalResult */ },
  crewFaces: [ /* your crewFaces */ ],
  events: [ /* ALL your events here */ ],
};

// ==================== PIXEL COMPONENTS ====================
const PALETTE = {
  skin: "#C9A07E", darkSkin: "#A67B5E",
  hat: "#3F2A1E", shirt: "#5C4033",
  eye: "#1C2526", white: "#F5E8C7",
  horn: "#E8D5B8",
  ground: "#8B6F47", sky: "#B8A68F",
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

      ctx.fillStyle = PALETTE.hat;
      ctx.fillRect(4, 2 + bob, 24, 12);
      ctx.fillStyle = crewId === "cook" ? "#E8B38A" : PALETTE.skin;
      ctx.fillRect(8, 8 + bob, 16, 16);
      ctx.fillStyle = PALETTE.eye;
      ctx.fillRect(11, 12 + bob, 3, 3);
      ctx.fillRect(18, 12 + bob, 3, 3);
      if (s >= 2) {
        ctx.fillRect(12, 13 + bob, 2, 1);
        ctx.fillRect(19, 13 + bob, 2, 1);
      }
      ctx.fillStyle = PALETTE.darkSkin;
      ctx.fillRect(12, 18 + bob + (s > 1 ? 1 : 0), 8, 1);
      if (s >= 2) {
        ctx.fillStyle = "#A8D4FF";
        ctx.fillRect(22, 10 + bob, 2, 3);
      }
      if (s === 3) {
        ctx.fillStyle = "#9B2A2A";
        ctx.fillRect(9, 15 + bob, 2, 2);
      }
      frameRef.current++;
      requestAnimationFrame(animate);
    };
    animate();
  }, [value, crewId]);

  return <canvas ref={canvasRef} className="w-12 h-12 border border-amber-800 rounded image-pixelated" />;
}

function HorizonHerd({ pace }: { pace: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const posRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    canvas.width = 620; canvas.height = 48;
    const speed = pace === "push" ? 3.2 : pace === "normal" ? 1.6 : 0.9;

    const animate = () => {
      ctx.fillStyle = PALETTE.sky; ctx.fillRect(0, 0, 620, 48);
      ctx.fillStyle = PALETTE.ground; ctx.fillRect(0, 32, 620, 16);
      posRef.current = (posRef.current + speed) % 650;

      for (let i = 0; i < 7; i++) {
        const x = ((posRef.current + i * 85) % 650) - 30;
        const bob = Math.sin(Date.now() / 180 + i) * 1.8;
        ctx.fillStyle = "#5C4033";
        ctx.fillRect(x + 8, 22 + bob, 20, 9);
        ctx.fillRect(x + 24, 18 + bob, 9, 7);
        ctx.fillStyle = PALETTE.horn;
        ctx.fillRect(x + 28, 16 + bob, 7, 3);
        ctx.fillRect(x + 28, 23 + bob, 7, 3);
      }
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

  const updateCash = () => setCash(Math.max(0, 500 - extraCrew * 60 - extraHorses * 35 - extraSupplies));

  useEffect(updateCash, [extraCrew, extraHorses, extraSupplies]);

  return (
    <div className="min-h-screen bg-stone-900 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-stone-800 border-2 border-amber-700 rounded-2xl p-8 text-center">
        <h1 className="text-4xl text-amber-400 font-bold mb-2">SAN ANTONIO — SPRING 1867</h1>
        <p className="text-stone-400 mb-8">Outfit your cattle drive</p>
        {/* sliders go here — same as my previous message */}
        <button onClick={() => onDone(cash, extraCrew, extraHorses, extraSupplies)} className="mt-6 w-full py-4 bg-amber-600 hover:bg-amber-500 text-xl font-bold rounded-xl">
          HIT THE TRAIL
        </button>
      </div>
    </div>
  );
}

// ==================== YOUR ORIGINAL GAME GOES HERE ====================
// Paste your full CampaignGame component (the big one with state, advanceTurn, handleChoice, etc.) here
// Then at the bottom export default function App() { return <CampaignGame />; }

export default function App() {
  return <div className="min-h-screen bg-stone-900 text-white flex items-center justify-center">Loading Chisholm Trail...</div>;
}
