/*!
 * Utilities for retrieving and sanitizing text content from remote URLs.
 */
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_LENGTH = 5000;

function normalizeHttpUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) {
    throw new Error('URL is required');
  }
  let normalized;
  try {
    normalized = new URL(value);
  } catch {
    throw new Error('URL is invalid');
  }
  if (!/^https?:$/i.test(normalized.protocol)) {
    throw new Error('URL must use http or https');
  }
  return normalized.toString();
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gim, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gim, ' ')
    .replace(/<!--[^]*?-->/g, ' ')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gim, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function collapseWhitespace(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchUrlContent(rawUrl, options = {}) {
  const url = normalizeHttpUrl(rawUrl);
  const timeoutMs =
    Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
      ? Math.min(options.timeoutMs, 30000)
      : DEFAULT_TIMEOUT_MS;
  const maxLength =
    Number.isFinite(options.maxLength) && options.maxLength > 0
      ? Math.min(options.maxLength, 20000)
      : DEFAULT_MAX_LENGTH;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText || 'Failed to fetch URL'}`);
    }
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (contentType && !contentType.includes('text/html')) {
      throw new Error('URL must return HTML content');
    }
    const html = await response.text();
    const plain = collapseWhitespace(stripHtml(html));
    if (!plain) {
      throw new Error('No readable text found at URL');
    }
    const truncated = plain.length > maxLength;
    const text = truncated ? plain.slice(0, maxLength) : plain;
    return {
      text,
      truncated,
      contentType,
      finalUrl: response.url || url,
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = {
  fetchUrlContent,
};
