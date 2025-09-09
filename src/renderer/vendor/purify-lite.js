(function () {
  if (typeof window === 'undefined') return;
  // Since our marked-lite escapes input first, sanitize can be identity.
  window.DOMPurify = {
    sanitize(html) {
      return String(html || '');
    },
  };
})();
