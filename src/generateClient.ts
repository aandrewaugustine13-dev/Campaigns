// Client for the async campaign-generation job API. POST /api/generate starts
// the work and returns a jobId; we then poll GET /api/generate/<id> until the
// job is done or errors. Each request is sub-second, so a multi-minute
// generation never relies on one long-lived HTTP request.

export interface GenerationValidation {
  failed: number;
  passed: number;
  findings?: Array<{ level: string; field: string; message: string }>;
}

export interface GenerationResult {
  data: unknown;
  validation?: GenerationValidation;
  elapsedSeconds?: number;
}

export interface GenerateOptions {
  // Called on each poll with the server-reported elapsed seconds.
  onElapsed?: (seconds: number) => void;
  // Polling interval in ms (default 3000).
  pollMs?: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function generateCampaignJob(
  payload: unknown,
  opts: GenerateOptions = {},
): Promise<GenerationResult> {
  const pollMs = opts.pollMs ?? 3000;

  const startRes = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const started = await startRes.json().catch(() => ({}));
  if (!startRes.ok || started.error) {
    throw new Error(started.error || `Server returned ${startRes.status}`);
  }
  const jobId: string | undefined = started.jobId;
  if (!jobId) throw new Error('Server did not return a generation job id');

  // A handful of consecutive poll failures (transient dev-server hiccups) are
  // tolerated; a persistent failure or a lost job surfaces as an error.
  let consecutivePollErrors = 0;

  for (;;) {
    await sleep(pollMs);

    let res: Response;
    try {
      res = await fetch(`/api/generate/${jobId}`);
    } catch {
      if (++consecutivePollErrors > 5) throw new Error('Lost connection to the generation server.');
      continue;
    }

    if (res.status === 404) {
      throw new Error('The generation job was lost on the server (it may have restarted). Please try again.');
    }
    if (!res.ok) {
      if (++consecutivePollErrors > 5) throw new Error(`Generation status check failed (HTTP ${res.status}).`);
      continue;
    }

    consecutivePollErrors = 0;
    const job = await res.json();
    if (typeof job.elapsedSeconds === 'number') opts.onElapsed?.(Math.round(job.elapsedSeconds));

    if (job.status === 'done') {
      return { data: job.data, validation: job.validation, elapsedSeconds: job.elapsedSeconds };
    }
    if (job.status === 'error') {
      throw new Error(job.error || 'Generation failed on the server.');
    }
    // status === 'running' → keep polling
  }
}
