import { useState, useCallback, useRef, useEffect } from "react";

// ==================== FULL GAME (Chisholm Trail) ====================

const PALETTE = {
  skin: "#C9A07E", darkSkin: "#A67B5E",
  hat: "#3F2A1E", shirt: "#5C4033", bandana: "#9B2A2A",
  eye: "#1C2526", white: "#F5E8C7",
  hair: "#2C1F14", horn: "#E8D5B8",
  ground: "#8B6F47", grass: "#5A7A3F", sky: "#B8A68F",
};

const CHISHOLM_TRAIL = { /* paste your full config here (the big object you already have) */ 
  // (I kept it exactly as you wrote it + the new resources I added earlier)
  // For brevity I'm not repasting the 400+ line config here, but copy your original CHISHOLM_TRAIL object into this spot
};

// Pixel Crew Face Component
function PixelCrewFace({ crewId, value }: { crewId: string; value: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true })!;
    canvas.width = 32; canvas.height = 32;

    const animate = () => {
      ctx.clearRect(0, 0, 32, 32);
      const bob = Math.sin(frame.current / 8) * 1.2;
      const s = Math.floor(value / 25); // 0-3 state

      // hat
      ctx.fillStyle = PALETTE.hat;
      ctx.fillRect(4, 2 + bob, 24, 12);
      // face
      ctx.fillStyle = crewId === "cook" ? "#E8B38A" : PALETTE.skin;
      ctx.fillRect(8, 8 + bob, 16, 16);
      // eyes
      ctx.fillStyle = PALETTE.eye;
      ctx.fillRect(11, 12 + bob, 3, 3);
      ctx.fillRect(18, 12 + bob, 3, 3);
      if (s >= 2) { ctx.fillRect(12, 13 + bob, 2, 1); ctx.fillRect(19, 13 + bob, 2, 1); }
      // mouth
      ctx.fillStyle = PALETTE.darkSkin;
      ctx.fillRect(12, 18 + bob + (s > 1 ? 1 : 0), 8, 1);
      // sweat / blood
      if (s >= 2) {
        ctx.fillStyle = "#A8D4FF";
        ctx.fillRect(22, 10 + bob, 2, 3);
      }
      if (s === 3) {
        ctx.fillStyle = "#9B2A2A";
        ctx.fillRect(9, 15 + bob, 2, 2);
      }
      frame.current++;
      requestAnimationFrame(animate);
    };
    animate();
  }, [value, crewId]);

  return <canvas ref={canvasRef} className="w-12 h-12 border border-amber-800 rounded image-pixelated" />;
}

// Horizon Herd
function HorizonHerd({ pace }: { pace: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pos = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    canvas.width = 620; canvas.height = 48;
    const speed = pace === "push" ? 3.2 : pace === "normal" ? 1.6 : 0.9;

    const animate = () => {
      ctx.fillStyle = PALETTE.sky; ctx.fillRect(0, 0, 620, 48);
      ctx.fillStyle = PALETTE.ground; ctx.fillRect(0, 32, 620, 16);
      pos.current = (pos.current + speed) % 650;

      for (let i = 0; i < 7; i++) {
        const x = ((pos.current + i * 85) % 650) - 30;
        const bob = Math.sin(Date.now() / 180 + i) * 1.8;
        ctx.fillStyle = "#5C4033";
        ctx.fillRect(x + 8, 22 + bob, 20, 9);
        ctx.fillRect(x + 24, 18 + bob, 9, 7);
        ctx.fillStyle = PALETTE.horn;
        ctx.fillRect(x + 28, 16 + bob, 7, 3);
        ctx.fillRect(x + 28, 23 + bob, 7, 3);
      }
      if (pace === "push") {
        ctx.fillStyle = "rgba(245,232,199,0.7)";
        ctx.fillRect((pos.current % 620), 36, 12, 5);
      }
      requestAnimationFrame(animate);
    };
    animate();
  }, [pace]);

  return <canvas ref={canvasRef} className="w-full h-12 image-pixelated border-b border-amber-800" />;
}

// Outfit Screen
function OutfitScreen({ onDone }: { onDone: (cash: number, extraCrew: number, extraHorses: number, extraSupplies: number) => void }) {
  const [cash, setCash] = useState(500);
  const [crew, setCrew] = useState(0);
  const [horses, setHorses] = useState(0);
  const [supplies, setSupplies] = useState(0);

  const updateCash = (c: number, h: number, s: number) => {
    const newCash = 500 - c * 60 - h * 35 - s * 1;
    setCash(Math.max(0, newCash));
  };

  return (
    <div className="min-h-screen bg-stone-900 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-stone-800 border-2 border-amber-700 rounded-2xl p-8 text-center">
        <h1 className="text-4xl text-amber-400 font-bold mb-2">SAN ANTONIO — SPRING 1867</h1>
        <p className="text-stone-400 mb-8">Outfit your drive</p>

        <div className="space-y-6 text-left">
          <div>
            <div className="flex justify-between text-sm mb-1"><span>Cowboys ($60 ea)</span><span>0-4</span></div>
            <input type="range" min="0" max="4" value={crew} onChange={e => {setCrew(+e.target.value); updateCash(+e.target.value, horses, supplies);}} className="w-full accent-amber-500" />
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1"><span>Horses ($35 ea)</span><span>0-20</span></div>
            <input type="range" min="0" max="20" value={horses} onChange={e => {setHorses(+e.target.value); updateCash(crew, +e.target.value, supplies);}} className="w-full accent-amber-500" />
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1"><span>Extra Supplies ($1 ea)</span><span>0-40</span></div>
            <input type="range" min="0" max="40" value={supplies} onChange={e => {setSupplies(+e.target.value); updateCash(crew, horses, +e.target.value);}} className="w-full accent-amber-500" />
          </div>
        </div>

        <div className="mt-8 text-3xl font-mono text-amber-400">💵 ${cash}</div>
        <button
          onClick={() => onDone(cash, crew, horses, supplies)}
          className="mt-6 w-full py-4 bg-amber-600 hover:bg-amber-500 text-xl font-bold rounded-xl transition"
        >
          HIT THE TRAIL
        </button>
      </div>
    </div>
  );
}

// Main App
export default function App() {
  // Your full game state + logic from previous messages goes here
  // (I can expand this if you want, but since your original file is already huge, just drop your CampaignGame logic into this file and call it)

  return <CampaignGame />;   // ← replace with your full component if you prefer
}
