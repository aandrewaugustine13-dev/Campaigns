import { NextResponse } from 'next/server';

import { generateStoryPreview } from '../../../generator/storyPreviewGen';

interface RequestBody {
  topic?: string;
  standard?: string;
  mustCover?: string;
}

export async function POST(req: Request) {
  if (req.method !== 'POST') {
    return NextResponse.json(
      { error: 'Method not allowed' },
      { status: 405 }
    );
  }

  try {
    const body = (await req.json()) as RequestBody;
    const { topic = '', standard = '', mustCover } = body;

    if (!topic || !standard) {
      return NextResponse.json(
        { error: 'topic and standard are required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY environment variable is not set.');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const result = await generateStoryPreview(
      {
        topic: String(topic),
        standard: String(standard),
        mustCover: mustCover ? String(mustCover) : undefined,
      },
      apiKey
    );

    return NextResponse.json(
      {
        data: result.data,
        findings: result.findings,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error in story-preview route:', error);
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
