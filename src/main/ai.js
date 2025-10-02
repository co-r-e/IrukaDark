// AI helper functions (SDK/REST wrappers) for Electron main process

// GenAI client cache with TTL and size limit
const CLIENT_CACHE_TTL = 3600000; // 1 hour
const CLIENT_CACHE_MAX_SIZE = 10;

function initClientCache() {
  if (!global.__irukadark_genai_clients) {
    global.__irukadark_genai_clients = new Map();
  }
  return global.__irukadark_genai_clients;
}

function cleanupClientCache(cache) {
  const now = Date.now();
  const toDelete = [];
  for (const [key, entry] of cache.entries()) {
    if (now > entry.expiresAt) {
      toDelete.push(key);
    }
  }
  for (const key of toDelete) {
    cache.delete(key);
  }
  // Evict oldest if over size limit
  if (cache.size > CLIENT_CACHE_MAX_SIZE) {
    const entries = Array.from(cache.entries()).sort((a, b) => a[1].createdAt - b[1].createdAt);
    const toRemove = entries.slice(0, cache.size - CLIENT_CACHE_MAX_SIZE);
    for (const [key] of toRemove) {
      cache.delete(key);
    }
  }
}

async function getGenAIClientForKey(apiKey) {
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set.');
  const cache = initClientCache();
  cleanupClientCache(cache);

  const entry = cache.get(apiKey);
  if (entry && Date.now() <= entry.expiresAt) {
    return entry.client;
  }

  const mod = await import('@google/genai');
  const candidates = [mod.GoogleGenAI, mod.GoogleAI, mod.GoogleGenerativeAI];
  let ClientCtor = null;
  for (const ctor of candidates) {
    if (typeof ctor === 'function') {
      ClientCtor = ctor;
      break;
    }
  }
  if (!ClientCtor) {
    for (const key of Object.keys(mod)) {
      const val = mod[key];
      if (typeof val === 'function' && /Google|Gen|AI/.test(key)) {
        ClientCtor = val;
        break;
      }
    }
  }
  if (!ClientCtor) {
    throw new Error('Unable to find Google GenAI client export in @google/genai.');
  }

  let client = null;
  try {
    client = new ClientCtor({ apiKey });
  } catch (err) {
    try {
      client = new ClientCtor(apiKey);
    } catch (_) {
      const reason = err?.message || 'Unknown error';
      throw new Error(`Failed to create Google GenAI client instance. ${reason}`);
    }
  }
  if (!client) {
    throw new Error('Failed to create Google GenAI client instance.');
  }

  const now = Date.now();
  cache.set(apiKey, {
    client,
    createdAt: now,
    expiresAt: now + CLIENT_CACHE_TTL,
  });
  return client;
}

function extractTextFromSDKResult(result) {
  try {
    if (!result) return '';
    const r = result.response || result;
    if (r && typeof r.text === 'function') {
      try {
        const t = r.text();
        if (t) return t;
      } catch {}
    }
    if (typeof r?.output_text === 'string' && r.output_text) {
      return r.output_text;
    }
    const candidates = r?.candidates || result?.candidates || [];
    if (Array.isArray(candidates) && candidates.length) {
      const parts = candidates[0]?.content?.parts || candidates[0]?.content || [];
      if (Array.isArray(parts)) {
        const text = parts.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('');
        if (text) return text;
      } else if (typeof parts?.text === 'string') {
        return parts.text;
      }
    }
    const outputs = r?.outputs || r?.output || null;
    if (Array.isArray(outputs) && outputs.length) {
      const content = outputs[0]?.content || outputs[0] || [];
      if (Array.isArray(content)) {
        const t = content.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('');
        if (t) return t;
      } else if (typeof content?.text === 'string') {
        return content.text;
      }
    }
  } catch {}
  return '';
}

