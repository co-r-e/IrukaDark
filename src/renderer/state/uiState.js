(function () {
  const state = {
    language: 'en',
    tone: 'casual',
  };

  function setLanguage(code) {
    state.language = typeof code === 'string' && code ? code : 'en';
  }

  function getLanguage() {
    return state.language;
  }

  function setTone(value) {
    const normalized = String(value || 'casual').toLowerCase() === 'formal' ? 'formal' : 'casual';
    state.tone = normalized;
  }

  function getTone() {
    return state.tone;
  }

  window.IRUKADARK_STATE = {
    getLanguage,
    setLanguage,
    getTone,
    setTone,
  };
})();
