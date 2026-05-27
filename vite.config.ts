import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { config as loadEnv } from 'dotenv'
import { resolve } from 'path'

function generatorApiPlugin(): Plugin {
  return {
    name: 'generator-api',
    configureServer(server) {
      loadEnv({ path: resolve(__dirname, '.env.local') });

      server.middlewares.use('/api/generate', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured in .env.local' }));
          return;
        }

        let body = '';
        for await (const chunk of req) body += chunk;

        let inputs;
        try {
          inputs = JSON.parse(body);
        } catch {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Invalid JSON in request body' }));
          return;
        }

        try {
          // Dynamic import so tsx can handle the .ts files at runtime
          const { generateCampaign } = await import('./generator/core.ts');
          const result = await generateCampaign(apiKey, inputs);

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            data: result.data,
            validation: result.validation,
            elapsedSeconds: result.elapsedSeconds,
          }));
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          console.error('[generator-api] Generation failed:', message);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: message }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), generatorApiPlugin()],
  base: '/'
})
