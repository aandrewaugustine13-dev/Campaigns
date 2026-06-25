interface Env {
  GEMINI_API_KEY: string;
}

export const onRequestPost = async (context: any) => {
  const { request, env } = context;

  try {
    const body = await request.json();
    const topic = String(body?.topic ?? '');
    const scene = String(body?.scene ?? body?.text ?? body?.passageText ?? '');

    if (!topic || !scene) {
      return new Response(
        JSON.stringify({ image: null, error: 'topic and scene are required' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('GEMINI_API_KEY environment variable is not set.');
      return new Response(
        JSON.stringify({ image: null, error: 'GEMINI_API_KEY not configured' }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Reuse the existing illustration generator for consistency with local dev
    const { generateIllustration } = await import('../../generator/imageGen.js');

    const result = await generateIllustration(
      {
        topic,
        scene,
        era: body?.era ? String(body.era) : undefined,
        // contentMaturity can be passed if sent by frontend
        contentMaturity: body?.contentMaturity ? String(body.contentMaturity) : undefined,
      },
      apiKey
    );

    if (!result) {
      return new Response(
        JSON.stringify({ image: null, error: 'generation failed (see server log) — text-only fallback' }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({
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
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[branching-image-gen] error', error);
    return new Response(
      JSON.stringify({ image: null, error: 'Image service unavailable — text-only stays available.' }),
      {
        status: 200,
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
