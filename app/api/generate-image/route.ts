import { NextResponse } from 'next/server';

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

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RequestBody;
    const { userPrompt } = body;

    // Validate the incoming userPrompt
    if (!userPrompt || typeof userPrompt !== 'string') {
      return NextResponse.json(
        { error: 'Valid userPrompt string is required' },
        { status: 400 }
      );
    }

    // Securely retrieve the API key from environment variables
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('GEMINI_API_KEY environment variable is not set.');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
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
      return NextResponse.json(
        { error: 'Failed to generate image from the Gemini API.' },
        { status: 500 }
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
      return NextResponse.json(
        { error: 'Invalid response format received from image generation service.' },
        { status: 500 }
      );
    }

    const prediction = data.predictions[0];

    // Return the successfully generated image data
    return NextResponse.json(
      {
        success: true,
        image: `data:${prediction.mimeType};base64,${prediction.bytesBase64Encoded}`,
        bytesBase64Encoded: prediction.bytesBase64Encoded,
        mimeType: prediction.mimeType,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error in generate-image route:', error);
    return NextResponse.json(
      { error: 'An unexpected internal server error occurred.' },
      { status: 500 }
    );
  }
}
