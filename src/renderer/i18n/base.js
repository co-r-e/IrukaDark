(function () {
  if (typeof window === 'undefined') return;
  if (!window.IRUKADARK_I18N) window.IRUKADARK_I18N = {};
  window.__IRUKA_REGISTER_I18N__ = function registerLang(code, data) {
    try {
      window.IRUKADARK_I18N[String(code)] = Object.assign({}, data || {});
    } catch {}
  };
})();