function collectSourcesFromGroundingMetadata(rawMeta) {
  const out = [];
  try {
    if (!rawMeta || typeof rawMeta !== 'object') return out;
    const meta = rawMeta;
    const pushSource = (url, title) => {
      if (!url) return;
      const normalized = String(url).trim();
      if (!normalized) return;
      out.push({ url: normalized, title: String(title || normalized) });
    };

    const rawAttrs = meta.groundingAttributions || meta.grounding_attributions || [];
    const attrs = Array.isArray(rawAttrs) ? rawAttrs : [];
    if (attrs.length) {
      for (const a of attrs) {
        const web =
          a?.web || a?.webSearchResult || a?.web_search_result || a?.source || a?.site || null;
        if (web) {
          pushSource(web.uri || web.url || web.link, web.title || web.pageTitle || web.name);
        }
        const retrieved = a?.retrievedContext || a?.retrieved_context;
        if (retrieved) {
          pushSource(
            retrieved.uri || retrieved.url,
            retrieved.title || retrieved.text || retrieved.documentName || retrieved.document_name
          );
        }
      }
    }

    const rawChunks = meta.groundingChunks || meta.grounding_chunks || [];
    const chunks = Array.isArray(rawChunks) ? rawChunks : [];
    const chunkSources = chunks.map((chunk) => {
      if (!chunk || typeof chunk !== 'object') return null;
      const web = chunk.web || chunk.webSearchResult || chunk.web_search_result;
      if (web) {
        const url = web.uri || web.url || web.link;
        const title = web.title || web.pageTitle || web.name;
        if (url) return { url, title };
      }
      const retrieved = chunk.retrievedContext || chunk.retrieved_context;
      if (retrieved) {
        const url = retrieved.uri || retrieved.url;
        const title =
          retrieved.title || retrieved.text || retrieved.documentName || retrieved.document_name;
        if (url) return { url, title };
      }
      const maps = chunk.maps || chunk.map;
      if (maps) {
        const url =
          maps.uri ||
          maps.googleMapsUri ||
          maps.google_maps_uri ||
          maps.flagContentUri ||
          maps.flag_content_uri;
        const title = maps.title || maps.text || maps.placeId || maps.place_id;
        if (url) return { url, title };
      }
      return null;
    });

    const supportIndexSet = new Set();
    const addIndices = (list) => {
      if (!Array.isArray(list)) return;
      for (const idx of list) {
        const num = Number(idx);
        if (Number.isInteger(num) && num >= 0) supportIndexSet.add(num);
      }
    };

    const supports = meta.groundingSupports || meta.grounding_supports || [];
    if (Array.isArray(supports)) {
      for (const s of supports) {
        addIndices(s?.groundingChunkIndices || s?.grounding_chunk_indices);
      }
    }
    if (attrs.length) {
      for (const a of attrs) {
        addIndices(a?.groundingChunkIndices || a?.grounding_chunk_indices);
      }
    }

    chunkSources.forEach((entry, idx) => {
      if (!entry || !entry.url) return;
      if (supportIndexSet.size && !supportIndexSet.has(idx)) return;
      pushSource(entry.url, entry.title);
    });
  } catch {}
  return out;
}

