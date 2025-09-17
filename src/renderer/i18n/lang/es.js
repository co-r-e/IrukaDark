(function () {
  if (typeof window === 'undefined' || !window.__IRUKA_REGISTER_I18N__) return;
  window.__IRUKA_REGISTER_I18N__('es', {
    errorOccurred: 'Se ha producido un error',
    apiKeyMissing: 'Falta la clave de API. Configura GEMINI_API_KEY en .env.local.',
    apiUnavailable: 'La API de Electron no está disponible. Reinicia la aplicación.',
    unexpectedResponse: 'Respuesta inesperada de la API.',
    apiError: 'Error de API:',
    textNotRetrieved: 'No se pudo obtener el texto',
    thinking: 'Pensando...',
    searching: 'Buscando en la web...',
    accessibilityWarning:
      'Para copiar automáticamente, da permiso en Preferencias del sistema > Privacidad y seguridad > Accesibilidad.',
    shortcutRegistered: (accel) => `Atajo configurado a ${accel}`,
    failedToRegisterShortcut:
      'No se pudo registrar el atajo. Puede haber un conflicto con otra app.',
    placeholder: 'Pregunta a IrukaDark...',
    send: 'Enviar',
    stop: 'Detener',
    canceled: 'Cancelado.',
    historyCleared: 'Historial borrado.',
    historyCompacted: 'Historial resumido y compactado.',
    availableCommands:
      'Comandos: /clear, /compact, /next, /table, /what do you mean?, /contact, /web (on/off/status), /translate (JA/EN/zh-CN/zh-TW)',
    sourcesBadge: 'Fuentes',
    webSearchEnabled: 'Búsqueda web activada.',
    webSearchDisabled: 'Búsqueda web desactivada.',
    webSearchStatusOn: 'Búsqueda web: ON',
    webSearchStatusOff: 'Búsqueda web: OFF',
    webSearchHelp: 'Usa /web on|off|status',
    noPreviousAI: 'No hay mensaje anterior de IA para continuar.',
    selectionExplanation: 'Explicación de la selección',
    selectionTranslation: 'Traducir selección',
    updateAvailable: (v) => `Nueva versión (${v}) disponible. ¿Abrir descargas?`,
    upToDate: 'Estás al día.',
    updateCheckFailed: 'Error al comprobar actualizaciones.',
  });
})();
