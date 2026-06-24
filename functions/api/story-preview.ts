interface Env {
  ANTHROPIC_API_KEY: string;
}

interface RequestBody {
  topic?: string;
  standard?: string;
  mustCover?: string;
}

export const onRequestPost = async (context: any) => {
  const { request, env } = context;

  try {
    const body = (await request.json()) as RequestBody;
    const { topic = '', standard = '', mustCover } = body;

    if (!topic || !standard) {
      return new Response(
        JSON.stringify({ error: 'topic and standard are required' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY environment variable is not set.');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const { generateStoryPreview } = await import('../../generator/storyPreviewGen.js');

    const result = await generateStoryPreview(
      {
        topic: String(topic),
        standard: String(standard),
        mustCover: mustCover ? String(mustCover) : undefined,
      },
      apiKey
    );

    return new Response(
      JSON.stringify({
        data: result.data,
        findings: result.findings,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in story-preview route:', error);
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
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
