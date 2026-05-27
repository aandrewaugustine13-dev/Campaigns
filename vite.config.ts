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

      server.middlewares.use(async (req, res, next) => {
        const fullUrl = req.url || '';
        const urlPath = fullUrl.split('?')[0];
        
        // Match /api/generate with or without trailing slash
        const isMatch = /\/api\/generate\/?$/.test(urlPath);
        
        if (!isMatch) {
          return next();
        }

        console.log(`[generator-api] HIT: ${req.method} ${fullUrl}`);

        // CORS headers for all responses on this endpoint
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          console.log(`[generator-api] Handling OPTIONS for ${fullUrl}`);
          res.statusCode = 204;
          res.end();
          return;
        }

        if (req.method !== 'POST') {
          console.log(`[generator-api] REJECTED method ${req.method} for ${fullUrl}`);
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: `Method ${req.method} not allowed. Please use POST.` }));
          return;
        }

        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
          console.error('[generator-api] Missing ANTHROPIC_API_KEY');
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured in .env.local' }));
          return;
        }

        let body = '';
        try {
          for await (const chunk of req) body += chunk;
        } catch (e) {
          console.error('[generator-api] Error reading request body:', e);
          res.statusCode = 500;
          res.end();
          return;
        }

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
  plugins: [generatorApiPlugin(), react()],
  base: '/'
})
