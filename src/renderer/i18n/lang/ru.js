(function () {
  if (typeof window === 'undefined' || !window.__IRUKA_REGISTER_I18N__) return;
  window.__IRUKA_REGISTER_I18N__('ru', {
    errorOccurred: 'Что-то пошло не так',
    apiKeyMissing: 'Нет ключа API. Укажите GEMINI_API_KEY в .env.local.',
    apiUnavailable: 'API Electron недоступен. Перезапустите приложение.',
    unexpectedResponse: 'Неожиданный ответ от API.',
    apiError: 'Ошибка API:',
    textNotRetrieved: 'Не удалось получить текст',
    thinking: 'Думаю…',
    searching: 'Поиск в интернете…',
    accessibilityWarning:
      'Для автокопирования дайте разрешение: Настройки системы > Безопасность и конфиденциальность > Универсальный доступ.',
    shortcutRegistered: (accel) => `Горячая клавиша установлена: ${accel}`,
    failedToRegisterShortcut:
      'Не удалось зарегистрировать горячую клавишу. Возможно, конфликт с другой программой.',
    placeholder: 'Спросите IrukaDark…',
    send: 'Отправить',
    stop: 'Стоп',
    canceled: 'Отменено.',
    historyCleared: 'История чата очищена.',
    historyCompacted: 'История кратко изложена и сжата.',
    availableCommands:
      'Команды: /clear, /compact, /next, /table, /what do you mean?, /contact, /web (on/off/status), /translate_JA, /translate_EN, /translate_zh-CN, /translate_zh-TW',
    sourcesBadge: 'Источники',
    webSearchEnabled: 'Веб‑поиск включен.',
    webSearchDisabled: 'Веб‑поиск выключен.',
    webSearchStatusOn: 'Веб‑поиск: ВКЛ',
    webSearchStatusOff: 'Веб‑поиск: ВЫКЛ',
    webSearchHelp: 'Используйте /websearch on|off|status',
    noPreviousAI: 'Нет предыдущего сообщения ИИ для продолжения.',
    selectionExplanation: 'Пояснение выделения',
    selectionTranslation: 'Перевести выделение',
    updateAvailable: (v) => `Доступна новая версия (${v}). Открыть загрузки?`,
    upToDate: 'У вас последняя версия.',
    updateCheckFailed: 'Не удалось проверить обновления.',
  });
})();
