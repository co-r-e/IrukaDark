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

  const SLASH_IMAGE_TEMPLATE_TARGETS = [];

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
    {
      key: '/image template',
      match: '/image template',
      label: '/image template',
      descKey: 'slashDescriptions.imageTemplate',
      children: SLASH_IMAGE_TEMPLATE_TARGETS,
      childSeparator: ' ',
    },
  ];

  const SLASH_VIDEO_SIZE_TARGETS = [
    {
      key: '/video size 16:9',
      match: '/video size 16:9',
      label: '/video size 16:9',
      descKey: 'slashDescriptions.videoSize16_9',
      ratio: '16:9',
    },
    {
      key: '/video size 9:16',
      match: '/video size 9:16',
      label: '/video size 9:16',
      descKey: 'slashDescriptions.videoSize9_16',
      ratio: '9:16',
    },
  ];

  const SLASH_VIDEO_QUALITY_TARGETS = [
    {
      key: '/video quality 720p',
      match: '/video quality 720p',
      label: '/video quality 720p',
      descKey: 'slashDescriptions.videoQuality720p',
      resolution: '720p',
    },
    {
      key: '/video quality 1080p',
      match: '/video quality 1080p',
      label: '/video quality 1080p',
      descKey: 'slashDescriptions.videoQuality1080p',
      resolution: '1080p',
    },
  ];

  const SLASH_VIDEO_DURATION_TARGETS = [
    {
      key: '/video duration 4',
      match: '/video duration 4',
      label: '/video duration 4',
      descKey: 'slashDescriptions.videoDuration4',
      duration: 4,
    },
    {
      key: '/video duration 5',
      match: '/video duration 5',
      label: '/video duration 5',
      descKey: 'slashDescriptions.videoDuration5',
      duration: 5,
    },
    {
      key: '/video duration 6',
      match: '/video duration 6',
      label: '/video duration 6',
      descKey: 'slashDescriptions.videoDuration6',
      duration: 6,
    },
    {
      key: '/video duration 7',
      match: '/video duration 7',
      label: '/video duration 7',
      descKey: 'slashDescriptions.videoDuration7',
      duration: 7,
    },
    {
      key: '/video duration 8',
      match: '/video duration 8',
      label: '/video duration 8',
      descKey: 'slashDescriptions.videoDuration8',
      duration: 8,
    },
  ];

  const SLASH_VIDEO_COUNT_TARGETS = [
    {
      key: '/video count 1',
      match: '/video count 1',
      label: '/video count 1',
      descKey: 'slashDescriptions.videoCount1',
      count: 1,
    },
    {
      key: '/video count 2',
      match: '/video count 2',
      label: '/video count 2',
      descKey: 'slashDescriptions.videoCount2',
      count: 2,
    },
    {
      key: '/video count 3',
      match: '/video count 3',
      label: '/video count 3',
      descKey: 'slashDescriptions.videoCount3',
      count: 3,
    },
    {
      key: '/video count 4',
      match: '/video count 4',
      label: '/video count 4',
      descKey: 'slashDescriptions.videoCount4',
      count: 4,
    },
  ];

  const SLASH_VIDEO_TARGETS = [
    {
      key: '/video status',
      match: '/video status',
      label: '/video status',
      descKey: 'slashDescriptions.videoStatus',
    },
    {
      key: '/video size',
      match: '/video size',
      label: '/video size',
      descKey: 'slashDescriptions.videoSize',
      children: SLASH_VIDEO_SIZE_TARGETS,
      childSeparator: ' ',
    },
    {
      key: '/video quality',
      match: '/video quality',
      label: '/video quality',
      descKey: 'slashDescriptions.videoQuality',
      children: SLASH_VIDEO_QUALITY_TARGETS,
      childSeparator: ' ',
    },
    {
      key: '/video duration',
      match: '/video duration',
      label: '/video duration',
      descKey: 'slashDescriptions.videoDuration',
      children: SLASH_VIDEO_DURATION_TARGETS,
      childSeparator: ' ',
    },
    {
      key: '/video count',
      match: '/video count',
      label: '/video count',
      descKey: 'slashDescriptions.videoCount',
      children: SLASH_VIDEO_COUNT_TARGETS,
      childSeparator: ' ',
    },
  ];

  const SLASH_SLIDE_SIZE_TARGETS = [
    {
      key: '/slide size 16:9',
      match: '/slide size 16:9',
      label: '/slide size 16:9',
      descKey: 'slashDescriptions.slideSize16_9',
      size: '16:9',
    },
    {
      key: '/slide size 9:16',
      match: '/slide size 9:16',
      label: '/slide size 9:16',
      descKey: 'slashDescriptions.slideSize9_16',
      size: '9:16',
    },
    {
      key: '/slide size 4:3',
      match: '/slide size 4:3',
      label: '/slide size 4:3',
      descKey: 'slashDescriptions.slideSize4_3',
      size: '4:3',
    },
    {
      key: '/slide size 3:4',
      match: '/slide size 3:4',
      label: '/slide size 3:4',
      descKey: 'slashDescriptions.slideSize3_4',
      size: '3:4',
    },
    {
      key: '/slide size 1:1',
      match: '/slide size 1:1',
      label: '/slide size 1:1',
      descKey: 'slashDescriptions.slideSize1_1',
      size: '1:1',
    },
  ];

  const SLASH_SLIDE_COUNT_TARGETS = [
    {
      key: '/slide count 1',
      match: '/slide count 1',
      label: '/slide count 1',
      descKey: 'slashDescriptions.slideCount1',
      count: 1,
    },
    {
      key: '/slide count 2',
      match: '/slide count 2',
      label: '/slide count 2',
      descKey: 'slashDescriptions.slideCount2',
      count: 2,
    },
    {
      key: '/slide count 3',
      match: '/slide count 3',
      label: '/slide count 3',
      descKey: 'slashDescriptions.slideCount3',
      count: 3,
    },
    {
      key: '/slide count 4',
      match: '/slide count 4',
      label: '/slide count 4',
      descKey: 'slashDescriptions.slideCount4',
      count: 4,
    },
  ];

  const SLASH_SLIDE_TEMPLATE_TARGETS = [];

  const SLASH_SLIDE_TARGETS = [
    {
      key: '/slide status',
      match: '/slide status',
      label: '/slide status',
      descKey: 'slashDescriptions.slideStatus',
    },
    {
      key: '/slide size',
      match: '/slide size',
      label: '/slide size',
      descKey: 'slashDescriptions.slideSize',
      children: SLASH_SLIDE_SIZE_TARGETS,
      childSeparator: ' ',
    },
    {
      key: '/slide count',
      match: '/slide count',
      label: '/slide count',
      descKey: 'slashDescriptions.slideCount',
      children: SLASH_SLIDE_COUNT_TARGETS,
      childSeparator: ' ',
    },
    {
      key: '/slide template',
      match: '/slide template',
      label: '/slide template',
      descKey: 'slashDescriptions.slideTemplate',
      children: SLASH_SLIDE_TEMPLATE_TARGETS,
      childSeparator: ' ',
    },
  ];

  function getLangMeta(code) {
    const lang = String(code || 'en');
    const name = LANG_NAMES[lang] || 'English';
    return { code: lang, name };
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
    SLASH_IMAGE_TEMPLATE_TARGETS,
    SLASH_VIDEO_TARGETS,
    SLASH_VIDEO_SIZE_TARGETS,
    SLASH_VIDEO_QUALITY_TARGETS,
    SLASH_VIDEO_DURATION_TARGETS,
    SLASH_VIDEO_COUNT_TARGETS,
    SLASH_SLIDE_TARGETS,
    SLASH_SLIDE_SIZE_TARGETS,
    SLASH_SLIDE_COUNT_TARGETS,
    SLASH_SLIDE_TEMPLATE_TARGETS,
    getLangMeta,
    normalizeTranslateCode,
    getLanguageDisplayName,
    LANG_NAMES,
    SLASH_TRANSLATE_MODE_TARGETS,
  };
})();
