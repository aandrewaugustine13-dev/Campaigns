interface Env {
  GEMINI_API_KEY: string;
}

interface RequestBody {
  userPrompt?: string;
}

interface GeminiGenerateResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: { mimeType: string; data: string };
        inline_data?: { mimeType: string; data: string };
      }>;
    };
  }>;
  error?: any;
}

export const onRequestPost = async (context: any) => {
  const { request, env } = context;

  try {
    const body = (await request.json()) as RequestBody;
    const { userPrompt } = body;

    // Validate the incoming userPrompt
    if (!userPrompt || typeof userPrompt !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Valid userPrompt string is required' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Securely retrieve the API key from environment variables
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('GEMINI_API_KEY environment variable is not set.');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Concatenate the user prompt with the hidden stylistic modifier
    const modifier = '(Render in a 1940s WWII era style, authentic vintage comic book ink, muted color palette, high-contrast noir lighting)';
    const combinedPrompt = `${userPrompt} ${modifier}`;

    // Target the Gemini 2.0 Flash generateContent endpoint (supports image output via responseModalities)
    const model = 'gemini-2.0-flash-exp';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: combinedPrompt,
              },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Gemini API Error (${response.status}):`, errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to generate image from the Gemini API.' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const data = (await response.json()) as GeminiGenerateResponse;

    // Find the image part in the response (supports both camelCase and snake_case)
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const imgPart = parts.find((p: any) => p?.inlineData?.data || p?.inline_data?.data);
    const inlineData = imgPart?.inlineData || imgPart?.inline_data;

    if (!inlineData || !inlineData.data) {
      console.error('Unexpected Gemini API response format (no image part):', data);
      return new Response(
        JSON.stringify({ error: 'Invalid response format received from image generation service.' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const mimeType = inlineData.mimeType || 'image/png';
    const bytesBase64Encoded = inlineData.data;

    // Return the successfully generated image data (data URL)
    return new Response(
      JSON.stringify({
        success: true,
        image: `data:${mimeType};base64,${bytesBase64Encoded}`,
        bytesBase64Encoded,
        mimeType,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in generate-image route:', error);
    return new Response(
      JSON.stringify({ error: 'An unexpected internal server error occurred.' }),
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