function extractSourcesFromSDKResult(result) {
  try {
    const r = result?.response || result || {};
    const cand =
      (r.candidates && r.candidates[0]) || (result.candidates && result.candidates[0]) || {};
    const gm =
      cand.groundingMetadata ||
      cand.grounding_metadata ||
      r.groundingMetadata ||
      r.grounding_metadata ||
      {};
    const out = [];
    out.push(...collectSourcesFromGroundingMetadata(gm));
    const cites = r.citations || r.citationMetadata || cand.citationMetadata || null;
    const citeItems = cites?.citations || cites?.sources || [];
    if (Array.isArray(citeItems)) {
      for (const c of citeItems) {
        const url = c?.uri || c?.url || '';
        const title = c?.title || c?.publicationTitle || url || '';
        if (url) out.push({ url, title: String(title || url) });
      }
    }
    const urlContextMeta =
      cand.urlContextMetadata ||
      cand.url_context_metadata ||
      r.urlContextMetadata ||
      r.url_context_metadata ||
      {};
    let urlMetaItems = urlContextMeta?.urlMetadata || urlContextMeta?.url_metadata || [];
    if (!Array.isArray(urlMetaItems)) urlMetaItems = [];
    for (const item of urlMetaItems) {
      const metaUrl = item?.retrievedUrl || item?.retrieved_url || item?.url || '';
      const title = item?.title || item?.pageTitle || item?.name || metaUrl || '';
      if (metaUrl) out.push({ url: String(metaUrl), title: String(title || metaUrl) });
    }
    const seen = new Set();
    return out.filter((s) => {
      if (!s || !s.url) return false;
      const key = String(s.url).trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch {
    return [];
  }
}

function extractSourcesFromRESTData(data) {
  try {
    const cand = data?.candidates?.[0] || {};
    const gm = cand.groundingMetadata || cand.grounding_metadata || data?.groundingMetadata || {};
    const out = [];
    out.push(...collectSourcesFromGroundingMetadata(gm));
    const cites = cand.citationMetadata || data?.citationMetadata || null;
    const citeItems = cites?.citations || [];
    if (Array.isArray(citeItems)) {
      for (const c of citeItems) {
        const url = c?.uri || c?.url || '';
        const title = c?.title || url || '';
        if (url) out.push({ url, title: String(title || url) });
      }
    }
    const urlContextMeta =
      cand.urlContextMetadata ||
      cand.url_context_metadata ||
      data?.urlContextMetadata ||
      data?.url_context_metadata ||
      {};
    let urlMetaItems = urlContextMeta?.urlMetadata || urlContextMeta?.url_metadata || [];
    if (!Array.isArray(urlMetaItems)) urlMetaItems = [];
    for (const item of urlMetaItems) {
      const metaUrl = item?.retrievedUrl || item?.retrieved_url || item?.url || '';
      const title = item?.title || item?.pageTitle || item?.name || metaUrl || '';
      if (metaUrl) out.push({ url: String(metaUrl), title: String(title || metaUrl) });
    }
    const seen = new Set();
    return out.filter((s) => {
      if (!s || !s.url) return false;
      const key = String(s.url).trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch {
    return [];
  }
}

function modelCandidates(original) {
  const raw = String(original || '').trim();
  const bare = raw.replace(/^models\//, '');
  const withPrefix = `models/${bare}`;
  return Array.from(new Set([bare, withPrefix]));
}

async function restGenerateText(
  apiKey,
  modelBare,
  prompt,
  generationConfig,
  { useGoogleSearch = false, signal } = {}
) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelBare}:generateContent`;
  const tools = [];
  if (useGoogleSearch) tools.push({ googleSearch: {} });
  const body = {
    contents: [{ parts: [{ text: String(prompt || '') }] }],
    generationConfig: generationConfig || undefined,
    tools: tools.length ? tools : undefined,
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': String(apiKey || '').trim() },
    body: JSON.stringify(body),
    signal: signal || undefined,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`API Error: ${res.status} - ${t}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  const sources = extractSourcesFromRESTData(data);
  const outText = typeof text === 'string' && text.length ? text : 'Unexpected response from API.';
  return { text: outText, sources };
}

async function restGenerateImage(
  apiKey,
  modelBare,
  prompt,
  imageBase64,
  mimeType,
  generationConfig,
  { useGoogleSearch = false, signal } = {}
) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelBare}:generateContent`;
  const body = {
    contents: [
      {
        parts: [
          { text: String(prompt || '') },
          {
            inlineData: {
              data: String(imageBase64 || ''),
              mimeType: String(mimeType || 'image/png'),
            },
          },
        ],
      },
    ],
    generationConfig: generationConfig || undefined,
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': String(apiKey || '').trim() },
    body: JSON.stringify(body),
    signal: signal || undefined,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`API Error: ${res.status} - ${t}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  const sources = extractSourcesFromRESTData(data);
  const outText = typeof text === 'string' && text.length ? text : 'Unexpected response from API.';
  return { text: outText, sources };
}

async function sdkGenerateText(
  genAI,
  modelName,
  prompt,
  generationConfig,
  { useGoogleSearch = false } = {}
) {
  if (!genAI?.models || typeof genAI.models.generateContent !== 'function') return null;
  const candidates = modelCandidates(modelName);
  const tools = [];
  if (useGoogleSearch) tools.push({ googleSearch: {} });

  for (const model of candidates) {
    const config = { ...(generationConfig || {}) };
    if (tools.length) config.tools = tools;
    const request = {
      model,
      contents: [{ role: 'user', parts: [{ text: String(prompt || '') }] }],
      config: Object.keys(config).length ? config : undefined,
    };
    try {
      const response = await genAI.models.generateContent(request);
      const text = extractTextFromSDKResult(response);
      const sources = extractSourcesFromSDKResult(response);
      if (text) return { text, sources };
    } catch {}
  }
  return null;
}

async function sdkGenerateImage(
  genAI,
  modelName,
  prompt,
  imageBase64,
  mimeType,
  generationConfig,
  { useGoogleSearch = false } = {}
) {
  if (!genAI?.models || typeof genAI.models.generateContent !== 'function') return null;
  const candidates = modelCandidates(modelName);
  const imagePart = {
    inlineData: { data: String(imageBase64 || ''), mimeType: String(mimeType || 'image/png') },
  };
  const tools = useGoogleSearch ? [{ googleSearch: {} }] : [];

  for (const model of candidates) {
    const config = { ...(generationConfig || {}) };
    if (tools.length) config.tools = tools;
    const request = {
      model,
      contents: [
        {
          role: 'user',
          parts: [{ text: String(prompt || '') }, imagePart],
        },
      ],
      config: Object.keys(config).length ? config : undefined,
    };
    try {
      const response = await genAI.models.generateContent(request);
      const text = extractTextFromSDKResult(response);
      const sources = extractSourcesFromSDKResult(response);
      if (text) return { text, sources };
    } catch {}
  }
  return null;
}

module.exports = {
  getGenAIClientForKey,
  extractTextFromSDKResult,
  extractSourcesFromSDKResult,
  extractSourcesFromRESTData,
  modelCandidates,
  restGenerateText,
  restGenerateImage,
  sdkGenerateText,
  sdkGenerateImage,
};
