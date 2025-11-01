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

  const SLASH_IMAGE_SIZE_TARGETS = [
    {
      key: '/image size auto',
      match: '/image size auto',
      label: '/image size auto',
      descKey: 'slashDescriptions.imageSizeAuto',
      size: 'auto',
    },
    {
      key: '/image size 1:1',
      match: '/image size 1:1',
      label: '/image size 1:1',
      descKey: 'slashDescriptions.imageSize1_1',
      size: '1:1',
    },
    {
      key: '/image size 9:16',
      match: '/image size 9:16',
      label: '/image size 9:16',
      descKey: 'slashDescriptions.imageSize9_16',
      size: '9:16',
    },
    {
      key: '/image size 16:9',
      match: '/image size 16:9',
      label: '/image size 16:9',
      descKey: 'slashDescriptions.imageSize16_9',
      size: '16:9',
    },
    {
      key: '/image size 3:4',
      match: '/image size 3:4',
      label: '/image size 3:4',
      descKey: 'slashDescriptions.imageSize3_4',
      size: '3:4',
    },
    {
      key: '/image size 4:3',
      match: '/image size 4:3',
      label: '/image size 4:3',
      descKey: 'slashDescriptions.imageSize4_3',
      size: '4:3',
    },
  ];

  const SLASH_IMAGE_COUNT_TARGETS = [
    {
      key: '/image count 1',
      match: '/image count 1',
      label: '/image count 1',
      descKey: 'slashDescriptions.imageCount1',
      count: 1,
    },
    {
      key: '/image count 2',
      match: '/image count 2',
      label: '/image count 2',
      descKey: 'slashDescriptions.imageCount2',
      count: 2,
    },
    {
      key: '/image count 3',
      match: '/image count 3',
      label: '/image count 3',
      descKey: 'slashDescriptions.imageCount3',
      count: 3,
    },
    {
      key: '/image count 4',
      match: '/image count 4',
      label: '/image count 4',
      descKey: 'slashDescriptions.imageCount4',
      count: 4,
    },
  ];

  const SLASH_IMAGE_TARGETS = [
    {
      key: '/image status',
      match: '/image status',
      label: '/image status',
      descKey: 'slashDescriptions.imageStatus',
    },
    {
      key: '/image size',
      match: '/image size',
      label: '/image size',
      descKey: 'slashDescriptions.imageSize',
      children: SLASH_IMAGE_SIZE_TARGETS,
      childSeparator: ' ',
    },
    {
      key: '/image count',
      match: '/image count',
      label: '/image count',
      descKey: 'slashDescriptions.imageCount',
      children: SLASH_IMAGE_COUNT_TARGETS,
      childSeparator: ' ',
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
    SLASH_IMAGE_TARGETS,
    SLASH_IMAGE_SIZE_TARGETS,
    SLASH_IMAGE_COUNT_TARGETS,
    getLangMeta,
    normalizeTranslateCode,
    getLanguageDisplayName,
    LANG_NAMES,
    SLASH_TRANSLATE_MODE_TARGETS,
  };
})();
