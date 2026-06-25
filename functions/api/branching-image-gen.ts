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

    // First, try Wikimedia Commons for real historical images (no Google keys needed)
    try {
      const { searchViaArticlePageimage, searchCommonsFileRanked } = await import('../../generator/wikimedia.js');

      let wikiImage: any = null;

      // Prefer article lead image for the topic (often the best canonical historical image)
      if (topic) {
        wikiImage = await searchViaArticlePageimage(topic);
      }

      // If no good lead, try ranked Commons search on topic + scene (prose has nouns)
      if (!wikiImage) {
        const query = [topic, scene].filter(Boolean).join(' ').slice(0, 300);
        if (query) {
          const pool = await searchCommonsFileRanked(query, null);
          if (pool.length > 0) {
            wikiImage = pool[0];
          }
        }
      }

      if (wikiImage) {
        return new Response(
          JSON.stringify({
            image: {
              thumbUrl: wikiImage.thumbUrl,
              label: wikiImage.label || wikiImage.searchQuery || 'Historical image',
              sourceUrl: wikiImage.sourceUrl,
              artist: wikiImage.artist,
              license: wikiImage.license,
              // real historical image, not AI
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
    } catch (e) {
      console.warn('[branching-image-gen] Wikimedia search failed, falling back to AI:', e);
    }

    // Fallback to existing Gemini AI image generation (kept intact)
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
