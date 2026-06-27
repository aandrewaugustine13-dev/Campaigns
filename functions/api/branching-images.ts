interface Env {
  GEMINI_API_KEY?: string;
}

export const onRequestPost = async (context: any) => {
  const { request, env } = context;

  try {
    const body = await request.json();
    const topic = String(body?.topic || body?.title || '').trim();
    const standard = String(body?.standard || '').trim();
    const text = String(body?.text || body?.passage || body?.passageText || '').trim();

    const standardNouns = standard
      .replace(/\bTEKS\b[^—:-]*[—:-]?/i, '')
      .replace(/\s+/g, ' ')
      .trim();

    const base = topic;
    if (!base && !standardNouns && !text) {
      return new Response(JSON.stringify({ images: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Broader queries: topic/era first, plus specific nouns from passage
    const queries: string[] = [];

    if (base) {
      queries.push(base);
      queries.push(`${base} historical`);
      queries.push(`${base} painting`);
      queries.push(`${base} historical image`);
    }
    if (standardNouns && standardNouns.toLowerCase() !== base.toLowerCase()) {
      queries.push(standardNouns);
      queries.push(`${standardNouns} historical`);
    }

    const geminiKey = env.GEMINI_API_KEY;
    if (geminiKey && text && (topic || standardNouns)) {
      try {
        const { generatePassageQueries } = await import('../../generator/eraBrief.js');
        const pq = await generatePassageQueries(topic, standard, text, geminiKey);
        for (const q of pq) if (q && q.trim()) {
          queries.push(q.trim());
          if (base && !q.toLowerCase().includes(base.toLowerCase())) {
            queries.push(`${q.trim()} ${base}`);
          }
        }
      } catch {
        console.warn('[branching-images] passage-query generation failed; using topic fallback');
      }
    }

    const anchor = base || standardNouns;
    if (text && anchor) {
      const locMatch = text.match(/\b(Fort|Battle of|Siege of|Port of|Harbor)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,2})/);
      if (locMatch) {
        const place = `${locMatch[1]} ${locMatch[2]}`.trim();
        queries.push(place);
        queries.push(`${place} ${anchor}`);
        if (base) queries.push(`${place} ${base}`);
      }
    }

    const { searchCommonsFileRanked, searchViaArticlePageimage } = await import('../../generator/wikimedia.js');

    const seen = new Set();
    let images: any[] = [];

    for (const q of queries) {
      if (!q || q.length < 3) continue;

      try {
        const lead = await searchViaArticlePageimage(q);
        if (lead && !seen.has(lead.thumbUrl)) {
          seen.add(lead.thumbUrl);
          images.push({
            ...lead,
            label: q.length > 55 ? q.slice(0, 52) + '...' : q,
          });
        }
      } catch {}

      const pool = await searchCommonsFileRanked(q, null);
      for (const img of pool) {
        if (!seen.has(img.thumbUrl)) {
          seen.add(img.thumbUrl);
          images.push({
            ...img,
            label: q.length > 55 ? q.slice(0, 52) + '...' : q,
          });
        }
      }

      if (images.length >= 15) break;
    }

    if (images.length === 0 && base) {
      try {
        const lead = await searchViaArticlePageimage(base);
        if (lead && !seen.has(lead.thumbUrl)) {
          seen.add(lead.thumbUrl);
          images.push({ ...lead, label: base });
        }
      } catch {}
      const pool = await searchCommonsFileRanked(base, null);
      for (const img of pool) {
        if (!seen.has(img.thumbUrl)) {
          seen.add(img.thumbUrl);
          images.push({ ...img, label: base });
        }
      }
    }

    return new Response(JSON.stringify({ images: images.slice(0, 10) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[branching-images] error', e);
    return new Response(JSON.stringify({ images: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
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
