interface Env {
  GEMINI_API_KEY: string;
}

interface RequestBody {
  userPrompt?: string;
}

interface GeminiPrediction {
  bytesBase64Encoded: string;
  mimeType: string;
}

interface GeminiResponse {
  predictions?: GeminiPrediction[];
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

    // Target the Imagen 3 predict endpoint
    const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        instances: [
          {
            prompt: combinedPrompt,
          },
        ],
        parameters: {
          sampleCount: 1,
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

    const data = (await response.json()) as GeminiResponse;

    // Validate the expected structure of the response
    if (
      !data.predictions ||
      data.predictions.length === 0 ||
      !data.predictions[0].bytesBase64Encoded
    ) {
      console.error('Unexpected Gemini API response format:', data);
      return new Response(
        JSON.stringify({ error: 'Invalid response format received from image generation service.' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const prediction = data.predictions[0];

    // Return the successfully generated image data
    return new Response(
      JSON.stringify({
        success: true,
        image: `data:${prediction.mimeType};base64,${prediction.bytesBase64Encoded}`,
        bytesBase64Encoded: prediction.bytesBase64Encoded,
        mimeType: prediction.mimeType,
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
