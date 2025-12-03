/*!
 * URL content fetching utilities.
 * Supports HTML pages and PDF documents.
 */

// ============================================================================
// Configuration
// ============================================================================
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_LENGTH = 5000;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalize and validate a URL.
 */
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

/**
 * Strip HTML tags and extract plain text.
 */
function stripHtml(html) {
  return String(html || '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gim, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gim, ' ')
    .replace(/<!--[^]*?-->/g, ' ')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gim, ' ')
    .replace(/<[^>]+>/g, ' ');
}

/**
 * Collapse multiple whitespace characters into single spaces.
 */
function collapseWhitespace(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if a URL or content-type indicates a PDF.
 */
function isPdfContent(contentType, url) {
  return contentType.includes('application/pdf') || url.toLowerCase().endsWith('.pdf');
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Fetch and extract content from a URL.
 * Supports HTML pages and PDF documents.
 *
 * @param {string} rawUrl - The URL to fetch
 * @param {Object} [options]
 * @param {number} [options.timeoutMs] - Request timeout in milliseconds
 * @param {number} [options.maxLength] - Maximum text length to return
 * @param {boolean} [options.extractPdfImages] - Whether to render PDF pages as images
 * @param {number} [options.maxPdfPages] - Maximum PDF pages to process
 * @param {number} [options.pdfImageScale] - PDF image scale factor
 * @returns {Promise<Object>} Content result with text, truncated flag, and metadata
 */
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
    const finalUrl = response.url || url;

    // Handle PDF content
    if (isPdfContent(contentType, finalUrl)) {
      const pdfBuffer = await response.arrayBuffer();
      const pdfContent = require('./pdfContent');
      const pdfResult = await pdfContent.processPdf(new Uint8Array(pdfBuffer), {
        extractImages: options.extractPdfImages === true,
        maxPages: options.maxPdfPages,
        maxTextLength: maxLength,
        imageScale: options.pdfImageScale,
      });
      return { ...pdfResult, finalUrl };
    }

    // Handle unsupported content types
    if (contentType && !contentType.includes('text/html')) {
      throw new Error('URL must return HTML or PDF content');
    }

    // Handle HTML content
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
      finalUrl,
      isPdf: false,
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

// ============================================================================
// Exports
// ============================================================================
module.exports = {
  fetchUrlContent,
};
