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

    // Up to 3 caller-supplied query variations from the generator, ordered
    // most→least specific (e.g. [0]=specific entity, [1]=setting, [2]=broad
    // historical era). These take priority over the derived fallbacks below.
    const explicitQueries: string[] = Array.isArray(body?.queries)
      ? body.queries
          .filter((q: unknown): q is string => typeof q === 'string' && q.trim().length >= 3)
          .map((q: string) => q.trim())
          .slice(0, 3)
      : [];

    // URLs already displayed earlier in THIS campaign session (the endpoint is
    // stateless per-request, so the client sends what it has already shown).
    // Seeding `seen` with these makes every result unique across the session.
    const excludeUrls: string[] = Array.isArray(body?.excludeUrls)
      ? body.excludeUrls.filter((u: unknown): u is string => typeof u === 'string' && u.length > 0)
      : [];

    // Ordered query list: explicit generator variations first, then the derived
    // topic/era/place fallbacks. Duplicates are harmless — runQuery skips strings
    // it has already searched.
    const queries: string[] = [...explicitQueries];

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

    // Passage-query (Gemini) lane. Logged at every outcome so it can never fail
    // silently again: a successful run reports the query count, a thrown call and
    // a missing-key skip each say so explicitly — all three end up as either the
    // entity-noun queries or the topic-only fallback, and the log says which.
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
        console.log(`[branching-images] passage queries succeeded (${pq.length}) — Gemini lane active`);
      } catch (e) {
        console.warn(`[branching-images] passage-query generation FAILED (${e instanceof Error ? e.message : String(e)}) — falling back to topic-only queries`);
      }
    } else if (!geminiKey) {
      console.warn('[branching-images] GEMINI_API_KEY not set — passage-query lane SKIPPED, using topic-only queries');
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

    // The broad historical-era fallback fired when the primary specific query is
    // thin: the 3rd explicit variation if given, else a derived era-level query.
    const broadEraQuery =
      (explicitQueries.length === 3 ? explicitQueries[2] : '') ||
      (base ? `${base} historical` : '') ||
      standardNouns ||
      '';

    const { searchCommonsFileRanked, searchViaArticlePageimage } = await import('../../generator/wikimedia.js');

    const trimLabel = (q: string) => (q.length > 55 ? q.slice(0, 52) + '...' : q);

    // Dedup spans the whole session: pre-load the URLs the client already showed.
    const seen = new Set<string>(excludeUrls);
    const ran = new Set<string>(); // query strings already searched this request
    let images: any[] = [];

    // Search one query, appending only results not already seen this session.
    // Returns the number of NEW unique images it contributed.
    const runQuery = async (q: string): Promise<number> => {
      if (!q || q.length < 3 || ran.has(q)) return 0;
      ran.add(q);
      let added = 0;

      try {
        const lead = await searchViaArticlePageimage(q);
        if (lead && !seen.has(lead.thumbUrl)) {
          seen.add(lead.thumbUrl);
          images.push({ ...lead, label: trimLabel(q) });
          added++;
        }
      } catch {}

      const pool = await searchCommonsFileRanked(q, null);
      for (const img of pool) {
        if (!seen.has(img.thumbUrl)) {
          seen.add(img.thumbUrl);
          images.push({ ...img, label: trimLabel(q) });
          added++;
        }
      }
      return added;
    };

    // 1) Primary specific query.
    const primaryAdded = queries.length ? await runQuery(queries[0]) : 0;

    // 2) Thin primary (<4 unique) → escalate to the broad historical-era fallback.
    if (primaryAdded < 4 && broadEraQuery) {
      await runQuery(broadEraQuery);
    }

    // 3) Exhaust the remaining variations/fallbacks for breadth (deduped).
    for (const q of queries.slice(1)) {
      if (images.length >= 15) break;
      await runQuery(q);
    }

    // Last-ditch safety net when everything above came back empty.
    if (images.length === 0) {
      for (const q of [base, standardNouns, broadEraQuery]) {
        if (q) await runQuery(q);
        if (images.length > 0) break;
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
