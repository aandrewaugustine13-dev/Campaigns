interface Env {
  GEMINI_API_KEY: string;
}

export const onRequestPost = async (context: any) => {
  const { request, env } = context;

  try {
    const body = await request.json();
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('GEMINI_API_KEY environment variable is not set.');
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY not configured' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Support batch: { passages: [ { id?, topic, scene/text, era?, contentMaturity? }, ... ] }
    // or single for backward compat: { topic, scene/text, ... }
    let items: any[] = [];
    const isBatch = Array.isArray(body?.passages);
    if (isBatch) {
      items = body.passages;
    } else if (body && (body.topic || body.scene || body.text)) {
      items = [body];
    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid body: expected {passages: [...] } or single {topic, scene}' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { generateIllustration } = await import('../../generator/imageGen.js');

    // Process all (use allSettled for graceful per-item errors)
    const settled = await Promise.allSettled(
      items.map(async (item: any, idx: number) => {
        const id = item?.id ?? item?.passageId ?? idx;
        const topic = String(item?.topic ?? '');
        const scene = String(item?.scene ?? item?.text ?? item?.passageText ?? '');
        if (!topic || !scene) {
          return { id, image: null, error: 'topic and scene required' };
        }
        try {
          const result = await generateIllustration(
            {
              topic,
              scene,
              era: item?.era ? String(item.era) : undefined,
              contentMaturity: item?.contentMaturity ? String(item.contentMaturity) : undefined,
            },
            apiKey
          );
          if (!result) {
            return { id, image: null, error: 'generation failed' };
          }
          return {
            id,
            image: {
              thumbUrl: result.dataUrl,
              label: '✨ AI-generated illustration',
              artist: 'AI-generated (Gemini 2.5 Flash Image)',
              license: 'AI-generated illustration — not a historical source',
              aiGenerated: true,
              prompt: result.prompt,
              model: result.model,
              ms: result.ms,
              bytes: result.bytes,
            },
          };
        } catch (e: any) {
          return { id, image: null, error: e?.message || 'error generating image' };
        }
      })
    );

    const results = settled.map((s) =>
      s.status === 'fulfilled' ? s.value : { image: null, error: 'failed to process' }
    );

    if (isBatch) {
      return new Response(JSON.stringify({ results }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      // single response for backward compatibility
      const single = results[0] || { image: null, error: 'no input' };
      if (single.image) {
        return new Response(JSON.stringify({ image: single.image }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } else {
        return new Response(JSON.stringify({ image: null, error: single.error }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
  } catch (error: any) {
    console.error('[branching-image-gen] error', error);
    return new Response(
      JSON.stringify({ error: 'Image service unavailable — text-only stays available.' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

// Handle CORS preflight
export const onRequestOptions = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};
