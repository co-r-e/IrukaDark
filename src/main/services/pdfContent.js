/*!
 * PDF content extraction and rendering utilities for Node.js/Electron environment.
 * Uses pdfjs-dist for parsing and @napi-rs/canvas for image rendering.
 */
const path = require('path');

// ============================================================================
// Configuration
// ============================================================================
const DEFAULT_MAX_PAGES = 10;
const DEFAULT_IMAGE_SCALE = 1.5;
const DEFAULT_MAX_TEXT_LENGTH = 10000;
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

// ============================================================================
// Module State (lazy-loaded)
// ============================================================================
let pdfjsLib = null;
let standardFontDataUrl = null;
let createCanvas = null;

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize pdfjs-dist library (lazy-loaded).
 */
async function initPdfjs() {
  if (pdfjsLib) return pdfjsLib;

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjsLib = pdfjs;

  const pdfjsDistDir = path.dirname(require.resolve('pdfjs-dist/package.json'));
  standardFontDataUrl = path.join(pdfjsDistDir, 'standard_fonts/');
  pdfjsLib.GlobalWorkerOptions.workerSrc = path.join(pdfjsDistDir, 'legacy/build/pdf.worker.mjs');

  return pdfjsLib;
}

/**
 * Initialize @napi-rs/canvas (lazy-loaded).
 */
async function initCanvas() {
  if (createCanvas) return createCanvas;

  const canvasModule = await import('@napi-rs/canvas');
  createCanvas = canvasModule.createCanvas;
  return createCanvas;
}

/**
 * Create PDF document loading options.
 */
function createDocumentOptions(buffer) {
  return {
    data: buffer,
    standardFontDataUrl,
    useSystemFonts: true,
    disableFontFace: true,
  };
}

/**
 * Canvas factory for pdfjs-dist rendering with @napi-rs/canvas.
 */
class NodeCanvasFactory {
  constructor(canvasCreator) {
    this._createCanvas = canvasCreator;
  }
  create(width, height) {
    const canvas = this._createCanvas(width, height);
    return { canvas, context: canvas.getContext('2d') };
  }
  reset(canvasAndContext, width, height) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }
  destroy() {
    // No-op for @napi-rs/canvas
  }
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Extract text content from a PDF buffer.
 * @param {Uint8Array} buffer - PDF file data
 * @param {Object} [options]
 * @param {number} [options.maxPages=10] - Maximum pages to process
 * @param {number} [options.maxTextLength=10000] - Maximum text length
 * @returns {Promise<{text: string, pageCount: number, pagesProcessed: number, truncated: boolean}>}
 */
async function extractTextFromPdf(buffer, options = {}) {
  const pdfjs = await initPdfjs();

  const maxPages = Math.min(
    Number.isFinite(options.maxPages) && options.maxPages > 0
      ? options.maxPages
      : DEFAULT_MAX_PAGES,
    DEFAULT_MAX_PAGES
  );
  const maxTextLength =
    Number.isFinite(options.maxTextLength) && options.maxTextLength > 0
      ? options.maxTextLength
      : DEFAULT_MAX_TEXT_LENGTH;

  const loadingTask = pdfjs.getDocument(createDocumentOptions(buffer));
  let pdf = null;

  try {
    pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;
    const pagesToProcess = Math.min(totalPages, maxPages);

    const textParts = [];
    let totalLength = 0;
    let truncated = false;

    for (let i = 1; i <= pagesToProcess; i++) {
      if (totalLength >= maxTextLength) {
        truncated = true;
        break;
      }

      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (pageText) {
        const remaining = maxTextLength - totalLength;
        if (pageText.length > remaining) {
          textParts.push(pageText.slice(0, remaining));
          truncated = true;
          break;
        }
        textParts.push(pageText);
        totalLength += pageText.length;
      }
    }

    if (pagesToProcess < totalPages) {
      truncated = true;
    }

    return {
      text: textParts.join('\n\n'),
      pageCount: totalPages,
      pagesProcessed: pagesToProcess,
      truncated,
    };
  } finally {
    if (pdf) {
      try {
        await pdf.destroy();
      } catch {}
    }
  }
}

