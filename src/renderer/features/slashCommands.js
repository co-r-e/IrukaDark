(function () {
  const LANG_NAMES = {
    en: 'English',
    ja: 'Japanese',
    es: 'Spanish',
    'es-419': 'Latin American Spanish',
    'zh-Hans': 'Simplified Chinese',
    'zh-Hant': 'Traditional Chinese',
    hi: 'Hindi',
    'pt-BR': 'Brazilian Portuguese',
    fr: 'French',
    de: 'German',
    ar: 'Arabic',
    ru: 'Russian',
    ko: 'Korean',
    id: 'Indonesian',
    vi: 'Vietnamese',
    th: 'Thai',
    it: 'Italian',
    tr: 'Turkish',
  };

  const DEFAULT_TRANSLATE_CODES = [
    'en',
    'ja',
    'de',
    'es',
    'es-419',
    'fr',
    'id',
    'it',
    'ko',
    'pt-BR',
    'ru',
    'th',
    'tr',
    'vi',
    'zh-Hans',
    'zh-Hant',
  ];

  const TRANSLATE_CODE_MAP = new Map();

  function getI18nStrings() {
    return (typeof window !== 'undefined' && window.IRUKADARK_I18N) || {};
  }

  function sanitizeTranslateSuffix(code) {
    return String(code || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-');
  }

  function availableTranslateCodes() {
    const ordered = [...DEFAULT_TRANSLATE_CODES];
    const seen = new Set(ordered.map((c) => c));
    try {
      const strings = getI18nStrings();
      const codes = Object.keys(strings || {});
      if (Array.isArray(codes)) {
        for (const code of codes) {
          if (!seen.has(code)) {
            ordered.push(code);
            seen.add(code);
          }
        }
      }
    } catch {}
    return ordered;
  }

  function buildTranslateTargets() {
    const codes = availableTranslateCodes();
    const unique = Array.from(new Set(codes.filter(Boolean)));
    return unique.map((rawCode) => {
      const canonical = String(rawCode);
      const lower = canonical.toLowerCase();
      TRANSLATE_CODE_MAP.set(lower, canonical);
      const suffix = sanitizeTranslateSuffix(canonical);
      return {
        key: `/translate_${suffix}`,
        match: `/translate_${lower}`,
        label: `/translate_${suffix}`,
        target: canonical,
        descKey: 'slashTranslateIntoLanguage',
        languageCode: canonical,
      };
    });
  }

  const SLASH_TRANSLATE_TARGETS = buildTranslateTargets();
  TRANSLATE_CODE_MAP.set('zh-cn', TRANSLATE_CODE_MAP.get('zh-hans') || 'zh-Hans');
  TRANSLATE_CODE_MAP.set('zh-sg', TRANSLATE_CODE_MAP.get('zh-hans') || 'zh-Hans');
  TRANSLATE_CODE_MAP.set('zh-tw', TRANSLATE_CODE_MAP.get('zh-hant') || 'zh-Hant');
  TRANSLATE_CODE_MAP.set('zh-hk', TRANSLATE_CODE_MAP.get('zh-hant') || 'zh-Hant');

  const SLASH_TRANSLATE_LOOKUP = SLASH_TRANSLATE_TARGETS.reduce((map, cfg) => {
    map[cfg.match] = cfg;
    return map;
  }, {});

  const SLASH_TRANSLATE_MODE_TARGETS = [
    {
      key: '/translate literal',
      match: '/translate literal',
      label: '/translate literal',
      descKey: 'slashDescriptions.translateLiteral',
      mode: 'literal',
    },
    {
      key: '/translate free',
      match: '/translate free',
      label: '/translate free',
      descKey: 'slashDescriptions.translateFree',
      mode: 'free',
    },
    {
      key: '/translate status',
      match: '/translate status',
      label: '/translate status',
      descKey: 'slashDescriptions.translateStatus',
      mode: 'status',
    },
  ];

  const SLASH_WEB_TARGETS = [
    {
      key: '/web on',
      match: '/web on',
      label: '/web on',
      descKey: 'slashDescriptions.webOn',
    },
    {
      key: '/web off',
      match: '/web off',
      label: '/web off',
      descKey: 'slashDescriptions.webOff',
    },
    {
      key: '/web status',
      match: '/web status',
      label: '/web status',
      descKey: 'slashDescriptions.webStatus',
    },
  ];

  function getLangMeta(code) {
    const lang = String(code || 'en');
    const name = LANG_NAMES[lang] || 'English';
    const rtlLocales = new Set(['ar', 'he', 'fa', 'ur']);
    const rtl = rtlLocales.has(lang);
    return { code: lang, name, rtl };
  }

  function normalizeTranslateCode(code) {
    if (!code) return null;
    const canonical = TRANSLATE_CODE_MAP.get(String(code).toLowerCase());
    return canonical || null;
  }

  function getLanguageDisplayName(code, fallbackLang) {
    const fallback = LANG_NAMES[code] || code;
    const lang = fallbackLang || 'en';
    const tryCodes = [code];
    if (/^zh-hans$/i.test(code)) tryCodes.push('zh-CN');
    if (/^zh-hant$/i.test(code)) tryCodes.push('zh-TW');
    try {
      const display = new Intl.DisplayNames([lang], { type: 'language' });
      for (const candidate of tryCodes) {
        const name = display.of(candidate);
        if (name && name !== candidate) {
          return name;
        }
      }
    } catch {}
    return fallback;
  }

  window.IRUKADARK_SLASHES = {
    SLASH_TRANSLATE_TARGETS,
    SLASH_TRANSLATE_LOOKUP,
    SLASH_WEB_TARGETS,
    getLangMeta,
    normalizeTranslateCode,
    getLanguageDisplayName,
    LANG_NAMES,
    SLASH_TRANSLATE_MODE_TARGETS,
  };
})();
