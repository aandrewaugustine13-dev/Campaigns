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

          // Run in the background; the response returns right away.
          void (async () => {
            try {
              const { generateCampaign } = await import('./generator/core.ts');
              const result = await generateCampaign(apiKey, inputs);
              job.data = result.data;
              job.validation = result.validation;
              job.status = 'done';
            } catch (e: unknown) {
              job.error = e instanceof Error ? e.message : String(e);
              job.status = 'error';
              console.error('[generator-api] /api/generate job failed:', job.error);
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
      jsonPost(server, '/api/frame', async (apiKey, inputs) => {
        const { generateFrame } = await import('./generator/frame.ts');
        const { data, findings } = await generateFrame(String(inputs.standard ?? ''), apiKey);
        return { data, findings };
      });

      jsonPost(server, '/api/economy', async (apiKey, inputs) => {
        const { generateEconomy } = await import('./generator/economy.ts');
        const { data, findings } = await generateEconomy(String(inputs.standard ?? ''), apiKey);
        return { data, findings };
      });

      jsonPost(server, '/api/cast', async (apiKey, inputs) => {
        const { generateCast } = await import('./generator/cast.ts');
        const { data, findings } = await generateCast(String(inputs.standard ?? ''), apiKey);
        return { data, findings };
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), generatorApiPlugin()],
  base: '/'
})
