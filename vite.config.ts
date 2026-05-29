import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { config as loadEnv } from 'dotenv'
import { resolve } from 'path'

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

      // Full campaign generation (optionally with locked Stage-1 constraints).
      jsonPost(server, '/api/generate', async (apiKey, inputs) => {
        const { generateCampaign } = await import('./generator/core.ts');
        const result = await generateCampaign(apiKey, inputs);
        return {
          data: result.data,
          validation: result.validation,
          elapsedSeconds: result.elapsedSeconds,
        };
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