/**
 * Render PDF pages as PNG images.
 * @param {Uint8Array} buffer - PDF file data
 * @param {Object} [options]
 * @param {number} [options.maxPages=10] - Maximum pages to render
 * @param {number} [options.scale=1.5] - Image scale factor
 * @returns {Promise<Array<{page: number, base64: string, mimeType: string}>>}
 */
async function renderPdfPages(buffer, options = {}) {
  const pdfjs = await initPdfjs();
  const canvasCreator = await initCanvas();

  const maxPages = Math.min(
    Number.isFinite(options.maxPages) && options.maxPages > 0
      ? options.maxPages
      : DEFAULT_MAX_PAGES,
    DEFAULT_MAX_PAGES
  );
  const scale =
    Number.isFinite(options.scale) && options.scale > 0
      ? Math.min(options.scale, 3)
      : DEFAULT_IMAGE_SCALE;

  const loadingTask = pdfjs.getDocument(createDocumentOptions(buffer));
  let pdf = null;

  try {
    pdf = await loadingTask.promise;
    const pagesToRender = Math.min(pdf.numPages, maxPages);
    const canvasFactory = new NodeCanvasFactory(canvasCreator);
    const images = [];

    for (let i = 1; i <= pagesToRender; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });

      const width = Math.floor(viewport.width);
      const height = Math.floor(viewport.height);
      const canvas = canvasCreator(width, height);

      await page.render({
        canvasContext: canvas.getContext('2d'),
        viewport,
        canvasFactory,
      }).promise;

      images.push({
        page: i,
        base64: canvas.toBuffer('image/png').toString('base64'),
        mimeType: 'image/png',
      });
    }

    return images;
  } finally {
    if (pdf) {
      try {
        await pdf.destroy();
      } catch {}
    }
  }
}

/**
 * Process a PDF buffer: extract text and optionally render pages as images.
 * @param {Uint8Array} buffer - PDF file data
 * @param {Object} [options]
 * @param {boolean} [options.extractImages=false] - Whether to render pages as images
 * @param {number} [options.maxPages=10] - Maximum pages to process
 * @param {number} [options.maxTextLength=10000] - Maximum text length
 * @param {number} [options.imageScale=1.5] - Image scale factor
 * @returns {Promise<{text: string, truncated: boolean, contentType: string, isPdf: boolean, pageCount: number, pagesProcessed: number, images?: Array, imageError?: string}>}
 */
async function processPdf(buffer, options = {}) {
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new Error('PDF file is too large (max 50MB)');
  }

  const extractImages = options.extractImages === true;
  const maxPages =
    Number.isFinite(options.maxPages) && options.maxPages > 0
      ? Math.min(options.maxPages, DEFAULT_MAX_PAGES)
      : DEFAULT_MAX_PAGES;

  // Extract text
  const textResult = await extractTextFromPdf(buffer, {
    maxPages,
    maxTextLength: options.maxTextLength,
  });

  const result = {
    text: textResult.text,
    truncated: textResult.truncated,
    contentType: 'application/pdf',
    isPdf: true,
    pageCount: textResult.pageCount,
    pagesProcessed: textResult.pagesProcessed,
  };

  // Render images if requested
  if (extractImages) {
    try {
      result.images = await renderPdfPages(buffer, {
        maxPages,
        scale: options.imageScale,
      });
    } catch (err) {
      console.warn('PDF image rendering failed:', err.message);
      result.imageError = err.message;
    }
  }

  return result;
}

// ============================================================================
// Exports
// ============================================================================
module.exports = {
  extractTextFromPdf,
  renderPdfPages,
  processPdf,
};
