interface Env {
  GEMINI_API_KEY: string;
}

interface RequestBody {
  topic?: string;
  standard?: string;
  mustCover?: string;
  contentMaturity?: string;
  proseRegister?: string;
  scope?: string;
  gumpIntensity?: string;
  outputLanguage?: string;
  teks?: string[];
  grade?: string;
  era?: string;
}

export const onRequestPost = async (context: any) => {
  const { request, env } = context;

  try {
    const body = (await request.json()) as RequestBody;
    const {
      topic = '',
      standard = '',
      mustCover,
      contentMaturity,
      proseRegister,
      scope,
      gumpIntensity,
      outputLanguage,
      teks,
      grade,
      era,
    } = body;

    if (!topic || !standard) {
      return new Response(
        JSON.stringify({ error: 'Please provide a topic and TEKS standard to create the story.' }),
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
        JSON.stringify({ error: 'The story service is temporarily unavailable. Please try again in a moment.' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const { generateBranchingStory } = await import('../../generator/branchingStoryGen.js');

    const result = await generateBranchingStory(
      {
        topic: String(topic),
        standard: String(standard ?? grade ?? ''),
        mustCover: mustCover ? String(mustCover) : undefined,
        contentMaturity: contentMaturity ? String(contentMaturity) : undefined,
        proseRegister: proseRegister ? String(proseRegister) : undefined,
        scope: scope === 'depth' ? 'depth' : scope === 'span' ? 'span' : undefined,
        gumpIntensity:
          gumpIntensity === 'high' ? 'high' : gumpIntensity === 'off' ? 'off' : undefined,
        outputLanguage: outputLanguage ? String(outputLanguage) : undefined,
        teks: Array.isArray(teks) ? teks.map(String) : undefined,
        era: era ? String(era) : undefined,
      },
      apiKey
    );

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in /api/branching route:', error);
    const message = error instanceof Error ? error.message : 'The story service ran into an unexpected issue. Please try again.';
    return new Response(
      JSON.stringify({ error: message }),
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
