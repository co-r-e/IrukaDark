// AI helper functions (SDK/REST wrappers) for Electron main process

async function getGenAIClientForKey(apiKey) {
  if (!global.__irukadark_genai_clients) global.__irukadark_genai_clients = new Map();
  const cache = global.__irukadark_genai_clients;
  if (cache.has(apiKey)) return cache.get(apiKey);
  try {
    const mod = await import('@google/genai');
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set.');
    let Ctor = mod.GoogleAI || mod.GoogleGenerativeAI || mod.default || null;
    if (!Ctor) {
      for (const k of Object.keys(mod)) {
        const val = mod[k];
        if (typeof val === 'function' && /Google|Gen|AI/i.test(k)) {
          Ctor = val;
          break;
        }
      }
    }
    if (!Ctor) throw new Error('Unable to find Google GenAI client export.');
    let client = null;
    try {
      client = new Ctor(apiKey);
    } catch {}
    if (!client) {
      try {
        client = new Ctor({ apiKey });
      } catch {}
    }
    if (!client) throw new Error('Failed to create Google GenAI client instance.');
    cache.set(apiKey, client);
    return client;
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    try {
      const legacy = await import('@google/generative-ai');
      if (!apiKey) throw new Error('GEMINI_API_KEY is not set.');
      const L = legacy.GoogleGenerativeAI || legacy.default;
      if (!L) throw new Error(msg);
      const client = new L(apiKey);
      cache.set(apiKey, client);
      return client;
    } catch (_) {
      throw new Error(`Failed to initialize Google GenAI SDK (@google/genai). ${msg}`);
    }
  }
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
    let attrs = gm.groundingAttributions || gm.grounding_attributions || [];
    if (!Array.isArray(attrs)) attrs = [];
    const out = [];
    for (const a of attrs) {
      const web = a?.web || a?.webSearchResult || a?.source || a?.site || null;
      if (!web) continue;
      const url = web.uri || web.url || web.link || '';
      const title = web.title || web.pageTitle || web.name || url || '';
      if (url) out.push({ url, title: String(title || url) });
    }
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
    let attrs = gm.groundingAttributions || gm.grounding_attributions || [];
    if (!Array.isArray(attrs)) attrs = [];
    const out = [];
    for (const a of attrs) {
      const web = a?.web || a?.webSearchResult || a?.source || null;
      if (!web) continue;
      const url = web.uri || web.url || '';
      const title = web.title || web.pageTitle || url || '';
      if (url) out.push({ url, title: String(title || url) });
    }
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
  { useGoogleSearch = false, signal, urlContextUrl = '' } = {}
) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelBare}:generateContent`;
  const trimmedUrl = typeof urlContextUrl === 'string' ? urlContextUrl.trim() : '';
  const wantsUrlContext = !!trimmedUrl;
  const tools = [];
  if (useGoogleSearch) tools.push({ googleSearch: {} });
  if (wantsUrlContext) tools.push({ urlContext: {} });
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
  { useGoogleSearch = false, urlContextUrl = '' } = {}
) {
  const candidates = modelCandidates(modelName);
  const trimmedUrl = typeof urlContextUrl === 'string' ? urlContextUrl.trim() : '';
  const wantsUrlContext = !!trimmedUrl;
  const tools = [];
  if (useGoogleSearch) tools.push({ googleSearch: {} });
  if (wantsUrlContext) tools.push({ urlContext: {} });
  if (genAI && typeof genAI.getGenerativeModel === 'function') {
    for (const m of candidates) {
      try {
        const model = genAI.getGenerativeModel({ model: m, generationConfig });
        try {
          const request = {
            contents: [{ role: 'user', parts: [{ text: String(prompt) }] }],
            generationConfig,
            tools: tools.length ? tools : undefined,
          };
          const r0 = await model.generateContent(request);
          const t0 = extractTextFromSDKResult(r0);
          const s0 = extractSourcesFromSDKResult(r0);
          if (t0) return { text: t0, sources: s0 };
        } catch {}
        if (!wantsUrlContext) {
          try {
            const r1 = await model.generateContent(String(prompt));
            const t1 = extractTextFromSDKResult(r1);
            const s1 = extractSourcesFromSDKResult(r1);
            if (t1) return { text: t1, sources: s1 };
          } catch {}
          try {
            const r2 = await model.generateContent({ input: String(prompt) });
            const t2 = extractTextFromSDKResult(r2);
            const s2 = extractSourcesFromSDKResult(r2);
            if (t2) return { text: t2, sources: s2 };
          } catch {}
        }
      } catch {}
    }
  }
  if (genAI && genAI.responses && typeof genAI.responses.generate === 'function') {
    for (const m of candidates) {
      try {
        const r = await genAI.responses.generate({
          model: m,
          input: String(prompt),
          tools: tools.length ? tools : undefined,
        });
        const t = extractTextFromSDKResult(r);
        const s = extractSourcesFromSDKResult(r);
        if (t) return { text: t, sources: s };
      } catch {}
    }
  }
  return '';
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
  const candidates = modelCandidates(modelName);
  const imagePart = {
    inlineData: { data: String(imageBase64 || ''), mimeType: String(mimeType || 'image/png') },
  };
  if (genAI && typeof genAI.getGenerativeModel === 'function') {
    for (const m of candidates) {
      try {
        const model = genAI.getGenerativeModel({ model: m, generationConfig });
        try {
          const r0 = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: String(prompt) }, imagePart] }],
            tools: useGoogleSearch ? [{ googleSearch: {} }] : undefined,
            generationConfig,
          });
          const t0 = extractTextFromSDKResult(r0);
          const s0 = extractSourcesFromSDKResult(r0);
          if (t0) return { text: t0, sources: s0 };
        } catch {}
        try {
          const r1 = await model.generateContent([{ text: String(prompt) }, imagePart]);
          const t1 = extractTextFromSDKResult(r1);
          const s1 = extractSourcesFromSDKResult(r1);
          if (t1) return { text: t1, sources: s1 };
        } catch {}
        try {
          const r2 = await model.generateContent({ input: [{ text: String(prompt) }, imagePart] });
          const t2 = extractTextFromSDKResult(r2);
          const s2 = extractSourcesFromSDKResult(r2);
          if (t2) return { text: t2, sources: s2 };
        } catch {}
      } catch {}
    }
  }
  if (genAI && genAI.responses && typeof genAI.responses.generate === 'function') {
    for (const m of candidates) {
      try {
        const r = await genAI.responses.generate({
          model: m,
          input: [{ text: String(prompt) }, imagePart],
          tools: useGoogleSearch ? [{ googleSearch: {} }] : undefined,
        });
        const t = extractTextFromSDKResult(r);
        const s = extractSourcesFromSDKResult(r);
        if (t) return { text: t, sources: s };
      } catch {}
    }
  }
  return '';
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
