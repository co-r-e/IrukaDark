const { Menu } = require('electron');
const menuTranslations = require('../i18n/menuTranslations');

function createAppMenu(ctx) {
  const isMac = process.platform === 'darwin';
  const currentLang = ctx.currentLang || 'en';
  const t = menuTranslations[currentLang] || menuTranslations.en;

  const getPref = ctx.getPref;
  const windowOpacity = parseFloat(getPref('WINDOW_OPACITY') || process.env.WINDOW_OPACITY || '1');
  const pinAllSpaces = !['0', 'false', 'off'].includes(
    String(getPref('PIN_ALL_SPACES') || process.env.PIN_ALL_SPACES || '1').toLowerCase()
  );
  const curTheme = String(getPref('UI_THEME') || process.env.UI_THEME || 'dark');
  const curTone = String(getPref('TONE') || process.env.TONE || 'casual');

  const promptSetEnv = async (
    key,
    { title, label, placeholder = '', password = false, defaultValue = '' } = {}
  ) => {
    const val = await ctx.openInputDialog({
      title,
      label,
      placeholder,
      value: defaultValue,
      password,
      lang: currentLang,
    });
    if (val === null) return;
    try {
      ctx.setPref(key, String(val));
    } catch {}
    try {
      process.env[key] = String(val);
    } catch {}
    ctx.rebuild && ctx.rebuild();
  };

  const editMenu = {
    label: t.edit,
    submenu: [
      { role: 'undo', label: t.undo },
      { role: 'redo', label: t.redo },
      { type: 'separator' },
      { role: 'cut', label: t.cut },
      { role: 'copy', label: t.copy },
      { role: 'paste', label: t.paste },
      { role: 'pasteAndMatchStyle', label: t.pasteAndMatchStyle },
      { role: 'delete', label: t.delete },
      { role: 'selectAll', label: t.selectAll },
    ],
  };

  const viewMenu = {
    label: t.view,
    submenu: [
      {
        label: t.appearance,
        submenu: [
          {
            label: t.themeLight,
            type: 'radio',
            checked: curTheme === 'light',
            click: () => ctx.handleThemeChange('light'),
          },
          {
            label: t.themeDark,
            type: 'radio',
            checked: curTheme === 'dark',
            click: () => ctx.handleThemeChange('dark'),
          },
          { type: 'separator' },
          {
            label: t.windowOpacity,
            submenu: [
              {
                label: t.opacity100,
                type: 'radio',
                checked: (windowOpacity || 1) >= 0.999,
                click: () => ctx.handleWindowOpacityChange(1),
              },
              {
                label: t.opacity95,
                type: 'radio',
                checked: Math.abs(windowOpacity - 0.95) < 0.005,
                click: () => ctx.handleWindowOpacityChange(0.95),
              },
              {
                label: t.opacity90,
                type: 'radio',
                checked: Math.abs(windowOpacity - 0.9) < 0.005,
                click: () => ctx.handleWindowOpacityChange(0.9),
              },
              {
                label: t.opacity85,
                type: 'radio',
                checked: Math.abs(windowOpacity - 0.85) < 0.005,
                click: () => ctx.handleWindowOpacityChange(0.85),
              },
              {
                label: t.opacity80,
                type: 'radio',
                checked: Math.abs(windowOpacity - 0.8) < 0.005,
                click: () => ctx.handleWindowOpacityChange(0.8),
              },
            ],
          },
          { type: 'separator' },
          {
            label: t.pinAllSpaces,
            type: 'checkbox',
            checked: !!pinAllSpaces,
            click: (mi) => ctx.handlePinAllSpacesChange(!!mi.checked),
          },
        ],
      },
      { type: 'separator' },
      {
        label: t.showLogoPopup,
        type: 'checkbox',
        checked: !!(ctx.hasPopupWindow && ctx.hasPopupWindow()),
        click: () => {
          try {
            ctx.togglePopupWindow && ctx.togglePopupWindow();
          } catch {}
          ctx.rebuild && ctx.rebuild();
        },
      },
      {
        label: t.language,
        submenu: (() => {
          const locales = [
            { code: 'en', label: 'English' },
            { code: 'ja', label: '日本語' },
            { code: 'es', label: 'Español' },
            { code: 'es-419', label: 'Español (Latinoamérica)' },
            { code: 'zh-Hans', label: '简体中文' },
            { code: 'zh-Hant', label: '繁體中文' },
            { code: 'hi', label: 'हिन्दी' },
            { code: 'pt-BR', label: 'Português (Brasil)' },
            { code: 'fr', label: 'Français' },
            { code: 'de', label: 'Deutsch' },
            { code: 'ar', label: 'العربية' },
            { code: 'ru', label: 'Русский' },
            { code: 'ko', label: '한국어' },
            { code: 'id', label: 'Bahasa Indonesia' },
            { code: 'vi', label: 'Tiếng Việt' },
            { code: 'th', label: 'ไทย' },
            { code: 'it', label: 'Italiano' },
            { code: 'tr', label: 'Türkçe' },
          ];
          return locales.map((loc) => ({
            label: loc.label,
            type: 'radio',
            checked: currentLang === loc.code,
            click: () => ctx.handleLanguageChange(loc.code),
          }));
        })(),
      },
    ],
  };

  if (!isMac) {
    // Add AI settings to View menu on non‑Mac
    const aiSettingsMenu = {
      label: t.aiSettings || (menuTranslations.en && menuTranslations.en.aiSettings),
      submenu: [
        {
          label: t.setGeminiApiKey || menuTranslations.en.setGeminiApiKey,
          click: async () => {
            await promptSetEnv('GEMINI_API_KEY', {
              title: t.setGeminiApiKey || menuTranslations.en.setGeminiApiKey,
              label: 'GEMINI_API_KEY',
              placeholder: 'AIza… or AI… key',
              password: true,
              defaultValue: '',
            });
          },
        },
        {
          label: t.setGeminiModel || menuTranslations.en.setGeminiModel,
          click: async () => {
            await promptSetEnv('GEMINI_MODEL', {
              title: t.setGeminiModel || menuTranslations.en.setGeminiModel,
              label: 'GEMINI_MODEL',
              placeholder: 'e.g., gemini-2.5-flash-lite',
              password: false,
              defaultValue: String(process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite'),
            });
          },
        },
        {
          label: t.setWebSearchModel || menuTranslations.en.setWebSearchModel,
          click: async () => {
            await promptSetEnv('WEB_SEARCH_MODEL', {
              title: t.setWebSearchModel || menuTranslations.en.setWebSearchModel,
              label: 'WEB_SEARCH_MODEL',
              placeholder: 'e.g., gemini-2.5-flash',
              password: false,
              defaultValue: String(process.env.WEB_SEARCH_MODEL || 'gemini-2.5-flash'),
            });
          },
        },
        {
          label: t.tone || menuTranslations.en.tone,
          submenu: [
            {
              label: t.toneCasual || menuTranslations.en.toneCasual,
              type: 'radio',
              checked: curTone !== 'formal',
              click: () => ctx.handleToneChange('casual'),
            },
            {
              label: t.toneFormal || menuTranslations.en.toneFormal,
              type: 'radio',
              checked: curTone === 'formal',
              click: () => ctx.handleToneChange('formal'),
            },
          ],
        },
      ],
    };
    if (Array.isArray(viewMenu.submenu)) {
      viewMenu.submenu.unshift(aiSettingsMenu, { type: 'separator' });
    }
  }

  const windowMenu = {
    label: t.window,
    submenu: [
      {
        role: 'minimize',
        label: t.minimize || (menuTranslations.en && menuTranslations.en.minimize) || 'Minimize',
      },
      {
        role: 'zoom',
        label: t.zoom || (menuTranslations.en && menuTranslations.en.zoom) || 'Zoom',
      },
      ...(isMac
        ? [
            {
              role: 'front',
              label:
                t.bringAllToFront ||
                (menuTranslations.en && menuTranslations.en.bringAllToFront) ||
                'Bring All to Front',
            },
          ]
        : [
            {
              role: 'close',
              label: t.close || (menuTranslations.en && menuTranslations.en.close) || 'Close',
            },
          ]),
    ],
  };

  const template = [];

  if (isMac) {
    template.push({
      label: t.irukadark,
      submenu: [
        { role: 'about', label: t.about },
        { type: 'separator' },
        // Update and Downloads menu removed (no GitHub Releases / build pipeline)
        { type: 'separator' },
        {
          label: t.aiSettings || menuTranslations.en.aiSettings,
          submenu: [
            {
              label: t.setGeminiApiKey || menuTranslations.en.setGeminiApiKey,
              click: async () => {
                await promptSetEnv('GEMINI_API_KEY', {
                  title: t.setGeminiApiKey || menuTranslations.en.setGeminiApiKey,
                  label: 'GEMINI_API_KEY',
                  placeholder: 'AIza… or AI… key',
                  password: true,
                  defaultValue: '',
                });
              },
            },
            {
              label: t.setGeminiModel || menuTranslations.en.setGeminiModel,
              click: async () => {
                await promptSetEnv('GEMINI_MODEL', {
                  title: t.setGeminiModel || menuTranslations.en.setGeminiModel,
                  label: 'GEMINI_MODEL',
                  placeholder: 'e.g., gemini-2.5-flash-lite',
                  password: false,
                  defaultValue: String(process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite'),
                });
              },
            },
            {
              label: t.setWebSearchModel || menuTranslations.en.setWebSearchModel,
              click: async () => {
                await promptSetEnv('WEB_SEARCH_MODEL', {
                  title: t.setWebSearchModel || menuTranslations.en.setWebSearchModel,
                  label: 'WEB_SEARCH_MODEL',
                  placeholder: 'e.g., gemini-2.5-flash',
                  password: false,
                  defaultValue: String(process.env.WEB_SEARCH_MODEL || 'gemini-2.5-flash'),
                });
              },
            },
            {
              label: t.tone || menuTranslations.en.tone,
              submenu: [
                {
                  label: t.toneCasual || menuTranslations.en.toneCasual,
                  type: 'radio',
                  checked: curTone !== 'formal',
                  click: () => ctx.handleToneChange('casual'),
                },
                {
                  label: t.toneFormal || menuTranslations.en.toneFormal,
                  type: 'radio',
                  checked: curTone === 'formal',
                  click: () => ctx.handleToneChange('formal'),
                },
              ],
            },
          ],
        },
        { type: 'separator' },
        { role: 'hide', label: t.hide },
        { role: 'unhide', label: t.unhide },
        { type: 'separator' },
        { role: 'quit', label: t.quit },
      ],
    });
  }

  template.push(editMenu, viewMenu, windowMenu);

  if (!isMac) {
    template.push({
      label: t.help || 'Help',
      submenu: [
        // Update and Downloads menu removed
      ],
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

module.exports = createAppMenu;
