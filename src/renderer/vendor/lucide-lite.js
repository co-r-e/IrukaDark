/*
  Minimal Lucide stub for offline builds.
  Provides a no-op createIcons() so code paths expecting Lucide don’t fail.
*/
(function (global) {
  try {
    if (global.lucide && typeof global.lucide.createIcons === 'function') return;
    global.lucide = {
      // In our UI we mostly use inline SVGs already; this safely no-ops.
      createIcons: function createIcons() {
        // intentionally empty
      },
    };
  } catch (e) {
    // ignore
  }
})(typeof window !== 'undefined' ? window : globalThis);
