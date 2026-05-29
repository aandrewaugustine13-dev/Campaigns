import { useState, useEffect, useRef } from "react";
import type { CampaignData } from "../generator/schema";
import GeneratedCampaign from "./GeneratedCampaign";
import Stage1Studio from "./Stage1Studio";

type Phase = "form" | "generating" | "error" | "playing";
type Mode = "guided" | "quick";

interface FormState {
  topic: string;
  standard: string;
  grade: string;
  length: number;
  numQuestions: number;
  numSages: number;
  difficulty: string;
  artStyle: string;
  customStylePrompt: string;
}

const DEFAULTS: FormState = {
  topic: "",
  standard: "",
  grade: "5th grade",
  length: 5,
  numQuestions: 3,
  numSages: 3,
  difficulty: "medium",
  artStyle: "default",
  customStylePrompt: "",
};

const GRADES = ["4th grade", "5th grade", "6th grade", "7th grade", "8th grade"];

export default function GeneratorUI({ onBack }: { onBack: () => void }) {
  const [phase, setPhase] = useState<Phase>("form");
  const [mode, setMode] = useState<Mode>("guided");
  const [form, setForm] = useState<FormState>(DEFAULTS);
  const [campaignData, setCampaignData] = useState<CampaignData | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const startTimer = () => {
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed(t => t + 1), 1000);
  };
  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const handleGenerate = async () => {
    if (!form.topic.trim() || !form.standard.trim()) return;

    setPhase("generating");
    setErrorMsg("");
    startTimer();

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      stopTimer();

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `Server returned ${res.status}`);
      }

      const result = await res.json();

      if (result.validation && result.validation.failed > 0) {
        const errors = result.validation.findings
          .filter((f: { level: string }) => f.level === "error")
          .map((f: { field: string; message: string }) => `${f.field}: ${f.message}`)
          .join("\n");
        console.warn("Validation errors:", errors);
      }

      setCampaignData(result.data as CampaignData);
      setPhase("playing");
    } catch (e) {
      stopTimer();
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  };

  const backToForm = () => {
    setPhase("form");
    setErrorMsg("");
  };

  // ── Playing ──
  if (phase === "playing" && campaignData) {
    return <GeneratedCampaign data={campaignData} onBack={backToForm} />;
  }

  // ── Guided (Stage 1) flow — the default. Manages its own steps and
  // hands back a finished campaign to play. ──
  if (mode === "guided" && phase === "form") {
    return (
      <Stage1Studio
        onPlay={(data) => { setCampaignData(data); setPhase("playing"); }}
        onBack={onBack}
        onQuickForm={() => setMode("quick")}
      />
    );
  }

  // ── Generating ──
  if (phase === "generating") {
    return (
      <div className="h-screen bg-stone-900 text-stone-100 flex flex-col items-center justify-center" style={{ fontFamily: "'Georgia', serif" }}>
        <div className="max-w-md text-center space-y-6 p-4">
          <h1 className="text-2xl font-bold text-amber-400">Generating Campaign...</h1>

          <div className="flex justify-center">
            <div className="w-12 h-12 border-4 border-amber-700 border-t-amber-400 rounded-full animate-spin" />
          </div>

          <p className="text-stone-300 text-lg font-mono">{elapsed}s</p>

          <div className="space-y-2 text-stone-500 text-sm">
            {elapsed < 20 && <p>Building the world...</p>}
            {elapsed >= 20 && elapsed < 50 && <p>Crafting events and choices...</p>}
            {elapsed >= 50 && elapsed < 80 && <p>Writing sage encounters and trivia...</p>}
            {elapsed >= 80 && elapsed < 110 && <p>Mapping the trail and finalizing...</p>}
            {elapsed >= 110 && <p>Almost there — large campaigns take longer...</p>}
          </div>

          <p className="text-stone-600 text-xs">
            This usually takes 60–120 seconds. The AI is building events,<br />
            sage encounters, trivia questions, and a complete trail map.
          </p>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (phase === "error") {
    return (
      <div className="h-screen bg-stone-900 text-stone-100 flex flex-col items-center justify-center" style={{ fontFamily: "'Georgia', serif" }}>
        <div className="max-w-md text-center space-y-4 p-4">
          <h1 className="text-2xl font-bold text-red-400">Generation Failed</h1>
          <div className="bg-red-950/40 border border-red-800 rounded p-3">
            <p className="text-red-300 text-sm">{errorMsg}</p>
          </div>
          <div className="space-y-2">
            <button onClick={handleGenerate} className="px-6 py-2 bg-amber-700 hover:bg-amber-600 rounded font-bold transition-colors">
              Try Again
            </button>
            <br />
            <button onClick={backToForm} className="text-xs text-stone-500 hover:text-stone-300 transition-colors">
              &larr; Back to form
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ──
  const canGenerate = form.topic.trim().length > 0 && form.standard.trim().length > 0;

  return (
    <div className="h-screen bg-stone-900 text-stone-100 flex flex-col overflow-hidden" style={{ fontFamily: "'Georgia', serif" }}>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto p-6 space-y-6">

          <div className="text-center space-y-1">
            <h1 className="text-2xl font-bold text-amber-400">Campaign Generator</h1>
            <p className="text-stone-500 text-sm">Create a playable campaign from a topic and standard.</p>
            <button
              onClick={() => setMode("guided")}
              className="text-xs text-amber-500 hover:text-amber-400 underline transition-colors"
            >
              Use guided setup instead (propose structure from a standard)
            </button>
          </div>

          {/* Topic */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-wide">Topic *</label>
            <input
              type="text"
              value={form.topic}
              onChange={e => setForm(f => ({ ...f, topic: e.target.value }))}
              placeholder="e.g. Lewis and Clark Expedition"
              className="w-full bg-stone-800 border border-stone-700 rounded px-3 py-2 text-sm text-stone-100 placeholder-stone-600 focus:border-amber-600 focus:outline-none"
            />
          </div>

          {/* Standard */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-wide">TEKS / Standard *</label>
            <input
              type="text"
              value={form.standard}
              onChange={e => setForm(f => ({ ...f, standard: e.target.value }))}
              placeholder="e.g. TEKS 5.1(A) — Significance of the Lewis and Clark Expedition"
              className="w-full bg-stone-800 border border-stone-700 rounded px-3 py-2 text-sm text-stone-100 placeholder-stone-600 focus:border-amber-600 focus:outline-none"
            />
          </div>

          {/* Grade */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-wide">Grade Level</label>
            <select
              value={form.grade}
              onChange={e => setForm(f => ({ ...f, grade: e.target.value }))}
              className="w-full bg-stone-800 border border-stone-700 rounded px-3 py-2 text-sm text-stone-100 focus:border-amber-600 focus:outline-none"
            >
              {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          {/* Events + Questions + Sages row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-wide">Events</label>
              <input
                type="number"
                min={3}
                max={15}
                value={form.length}
                onChange={e => setForm(f => ({ ...f, length: Math.max(3, Math.min(15, +e.target.value)) }))}
                className="w-full bg-stone-800 border border-stone-700 rounded px-3 py-2 text-sm text-stone-100 focus:border-amber-600 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-wide">Questions</label>
              <input
                type="number"
                min={3}
                max={10}
                value={form.numQuestions}
                onChange={e => setForm(f => ({ ...f, numQuestions: Math.max(3, Math.min(10, +e.target.value)) }))}
                className="w-full bg-stone-800 border border-stone-700 rounded px-3 py-2 text-sm text-stone-100 focus:border-amber-600 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-wide">Sages</label>
              <input
                type="number"
                min={2}
                max={5}
                value={form.numSages}
                onChange={e => setForm(f => ({ ...f, numSages: Math.max(2, Math.min(5, +e.target.value)) }))}
                className="w-full bg-stone-800 border border-stone-700 rounded px-3 py-2 text-sm text-stone-100 focus:border-amber-600 focus:outline-none"
              />
            </div>
          </div>

          {/* Difficulty */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-wide">Difficulty</label>
            <div className="flex gap-2">
              {["low", "medium", "high"].map(d => (
                <button
                  key={d}
                  onClick={() => setForm(f => ({ ...f, difficulty: d }))}
                  className={`flex-1 py-2 rounded text-sm font-bold transition-colors ${
                    form.difficulty === d
                      ? "bg-amber-700 text-stone-100"
                      : "bg-stone-800 border border-stone-700 text-stone-400 hover:border-stone-600"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Art Direction / Visual Theme */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-wide">Art Direction / Visual Theme</label>
            <select
              value={form.artStyle}
              onChange={e => setForm(f => ({ ...f, artStyle: e.target.value }))}
              className="w-full bg-stone-800 border border-stone-700 rounded px-3 py-2 text-sm text-stone-100 focus:border-amber-600 focus:outline-none"
            >
              <option value="default">Default Dark Slate</option>
              <option value="frontier">Distressed Frontier</option>
              <option value="parchment">Vintage Parchment & Ink</option>
              <option value="medieval">Medieval Tapestry & Chronicle</option>
            </select>
            <input
              type="text"
              value={form.customStylePrompt}
              onChange={e => setForm(f => ({ ...f, customStylePrompt: e.target.value }))}
              placeholder="Optional: Custom Style Prompt Overrides"
              className="w-full mt-2 bg-stone-800 border border-stone-700 rounded px-3 py-2 text-sm text-stone-100 placeholder-stone-600 focus:border-amber-600 focus:outline-none"
            />
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="w-full py-3 bg-amber-700 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed rounded font-bold text-lg transition-colors"
          >
            Generate Campaign
          </button>

          {/* Play previous if available */}
          {campaignData && (
            <button
              onClick={() => setPhase("playing")}
              className="w-full py-2 bg-stone-800 border border-stone-700 hover:border-amber-700 rounded text-sm text-stone-300 transition-colors"
            >
              Play previous: {(campaignData as CampaignData & { title: string }).title}
            </button>
          )}

          <button onClick={onBack} className="block w-full text-xs text-stone-500 hover:text-stone-300 text-center transition-colors">
            &larr; Back to Campaigns
          </button>
        </div>
      </div>
    </div>
  );
}
