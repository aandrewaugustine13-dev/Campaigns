import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { config as loadEnv } from 'dotenv'
import { resolve } from 'path'
import { randomUUID } from 'crypto'

// Minimal JSON POST endpoint: validates method + API key, parses the body,
// hands {apiKey, inputs} to the handler, and serializes its return value.
// Used for /api/generate plus the Stage-1 proposer routes (frame/economy/cast).
function jsonPost(
  server: import('vite').ViteDevServer,
  path: string,
  handle: (apiKey: string, inputs: any) => Promise<unknown>,
): void {
  server.middlewares.use(path, async (req, res) => {
    const send = (status: number, payload: unknown) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(payload));
    };

    if (req.method !== 'POST') return send(405, { error: 'Method not allowed' });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return send(500, { error: 'ANTHROPIC_API_KEY not configured in .env.local' });

    let body = '';
    for await (const chunk of req) body += chunk;

    let inputs;
    try {
      inputs = body ? JSON.parse(body) : {};
    } catch {
      return send(400, { error: 'Invalid JSON in request body' });
    }

    try {
      const result = await handle(apiKey, inputs);
      send(200, result);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[generator-api] ${path} failed:`, message);
      send(500, { error: message });
    }
  });
}

function generatorApiPlugin(): Plugin {
  return {
    name: 'generator-api',
    configureServer(server) {
      loadEnv({ path: resolve(__dirname, '.env.local') });

      // Full campaign generation runs 3-5+ minutes — far too long to hold a
      // single browser request open reliably (a sleep, tab throttle, network
      // blip, or HMR reload kills it). So generation is an async JOB: POST
      // starts the work and returns a jobId immediately; the client polls
      // GET /api/generate/<id> every few seconds. Each request is sub-second,
      // so nothing can time it out. Jobs live in memory for the dev process;
      // they are delivered once then dropped, with a TTL sweep as a backstop.
      interface GenJob {
        status: 'running' | 'done' | 'error';
        startedAt: number;
        finishedAt?: number;
        data?: unknown;
        validation?: unknown;
        error?: string;
      }
      const jobs = new Map<string, GenJob>();

      const sweepJobs = () => {
        const now = Date.now();
        for (const [id, job] of jobs) {
          const since = now - (job.finishedAt ?? job.startedAt);
          if (job.status !== 'running' && since > 10 * 60_000) jobs.delete(id);
          else if (job.status === 'running' && now - job.startedAt > 30 * 60_000) jobs.delete(id);
        }
      };

      server.middlewares.use('/api/generate', async (req, res) => {
        const json = (status: number, payload: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(payload));
        };
        // req.url is the path AFTER the mount point: '/' to start, '/<id>' to poll.
        const sub = (req.url || '/').split('?')[0];

        // Start a job.
        if (req.method === 'POST' && (sub === '/' || sub === '')) {
          const apiKey = process.env.ANTHROPIC_API_KEY;
          if (!apiKey) return json(500, { error: 'ANTHROPIC_API_KEY not configured in .env.local' });

          let body = '';
          for await (const chunk of req) body += chunk;
          let inputs;
          try {
            inputs = body ? JSON.parse(body) : {};
          } catch {
            return json(400, { error: 'Invalid JSON in request body' });
          }

          const jobId = randomUUID();
          const job: GenJob = { status: 'running', startedAt: Date.now() };
          jobs.set(jobId, job);
          sweepJobs();
          const locked = !!(inputs && (inputs.frame || inputs.economy || inputs.cast || inputs.playerRole));
          console.log(`[generator-api] job ${jobId.slice(0, 8)} started (${locked ? 'guided/locked' : 'quick'})`);

          // Run in the background; the response returns right away.
          void (async () => {
            try {
              const { generateValidatedCampaign } = await import('./generator/core.ts');
              // maxRegen=2: with the frontier cutoff at devotion (+9), real
              // campaigns almost always ship, so a small retry budget catches the
              // rare genuine outlier (or a transient inert/choiceless slip)
              // without burning tokens. Per-attempt findings are logged regardless.
              const result = await generateValidatedCampaign(apiKey, inputs, { maxRegen: 2 });
              const secs = ((Date.now() - job.startedAt) / 1000).toFixed(0);
              if (result.status === 'rejected') {
                const lines = result.findings
                  .filter((f) => f.level === 'error')
                  .map((f) => `[${f.field}] ${f.message}`)
                  .join('\n');
                job.error = `Campaign rejected after ${result.attempts} attempt${result.attempts === 1 ? '' : 's'} — failed validation:\n${lines}`;
                job.status = 'error';
                console.warn(`[generator-api] job ${jobId.slice(0, 8)} REJECTED after ${secs}s (${result.errorCount} error(s))`);
              } else {
                job.data = result.data;
                job.validation = result.validation;
                job.status = 'done';
                console.log(`[generator-api] job ${jobId.slice(0, 8)} done in ${secs}s (${result.attempts} attempt(s))`);
              }
            } catch (e: unknown) {
              job.error = e instanceof Error ? e.message : String(e);
              job.status = 'error';
              const secs = ((Date.now() - job.startedAt) / 1000).toFixed(0);
              console.error(`[generator-api] job ${jobId.slice(0, 8)} failed after ${secs}s:`, job.error);
            } finally {
              job.finishedAt = Date.now();
            }
          })();

          return json(202, { jobId });
        }

        // Poll a job.
        if (req.method === 'GET' && sub.length > 1) {
          const job = jobs.get(sub.slice(1));
          if (!job) return json(404, { error: 'Unknown or expired generation job' });

          const elapsedSeconds = ((job.finishedAt ?? Date.now()) - job.startedAt) / 1000;
          if (job.status === 'running') return json(200, { status: 'running', elapsedSeconds });
          if (job.status === 'error') return json(200, { status: 'error', error: job.error, elapsedSeconds });

          const payload = { status: 'done', data: job.data, validation: job.validation, elapsedSeconds };
          jobs.delete(sub.slice(1)); // deliver once, then free memory
          return json(200, payload);
        }

        return json(405, { error: 'Method not allowed' });
      });

      // Stage-1 proposers: each takes { standard } and returns { data, findings }.
      // /api/frame also accepts an optional { forceType } — set when a teacher
      // overrides the recommended campaignType — which pins the regenerated frame
      // to that type (the content-safety law still overrides it in the prompt).
      jsonPost(server, '/api/frame', async (apiKey, inputs) => {
        const { generateFrame } = await import('./generator/frame.ts');
        const forceType = inputs.forceType === 'systems' || inputs.forceType === 'character'
          ? inputs.forceType
          : undefined;
        const { data, findings } = await generateFrame(String(inputs.standard ?? ''), apiKey, forceType, String(inputs.topic ?? ''));
        return { data, findings };
      });

      jsonPost(server, '/api/economy', async (apiKey, inputs) => {
        const { generateEconomy } = await import('./generator/economy.ts');
        const { data, findings } = await generateEconomy(String(inputs.standard ?? ''), apiKey, String(inputs.topic ?? ''));
        return { data, findings };
      });

      // Character campaigns only: propose a small, concrete PERSONAL economy
      // (money + 1–2 campaign-fit resources) for the chosen perspective, in
      // place of the abstract systems macro-meters. Takes { standard,
      // perspective, topic } and returns { data, findings }.
      jsonPost(server, '/api/personal-economy', async (apiKey, inputs) => {
        const { generatePersonalEconomy } = await import('./generator/personalEconomy.ts');
        const { data, findings } = await generatePersonalEconomy(
          String(inputs.standard ?? ''),
          String(inputs.perspective ?? ''),
          apiKey,
          String(inputs.topic ?? ''),
        );
        return { data, findings };
      });

      jsonPost(server, '/api/cast', async (apiKey, inputs) => {
        const { generateCast } = await import('./generator/cast.ts');
        const { data, findings } = await generateCast(String(inputs.standard ?? ''), apiKey, String(inputs.topic ?? ''));
        return { data, findings };
      });

      // Character campaigns only: propose the moral fault line for the chosen
      // perspective. Takes { standard, perspective, topic } and returns { data, findings }.
      // The perspective is load-bearing — the fault line depends on whose eyes.
      jsonPost(server, '/api/faultline', async (apiKey, inputs) => {
        const { generateFaultLine } = await import('./generator/faultline.ts');
        const { data, findings } = await generateFaultLine(
          String(inputs.standard ?? ''),
          String(inputs.perspective ?? ''),
          apiKey,
          String(inputs.topic ?? ''),
        );
        return { data, findings };
      });

      // The narrative-spine plan: an ordered arc of beats + the meaning the
      // story lands on. Takes { standard, topic, campaignType, progressionMode,
      // perspective } and returns { data, findings }. The teacher reviews/edits
      // the beats (include/exclude) before the confirmed plan is locked into the
      // generate payload as `storyPlan`; core.ts compiles its included beats
      // into pinned events and sets storyMeaning.
      jsonPost(server, '/api/storyplan', async (apiKey, inputs) => {
        const { generateStoryPlan } = await import('./generator/storyPlanGen.ts');
        const { data, findings } = await generateStoryPlan(String(inputs.standard ?? ''), apiKey, {
          topic: inputs.topic ? String(inputs.topic) : undefined,
          perspective: inputs.perspective ? String(inputs.perspective) : undefined,
          campaignType: inputs.campaignType === 'character' || inputs.campaignType === 'systems' ? inputs.campaignType : undefined,
          progressionMode: inputs.progressionMode === 'journey' || inputs.progressionMode === 'project' ? inputs.progressionMode : undefined,
        });
        return { data, findings };
      });

      // BRANCHING-STORY preview: the teacher's cheap CONFIDENCE GATE. Takes
      // { topic, standard, mustCover? } and returns { data, findings } — a short
      // summary + a TEKS coverage checklist on a cheap/fast model, WITHOUT writing
      // the (expensive) story. The teacher iterates on inputs here before paying
      // for a full generateBranchingStory.
      jsonPost(server, '/api/story-preview', async (apiKey, inputs) => {
        const { generateStoryPreview } = await import('./generator/storyPreviewGen.ts');
        const { data, findings } = await generateStoryPreview({
          topic: String(inputs.topic ?? ''),
          standard: String(inputs.standard ?? ''),
          mustCover: inputs.mustCover ? String(inputs.mustCover) : undefined,
        }, apiKey);
        return { data, findings };
      });

      // Full branching story generation (the real Product 2 story engine).
      // Returns the BranchingGenResult shape: { ok, story?, validation, attempts, raw }.
      // Uses the same robust generate + validate + repair loop as the CLI.
      jsonPost(server, '/api/branching', async (apiKey, inputs) => {
        const { generateBranchingStory } = await import('./generator/branchingStoryGen.ts');
        const result = await generateBranchingStory({
          topic: String(inputs.topic ?? ''),
          standard: String(inputs.standard ?? inputs.grade ?? ''),
          mustCover: inputs.mustCover ? String(inputs.mustCover) : undefined,
        }, apiKey);
        return result;
      });

      // Image search for the branching review/curate screen.
      // Reuses the project's real searchCommonsFileRanked (token scoring,
      // license filter, relevance) so results are high-quality historical images
      // (lithographs, paintings, engravings, location photos) rather than stock.
      // The topic (story context) is always the primary signal.
      // Returns { images: [...] } — top relevant matches.
      server.middlewares.use('/api/branching-images', async (req, res) => {
        const send = (status, payload) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(payload));
        };
        if (req.method !== 'POST') return send(405, { error: 'Method not allowed' });

        let body = '';
        for await (const chunk of req) body += chunk;
        let inputs = {};
        try {
          inputs = body ? JSON.parse(body) : {};
        } catch {
          return send(400, { error: 'Invalid JSON' });
        }

        try {
          const { searchCommonsFileRanked, searchViaArticlePageimage } = await import('./generator/wikimedia.ts');

          const title = String(inputs.title || inputs.topic || '').trim();
          const protagonist = String(inputs.protagonist || '').trim();
          const text = String(inputs.text || inputs.passage || inputs.passageText || '').trim();
          const fullContext = String(inputs.context || inputs.storyContext || '').trim();

          const mainContext = [title, fullContext].filter(Boolean).join(' ').slice(0, 300);
          if (!mainContext && !text) return send(200, { images: [] });

          // Use the *entire* story context (title + protagonist + other passages), not just the current personal sentence.
          // This way image search knows the whole campaign, not just one "you" moment.
          // Personal narrative makes keyword matching hard for historical images; full context helps a lot.
          const base = [mainContext, protagonist].filter(Boolean).join(' ').trim();

          // Build better queries that stay historically focused
          const queries = [];

          // Core story context (highest priority)
          if (base) {
            queries.push(base);
            queries.push(`${base} historical`);
            queries.push(`${base} lithograph`);
            queries.push(`${base} engraving`);
            queries.push(`${base} painting`);
            queries.push(`${base} fort OR battle OR harbor`);
          }

          if (text) {
            // Extract factual/historical keywords from *this* passage, strip personal "you" narrative
            const keyTerms = text
              .replace(/[^a-zA-Z0-9\s]/g, ' ')
              .split(/\s+/)
              .filter(w => {
                const lw = w.toLowerCase();
                return w.length > 3 &&
                  !['you', 'your', 'were', 'the', 'and', 'for', 'with', 'from', 'that', 'this', 'they', 'their', 'him', 'her', 'his', 'she', 'had', 'been', 'could', 'would'].includes(lw);
              })
              .slice(0, 7)
              .join(' ');

            if (keyTerms) {
              queries.push(`${base} ${keyTerms}`);
            }

            // Location / event extraction (forts etc) — combine with full story context
            const locMatch = text.match(/\b(Fort|Battle of|Siege of|Port of|Harbor)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,2})/i);
            if (locMatch) {
              const place = locMatch[2].trim();
              queries.push(place);
              queries.push(`${place} ${base}`);
              queries.push(`${place} historical`);
            }
          }

          // Pure style + topic fallbacks (very effective for historical art)
          if (base) {
            queries.push(`${base} fort`);
            queries.push(`${base} 1812`); // example for era-specific
          }

          const seen = new Set();
          let images = [];

          for (const q of queries) {
            if (!q || q.length < 3) continue;

            // Wikipedia article lead first — best chance for the "right" historical painting/lithograph of the event or location
            try {
              const lead = await searchViaArticlePageimage(q);
              if (lead && !seen.has(lead.thumbUrl)) {
                seen.add(lead.thumbUrl);
                images.push({
                  ...lead,
                  label: q.length > 55 ? q.slice(0, 52) + '...' : q,
                });
              }
            } catch {}

            // Full ranked Commons search
            const pool = await searchCommonsFileRanked(q, null);
            for (const img of pool) {
              if (!seen.has(img.thumbUrl)) {
                seen.add(img.thumbUrl);
                images.push({
                  ...img,
                  label: q.length > 55 ? q.slice(0, 52) + '...' : q,
                });
              }
            }

            if (images.length >= 5) break;
          }

          if (images.length === 0 && base) {
            // Absolute last resort — just the campaign title/context
            try {
              const lead = await searchViaArticlePageimage(base);
              if (lead && !seen.has(lead.thumbUrl)) {
                seen.add(lead.thumbUrl);
                images.push({ ...lead, label: base });
              }
            } catch {}
            const pool = await searchCommonsFileRanked(base, null);
            for (const img of pool) {
              if (!seen.has(img.thumbUrl)) {
                seen.add(img.thumbUrl);
                images.push({ ...img, label: base });
              }
            }
          }

          send(200, { images: images.slice(0, 5) });
        } catch (e) {
          console.error('[branching-images] error', e);
          send(200, { images: [] }); // never break the UI
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), generatorApiPlugin()],
  base: '/'
})
